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
    CharStats: ["class", "StrAllSkills", ...numbered("StrSkillTab", 3), "StrClassOnly"],
    Skills: ["skill", "Id", "skilldesc", "reqlevel", "maxlvl"],
    Skilldesc: ["skilldesc", "str name"],
};

export const STAT_TABLES = Object.keys(STAT_TABLE_COLUMNS);

// The string keys the stat engine uses without any table naming them: the damage pairs, repair, charges
// and sockets. tools/extract-base-strings.mjs keeps them in src/baseStrings.json.
export const HARDCODED_STRINGS = [
    "strModMinDamage", "strModMinDamageRange", "strModEnhancedDamage",
    "strModFireDamage", "strModFireDamageRange", "strModLightningDamage", "strModLightningDamageRange",
    "strModMagicDamage", "strModMagicDamageRange", "strModColdDamage", "strModColdDamageRange",
    "strModPoisonDamage", "strModPoisonDamageRange",
    "ModStre9t", "ModStre9u", "ModStre10b", "Socketable",
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
    const groups = new Map();
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
        if (stat.group) groups.set(stat.group, [...(groups.get(stat.group) ?? []), name]);
    }
    for (const members of groups.values()) members.sort((a, b) => stats.get(a).id - stats.get(b).id);

    // Class ids count the CharStats rows that have a class string ("Expansion" has none).
    const classes = parseTxt(texts.CharStats)
        .filter((row) => cell(row.StrAllSkills))
        .map((row) => ({
            name: cell(row.class),
            allSkills: cell(row.StrAllSkills),
            tabs: numbered("StrSkillTab", 3).map((c) => cell(row[c])),
            classOnly: cell(row.StrClassOnly),
        }));

    const nameKeys = new Map(parseTxt(texts.Skilldesc).map((row) => [cell(row.skilldesc), cell(row["str name"])]));
    const skills = new Map();
    const skillIds = new Map();
    for (const row of parseTxt(texts.Skills)) {
        const name = cell(row.skill);
        if (!name) continue;
        const id = int(row.Id);
        skills.set(id, {id, name, nameKey: nameKeys.get(cell(row.skilldesc)) ?? "", reqlevel: int(row.reqlevel), maxlvl: int(row.maxlvl)});
        if (!skillIds.has(name.toLowerCase())) skillIds.set(name.toLowerCase(), id);
    }

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
