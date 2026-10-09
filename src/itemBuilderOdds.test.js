import {describe, expect, it} from "vitest";
import {prepareItemBuilder, ITEM_BUILDER_VERSION} from "./itemBuilderData.js";
import {affixCountRange, allowedQualities, eligibleAffixes, EMPTY_BUILD, rollContext} from "./itemBuilderRules.js";
import {affixWeight, formatOdds, rollOdds} from "./itemBuilderOdds.js";
import {realItemBuilderModel} from "./itemBuilderFixtures.js";

const affix = (key, fields) => ({
    key, suffix: key.startsWith("s"), name: key, level: 1, maxLevel: null, levelreq: 1, rare: true, classSpecific: null,
    classLevelReq: null, group: 0, frequency: 1, itypes: ["weap"], etypes: [], mods: [], displayProperties: [], ...fields,
});

// A purpose-built model: an axe (magic lvl 0) and a wand (magic lvl 1) share the given rows; a jewel takes
// rows with the "jewl" itype.
function oddsModel(affixes) {
    return prepareItemBuilder({
        version: ITEM_BUILDER_VERSION,
        linkVersion: 1,
        types: {
            weap: {chain: ["weap"], class: null, rare: true},
            axe: {chain: ["axe", "weap"], class: null, rare: true},
            wand: {chain: ["wand", "weap"], class: null, rare: true},
            jewl: {chain: ["jewl"], class: null, rare: true},
        },
        bases: [
            {code: "axe", name: "Axe", group: "Axes", tier: "Normal", qlvl: 1, magicLvl: 0, levelreq: 1, types: ["axe"]},
            {code: "wnd", name: "Wand", group: "Wands", tier: "Normal", qlvl: 1, magicLvl: 1, levelreq: 1, types: ["wand"]},
            {code: "jew", name: "Jewel", group: "Jewels", tier: null, qlvl: 1, magicLvl: 0, levelreq: 1, types: ["jewl"]},
        ],
        affixes,
    });
}

const odds = (model, build, keys) => {
    const ctx = rollContext(model, {...EMPTY_BUILD, ...build});
    return rollOdds(model, ctx, keys.map((k) => model.affixByKey.get(k)));
};

// Prefixes: p0 (weight 1), p1 (weight 3). Suffixes: s0 (weight 1), s1 (weight 1).
const simple = oddsModel([
    affix("p0", {group: 1}), affix("p1", {group: 2, frequency: 3}),
    affix("s0", {group: 10}), affix("s1", {group: 11}),
]);

describe("rollOdds on hand-computed cases", () => {
    it("is null with no picks", () => {
        expect(odds(simple, {base: "axe", quality: "magic"}, [])).toBeNull();
    });

    it("a magic item with 2 affixes has exactly one prefix: the pick's share of the prefix weight", () => {
        expect(odds(simple, {base: "axe", quality: "magic", ilvl: 99}, ["p0"]).p).toBeCloseTo(1 / 4, 12);
        expect(odds(simple, {base: "axe", quality: "magic", ilvl: 99}, ["p0", "s0"]).p).toBeCloseTo(1 / 8, 12);
    });

    it("averages over the affix count range: 1 affix (1/2 x 1/4) and 2 affixes (1/4)", () => {
        const r = odds(simple, {base: "axe", quality: "magic", ilvl: 10}, ["p0"]);
        expect(r).toMatchObject({min: 1, max: 2});
        expect(r.p).toBeCloseTo((1 / 8 + 1 / 4) / 2, 12);
    });

    it("multiplies a row's frequency by its level on a magic-lvl base", () => {
        const leveled = oddsModel([affix("p0", {group: 1}), affix("p1", {group: 2, level: 3}), affix("s0", {group: 10})]);
        expect(odds(leveled, {base: "axe", quality: "magic", ilvl: 99}, ["p0"]).p).toBeCloseTo(1 / 2, 12);
        expect(odds(leveled, {base: "wnd", quality: "magic", ilvl: 99}, ["p0"]).p).toBeCloseTo(1 / 4, 12);
    });

    it("a drawn group sibling blocks the pick: the group's share, then the row's share inside it", () => {
        // Prefix groups: 1 (p0 weight 1 + p2 weight 2) and 2 (p1 weight 3).
        const siblings = oddsModel([affix("p0", {group: 1}), affix("p1", {group: 2, frequency: 3}), affix("p2", {group: 1, frequency: 2}), affix("s0", {group: 10})]);
        expect(odds(siblings, {base: "axe", quality: "magic", ilvl: 99}, ["p0"]).p).toBeCloseTo((3 / 6) * (1 / 3), 12);
    });

    it("draws groups without replacement: a rare jewel's two prefix draws", () => {
        // Rare jewel: 4 affixes, 2 + 2. Prefix weights 1 (p0), 1, 2: p0 first 1/4, after p1 1/3, after p2 1/2.
        const jewel = oddsModel([
            affix("p0", {group: 1, itypes: ["jewl"]}), affix("p1", {group: 2, itypes: ["jewl"]}), affix("p2", {group: 3, frequency: 2, itypes: ["jewl"]}),
            affix("s0", {group: 10, itypes: ["jewl"]}), affix("s1", {group: 11, itypes: ["jewl"]}),
        ]);
        expect(odds(jewel, {base: "jew", quality: "rare"}, ["p0"]).p).toBeCloseTo(1 / 4 + (1 / 4) * (1 / 3) + (1 / 2) * (1 / 2), 12);
    });

    it("a side with no free group left closes, so the draw goes to the other side", () => {
        // One prefix group on a rare jewel: the first prefix draw always takes it.
        const lone = oddsModel([affix("p0", {group: 1, itypes: ["jewl"]}), ...["s0", "s1", "s2"].map((k, i) => affix(k, {group: 10 + i, itypes: ["jewl"]}))]);
        expect(odds(lone, {base: "jew", quality: "rare"}, ["p0"]).p).toBeCloseTo(1, 12);
        // A rare axe at ilvl 50 (4-6 affixes) with one prefix group: every N gives 3 suffix draws out of 4 groups.
        const axe = oddsModel([affix("p0", {group: 1}), ...["s0", "s1", "s2", "s3"].map((k, i) => affix(k, {group: 10 + i}))]);
        expect(odds(axe, {base: "axe", quality: "rare", ilvl: 50}, ["s0"]).p).toBeCloseTo(3 / 4, 12);
    });

    it("is 0 for picks that can't roll together", () => {
        const shared = oddsModel([affix("p0", {group: 1}), affix("s0", {group: 1})]);
        expect(odds(shared, {base: "axe", quality: "rare"}, ["p0", "s0"]).p).toBe(0);
        const many = oddsModel(["p0", "p1", "p2"].map((k, i) => affix(k, {group: i + 1})));
        expect(odds(many, {base: "axe", quality: "magic"}, ["p0", "p1"]).p).toBe(0);
    });
});

describe("rollOdds guard: a group on both sides", () => {
    it("is null (nothing to show), not a number, when the pool has a group that rolls as a prefix and a suffix", () => {
        const shared = oddsModel([affix("p0", {group: 1}), affix("p1", {group: 2}), affix("s0", {group: 2}), affix("s1", {group: 10})]);
        expect(odds(shared, {base: "axe", quality: "rare"}, ["p0"])).toBeNull();
        expect(odds(shared, {base: "axe", quality: "rare"}, ["p0", "s1"])).toBeNull();
    });

    it("never triggers on the real data: no eligible group is on both sides, for any base, quality and alvl", () => {
        const real = realItemBuilderModel();
        // The pool depends on the base's types (chain and class), on rare vs magic, and on alvl only: one base per
        // distinct type list stands for the rest, and every alvl 1-99 covers every level band.
        const seen = new Set();
        const offenders = [];
        let combos = 0;
        for (const base of real.bases) {
            for (const quality of allowedQualities(real, base)) {
                const key = `${base.types.join("+")}/${quality === "magic" ? "magic" : "rare"}`;
                if (seen.has(key)) continue;
                seen.add(key);
                const ctx = rollContext(real, {...EMPTY_BUILD, base: base.code, quality});
                for (let alvl = 1; alvl <= 99; alvl++) {
                    combos++;
                    const sides = [new Set(), new Set()];
                    for (const a of eligibleAffixes(real, {...ctx, alvl})) sides[a.suffix ? 1 : 0].add(a.group);
                    for (const g of sides[0]) if (sides[1].has(g)) offenders.push(`${base.code} ${quality} alvl ${alvl}: group ${g}`);
                }
            }
        }
        expect(combos).toBeGreaterThan(1000);
        expect(offenders).toEqual([]);
    });
});

// ---- Brute-force cross-check ---------------------------------------------------------------------

// The exact chance by walking every draw of the roll one by one, independently of rollOdds' method: N over its
// range; per draw, the open sides (under their cap and caps.total, with a free-group row left), 50/50 between
// two; then every free-group row of that side by weight, which takes its group.
function bruteForce(model, ctx, picks) {
    const {min, max} = affixCountRange(ctx);
    const caps = [ctx.caps.prefix, ctx.caps.suffix];
    const pool = eligibleAffixes(model, ctx);
    const wanted = new Set(picks.map((a) => a.key));
    const walk = (left, held, count, got) => {
        if (got === wanted.size) return 1;
        if (left === 0) return 0;
        const free = [0, 1].map((s) => pool.filter((a) => (a.suffix ? 1 : 0) === s && !held.has(a.group)));
        const open = [0, 1].filter((s) => count[0] + count[1] < ctx.caps.total && count[s] < caps[s] && free[s].length > 0);
        let p = 0;
        for (const s of open) {
            const total = free[s].reduce((sum, a) => sum + affixWeight(a, ctx), 0);
            for (const a of free[s]) {
                const next = s === 0 ? [count[0] + 1, count[1]] : [count[0], count[1] + 1];
                p += (affixWeight(a, ctx) / total / open.length) * walk(left - 1, new Set([...held, a.group]), next, got + (wanted.has(a.key) ? 1 : 0));
            }
        }
        return p;
    };
    let sum = 0;
    for (let n = min; n <= max; n++) sum += walk(n, new Set(), [0, 0], 0);
    return sum / (max - min + 1);
}

describe("rollOdds against a brute-force walk of every draw (toy models)", () => {
    // Small random pools: 1-4 rows a side, some sharing a group with the row before (siblings), weights 1-5
    // and levels 1-3 (so the wand's magic-lvl weights differ). Every base and quality, several levels, 1-3 picks.
    const rand = mulberry32(42);
    const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
    const builds = [
        {base: "axe", quality: "magic", ilvl: 10}, {base: "axe", quality: "magic", ilvl: 99},
        {base: "axe", quality: "rare", ilvl: 30}, {base: "axe", quality: "rare", ilvl: 99},
        {base: "axe", quality: "crafted", clvl: 99, gilvl: 1}, {base: "axe", quality: "crafted", clvl: 99, gilvl: 99},
        {base: "wnd", quality: "magic", ilvl: 99}, {base: "wnd", quality: "rare", ilvl: 50},
        {base: "jew", quality: "magic", ilvl: 50}, {base: "jew", quality: "rare", ilvl: 99},
    ];
    it.each(builds.map((b) => [`${b.base} ${b.quality} ${b.ilvl ?? `${b.clvl}/${b.gilvl}`}`, b]))("%s", (name, build) => {
        let checked = 0;
        for (let round = 0; round < 12; round++) {
            const rows = [];
            let group = 1;
            for (const side of ["p", "s"]) {
                for (let i = int(1, 4); i > 0; i--) {
                    const sibling = rows.length && rows.at(-1).key[0] === side && rand() < 0.3;
                    rows.push(affix(`${side}${rows.length}`, {group: sibling ? rows.at(-1).group : group++, frequency: int(1, 5), level: int(1, 3), itypes: ["weap", "jewl"]}));
                }
            }
            const model = oddsModel(rows);
            const ctx = rollContext(model, {...EMPTY_BUILD, ...build});
            const picks = [];
            for (const a of eligibleAffixes(model, ctx)) if (picks.length < 3 && rand() < 0.5 && !picks.some((p) => p.group === a.group)) picks.push(a);
            const result = rollOdds(model, ctx, picks);
            if (!result) continue;
            expect(Math.abs(result.p - bruteForce(model, ctx, picks)), `${name}, round ${round}: ${picks.map((a) => a.key)}`).toBeLessThan(1e-12);
            checked++;
        }
        expect(checked).toBeGreaterThan(6);
    });
});

// ---- Monte Carlo cross-check ---------------------------------------------------------------------

function mulberry32(seed) {
    let a = seed;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Rolls the item draw by draw, as the spec describes it: N uniform over the count range; each draw picks a
// side 50/50 among the sides under their cap that still have a row with a free group (else the other side),
// then a row by weight among that side's rows whose group no affix on the item holds yet.
function simulate(model, ctx, picks, trials, seed) {
    const rand = mulberry32(seed);
    const {min, max} = affixCountRange(ctx);
    const caps = [ctx.caps.prefix, ctx.caps.suffix];
    const pool = eligibleAffixes(model, ctx);
    const sides = [false, true].map((suffix) => {
        const rows = pool.filter((a) => a.suffix === suffix);
        const cum = [];
        const groupWeight = new Map();
        let total = 0;
        for (const a of rows) {
            const w = affixWeight(a, ctx);
            cum.push((total += w));
            groupWeight.set(a.group, (groupWeight.get(a.group) ?? 0) + w);
        }
        return {rows, cum, total, groupWeight};
    });
    const wanted = new Set(picks.map((a) => a.key));
    let hits = 0;
    for (let trial = 0; trial < trials; trial++) {
        const n = min + Math.floor(rand() * (max - min + 1));
        const held = new Set();
        const left = [sides[0].total, sides[1].total];
        const count = [0, 0];
        let got = 0;
        for (let t = 0; t < n && count[0] + count[1] < ctx.caps.total; t++) {
            const open = [0, 1].filter((s) => count[s] < caps[s] && left[s] > 1e-9);
            if (!open.length) break;
            const s = open.length === 2 ? (rand() < 0.5 ? 0 : 1) : open[0];
            const {rows, cum, total} = sides[s];
            let row;
            do { // rejection: draw from the whole side until the row's group is free
                const x = rand() * total;
                let lo = 0;
                let hi = cum.length - 1;
                while (lo < hi) {
                    const mid = (lo + hi) >> 1;
                    if (cum[mid] > x) hi = mid;
                    else lo = mid + 1;
                }
                row = rows[lo];
            } while (held.has(row.group));
            held.add(row.group);
            for (const q of [0, 1]) left[q] -= sides[q].groupWeight.get(row.group) ?? 0;
            count[s]++;
            if (wanted.has(row.key)) got++;
        }
        if (got === picks.length) hits++;
    }
    return hits / trials;
}

describe("rollOdds against a Monte Carlo of the roll (real data)", () => {
    const real = realItemBuilderModel();
    const TRIALS = 200000;
    // The heaviest rows of a side, one per group: picks with odds big enough to simulate.
    const heaviest = (ctx, sides) => {
        const picks = [];
        for (const side of sides) {
            const pool = eligibleAffixes(real, ctx).filter((a) => a.suffix === (side === "s") && !picks.some((p) => p.group === a.group));
            picks.push(pool.sort((a, b) => affixWeight(b, ctx) - affixWeight(a, ctx))[0]);
        }
        return picks;
    };
    const cases = [
        ["rare Berserker Axe ilvl 85, 1 prefix", {base: "7wa", quality: "rare", ilvl: 85}, ["p"]],
        ["rare Berserker Axe ilvl 85, prefix + suffix", {base: "7wa", quality: "rare", ilvl: 85}, ["p", "s"]],
        ["rare Ancient Axe ilvl 50 (4-6 affixes), 2 prefixes", {base: "9gi", quality: "rare", ilvl: 50}, ["p", "p"]],
        ["magic Berserker Axe ilvl 99, 1 prefix", {base: "7wa", quality: "magic", ilvl: 99}, ["p"]],
        ["crafted ring clvl 60 + ilvl 40 (2-4 affixes), 1 suffix", {base: "rin", quality: "crafted", clvl: 60, gilvl: 40}, ["s"]],
        ["rare jewel, prefix + suffix", {base: "jew", quality: "rare", ilvl: 99}, ["p", "s"]],
        ["rare Eldritch Orb ilvl 85 (magic lvl weights), 1 prefix", {base: "obc", quality: "rare", ilvl: 85}, ["p"]],
        ["rare Diadem ilvl 85 (magic lvl 18), prefix + suffix", {base: "ci3", quality: "rare", ilvl: 85}, ["p", "s"]],
    ];
    it.each(cases)("%s", (name, build, sides) => {
        const ctx = rollContext(real, {...EMPTY_BUILD, ...build});
        const picks = heaviest(ctx, sides);
        const {p} = rollOdds(real, ctx, picks);
        expect(p).toBeGreaterThan(1e-3);
        expect(p).toBeLessThan(0.3);
        const sim = simulate(real, ctx, picks, TRIALS, 20261009);
        const se = Math.sqrt((sim * (1 - sim)) / TRIALS);
        expect(Math.abs(p - sim), `${name}: exact ${p}, simulated ${sim}`).toBeLessThanOrEqual(Math.max(0.05 * sim, 4 * se));
    });
});

describe("formatOdds", () => {
    it("rounds 1/p to 2 significant digits with thousands separators", () => {
        expect(formatOdds(1 / 2134)).toBe("1 in 2,100");
        expect(formatOdds(1 / 3.44)).toBe("1 in 3.4");
        expect(formatOdds(1 / 12.4)).toBe("1 in 12");
        expect(formatOdds(1 / 99.6)).toBe("1 in 100");
        expect(formatOdds(1 / 1.2)).toBe("1 in 1.2");
        expect(formatOdds(1 / 456789)).toBe("1 in 460,000");
    });

    it("says 1 in 1 for near-certain rolls", () => {
        expect(formatOdds(1)).toBe("1 in 1");
        expect(formatOdds(1 / 1.04)).toBe("1 in 1");
    });

    it("names millions, billions and trillions, rolling over after rounding", () => {
        expect(formatOdds(1 / 3.44e6)).toBe("1 in 3.4 million");
        expect(formatOdds(1 / 999999)).toBe("1 in 1 million");
        expect(formatOdds(1 / 12e6)).toBe("1 in 12 million");
        expect(formatOdds(1 / 994e6)).toBe("1 in 990 million");
        expect(formatOdds(1 / 999.5e6)).toBe("1 in 1 billion");
        expect(formatOdds(1 / 2.5e9)).toBe("1 in 2.5 billion");
        expect(formatOdds(1 / 994e9)).toBe("1 in 990 billion");
        expect(formatOdds(1 / 999.5e9)).toBe("1 in 1 trillion");
        expect(formatOdds(1 / 7.1e12)).toBe("1 in 7.1 trillion");
        expect(formatOdds(1 / 840e12)).toBe("1 in 840 trillion");
    });

    it("has a floor at 1,000 trillion", () => {
        expect(formatOdds(1 / 994e12)).toBe("1 in 990 trillion");
        expect(formatOdds(1 / 999.5e12)).toBe("less than 1 in 1,000 trillion");
        expect(formatOdds(1e-30)).toBe("less than 1 in 1,000 trillion");
    });
});
