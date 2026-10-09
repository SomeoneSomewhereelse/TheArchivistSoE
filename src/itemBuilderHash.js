// The Item Builder's build as a URL query (spec "URL format"): v (link version, always written),
// b (base), q (m/r/c, left out when it's the base's first allowed quality), il (ilvl, magic/rare),
// cl and gl (clvl and ingredient ilvl, crafted), a (affix keys in pick order, "-"-separated).
// Levels at 99 are left out. Pure, unit-tested in itemBuilderHash.test.js.
import {allowedQualities, EMPTY_BUILD, resolveBuild} from "./itemBuilderRules.js";

export const OLD_LINK_NOTICE = "This link was made for older game data and can't be opened.";

const QUALITY_CODE = {magic: "m", rare: "r", crafted: "c"};
const CODE_QUALITY = {m: "magic", r: "rare", c: "crafted"};

// undefined when absent, NaN when not a plain integer (resolveBuild counts it as a reset setting).
function level(value) {
    if (value === null) return undefined;
    return /^\d+$/.test(value) ? Number(value) : Number.NaN;
}

// URLSearchParams.get returns the first of repeated parameters, so the first one wins.
export function parseBuildQuery(query) {
    const params = new URLSearchParams(query);
    const v = params.get("v");
    return {
        version: v !== null && /^\d+$/.test(v) ? Number(v) : null,
        base: params.get("b") || null,
        quality: params.has("q") ? CODE_QUALITY[params.get("q")] ?? "invalid" : null,
        ilvl: level(params.get("il")),
        clvl: level(params.get("cl")),
        gilvl: level(params.get("gl")),
        picks: (params.get("a") ?? "").split("-").filter(Boolean),
    };
}

export function encodeBuildQuery(model, build) {
    if (!build.base) return "";
    const parts = [`v=${model.linkVersion}`, `b=${build.base}`];
    if (build.quality !== allowedQualities(model, model.baseByCode.get(build.base))[0]) {
        parts.push(`q=${QUALITY_CODE[build.quality]}`);
    }
    if (build.quality === "crafted") {
        if (build.clvl !== 99) parts.push(`cl=${build.clvl}`);
        if (build.gilvl !== 99) parts.push(`gl=${build.gilvl}`);
    } else if (build.ilvl !== 99) {
        parts.push(`il=${build.ilvl}`);
    }
    if (build.picks.length) parts.push(`a=${build.picks.join("-")}`);
    return parts.join("&");
}

const affixes = (n) => `${n} ${n === 1 ? "affix" : "affixes"}`;

export function linkNotice(dropped, fixed) {
    const parts = [];
    if (dropped) parts.push(`${affixes(dropped)} from the link no longer ${dropped === 1 ? "fits and was" : "fit and were"} removed.`);
    if (fixed) parts.push("Some settings in the link were invalid and were reset.");
    return parts.length ? parts.join(" ") : null;
}

export function controlNotice(dropped) {
    return dropped ? `${affixes(dropped)} no longer ${dropped === 1 ? "fits and was" : "fit and were"} removed.` : null;
}

// A query with no version, or another version, is refused as a whole: the builder opens blank.
export function decodeBuildQuery(model, query) {
    if (!query) return {build: EMPTY_BUILD, notice: null};
    const raw = parseBuildQuery(query);
    if (raw.version !== model.linkVersion) return {build: EMPTY_BUILD, notice: OLD_LINK_NOTICE};
    const {build, dropped, fixed} = resolveBuild(model, raw);
    return {build, notice: linkNotice(dropped, fixed)};
}
