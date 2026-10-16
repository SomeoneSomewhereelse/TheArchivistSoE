// The item tooltip's base lines (spec "Base lines"): defense, block, damage and requirements, from the
// base's txt values and the affixes' totals at both ends (statEngine.js sumEnds: {low, high} Maps of stat ->
// value). PD2 rules: ethereal is x5/4 by truncation and -10 Str/Dex; percentages truncate toward zero. Pure;
// the labels and the line order are src/itemTooltip.js's.

// SoE 13.0.0: "Increased Maximum Block Chance from 75% to 80%". It is in the game code, not the tables.
export const BLOCK_CAP = 80;

// The Arreat Summit's abbreviations, by CharStats class name.
export const CLASS_ABBREVIATIONS = {
    Amazon: "Ama", Assassin: "Asn", Barbarian: "Bar", Druid: "Dru", Necromancer: "Nec", Paladin: "Pal", Sorceress: "Sor",
};

export const pct = (x, p) => Math.trunc((x * p) / 100);
export const ethereal = (x) => Math.trunc((x * 5) / 4);

const ENDS = ["low", "high"];
const total = (totals, end, stat) => totals[end].get(stat) ?? 0;

// One value when both ends agree, "lo-hi" otherwise.
export const rangeOf = ({low, high}) => (low === high ? String(low) : `${Math.min(low, high)}-${Math.max(low, high)}`);

export function checkBlockClasses(classes) {
    const missing = classes.filter((c) => !CLASS_ABBREVIATIONS[c.name]).map((c) => c.name);
    if (missing.length) throw new Error(`no block abbreviation for class(es) ${missing.join(", ")} (add them to CLASS_ABBREVIATIONS in src/baseLines.js)`);
}

// Defense = B + flat + pct(B, ac%), where B is maxac + 1 when any ac% is present (func 2 forces it), else
// minac..maxac, times 5/4 when ethereal. Blue when the affixes change it from B.
export function defense(base, {eth, totals}) {
    const acPercent = ENDS.some((end) => total(totals, end, "item_armor_percent") !== 0);
    const at = (end) => {
        const b0 = acPercent ? base.maxac + 1 : end === "low" ? base.minac : base.maxac;
        const b = eth ? ethereal(b0) : b0;
        return {b, d: b + total(totals, end, "armorclass") + pct(b, total(totals, end, "item_armor_percent"))};
    };
    const [lo, hi] = ENDS.map(at);
    return {low: lo.d, high: hi.d, changed: lo.d !== lo.b || hi.d !== hi.b};
}

// The item's block (Armor.txt block + the affixes' toblock; ethereal doesn't change it), then per class
// min(cap, block + BlockFactor). Classes with equal BlockFactor share an entry; entries go highest first, the
// classes inside one alphabetically. onlyClass: a class-only shield's class name (one entry). Blue only when
// an affix adds block (U11).
export function blockChance(base, {classes, onlyClass, totals}) {
    checkBlockClasses(classes);
    const cap = (v) => Math.min(BLOCK_CAP, v);
    const [own0, own1] = ENDS.map((end) => base.block + total(totals, end, "toblock"));
    const byFactor = new Map();
    for (const c of classes.filter((x) => !onlyClass || x.name === onlyClass)) {
        byFactor.set(c.blockFactor, [...(byFactor.get(c.blockFactor) ?? []), CLASS_ABBREVIATIONS[c.name]]);
    }
    const entries = [...byFactor].sort((a, b) => b[0] - a[0])
        .map(([factor, abbrs]) => ({classes: [...abbrs].sort().join("/"), low: cap(own0 + factor), high: cap(own1 + factor)}));
    return {low: cap(own0), high: cap(own1), entries, changed: ENDS.some((end) => total(totals, end, "toblock") !== 0)};
}

export const blockText = (block) => `${rangeOf(block)}% (${block.entries.map((e) => `${e.classes}: ${rangeOf(e)}%`).join(", ")})`;

// One damage pair: b = the txt value (x5/4 when ethereal); min = b_min + flat min + pct(b_min, min%), max
// likewise with the pair's own flat stat and max%. clamp: the main line keeps max >= min + 1 (1.14d
// 0x485931); the throw and "(Bar)" lines don't. Blue when a merged value exceeds b.
export function damage(txt, {eth, totals, minStat, maxStat, clamp}) {
    const [bmin, bmax] = eth ? txt.map(ethereal) : txt;
    const at = (end) => ({
        min: bmin + total(totals, end, minStat) + pct(bmin, total(totals, end, "item_mindamage_percent")),
        max: bmax + total(totals, end, maxStat) + pct(bmax, total(totals, end, "item_maxdamage_percent")),
    });
    const [lo, hi] = ENDS.map(at);
    const changed = lo.min > bmin || hi.min > bmin || lo.max > bmax || hi.max > bmax;
    const top = (x) => (clamp ? Math.max(x.max, x.min + 1) : x.max);
    return {min: {low: lo.min, high: hi.min}, max: {low: top(lo), high: top(hi)}, changed};
}

export const damageText = (d, to) => `${rangeOf(d.min)} ${to} ${rangeOf(d.max)}`;

// Required Strength or Dexterity: base + pct(base, ease%) - 10 when ethereal (D2MOO ITEMS_CheckRequirements;
// verified U3). null (no line) when the base has none or the high end is <= 0.
export function requirement(value, {eth, totals}) {
    if (!value) return null;
    const [a, b] = ENDS.map((end) => value + pct(value, total(totals, end, "item_req_percent")) - (eth ? 10 : 0));
    const r = {low: Math.min(a, b), high: Math.max(a, b)};
    return r.high > 0 ? r : null;
}
