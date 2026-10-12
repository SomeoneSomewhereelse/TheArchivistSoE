import {describe, expect, it} from "vitest";
import {ITEM_BUILDER_VERSION, buildBases, buildItemBuilderJson, buildTypes, checkColumns, linkFingerprint, prepareItemBuilder, resolveLinkVersion} from "./itemBuilderData.js";
import {readItemBuilderInputs, tableText} from "./itemBuilderFixtures.js";

describe("checkColumns", () => {
    it("names the missing table and the missing columns", () => {
        expect(() => checkColumns("Weapons", undefined)).toThrow("Weapons.txt: missing");
        expect(() => checkColumns("Weapons", "code\ttype\n")).toThrow(/Weapons\.txt: missing required column\(s\) "type2"/);
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
        const model = prepareItemBuilder({version: ITEM_BUILDER_VERSION, linkVersion: 2, types: {}, affixes: [{key: "p0"}],
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
    const json = buildItemBuilderJson(readItemBuilderInputs());

    it("takes the affix rows from the affix data, with the engine's lines and sort key", () => {
        expect(json.version).toBe(ITEM_BUILDER_VERSION);
        expect(json.affixes).toHaveLength(1412);
        const lapis = json.affixes.find((a) => a.key === "p352");
        expect(lapis).toEqual({
            key: "p352", suffix: false, name: "Lapis", level: 35, maxLevel: null, levelreq: 26, rare: true, classSpecific: null,
            classLevelReq: null, group: 117, frequency: 3, itypes: ["weap", "tors", "helm", "boot"], etypes: ["orb"],
            mods: [{code: "res-cold", param: "", min: 11, max: 20}], lines: ["Cold Resist +11-20%"], sort: {property: "coldresist", max: 20},
        });
        expect(json.affixes.find((a) => a.key === "p481")).toMatchObject({name: "Expert's", classSpecific: "bar", lines: ["+1 to Combat Skills (Barbarian Only)"]});
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
