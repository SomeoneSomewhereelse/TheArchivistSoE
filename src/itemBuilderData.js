// The Item Builder's data: the affix tables (MagicPrefix/MagicSuffix.txt), the base items (Weapons,
// Armor, Misc.txt, with display names from Weapons/Armors.json) and the item-type tree (ItemTypes.txt),
// cut down to what the builder uses. Pure, so it runs in Vite, Vitest and the browser: the
// item-builder-data plugin (vite.config.js) writes ItemBuilder.json with buildItemBuilderJson, and the
// browser prepares it with prepareItemBuilder.

export const ITEM_BUILDER_FILE = "ItemBuilder.json";
export const ITEM_BUILDER_VERSION = 1;
export const ITEM_BUILDER_TABLES = ["MagicPrefix", "MagicSuffix", "Weapons", "Armor", "Misc", "ItemTypes"];
export const ITEM_BUILDER_JSON_FILES = ["Affixes.json", "Weapons.json", "Armors.json"];

const numbered = (prefix, n) => Array.from({length: n}, (_, i) => `${prefix}${i + 1}`);
const MOD_COLUMNS = [1, 2, 3].flatMap((i) => [`mod${i}code`, `mod${i}param`, `mod${i}min`, `mod${i}max`]);

export const AFFIX_TABLE_COLUMNS = ["Name", "spawnable", "rare", "level", "maxlevel", "levelreq", "classspecific",
    "class", "classlevelreq", "frequency", "group", ...MOD_COLUMNS, ...numbered("itype", 7), ...numbered("etype", 5)];
const BASE_COLUMNS = ["code", "type", "type2", "level", "levelreq", "spawnable"];

// Per table, the columns the builder reads. A missing one fails the build.
export const TABLE_COLUMNS = {
    MagicPrefix: AFFIX_TABLE_COLUMNS,
    MagicSuffix: AFFIX_TABLE_COLUMNS,
    Weapons: [...BASE_COLUMNS, "magic lvl"],
    Armor: [...BASE_COLUMNS, "magic lvl"],
    Misc: BASE_COLUMNS,
    ItemTypes: ["Code", "Equiv1", "Equiv2", "Class", "Rare"],
};

const cell = (v) => (v ?? "").trim();
const int = (v, fallback = 0) => {
    const x = Number.parseInt(v, 10);
    return Number.isFinite(x) ? x : fallback;
};
const lines = (text) => text.replace(/\r\n/g, "\n").split("\n");

// A tab-separated table as row objects. Unlike dropCalcData's parseTxt it keeps blank lines, because an
// affix's key is its row index; only the newline that ends the file is dropped.
export function parseTableRows(text) {
    const all = lines(text);
    if (all.at(-1) === "") all.pop();
    const headers = (all[0] ?? "").split("\t").map((h) => h.trim());

    return all.slice(1).map((line) => {
        const cols = line.split("\t");
        const row = {};
        headers.forEach((h, i) => {
            row[h] = cols[i] ?? "";
        });
        return row;
    });
}

export function checkColumns(table, text) {
    if (typeof text !== "string") throw new Error(`${table}.txt: missing`);
    const have = new Set((lines(text)[0] ?? "").split("\t").map((h) => h.trim()));
    const missing = TABLE_COLUMNS[table].filter((c) => !have.has(c));
    if (missing.length) {
        throw new Error(`${table}.txt: missing required column(s) ${missing.map((c) => `"${c}"`).join(", ")}`);
    }
}

// The rows that can roll (spawnable, frequency > 0), each with its key: p/s plus its row index.
function rollableRows(text, suffix) {
    return parseTableRows(text)
        .map((row, index) => ({row, suffix, key: `${suffix ? "s" : "p"}${index}`}))
        .filter(({row}) => cell(row.spawnable) === "1" && int(row.frequency) > 0);
}

function toAffix({row, suffix, key}, shown) {
    const list = (prefix, n) => numbered(prefix, n).map((c) => cell(row[c])).filter(Boolean);
    const classLevel = int(row.classlevelreq);
    return {
        key,
        suffix,
        name: cell(row.Name),
        level: int(row.level),
        maxLevel: int(row.maxlevel) > 0 ? int(row.maxlevel) : null,
        levelreq: int(row.levelreq),
        rare: cell(row.rare) === "1",
        classSpecific: cell(row.classspecific) || null,
        classLevelReq: cell(row.class) && classLevel > 0 ? {class: cell(row.class), level: classLevel} : null,
        group: int(row.group),
        frequency: int(row.frequency),
        itypes: list("itype", 7),
        etypes: list("etype", 5),
        mods: [1, 2, 3]
            .map((i) => ({code: cell(row[`mod${i}code`]), param: cell(row[`mod${i}param`]),
                min: int(row[`mod${i}min`], null), max: int(row[`mod${i}max`], null)}))
            .filter((m) => m.code),
        displayProperties: shown.displayProperties ?? [],
    };
}

// Affixes.json lists exactly the rollable raw rows, prefixes then suffixes, in file order. The join is by
// position, checked on name, level, group and side; any drift fails loudly.
export function joinAffixes(texts, affixesJson) {
    const raw = [...rollableRows(texts.MagicPrefix, false), ...rollableRows(texts.MagicSuffix, true)];
    if (!Array.isArray(affixesJson)) throw new Error("Affixes.json: not a list");
    if (raw.length !== affixesJson.length) {
        throw new Error(`Affixes.json has ${affixesJson.length} rows but MagicPrefix/MagicSuffix.txt have ${raw.length} rollable rows`);
    }

    return raw.map((r, i) => {
        const shown = affixesJson[i];
        const name = cell(r.row.Name);
        const level = int(r.row.level);
        const group = int(r.row.group);
        if (shown?.name !== name || shown?.level !== level || shown?.group !== group || Boolean(shown?.suffix) !== r.suffix) {
            throw new Error(`Affixes.json row ${i} ("${shown?.name}", level ${shown?.level}, group ${shown?.group}) doesn't match `
                + `${r.suffix ? "MagicSuffix" : "MagicPrefix"}.txt ${r.key} ("${name}", level ${level}, group ${group})`);
        }
        return toAffix(r, shown);
    });
}
