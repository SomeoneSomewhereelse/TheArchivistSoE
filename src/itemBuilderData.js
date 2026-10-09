// The Item Builder's data: the affix tables (MagicPrefix/MagicSuffix.txt), the base items (Weapons,
// Armor, Misc.txt, with display names from Weapons/Armors.json) and the item-type tree (ItemTypes.txt),
// cut down to what the builder uses. Pure, so it runs in Vite, Vitest and the browser: the
// item-builder-data plugin (vite.config.js) writes ItemBuilder.json with buildItemBuilderJson, and the
// browser prepares it with prepareItemBuilder.
import {parseTxt} from "./dropCalcData.js";

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

// ---- Item types ---------------------------------------------------------------------------------

// Every ItemTypes.txt code with its equivalence chain (Equiv1/Equiv2 followed recursively, the type
// itself first), its class (ItemTypes "Class") and whether it can be rare.
export function buildTypes(text) {
    const byCode = new Map(parseTxt(text).filter((r) => cell(r.Code)).map((r) => [cell(r.Code), r]));
    const types = {};

    for (const [code, row] of byCode) {
        const chain = [];
        const queue = [code];
        while (queue.length) {
            const c = queue.shift();
            if (!c || chain.includes(c) || !byCode.has(c)) continue;
            chain.push(c);
            queue.push(cell(byCode.get(c).Equiv1), cell(byCode.get(c).Equiv2));
        }
        types[code] = {chain, class: cell(row.Class) || null, rare: cell(row.Rare) === "1"};
    }

    return types;
}

// ---- Bases --------------------------------------------------------------------------------------

// The base picker's optgroups, in display order, keyed by the base's primary type. Neither
// ItemTypes.txt (which calls lcha "Large Charm") nor the JSON gives usable plural labels.
export const GROUP_LABELS = [
    ["axe", "Axes"], ["taxe", "Throwing Axes"], ["swor", "Swords"], ["knif", "Daggers"], ["tkni", "Throwing Knives"],
    ["club", "Clubs"], ["mace", "Maces"], ["hamm", "Hammers"], ["scep", "Scepters"], ["wand", "Wands"],
    ["staf", "Staves"], ["spea", "Spears"], ["jave", "Javelins"], ["pole", "Polearms"], ["sc9", "Scythes"],
    ["bow", "Bows"], ["xbow", "Crossbows"], ["orb", "Sorceress Orbs"], ["abow", "Amazon Bows"],
    ["aspe", "Amazon Spears"], ["ajav", "Amazon Javelins"], ["h2h", "Claws"], ["h2h2", "Claws"],
    ["helm", "Helms"], ["circ", "Circlets"], ["pahm", "Paladin Helms"], ["phlm", "Barbarian Helms"],
    ["pelt", "Druid Pelts"], ["tors", "Body Armor"], ["shie", "Shields"], ["ashd", "Paladin Shields"],
    ["head", "Necromancer Heads"], ["glov", "Gloves"], ["boot", "Boots"], ["belt", "Belts"],
    ["bowq", "Arrows"], ["xboq", "Bolts"], ["amul", "Amulets"], ["ring", "Rings"], ["jewl", "Jewels"],
    ["mjwg", "Mythic Jewels"], ["scha", "Small Charms"], ["mcha", "Large Charms"], ["lcha", "Grand Charms"],
    ["ocha", "Ornate Charms"],
];
const TYPE_GROUP = new Map(GROUP_LABELS);
const GROUP_ORDER = new Map();
for (const [, label] of GROUP_LABELS) if (!GROUP_ORDER.has(label)) GROUP_ORDER.set(label, GROUP_ORDER.size);

// Misc.txt bases and their in-game names (PD2 shows cm2 as "Large Charm" and cm3 as "Grand Charm").
// The three quiver tiers share a name; the picker's qlvl tells them apart.
export const MISC_BASES = {
    amu: "Amulet", rin: "Ring", jew: "Jewel", mjw: "Mythic Jewel", cm1: "Small Charm", cm2: "Large Charm",
    cm3: "Grand Charm", cm4: "Ornate Charm", aqv: "Arrows", aqv2: "Arrows", aqv3: "Arrows", cqv: "Bolts",
    cqv2: "Bolts", cqv3: "Bolts",
};

function toBase(row, name, tier, types) {
    const code = cell(row.code);
    const type = cell(row.type);
    const type2 = cell(row.type2);
    for (const t of [type, type2].filter(Boolean)) {
        if (!types[t]) throw new Error(`base ${code} ("${name}"): type "${t}" is not in ItemTypes.txt`);
    }
    const group = TYPE_GROUP.get(type);
    if (!group) {
        throw new Error(`base ${code} ("${name}"): no optgroup label for type "${type}" (add it to GROUP_LABELS in src/itemBuilderData.js)`);
    }
    return {code, name, group, tier, qlvl: int(row.level), magicLvl: int(row["magic lvl"]), levelreq: int(row.levelreq),
        types: type2 ? [type, type2] : [type]};
}

// Spawnable weapons and armor the wiki lists (Weapons/Armors.json, not dontDisplay), plus MISC_BASES.
export function buildBases(texts, weaponsJson, armorsJson, types) {
    const bases = [];

    for (const [table, json] of [["Weapons", weaponsJson], ["Armor", armorsJson]]) {
        const listed = new Map(json.filter((x) => !x.dontDisplay).map((x) => [x.code, x]));
        for (const row of parseTxt(texts[table])) {
            const entry = listed.get(cell(row.code));
            if (cell(row.spawnable) !== "1" || !entry) continue;
            bases.push(toBase(row, entry.displayName || entry.name, entry.itemTier ?? null, types));
        }
    }

    const misc = new Map(parseTxt(texts.Misc).map((r) => [cell(r.code), r]));
    for (const [code, name] of Object.entries(MISC_BASES)) {
        const row = misc.get(code);
        if (!row) throw new Error(`Misc.txt: base ${code} ("${name}") is missing`);
        bases.push(toBase(row, name, null, types));
    }

    return bases.sort((a, b) => GROUP_ORDER.get(a.group) - GROUP_ORDER.get(b.group)
        || a.qlvl - b.qlvl || a.name.localeCompare(b.name));
}

// ---- The file -----------------------------------------------------------------------------------

function unknownTypeWarnings(affixes, types) {
    const unknown = new Map();
    for (const a of affixes) {
        for (const t of [...a.itypes, ...a.etypes]) {
            if (!types[t]) unknown.set(t, [...(unknown.get(t) ?? []), a.key]);
        }
    }
    return [...unknown].map(([t, keys]) => `affix type "${t}" is not in ItemTypes.txt (${keys.join(", ")}); the game ignores it`);
}

// inputs: {texts: {[table]: .txt content}, affixesJson, weaponsJson, armorsJson}. Throws on bad data;
// returns warnings for problems the game itself tolerates. The plugin adds linkVersion.
export function buildItemBuilderJson({texts, affixesJson, weaponsJson, armorsJson}) {
    for (const table of ITEM_BUILDER_TABLES) checkColumns(table, texts[table]);
    const types = buildTypes(texts.ItemTypes);
    const bases = buildBases(texts, weaponsJson, armorsJson, types);
    const affixes = joinAffixes(texts, affixesJson);
    return {json: {version: ITEM_BUILDER_VERSION, types, bases, affixes}, warnings: unknownTypeWarnings(affixes, types)};
}

// The loaded file, indexed for the rules and grouped for the base picker.
export function prepareItemBuilder(json) {
    if (json?.version !== ITEM_BUILDER_VERSION) throw new Error(`${ITEM_BUILDER_FILE}: unsupported version ${json?.version}`);
    const groups = [];
    const byLabel = new Map();
    for (const base of json.bases) {
        let group = byLabel.get(base.group);
        if (!group) {
            group = {label: base.group, bases: []};
            byLabel.set(base.group, group);
            groups.push(group);
        }
        group.bases.push(base);
    }
    return {
        ...json,
        groups,
        baseByCode: new Map(json.bases.map((b) => [b.code, b])),
        affixByKey: new Map(json.affixes.map((a) => [a.key, a])),
    };
}

// ---- Link version -------------------------------------------------------------------------------

function fnv1a(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
}

// What links depend on: each affix's key, side, name, level and group in order, and the base codes.
// Stat values are left out on purpose: an old link stays valid when only an affix's values change.
export function linkFingerprint(json) {
    const affixes = json.affixes.map((a) => `${a.key}|${a.suffix ? 1 : 0}|${a.name}|${a.level}|${a.group}`).join("\n");
    const bases = json.bases.map((b) => b.code).sort().join(",");
    return fnv1a(`${affixes}\n#\n${bases}`);
}

// stored: src/itemBuilderVersion.json's content, or null. command: Vite's "serve" or "build".
export function resolveLinkVersion({fingerprint, stored, command}) {
    if (stored && Number.isInteger(stored.version) && stored.fingerprint === fingerprint) {
        return {version: stored.version, write: false};
    }
    if (command === "build") {
        throw new Error(stored
            ? "the Item Builder's link data changed: run the dev server once and commit src/itemBuilderVersion.json (the link version bump)"
            : "src/itemBuilderVersion.json is missing: run the dev server once and commit it");
    }
    return {version: stored && Number.isInteger(stored.version) ? stored.version + 1 : 1, write: true};
}
