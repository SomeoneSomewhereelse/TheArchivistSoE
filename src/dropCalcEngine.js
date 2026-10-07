// The Drop calculator's maths: for one target item, every monster that can drop it and how likely.
// Moved out of DropCalculatorPanel (App.jsx) with the formulas unchanged. What's new: prepareModel
// builds the lookups once per mode (indexes instead of linear scans), and calculateDrops walks each
// root treasure class once per query instead of once per monster.

const TC_NAME = "Treasure Class";

const n = (v) => (v === null || v === undefined ? "" : String(v).trim());
const num = (v) => {
    const x = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(x) ? x : 0;
};

// tables: jsonToTables' output. Every index keeps the legacy lookup's rule: the first match wins.
export function prepareModel(tables) {
    const {MonStats, TreasureClassEx, Weapons, Armor, Misc, UniqueItems, SetItems, ItemRatio, ItemTypes, Levels} = tables;

    const treasureByName = new Map();
    const treasureByGroup = new Map();
    for (const tc of TreasureClassEx) {
        const name = n(tc[TC_NAME]).toLowerCase();
        if (!treasureByName.has(name)) treasureByName.set(name, tc);

        const group = n(tc.group);
        if (!treasureByGroup.has(group)) treasureByGroup.set(group, []);
        treasureByGroup.get(group).push(tc);
    }

    // Weapons, then Armor, then Misc, the order the legacy baseItems.find searched. The empty code is a
    // key too: some UniqueItems rows (section headers like "Rings", some real items) have no code and
    // resolve to the first empty-code base row, which gives an empty table rather than an error.
    const baseByCode = new Map();
    const exceptionalOrEliteCodes = new Set();
    for (const item of [...Weapons, ...Armor, ...Misc]) {
        const code = n(item.code);
        if (!baseByCode.has(code)) baseByCode.set(code, item);

        const uber = n(item.ubercode);
        const ultra = n(item.ultracode);
        if (uber) exceptionalOrEliteCodes.add(uber);
        if (ultra) exceptionalOrEliteCodes.add(ultra);
    }

    // Monster id -> the area name of the first Levels row listing it in mon1..mon10.
    const levelNameByMonster = new Map();
    for (const level of Levels) {
        for (let i = 1; i <= 10; i++) {
            const id = n(level[`mon${i}`]);
            if (!levelNameByMonster.has(id)) levelNameByMonster.set(id, n(level.LevelName));
        }
    }

    return {
        monStats: MonStats,
        treasureByName,
        treasureByGroup,
        autoTcs: buildAutoTcs(Weapons, Armor, ItemTypes),
        baseByCode,
        exceptionalOrEliteCodes,
        levelNameByMonster,
        uniqueItems: UniqueItems,
        setItems: SetItems,
        misc: Misc,
        itemRatio: ItemRatio,
    };
}

function getRootTc(model, tcName, monsterLevel) {
    const start = model.treasureByName.get(n(tcName).toLowerCase());
    if (!start) return tcName;

    const group = n(start.group);
    if (!group) return tcName;

    // filter() copies, so sorting never reorders the index; the stable sort keeps file order on ties.
    const candidates = model.treasureByGroup.get(group)
        .filter((r) => num(r.level) <= monsterLevel)
        .sort((a, b) => num(b.level) - num(a.level));

    return n(candidates[0]?.[TC_NAME] || tcName);
}

function buildTypeRarityMap(itemTypes) {
    const map = new Map();

    for (const r of itemTypes) {
        const code = n(r.Code || r.code);
        if (!code) continue;

        const rarity = num(r.Rarity || r.rarity);
        map.set(code, rarity > 0 ? rarity : 1);
    }

    return map;
}

function isBowLike(w) {
    const type = n(w.type).toLowerCase();
    const type2 = n(w.type2).toLowerCase();

    return (
        type.includes("bow") ||
        type2.includes("bow") ||
        type.includes("xbow") ||
        type2.includes("xbow") ||
        type.includes("crossbow") ||
        type2.includes("crossbow")
    );
}

function buildAutoTcs(weapons, armors, itemTypes) {
    const buckets = new Map();
    const typeRarity = buildTypeRarityMap(itemTypes);

    function add(bucket, code, weight) {
        if (!buckets.has(bucket)) buckets.set(bucket, []);
        buckets.get(bucket).push({code, weight});
    }

    function itemWeight(row) {
        const type = n(row.type);
        const fromType = typeRarity.get(type);

        if (fromType > 0) return fromType;

        const fromItem = num(row.rarity);
        return fromItem > 0 ? fromItem : 1;
    }

    function addRows(rows, prefixes) {
        for (const r of rows) {
            if (n(r.spawnable) !== "1") continue;

            const code = n(r.code);
            if (!code) continue;

            const level = num(r.level);
            if (level <= 0) continue;

            const bucketLevel = Math.ceil(level / 3) * 3;
            const weight = itemWeight(r);

            for (const prefix of prefixes) {
                add(`${prefix}${bucketLevel}`, code, weight);
            }
        }
    }

    addRows(weapons, ["weap"]);
    addRows(weapons.filter((w) => !isBowLike(w)), ["mele"]);
    addRows(weapons.filter((w) => isBowLike(w)), ["bow"]);
    addRows(armors, ["armo"]);

    return buckets;
}

function isExceptionalOrElite(baseItem, exceptionalOrEliteCodes) {
    const code = n(baseItem.code);

    if (exceptionalOrEliteCodes?.has(code)) {
        return true;
    }

    const norm = n(baseItem.normcode);
    const uber = n(baseItem.ubercode);
    const ultra = n(baseItem.ultracode);

    return (
        (norm && code !== norm) ||
        (uber && code === uber) ||
        (ultra && code === ultra)
    );
}

function getItemRatioRow(itemRatioRows, baseItem, exceptionalOrEliteCodes) {
    const version = "1";
    const uber = isExceptionalOrElite(baseItem, exceptionalOrEliteCodes) ? "1" : "0";

    return itemRatioRows.find((r) =>
        n(r.Version) === version &&
        n(r.Uber) === uber &&
        n(r["Class Specific"]) === "0"
    ) || itemRatioRows[0];
}

function adjustedNoDrop(noDrop, itemProbTotal, playersValue, partyValue) {
    const players = Math.max(1, Math.min(8, Math.floor(num(playersValue) || 1)));
    const party = Math.max(1, Math.min(8, Math.floor(num(partyValue) || 1)));

    if (noDrop <= 0 || itemProbTotal <= 0) return 0;
    if (players <= 1 && party <= 1) return noDrop;

    const exponent = Math.floor(
        1 + ((players - 1) / 2) + ((party - 1) / 2)
    );

    const base = noDrop / (noDrop + itemProbTotal);
    const powered = Math.pow(base, exponent);

    return Math.floor(itemProbTotal * powered / (1 - powered));
}

function tcEntries(tc) {
    const out = [];

    for (let i = 1; i <= 10; i++) {
        const item = n(tc[`Item${i}`]);
        const prob = num(tc[`Prob${i}`]);

        if (item && prob > 0) {
            out.push({item, prob});
        }
    }

    return out;
}

function probabilityForPicks(p, picks) {
    if (picks <= 1) return p;
    const capped = Math.min(6, picks);
    return 1 - Math.pow(1 - p, capped);
}

function mergeRatios(a, b) {
    return {
        unique: Math.max(a?.unique || 0, b?.unique || 0),
        set: Math.max(a?.set || 0, b?.set || 0),
        rare: Math.max(a?.rare || 0, b?.rare || 0),
        magic: Math.max(a?.magic || 0, b?.magic || 0),
    };
}

function tcQualityRatios(tc) {
    return {
        unique: num(tc.Unique),
        set: num(tc.Set),
        rare: num(tc.Rare),
        magic: num(tc.Magic),
    };
}

function qualityOccurrenceChance(items, targetItem, code, monsterLevel) {
    const eligible = items.filter((u) =>
        rowItemCode(u) === code &&
        num(u.lvl) <= monsterLevel &&
        (n(u.enabled) === "" || n(u.enabled) === "1")
    );

    if (!eligible.length) return 0;

    const total = eligible.reduce((sum, u) => sum + Math.max(1, num(u.rarity) || 1), 0);
    const own = Math.max(1, num(targetItem.rarity) || 1);

    return own / total;
}

function qualityChance(itemRatioRows, baseItem, targetItem, exceptionalOrEliteCodes, monsterLevel, mfValue, tcBonus, qualityName) {
    const ratio = getItemRatioRow(itemRatioRows, baseItem, exceptionalOrEliteCodes);

    const q =
        qualityName === "set"
            ? "Set"
            : qualityName === "rare"
                ? "Rare"
                : qualityName === "magic"
                    ? "Magic"
                    : "Unique";

    const base = num(ratio[q]);
    const divisor = Math.max(1, num(ratio[`${q}Divisor`]));
    const min = num(ratio[`${q}Min`]);
    const qlvl = num(baseItem.level);

    let chance = base - Math.floor((monsterLevel - qlvl) / divisor);
    chance *= 128;

    let mfCap = 0;
    if (qualityName === "unique") mfCap = 250;
    if (qualityName === "set") mfCap = 500;
    if (qualityName === "rare") mfCap = 600;

    if (mfCap > 0) {
        const rawMf = Math.max(0, num(mfValue));
        const effectiveMf = rawMf <= 10
            ? rawMf
            : Math.floor((rawMf * mfCap) / (rawMf + mfCap));

        chance = Math.floor((chance * 100) / (100 + effectiveMf));
    }

    if (chance < min) {
        chance = min;
    }

    const bonus = Math.max(0, Math.min(1024, num(tcBonus)));
    if (bonus > 0) {
        chance = chance - Math.floor((chance * bonus) / 1024);
    }

    return chance <= 0 ? 1 : 128 / chance;
}

function rowItemCode(row) {
    return n(row.code) || n(row.item);
}

function makeAccumulator() {
    return {
        groups: [new Map()]
    };
}

function accumulatorCurrent(acc) {
    return acc.groups[acc.groups.length - 1];
}

function forkAccumulator(acc) {
    const current = accumulatorCurrent(acc);
    if (current.size > 0) {
        acc.groups.push(new Map());
    }
}

function accumulateOutcome(acc, probability, ratios, picks) {
    const current = accumulatorCurrent(acc);
    const key = `${picks}|${ratios.unique}|${ratios.set}|${ratios.rare}|${ratios.magic}`;

    const old = current.get(key);

    if (old) {
        old.probability += probability;
        old.ratios = mergeRatios(old.ratios, ratios);
    } else {
        current.set(key, {
            probability,
            ratios,
            picks
        });
    }
}

// The legacy walk, with the treasure-class lookup going through the index.
function collectPaths(
    ctx,
    outcomeName,
    selectionNumerator,
    selectionDenominator,
    parentPicks,
    pathProbability,
    ratiosAccumulator,
    acc,
    accumulatedPicks,
    visited = new Set()
) {
    if (ctx.stats) ctx.stats.walkNodes++;

    const name = n(outcomeName);
    if (!name) return;

    const tc = ctx.model.treasureByName.get(name.toLowerCase());
    const autoRows = ctx.model.autoTcs.get(name);

    const isRegularTc = !!tc;
    const isAutoTc = !!autoRows;
    const isTargetBase = name === ctx.targetCode;

    const configuredPicks = isRegularTc ? Math.trunc(num(tc.Picks) || 1) : 1;
    const parentPicksNegative = parentPicks < 0;

    const adjustedPicks = configuredPicks < 0
        ? accumulatedPicks
        : configuredPicks;

    const updatedAccumulatedPicks = parentPicksNegative
        ? selectionNumerator * accumulatedPicks * adjustedPicks
        : accumulatedPicks * adjustedPicks;

    const selectionProbability = parentPicksNegative
        ? pathProbability
        : pathProbability * (selectionNumerator / selectionDenominator);

    if (parentPicksNegative) {
        forkAccumulator(acc);
    }

    const nextRatios = isRegularTc
        ? mergeRatios(ratiosAccumulator, tcQualityRatios(tc))
        : ratiosAccumulator;

    if (isTargetBase) {
        accumulateOutcome(acc, selectionProbability, nextRatios, updatedAccumulatedPicks);
        return;
    }

    if (isAutoTc) {
        const total = autoRows.reduce((sum, r) => sum + r.weight, 0);
        if (total <= 0) return;

        for (const r of autoRows) {
            if (r.code !== ctx.targetCode) continue;

            collectPaths(
                ctx,
                r.code,
                r.weight,
                total,
                configuredPicks,
                selectionProbability,
                nextRatios,
                acc,
                updatedAccumulatedPicks,
                visited
            );
        }

        return;
    }

    if (!isRegularTc) return;

    if (visited.has(name)) return;
    const nextVisited = new Set(visited);
    nextVisited.add(name);

    const entries = tcEntries(tc);
    if (!entries.length) return;

    const probabilityDenominator = entries.reduce((sum, e) => sum + e.prob, 0);
    const noDrop = adjustedNoDrop(num(tc.NoDrop), probabilityDenominator, ctx.players, ctx.party);
    const denominatorWithNoDrop = probabilityDenominator + noDrop;

    for (const e of entries) {
        collectPaths(
            ctx,
            e.item,
            e.prob,
            denominatorWithNoDrop,
            configuredPicks,
            selectionProbability,
            nextRatios,
            acc,
            updatedAccumulatedPicks,
            nextVisited
        );
    }
}

function finalQualityFactor(ctx, ratios, monsterLevel) {
    if (ctx.dropMode === "misc") {
        return 1;
    }

    const sourceItems = ctx.dropMode === "set" ? ctx.model.setItems : ctx.model.uniqueItems;

    // Depends only on the monster level within one query, so it's computed once per level.
    let occurrence = ctx.occurrenceCache.get(monsterLevel);
    if (occurrence === undefined) {
        occurrence = qualityOccurrenceChance(sourceItems, ctx.targetItem, ctx.targetCode, monsterLevel);
        ctx.occurrenceCache.set(monsterLevel, occurrence);
    }

    if (occurrence <= 0) return 0;

    if (ctx.dropMode === "unique") {
        return qualityChance(
            ctx.model.itemRatio,
            ctx.baseItem,
            ctx.targetItem,
            ctx.model.exceptionalOrEliteCodes,
            monsterLevel,
            ctx.mf,
            ratios.unique,
            "unique"
        ) * occurrence;
    }

    if (ctx.dropMode === "set") {
        const uniqueRoll = qualityChance(
            ctx.model.itemRatio,
            ctx.baseItem,
            ctx.targetItem,
            ctx.model.exceptionalOrEliteCodes,
            monsterLevel,
            ctx.mf,
            ratios.unique,
            "unique"
        );

        const setRoll = qualityChance(
            ctx.model.itemRatio,
            ctx.baseItem,
            ctx.targetItem,
            ctx.model.exceptionalOrEliteCodes,
            monsterLevel,
            ctx.mf,
            ratios.set,
            "set"
        );

        return (1 - uniqueRoll) * setRoll * occurrence;
    }

    return 0;
}

// The walk from a root TC depends only on the root TC, the target code and the player count, all fixed
// within one query, and nothing changes its outcomes afterwards, so its accumulator is reused by every
// monster with that root. The quality factor still runs per monster: it depends on the monster level.
function calculateDropChanceFromRoot(ctx, rootTc, monsterLevel) {
    let acc = ctx.walkCache.get(rootTc);
    if (!acc) {
        acc = makeAccumulator();
        collectPaths(
            ctx,
            rootTc,
            1,
            1,
            1,
            1,
            {unique: 0, set: 0, rare: 0, magic: 0},
            acc,
            1
        );
        ctx.walkCache.set(rootTc, acc);
        if (ctx.stats) ctx.stats.walks++;
    }

    let none = 1;

    for (const group of acc.groups) {
        for (const outcome of group.values()) {
            if (ctx.stats) ctx.stats.outcomes++;

            const factor = finalQualityFactor(ctx, outcome.ratios, monsterLevel);
            if (factor <= 0) continue;

            const perPick = outcome.probability * factor;
            const chance = probabilityForPicks(perPick, outcome.picks);

            none *= (1 - chance);
        }
    }

    return 1 - none;
}

// options are the panel's raw state: query as typed, players and mf as strings.
export function calculateDrops(model, {dropMode, query, difficulty, players, mf}, stats) {
    if (stats) {
        stats.walkNodes = 0;
        stats.walks = 0;
        stats.outcomes = 0;
    }

    const q = n(query).toLowerCase();
    if (!q) return [];

    const {uniqueItems, setItems, misc} = model;
    let targetItem = null;
    let targetCode = "";

    if (dropMode === "unique") {
        targetItem =
            uniqueItems.find((u) => n(u.index).toLowerCase() === q) ||
            uniqueItems.find((u) => n(u.index).toLowerCase().includes(q));

        if (!targetItem) throw new Error(`Unique item not found: ${query}`);

        targetCode = n(targetItem.code);
    }

    if (dropMode === "set") {
        targetItem =
            setItems.find((u) => n(u.index).toLowerCase() === q) ||
            setItems.find((u) => n(u.index).toLowerCase().includes(q));

        if (!targetItem) throw new Error(`Set item not found: ${query}`);

        targetCode = rowItemCode(targetItem);
    }

    if (dropMode === "misc") {
        const miscItem = misc.find((m) => n(m.code).toLowerCase() === q);

        if (!miscItem) throw new Error(`Misc code not found: ${query}`);

        targetItem = miscItem;
        targetCode = n(miscItem.code);
    }

    const baseItem = model.baseByCode.get(targetCode);

    if (!baseItem) {
        throw new Error(`Base item not found for code: ${targetCode}`);
    }

    const tcColumn =
        difficulty === "H"
            ? "TreasureClass1(H)"
            : difficulty === "N"
                ? "TreasureClass1(N)"
                : "TreasureClass1";

    const levelColumn =
        difficulty === "H"
            ? "Level(H)"
            : difficulty === "N"
                ? "Level(N)"
                : "Level";

    const ctx = {
        model,
        dropMode,
        targetItem,
        targetCode,
        baseItem,
        mf,
        players,
        party: players,
        walkCache: new Map(),
        occurrenceCache: new Map(),
        stats,
    };

    const out = [];

    for (const mon of model.monStats) {
        const monsterId = n(mon.Id);
        if (!monsterId) continue;

        const tcName = n(mon[tcColumn]);
        if (!tcName) continue;

        const monsterLevel = num(mon[levelColumn]);
        if (monsterLevel <= 0) continue;

        if (dropMode !== "misc" && monsterLevel < num(targetItem.lvl)) {
            continue;
        }

        const rootTc = getRootTc(model, tcName, monsterLevel);
        const chance = calculateDropChanceFromRoot(ctx, rootTc, monsterLevel);
        const levelName = model.levelNameByMonster.get(monsterId) ?? "";

        if (chance > 0) {
            out.push({
                monsterId,
                monsterName: n(mon.NameStr) || monsterId,
                levelName,
                treasureClass: rootTc,
                chance,
                oneIn: Math.round(1 / chance),
                percent: chance * 100,
            });
        }
    }

    out.sort((a, b) => b.chance - a.chance);

    return out;
}
