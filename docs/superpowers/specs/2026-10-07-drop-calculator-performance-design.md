# Drop calculator performance — design

**Date:** 2026-10-07
**Branch:** to be created from `main` when implementation starts (manual worktree, `.worktrees/<name>`, suggested name `dropcalc-perf`)
**Status:** approved (2026-10-07), after an independent review; the "View drop rates" link fix was added at approval

## Intent

The Drop calculator freezes the page. One query ("Gnasher", Normal) blocked headless Chrome's main
thread for 14 s as a single long task. In Node, running the panel's own code on the real tables, a
Hell query takes about 55 s. Phones are several times slower than that. The calculator runs on every
pause in typing (300 ms debounce), so the page freezes again after each pause.

This is a fork-only change (not meant for upstream). The goal is a calculator that answers in well
under a second on a phone, with **exactly the same results as today**.

### Root cause (measured, see "Measurements")

- `byLower(ctx.treasure, "Treasure Class", name)` finds a treasure class by linearly scanning all
  1,814 `TreasureClassEx.txt` rows, trimming and lowercasing each name on the way. It runs once per
  node of the tree walk.
- `collectPaths` walks the whole treasure-class tree from each monster's root TC with no reuse: about
  516,000 nodes for a Hell query over about 920 monsters, though those monsters share only 128
  distinct root TCs. The walk depends only on the root TC, the target code and the player count,
  not on the monster's level.
- Together that is about 500 million string operations per Hell query, 97% of the run time.

Secondary costs: every input change re-downloads (`cache: "no-store"`, about 2 MB) and re-parses ten
tab-separated tables; `monsterLevelName` scans `Levels.txt` once per monster (about 0.3 s); and
nothing cancels a superseded run, so a slower older run can overwrite newer rows.

### Success criteria

- Every query returns the same rows as today's code: same monsters, areas, treasure classes and
  chances, compared exactly to full floating-point precision, in the same order.
- With the data loaded, every target (all 1,366 uniques, set items and misc codes), every difficulty
  and both modes stays within deterministic work ceilings (see Testing). Pass/fail never depends on
  the machine's speed. Timings are reported against a configurable budget (default 150 ms per query in
  Node, matched by the measurements below once the occurrence cache is in place).
- The calculator's data is downloaded once per mode per page load (about 74 KB gzipped instead of
  265 KB), and no `.txt` file is fetched at runtime.
- An older query's rows never replace a newer query's rows. During the 300 ms debounce the previous
  rows stay visible, as today.
- No visual change on any tab.
- Every unique card's "View drop rates" link opens the calculator on that exact unique: all 550
  linkable uniques in both modes (see "The View drop rates link").

### Constraints

- Plain JS, no new runtime dependencies. Lint 0 problems, no `eslint-disable`. React Compiler rules
  (no `setState` in effects, no ref reads during render).
- ESLint applies browser globals to every `.js`/`.jsx` file, `vite.config.js` included: Node-only code
  imports from `node:*` and uses no `process` global.
- New logic goes in small modules under `src/`, tests beside them (Vitest, explicit
  `describe`/`it`/`expect` imports).
- The upstream `.txt` tables stay where upstream puts them (`public/data/{standard,damnation}/`) and
  remain the only source of the calculator's data, so merging upstream data drops needs no extra step.

### Out of scope

- **Accuracy of the model.** All of today's formulas and quirks stay, so results stay identical:
  - only `TreasureClass1*` is used (no champion or unique monster TCs);
  - one area per monster (the first `Levels.txt` row listing it);
  - `players` doubles as the party size;
  - picks are capped at 6 and buckets are combined as independent;
  - quality bonuses take the maximum along the path;
  - the query is matched exactly first, then with `includes`.
- **The misc-mode rune bug.** `r01` returns no rows because the TCs drop rune stacks (`r01s`); a
  query for `r01s` works. It is a separate fix.
- **A calculate button.** Measured worst cases (below) stay fast enough to keep calculating while
  typing.
- A Web Worker, and precomputed per-item drop chances (both unnecessary at the measured speeds).
- Moving `DropCalculatorPanel` out of `App.jsx` (only its calculation moves out).

## Measurements

From a scratch harness that runs the panel's code extracted unchanged from `App.jsx` against
`public/data/standard`, with variants that patch single functions. All variants produced output that
was byte-identical to the original's.

| Variant (unique "The Gnasher", Hell, Node) | Total | Rows |
|---|---|---|
| Original code | 54,509 ms | 791 |
| + `Map` index for treasure-class lookups | 813 ms | 791 |
| + walk cached per root TC within the query | 541 ms | 791 |
| + monster → area map | 241 ms | 791 |

Of the last 241 ms, about 150 ms is loading and parsing the tables, which caching pays only once.
Sweep of every target with the tables preloaded (index, per-root cache and area map applied):

| Data, difficulty | Median | Slowest 10% from | Worst |
|---|---|---|---|
| Standard, Normal | 35 ms | 37 ms | 92 ms (The Gnasher) |
| Standard, Nightmare | 43 ms | 57 ms | 120 ms (Deathspade) |
| Standard, Hell | 56 ms | 74 ms | 147 ms (The Gnasher) |
| Damnation, Normal | 36 ms | 38 ms | 106 ms (The Gnasher) |
| Damnation, Nightmare | 44 ms | 59 ms | 113 ms (Deathspade) |
| Damnation, Hell | 64 ms | 84 ms | 159 ms (The Gnasher) |

The Gnasher is the first row of `UniqueItems.txt`, so its time includes JIT warm-up. The slowest
targets are low-level weapon uniques, whose bases sit in many automatic weapon TCs. Damnation Hell's
159 ms is over the 150 ms budget, so the design also caches the unique-occurrence weights per monster
level (see the engine section); about 30 ms of a Hell query went to recomputing them.

A JSON holding only the columns the calculator reads is about 550 KB per mode (74 KB gzipped). The
ten `.txt` tables are 1.95 MB (265 KB gzipped). Storing the same data as one keyed object per row
would be 1.35 MB (88 KB gzipped), so the JSON stores columns plus value arrays.

## Approaches considered

1. **Runtime fixes plus a JSON generated by a Vite plugin (chosen).** The runtime fixes do most of
   the work. The generated JSON cuts the first query's download and parsing. A plugin, unlike npm
   `predev`/`prebuild` scripts, runs under every Vite invocation (including bare `npx vite`) and can
   regenerate when a `.txt` changes in dev. The output is gitignored, so it can never go stale.
2. **Runtime fixes plus a committed JSON** checked by a staleness test. Rejected: the fork merges
   upstream data drops, and a generated file that cannot drift is less work than one that must be
   regenerated and committed.
3. **Runtime fixes only.** No generated files. About 99% of the gain, but every first query per mode
   still downloads 265 KB gzipped and parses tab-separated text.
4. **Precomputed drop chances** per item, monster and player count. Rejected: large files, hard to
   change when accuracy is revisited, and unnecessary at the measured speeds.

## Design

### Modules and data flow

```
public/data/<mode>/*.txt                   upstream tables, unchanged; still the only source
        │  Vite plugin "dropCalcData" (vite.config.js): file I/O only
        ▼
public/data/<mode>/DropCalculator.json     generated, gitignored
        │  fetched once per mode per page load, kept in a module-level cache
        ▼
src/dropCalcData.js     pure: DROP_CALC_COLUMNS, parseTxt, tablesToJson, jsonToTables
src/dropCalcEngine.js   pure: prepareModel(tables), calculateDrops(model, options, stats?)
src/dropCalcLoad.js     loadModel(damnationMode): fetch + jsonToTables + prepareModel, cached per mode
src/App.jsx             DropCalculatorPanel: UI state, inputs, table; no calculation code
```

### `src/dropCalcData.js` (pure; runs in Vite, Vitest and the browser)

- **`DROP_CALC_COLUMNS`:** for each of the ten tables, the columns the engine reads, each marked
  required or optional.
  - Optional: the fallbacks today's code already tolerates. `UniqueItems.item`, `SetItems.code` and
    `SetItems.enabled`, and `ItemTypes`'s lowercase `code`/`rarity` (the file has `Code`/`Rarity`).
    Misc mode never reads `lvl` or `index` from `Misc.txt`.
  - `ItemRatio` keeps every column (six rows).
  - The authoritative list is derived from the engine code during implementation. The unit tests and
    the golden snapshot catch a column that the engine reads but the list drops.
- **`parseTxt(text)`:** today's function moved unchanged. CRLF is normalised, blank lines dropped,
  headers trimmed, cells kept raw, a short row's missing cells become `""`, and the last duplicate
  header wins. Only `Armor.txt` has duplicate headers today (`mindam`, `maxdam`), and the engine reads
  neither.
- **`tablesToJson(texts)`:** `{version: 1, tables: {<name>: {columns: [...], rows: [[...], ...]}}}`,
  where `<name>` is the file name without `.txt`. Cell values are the exact strings `parseTxt`
  produces. A missing required column throws an error naming the table and the column, so an upstream
  rename fails the dev server or the build instead of yielding wrong numbers.
- **`jsonToTables(json)`:** rebuilds one object per row, keyed by column name. A column absent from
  the JSON is `undefined` on every row, as with today's parsed objects.

### The Vite plugin (in `vite.config.js`, about 25 lines)

- **`configResolved`** is the only place that generates at startup.
  - It does nothing when the mode is `test` (Vitest resolves the mode as `"test"`) or when
    `config.isPreview` is set (`vite preview` only serves `dist/`).
  - Otherwise, for `standard` and `damnation`, it reads the ten `.txt` files, calls `tablesToJson`,
    and writes minified `<config.publicDir>/data/<mode>/DropCalculator.json`.
  - **Why not `buildStart`:** the dev server takes its snapshot of `public/` files before
    `buildStart` runs (Vite `config.js` `initPublicFiles` at ~25365, `buildStart` at ~25632). A file
    first created in `buildStart` could 404 on a fresh clone. In `vite build`, `public/` is copied in
    `renderStart`, so either hook would do there.
  - CI and deploy (`npm ci` then `npm run build`) need no change.
- **`configureServer`:** a change to `public/data/<mode>/*.txt` regenerates that mode. The page then
  needs a reload, since the runtime cache lives for the page.
- **Only on change:** the JSON is written only when its content differs from the file on disk, so
  restarts don't touch it.
- **Errors:** a generator error fails the build. In dev it is logged to the terminal, and the previous
  JSON (if any) stays in place.
- **Config dependency:** `vite.config.js` imports `src/dropCalcData.js`, so editing that file restarts
  the dev server. CLAUDE.md says so.
- `.gitignore` gains `public/data/*/DropCalculator.json`.

### `src/dropCalcLoad.js`

- **`loadModel(damnationMode)`:** returns a promise of the prepared model for that mode, cached in a
  module-level `Map`.
  - It fetches `${import.meta.env.BASE_URL}data/<mode>/DropCalculator.json` with `cache: "no-store"`
    (the same freshness rule as `useJson`).
  - It throws `DropCalculator.json: HTTP <status>` on a response that isn't OK, and also throws on an
    unknown `version`.
  - A rejected promise is removed from the cache, but only if it is still the cached entry for that
    mode, so the next query retries.

### `src/dropCalcEngine.js`

- **`prepareModel(tables)`:** builds everything that doesn't depend on the query, once per mode.
  Every index keeps today's lookup rule exactly:
  - treasure class by trimmed, lowercased name, where the first row wins (today's `find`);
  - treasure classes by `group`, in file order, so the root-TC upgrade's stable sort resolves ties as
    today;
  - base item by trimmed code, first wins, over Weapons, then Armor, then Misc (today's `baseItems`
    order). **The empty code `""` is a key like any other.** 50 `UniqueItems` rows have an empty
    `code`: section headers like "Rings" and real items like "Gore Ripper". Today those targets resolve
    to Weapons' empty-code "Expansion" row and give an empty table, not an error, and that must stay
    so.
  - the set of exceptional and elite codes, and the automatic TCs (`buildAutoTcs`);
  - the monster → area map: for each monster id, the first `Levels.txt` row listing it in
    `mon1`…`mon10`;
  - the monster, unique, set, misc and ItemRatio rows.
- **`calculateDrops(model, {dropMode, query, difficulty, players, mf}, stats?)`:** the options arrive
  exactly as the panel holds them: `query` raw and untrimmed (the error messages interpolate it
  as-is), `players` and `mf` as strings (`num()` handles `""`). It returns the rows
  `{monsterId, monsterName, levelName, treasureClass, chance, oneIn, percent}`, sorted by chance as
  today.
  - An empty or whitespace-only query returns `[]`.
  - It throws today's messages: `Unique item not found: …`, `Set item not found: …`,
    `Misc code not found: …` and `Base item not found for code: …`.
  - **Walk cache:** keyed by the root TC name after the group upgrade (`getRootTc`'s result). The
    cached value is the walk's accumulator: its outcome groups of `{probability, ratios, picks}`, in
    insertion order. `finalQualityFactor` and the `none` product still run per monster, because they
    depend on the monster's level. The cache lives for one call. That is valid because the walk reads
    only the treasure classes, the automatic TCs, the target code and the player count, all fixed
    within a call, and nothing mutates the outcomes after the walk.
  - **Occurrence cache:** `qualityOccurrenceChance`'s result is cached per monster level for one call.
    It depends only on the source items, the target and the monster level. The filter and the sum keep
    today's order, so the value is identical.
  - Every formula, and the order in which floating-point values are accumulated, moves over unchanged:
    selection probabilities, `adjustedNoDrop`, picks, `mergeRatios`, `qualityChance`,
    `qualityOccurrenceChance`, `probabilityForPicks` and the final combination.
  - The optional `stats` object receives counters: `walkNodes` (calls into the walk), `walks` (root
    walks performed, i.e. cache misses) and `outcomes` (outcome-by-monster evaluations in the final
    combination). Without it nothing is counted.
  - The leftover `console.log("BASE DEBUG", …)` for targets containing "aldur" is removed.
- No further optimisation is planned. If the sweep (Testing, item 3) still warns on this machine, the
  measurements go back to the user before anything else is added.

### `DropCalculatorPanel` (in `App.jsx`)

- The state, inputs, table, pager, 300 ms debounce and effect dependencies stay as they are.
- **Warm-up:** an effect on `[damnationMode]` calls `loadModel(damnationMode)` and ignores its result
  and errors, so the download starts as soon as the tab opens or the mode changes. Errors surface on
  the next query.
- **Cancellation:** each run of the debounce effect gets a local `cancelled` flag, set by its cleanup.
  `calculateAll(isCancelled)` awaits `loadModel`. If cancelled by then, it returns without setting any
  state, whether the load succeeded or failed (the catch path checks too). Otherwise it calls
  `calculateDrops` and sets rows, error and loading, as today. No refs are involved.
- **Empty query:** clears `rows`, `error` and also `loading` (a cancelled run no longer clears it).
- Errors render as today, in the table's message row.

### The "View drop rates" link (pre-existing bug, fixed in this change)

- **Today:** `UniqueTooltip` (`src/App.jsx`, the `tooltip-link` under the drop info) calls
  `openDropCalculator(n(u?.displayName) || n(u?.index))`. The calculator matches the query against
  `UniqueItems.txt`'s `index`, the game's internal name, which often differs from the card's display
  name. Of the 550 non-hellforged uniques (the same counts in both modes):
  - 423 match exactly;
  - 107 show "Unique item not found": "Skull Splitter" is `Mindrend`, "Axe of Fechmar" is
    `Fechmars Axe`;
  - 20 silently show a different unique through the `includes` fallback: "Maelstrom" finds
    `Maelstromwrath`, "Death's Web" finds `Hellforged Death's Web`.
- **Fix:** the link passes `n(u?.index) || n(u?.displayName)`. `Uniques.json`'s `index` is the same
  internal name, and all 550 resolve exactly by it in both modes.
- **Accepted trade-off:** after following the link, the calculator's search box shows the internal
  name (for example "Mindrend" for Skull Splitter).
- The engine and the golden snapshot are unaffected: this changes only what the link sends.

## Testing and verification

### 1. Golden snapshot, captured from the original code before any refactoring

- The harness runs the original panel code, extracted from `App.jsx` at commit `c5070a9`, with a
  file-reading `fetch`, over a fixed query set once. It is slow, a few minutes. It is committed as
  `tools/checks/golden-dropcalc-legacy.mjs`, taking the `App.jsx` path as an argument (for example
  `git show c5070a9:src/App.jsx > /tmp/App.legacy.jsx`), so the snapshot can be audited or regenerated
  from the legacy code later.
- The query set is fixed in the implementation plan. It covers at least:
  - unique, set and misc modes;
  - all three difficulties;
  - a ring or amulet unique (Misc base), an exceptional or elite unique, and a bow unique;
  - an empty-code unique ("Gore Ripper") and a section-header query ("rings");
  - 8 players with 300 magic find;
  - one Damnation query;
  - a partial-text query;
  - a not-found query;
  - `r01s`.
- The result is written as a Vitest file snapshot, `src/__snapshots__/dropCalc.golden.txt`, in exactly
  the text format the test produces:
  - per query: its options and its row count (or its error message);
  - per row: `monsterId | monsterName | levelName | treasureClass | chance`, with `chance` printed at
    full precision (shortest round-trip form).
  - Target size: under about 300 KB. If larger, the plan trims the query set.
- `src/dropCalcEngine.test.js` reads the real `.txt` files with `node:fs` (paths from
  `import.meta.url`), runs `tablesToJson` then `jsonToTables`, `prepareModel` and `calculateDrops`, and
  matches the snapshot with `toMatchFileSnapshot`. This exercises the browser's path end to end.
- Later deliberate changes (an upstream data drop, an accuracy fix) appear as snapshot diffs and are
  accepted with `npx vitest -u`.

### 2. Unit tests

- **`src/dropCalcData.test.js`:**
  - `parseTxt`: CRLF, blank lines, short rows, the last duplicate header winning;
  - `tablesToJson`: a missing required column throws, naming table and column; a missing optional
    column comes back as `undefined`; converting to JSON and back gives the same rows as `parseTxt`,
    restricted to the kept columns.
- **Column coverage, in `src/dropCalcEngine.test.js`:** the golden query set runs once more over rows
  wrapped in a recording `Proxy`. The test asserts that every key the engine reads is listed in
  `DROP_CALC_COLUMNS` for that table. The golden snapshot alone can't catch a dropped column whose
  values happen not to change the queried results.
- **`src/dropCalcEngine.test.js`:** with small hand-built tables:
  - the treasure-class index keeps the first match;
  - the root-TC upgrade picks the highest eligible level, keeping file order on ties;
  - the error messages;
  - an empty query returns `[]`;
  - `oneIn` and `percent` are derived from `chance`;
  - with `stats`, a second monster with the same root TC adds no walk;
  - an empty-code target returns `[]` without an error;
  - every non-hidden, non-hellforged unique in `Uniques.json` (the standard and Damnation copies)
    resolves exactly by its `index` against that mode's `UniqueItems.txt`, which guards the link
    against upstream data drift.
- **`src/dropCalcLoad.test.js`:** with a mocked `fetch`, and a fresh module per test
  (`vi.resetModules()` plus a dynamic `import`, so no test-only export is needed):
  - one fetch per mode across calls;
  - a failed load is retried on the next call, and evicting it doesn't remove a newer entry;
  - an unknown `version` is rejected;
  - the HTTP error message.

### 3. Committed checks in `tools/checks/`

- **`bench-dropcalc.mjs`:** imports `src/dropCalcData.js` and `src/dropCalcEngine.js` directly in Node.
  - It builds the model for each mode from the `.txt` files and does an untimed warm-up pass over a
    few targets. It then runs every target in every difficulty, with `stats`.
  - It prints the median, the start of the slowest 10%, and the worst time and node count per mode and
    difficulty.
  - **FAIL** (machine-independent): any target whose `walkNodes` or `outcomes` exceeds its ceiling.
    Each ceiling is the measured maximum across the sweep plus 25%, rounded and written into the script
    with a comment giving the measured value. Today's code walks about 516,000 nodes for Gnasher in
    Hell; with the per-root cache, about 56,000.
  - **WARN** (machine-dependent): any target slower than `DROPCALC_BUDGET_MS`, default 150. Warnings
    never fail the run.
- **`check-dropcalc.mjs`:** in headless Chromium through `cdp.mjs`, against a dev server (`APP_URL`).
  - Desktop, failing on these structural facts:
    - a query shows the expected row count;
    - three queries in a row fetch `DropCalculator.json` once and no `.txt` file;
    - the Damnation toggle fetches the Damnation file once;
    - typing query A, then query B before A finishes, leaves B's rows. Once the model is cached the
      calculation is synchronous, so A could never still be running. This check therefore runs on a
      cold page, with `DropCalculator.json`'s response held back through CDP `Fetch` interception until
      both queries have been typed.
  - Clicking "View drop rates" on the Skull Splitter card opens the calculator with the query
    `Mindrend` and rows, not "Unique item not found".
  - Reported, WARN only: the longest main-thread task, against `DROPCALC_DESKTOP_TASK_MS` (default 300).
  - Phone (390×844, touch, CPU throttled 4×): reports the longest task for the slowest target from the
    sweep, WARN above `DROPCALC_PHONE_TASK_MS` (default 1000).
- **Desktop screenshots:** `compare-desktop.mjs` before and after, then `diff-shots.mjs`. No
  differences are expected on any tab.

### 4. Gates

- `npm run lint` reports 0 problems, `npm test` passes, and `npm run build` succeeds.
- `dist/data/{standard,damnation}/DropCalculator.json` exist after the build.
- In dev, touching a `.txt` file regenerates its mode's JSON.

## Documentation

- **CLAUDE.md:**
  - Layout: `src/dropCalcData.js`, `src/dropCalcEngine.js`, `src/dropCalcLoad.js` and their tests.
  - The Vite plugin, and the generated, gitignored `DropCalculator.json` (generated in
    `configResolved`; editing `src/dropCalcData.js` restarts the dev server).
  - Data: Damnation mode swaps the Drop calculator's `DropCalculator.json`, not its `.txt` folder.
  - The new checks, `bench-dropcalc.mjs`, `check-dropcalc.mjs` and `golden-dropcalc-legacy.mjs`, with
    their environment variables.
- **Memory notes:** update `drop-calculator-slow` and `preexisting-app-bugs` at the end.
