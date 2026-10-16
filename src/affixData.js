// The affix rows: MagicPrefix/MagicSuffix.txt read row by row, described by the stat engine
// (src/statEngine.js), and the Stat filter's options. The affix-data plugin (vite.config.js) writes
// Affixes.json from these rows, and the Item Builder's ItemBuilder.json takes its affixes from them too.
// Pure, so it runs in Vite, Vitest and Node tools.
import {parseTxt} from "./dropCalcData.js";
import {checkEntries, describe, expandMods} from "./statEngine.js";

export const AFFIXES_FILE = "Affixes.json";
export const AFFIXES_VERSION = 1;
export const AFFIX_TABLES = ["MagicPrefix", "MagicSuffix", "ItemTypes"];

const numbered = (prefix, n) => Array.from({length: n}, (_, i) => `${prefix}${i + 1}`);
const MOD_COLUMNS = [1, 2, 3].flatMap((i) => [`mod${i}code`, `mod${i}param`, `mod${i}min`, `mod${i}max`]);

export const AFFIX_TABLE_COLUMNS = ["Name", "spawnable", "rare", "level", "maxlevel", "levelreq", "classspecific",
    "class", "classlevelreq", "frequency", "group", ...MOD_COLUMNS, ...numbered("itype", 7), ...numbered("etype", 5)];

// The classes' full names, by the affix tables' class codes.
export const CLASS_NAMES = {ama: "Amazon", ass: "Assassin", bar: "Barbarian", dru: "Druid", nec: "Necromancer", pal: "Paladin", sor: "Sorceress"};

// ItemTypes.txt names that don't match the game's: lcha is the in-game Grand Charm and mcha the Large
// Charm (PD2 renamed them; ItemTypes.txt kept the old names), and misl, the arrows and bolts.
export const TYPE_NAME_OVERRIDES = {
    lcha: "Grand Charm", mcha: "Large Charm", lchp: "Grand Charm PVP", mchp: "Large Charm PVP", misl: "Bow/Crossbow Quiver",
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

export function checkAffixColumns(table, text) {
    if (typeof text !== "string") throw new Error(`${table}.txt: missing`);
    const have = new Set((lines(text)[0] ?? "").split("\t").map((h) => h.trim()));
    const missing = AFFIX_TABLE_COLUMNS.filter((c) => !have.has(c));
    if (missing.length) {
        throw new Error(`${table}.txt: missing required column(s) ${missing.map((c) => `"${c}"`).join(", ")}`);
    }
}

// The rows that can roll (spawnable, frequency > 0), prefixes then suffixes in file order, keyed p/s plus
// the row index, with the fields the builder uses.
export function readAffixes(texts) {
    const out = [];
    for (const [table, suffix] of [["MagicPrefix", false], ["MagicSuffix", true]]) {
        checkAffixColumns(table, texts[table]);
        parseTableRows(texts[table]).forEach((row, index) => {
            if (cell(row.spawnable) !== "1" || int(row.frequency) <= 0) return;
            const list = (prefix, n) => numbered(prefix, n).map((c) => cell(row[c])).filter(Boolean);
            const classLevel = int(row.classlevelreq);
            out.push({
                key: `${suffix ? "s" : "p"}${index}`,
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
            });
        });
    }
    return out;
}

// A Stat filter label without its leading value tokens, for sorting: "+# to Life" sorts under L.
export const sortableLabel = (label) => label.replace(/^[\s#+\-%]+/, "").replace(/^to\s+/i, "");

const isMapCode = (code) => code.toLowerCase().startsWith("map-");

// affixes: readAffixes' rows. Adds lines, statKeys and sort to each, and returns the Stat filter's
// options, plus warnings for what the game tolerates (unknown property codes, unknown item types).
export function describeAffixes(affixes, dict, typeNames) {
    const warnings = [];
    const options = new Map(); // key -> {labels: Map(label -> count), items: bool}
    const note = (key, label, items) => {
        const o = options.get(key) ?? {labels: new Map(), items: false};
        o.labels.set(label, (o.labels.get(label) ?? 0) + 1);
        o.items ||= items;
        options.set(key, o);
    };

    const unknownTypes = new Map();
    const names = (codes, key) => codes.flatMap((code) => {
        if (!typeNames.has(code)) {
            unknownTypes.set(code, [...(unknownTypes.get(code) ?? []), key]);
            return [];
        }
        return [typeNames.get(code)];
    });

    const unknownCodes = new Map();
    const expanded = affixes.map((a) => {
        const {entries, unknown} = expandMods(a.mods, dict, {ilvl: {min: a.level, max: 99}});
        for (const code of unknown) unknownCodes.set(code, [...(unknownCodes.get(code) ?? []), a.key]);
        return entries;
    });
    for (const [code, keys] of unknownCodes) warnings.push(`property "${code}" is not in Properties.txt (${keys.join(", ")}); it adds no stats`);
    checkEntries(expanded.flat(), dict);

    const rows = affixes.map((a, i) => {
        const described = describe(expanded[i], dict);
        const items = !a.mods.every((m) => isMapCode(m.code));

        const statKeys = [];
        for (const line of described) {
            statKeys.push({key: line.key});
            note(line.key, line.label, items);
            if (line.key.startsWith("dgrp")) {
                // Each member of a folded group matches indirectly, tagged with the group line.
                for (const member of line.stats) {
                    const alone = describe([{stat: member, layer: 0, min: line.value.min, max: line.value.max}], dict)[0];
                    if (!alone) {
                        throw new Error(`stat ${member} (dgrp ${line.key.slice("dgrp".length)}) prints no line of its own: it needs a descfunc in ItemStatCost.txt`);
                    }
                    statKeys.push({key: alone.key, via: line.via});
                    note(alone.key, alone.label, items);
                }
            }
        }

        const first = described[0];
        return {
            ...a,
            className: a.classSpecific ? CLASS_NAMES[a.classSpecific] ?? a.classSpecific : null,
            itemTypes: names(a.itypes, a.key),
            excludedItemTypes: names(a.etypes, a.key),
            lines: described.flatMap((l) => l.pieces),
            statKeys,
            sort: first ? {property: first.key, max: first.value.max} : null,
        };
    });

    for (const [code, keys] of unknownTypes) warnings.push(`affix type "${code}" is not in ItemTypes.txt (${keys.join(", ")}); the game ignores it`);

    // The most common label wins (the pair lines have a single-value and a range form).
    const stats = [...options].map(([key, o]) => ({
        key,
        label: [...o.labels].sort((x, y) => y[1] - x[1])[0][0],
        group: o.items ? "Items" : "Maps",
    })).sort((x, y) => (x.group === y.group ? 0 : x.group === "Items" ? -1 : 1)
        || sortableLabel(x.label).localeCompare(sortableLabel(y.label)) || x.label.localeCompare(y.label));

    return {rows, stats, warnings};
}

// ItemTypes.txt code -> display name, through TYPE_NAME_OVERRIDES.
export function itemTypeNames(text) {
    const out = new Map();
    const rows = parseTxt(text);
    if (rows.length && !("ItemType" in rows[0])) throw new Error("ItemTypes.txt: missing column ItemType");
    for (const row of rows) {
        const code = cell(row.Code);
        if (code && !out.has(code)) out.set(code, TYPE_NAME_OVERRIDES[code] ?? cell(row.ItemType));
    }
    return out;
}

// Affixes.json: what the Affixes tab shows.
export function affixesJson({rows, stats}) {
    return {
        version: AFFIXES_VERSION,
        stats,
        affixes: rows.map((r) => ({
            key: r.key, suffix: r.suffix, name: r.name, level: r.level, maxLevel: r.maxLevel, requiredLevel: r.levelreq,
            rare: r.rare, frequency: r.frequency, group: r.group, classSpecific: r.classSpecific, className: r.className,
            itemTypes: r.itemTypes, excludedItemTypes: r.excludedItemTypes, lines: r.lines, statKeys: r.statKeys, sort: r.sort,
        })),
    };
}

// The loaded Affixes.json, checked: an old or foreign file fails loudly rather than rendering nothing.
export function checkAffixesFile(json) {
    if (json?.version !== AFFIXES_VERSION) throw new Error(`${AFFIXES_FILE}: unsupported version ${json?.version}`);
    return json;
}

// The Stat filter's tag for a row that reaches `statKey` only through a group line ("All Resistances");
// null when the row prints the stat's own line, or doesn't reach it.
export function viaFor(affix, statKey) {
    const keys = affix?.statKeys ?? [];
    if (!statKey || keys.some((k) => k.key === statKey && !k.via)) return null;
    return keys.find((k) => k.key === statKey)?.via ?? null;
}
