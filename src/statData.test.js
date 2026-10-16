import {describe, expect, it} from "vitest";
import {ENGINE_STATS, STAT_TABLE_COLUMNS, TOOLTIP_STRINGS, buildStatData, skillName, skillOf, statDataFromJson, trimStatData} from "./statData.js";
import {describe as describeEntries, expandMods} from "./statEngine.js";
import {ENGINE_TEST_BASES, realAffixData, realStatData, tableText} from "./statFixtures.js";

// Small tables with just the columns buildStatData reads.
function tinyTexts(overrides = {}) {
    return {
        Properties: tableText(STAT_TABLE_COLUMNS.Properties, [
            {code: "deep-wounds", func1: "1", stat1: "deep_wounds"},
            {code: "res-all", func1: "1", stat1: "fireresist", func2: "3", stat2: "coldresist"},
            {code: "ama", func1: "21", stat1: "item_addclassskills", val1: "0"},
        ]),
        ItemStatCost: tableText(STAT_TABLE_COLUMNS.ItemStatCost, [
            {Stat: "coldresist", ID: "43", descpriority: "40", descfunc: "4", descval: "2", descstrpos: "ModStr1k", descstrneg: "ModStr1k", dgrp: "2", dgrpfunc: "19", dgrpstrpos: "strModAllResistances"},
            {Stat: "fireresist", ID: "39", descpriority: "36", descfunc: "4", descval: "2", descstrpos: "ModStr1j", dgrp: "2", dgrpfunc: "19", dgrpstrpos: "strModAllResistances"},
            {Stat: "item_hp_perlevel", ID: "216", op: "2", "op param": "3", "op base": "level", descfunc: "6"},
            {Stat: "item_armor_percent", ID: "16", op: "13", descfunc: "4"},
        ]),
        CharStats: tableText(STAT_TABLE_COLUMNS.CharStats, [
            {class: "Amazon", StrAllSkills: "ModStr3a", StrSkillTab1: "StrSklTabItem3", StrSkillTab2: "StrSklTabItem2", StrSkillTab3: "StrSklTabItem1", StrClassOnly: "AmaOnly", BlockFactor: "25"},
            {class: "Expansion"},
            {class: "Druid", StrAllSkills: "ModStre8a_PD2", StrClassOnly: "DruOnly"},
        ]),
        Skills: tableText(STAT_TABLE_COLUMNS.Skills, [
            {skill: "Teleport", Id: "54", skilldesc: "teleport", reqlevel: "18", maxlvl: "20"},
            {skill: "proc_SplashDamage", Id: "358", skilldesc: "proc skill", reqlevel: "1"},
        ]),
        Skilldesc: tableText(STAT_TABLE_COLUMNS.Skilldesc, [{skilldesc: "teleport", "str name": "skillname54"}]),
        ...overrides,
    };
}

const tiny = (overrides) => buildStatData({
    texts: tinyTexts(overrides),
    patchStrings: new Map([["ModStr1k", "Cold Resist (patch)"], ["", "a skill description"]]),
    baseStrings: {ModStr1k: "Cold Resist", ModStr1j: "Fire Resist", skillname54: "Teleport"},
});

describe("buildStatData", () => {
    it("reads each class's BlockFactor", () => {
        expect(tiny().classes[0].blockFactor).toBe(25);
    });

    it("indexes property codes in lower case, with their func slots", () => {
        const dict = tiny();
        expect(dict.properties.get("deep-wounds")).toEqual([{func: 1, stat: "deep_wounds", set: 0, val: 0}]);
        expect(dict.properties.get("res-all").map((s) => [s.func, s.stat])).toEqual([[1, "fireresist"], [3, "coldresist"]]);
        expect(dict.properties.get("ama")[0].val).toBe(0);
    });

    it("reads each stat's description fields and its per-level unit", () => {
        const dict = tiny();
        expect(dict.stats.get("coldresist")).toMatchObject({id: 43, priority: 40, func: 4, val: 2, pos: "ModStr1k", group: 2, groupFunc: 19, op: 0, perLevelShift: null});
        expect(dict.stats.get("item_hp_perlevel").perLevelShift).toBe(3);
        expect(dict.stats.get("item_armor_percent").perLevelShift).toBeNull(); // op 13 isn't per level
    });

    it("lists each dgrp group's members by stat id", () => {
        expect(tiny().groups.get(2)).toEqual(["fireresist", "coldresist"]);
    });

    it("numbers classes by the CharStats rows that have a class string", () => {
        const dict = tiny();
        expect(dict.classes.map((c) => c.name)).toEqual(["Amazon", "Druid"]);
        expect(dict.classes[0].tabs).toEqual(["StrSklTabItem3", "StrSklTabItem2", "StrSklTabItem1"]);
    });

    it("resolves strings from the patch table first, then the base strings; an empty key is absent", () => {
        const dict = tiny();
        expect(dict.string("ModStr1k")).toBe("Cold Resist (patch)");
        expect(dict.string("ModStr1j")).toBe("Fire Resist");
        expect(dict.string("nope")).toBeNull();
        expect(dict.string("")).toBeNull();
    });

    it("finds skills by Id or by name, and their names through Skilldesc.txt", () => {
        const dict = tiny();
        expect(skillOf(dict, "54")).toBe(skillOf(dict, "teleport"));
        expect(skillName(dict, skillOf(dict, 54))).toBe("Teleport");
        expect(skillOf(dict, "54")).toMatchObject({reqlevel: 18, maxlvl: 20});
        expect(skillName(dict, skillOf(dict, "358"))).toBeNull();
        expect(() => skillOf(dict, "Nope")).toThrow(/skill "Nope" is not in Skills\.txt/);
    });

    it("fails loudly on a missing table or column", () => {
        expect(() => tiny({Skills: undefined})).toThrow("Skills.txt: missing");
        expect(() => tiny({Skilldesc: "skilldesc\n"})).toThrow(/Skilldesc\.txt: missing required column\(s\) "str name"/);
    });
});

describe("the real stat tables", () => {
    const dict = realStatData();

    it("give each class its BlockFactor and resolve the tooltip's labels", () => {
        expect(Object.fromEntries(dict.classes.map((c) => [c.name, c.blockFactor]))).toEqual({
            Amazon: 25, Sorceress: 20, Necromancer: 20, Paladin: 30, Barbarian: 25, Druid: 20, Assassin: 25});
        for (const key of TOOLTIP_STRINGS) expect(dict.string(key), key).not.toBeNull();
        expect(dict.string("ItemStats1r")).toBe("Chance to Block: ");
        expect(dict.string("Charmdes")).toBe("Keep in Inventory to Gain Bonus");
    });

    it("define the codes and units the engine relies on", () => {
        expect(dict.properties.get("res-all")).toHaveLength(4);
        expect(dict.properties.has("deep-wounds")).toBe(true);
        expect(dict.stats.get("item_tohit_perlevel").perLevelShift).toBe(1); // attack rating counts in halves
        expect(dict.stats.get("item_mana_perlevel").perLevelShift).toBe(3); // mana in eighths
        expect(dict.classes.map((c) => c.name)).toEqual(["Amazon", "Sorceress", "Necromancer", "Paladin", "Barbarian", "Druid", "Assassin"]);
    });

    it("name skills, except the map proc 358", () => {
        expect(skillName(dict, skillOf(dict, 54))).toBe("Teleport");
        expect(skillName(dict, skillOf(dict, 358))).toBeNull();
    });
});

describe("trimStatData and statDataFromJson", () => {
    const full = realStatData();
    const affixes = realAffixData().rows;
    const json = trimStatData(full, affixes.flatMap((a) => a.mods));
    const trimmed = statDataFromJson(JSON.parse(JSON.stringify(json)));
    const lines = (d, ctx) => affixes.map((a) => describeEntries(expandMods(a.mods, d, ctx).entries, d)
        .map((l) => [l.pieces, l.label, l.key, !!l.byRoll]));

    it("describe every affix exactly as the full dictionary does, at ilvl 1 and 99, with no base and on each kind of base", () => {
        for (const base of [null, ...Object.values(ENGINE_TEST_BASES)]) {
            for (const ilvl of [1, 99]) {
                const ctx = {ilvl: {min: ilvl, max: ilvl}, base};
                expect(lines(trimmed, ctx)).toEqual(lines(full, ctx));
            }
        }
    });

    it("keep every engine stat, every tooltip string and the class rows with their BlockFactor", () => {
        for (const stat of ENGINE_STATS) expect(trimmed.stats.has(stat), stat).toBe(true);
        for (const key of TOOLTIP_STRINGS) expect(trimmed.string(key), key).toBe(full.string(key));
        expect(trimmed.classes).toEqual(full.classes);
        expect(trimmed.groups.get(2)).toEqual(full.groups.get(2));
    });

    it("stay small (about 56 KB before gzip)", () => {
        expect(JSON.stringify(json).length).toBeLessThan(80_000);
    });

    it("fails loudly when a tooltip label is missing", () => {
        const odd = {...full, string: (key) => (key === "Charmdes" ? null : full.string(key))};
        expect(() => trimStatData(odd, [])).toThrow(/trimStatData: tooltip string\(s\) "Charmdes"/);
    });

    it("statDataFromJson rejects a malformed dictionary", () => {
        expect(() => statDataFromJson(undefined)).toThrow("statDict: malformed");
        expect(() => statDataFromJson({properties: [], stats: []})).toThrow("statDict: malformed");
    });
});
