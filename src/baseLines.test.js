import {describe, expect, it} from "vitest";
import {BLOCK_CAP, blockChance, blockText, checkBlockClasses, damage, damageText, defense, ethereal, pct, rangeOf, requirement} from "./baseLines.js";

// sumEnds-shaped totals: {low: Map, high: Map}.
const T = (low, high = low) => ({low: new Map(Object.entries(low)), high: new Map(Object.entries(high))});
const NONE = T({});
// SoE's CharStats order and BlockFactors.
const CLASSES = [["Amazon", 25], ["Sorceress", 20], ["Necromancer", 20], ["Paladin", 30], ["Barbarian", 25], ["Druid", 20], ["Assassin", 25]]
    .map(([name, blockFactor]) => ({name, blockFactor}));

describe("rounding", () => {
    it("truncates percentages toward zero and ethereal x5/4", () => {
        expect(pct(156, -20)).toBe(-31);
        expect(pct(37, 201)).toBe(74);
        expect(ethereal(149)).toBe(186);
        expect(ethereal(234)).toBe(292); // Skullder's Ire: rounding to nearest would give 293
        expect(rangeOf({low: 5, high: 5})).toBe("5");
        expect(rangeOf({low: 5, high: 9})).toBe("5-9");
    });
});

describe("defense", () => {
    const monarch = {minac: 133, maxac: 148};

    it("forces maxac + 1 with ac%, then ethereal, then ED (the worked example: Holy, ethereal Monarch)", () => {
        expect(defense(monarch, {eth: true, totals: T({item_armor_percent: 81}, {item_armor_percent: 100})})).toEqual({low: 336, high: 372, changed: true});
    });

    it("matches the PD2 wiki's ethereal uniques (Skullder's Ire, Purgatory)", () => {
        expect(defense({minac: 0, maxac: 233}, {eth: true, totals: T({item_armor_percent: 160}, {item_armor_percent: 200})})).toMatchObject({low: 759, high: 876});
        expect(defense({minac: 0, maxac: 407}, {eth: true, totals: T({item_armor_percent: 220}, {item_armor_percent: 260})})).toMatchObject({low: 1632, high: 1836});
    });

    it("keeps the base range without ac%, adds flat defense unmultiplied, and stays white for ethereal alone", () => {
        expect(defense(monarch, {eth: false, totals: NONE})).toEqual({low: 133, high: 148, changed: false});
        expect(defense(monarch, {eth: true, totals: NONE})).toEqual({low: 166, high: 185, changed: false});
        expect(defense(monarch, {eth: false, totals: T({armorclass: 10})})).toEqual({low: 143, high: 158, changed: true});
    });
});

describe("blockChance", () => {
    it("shows the item's block, then each BlockFactor group, highest first, classes alphabetical", () => {
        const b = blockChance({block: 22}, {classes: CLASSES, onlyClass: null, totals: NONE});
        expect(blockText(b)).toBe("22% (Pal: 52%, Ama/Asn/Bar: 47%, Dru/Nec/Sor: 42%)");
        expect(b.changed).toBe(false);
    });

    it(`caps every number at ${BLOCK_CAP} and turns blue only with a block affix (Aegis of Deflecting)`, () => {
        const b = blockChance({block: 46}, {classes: CLASSES, onlyClass: null, totals: T({toblock: 20})});
        expect(blockText(b)).toBe("66% (Pal: 80%, Ama/Asn/Bar: 80%, Dru/Nec/Sor: 80%)");
        expect(b.changed).toBe(true);
        expect(blockText(blockChance({block: 90}, {classes: CLASSES, onlyClass: "Paladin", totals: NONE}))).toBe("80% (Pal: 80%)");
    });

    it("shows one class on a class-only shield (Paladin shields, Necromancer heads)", () => {
        expect(blockText(blockChance({block: 10}, {classes: CLASSES, onlyClass: "Paladin", totals: NONE}))).toBe("10% (Pal: 40%)");
        expect(blockText(blockChance({block: 3}, {classes: CLASSES, onlyClass: "Necromancer", totals: NONE}))).toBe("3% (Nec: 23%)");
    });

    it("fails loudly on a class with no abbreviation", () => {
        expect(() => checkBlockClasses([...CLASSES, {name: "Warlock", blockFactor: 20}])).toThrow(/no block abbreviation for class\(es\) Warlock/);
        expect(() => checkBlockClasses(CLASSES)).not.toThrow();
    });
});

describe("damage", () => {
    const oneHand = {minStat: "mindamage", maxStat: "maxdamage", clamp: true};
    const twoHand = {minStat: "secondary_mindamage", maxStat: "secondary_maxdamage", clamp: true};

    it("the worked example: ethereal Cruel Berserker Axe of Evisceration", () => {
        const totals = T({item_mindamage_percent: 201, item_maxdamage_percent: 201, maxdamage: 41},
            {item_mindamage_percent: 300, item_maxdamage_percent: 300, maxdamage: 63});
        const d = damage([30, 89], {eth: true, totals, ...oneHand});
        expect(damageText(d, "to")).toBe("111-148 to 375-507");
        expect(d.changed).toBe(true);
    });

    it("matches the PD2 wiki's ethereal two-handers (Warlord's Trust, Ethereal Edge)", () => {
        const ed = (lo, hi) => T({item_mindamage_percent: lo, item_maxdamage_percent: lo}, {item_mindamage_percent: hi, item_maxdamage_percent: hi});
        expect(damageText(damage([21, 61], {eth: true, totals: ed(175, 255), ...twoHand}), "to")).toBe("71-92 to 209-269");
        expect(damageText(damage([78, 138], {eth: true, totals: ed(150, 180), ...twoHand}), "to")).toBe("242-271 to 430-481");
    });

    it("Jagged on a Hand Axe: +1 max at the low end, ED at the high end, exact at both", () => {
        const totals = T({maxdamage: 1}, {item_mindamage_percent: 20, item_maxdamage_percent: 20});
        expect(damageText(damage([3, 6], {eth: false, totals, ...oneHand}), "to")).toBe("3 to 7");
    });

    it("clamps the main line's max to min + 1 but not the others, and stays white for ethereal alone", () => {
        expect(damageText(damage([5, 5], {eth: false, totals: NONE, ...oneHand}), "to")).toBe("5 to 6");
        expect(damageText(damage([5, 5], {eth: false, totals: NONE, ...oneHand, clamp: false}), "to")).toBe("5 to 5");
        const eth = damage([30, 89], {eth: true, totals: NONE, ...oneHand});
        expect([damageText(eth, "to"), eth.changed]).toEqual(["37 to 111", false]);
    });
});

describe("requirement", () => {
    it("applies the percent first, then -10 for ethereal, with no clamp (Monarch of Ease: 115)", () => {
        expect(requirement(156, {eth: true, totals: T({item_req_percent: -20})})).toEqual({low: 115, high: 115});
    });

    it("is hidden when the base has none or the total is <= 0 (U3: ethereal Buckler)", () => {
        expect(requirement(12, {eth: true, totals: T({item_req_percent: -20})})).toBeNull();
        expect(requirement(12, {eth: true, totals: NONE})).toEqual({low: 2, high: 2});
        expect(requirement(0, {eth: false, totals: NONE})).toBeNull();
    });
});
