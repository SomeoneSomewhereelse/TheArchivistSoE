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
- `$SCRATCH` below means your session's scratchpad directory (server logs, PID files, check screenshots). The CDP harness and the check scripts are committed in `tools/checks/` (their outputs are gitignored): run them from the worktree's copy, `/home/emanresu/TheArchivistSoE/.worktrees/affixes-multi-sort/tools/checks`. If a check script itself turns out wrong, fix it there and commit the fix with a message that says so.

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

The harness is `tools/checks/cdp.mjs`, `compare-desktop.mjs` and `diff-shots.mjs`. Start both servers:

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
cd /home/emanresu/TheArchivistSoE/.worktrees/affixes-multi-sort/tools/checks && export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" \
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
- Run (already committed): `tools/checks/check-multisort.mjs`, `tools/checks/check-sticky.mjs`.

**Interfaces:**
- Consumes: everything above; the DOM classes listed in Task 3.

- [ ] **Step 1: Run the multi-sort checks**

`tools/checks/check-multisort.mjs` is ready (restart the servers from Task 2 Step 6 if they're gone). Then:

```bash
free -h
cd /home/emanresu/TheArchivistSoE/.worktrees/affixes-multi-sort/tools/checks && export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && APP_URL=http://localhost:5187/TheArchivistSoE/ node check-multisort.mjs "$SCRATCH" 2>&1 | tee check-multisort.log
```

Expected: every line `PASS`, ending `all checks passed`. Look at the screenshots (`multisort-desktop-rest.png`, `multisort-desktop-multi.png`, `multisort-phone-chips.png`): the bar reads cleanly, chips look like active tabs, the switch matches the filter toggles, nothing overlaps the pager. If a check fails, debug it (superpowers:systematic-debugging) and fix the code; don't weaken the check. If a check itself is wrong (a selector or an assumption that doesn't hold), fix the check in `tools/checks/`, commit it separately, and say so in your report.

- [ ] **Step 2: Sticky-header regression**

The header cells changed, and the floating header renders them. Run `tools/checks/check-sticky.mjs` (it passes 46/46 on `main`):

```bash
cd /home/emanresu/TheArchivistSoE/.worktrees/affixes-multi-sort/tools/checks && export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && APP_URL=http://localhost:5187/TheArchivistSoE/ node check-sticky.mjs "$SCRATCH" 2>&1 | tee check-sticky.log
```

Expected: all PASS (the Drop calculator part is slow: each "Deathspade" calculation can take tens of seconds). A failure that also happens on `main` (run it against port 5185 to compare) is pre-existing: report it, don't fix it here.

- [ ] **Step 3: Desktop pixels against `main`**

```bash
cd /home/emanresu/TheArchivistSoE/.worktrees/affixes-multi-sort/tools/checks && export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" \
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

