import {describe, expect, it} from "vitest";
import {AFFIX_TABLE_COLUMNS, checkColumns, joinAffixes, parseTableRows} from "./itemBuilderData.js";
import {affixTableText, readJson, readText} from "./itemBuilderFixtures.js";

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
