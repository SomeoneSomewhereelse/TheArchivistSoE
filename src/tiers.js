// Item tiers in game order. The tier filter lists them in this order, not alphabetically
// (which would put Elite first).
export const TIER_ORDER = ["Normal", "Exceptional", "Elite"];

// The known tiers in TIER_ORDER, then any other value after them: numbers ascending, otherwise
// alphabetical. Returns a new array.
export function sortTiers(tiers) {
    const rank = (t) => {
        const i = TIER_ORDER.indexOf(t);
        return i < 0 ? TIER_ORDER.length : i;
    };

    return [...tiers].sort((a, b) => {
        const byRank = rank(a) - rank(b);
        if (byRank) return byRank;
        const an = Number(a), bn = Number(b);
        if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
        return a.localeCompare(b);
    });
}
