import {describe, expect, it} from "vitest";
import {
    DROP_CALC_COLUMNS, DROP_CALC_FILE, DROP_CALC_TABLES, DROP_CALC_VERSION, jsonToTables, parseTxt, tablesToJson,
} from "./dropCalcData.js";
import {readDropCalcTexts} from "./dropCalcFixtures.js";

// One header line with every listed column, and one row.
function minimalTexts() {
    return Object.fromEntries(DROP_CALC_TABLES.map((name) => {
        const spec = DROP_CALC_COLUMNS[name];
        const columns = spec.all ? ["Version", "Unique"] : [...spec.required, ...(spec.optional ?? [])];
        return [name, `${columns.join("\t")}\n${columns.map((c, i) => `${name}-${i}`).join("\t")}\n`];
    }));
}

describe("parseTxt", () => {
    it("normalises CRLF, drops blank lines, trims headers and keeps cells raw", () => {
        expect(parseTxt(" a \tb\r\n\r\n x \t\r\n")).toEqual([{a: " x ", b: ""}]);
    });

    it("fills a short row's missing cells with an empty string", () => {
        expect(parseTxt("a\tb\tc\n1\n")).toEqual([{a: "1", b: "", c: ""}]);
    });

    it("lets the last of two same-named headers win", () => {
        expect(parseTxt("a\tb\ta\n1\t2\t3")).toEqual([{a: "3", b: "2"}]);
    });
});

describe("tablesToJson / jsonToTables", () => {
    it("lists the ten tables in a fixed order", () => {
        expect(DROP_CALC_TABLES).toEqual(["MonStats", "TreasureClassEx", "Weapons", "Armor", "Misc", "UniqueItems",
            "SetItems", "ItemRatio", "ItemTypes", "Levels"]);
    });

    it("throws on a missing required column, naming the table and the column", () => {
        const texts = minimalTexts();
        texts.Levels = texts.Levels.replace("LevelName", "Name");
        expect(() => tablesToJson(texts)).toThrow('Levels.txt: missing required column(s) "LevelName"');
    });

    it("throws on a missing table", () => {
        const texts = minimalTexts();
        delete texts.Misc;
        expect(() => tablesToJson(texts)).toThrow("Misc.txt: missing");
    });

    it("drops an absent optional column, so rows read it as undefined", () => {
        const texts = minimalTexts();
        texts.SetItems = "index\titem\tlvl\trarity\nSet A\tabc\t5\t3\n";
        const rows = jsonToTables(tablesToJson(texts)).SetItems;
        expect(rows).toEqual([{index: "Set A", item: "abc", lvl: "5", rarity: "3"}]);
        expect(rows[0].code).toBeUndefined();
    });

    it("keeps only the listed columns, and every ItemRatio column", () => {
        const texts = minimalTexts();
        texts.MonStats = texts.MonStats.replace("\n", "\tExtra\n");
        const json = tablesToJson(texts);
        expect(json.version).toBe(DROP_CALC_VERSION);
        expect(json.tables.MonStats.columns).toEqual(DROP_CALC_COLUMNS.MonStats.required);
        expect(json.tables.ItemRatio.columns).toEqual(["Version", "Unique"]);
    });

    it("rejects an unknown version", () => {
        expect(() => jsonToTables({version: 2, tables: {}})).toThrow(`${DROP_CALC_FILE}: unsupported version 2`);
    });

    it("round-trips the real tables to the same rows as parseTxt, restricted to the kept columns", () => {
        for (const mode of ["standard", "damnation"]) {
            const texts = readDropCalcTexts(mode);
            const json = JSON.parse(JSON.stringify(tablesToJson(texts)));
            const tables = jsonToTables(json);
            for (const name of DROP_CALC_TABLES) {
                const kept = json.tables[name].columns;
                const expected = parseTxt(texts[name]).map((row) => Object.fromEntries(kept.map((c) => [c, row[c]])));
                expect(tables[name], `${mode} ${name}`).toEqual(expected);
            }
        }
    });
});
