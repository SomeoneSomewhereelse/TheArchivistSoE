// The stat engine: affix mods -> stats -> the lines the game prints, from the stat dictionary
// (src/statData.js). Expansion follows Properties.txt the way D2MOO's ITEMMODS_PropertyFunc* do;
// description follows the game's tooltip writer (ItemStatCost.txt descfuncs, the hardcoded damage pairs,
// dgrp groups). Values are ranges {min, max}: one affix row describes every roll at once.
// Pure, so it runs in Vite, Vitest and the browser.
import {skillOf} from "./statData.js";

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

// mods: [{code, param, min, max}] (min and max may be null). ctx.ilvl: {min, max}, the item levels to
// describe; values that depend on it (charges, proc levels) become ranges over it. Returns the entries
// and the codes Properties.txt doesn't define, which give no stats (as in the game). Throws on a
// property func the engine doesn't implement, a stat missing from ItemStatCost.txt or an unknown skill.
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
                    push("mindamage", 0, value);
                    break;
                case 6:
                    value = reuse;
                    push("maxdamage", 0, value);
                    break;
                case 7:
                    value = reuse;
                    push("item_mindamage_percent", 0, value);
                    push("item_maxdamage_percent", 0, value);
                    break;
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
                    // Sockets: the roll, or the param when there is none (the per-base cap is the summing spec's).
                    const n = reuse.min > 0 ? reuse : fixed(param);
                    value = {min: Math.max(1, n.min), max: Math.max(1, n.max)};
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
