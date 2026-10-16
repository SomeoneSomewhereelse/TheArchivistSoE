// The stat engine: affix mods -> stats -> the lines the game prints, from the stat dictionary
// (src/statData.js). Expansion follows Properties.txt the way D2MOO's ITEMMODS_PropertyFunc* do;
// description follows the game's tooltip writer (ItemStatCost.txt descfuncs, the hardcoded damage pairs,
// dgrp groups). Values are ranges {min, max}: one affix row describes every roll at once.
// Pure, so it runs in Vite, Vitest and the browser.
import {HARDCODED_STRINGS, skillName, skillOf} from "./statData.js";

// ---- Expansion: mods -> entries {stat, layer, min, max, skill?, level?} ----------------------------

const span = (a, b) => (a <= b ? {min: a, max: b} : {min: b, max: a});
const fixed = (v) => ({min: v, max: v});
const isZero = (r) => r.min === 0 && r.max === 0;
const int = (v) => {
    const x = Number.parseInt(v, 10);
    return Number.isFinite(x) ? x : 0;
};

// D2MOO ITEMMODS_PropertyFunc11/19: the level of a charged or proc skill at item level `ilvl`. max > 0
// is the level itself; max < 0 spreads the levels from the skill's reqlevel to 99; max 0 adds one level
// per 4 item levels, up to the skill's maxlvl (20 when unset).
export function skillLevelAt(skill, max, ilvl) {
    if (max > 0) return max;
    if (max < 0) {
        const divisor = Math.max(1, Math.trunc(Math.max(1, 99 - skill.reqlevel) / -max));
        return Math.max(1, Math.trunc((ilvl - skill.reqlevel) / divisor));
    }
    const cap = skill.maxlvl > 0 ? skill.maxlvl : 20;
    return Math.min(cap, Math.max(1, Math.trunc((ilvl - skill.reqlevel) / 4) + 1));
}

// D2MOO ITEMMODS_PropertyFunc19: a charged skill's maximum charges at skill level `level`. min > 0 is the
// count itself; min < 0 gives level * -min / 8 - min; 0 gives 5. Clamped to 1-255.
export function chargesAt(min, level) {
    if (min === 0) return 5;
    const n = min < 0 ? Math.trunc(level * -min / 8) - min : min;
    return Math.min(255, Math.max(1, n));
}

// The damage stats funcs 5 and 6 write (D2MOO ITEMMODS_PropertyFunc05/06): with no base (the Affixes tab)
// the one-handed pair; on a weapon, the one-handed pair if it has one-handed damage or no two-handed damage,
// the two-handed pair if it has two-handed damage or no one-handed damage, and the throw pair if its type is
// throwable; on any other base, all three.
const DAMAGE_STATS = {
    min: ["mindamage", "secondary_mindamage", "item_throw_mindamage"],
    max: ["maxdamage", "secondary_maxdamage", "item_throw_maxdamage"],
};
function damageStats(base, end) {
    const [one, two, thrown] = DAMAGE_STATS[end];
    if (!base) return [one];
    if (!base.isWeapon) return [one, two, thrown];
    return [
        ...(base.dmg1 || !base.dmg2 ? [one] : []),
        ...(base.dmg2 || !base.dmg1 ? [two] : []),
        ...(base.throwable ? [thrown] : []),
    ];
}

// D2MOO ITEMMODS_PropertyFunc07: on a weapon, a roll r with trunc(txtMaxDamage * r / 100) <= 0 adds +1
// maximum damage (func 6's path) instead of Enhanced Damage. txtMaxDamage is the base's larger txt maximum,
// before ethereal. Whether a roll falls back is monotone in r, so a range splits in two at most. Returns the
// ED range that stays ED (or null), whether some roll adds +1 instead, and whether both happen ("mixed":
// then both parts are byRoll).
function edFallback(base, roll) {
    if (!base?.isWeapon) return {ed: roll, plusMax: false, mixed: false};
    const falls = (r) => Math.trunc((base.txtMaxDamage * r) / 100) <= 0;
    if (!falls(roll.min)) return {ed: roll, plusMax: false, mixed: false};
    if (falls(roll.max)) return {ed: null, plusMax: true, mixed: false};
    let first = roll.min;
    while (falls(first)) first++;
    return {ed: {min: first, max: roll.max}, plusMax: true, mixed: true};
}

// D2MOO ITEMS_GetMaxSockets: a base's socket cap at item level ilvl, the smallest of its inventory cells,
// its gem sockets and its type's MaxSock for the ilvl band (1-25, 26-40, 41+).
export function socketCap(base, ilvl) {
    const band = ilvl <= 25 ? 0 : ilvl <= 40 ? 1 : 2;
    return Math.min(base.cells, base.gemsockets, base.maxSock[band]);
}

// mods: [{code, param, min, max}] (min and max may be null). ctx.ilvl: {min, max}, the item levels to
// describe; values that depend on it (charges, proc levels, the socket band) become ranges over it. ctx.base:
// the item's engine base (src/itemTooltip.js engineBase: {isWeapon, dmg1, dmg2, dmgThrow, throwable,
// txtMaxDamage, cells, gemsockets, maxSock}), or null on the Affixes tab, whose output it never changes.
// Returns the entries and the codes Properties.txt doesn't define, which give no stats (as in the game).
// Throws on a property func the engine doesn't implement, a stat missing from ItemStatCost.txt or an
// unknown skill.
export function expandMods(mods, dict, ctx = {}) {
    const entries = [];
    const unknown = [];

    const push = (stat, layer, value, extra = {}) => {
        if (!dict.stats.has(stat)) throw new Error(`stat "${stat}" is not in ItemStatCost.txt`);
        if (!isZero(value)) entries.push({stat, layer, ...value, ...extra});
    };
    const levels = () => {
        if (!ctx.ilvl) throw new Error("this mod depends on the item level, but no ilvl was given");
        return [ctx.ilvl.min, ctx.ilvl.max];
    };

    for (const mod of mods) {
        const slots = dict.properties.get(String(mod.code).toLowerCase());
        if (!slots) {
            unknown.push(mod.code);
            continue;
        }
        const rolled = span(mod.min ?? 0, mod.max ?? 0);
        const param = int(mod.param);
        let first = null; // the first slot's value: the game passes it to every later slot (funcs 3, 5-8, 10, 14 reuse it)

        for (const [i, slot] of slots.entries()) {
            const reuse = first && !isZero(first) ? first : rolled;
            let value;
            switch (slot.func) {
                case 1:
                case 2:
                    value = rolled;
                    push(slot.stat, 0, value);
                    break;
                case 3:
                case 8:
                    value = reuse;
                    push(slot.stat, 0, value);
                    break;
                case 5:
                    value = reuse;
                    for (const stat of damageStats(ctx.base, "min")) push(stat, 0, value);
                    break;
                case 6:
                    value = reuse;
                    for (const stat of damageStats(ctx.base, "max")) push(stat, 0, value);
                    break;
                case 7: {
                    value = reuse;
                    const {ed, plusMax, mixed} = edFallback(ctx.base, value);
                    const tag = mixed ? {byRoll: true} : {};
                    if (ed) for (const stat of ["item_mindamage_percent", "item_maxdamage_percent"]) push(stat, 0, ed, tag);
                    if (plusMax) for (const stat of damageStats(ctx.base, "max")) push(stat, 0, fixed(1), tag);
                    break;
                }
                case 10:
                    // A skill tab: param = class * 3 + tab, stored as class * 8 + tab.
                    value = reuse;
                    push(slot.stat, (param % 3) + 8 * Math.trunc(param / 3), value);
                    break;
                case 11: {
                    // Chance to cast: chance = min (5 when unset), level = max, skill = param.
                    const skill = skillOf(dict, mod.param);
                    const max = mod.max ?? 0;
                    const level = max > 0 ? fixed(max) : span(...levels().map((ilvl) => skillLevelAt(skill, max, ilvl)));
                    value = fixed((mod.min ?? 0) > 0 ? mod.min : 5);
                    push(slot.stat, (skill.id << 6) + (level.min & 63), value, {skill: skill.id, level});
                    break;
                }
                case 14: {
                    // Sockets: the roll, or the param when there is none; with a base, clamped to its cap at the
                    // item level (a cap of 0 drops the entry). Sockets SET, not add; every socket row is in group
                    // 122, so two never meet and summing stays safe.
                    const n = reuse.min > 0 ? reuse : fixed(param);
                    value = {min: Math.max(1, n.min), max: Math.max(1, n.max)};
                    if (ctx.base) {
                        const [lo, hi] = levels();
                        value = {min: Math.min(value.min, socketCap(ctx.base, lo)), max: Math.min(value.max, socketCap(ctx.base, hi))};
                    }
                    push(slot.stat, 0, value);
                    break;
                }
                case 15:
                    value = fixed(mod.min ?? 0);
                    push(slot.stat, 0, value);
                    break;
                case 16:
                    value = fixed(mod.max ?? 0);
                    push(slot.stat, 0, value);
                    break;
                case 17:
                    value = param ? fixed(param) : rolled;
                    push(slot.stat, 0, value);
                    break;
                case 19: {
                    // Charges: the skill level and the charges both follow the item level.
                    const skill = skillOf(dict, mod.param);
                    const lv = levels().map((ilvl) => skillLevelAt(skill, mod.max ?? 0, ilvl));
                    value = span(...lv.map((l) => chargesAt(mod.min ?? 0, l)));
                    push(slot.stat, skill.id << 6, value, {skill: skill.id, level: span(...lv)});
                    break;
                }
                case 20:
                    value = fixed(1);
                    push("item_indesctructible", 0, value);
                    break;
                case 21:
                    value = rolled;
                    push(slot.stat, slot.val, value);
                    break;
                default:
                    throw new Error(`property "${mod.code}" uses func ${slot.func}, which the stat engine doesn't implement`);
            }
            if (i === 0) first = value;
        }
    }
    return {entries, unknown};
}

// The descfuncs and dgrpfuncs the engine implements. Anything else in the data fails the build (checkEntries).
export const DESC_FUNCS = [1, 2, 3, 4, 6, 7, 8, 9, 11, 13, 14, 15, 19, 20, 24];
export const GROUP_FUNCS = [1, 2, 3, 4, 6, 7, 8, 9, 19, 20];

// ---- Text helpers ------------------------------------------------------------------------------------

// A range as text. plus: "signed" puts "+" before a positive value, "zero" before zero too. bracket:
// wrap a real range in [ ] (for lines that print several values). label: "#" instead of the value.
// A negative range prints the smaller magnitude first: "-2 to -4".
export function rangeText(r, {plus = "", bracket = false, label = false} = {}) {
    const sign = (v) => ((plus === "zero" && v >= 0) || (plus === "signed" && v > 0) ? "+" : "");
    if (label) return `${r.max < 0 ? "-" : sign(r.max)}#`;
    if (r.min === r.max) return `${sign(r.min)}${r.min}`;
    const text = r.max <= 0 ? `${r.max} to ${r.min}` : r.min < 0 ? `${r.min} to ${r.max}` : `${sign(r.max)}${r.min}-${r.max}`;
    return bracket ? `[${text}]` : text;
}

const negate = (r) => ({min: -r.max, max: -r.min});

// printf for the game's strings: %d %i %u %s and %+d take the next argument (already text); %% is "%".
export function fill(format, args) {
    let i = 0;
    return format.replace(/%\+?([dius%])/g, (m, kind) => (kind === "%" ? "%" : String(args[i++] ?? "")));
}

// A finished line's display pieces, top first: colour codes (ÿc plus one character) stripped, and a
// string with "\n" stacked bottom-up as the game draws it (the last piece is the top line).
export function displayPieces(text) {
    return text.replace(/ÿc./g, "").split("\n").filter((p) => p.trim() !== "").reverse();
}

function requireString(dict, key, why) {
    const s = dict.string(key);
    if (s === null) throw new Error(`string "${key}" (${why}) is in neither patchstring.tbl nor baseStrings.json`);
    return s;
}

function skillText(dict, e) {
    const skill = dict.skills.get(e.skill);
    const name = skillName(dict, skill);
    if (name === null) throw new Error(`skill ${skill.id} ("${skill.name}") has no name string`);
    return name;
}

// A filter key per line source: a stat, a stat per layer, or a stat per skill (its layer also holds the
// skill level, which would split one skill into one key per level).
export function entryKey(e) {
    if (e.skill !== undefined) return `${e.stat}:${e.skill}`;
    return e.layer ? `${e.stat}/${e.layer}` : e.stat;
}

// A group's name for the Stat filter's "via" tag, from its own string: "All Resistances", "all Attributes".
export function groupName(dict, primary) {
    const text = displayPieces(requireString(dict, primary.groupStr2 || primary.groupPos, `dgrp ${primary.group}`)).join(" ");
    return text.replace(/%\+?[dius]/g, "").replace(/(^|\s)[+-](?=\s|$)/g, " ").replace(/\s+/g, " ").trim()
        .replace(/^to /i, "").replace(/:$/, "");
}

// ---- Description: one stat line ----------------------------------------------------------------------

// The text of one stat line, or of a dgrp line when `d` holds the group's func, val and strings. label:
// "#" for each value. Returns "" when the game prints nothing (func 1 with descval 0).
function formatStat(d, e, dict, label) {
    const v = (r, plus = "", bracket = false) => rangeText(r, {plus, bracket, label});
    const str = (key) => requireString(dict, key, `stat ${e.stat}`);
    const text = d.func === 0 ? "" : str(e.min < 0 && d.neg ? d.neg : d.pos);
    // descval 1: the value first; 2: the value last; 0: no value (funcs 1 and 6 then print nothing).
    const place = (num, emptyWithoutValue = false) =>
        (d.val === 1 ? `${num} ${text}` : d.val === 2 ? `${text} ${num}` : emptyWithoutValue ? "" : text);
    const str2 = (s) => (d.func >= 6 && d.func <= 9 && d.str2 ? `${s} ${str(d.str2)}` : s);

    // Per-level stats: the value at character level L is v * L / 2^shift; the line shows L = 1-99, then the rate.
    let value = e;
    let perLevel = "";
    if (d.perLevelShift !== null && d.perLevelShift !== undefined) {
        const unit = 2 ** d.perLevelShift;
        value = span(Math.floor(e.min / unit), Math.floor(e.max * 99 / unit)); // a negative rate prints "-1 to -99"
        perLevel = `, ${label ? "#" : rangeText({min: e.min / unit, max: e.max / unit})} per level`;
    }

    switch (d.func) {
        case 1:
        case 6:
            return str2(place(v(value, "signed"), true)) + perLevel;
        case 2:
        case 7:
            return str2(place(`${v(value)}%`)) + perLevel;
        case 3:
        case 9:
            return str2(place(v(value))) + perLevel;
        case 4:
        case 8:
            return str2(place(`${v(value, "zero")}%`)) + perLevel;
        case 20:
            return place(`${v(negate(value), "zero")}%`) + perLevel;
        case 19:
            return fill(text, [v(value)]);
        case 11: {
            // Repair: 1 durability every (2500 / v + 12) / 25 seconds, or "per second" at 30 frames or less.
            // The label takes the same form as the value.
            const frames = e.max > 0 ? Math.trunc(2500 / e.max) : 0;
            if (e.max > 0 && frames > 30) {
                return fill(str("ModStre9u"), label ? ["#", "#"] : ["1", String(Math.trunc((frames + 12) / 25))]);
            }
            return fill(str("ModStre9t"), [label ? "#" : e.max > 0 ? "1" : "25"]);
        }
        case 13:
            return `${v(value, "signed")} ${str(dict.classes[e.layer].allSkills)}`;
        case 14: {
            const cls = dict.classes[e.layer >> 3];
            return `${fill(str(cls.tabs[e.layer & 7]), [v(value)])} ${str(cls.classOnly)}`;
        }
        case 15:
            return fill(str(d.pos), [v(value, "", true), v(e.level, "", true), skillText(dict, e)]);
        case 24:
            return `${str("ModStre10b")} ${v(e.level, "", true)} ${skillText(dict, e)} ${fill(str(d.pos), [v(value, "", true), v(value, "", true)])}`;
        default:
            throw new Error(`stat ${e.stat} uses descfunc ${d.func}, which the stat engine doesn't implement`);
    }
}

// ---- Description: entries -> lines ------------------------------------------------------------------

const ELEMENT_PAIRS = [
    {key: "firedamage", min: "firemindam", max: "firemaxdam", single: "strModFireDamage", range: "strModFireDamageRange"},
    {key: "lightdamage", min: "lightmindam", max: "lightmaxdam", single: "strModLightningDamage", range: "strModLightningDamageRange"},
    {key: "magicdamage", min: "magicmindam", max: "magicmaxdam", single: "strModMagicDamage", range: "strModMagicDamageRange"},
    {key: "colddamage", min: "coldmindam", max: "coldmaxdam", single: "strModColdDamage", range: "strModColdDamageRange"},
    {key: "poisondamage", min: "poisonmindam", max: "poisonmaxdam", length: "poisonlength", single: "strModPoisonDamage", range: "strModPoisonDamageRange"},
];

// An entry's sources as one comparable key; entries with no src (the Affixes tab) share one source.
const srcKey = (e) => (e.src ? [...e.src].sort().join(",") : "");

// Sums entries per (stat, layer), the game's way: min to min and max to max, sources united. byRoll entries
// (from an Enhanced Damage mod some of whose rolls give +1 maximum damage instead, func 7) sum apart from
// plain ones and never add across mods: their range runs from the smallest single value to the sum of every
// maximum, which holds every real outcome.
export function sumEntries(entries) {
    const out = new Map();
    for (const e of entries) {
        const id = `${e.stat}/${e.layer}${e.byRoll ? "/byRoll" : ""}`;
        const seen = out.get(id);
        if (!seen) {
            out.set(id, {...e});
            continue;
        }
        const merged = {...seen, min: e.byRoll ? Math.min(seen.min, e.min) : seen.min + e.min, max: seen.max + e.max};
        if (seen.src || e.src) merged.src = new Set([...(seen.src ?? []), ...(e.src ?? [])]);
        out.set(id, merged);
    }
    return [...out.values()];
}

// entries -> lines [{pieces, label, key, priority, order, stats, value, via?, byRoll?}], in the game's order:
// descpriority, highest first (ties by stat id). pieces: the display lines, top first; label: the line
// with "#" for each value; key: the Stat filter key; stats: the stats the line prints (a group line's
// members); value: its first value's range; via: a group line's name; byRoll: the line depends on the roll
// (sumEntries). byRoll entries are described on their own, after the plain lines of the same priority.
export function describe(entries, dict) {
    const summed = sumEntries(entries);
    const lines = [
        ...describeSummed(summed.filter((e) => !e.byRoll), dict),
        ...describeSummed(summed.filter((e) => e.byRoll), dict).map((line) => ({...line, byRoll: true})),
    ];
    return lines.sort((a, b) => b.priority - a.priority || a.order - b.order);
}

// The base lines' totals (src/baseLines.js): every mod collapsed to its lowest roll, then to its highest,
// expanded and summed per stat (layer 0): two exact totals, with the func-7 fallback resolved at each end.
// Only mods whose funcs take the roll (1-3, 5-8) count; the others (charges, procs, sockets) never feed a
// base line, and the base lines read only their own stats, never the per-level ones. Every term is monotone in its roll, so the two ends bound every roll,
// with one theoretical exception: on a 1-or-2-handed base whose smaller pair is below txtMaxDamage, the
// first ED roll past the fallback can add 0 where the fallback added 1. No pair that can roll in SoE hits
// it (src/itemTooltip.test.js pins the current data).
const ROLL_FUNCS = new Set([1, 2, 3, 5, 6, 7, 8]);
export function sumEnds(mods, dict, ctx) {
    const rolled = mods.filter((m) => dict.properties.get(String(m.code).toLowerCase())?.every((s) => ROLL_FUNCS.has(s.func)));
    const at = (end) => {
        const collapsed = rolled.map((m) => {
            const r = span(m.min ?? 0, m.max ?? 0);
            const v = end === "low" ? r.min : r.max;
            return {...m, min: v, max: v};
        });
        const totals = new Map();
        for (const e of expandMods(collapsed, dict, ctx).entries) {
            if (e.layer === 0) totals.set(e.stat, (totals.get(e.stat) ?? 0) + e.min);
        }
        return totals;
    };
    return {low: at("low"), high: at("high")};
}

// Summed entries (each (stat, layer) at most once) -> lines, unsorted.
function describeSummed(summed, dict) {
    const live = new Map();
    for (const e of summed) if (!isZero(e)) live.set(`${e.stat}/${e.layer}`, e);

    const stat = (name) => dict.stats.get(name);
    const at0 = (name) => live.get(`${name}/0`);
    const take = (...names) => names.forEach((n) => live.delete(`${n}/0`));
    const lines = [];
    const add = ({text, labelText, ...line}) => {
        const pieces = displayPieces(text);
        if (pieces.length) lines.push({...line, pieces, label: displayPieces(labelText).join(" ")});
    };

    // A 1-or-2-handed weapon carries both pairs from the same mods; the game prints the one-handed one.
    // This runs before the pairs are taken.
    for (const [one, two] of [["mindamage", "secondary_mindamage"], ["maxdamage", "secondary_maxdamage"]]) {
        if (at0(one) && at0(two)) take(two);
    }

    // 1. The damage pairs, printed as one line when both halves are present. Single value when min >= max
    // (the game prints the max), else "Adds a-b". Poison converts frames: (v * frames + 128) >> 8 over
    // frames / 25 seconds, every source summed (in-game: Septic + of Blight print 27 over 5 seconds).
    // Overlapping ranges (Snowflake p614/p618/p622, of Frost s176) take the single form only when every roll
    // gives min >= max: an approximation, since some rolls of the range form would print the single form.
    for (const p of ELEMENT_PAIRS) {
        const lo = at0(p.min);
        const hi = at0(p.max);
        if (!lo || !hi) continue;
        const frames = p.length ? at0(p.length)?.max ?? 0 : 0;
        const conv = (r) => (p.length ? {min: (r.min * frames + 128) >> 8, max: (r.max * frames + 128) >> 8} : {min: r.min, max: r.max});
        const a = conv(lo);
        const b = conv(hi);
        const single = a.min >= b.max;
        const fmt = requireString(dict, single ? p.single : p.range, "damage pair");
        const seconds = p.length ? [String(Math.trunc(frames / 25))] : [];
        const values = (label) => (single ? [rangeText(b, {bracket: !!p.length, label})]
            : [rangeText(a, {bracket: true, label}), rangeText(b, {bracket: true, label})]);
        add({text: fill(fmt, [...values(false), ...seconds]), labelText: fill(fmt, [...values(true), ...seconds.map(() => "#")]),
            key: p.key, priority: stat(p.min).priority, order: stat(p.min).id, stats: [p.min, p.max], value: single ? b : a});
        take(p.min, p.max);
    }
    take("coldlength", "poisonlength");

    // Physical damage: "Adds a-b damage" only when min is below max, for the one-handed pair and for the
    // two-handed one (V1: a Giant Axe with +5 min and +10 max prints "Adds 5-10 damage", as a Hand Axe does);
    // otherwise each prints its own line.
    for (const [min, max] of [["mindamage", "maxdamage"], ["secondary_mindamage", "secondary_maxdamage"]]) {
        const lo = at0(min);
        const hi = at0(max);
        if (!lo || !hi || lo.max >= hi.min) continue;
        const fmt = requireString(dict, "strModMinDamageRange", "damage pair");
        add({text: fill(fmt, [rangeText(lo, {bracket: true}), rangeText(hi, {bracket: true})]), labelText: fill(fmt, ["#", "#"]),
            key: "damage", priority: stat(min).priority, order: stat(min).id, stats: [min, max], value: lo});
        take(min, max);
    }

    // Enhanced damage: min% and max% print "+X% Enhanced Damage" together only when they are equal;
    // otherwise each prints its own line.
    const ed = at0("item_mindamage_percent");
    const edMax = at0("item_maxdamage_percent");
    if (ed && edMax && ed.min === edMax.min && ed.max === edMax.max) {
        const name = requireString(dict, "strModEnhancedDamage", "damage pair");
        add({text: `${rangeText(ed, {plus: "signed"})}% ${name}`, labelText: `${rangeText(ed, {plus: "signed", label: true})}% ${name}`,
            key: "enhanceddamage", priority: stat("item_mindamage_percent").priority, order: stat("item_mindamage_percent").id,
            stats: ["item_mindamage_percent", "item_maxdamage_percent"], value: ed});
        take("item_mindamage_percent", "item_maxdamage_percent");
    }

    // 2. dgrp groups: one line when every member is present with the same value and the same sources (four
    // resistances from four affixes roll independently, so they never fold). The member with the lowest
    // stat id prints it, at its own priority, as the game's emission loop does.
    for (const [group, members] of dict.groups) {
        const values = members.map(at0);
        if (values.some((e) => !e || e.min !== values[0].min || e.max !== values[0].max || srcKey(e) !== srcKey(values[0]))) continue;
        const primary = stat(members[0]);
        const d = {func: primary.groupFunc, val: primary.groupVal, pos: primary.groupPos, neg: primary.groupNeg,
            str2: primary.groupStr2, perLevelShift: null};
        add({text: formatStat(d, values[0], dict, false), labelText: formatStat(d, values[0], dict, true), key: `dgrp${group}`,
            priority: primary.priority, order: primary.id, stats: [...members], value: values[0], via: groupName(dict, primary)});
        take(...members);
    }

    // 3. Everything else, by its own descfunc. Sockets print below every modifier.
    const rest = [...live.values()].sort((a, b) => stat(a.stat).id - stat(b.stat).id || a.layer - b.layer);
    for (const e of rest) {
        const d = stat(e.stat);
        if (e.stat === "item_numsockets") {
            const word = requireString(dict, "Socketable", "sockets");
            add({text: `${word} (${rangeText(e)})`, labelText: `${word} (#)`, key: e.stat, priority: -Infinity, order: d.id, stats: [e.stat], value: e});
        } else if (d.func) {
            add({text: formatStat(d, e, dict, false), labelText: formatStat(d, e, dict, true), key: entryKey(e),
                priority: d.priority, order: d.id, stats: [e.stat], value: d.func === 24 ? e.level : e});
        }
    }

    return lines;
}

// ---- Loud checks ----------------------------------------------------------------------------------------

// Run once over every entry the data produces: each stat's descfunc and dgrpfunc is implemented, every
// string it or its group needs resolves (and the engine's hardcoded ones), each class skill line has its
// CharStats strings, and each skill a line names has a name. Throws one error listing every problem.
export function checkEntries(entries, dict) {
    const problems = new Set();
    const need = (key, why) => {
        if (key && dict.string(key) === null) problems.add(`string "${key}" (${why}) is in neither patchstring.tbl nor baseStrings.json`);
    };
    for (const key of HARDCODED_STRINGS) need(key, "used by the stat engine");

    for (const e of entries) {
        const d = dict.stats.get(e.stat);
        const why = `stat ${e.stat}`;
        if (d.func && !DESC_FUNCS.includes(d.func)) problems.add(`${why} uses descfunc ${d.func}, which the stat engine doesn't implement`);
        if (d.op >= 2 && d.op <= 5 && d.perLevelShift === null) problems.add(`${why} scales by a stat other than the character level (op ${d.op}), which the stat engine doesn't implement`);
        if ([1, 2, 3, 4, 6, 7, 8, 9, 15, 19, 20, 24].includes(d.func)) {
            need(d.pos, why);
            need(d.neg, why);
        }
        if (d.func >= 6 && d.func <= 9) need(d.str2, why);
        if (d.func === 13) {
            const cls = dict.classes[e.layer];
            if (cls) need(cls.allSkills, why);
            else problems.add(`${why}: CharStats.txt has no class ${e.layer}`);
        }
        if (d.func === 14) {
            const cls = dict.classes[e.layer >> 3];
            if (cls && (e.layer & 7) <= 2) {
                need(cls.tabs[e.layer & 7], why);
                need(cls.classOnly, why);
            } else problems.add(`${why}: CharStats.txt has no skill tab for layer ${e.layer}`);
        }
        if ((d.func === 15 || d.func === 24) && e.skill !== undefined) {
            const skill = dict.skills.get(e.skill);
            if (skillName(dict, skill) === null) problems.add(`skill ${skill.id} ("${skill.name}") has no name string (${why})`);
        }
        if (d.group) {
            if (!GROUP_FUNCS.includes(d.groupFunc)) problems.add(`${why}: dgrp ${d.group} uses dgrpfunc ${d.groupFunc}, which the stat engine doesn't implement`);
            for (const key of [d.groupPos, d.groupNeg, d.groupStr2]) need(key, `dgrp ${d.group}`);
        }
    }
    if (problems.size) throw new Error([...problems].join("\n"));
}
