// The Item Builder's item tooltip (spec "Name and modifier lines"): the engine runs here, in the browser, at
// the builder's exact item level, over a trimmed dictionary shipped in ItemBuilder.json. This module computes the
// tooltip's lines (buildTooltip), the engine's inputs (engineBase, expandPicks) and the build-time check of
// the trimmed dictionary. Pure.
import {CLASS_NAMES} from "./affixData.js";
import {blockChance, blockText, damage, damageText, defense, rangeOf, requirement} from "./baseLines.js";
import {baseChain, baseClass, requiredLevel} from "./itemBuilderRules.js";
import {describe, expandMods, rangeText, sumEnds, sumEntries} from "./statEngine.js";

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

// A label from the trimmed dictionary, trimmed ("Chance to Block: " -> "Chance to Block:").
function label(dict, key) {
    const s = dict.string(key);
    if (s === null) throw new Error(`string "${key}" is missing from ItemBuilder.json's stat dictionary`);
    return s.trim();
}

// The tooltip's lines in the game's order (spec "Name and modifier lines"): name; Defense, Chance to Block,
// Throw Damage, One/Two-Hand Damage, Quantity, the charm line, Durability, class restriction, Required
// Dexterity, Strength and Level; the modifiers (the engine's lines over the summed picks, minus sockets);
// the footer. Each line: {kind, text?, label?, value?, changed?, byRoll?, quality?}; ItemTooltip.jsx styles
// them by kind. ctx: rollContext(model, build). Throws on a missing string or bad data (the tooltip card's
// ErrorBoundary shows its fallback).
export function buildTooltip(model, ctx, build) {
    const {dict} = model;
    const {base, chain, quality} = ctx;
    const eth = !!build.eth;
    const type = model.types[base.types[0]];
    const cls = baseClass(model, base);
    const picks = build.picks.map((key) => model.affixByKey.get(key));
    const engineCtx = {ilvl: {min: ctx.ilvl, max: ctx.ilvl}, base: engineBase(model, base)};
    const entries = sumEntries(expandPicks(picks, dict, engineCtx));
    const totals = sumEnds(picks.flatMap((a) => a.mods), dict, engineCtx);
    const has = (stat) => entries.some((e) => e.stat === stat && (e.min !== 0 || e.max !== 0));
    const lines = [];
    const baseLine = (key, value, changed = false) => lines.push({kind: "base", label: label(dict, key), value, changed});

    // Name: magic "Prefix Base Suffix"; rare and crafted a placeholder over the base name (R1).
    if (quality === "magic") {
        const prefix = picks.find((a) => !a.suffix)?.name;
        const suffix = picks.find((a) => a.suffix)?.name;
        lines.push({kind: "name", text: [prefix, base.name, suffix].filter(Boolean).join(" "), quality});
    } else {
        lines.push({kind: "placeholder", text: "Random Name", quality});
        lines.push({kind: "baseName", text: base.name, quality});
    }

    if (chain.has("armo")) {
        const d = defense(base, {eth, totals});
        if (d.high > 0) baseLine("ItemStats1h", rangeOf(d), d.changed);
    }
    if (chain.has("shld")) {
        const b = blockChance(base, {classes: dict.classes, onlyClass: cls ? CLASS_NAMES[cls] : null, totals});
        baseLine("ItemStats1r", blockText(b), b.changed);
    }
    if (chain.has("weap")) {
        const to = label(dict, "ItemStast1k");
        const pairLine = (key, txt, minStat, maxStat, clamp, suffix = "") => {
            const d = damage(txt, {eth, totals, minStat, maxStat, clamp});
            baseLine(key, `${damageText(d, to)}${suffix}`, d.changed);
        };
        if (type.throwable && base.dmgThrow) pairLine("ItemStats1n", base.dmgThrow, "item_throw_mindamage", "item_throw_maxdamage", false);
        if (base.twoHanded && base.dmg2) pairLine("ItemStats1m", base.dmg2, "secondary_mindamage", "secondary_maxdamage", true);
        else if (base.dmg1) pairLine("ItemStats1l", base.dmg1, "mindamage", "maxdamage", true);
        // A 1-or-2-handed weapon's one-hand line shows only to Barbarians.
        if (base.twoHanded && base.oneOrTwo && base.dmg1) pairLine("ItemStats1l", base.dmg1, "mindamage", "maxdamage", false, " (Bar)");
    }
    if (base.maxstack > 0) baseLine("ItemStats1i", String(base.maxstack));
    if (type.charm) lines.push({kind: "base", label: label(dict, "Charmdes")});
    // Shown full (a new item's current durability is random, U4/U9); hidden when indestructible or thrown.
    if (!base.nodurability && base.durability > 0 && !has("item_indesctructible") && !type.throwable) {
        baseLine("ItemStats1d", `${base.durability} ${label(dict, "ItemStats1j")} ${base.durability}`);
    }
    if (cls) {
        const row = dict.classes.find((c) => c.name === CLASS_NAMES[cls]);
        if (!row) throw new Error(`CharStats.txt has no class row for "${cls}"`);
        lines.push({kind: "base", label: label(dict, row.classOnly)});
    }
    for (const [key, value] of [["ItemStats1f", base.reqdex], ["ItemStats1e", base.reqstr]]) {
        const r = requirement(value, {eth, totals});
        if (r) baseLine(key, rangeOf(r));
    }
    const level = requiredLevel(base, picks);
    if (level > 1) baseLine("ItemStats1p", String(level));

    // Modifiers: the engine's lines over the summed picks; sockets print in the footer instead.
    for (const l of describe(entries, dict)) {
        if (l.stats.includes("item_numsockets")) continue;
        l.pieces.forEach((text, i) => lines.push({kind: "mod", text, byRoll: !!l.byRoll && i === l.pieces.length - 1}));
    }

    // Footer: "Ethereal (Cannot Be Repaired)", "Socketed (n)", or both joined by ", " (U2).
    const sockets = entries.find((e) => e.stat === "item_numsockets" && e.max > 0);
    const footer = [
        ...(eth ? [label(dict, "strEtherealDisplay")] : []),
        ...(sockets ? [`${label(dict, "strSocketedDisplay")} (${rangeText(sockets)})`] : []),
    ];
    if (footer.length) lines.push({kind: "footer", text: footer.join(", ")});
    return lines;
}
