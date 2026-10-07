// The Drop calculator's data: the ten game tables it reads, cut down to the columns it uses. Pure, so
// it runs in Vite, Vitest and the browser: the drop-calc-data plugin (vite.config.js) turns the .txt
// tables into DropCalculator.json with tablesToJson, and the browser turns that back into row
// objects with jsonToTables.

export const DROP_CALC_FILE = "DropCalculator.json";
export const DROP_CALC_VERSION = 1;

const BASE_ITEM_COLUMNS = ["code", "spawnable", "level", "type", "rarity", "normcode", "ubercode", "ultracode"];
const numbered = (prefix) => Array.from({length: 10}, (_, i) => `${prefix}${i + 1}`);

// Per table, the columns dropCalcEngine.js reads (dropCalcEngine.test.js checks that it reads no
// others). A missing required column is an error. An optional one is a fallback the engine already
// tolerates: SetItems has no "code" (rowItemCode falls back to "item"), and ItemTypes spells its
// columns "Code"/"Rarity". ItemRatio (six rows) keeps every column.
export const DROP_CALC_COLUMNS = {
    MonStats: {required: ["Id", "NameStr", "TreasureClass1", "TreasureClass1(N)", "TreasureClass1(H)", "Level", "Level(N)", "Level(H)"]},
    TreasureClassEx: {required: ["Treasure Class", "group", "level", "Picks", "NoDrop", "Unique", "Set", "Rare", "Magic",
        ...numbered("Item"), ...numbered("Prob")]},
    Weapons: {required: [...BASE_ITEM_COLUMNS, "type2"]},
    Armor: {required: BASE_ITEM_COLUMNS},
    Misc: {required: ["code", "level", "normcode", "ubercode", "ultracode", "stackable"]},
    UniqueItems: {required: ["index", "code", "lvl", "rarity", "enabled"], optional: ["item"]},
    SetItems: {required: ["index", "item", "lvl", "rarity"], optional: ["code", "enabled"]},
    ItemRatio: {all: true},
    ItemTypes: {required: ["Code", "Rarity"], optional: ["code", "rarity"]},
    Levels: {required: ["LevelName", ...numbered("mon")]},
};

export const DROP_CALC_TABLES = Object.keys(DROP_CALC_COLUMNS);

// A tab-separated game table as row objects: CRLF normalised, blank lines dropped, headers trimmed,
// cells kept raw, a short row's missing cells "", and the last of two same-named headers wins.
export function parseTxt(text) {
    const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim() !== "");
    const headers = lines[0].split("\t").map((h) => h.trim());

    return lines.slice(1).map((line) => {
        const cols = line.split("\t");
        const row = {};
        headers.forEach((h, i) => {
            row[h] = cols[i] ?? "";
        });
        return row;
    });
}

function txtHeaders(text) {
    const first = text.replace(/\r\n/g, "\n").split("\n").find((l) => l.trim() !== "");
    return first === undefined ? [] : first.split("\t").map((h) => h.trim());
}

// texts: {[table]: the .txt file's content}. Values are exactly the strings parseTxt produces.
export function tablesToJson(texts) {
    const tables = {};

    for (const [name, spec] of Object.entries(DROP_CALC_COLUMNS)) {
        const text = texts[name];
        if (typeof text !== "string") throw new Error(`${name}.txt: missing`);

        const headers = new Set(txtHeaders(text));
        const missing = (spec.required ?? []).filter((c) => !headers.has(c));
        if (missing.length) {
            throw new Error(`${name}.txt: missing required column(s) ${missing.map((c) => `"${c}"`).join(", ")}`);
        }

        const columns = spec.all
            ? [...headers]
            : [...spec.required, ...(spec.optional ?? [])].filter((c) => headers.has(c));
        tables[name] = {columns, rows: parseTxt(text).map((row) => columns.map((c) => row[c]))};
    }

    return {version: DROP_CALC_VERSION, tables};
}

// DropCalculator.json back into row objects. A column absent from the file is undefined on every row.
export function jsonToTables(json) {
    if (json?.version !== DROP_CALC_VERSION) {
        throw new Error(`${DROP_CALC_FILE}: unsupported version ${json?.version}`);
    }

    return Object.fromEntries(DROP_CALC_TABLES.map((name) => {
        const table = json.tables?.[name];
        if (!table) throw new Error(`${DROP_CALC_FILE}: missing table ${name}`);
        return [name, table.rows.map((values) => Object.fromEntries(table.columns.map((c, i) => [c, values[i]])))];
    }));
}
