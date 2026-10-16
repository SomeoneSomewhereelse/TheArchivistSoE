# Item Builder stat summing and item tooltip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a full in-game item tooltip in the Item Builder (name, base lines, summed modifiers, ethereal/socket footer), computed by the stat engine running in the browser, with an Ethereal toggle and per-class block.

**Architecture:** The stat engine (`src/statEngine.js`) learns a base context (funcs 5/6/7/14), summing with sources (`sumEntries`), by-roll lines, and two-end totals (`sumEnds`). A trimmed copy of its dictionary ships in `ItemBuilder.json` version 3, rebuilt in the browser by `statDataFromJson`. New pure modules compute the base lines (`src/baseLines.js`) and the whole tooltip (`src/itemTooltip.js`); `src/ItemTooltip.jsx` renders it inside its own `ErrorBoundary`. The builder's rules, URL and hook gain `eth`.

**Tech Stack:** React 19 + Vite 7, plain JavaScript, Vitest 5, ESLint 9; headless Chromium over CDP for the browser check (`tools/checks/`).

**Spec:** `docs/superpowers/specs/2026-10-12-item-builder-stat-summing-design.md` (approved 2026-10-16). Read it before starting; this plan argues from it.

## Global Constraints

- Shell: every command runs with `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"` first (Node 24 via nvm).
- Branch `item-builder-stat-summing` (already exists, spec committed). Commit at the end of each task. **Never push, never open a PR, no attribution lines in commit messages.** Never use `EnterWorktree`.
- The research vault `docs/research/stat-summing/` is git-excluded: **never commit anything from it**. `string.tbl` and `expansionstring.tbl` are Blizzard files: never commit them. `src/baseStrings.json` is the only file derived from them that is committed.
- Memory-constrained VM: run `free -h` before and after any heavy subagent; if "available" drops below about 1.5 GB, stop and say so.
- New logic goes in small modules under `src/`, never in `App.jsx`. Runtime dependencies stay `react` and `react-dom`.
- `npm run lint` must report 0 problems. No `eslint-disable`. Test files import `describe`/`it`/`expect` from `vitest` explicitly.
- The golden snapshot `src/__snapshots__/affixLines.golden.txt` **must not change**. A diff means the no-base path changed: stop and report it, never accept it with `-u`.
- The link version does not change: `src/itemBuilderVersion.json` must be untouched after the dev server regenerates the data.
- `ITEM_BUILDER_VERSION` becomes 3. Block cap `BLOCK_CAP = 80`. Ethereal: ×5/4 by truncation, −10 Str/Dex, durability unchanged.
- Tooltip label keys (`TOOLTIP_STRINGS`): `ItemStats1h` "Defense:", `ItemStats1r` "Chance to Block: ", `ItemStats1l` "One-Hand Damage:", `ItemStats1m` "Two-Hand Damage:", `ItemStats1n` "Throw Damage:", `ItemStast1k` "to", `ItemStats1i` "Quantity:", `ItemStats1d` "Durability:", `ItemStats1j` "of", `ItemStats1f` "Required Dexterity:", `ItemStats1e` "Required Strength:", `ItemStats1p` "Required Level:", `strEtherealDisplay`, `strSocketedDisplay`, `Charmdes`. Labels are trimmed and joined to their value with one space.
- Out of scope (don't build): uniques/sets/runewords, a character viewer, attack speed, rare name pickers, crafted recipe mods or any note about them, ethereal odds, the Affixes Stat select wrapping, unused tables in `dist/`, `package.json` version, `Changelog.json`.

### Interface refinements over the spec (deliberate, small)

- `trimStatData(dict, mods)` takes the builder's affix **mods**, not bare codes: it needs their params to keep the skills that charges and procs name.
- `ENGINE_STATS` lives in `src/statData.js` beside `HARDCODED_STRINGS`, not in `statEngine.js`: `statData.js` needs it and `statEngine.js` already imports `statData.js`, so the spec's placement would make an import cycle.
- `sumEnds(mods, dict, ctx)` takes mods (all picks' mods in order), the dictionary and the engine context.
- `resolveBuild` returns `ethOff` as the base's **name** when Ethereal was turned off (else `null`): truthy like a flag, and `controlNotice` needs the name.
- A requirement whose two ends straddle 0 shows its range; the line is hidden only when the high end is ≤ 0.

## Review Focus

1. **A link with `e=1` on a base that can't be ethereal** (a bow, a jewel): the builder must open non-ethereal with "Some settings in the link were invalid and were reset.", not crash or keep `e=1`. Test in Task 7.
2. **A crafted item at clvl 1 and ingredient ilvl 1** (crafted ilvl 0): charges, procs and the socket band at ilvl 0 must not throw, and the tooltip must build. Test in Task 6.
3. **Every builder base × every allowed quality, with no picks**: the tooltip must build for all 529 bases (quivers, claws, orbs, pelts, class-only shields), name first. Test in Task 6.
4. **Every builder affix alone, at ilvl 1 and 99, on a base it can roll on**: the tooltip must build (charges and procs at the exact ilvl, skills, map-free rows). Test in Task 6.
5. **The longest block line on a phone** ("Chance to Block: 66% (Pal: 80%, Ama/Asn/Bar: 80%, Dru/Nec/Sor: 80%)"): it must wrap at 390px with no horizontal overflow. Browser check in Task 9.

---

### Task 1: Engine summing, sources, by-roll lines and the deferred fixes (no-base path)

**Files:**
- Modify: `src/statEngine.js` (the per-level value and repair case in `formatStat`; the whole "Description: entries -> lines" section)
- Modify: `src/affixData.js` (the dgrp via-lookup in `describeAffixes`)
- Test: `src/statEngine.test.js`, `src/affixData.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `export function sumEntries(entries)` → summed entries (per `stat/layer`, byRoll apart; `src` is a `Set` of `"pick:mod"` strings or absent). `describe(entries, dict)` keeps its signature; lines gain `byRoll: true` when they come from byRoll entries. Entries may carry `src: Set<string>` and `byRoll: true`.

- [ ] **Step 1: Record the size baselines (for Task 9's report)**

Run (repo root):
```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"
gzip -c public/data/standard/ItemBuilder.json | wc -c
npm run build >/dev/null && for f in dist/assets/*.js; do echo "$f $(gzip -c "$f" | wc -c)"; done
```
Expected: about 58,913 bytes for `ItemBuilder.json` (59,319 was measured on 2026-10-16); note every JS asset's gzipped size. Write the numbers into your task notes (not into the repo).

Then take the "before" desktop screenshots of every tab, so Task 9 can compare against the code as it is now:
```bash
npm run dev -- --port 5180 --strictPort   # in the background; wait for "ready"
cd tools/checks && node compare-desktop.mjs before http://localhost:5180/TheArchivistSoE/ && cd ../..
```
Expected: 20 "shot before <tab>" lines; the PNGs land in `tools/checks/shots/desktop-before/` (gitignored). Stop the dev server afterwards.

- [ ] **Step 2: Write the failing tests**

In `src/statEngine.test.js`, change the import on line 2 to:
```js
import {chargesAt, checkEntries, describe as describeEntries, displayPieces, entryKey, expandMods, fill, rangeText, skillLevelAt, sumEntries} from "./statEngine.js";
```

Replace the test `"func 3 and func 8 reuse the previous slot's value"` with:
```js
    it("func 3 and func 8 reuse the previous slot's value", () => {
        expect(entries([mod("res-all", 3, 6)]).map((e) => [e.stat, e.min, e.max])).toEqual([
            ["fireresist", 3, 6], ["lightresist", 3, 6], ["coldresist", 3, 6], ["poisonresist", 3, 6]]);
        expect(entries([mod("map-mon-att-cast-speed", 40, 60)]).map((e) => [e.stat, e.min, e.max])).toEqual([
            ["map_mon_fasterattackrate", 40, 60], ["map_mon_fastercastrate", 40, 60]]);
        // A stub whose first slot (func 17) takes the param, so the reused value differs from the roll.
        const stub = {...dict, properties: new Map(dict.properties).set("stub", [
            {func: 17, stat: "strength", set: 0, val: 0}, {func: 3, stat: "dexterity", set: 0, val: 0}, {func: 8, stat: "vitality", set: 0, val: 0}])};
        expect(expandMods([mod("stub", 1, 2, "7")], stub, ILVL_99).entries.map((e) => [e.stat, e.min, e.max])).toEqual([
            ["strength", 7, 7], ["dexterity", 7, 7], ["vitality", 7, 7]]);
    });
```

Append at the end of `src/statEngine.test.js`:
```js
const E = (stat, min, max, extra = {}) => ({stat, layer: 0, min, max, ...extra});
const shown = (list) => describeEntries(list, dict).map((l) => [l.pieces.join(" "), !!l.byRoll]);

describe("sumEntries", () => {
    it("adds min to min and max to max per stat and layer, uniting the sources", () => {
        const [sum] = sumEntries([E("coldresist", 5, 10, {src: new Set(["0:0"])}), E("coldresist", 1, 2, {src: new Set(["1:0"])})]);
        expect(sum).toMatchObject({stat: "coldresist", layer: 0, min: 6, max: 12});
        expect([...sum.src].sort()).toEqual(["0:0", "1:0"]);
        expect(sumEntries([E("coldresist", 5, 10), {...E("coldresist", 1, 1), layer: 3}])).toHaveLength(2);
    });

    it("sums byRoll entries apart: from the smallest single value to the sum of the maximums (Jagged + Sharp)", () => {
        const sums = sumEntries([
            E("item_mindamage_percent", 17, 20, {byRoll: true}), E("item_mindamage_percent", 17, 20, {byRoll: true}),
            E("item_mindamage_percent", 201, 300)]);
        expect(sums.map((e) => [e.min, e.max, !!e.byRoll])).toEqual([[17, 40, true], [201, 300, false]]);
    });

    it("leaves entries without sources without a src", () => {
        expect(sumEntries([E("strength", 1, 1), E("strength", 2, 2)])[0].src).toBeUndefined();
    });
});

describe("describe: sources and by-roll lines", () => {
    it("describes byRoll entries on their own tagged lines, beside a plain line of the same stat", () => {
        expect(shown([
            E("item_mindamage_percent", 201, 300), E("item_maxdamage_percent", 201, 300),
            E("item_mindamage_percent", 17, 20, {byRoll: true}), E("item_maxdamage_percent", 17, 20, {byRoll: true}),
            E("maxdamage", 1, 1, {byRoll: true}),
        ])).toEqual([["+201-300% Enhanced Damage", false], ["+17-20% Enhanced Damage", true], ["+1 to Maximum Damage", true]]);
    });

    it("folds a dgrp group only when its members share their sources; entries without sources fold as before", () => {
        const four = ["fireresist", "lightresist", "coldresist", "poisonresist"];
        expect(shown(four.map((s) => E(s, 5, 5, {src: new Set(["0:0"])})))).toEqual([["All Resistances +5", false]]);
        expect(shown(four.map((s, i) => E(s, 5, 5, {src: new Set([`${i}:0`])})))).toEqual([
            ["Cold Resist +5%", false], ["Lightning Resist +5%", false], ["Fire Resist +5%", false], ["Poison Resist +5%", false]]);
        expect(shown(four.map((s) => E(s, 5, 5)))).toEqual([["All Resistances +5", false]]);
    });
});

describe("describe: the deferred fixes", () => {
    const lines = (list) => describeEntries(list, dict).map((l) => [l.pieces.join(" "), l.label]);

    it("merges Enhanced Damage only when min% equals max%", () => {
        expect(lines([E("item_mindamage_percent", 10, 20), E("item_maxdamage_percent", 10, 30)])).toEqual([
            ["Enhanced Minimum Damage", "Enhanced Minimum Damage"], ["Enhanced Maximum Damage", "Enhanced Maximum Damage"]]);
    });

    it("prints a negative per-level value from the smaller magnitude", () => {
        expect(lines([E("item_hp_perlevel", -8, -8)])).toEqual([
            ["-1 to -99 to Life (Based on Character Level), -1 per level", "-# to Life (Based on Character Level), # per level"]]);
    });

    it("labels repair and negative Enhanced Damage in the form their value prints", () => {
        expect(lines([E("item_replenish_durability", 100, 100)])).toEqual([["Repairs 1 durability per second", "Repairs # durability per second"]]);
        expect(lines([E("item_replenish_durability", 3, 3)])).toEqual([["Repairs 1 durability in 33 seconds", "Repairs # durability in # seconds"]]);
        expect(lines([E("item_mindamage_percent", -20, -10), E("item_maxdamage_percent", -20, -10)])).toEqual([
            ["-10 to -20% Enhanced Damage", "-#% Enhanced Damage"]]);
    });
});
```

In `src/affixData.test.js`, add inside `describe("review fixes", ...)` (after its last `it`):
```js
    it("describeAffixes names a dgrp member that prints no line of its own", () => {
        const dict = realStatData();
        const odd = {...dict, stats: new Map(dict.stats).set("coldresist", {...dict.stats.get("coldresist"), func: 0})};
        const row = {key: "p0", suffix: false, name: "Odd", level: 1, itypes: [], etypes: [], classSpecific: null,
            mods: [{code: "res-all", param: "", min: 3, max: 6}]};
        expect(() => describeAffixes([row], odd, new Map())).toThrow(/stat coldresist \(dgrp 2\) prints no line of its own/);
    });
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/statEngine.test.js src/affixData.test.js`
Expected: FAIL — `sumEntries is not a function`; the dgrp-source, deferred-fix and dgrp-member tests fail. The new stub assertion in "func 3 and func 8 …" already passes on today's engine; it is there so the test can fail if the reuse rule ever breaks.

- [ ] **Step 4: Implement**

In `src/statEngine.js`, `formatStat`, replace the per-level value line:
```js
        value = {min: Math.floor(e.min / unit), max: Math.floor(e.max * 99 / unit)};
```
with:
```js
        value = span(Math.floor(e.min / unit), Math.floor(e.max * 99 / unit)); // a negative rate prints "-1 to -99"
```

Replace `case 11` in `formatStat` with:
```js
        case 11: {
            // Repair: 1 durability every (2500 / v + 12) / 25 seconds, or "per second" at 30 frames or less.
            // The label takes the same form as the value.
            const frames = e.max > 0 ? Math.trunc(2500 / e.max) : 0;
            if (e.max > 0 && frames > 30) {
                return fill(str("ModStre9u"), label ? ["#", "#"] : ["1", String(Math.trunc((frames + 12) / 25))]);
            }
            return fill(str("ModStre9t"), [label ? "#" : e.max > 0 ? "1" : "25"]);
        }
```

Replace everything from the line `// ---- Description: entries -> lines ---…` down to (not including) `// ---- Loud checks ---…` with:
```js
// ---- Description: entries -> lines ------------------------------------------------------------------

const ELEMENT_PAIRS = [
    {key: "firedamage", min: "firemindam", max: "firemaxdam", single: "strModFireDamage", range: "strModFireDamageRange"},
    {key: "lightdamage", min: "lightmindam", max: "lightmaxdam", single: "strModLightningDamage", range: "strModLightningDamageRange"},
    {key: "magicdamage", min: "magicmindam", max: "magicmaxdam", single: "strModMagicDamage", range: "strModMagicDamageRange"},
    {key: "colddamage", min: "coldmindam", max: "coldmaxdam", single: "strModColdDamage", range: "strModColdDamageRange"},
    {key: "poisondamage", min: "poisonmindam", max: "poisonmaxdam", length: "poisonlength", single: "strModPoisonDamage", range: "strModPoisonDamageRange"},
];

// An entry's sources as one comparable key; entries with no src (the Affixes tab) share one source.
const srcKey = (e) => (e.src ? [...e.src].sort().join(",") : "");

// Sums entries per (stat, layer), the game's way: min to min and max to max, sources united. byRoll entries
// (from an Enhanced Damage mod some of whose rolls give +1 maximum damage instead, func 7) sum apart from
// plain ones and never add across mods: their range runs from the smallest single value to the sum of every
// maximum, which holds every real outcome.
export function sumEntries(entries) {
    const out = new Map();
    for (const e of entries) {
        const id = `${e.stat}/${e.layer}${e.byRoll ? "/byRoll" : ""}`;
        const seen = out.get(id);
        if (!seen) {
            out.set(id, {...e});
            continue;
        }
        const merged = {...seen, min: e.byRoll ? Math.min(seen.min, e.min) : seen.min + e.min, max: seen.max + e.max};
        if (seen.src || e.src) merged.src = new Set([...(seen.src ?? []), ...(e.src ?? [])]);
        out.set(id, merged);
    }
    return [...out.values()];
}

// entries -> lines [{pieces, label, key, priority, order, stats, value, via?, byRoll?}], in the game's order:
// descpriority, highest first (ties by stat id). pieces: the display lines, top first; label: the line
// with "#" for each value; key: the Stat filter key; stats: the stats the line prints (a group line's
// members); value: its first value's range; via: a group line's name; byRoll: the line depends on the roll
// (sumEntries). byRoll entries are described on their own, after the plain lines of the same priority.
export function describe(entries, dict) {
    const summed = sumEntries(entries);
    const lines = [
        ...describeSummed(summed.filter((e) => !e.byRoll), dict),
        ...describeSummed(summed.filter((e) => e.byRoll), dict).map((line) => ({...line, byRoll: true})),
    ];
    return lines.sort((a, b) => b.priority - a.priority || a.order - b.order);
}

// Summed entries (each (stat, layer) at most once) -> lines, unsorted.
function describeSummed(summed, dict) {
    const live = new Map();
    for (const e of summed) if (!isZero(e)) live.set(`${e.stat}/${e.layer}`, e);

    const stat = (name) => dict.stats.get(name);
    const at0 = (name) => live.get(`${name}/0`);
    const take = (...names) => names.forEach((n) => live.delete(`${n}/0`));
    const lines = [];
    const add = ({text, labelText, ...line}) => {
        const pieces = displayPieces(text);
        if (pieces.length) lines.push({...line, pieces, label: displayPieces(labelText).join(" ")});
    };

    // 1. The damage pairs, printed as one line when both halves are present. Single value when min >= max
    // (the game prints the max), else "Adds a-b". Poison converts frames: (v * frames + 128) >> 8 over
    // frames / 25 seconds, every source summed (in-game: Septic + of Blight print 27 over 5 seconds).
    // Overlapping ranges (Snowflake p614/p618/p622, of Frost s176) take the single form only when every roll
    // gives min >= max: an approximation, since some rolls of the range form would print the single form.
    for (const p of ELEMENT_PAIRS) {
        const lo = at0(p.min);
        const hi = at0(p.max);
        if (!lo || !hi) continue;
        const frames = p.length ? at0(p.length)?.max ?? 0 : 0;
        const conv = (r) => (p.length ? {min: (r.min * frames + 128) >> 8, max: (r.max * frames + 128) >> 8} : {min: r.min, max: r.max});
        const a = conv(lo);
        const b = conv(hi);
        const single = a.min >= b.max;
        const fmt = requireString(dict, single ? p.single : p.range, "damage pair");
        const seconds = p.length ? [String(Math.trunc(frames / 25))] : [];
        const values = (label) => (single ? [rangeText(b, {bracket: !!p.length, label})]
            : [rangeText(a, {bracket: true, label}), rangeText(b, {bracket: true, label})]);
        add({text: fill(fmt, [...values(false), ...seconds]), labelText: fill(fmt, [...values(true), ...seconds.map(() => "#")]),
            key: p.key, priority: stat(p.min).priority, order: stat(p.min).id, stats: [p.min, p.max], value: single ? b : a});
        take(p.min, p.max);
    }
    take("coldlength", "poisonlength");

    // Physical damage: "Adds a-b damage" only when min is below max; otherwise each prints its own line.
    const lo = at0("mindamage");
    const hi = at0("maxdamage");
    if (lo && hi && lo.max < hi.min) {
        const fmt = requireString(dict, "strModMinDamageRange", "damage pair");
        add({text: fill(fmt, [rangeText(lo, {bracket: true}), rangeText(hi, {bracket: true})]), labelText: fill(fmt, ["#", "#"]),
            key: "damage", priority: stat("mindamage").priority, order: stat("mindamage").id, stats: ["mindamage", "maxdamage"], value: lo});
        take("mindamage", "maxdamage");
    }

    // Enhanced damage: min% and max% print "+X% Enhanced Damage" together only when they are equal;
    // otherwise each prints its own line.
    const ed = at0("item_mindamage_percent");
    const edMax = at0("item_maxdamage_percent");
    if (ed && edMax && ed.min === edMax.min && ed.max === edMax.max) {
        const name = requireString(dict, "strModEnhancedDamage", "damage pair");
        add({text: `${rangeText(ed, {plus: "signed"})}% ${name}`, labelText: `${rangeText(ed, {plus: "signed", label: true})}% ${name}`,
            key: "enhanceddamage", priority: stat("item_mindamage_percent").priority, order: stat("item_mindamage_percent").id,
            stats: ["item_mindamage_percent", "item_maxdamage_percent"], value: ed});
        take("item_mindamage_percent", "item_maxdamage_percent");
    }

    // 2. dgrp groups: one line when every member is present with the same value and the same sources (four
    // resistances from four affixes roll independently, so they never fold). The member with the lowest
    // stat id prints it, at its own priority, as the game's emission loop does.
    for (const [group, members] of dict.groups) {
        const values = members.map(at0);
        if (values.some((e) => !e || e.min !== values[0].min || e.max !== values[0].max || srcKey(e) !== srcKey(values[0]))) continue;
        const primary = stat(members[0]);
        const d = {func: primary.groupFunc, val: primary.groupVal, pos: primary.groupPos, neg: primary.groupNeg,
            str2: primary.groupStr2, perLevelShift: null};
        add({text: formatStat(d, values[0], dict, false), labelText: formatStat(d, values[0], dict, true), key: `dgrp${group}`,
            priority: primary.priority, order: primary.id, stats: [...members], value: values[0], via: groupName(dict, primary)});
        take(...members);
    }

    // 3. Everything else, by its own descfunc. Sockets print below every modifier.
    const rest = [...live.values()].sort((a, b) => stat(a.stat).id - stat(b.stat).id || a.layer - b.layer);
    for (const e of rest) {
        const d = stat(e.stat);
        if (e.stat === "item_numsockets") {
            const word = requireString(dict, "Socketable", "sockets");
            add({text: `${word} (${rangeText(e)})`, labelText: `${word} (#)`, key: e.stat, priority: -Infinity, order: d.id, stats: [e.stat], value: e});
        } else if (d.func) {
            add({text: formatStat(d, e, dict, false), labelText: formatStat(d, e, dict, true), key: entryKey(e),
                priority: d.priority, order: d.id, stats: [e.stat], value: d.func === 24 ? e.level : e});
        }
    }

    return lines;
}

```

In `src/affixData.js`, `describeAffixes`, replace:
```js
                for (const member of line.stats) {
                    const alone = describe([{stat: member, layer: 0, min: line.value.min, max: line.value.max}], dict)[0];
```
with:
```js
                for (const member of line.stats) {
                    const alone = describe([{stat: member, layer: 0, min: line.value.min, max: line.value.max}], dict)[0];
                    if (!alone) {
                        throw new Error(`stat ${member} (dgrp ${line.key.slice("dgrp".length)}) prints no line of its own: it needs a descfunc in ItemStatCost.txt`);
                    }
```

- [ ] **Step 5: Run the tests to see them pass, golden snapshot included**

Run: `npx vitest run src/statEngine.test.js src/affixData.test.js`
Expected: PASS, including "match the golden snapshot of every row's lines". Then `git status --short src/__snapshots__` must print nothing. If the snapshot test fails, stop and report the diff; don't run `-u`.

- [ ] **Step 6: Run the whole suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass, 0 lint problems.

- [ ] **Step 7: Commit**

```bash
git add src/statEngine.js src/statEngine.test.js src/affixData.js src/affixData.test.js
git commit -m "Stat engine: sumEntries with sources, by-roll lines, source-aware dgrp folding; deferred fixes (ED merge, negative per-level, labels, dgrp member error, func 3/8 test)"
```

---

### Task 2: Base-aware engine (funcs 5/6/7/14, the two-handed pair, `sumEnds`)

**Files:**
- Modify: `src/statEngine.js` (header of `expandMods`, cases 5, 6, 7, 14; `describeSummed`; new `socketCap`, `sumEnds`)
- Modify: `src/statFixtures.js` (new `ENGINE_TEST_BASES`)
- Test: `src/statEngine.test.js`

**Interfaces:**
- Consumes: `sumEntries`, `describe` (Task 1).
- Produces:
  - `ctx = {ilvl: {min, max}, base}` for `expandMods`, where `base` is `null`/absent (Affixes tab) or an engine base `{isWeapon: boolean, dmg1: [min,max]|null, dmg2: [min,max]|null, dmgThrow: [min,max]|null, throwable: boolean, txtMaxDamage: number, cells: number, gemsockets: number, maxSock: [n1, n25, n40]}`.
  - `export function socketCap(base, ilvl)` → number.
  - `export function sumEnds(mods, dict, ctx)` → `{low: Map<stat, number>, high: Map<stat, number>}` (layer-0 totals with every mod at its lowest, then its highest roll).
  - `ENGINE_TEST_BASES` in `src/statFixtures.js`: `{oneHanded, twoHanded, oneOrTwo, throwable, nonWeapon}` engine bases with SoE's numbers (Hand Axe, Giant Axe, Bastard Sword, Throwing Axe, Monarch).

- [ ] **Step 1: Add the test bases to the fixtures**

Append to `src/statFixtures.js`:
```js
// Engine bases (the shape of src/itemTooltip.js engineBase) for the engine's tests, one per kind funcs 5-7
// tell apart, with SoE's numbers: Hand Axe, Giant Axe, Bastard Sword, Throwing Axe, Monarch.
export const ENGINE_TEST_BASES = {
    oneHanded: {isWeapon: true, dmg1: [3, 6], dmg2: null, dmgThrow: null, throwable: false, txtMaxDamage: 6, cells: 3, gemsockets: 2, maxSock: [4, 5, 6]},
    twoHanded: {isWeapon: true, dmg1: null, dmg2: [22, 45], dmgThrow: null, throwable: false, txtMaxDamage: 45, cells: 6, gemsockets: 6, maxSock: [4, 5, 6]},
    oneOrTwo: {isWeapon: true, dmg1: [7, 19], dmg2: [20, 28], dmgThrow: null, throwable: false, txtMaxDamage: 28, cells: 4, gemsockets: 4, maxSock: [3, 4, 6]},
    throwable: {isWeapon: true, dmg1: [4, 7], dmg2: null, dmgThrow: [7, 8], throwable: true, txtMaxDamage: 7, cells: 2, gemsockets: 1, maxSock: [2, 3, 3]},
    nonWeapon: {isWeapon: false, dmg1: null, dmg2: null, dmgThrow: null, throwable: false, txtMaxDamage: 0, cells: 6, gemsockets: 4, maxSock: [3, 3, 4]},
};
```

- [ ] **Step 2: Write the failing tests**

In `src/statEngine.test.js`, change the imports to:
```js
import {chargesAt, checkEntries, describe as describeEntries, displayPieces, entryKey, expandMods, fill, rangeText, skillLevelAt, socketCap, sumEnds, sumEntries} from "./statEngine.js";
import {ENGINE_TEST_BASES as B, realStatData} from "./statFixtures.js";
```

Append:
```js
const on = (base, ilvl = 99) => ({ilvl: {min: ilvl, max: ilvl}, base});
const withRoll = (mods, ctx) => expand(mods, ctx).entries.map((e) => [e.stat, e.min, e.max, !!e.byRoll]);

describe("expandMods with a base", () => {
    const damage = [mod("dmg-min", 5, 5), mod("dmg-max", 10, 10)];

    it("funcs 5 and 6 write the pairs each kind of base carries", () => {
        const stats = (base) => entries(damage, on(base)).map((e) => e.stat);
        expect(stats(null)).toEqual(["mindamage", "maxdamage"]);
        expect(stats(B.oneHanded)).toEqual(["mindamage", "maxdamage"]);
        expect(stats(B.twoHanded)).toEqual(["secondary_mindamage", "secondary_maxdamage"]);
        expect(stats(B.oneOrTwo)).toEqual(["mindamage", "secondary_mindamage", "maxdamage", "secondary_maxdamage"]);
        expect(stats(B.throwable)).toEqual(["mindamage", "item_throw_mindamage", "maxdamage", "item_throw_maxdamage"]);
        expect(stats(B.nonWeapon)).toEqual(["mindamage", "secondary_mindamage", "item_throw_mindamage", "maxdamage", "secondary_maxdamage", "item_throw_maxdamage"]);
    });

    it("prints +min and +max as one line on every kind of base (V1: a Giant Axe shows 'Adds 5-10 damage')", () => {
        for (const base of Object.values(B)) expect(text(damage, on(base))).toEqual(["Adds 5-10 damage"]);
        expect(text([mod("dmg-min", 3, 3)], on(B.twoHanded))).toEqual(["+3 to Minimum Damage"]);
    });

    it("func 7 falls back to +1 maximum damage for rolls with trunc(txtMax * r / 100) <= 0", () => {
        // Jagged 10-20% on a Hand Axe (txt max 6): rolls 10-16 fall back, 17-20 give ED.
        expect(withRoll([mod("dmg%", 10, 20)], on(B.oneHanded))).toEqual([
            ["item_mindamage_percent", 17, 20, true], ["item_maxdamage_percent", 17, 20, true], ["maxdamage", 1, 1, true]]);
        // Cinnabar 5-10% always falls back; Cruel 201-300% never does; armor and no base keep plain ED.
        expect(withRoll([mod("dmg%", 5, 10)], on(B.oneHanded))).toEqual([["maxdamage", 1, 1, false]]);
        expect(withRoll([mod("dmg%", 201, 300)], on(B.oneHanded))).toEqual([
            ["item_mindamage_percent", 201, 300, false], ["item_maxdamage_percent", 201, 300, false]]);
        expect(withRoll([mod("dmg%", 10, 20)], on(B.nonWeapon))).toEqual([
            ["item_mindamage_percent", 10, 20, false], ["item_maxdamage_percent", 10, 20, false]]);
        // A throwing weapon takes the +1 on both of its max stats (func 6's path).
        expect(withRoll([mod("dmg%", 10, 20)], on(B.throwable))).toEqual([
            ["item_mindamage_percent", 15, 20, true], ["item_maxdamage_percent", 15, 20, true],
            ["maxdamage", 1, 1, true], ["item_throw_maxdamage", 1, 1, true]]);
    });

    it("describes Jagged on a Hand Axe as two by-roll lines, and Jagged + Sharp as one range each", () => {
        expect(shown(expand([mod("dmg%", 10, 20)], on(B.oneHanded)).entries)).toEqual([
            ["+17-20% Enhanced Damage", true], ["+1 to Maximum Damage", true]]);
        expect(shown(expand([mod("dmg%", 10, 20), mod("dmg%", 10, 20)], on(B.oneHanded)).entries)).toEqual([
            ["+17-40% Enhanced Damage", true], ["+1-2 to Maximum Damage", true]]);
    });

    it("func 14 clamps sockets to the base's cap at the item level; a cap of 0 drops the entry", () => {
        expect(socketCap(B.oneHanded, 99)).toBe(2); // min(1x3 cells, 2 gem sockets, 6)
        expect(entries([mod("sock", 1, 2)], on(B.oneHanded))).toEqual([{stat: "item_numsockets", layer: 0, min: 1, max: 2}]);
        expect(entries([mod("sock", null, null, "4")], on(B.oneHanded))).toEqual([{stat: "item_numsockets", layer: 0, min: 2, max: 2}]);
        const banded = {...B.nonWeapon, cells: 6, gemsockets: 6, maxSock: [1, 2, 3]};
        expect([25, 26, 40, 41].map((ilvl) => entries([mod("sock", null, null, "4")], on(banded, ilvl))[0].max)).toEqual([1, 2, 2, 3]);
        expect(entries([mod("sock", 1, 2)], on({...B.nonWeapon, gemsockets: 0}))).toEqual([]);
        expect(entries([mod("sock", null, null, "4")])).toEqual([{stat: "item_numsockets", layer: 0, min: 4, max: 4}]); // no base: as before
    });
});

describe("sumEnds", () => {
    it("totals every mod at its lowest roll, then its highest, resolving the func-7 fallback per end", () => {
        const {low, high} = sumEnds([mod("dmg%", 10, 20)], dict, on(B.oneHanded));
        expect([...low]).toEqual([["maxdamage", 1]]);
        expect([...high]).toEqual([["item_mindamage_percent", 20], ["item_maxdamage_percent", 20]]);
    });

    it("adds every source of a stat and skips mods whose funcs don't take the roll (charges)", () => {
        const {low, high} = sumEnds([mod("ac%", 81, 100), mod("ease", -20, -20), mod("ac", 5, 10), mod("ac", 1, 2), mod("charged", -30, -6, "54")], dict, on(B.nonWeapon));
        expect(Object.fromEntries(low)).toEqual({item_armor_percent: 81, item_req_percent: -20, armorclass: 6});
        expect(Object.fromEntries(high)).toEqual({item_armor_percent: 100, item_req_percent: -20, armorclass: 12});
    });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/statEngine.test.js`
Expected: FAIL — `socketCap`/`sumEnds` not exported; funcs 5/6 write only `mindamage`/`maxdamage`; no fallback.

- [ ] **Step 4: Implement**

In `src/statEngine.js`, replace the comment above `expandMods` with:
```js
// mods: [{code, param, min, max}] (min and max may be null). ctx.ilvl: {min, max}, the item levels to
// describe; values that depend on it (charges, proc levels, the socket band) become ranges over it. ctx.base:
// the item's engine base (src/itemTooltip.js engineBase: {isWeapon, dmg1, dmg2, dmgThrow, throwable,
// txtMaxDamage, cells, gemsockets, maxSock}), or null on the Affixes tab, whose output it never changes.
// Returns the entries and the codes Properties.txt doesn't define, which give no stats (as in the game).
// Throws on a property func the engine doesn't implement, a stat missing from ItemStatCost.txt or an
// unknown skill.
```

Insert above that comment:
```js
// The damage stats funcs 5 and 6 write (D2MOO ITEMMODS_PropertyFunc05/06): with no base (the Affixes tab)
// the one-handed pair; on a weapon, the one-handed pair if it has one-handed damage or no two-handed damage,
// the two-handed pair if it has two-handed damage or no one-handed damage, and the throw pair if its type is
// throwable; on any other base, all three.
const DAMAGE_STATS = {
    min: ["mindamage", "secondary_mindamage", "item_throw_mindamage"],
    max: ["maxdamage", "secondary_maxdamage", "item_throw_maxdamage"],
};
function damageStats(base, end) {
    const [one, two, thrown] = DAMAGE_STATS[end];
    if (!base) return [one];
    if (!base.isWeapon) return [one, two, thrown];
    return [
        ...(base.dmg1 || !base.dmg2 ? [one] : []),
        ...(base.dmg2 || !base.dmg1 ? [two] : []),
        ...(base.throwable ? [thrown] : []),
    ];
}

// D2MOO ITEMMODS_PropertyFunc07: on a weapon, a roll r with trunc(txtMaxDamage * r / 100) <= 0 adds +1
// maximum damage (func 6's path) instead of Enhanced Damage. txtMaxDamage is the base's larger txt maximum,
// before ethereal. Whether a roll falls back is monotone in r, so a range splits in two at most. Returns the
// ED range that stays ED (or null), whether some roll adds +1 instead, and whether both happen ("mixed":
// then both parts are byRoll).
function edFallback(base, roll) {
    if (!base?.isWeapon) return {ed: roll, plusMax: false, mixed: false};
    const falls = (r) => Math.trunc((base.txtMaxDamage * r) / 100) <= 0;
    if (!falls(roll.min)) return {ed: roll, plusMax: false, mixed: false};
    if (falls(roll.max)) return {ed: null, plusMax: true, mixed: false};
    let first = roll.min;
    while (falls(first)) first++;
    return {ed: {min: first, max: roll.max}, plusMax: true, mixed: true};
}

// D2MOO ITEMS_GetMaxSockets: a base's socket cap at item level ilvl, the smallest of its inventory cells,
// its gem sockets and its type's MaxSock for the ilvl band (1-25, 26-40, 41+).
export function socketCap(base, ilvl) {
    const band = ilvl <= 25 ? 0 : ilvl <= 40 ? 1 : 2;
    return Math.min(base.cells, base.gemsockets, base.maxSock[band]);
}
```

Replace cases 5, 6 and 7 in `expandMods` with:
```js
                case 5:
                    value = reuse;
                    for (const stat of damageStats(ctx.base, "min")) push(stat, 0, value);
                    break;
                case 6:
                    value = reuse;
                    for (const stat of damageStats(ctx.base, "max")) push(stat, 0, value);
                    break;
                case 7: {
                    value = reuse;
                    const {ed, plusMax, mixed} = edFallback(ctx.base, value);
                    const tag = mixed ? {byRoll: true} : {};
                    if (ed) for (const stat of ["item_mindamage_percent", "item_maxdamage_percent"]) push(stat, 0, ed, tag);
                    if (plusMax) for (const stat of damageStats(ctx.base, "max")) push(stat, 0, fixed(1), tag);
                    break;
                }
```

Replace case 14 with:
```js
                case 14: {
                    // Sockets: the roll, or the param when there is none; with a base, clamped to its cap at the
                    // item level (a cap of 0 drops the entry). Sockets SET, not add; every socket row is in group
                    // 122, so two never meet and summing stays safe.
                    const n = reuse.min > 0 ? reuse : fixed(param);
                    value = {min: Math.max(1, n.min), max: Math.max(1, n.max)};
                    if (ctx.base) {
                        const [lo, hi] = levels();
                        value = {min: Math.min(value.min, socketCap(ctx.base, lo)), max: Math.min(value.max, socketCap(ctx.base, hi))};
                    }
                    push(slot.stat, 0, value);
                    break;
                }
```

In `describeSummed` (from Task 1), insert right after the `const add = …;` definition:
```js
    // A 1-or-2-handed weapon carries both pairs from the same mods; the game prints the one-handed one.
    // This runs before the pairs are taken.
    for (const [one, two] of [["mindamage", "secondary_mindamage"], ["maxdamage", "secondary_maxdamage"]]) {
        if (at0(one) && at0(two)) take(two);
    }
```

Replace the "Physical damage" block (from its comment through its closing `}`) with:
```js
    // Physical damage: "Adds a-b damage" only when min is below max, for the one-handed pair and for the
    // two-handed one (V1: a Giant Axe with +5 min and +10 max prints "Adds 5-10 damage", as a Hand Axe does);
    // otherwise each prints its own line.
    for (const [min, max] of [["mindamage", "maxdamage"], ["secondary_mindamage", "secondary_maxdamage"]]) {
        const lo = at0(min);
        const hi = at0(max);
        if (!lo || !hi || lo.max >= hi.min) continue;
        const fmt = requireString(dict, "strModMinDamageRange", "damage pair");
        add({text: fill(fmt, [rangeText(lo, {bracket: true}), rangeText(hi, {bracket: true})]), labelText: fill(fmt, ["#", "#"]),
            key: "damage", priority: stat(min).priority, order: stat(min).id, stats: [min, max], value: lo});
        take(min, max);
    }
```

Add after the `describe` function (before `describeSummed`):
```js
// The base lines' totals (src/baseLines.js): every mod collapsed to its lowest roll, then to its highest,
// expanded and summed per stat (layer 0): two exact totals, with the func-7 fallback resolved at each end.
// Only mods whose funcs take the roll (1-3, 5-8) count; the others (charges, procs, sockets) never feed a
// base line, and the base lines read only their own stats, never the per-level ones. Every term is monotone in its roll, so the two ends bound every roll,
// with one theoretical exception: on a 1-or-2-handed base whose smaller pair is below txtMaxDamage, the
// first ED roll past the fallback can add 0 where the fallback added 1. No pair that can roll in SoE hits
// it (src/itemTooltip.test.js pins the current data).
const ROLL_FUNCS = new Set([1, 2, 3, 5, 6, 7, 8]);
export function sumEnds(mods, dict, ctx) {
    const rolled = mods.filter((m) => dict.properties.get(String(m.code).toLowerCase())?.every((s) => ROLL_FUNCS.has(s.func)));
    const at = (end) => {
        const collapsed = rolled.map((m) => {
            const r = span(m.min ?? 0, m.max ?? 0);
            const v = end === "low" ? r.min : r.max;
            return {...m, min: v, max: v};
        });
        const totals = new Map();
        for (const e of expandMods(collapsed, dict, ctx).entries) {
            if (e.layer === 0) totals.set(e.stat, (totals.get(e.stat) ?? 0) + e.min);
        }
        return totals;
    };
    return {low: at("low"), high: at("high")};
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run src/statEngine.test.js src/affixData.test.js`
Expected: PASS, golden snapshot unchanged (`git status --short src/__snapshots__` prints nothing).

- [ ] **Step 6: Full suite and lint**

Run: `npm test && npm run lint`
Expected: PASS, 0 problems.

- [ ] **Step 7: Commit**

```bash
git add src/statEngine.js src/statEngine.test.js src/statFixtures.js
git commit -m "Stat engine: base-aware funcs 5/6/7/14, the two-handed damage pair (V1), socketCap and sumEnds"
```

---

### Task 3: The trimmed stat dictionary, BlockFactor and the tooltip strings

**Files:**
- Modify: `src/statData.js` (CharStats `BlockFactor`; `HARDCODED_STRINGS` minus `strModMinDamage`; new `ENGINE_STATS`, `TOOLTIP_STRINGS`, `trimStatData`, `statDataFromJson`; shared index helpers)
- Modify: `tools/extract-base-strings.mjs` (also keep `TOOLTIP_STRINGS`)
- Modify: `src/baseStrings.json` (regenerated)
- Test: `src/statData.test.js`

**Interfaces:**
- Consumes: `describe`, `expandMods` (Tasks 1–2), `ENGINE_TEST_BASES` (Task 2), `realAffixData` (existing fixture).
- Produces:
  - `dict.classes[i].blockFactor: number`.
  - `export const ENGINE_STATS: string[]`, `export const TOOLTIP_STRINGS: string[]`.
  - `export function trimStatData(dict, mods)` → plain JSON object `{properties: [[code, slots]], stats: [statRow], classes: [classRow], skills: [skillRow], strings: {key: value}}`.
  - `export function statDataFromJson(json)` → a dictionary with the same shape as `buildStatData`'s (`properties`, `stats`, `groups`, `classes`, `skills`, `skillIds`, `string`). Throws `"statDict: malformed (expected properties, stats, classes, skills and strings)"` on a bad shape.

- [ ] **Step 1: Write the failing tests**

In `src/statData.test.js`, replace the imports with:
```js
import {describe, expect, it} from "vitest";
import {ENGINE_STATS, STAT_TABLE_COLUMNS, TOOLTIP_STRINGS, buildStatData, skillName, skillOf, statDataFromJson, trimStatData} from "./statData.js";
import {describe as describeEntries, expandMods} from "./statEngine.js";
import {ENGINE_TEST_BASES, realAffixData, realStatData, tableText} from "./statFixtures.js";
```

In `tinyTexts`, give the Amazon CharStats row `BlockFactor: "25"` (add the field to that object). Add to `describe("buildStatData", …)`:
```js
    it("reads each class's BlockFactor", () => {
        expect(tiny().classes[0].blockFactor).toBe(25);
    });
```

Add to `describe("the real stat tables", …)`:
```js
    it("give each class its BlockFactor and resolve the tooltip's labels", () => {
        expect(Object.fromEntries(dict.classes.map((c) => [c.name, c.blockFactor]))).toEqual({
            Amazon: 25, Sorceress: 20, Necromancer: 20, Paladin: 30, Barbarian: 25, Druid: 20, Assassin: 25});
        for (const key of TOOLTIP_STRINGS) expect(dict.string(key), key).not.toBeNull();
        expect(dict.string("ItemStats1r")).toBe("Chance to Block: ");
        expect(dict.string("Charmdes")).toBe("Keep in Inventory to Gain Bonus");
    });
```

Append:
```js
describe("trimStatData and statDataFromJson", () => {
    const full = realStatData();
    const affixes = realAffixData().rows;
    const json = trimStatData(full, affixes.flatMap((a) => a.mods));
    const trimmed = statDataFromJson(JSON.parse(JSON.stringify(json)));
    const lines = (d, ctx) => affixes.map((a) => describeEntries(expandMods(a.mods, d, ctx).entries, d)
        .map((l) => [l.pieces, l.label, l.key, !!l.byRoll]));

    it("describe every affix exactly as the full dictionary does, at ilvl 1 and 99, with no base and on each kind of base", () => {
        for (const base of [null, ...Object.values(ENGINE_TEST_BASES)]) {
            for (const ilvl of [1, 99]) {
                const ctx = {ilvl: {min: ilvl, max: ilvl}, base};
                expect(lines(trimmed, ctx)).toEqual(lines(full, ctx));
            }
        }
    });

    it("keep every engine stat, every tooltip string and the class rows with their BlockFactor", () => {
        for (const stat of ENGINE_STATS) expect(trimmed.stats.has(stat), stat).toBe(true);
        for (const key of TOOLTIP_STRINGS) expect(trimmed.string(key), key).toBe(full.string(key));
        expect(trimmed.classes).toEqual(full.classes);
        expect(trimmed.groups.get(2)).toEqual(full.groups.get(2));
    });

    it("stay small (about 56 KB before gzip)", () => {
        expect(JSON.stringify(json).length).toBeLessThan(80_000);
    });

    it("fails loudly when a tooltip label is missing", () => {
        const odd = {...full, string: (key) => (key === "Charmdes" ? null : full.string(key))};
        expect(() => trimStatData(odd, [])).toThrow(/trimStatData: tooltip string\(s\) "Charmdes"/);
    });

    it("statDataFromJson rejects a malformed dictionary", () => {
        expect(() => statDataFromJson(undefined)).toThrow("statDict: malformed");
        expect(() => statDataFromJson({properties: [], stats: []})).toThrow("statDict: malformed");
    });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/statData.test.js`
Expected: FAIL — `trimStatData`/`statDataFromJson`/`ENGINE_STATS`/`TOOLTIP_STRINGS` are not exported; `blockFactor` undefined; the tooltip strings missing.

- [ ] **Step 3: Implement `statData.js`**

In `STAT_TABLE_COLUMNS`, change the CharStats entry to:
```js
    CharStats: ["class", "StrAllSkills", ...numbered("StrSkillTab", 3), "StrClassOnly", "BlockFactor"],
```

Replace `HARDCODED_STRINGS` and its comment with:
```js
// The string keys the stat engine uses without any table naming them: the damage pairs, repair, charges
// and sockets. tools/extract-base-strings.mjs keeps them in src/baseStrings.json.
export const HARDCODED_STRINGS = [
    "strModMinDamageRange", "strModEnhancedDamage",
    "strModFireDamage", "strModFireDamageRange", "strModLightningDamage", "strModLightningDamageRange",
    "strModMagicDamage", "strModMagicDamageRange", "strModColdDamage", "strModColdDamageRange",
    "strModPoisonDamage", "strModPoisonDamageRange",
    "ModStre9t", "ModStre9u", "ModStre10b", "Socketable",
];

// The item tooltip's own labels (src/itemTooltip.js). "ItemStast1k" is the game's own spelling.
// tools/extract-base-strings.mjs keeps the base game's ones in src/baseStrings.json.
export const TOOLTIP_STRINGS = [
    "ItemStats1h", "ItemStats1r", "ItemStats1l", "ItemStats1m", "ItemStats1n", "ItemStast1k", "ItemStats1i",
    "ItemStats1d", "ItemStats1j", "ItemStats1f", "ItemStats1e", "ItemStats1p", "strEtherealDisplay",
    "strSocketedDisplay", "Charmdes",
];

// The stats the engine writes or reads by name rather than through a Properties.txt stat column: funcs 5-7
// have empty stat columns, describe reads the pairs and lengths, func 20 writes indestructible, and the
// tooltip reads sockets. trimStatData keeps them all. (Here, not in statEngine.js, which imports this file.)
export const ENGINE_STATS = [
    "mindamage", "maxdamage", "secondary_mindamage", "secondary_maxdamage", "item_throw_mindamage", "item_throw_maxdamage",
    "item_mindamage_percent", "item_maxdamage_percent", "firemindam", "firemaxdam", "lightmindam", "lightmaxdam",
    "magicmindam", "magicmaxdam", "coldmindam", "coldmaxdam", "coldlength", "poisonmindam", "poisonmaxdam", "poisonlength",
    "item_indesctructible", "item_numsockets",
];
```

Add these helpers above `buildStatData`:
```js
// The lookups both dictionary builders share: each dgrp group's members by stat id, and skill ids by
// lower-case name (the first skill with a name wins, as in the game's lookup).
function indexGroups(statList) {
    const groups = new Map();
    for (const s of statList) if (s.group) groups.set(s.group, [...(groups.get(s.group) ?? []), s.name]);
    const id = new Map(statList.map((s) => [s.name, s.id]));
    for (const members of groups.values()) members.sort((a, b) => id.get(a) - id.get(b));
    return groups;
}

function indexSkillNames(skillList) {
    const ids = new Map();
    for (const s of skillList) if (!ids.has(s.name.toLowerCase())) ids.set(s.name.toLowerCase(), s.id);
    return ids;
}
```

In `buildStatData`:
- Delete the `const groups = new Map();` line, the `if (stat.group) groups.set(…)` line inside the ItemStatCost loop, and the `for (const members of groups.values()) members.sort(…)` line; after the loop add `const groups = indexGroups([...stats.values()]);`.
- In the class mapping, add `blockFactor: int(row.BlockFactor),` after `classOnly: cell(row.StrClassOnly),`.
- Delete `const skillIds = new Map();` and the `if (!skillIds.has(…)) skillIds.set(…)` line in the Skills loop; after the loop add `const skillIds = indexSkillNames([...skills.values()]);`.

Append to `src/statData.js`:
```js
// ---- The trimmed dictionary (ItemBuilder.json's statDict) -------------------------------------------

// What the Item Builder's engine needs, as plain JSON: the builder's property codes, the stats they write
// (with every member of each dgrp group they touch) plus ENGINE_STATS, the skills their params name, every
// CharStats class row, and the resolved strings of all of these plus HARDCODED_STRINGS and TOOLTIP_STRINGS.
// A trimmed string is final (patch, then expansion, then base already applied). mods: every builder affix's
// mods. Stats and skills keep their table order.
export function trimStatData(dict, mods) {
    const codes = new Set(mods.map((m) => String(m.code).toLowerCase()).filter((c) => dict.properties.has(c)));
    const stats = new Set(ENGINE_STATS);
    for (const code of codes) for (const slot of dict.properties.get(code)) if (slot.stat) stats.add(slot.stat);
    for (const name of [...stats]) {
        const s = dict.stats.get(name);
        if (!s) throw new Error(`trimStatData: stat "${name}" is not in ItemStatCost.txt`);
        if (s.group) for (const member of dict.groups.get(s.group)) stats.add(member);
    }
    const skillIds = new Set();
    for (const m of mods) {
        const slots = dict.properties.get(String(m.code).toLowerCase());
        if (slots?.some((s) => s.func === 11 || s.func === 19)) skillIds.add(skillOf(dict, m.param).id);
    }

    // The tooltip reads its labels by name, so the trimmed-dictionary line check can't see a missing one.
    const missingLabels = TOOLTIP_STRINGS.filter((key) => dict.string(key) === null);
    if (missingLabels.length) {
        throw new Error(`trimStatData: tooltip string(s) ${missingLabels.map((k) => `"${k}"`).join(", ")} in neither patchstring.tbl nor baseStrings.json`);
    }

    const statRows = [...dict.stats.values()].filter((s) => stats.has(s.name));
    const skillRows = [...dict.skills.values()].filter((s) => skillIds.has(s.id));
    const keys = new Set([...HARDCODED_STRINGS, ...TOOLTIP_STRINGS]);
    for (const s of statRows) for (const k of [s.pos, s.neg, s.str2, s.groupPos, s.groupNeg, s.groupStr2]) if (k) keys.add(k);
    for (const c of dict.classes) for (const k of [c.allSkills, ...c.tabs, c.classOnly]) if (k) keys.add(k);
    for (const s of skillRows) if (s.nameKey) keys.add(s.nameKey);
    const strings = {};
    for (const key of [...keys].sort()) {
        const value = dict.string(key);
        if (value !== null) strings[key] = value;
    }

    return {
        properties: [...codes].sort().map((code) => [code, dict.properties.get(code)]),
        stats: statRows,
        classes: dict.classes,
        skills: skillRows,
        strings,
    };
}

// trimStatData's JSON -> a dictionary like buildStatData's, in the browser.
export function statDataFromJson(json) {
    const ok = json && Array.isArray(json.properties) && Array.isArray(json.stats) && Array.isArray(json.classes)
        && Array.isArray(json.skills) && json.strings && typeof json.strings === "object";
    if (!ok) throw new Error("statDict: malformed (expected properties, stats, classes, skills and strings)");
    const strings = new Map(Object.entries(json.strings));
    return {
        properties: new Map(json.properties),
        stats: new Map(json.stats.map((s) => [s.name, s])),
        groups: indexGroups(json.stats),
        classes: json.classes,
        skills: new Map(json.skills.map((s) => [s.id, s])),
        skillIds: indexSkillNames(json.skills),
        string: (key) => (key ? strings.get(key) ?? null : null),
    };
}
```

- [ ] **Step 4: Teach the string extractor the tooltip keys and regenerate `baseStrings.json`**

In `tools/extract-base-strings.mjs`, change the import to:
```js
import {HARDCODED_STRINGS, TOOLTIP_STRINGS} from "../src/statData.js";
```
and the key set to:
```js
const keys = new Set([...HARDCODED_STRINGS, ...TOOLTIP_STRINGS]);
```
Also change the header comment's "for every key the committed tables or the stat engine can ask for" to "for every key the committed tables, the stat engine or the item tooltip can ask for".

Run:
```bash
node tools/extract-base-strings.mjs docs/research/stat-summing/modrepo/string.tbl docs/research/stat-summing/modrepo/expansionstring.tbl
git diff src/baseStrings.json | grep '^[+-] '
```
Expected: 12 added keys (`Charmdes`, `ItemStast1k`, `ItemStats1d`, `ItemStats1e`, `ItemStats1f`, `ItemStats1h`, `ItemStats1i`, `ItemStats1j`, `ItemStats1l`, `ItemStats1m`, `ItemStats1n`, `ItemStats1p`) and one removed (`strModMinDamage`). `ItemStats1r`, `strEtherealDisplay` and `strSocketedDisplay` come from SoE's `patchstring.tbl`, so they are not added. If any other key changes, stop and report it.

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run src/statData.test.js src/statEngine.test.js src/affixData.test.js`
Expected: PASS (golden snapshot unchanged).

- [ ] **Step 6: Full suite and lint**

Run: `npm test && npm run lint`
Expected: PASS, 0 problems.

- [ ] **Step 7: Commit**

```bash
git add src/statData.js src/statData.test.js tools/extract-base-strings.mjs src/baseStrings.json
git commit -m "Stat data: trimStatData/statDataFromJson, ENGINE_STATS, TOOLTIP_STRINGS, CharStats BlockFactor; strModMinDamage dropped"
```

---

### Task 4: The base-line formulas (`src/baseLines.js`)

**Files:**
- Create: `src/baseLines.js`
- Test: `src/baseLines.test.js`

**Interfaces:**
- Consumes: totals in `sumEnds`' shape (`{low: Map, high: Map}`).
- Produces (all pure):
  - `BLOCK_CAP = 80`, `CLASS_ABBREVIATIONS`, `pct(x, p)`, `ethereal(x)`, `rangeOf({low, high})` → `"5"` or `"5-9"`.
  - `checkBlockClasses(classes)` → throws on a class with no abbreviation.
  - `defense(base, {eth, totals})` → `{low, high, changed}`.
  - `blockChance(base, {classes, onlyClass, totals})` → `{low, high, entries: [{classes, low, high}], changed}`; `blockText(block)` → `"22% (Pal: 52%, …)"`.
  - `damage(txt, {eth, totals, minStat, maxStat, clamp})` → `{min: {low, high}, max: {low, high}, changed}`; `damageText(d, to)` → `"111-148 to 375-507"`.
  - `requirement(value, {eth, totals})` → `{low, high}` or `null`.

- [ ] **Step 1: Write the failing tests**

Create `src/baseLines.test.js`:
```js
import {describe, expect, it} from "vitest";
import {BLOCK_CAP, blockChance, blockText, checkBlockClasses, damage, damageText, defense, ethereal, pct, rangeOf, requirement} from "./baseLines.js";

// sumEnds-shaped totals: {low: Map, high: Map}.
const T = (low, high = low) => ({low: new Map(Object.entries(low)), high: new Map(Object.entries(high))});
const NONE = T({});
// SoE's CharStats order and BlockFactors.
const CLASSES = [["Amazon", 25], ["Sorceress", 20], ["Necromancer", 20], ["Paladin", 30], ["Barbarian", 25], ["Druid", 20], ["Assassin", 25]]
    .map(([name, blockFactor]) => ({name, blockFactor}));

describe("rounding", () => {
    it("truncates percentages toward zero and ethereal x5/4", () => {
        expect(pct(156, -20)).toBe(-31);
        expect(pct(37, 201)).toBe(74);
        expect(ethereal(149)).toBe(186);
        expect(ethereal(234)).toBe(292); // Skullder's Ire: rounding to nearest would give 293
        expect(rangeOf({low: 5, high: 5})).toBe("5");
        expect(rangeOf({low: 5, high: 9})).toBe("5-9");
    });
});

describe("defense", () => {
    const monarch = {minac: 133, maxac: 148};

    it("forces maxac + 1 with ac%, then ethereal, then ED (the worked example: Holy, ethereal Monarch)", () => {
        expect(defense(monarch, {eth: true, totals: T({item_armor_percent: 81}, {item_armor_percent: 100})})).toEqual({low: 336, high: 372, changed: true});
    });

    it("matches the PD2 wiki's ethereal uniques (Skullder's Ire, Purgatory)", () => {
        expect(defense({minac: 0, maxac: 233}, {eth: true, totals: T({item_armor_percent: 160}, {item_armor_percent: 200})})).toMatchObject({low: 759, high: 876});
        expect(defense({minac: 0, maxac: 407}, {eth: true, totals: T({item_armor_percent: 220}, {item_armor_percent: 260})})).toMatchObject({low: 1632, high: 1836});
    });

    it("keeps the base range without ac%, adds flat defense unmultiplied, and stays white for ethereal alone", () => {
        expect(defense(monarch, {eth: false, totals: NONE})).toEqual({low: 133, high: 148, changed: false});
        expect(defense(monarch, {eth: true, totals: NONE})).toEqual({low: 166, high: 185, changed: false});
        expect(defense(monarch, {eth: false, totals: T({armorclass: 10})})).toEqual({low: 143, high: 158, changed: true});
    });
});

describe("blockChance", () => {
    it("shows the item's block, then each BlockFactor group, highest first, classes alphabetical", () => {
        const b = blockChance({block: 22}, {classes: CLASSES, onlyClass: null, totals: NONE});
        expect(blockText(b)).toBe("22% (Pal: 52%, Ama/Asn/Bar: 47%, Dru/Nec/Sor: 42%)");
        expect(b.changed).toBe(false);
    });

    it(`caps every number at ${BLOCK_CAP} and turns blue only with a block affix (Aegis of Deflecting)`, () => {
        const b = blockChance({block: 46}, {classes: CLASSES, onlyClass: null, totals: T({toblock: 20})});
        expect(blockText(b)).toBe("66% (Pal: 80%, Ama/Asn/Bar: 80%, Dru/Nec/Sor: 80%)");
        expect(b.changed).toBe(true);
        expect(blockText(blockChance({block: 90}, {classes: CLASSES, onlyClass: "Paladin", totals: NONE}))).toBe("80% (Pal: 80%)");
    });

    it("shows one class on a class-only shield (Paladin shields, Necromancer heads)", () => {
        expect(blockText(blockChance({block: 10}, {classes: CLASSES, onlyClass: "Paladin", totals: NONE}))).toBe("10% (Pal: 40%)");
        expect(blockText(blockChance({block: 3}, {classes: CLASSES, onlyClass: "Necromancer", totals: NONE}))).toBe("3% (Nec: 23%)");
    });

    it("fails loudly on a class with no abbreviation", () => {
        expect(() => checkBlockClasses([...CLASSES, {name: "Warlock", blockFactor: 20}])).toThrow(/no block abbreviation for class\(es\) Warlock/);
        expect(() => checkBlockClasses(CLASSES)).not.toThrow();
    });
});

describe("damage", () => {
    const oneHand = {minStat: "mindamage", maxStat: "maxdamage", clamp: true};
    const twoHand = {minStat: "secondary_mindamage", maxStat: "secondary_maxdamage", clamp: true};

    it("the worked example: ethereal Cruel Berserker Axe of Evisceration", () => {
        const totals = T({item_mindamage_percent: 201, item_maxdamage_percent: 201, maxdamage: 41},
            {item_mindamage_percent: 300, item_maxdamage_percent: 300, maxdamage: 63});
        const d = damage([30, 89], {eth: true, totals, ...oneHand});
        expect(damageText(d, "to")).toBe("111-148 to 375-507");
        expect(d.changed).toBe(true);
    });

    it("matches the PD2 wiki's ethereal two-handers (Warlord's Trust, Ethereal Edge)", () => {
        const ed = (lo, hi) => T({item_mindamage_percent: lo, item_maxdamage_percent: lo}, {item_mindamage_percent: hi, item_maxdamage_percent: hi});
        expect(damageText(damage([21, 61], {eth: true, totals: ed(175, 255), ...twoHand}), "to")).toBe("71-92 to 209-269");
        expect(damageText(damage([78, 138], {eth: true, totals: ed(150, 180), ...twoHand}), "to")).toBe("242-271 to 430-481");
    });

    it("Jagged on a Hand Axe: +1 max at the low end, ED at the high end, exact at both", () => {
        const totals = T({maxdamage: 1}, {item_mindamage_percent: 20, item_maxdamage_percent: 20});
        expect(damageText(damage([3, 6], {eth: false, totals, ...oneHand}), "to")).toBe("3 to 7");
    });

    it("clamps the main line's max to min + 1 but not the others, and stays white for ethereal alone", () => {
        expect(damageText(damage([5, 5], {eth: false, totals: NONE, ...oneHand}), "to")).toBe("5 to 6");
        expect(damageText(damage([5, 5], {eth: false, totals: NONE, ...oneHand, clamp: false}), "to")).toBe("5 to 5");
        const eth = damage([30, 89], {eth: true, totals: NONE, ...oneHand});
        expect([damageText(eth, "to"), eth.changed]).toEqual(["37 to 111", false]);
    });
});

describe("requirement", () => {
    it("applies the percent first, then -10 for ethereal, with no clamp (Monarch of Ease: 115)", () => {
        expect(requirement(156, {eth: true, totals: T({item_req_percent: -20})})).toEqual({low: 115, high: 115});
    });

    it("is hidden when the base has none or the total is <= 0 (U3: ethereal Buckler)", () => {
        expect(requirement(12, {eth: true, totals: T({item_req_percent: -20})})).toBeNull();
        expect(requirement(12, {eth: true, totals: NONE})).toEqual({low: 2, high: 2});
        expect(requirement(0, {eth: false, totals: NONE})).toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/baseLines.test.js`
Expected: FAIL — cannot resolve `./baseLines.js`.

- [ ] **Step 3: Implement**

Create `src/baseLines.js`:
```js
// The item tooltip's base lines (spec "Base lines"): defense, block, damage and requirements, from the
// base's txt values and the affixes' totals at both ends (statEngine.js sumEnds: {low, high} Maps of stat ->
// value). PD2 rules: ethereal is x5/4 by truncation and -10 Str/Dex; percentages truncate toward zero. Pure;
// the labels and the line order are src/itemTooltip.js's.

// SoE 13.0.0: "Increased Maximum Block Chance from 75% to 80%". It is in the game code, not the tables.
export const BLOCK_CAP = 80;

// The Arreat Summit's abbreviations, by CharStats class name.
export const CLASS_ABBREVIATIONS = {
    Amazon: "Ama", Assassin: "Asn", Barbarian: "Bar", Druid: "Dru", Necromancer: "Nec", Paladin: "Pal", Sorceress: "Sor",
};

export const pct = (x, p) => Math.trunc((x * p) / 100);
export const ethereal = (x) => Math.trunc((x * 5) / 4);

const ENDS = ["low", "high"];
const total = (totals, end, stat) => totals[end].get(stat) ?? 0;

// One value when both ends agree, "lo-hi" otherwise.
export const rangeOf = ({low, high}) => (low === high ? String(low) : `${Math.min(low, high)}-${Math.max(low, high)}`);

export function checkBlockClasses(classes) {
    const missing = classes.filter((c) => !CLASS_ABBREVIATIONS[c.name]).map((c) => c.name);
    if (missing.length) throw new Error(`no block abbreviation for class(es) ${missing.join(", ")} (add them to CLASS_ABBREVIATIONS in src/baseLines.js)`);
}

// Defense = B + flat + pct(B, ac%), where B is maxac + 1 when any ac% is present (func 2 forces it), else
// minac..maxac, times 5/4 when ethereal. Blue when the affixes change it from B.
export function defense(base, {eth, totals}) {
    const acPercent = ENDS.some((end) => total(totals, end, "item_armor_percent") !== 0);
    const at = (end) => {
        const b0 = acPercent ? base.maxac + 1 : end === "low" ? base.minac : base.maxac;
        const b = eth ? ethereal(b0) : b0;
        return {b, d: b + total(totals, end, "armorclass") + pct(b, total(totals, end, "item_armor_percent"))};
    };
    const [lo, hi] = ENDS.map(at);
    return {low: lo.d, high: hi.d, changed: lo.d !== lo.b || hi.d !== hi.b};
}

// The item's block (Armor.txt block + the affixes' toblock; ethereal doesn't change it), then per class
// min(cap, block + BlockFactor). Classes with equal BlockFactor share an entry; entries go highest first, the
// classes inside one alphabetically. onlyClass: a class-only shield's class name (one entry). Blue only when
// an affix adds block (U11).
export function blockChance(base, {classes, onlyClass, totals}) {
    checkBlockClasses(classes);
    const cap = (v) => Math.min(BLOCK_CAP, v);
    const [own0, own1] = ENDS.map((end) => base.block + total(totals, end, "toblock"));
    const byFactor = new Map();
    for (const c of classes.filter((x) => !onlyClass || x.name === onlyClass)) {
        byFactor.set(c.blockFactor, [...(byFactor.get(c.blockFactor) ?? []), CLASS_ABBREVIATIONS[c.name]]);
    }
    const entries = [...byFactor].sort((a, b) => b[0] - a[0])
        .map(([factor, abbrs]) => ({classes: [...abbrs].sort().join("/"), low: cap(own0 + factor), high: cap(own1 + factor)}));
    return {low: cap(own0), high: cap(own1), entries, changed: ENDS.some((end) => total(totals, end, "toblock") !== 0)};
}

export const blockText = (block) => `${rangeOf(block)}% (${block.entries.map((e) => `${e.classes}: ${rangeOf(e)}%`).join(", ")})`;

// One damage pair: b = the txt value (x5/4 when ethereal); min = b_min + flat min + pct(b_min, min%), max
// likewise with the pair's own flat stat and max%. clamp: the main line keeps max >= min + 1 (1.14d
// 0x485931); the throw and "(Bar)" lines don't. Blue when a merged value exceeds b.
export function damage(txt, {eth, totals, minStat, maxStat, clamp}) {
    const [bmin, bmax] = eth ? txt.map(ethereal) : txt;
    const at = (end) => ({
        min: bmin + total(totals, end, minStat) + pct(bmin, total(totals, end, "item_mindamage_percent")),
        max: bmax + total(totals, end, maxStat) + pct(bmax, total(totals, end, "item_maxdamage_percent")),
    });
    const [lo, hi] = ENDS.map(at);
    const changed = lo.min > bmin || hi.min > bmin || lo.max > bmax || hi.max > bmax;
    const top = (x) => (clamp ? Math.max(x.max, x.min + 1) : x.max);
    return {min: {low: lo.min, high: hi.min}, max: {low: top(lo), high: top(hi)}, changed};
}

export const damageText = (d, to) => `${rangeOf(d.min)} ${to} ${rangeOf(d.max)}`;

// Required Strength or Dexterity: base + pct(base, ease%) - 10 when ethereal (D2MOO ITEMS_CheckRequirements;
// verified U3). null (no line) when the base has none or the high end is <= 0.
export function requirement(value, {eth, totals}) {
    if (!value) return null;
    const [a, b] = ENDS.map((end) => value + pct(value, total(totals, end, "item_req_percent")) - (eth ? 10 : 0));
    const r = {low: Math.min(a, b), high: Math.max(a, b)};
    return r.high > 0 ? r : null;
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/baseLines.test.js`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: 0 problems.

- [ ] **Step 6: Commit**

```bash
git add src/baseLines.js src/baseLines.test.js
git commit -m "baseLines.js: defense, per-class block (cap 80), damage, requirements, with PD2's ethereal rules"
```

---

### Task 5: `ItemBuilder.json` version 3 (base and type fields, the trimmed dictionary and its loud check)

**Files:**
- Create: `src/itemTooltip.js` (first part: `engineBase`, `expandPicks`, `checkTrimmedStatData`)
- Modify: `src/itemBuilderData.js` (version 3, columns, `buildTypes`, `BASE_DEFAULTS`, `toBase`, `buildItemBuilderJson`, `prepareItemBuilder`)
- Modify: `vite.config.js` (pass `dict`)
- Modify: `src/itemBuilderFixtures.js` (`EMPTY_STAT_DICT`, `dict` input, memoised real model, `tinyModelJson`)
- Modify tests: `src/itemBuilderData.test.js`, `src/itemBuilderOdds.test.js`, `src/itemBuilderLoad.test.js`
- Test: `src/itemTooltip.test.js` (new)

**Interfaces:**
- Consumes: `trimStatData`, `statDataFromJson` (Task 3); `checkBlockClasses` (Task 4); `expandMods`, `describe` (Tasks 1–2); `baseChain` (`itemBuilderRules.js`).
- Produces:
  - Every type in `json.types`: `{chain, class, rare, throwable: boolean, charm: boolean, maxSock: [n1, n25, n40]}`.
  - Every base after `prepareItemBuilder`: the old fields plus `BASE_DEFAULTS`' keys: `minac, maxac, block, dmg1, dmg2, dmgThrow, twoHanded, oneOrTwo, reqstr, reqdex, durability, nodurability, gemsockets, invwidth, invheight, maxstack, canEthereal`. In the file, keys equal to their default are left out.
  - `model.dict`: the browser dictionary (`statDataFromJson(json.statDict)`).
  - `buildItemBuilderJson({texts, affixes, weaponsJson, armorsJson, dict})` → `{version: 3, types, bases, affixes, statDict}`.
  - `engineBase(model, base)` → the engine base shape of Task 2 (memoised per base object).
  - `expandPicks(picks, dict, ctx)` → entries, each with `src: Set(["<pick index>:<mod index>"])`.
  - `checkTrimmedStatData({full, trimmed, affixes, types, bases})` → throws on the first difference.
  - Fixtures: `EMPTY_STAT_DICT`, `tinyModelJson()`, `tinyModel()`, `realItemBuilderModel()` (memoised).

- [ ] **Step 1: Update the fixtures**

In `src/itemBuilderFixtures.js`:
- Change the imports to:
```js
import {readFileSync} from "node:fs";
import {ITEM_BUILDER_TABLES, ITEM_BUILDER_VERSION, buildItemBuilderJson, prepareItemBuilder} from "./itemBuilderData.js";
import {readExcel, realAffixData, realStatData} from "./statFixtures.js";
```
- Add after `readJson`:
```js
// A valid, empty statDict, for models whose tests don't describe anything.
export const EMPTY_STAT_DICT = Object.freeze({properties: [], stats: [], classes: [], skills: [], strings: {}});
```
- In `readItemBuilderInputs`, add `dict: realStatData(),` to the returned object.
- Replace `realItemBuilderModel` with:
```js
let realModel = null;
export function realItemBuilderModel() {
    realModel ??= prepareItemBuilder({...buildItemBuilderJson(readItemBuilderInputs()), linkVersion: 1});
    return realModel;
}
```
- Rename `tinyModel` to `tinyModelJson`, make it return the raw object (drop the `prepareItemBuilder(` wrapper), and add after it:
```js
export const tinyModel = () => prepareItemBuilder(tinyModelJson());
```
- Inside `tinyModelJson`: add `statDict: EMPTY_STAT_DICT,`; add a type helper above the function and use it for every type:
```js
const type = (chain, fields = {}) => ({chain, class: null, rare: true, throwable: false, charm: false, maxSock: [0, 0, 0], ...fields});
```
  e.g. `weap: type(["weap"])`, `orb: type(["orb", "weap", "sorc", "clas"], {class: "sor"})`, `lcha: type(["lcha", "char", "misc"], {rare: false, charm: true})`, `circ: type(["circ", "helm", "armo"])` (keep every existing chain, class and rare value).
- Give the `axe` base `canEthereal: true` and the `ci3` (Diadem) base `canEthereal: true`.
- Add an affix at the end of the list:
```js
            affix("s5", {name: "of Ages", group: 14, itypes: ["circ"], mods: [{code: "indestruct", param: "", min: null, max: null}]}),
```
  (Its only item type is the circlet, so the axe and orb eligibility lists in `itemBuilderRules.test.js` don't change.)

- [ ] **Step 2: Write the failing tests**

In `src/itemBuilderData.test.js`:
- Change the imports to:
```js
import {BASE_DEFAULTS, ITEM_BUILDER_VERSION, buildBases, buildItemBuilderJson, buildTypes, checkColumns, linkFingerprint, prepareItemBuilder, resolveLinkVersion} from "./itemBuilderData.js";
import {EMPTY_STAT_DICT, readItemBuilderInputs, tableText} from "./itemBuilderFixtures.js";
```
- In "keeps spawnable bases…", change the `orb` expectation to:
```js
        expect(orb).toEqual({...BASE_DEFAULTS, code: "ob1", name: "Eagle Orb", group: "Sorceress Orbs", tier: "Normal", qlvl: 1, magicLvl: 1, levelreq: 0, types: ["orb"]});
```
- Replace the `prepareItemBuilder` block with:
```js
describe("prepareItemBuilder", () => {
    const file = (fields) => ({version: ITEM_BUILDER_VERSION, linkVersion: 2, types: {}, affixes: [], bases: [], statDict: EMPTY_STAT_DICT, ...fields});

    it("indexes bases and affixes and groups bases in order", () => {
        const model = prepareItemBuilder(file({affixes: [{key: "p0"}],
            bases: [{code: "a", group: "Axes"}, {code: "b", group: "Orbs"}, {code: "c", group: "Axes"}]}));
        expect(model.groups.map((g) => [g.label, g.bases.map((b) => b.code)])).toEqual([["Axes", ["a", "c"]], ["Orbs", ["b"]]]);
        expect(model.baseByCode.get("b").code).toBe("b");
        expect(model.affixByKey.get("p0").key).toBe("p0");
        expect(model.linkVersion).toBe(2);
    });

    it("fills each base's left-out fields with their defaults and rebuilds the stat dictionary", () => {
        const model = prepareItemBuilder(file({bases: [{code: "a", group: "Axes", minac: 5}],
            statDict: {...EMPTY_STAT_DICT, strings: {ItemStats1h: "Defense:"}}}));
        expect(model.baseByCode.get("a")).toEqual({...BASE_DEFAULTS, code: "a", group: "Axes", minac: 5});
        expect(model.dict.string("ItemStats1h")).toBe("Defense:");
    });

    it("rejects an unknown file version or a malformed stat dictionary", () => {
        expect(() => prepareItemBuilder({version: 99})).toThrow("ItemBuilder.json: unsupported version 99");
        expect(() => prepareItemBuilder(file({statDict: undefined}))).toThrow("ItemBuilder.json: statDict: malformed");
    });
});
```
- In "has the type tree the rules rely on", change the `orb` line to:
```js
        expect(json.types.orb).toEqual({chain: ["orb", "weap", "sorc", "clas"], class: "sor", rare: true, throwable: false, charm: false, maxSock: [2, 3, 3]});
        expect([json.types.taxe.throwable, json.types.scha.charm, json.types.axe.maxSock]).toEqual([true, true, [4, 5, 6]]);
```
- Add inside `describe("the real data", …)`:
```js
    it("gives bases their tooltip fields, leaving defaults out of the file", () => {
        const byCode = new Map(json.bases.map((b) => [b.code, b]));
        expect(byCode.get("hax")).toMatchObject({dmg1: [3, 6], durability: 56, gemsockets: 2, invwidth: 1, invheight: 3, canEthereal: true});
        expect("minac" in byCode.get("hax") || "dmg2" in byCode.get("hax")).toBe(false);
        expect(byCode.get("uit")).toMatchObject({minac: 133, maxac: 148, block: 22, reqstr: 156, durability: 86, gemsockets: 4, canEthereal: true});
        expect(byCode.get("bsw")).toMatchObject({dmg1: [7, 19], dmg2: [20, 28], twoHanded: true, oneOrTwo: true});
        expect(byCode.get("tax")).toMatchObject({dmg1: [4, 7], dmgThrow: [7, 8], reqdex: 40, maxstack: 100});
        expect(byCode.get("aqv")).toMatchObject({nodurability: true, maxstack: 350});
        expect(byCode.get("7cr").canEthereal).toBeUndefined(); // Phase Blade: nodurability
        const bows = json.bases.filter((b) => b.types.some((t) => ["bow", "xbow", "abow"].includes(t)));
        expect([bows.length, bows.filter((b) => b.canEthereal).length]).toEqual([42, 0]);
        expect(json.bases.filter((b) => b.canEthereal && !b.types.some((t) => json.types[t].chain.includes("weap") || json.types[t].chain.includes("armo")))).toEqual([]);
    });

    it("carries the trimmed stat dictionary", () => {
        expect(json.statDict.strings.ItemStats1r).toBe("Chance to Block: ");
        expect(JSON.stringify(json.statDict).length).toBeLessThan(80_000);
    });
```

In `src/itemBuilderOdds.test.js`: add `import {EMPTY_STAT_DICT} from "./itemBuilderFixtures.js";` (merge into the existing fixtures import) and add `statDict: EMPTY_STAT_DICT,` to the object `oddsModel` passes to `prepareItemBuilder`.

In `src/itemBuilderLoad.test.js`: change `JSON_OK` to
```js
const JSON_OK = {version: ITEM_BUILDER_VERSION, linkVersion: 1, types: {}, bases: [], affixes: [], statDict: {properties: [], stats: [], classes: [], skills: [], strings: {}}};
```

Create `src/itemTooltip.test.js`:
```js
import {describe, expect, it} from "vitest";
import {checkTrimmedStatData, engineBase, expandPicks} from "./itemTooltip.js";
import {buildBases, buildTypes} from "./itemBuilderData.js";
import {statDataFromJson, trimStatData} from "./statData.js";
import {readItemBuilderInputs, realItemBuilderModel} from "./itemBuilderFixtures.js";
import {ENGINE_TEST_BASES} from "./statFixtures.js";

const model = realItemBuilderModel();
const base = (code) => model.baseByCode.get(code);
const A = (key) => model.affixByKey.get(key);

describe("engineBase", () => {
    it("gives the engine each base's damage, throwability and socket cap inputs", () => {
        expect(engineBase(model, base("hax"))).toEqual(ENGINE_TEST_BASES.oneHanded);
        expect(engineBase(model, base("gix"))).toEqual(ENGINE_TEST_BASES.twoHanded);
        expect(engineBase(model, base("bsw"))).toEqual(ENGINE_TEST_BASES.oneOrTwo);
        expect(engineBase(model, base("tax"))).toEqual(ENGINE_TEST_BASES.throwable);
        expect(engineBase(model, base("uit"))).toEqual(ENGINE_TEST_BASES.nonWeapon);
        expect(engineBase(model, base("hax"))).toBe(engineBase(model, base("hax"))); // built once per base
    });
});

describe("expandPicks", () => {
    it("tags each entry with its pick and mod (Sharp has two mods)", () => {
        const ctx = {ilvl: {min: 99, max: 99}, base: null};
        const tags = expandPicks([A("p352"), A("p257")], model.dict, ctx).map((e) => [e.stat, [...e.src]]);
        expect(tags).toEqual([
            ["coldresist", ["0:0"]], ["tohit", ["1:0"]], ["item_mindamage_percent", ["1:1"]], ["item_maxdamage_percent", ["1:1"]]]);
    });
});

describe("checkTrimmedStatData", () => {
    const inputs = readItemBuilderInputs();
    const types = buildTypes(inputs.texts.ItemTypes);
    const bases = buildBases(inputs.texts, inputs.weaponsJson, inputs.armorsJson, types);
    const lapis = inputs.affixes.filter((a) => a.key === "p352");
    const trimmedWith = (edit) => {
        const json = JSON.parse(JSON.stringify(trimStatData(inputs.dict, lapis.flatMap((a) => a.mods))));
        edit(json);
        return statDataFromJson(json);
    };

    it("passes the real trimmed dictionary", () => {
        expect(() => checkTrimmedStatData({full: inputs.dict, trimmed: model.dict, affixes: inputs.affixes, types, bases})).not.toThrow();
    });

    it("names an affix the trimmed dictionary can't describe, or describes differently", () => {
        const noStat = trimmedWith((json) => {
            json.stats = json.stats.filter((s) => s.name !== "coldresist");
        });
        expect(() => checkTrimmedStatData({full: inputs.dict, trimmed: noStat, affixes: lapis, types, bases}))
            .toThrow(/can't describe p352 \(Lapis\) at ilvl 1, no base: stat "coldresist" is not in ItemStatCost\.txt/);
        const renamed = trimmedWith((json) => {
            json.strings.ModStr1k = "Cold Resistance";
        });
        expect(() => checkTrimmedStatData({full: inputs.dict, trimmed: renamed, affixes: lapis, types, bases}))
            .toThrow(/describes p352 \(Lapis\) at ilvl 1, no base differently/);
    });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/itemBuilderData.test.js src/itemTooltip.test.js src/itemBuilderOdds.test.js src/itemBuilderLoad.test.js src/itemBuilderRules.test.js src/itemBuilderHash.test.js`
Expected: FAIL — `BASE_DEFAULTS` not exported, version 2, no `statDict`, `./itemTooltip.js` missing.

- [ ] **Step 4: Create `src/itemTooltip.js` (first part)**

```js
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
```

- [ ] **Step 5: Implement `itemBuilderData.js` version 3**

Change the imports at the top to:
```js
import {parseTxt} from "./dropCalcData.js";
import {checkBlockClasses} from "./baseLines.js";
import {checkTrimmedStatData} from "./itemTooltip.js";
import {statDataFromJson, trimStatData} from "./statData.js";
```
and replace the whole header comment (its first five lines) with:
```js
// The Item Builder's data: the affix rows (src/affixData.js, described by the stat engine), the base items
// (Weapons, Armor, Misc.txt, with display names from Weapons/Armors.json) and the item-type tree
// (ItemTypes.txt), cut down to what the builder uses. Pure, so it runs in Vite, Vitest and the browser: the
// affix-data plugin (vite.config.js) writes ItemBuilder.json with buildItemBuilderJson, including the stat
// engine's trimmed dictionary, and the browser prepares it with prepareItemBuilder.
```

Set `export const ITEM_BUILDER_VERSION = 3;` and replace `TABLE_COLUMNS` with:
```js
const SLOT_COLUMNS = ["gemsockets", "invwidth", "invheight", "stackable", "maxstack"];

// Per table, the columns the builder reads. A missing one fails the build.
export const TABLE_COLUMNS = {
    Weapons: [...BASE_COLUMNS, "magic lvl", "mindam", "maxdam", "2handmindam", "2handmaxdam", "minmisdam", "maxmisdam",
        "2handed", "1or2handed", "reqstr", "reqdex", "durability", "nodurability", ...SLOT_COLUMNS],
    Armor: [...BASE_COLUMNS, "magic lvl", "minac", "maxac", "block", "reqstr", "durability", "nodurability", ...SLOT_COLUMNS],
    Misc: [...BASE_COLUMNS, "nodurability", ...SLOT_COLUMNS],
    ItemTypes: ["Code", "Equiv1", "Equiv2", "Class", "Rare", "Throwable", "Charm", "MaxSock1", "MaxSock25", "MaxSock40"],
};
```

In `buildTypes`, update the comment ("…its class (ItemTypes "Class"), whether it can be rare, whether it is throwable or a charm, and its socket caps by ilvl band") and the type object:
```js
        types[code] = {
            chain,
            class: cell(row.Class) || null,
            rare: cell(row.Rare) === "1",
            throwable: cell(row.Throwable) === "1",
            charm: cell(row.Charm) === "1",
            maxSock: [int(row.MaxSock1), int(row.MaxSock25), int(row.MaxSock40)],
        };
```

Add above `toBase`:
```js
// The tooltip's base fields and their defaults. ItemBuilder.json leaves out a field equal to its default;
// prepareItemBuilder puts them back. A damage pair whose two values are 0 is null.
export const BASE_DEFAULTS = Object.freeze({
    minac: 0, maxac: 0, block: 0, dmg1: null, dmg2: null, dmgThrow: null, twoHanded: false, oneOrTwo: false,
    reqstr: 0, reqdex: 0, durability: 0, nodurability: false, gemsockets: 0, invwidth: 0, invheight: 0, maxstack: 0,
    canEthereal: false,
});

const compactBase = (base) => Object.fromEntries(Object.entries(base).filter(([key, value]) => !(key in BASE_DEFAULTS) || value !== BASE_DEFAULTS[key]));
```

Replace `toBase` with (note the new first parameter, `table`):
```js
function toBase(table, row, name, tier, types) {
    const code = cell(row.code);
    const type = cell(row.type);
    const type2 = cell(row.type2);
    for (const t of [type, type2].filter(Boolean)) {
        if (!types[t]) throw new Error(`base ${code} ("${name}"): type "${t}" is not in ItemTypes.txt`);
    }
    const group = TYPE_GROUP.get(type);
    if (!group) {
        throw new Error(`base ${code} ("${name}"): no optgroup label for type "${type}" (add it to GROUP_LABELS in src/itemBuilderData.js)`);
    }
    const weapon = table === "Weapons";
    const armor = table === "Armor";
    const pair = (a, b) => (weapon && (int(row[a]) || int(row[b])) ? [int(row[a]), int(row[b])] : null);
    const typeCodes = type2 ? [type, type2] : [type];
    const chain = new Set(typeCodes.flatMap((t) => types[t].chain));
    const durability = weapon || armor ? int(row.durability) : 0;
    const nodurability = cell(row.nodurability) === "1";
    return {
        code, name, group, tier, qlvl: int(row.level), magicLvl: int(row["magic lvl"]), levelreq: int(row.levelreq), types: typeCodes,
        minac: armor ? int(row.minac) : 0,
        maxac: armor ? int(row.maxac) : 0,
        block: armor ? int(row.block) : 0,
        dmg1: pair("mindam", "maxdam"),
        dmg2: pair("2handmindam", "2handmaxdam"),
        dmgThrow: pair("minmisdam", "maxmisdam"),
        twoHanded: weapon && cell(row["2handed"]) === "1",
        oneOrTwo: weapon && cell(row["1or2handed"]) === "1",
        reqstr: weapon || armor ? int(row.reqstr) : 0,
        reqdex: weapon ? int(row.reqdex) : 0,
        durability,
        nodurability,
        gemsockets: int(row.gemsockets),
        invwidth: int(row.invwidth),
        invheight: int(row.invheight),
        maxstack: cell(row.stackable) === "1" ? int(row.maxstack) : 0,
        // Spec "Ethereal": weapons and armor with durability. Excludes bows, crossbows and Phase Blades
        // (nodurability) and every Misc base.
        canEthereal: (chain.has("weap") || chain.has("armo")) && !nodurability && durability > 0,
    };
}
```

In `buildBases`, change `bases.push(toBase(row, entry.displayName || entry.name, entry.itemTier ?? null, types));` to `bases.push(toBase(table, row, entry.displayName || entry.name, entry.itemTier ?? null, types));` and `bases.push(toBase(row, name, null, types));` to `bases.push(toBase("Misc", row, name, null, types));`.

Replace `buildItemBuilderJson` and `prepareItemBuilder` with:
```js
// inputs: {texts: {[table]: .txt content}, affixes: describeAffixes' rows, weaponsJson, armorsJson, dict: the
// full stat dictionary}. Throws on bad data, a class with no block abbreviation, or a trimmed dictionary that
// describes any affix differently. The plugin adds linkVersion.
export function buildItemBuilderJson({texts, affixes, weaponsJson, armorsJson, dict}) {
    for (const table of ITEM_BUILDER_TABLES) checkColumns(table, texts[table]);
    const types = buildTypes(texts.ItemTypes);
    const bases = buildBases(texts, weaponsJson, armorsJson, types);
    checkBlockClasses(dict.classes);
    const statDict = trimStatData(dict, affixes.flatMap((a) => a.mods));
    checkTrimmedStatData({full: dict, trimmed: statDataFromJson(JSON.parse(JSON.stringify(statDict))), affixes, types, bases});
    return {version: ITEM_BUILDER_VERSION, types, bases: bases.map(compactBase), affixes: affixes.map(builderAffix), statDict};
}

// The loaded file, indexed for the rules and grouped for the base picker; bases get their defaults back and
// the stat dictionary is rebuilt for the tooltip (model.dict).
export function prepareItemBuilder(json) {
    if (json?.version !== ITEM_BUILDER_VERSION) throw new Error(`${ITEM_BUILDER_FILE}: unsupported version ${json?.version}`);
    let dict;
    try {
        dict = statDataFromJson(json.statDict);
    } catch (e) {
        throw new Error(`${ITEM_BUILDER_FILE}: ${e.message}`);
    }
    const bases = json.bases.map((b) => ({...BASE_DEFAULTS, ...b}));
    const groups = [];
    const byLabel = new Map();
    for (const base of bases) {
        let group = byLabel.get(base.group);
        if (!group) {
            group = {label: base.group, bases: []};
            byLabel.set(base.group, group);
            groups.push(group);
        }
        group.bases.push(base);
    }
    return {
        ...json,
        bases,
        dict,
        groups,
        baseByCode: new Map(bases.map((b) => [b.code, b])),
        affixByKey: new Map(json.affixes.map((a) => [a.key, a])),
    };
}
```

In `vite.config.js`, `generate`, change:
```js
    const json = buildItemBuilderJson({ texts, affixes: rows, weaponsJson, armorsJson })
```
to:
```js
    const json = buildItemBuilderJson({ texts, affixes: rows, weaponsJson, armorsJson, dict })
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npm test`
Expected: PASS — every test, including the builder's rules, hash, odds and loader tests and the golden snapshot.

- [ ] **Step 7: Regenerate the data and check the link version and size**

Run:
```bash
npm run build
git status --short src/itemBuilderVersion.json
gzip -c public/data/standard/ItemBuilder.json | wc -c
node -e 'const j=require("./public/data/standard/ItemBuilder.json"); console.log(j.version, j.bases.length, Object.keys(j.statDict.strings).length)'
```
Expected: the build succeeds (the loud check passes); `git status` prints nothing for the version file; the gzipped size is about 14–15 KB (≈24%) above Task 1's baseline: about 7 KB of it is `statDict`, about 7 KB the new base fields (measure each with `node -e` + `gzip` if it's far off); the last line prints `3 529 N`, with N, the trimmed string count, roughly 180–220 (the spec measured 183 before the tooltip labels were added).

- [ ] **Step 8: Lint and commit**

Run: `npm run lint` (expect 0 problems), then:
```bash
git add src/itemTooltip.js src/itemTooltip.test.js src/itemBuilderData.js src/itemBuilderData.test.js src/itemBuilderFixtures.js src/itemBuilderOdds.test.js src/itemBuilderLoad.test.js vite.config.js
git commit -m "ItemBuilder.json v3: base and type fields, canEthereal, the trimmed stat dictionary with its build-time check"
```

---

### Task 6: `buildTooltip` (the tooltip's lines)

**Files:**
- Modify: `src/itemTooltip.js` (imports; `buildTooltip`)
- Test: `src/itemTooltip.test.js`

**Interfaces:**
- Consumes: `engineBase`, `expandPicks` (Task 5); `sumEntries`, `sumEnds`, `describe`, `rangeText` (Tasks 1–2); `defense`, `blockChance`, `blockText`, `damage`, `damageText`, `rangeOf`, `requirement` (Task 4); `baseClass`, `requiredLevel` (`itemBuilderRules.js`); `CLASS_NAMES` (`affixData.js`); `model.dict` (Task 5).
- Produces: `export function buildTooltip(model, ctx, build)` → `Array<{kind: "name"|"placeholder"|"baseName"|"base"|"mod"|"footer", text?, label?, value?, changed?, byRoll?, quality?}>`. `ctx` is `rollContext(model, build)`; `build.eth` may be absent (treated as false).

- [ ] **Step 1: Write the failing tests**

In `src/itemTooltip.test.js`, change the first import lines to:
```js
import {describe, expect, it} from "vitest";
import {buildTooltip, checkTrimmedStatData, engineBase, expandPicks} from "./itemTooltip.js";
import {buildBases, buildTypes} from "./itemBuilderData.js";
import {allowedQualities, canRoll, EMPTY_BUILD, rollContext} from "./itemBuilderRules.js";
import {pct} from "./baseLines.js";
import {statDataFromJson, trimStatData} from "./statData.js";
import {readItemBuilderInputs, realItemBuilderModel} from "./itemBuilderFixtures.js";
import {ENGINE_TEST_BASES} from "./statFixtures.js";
```

Append:
```js
const tip = (fields) => {
    const build = {...EMPTY_BUILD, quality: "magic", ...fields};
    return buildTooltip(model, rollContext(model, build), build);
};
// Each line as the game prints it: "label value", or the text with its "(by roll)" tag.
const show = (lines) => lines.map((l) => (l.kind === "base" ? [l.label, l.value].filter((x) => x !== undefined).join(" ") : `${l.text}${l.byRoll ? " (by roll)" : ""}`));
const line = (lines, label) => lines.find((l) => l.label === label);

describe("buildTooltip: the worked examples", () => {
    it("ethereal magic Monarch: Holy … of Ease", () => {
        expect(show(tip({base: "uit", eth: true, picks: ["p149", "s370"]}))).toEqual([
            "Holy Monarch of Ease", "Defense: 336-372", "Chance to Block: 22% (Pal: 52%, Ama/Asn/Bar: 47%, Dru/Nec/Sor: 42%)",
            "Durability: 86 of 86", "Required Strength: 115", "Required Level: 54",
            "+81-100% Enhanced Defense", "Requirements -20%", "Ethereal (Cannot Be Repaired)"]);
    });

    it("ethereal magic Berserker Axe: Cruel … of Evisceration", () => {
        expect(show(tip({base: "7wa", eth: true, picks: ["p194", "s203"]}))).toEqual([
            "Cruel Berserker Axe of Evisceration", "One-Hand Damage: 111-148 to 375-507", "Durability: 78 of 78",
            "Required Dexterity: 49", "Required Strength: 128", "Required Level: 64",
            "+201-300% Enhanced Damage", "+41-63 to Maximum Damage", "Ethereal (Cannot Be Repaired)"]);
    });

    it("Jagged Hand Axe: exact damage, two by-roll modifiers, no Required Level at 1", () => {
        expect(show(tip({base: "hax", picks: ["p186"]}))).toEqual([
            "Jagged Hand Axe", "One-Hand Damage: 3 to 7", "Durability: 56 of 56",
            "+17-20% Enhanced Damage (by roll)", "+1 to Maximum Damage (by roll)"]);
    });

    it("magic Aegis of Deflecting: block at the cap for every class, blue", () => {
        const block = line(tip({base: "uow", picks: ["s173"]}), "Chance to Block:");
        expect(block).toMatchObject({value: "66% (Pal: 80%, Ama/Asn/Bar: 80%, Dru/Nec/Sor: 80%)", changed: true});
    });
});

describe("buildTooltip: modifiers", () => {
    it("sums Jagged and Sharp into one by-roll range per stat (B1)", () => {
        const mods = show(tip({base: "hax", quality: "rare", picks: ["p186", "p257"]}));
        expect(mods).toContain("+17-40% Enhanced Damage (by roll)");
        expect(mods).toContain("+1-2 to Maximum Damage (by roll)");
        expect(mods).toContain("+10-20 to Attack Rating");
    });

    it("prints a by-roll line beside a plain line of the same stat (Cruel + Sharp)", () => {
        const mods = show(tip({base: "hax", quality: "rare", picks: ["p194", "p257"]}));
        expect(mods).toContain("+201-300% Enhanced Damage");
        expect(mods).toContain("+17-20% Enhanced Damage (by roll)");
    });

    it("prints sockets once, in the footer, clamped to the base's cap", () => {
        const sockets = (fields) => show(tip(fields)).filter((t) => /Socketed/.test(t));
        expect(sockets({base: "hax", picks: ["p420"]})).toEqual(["Socketed (1-2)"]);
        expect(sockets({base: "hax", picks: ["p422"]})).toEqual(["Socketed (2)"]);
        expect(sockets({base: "hax", eth: true, picks: ["p420"]})).toEqual(["Ethereal (Cannot Be Repaired), Socketed (1-2)"]);
        expect(sockets({base: "rin", picks: ["p420"]})).toEqual([]); // cap 0: no socket line at all
    });
});

describe("buildTooltip: base lines", () => {
    it("colours defense and damage blue from affixes, white for ethereal alone", () => {
        expect(line(tip({base: "uit", eth: true}), "Defense:")).toMatchObject({value: "166-185", changed: false});
        expect(line(tip({base: "uit", picks: ["p149"]}), "Defense:").changed).toBe(true);
        expect(line(tip({base: "7wa", eth: true}), "One-Hand Damage:")).toMatchObject({value: "37 to 111", changed: false});
        expect(line(tip({base: "7wa", picks: ["s203"]}), "One-Hand Damage:").changed).toBe(true);
        expect(line(tip({base: "uit"}), "Chance to Block:").changed).toBe(false);
    });

    it("shows one class's block and the class restriction on class-only shields", () => {
        const targe = show(tip({base: "pa1"}));
        expect(targe).toContain("Chance to Block: 10% (Pal: 40%)");
        expect(targe).toContain("(Paladin Only)");
        const head = show(tip({base: "ne1"}));
        expect(head).toContain("Chance to Block: 3% (Nec: 23%)");
        expect(head).toContain("(Necromancer Only)");
    });

    it("shows Two-Hand Damage, then One-Hand Damage (Bar) on a 1-or-2-handed sword", () => {
        const lines = show(tip({base: "bsw"}));
        const at = lines.indexOf("Two-Hand Damage: 20 to 28");
        expect(at).toBeGreaterThan(0);
        expect(lines[at + 1]).toBe("One-Hand Damage: 7 to 19 (Bar)");
    });

    it("shows a throwable's throw line above its main line, its quantity, and no durability", () => {
        expect(show(tip({base: "tax"}))).toEqual(["Throwing Axe", "Throw Damage: 7 to 8", "One-Hand Damage: 4 to 7", "Quantity: 100", "Required Dexterity: 40"]);
        expect(show(tip({base: "aqv"}))).toContain("Quantity: 350");
    });

    it("hides durability on an indestructible item", () => {
        const ages = show(tip({base: "uit", picks: ["s404"]}));
        expect(ages.some((t) => t.startsWith("Durability:"))).toBe(false);
        expect(ages).toContain("Indestructible");
    });

    it("shows the charm line on the four charm bases only", () => {
        for (const code of ["cm1", "cm2", "cm3", "cm4"]) expect(show(tip({base: code})), code).toContain("Keep in Inventory to Gain Bonus");
        for (const code of ["rin", "amu", "jew", "mjw"]) expect(show(tip({base: code})), code).not.toContain("Keep in Inventory to Gain Bonus");
    });
});

describe("buildTooltip: names and the footer", () => {
    it("names a magic item from whichever affixes are picked", () => {
        expect(tip({base: "hax", picks: ["p186"]})[0]).toEqual({kind: "name", text: "Jagged Hand Axe", quality: "magic"});
        expect(tip({base: "hax", picks: ["s203"]})[0].text).toBe("Hand Axe of Evisceration");
        expect(tip({base: "hax"})[0].text).toBe("Hand Axe");
    });

    it("shows a rare or crafted item's placeholder over its base name, with no crafted note", () => {
        for (const quality of ["rare", "crafted"]) {
            const lines = tip({base: "rin", quality});
            expect(lines.slice(0, 2)).toEqual([
                {kind: "placeholder", text: "Random Name", quality}, {kind: "baseName", text: "Ring", quality}]);
            expect(lines.some((l) => /recipe/i.test(l.text ?? l.label ?? ""))).toBe(false);
        }
    });

    it("writes the footer in all three forms", () => {
        const footer = (fields) => tip(fields).filter((l) => l.kind === "footer").map((l) => l.text);
        expect(footer({base: "uit", eth: true})).toEqual(["Ethereal (Cannot Be Repaired)"]);
        expect(footer({base: "uit", picks: ["p420"]})).toEqual(["Socketed (1-2)"]); // Monarch cap 4: Mechanist's 1-2 stays
        expect(footer({base: "uit", eth: true, picks: ["p420"]})).toEqual(["Ethereal (Cannot Be Repaired), Socketed (1-2)"]);
        expect(footer({base: "uit"})).toEqual([]);
    });
});

describe("buildTooltip: robustness (Review Focus)", () => {
    it("builds a crafted item at crafted ilvl 0", () => {
        const lines = tip({base: "hax", quality: "crafted", clvl: 1, gilvl: 1, picks: ["p420"]});
        expect(lines[0]).toMatchObject({kind: "placeholder", quality: "crafted"});
        expect(show(lines)).toContain("Socketed (1-2)");
    });

    it("builds every base in every allowed quality with no picks, name first", () => {
        for (const b of model.bases) {
            for (const quality of allowedQualities(model, b)) {
                const lines = tip({base: b.code, quality});
                expect(lines[0].kind === "name" ? lines[0].text : lines[1].text, `${b.code} ${quality}`).toContain(b.name);
            }
        }
    });

    it("builds every affix alone at ilvl 1 and 99 on a base it can roll on", () => {
        const contexts = model.bases.map((b) => rollContext(model, {...EMPTY_BUILD, base: b.code, quality: "magic"}));
        for (const affix of model.affixes) {
            const ctx = contexts.find((c) => canRoll(affix, c));
            if (!ctx) continue; // rows no builder base can take (maps)
            for (const ilvl of [1, 99]) expect(() => tip({base: ctx.base.code, ilvl, picks: [affix.key]}), `${affix.key} ilvl ${ilvl}`).not.toThrow();
        }
    });

    it("no 1-or-2-handed base can roll an ED row whose first ED roll adds 0 to its smaller pair (sumEnds' monotonicity exception)", () => {
        const hits = [];
        for (const b of model.bases.filter((x) => x.dmg1 && x.dmg2)) {
            const t = Math.max(b.dmg1[1], b.dmg2[1]);
            const smaller = Math.min(b.dmg1[1], b.dmg2[1]);
            for (let ilvl = 1; ilvl <= 99; ilvl++) {
                const ctx = rollContext(model, {...EMPTY_BUILD, base: b.code, quality: "magic", ilvl});
                for (const affix of model.affixes.filter((a) => canRoll(a, ctx))) {
                    for (const m of affix.mods.filter((x) => x.code === "dmg%")) {
                        const falls = (r) => Math.trunc((t * r) / 100) <= 0;
                        if (!falls(m.min) || falls(m.max)) continue; // not mixed
                        let first = m.min;
                        while (falls(first)) first++;
                        if (pct(smaller, first) === 0) hits.push(`${b.code} ${affix.key}`);
                    }
                }
            }
        }
        expect([...new Set(hits)]).toEqual([]);
    });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/itemTooltip.test.js`
Expected: FAIL — `buildTooltip` is not exported.

- [ ] **Step 3: Implement**

In `src/itemTooltip.js`, change the header comment's second sentence to "This module computes the tooltip's lines (buildTooltip), the engine's inputs (engineBase, expandPicks) and the build-time check of the trimmed dictionary." and the imports to:
```js
import {CLASS_NAMES} from "./affixData.js";
import {blockChance, blockText, damage, damageText, defense, rangeOf, requirement} from "./baseLines.js";
import {baseChain, baseClass, requiredLevel} from "./itemBuilderRules.js";
import {describe, expandMods, rangeText, sumEnds, sumEntries} from "./statEngine.js";
```

Append:
```js
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
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/itemTooltip.test.js`
Expected: PASS. If the monotonicity test lists a base, stop and report it (the spec says no pair hits it; a hit means the data changed).

- [ ] **Step 5: Full suite, lint, commit**

Run: `npm test && npm run lint` (expect PASS, 0 problems), then:
```bash
git add src/itemTooltip.js src/itemTooltip.test.js
git commit -m "itemTooltip.js: buildTooltip (name, base lines, summed modifiers with by-roll tags, one socket line, footer)"
```

---

### Task 7: Ethereal in the build (rules, URL, notices, hook)

**Files:**
- Modify: `src/itemBuilderRules.js` (`EMPTY_BUILD`, `rowState`, `resolveBuild`)
- Modify: `src/itemBuilderHash.js` (`parseBuildQuery`, `encodeBuildQuery`, `controlNotice`, `decodeBuildQuery`)
- Modify: `src/useItemBuilder.js` (`setBuild`)
- Test: `src/itemBuilderRules.test.js`, `src/itemBuilderHash.test.js`

**Interfaces:**
- Consumes: `base.canEthereal` (Task 5); tiny model's `ci3` (canEthereal) and `s5` (*of Ages*) (Task 5).
- Produces: `build.eth: boolean`; `rowState(affix, picked, caps, eth = false)` may return `{state: "ethereal"}`; `resolveBuild` → `{build, dropped, fixed, ethOff}` (`ethOff`: the base's name when Ethereal was turned off, else `null`); `controlNotice(dropped, ethOff = null)`; the URL's `e=1`.

- [ ] **Step 1: Write the failing tests**

In `src/itemBuilderRules.test.js`:
- In "keeps a valid build as it is", change the body to:
```js
        const raw = {base: "axe", quality: "rare", eth: false, ilvl: 85, clvl: 99, gilvl: 99, picks: ["p0", "s0"]};
        expect(resolveBuild(model, raw)).toEqual({build: raw, dropped: 0, fixed: 0, ethOff: null});
```
- In "drops every pick of an unknown base", change the expectation to `.toEqual({build: {...EMPTY_BUILD}, dropped: 2, fixed: 1, ethOff: null});`
- Append:
```js
describe("ethereal", () => {
    it("keeps eth on a base that can be ethereal, and turns it off with the base's name otherwise", () => {
        expect(resolveBuild(model, {base: "axe", quality: "magic", eth: true})).toMatchObject({build: {eth: true}, ethOff: null, fixed: 0});
        expect(resolveBuild(model, {base: "jew", quality: "magic", eth: true})).toMatchObject({build: {eth: false}, ethOff: "Jewel", fixed: 0});
        expect(resolveBuild(model, {base: "axe", quality: "magic"}).build.eth).toBe(false);
    });

    it("counts a malformed e as a reset setting", () => {
        expect(resolveBuild(model, {base: "axe", quality: "magic", eth: "invalid"})).toMatchObject({build: {eth: false}, fixed: 1});
    });

    it("locks of Ages while eth is on, without touching canRoll, and drops it when eth turns on", () => {
        const ctx = ctxFor({base: "ci3", quality: "magic"});
        expect(canRoll(A("s5"), ctx)).toBe(true);
        expect(rowState(A("s5"), [], ctx.caps, true)).toEqual({state: "ethereal"});
        expect(rowState(A("s5"), [], ctx.caps, false)).toEqual({state: "free"});
        expect(eligibleAffixes(model, ctx).map((a) => a.key)).toContain("s5"); // the list and the roll odds (which read it) don't move
        expect(resolveBuild(model, {base: "ci3", quality: "magic", eth: true, picks: ["s5"]})).toMatchObject({build: {eth: true, picks: []}, dropped: 1});
    });
});
```

In `src/itemBuilderHash.test.js`:
- In "takes the first of repeated parameters…", add `&e=1` to the query and `eth: true` to the expected object:
```js
        expect(parseBuildQuery("v=3&b=axe&b=orb&il=50&il=60&q=x&cl=abc&a=p0--s1&e=1")).toEqual({
            version: 3, base: "axe", quality: "invalid", ilvl: 50, clvl: Number.NaN, gilvl: undefined, picks: ["p0", "s1"], eth: true,
        });
```
- In "round-trips every encoded build", add `build({base: "axe", quality: "rare", eth: true, picks: ["p0"]}),` to the list.
- In "writes v and the base always…", add:
```js
        expect(encodeBuildQuery(model, build({base: "axe", quality: "rare", ilvl: 85, eth: true, picks: ["p0", "s0"]})))
            .toBe("v=3&b=axe&q=r&il=85&e=1&a=p0-s0");
```
- In "produces queries that decode to themselves", add `"v=3&b=axe&e=1"`, `"v=3&b=jew&e=1"` and `"v=3&b=axe&e=0"` to the list.
- Append:
```js
describe("ethereal links and notices", () => {
    it("opens old links non-ethereal and reads e=1", () => {
        expect(decodeBuildQuery(model, "v=3&b=axe").build.eth).toBe(false);
        expect(decodeBuildQuery(model, "v=3&b=axe&e=1")).toMatchObject({build: {eth: true}, notice: null});
    });

    it("resets e=0, e=x and e=1 on a base that can't be ethereal, with the invalid-settings notice", () => {
        for (const q of ["v=3&b=axe&e=0", "v=3&b=axe&e=x", "v=3&b=jew&e=1"]) {
            expect(decodeBuildQuery(model, q), q).toMatchObject({build: {eth: false}, notice: "Some settings in the link were invalid and were reset."});
        }
    });

    it("says why Ethereal was turned off after a control change, alone or with dropped picks", () => {
        expect(controlNotice(0, "Short Bow")).toBe("Ethereal was turned off: Short Bow can't be ethereal.");
        expect(controlNotice(2, "Short Bow")).toBe("Ethereal was turned off: Short Bow can't be ethereal. 2 affixes no longer fit and were removed.");
        expect(controlNotice(0, null)).toBeNull();
    });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run src/itemBuilderRules.test.js src/itemBuilderHash.test.js`
Expected: FAIL — no `eth`, `ethOff`, `ethereal` state or `e=1`.

- [ ] **Step 3: Implement**

In `src/itemBuilderRules.js`:

Change `EMPTY_BUILD` to:
```js
export const EMPTY_BUILD = Object.freeze({base: null, quality: null, eth: false, ilvl: 99, clvl: 99, gilvl: 99, picks: Object.freeze([])});
```

Replace `rowState` and its comment with:
```js
// A row that makes the item indestructible (of Ages). It can't be on an ethereal item: the game's ethereal
// check fails once an item is indestructible, and affixes roll first (U5).
const makesIndestructible = (affix) => affix.mods.some((m) => String(m.code).toLowerCase() === "indestruct");

// An eligible row's state next to the picks: picked; locked on an ethereal item (eth); a group taken on
// either side; a full side.
export function rowState(affix, picked, caps, eth = false) {
    if (picked.some((p) => p.key === affix.key)) return {state: "picked"};
    if (eth && makesIndestructible(affix)) return {state: "ethereal"};
    const holder = picked.find((p) => p.group === affix.group);
    if (holder) return {state: "group", by: holder};
    const side = picked.filter((p) => p.suffix === affix.suffix).length;
    if (side >= (affix.suffix ? caps.suffix : caps.prefix) || picked.length >= caps.total) return {state: "full"};
    return {state: "free"};
}
```

Replace `resolveBuild`'s comment and body with:
```js
// Turns any build-shaped input (a decoded link, or the current build plus one control change) into a
// valid build: levels default to 99, an unknown base empties the build, a disallowed quality falls back
// to the base's first allowed one, eth is kept only on a base that can be ethereal, and picks are applied
// in order, each kept only if it can roll and is free next to the picks before it. `fixed` counts reset
// settings (a malformed e included), `dropped` the removed picks, and `ethOff` names the base when eth was
// turned off because the base can't be ethereal (null otherwise).
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
    if (raw.eth === "invalid") fixed++;
    let eth = raw.eth === true;

    const picks = [...new Set(raw.picks ?? [])];
    const base = raw.base ? model.baseByCode.get(raw.base) ?? null : null;
    if (raw.base && !base) fixed++;
    if (!base) return {build: {...EMPTY_BUILD, ...levels, picks: []}, dropped: dropped + picks.length, fixed, ethOff: null};

    const allowed = allowedQualities(model, base);
    let quality = raw.quality;
    if (!allowed.includes(quality)) {
        if (quality) fixed++;
        quality = allowed[0];
    }
    let ethOff = null;
    if (eth && !base.canEthereal) {
        eth = false;
        ethOff = base.name;
    }

    const build = {base: base.code, quality, eth, ...levels, picks: []};
    const ctx = rollContext(model, build);
    const picked = [];
    for (const key of picks) {
        const affix = model.affixByKey.get(key);
        if (affix && canRoll(affix, ctx) && rowState(affix, picked, ctx.caps, eth).state === "free") picked.push(affix);
        else dropped++;
    }
    build.picks = picked.map((a) => a.key);
    return {build, dropped, fixed, ethOff};
}
```

In `src/itemBuilderHash.js`:
- Header comment: after "cl and gl (clvl and ingredient ilvl, crafted)," add " e (1 when ethereal, left out otherwise),".
- In `parseBuildQuery`'s returned object, add:
```js
        eth: params.has("e") ? (params.get("e") === "1" ? true : "invalid") : undefined,
```
- In `encodeBuildQuery`, before `if (build.picks.length) …`, add:
```js
    if (build.eth) parts.push("e=1");
```
- Replace `controlNotice` with:
```js
// After a control change: why Ethereal was turned off (ethOff: the base's name), then how many picks fell out.
export function controlNotice(dropped, ethOff = null) {
    const parts = [];
    if (ethOff) parts.push(`Ethereal was turned off: ${ethOff} can't be ethereal.`);
    if (dropped) parts.push(`${affixes(dropped)} no longer ${dropped === 1 ? "fits and was" : "fit and were"} removed.`);
    return parts.length ? parts.join(" ") : null;
}
```
- In `decodeBuildQuery`, replace the last two lines with:
```js
    const {build, dropped, fixed, ethOff} = resolveBuild(model, raw);
    // From a link, an e=1 the base can't take is one more invalid setting.
    return {build, notice: linkNotice(dropped, fixed + (ethOff ? 1 : 0))};
```

In `src/useItemBuilder.js`, replace `setBuild` with:
```js
    const setBuild = (next) => {
        const {build, dropped, ethOff} = resolveBuild(model, next);
        setQuery(encodeBuildQuery(model, build));
        setNotice(controlNotice(dropped, ethOff));
    };
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run src/itemBuilderRules.test.js src/itemBuilderHash.test.js`
Expected: PASS.

- [ ] **Step 5: Full suite, lint, commit**

Run: `npm test && npm run lint` (expect PASS, 0 problems), then:
```bash
git add src/itemBuilderRules.js src/itemBuilderRules.test.js src/itemBuilderHash.js src/itemBuilderHash.test.js src/useItemBuilder.js
git commit -m "Item Builder: ethereal builds (e=1), of Ages locked while ethereal, the Ethereal-off notice"
```

---

### Task 8: The tooltip card and the Ethereal toggle (UI)

**Files:**
- Modify: `src/ErrorBoundary.jsx` (`fallback` prop)
- Create: `src/ItemTooltip.jsx`
- Modify: `src/ItemBuilderPanel.jsx` (imports, `AffixRow`, the Ethereal toggle, `rowState` call, the tooltip card)
- Modify: `src/styles.css` (`.ibTooltip` and its line kinds, after the `.ibOddsNote` rule)

**Interfaces:**
- Consumes: `buildTooltip` (Task 6); `build.eth`, `rowState(…, eth)` (Task 7); `encodeBuildQuery` (`itemBuilderHash.js`).
- Produces: `<ErrorBoundary resetKey fallback>`; `<ItemTooltip model ctx build/>` rendering `<section className="ibTooltip">` with `.ibTipLine` children (`.ibTipByRoll` for the tag).

- [ ] **Step 1: Start the dev server**

```bash
npm run dev -- --port 5180 --strictPort   # in the background; wait for "ready"
```
(The "before" screenshots were taken in Task 1 Step 1.)

- [ ] **Step 2: Add the `fallback` prop to `ErrorBoundary`**

In `src/ErrorBoundary.jsx`, replace the header comment with:
```js
// Keeps a render-time throw in one panel from blanking the whole page. The tab bar stays outside it, and
// `resetKey` (the current tab, or the Item Builder's build query) clears the failure when it changes.
// `fallback`, when given, replaces the tab-wide failure panel (the item tooltip shows a one-line message).
```
change the `componentDidCatch` message to `"A panel failed to render"`, and make `render` start:
```js
    render() {
        if (!this.state.error) return this.props.children;
        if (this.props.fallback !== undefined) return this.props.fallback;
```
(the rest of `render` is unchanged).

- [ ] **Step 3: Create `src/ItemTooltip.jsx`**

```jsx
// The Item Builder's item tooltip card: buildTooltip's lines (src/itemTooltip.js), styled by kind. Props
// only. It calls buildTooltip while rendering, so a throw lands in the ErrorBoundary around it.
import React, {useMemo} from "react";
import {buildTooltip} from "./itemTooltip.js";

const BY_ROLL_TITLE = "Depends on the roll: on this base, low rolls add maximum damage instead of Enhanced Damage.";
const QUALITY_CLASS = {magic: "ibTipMagic", rare: "ibTipRare", crafted: "ibTipCrafted"};

function TooltipLine({line}) {
    switch (line.kind) {
        case "name":
        case "baseName":
            return <p className={`ibTipLine ibTipName ${QUALITY_CLASS[line.quality]}`}>{line.text}</p>;
        case "placeholder":
            return <p className={`ibTipLine ibTipName ibTipPlaceholder ${QUALITY_CLASS[line.quality]}`}>{line.text}</p>;
        case "base":
            return (
                <p className="ibTipLine">
                    {line.label}
                    {line.value !== undefined && <>{" "}<span className={line.changed ? "ibTipBlue" : undefined}>{line.value}</span></>}
                </p>
            );
        case "mod":
            return (
                <p className="ibTipLine ibTipBlue">
                    {line.text}
                    {line.byRoll && <>{" "}<span className="ibTipByRoll" title={BY_ROLL_TITLE}>(by roll)</span></>}
                </p>
            );
        default: // footer
            return <p className="ibTipLine ibTipBlue">{line.text}</p>;
    }
}

export default function ItemTooltip({model, ctx, build}) {
    const lines = useMemo(() => buildTooltip(model, ctx, build), [model, ctx, build]);
    return (
        <section className="ibTooltip" aria-label="Item tooltip">
            {lines.map((line, i) => <TooltipLine key={i} line={line}/>)}
        </section>
    );
}
```

- [ ] **Step 4: Wire the panel**

In `src/ItemBuilderPanel.jsx`:
- Add imports after the `SearchableSelect` import:
```js
import ErrorBoundary from "./ErrorBoundary.jsx";
import ItemTooltip from "./ItemTooltip.jsx";
import {encodeBuildQuery} from "./itemBuilderHash.js";
```
- Replace the whole header comment (its first three lines) with:
```js
// The Item Builder tab: base, quality, ethereal and level controls, the item card, the roll odds, the item
// tooltip, and the affix list. The build comes from useItemBuilder (src/useItemBuilder.js) through props;
// this component only keeps UI state (search text, copy-link state, whether the card is in view).
```
- In `AffixRow`, change the `locked` line to:
```js
    const locked = state.state === "group" || state.state === "full" || state.state === "ethereal";
```
  and after the `{state.state === "full" && …}` line add:
```jsx
            {state.state === "ethereal" && <span className="ibWhy">Not on ethereal items</span>}
```
- In the controls, right after the quality `{qualities.length > 1 && (…)}` block, add:
```jsx
                {base?.canEthereal && (
                    <button type="button" className={`btn ibQualityBtn${build.eth ? " active" : ""}`} aria-pressed={build.eth}
                            onClick={() => update({eth: !build.eth})}>
                        Ethereal
                    </button>
                )}
```
- In the list, change `state={rowState(a, picked, caps)}` to `state={rowState(a, picked, caps, build.eth)}`.
- Inside `.ibCardCol`, right after the `{odds && (…)}` block, add:
```jsx
                {base && (
                    <ErrorBoundary resetKey={encodeBuildQuery(model, build)}
                                   fallback={<section className="ibTooltip"><p className="ibTooltipError">The tooltip couldn't be built.</p></section>}>
                        <ItemTooltip model={model} ctx={ctx} build={build}/>
                    </ErrorBoundary>
                )}
```

- [ ] **Step 5: Add the styles**

In `src/styles.css`, after the `.ibOddsNote { … }` rule, add:
```css
/* The item tooltip under the roll odds (src/ItemTooltip.jsx): centred lines like the game's. */
.ibTooltip {
    margin-top: 10px;
    padding: 12px 14px;
    border-radius: 12px;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.35));
    border: 1px solid rgba(202, 161, 74, 0.45);
    text-align: center;
    overflow-wrap: anywhere;
}

.ibTipLine {
    margin: 0;
    color: var(--text);
    font-size: 14px;
    line-height: 1.45;
}

.ibTipName {
    font-size: 16px;
    font-weight: 700;
}

.ibTipBlue,
.ibTipMagic {
    color: var(--c-blue);
}

.ibTipRare {
    color: var(--ib-rare);
}

.ibTipCrafted {
    color: var(--ib-crafted);
}

.ibTipPlaceholder {
    font-weight: 400;
    font-style: italic;
    opacity: 0.6;
}

.ibTipByRoll {
    color: var(--muted);
    font-size: 12px;
    cursor: help;
}

.ibTooltipError {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
}
```
No mobile rule is needed (`.ibCardCol` is one flex item on phones). If one turns out to be needed, search the 980px, 720px and 480px blocks for copies first (CLAUDE.md).

- [ ] **Step 6: Lint, test, build**

Run: `npm run lint && npm test && npm run build`
Expected: 0 problems, all tests pass, the build succeeds.

- [ ] **Step 7: Look at it**

With the dev server from Step 1, open `http://localhost:5180/TheArchivistSoE/#/itembuilder` in headless Chromium (or a browser) and check by eye: a Monarch with Holy and of Ease and Ethereal on matches the first worked example; the toggle appears after the quality buttons; a Hand Axe with Jagged shows the muted "(by roll)" tags.

- [ ] **Step 8: Commit**

```bash
git add src/ErrorBoundary.jsx src/ItemTooltip.jsx src/ItemBuilderPanel.jsx src/styles.css
git commit -m "Item Builder UI: the item tooltip card under the roll odds, the Ethereal toggle, of Ages locked while ethereal"
```

---

### Task 9: Browser check, regression gates, size report and docs

**Files:**
- Modify: `tools/checks/check-itembuilder.mjs`
- Modify: `CLAUDE.md` (the Item Builder and stat-engine bullets)

**Interfaces:**
- Consumes: everything above; a dev server on port 5180 (Step 1 starts one if it isn't running).
- Produces: browser checks; the size report for the user.

- [ ] **Step 0: Make sure a dev server is up**

Run `curl -sf http://localhost:5180/TheArchivistSoE/ >/dev/null && echo up || echo down`. If it prints `down`, start one in the background (`npm run dev -- --port 5180 --strictPort`) and wait for "ready".

- [ ] **Step 1: Extend the browser check**

In `tools/checks/check-itembuilder.mjs`:
- In the file's first comment, append ", the item tooltip, the Ethereal toggle" after "the roll-odds line".
- Insert this block right before the `// Phone (Review Focus 4): …` comment:
```js
    // The item tooltip (stat summing spec): a base with no picks, then picks summed into it.
    const tipLines = () => page.eval(`[...document.querySelectorAll(".ibTooltip .ibTipLine")].map((e) => e.textContent)`);
    await page.goto(`${BASE}#/itembuilder?v=${v}&b=hax&il=30`);
    await page.waitFor(`!!document.querySelector(".ibTooltip")`);
    let tip = await tipLines();
    c.ok(tip[0] === "Hand Axe" && tip.includes("One-Hand Damage: 3 to 6") && tip.includes("Durability: 56 of 56"),
        "the tooltip shows a base with no picks", JSON.stringify(tip));
    await page.click(`.ibRow[data-key="p186"]`); // Jagged, 10-20% Enhanced Damage
    await sleep(200);
    tip = await tipLines();
    c.ok(tip[0] === "Jagged Hand Axe" && tip.includes("One-Hand Damage: 3 to 7")
        && tip.includes("+17-20% Enhanced Damage (by roll)") && tip.includes("+1 to Maximum Damage (by roll)"),
        "picking Jagged sums into the damage line and tags the by-roll lines", JSON.stringify(tip));
    const byRollTitle = await page.eval(`document.querySelector(".ibTipByRoll")?.title ?? ""`);
    c.ok(/low rolls add maximum damage/.test(byRollTitle), "the (by roll) tag carries its explanation", byRollTitle);
    const tipBox = await page.eval(`(() => { const t = document.querySelector(".ibTooltip").getBoundingClientRect(); const card = document.querySelector(".ibCard").getBoundingClientRect(); return {below: t.top >= card.bottom, left: Math.round(t.left - card.left), width: Math.round(t.width - card.width)}; })()`);
    c.ok(tipBox.below && tipBox.left === 0 && tipBox.width === 0, "the tooltip card sits under the card, as wide as it", JSON.stringify(tipBox));
    await page.screenshot("shots/itembuilder-desktop-tooltip.png");

    // Ethereal: the toggle on an eligible base, of Ages dropped with a notice, e=1 across a reload, off on a bow.
    const ethBtn = `[...document.querySelectorAll(".ibControls .btn")].find((b) => b.textContent === "Ethereal")`;
    await page.goto(`${BASE}#/itembuilder?v=${v}&b=uit&a=s404`);
    await page.waitFor(`!!document.querySelector(".ibTooltip")`);
    c.ok(await page.eval(`!!${ethBtn}`), "a Monarch shows the Ethereal toggle");
    await page.eval(`${ethBtn}.click()`);
    await sleep(300);
    s = await state(page);
    c.ok(/&e=1/.test(s.hash) && !/s404/.test(s.hash) && s.notice === "1 affix no longer fits and was removed.",
        "turning Ethereal on drops of Ages with the notice", JSON.stringify(s));
    const agesWhy = await page.eval(`document.querySelector('.ibRow[data-key="s404"] .ibWhy')?.textContent ?? null`);
    c.ok(agesWhy === "Not on ethereal items", "of Ages is greyed while Ethereal is on", String(agesWhy));
    tip = await tipLines();
    c.ok(tip.includes("Defense: 166-185") && tip.at(-1) === "Ethereal (Cannot Be Repaired)", "the ethereal tooltip shows x5/4 defense and the footer", JSON.stringify(tip));
    await page.goto(BASE + s.hash);
    await page.waitFor(`!!document.querySelector(".ibTooltip")`);
    c.ok(await page.eval(`${ethBtn}?.getAttribute("aria-pressed") === "true"`), "e=1 survives a reload");
    await selectBase(page, "sbw"); // Short Bow
    s = await state(page);
    c.ok(await page.eval(`!${ethBtn}`) && !/&e=1/.test(s.hash) && /^Ethereal was turned off: Short Bow can't be ethereal\./.test(s.notice ?? ""),
        "a bow hides the toggle and turns Ethereal off with a notice", JSON.stringify(s));
```
- Insert this block right before the `// Desktop tab click still works after all this …` comment:
```js
    // Phone order: controls, card, odds, tooltip, list; the long block line wraps without overflow (Review Focus 5).
    await page.goto(`${BASE}#/itembuilder?v=${v}&b=uow&a=s173`);
    await page.waitFor(`!!document.querySelector(".ibTooltip")`);
    const order = await page.eval(`(() => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const [controls, card, odds, tooltip, list] = [".ibControls", ".ibCard", ".ibOdds", ".ibTooltip", ".ibList"].map(r); return controls.bottom <= card.top && card.bottom <= odds.top && odds.bottom <= tooltip.top && tooltip.bottom <= list.top; })()`);
    const tipOverflow = await page.eval(OVERFLOW_CHECK);
    c.ok(order && tipOverflow.count === 0 && tipOverflow.scrollWidth <= tipOverflow.vw,
        "phone order: controls, card, odds, tooltip, list, with no horizontal overflow", JSON.stringify(tipOverflow.offenders));
    await page.screenshot("shots/itembuilder-phone-tooltip.png");
```

- [ ] **Step 2: Run the browser checks**

Run (dev server on port 5180):
```bash
cd tools/checks
APP_URL=http://localhost:5180/TheArchivistSoE/ node check-itembuilder.mjs
APP_URL=http://localhost:5180/TheArchivistSoE/ node check-affix-stats.mjs
cd ../..
```
Expected: every line PASS (the new ones included), no FAIL. Look at `shots/itembuilder-desktop-tooltip.png` and `shots/itembuilder-phone-tooltip.png`.

- [ ] **Step 3: Desktop regression**

Run:
```bash
cd tools/checks
node compare-desktop.mjs after http://localhost:5180/TheArchivistSoE/
node diff-shots.mjs before after
cd ../..
```
Expected: every tab other than `itembuilder` reports no difference. If another tab differs, stop and report which.

- [ ] **Step 4: Gates and size report**

Run:
```bash
npm run lint && npm test && npm run build
gzip -c public/data/standard/ItemBuilder.json | wc -c
for f in dist/assets/*.js; do echo "$f $(gzip -c "$f" | wc -c)"; done
```
Expected: 0 lint problems, all tests pass, build succeeds. Compare with Task 1's baselines: `ItemBuilder.json` about 14–15 KB gzipped larger (about 7 KB `statDict`, about 7 KB the base fields; the spec's "about 8 KB" counted only `statDict`), the JS bundle about 7–10 KB gzipped larger. Note both numbers for the final report.

- [ ] **Step 5: Update `CLAUDE.md`**

In the "The Item Builder (`itembuilder` tab)" bullet, after the `src/itemBuilderOdds.js` sentence, add:
```
The item tooltip under the odds: `src/baseLines.js` (defense, per-class block capped at 80, damage, requirements; PD2's ethereal ×5/4 and −10 Str/Dex), `src/itemTooltip.js` (`engineBase`, `expandPicks`, `buildTooltip`, and `checkTrimmedStatData`, the build-time check) and `src/ItemTooltip.jsx` (inside its own `ErrorBoundary` with a `fallback`). `build.eth` is the Ethereal toggle, `e=1` in the URL; `ItemBuilder.json` (version 3) carries each base's tooltip fields (defaults left out, restored by `prepareItemBuilder`) and `statDict`, the engine's trimmed dictionary. Design: `docs/superpowers/specs/2026-10-12-item-builder-stat-summing-design.md`.
```
At the end of "The stat engine" bullet (after its "Design: `docs/superpowers/specs/2026-10-11-stat-engine-affixes-design.md`."), add:
```
 The engine also runs in the browser, for the Item Builder's tooltip: at the build's exact item level, with a base context (funcs 5/6/7/14), `sumEntries` (sources, by-roll lines) and `sumEnds`, over `trimStatData`'s dictionary as rebuilt by `statDataFromJson`.
```
and change "`HARDCODED_STRINGS`" in that bullet to "`HARDCODED_STRINGS`, `TOOLTIP_STRINGS`, `ENGINE_STATS`".

- [ ] **Step 6: Stop the dev server, commit**

Stop the background dev server. Then:
```bash
git add tools/checks/check-itembuilder.mjs CLAUDE.md
git commit -m "Item Builder tooltip: browser checks (tooltip, ethereal, phone order), CLAUDE.md"
```

- [ ] **Step 7: Report**

Tell the user: the tests and checks that ran and their results, the desktop diff result, the two size numbers against the baselines, and anything that differed from this plan. Don't push or open a PR.
