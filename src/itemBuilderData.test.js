import {describe, expect, it} from "vitest";
import {AFFIX_TABLE_COLUMNS, buildBases, buildItemBuilderJson, buildTypes, checkColumns, joinAffixes, linkFingerprint, parseTableRows, prepareItemBuilder, resolveLinkVersion} from "./itemBuilderData.js";
import {affixTableText, readItemBuilderInputs, readJson, readText, tableText} from "./itemBuilderFixtures.js";

const shown = (name, level, group, suffix, extra = {}) => ({name, level, group, suffix, displayProperties: [], ...extra});

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

describe("checkColumns", () => {
    it("names the missing table and the missing columns", () => {
        expect(() => checkColumns("MagicPrefix", undefined)).toThrow("MagicPrefix.txt: missing");
        expect(() => checkColumns("MagicPrefix", "Name\tlevel\n")).toThrow(/MagicPrefix\.txt: missing required column\(s\) "spawnable"/);
        expect(() => checkColumns("MagicPrefix", AFFIX_TABLE_COLUMNS.join("\t") + "\n")).not.toThrow();
    });
});

describe("joinAffixes", () => {
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
    const json = [shown("Sharp", 3, 5, false, {displayProperties: [{displayString: "+10-20% Damage"}]}), shown("of Tele", 1, 9, true)];

    it("keys rows by their index in the raw table, counting skipped and blank rows", () => {
        expect(joinAffixes(texts, json).map((a) => a.key)).toEqual(["p3", "s0"]);
    });

    it("reads every field the builder uses", () => {
        const [sharp, tele] = joinAffixes(texts, json);
        expect(sharp).toEqual({
            key: "p3", suffix: false, name: "Sharp", level: 3, maxLevel: 20, levelreq: 2, rare: true,
            classSpecific: null, classLevelReq: null, group: 5, frequency: 1, itypes: ["weap", "amul"], etypes: ["orb"],
            mods: [{code: "dmg%", param: "", min: 10, max: 20}],
            displayProperties: [{displayString: "+10-20% Damage"}],
        });
        expect(tele.rare).toBe(false);
        expect(tele.maxLevel).toBeNull();
        expect(tele.classSpecific).toBe("sor");
        expect(tele.classLevelReq).toEqual({class: "sor", level: 18});
        expect(tele.mods[0].param).toBe("Teleport");
    });

    it("fails loudly when Affixes.json has a different row count", () => {
        expect(() => joinAffixes(texts, json.slice(0, 1))).toThrow(/Affixes\.json has 1 rows but .* have 2/);
    });

    it("fails loudly when a row's name, level, group or side differs", () => {
        expect(() => joinAffixes(texts, [shown("Sharp", 4, 5, false), json[1]])).toThrow(/Affixes\.json row 0/);
        expect(() => joinAffixes(texts, [json[0], shown("of Tele", 1, 9, false)])).toThrow(/Affixes\.json row 1/);
    });
});

describe("the real affix tables", () => {
    const texts = {MagicPrefix: readText("standard/MagicPrefix.txt"), MagicSuffix: readText("standard/MagicSuffix.txt")};
    const affixes = joinAffixes(texts, readJson("Affixes.json"));
    const byKey = new Map(affixes.map((a) => [a.key, a]));

    it("join Affixes.json row by row: 1,412 affixes, unique keys", () => {
        expect(affixes).toHaveLength(1412);
        expect(byKey.size).toBe(1412);
    });

    it("key the rows the spec names", () => {
        expect(byKey.get("p351")).toMatchObject({name: "Lapis", level: 12, etypes: []});
        expect(byKey.get("p352")).toMatchObject({name: "Lapis", level: 35, itypes: ["weap", "tors", "helm", "boot"], etypes: ["orb"]});
        expect(byKey.get("p481")).toMatchObject({name: "Expert's", classSpecific: "bar", itypes: ["phlm", "weap", "helm"], etypes: ["miss", "rod", "knif", "club"]});
        expect(byKey.get("s123")).toMatchObject({name: "of Anima"});
        expect(byKey.get("s123").itypes).toContain("amu");
    });
});

const TYPES_TEXT = tableText(["ItemType", "Code", "Equiv1", "Equiv2", "Class", "Rare"], [
    {ItemType: "None"},
    {ItemType: "Weapon", Code: "weap", Rare: "1"},
    {ItemType: "Melee Weapon", Code: "mele", Equiv1: "weap", Rare: "1"},
    {ItemType: "Axe", Code: "axe", Equiv1: "mele", Rare: "1"},
    {ItemType: "Orb", Code: "orb", Equiv1: "weap", Equiv2: "sorc", Class: "sor", Rare: "1"},
    {ItemType: "Sorceress Item", Code: "sorc", Equiv1: "clas"},
    {ItemType: "Class Specific", Code: "clas"},
    {ItemType: "Charm", Code: "char", Equiv1: "misc"},
    {ItemType: "Misc", Code: "misc"},
    {ItemType: "Large Charm", Code: "lcha", Equiv1: "char"},
    {ItemType: "Amulet", Code: "amul", Equiv1: "misc", Rare: "1"},
]);

describe("buildTypes", () => {
    const types = buildTypes(TYPES_TEXT);

    it("follows Equiv1/Equiv2 recursively, the type itself first", () => {
        expect(types.axe.chain).toEqual(["axe", "mele", "weap"]);
        expect(types.orb.chain).toEqual(["orb", "weap", "sorc", "clas"]);
    });

    it("reads the class and the rare flag, and skips rows without a code", () => {
        expect(types.orb.class).toBe("sor");
        expect(types.axe.class).toBeNull();
        expect(types.lcha.rare).toBe(false);
        expect(types.amul.rare).toBe(true);
        expect(Object.keys(types)).not.toContain("");
    });
});

describe("buildBases", () => {
    const types = buildTypes(TYPES_TEXT);
    const weaponCols = ["name", "code", "type", "type2", "level", "levelreq", "spawnable", "magic lvl"];
    const miscCols = ["name", "code", "type", "type2", "level", "levelreq", "spawnable"];
    const miscRows = Object.keys({amu: 1, rin: 1, jew: 1, mjw: 1, cm1: 1, cm2: 1, cm3: 1, cm4: 1, aqv: 1, aqv2: 1, aqv3: 1, cqv: 1, cqv2: 1, cqv3: 1})
        .map((code) => ({code, type: code === "cm3" ? "lcha" : "amul", level: "1", levelreq: "0", spawnable: "1"}));
    const texts = {
        Weapons: tableText(weaponCols, [
            {name: "Hand Axe", code: "hax", type: "axe", level: "3", levelreq: "0", spawnable: "1"},
            {name: "Unused", code: "zzz", type: "axe", level: "3", spawnable: "0"},
            {name: "Not in JSON", code: "pot", type: "axe", level: "1", spawnable: "1"},
            {name: "Eagle Orb", code: "ob1", type: "orb", level: "1", levelreq: "0", spawnable: "1", "magic lvl": "1"},
        ]),
        Armor: tableText(weaponCols, []),
        Misc: tableText(miscCols, miscRows),
    };
    const weaponsJson = [
        {code: "hax", displayName: "Hand Axe", itemTier: "Normal"},
        {code: "zzz", displayName: "Unused", itemTier: "Normal"},
        {code: "ob1", displayName: "Eagle Orb", itemTier: "Normal"},
    ];

    it("keeps spawnable bases the wiki lists, with qlvl, magic lvl and types from the .txt", () => {
        const bases = buildBases(texts, weaponsJson, [], types);
        const orb = bases.find((b) => b.code === "ob1");
        expect(orb).toEqual({code: "ob1", name: "Eagle Orb", group: "Sorceress Orbs", tier: "Normal", qlvl: 1, magicLvl: 1, levelreq: 0, types: ["orb"]});
        expect(bases.map((b) => b.code)).not.toContain("zzz");
        expect(bases.map((b) => b.code)).not.toContain("pot");
    });

    it("names the misc bases the way PD2 does", () => {
        const bases = buildBases(texts, weaponsJson, [], types);
        expect(bases.find((b) => b.code === "cm2").name).toBe("Large Charm");
        expect(bases.find((b) => b.code === "cm3")).toMatchObject({name: "Grand Charm", group: "Grand Charms"});
    });

    it("sorts by group order, then qlvl, then name", () => {
        const codes = buildBases(texts, weaponsJson, [], types).map((b) => b.code);
        expect(codes.indexOf("hax")).toBeLessThan(codes.indexOf("ob1"));
        expect(codes.indexOf("ob1")).toBeLessThan(codes.indexOf("amu"));
    });

    it("fails loudly on a base type with no label, a type missing from ItemTypes.txt, or a missing misc base", () => {
        const bad = (type) => ({...texts, Weapons: tableText(weaponCols, [{name: "X", code: "hax", type, level: "1", spawnable: "1"}])});
        expect(() => buildBases(bad("mele"), weaponsJson, [], types)).toThrow(/no optgroup label for type "mele"/);
        expect(() => buildBases(bad("nope"), weaponsJson, [], types)).toThrow(/type "nope" is not in ItemTypes\.txt/);
        expect(() => buildBases({...texts, Misc: tableText(miscCols, [])}, weaponsJson, [], types)).toThrow(/Misc\.txt: base amu/);
    });
});

describe("linkFingerprint and resolveLinkVersion", () => {
    const json = {
        bases: [{code: "b2"}, {code: "b1"}],
        affixes: [{key: "p0", suffix: false, name: "Sharp", level: 1, group: 1, mods: [{min: 1, max: 2}]}],
    };

    it("ignores stat values but changes when a row moves or a base disappears", () => {
        const fp = linkFingerprint(json);
        expect(fp).toMatch(/^[0-9a-f]{8}$/);
        expect(linkFingerprint({...json, affixes: [{...json.affixes[0], mods: [{min: 5, max: 9}]}]})).toBe(fp);
        expect(linkFingerprint({...json, bases: [{code: "b1"}, {code: "b2"}]})).toBe(fp);
        expect(linkFingerprint({...json, affixes: [{...json.affixes[0], key: "p1"}]})).not.toBe(fp);
        expect(linkFingerprint({...json, bases: [{code: "b1"}]})).not.toBe(fp);
    });

    it("keeps the version while the fingerprint matches", () => {
        expect(resolveLinkVersion({fingerprint: "aa", stored: {version: 4, fingerprint: "aa"}, command: "build"}))
            .toEqual({version: 4, write: false});
    });

    it("bumps and writes in dev, starting at 1", () => {
        expect(resolveLinkVersion({fingerprint: "bb", stored: {version: 4, fingerprint: "aa"}, command: "serve"}))
            .toEqual({version: 5, write: true});
        expect(resolveLinkVersion({fingerprint: "bb", stored: null, command: "serve"})).toEqual({version: 1, write: true});
    });

    it("fails a build on a mismatch or a missing file", () => {
        expect(() => resolveLinkVersion({fingerprint: "bb", stored: {version: 4, fingerprint: "aa"}, command: "build"}))
            .toThrow(/commit src\/itemBuilderVersion\.json/);
        expect(() => resolveLinkVersion({fingerprint: "bb", stored: null, command: "build"}))
            .toThrow(/src\/itemBuilderVersion\.json is missing/);
    });
});

describe("prepareItemBuilder", () => {
    it("indexes bases and affixes and groups bases in order", () => {
        const model = prepareItemBuilder({version: 1, linkVersion: 2, types: {}, affixes: [{key: "p0"}],
            bases: [{code: "a", group: "Axes"}, {code: "b", group: "Orbs"}, {code: "c", group: "Axes"}]});
        expect(model.groups.map((g) => [g.label, g.bases.map((b) => b.code)])).toEqual([["Axes", ["a", "c"]], ["Orbs", ["b"]]]);
        expect(model.baseByCode.get("b").code).toBe("b");
        expect(model.affixByKey.get("p0").key).toBe("p0");
        expect(model.linkVersion).toBe(2);
    });

    it("rejects an unknown file version", () => {
        expect(() => prepareItemBuilder({version: 99})).toThrow("ItemBuilder.json: unsupported version 99");
    });
});

describe("the real data", () => {
    const {json, warnings} = buildItemBuilderJson(readItemBuilderInputs());

    it("builds without errors and warns only about the affix that uses the item code amu as a type", () => {
        expect(warnings).toEqual([expect.stringContaining('affix type "amu" is not in ItemTypes.txt (s123)')]);
    });

    it("has the in-scope bases, uniquely coded, with their levels from the .txt", () => {
        const byCode = new Map(json.bases.map((b) => [b.code, b]));
        expect(byCode.size).toBe(json.bases.length);
        expect(json.bases.length).toBeGreaterThan(500);
        expect(byCode.get("ci3")).toMatchObject({name: "Diadem", qlvl: 85, magicLvl: 18, group: "Circlets"});
        expect(byCode.get("obc")).toMatchObject({qlvl: 67, magicLvl: 1, group: "Sorceress Orbs"});
        expect(byCode.get("cm2")).toMatchObject({name: "Large Charm", group: "Large Charms", qlvl: 1});
        expect(byCode.has("gps")).toBe(false); // throwing potions are out of scope
    });

    it("has the type tree the rules rely on", () => {
        expect(json.types.orb).toEqual({chain: ["orb", "weap", "sorc", "clas"], class: "sor", rare: true});
        expect(json.types.lcha.rare).toBe(false);
        expect(json.types.ocha.rare).toBe(false);
        expect(json.types.mjwg.chain).toContain("jewl");
    });
});
