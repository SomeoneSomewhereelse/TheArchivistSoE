// The stat dictionary: what the stat engine (src/statEngine.js) needs from the game's tables, read once.
// Properties.txt turns an affix mod into stats, ItemStatCost.txt describes each stat, CharStats.txt
// names the class skill lines, Skills.txt and Skilldesc.txt name skills. Strings resolve through SoE's
// patchstring.tbl first, then the base game's strings (src/baseStrings.json). Pure, so it runs in Vite,
// Vitest and Node tools.
import {parseTxt} from "./dropCalcData.js";

const numbered = (prefix, n) => Array.from({length: n}, (_, i) => `${prefix}${i + 1}`);

// Per table, the columns read. A missing one fails the build.
export const STAT_TABLE_COLUMNS = {
    Properties: ["code", ...[1, 2, 3, 4, 5, 6, 7].flatMap((i) => [`set${i}`, `val${i}`, `func${i}`, `stat${i}`])],
    ItemStatCost: ["Stat", "ID", "op", "op param", "op base", "descpriority", "descfunc", "descval", "descstrpos",
        "descstrneg", "descstr2", "dgrp", "dgrpfunc", "dgrpval", "dgrpstrpos", "dgrpstrneg", "dgrpstr2"],
    CharStats: ["class", "StrAllSkills", ...numbered("StrSkillTab", 3), "StrClassOnly", "BlockFactor"],
    Skills: ["skill", "Id", "skilldesc", "reqlevel", "maxlvl"],
    Skilldesc: ["skilldesc", "str name"],
};

export const STAT_TABLES = Object.keys(STAT_TABLE_COLUMNS);

// The string keys the stat engine uses without any table naming them: the damage pairs, repair, charges
// and sockets. tools/extract-base-strings.mjs keeps them in src/baseStrings.json.
export const HARDCODED_STRINGS = [
    "strModMinDamageRange", "strModEnhancedDamage",
    "strModFireDamage", "strModFireDamageRange", "strModLightningDamage", "strModLightningDamageRange",
    "strModMagicDamage", "strModMagicDamageRange", "strModColdDamage", "strModColdDamageRange",
    "strModPoisonDamage", "strModPoisonDamageRange",
    "ModStre9t", "ModStre9u", "ModStre10b", "Socketable",
];

// The item tooltip's own labels (src/itemTooltip.js). "ItemStast1k" is the game's own spelling.
// tools/extract-base-strings.mjs keeps the base game's ones in src/baseStrings.json.
export const TOOLTIP_STRINGS = [
    "ItemStats1h", "ItemStats1r", "ItemStats1l", "ItemStats1m", "ItemStats1n", "ItemStast1k", "ItemStats1i",
    "ItemStats1d", "ItemStats1j", "ItemStats1f", "ItemStats1e", "ItemStats1p", "strEtherealDisplay",
    "strSocketedDisplay", "Charmdes",
];

// The stats the engine writes or reads by name rather than through a Properties.txt stat column: funcs 5-7
// have empty stat columns, describe reads the pairs and lengths, func 20 writes indestructible, and the
// tooltip reads sockets. trimStatData keeps them all. (Here, not in statEngine.js, which imports this file.)
export const ENGINE_STATS = [
    "mindamage", "maxdamage", "secondary_mindamage", "secondary_maxdamage", "item_throw_mindamage", "item_throw_maxdamage",
    "item_mindamage_percent", "item_maxdamage_percent", "firemindam", "firemaxdam", "lightmindam", "lightmaxdam",
    "magicmindam", "magicmaxdam", "coldmindam", "coldmaxdam", "coldlength", "poisonmindam", "poisonmaxdam", "poisonlength",
    "item_indesctructible", "item_numsockets",
];

const cell = (v) => (v ?? "").trim();
const int = (v, fallback = 0) => {
    const x = Number.parseInt(v, 10);
    return Number.isFinite(x) ? x : fallback;
};

function checkStatColumns(table, text) {
    if (typeof text !== "string") throw new Error(`${table}.txt: missing`);
    const first = text.replace(/\r\n/g, "\n").split("\n")[0] ?? "";
    const have = new Set(first.split("\t").map((h) => h.trim()));
    const missing = STAT_TABLE_COLUMNS[table].filter((c) => !have.has(c));
    if (missing.length) {
        throw new Error(`${table}.txt: missing required column(s) ${missing.map((c) => `"${c}"`).join(", ")}`);
    }
}

// The lookups both dictionary builders share: each dgrp group's members by stat id, and skill ids by
// lower-case name (the first skill with a name wins, as in the game's lookup).
function indexGroups(statList) {
    const groups = new Map();
    for (const s of statList) if (s.group) groups.set(s.group, [...(groups.get(s.group) ?? []), s.name]);
    const id = new Map(statList.map((s) => [s.name, s.id]));
    for (const members of groups.values()) members.sort((a, b) => id.get(a) - id.get(b));
    return groups;
}

function indexSkillNames(skillList) {
    const ids = new Map();
    for (const s of skillList) if (!ids.has(s.name.toLowerCase())) ids.set(s.name.toLowerCase(), s.id);
    return ids;
}

// inputs: {texts: {[table]: .txt content}, patchStrings: Map from parseTbl, baseStrings: {key: string}}.
export function buildStatData({texts, patchStrings, baseStrings}) {
    for (const table of STAT_TABLES) checkStatColumns(table, texts[table]);

    // An empty key is absent: the patch table maps "" to a skill description.
    const string = (key) => (key ? patchStrings.get(key) ?? baseStrings[key] ?? null : null);

    // Codes are matched case-insensitively, as the game does ("Deep-Wounds" is deep-wounds).
    const properties = new Map();
    for (const row of parseTxt(texts.Properties)) {
        const code = cell(row.code).toLowerCase();
        if (!code || properties.has(code)) continue;
        const slots = [1, 2, 3, 4, 5, 6, 7]
            .map((i) => ({func: int(row[`func${i}`]), stat: cell(row[`stat${i}`]), set: int(row[`set${i}`]), val: int(row[`val${i}`])}))
            .filter((s) => s.func > 0);
        properties.set(code, slots);
    }

    const stats = new Map();
    for (const row of parseTxt(texts.ItemStatCost)) {
        const name = cell(row.Stat);
        if (!name) continue;
        const stat = {
            name,
            id: int(row.ID),
            priority: int(row.descpriority),
            func: int(row.descfunc),
            val: int(row.descval),
            pos: cell(row.descstrpos),
            neg: cell(row.descstrneg),
            str2: cell(row.descstr2),
            group: int(row.dgrp),
            groupFunc: int(row.dgrpfunc),
            groupVal: int(row.dgrpval),
            groupPos: cell(row.dgrpstrpos),
            groupNeg: cell(row.dgrpstrneg),
            groupStr2: cell(row.dgrpstr2),
            op: int(row.op),
            // Per-level stats: the value counts in 1 / 2^perLevelShift per character level.
            perLevelShift: [2, 4, 5].includes(int(row.op)) && cell(row["op base"]) === "level" ? int(row["op param"]) : null,
        };
        stats.set(name, stat);
    }
    const groups = indexGroups([...stats.values()]);

    // Class ids count the CharStats rows that have a class string ("Expansion" has none).
    const classes = parseTxt(texts.CharStats)
        .filter((row) => cell(row.StrAllSkills))
        .map((row) => ({
            name: cell(row.class),
            allSkills: cell(row.StrAllSkills),
            tabs: numbered("StrSkillTab", 3).map((c) => cell(row[c])),
            classOnly: cell(row.StrClassOnly),
            blockFactor: int(row.BlockFactor),
        }));

    const nameKeys = new Map(parseTxt(texts.Skilldesc).map((row) => [cell(row.skilldesc), cell(row["str name"])]));
    const skills = new Map();
    for (const row of parseTxt(texts.Skills)) {
        const name = cell(row.skill);
        if (!name) continue;
        const id = int(row.Id);
        skills.set(id, {id, name, nameKey: nameKeys.get(cell(row.skilldesc)) ?? "", reqlevel: int(row.reqlevel), maxlvl: int(row.maxlvl)});
    }

    const skillIds = indexSkillNames([...skills.values()]);

    return {properties, stats, groups, classes, skills, skillIds, string};
}

// A mod's skill param: a Skills.txt Id, or a skill name (matched case-insensitively). Throws when
// neither matches: the game would drop the mod, so the data is wrong.
export function skillOf(dict, param) {
    const p = cell(String(param ?? ""));
    const id = /^\d+$/.test(p) ? Number(p) : dict.skillIds.get(p.toLowerCase());
    const skill = dict.skills.get(id);
    if (!skill) throw new Error(`skill "${p}" is not in Skills.txt`);
    return skill;
}

// The skill's display name, or null when Skilldesc.txt has no name for it (skill 358, a map proc).
export function skillName(dict, skill) {
    return dict.string(skill.nameKey);
}

// ---- The trimmed dictionary (ItemBuilder.json's statDict) -------------------------------------------

// What the Item Builder's engine needs, as plain JSON: the builder's property codes, the stats they write
// (with every member of each dgrp group they touch) plus ENGINE_STATS, the skills their params name, every
// CharStats class row, and the resolved strings of all of these plus HARDCODED_STRINGS and TOOLTIP_STRINGS.
// A trimmed string is final (patch, then expansion, then base already applied). mods: every builder affix's
// mods. Stats and skills keep their table order.
export function trimStatData(dict, mods) {
    const codes = new Set(mods.map((m) => String(m.code).toLowerCase()).filter((c) => dict.properties.has(c)));
    const stats = new Set(ENGINE_STATS);
    for (const code of codes) for (const slot of dict.properties.get(code)) if (slot.stat) stats.add(slot.stat);
    for (const name of [...stats]) {
        const s = dict.stats.get(name);
        if (!s) throw new Error(`trimStatData: stat "${name}" is not in ItemStatCost.txt`);
        if (s.group) for (const member of dict.groups.get(s.group)) stats.add(member);
    }
    const skillIds = new Set();
    for (const m of mods) {
        const slots = dict.properties.get(String(m.code).toLowerCase());
        if (slots?.some((s) => s.func === 11 || s.func === 19)) skillIds.add(skillOf(dict, m.param).id);
    }

    // The tooltip reads its labels by name, so the trimmed-dictionary line check can't see a missing one.
    const missingLabels = TOOLTIP_STRINGS.filter((key) => dict.string(key) === null);
    if (missingLabels.length) {
        throw new Error(`trimStatData: tooltip string(s) ${missingLabels.map((k) => `"${k}"`).join(", ")} in neither patchstring.tbl nor baseStrings.json`);
    }

    const statRows = [...dict.stats.values()].filter((s) => stats.has(s.name));
    const skillRows = [...dict.skills.values()].filter((s) => skillIds.has(s.id));
    const keys = new Set([...HARDCODED_STRINGS, ...TOOLTIP_STRINGS]);
    for (const s of statRows) for (const k of [s.pos, s.neg, s.str2, s.groupPos, s.groupNeg, s.groupStr2]) if (k) keys.add(k);
    for (const c of dict.classes) for (const k of [c.allSkills, ...c.tabs, c.classOnly]) if (k) keys.add(k);
    for (const s of skillRows) if (s.nameKey) keys.add(s.nameKey);
    const strings = {};
    for (const key of [...keys].sort()) {
        const value = dict.string(key);
        if (value !== null) strings[key] = value;
    }

    return {
        properties: [...codes].sort().map((code) => [code, dict.properties.get(code)]),
        stats: statRows,
        classes: dict.classes,
        skills: skillRows,
        strings,
    };
}

// trimStatData's JSON -> a dictionary like buildStatData's, in the browser.
export function statDataFromJson(json) {
    const ok = json && Array.isArray(json.properties) && Array.isArray(json.stats) && Array.isArray(json.classes)
        && Array.isArray(json.skills) && json.strings && typeof json.strings === "object";
    if (!ok) throw new Error("statDict: malformed (expected properties, stats, classes, skills and strings)");
    const strings = new Map(Object.entries(json.strings));
    return {
        properties: new Map(json.properties),
        stats: new Map(json.stats.map((s) => [s.name, s])),
        groups: indexGroups(json.stats),
        classes: json.classes,
        skills: new Map(json.skills.map((s) => [s.id, s])),
        skillIds: indexSkillNames(json.skills),
        string: (key) => (key ? strings.get(key) ?? null : null),
    };
}
