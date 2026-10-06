# Mobile-friendly site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every tab of The Archivist usable on a 390px touch screen (pinned menu-button header with a tab sheet, expand-in-place list rows, swipe tables, tap tooltips), put the current tab in the URL hash, and give the Affixes table short labels and null-aware sorting, while desktop stays as it is.

**Architecture:** CSS-first: new rules go at the end of `src/styles.css`, gated on `max-width: 980px` (and `hover: none` for tooltips). JSX edits in `src/App.jsx` are surgical, and the two pieces of genuinely new logic live in small pure modules, `src/sortCompare.js` and `src/hashTab.js`, unit-tested with Vitest. The mobile header is a separate `MobileTabsBar` component that App renders instead of `TabsBar` when `useIsMobile()` is true. That leaves the desktop tab bar's DOM untouched.

**Tech Stack:** React 19, Vite 7, plain JS/CSS, Vitest 5 (dev only), headless Chromium driven over CDP with Node 24's global `WebSocket` for browser checks.

**Spec:** `docs/superpowers/specs/2026-10-05-mobile-friendly-design.md` (approved; its decisions are settled). Read it alongside this plan. The repo's `CLAUDE.md` covers the stack, the CSS gotchas and the lint baseline.

## Global Constraints

- "Mobile" means `max-width: 980px`, matching `useIsMobile()`'s default (`window.innerWidth <= 980`).
- Desktop stays unchanged, with three exceptions: (1) short labels on numeric Affixes columns, (2) null-aware sorting on the Affixes table, (3) the current tab is reflected in the URL hash.
- Visual identity stays unchanged: ExocetBlizzard font, the dark/gold theme, and the existing tokens in `src/styles.css`.
- No new runtime dependencies. Hash routing is an in-house hook, and Vitest is a **dev** dependency only.
- The approach is CSS-first. JSX changes are surgical, and new logic goes in small new modules under `src/`. Don't split `App.jsx` wholesale.
- In-app links keep `<a href="#">` with `preventDefault`, so a link never writes `#` to the URL. This matters even more once the hash carries the tab.
- Build runtime URLs with `import.meta.env.BASE_URL`, never a hard-coded `/`.
- Test files import `describe`/`it`/`expect` explicitly from `vitest`, because ESLint has no Vitest globals.
- Lint must add no new problems on top of the 14-problem baseline (10 errors, 4 warnings, all in `src/App.jsx`). Compare issue lists, not line numbers.
- Mobile rules are duplicated across the 980px, 720px and 480px blocks. Search the whole file before changing one. Inline `style={{…}}` beats media queries.
- Don't push and don't open PRs. `origin` is `SomeoneSomewhereelse/TheArchivistSoE`.
- Never use the `EnterWorktree` tool. Never use `pkill -f`/`pgrep -f`; kill recorded PIDs only.

## Review Focus

1. **The hash is edited by hand mid-session to an unknown key** (address bar: `#/bogus`): the app shows Weapons, the hash reads `#/weapons`, and only the user's own navigation adds a history entry. Pinned in Task 3 (check-hash, "edited unknown hash").
2. **Exactly one history entry per tab change**, including under React StrictMode's double effects in dev and on jump paths (app: links): one press of Back returns to the previous tab. Pinned in Task 3 (check-hash, "one history entry", "Back", "app: link jump").
3. **Crossing the 980px breakpoint** (rotation or resize) while the tab sheet is open or a row is expanded: no stray backdrop or sheet remains, desktop shows its tooltip panel, and the sheet doesn't pop back open on returning to mobile. Pinned in Task 4 (check-header, "widening past 980px") and Task 6 (check-list, "breakpoint").
4. **Tapping a tooltip label or link inside an expanded row's details** must not collapse the row. A link does its normal jump. Pinned in Task 6 (check-list, "tapping a tooltip label inside the details").
5. **A cross-tab jump to Uniques right after toggling Damnation**, while `Uniques.json` reloads from `data/damnation/`, still lands on the target with its row expanded. Pinned in Task 6 (check-list, "after toggling Damnation"), which holds that request in flight with CDP `Fetch` interception so the jump really happens mid-reload.

## Spec verification notes (from planning)

- All line references in the spec are within a few lines of the code as of `fa1ea5c`.
- `.list { max-height }` appears **three** times, not two: styles.css ~1697 (`46vh`, in the 980px block at ~1686), ~1883 (`45vh`, 980px block) and ~2035 (`45vh`, 720px block). Task 6 removes all three.
- The Affixes data counts in the spec's sorting table match `public/data/Affixes.json` exactly (1,412 rows; `maxLevel` null 1,027; `requiredLevel` null 6; `classDisplayName` null 1,281; and so on). `rare` is `"1"` or `""`.
- The mobile-only bottom pager is gated in CSS (`.affixPager.affixPagerBottom { display: none }` outside the mobile query). That way `AffixesPanel` can drop its `useIsMobile(895)` call, as the spec says, without a new `isMobile` there.

- **Known pre-existing bug, out of scope (list it in the final report):** `handleMarkdownAppLink` with a name that targets the *current* tab sets `skipFilterResetRef` but never consumes it, so the next tab change keeps the old filters. Back makes that easier to reach. Not fixed here.

## Decisions this plan makes where the spec is silent (flag any you disagree with)

1. **Expanded-row state is tied to the `filtered` array's identity** (`{list, index}`), so any tab, search or filter change collapses it with no reset effect and no ordering race. Jumps set a `pendingExpandIndex` that an effect applies against the settled list.
2. **`MobileTabsBar` is a separate component** with its own sheet state. The sheet renders through `createPortal` into `document.body`, from `react-dom`, an existing dependency, so it stacks above the go-to-top button. App renders the bar with `key={tab}`, so any tab change, including Back/Forward, remounts it and closes the sheet.
3. **Filters (n)** counts `selectedRunes` (non-empty = 1), exactly as the spec's text says, even though the Rune filter panel itself isn't folded.
4. **Every `FiltersBar` gets `key={tab}`** (list tabs, Affixes, Corruptions), so the fold starts collapsed on every tab. Desktop DOM is identical.
5. **The bottom pager scrolls back to the top of the table** (to just under the pinned bar) after paging, so the new page starts in view.
6. **The Affixes sort logic moves into `src/sortCompare.js`**: `affixSortValue`, `compareAffixes`, and the existing `affixPrimaryPropertyAndMax`, which is only used for sorting. In numeric columns, a value that isn't a finite number counts as missing. There's none in the data.
7. **`setTab` with a key outside `VALID_TAB_KEYS`** (reachable only through a malformed `app:` link in the data) leaves the hash alone.
8. **The touch tooltip strip sits at `bottom: 76px`** to clear the go-to-top button at every width: its top edge is at 54px up to 700px wide, and at 68px above that, including touch tablets wider than 980px. On touch screens only, its text drops the table header's uppercase.
9. **The pinned first table column gets an opaque `var(--bg)` background** with a 1px divider.
10. **Workspace:** the implementation worktree is `.worktrees/mobile-friendly` (excluded via `.git/info/exclude`) on a new branch `mobile-friendly-impl`. At the end, `mobile-friendly` is fast-forwarded to it locally. This step is local only and pushes nothing.
11. **Final review model: Opus 5.5** (`model: "opus"`), as the user chose at plan review. The review covers the full branch diff of `mobile-friendly-impl` against `main`.

## Conventions used in every task

Shell state doesn't persist between Bash tool calls, so start every command with:

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"   # if missing: ls ~/.nvm/versions/node
REPO=/home/emanresu/TheArchivistSoE
WT=$REPO/.worktrees/mobile-friendly
SCRATCH=/tmp/claude-1000/-home-emanresu-TheArchivistSoE/f5c29967-01d0-4553-b18d-dfb244f5b17e/scratchpad/checks
```

`SCRATCH` is this session's scratchpad (substitute the executing session's own scratchpad if different). All browser-check scripts live there, never in the repo.

**Dev server for checks** (port 5181, localhost only). Start it in the background and record its PID:

```bash
cd "$WT" && nohup node node_modules/vite/bin/vite.js --port 5181 --strictPort > "$SCRATCH/vite-5181.log" 2>&1 &
echo $! > "$SCRATCH/vite-5181.pid"
curl -sf --retry 30 --retry-connrefused --retry-delay 1 -o /dev/null http://localhost:5181/TheArchivistSoE/ && echo up
```

Stop it with `kill "$(cat "$SCRATCH/vite-5181.pid")"`, never `pkill`. Vite's HMR picks up edits, so one server can serve a whole task.

**Run a check script:** `cd "$SCRATCH" && node check-<name>.mjs`. Exit code 0 means every check passed. Each prints `PASS`/`FAIL` lines.

**Lint comparison** (after Task 1 records the baseline):

```bash
cd "$WT" && npx eslint . -f json | node "$SCRATCH/lint-summary.mjs" | diff "$SCRATCH/lint-baseline.txt" -
```

Expected: no `>` lines. A `<` line means a baseline problem disappeared, which is fine; note it for the CLAUDE.md baseline update in Task 10.

**Memory:** run `free -h` before `npm ci` runs, before starting a second dev server, and before and after any subagent. If `available` drops below about 1.5 GB, tell the user it's a good point to continue in a fresh session.

---

### Task 1: Worktree, Vitest, and the `sortCompare` module

**Files:**
- Create: `src/sortCompare.js`, `src/sortCompare.test.js`
- Modify: `package.json` (devDependency + `test` script), `package-lock.json`
- Scratch: `$SCRATCH/lint-summary.mjs`, `$SCRATCH/lint-baseline.txt`

**Interfaces:**
- Consumes: nothing.
- Produces (`src/sortCompare.js`):
  - `AFFIX_SORT_KEYS: string[]`, which is `["name","attrs","level","group","rare","freq","maxLevel","types","excluded","class","reqLevel"]`
  - `isMissing(v): boolean`
  - `compareValues(a, b, dir = "asc", {missing = "low"} = {}): -1 | 0 | 1`
  - `affixSortValue(affix, key): number | string | string[] | null | undefined`, which throws for a key with no case
  - `affixPrimaryPropertyAndMax(affix): {property: string, max: number}`, moved verbatim from App.jsx
  - `compareAffixes(a, b, key, dir): -1 | 0 | 1`
  - `npm test` runs `vitest run`.

- [ ] **Step 1: Create the worktree and install**

```bash
cd "$REPO" && git status --short            # expect no output (clean)
git rev-parse --abbrev-ref HEAD              # expect: mobile-friendly
grep -qx '.worktrees/' .git/info/exclude || echo '.worktrees/' >> .git/info/exclude
git worktree add .worktrees/mobile-friendly -b mobile-friendly-impl mobile-friendly
free -h
cd "$WT" && npm ci
```

Expected: the worktree is created on `mobile-friendly-impl`, and `npm ci` finishes without errors.

- [ ] **Step 2: Record the lint baseline**

Create `$SCRATCH/lint-summary.mjs`:

```js
// Reads `eslint -f json` on stdin; prints one sorted "file | rule | message" line per problem (no line numbers).
let input = "";
process.stdin.on("data", (d) => (input += d)).on("end", () => {
    const lines = [];
    for (const file of JSON.parse(input)) {
        for (const m of file.messages) {
            lines.push(`${file.filePath.split("/").pop()} | ${m.ruleId} | ${m.message.split("\n")[0]}`);
        }
    }
    console.log(lines.sort().join("\n"));
});
```

```bash
mkdir -p "$SCRATCH" && cd "$WT" && npx eslint . -f json | node "$SCRATCH/lint-summary.mjs" > "$SCRATCH/lint-baseline.txt"; wc -l < "$SCRATCH/lint-baseline.txt"
```

Expected: `14`.

- [ ] **Step 3: Add Vitest**

```bash
cd "$WT" && npm install --save-dev vitest@^5.0.3 && npm ls vite vitest
```

Expected: `vite@7.x` is unchanged and `vitest@5.x` is installed. Then add the script to `package.json`'s `"scripts"`, after `"preview"`:

```json
    "preview": "vite preview",
    "test": "vitest run"
```

- [ ] **Step 4: Write the failing tests**

Create `src/sortCompare.test.js`:

```js
import {describe, expect, it} from "vitest";
import {
    AFFIX_SORT_KEYS,
    affixPrimaryPropertyAndMax,
    affixSortValue,
    compareAffixes,
    compareValues,
    isMissing,
} from "./sortCompare.js";

// Minimal rows shaped like public/data/Affixes.json entries.
function affix(id, fields = {}) {
    return {
        id,
        name: `Affix ${id}`,
        level: 1,
        group: 1,
        rare: "1",
        frequency: 1,
        maxLevel: null,
        requiredLevel: 1,
        classDisplayName: null,
        displayItemTypeNames: ["Rings"],
        displayExcludedItemTypeNames: [],
        displayProperties: [{property: "str", max: 1, displayString: "+1 to Strength"}],
        ...fields,
    };
}

function sortIds(rows, key, dir) {
    return [...rows].sort((a, b) => compareAffixes(a, b, key, dir)).map((r) => r.id);
}

describe("isMissing", () => {
    it("treats null, undefined, an empty string and an empty array as missing", () => {
        for (const v of [null, undefined, "", []]) expect(isMissing(v)).toBe(true);
    });

    it("treats zero, false, '0', whitespace and non-empty arrays as present", () => {
        for (const v of [0, false, "0", " ", ["x"]]) expect(isMissing(v)).toBe(false);
    });
});

describe("compareValues", () => {
    it("compares numbers numerically, not as text", () => {
        expect(compareValues(9, 10, "asc")).toBe(-1);
        expect(compareValues(10, 9, "asc")).toBe(1);
        expect(compareValues(9, 10, "desc")).toBe(1);
    });

    it("compares strings with localeCompare", () => {
        expect(compareValues("Amazon", "Sorceress", "asc")).toBe(-1);
        expect(compareValues("Amazon", "Sorceress", "desc")).toBe(1);
    });

    it("compares arrays by their comma-joined text", () => {
        expect(compareValues(["Amulets", "Rings"], ["Amulets"], "asc")).toBe(1);
    });

    it("sorts missing values lowest by default: first ascending, last descending", () => {
        expect(compareValues(null, 1, "asc")).toBe(-1);
        expect(compareValues(null, 1, "desc")).toBe(1);
        expect(compareValues("", "a", "asc")).toBe(-1);
        expect(compareValues([], ["a"], "asc")).toBe(-1);
    });

    it("sorts missing values highest with missing: 'high': last ascending, first descending", () => {
        expect(compareValues(null, 1, "asc", {missing: "high"})).toBe(1);
        expect(compareValues(null, 1, "desc", {missing: "high"})).toBe(-1);
    });

    it("returns exactly 0 for ties in both directions", () => {
        expect(compareValues(null, undefined, "asc")).toBe(0);
        expect(compareValues(null, undefined, "desc")).toBe(0);
        expect(compareValues(5, 5, "desc")).toBe(0);
        expect(compareValues("a", "a", "desc")).toBe(0);
    });
});

describe("affixSortValue", () => {
    it("has a value for every sortable column of a fully populated affix", () => {
        const full = affix("x", {
            maxLevel: 50,
            classDisplayName: "Amazon",
            displayExcludedItemTypeNames: ["Staff Class"],
        });
        for (const key of AFFIX_SORT_KEYS.filter((k) => k !== "attrs")) {
            expect(isMissing(affixSortValue(full, key)), key).toBe(false);
        }
    });

    it("reads Rares as a boolean: '' is No (0), not missing", () => {
        expect(affixSortValue(affix("a", {rare: ""}), "rare")).toBe(0);
        expect(affixSortValue(affix("b", {rare: "1"}), "rare")).toBe(1);
    });

    it("throws for a column key it has no case for, instead of tying every row", () => {
        expect(() => affixSortValue(affix("a"), "bogus")).toThrow(/bogus/);
        expect(() => compareAffixes(affix("a"), affix("b"), "bogus", "asc")).toThrow(/bogus/);
    });

    it("treats null numeric fields as missing", () => {
        expect(isMissing(affixSortValue(affix("a", {maxLevel: null}), "maxLevel"))).toBe(true);
        expect(isMissing(affixSortValue(affix("a", {requiredLevel: null}), "reqLevel"))).toBe(true);
    });
});

describe("compareAffixes", () => {
    it("Max lvl: missing (no cap) counts as highest, so last ascending, first descending", () => {
        const rows = [
            affix("a", {maxLevel: null}),
            affix("b", {maxLevel: 40}),
            affix("c", {maxLevel: 20}),
            affix("d", {maxLevel: null}),
        ];
        expect(sortIds(rows, "maxLevel", "asc")).toEqual(["c", "b", "a", "d"]);
        expect(sortIds(rows, "maxLevel", "desc")).toEqual(["a", "d", "b", "c"]);
    });

    it("Req lvl: missing counts as lowest", () => {
        const rows = [
            affix("a", {requiredLevel: 3}),
            affix("b", {requiredLevel: null}),
            affix("c", {requiredLevel: 10}),
        ];
        expect(sortIds(rows, "reqLevel", "asc")).toEqual(["b", "a", "c"]);
        expect(sortIds(rows, "reqLevel", "desc")).toEqual(["c", "a", "b"]);
    });

    it("Class: missing counts as lowest", () => {
        const rows = [
            affix("a"),
            affix("b", {classDisplayName: "Sorceress"}),
            affix("c", {classDisplayName: "Amazon"}),
            affix("d"),
        ];
        expect(sortIds(rows, "class", "asc")).toEqual(["a", "d", "c", "b"]);
        expect(sortIds(rows, "class", "desc")).toEqual(["b", "c", "a", "d"]);
    });

    it("Item types and Excluded item types: an empty list counts as lowest", () => {
        const types = [
            affix("a", {displayItemTypeNames: ["Rings"]}),
            affix("b", {displayItemTypeNames: []}),
            affix("c", {displayItemTypeNames: ["Amulets"]}),
        ];
        expect(sortIds(types, "types", "asc")).toEqual(["b", "c", "a"]);

        const excluded = [affix("a", {displayExcludedItemTypeNames: ["Wand"]}), affix("b")];
        expect(sortIds(excluded, "excluded", "asc")).toEqual(["b", "a"]);
        expect(sortIds(excluded, "excluded", "desc")).toEqual(["a", "b"]);
    });

    it("Rares: No sorts before Yes ascending, after it descending", () => {
        const rows = [affix("a", {rare: "1"}), affix("b", {rare: ""}), affix("c", {rare: "1"})];
        expect(sortIds(rows, "rare", "asc")).toEqual(["b", "a", "c"]);
        expect(sortIds(rows, "rare", "desc")).toEqual(["a", "c", "b"]);
    });

    it("Attributes: groups by property, then max; empty displayProperties sort lowest", () => {
        const rows = [
            affix("a", {displayProperties: [{property: "str", max: 10}]}),
            affix("b", {displayProperties: []}),
            affix("c", {displayProperties: [{property: "dex", max: 5}]}),
            affix("d", {displayProperties: [{property: "str", max: 2}]}),
        ];
        expect(sortIds(rows, "attrs", "asc")).toEqual(["b", "c", "d", "a"]);
        expect(sortIds(rows, "attrs", "desc")).toEqual(["a", "d", "c", "b"]);
    });

    it("Lvl, Grp and Freq sort numerically", () => {
        const levels = [affix("a", {level: 10}), affix("b", {level: 9}), affix("c", {level: 100})];
        expect(sortIds(levels, "level", "asc")).toEqual(["b", "a", "c"]);
        const groups = [affix("a", {group: 12}), affix("b", {group: 3})];
        expect(sortIds(groups, "group", "asc")).toEqual(["b", "a"]);
        const freqs = [affix("a", {frequency: 4}), affix("b", {frequency: 20})];
        expect(sortIds(freqs, "freq", "desc")).toEqual(["b", "a"]);
    });

    it("Name sorts alphabetically", () => {
        const rows = [affix("a", {name: "of Wrath"}), affix("b", {name: "Bronze"})];
        expect(sortIds(rows, "name", "asc")).toEqual(["b", "a"]);
    });

    it("keeps ties in their incoming order in both directions", () => {
        const rows = [
            affix("a", {level: 5}),
            affix("b", {level: 5}),
            affix("c", {level: 1}),
            affix("d", {level: 5}),
        ];
        expect(sortIds(rows, "level", "asc")).toEqual(["c", "a", "b", "d"]);
        expect(sortIds(rows, "level", "desc")).toEqual(["a", "b", "d", "c"]);
    });
});

describe("affixPrimaryPropertyAndMax", () => {
    it("reads the first property object, trimming the name and numbering the max", () => {
        expect(affixPrimaryPropertyAndMax(affix("a", {displayProperties: [{property: " str ", max: "7"}]})))
            .toEqual({property: "str", max: 7});
    });

    it("returns an empty property for missing or empty displayProperties", () => {
        expect(affixPrimaryPropertyAndMax(affix("a", {displayProperties: []}))).toEqual({property: "", max: 0});
        expect(affixPrimaryPropertyAndMax(affix("a", {displayProperties: null}))).toEqual({property: "", max: 0});
    });
});
```

- [ ] **Step 5: Run the tests and confirm they fail**

Run: `cd "$WT" && npm test`
Expected: FAIL, because Vitest can't resolve `./sortCompare.js`.

- [ ] **Step 6: Implement `src/sortCompare.js`**

```js
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
```

Then move `affixPrimaryPropertyAndMax` **verbatim** from `src/App.jsx` (the function starting `function affixPrimaryPropertyAndMax(affix) {`, ~L253–276) into this file, adding `export`. Don't delete it from App.jsx yet; Task 2 does that. Finally, append:

```js
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
```

- [ ] **Step 7: Run the tests and confirm they pass; run the lint comparison**

Run: `cd "$WT" && npm test`
Expected: all `sortCompare` tests pass.
Run the lint comparison from *Conventions*. Expected: no `>` lines.

- [ ] **Step 8: Commit**

```bash
cd "$WT" && git add package.json package-lock.json src/sortCompare.js src/sortCompare.test.js
git commit -m "Add Vitest and null-aware Affixes sort helpers"
```

---

### Task 2: Affixes table: null-aware sort, short labels, tooltip text (desktop-visible)

**Files:**
- Modify: `src/App.jsx`: imports (top), `TOOLTIPS_TEXT_MAP` (~L169–183), delete `affixPrimaryPropertyAndMax` (~L253–276), `AffixesPanel` sort memo (~L2924–2989) and header row (~L3125–3205)
- Scratch: `$SCRATCH/cdp.mjs` (browser harness, used by every later task), `$SCRATCH/check-affix-sort.mjs`

**Interfaces:**
- Consumes: `compareAffixes(a, b, key, dir)` from Task 1.
- Produces: `TOOLTIPS_TEXT_MAP.affixRequiredLevel`, plus the harness API every later check uses: `run(fn)`, `checker()`, `BASE`, `sleep`, `TAB_KEYS`, `TAB_TITLES`, `clickDesktopTab(page, key)`, `activeDesktopTab(page)`, `openTab(page, key)`, `OVERFLOW_CHECK`, and `page.{goto, eval, waitFor, mobile, desktop, tap, tapAt, click, hover, type, key, screenshot, send, once}`.

- [ ] **Step 1: Wire the comparator into `AffixesPanel`**

In `src/App.jsx`, add after the last icon import (`import FateCardIcon from "./icons/fatecard.svg";`):

```js
import {compareAffixes} from "./sortCompare.js";
```

Delete the whole `function affixPrimaryPropertyAndMax(affix) { … }` from App.jsx. It now lives in `sortCompare.js`, and its only caller was the sort being replaced. Then replace the entire `const sorted = React.useMemo(() => { … }, [all, sortKey, sortDir]);` block in `AffixesPanel` (from `const sorted = React.useMemo(() => {` through the `getValue` switch and both `arr.sort` calls) with:

```js
    const sorted = React.useMemo(() => {
        const arr = [...all];
        arr.sort((a, b) => compareAffixes(a, b, sortKey, sortDir));
        return arr;
    }, [all, sortKey, sortDir]);
```

- [ ] **Step 2: Update the tooltip texts**

Replace the five affix entries at the end of `TOOLTIPS_TEXT_MAP` with:

```js
    "affixMaxLevel": "Max level: If the item level is high enough, then some affixes will not be eligible to roll on it, making it more likely for better affixes to appear on the item.",
    "affixFrequency": "Frequency: Frequency parameter determines how often will you roll this modifier on an item.",
    "affixRares": "If true, then this modifier can occur on rare items.",
    "affixLevel": "Affix level: Determines minimum item level of the item for this affix to show.",
    "affixGroup": "Group: Affixes that share a group can't roll together on the same item.",
    "affixRequiredLevel": "Required level: Minimum character level needed to use an item with this affix."
```

- [ ] **Step 3: Short labels, the Rares arrow, and the new Req lvl tooltip**

In `AffixesPanel`'s `<thead>`, change only the `<span className="thLabel">` contents of these six headers:

```jsx
                      <Tip text={String(TOOLTIPS_TEXT_MAP["affixLevel"])}>Lvl</Tip> {sortArrowFor("level")}
```
```jsx
                      <Tip text={String(TOOLTIPS_TEXT_MAP["affixGroup"])}>Grp</Tip> {sortArrowFor("group")}
```
```jsx
                      <Tip text={String(TOOLTIPS_TEXT_MAP["affixRares"])}>Rares</Tip> {sortArrowFor("rare")}
```
```jsx
                      <Tip text={String(TOOLTIPS_TEXT_MAP["affixFrequency"])}>Freq</Tip> {sortArrowFor("freq")}
```
```jsx
                      <Tip text={String(TOOLTIPS_TEXT_MAP["affixMaxLevel"])}>Max lvl</Tip> {sortArrowFor("maxLevel")}
```
```jsx
                      <Tip text={String(TOOLTIPS_TEXT_MAP["affixRequiredLevel"])}>Req lvl</Tip> {sortArrowFor("reqLevel")}
```

The last one replaces the plain `Required level {sortArrowFor("reqLevel")}`. The Rares line moves `{sortArrowFor("rare")}` out of the `Tip`.

- [ ] **Step 4: Unit tests, build, lint**

Run: `cd "$WT" && npm test && npm run build`, then the lint comparison.
Expected: tests pass, the build succeeds, no `>` lines.

- [ ] **Step 5: Create the browser harness `$SCRATCH/cdp.mjs`**

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
    const proc = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
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
    ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id !== undefined) {
            const p = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
            else p.resolve(msg.result);
            return;
        }
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
    await send("Page.enable");
    await send("Runtime.enable");

    const page = {
        send,
        once,
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
            try {
                await send("Emulation.setEmulatedMedia", {features: [{name: "hover", value: "none"}, {name: "pointer", value: "coarse"}]});
            } catch {
                // Older Chromium can't emulate hover; touch emulation + mobile metrics already imply hover: none.
            }
            await sleep(300);
        },
        async desktop(width = 1500, height = 1000) {
            await send("Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: 1, mobile: false});
            await send("Emulation.setTouchEmulationEnabled", {enabled: false});
            try {
                await send("Emulation.setEmulatedMedia", {features: []});
            } catch {
                // see mobile()
            }
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
            const codes = {Escape: 27, Enter: 13};
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

// Needs hash routing (Task 3 onwards): switches tab in place through the URL hash.
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

- [ ] **Step 6: Write `$SCRATCH/check-affix-sort.mjs`**

```js
import {run, checker, BASE, clickDesktopTab, sleep} from "./cdp.mjs";

const c = checker();
const HEADERS = `[...document.querySelectorAll(".affixTable thead th")].map((th) => {
    const copy = th.cloneNode(true);
    copy.querySelectorAll(".tipBubble, .sortArrow").forEach((e) => e.remove());
    return copy.textContent.replace(/\\s+/g, " ").trim();
})`;
const column = (i) => `[...document.querySelectorAll(".affixTable tbody tr")].map((tr) => tr.children[${i}].textContent.trim())`;
const nondecreasing = (xs) => xs.every((x, i) => i === 0 || xs[i - 1] <= x);
const nonincreasing = (xs) => xs.every((x, i) => i === 0 || xs[i - 1] >= x);

await run(async (page) => {
    const clickHeader = async (i) => {
        await page.eval(`document.querySelectorAll(".affixTable thead th")[${i}].click()`);
        await sleep(300);
    };

    await page.desktop();
    await page.goto(BASE);
    await page.waitFor(`!!document.querySelector(".tabs .tab")`);
    await clickDesktopTab(page, "affixes");
    await page.waitFor(`document.querySelectorAll(".affixTable tbody tr").length === 50`);

    const headers = await page.eval(HEADERS);
    c.ok(JSON.stringify(headers) === JSON.stringify(["Name", "Attributes", "Lvl", "Grp", "Rares", "Freq", "Max lvl",
        "Item types", "Excluded item types", "Class", "Req lvl"]), "short header labels", JSON.stringify(headers));

    const tips = await page.eval(`[...document.querySelectorAll(".affixTable thead .tipBubble")].map((b) => b.textContent.trim())`);
    const starts = ["Affix level: ", "Group: ", "If true, then this modifier can occur on rare items.", "Frequency: ",
        "Max level: ", "Required level: "];
    c.ok(tips.length === 6 && tips.every((t, i) => t.startsWith(starts[i])), "header tooltips: full name, colon, explanation",
        JSON.stringify(tips.map((t) => t.slice(0, 22))));

    await clickHeader(4);
    c.ok(await page.eval(`(() => {
        const th = document.querySelectorAll(".affixTable thead th")[4];
        return !!th.querySelector(".sortArrow") && !th.querySelector(".tipWrap .sortArrow");
    })()`), "Rares sort arrow sits outside its tooltip");

    await clickHeader(6);
    let col = await page.eval(column(6));
    c.ok(col.every((v) => v !== "") && nondecreasing(col.map(Number)), "Max lvl ascending: capped levels first, in order", col.slice(0, 5).join(","));
    await clickHeader(6);
    col = await page.eval(column(6));
    c.ok(col.every((v) => v === ""), "Max lvl descending: uncapped (blank) first");

    await clickHeader(9);
    col = await page.eval(column(9));
    c.ok(col.every((v) => v === ""), "Class ascending: blanks first");
    await clickHeader(9);
    col = await page.eval(column(9));
    c.ok(col.every((v) => v !== "") && col.every((v, i) => i === 0 || col[i - 1].localeCompare(v) >= 0), "Class descending: names first, Z to A");

    await clickHeader(10);
    col = await page.eval(column(10));
    const blanks = col.filter((v) => v === "").length;
    c.ok(blanks === 6 && col.slice(0, 6).every((v) => v === "") && nondecreasing(col.slice(6).map(Number)),
        "Req lvl ascending: the 6 blanks first, then levels in order", `${blanks} blanks`);
    await clickHeader(10);
    col = await page.eval(column(10));
    c.ok(col.every((v) => v !== "") && nonincreasing(col.map(Number)), "Req lvl descending: highest first, no blanks");
});
c.done();
```

- [ ] **Step 7: Run the check against the dev server**

Start the dev server (*Conventions*), then: `cd "$SCRATCH" && node check-affix-sort.mjs`
Expected: every line `PASS`, ending in `all checks passed`. If Chrome fails to launch, confirm the binary path with `ls ~/.cache/ms-playwright/`.

- [ ] **Step 8: Commit**

```bash
cd "$WT" && git add src/App.jsx && git commit -m "Affixes: null-aware sorting, short column labels, Req lvl tooltip"
```

---

### Task 3: The current tab in the URL hash

**Files:**
- Create: `src/hashTab.js`, `src/hashTab.test.js`
- Modify: `src/App.jsx`: imports, new `TAB_GROUPS`/`VALID_TAB_KEYS` after `TABS` (~L76), the `tab` state in `App` (~L3647: `const [tab, setTab] = useState("weapons");`)
- Scratch: `$SCRATCH/check-hash.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `hashForTab(tab): string`, which returns `"#/" + tab`
  - `parseTabFromHash(hash, validKeys): string | null`
  - `useHashTab(validKeys, fallback): [tab, setTab]`. `validKeys` must be a stable (module-level) array.
  - App constants `TAB_GROUPS: {title: string, keys: string[]}[]` (the 4 sheet groups, 18 keys) and `VALID_TAB_KEYS: string[]` (those 18 plus `"changelog"`). Task 4 renders the sheet from `TAB_GROUPS`.

- [ ] **Step 1: Write the failing tests**

Create `src/hashTab.test.js`:

```js
import {describe, expect, it} from "vitest";
import {hashForTab, parseTabFromHash} from "./hashTab.js";

const KEYS = ["weapons", "affixes", "changelog"];

describe("parseTabFromHash", () => {
    it("returns the key of a valid #/<key> hash", () => {
        expect(parseTabFromHash("#/affixes", KEYS)).toBe("affixes");
        expect(parseTabFromHash("#/changelog", KEYS)).toBe("changelog");
    });

    it("returns null for an unknown key, including tabs that exist but aren't valid", () => {
        expect(parseTabFromHash("#/bogus", KEYS)).toBeNull();
        expect(parseTabFromHash("#/essences", KEYS)).toBeNull();
        expect(parseTabFromHash("#/Affixes", KEYS)).toBeNull();
    });

    it("returns null for an empty or absent hash", () => {
        expect(parseTabFromHash("", KEYS)).toBeNull();
        expect(parseTabFromHash(undefined, KEYS)).toBeNull();
        expect(parseTabFromHash(null, KEYS)).toBeNull();
    });

    it("returns null for malformed hashes", () => {
        for (const hash of ["#", "#/", "#affixes", "#//affixes", "#/affixes/", "#/affixes/extra", "#/affixes?x=1"]) {
            expect(parseTabFromHash(hash, KEYS), hash).toBeNull();
        }
    });
});

describe("hashForTab", () => {
    it("formats #/<key> and round-trips through parseTabFromHash", () => {
        expect(hashForTab("uniques")).toBe("#/uniques");
        for (const key of KEYS) expect(parseTabFromHash(hashForTab(key), KEYS)).toBe(key);
    });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd "$WT" && npm test`
Expected: the `hashTab` suite fails because `./hashTab.js` can't be resolved, while `sortCompare` still passes.

- [ ] **Step 3: Implement `src/hashTab.js`**

```js
// Keeps the current tab in the URL hash (#/<tabKey>) so tabs can be linked and Back/Forward work.
import {useEffect, useState} from "react";

export function hashForTab(tab) {
    return `#/${tab}`;
}

// The tab named by a "#/<key>" hash, or null when the hash is empty, malformed or names no valid tab.
export function parseTabFromHash(hash, validKeys) {
    const match = /^#\/([^/?#]+)$/.exec(hash ?? "");
    return match && validKeys.includes(match[1]) ? match[1] : null;
}

// Tab state synced with location.hash in both directions. The effect keys off the tab state itself,
// so every path that changes the tab (clicks, jumps, links) updates the URL. It only writes when the
// hash differs, which keeps popstate and StrictMode's double effects from adding duplicate entries.
// `validKeys` must be a stable array (a module-level constant).
export function useHashTab(validKeys, fallback) {
    const [tab, setTab] = useState(() => parseTabFromHash(window.location.hash, validKeys) ?? fallback);

    useEffect(() => {
        const target = hashForTab(tab);
        if (window.location.hash === target || !validKeys.includes(tab)) return;

        // Leaving a valid tab is a real navigation; an empty or unknown hash is just normalised in place.
        if (parseTabFromHash(window.location.hash, validKeys)) {
            window.history.pushState(null, "", target);
        } else {
            window.history.replaceState(null, "", target);
        }
    }, [tab, validKeys]);

    useEffect(() => {
        const onPopState = () => {
            const next = parseTabFromHash(window.location.hash, validKeys);
            if (next === null) window.history.replaceState(null, "", hashForTab(fallback));
            setTab(next ?? fallback);
        };
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, [validKeys, fallback]);

    return [tab, setTab];
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd "$WT" && npm test`
Expected: both suites pass.

- [ ] **Step 5: Wire it into `App`**

In `src/App.jsx`, add below the `sortCompare` import:

```js
import {useHashTab} from "./hashTab.js";
```

Directly after the closing `};` of `const TABS = { … };`, add:

```js
// The tab sheet's groups on mobile (every tab except Changelog, which the footer opens).
const TAB_GROUPS = [
    {title: "Items", keys: ["weapons", "armors", "uniques", "runewords", "sacreds", "fatecards"]},
    {title: "Mechanics", keys: ["affixes", "skills", "ascendancies", "corruptions", "mapping", "kiln", "cube"]},
    {title: "Tools", keys: ["calculators", "dropcalc"]},
    {title: "About", keys: ["changes", "damnation", "help"]},
];

// Tabs the URL hash may name. Not Object.keys(TABS): "essences" has no panel.
const VALID_TAB_KEYS = [...TAB_GROUPS.flatMap((g) => g.keys), "changelog"];
```

In `App`, replace `const [tab, setTab] = useState("weapons");` with:

```js
    const [tab, setTab] = useHashTab(VALID_TAB_KEYS, "weapons");
```

- [ ] **Step 6: Write `$SCRATCH/check-hash.mjs`**

```js
import {run, checker, BASE, clickDesktopTab, activeDesktopTab} from "./cdp.mjs";

const c = checker();
await run(async (page) => {
    await page.desktop();
    // Per document: history.length at start, and whether a list panel (Weapons) ever rendered.
    await page.send("Page.addScriptToEvaluateOnNewDocument", {source: `
        window.__h0 = history.length;
        window.__sawList = false;
        new MutationObserver(() => { if (document.querySelector(".listPanel")) window.__sawList = true; })
            .observe(document, {childList: true, subtree: true});
    `});

    await page.goto(BASE);
    await page.waitFor(`location.hash === "#/weapons"`);
    c.ok(await page.eval("history.length === window.__h0"), "an empty hash is normalised to #/weapons in place");

    const h = await page.eval("history.length");
    await clickDesktopTab(page, "affixes");
    await page.waitFor(`location.hash === "#/affixes"`);
    await clickDesktopTab(page, "uniques");
    await page.waitFor(`location.hash === "#/uniques"`);
    const len = await page.eval("history.length");
    c.ok(len === h + 2, "one history entry per tab change (StrictMode included)", `${len} vs ${h + 2}`);

    await page.eval("history.back()");
    await page.waitFor(`location.hash === "#/affixes"`);
    c.ok(await activeDesktopTab(page) === "Affixes", "Back returns to the previous tab in one step");

    await page.goto(`${BASE}#/affixes`);
    await page.waitFor(`!!document.querySelector(".affixTable")`);
    c.ok(!(await page.eval("window.__sawList")), "deep link #/affixes renders no Weapons list first");

    for (const bad of ["essences", "bogus"]) {
        await page.goto(`${BASE}#/${bad}`);
        await page.waitFor(`location.hash === "#/weapons"`);
        c.ok(await page.eval("history.length === window.__h0"), `#/${bad} is normalised to #/weapons in place`);
        c.ok(await activeDesktopTab(page) === "Weapons", `#/${bad} shows Weapons`);
    }

    // Review focus 1: the hash edited by hand mid-session.
    await page.goto(`${BASE}#/affixes`);
    await page.waitFor(`!!document.querySelector(".affixTable")`);
    const h1 = await page.eval("history.length");
    await page.eval(`location.hash = "#/bogus"`);
    await page.waitFor(`location.hash === "#/weapons"`);
    c.ok(await page.eval("history.length") === h1 + 1, "edited unknown hash: back to Weapons with no second entry");
    c.ok(await activeDesktopTab(page) === "Weapons", "edited unknown hash shows Weapons");

    // Review focus 2: a jump path (Cube recipe's app: link) adds exactly one entry.
    await page.goto(`${BASE}#/cube`);
    await page.waitFor(`[...document.querySelectorAll("button.mdLinkInternal")].some((b) => b.textContent === "Hellfire Torch")`);
    const h2 = await page.eval("history.length");
    await page.click("button.mdLinkInternal", {text: "Hellfire Torch"});
    await page.waitFor(`location.hash === "#/uniques"`);
    c.ok(await page.eval("history.length") === h2 + 1, "app: link jump updates the hash with one entry");
});
c.done();
```

- [ ] **Step 7: Run the checks, build, lint**

Run: `cd "$SCRATCH" && node check-hash.mjs && node check-affix-sort.mjs`. Expected: all `PASS`.
Run: `cd "$WT" && npm test && npm run build`, then the lint comparison. Expected: pass, success, no `>` lines.

- [ ] **Step 8: Commit**

```bash
cd "$WT" && git add src/hashTab.js src/hashTab.test.js src/App.jsx
git commit -m "Reflect the current tab in the URL hash"
```

---

### Task 4: Mobile header: pinned top row, menu button, tab sheet

**Files:**
- Modify: `src/App.jsx`: `react-dom` import; new `DamnationToggle`, `MobileTabsBar`, `TabSheet` components next to `TabsBar` (~L3499); `TabsBar` uses `DamnationToggle`; `App` adds `isMobile` and picks the bar.
- Modify: `src/styles.css`: append a navigation section.
- Scratch: `$SCRATCH/check-header.mjs`, `$SCRATCH/survey.mjs`

**Interfaces:**
- Consumes: `TAB_GROUPS`, the `tab`/`setTab` from `useHashTab` (Task 3), and the existing `renderTabTitle(key)` and `useIsMobile(maxWidth = 980)`.
- Produces: `isMobile` (a `const` in `App`, used by Tasks 6), the CSS custom property `--topbar-h` (mobile only, used by Tasks 6–7 for `scroll-margin-top`), and the selectors `.tabMenuBtn`, `.tabSheet`, `.tabSheetBackdrop`, `.tabSheetItem`, `.tabSheetGroupTitle`, `.tabSheetGrid`.

- [ ] **Step 1: Components**

In `src/App.jsx`, below the `React` import on line 1, add:

```js
import {createPortal} from "react-dom";
```

Directly above `function TabsBar({`, add:

```jsx
function DamnationToggle({damnationMode, toggleDamnationMode}) {
    return (<label className="toggleWrap topBarToggle">
        <span className="toggleLabel">Damnation</span>
        <div className="toggle">
            <input
                type="checkbox"
                checked={damnationMode}
                onChange={(e) => toggleDamnationMode(e.target.checked)}
            />
            <span className="toggleSlider"/>
        </div>
    </label>);
}

// Mobile's tab list: a bottom sheet of all tabs, grouped. Rendered into <body> by MobileTabsBar.
function TabSheet({tab, onSelect, onClose}) {
    return (<div className="tabSheetBackdrop" onClick={onClose}>
        <div
            className="tabSheet"
            role="dialog"
            aria-modal="true"
            aria-label="Tabs"
            onClick={(e) => e.stopPropagation()}
        >
            {TAB_GROUPS.map((group) => (<section key={group.title} className="tabSheetGroup">
                <div className="tabSheetGroupTitle">{group.title}</div>
                <div className="tabSheetGrid">
                    {group.keys.map((key) => (<button
                        key={key}
                        type="button"
                        className={"tabSheetItem" + (tab === key ? " active" : "")}
                        onClick={() => onSelect(key)}
                    >
                        {renderTabTitle(key)}
                    </button>))}
                </div>
            </section>))}
        </div>
    </div>);
}

// Mobile's top row (pinned by CSS): a menu button naming the current tab, and the Damnation toggle.
// Opening the sheet adds no history entry, so Back while it's open goes to the previous tab. App keys
// this component by tab, so any tab change (Back/Forward, jumps) remounts it with the sheet closed.
function MobileTabsBar({tab, setTab, damnationMode, toggleDamnationMode}) {
    const [sheetOpen, setSheetOpen] = React.useState(false);

    React.useEffect(() => {
        if (!sheetOpen) return;

        function onKeyDown(e) {
            if (e.key === "Escape") setSheetOpen(false);
        }

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [sheetOpen]);

    const selectTab = (key) => {
        setTab(key);
        setSheetOpen(false);
    };

    return (<div className="tabsPanel">
        <button
            type="button"
            className="tabMenuBtn"
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            onClick={() => setSheetOpen(true)}
        >
            <span aria-hidden="true">☰</span>
            <span className="tabMenuTitle">{renderTabTitle(tab)}</span>
            <span aria-hidden="true">▾</span>
        </button>

        <div className="tabsRight">
            <DamnationToggle damnationMode={damnationMode} toggleDamnationMode={toggleDamnationMode}/>
        </div>

        {sheetOpen && createPortal(
            <TabSheet tab={tab} onSelect={selectTab} onClose={() => setSheetOpen(false)}/>,
            document.body,
        )}
    </div>);
}
```

In `TabsBar`, replace the whole `<label className="toggleWrap topBarToggle"> … </label>` inside `<div className="tabsRight">` with:

```jsx
                <DamnationToggle damnationMode={damnationMode} toggleDamnationMode={toggleDamnationMode}/>
```

In `App`, directly after `const [tab, setTab] = useHashTab(VALID_TAB_KEYS, "weapons");`, add:

```js
    const isMobile = useIsMobile();
```

Replace `<TabsBar tab={tab} setTab={setTab} damnationMode={damnationMode} toggleDamnationMode={toggleDamnationMode}/>` with:

```jsx
            {isMobile ? (
                <MobileTabsBar key={tab} tab={tab} setTab={setTab} damnationMode={damnationMode}
                               toggleDamnationMode={toggleDamnationMode}/>
            ) : (
                <TabsBar tab={tab} setTab={setTab} damnationMode={damnationMode}
                         toggleDamnationMode={toggleDamnationMode}/>
            )}
```

- [ ] **Step 2: CSS**

Append to the end of `src/styles.css`:

```css
/* -------------------------------------------------------------------------- */
/* Mobile-friendly: navigation (menu button + tab sheet)                       */
/* -------------------------------------------------------------------------- */

.tabMenuBtn {
    appearance: none;
    -webkit-appearance: none;
    font: inherit;
    font-size: 17px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    max-width: 100%;
    padding: 8px 12px;
    border-radius: 10px;
    border: 1px solid rgba(202, 161, 74, 0.55);
    background: linear-gradient(180deg, rgba(202, 161, 74, 0.3), rgba(107, 75, 22, 0.25));
    color: var(--c-white);
    cursor: pointer;
}

.tabMenuTitle {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.tabSheetBackdrop {
    position: fixed;
    inset: 0;
    z-index: 2000;
    display: flex;
    align-items: flex-end;
    background: rgba(0, 0, 0, 0.6);
}

.tabSheet {
    width: 100%;
    max-height: 85vh;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 10px 12px calc(16px + env(safe-area-inset-bottom));
    background: rgba(5, 5, 5, 0.98);
    border-top: 1px solid rgba(180, 130, 45, 0.45);
    border-radius: 14px 14px 0 0;
    box-shadow: 0 -12px 30px rgba(0, 0, 0, 0.6);
    color: var(--text);
}

.tabSheetGroupTitle {
    margin: 10px 4px 6px;
    color: var(--c-gold);
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
}

.tabSheetGrid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
}

.tabSheetItem {
    appearance: none;
    -webkit-appearance: none;
    font: inherit;
    font-size: 16px;
    text-align: left;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(0, 0, 0, 0.35);
    color: rgba(255, 255, 255, 0.85);
    cursor: pointer;
}

.tabSheetItem.active {
    background: linear-gradient(180deg, rgba(202, 161, 74, 0.3), rgba(107, 75, 22, 0.25));
    border-color: rgba(202, 161, 74, 0.55);
    color: var(--c-white);
}

@media (max-width: 980px) {
    :root {
        --topbar-h: 52px;
    }

    /* hidden would make .appRoot a scroll container and swallow position: sticky; clip doesn't. */
    .appRoot {
        overflow-x: clip;
    }

    /* Only the top row is pinned; it needs an opaque background for content scrolling under it. */
    .tabsPanel {
        position: sticky;
        top: 0;
        z-index: 50;
        min-height: var(--topbar-h);
        flex-wrap: nowrap;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02)), #050608;
    }
}
```

- [ ] **Step 3: Write `$SCRATCH/check-header.mjs`**

```js
import {run, checker, BASE, sleep} from "./cdp.mjs";

const c = checker();
const sheetOpen = `!!document.querySelector(".tabSheet")`;

await run(async (page) => {
    await page.mobile();
    await page.goto(`${BASE}#/uniques`);
    await page.waitFor(`!!document.querySelector(".tabMenuBtn")`);
    c.ok(await page.eval(`matchMedia("(hover: none)").matches && matchMedia("(max-width: 980px)").matches`),
        "harness: mobile emulation active (hover: none, at most 980px)");
    c.ok(await page.eval(`!document.querySelector(".tabs")`), "the desktop tab row isn't rendered on mobile");

    const label = await page.eval(`document.querySelector(".tabMenuBtn").textContent`);
    c.ok(label.includes("☰") && label.includes("Uniques") && label.includes("▾"), "menu button names the current tab", label);
    const barH = await page.eval(`document.querySelector(".tabsPanel").getBoundingClientRect().height`);
    c.ok(barH <= 56, "top row is about 50px tall", `${barH}px`);

    await page.tap(".tabMenuBtn"); // also proves the harness's touch taps produce clicks
    c.ok(await page.eval(sheetOpen), "tapping the menu button opens the sheet");
    const groups = await page.eval(`[...document.querySelectorAll(".tabSheetGroupTitle")].map((e) => e.textContent)`);
    c.ok(JSON.stringify(groups) === JSON.stringify(["Items", "Mechanics", "Tools", "About"]), "sheet group headings", JSON.stringify(groups));
    c.ok(await page.eval(`document.querySelectorAll(".tabSheetItem").length`) === 18, "the sheet lists 18 tabs");
    c.ok(await page.eval(`document.querySelector(".tabSheetItem.active")?.textContent`) === "Uniques", "the current tab is highlighted");
    c.ok(await page.eval(`getComputedStyle(document.querySelector(".tabSheetGrid")).gridTemplateColumns.split(" ").length`) === 2,
        "two-column grid");

    await page.tap(".tabSheetItem", {text: "Affixes"});
    c.ok(await page.eval(`!${sheetOpen} && location.hash === "#/affixes"`), "selecting a tab closes the sheet and switches tab");

    await page.tap(".tabMenuBtn");
    await page.tapAt(195, 20); // backdrop, above the sheet
    c.ok(await page.eval(`!${sheetOpen} && location.hash === "#/affixes"`), "tapping the backdrop closes the sheet, tab unchanged");

    await page.tap(".tabMenuBtn");
    await page.key("Escape");
    c.ok(await page.eval(`!${sheetOpen}`), "Escape closes the sheet");

    await page.tap(".tabMenuBtn");
    await page.eval("history.back()");
    await page.waitFor(`location.hash === "#/uniques"`);
    await sleep(300);
    c.ok(await page.eval(`!${sheetOpen}`), "Back with the sheet open goes to the previous tab and closes the sheet");

    await page.eval(`location.hash = "#/changelog"`);
    await sleep(500);
    c.ok((await page.eval(`document.querySelector(".tabMenuBtn").textContent`)).includes("Changelog"), "menu button reads Changelog");

    await page.eval(`location.hash = "#/weapons"`);
    await page.waitFor(`document.querySelectorAll(".list .row").length > 20`);
    await page.eval("window.scrollTo(0, 600)");
    await sleep(400);
    c.ok(Math.abs(await page.eval(`document.querySelector(".tabsPanel").getBoundingClientRect().top`)) < 1, "top row stays pinned while scrolling");
    c.ok(await page.eval(`document.querySelector(".filtersPanel").getBoundingClientRect().bottom < 0`), "the search row scrolls away");
    c.ok(await page.eval(`!!document.querySelector(".goTopBtn")`), "the go-to-top button appears");

    // Review focus 3: crossing the breakpoint with the sheet open.
    await page.eval("window.scrollTo(0, 0)");
    await page.tap(".tabMenuBtn");
    await page.desktop();
    c.ok(await page.eval(`!document.querySelector(".tabSheetBackdrop") && !!document.querySelector(".tabs .tab")`),
        "widening past 980px removes the sheet and restores the tab row");
    await page.mobile();
    c.ok(await page.eval(`!document.querySelector(".tabSheetBackdrop") && !!document.querySelector(".tabMenuBtn")`),
        "narrowing again shows the menu button with the sheet closed");
});
c.done();
```

- [ ] **Step 4: Write `$SCRATCH/survey.mjs` (reused in Tasks 9 and 11)**

```js
// Mobile overflow survey: every tab (default state; for tabs that have them, also with filters
// unfolded and with the first row expanded). Screenshots go to shots/mobile/.
import {mkdirSync} from "node:fs";
import {run, BASE, TAB_KEYS, OVERFLOW_CHECK, openTab, sleep} from "./cdp.mjs";

const dir = new URL("./shots/mobile/", import.meta.url).pathname;
mkdirSync(dir, {recursive: true});
let failed = 0;

async function survey(page, label, extra = "") {
    const r = await page.eval(OVERFLOW_CHECK);
    const ok = r.count === 0 && r.scrollWidth <= r.vw && !extra;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"} ${label.padEnd(22)} offenders=${r.count} scrollWidth=${r.scrollWidth}/${r.vw}${extra}`);
    for (const o of r.offenders) console.log("       ", JSON.stringify(o));
}

await run(async (page) => {
    await page.mobile();
    await page.goto(`${BASE}#/weapons`);
    await page.waitFor(`!!document.querySelector(".tabMenuBtn")`);
    for (const key of TAB_KEYS) {
        await openTab(page, key);
        await sleep(1200);
        const extra = key === "affixes" && !(await page.eval(`!!document.querySelector(".affixTable")`)) ? " NO AFFIX TABLE" : "";
        await survey(page, key, extra);
        await page.screenshot(`${dir}${key}.png`);
        if (await page.eval(`!!document.querySelector(".filtersToggle")`)) {
            await page.tap(".filtersToggle");
            await survey(page, `${key} +filters`);
        }
        if (await page.eval(`!!document.querySelector(".list .row")`)) {
            await page.tap(".list .row");
            await survey(page, `${key} +row`);
            await page.screenshot(`${dir}${key}-row.png`);
        }
        await page.eval("window.scrollTo(0, 0)");
    }
});
console.log(failed ? `${failed} survey(s) failed` : "all surveys pass");
if (failed) process.exitCode = 1;
```

- [ ] **Step 5: Run the checks; view one screenshot**

Run: `cd "$SCRATCH" && node check-header.mjs`. Expected: all `PASS`.
Run: `cd "$SCRATCH" && node survey.mjs || true`. Overflow failures are expected on some tabs until Task 9. The point here is that the script runs end to end and that the header no longer appears among the offenders (no `tabs`/`tab` entries).
Open `$SCRATCH/shots/mobile/uniques.png` with the Read tool. Expected: a single top row with "☰ Uniques ▾" and the Damnation toggle, in the existing dark/gold look.
Run: `cd "$WT" && npm test && npm run build`, then the lint comparison. Expected: pass, success, no `>` lines.

- [ ] **Step 6: Commit**

```bash
cd "$WT" && git add src/App.jsx src/styles.css && git commit -m "Mobile: pinned top row with a menu button and tab sheet"
```

---

### Task 5: Fold the extra filters behind "Filters (n)" on mobile

**Files:**
- Modify: `src/App.jsx`: `FiltersBar` (~L990–1140); the list-tabs `<FiltersBar` in App's final branch (the one with `showRuneCount={tab === "runewords"}`)
- Modify: `src/styles.css`: append
- Scratch: `$SCRATCH/check-filters.mjs`

**Interfaces:**
- Consumes: `openTab` (harness).
- Produces: a new `FiltersBar` prop `extraActiveCount = 0` (number added to the count, used for `selectedRunes`), and the selectors `.filtersSearchRow`, `.filtersToggle`, `.filtersFold` (`.open` when unfolded).

- [ ] **Step 1: `FiltersBar` markup**

Add `extraActiveCount = 0,` as the last destructured prop, after the `setRuneCountValue` default (which spans two lines: `setRuneCountValue = () => {` / `},`). In the body, before `return`, add:

```js
    // Mobile folds everything but the search box behind a "Filters (n)" button. n counts folded
    // filters that are set (truthy), plus extraActiveCount (the Rune filter's selection).
    const [foldOpen, setFoldOpen] = React.useState(false);
    const hasFolded = showType || showSockets || showRuneCount || showTier || showAffixType || showUber || showHellforged || showHighlight;
    const activeCount = [
        showType && typeValue,
        showSockets && socketsValue,
        showRuneCount && runeCountValue,
        showTier && tierValue,
        showAffixType && affixTypeValue,
        showUber && uberValue,
        showHellforged && hellforgedValue,
        showHighlight && highlightOnly,
    ].filter(Boolean).length + extraActiveCount;
```

Restructure the returned `.filtersPanel` children. The search `<input>` goes into `.filtersSearchRow` together with the new button, and every other control (from `{showType && (` through the highlight toggle's closing `)}`) moves unchanged into `.filtersFold`:

```jsx
    return (<div className="filtersRow">
        <div className="filtersPanel">
            <div className="filtersSearchRow">
                <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    className="searchBar"
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search item name…"
                />
                {hasFolded && (<button
                    type="button"
                    className="filtersToggle"
                    aria-expanded={foldOpen}
                    onClick={() => setFoldOpen((v) => !v)}
                >
                    Filters ({activeCount}) {foldOpen ? "▴" : "▾"}
                </button>)}
            </div>

            <div className={"filtersFold" + (foldOpen ? " open" : "")}>
                {/* …all existing type/sockets/rune-count/tier/affix-type/uber/hellforged/highlight controls, unchanged… */}
            </div>
        </div>
    </div>);
```

The comment line stands for the existing JSX moved as-is. Don't leave the comment in the file.

On the list-tabs `<FiltersBar` (in App's last branch), add two props:

```jsx
                        key={tab}
                        extraActiveCount={selectedRunes.length ? 1 : 0}
```

Also add `key={tab}` to the two other `<FiltersBar` instances, in the Corruptions branch (`tab === "corruptions" ? (<>`) and the Affixes branch (`tab === "affixes" ? (<>`). Those two branches have the same shape (Fragment → `div.filtersStack` → `FiltersBar`), so without a key React keeps one instance, and its open fold, across Affixes ↔ Corruptions.

`key={tab}` remounts the bar per tab, so the fold starts collapsed on every tab. On desktop the DOM is identical.

- [ ] **Step 2: CSS**

Append to `src/styles.css`:

```css
/* -------------------------------------------------------------------------- */
/* Mobile-friendly: extra filters fold behind "Filters (n)"                    */
/* -------------------------------------------------------------------------- */

/* Desktop: the wrappers vanish from layout, so the controls sit in .filtersPanel exactly as before. */
.filtersSearchRow,
.filtersFold {
    display: contents;
}

.filtersToggle {
    display: none;
}

@media (max-width: 980px) {
    .filtersSearchRow {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
    }

    .filtersToggle {
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
        appearance: none;
        -webkit-appearance: none;
        font: inherit;
        font-weight: 800;
        white-space: nowrap;
        cursor: pointer;
        padding: 6px 10px;
        border-radius: 8px;
        border: 1px solid rgba(202, 161, 74, 0.45);
        background: rgba(202, 161, 74, 0.18);
        color: rgba(255, 255, 255, 0.85);
    }

    .filtersFold {
        display: none;
    }

    .filtersFold.open {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 6px;
    }
}
```

- [ ] **Step 3: Write `$SCRATCH/check-filters.mjs`**

```js
import {run, checker, BASE, openTab} from "./cdp.mjs";

const c = checker();
const label = `document.querySelector(".filtersToggle")?.textContent ?? null`;
const foldDisplay = `getComputedStyle(document.querySelector(".filtersFold")).display`;

await run(async (page) => {
    await page.mobile();
    await page.goto(`${BASE}#/weapons`);
    await page.waitFor(`!!document.querySelector(".filtersPanel")`);

    for (const key of ["weapons", "armors", "uniques", "runewords", "sacreds", "affixes", "corruptions"]) {
        await openTab(page, key);
        c.ok(await page.eval(label) === "Filters (0) ▾", `${key}: Filters (0) ▾ button`, String(await page.eval(label)));
        c.ok(await page.eval(foldDisplay) === "none", `${key}: extra filters folded by default`);
        c.ok(await page.eval(`document.querySelector(".filtersPanel .searchBar").checkVisibility()`), `${key}: search stays visible`);
    }
    // Affixes and Corruptions render FiltersBar in the same tree position; the fold must not carry over.
    await openTab(page, "affixes");
    await page.tap(".filtersToggle");
    await openTab(page, "corruptions");
    c.ok(await page.eval(foldDisplay) === "none", "affixes to corruptions: the fold starts collapsed again");

    for (const key of ["fatecards", "skills", "ascendancies", "kiln", "mapping", "cube", "changes"]) {
        await openTab(page, key);
        c.ok(await page.eval(`!document.querySelector(".filtersToggle")`), `${key}: no Filters button`);
    }

    await openTab(page, "uniques");
    await page.tap(".filtersToggle");
    c.ok(await page.eval(foldDisplay) === "flex", "uniques: the button unfolds the filters");
    await page.tap(".filtersFold .toggleWrap", {text: "Uber boss unique"});
    await page.tap(".filtersFold .toggleWrap", {text: "SoE exclusive"});
    c.ok(await page.eval(label) === "Filters (2) ▴", "two set toggles count as 2", String(await page.eval(label)));

    await openTab(page, "runewords");
    c.ok(await page.eval(label) === "Filters (0) ▾" && await page.eval(foldDisplay) === "none",
        "switching tab resets the count and folds the filters again");
    await page.tap(".runeFilterPanel .infoToggle");
    await page.tap(".runeChip", {text: "El"});
    c.ok(await page.eval(label) === "Filters (1) ▾", "a selected rune counts as one filter", String(await page.eval(label)));
    await page.tap(".runeChip", {text: "Tir"});
    c.ok(await page.eval(label) === "Filters (1) ▾", "several selected runes still count as one");

    await page.desktop();
    c.ok(await page.eval(`getComputedStyle(document.querySelector(".filtersToggle")).display === "none"
        && document.querySelector(".filtersPanel .selSearchWrap").checkVisibility()`), "desktop: no Filters button, filters inline");
});
c.done();
```

- [ ] **Step 4: Run the checks, build, lint**

Run: `cd "$SCRATCH" && node check-filters.mjs && node check-header.mjs`. Expected: all `PASS`.
Run: `cd "$WT" && npm test && npm run build`, then the lint comparison. Expected: pass, success, no `>` lines.

- [ ] **Step 5: Commit**

```bash
cd "$WT" && git add src/App.jsx src/styles.css && git commit -m "Mobile: fold extra filters behind a Filters (n) button"
```

---

### Task 6: List tabs: rows expand in place on mobile

**Files:**
- Modify: `src/App.jsx`: `ListPanel` (~L1175–1216); in `App`, the new expansion state right after the `filtered` memo, `jumpToCode`, the `pendingLinkTarget`/`pendingUniqueCode`/`pendingSacredMatch` effects, a new `renderTooltip`, and the `<ListPanel>`/`<TooltipShell>` JSX at the end of the final branch
- Modify: `src/styles.css`: delete the three mobile `.list { max-height }` rules; append a list section
- Scratch: `$SCRATCH/check-list.mjs`

**Interfaces:**
- Consumes: `isMobile`, `--topbar-h` (Task 4), and the existing tooltip components and jump functions.
- Produces: `ListPanel` props `mobile: boolean`, `expandedIndex: number | null`, `onToggleExpanded(i)`, `renderDetail(item) → JSX`; the selectors `.rowDetail` (sibling right after its `.row`, containing a `.tooltip`); `renderTooltip(item)` in App.

- [ ] **Step 1: `ListPanel`**

Replace `function ListPanel({ … }) { … }` with:

```jsx
function ListPanel({
                       title, countLabel, items, activeIndex, setActiveIndex, subLabel, tinyLabel, tab,
                       mobile = false, expandedIndex = null, onToggleExpanded, renderDetail,
                   }) {

    const activeRowRef = React.useRef(null);
    // Desktop highlights the selected row; mobile highlights the expanded one (none by default).
    const focusIndex = mobile ? expandedIndex : activeIndex;

    React.useEffect(() => {
        if (focusIndex === null) return;
        // On mobile, scroll-margin-top lands the opened row just below the pinned top row.
        activeRowRef.current?.scrollIntoView({block: mobile ? "start" : "nearest"});
    }, [focusIndex, mobile]);

    return (<div className="listPanel">
        <div className="listHeader">
            <div className="title">{title}</div>
            <div className="count">{countLabel}</div>
        </div>

        <div className="list" role="list">
            {items.length === 0 ? (
                <div className="emptyState">No items match your filters.</div>) : (items.map((it, i) => {
                const iconUrl = getItemIconUrl(tab, it);
                const isFocus = i === focusIndex;

                return (<React.Fragment key={`${i}::${n(it?.code)}::${n(it?.displayName) || n(it?.name)}`}>
                    <div
                        ref={isFocus ? activeRowRef : null}
                        className={"row" + (isFocus ? " active" : "")}
                        onClick={() => (mobile ? onToggleExpanded(i) : setActiveIndex(i))}
                        role="listitem"
                    >
                        <div className="ico">
                            {iconUrl ? (<img src={iconUrl} className="icon" alt=""/>) : null}
                        </div>
                        <div className="meta">
                            <div className={tab === "uniques" ? "uniqueName" : "name"}>
                                {n(it?.displayName) || n(it?.name) || "Unknown"} {isHighlightedItem(it) && (tab === "uniques" || tab === "armors" || tab === "weapons" || tab === "runewords") ?
                                <span className="uniqueSOEAsterisk">*</span> : null}
                            </div>
                            <div className="sub">{subLabel(it)}</div>
                            <div className="tiny">{tinyLabel(it)}</div>
                        </div>
                    </div>

                    {/* A sibling of the row, not a child, so taps on links and tips inside don't toggle it. */}
                    {mobile && isFocus ? (<div className="rowDetail">
                        <div className="tooltip">{renderDetail(it)}</div>
                    </div>) : null}
                </React.Fragment>);
            }))}
        </div>
    </div>);
}
```

- [ ] **Step 2: Expansion state in `App`**

Directly after the `filtered` memo's closing `}, [items, tab, search, tierValue, typeValue, socketsValue, uberValue, hellforgedValue, highlightOnly, affixTypeValue, runeCountValue, selectedRunes]);`, and so **before** the `pendingLinkTarget` effect, insert:

```js
    // Mobile list rows expand in place. An expansion belongs to one `filtered` array, so any tab,
    // search or filter change (a new array) collapses it, with no reset effect to race the jumps.
    const [expanded, setExpanded] = useState({list: null, index: null});
    const expandedIndex = expanded.list === filtered ? expanded.index : null;
    const toggleExpanded = (i) => setExpanded((prev) => ({
        list: filtered,
        index: prev.list === filtered && prev.index === i ? null : i,
    }));

    // Jumps (tier, unique, sacred and app: links) expand their target once its list has settled.
    const [pendingExpandIndex, setPendingExpandIndex] = useState(null);
    useEffect(() => {
        if (pendingExpandIndex === null) return;
        setExpanded({list: filtered, index: pendingExpandIndex});
        setPendingExpandIndex(null);
    }, [pendingExpandIndex, filtered]);
```

Lint note: this effect adds no problem today only because the React Compiler lint rules stop at `App`'s existing `react-hooks/immutability` errors. The same code in a standalone component or hook reports `react-hooks/set-state-in-effect`. Keep it inline in `App`, as the plan does. If the lint comparison ever shows it, for example because those baseline errors were fixed, switch to React's "adjust state during render" pattern instead of suppressing the rule.

- [ ] **Step 3: Every jump also expands its target**

In the `pendingLinkTarget` effect, replace `if (idx >= 0) { setActiveIndex(idx); }` with:

```js
        if (idx >= 0) {
            setActiveIndex(idx);
            setPendingExpandIndex(idx);
        } else if (filtered.length) {
```

(keeping the existing `setActiveIndex(0);` and closing brace of the `else if`). In the `pendingUniqueCode` effect, in the `pendingSacredMatch` effect, and in `jumpToCode`, replace `if (idx >= 0) setActiveIndex(idx);` with:

```js
        if (idx >= 0) {
            setActiveIndex(idx);
            setPendingExpandIndex(idx);
        }
```

- [ ] **Step 4: One tooltip renderer for both layouts**

Directly above `const countLabel = dataset.loading ? …`, add:

```jsx
    // An item's details: desktop shows them in TooltipShell, mobile under the expanded row.
    const renderTooltip = (item) => {
        if (tab === "weapons") return <WeaponTooltip w={item} onGoCode={jumpToCode} onGoUnique={jumpToUnique}/>;
        if (tab === "armors") return <ArmorTooltip a={item} onGoCode={jumpToCode} onGoUnique={jumpToUnique}/>;
        if (tab === "runewords") return <RunewordTooltip rw={item} onGoSacred={jumpToSacred} onLink={handleMarkdownAppLink}/>;
        if (tab === "uniques") return <UniqueTooltip u={item} onLink={handleMarkdownAppLink} openDropCalculator={openDropCalculator}/>;
        if (tab === "sacreds") return <SacredTooltip s={item} onLink={handleMarkdownAppLink}/>;
        if (tab === "fatecards") return <FateCardTooltip card={item}/>;
        return null;
    };
```

Replace the `<ListPanel … />` and the whole `<TooltipShell> … </TooltipShell>` at the end of App's final branch with:

```jsx
                <ListPanel
                    tab={tab}
                    title={renderTabTitle(tab)}
                    countLabel={countLabel}
                    items={filtered}
                    activeIndex={activeIndex}
                    setActiveIndex={setActiveIndex}
                    subLabel={subLabel}
                    tinyLabel={tinyLabel}
                    mobile={isMobile}
                    expandedIndex={expandedIndex}
                    onToggleExpanded={toggleExpanded}
                    renderDetail={renderTooltip}
                />

                {!isMobile && <TooltipShell>{renderTooltip(activeItem)}</TooltipShell>}
```

- [ ] **Step 5: CSS**

In `src/styles.css`, delete these three `.list` rules, each inside a mobile media block, at ~L1696, ~L1882 and ~L2034 (as of `fa1ea5c`). Find them with `grep -n -A2 '^    \.list {' src/styles.css`. Don't touch the other `max-height: 4…` rules: `.cubeInfoBody` (~L1724) stays, and the two `.affixTableScroll` rules belong to Task 7.

```css
    .list {
        max-height: 46vh;
    }
```
(in the `@media (max-width: 980px)` block at ~L1686)
```css
    .list {
        max-height: 45vh;
    }
```
(in the 980px "Mobile layout tweaks" block ~L1882, and again in the 720px block ~L2034). Then append:

```css
/* -------------------------------------------------------------------------- */
/* Mobile-friendly: list rows expand in place; the page is the only scroller   */
/* -------------------------------------------------------------------------- */

@media (max-width: 980px) {
    .list {
        max-height: none;
        overflow: visible;
    }

    .row {
        scroll-margin-top: calc(var(--topbar-h) + 4px);
    }

    .rowDetail {
        padding: 0 6px 10px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .rowDetail .tooltip {
        margin-top: 0;
    }
}
```

- [ ] **Step 6: Write `$SCRATCH/check-list.mjs`**

```js
import {run, checker, BASE, openTab, sleep} from "./cdp.mjs";

const c = checker();
// Distance from the bottom of the pinned top row to the top of the expanded row, and whether the page
// is scrolled to its end (a short page can't bring a low row all the way up; that still counts).
const GAP = `(() => {
    const d = document.querySelector(".rowDetail");
    if (!d) return null;
    return {
        gap: d.previousElementSibling.getBoundingClientRect().top - document.querySelector(".tabsPanel").getBoundingClientRect().bottom,
        atEnd: window.scrollY >= document.documentElement.scrollHeight - window.innerHeight - 1,
    };
})()`;
const detailText = `document.querySelector(".rowDetail")?.textContent ?? ""`;

await run(async (page) => {
    const gapOk = async (label) => {
        const g = await page.eval(GAP);
        c.ok(g !== null && g.gap >= 0 && (g.gap <= 8 || g.atEnd), label, JSON.stringify(g));
    };
    const collapse = async () => {
        if (await page.eval(`!!document.querySelector(".rowDetail")`)) await page.tap(".row.active");
    };
    // Expands rows one at a time until the details contain `selector`; returns that row's index.
    const expandRowWith = async (selector, max = 60) => {
        await collapse();
        for (let i = 0; i < max; i++) {
            await page.tap(".list .row", {nth: i});
            if (await page.eval(`!!document.querySelector(${JSON.stringify(`.rowDetail ${selector}`)})`)) return i;
        }
        return -1;
    };
    const jumpCheck = async (hash, name, label) => {
        await page.waitFor(`location.hash === "${hash}"`);
        await page.waitFor(`(${detailText}).includes(${JSON.stringify(name)})`, 8000).catch(() => {});
        c.ok((await page.eval(detailText)).includes(name), `${label}: lands with the target expanded`, name);
        await gapOk(`${label}: target row is in view below the top row`);
    };

    await page.mobile();
    await page.goto(`${BASE}#/weapons`);
    await page.waitFor(`document.querySelectorAll(".list .row").length > 20`);
    c.ok(await page.eval("window.scrollY === 0"), "loading doesn't scroll to row 0");
    c.ok(await page.eval(`!document.querySelector(".row.active") && !document.querySelector(".rowDetail") && !document.querySelector(".tooltipShell")`),
        "no row pre-selected and no tooltip panel");
    c.ok(await page.eval(`(() => { const l = document.querySelector(".list"); return getComputedStyle(l).maxHeight === "none" && l.scrollHeight <= l.clientHeight + 1; })()`),
        "the list has no scroll box of its own");

    await page.tap(".list .row", {nth: 3});
    c.ok(await page.eval(`(() => {
        const row = document.querySelectorAll(".list .row")[3];
        return document.querySelectorAll(".rowDetail").length === 1 && row.classList.contains("active")
            && row.nextElementSibling?.classList.contains("rowDetail");
    })()`), "tapping row 3 expands its details right below it");
    await gapOk("the expanded row sits just below the pinned top row");

    await page.tap(".list .row", {nth: 3});
    c.ok(await page.eval(`!document.querySelector(".rowDetail")`), "tapping the same row collapses it");

    await page.tap(".list .row", {nth: 2});
    await page.tap(".list .row", {nth: 5});
    c.ok(await page.eval(`document.querySelectorAll(".rowDetail").length === 1
        && document.querySelectorAll(".list .row")[5].nextElementSibling?.classList.contains("rowDetail")`),
        "tapping another row moves the expansion");
    await gapOk("the newly expanded row is scrolled just below the top row");

    // Review focus 4.
    await page.tap(".rowDetail .tipWrap");
    c.ok(await page.eval(`!!document.querySelector(".rowDetail")`), "tapping a tooltip label inside the details keeps the row expanded");

    // Tier link (same tab).
    const tierRow = await expandRowWith(".line.kv a.d2link");
    c.ok(tierRow >= 0, "found a weapon with tier links");
    const tierName = await page.eval(`[...document.querySelectorAll(".rowDetail .line.kv a.d2link")].at(-1).textContent.trim()`);
    await page.tap(".rowDetail .line.kv a.d2link", {text: tierName});
    await sleep(400);
    c.ok((await page.eval(`document.querySelector(".rowDetail .tipTitle")?.textContent.trim()`)) === tierName,
        "a tier link expands the target item", tierName);
    await gapOk("tier target row is in view");

    // Unique link (cross-tab).
    const uRow = await expandRowWith(".goToLink a.d2link");
    c.ok(uRow >= 0, "found a weapon with a unique link");
    const uniqueName = await page.eval(`document.querySelector(".rowDetail .goToLink a.d2link").textContent.trim()`);
    await page.tap(".rowDetail .goToLink a.d2link");
    await jumpCheck("#/uniques", uniqueName, "unique link");

    // Sacred link (cross-tab).
    await openTab(page, "runewords");
    const sRow = await expandRowWith(`a[title^="Go to sacred"]`, 120);
    c.ok(sRow >= 0, "found a runeword with a sacred link");
    const sacredName = await page.eval(`document.querySelector('.rowDetail a[title^="Go to sacred"]').title.replace("Go to sacred: ", "")`);
    await page.tap(`.rowDetail a[title^="Go to sacred"]`);
    await jumpCheck("#/sacreds", sacredName, "sacred link");

    // app: link (pendingLinkTarget).
    await openTab(page, "cube");
    await page.waitFor(`[...document.querySelectorAll("button.mdLinkInternal")].some((b) => b.textContent === "Hellfire Torch")`);
    await page.tap("button.mdLinkInternal", {text: "Hellfire Torch"});
    await jumpCheck("#/uniques", "Hellfire Torch", "app: link");

    // Review focus 5: the same jump while Uniques is still reloading after toggling Damnation.
    // Hold damnation/Uniques.json in flight, jump, then let it through.
    await openTab(page, "cube");
    await page.waitFor(`[...document.querySelectorAll("button.mdLinkInternal")].some((b) => b.textContent === "Hellfire Torch")`);
    await page.send("Fetch.enable", {patterns: [{urlPattern: "*damnation/Uniques.json*", requestStage: "Request"}]});
    const paused = page.once("Fetch.requestPaused");
    await page.tap(".topBarToggle");
    const {requestId} = await paused;
    await page.tap("button.mdLinkInternal", {text: "Hellfire Torch"});
    await page.waitFor(`location.hash === "#/uniques"`);
    c.ok(await page.eval(`!document.querySelector(".rowDetail")`), "while Uniques reloads, the jump waits (nothing expanded yet)");
    await page.send("Fetch.continueRequest", {requestId});
    await page.send("Fetch.disable");
    await jumpCheck("#/uniques", "Hellfire Torch", "app: link after toggling Damnation");
    await page.tap(".topBarToggle");

    // A search change collapses the expansion.
    await openTab(page, "weapons");
    await page.tap(".list .row", {nth: 1});
    await page.type(".filtersPanel .searchBar", "axe");
    c.ok(await page.eval(`!document.querySelector(".rowDetail")`), "typing a search collapses the expanded row");

    // Review focus 3: crossing the breakpoint with a row expanded (a tab switch clears the search).
    await openTab(page, "armors");
    await openTab(page, "weapons");
    await page.tap(".list .row", {nth: 2});
    await page.desktop();
    c.ok(await page.eval(`!!document.querySelector(".tooltipShell") && !document.querySelector(".rowDetail") && !!document.querySelector(".row.active")`),
        "breakpoint: desktop shows the tooltip panel and a selected row, no inline details");
    await page.mobile();
    c.ok(await page.eval(`!document.querySelector(".tooltipShell")`), "breakpoint: back on mobile there's no tooltip panel");
});
c.done();
```

- [ ] **Step 7: Run the checks, build, lint**

Run: `cd "$SCRATCH" && node check-list.mjs && node check-header.mjs && node check-filters.mjs && node check-hash.mjs`. Expected: all `PASS`.
Run: `cd "$WT" && npm test && npm run build`, then the lint comparison. Expected: pass, success, no `>` lines.

- [ ] **Step 8: Commit**

```bash
cd "$WT" && git add src/App.jsx src/styles.css && git commit -m "Mobile: list rows expand in place; jumps land on the expanded target"
```

---

### Task 7: Swipe tables, Affixes on mobile, bottom pagers

**Files:**
- Modify: `src/App.jsx`: new `PagerButtons` component (above `function CorruptionsTable`); `CorruptionsTable` (~L2825), `AffixesPanel` (~L2905, also drop its `isMobile` early return and `useIsMobile(895)`), and `DropCalculatorPanel`'s pager (~L2254–2288)
- Modify: `src/styles.css`: the 980px block's `.affixTableScroll` rule (~L1915), the 480px block's `.affixTableScroll` rule (~L2129); append a tables section
- Scratch: `$SCRATCH/check-tables.mjs`

**Interfaces:**
- Consumes: `--topbar-h` (Task 4).
- Produces: `PagerButtons({label, canPrev, canNext, onPrev, onNext, ghost = false, scrollTargetRef = null})`, which renders the existing `.affixPagerRight` markup, and the selector `.affixPager.affixPagerBottom`.

- [ ] **Step 1: `PagerButtons`**

Add directly above `function CorruptionsTable({items}) {`:

```jsx
// Prev / page / Next controls shared by the three paged tables. The bottom copy (mobile only, via
// CSS) passes scrollTargetRef so a page change scrolls back to the top of the table.
function PagerButtons({label, canPrev, canNext, onPrev, onNext, ghost = false, scrollTargetRef = null}) {
    const btnClass = ghost ? "btn ghost affixPagerBtn" : "btn affixPagerBtn";
    const go = (fn) => () => {
        fn();
        scrollTargetRef?.current?.scrollIntoView({block: "start"});
    };

    return (<div className="affixPagerRight">
        <button type="button" className={btnClass} disabled={!canPrev} onClick={go(onPrev)}>
            ‹ Prev
        </button>
        <span className="affixPagerInfo">{label}</span>
        <button type="button" className={btnClass} disabled={!canNext} onClick={go(onNext)}>
            Next ›
        </button>
    </div>);
}
```

- [ ] **Step 2: `CorruptionsTable`**

Add `const wrapperRef = React.useRef(null);` after `const [page, setPage] = React.useState(1);`. After `pageItems`, add:

```js
    const pager = {
        label: `Page ${safePage} / ${totalPages}`,
        canPrev: safePage > 1,
        canNext: safePage < totalPages,
        onPrev: () => setPage((p) => Math.max(1, p - 1)),
        onNext: () => setPage((p) => Math.min(totalPages, p + 1)),
    };
```

Give the wrapper the ref, `<div className="affixTableWrapper" ref={wrapperRef}>`. Replace its `<div className="affixPagerRight"> … </div>` (both buttons and the info span) with `<PagerButtons {...pager}/>`. After the closing `</div>` of `.affixTableScroll`, still inside the wrapper, add:

```jsx
            <div className="affixPager affixPagerBottom">
                <PagerButtons {...pager} scrollTargetRef={wrapperRef}/>
            </div>
```

- [ ] **Step 3: `DropCalculatorPanel`**

Add `const wrapperRef = React.useRef(null);` after `const [mf, setMf] = React.useState("");`. After `const pageRows = …;`, add:

```js
    const pager = {
        label: `Page ${safePage} / ${totalPages}`,
        canPrev: safePage > 1,
        canNext: safePage < totalPages,
        onPrev: () => setPage((p) => Math.max(1, p - 1)),
        onNext: () => setPage((p) => Math.min(totalPages, p + 1)),
    };
```

Then do the same three edits as Step 2: `ref={wrapperRef}` on `<div className="affixTableWrapper">`, `<PagerButtons {...pager}/>` in place of its `.affixPagerRight` div, and the bottom pager after `.affixTableScroll`.

- [ ] **Step 4: `AffixesPanel`**

Replace `const isMobile = useIsMobile(895);` with `const wrapperRef = React.useRef(null);`. Delete the whole `if (isMobile) { return ( … "The Affixes table is not viewable on mobile." … ); }` block. After `const goNext = …;`, add:

```js
    const pager = {
        label: `Page ${safePage + 1} / ${pageCount}`,
        canPrev: safePage > 0,
        canNext: safePage < pageCount - 1,
        onPrev: goPrev,
        onNext: goNext,
        ghost: true,
    };
```

Then do the same three edits: `ref={wrapperRef}` on `<div className="affixTableWrapper">`, `<PagerButtons {...pager}/>` in place of the `.affixPagerRight` div, and the bottom pager after `.affixTableScroll`. Also update the `// --- Loading / empty / mobile ---` comment to `// --- Loading / empty ---`.

- [ ] **Step 5: CSS**

In the 980px "Mobile layout tweaks" block, replace

```css
    .affixTableScroll {
        max-height: 420px;
        overflow-y: auto;
        overflow-x: auto;
    }
```

with

```css
    /* Swipe tables: the page scrolls vertically, the table only horizontally. */
    .affixTableScroll {
        min-height: 0;
        max-height: none;
        overflow-x: auto;
    }
```

Delete the identical `max-height: 420px` rule in the 480px block. The 980px rule already covers phones. Then append:

```css
/* -------------------------------------------------------------------------- */
/* Mobile-friendly: swipe tables (Affixes, Corruptions, Drop calculator)      */
/* -------------------------------------------------------------------------- */

.affixPager.affixPagerBottom {
    display: none;
}

@media (max-width: 980px) {
    .affixPager.affixPagerBottom {
        display: flex;
        justify-content: flex-end;
    }

    .affixTableWrapper {
        scroll-margin-top: calc(var(--topbar-h) + 4px);
    }

    /* Under collapse, borders don't travel with sticky cells. */
    .affixTable {
        border-collapse: separate;
        border-spacing: 0;
    }

    /* Pinned first column; colSpan message rows (Drop calculator) stay unpinned. */
    .affixTable th:first-child,
    .affixTable td:first-child:not([colspan]) {
        position: sticky;
        left: 0;
        z-index: 1;
        background: var(--bg);
        box-shadow: 1px 0 0 rgba(255, 255, 255, 0.08);
    }
}
```

- [ ] **Step 6: Write `$SCRATCH/check-tables.mjs`**

```js
import {run, checker, BASE, openTab, sleep} from "./cdp.mjs";

const c = checker();
const total = `Number((document.querySelector(".affixPager").textContent.match(/of (\\d+)/) || [])[1] || 0)`;

await run(async (page) => {
    const tableChecks = async (key, {expectHScroll}) => {
        const s = await page.eval(`(() => {
            const el = document.querySelector(".affixTableScroll");
            return {maxH: getComputedStyle(el).maxHeight, v: el.scrollHeight > el.clientHeight + 1, h: el.scrollWidth > el.clientWidth};
        })()`);
        c.ok(s.maxH === "none" && !s.v, `${key}: no nested vertical scroll`, JSON.stringify(s));
        if (expectHScroll) c.ok(s.h, `${key}: the table scrolls horizontally`);

        const pin = await page.eval(`(() => {
            const el = document.querySelector(".affixTableScroll");
            el.scrollLeft = 200;
            const left = el.getBoundingClientRect().left;
            return {scrolled: el.scrollLeft,
                td: el.querySelector("tbody td:first-child").getBoundingClientRect().left - left,
                th: el.querySelector("thead th:first-child").getBoundingClientRect().left - left};
        })()`);
        if (pin.scrolled > 0) c.ok(Math.abs(pin.td) < 1 && Math.abs(pin.th) < 1, `${key}: the first column stays pinned`, JSON.stringify(pin));
        await page.eval(`document.querySelector(".affixTableScroll").scrollLeft = 0`);

        c.ok(await page.eval(`document.querySelector(".affixPagerBottom").checkVisibility()`), `${key}: bottom pager shown`);
        await page.tap(".affixPagerBottom .affixPagerBtn", {text: "Next"});
        const info = await page.eval(`[...document.querySelectorAll(".affixPagerInfo")].map((e) => e.textContent.trim())`);
        c.ok(info.length === 2 && info.every((t) => t.startsWith("Page 2 /")), `${key}: bottom Next goes to page 2 (both pagers agree)`, JSON.stringify(info));
        // A short page can't scroll the table top all the way up; being at the page's end counts too.
        const t = await page.eval(`({
            top: document.querySelector(".affixTableWrapper").getBoundingClientRect().top - document.querySelector(".tabsPanel").getBoundingClientRect().bottom,
            atEnd: window.scrollY >= document.documentElement.scrollHeight - window.innerHeight - 1,
        })`);
        c.ok(t.top >= 0 && (t.top <= 8 || t.atEnd), `${key}: paging from the bottom scrolls back to the table top`, JSON.stringify(t));
        await page.tap(".affixPager:not(.affixPagerBottom) .affixPagerBtn", {text: "Prev"});
        c.ok((await page.eval(`document.querySelector(".affixPagerInfo").textContent.trim()`)).startsWith("Page 1 /"), `${key}: top Prev goes back`);
    };

    await page.mobile();
    await page.goto(`${BASE}#/affixes`);
    await page.waitFor(`!!document.querySelector(".affixTable tbody tr")`);
    c.ok(await page.eval(`!document.body.textContent.includes("not viewable on mobile")`), "Affixes renders a table on mobile");
    await tableChecks("affixes", {expectHScroll: true});

    await openTab(page, "corruptions");
    await page.waitFor(`!!document.querySelector(".affixTable tbody tr")`);
    await tableChecks("corruptions", {expectHScroll: false});

    await openTab(page, "dropcalc");
    await page.tap(".filtersPanel .selTrigger");
    await page.tap(".selOption", {text: "Misc item by name"});
    // Need at least two full pages, so page 2 is long enough to scroll the table top under the bar.
    let rows = 0;
    for (const code of ["r01", "r02", "r03", "r04", "r05", "r06"]) {
        await page.type(`input[placeholder^="Enter misc code"]`, code);
        await sleep(600); // past the 300ms debounce, so the calculation has started
        await page.waitFor(`![...document.querySelectorAll(".table-message")].some((td) => td.textContent.includes("Calculating"))`, 60000);
        rows = await page.eval(total);
        if (rows >= 100) break;
    }
    c.ok(rows >= 100, "dropcalc: a query with at least two full pages of results", `${rows} rows`);
    // Five columns at 390px may or may not overflow; the pin check runs whenever it does.
    if (rows >= 100) await tableChecks("dropcalc", {expectHScroll: false});
    c.ok(await page.eval(`(() => {
        const tr = document.createElement("tr");
        tr.innerHTML = '<td colspan="5">x</td>';
        document.querySelector(".affixTable tbody").prepend(tr);
        const pos = getComputedStyle(tr.firstChild).position;
        tr.remove();
        return pos === "static";
    })()`), "dropcalc: colSpan message rows aren't pinned");

    await page.desktop();
    await openTab(page, "affixes");
    await page.waitFor(`!!document.querySelector(".affixTable tbody tr")`);
    c.ok(await page.eval(`!document.querySelector(".affixPagerBottom").checkVisibility()
        && getComputedStyle(document.querySelector(".affixTableScroll")).maxHeight === "800px"`),
        "desktop: a single pager and the bounded table box, as before");
});
c.done();
```

- [ ] **Step 7: Run the checks, build, lint**

Run: `cd "$SCRATCH" && node check-tables.mjs && node check-affix-sort.mjs`. Expected: all `PASS`.
Run: `cd "$WT" && npm test && npm run build`, then the lint comparison. Expected: pass, success, no `>` lines.

- [ ] **Step 8: Commit**

```bash
cd "$WT" && git add src/App.jsx src/styles.css && git commit -m "Mobile: swipe tables with a pinned first column, Affixes table, bottom pagers"
```

---

### Task 8: Tap-to-toggle tooltips on touch screens

**Files:**
- Modify: `src/App.jsx`: `Tip` (~L652–666)
- Modify: `src/styles.css`: append a `@media (hover: none)` section
- Scratch: `$SCRATCH/check-tips.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: `.tipWrap.open` (set on tap, any device; only touch CSS shows it).

- [ ] **Step 1: `Tip`**

Replace `function Tip({text, children}) { … }` with:

```jsx
function Tip({text, children}) {
    const [open, setOpen] = React.useState(false);
    const wrapRef = React.useRef(null);

    // Touch screens show the bubble on tap (CSS keys off .open under hover: none). Any tap outside
    // closes it, so only one bubble is open at a time. In a sortable header, one tap also sorts.
    React.useEffect(() => {
        if (!open) return;

        function onPointerDown(e) {
            if (!wrapRef.current?.contains(e.target)) setOpen(false);
        }

        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [open]);

    if (!text) return children;

    const parts = String(text).split("\n");

    return (<span ref={wrapRef} className={"tipWrap" + (open ? " open" : "")} onClick={() => setOpen((o) => !o)}>
      {children}
        <span className="tipBubble" role="tooltip">
        {parts.map((line, i) => (<React.Fragment key={i}>
            {line}
            {i < parts.length - 1 ? <br/> : null}
        </React.Fragment>))}
      </span>
    </span>);
}
```

- [ ] **Step 2: CSS**

Append to `src/styles.css`:

```css
/* -------------------------------------------------------------------------- */
/* Mobile-friendly: Tip tooltips on touch screens (tap to toggle)              */
/* -------------------------------------------------------------------------- */

@media (hover: none) {
    /* Touch browsers keep :hover after a tap; let the .open state alone decide. */
    .tipWrap:hover .tipBubble {
        opacity: 0;
        transform: translateY(-2px);
    }

    /* A strip near the bottom of the viewport: never off-screen, never clipped by a swipe table. */
    .tipBubble {
        position: fixed;
        left: 8px;
        right: 8px;
        top: auto;
        bottom: 76px; /* clears the go-to-top button (top edge 54px up to 700px wide, 68px above) */
        min-width: 0;
        max-width: none;
        text-transform: none;
        letter-spacing: normal;
    }

    .tipBubble::before {
        display: none;
    }

    .tipWrap.open .tipBubble {
        opacity: 1;
        transform: translateY(0);
    }

    /* backdrop-filter would make thead the containing block of the fixed bubble. */
    .affixTable thead {
        backdrop-filter: none;
    }
}
```

- [ ] **Step 3: Write `$SCRATCH/check-tips.mjs`**

```js
import {run, checker, BASE, openTab, sleep} from "./cdp.mjs";

const c = checker();
const OPEN = `(() => {
    const open = [...document.querySelectorAll(".tipWrap.open")];
    if (open.length !== 1) return {count: open.length};
    const b = open[0].querySelector(".tipBubble");
    const r = b.getBoundingClientRect();
    return {count: 1, label: open[0].textContent, opacity: getComputedStyle(b).opacity,
        left: r.left, right: r.right, top: r.top, bottom: r.bottom};
})()`;
const onScreen = (t) => t.count === 1 && t.left >= 0 && t.right <= 390 && t.top >= 0 && t.bottom <= 844;

await run(async (page) => {
    await page.mobile();
    await page.goto(`${BASE}#/affixes`);
    await page.waitFor(`!!document.querySelector(".affixTable tbody tr")`);
    c.ok(await page.eval(`getComputedStyle(document.querySelector(".affixTable thead")).backdropFilter === "none"`), "touch: thead has no backdrop-filter");

    await page.tap(".affixTable thead .tipWrap", {text: "Max lvl"});
    await sleep(200);
    let t = await page.eval(OPEN);
    c.ok(t.count === 1 && t.label.startsWith("Max lvl") && t.opacity === "1", "tapping a header label opens its tooltip", JSON.stringify(t));
    c.ok(onScreen(t), "the tooltip strip is on-screen", JSON.stringify(t));
    c.ok(await page.eval(`!!document.querySelectorAll(".affixTable thead th")[6].querySelector(".sortArrow")`), "the same tap sorted by Max lvl");

    await page.tap(".affixTable thead .tipWrap", {text: "Freq"});
    t = await page.eval(OPEN);
    c.ok(t.count === 1 && t.label.startsWith("Freq"), "tapping another tooltip closes the first", JSON.stringify(t));

    await page.tap(".infoTitle");
    c.ok((await page.eval(OPEN)).count === 0, "tapping elsewhere closes the tooltip");

    await page.eval(`document.querySelector(".affixTableScroll").scrollLeft = 400`);
    await page.tap(".affixTable thead .tipWrap", {text: "Req lvl"});
    await sleep(200);
    t = await page.eval(OPEN);
    c.ok(onScreen(t), "a tooltip opened in a sideways-scrolled table is on-screen", JSON.stringify(t));
    await page.tap(".infoTitle");

    await openTab(page, "weapons");
    await page.tap(".list .row", {nth: 0});
    await page.tap(".rowDetail .tipWrap");
    await sleep(200);
    t = await page.eval(OPEN);
    c.ok(onScreen(t) && t.opacity === "1", "a tooltip inside an expanded row is on-screen", JSON.stringify(t));
    c.ok(await page.eval(`!!document.querySelector(".rowDetail")`), "and the row stays expanded");

    await page.desktop();
    await openTab(page, "affixes");
    await page.waitFor(`!!document.querySelector(".affixTable tbody tr")`);
    await page.hover(".affixTable thead .tipWrap", {text: "Max lvl"});
    c.ok(await page.eval(`(() => {
        const b = [...document.querySelectorAll(".affixTable thead .tipWrap")].find((w) => w.textContent.includes("Max lvl")).querySelector(".tipBubble");
        return getComputedStyle(b).position === "absolute" && getComputedStyle(b).opacity === "1";
    })()`), "desktop: hovering still shows the anchored bubble");
});
c.done();
```

- [ ] **Step 4: Run the checks, build, lint**

Run: `cd "$SCRATCH" && node check-tips.mjs && node check-list.mjs && node check-tables.mjs`. Expected: all `PASS`.
Run: `cd "$WT" && npm test && npm run build`, then the lint comparison. Expected: pass, success, no `>` lines.

- [ ] **Step 5: Commit**

```bash
cd "$WT" && git add src/App.jsx src/styles.css && git commit -m "Touch screens: tap to toggle tooltips, shown as an on-screen strip"
```

---

### Task 9: Overflow fixes: Drop calculator inputs, Skill calculators, footer, survey

**Files:**
- Modify: `src/App.jsx`: `DropCalculatorPanel`'s inline-styled row (~L2192–2240)
- Modify: `src/styles.css`: delete the "Mobile footer" section (~L2136–2162); append a Drop calculator / calculators section
- Scratch: `$SCRATCH/check-overflow-fixes.mjs`

**Interfaces:**
- Consumes: `SearchableSelect`'s existing `className` prop (it renders `selSearchWrap ${className}`).
- Produces: the classes `.dropCalcInputs`, `.dropCalcMode`, `.dropCalcDifficulty`, `.dropCalcPlayers`, `.dropCalcMf`.

- [ ] **Step 1: Drop calculator inline styles → classes**

In `DropCalculatorPanel`, change `<div style={{display: "flex", gap: 12, width: "100%"}}>` to `<div className="dropCalcInputs">`. On the three `SearchableSelect`s, replace `style={{flex: "0 0 260px"}}`, `style={{flex: "0 0 220px"}}` and `style={{flex: "0 0 180px"}}` with `className="dropCalcMode"`, `className="dropCalcDifficulty"` and `className="dropCalcPlayers"`. On the Magic Find `<input>`, change `className="searchBar"` to `className="searchBar dropCalcMf"` and delete its `style={{ flex: "0 0 160px", maxWidth: 160, height: 31 }}` prop.

- [ ] **Step 2: CSS**

Delete the whole "Mobile footer: always at the bottom of the screen" section at the end of the pre-existing CSS: the comment banner plus both `@media` blocks that set `.wrap { padding-bottom: 80px; }` and `.appRoot { padding-bottom: 0; }`. The footer isn't fixed, so that padding only left empty space. Then append:

```css
/* -------------------------------------------------------------------------- */
/* Mobile-friendly: Drop calculator inputs (were inline styles), calculators   */
/* -------------------------------------------------------------------------- */

.dropCalcInputs {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    width: 100%;
}

.dropCalcInputs .dropCalcMode {
    flex: 0 0 260px;
}

.dropCalcInputs .dropCalcDifficulty {
    flex: 0 0 220px;
}

.dropCalcInputs .dropCalcPlayers {
    flex: 0 0 180px;
}

/* input.dropCalcMf ties `.filtersPanel input[type="text"]` on specificity and wins by coming later. */
.dropCalcInputs input.dropCalcMf {
    flex: 0 0 160px;
    max-width: 160px;
    height: 31px;
}

@media (max-width: 980px) {
    .dropCalcInputs .selSearchWrap,
    .dropCalcInputs input.dropCalcMf {
        flex: 1 1 100%;
        max-width: none;
    }

    /* Skill calculators: the Reset button drops below the title instead of off-screen. */
    .infoHeader {
        flex-wrap: wrap;
    }
}
```

- [ ] **Step 3: Write `$SCRATCH/check-overflow-fixes.mjs`**

```js
import {run, checker, BASE, openTab, sleep} from "./cdp.mjs";

const c = checker();
const widths = `[".dropCalcMode", ".dropCalcDifficulty", ".dropCalcPlayers", ".dropCalcMf"]
    .map((s) => Math.round(document.querySelector(s).getBoundingClientRect().width))`;

await run(async (page) => {
    await page.mobile();
    await page.goto(`${BASE}#/dropcalc`);
    await page.waitFor(`!!document.querySelector(".dropCalcInputs")`);
    const m = await page.eval(`(() => {
        const row = document.querySelector(".dropCalcInputs").getBoundingClientRect();
        return {right: row.right, full: [...document.querySelectorAll(".dropCalcInputs > *")]
            .every((e) => Math.abs(e.getBoundingClientRect().width - row.width) < 1)};
    })()`);
    c.ok(m.right <= 390 && m.full, "dropcalc: inputs wrap, full width, inside the viewport", JSON.stringify(m));

    await openTab(page, "calculators");
    const calc = await page.eval(`[...document.querySelectorAll(".infoPanel")].filter((p) => p.querySelector(".filtersResetPanel")).map((p) => {
        const btn = p.querySelector(".filtersResetPanel .btn").getBoundingClientRect();
        const title = p.querySelector(".infoTitle").getBoundingClientRect();
        return {right: Math.round(btn.right), below: btn.top >= title.bottom - 1};
    })`);
    c.ok(calc.length > 0 && calc.every((b) => b.right <= 390 && b.below), "calculators: Reset buttons sit below the title, on-screen", JSON.stringify(calc));

    c.ok(await page.eval(`getComputedStyle(document.querySelector(".wrap")).paddingBottom !== "80px"`), "no 80px footer padding on mobile");

    await page.desktop();
    await openTab(page, "dropcalc");
    await sleep(300);
    c.ok(JSON.stringify(await page.eval(widths)) === JSON.stringify([260, 220, 180, 160]), "desktop: drop calculator input widths unchanged",
        JSON.stringify(await page.eval(widths)));
    await openTab(page, "calculators");
    c.ok(await page.eval(`[...document.querySelectorAll(".filtersResetPanel .btn")].every((b) => {
        const t = b.closest(".infoPanel").querySelector(".infoTitle").getBoundingClientRect();
        return b.getBoundingClientRect().top < t.bottom;
    })`), "desktop: Reset buttons stay beside the title");
});
c.done();
```

- [ ] **Step 4: Run the checks and the full mobile survey**

Run: `cd "$SCRATCH" && node check-overflow-fixes.mjs`. Expected: all `PASS`.
Run: `cd "$SCRATCH" && node survey.mjs`. Expected: every line `PASS`, ending in `all surveys pass`.

If an offender remains that none of this plan's fixes covers, investigate with superpowers:systematic-debugging, fix it with a rule inside a mobile media query (desktop untouched), and list it in the final report as an addition beyond the spec's enumerated fixes.

- [ ] **Step 5: Uniques SoE asterisk (spec §5: verify first)**

```bash
cd "$SCRATCH" && node --input-type=module -e '
import {run, BASE} from "./cdp.mjs";
await run(async (page) => {
    await page.mobile();
    await page.goto(`${BASE}#/uniques`);
    await page.waitFor(`document.querySelectorAll(".list .row").length > 5`);
    await page.tap(".filtersToggle");
    await page.tap(".filtersFold .toggleWrap", {text: "SoE exclusive"});
    await page.screenshot("shots/mobile/uniques-soe.png");
});'
```

Open `$SCRATCH/shots/mobile/uniques-soe.png` with the Read tool. Expected: long names are cut off inside their row, which is clipped by `.uniqueName { overflow: hidden }` within a `.meta { min-width: 0 }` box, and nothing extends past the screen edge. The survey ignores boxes clipped inside the row, but would flag anything cut off at the screen edge. **No change** unless the asterisk visibly escapes its row. If it does, fix it with a mobile-only rule and report it.

- [ ] **Step 6: Build, lint, commit**

Run: `cd "$WT" && npm test && npm run build`, then the lint comparison. Expected: pass, success, no `>` lines.

```bash
cd "$WT" && git add src/App.jsx src/styles.css && git commit -m "Mobile: fix Drop calculator and Skill calculator overflow, drop footer padding"
```

---

### Task 10: README and CLAUDE.md

**Files:**
- Modify: `README.md` (full rewrite), `CLAUDE.md`

**Interfaces:** none.

- [ ] **Step 1: Rewrite `README.md`**

Replace the whole file with:

````markdown
# The Archivist

A wiki for *Sanctuary of Exile*, a Project Diablo 2 mod: items, uniques, runewords, affixes, skills,
cube recipes, mapping, a drop calculator and more. It's a static single-page React app deployed to
GitHub Pages.

## Credit

This repository is a fork of [Lukaszpg/TheArchivistSoE](https://github.com/Lukaszpg/TheArchivistSoE).
The Archivist was created by MindH1ve ([@Lukaszpg](https://github.com/Lukaszpg)), as the site footer
also credits.

## Local development

Requires Node 22.12 or newer.

```
npm ci            # install dependencies
npm run dev       # dev server at http://localhost:5173/TheArchivistSoE/
npm run build     # production build to dist/
npm run lint      # ESLint
npm test          # unit tests (Vitest)
```
````

- [ ] **Step 2: Update `CLAUDE.md`**

Make these edits, keeping the file's voice:

- **Stack:** replace `- No router: the current tab is React state (\`tab\` in \`App\`).` with `- No router library: the current tab is React state (\`tab\` in \`App\`), kept in sync with the URL hash (\`#/<tabKey>\`) by \`useHashTab\` in \`src/hashTab.js\`.`. Replace the `- No test runner yet. Vitest is planned …` bullet with `- Vitest (dev dependency only) unit-tests the pure helper modules (\`src/*.test.js\`). Test files import \`describe\`/\`it\`/\`expect\` from \`vitest\` explicitly; ESLint has no Vitest globals.`
- **Commands:** add the line `npm test          # Vitest unit tests (vitest run)` after `npm run lint`. Change the `npm ci` comment from `(Node ≥ 20.19 for Vite 7)` to `(Node ≥ 22.12: Vitest 5; Vite 7 alone needs 20.19)`.
- **Layout:** add the bullet `- \`src/sortCompare.js\` (Affixes sort rules) and \`src/hashTab.js\` (tab ↔ URL hash): pure helpers, with their tests beside them.`
- **Tabs:** after the `TABS`/`mainKeys` bullets, add `- On mobile (≤980px) \`MobileTabsBar\` replaces \`TabsBar\`: a pinned top row with a menu button that opens a bottom sheet grouped by \`TAB_GROUPS\`. \`VALID_TAB_KEYS\` (the \`TAB_GROUPS\` keys plus \`changelog\`) is what the URL hash may name.` In the bullet about `tab` changing through many paths, append: `The URL-hash sync keys off \`tab\` too, so every path updates the URL.`
- **Affixes:** replace the `Sorting goes through the getValue switch …` bullet with `- Sorting goes through \`compareAffixes\` in \`src/sortCompare.js\`. Every sortable column needs an entry in \`AFFIX_SORT_KEYS\` and a case in \`affixSortValue\`. A unit test fails for a listed key with no case, and an unlisted key with no case throws on first sort rather than silently tying every row. Missing values sort lowest, except Max lvl, where null (no cap) sorts highest.` Add `- On mobile the three tables (Affixes, Corruptions, Drop calculator) scroll horizontally with a pinned first column, and get a second pager below the table.`
- **CSS gotchas:** append to the `.appRoot { overflow-x: hidden }` bullet: `On mobile it's overridden to \`overflow-x: clip\`, which is what lets the top row (\`.tabsPanel\`) stick.` Replace the `Tip` bullet's first sentence with `\`Tip\` (dotted-underline tooltips) shows on hover on desktop; under \`@media (hover: none)\` it toggles on tap (\`.tipWrap.open\`) and the bubble is a fixed strip near the bottom of the viewport.` and drop the now-false part about sticky hover and the bubble running off-screen. Append to the `.affixTable thead` bullet: `It's removed under \`hover: none\` so the fixed touch tooltip works.` Add `- On mobile, list rows expand in place (\`.rowDetail\` after the \`.row\`); lists and tables have no inner vertical scroll box. Rules that pin things use \`--topbar-h\` (mobile only) for \`scroll-margin-top\`.`
- **Verifying UI changes:** append: `On mobile the tab row is replaced by \`.tabMenuBtn\` and the sheet's \`.tabSheetItem\` buttons; setting \`location.hash = "#/<key>"\` switches tabs on any layout.`
- **Lint baseline:** re-run `npx eslint . 2>&1 | tail -1`. If the count changed from 14, update the numbers in the bullet.

- [ ] **Step 3: Commit**

```bash
cd "$WT" && git add README.md CLAUDE.md && git commit -m "README: describe the project and credit the original; update CLAUDE.md"
```

---

### Task 11: Full verification (spec §7)

**Files:** none (scratch only: `$SCRATCH/compare-desktop.mjs`, `$SCRATCH/diff-shots.mjs`).

- [ ] **Step 1: Tests, build, lint**

```bash
cd "$WT" && npm test && npm run build && npx eslint . -f json | node "$SCRATCH/lint-summary.mjs" | diff "$SCRATCH/lint-baseline.txt" -
```

Expected: both test files pass, the build succeeds, and no `>` lines.

- [ ] **Step 2: Every browser check, on a fresh dev server**

Restart the 5181 dev server (*Conventions*), then:

```bash
cd "$SCRATCH" && for s in check-affix-sort check-hash check-header check-filters check-list check-tables check-tips check-overflow-fixes survey; do echo "== $s"; node $s.mjs || echo "!! $s FAILED"; done
```

Expected: no `!!` lines. Read a sample of `shots/mobile/*.png` (weapons-row, affixes, dropcalc, calculators) with the Read tool to eyeball the result.

- [ ] **Step 3: Desktop baseline from `main`**

```bash
free -h
cd "$REPO" && git worktree add --detach .worktrees/main-baseline main && cd .worktrees/main-baseline && npm ci
nohup node node_modules/vite/bin/vite.js --port 5182 --strictPort > "$SCRATCH/vite-5182.log" 2>&1 &
echo $! > "$SCRATCH/vite-5182.pid"
curl -sf --retry 30 --retry-connrefused --retry-delay 1 -o /dev/null http://localhost:5182/TheArchivistSoE/ && echo up
```

Create `$SCRATCH/compare-desktop.mjs`:

```js
// Full-page 1500px screenshots of every tab: node compare-desktop.mjs <label> <url>
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

Create `$SCRATCH/diff-shots.mjs`:

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

- [ ] **Step 4: Screenshot both and compare**

```bash
cd "$SCRATCH" && node compare-desktop.mjs main http://localhost:5182/TheArchivistSoE/ && node compare-desktop.mjs branch http://localhost:5181/TheArchivistSoE/ && node diff-shots.mjs main branch
```

Expected: `diffPixels: 0` for every tab except `affixes.png`. Its expected differences are the Group column (from `affixes-group-column`) and the short labels with their dotted underline, Req lvl included. With the default Attributes sort, row order is unchanged. Open both `affixes.png` files with the Read tool and confirm those are the only differences. For any other non-zero tab, open both images, look at the `bbox` region, and treat any difference as a regression to fix (superpowers:systematic-debugging) before continuing. The URL hash doesn't appear in screenshots.

- [ ] **Step 5: Stop the check servers; remove the baseline worktree**

```bash
kill "$(cat "$SCRATCH/vite-5181.pid")" "$(cat "$SCRATCH/vite-5182.pid")"
cd "$REPO" && git worktree remove .worktrees/main-baseline
```

- [ ] **Step 6: Real-device check over Tailscale**

```bash
ip -4 addr show tailscale0 2>/dev/null | grep -o '100\.[0-9.]*' || echo "no tailscale0 interface"
```

Expected: `100.91.245.9`. If it differs, stop and ask the user which address to bind. Then bind to that address only, never `0.0.0.0` or the LAN:

```bash
cd "$WT" && nohup node node_modules/vite/bin/vite.js --host 100.91.245.9 --port 5179 --strictPort > "$SCRATCH/vite-5179.log" 2>&1 &
echo $! > "$SCRATCH/vite-5179.pid"
curl -sf --retry 30 --retry-connrefused --retry-delay 1 -o /dev/null http://100.91.245.9:5179/TheArchivistSoE/ && echo up
```

Give the user `http://100.91.245.9:5179/TheArchivistSoE/` with a short list of things to try: the menu sheet, expanding rows, jumping via a unique link, Affixes swipe and tooltips, Back, and the Drop calculator. Wait for their feedback. Fix anything they report, re-running the affected checks. Then `kill "$(cat "$SCRATCH/vite-5179.pid")"`.

---

### Task 12: Final code review, fixes, hand-back

**Files:** whatever the findings touch.

- [ ] **Step 1: Single-agent review at high effort**

Run `free -h` first. Dispatch **one** Agent with `model: "opus"` (Opus 5.5, the user's choice) and this prompt, adapted only if paths changed:

> You are reviewing the branch `mobile-friendly-impl` in the git worktree `/home/emanresu/TheArchivistSoE/.worktrees/mobile-friendly` (run all git commands there). Invoke the `code-review` skill at HIGH effort (not max) on the full branch diff of `mobile-friendly-impl` against `main`. The skill takes a branch as its target. Pass `high` plus the branch in whatever form it documents, then confirm that the diff it reviews is `git diff main...mobile-friendly-impl` and not something narrower (e.g. only uncommitted changes). You must work as a single agent: do not spawn subagents, Agent calls or Workflows, and don't split the review into parallel angles, even if the skill suggests it. Review the diff yourself. Context: the approved spec is `docs/superpowers/specs/2026-10-05-mobile-friendly-design.md`, the plan is `docs/superpowers/plans/2026-10-05-mobile-friendly.md`, and the repo's `CLAUDE.md` lists conventions and CSS gotchas. The lint baseline has 14 pre-existing problems in `src/App.jsx`. Don't modify files. Report verified findings ranked by severity.

Run `free -h` again after it returns.

- [ ] **Step 2: Address findings**

Use superpowers:receiving-code-review: verify each finding against the code before acting, fix the real ones (with a failing test first where a pure module is involved), and note any you reject with the reason. After the fixes, re-run Task 11 Steps 1–2. If a fix changes desktop rendering, also re-run Steps 3–5. If a fix changes the UI after the user's device check, offer them another look.

- [ ] **Step 3: Commit the fixes**

```bash
cd "$WT" && git add -A src README.md CLAUDE.md package.json package-lock.json && git commit -m "Address code review findings"
```

(Skip if there were no fixes.)

- [ ] **Step 4: Bring `mobile-friendly` up to date and clean up (local only)**

```bash
cd "$REPO" && git status --short && git merge --ff-only mobile-friendly-impl && git log --oneline -3
git worktree remove .worktrees/mobile-friendly && git branch -d mobile-friendly-impl
```

Expected: a fast-forward, `mobile-friendly` at the last commit, and the worktree gone. No push.

- [ ] **Step 5: Report to the user**

Report what changed (per task), the verification evidence (test, build and lint output, check-script PASS summaries, the survey result, the desktop diff table with the explained Affixes differences, and the device-check outcome), the review findings with what was fixed and what was rejected and why, and anything skipped. Use superpowers:verification-before-completion: every claim must cite command output from this session.
