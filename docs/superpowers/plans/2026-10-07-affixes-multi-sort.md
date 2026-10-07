# Affixes Multi-Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let readers sort the Affixes table by several columns: a Multi-sort switch makes header clicks append columns, a "Sorted by:" chip bar shows and edits the order, and the order persists in `localStorage`.

**Architecture:** The sort becomes an ordered list of `{key, dir}` (empty = an implicit Attributes ▲ fallback). All list logic is pure and unit-tested in `src/sortCompare.js`; `App` holds the list and saves it; `AffixesPanel` sorts with `compareAffixesBy`, renders its header cells from one column list (markers, `aria-sort`), resets the page and scroll on every change; a stateless `AffixSortBar` renders the chips, Reset and the switch.

**Tech Stack:** React 19, Vite 7, plain JS/JSX, plain CSS, Vitest (dev only), headless Chromium over CDP for UI checks.

**Spec:** `docs/superpowers/specs/2026-10-07-affixes-multi-sort-design.md` (read it before starting; this plan argues from it).

## Global Constraints

- Plain JavaScript (no TypeScript), plain CSS; no new runtime dependencies (only `react` and `react-dom`).
- `npm run lint` must report **0 problems** (CI enforces `LINT_BASELINE: 0`); no `eslint-disable`. `react-hooks/exhaustive-deps` is active: memo deps must be complete.
- React Compiler rules are active: no `setState` in effects, no ref reads during render. Ref reads in event handlers are fine.
- Test files import `describe`/`it`/`expect` from `"vitest"` explicitly. The existing `sortCompare.test.js` tests stay as they are (only its import line grows).
- Pure logic in `src/sortCompare.js`; the new UI in `src/AffixSortBar.jsx`, not inline in `App.jsx`.
- `localStorage` key: `"the-archivist-affix-sort"`; default sort `[{key: "attrs", dir: "asc"}]`, used only as the fallback for an empty list.
- No header `th` may get a `style` prop (the floating sticky header writes inline widths to its copies).
- Desktop at rest: every tab except Affixes pixel-identical to `main` (1500px full-page screenshots, fresh profile).
- Work in a manual worktree: `git worktree add .worktrees/affixes-multi-sort -b affixes-multi-sort main`. **Never use the EnterWorktree tool.** Commit on the branch; don't push, open PRs or merge.
- Node is not on the Bash tool's PATH: prefix commands with `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" &&` (check `ls ~/.nvm/versions/node` first).
- Servers: `cd` as its own statement, then `nohup env npm_package_version=1.2.1 node node_modules/vite/bin/vite.js --port <p> --strictPort > <log> 2>&1 &` and `echo $! > <pidfile>`; stop with `kill "$(cat <pidfile>)"`. **Never `pkill -f` / `pgrep -f`.** The real-phone server binds **only** to `--host 100.91.245.9` (Tailscale), never `0.0.0.0` or the LAN.
- Memory is constrained (WSL): run `free -h` before and after heavy work; if `available` drops below ~1.5 GB, tell the user.
- Commit messages: plain, no attribution lines.
- `$SCRATCH` below means your session's scratchpad directory. `/tmp` may be wiped by a WSL restart: the whole CDP harness is in this plan's appendices, so recreate it from there whenever it's missing.

## Review Focus

1. **Identity stability of the effective sort.** If `effectiveSort` or a no-op helper returned a fresh array, `sorted` would change identity every render and the pager would snap to page 1 constantly. Pinned by the `effectiveSort(list) === list` and "same list for an absent key" unit tests (Task 1) and the "page 3 → page 1 only on a sort change" browser check (Task 4).
2. **Plain clicks with an empty list.** Clicking Attributes must flip the implicit default to `[Attributes ▼]` (as today), and clicking another column must not drag Attributes into the list. Pinned by `clickSort` unit tests (Task 1) and the "plain: Grp → [Grp ▲]" browser check (Task 4).
3. **Sorting deep in the table.** From the real sticky header inside the desktop 800px box, the box must return to row 1; from the floating header, the page must come back to the table top (under the pinned bar on a phone) while the phone's sideways position is kept. Pinned by three browser checks in Task 4.
4. **Corrupt or stale `localStorage`.** Garbage must load the default, never throw into the `ErrorBoundary`. Pinned by the `parseStoredSort` unit tests (Task 1) and the "corrupt stored value" browser check (Task 4).
5. **Header pixels at rest.** The mapped header cells must render exactly like today's hand-written ones (text, Tips, lone ▲). Pinned by the full 19-tab pixel diff after Task 2 (before the sort bar exists, Affixes too must be identical) and the header-text browser check (Task 4).

---

## File Structure

- Modify `src/sortCompare.js`: add `DEFAULT_AFFIX_SORT`, `AFFIX_SORT_LABELS`, `effectiveSort`, `compareAffixesBy`, `clickSort`, `flipSortKey`, `removeSortKey`, `parseStoredSort`.
- Modify `src/sortCompare.test.js`: import line + new `describe` blocks.
- Modify `src/App.jsx`: import line (`./sortCompare.js`, `./AffixSortBar.jsx`); `AFFIX_COLUMNS` + the top of `AffixesPanel` (~line 2815); its `head={…}` prop; `App`'s `affixSort` state (~line 3413) and the `<AffixesPanel …/>` props (~line 4222).
- Create `src/AffixSortBar.jsx`: the sort bar.
- Modify `src/styles.css`: a new "Affixes sort bar" block after the `.floatingHead` rules (~line 1115), plus a `@media (hover: none)` block for touch sizes.
- Modify `CLAUDE.md`: the Affixes section.

Line numbers are from `main` at `da4c148` and drift; search for the quoted code.

---

### Task 1: Worktree and the pure sort-list logic

**Files:**
- Modify: `src/sortCompare.js` (append after `compareAffixes`)
- Test: `src/sortCompare.test.js`

**Interfaces:**
- Produces (all exported from `src/sortCompare.js`; a "list" is an array of `{key, dir}` with `key` in `AFFIX_SORT_KEYS`, `dir` `"asc" | "desc"`, keys unique):
  - `DEFAULT_AFFIX_SORT`: frozen `[{key: "attrs", dir: "asc"}]` (entry frozen too).
  - `AFFIX_SORT_LABELS`: `{[key]: string}` header text per key.
  - `effectiveSort(list)` → `list` itself if non-empty, else `DEFAULT_AFFIX_SORT`.
  - `compareAffixesBy(a, b, list)` → `-1 | 0 | 1`.
  - `clickSort(list, key, {multi})` → new list.
  - `flipSortKey(list, key)`, `removeSortKey(list, key)` → new list, or the same `list` when `key` isn't in it.
  - `parseStoredSort(raw)` → clean list (`[]` if nothing valid); never throws.

- [ ] **Step 1: Create the worktree and install**

```bash
cd /home/emanresu/TheArchivistSoE
git worktree add .worktrees/affixes-multi-sort -b affixes-multi-sort main
cd .worktrees/affixes-multi-sort
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npm ci
```

All later paths are relative to `.worktrees/affixes-multi-sort`.

- [ ] **Step 2: Write the failing tests**

In `src/sortCompare.test.js`, replace the import block:

```js
import {
    AFFIX_SORT_KEYS,
    affixPrimaryPropertyAndMax,
    affixSortValue,
    compareAffixes,
    compareValues,
    isMissing,
} from "./sortCompare.js";
```

with:

```js
import {
    AFFIX_SORT_KEYS,
    AFFIX_SORT_LABELS,
    DEFAULT_AFFIX_SORT,
    affixPrimaryPropertyAndMax,
    affixSortValue,
    clickSort,
    compareAffixes,
    compareAffixesBy,
    compareValues,
    effectiveSort,
    flipSortKey,
    isMissing,
    parseStoredSort,
    removeSortKey,
} from "./sortCompare.js";
```

Then append to the end of the file:

```js
// ---- Multi-column sort ----------------------------------------------------------------------------

const asc = (key) => ({key, dir: "asc"});
const desc = (key) => ({key, dir: "desc"});

// A frozen list of frozen entries: any helper that mutates its input throws (ES modules are strict).
const frozen = (...entries) => Object.freeze(entries.map((e) => Object.freeze({...e})));

function sortIdsBy(rows, list) {
    return [...rows].sort((a, b) => compareAffixesBy(a, b, list)).map((r) => r.id);
}

describe("compareAffixesBy", () => {
    const rows = [
        affix("a", {group: 2, level: 10, maxLevel: null, requiredLevel: 5}),
        affix("b", {group: 1, level: 20, maxLevel: 40, requiredLevel: null}),
        affix("c", {group: 2, level: 30, maxLevel: 60, requiredLevel: null}),
        affix("d", {group: 1, level: 20, maxLevel: null, requiredLevel: 9}),
        affix("e", {group: 2, level: 10, maxLevel: 50, requiredLevel: 1}),
    ];

    it("with one key, matches compareAffixes for every column in both directions", () => {
        const sample = [
            ...rows,
            affix("f", {
                name: "Bronze", rare: "", frequency: 3, classDisplayName: "Amazon",
                displayItemTypeNames: ["Amulets"], displayExcludedItemTypeNames: ["Wand"],
                displayProperties: [{property: "dex", max: 3}],
            }),
        ];
        for (const key of AFFIX_SORT_KEYS) {
            for (const dir of ["asc", "desc"]) {
                for (const x of sample) {
                    for (const y of sample) {
                        expect(compareAffixesBy(x, y, [{key, dir}]), `${key} ${dir} ${x.id} ${y.id}`)
                            .toBe(compareAffixes(x, y, key, dir));
                    }
                }
            }
        }
    });

    it("uses a later key only to break the ties left by earlier ones", () => {
        expect(sortIdsBy(rows, [asc("group"), desc("level")])).toEqual(["b", "d", "c", "a", "e"]);
        expect(sortIdsBy(rows, [desc("level"), asc("group")])).toEqual(["c", "b", "d", "a", "e"]);
    });

    it("keeps each key's missing-value rule inside a list", () => {
        // Max lvl: null is "no cap", so it sorts last ascending within each group.
        expect(sortIdsBy(rows, [asc("group"), asc("maxLevel")])).toEqual(["b", "d", "e", "c", "a"]);
        // Req lvl: null is missing, so it sorts first ascending within each group.
        expect(sortIdsBy(rows, [asc("group"), asc("reqLevel")])).toEqual(["b", "d", "c", "e", "a"]);
    });

    it("keeps rows tied on every key in their incoming order", () => {
        expect(sortIdsBy(rows, [asc("rare"), desc("freq")])).toEqual(["a", "b", "c", "d", "e"]);
    });

    it("returns 0 for an empty list", () => {
        expect(compareAffixesBy(rows[0], rows[1], [])).toBe(0);
    });

    it("throws for an unknown key in the list, once it is reached", () => {
        expect(() => compareAffixesBy(rows[0], rows[1], [asc("bogus")])).toThrow(/bogus/);
        // b and d tie on Grp, so the second key is reached.
        expect(() => compareAffixesBy(rows[1], rows[3], [asc("group"), asc("bogus")])).toThrow(/bogus/);
    });
});

describe("effectiveSort", () => {
    it("falls back to the frozen default for an empty list", () => {
        expect(effectiveSort([])).toBe(DEFAULT_AFFIX_SORT);
        expect(DEFAULT_AFFIX_SORT).toEqual([{key: "attrs", dir: "asc"}]);
        expect(Object.isFrozen(DEFAULT_AFFIX_SORT)).toBe(true);
        expect(Object.isFrozen(DEFAULT_AFFIX_SORT[0])).toBe(true);
    });

    it("returns a non-empty list itself, not a copy", () => {
        const list = [asc("group")];
        expect(effectiveSort(list)).toBe(list);
    });
});

describe("clickSort", () => {
    describe("plain click (Multi-sort off)", () => {
        it("on an empty list, Attributes flips the default", () => {
            expect(clickSort(frozen(), "attrs", {multi: false})).toEqual([desc("attrs")]);
        });

        it("on an empty list, another column sorts ascending without Attributes", () => {
            expect(clickSort(frozen(), "group", {multi: false})).toEqual([asc("group")]);
        });

        it("flips the sole key when it is clicked again", () => {
            expect(clickSort(frozen(asc("group")), "group", {multi: false})).toEqual([desc("group")]);
            expect(clickSort(frozen(desc("group")), "group", {multi: false})).toEqual([asc("group")]);
        });

        it("replaces any other list with the clicked column ascending", () => {
            expect(clickSort(frozen(asc("group")), "level", {multi: false})).toEqual([asc("level")]);
            const list = frozen(asc("group"), desc("level"));
            expect(clickSort(list, "level", {multi: false})).toEqual([asc("level")]);
            expect(clickSort(list, "name", {multi: false})).toEqual([asc("name")]);
        });
    });

    describe("multi click (Multi-sort on)", () => {
        it("on an empty list, starts the list with the clicked column, without the default", () => {
            expect(clickSort(frozen(), "group", {multi: true})).toEqual([asc("group")]);
            expect(clickSort(frozen(), "attrs", {multi: true})).toEqual([asc("attrs")]);
        });

        it("appends a new column ascending at the end", () => {
            expect(clickSort(frozen(asc("group"), desc("level")), "maxLevel", {multi: true}))
                .toEqual([asc("group"), desc("level"), asc("maxLevel")]);
        });

        it("flips a column already in the list in place", () => {
            expect(clickSort(frozen(asc("group"), desc("level"), asc("name")), "level", {multi: true}))
                .toEqual([asc("group"), asc("level"), asc("name")]);
        });
    });

    it("never mutates its input and always returns a new array", () => {
        const list = frozen(asc("group"));
        for (const [key, multi] of [["group", false], ["level", false], ["group", true], ["level", true]]) {
            expect(clickSort(list, key, {multi})).not.toBe(list);
        }
        expect(list).toEqual([asc("group")]);
    });
});

describe("flipSortKey", () => {
    it("flips only its key, in place", () => {
        expect(flipSortKey(frozen(asc("group"), desc("level")), "level")).toEqual([asc("group"), asc("level")]);
        expect(flipSortKey(frozen(asc("group"), desc("level")), "group")).toEqual([desc("group"), desc("level")]);
    });

    it("returns the same list for a key that isn't in it", () => {
        const list = frozen(asc("group"));
        expect(flipSortKey(list, "level")).toBe(list);
    });
});

describe("removeSortKey", () => {
    it("removes only its key, keeping the others in order", () => {
        expect(removeSortKey(frozen(asc("group"), desc("level"), asc("name")), "level"))
            .toEqual([asc("group"), asc("name")]);
    });

    it("returns an empty list when the last key is removed", () => {
        expect(removeSortKey(frozen(asc("group")), "group")).toEqual([]);
    });

    it("returns the same list for a key that isn't in it", () => {
        const list = frozen(asc("group"));
        expect(removeSortKey(list, "level")).toBe(list);
    });
});

describe("parseStoredSort", () => {
    it("returns an empty list for nothing, invalid JSON and non-arrays, without throwing", () => {
        for (const raw of [null, undefined, "", "nope", "{nope", "{}", "42", "null", "[]"]) {
            expect(parseStoredSort(raw), String(raw)).toEqual([]);
        }
    });

    it("drops entries that aren't {key, dir} objects with a known key and asc or desc", () => {
        const raw = JSON.stringify([
            null, 1, "attrs", ["group", "asc"], {key: "bogus", dir: "asc"},
            {key: "group"}, {key: "level", dir: "up"}, {key: "name", dir: "desc"},
        ]);
        expect(parseStoredSort(raw)).toEqual([desc("name")]);
    });

    it("keeps the first of duplicate keys and drops extra fields", () => {
        const raw = JSON.stringify([{key: "group", dir: "desc", extra: 1}, {key: "group", dir: "asc"}, asc("level")]);
        expect(parseStoredSort(raw)).toEqual([desc("group"), asc("level")]);
    });

    it("round-trips a valid list", () => {
        const list = [asc("types"), asc("attrs"), desc("maxLevel")];
        expect(parseStoredSort(JSON.stringify(list))).toEqual(list);
    });
});

describe("AFFIX_SORT_LABELS", () => {
    it("has a non-empty label for every sortable column, and nothing else", () => {
        expect(Object.keys(AFFIX_SORT_LABELS).sort()).toEqual([...AFFIX_SORT_KEYS].sort());
        for (const key of AFFIX_SORT_KEYS) expect(AFFIX_SORT_LABELS[key], key).toMatch(/\S/);
    });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npx vitest run src/sortCompare.test.js`
Expected: FAIL (the new imports are `undefined`: `compareAffixesBy is not a function` and similar). The pre-existing tests in the file still pass.

- [ ] **Step 4: Write the implementation**

Append to `src/sortCompare.js`, after `compareAffixes`:

```js
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
```

- [ ] **Step 5: Run the tests and lint**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npm test && npm run lint`
Expected: every test file passes; lint 0 problems.

- [ ] **Step 6: Commit**

```bash
git add src/sortCompare.js src/sortCompare.test.js
git commit -m "Affixes multi-sort: sort-list helpers (compareAffixesBy, clickSort, parseStoredSort, ...) with tests"
```

---

### Task 2: The sort list in App and AffixesPanel (no sort bar yet)

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes (Task 1): `AFFIX_SORT_LABELS`, `clickSort`, `compareAffixesBy`, `effectiveSort`, `parseStoredSort` from `./sortCompare.js`.
- Produces: `AffixesPanel` props `sort` (a list) and `onChangeSort(nextList)`; inside `AffixesPanel`, `changeSort(nextList)` and the `multi` state (setter added in Task 3) that Task 3 hands to the sort bar.

After this task the table sorts through the list model with plain clicks only (`multi` stays `false` until Task 3 adds the switch). At rest the whole app is pixel-identical to `main`.

- [ ] **Step 1: Imports**

In `src/App.jsx` replace:

```jsx
import {compareAffixes} from "./sortCompare.js";
```

with:

```jsx
import {AFFIX_SORT_LABELS, clickSort, compareAffixesBy, effectiveSort, parseStoredSort} from "./sortCompare.js";
```

- [ ] **Step 2: `App`'s state and its saving handler**

Replace:

```jsx
    const [affixSort, setAffixSort] = useState({
        key: "attrs",   // default column
        dir: "asc",     // or "desc" if you prefer
    });
```

with:

```jsx
    // The Affixes sort list (empty = the implicit Attributes ▲, see effectiveSort), kept across visits.
    const AFFIX_SORT_STORAGE_KEY = "the-archivist-affix-sort";
    const [affixSort, setAffixSort] = useState(() => {
        try {
            return parseStoredSort(window.localStorage.getItem(AFFIX_SORT_STORAGE_KEY));
        } catch (e) {
            console.warn("Failed to read the Affixes sort from storage", e);
            return [];
        }
    });

    // Saved in the handler, not an effect or a state updater (StrictMode runs updaters twice).
    const changeAffixSort = (next) => {
        setAffixSort(next);
        try {
            window.localStorage.setItem(AFFIX_SORT_STORAGE_KEY, JSON.stringify(next));
        } catch (e) {
            console.warn("Failed to save the Affixes sort", e);
        }
    };
```

and in the `<AffixesPanel …/>` element replace `onChangeSort={setAffixSort}` with `onChangeSort={changeAffixSort}`.

- [ ] **Step 3: The column list and the top of `AffixesPanel`**

Replace everything from `function AffixesPanel({data, loading, error, sort, onChangeSort}) {` down to and including the `sortArrowFor` function:

```jsx
    const sortArrowFor = (key) => {
        if (sortKey !== key) return null;
        return <span className="sortArrow">{sortDir === "asc" ? "▲" : "▼"}</span>;
    };
```

with:

```jsx
// The Affixes columns in display order (the order of AFFIX_SORT_KEYS); `tip` names a TOOLTIPS_TEXT_MAP
// entry. Header texts come from AFFIX_SORT_LABELS.
const AFFIX_COLUMNS = [
    {key: "name"},
    {key: "attrs"},
    {key: "level", tip: "affixLevel"},
    {key: "group", tip: "affixGroup"},
    {key: "rare", tip: "affixRares"},
    {key: "freq", tip: "affixFrequency"},
    {key: "maxLevel", tip: "affixMaxLevel"},
    {key: "types"},
    {key: "excluded"},
    {key: "class"},
    {key: "reqLevel", tip: "affixRequiredLevel"},
];

function AffixesPanel({data, loading, error, sort, onChangeSort}) {
    const wrapperRef = React.useRef(null);

    // Multi-sort switch: header clicks append columns instead of replacing the sort. Not saved.
    const [multi] = React.useState(false);

    // Normalised data coming from global filters/search
    const all = React.useMemo(() => (Array.isArray(data) ? data : []), [data]);

    // An empty sort list sorts by the default (Attributes ▲) without listing it. Same reference as
    // `sort` (or the shared default), so the memo below only re-sorts when something changed.
    const active = effectiveSort(sort);

    const sorted = React.useMemo(
        () => [...all].sort((a, b) => compareAffixesBy(a, b, active)),
        [all, active],
    );

    // Pagination runs on the *sorted* rows and goes back to page 1 whenever they change: new filtered
    // data or a new sort.
    const pager = usePager(sorted.length, {resetKey: sorted, ghost: true});

    // Every sort change shows row 1. The desktop box scrolls back to its top (scrollLeft is kept, so a
    // phone's sideways position survives); if the floating header was showing (the change came from deep
    // in the table), the page scrolls back to the table the way the bottom pager does.
    const changeSort = (next) => {
        onChangeSort(next);
        const wrapper = wrapperRef.current;
        if (!wrapper) return;
        const scroller = wrapper.querySelector(".affixTableScroll");
        if (scroller) scroller.scrollTop = 0;
        if (wrapper.querySelector(".floatingHead")?.classList.contains("on")) {
            wrapper.scrollIntoView({block: "start"});
        }
    };

    const handleSort = (key) => changeSort(clickSort(sort, key, {multi}));

    // A lone arrow for a one-key sort (as before); with several keys each sorted column also shows its
    // position: 1▲ 2▼.
    const sortMarkerFor = (key) => {
        const index = active.findIndex((s) => s.key === key);
        if (index < 0) return null;
        return (<span className="sortArrow">
            {active.length > 1 && <span className="sortIndex">{index + 1}</span>}
            {active[index].dir === "asc" ? "▲" : "▼"}
        </span>);
    };

    // ARIA allows aria-sort on one column: the first key.
    const ariaSortFor = (key) => {
        if (active[0].key !== key) return undefined;
        return active[0].dir === "asc" ? "ascending" : "descending";
    };
```

(The removed `// Local state` comment, `sortKey`/`sortDir`, the old `sorted` memo, the old `pager` line and the old `handleSort` all go; the early returns below stay as they are.)

- [ ] **Step 4: The header cells**

In the same function, replace the whole `head={<tr> … </tr>}` prop of `<StickyHeadTable className="affixTable affixesTable" …>` (from the line `head={<tr>` through the line `</tr>}`, i.e. all eleven hand-written `<th className="sortable" …>` cells) with:

```jsx
                head={<tr>
                    {AFFIX_COLUMNS.map(({key, tip}) => {
                        const label = AFFIX_SORT_LABELS[key];
                        return (<th
                            key={key}
                            className="sortable"
                            aria-sort={ariaSortFor(key)}
                            onClick={() => handleSort(key)}
                        >
                            <span className="thLabel">
                                {tip ? <Tip text={String(TOOLTIPS_TEXT_MAP[tip])}>{label}</Tip> : label} {sortMarkerFor(key)}
                            </span>
                        </th>);
                    })}
                </tr>}
```

Keep the line after it (`>`) and the body rows unchanged. No `style` prop on the cells.

- [ ] **Step 5: Lint, tests, build**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npm run lint && npm test && npm run build`
Expected: lint 0 problems, all tests pass, build succeeds. (The state has no setter yet on purpose: `no-unused-vars` would flag an unused `setMulti`; Task 3 adds it with the switch.)

- [ ] **Step 6: Set up the harness and check pixels against `main`**

Create `$SCRATCH/checks/` and write `cdp.mjs`, `compare-desktop.mjs` and `diff-shots.mjs` there from **Appendices A–C**. Start both servers:

```bash
cd /home/emanresu/TheArchivistSoE
nohup env npm_package_version=1.2.1 node node_modules/vite/bin/vite.js --port 5185 --strictPort > "$SCRATCH/vite-5185.log" 2>&1 &
echo $! > "$SCRATCH/vite-5185.pid"
```

```bash
cd /home/emanresu/TheArchivistSoE/.worktrees/affixes-multi-sort
nohup env npm_package_version=1.2.1 node node_modules/vite/bin/vite.js --port 5187 --strictPort > "$SCRATCH/vite-5187.log" 2>&1 &
echo $! > "$SCRATCH/vite-5187.pid"
```

Then:

```bash
free -h
cd "$SCRATCH/checks" && export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" \
  && node compare-desktop.mjs main http://localhost:5185/TheArchivistSoE/ \
  && node compare-desktop.mjs t2 http://localhost:5187/TheArchivistSoE/ \
  && node diff-shots.mjs main t2
```

Expected: 19 lines, **every one** `{"diffPixels":0,"bbox":null}`, Affixes included (no sort bar yet; the mapped header cells must render exactly like the hand-written ones). Any difference is a bug in Step 4 to fix before committing. Keep both servers running for Task 4.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "Affixes multi-sort: sort list in App (saved to localStorage), mapped header cells, page and scroll reset"
```

---

### Task 3: The sort bar

**Files:**
- Create: `src/AffixSortBar.jsx`
- Modify: `src/App.jsx` (import; render it in `AffixesPanel`)
- Modify: `src/styles.css`

**Interfaces:**
- Consumes (Task 1): `AFFIX_SORT_LABELS`, `DEFAULT_AFFIX_SORT`, `flipSortKey`, `removeSortKey`. (Task 2): `sort`, `changeSort`, `multi` inside `AffixesPanel`.
- Produces: `export default function AffixSortBar({sort, onChange, multi, onMultiChange})`; DOM classes `.affixSortBar`, `.sortOrder`, `.sortByLabel`, `.sortDefault`, `.sortChip`, `.sortChipFlip`, `.sortChipRemove`, `.sortChipSep`, `.sortReset`, `.multiSortToggle` (the browser checks in Task 4 use them).

- [ ] **Step 1: Create the component**

Create `src/AffixSortBar.jsx`:

```jsx
// The Affixes sort bar: the sort order as chips (tap to reverse, × to remove), Reset, and the Multi-sort
// switch that makes header clicks append columns. Stateless: the sort list lives in App, the switch in
// AffixesPanel.
import React from "react";
import {AFFIX_SORT_LABELS, DEFAULT_AFFIX_SORT, flipSortKey, removeSortKey} from "./sortCompare.js";

const arrow = (dir) => (dir === "asc" ? "▲" : "▼");
const word = (dir) => (dir === "asc" ? "ascending" : "descending");

export default function AffixSortBar({sort, onChange, multi, onMultiChange}) {
    const fallback = DEFAULT_AFFIX_SORT[0];

    return (<div className="affixSortBar">
        <div className="sortOrder">
            <span className="sortByLabel">Sorted by:</span>
            {sort.length === 0 ? (
                <span className="sortDefault">
                    {AFFIX_SORT_LABELS[fallback.key]} {arrow(fallback.dir)} (default)
                </span>
            ) : sort.map(({key, dir}, i) => {
                const label = AFFIX_SORT_LABELS[key];
                return (<React.Fragment key={key}>
                    {i > 0 && <span className="sortChipSep" aria-hidden="true">›</span>}
                    <span className="sortChip">
                        <button
                            type="button"
                            className="sortChipFlip"
                            aria-label={`${label} ${word(dir)}, reverse`}
                            onClick={() => onChange(flipSortKey(sort, key))}
                        >
                            {label} {arrow(dir)}
                        </button>
                        <button
                            type="button"
                            className="sortChipRemove"
                            aria-label={`Remove ${label}`}
                            onClick={() => onChange(removeSortKey(sort, key))}
                        >
                            ×
                        </button>
                    </span>
                </React.Fragment>);
            })}
            {sort.length > 0 && (
                <button type="button" className="sortReset" onClick={() => onChange([])}>
                    Reset
                </button>
            )}
        </div>

        <label className="toggleWrap multiSortToggle">
            <span className="toggleLabel">Multi-sort</span>
            <div className="toggle">
                <input
                    type="checkbox"
                    checked={multi}
                    onChange={(e) => onMultiChange(e.target.checked)}
                />
                <span className="toggleSlider"/>
            </div>
        </label>
    </div>);
}
```

- [ ] **Step 2: Render it in `AffixesPanel`**

In `src/App.jsx`, after `import StickyHeadTable from "./StickyHeadTable.jsx";` add:

```jsx
import AffixSortBar from "./AffixSortBar.jsx";
```

In `AffixesPanel`'s return, replace:

```jsx
                <PagerButtons {...pager.pagerProps}/>
            </div>

            {/* Scrollable table; its header row also floats while the page scrolls */}
```

with:

```jsx
                <PagerButtons {...pager.pagerProps}/>
            </div>

            <AffixSortBar sort={sort} onChange={changeSort} multi={multi} onMultiChange={setMulti}/>

            {/* Scrollable table; its header row also floats while the page scrolls */}
```

and give the switch its setter: replace `const [multi] = React.useState(false);` with
`const [multi, setMulti] = React.useState(false);`.

- [ ] **Step 3: CSS**

In `src/styles.css`, directly after the rule

```css
.floatingHead .affixTable thead {
    position: static;
    backdrop-filter: none;
}
```

(before the "Searchable select" banner) add:

```css
/* Affixes sort bar (AffixSortBar): the sort order as chips, Reset, and the Multi-sort switch. Base rules
   wrap, so phones need nothing extra; touch sizes are under (hover: none) below. */
.affixSortBar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    font-size: 13px;
    color: var(--muted);
}

.sortOrder {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-width: 0;
}

/* Chips share the active tab's gold look. */
.sortChip {
    display: inline-flex;
    align-items: stretch;
    border-radius: 8px;
    border: 1px solid rgba(202, 161, 74, 0.55);
    background: linear-gradient(180deg, rgba(202, 161, 74, 0.3), rgba(107, 75, 22, 0.25));
    color: var(--c-white);
    overflow: hidden;
}

.sortChip button,
.sortReset {
    appearance: none;
    -webkit-appearance: none;
    font: inherit;
    color: inherit;
    background: none;
    border: 0;
    cursor: pointer;
    padding: 4px 8px;
}

.sortChip button:hover {
    background: rgba(255, 255, 255, 0.06);
}

.sortChipRemove {
    border-left: 1px solid rgba(202, 161, 74, 0.35);
    opacity: 0.8;
}

.sortChipRemove:hover {
    opacity: 1;
}

.sortReset {
    padding: 4px 6px;
    color: var(--c-gold);
    text-decoration: underline;
    text-underline-offset: 2px;
}

/* The switch sits at the row's end, and on its own line's end once the row wraps. */
.multiSortToggle {
    margin-left: auto;
}

/* The key's position in a multi-column sort, before its arrow: 1▲ 2▼. */
.affixTable th .sortIndex {
    font-weight: 700;
    margin-right: 1px;
}

@media (hover: none) {
    /* Touch targets: at least 32px tall, on phones and on wide touch tablets alike. */
    .sortChip button,
    .sortReset,
    .multiSortToggle {
        min-height: 32px;
    }

    .sortChip button {
        padding: 6px 10px;
    }
}
```

Search the 980px, 720px and 480px blocks for `.toggleWrap` rules: the 720px and 480px blocks set `.toggleWrap { white-space: normal; align-items: flex-start; }`. That is harmless for the short "Multi-sort" label; leave it.

- [ ] **Step 4: Lint, tests, build**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npm run lint && npm test && npm run build`
Expected: lint 0 problems, all tests pass, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/AffixSortBar.jsx src/App.jsx src/styles.css
git commit -m "Affixes multi-sort: the sort bar (chips, Reset, Multi-sort switch)"
```

---

### Task 4: Verification and docs

**Files:**
- Modify: `CLAUDE.md`
- Scratchpad only (not committed): the harness, `check-multisort.mjs`, `check-sticky.mjs`.

**Interfaces:**
- Consumes: everything above; the DOM classes listed in Task 3.

- [ ] **Step 1: Run the multi-sort checks**

Write `$SCRATCH/checks/check-multisort.mjs` from **Appendix D** (and the harness from Appendices A–C if `/tmp` was wiped; restart the servers from Task 2 Step 6 if they're gone). Then:

```bash
free -h
cd "$SCRATCH/checks" && export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && APP_URL=http://localhost:5187/TheArchivistSoE/ node check-multisort.mjs "$SCRATCH" 2>&1 | tee check-multisort.log
```

Expected: every line `PASS`, ending `all checks passed`. Look at the screenshots (`multisort-desktop-rest.png`, `multisort-desktop-multi.png`, `multisort-phone-chips.png`): the bar reads cleanly, chips look like active tabs, the switch matches the filter toggles, nothing overlaps the pager. If a check fails, debug it (superpowers:systematic-debugging) and fix the code; don't weaken the check. If a check itself is wrong (a selector or an assumption that doesn't hold), fix the check and say so in your report.

- [ ] **Step 2: Sticky-header regression**

The header cells changed, and the floating header renders them. Extract **Appendix A** of `docs/superpowers/plans/2026-10-06-sticky-table-header.md` (the `check-sticky.mjs` code block) into `$SCRATCH/checks/check-sticky.mjs` and run:

```bash
cd "$SCRATCH/checks" && export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && APP_URL=http://localhost:5187/TheArchivistSoE/ node check-sticky.mjs "$SCRATCH" 2>&1 | tee check-sticky.log
```

Expected: all PASS (the Drop calculator part is slow: each "Deathspade" calculation can take tens of seconds). A failure that also happens on `main` (run it against port 5185 to compare) is pre-existing: report it, don't fix it here.

- [ ] **Step 3: Desktop pixels against `main`**

```bash
cd "$SCRATCH/checks" && export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" \
  && node compare-desktop.mjs final http://localhost:5187/TheArchivistSoE/ \
  && node diff-shots.mjs main final
```

(`shots/desktop-main/` is from Task 2 Step 6; re-shoot it with `node compare-desktop.mjs main http://localhost:5185/TheArchivistSoE/` if it's gone.) Expected: 18 lines `{"diffPixels":0,"bbox":null}`; `affixes.png` differs (the sort bar). Open `shots/desktop-final/affixes.png` and check by eye that only the sort bar was added and everything below it simply moved down.

Stop the `main` server: `kill "$(cat "$SCRATCH/vite-5185.pid")"`.

- [ ] **Step 4: Lint, tests, build (final)**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npm run lint && npm test && npm run build`
Expected: lint 0 problems, all tests pass, build succeeds.

- [ ] **Step 5: Update `CLAUDE.md`**

In the **Affixes** section, replace the bullet that starts ``- Sorting goes through `compareAffixes` in `src/sortCompare.js`.`` (through ``…(the old Affix level bug). Missing values sort lowest, except Max lvl, where null (no cap) sorts highest.``) with:

```markdown
- The sort is an ordered list of `{key, dir}` held in `App` (`affixSort`) and saved to `localStorage`
  (`"the-archivist-affix-sort"`, cleaned by `parseStoredSort` on load). An **empty list** is the starting
  state and sorts by the default, Attributes ▲, without listing it (`effectiveSort`). Header clicks go
  through `clickSort`: with the Multi-sort switch off they replace the sort (or flip the sole key); with it
  on they append a column or flip one in place. The sort bar (`src/AffixSortBar.jsx`) shows the order as
  chips (flip, ×) with Reset. Any sort change returns to page 1 and to the table's top.
- Rows compare through `compareAffixesBy` (each key in turn) and `compareAffixes` in `src/sortCompare.js`.
  **Every sortable column needs an entry in `AFFIX_SORT_KEYS`, a case in `affixSortValue` and a label in
  `AFFIX_SORT_LABELS`**, and a place in `AFFIX_COLUMNS` in `App.jsx`. A unit test fails for a listed key
  with no case or no label, and an unlisted key with no case throws on first sort rather than silently tying
  every row (the old Affix level bug). Missing values sort lowest, except Max lvl, where null (no cap) sorts
  highest. Rows tied on every key keep the incoming order (`filtered` pre-sorts Affixes by item types, then
  name).
```

Commit:

```bash
git add CLAUDE.md
git commit -m "CLAUDE.md: the Affixes sort list, the sort bar and AFFIX_SORT_LABELS"
```

- [ ] **Step 6: Real-phone check (the user)**

Stop the local branch server (`kill "$(cat "$SCRATCH/vite-5187.pid")"`), then serve the branch on the Tailscale address only:

```bash
cd /home/emanresu/TheArchivistSoE/.worktrees/affixes-multi-sort
nohup env npm_package_version=1.2.1 node node_modules/vite/bin/vite.js --host 100.91.245.9 --port 5179 --strictPort > "$SCRATCH/vite-5179.log" 2>&1 &
echo $! > "$SCRATCH/vite-5179.pid"
```

Ask the user to open `http://100.91.245.9:5179/TheArchivistSoE/#/affixes` on their phone and try: the default label; a plain tap on a header; the Multi-sort switch, then taps on two or three headers (numbers in the headers, chips in order); flipping and removing chips; Reset; sorting from the floating header deep in the table; a reload (the sort is kept, the switch is off). Wait for their verdict; fix anything they report (re-running Steps 1–4 after a fix). Then stop the server: `kill "$(cat "$SCRATCH/vite-5179.pid")"`.

- [ ] **Step 7: Report**

Report: the commits on `affixes-multi-sort`, the `check-multisort.log` and `check-sticky.log` summaries, the diff results (Task 2's 19 zeros and Task 4's 18 zeros), lint/test/build output, and the user's phone verdict. Don't push, open a PR or merge.

---

## Appendix A: `cdp.mjs`

```js
// Headless-Chromium harness for The Archivist UI checks, over CDP with Node's global WebSocket.
import {spawn} from "node:child_process";
import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import path from "node:path";

const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const HERE = path.dirname(new URL(import.meta.url).pathname);
export const BASE = process.env.APP_URL ?? "http://localhost:5181/TheArchivistSoE/";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The 18 sheet tabs plus Changelog, in tab-sheet order.
export const TAB_KEYS = ["weapons", "armors", "uniques", "runewords", "sacreds", "fatecards", "affixes", "skills",
    "ascendancies", "corruptions", "mapping", "kiln", "cube", "calculators", "dropcalc", "changes", "damnation",
    "help", "changelog"];

export const TAB_TITLES = {
    weapons: "Weapons", armors: "Armors", uniques: "Uniques", runewords: "Runewords", sacreds: "Sacreds",
    fatecards: "Fate Cards", affixes: "Affixes", skills: "Skills", ascendancies: "Ascendancies",
    corruptions: "Corruptions", mapping: "Mapping", kiln: "Infernal Kiln", cube: "Cube Recipes",
    calculators: "Skill Calculators", dropcalc: "Drop calculator", changes: "Standard Mode",
    damnation: "Damnation Mode", help: "Help", changelog: "Changelog",
};

// JS source for "the element matching selector, optionally containing text, optionally the nth match".
function finder(selector, {text = null, nth = 0} = {}) {
    const filter = text === null ? "" : `.filter((e) => e.textContent.includes(${JSON.stringify(text)}))`;
    return `[...document.querySelectorAll(${JSON.stringify(selector)})]${filter}[${nth}]`;
}

async function launchChrome(port) {
    const userDir = mkdtempSync(path.join(HERE, "chrome-profile-"));
    // Headless has no mouse, so by default it reports hover: none. Start it as a hover-capable fine
    // pointer (desktop); mobile() turns on touch emulation, which switches it to coarse / none.
    const proc = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
        "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4",
        `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`, "about:blank"], {stdio: "ignore"});
    for (let i = 0; i < 50; i++) {
        try {
            await fetch(`http://127.0.0.1:${port}/json/version`);
            return {proc, userDir};
        } catch {
            await sleep(200);
        }
    }
    proc.kill();
    throw new Error("Chrome did not start");
}

async function openPage(port) {
    const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {method: "PUT"});
    const {webSocketDebuggerUrl} = await res.json();
    const ws = new WebSocket(webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = reject;
    });

    let nextId = 0;
    const pending = new Map();
    const waiters = [];
    const listeners = [];
    ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id !== undefined) {
            const p = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
            else p.resolve(msg.result);
            return;
        }
        for (const l of listeners) if (l.method === msg.method) l.fn(msg.params);
        for (const w of [...waiters]) {
            if (w.method === msg.method) {
                waiters.splice(waiters.indexOf(w), 1);
                w.resolve(msg.params);
            }
        }
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, {resolve, reject, method});
        ws.send(JSON.stringify({id, method, params}));
    });
    const once = (method) => new Promise((resolve) => waiters.push({method, resolve}));
    // Calls fn(params) for every event named method, for the page's lifetime.
    const on = (method, fn) => listeners.push({method, fn});

    await send("Page.enable");
    await send("Runtime.enable");

    const page = {
        send,
        once,
        on,
        async eval(expression) {
            const r = await send("Runtime.evaluate", {expression, awaitPromise: true, returnByValue: true});
            if (r.exceptionDetails) {
                throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
            }
            return r.result.value;
        },
        // Always a fresh document: going via about:blank avoids same-document hash navigations.
        async goto(url) {
            for (const target of ["about:blank", url]) {
                const loaded = once("Page.loadEventFired");
                await send("Page.navigate", {url: target});
                await loaded;
            }
        },
        async waitFor(expression, timeout = 15000) {
            const end = Date.now() + timeout;
            while (Date.now() < end) {
                if (await page.eval(expression)) return;
                await sleep(100);
            }
            throw new Error(`Timed out waiting for: ${expression}`);
        },
        async mobile() {
            await send("Emulation.setDeviceMetricsOverride", {width: 390, height: 844, deviceScaleFactor: 2, mobile: true});
            await send("Emulation.setTouchEmulationEnabled", {enabled: true, maxTouchPoints: 5});
            await send("Emulation.setEmulatedMedia", {features: [{name: "hover", value: "none"}, {name: "pointer", value: "coarse"}]});
            await sleep(300);
        },
        async desktop(width = 1500, height = 1000) {
            await send("Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: 1, mobile: false});
            await send("Emulation.setTouchEmulationEnabled", {enabled: false});
            // Headless Chromium has no mouse, so it reports hover: none unless told otherwise.
            await send("Emulation.setEmulatedMedia", {features: [{name: "hover", value: "hover"}, {name: "pointer", value: "fine"}]});
            await sleep(300);
        },
        async center(selector, opts = {}) {
            const point = await page.eval(`(() => {
                const el = ${finder(selector, opts)};
                if (!el) return null;
                el.scrollIntoView({block: "center", inline: "nearest"});
                const r = el.getBoundingClientRect();
                return {x: r.left + r.width / 2, y: r.top + r.height / 2};
            })()`);
            if (!point) throw new Error(`No element for ${selector} ${JSON.stringify(opts)}`);
            return point;
        },
        // A real touch tap (touchStart + touchEnd), which the browser turns into pointer events and a click.
        async tap(selector, opts = {}) {
            const {x, y} = await page.center(selector, opts);
            await page.tapAt(x, y);
        },
        async tapAt(x, y) {
            await send("Input.dispatchTouchEvent", {type: "touchStart", touchPoints: [{x, y}]});
            await send("Input.dispatchTouchEvent", {type: "touchEnd", touchPoints: []});
            await sleep(250);
        },
        async click(selector, opts = {}) {
            const ok = await page.eval(`(() => { const el = ${finder(selector, opts)}; if (!el) return false; el.click(); return true; })()`);
            if (!ok) throw new Error(`No element for ${selector} ${JSON.stringify(opts)}`);
            await sleep(200);
        },
        async hover(selector, opts = {}) {
            const {x, y} = await page.center(selector, opts);
            await send("Input.dispatchMouseEvent", {type: "mouseMoved", x, y});
            await sleep(250);
        },
        // Replaces the input's value through real text input, so React's onChange fires.
        async type(selector, text) {
            const ok = await page.eval(`(() => { const el = ${finder(selector)}; if (!el) return false; el.focus(); el.select(); return true; })()`);
            if (!ok) throw new Error(`No input for ${selector}`);
            await send("Input.insertText", {text});
            await sleep(200);
        },
        async key(key) {
            const codes = {Escape: 27, Enter: 13, ArrowDown: 40, ArrowUp: 38};
            for (const type of ["keyDown", "keyUp"]) {
                await send("Input.dispatchKeyEvent", {type, key, code: key, windowsVirtualKeyCode: codes[key] ?? 0});
            }
            await sleep(200);
        },
        async screenshot(file, {fullPage = false} = {}) {
            const params = {format: "png"};
            if (fullPage) {
                const {cssContentSize} = await send("Page.getLayoutMetrics");
                params.clip = {x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1};
                params.captureBeyondViewport = true;
            }
            const {data} = await send("Page.captureScreenshot", params);
            writeFileSync(file, Buffer.from(data, "base64"));
        },
        close() {
            ws.close();
        },
    };
    return page;
}

// Launches Chrome, runs fn(page), always cleans up (the browser is killed by its own PID).
export async function run(fn, {port = 9333} = {}) {
    const {proc, userDir} = await launchChrome(port);
    const page = await openPage(port);
    try {
        await fn(page);
    } catch (e) {
        console.log(`FAIL (exception) ${e.message}`);
        process.exitCode = 1;
    } finally {
        page.close();
        proc.kill();
        await sleep(300);
        rmSync(userDir, {recursive: true, force: true});
    }
}

export function checker() {
    let failures = 0;
    return {
        ok(cond, label, detail = "") {
            console.log(`${cond ? "PASS" : "FAIL"} ${label}${detail ? ` | ${detail}` : ""}`);
            if (!cond) failures++;
        },
        done() {
            console.log(failures ? `${failures} check(s) failed` : "all checks passed");
            if (failures) process.exitCode = 1;
        },
    };
}

// Desktop only: clicks a tab in the tab row, the More menu, or (Changelog) the footer link.
export async function clickDesktopTab(page, key) {
    if (key === "changelog") {
        await page.click(".footerRight", {text: "Wiki version"});
        return;
    }
    const title = TAB_TITLES[key];
    const clicked = await page.eval(`(() => {
        const t = [...document.querySelectorAll(".tabs .tab")].find((e) => e.textContent.trim().startsWith(${JSON.stringify(title)}));
        if (!t) return false;
        t.click();
        return true;
    })()`);
    if (clicked) return;
    await page.click(".tabs .tab", {text: "More"});
    await page.click(".moreTabItem", {text: title});
}

export async function activeDesktopTab(page) {
    return page.eval(`document.querySelector(".tabs .tab.active")?.textContent.trim() ?? null`);
}

// Switches tab in place through the URL hash.
export async function openTab(page, key) {
    await page.eval(`location.hash = "#/${key}"`);
    await sleep(700);
}

// Visible elements whose box ends past the viewport's right (or starts past its left) edge. Exempt:
// content inside a horizontal scroller (auto/scroll, e.g. a swipe table: reachable by swiping), and
// content clipped by a hidden/clip box that sits strictly inside the screen (an intentional in-row
// truncation such as .uniqueName). A hidden/clip box flush with the screen edge (.appRoot, the
// edge-to-edge .listPanel) doesn't exempt anything: content cut off at the screen edge is a failure.
export const OVERFLOW_CHECK = `(() => {
    const vw = document.documentElement.clientWidth;
    const offenders = [];
    for (const el of document.querySelectorAll(".appRoot *, body > :not(#root):not(script)")) {
        if (!el.checkVisibility({opacityProperty: true, visibilityProperty: true})) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right <= vw + 0.5 && r.left >= -0.5) continue;
        let clipped = false;
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
            const ox = getComputedStyle(a).overflowX;
            if (ox === "visible") continue;
            const ar = a.getBoundingClientRect();
            const inside = ar.right <= vw + 0.5 && ar.left >= -0.5;
            const strictlyInside = ar.right < vw - 0.5 && ar.left > 0.5;
            if ((ox === "auto" || ox === "scroll") ? inside : strictlyInside) {
                clipped = true;
                break;
            }
        }
        if (!clipped) {
            offenders.push({tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 50),
                left: Math.round(r.left), right: Math.round(r.right), text: (el.textContent || "").trim().slice(0, 40)});
        }
    }
    return {vw, scrollWidth: document.documentElement.scrollWidth, count: offenders.length, offenders: offenders.slice(0, 12)};
})()`;
```

## Appendix B: `compare-desktop.mjs`

```js
// Full-page 1500px screenshots of every tab: node compare-desktop.mjs <label> <url>
// Fresh browser profile per run, so localStorage starts empty.
import {mkdirSync} from "node:fs";
import {run, TAB_KEYS, clickDesktopTab, sleep} from "./cdp.mjs";

const [label, url] = process.argv.slice(2);
const dir = new URL(`./shots/desktop-${label}/`, import.meta.url).pathname;
mkdirSync(dir, {recursive: true});

await run(async (page) => {
    await page.desktop();
    for (const key of TAB_KEYS) {
        await page.goto(url);
        await page.waitFor(`!!document.querySelector(".tabs .tab")`);
        await sleep(1500);
        await clickDesktopTab(page, key);
        await sleep(1500);
        await page.eval("window.scrollTo(0, 0)");
        await page.send("Input.dispatchMouseEvent", {type: "mouseMoved", x: 0, y: 0});
        await page.screenshot(`${dir}${key}.png`, {fullPage: true});
        console.log("shot", label, key);
    }
});
```

## Appendix C: `diff-shots.mjs`

```js
// Pixel diff of two screenshot sets: node diff-shots.mjs <labelA> <labelB>
import {readdirSync, readFileSync} from "node:fs";
import {run} from "./cdp.mjs";

const [a, b] = process.argv.slice(2).map((l) => new URL(`./shots/desktop-${l}/`, import.meta.url).pathname);

await run(async (page) => {
    await page.goto("about:blank");
    for (const file of readdirSync(a).filter((f) => f.endsWith(".png")).sort()) {
        const src = (dir) => `data:image/png;base64,${readFileSync(dir + file).toString("base64")}`;
        const r = await page.eval(`(async () => {
            const load = (s) => new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = err; i.src = s; });
            const [x, y] = await Promise.all([load(${JSON.stringify(src(a))}), load(${JSON.stringify(src(b))})]);
            if (x.width !== y.width || x.height !== y.height) return {size: [x.width, x.height, y.width, y.height]};
            const px = (img) => {
                const c = document.createElement("canvas");
                c.width = img.width; c.height = img.height;
                const ctx = c.getContext("2d");
                ctx.drawImage(img, 0, 0);
                return ctx.getImageData(0, 0, c.width, c.height).data;
            };
            const p = px(x), q = px(y);
            let n = 0, minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
            for (let i = 0; i < p.length; i += 4) {
                if (p[i] !== q[i] || p[i + 1] !== q[i + 1] || p[i + 2] !== q[i + 2]) {
                    n++;
                    const k = i / 4, cx = k % x.width, cy = (k - cx) / x.width;
                    minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
                }
            }
            return {diffPixels: n, bbox: n ? [minX, minY, maxX, maxY] : null};
        })()`);
        console.log(file.padEnd(20), JSON.stringify(r));
    }
});
```

## Appendix D: `check-multisort.mjs`

```js
// Multi-field sorting on the Affixes table. node check-multisort.mjs <screenshot dir>
// APP_URL = the branch's dev server. Fresh browser profile, so localStorage starts empty.
// Desktop checks run first: touch emulation can't be switched back to hover: hover in one browser.
import {run, checker, BASE, sleep, OVERFLOW_CHECK} from "./cdp.mjs";

const OUT = process.argv[2] ?? ".";
const c = checker();
const STORAGE_KEY = "the-archivist-affix-sort";
const URL_AFFIXES = `${BASE}#/affixes`;
const HEADERS = ["Name", "Attributes", "Lvl", "Grp", "Rares", "Freq", "Max lvl", "Item types",
    "Excluded item types", "Class", "Req lvl"];
const COL = {name: 0, attrs: 1, level: 2, group: 3, rare: 4, freq: 5, maxLevel: 6, types: 7, excluded: 8, class: 9, reqLevel: 10};
const TH = ".affixTableScroll thead th";

// Everything the sort UI shows. `markers` / `aria` are {header text: value} for the cells that have one.
const STATE = `(() => {
    const bar = document.querySelector(".affixSortBar");
    const ths = [...document.querySelectorAll(${JSON.stringify(TH)})];
    const text = (e) => e.textContent.replace(/\\s+/g, " ").trim();
    // The label text alone: without the Tip bubble's text and the sort marker.
    const headers = ths.map((th) => {
        const label = th.querySelector(".thLabel").cloneNode(true);
        label.querySelectorAll(".tipBubble, .sortArrow").forEach((e) => e.remove());
        return text(label);
    });
    const pick = (values) => Object.fromEntries(headers.map((h, i) => [h, values[i]]).filter(([, v]) => v));
    return {
        chips: [...document.querySelectorAll(".affixSortBar .sortChipFlip")].map(text),
        def: bar?.querySelector(".sortDefault") ? text(bar.querySelector(".sortDefault")) : null,
        reset: !!bar?.querySelector(".sortReset"),
        multi: bar?.querySelector(".multiSortToggle input")?.checked ?? null,
        headers,
        markers: pick(ths.map((th) => th.querySelector(".sortArrow")?.textContent ?? "")),
        copyMarkers: pick([...document.querySelectorAll(".floatingHead thead th")].map((th) => th.querySelector(".sortArrow")?.textContent ?? "")),
        aria: pick(ths.map((th) => th.getAttribute("aria-sort") ?? "")),
        page: document.querySelector(".affixPager .affixPagerInfo")?.textContent ?? "",
        rows: document.querySelectorAll(".affixTableScroll tbody tr").length,
        failed: !!document.querySelector(".errorPanel"),
    };
})()`;

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Null when the rendered rows follow `keys` ([{col, dir, numeric}]) with remaining ties in the
// incoming order (item-types text, then name, both lowercased); otherwise the first offending row.
function orderCheck(keys) {
    return `(() => {
        const keys = ${JSON.stringify(keys)};
        const rows = [...document.querySelectorAll(".affixTableScroll tbody tr")].map((tr) => [...tr.cells].map((td) => td.textContent.trim()));
        const num = (s) => (s === "" ? -Infinity : Number(s));
        const cmpText = (x, y) => (x === "" && y === "") ? 0 : x === "" ? -1 : y === "" ? 1 : Math.sign(x.localeCompare(y));
        for (let i = 1; i < rows.length; i++) {
            const a = rows[i - 1], b = rows[i];
            let cmp = 0;
            for (const k of keys) {
                const x = a[k.col], y = b[k.col];
                if (k.numeric) {
                    const p = num(x), q = num(y);
                    cmp = p === q ? 0 : p < q ? -1 : 1;
                } else {
                    cmp = cmpText(x, y);
                }
                if (k.dir === "desc") cmp = -cmp;
                if (cmp !== 0) break;
            }
            if (cmp === 0) {
                cmp = Math.sign(a[${COL.types}].toLowerCase().localeCompare(b[${COL.types}].toLowerCase()))
                    || Math.sign(a[${COL.name}].toLowerCase().localeCompare(b[${COL.name}].toLowerCase()));
            }
            if (cmp > 0) return {row: i, prev: a.slice(0, 4), next: b.slice(0, 4)};
        }
        return null;
    })()`;
}

const FIRST_NAMES = `[...document.querySelectorAll(".affixTableScroll tbody tr")].slice(0, 10).map((tr) => tr.cells[0].textContent.trim()).join("|")`;
const COPY_ON = `document.querySelector(".floatingHead")?.classList.contains("on") ?? false`;

async function freshAffixes(page) {
    await page.goto(URL_AFFIXES);
    await page.waitFor(`document.querySelectorAll(".affixTableScroll tbody tr").length > 1`);
    await page.eval("window.scrollTo(0, 0)");
    await sleep(400);
}

async function clickHeader(page, label) {
    await page.click(TH, {nth: HEADERS.indexOf(label)});
    await sleep(300);
}

async function state(page) {
    return page.eval(STATE);
}

await run(async (page) => {
    // ---------------- Desktop, 1500px ----------------
    await page.desktop(1500, 1000);
    await page.goto(URL_AFFIXES);
    await page.eval(`localStorage.removeItem(${JSON.stringify(STORAGE_KEY)})`);
    await freshAffixes(page);

    let s = await state(page);
    c.ok(same(s.headers, HEADERS), "desktop: header texts unchanged, in order", JSON.stringify(s.headers));
    c.ok(s.def === "Attributes ▲ (default)" && s.chips.length === 0 && !s.reset && s.multi === false,
        "desktop at rest: default label, no chips, no Reset, switch off", JSON.stringify(s));
    c.ok(same(s.markers, {Attributes: "▲"}) && same(s.aria, {Attributes: "ascending"}),
        "desktop at rest: lone ▲ and aria-sort on Attributes only", JSON.stringify([s.markers, s.aria]));
    await page.screenshot(`${OUT}/multisort-desktop-rest.png`);

    // Plain clicks: replace, flip the sole key, replace again.
    await clickHeader(page, "Grp");
    s = await state(page);
    c.ok(same(s.chips, ["Grp ▲"]) && same(s.markers, {Grp: "▲"}) && s.reset, "plain: Grp → [Grp ▲]", JSON.stringify(s.chips));
    await clickHeader(page, "Grp");
    s = await state(page);
    c.ok(same(s.chips, ["Grp ▼"]) && same(s.markers, {Grp: "▼"}), "plain: Grp again → [Grp ▼]", JSON.stringify(s.chips));
    await clickHeader(page, "Lvl");
    s = await state(page);
    c.ok(same(s.chips, ["Lvl ▲"]), "plain: Lvl → [Lvl ▲]", JSON.stringify(s.chips));
    let bad = await page.eval(orderCheck([{col: COL.level, dir: "asc", numeric: true}]));
    c.ok(bad === null, "plain: rows ordered by Lvl ▲, ties in incoming order", JSON.stringify(bad));

    await page.click(".affixSortBar .sortReset");
    s = await state(page);
    c.ok(s.def === "Attributes ▲ (default)" && s.chips.length === 0 && !s.reset, "Reset → default", JSON.stringify(s));

    // Multi: append, flip in place.
    await page.click(".multiSortToggle input");
    await clickHeader(page, "Grp");
    await clickHeader(page, "Lvl");
    await clickHeader(page, "Lvl");
    s = await state(page);
    c.ok(same(s.chips, ["Grp ▲", "Lvl ▼"]), "multi: Grp, Lvl, Lvl → Grp ▲ › Lvl ▼", JSON.stringify(s.chips));
    c.ok(same(s.markers, {Lvl: "2▼", Grp: "1▲"}) || same(s.markers, {Grp: "1▲", Lvl: "2▼"}), "multi: header markers 1▲ / 2▼", JSON.stringify(s.markers));
    c.ok(same(s.aria, {Grp: "ascending"}), "multi: aria-sort on the first key only", JSON.stringify(s.aria));
    c.ok(same(s.copyMarkers, s.markers), "multi: floating header shows the same markers", JSON.stringify(s.copyMarkers));
    bad = await page.eval(orderCheck([{col: COL.group, dir: "asc", numeric: true}, {col: COL.level, dir: "desc", numeric: true}]));
    c.ok(bad === null, "multi: rows ordered by Grp ▲ then Lvl ▼, then incoming order", JSON.stringify(bad));
    await page.screenshot(`${OUT}/multisort-desktop-multi.png`);

    // Chips: flip, remove, remove the last.
    await page.click(".affixSortBar .sortChipFlip", {nth: 0});
    s = await state(page);
    c.ok(same(s.chips, ["Grp ▼", "Lvl ▼"]), "chip flip: Grp ▼ › Lvl ▼", JSON.stringify(s.chips));
    await page.click(".affixSortBar .sortChipRemove", {nth: 0});
    s = await state(page);
    c.ok(same(s.chips, ["Lvl ▼"]) && same(s.markers, {Lvl: "▼"}), "chip ×: [Lvl ▼], lone arrow again", JSON.stringify([s.chips, s.markers]));
    await page.click(".affixSortBar .sortChipRemove", {nth: 0});
    s = await state(page);
    c.ok(s.def === "Attributes ▲ (default)" && s.chips.length === 0, "removing the last chip → default label", JSON.stringify(s));

    // Multi on, empty list, Attributes: becomes a real chip; rows don't move.
    const before = await page.eval(FIRST_NAMES);
    await clickHeader(page, "Attributes");
    s = await state(page);
    c.ok(same(s.chips, ["Attributes ▲"]) && (await page.eval(FIRST_NAMES)) === before,
        "multi, empty list, Attributes → [Attributes ▲], rows unchanged", JSON.stringify(s.chips));
    await page.click(".affixSortBar .sortReset");
    await page.click(".multiSortToggle input");

    // Any sort change goes back to page 1.
    for (let i = 0; i < 2; i++) await page.click(".affixPager:not(.affixPagerBottom) button", {text: "Next"});
    s = await state(page);
    c.ok(s.page.startsWith("Page 3 /"), "pager on page 3 (precondition)", s.page);
    await clickHeader(page, "Grp");
    s = await state(page);
    c.ok(s.page.startsWith("Page 1 /"), "a sort change from page 3 → page 1", s.page);

    // Deep inside the 800px box, the real sticky header sorts and the box returns to its top; the page stays put.
    await page.eval(`(() => { window.scrollTo(0, 0); document.querySelector(".affixTableScroll").scrollTop = 400; return new Promise((r) => setTimeout(r, 350)); })()`);
    await clickHeader(page, "Lvl");
    const box = await page.eval(`({top: document.querySelector(".affixTableScroll").scrollTop, y: window.scrollY, on: ${COPY_ON}})`);
    c.ok(box.top === 0 && box.y === 0 && !box.on, "sorting deep in the 800px box resets its scrollTop, page unmoved", JSON.stringify(box));

    // From the floating header deep in the page: the table top comes back into view.
    await page.eval(`(() => {
        const w = document.querySelector(".affixTableScroll");
        window.scrollTo(0, w.getBoundingClientRect().top + window.scrollY + 200);
        return new Promise((r) => setTimeout(r, 400));
    })()`);
    c.ok(await page.eval(COPY_ON), "floating header showing (precondition)");
    const p = await page.eval(`(() => { const r = document.querySelector(".floatingHead thead th:nth-child(6)").getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; })()`);
    for (const type of ["mousePressed", "mouseReleased"]) {
        await page.send("Input.dispatchMouseEvent", {type, x: p.x, y: p.y, button: "left", clickCount: 1});
    }
    await sleep(600);
    const back = await page.eval(`({top: Math.round(document.querySelector(".affixTableWrapper").getBoundingClientRect().top), chips: [...document.querySelectorAll(".affixSortBar .sortChipFlip")].map((b) => b.textContent.trim())})`);
    c.ok(Math.abs(back.top) <= 2 && same(back.chips, ["Freq ▲"]), "sorting from the floating header scrolls the table top into view", JSON.stringify(back));

    // Persistence: reload restores the list, the switch starts off.
    await page.click(".multiSortToggle input");
    await clickHeader(page, "Grp");
    const saved = (await state(page)).chips;
    await freshAffixes(page);
    s = await state(page);
    c.ok(same(s.chips, saved) && saved.length === 2 && s.multi === false, "reload restores the sort list, switch off", JSON.stringify([saved, s.chips, s.multi]));

    // A corrupt stored value loads the default.
    await page.eval(`localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, "{nope")`);
    await freshAffixes(page);
    s = await state(page);
    c.ok(s.def === "Attributes ▲ (default)" && !s.failed && s.rows > 1, "corrupt stored value → default, table renders", JSON.stringify(s));

    // ---------------- Phone, 390x844 ----------------
    await page.mobile();
    await page.eval(`localStorage.removeItem(${JSON.stringify(STORAGE_KEY)})`);
    await freshAffixes(page);

    const overflow = await page.eval(OVERFLOW_CHECK);
    c.ok(overflow.count === 0, "phone: no horizontal overflow at rest", JSON.stringify(overflow.offenders));

    await page.tap(".multiSortToggle");
    s = await state(page);
    c.ok(s.multi === true, "phone: tapping the Multi-sort switch turns it on");
    await page.tap(TH, {nth: HEADERS.indexOf("Grp")});
    await page.tap(TH, {nth: HEADERS.indexOf("Lvl")});
    await page.tapAt(5, 300); // close the Lvl Tip bubble the tap opened
    s = await state(page);
    c.ok(same(s.chips, ["Grp ▲", "Lvl ▲"]), "phone: header taps append Grp, Lvl", JSON.stringify(s.chips));

    await page.eval("window.scrollTo(0, 0)");
    await sleep(300);
    const sizes = await page.eval(`[...document.querySelectorAll(".affixSortBar .sortChipFlip, .affixSortBar .sortChipRemove, .affixSortBar .sortReset, .multiSortToggle")].map((e) => Math.round(e.getBoundingClientRect().height))`);
    c.ok(sizes.length >= 6 && sizes.every((h) => h >= 32), "phone: chips, Reset and the switch are ≥ 32px tall", JSON.stringify(sizes));
    const overflow2 = await page.eval(OVERFLOW_CHECK);
    c.ok(overflow2.count === 0, "phone: no horizontal overflow with chips", JSON.stringify(overflow2.offenders));
    await page.screenshot(`${OUT}/multisort-phone-chips.png`);

    await page.tap(".affixSortBar .sortChipFlip", {nth: 0});
    await page.tap(".affixSortBar .sortChipRemove", {nth: 1});
    s = await state(page);
    c.ok(same(s.chips, ["Grp ▼"]), "phone: chip tap flips, × removes", JSON.stringify(s.chips));

    // Swiped sideways and deep in the table: a tap on a copied header appends it, the table top comes back
    // under the pinned bar, and the sideways position is kept.
    await page.eval(`(() => {
        const sc = document.querySelector(".affixTableScroll");
        sc.scrollLeft = 300;
        window.scrollTo(0, sc.querySelector("thead").getBoundingClientRect().top + window.scrollY + 1000);
        return new Promise((r) => setTimeout(r, 400));
    })()`);
    c.ok(await page.eval(COPY_ON), "phone: floating header showing (precondition)");
    const target = await page.eval(`(() => {
        const cells = [...document.querySelectorAll(".floatingHead thead th")];
        const pinned = cells[0].getBoundingClientRect().right;
        const i = cells.findIndex((th, k) => {
            const r = th.getBoundingClientRect();
            return k > 0 && k !== ${COL.group} && r.left > pinned && r.right < innerWidth;
        });
        const r = cells[i].getBoundingClientRect();
        return {i, x: r.left + r.width / 2, y: r.top + r.height / 2};
    })()`);
    await page.tapAt(target.x, target.y);
    await page.tapAt(5, 300);
    await sleep(400);
    const after = await page.eval(`({
        chips: [...document.querySelectorAll(".affixSortBar .sortChipFlip")].map((b) => b.textContent.trim()),
        top: document.querySelector(".affixTableWrapper").getBoundingClientRect().top,
        bar: document.querySelector(".tabsPanel").getBoundingClientRect().bottom,
        left: document.querySelector(".affixTableScroll").scrollLeft,
    })`);
    c.ok(after.chips.length === 2 && after.chips[1].startsWith(HEADERS[target.i]), "phone: tapping a copied header appends it", JSON.stringify([target, after.chips]));
    c.ok(Math.abs(after.top - (after.bar + 4)) <= 2, "phone: the table top is back under the pinned bar", JSON.stringify(after));
    c.ok(after.left === 300, "phone: sideways scroll position kept", String(after.left));

    await page.tap(".affixSortBar .sortReset");
    s = await state(page);
    c.ok(s.def === "Attributes ▲ (default)", "phone: Reset → default", JSON.stringify(s.chips));
});
c.done();
```
