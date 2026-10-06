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
