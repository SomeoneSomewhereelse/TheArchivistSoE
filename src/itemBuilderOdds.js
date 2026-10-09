// Roll odds for the Item Builder (spec "Roll odds"): the chance that one drop of the build's base, quality
// and levels carries every picked affix. Pure, unit-tested in itemBuilderOdds.test.js.
import {affixCountRange, eligibleAffixes} from "./itemBuilderRules.js";

// A row's weight in its side's draw: frequency, times its level on a magic-lvl base (vanilla ComputeAffixFrequency).
export function affixWeight(affix, ctx) {
    return ctx.base.magicLvl > 0 ? affix.frequency * affix.level : affix.frequency;
}

const sideOf = (affix) => (affix.suffix ? 1 : 0);

// A draw takes a row by weight among the rows whose group is still free, which is the same as taking a free
// group by its total weight and then a row inside it. So one side's draws are a weighted draw of groups
// without replacement. hit[n] = the chance that n draws take every target group (n = 0..nMax), by walking
// every draw sequence (a side has at most 26 groups and 3 draws), stopping once all targets are taken.
function sideInclusion(weights, isTarget, targets, nMax) {
    const hit = new Array(nMax + 1).fill(0);
    const used = new Uint8Array(weights.length);
    const walk = (depth, prob, rest, found) => {
        if (found === targets) {
            for (let n = depth; n <= nMax; n++) hit[n] += prob;
            return;
        }
        if (depth === nMax) return;
        for (let i = 0; i < weights.length; i++) {
            if (used[i]) continue;
            used[i] = 1;
            walk(depth + 1, (prob * weights[i]) / rest, rest - weights[i], found + isTarget[i]);
            used[i] = 0;
        }
    };
    walk(0, 1, weights.reduce((sum, w) => sum + w, 0), 0);
    return hit;
}

// The chance of each (prefix draws, suffix draws) split after N draws, for every N up to max: each draw is a
// prefix or a suffix 50/50 while both sides are open, else the open side; a side closes at its cap or when
// it has no free group left (the draw goes to the other side). No open side: the item rolls fewer affixes.
function sideSplits(caps, groupCounts, total, max) {
    const limit = [Math.min(caps.prefix, groupCounts[0]), Math.min(caps.suffix, groupCounts[1])];
    let cur = new Map([["0,0", 1]]);
    const byN = [cur];
    for (let t = 1; t <= max; t++) {
        const next = new Map();
        const add = (a, b, q) => next.set(`${a},${b}`, (next.get(`${a},${b}`) ?? 0) + q);
        for (const [key, q] of cur) {
            const [a, b] = key.split(",").map(Number);
            const open = a + b >= total ? [] : [a < limit[0], b < limit[1]];
            if (open[0] && open[1]) {
                add(a + 1, b, q / 2);
                add(a, b + 1, q / 2);
            } else if (open[0]) add(a + 1, b, q);
            else if (open[1]) add(a, b + 1, q);
            else add(a, b, q);
        }
        byN.push((cur = next));
    }
    return byN;
}

// {p, min, max}: p is the chance (0 when the picks can't all roll together), min..max the affix count range,
// taken as uniform. null when nothing is picked.
export function rollOdds(model, ctx, picks) {
    if (!picks.length) return null;
    const {min, max} = affixCountRange(ctx);
    const none = {p: 0, min, max};
    const caps = [ctx.caps.prefix, ctx.caps.suffix];
    const perSide = [0, 0];
    for (const a of picks) perSide[sideOf(a)]++;
    if (new Set(picks.map((a) => a.group)).size < picks.length || picks.length > ctx.caps.total || perSide[0] > caps[0] || perSide[1] > caps[1]) return none;

    const pool = eligibleAffixes(model, ctx);
    const groupWeight = [new Map(), new Map()];
    for (const a of pool) {
        const map = groupWeight[sideOf(a)];
        map.set(a.group, (map.get(a.group) ?? 0) + affixWeight(a, ctx));
    }
    const poolKeys = new Set(pool.map((a) => a.key));
    if (picks.some((a) => !poolKeys.has(a.key))) return none;

    // The picked row out of its group, once the group is drawn.
    let rowShare = 1;
    for (const a of picks) rowShare *= affixWeight(a, ctx) / groupWeight[sideOf(a)].get(a.group);
    const inclusion = [0, 1].map((s) => {
        const groups = [...groupWeight[s].keys()];
        const targets = new Set(picks.filter((a) => sideOf(a) === s).map((a) => a.group));
        return sideInclusion(groups.map((g) => groupWeight[s].get(g)), groups.map((g) => (targets.has(g) ? 1 : 0)), targets.size, caps[s]);
    });
    const splits = sideSplits(ctx.caps, [groupWeight[0].size, groupWeight[1].size], ctx.caps.total, max);
    let sum = 0;
    for (let n = min; n <= max; n++) {
        for (const [key, q] of splits[n]) {
            const [a, b] = key.split(",").map(Number);
            sum += q * inclusion[0][a] * inclusion[1][b];
        }
    }
    return {p: (sum / (max - min + 1)) * rowShare, min, max};
}

const twoDigits = new Intl.NumberFormat("en-US", {maximumSignificantDigits: 2});

// "1 in 2,100", "1 in 3.4 million": 1/p to 2 significant digits. p must be > 0.
export function formatOdds(p) {
    const x = Number((1 / p).toPrecision(2));
    if (x < 1.05) return "1 in 1";
    if (x >= 1e9) return `1 in ${twoDigits.format(x / 1e9)} billion`;
    if (x >= 1e6) return `1 in ${twoDigits.format(x / 1e6)} million`;
    return `1 in ${twoDigits.format(x)}`;
}
