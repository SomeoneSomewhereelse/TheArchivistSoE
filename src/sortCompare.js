// Sorting rules for the Affixes table. Pure functions, unit-tested in sortCompare.test.js.

// Every sortable Affixes column. Each key except "attrs" needs a case in affixSortValue;
// the test suite fails if one is missing.
export const AFFIX_SORT_KEYS = ["name", "attrs", "level", "group", "rare", "freq", "maxLevel", "types", "excluded", "class", "reqLevel"];

// "Missing" means the data has nothing to show: null, undefined, "" or an empty list.
export function isMissing(v) {
    return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

// Compares two cell values for direction `dir` ("asc" | "desc"). A missing value counts as the
// lowest value (missing: "low") or the highest (missing: "high"). Ties return 0 in both
// directions, so a stable sort keeps their incoming order.
export function compareValues(a, b, dir = "asc", {missing = "low"} = {}) {
    const aMissing = isMissing(a);
    const bMissing = isMissing(b);
    let cmp;

    if (aMissing || bMissing) {
        if (aMissing && bMissing) return 0;
        cmp = aMissing ? -1 : 1;
        if (missing === "high") cmp = -cmp;
    } else {
        const va = Array.isArray(a) ? a.join(", ") : a;
        const vb = Array.isArray(b) ? b.join(", ") : b;
        cmp = typeof va === "number" && typeof vb === "number"
            ? Math.sign(va - vb)
            : Math.sign(String(va).localeCompare(String(vb)));
    }

    if (cmp === 0) return 0;
    return dir === "desc" ? -cmp : cmp;
}

// A numeric column's value; anything that isn't a finite number counts as missing.
function numeric(v) {
    if (isMissing(v)) return null;
    const x = Number(v);
    return Number.isFinite(x) ? x : null;
}

// The value a column sorts by. "attrs" is handled by compareAffixes.
export function affixSortValue(affix, key) {
    switch (key) {
        case "name":
            return affix?.name;
        case "level":
            return numeric(affix?.level);
        case "group":
            return numeric(affix?.group);
        case "rare":
            // Boolean column, read the way the table displays it: "" is No, never missing.
            return affix?.rare ? 1 : 0;
        case "freq":
            return numeric(affix?.frequency);
        case "maxLevel":
            return numeric(affix?.maxLevel);
        case "types":
            return affix?.displayItemTypeNames;
        case "excluded":
            return affix?.displayExcludedItemTypeNames;
        case "class":
            return affix?.classDisplayName;
        case "reqLevel":
            return numeric(affix?.requiredLevel);
        default:
            // Loud on purpose: a silent fallback would make every row tie, so clicking the header
            // would only flip the arrow (the old Affix level bug).
            throw new Error(`No sort value for Affixes column "${key}"`);
    }
}

export function affixPrimaryPropertyAndMax(affix) {
    const dp = affix?.displayProperties;
    if (!dp) return {property: "", max: 0};

    // Pick the first object from displayProperties
    let first = null;

    if (Array.isArray(dp)) {
        first = dp.find((p) => p && typeof p === "object") || dp[0];
    } else if (typeof dp === "object") {
        first = dp;
    }

    if (first && typeof first === "object") {
        const prop = (first.property != null ? String(first.property) : first.prop != null ? String(first.prop) : "").trim();

        const maxRaw = first.max != null ? Number(first.max) : 0;
        const max = Number.isFinite(maxRaw) ? maxRaw : 0;

        return {property: prop, max};
    }

    return {property: "", max: 0};
}

export function compareAffixes(a, b, key, dir) {
    if (key === "attrs") {
        const pa = affixPrimaryPropertyAndMax(a);
        const pb = affixPrimaryPropertyAndMax(b);
        return compareValues(pa.property, pb.property, dir) || compareValues(pa.max, pb.max, dir);
    }

    // A null max level means "no cap", so it sorts above every real cap.
    const missing = key === "maxLevel" ? "high" : "low";
    return compareValues(affixSortValue(a, key), affixSortValue(b, key), dir, {missing});
}

// ---- Multi-column sort -------------------------------------------------------------------------------
// The Affixes sort is an ordered list of {key, dir}, keys unique. An empty list (the starting state)
// sorts by DEFAULT_AFFIX_SORT without that becoming a member of the list: see effectiveSort.

// Frozen: every empty list shares it.
export const DEFAULT_AFFIX_SORT = Object.freeze([Object.freeze({key: "attrs", dir: "asc"})]);

// Header text per sortable column. Every key in AFFIX_SORT_KEYS needs one; the test suite checks.
export const AFFIX_SORT_LABELS = {
    name: "Name",
    attrs: "Attributes",
    level: "Lvl",
    group: "Grp",
    rare: "Rares",
    freq: "Freq",
    maxLevel: "Max lvl",
    types: "Item types",
    excluded: "Excluded item types",
    class: "Class",
    reqLevel: "Req lvl",
};

const flipped = (dir) => (dir === "asc" ? "desc" : "asc");

const hasKey = (list, key) => list.some((s) => s.key === key);

// The list the table actually sorts by. Returns the same reference it was given (or the shared
// default), so memos and the pager's reset keyed on it don't fire on every render.
export function effectiveSort(list) {
    return list.length ? list : DEFAULT_AFFIX_SORT;
}

// The first key that tells the rows apart decides; later keys only break earlier ties. All ties
// return 0, so a stable sort keeps their incoming order.
export function compareAffixesBy(a, b, list) {
    for (const {key, dir} of list) {
        const cmp = compareAffixes(a, b, key, dir);
        if (cmp !== 0) return cmp;
    }
    return 0;
}

// A header click. Plain (multi off) acts on the effective sort like a single-column sort: the sole key
// clicked again flips, anything else replaces the list with that column ascending. Multi appends a new
// column ascending, or flips one already in the list in place; it never removes (the chips do that).
export function clickSort(list, key, {multi = false} = {}) {
    if (multi) {
        return hasKey(list, key) ? flipSortKey(list, key) : [...list, {key, dir: "asc"}];
    }
    const active = effectiveSort(list);
    if (active.length === 1 && active[0].key === key) return [{key, dir: flipped(active[0].dir)}];
    return [{key, dir: "asc"}];
}

// Flips one key in place; the same list if the key isn't in it.
export function flipSortKey(list, key) {
    if (!hasKey(list, key)) return list;
    return list.map((s) => (s.key === key ? {key, dir: flipped(s.dir)} : s));
}

// Drops one key (the list may become empty: back to the default); the same list if the key isn't in it.
export function removeSortKey(list, key) {
    if (!hasKey(list, key)) return list;
    return list.filter((s) => s.key !== key);
}

// A stored list (a localStorage string, or null) cleaned for use: entries must be plain objects with a
// known key and dir "asc" or "desc"; duplicates keep the first; extra fields are dropped. Anything
// unreadable gives an empty list. Never throws, so a stale or corrupt value can't break the tab.
export function parseStoredSort(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];

    const out = [];
    for (const entry of parsed) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
        const {key, dir} = entry;
        if (!AFFIX_SORT_KEYS.includes(key) || (dir !== "asc" && dir !== "desc")) continue;
        if (hasKey(out, key)) continue;
        out.push({key, dir});
    }
    return out;
}
