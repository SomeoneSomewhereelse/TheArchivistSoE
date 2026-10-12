import {describe, expect, it} from "vitest";
import {AFFIXES_VERSION, affixesJson, checkAffixColumns, checkAffixesFile, describeAffixes, itemTypeNames, parseTableRows, readAffixes, sortableLabel, viaFor} from "./affixData.js";
import {describe as describeEntries, expandMods} from "./statEngine.js";
import {affixTableText, readExcel, realAffixData, realStatData, tableText} from "./statFixtures.js";

describe("parseTableRows", () => {
    it("keeps blank rows so row indexes match the file, and drops only the final newline", () => {
        const rows = parseTableRows("Name\tlevel\r\nA\t1\r\n\t\r\n\r\nB\t2\r\n");
        expect(rows.map((r) => r.Name)).toEqual(["A", "", "", "B"]);
        expect(rows[3].level).toBe("2");
    });

    it("gives a short row's missing cells as empty strings", () => {
        expect(parseTableRows("a\tb\tc\nx\n")[0]).toEqual({a: "x", b: "", c: ""});
    });
});

describe("readAffixes", () => {
    const texts = {
        MagicPrefix: affixTableText([
            {Name: "Hidden", spawnable: "0"},
            null,
            {Name: "Expansion", spawnable: "", frequency: ""},
            {Name: "Sharp", group: "5", level: "3", maxlevel: "20", levelreq: "2", itype2: "amul", etype1: "orb",
                mod1code: "dmg%", mod1min: "10", mod1max: "20"},
            {Name: "NoFreq", frequency: "0"},
        ]),
        MagicSuffix: affixTableText([
            {Name: "of Tele", group: "9", rare: "", classspecific: "sor", class: "sor", classlevelreq: "18",
                mod1code: "oskill", mod1param: "Teleport", mod1min: "1", mod1max: "1"},
        ]),
    };

    it("keys rows by their index in the raw table, counting skipped and blank rows", () => {
        expect(readAffixes(texts).map((a) => a.key)).toEqual(["p3", "s0"]);
    });

    it("reads every field the builder uses", () => {
        const [sharp, tele] = readAffixes(texts);
        expect(sharp).toEqual({
            key: "p3", suffix: false, name: "Sharp", level: 3, maxLevel: 20, levelreq: 2, rare: true,
            classSpecific: null, classLevelReq: null, group: 5, frequency: 1, itypes: ["weap", "amul"], etypes: ["orb"],
            mods: [{code: "dmg%", param: "", min: 10, max: 20}],
        });
        expect(tele).toMatchObject({rare: false, maxLevel: null, classSpecific: "sor", classLevelReq: {class: "sor", level: 18}});
        expect(tele.mods[0].param).toBe("Teleport");
    });

    it("names the missing table and the missing columns", () => {
        expect(() => checkAffixColumns("MagicPrefix", undefined)).toThrow("MagicPrefix.txt: missing");
        expect(() => checkAffixColumns("MagicPrefix", "Name\tlevel\n")).toThrow(/MagicPrefix\.txt: missing required column\(s\) "spawnable"/);
    });
});

describe("itemTypeNames", () => {
    it("takes ItemTypes.txt's names, corrected where they don't match the game's", () => {
        const names = itemTypeNames(tableText(["ItemType", "Code"], [
            {ItemType: "Orb", Code: "orb"}, {ItemType: "Large Charm", Code: "lcha"}, {ItemType: "Medium Charm", Code: "mcha"}, {ItemType: "None"},
        ]));
        expect([...names]).toEqual([["orb", "Orb"], ["lcha", "Grand Charm"], ["mcha", "Large Charm"]]);
    });
});

describe("describeAffixes", () => {
    const dict = realStatData();
    const typeNames = new Map([["weap", "Weapon"], ["orb", "Orb"], ["lcha", "Grand Charm"]]);
    const affix = (key, mods, extra = {}) => ({key, suffix: key.startsWith("s"), name: key, level: 1, classSpecific: null, itypes: ["weap"], etypes: [], mods, ...extra});
    const m = (code, min, max, param = "") => ({code, param, min, max});
    const {rows, stats, warnings} = describeAffixes([
        affix("p0", [m("res-cold", 11, 20)], {etypes: ["orb"], itypes: ["weap", "lcha"]}),
        affix("p1", [m("res-all", 3, 6)]),
        affix("p2", [m("res-cold", 5, 5)]),
        affix("p3", [m("map-mon-droparmor", 1, 1)], {itypes: ["amu"]}),
        affix("p4", [m("map-play-mag-gold%", 20, 25)]),
        affix("s0", [m("str", 1, 2)], {classSpecific: "sor"}),
    ], dict, typeNames);
    const row = (key) => rows.find((r) => r.key === key);

    it("adds the engine's lines, the first line's sort key and the class's full name", () => {
        expect(row("p0")).toMatchObject({lines: ["Cold Resist +11-20%"], sort: {property: "coldresist", max: 20},
            itemTypes: ["Weapon", "Grand Charm"], excludedItemTypes: ["Orb"], className: null});
        expect(row("s0").className).toBe("Sorceress");
    });

    it("tags the members of a folded group line as indirect matches", () => {
        expect(row("p1").statKeys).toEqual([{key: "dgrp2"}, {key: "fireresist", via: "All Resistances"},
            {key: "lightresist", via: "All Resistances"}, {key: "coldresist", via: "All Resistances"}, {key: "poisonresist", via: "All Resistances"}]);
    });

    it("gives a row with no lines no sort value, and warns about unknown codes and item types", () => {
        expect(row("p3")).toMatchObject({lines: [], statKeys: [], sort: null, itemTypes: []});
        expect(warnings).toEqual([
            'property "map-mon-droparmor" is not in Properties.txt (p3); it adds no stats',
            'affix type "amu" is not in ItemTypes.txt (p3); the game ignores it',
        ]);
    });

    it("lists the Stat filter's options under Items, then Maps, sorted without leading value tokens", () => {
        expect(stats).toEqual([
            {key: "dgrp2", label: "All Resistances +#", group: "Items"},
            {key: "coldresist", label: "Cold Resist +#%", group: "Items"},
            {key: "fireresist", label: "Fire Resist +#%", group: "Items"},
            {key: "lightresist", label: "Lightning Resist +#%", group: "Items"},
            {key: "poisonresist", label: "Poison Resist +#%", group: "Items"},
            {key: "strength", label: "+# to Strength", group: "Items"},
            {key: "map_play_goldbonus", label: "Gold Find: +#%", group: "Maps"},
            {key: "dgrp6", label: "Magic and Gold Find: +#%", group: "Maps"},
            {key: "map_play_magicbonus", label: "Magic Find: +#%", group: "Maps"},
        ]);
    });

    it("writes Affixes.json's format", () => {
        const json = affixesJson({rows, stats});
        expect(json.version).toBe(AFFIXES_VERSION);
        expect(json.stats).toBe(stats);
        expect(Object.keys(json.affixes[0])).toEqual(["key", "suffix", "name", "level", "maxLevel", "requiredLevel", "rare", "frequency",
            "group", "classSpecific", "className", "itemTypes", "excludedItemTypes", "lines", "statKeys", "sort"]);
    });
});

describe("checkAffixesFile and viaFor", () => {
    it("accept only the current file version", () => {
        expect(checkAffixesFile({version: AFFIXES_VERSION, stats: [], affixes: []}).affixes).toEqual([]);
        expect(() => checkAffixesFile([])).toThrow("Affixes.json: unsupported version undefined");
    });

    it("tag a row that reaches the stat only through a group line", () => {
        const allRes = {statKeys: [{key: "dgrp2"}, {key: "coldresist", via: "All Resistances"}]};
        const both = {statKeys: [{key: "coldresist"}, {key: "coldresist", via: "All Resistances"}]};
        expect(viaFor(allRes, "coldresist")).toBe("All Resistances");
        expect(viaFor(allRes, "dgrp2")).toBeNull();
        expect(viaFor(both, "coldresist")).toBeNull();
        expect(viaFor(allRes, "")).toBeNull();
        expect(viaFor(allRes, "strength")).toBeNull();
    });
});

describe("the real affix tables", () => {
    const {rows, stats, warnings} = realAffixData();
    const byKey = new Map(rows.map((r) => [r.key, r]));

    it("describe 1,412 rollable rows with unique keys", () => {
        expect(rows).toHaveLength(1412);
        expect(byKey.size).toBe(1412);
        expect(stats.length).toBeGreaterThan(150);
    });

    it("warn only about the map-mon-drop codes (of the Smith, of the Armorer) and the item code amu used as a type", () => {
        expect(warnings).toEqual([
            'property "map-mon-dropweapons" is not in Properties.txt (s840, s841, s842, s966, s967, s968); it adds no stats',
            'property "map-mon-droparmor" is not in Properties.txt (s843, s844, s845, s969, s970, s971); it adds no stats',
            'affix type "amu" is not in ItemTypes.txt (s123); the game ignores it',
        ]);
    });

    it("print the spec's spot checks", () => {
        expect(byKey.get("p317")).toMatchObject({name: "Shimmering", lines: ["All Resistances +3-6"]});
        expect(byKey.get("p466").lines).toEqual(["+1 to Combat Skills (Paladin Only)"]);
        expect(byKey.get("s806").lines).toEqual(["+10% Chance of Open Wounds", "+8-12 Open Wounds Damage Per Second"]);
        expect(byKey.get("s840")).toMatchObject({name: "of the Smith", lines: [], sort: null});
        expect(byKey.get("p860").lines).toContain("Magic and Gold Find: +10-20%");
        expect(byKey.get("p352")).toMatchObject({name: "Lapis", excludedItemTypes: ["Orb"]});
        expect(byKey.get("p119").itemTypes).toContain("Grand Charm");
        expect(new Set(["s421", "s422", "s423"].map((k) => byKey.get(k).statKeys[0].key))).toEqual(new Set(["item_skillongethit:38"]));
    });

    it("never print two lines with the same priority in one row", () => {
        const dict = realStatData();
        const texts = Object.fromEntries(["MagicPrefix", "MagicSuffix"].map((name) => [name, readExcel(name)]));
        const tied = readAffixes(texts).filter((a) => {
            const lines = describeEntries(expandMods(a.mods, dict, {ilvl: {min: a.level, max: 99}}).entries, dict);
            return new Set(lines.map((l) => l.priority)).size !== lines.length;
        });
        expect(tied.map((a) => a.key)).toEqual([]);
    });

    it("match the golden snapshot of every row's lines", async () => {
        const text = rows.map((r) => `${r.key}\t${r.name}\t${r.lines.join(" / ")}`).join("\n") + "\n";
        await expect(text).toMatchFileSnapshot("./__snapshots__/affixLines.golden.txt");
    });
});

describe("review fixes", () => {
    it("sortableLabel drops leading value tokens and a leading \"to\", so \"+# to Life\" sorts under L", () => {
        expect(sortableLabel("+# to Life")).toBe("Life");
        expect(sortableLabel("-#% to Enemy Fire Resistance")).toBe("Enemy Fire Resistance");
        expect(sortableLabel("Cold Resist +#%")).toBe("Cold Resist +#%");
        expect(["+# to Life", "Magic Find: +#%"].sort((a, b) => sortableLabel(a).localeCompare(sortableLabel(b)))[0]).toBe("+# to Life");
    });

    it("itemTypeNames fails loudly when ItemTypes.txt has no ItemType column", () => {
        expect(() => itemTypeNames(tableText(["Code", "Equiv1"], [{Code: "swor"}]))).toThrow(/ItemType/);
    });
});
