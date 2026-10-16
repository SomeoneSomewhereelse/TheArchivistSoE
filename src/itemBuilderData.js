// The Item Builder's data: the affix rows (src/affixData.js, described by the stat engine), the base items
// (Weapons, Armor, Misc.txt, with display names from Weapons/Armors.json) and the item-type tree
// (ItemTypes.txt), cut down to what the builder uses. Pure, so it runs in Vite, Vitest and the browser: the
// affix-data plugin (vite.config.js) writes ItemBuilder.json with buildItemBuilderJson, including the stat
// engine's trimmed dictionary, and the browser prepares it with prepareItemBuilder.
import {parseTxt} from "./dropCalcData.js";
import {checkBlockClasses} from "./baseLines.js";
import {checkTrimmedStatData} from "./itemTooltip.js";
import {statDataFromJson, trimStatData} from "./statData.js";

export const ITEM_BUILDER_FILE = "ItemBuilder.json";
export const ITEM_BUILDER_VERSION = 3;
export const ITEM_BUILDER_TABLES = ["Weapons", "Armor", "Misc", "ItemTypes"];
export const ITEM_BUILDER_JSON_FILES = ["Weapons.json", "Armors.json"];

const BASE_COLUMNS = ["code", "type", "type2", "level", "levelreq", "spawnable"];

const SLOT_COLUMNS = ["gemsockets", "invwidth", "invheight", "stackable", "maxstack"];

// Per table, the columns the builder reads. A missing one fails the build.
export const TABLE_COLUMNS = {
    Weapons: [...BASE_COLUMNS, "magic lvl", "mindam", "maxdam", "2handmindam", "2handmaxdam", "minmisdam", "maxmisdam",
        "2handed", "1or2handed", "reqstr", "reqdex", "durability", "nodurability", ...SLOT_COLUMNS],
    Armor: [...BASE_COLUMNS, "magic lvl", "minac", "maxac", "block", "reqstr", "durability", "nodurability", ...SLOT_COLUMNS],
    Misc: [...BASE_COLUMNS, "nodurability", ...SLOT_COLUMNS],
    ItemTypes: ["Code", "Equiv1", "Equiv2", "Class", "Rare", "Throwable", "Charm", "MaxSock1", "MaxSock25", "MaxSock40"],
};

const cell = (v) => (v ?? "").trim();
const int = (v, fallback = 0) => {
    const x = Number.parseInt(v, 10);
    return Number.isFinite(x) ? x : fallback;
};

export function checkColumns(table, text) {
    if (typeof text !== "string") throw new Error(`${table}.txt: missing`);
    const first = text.replace(/\r\n/g, "\n").split("\n")[0] ?? "";
    const have = new Set(first.split("\t").map((h) => h.trim()));
    const missing = TABLE_COLUMNS[table].filter((c) => !have.has(c));
    if (missing.length) {
        throw new Error(`${table}.txt: missing required column(s) ${missing.map((c) => `"${c}"`).join(", ")}`);
    }
}

// An affix row as the builder stores it: affixData's fields, the engine's lines and the sort key.
const BUILDER_AFFIX_FIELDS = ["key", "suffix", "name", "level", "maxLevel", "levelreq", "rare", "classSpecific",
    "classLevelReq", "group", "frequency", "itypes", "etypes", "mods", "lines", "sort"];
export const builderAffix = (row) => Object.fromEntries(BUILDER_AFFIX_FIELDS.map((f) => [f, row[f]]));

// ---- Item types ---------------------------------------------------------------------------------

// Every ItemTypes.txt code with its equivalence chain (Equiv1/Equiv2 followed recursively, the type
// itself first), its class (ItemTypes "Class"), whether it can be rare, whether it is throwable or a charm, and
// its socket caps by ilvl band.
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
        types[code] = {
            chain,
            class: cell(row.Class) || null,
            rare: cell(row.Rare) === "1",
            throwable: cell(row.Throwable) === "1",
            charm: cell(row.Charm) === "1",
            maxSock: [int(row.MaxSock1), int(row.MaxSock25), int(row.MaxSock40)],
        };
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

// The tooltip's base fields and their defaults. ItemBuilder.json leaves out a field equal to its default;
// prepareItemBuilder puts them back. A damage pair whose two values are 0 is null.
export const BASE_DEFAULTS = Object.freeze({
    minac: 0, maxac: 0, block: 0, dmg1: null, dmg2: null, dmgThrow: null, twoHanded: false, oneOrTwo: false,
    reqstr: 0, reqdex: 0, durability: 0, nodurability: false, gemsockets: 0, invwidth: 0, invheight: 0, maxstack: 0,
    canEthereal: false,
});

const compactBase = (base) => Object.fromEntries(Object.entries(base).filter(([key, value]) => !(key in BASE_DEFAULTS) || value !== BASE_DEFAULTS[key]));

function toBase(table, row, name, tier, types) {
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
    const weapon = table === "Weapons";
    const armor = table === "Armor";
    const pair = (a, b) => (weapon && (int(row[a]) || int(row[b])) ? [int(row[a]), int(row[b])] : null);
    const typeCodes = type2 ? [type, type2] : [type];
    const chain = new Set(typeCodes.flatMap((t) => types[t].chain));
    const durability = weapon || armor ? int(row.durability) : 0;
    const nodurability = cell(row.nodurability) === "1";
    return {
        code, name, group, tier, qlvl: int(row.level), magicLvl: int(row["magic lvl"]), levelreq: int(row.levelreq), types: typeCodes,
        minac: armor ? int(row.minac) : 0,
        maxac: armor ? int(row.maxac) : 0,
        block: armor ? int(row.block) : 0,
        dmg1: pair("mindam", "maxdam"),
        dmg2: pair("2handmindam", "2handmaxdam"),
        dmgThrow: pair("minmisdam", "maxmisdam"),
        twoHanded: weapon && cell(row["2handed"]) === "1",
        oneOrTwo: weapon && cell(row["1or2handed"]) === "1",
        reqstr: weapon || armor ? int(row.reqstr) : 0,
        reqdex: weapon ? int(row.reqdex) : 0,
        durability,
        nodurability,
        gemsockets: int(row.gemsockets),
        invwidth: int(row.invwidth),
        invheight: int(row.invheight),
        maxstack: cell(row.stackable) === "1" ? int(row.maxstack) : 0,
        // Spec "Ethereal": weapons and armor with durability. Excludes bows, crossbows and Phase Blades
        // (nodurability) and every Misc base.
        canEthereal: (chain.has("weap") || chain.has("armo")) && !nodurability && durability > 0,
    };
}

// Spawnable weapons and armor the wiki lists (Weapons/Armors.json, not dontDisplay), plus MISC_BASES.
export function buildBases(texts, weaponsJson, armorsJson, types) {
    const bases = [];

    for (const [table, json] of [["Weapons", weaponsJson], ["Armor", armorsJson]]) {
        const listed = new Map(json.filter((x) => !x.dontDisplay).map((x) => [x.code, x]));
        for (const row of parseTxt(texts[table])) {
            const entry = listed.get(cell(row.code));
            if (cell(row.spawnable) !== "1" || !entry) continue;
            bases.push(toBase(table, row, entry.displayName || entry.name, entry.itemTier ?? null, types));
        }
    }

    const misc = new Map(parseTxt(texts.Misc).map((r) => [cell(r.code), r]));
    for (const [code, name] of Object.entries(MISC_BASES)) {
        const row = misc.get(code);
        if (!row) throw new Error(`Misc.txt: base ${code} ("${name}") is missing`);
        bases.push(toBase("Misc", row, name, null, types));
    }

    return bases.sort((a, b) => GROUP_ORDER.get(a.group) - GROUP_ORDER.get(b.group)
        || a.qlvl - b.qlvl || a.name.localeCompare(b.name));
}

// ---- The file -----------------------------------------------------------------------------------

// inputs: {texts: {[table]: .txt content}, affixes: describeAffixes' rows, weaponsJson, armorsJson, dict: the
// full stat dictionary}. Throws on bad data, a class with no block abbreviation, or a trimmed dictionary that
// describes any affix differently. The plugin adds linkVersion.
export function buildItemBuilderJson({texts, affixes, weaponsJson, armorsJson, dict}) {
    for (const table of ITEM_BUILDER_TABLES) checkColumns(table, texts[table]);
    const types = buildTypes(texts.ItemTypes);
    const bases = buildBases(texts, weaponsJson, armorsJson, types);
    checkBlockClasses(dict.classes);
    const statDict = trimStatData(dict, affixes.flatMap((a) => a.mods));
    checkTrimmedStatData({full: dict, trimmed: statDataFromJson(JSON.parse(JSON.stringify(statDict))), affixes, types, bases});
    return {version: ITEM_BUILDER_VERSION, types, bases: bases.map(compactBase), affixes: affixes.map(builderAffix), statDict};
}

// The loaded file, indexed for the rules and grouped for the base picker; bases get their defaults back and
// the stat dictionary is rebuilt for the tooltip (model.dict).
export function prepareItemBuilder(json) {
    if (json?.version !== ITEM_BUILDER_VERSION) throw new Error(`${ITEM_BUILDER_FILE}: unsupported version ${json?.version}`);
    let dict;
    try {
        dict = statDataFromJson(json.statDict);
    } catch (e) {
        throw new Error(`${ITEM_BUILDER_FILE}: ${e.message}`);
    }
    const bases = json.bases.map((b) => ({...BASE_DEFAULTS, ...b}));
    const groups = [];
    const byLabel = new Map();
    for (const base of bases) {
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
        bases,
        dict,
        groups,
        baseByCode: new Map(bases.map((b) => [b.code, b])),
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
