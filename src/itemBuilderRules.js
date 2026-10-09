// The game's affix rules for the Item Builder (spec "Game rules"). Pure, unit-tested in
// itemBuilderRules.test.js. `model` is prepareItemBuilder's result (src/itemBuilderData.js).

export const QUALITIES = ["magic", "rare", "crafted"];

// Unsettled caps use the conservative default (spec "Caps"): rare jewels and Mythic Jewels 2 + 2.
export const CAPS = {
    magic: {prefix: 1, suffix: 1, total: 2},
    rare: {prefix: 3, suffix: 3, total: 6},
    rareJewel: {prefix: 2, suffix: 2, total: 4},
    crafted: {prefix: 3, suffix: 3, total: 4},
};

// A base can be crafted when its type chain reaches one of these (circlets through SoE's infusions).
export const CRAFT_TYPES = ["amul", "ring", "belt", "glov", "boot", "helm", "tors", "shld", "weap", "bowq", "xboq", "circ"];

export const EMPTY_BUILD = Object.freeze({base: null, quality: null, ilvl: 99, clvl: 99, gilvl: 99, picks: Object.freeze([])});

const MAGIC_TWO_AFFIX_ILVL = {equipment: 65, jewelry: 85, jewel: 85, charm: 90};

export function affixLevel({ilvl, qlvl, magicLvl}) {
    const level = Math.max(ilvl, qlvl);
    const half = Math.floor(qlvl / 2);
    let alvl;
    if (magicLvl > 0) alvl = level + magicLvl;
    else if (level < 99 - half) alvl = level - half;
    else alvl = 2 * level - 99;
    return Math.min(99, Math.max(1, alvl));
}

export function craftedItemLevel(clvl, ingredientIlvl) {
    return Math.floor(clvl / 2) + Math.floor(ingredientIlvl / 2);
}

export function baseChain(model, base) {
    const chain = new Set();
    for (const type of base.types) for (const t of model.types[type]?.chain ?? [type]) chain.add(t);
    return chain;
}

// The class of a class-specific base: its primary type's ItemTypes "Class", as the game reads it.
export function baseClass(model, base) {
    return model.types[base.types[0]]?.class ?? null;
}

export function itemKind(model, base) {
    const chain = baseChain(model, base);
    if (chain.has("jewl")) return "jewel";
    if (chain.has("char")) return "charm";
    if (chain.has("ring") || chain.has("amul")) return "jewelry";
    return "equipment";
}

export function allowedQualities(model, base) {
    const qualities = ["magic"];
    if (model.types[base.types[0]]?.rare) qualities.push("rare");
    const chain = baseChain(model, base);
    if (CRAFT_TYPES.some((t) => chain.has(t))) qualities.push("crafted");
    return qualities;
}

export function capsFor(model, base, quality) {
    return quality === "rare" && itemKind(model, base) === "jewel" ? CAPS.rareJewel : CAPS[quality];
}

// Everything the rules need about one base, quality and set of levels. build.base must exist.
export function rollContext(model, build) {
    const base = model.baseByCode.get(build.base);
    const ilvl = build.quality === "crafted" ? craftedItemLevel(build.clvl, build.gilvl) : build.ilvl;
    return {
        base,
        chain: baseChain(model, base),
        cls: baseClass(model, base),
        kind: itemKind(model, base),
        quality: build.quality,
        ilvl,
        effectiveIlvl: Math.max(ilvl, base.qlvl),
        alvl: affixLevel({ilvl, qlvl: base.qlvl, magicLvl: base.magicLvl}),
        caps: capsFor(model, base, build.quality),
    };
}

// Whether the row can roll at all on this item (spec "Which affixes can roll", rules 1-5).
export function canRoll(affix, ctx) {
    if (affix.level > ctx.alvl) return false;
    if (affix.maxLevel !== null && ctx.alvl > affix.maxLevel) return false;
    if (!affix.itypes.some((t) => ctx.chain.has(t))) return false;
    if (affix.etypes.some((t) => ctx.chain.has(t))) return false;
    if (ctx.quality !== "magic" && !affix.rare) return false;
    if (affix.classSpecific && ctx.cls && ctx.cls !== affix.classSpecific) return false;
    return true;
}

export function eligibleAffixes(model, ctx) {
    return model.affixes.filter((a) => canRoll(a, ctx));
}

// An eligible row's state next to the picks: a group taken on either side beats a full side.
export function rowState(affix, picked, caps) {
    if (picked.some((p) => p.key === affix.key)) return {state: "picked"};
    const holder = picked.find((p) => p.group === affix.group);
    if (holder) return {state: "group", by: holder};
    const side = picked.filter((p) => p.suffix === affix.suffix).length;
    if (side >= (affix.suffix ? caps.suffix : caps.prefix) || picked.length >= caps.total) return {state: "full"};
    return {state: "free"};
}

export function requiredLevel(base, picked) {
    return Math.max(base.levelreq, ...picked.map((a) => a.levelreq));
}

// Spec "Affix count by ilvl": [lowest ilvl, min, max], highest band first. Crafted items use the crafted ilvl.
const COUNT_BANDS = {
    rare: [[85, 6, 6], [65, 5, 6], [45, 4, 6], [0, 3, 6]],
    crafted: [[71, 4, 4], [51, 3, 4], [31, 2, 4], [0, 1, 4]], // crafted ilvl can be 0 (clvl 1, ingredient 1)
};

// How many affixes a real drop of this quality and ilvl rolls: {min, max}. The hint and the roll odds both read it.
export function affixCountRange(ctx) {
    const {quality, ilvl, kind} = ctx;
    if (quality === "magic") return {min: ilvl >= MAGIC_TWO_AFFIX_ILVL[kind] ? 2 : 1, max: 2};
    if (quality === "rare" && kind === "jewel") return {min: 4, max: 4};
    const [, min, max] = COUNT_BANDS[quality].find(([from]) => ilvl >= from);
    return {min, max};
}

export function countHint(ctx) {
    const {quality, ilvl, kind} = ctx;
    const {min, max} = affixCountRange(ctx);
    const count = min === max ? `always rolls ${max}` : `rolls ${min}–${max}`;
    if (quality === "magic") {
        return min === max
            ? `A magic item at ilvl ${ilvl} ${count} affixes`
            : `A magic item at ilvl ${ilvl} ${count} affixes (always 2 from ilvl ${MAGIC_TWO_AFFIX_ILVL[kind]})`;
    }
    if (quality === "rare") return kind === "jewel" ? `A rare jewel ${count} affixes` : `A rare at ilvl ${ilvl} ${count} affixes`;
    return `A crafted item at ilvl ${ilvl} ${count} random affixes`;
}

const LEVEL_KEYS = ["ilvl", "clvl", "gilvl"];
const validLevel = (v) => Number.isInteger(v) && v >= 1 && v <= 99;

// Turns any build-shaped input (a decoded link, or the current build plus one control change) into a
// valid build: levels default to 99, an unknown base empties the build, a disallowed quality falls back
// to the base's first allowed one, and picks are applied in order, each kept only if it can roll and is
// free next to the picks before it. `fixed` counts reset settings, `dropped` the removed picks.
export function resolveBuild(model, raw) {
    let fixed = 0;
    let dropped = 0;
    const levels = {};
    for (const key of LEVEL_KEYS) {
        if (raw[key] === undefined || raw[key] === null) levels[key] = 99;
        else if (validLevel(raw[key])) levels[key] = raw[key];
        else {
            levels[key] = 99;
            fixed++;
        }
    }

    const picks = [...new Set(raw.picks ?? [])];
    const base = raw.base ? model.baseByCode.get(raw.base) ?? null : null;
    if (raw.base && !base) fixed++;
    if (!base) return {build: {...EMPTY_BUILD, ...levels, picks: []}, dropped: dropped + picks.length, fixed};

    const allowed = allowedQualities(model, base);
    let quality = raw.quality;
    if (!allowed.includes(quality)) {
        if (quality) fixed++;
        quality = allowed[0];
    }

    const build = {base: base.code, quality, ...levels, picks: []};
    const ctx = rollContext(model, build);
    const picked = [];
    for (const key of picks) {
        const affix = model.affixByKey.get(key);
        if (affix && canRoll(affix, ctx) && rowState(affix, picked, ctx.caps).state === "free") picked.push(affix);
        else dropped++;
    }
    build.picks = picked.map((a) => a.key);
    return {build, dropped, fixed};
}
