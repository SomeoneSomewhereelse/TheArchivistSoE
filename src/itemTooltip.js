// The Item Builder's item tooltip (spec "Name and modifier lines"): the engine runs here, in the browser, at
// the builder's exact item level, over a trimmed dictionary shipped in ItemBuilder.json. This part holds the
// engine's inputs (engineBase, expandPicks) and the build-time check of the trimmed dictionary. Pure.
import {baseChain} from "./itemBuilderRules.js";
import {describe, expandMods} from "./statEngine.js";

// The engine's view of a base (statEngine.js expandMods ctx.base), built once per base object.
const engineBases = new WeakMap();
export function engineBase(model, base) {
    let out = engineBases.get(base);
    if (!out) {
        const type = model.types[base.types[0]]; // the game reads these from the item's own type record
        out = {
            isWeapon: baseChain(model, base).has("weap"),
            dmg1: base.dmg1,
            dmg2: base.dmg2,
            dmgThrow: base.dmgThrow,
            throwable: type.throwable,
            txtMaxDamage: Math.max(base.dmg1?.[1] ?? 0, base.dmg2?.[1] ?? 0),
            cells: base.invwidth * base.invheight,
            gemsockets: base.gemsockets,
            maxSock: type.maxSock,
        };
        engineBases.set(base, out);
    }
    return out;
}

// The picks' mods, expanded one mod at a time, each entry tagged with its source ("pick:mod") so that
// sumEntries and dgrp folding can tell independent rolls apart.
export function expandPicks(picks, dict, ctx) {
    return picks.flatMap((affix, i) => affix.mods.flatMap((mod, j) =>
        expandMods([mod], dict, ctx).entries.map((e) => ({...e, src: new Set([`${i}:${j}`])}))));
}

// The base kinds funcs 5-7 tell apart; the loud check describes every affix on one base of each.
const BASE_KINDS = {
    "one-handed": (b) => b.isWeapon && b.dmg1 && !b.dmg2 && !b.throwable,
    "two-handed": (b) => b.isWeapon && b.dmg2 && !b.dmg1,
    "one-or-two-handed": (b) => b.isWeapon && b.dmg1 && b.dmg2,
    throwable: (b) => b.isWeapon && b.throwable,
    "non-weapon": (b) => !b.isWeapon,
};

// Build time (the affix-data plugin): every affix, at ilvl 1 and 99, with no base and on the first base of
// each kind, must give the same lines with the trimmed dictionary as with the full one. Throws naming the
// first affix that doesn't. bases: buildBases' full objects (not the file's compacted ones).
export function checkTrimmedStatData({full, trimmed, affixes, types, bases}) {
    const model = {types};
    const contexts = [["no base", null]];
    for (const [kind, test] of Object.entries(BASE_KINDS)) {
        const found = bases.map((b) => engineBase(model, b)).find(test);
        if (!found) throw new Error(`no ${kind} base to check the trimmed stat dictionary with`);
        contexts.push([kind, found]);
    }
    const lines = (dict, affix, ctx) => describe(expandMods(affix.mods, dict, ctx).entries, dict)
        .map((l) => `${l.pieces.join(" | ")} [${l.label}] ${l.key}${l.byRoll ? " (by roll)" : ""}`).join("\n");
    for (const [kind, base] of contexts) {
        for (const ilvl of [1, 99]) {
            const ctx = {ilvl: {min: ilvl, max: ilvl}, base};
            for (const affix of affixes) {
                const where = `${affix.key} (${affix.name}) at ilvl ${ilvl}, ${kind}`;
                let got;
                try {
                    got = lines(trimmed, affix, ctx);
                } catch (e) {
                    throw new Error(`the trimmed stat dictionary can't describe ${where}: ${e.message}`);
                }
                if (got !== lines(full, affix, ctx)) throw new Error(`the trimmed stat dictionary describes ${where} differently`);
            }
        }
    }
}
