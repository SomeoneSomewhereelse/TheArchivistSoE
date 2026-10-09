import {describe, expect, it} from "vitest";
import {
    affixLevel, allowedQualities, CAPS, canRoll, countHint, craftedItemLevel, EMPTY_BUILD, eligibleAffixes, itemKind,
    requiredLevel, resolveBuild, rollContext, rowState,
} from "./itemBuilderRules.js";
import {realItemBuilderModel, tinyModel} from "./itemBuilderFixtures.js";

const model = tinyModel();
const build = (fields) => ({...EMPTY_BUILD, quality: "rare", ...fields});
const ctxFor = (fields) => rollContext(model, build(fields));
const keys = (affixes) => affixes.map((a) => a.key);
const A = (key) => model.affixByKey.get(key);

describe("affixLevel", () => {
    it("raises ilvl to qlvl first", () => {
        expect(affixLevel({ilvl: 10, qlvl: 30, magicLvl: 0})).toBe(15);
    });

    it("adds magic lvl, capped at 99", () => {
        expect(affixLevel({ilvl: 85, qlvl: 67, magicLvl: 1})).toBe(86);
        expect(affixLevel({ilvl: 85, qlvl: 85, magicLvl: 18})).toBe(99);
    });

    it("switches formula at 99 - floor(qlvl / 2)", () => {
        expect(affixLevel({ilvl: 86, qlvl: 86, magicLvl: 0})).toBe(73);
        expect(affixLevel({ilvl: 55, qlvl: 30, magicLvl: 0})).toBe(40);
        expect(affixLevel({ilvl: 84, qlvl: 30, magicLvl: 0})).toBe(69);
        expect(affixLevel({ilvl: 99, qlvl: 1, magicLvl: 0})).toBe(99);
    });

    it("clamps to 1-99", () => {
        expect(affixLevel({ilvl: 0, qlvl: 0, magicLvl: 0})).toBe(1);
    });
});

describe("craftedItemLevel", () => {
    it("halves both levels, rounding down (Arreat Summit example: Berserker Axe, clvl 78, ingredient ilvl 85)", () => {
        expect(craftedItemLevel(78, 85)).toBe(81);
        expect(affixLevel({ilvl: craftedItemLevel(78, 85), qlvl: 86, magicLvl: 0})).toBe(73);
        expect(craftedItemLevel(99, 99)).toBe(98);
    });
});

describe("allowedQualities and item kinds", () => {
    it("allows rare by the type's Rare flag and crafted by category; jewels and charms are not craftable", () => {
        const q = (code) => allowedQualities(model, model.baseByCode.get(code));
        expect(q("axe")).toEqual(["magic", "rare", "crafted"]);
        expect(q("amu")).toEqual(["magic", "rare", "crafted"]);
        expect(q("ci3")).toEqual(["magic", "rare", "crafted"]);
        expect(q("jew")).toEqual(["magic", "rare"]);
        expect(q("cm3")).toEqual(["magic"]);
    });

    it("classifies jewels, charms, jewelry and equipment", () => {
        const kind = (code) => itemKind(model, model.baseByCode.get(code));
        expect([kind("jew"), kind("cm3"), kind("amu"), kind("axe")]).toEqual(["jewel", "charm", "jewelry", "equipment"]);
    });

    it("caps a rare jewel at 2 + 2 and crafted items at 4 in total", () => {
        expect(ctxFor({base: "jew"}).caps).toEqual(CAPS.rareJewel);
        expect(ctxFor({base: "axe", quality: "crafted"}).caps).toEqual({prefix: 3, suffix: 3, total: 4});
        expect(ctxFor({base: "axe", quality: "magic"}).caps).toEqual({prefix: 1, suffix: 1, total: 2});
    });
});

describe("canRoll / eligibleAffixes", () => {
    it("applies level, max level, types, exclusions, the rare flag and the class rule", () => {
        expect(keys(eligibleAffixes(model, ctxFor({base: "axe"})))).toEqual(["p0", "p1", "p3", "p4", "p6", "p7", "s0", "s1", "s2", "s3", "s4"]);
        expect(keys(eligibleAffixes(model, ctxFor({base: "orb"})))).toEqual(["p0", "p1", "p3", "p7", "s0", "s1", "s2", "s3", "s4"]);
    });

    it("lets magic items take magic-only rows", () => {
        expect(canRoll(A("p2"), ctxFor({base: "axe", quality: "magic"}))).toBe(true);
        expect(canRoll(A("p2"), ctxFor({base: "axe", quality: "rare"}))).toBe(false);
    });

    it("hides rows below their level and above their max level", () => {
        const low = ctxFor({base: "axe", quality: "magic", ilvl: 30}); // alvl 15
        expect(low.alvl).toBe(15);
        expect(canRoll(A("p5"), low)).toBe(true);
        expect(canRoll(A("p1"), low)).toBe(false);
        expect(canRoll(A("p5"), ctxFor({base: "axe", quality: "magic"}))).toBe(false);
    });

    it("uses the crafted item level for crafted items", () => {
        const ctx = ctxFor({base: "axe", quality: "crafted", clvl: 20, gilvl: 20}); // crafted ilvl 20 -> qlvl 30 -> alvl 15
        expect(ctx.ilvl).toBe(20);
        expect(ctx.effectiveIlvl).toBe(30);
        expect(ctx.alvl).toBe(15);
    });
});

describe("rowState", () => {
    const magic = ctxFor({base: "axe", quality: "magic"}).caps;

    it("marks picked rows, a taken group on either side, and full sides", () => {
        expect(rowState(A("p2"), [A("p2")], magic).state).toBe("picked");
        expect(rowState(A("s1"), [A("p2")], magic)).toEqual({state: "group", by: A("p2")});
        expect(rowState(A("p0"), [A("p2")], magic).state).toBe("full");
        expect(rowState(A("s0"), [A("p2")], magic).state).toBe("free");
    });

    it("puts group before full", () => {
        expect(rowState(A("p1"), [A("p0")], magic)).toEqual({state: "group", by: A("p0")});
    });

    it("closes both sides when a crafted item reaches 4 affixes", () => {
        const crafted = ctxFor({base: "axe", quality: "crafted"}).caps;
        const picked = [A("p0"), A("p3"), A("p4"), A("s0")];
        expect(rowState(A("s2"), picked, crafted).state).toBe("full");
        expect(rowState(A("s2"), picked.slice(0, 3), crafted).state).toBe("free");
    });
});

describe("requiredLevel and countHint", () => {
    it("takes the highest of the base's and the picks' level requirements", () => {
        expect(requiredLevel(model.baseByCode.get("axe"), [A("s0"), A("s4")])).toBe(40);
        expect(requiredLevel(model.baseByCode.get("axe"), [])).toBe(10);
    });

    it("describes how many affixes a real drop rolls", () => {
        expect(countHint(ctxFor({base: "axe", quality: "magic", ilvl: 70}))).toBe("A magic item at ilvl 70 always rolls 2 affixes");
        expect(countHint(ctxFor({base: "jew", quality: "magic", ilvl: 70}))).toBe("A magic item at ilvl 70 rolls 1–2 affixes (always 2 from ilvl 85)");
        expect(countHint(ctxFor({base: "axe", ilvl: 50}))).toBe("A rare at ilvl 50 rolls 4–6 affixes");
        expect(countHint(ctxFor({base: "axe", ilvl: 85}))).toBe("A rare at ilvl 85 always rolls 6 affixes");
        expect(countHint(ctxFor({base: "jew"}))).toBe("A rare jewel always rolls 4 affixes");
        expect(countHint(ctxFor({base: "axe", quality: "crafted"}))).toBe("A crafted item at ilvl 98 always rolls 4 random affixes");
        expect(countHint(ctxFor({base: "axe", quality: "crafted", clvl: 80, gilvl: 1}))).toBe("A crafted item at ilvl 40 rolls 2–4 random affixes");
    });
});

describe("resolveBuild", () => {
    it("keeps a valid build as it is", () => {
        const raw = {base: "axe", quality: "rare", ilvl: 85, clvl: 99, gilvl: 99, picks: ["p0", "s0"]};
        expect(resolveBuild(model, raw)).toEqual({build: raw, dropped: 0, fixed: 0});
    });

    it("defaults missing levels to 99 and resets invalid ones, counting them", () => {
        const {build, fixed} = resolveBuild(model, {base: "axe", quality: "magic", ilvl: 0, clvl: 100, gilvl: Number.NaN, picks: []});
        expect([build.ilvl, build.clvl, build.gilvl, fixed]).toEqual([99, 99, 99, 3]);
        expect(resolveBuild(model, {base: "axe", quality: "magic"}).fixed).toBe(0);
    });

    it("falls back to the first allowed quality", () => {
        expect(resolveBuild(model, {base: "cm3", quality: "rare"})).toMatchObject({build: {quality: "magic"}, fixed: 1});
        expect(resolveBuild(model, {base: "cm3"})).toMatchObject({build: {quality: "magic"}, fixed: 0});
    });

    it("drops every pick of an unknown base", () => {
        expect(resolveBuild(model, {base: "nope", quality: "rare", picks: ["p0", "s0"]}))
            .toEqual({build: {...EMPTY_BUILD}, dropped: 2, fixed: 1});
    });

    it("collapses repeated keys and keeps the earliest picks on a conflict", () => {
        expect(resolveBuild(model, {base: "axe", quality: "magic", picks: ["p0", "p0", "p7", "s1", "p9"]}))
            .toMatchObject({build: {picks: ["p0", "s1"]}, dropped: 2});
    });

    it("control change: switching a rare axe with 3 prefixes to magic keeps the first prefix", () => {
        const {build, dropped} = resolveBuild(model, {base: "axe", quality: "magic", picks: ["p0", "p3", "p4", "s0"]});
        expect(build.picks).toEqual(["p0", "s0"]);
        expect(dropped).toBe(2);
    });

    it("control change: switching to a base that can't take the picks drops them", () => {
        expect(resolveBuild(model, {base: "cm3", quality: "rare", picks: ["p0", "s0"]}))
            .toMatchObject({build: {base: "cm3", quality: "magic", picks: ["s0"]}, dropped: 1});
    });
});

describe("the rules on the real data", () => {
    const real = realItemBuilderModel();
    const ctx = (base) => rollContext(real, {...EMPTY_BUILD, base, quality: "rare"});
    const R = (key) => real.affixByKey.get(key);

    it("the level-35 Lapis rolls on a staff but not an orb; the level-12 Lapis rolls on an orb", () => {
        expect(canRoll(R("p352"), ctx("cst"))).toBe(true);
        expect(canRoll(R("p352"), ctx("ob1"))).toBe(false);
        expect(canRoll(R("p351"), ctx("ob1"))).toBe(true);
    });

    it("Expert's (Barbarian, itype weap) rolls on an axe and is blocked on an orb by the class rule alone", () => {
        const orb = ctx("ob1");
        expect(R("p481").itypes.some((t) => orb.chain.has(t))).toBe(true);
        expect(R("p481").etypes.some((t) => orb.chain.has(t))).toBe(false);
        expect(canRoll(R("p481"), orb)).toBe(false);
        expect(canRoll(R("p481"), ctx("hax"))).toBe(true);
    });

    it("every weapon and armor base can be magic, rare and crafted", () => {
        for (const base of real.bases.filter((b) => b.tier)) {
            expect(allowedQualities(real, base), base.code).toEqual(["magic", "rare", "crafted"]);
        }
    });
});
