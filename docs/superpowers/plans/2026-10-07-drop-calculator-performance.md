# Drop Calculator Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Drop calculator answer in well under a second on a phone (today: 14–55 s of frozen page), with exactly the same results. Also make the unique cards' "View drop rates" link open the right unique, and list the tier filter as Normal, Exceptional, Elite.

**Architecture:**
- The calculator's maths moves out of `App.jsx` into pure modules: `src/dropCalcData.js` (table parsing and column lists) and `src/dropCalcEngine.js` (indexed lookups, one tree walk per root treasure class per query).
- A Vite plugin turns the `.txt` game tables into a gitignored `DropCalculator.json` per mode. `src/dropCalcLoad.js` fetches it once per mode.
- The panel keeps only UI state, discards stale runs, and starts the download when the tab opens.
- A golden snapshot captured from the legacy code proves the results are identical.

**Tech Stack:** React 19, Vite 7.3, plain JS/JSX, Vitest 5 (dev only), headless Chromium over CDP for UI checks.

**Spec:** `docs/superpowers/specs/2026-10-07-drop-calculator-performance-design.md` (read it before starting; this plan argues from it).

## Global Constraints

- **Language and dependencies:** plain JavaScript (no TypeScript), no new runtime dependencies (only `react` and `react-dom`).
- **Lint:** `npm run lint` must report **0 problems** (CI enforces `LINT_BASELINE: 0`). No `eslint-disable`.
  - ESLint gives every `.js`/`.jsx` file browser globals, `vite.config.js` included: Node code imports from `node:*` and never uses the `process` global.
  - The `tools/checks/*.mjs` files sit outside the lint block.
- **React Compiler rules** are active on `App`: no `setState` in effects, no ref reads during render.
- **Tests:** test files import `describe`/`it`/`expect` (and `vi`, `afterEach`) from `"vitest"` explicitly.
- **Results must be identical:** every query returns the same rows as the legacy code, compared exactly. Keep every legacy formula, quirk and floating-point accumulation order. Don't "fix" anything the spec lists as out of scope:
  - `TreasureClass1` only;
  - one area per monster;
  - `players` doubles as the party size;
  - the 6-pick cap;
  - maximum quality bonuses along the path;
  - `includes` matching;
  - the `r01` rune-stack bug.
- **Generated file:** `public/data/<mode>/DropCalculator.json` is generated and gitignored. It is never committed.
- **Node-only module:** `src/dropCalcFixtures.js` reads files with `node:fs`. Only tests and `tools/checks/` import it, never the app.
- **Worktree:** work in a manual worktree: `git worktree add .worktrees/dropcalc-perf -b dropcalc-perf main`.
  - **Never use the EnterWorktree tool.**
  - Commit on the branch. Don't push, open PRs or merge.
  - Commit messages are plain, with no attribution lines.
- **Node:** Node is not on the Bash tool's PATH. Prefix commands with `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" &&` (check `ls ~/.nvm/versions/node` first).
- **Dev servers:**
  - Start: `cd` as its own statement, then `nohup env npm_package_version=1.2.1 node node_modules/vite/bin/vite.js --port <p> --strictPort > $SCRATCH/vite-<p>.log 2>&1 &` and `echo $! > $SCRATCH/vite-<p>.pid`.
  - Stop: `kill "$(cat $SCRATCH/vite-<p>.pid)"`.
  - **Never `pkill -f` / `pgrep -f`.** The pattern matches the calling shell's own command line and kills it.
- **Memory** is constrained (WSL): run `free -h` before and after heavy work. If `available` drops below ~1.5 GB, tell the user.
- **`$SCRATCH`** means your session's scratchpad directory. Paths below are relative to the worktree, `/home/emanresu/TheArchivistSoE/.worktrees/dropcalc-perf`, unless absolute.
- **Fixing a check:** if a check script itself turns out wrong, fix it and commit the fix with a message that says so.

## Review Focus

Five inputs or conditions the spec implies that its listed tests don't exercise, most likely to bite first. Each one has a test added to the owning task.

1. **Clearing the search box while the data is still downloading.** Expected: the "Calculating..." row goes away and the table is empty; it doesn't stay stuck. *Pinned in Task 6:* the browser check "clear while loading".
2. **Switching Damnation while the other mode's data is still downloading.** Expected: the older mode's rows never replace the newer mode's. *Pinned in Task 6:* the browser check "race".
3. **A fresh clone's first dev-server start, with no generated JSON on disk.** Expected: the very first request for `DropCalculator.json` succeeds, with no 404 until a restart. *Pinned in Task 5:* delete the JSON, start the server, fetch it at once.
4. **An upstream data drop that renames a column the calculator needs.** Expected: `npm run build` fails with the table and column named, while the dev server keeps running and logs it. *Pinned in Task 2* (unit test) *and Task 5* (a build with a temporarily broken header).
5. **The data download failing (a 404, or offline).** Expected: the error row shows `DropCalculator.json: HTTP 404`, and the next query tries again instead of failing for the rest of the session. *Pinned in Task 4:* the loader's retry test.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/dropCalcData.js` | Create | `DROP_CALC_FILE`, `DROP_CALC_VERSION`, `DROP_CALC_COLUMNS`, `DROP_CALC_TABLES`, `parseTxt`, `tablesToJson`, `jsonToTables` (pure) |
| `src/dropCalcEngine.js` | Create | `prepareModel`, `calculateDrops` (pure) |
| `src/dropCalcLoad.js` | Create | `loadModel` (fetch + per-mode cache) |
| `src/dropCalcFixtures.js` | Create | Node-only: `GOLDEN_QUERIES`, `formatGolden`, `readDropCalcTexts`, `loadDropCalcTables`, `loadDropCalcModel`, `readUniquesJson` |
| `src/dropCalcData.test.js`, `src/dropCalcEngine.test.js`, `src/dropCalcLoad.test.js` | Create | Tests |
| `src/__snapshots__/dropCalc.golden.txt` | Create | Golden snapshot, captured from the legacy code |
| `vite.config.js` | Modify | The `drop-calc-data` plugin |
| `.gitignore` | Modify | `public/data/*/DropCalculator.json` |
| `src/App.jsx` | Modify | `DropCalculatorPanel` (~lines 1407–2160), the `UniqueTooltip` link (~line 3141), the `tierOptions` memo (~line 3551) |
| `tools/checks/golden-dropcalc-legacy.mjs` | Create | Captures the golden snapshot from a legacy `App.jsx` |
| `tools/checks/check-dropcalc.mjs` | Create | Browser check |
| `tools/checks/bench-dropcalc.mjs` | Create | Sweep of every target, with work ceilings |
| `src/tiers.js`, `src/tiers.test.js` | Create | `TIER_ORDER`, `sortTiers` (pure) and its tests |
| `tools/checks/check-tier-order.mjs` | Create | Browser check of the tier filter's order |
| `CLAUDE.md` | Modify | Layout, Data, harness |

Line numbers are from `main` at `868ca33` and drift; search for the quoted code.

---

### Task 1: Worktree, golden query set, and the legacy snapshot

**Files:**
- Create: `src/dropCalcFixtures.js`
- Create: `tools/checks/golden-dropcalc-legacy.mjs`
- Create: `src/__snapshots__/dropCalc.golden.txt` (generated by the script, then committed)

**Interfaces:**
- Produces, in `src/dropCalcFixtures.js`:
  - `GOLDEN_QUERIES`: an array of `{damnation: boolean, dropMode: "unique"|"set"|"misc", query: string, difficulty: ""|"N"|"H", players: string, mf: string}`.
  - `formatGolden(entries)`: takes `[{q, rows} | {q, error}]` and returns a string, one block per entry, ending with `"\n"`.

- [ ] **Step 1: Create the worktree and install**

```bash
cd /home/emanresu/TheArchivistSoE
git worktree add .worktrees/dropcalc-perf -b dropcalc-perf main
cd .worktrees/dropcalc-perf
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npm ci
```

- [ ] **Step 2: Create `src/dropCalcFixtures.js`**

```js
// Node-only helpers for the Drop calculator's tests and tools/checks scripts. Later parts read files
// with node:fs, so the app must never import this module.

const golden = (dropMode, query, difficulty, {players = "1", mf = "", damnation = false} = {}) => (
    {damnation, dropMode, query, difficulty, players, mf}
);

// The golden snapshot's queries: captured once from the legacy code (golden-dropcalc-legacy.mjs) and
// matched exactly by the new engine (dropCalcEngine.test.js). About 290 KB of output.
export const GOLDEN_QUERIES = [
    golden("unique", "The Gnasher", "H"), // low-level axe: the most rows
    golden("unique", "Windforce", "H", {players: "8", mf: "300"}), // elite bow, 8 players, magic find
    golden("unique", "Harlequin Crest", "N"), // exceptional base
    golden("unique", "Nagelring", "H"), // ring: a Misc base
    golden("unique", "Gore Ripper", "H"), // empty code: an empty table, no error
    golden("unique", "rings", "H"), // a section-header row: an empty table
    golden("unique", "zzzz", "H"), // not found
    golden("unique", "", "H"), // empty query
    golden("set", "aldur", "N", {mf: "300"}), // partial name (includes match)
    golden("misc", "gld", ""), // misc mode, Normal
    golden("misc", "r01", "H"), // the rune-stack bug: TCs drop r01s, so no rows
    golden("unique", "Tyrael's Might", "H", {damnation: true}), // Damnation's tables
];

function formatGoldenEntry({q, rows, error}) {
    const head = `## ${q.damnation ? "damnation" : "standard"} ${q.dropMode} ${JSON.stringify(q.query)}`
        + ` difficulty=${JSON.stringify(q.difficulty)} players=${q.players} mf=${JSON.stringify(q.mf)}`;
    if (error) return `${head} -> error: ${error}`;
    return [
        `${head} -> ${rows.length} rows`,
        ...rows.map((r) => [r.monsterId, r.monsterName, r.levelName, r.treasureClass, String(r.chance)].join(" | ")),
    ].join("\n");
}

// One block per query. String(chance) is the shortest round-trip form, so equal text means equal numbers.
export function formatGolden(entries) {
    return entries.map(formatGoldenEntry).join("\n\n") + "\n";
}
```

- [ ] **Step 3: Create `tools/checks/golden-dropcalc-legacy.mjs`**

```js
// Captures the golden snapshot from the legacy Drop calculator: DropCalculatorPanel's helpers and
// calculateAll, extracted verbatim from an App.jsx, run in Node over the real tables.
// node golden-dropcalc-legacy.mjs <legacy App.jsx> <out.txt>
// The legacy code: git show c5070a9:src/App.jsx > <file>. Slow: about 55 s per Hell query, ~9 min in all.
import {readFileSync, writeFileSync} from "node:fs";
import {GOLDEN_QUERIES, formatGolden} from "../../src/dropCalcFixtures.js";

const [appPath, outPath] = process.argv.slice(2);
if (!appPath || !outPath) throw new Error("usage: node golden-dropcalc-legacy.mjs <legacy App.jsx> <out.txt>");
const DATA = new URL("../../public/data/", import.meta.url);

const src = readFileSync(appPath, "utf8").split("\n");
const panel = src.findIndex((l) => l.startsWith("function DropCalculatorPanel"));
const start = src.findIndex((l, i) => i > panel && l.includes("const n = (v) =>"));
const end = src.findIndex((l, i) => i > start && l.startsWith("    const pageRows ="));
if (panel < 0 || start < 0 || end < 0) throw new Error(`DropCalculatorPanel's code not found in ${appPath}`);
const body = src.slice(start, end).join("\n").replace("import.meta.env.BASE_URL", '""');
const makeCalculateAll = new Function("query", "dropMode", "difficulty", "players", "mf", "damnationMode",
    "setRows", "setError", "setLoading", `${body}\nreturn calculateAll;`);

// The legacy loadTxt fetches "data/<mode>/<file>.txt"; serve it from the repo.
globalThis.fetch = async (url) => {
    const [mode, file] = url.split("/").slice(-2);
    return {ok: true, text: async () => readFileSync(new URL(`${mode}/${file}`, DATA), "utf8")};
};
console.log = () => {}; // the legacy code logs "BASE DEBUG" for Aldur targets

const entries = [];
for (const q of GOLDEN_QUERIES) {
    let rows = [];
    let error = "";
    const t = performance.now();
    await makeCalculateAll(q.query, q.dropMode, q.difficulty, q.players, q.mf, q.damnation,
        (r) => { rows = r; }, (e) => { error = e; }, () => {})();
    entries.push(error ? {q, error} : {q, rows});
    process.stderr.write(`${JSON.stringify(q)}: ${error || `${rows.length} rows`} (${Math.round((performance.now() - t) / 1000)} s)\n`);
}
writeFileSync(outPath, formatGolden(entries));
process.stderr.write(`wrote ${outPath}\n`);
```

- [ ] **Step 4: Extract the legacy `App.jsx`**

```bash
git diff --stat c5070a9 HEAD -- src/App.jsx   # expect no output: App.jsx unchanged since c5070a9
git show c5070a9:src/App.jsx > $SCRATCH/App.legacy.jsx
```

- [ ] **Step 5: Capture the snapshot (about 9 minutes)**

Run it with the Bash tool's `run_in_background: true`; you're notified when it exits:

```bash
cd /home/emanresu/TheArchivistSoE/.worktrees/dropcalc-perf
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && mkdir -p src/__snapshots__ && node tools/checks/golden-dropcalc-legacy.mjs $SCRATCH/App.legacy.jsx src/__snapshots__/dropCalc.golden.txt 2> $SCRATCH/golden.log
```

Expected `$SCRATCH/golden.log`, in order. These were measured with the legacy harness while writing the spec.

| Query | Expected |
|---|---|
| The Gnasher H | 791 rows |
| Windforce H | 465 rows |
| Harlequin Crest N | 3 rows |
| Nagelring H | 870 rows |
| Gore Ripper | 0 rows |
| rings | 0 rows |
| zzzz | `Unique item not found: zzzz` |
| empty query | 0 rows |
| aldur | 618 rows |
| gld | 739 rows |
| r01 | 0 rows |
| Tyrael's Might (Damnation) | 250 rows |
| last line | `wrote …` |

Then check the size: `wc -c src/__snapshots__/dropCalc.golden.txt` should be about 290,000–310,000 bytes. If any count differs, **stop and report**: the data or the extraction changed, and the snapshot would be wrong.

- [ ] **Step 6: Lint and commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npm run lint
git add src/dropCalcFixtures.js tools/checks/golden-dropcalc-legacy.mjs src/__snapshots__/dropCalc.golden.txt
git commit -m "Drop calculator: golden query set and snapshot captured from the legacy code (c5070a9)"
```

Expected: lint reports 0 problems.

---

### Task 2: `src/dropCalcData.js`, the column lists and the JSON format

**Files:**
- Create: `src/dropCalcData.js`
- Modify: `src/dropCalcFixtures.js` (add `readDropCalcTexts`, `loadDropCalcTables`)
- Test: `src/dropCalcData.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces, in `src/dropCalcData.js`:
  - `DROP_CALC_FILE = "DropCalculator.json"`, `DROP_CALC_VERSION = 1`.
  - `DROP_CALC_COLUMNS`: `{[table]: {required: string[], optional?: string[]} | {all: true}}`.
  - `DROP_CALC_TABLES`: its keys, in order: `MonStats, TreasureClassEx, Weapons, Armor, Misc, UniqueItems, SetItems, ItemRatio, ItemTypes, Levels`.
  - `parseTxt(text)`: an array of row objects.
  - `tablesToJson(texts)`: takes `{[table]: string}` and returns `{version, tables: {[table]: {columns: string[], rows: string[][]}}}`. It throws on a missing required column.
  - `jsonToTables(json)`: returns `{[table]: rowObject[]}`. It throws on an unknown version or a missing table.
- Produces, in `src/dropCalcFixtures.js`:
  - `readDropCalcTexts(mode)`: `{[table]: string}` for `"standard"` or `"damnation"`.
  - `loadDropCalcTables(mode)`: the browser's path, `.txt` → `tablesToJson` → JSON text → `jsonToTables`.

- [ ] **Step 1: Write the failing tests, `src/dropCalcData.test.js`**

```js
import {describe, expect, it} from "vitest";
import {
    DROP_CALC_COLUMNS, DROP_CALC_FILE, DROP_CALC_TABLES, DROP_CALC_VERSION, jsonToTables, parseTxt, tablesToJson,
} from "./dropCalcData.js";
import {readDropCalcTexts} from "./dropCalcFixtures.js";

// One header line with every listed column, and one row.
function minimalTexts() {
    return Object.fromEntries(DROP_CALC_TABLES.map((name) => {
        const spec = DROP_CALC_COLUMNS[name];
        const columns = spec.all ? ["Version", "Unique"] : [...spec.required, ...(spec.optional ?? [])];
        return [name, `${columns.join("\t")}\n${columns.map((c, i) => `${name}-${i}`).join("\t")}\n`];
    }));
}

describe("parseTxt", () => {
    it("normalises CRLF, drops blank lines, trims headers and keeps cells raw", () => {
        expect(parseTxt(" a \tb\r\n\r\n x \t\r\n")).toEqual([{a: " x ", b: ""}]);
    });

    it("fills a short row's missing cells with an empty string", () => {
        expect(parseTxt("a\tb\tc\n1\n")).toEqual([{a: "1", b: "", c: ""}]);
    });

    it("lets the last of two same-named headers win", () => {
        expect(parseTxt("a\tb\ta\n1\t2\t3")).toEqual([{a: "3", b: "2"}]);
    });
});

describe("tablesToJson / jsonToTables", () => {
    it("lists the ten tables in a fixed order", () => {
        expect(DROP_CALC_TABLES).toEqual(["MonStats", "TreasureClassEx", "Weapons", "Armor", "Misc", "UniqueItems",
            "SetItems", "ItemRatio", "ItemTypes", "Levels"]);
    });

    it("throws on a missing required column, naming the table and the column", () => {
        const texts = minimalTexts();
        texts.Levels = texts.Levels.replace("LevelName", "Name");
        expect(() => tablesToJson(texts)).toThrow('Levels.txt: missing required column(s) "LevelName"');
    });

    it("throws on a missing table", () => {
        const texts = minimalTexts();
        delete texts.Misc;
        expect(() => tablesToJson(texts)).toThrow("Misc.txt: missing");
    });

    it("drops an absent optional column, so rows read it as undefined", () => {
        const texts = minimalTexts();
        texts.SetItems = "index\titem\tlvl\trarity\nSet A\tabc\t5\t3\n";
        const rows = jsonToTables(tablesToJson(texts)).SetItems;
        expect(rows).toEqual([{index: "Set A", item: "abc", lvl: "5", rarity: "3"}]);
        expect(rows[0].code).toBeUndefined();
    });

    it("keeps only the listed columns, and every ItemRatio column", () => {
        const texts = minimalTexts();
        texts.MonStats = texts.MonStats.replace("\n", "\tExtra\n");
        const json = tablesToJson(texts);
        expect(json.version).toBe(DROP_CALC_VERSION);
        expect(json.tables.MonStats.columns).toEqual(DROP_CALC_COLUMNS.MonStats.required);
        expect(json.tables.ItemRatio.columns).toEqual(["Version", "Unique"]);
    });

    it("rejects an unknown version", () => {
        expect(() => jsonToTables({version: 2, tables: {}})).toThrow(`${DROP_CALC_FILE}: unsupported version 2`);
    });

    it("round-trips the real tables to the same rows as parseTxt, restricted to the kept columns", () => {
        for (const mode of ["standard", "damnation"]) {
            const texts = readDropCalcTexts(mode);
            const json = JSON.parse(JSON.stringify(tablesToJson(texts)));
            const tables = jsonToTables(json);
            for (const name of DROP_CALC_TABLES) {
                const kept = json.tables[name].columns;
                const expected = parseTxt(texts[name]).map((row) => Object.fromEntries(kept.map((c) => [c, row[c]])));
                expect(tables[name], `${mode} ${name}`).toEqual(expected);
            }
        }
    });
});
```

- [ ] **Step 2: Add the file readers to `src/dropCalcFixtures.js`**

Add at the top, below the header comment:

```js
import {readFileSync} from "node:fs";
import {DROP_CALC_TABLES, jsonToTables, tablesToJson} from "./dropCalcData.js";

const DATA = new URL("../public/data/", import.meta.url);
```

Append at the end:

```js
// The ten .txt tables of one mode ("standard" or "damnation"), keyed by table name.
export function readDropCalcTexts(mode) {
    return Object.fromEntries(DROP_CALC_TABLES.map((name) => [
        name, readFileSync(new URL(`${mode}/${name}.txt`, DATA), "utf8"),
    ]));
}

// The browser's path: .txt -> DropCalculator.json (through JSON text) -> row objects.
export function loadDropCalcTables(mode) {
    return jsonToTables(JSON.parse(JSON.stringify(tablesToJson(readDropCalcTexts(mode)))));
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npx vitest run src/dropCalcData.test.js`
Expected: FAIL. It can't resolve `./dropCalcData.js`.

- [ ] **Step 4: Create `src/dropCalcData.js`**

```js
// The Drop calculator's data: the ten game tables it reads, cut down to the columns it uses. Pure, so
// it runs in Vite, Vitest and the browser: the drop-calc-data plugin (vite.config.js) turns the .txt
// tables into DropCalculator.json with tablesToJson, and the browser turns that back into row
// objects with jsonToTables.

export const DROP_CALC_FILE = "DropCalculator.json";
export const DROP_CALC_VERSION = 1;

const BASE_ITEM_COLUMNS = ["code", "spawnable", "level", "type", "rarity", "normcode", "ubercode", "ultracode"];
const numbered = (prefix) => Array.from({length: 10}, (_, i) => `${prefix}${i + 1}`);

// Per table, the columns dropCalcEngine.js reads (dropCalcEngine.test.js checks that it reads no
// others). A missing required column is an error. An optional one is a fallback the engine already
// tolerates: SetItems has no "code" (rowItemCode falls back to "item"), and ItemTypes spells its
// columns "Code"/"Rarity". ItemRatio (six rows) keeps every column.
export const DROP_CALC_COLUMNS = {
    MonStats: {required: ["Id", "NameStr", "TreasureClass1", "TreasureClass1(N)", "TreasureClass1(H)", "Level", "Level(N)", "Level(H)"]},
    TreasureClassEx: {required: ["Treasure Class", "group", "level", "Picks", "NoDrop", "Unique", "Set", "Rare", "Magic",
        ...numbered("Item"), ...numbered("Prob")]},
    Weapons: {required: [...BASE_ITEM_COLUMNS, "type2"]},
    Armor: {required: BASE_ITEM_COLUMNS},
    Misc: {required: ["code", "level", "normcode", "ubercode", "ultracode"]},
    UniqueItems: {required: ["index", "code", "lvl", "rarity", "enabled"], optional: ["item"]},
    SetItems: {required: ["index", "item", "lvl", "rarity"], optional: ["code", "enabled"]},
    ItemRatio: {all: true},
    ItemTypes: {required: ["Code", "Rarity"], optional: ["code", "rarity"]},
    Levels: {required: ["LevelName", ...numbered("mon")]},
};

export const DROP_CALC_TABLES = Object.keys(DROP_CALC_COLUMNS);

// A tab-separated game table as row objects: CRLF normalised, blank lines dropped, headers trimmed,
// cells kept raw, a short row's missing cells "", and the last of two same-named headers wins.
export function parseTxt(text) {
    const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim() !== "");
    const headers = lines[0].split("\t").map((h) => h.trim());

    return lines.slice(1).map((line) => {
        const cols = line.split("\t");
        const row = {};
        headers.forEach((h, i) => {
            row[h] = cols[i] ?? "";
        });
        return row;
    });
}

function txtHeaders(text) {
    const first = text.replace(/\r\n/g, "\n").split("\n").find((l) => l.trim() !== "");
    return first === undefined ? [] : first.split("\t").map((h) => h.trim());
}

// texts: {[table]: the .txt file's content}. Values are exactly the strings parseTxt produces.
export function tablesToJson(texts) {
    const tables = {};

    for (const [name, spec] of Object.entries(DROP_CALC_COLUMNS)) {
        const text = texts[name];
        if (typeof text !== "string") throw new Error(`${name}.txt: missing`);

        const headers = new Set(txtHeaders(text));
        const missing = (spec.required ?? []).filter((c) => !headers.has(c));
        if (missing.length) {
            throw new Error(`${name}.txt: missing required column(s) ${missing.map((c) => `"${c}"`).join(", ")}`);
        }

        const columns = spec.all
            ? [...headers]
            : [...spec.required, ...(spec.optional ?? [])].filter((c) => headers.has(c));
        tables[name] = {columns, rows: parseTxt(text).map((row) => columns.map((c) => row[c]))};
    }

    return {version: DROP_CALC_VERSION, tables};
}

// DropCalculator.json back into row objects. A column absent from the file is undefined on every row.
export function jsonToTables(json) {
    if (json?.version !== DROP_CALC_VERSION) {
        throw new Error(`${DROP_CALC_FILE}: unsupported version ${json?.version}`);
    }

    return Object.fromEntries(DROP_CALC_TABLES.map((name) => {
        const table = json.tables?.[name];
        if (!table) throw new Error(`${DROP_CALC_FILE}: missing table ${name}`);
        return [name, table.rows.map((values) => Object.fromEntries(table.columns.map((c, i) => [c, values[i]])))];
    }));
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npx vitest run src/dropCalcData.test.js`
Expected: PASS, 10 tests.

- [ ] **Step 6: Run everything, lint, commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npm test && npm run lint
git add src/dropCalcData.js src/dropCalcData.test.js src/dropCalcFixtures.js
git commit -m "Drop calculator: dropCalcData.js (column lists, parseTxt, DropCalculator.json format)"
```

---

### Task 3: `src/dropCalcEngine.js`, an indexed engine that matches the golden snapshot

**Files:**
- Create: `src/dropCalcEngine.js`
- Modify: `src/dropCalcFixtures.js` (add `loadDropCalcModel`)
- Test: `src/dropCalcEngine.test.js`

**Interfaces:**
- Consumes: `jsonToTables`' table shape (Task 2), `loadDropCalcTables`, `GOLDEN_QUERIES`, `formatGolden`.
- Produces, in `src/dropCalcEngine.js`:
  - **`prepareModel(tables)`:** returns a model `{monStats, treasureByName, treasureByGroup, autoTcs, baseByCode, exceptionalOrEliteCodes, levelNameByMonster, uniqueItems, setItems, misc, itemRatio}`.
  - **`calculateDrops(model, {dropMode, query, difficulty, players, mf}, stats?)`:**
    - It returns an array of `{monsterId, monsterName, levelName, treasureClass, chance, oneIn, percent}`, sorted by `chance`, highest first.
    - The options are the panel's raw state strings. `query` is not trimmed for messages.
    - It throws `Unique item not found: <query>`, `Set item not found: <query>`, `Misc code not found: <query>` or `Base item not found for code: <code>`.
    - When `stats` is given, it is reset to `{walkNodes, walks, outcomes}` counts for this call.
- Produces, in `src/dropCalcFixtures.js`: `loadDropCalcModel(mode)`.

- [ ] **Step 1: Write the failing tests, `src/dropCalcEngine.test.js`**

```js
import {describe, expect, it} from "vitest";
import {DROP_CALC_COLUMNS} from "./dropCalcData.js";
import {calculateDrops, prepareModel} from "./dropCalcEngine.js";
import {formatGolden, GOLDEN_QUERIES, loadDropCalcModel, loadDropCalcTables} from "./dropCalcFixtures.js";

const EMPTY = {MonStats: [], TreasureClassEx: [], Weapons: [], Armor: [], Misc: [], UniqueItems: [], SetItems: [],
    ItemRatio: [], ItemTypes: [], Levels: []};
const monster = (id, tc, level) => ({Id: id, NameStr: `${id} name`, TreasureClass1: tc, Level: String(level)});
const tc = (name, items, {group = "", level = "", noDrop = "0", picks = "1"} = {}) => {
    const row = {"Treasure Class": name, group, level, Picks: picks, NoDrop: noDrop};
    items.forEach(([item, prob], i) => {
        row[`Item${i + 1}`] = item;
        row[`Prob${i + 1}`] = String(prob);
    });
    return row;
};
const options = (dropMode, query) => ({dropMode, query, difficulty: "", players: "1", mf: ""});

function runGolden(q, model) {
    try {
        return {q, rows: calculateDrops(model, q)};
    } catch (e) {
        return {q, error: e.message};
    }
}

describe("calculateDrops on hand-built tables", () => {
    it("looks treasure classes up by trimmed, lowercased name, and the first row wins", () => {
        const model = prepareModel({...EMPTY,
            MonStats: [monster("m1", " act 1 GOOD ", 10)],
            TreasureClassEx: [tc("Act 1 Good", [["hax", 1]]), tc("Act 1 Good", [["hax", 1]], {noDrop: "1"})],
            Misc: [{code: "hax", level: "1"}],
        });
        const rows = calculateDrops(model, options("misc", "hax"));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({monsterId: "m1", monsterName: "m1 name", treasureClass: "act 1 GOOD", chance: 1});
    });

    it("derives oneIn and percent from chance", () => {
        const model = prepareModel({...EMPTY,
            MonStats: [monster("m1", "TC X", 10)],
            TreasureClassEx: [tc("TC X", [["hax", 1]], {noDrop: "1"})],
            Misc: [{code: "hax", level: "1"}],
        });
        expect(calculateDrops(model, options("misc", "hax"))[0]).toMatchObject({chance: 0.5, oneIn: 2, percent: 50});
    });

    it("upgrades the root TC to the highest level within the monster's level, file order on ties", () => {
        const model = prepareModel({...EMPTY,
            MonStats: [monster("m1", "TC A", 15)],
            TreasureClassEx: [
                tc("TC A", [["hax", 1]], {group: "7", level: "5"}),
                tc("TC B", [["hax", 1]], {group: "7", level: "10"}),
                tc("TC C", [["hax", 1]], {group: "7", level: "10"}),
                tc("TC D", [["hax", 1]], {group: "7", level: "20"}),
            ],
            Misc: [{code: "hax", level: "1"}],
        });
        expect(calculateDrops(model, options("misc", "hax"))[0].treasureClass).toBe("TC B");
    });

    it("throws the legacy messages, with the query as typed", () => {
        const model = prepareModel({...EMPTY, UniqueItems: [{index: "Real", code: "zzz", lvl: "1"}]});
        expect(() => calculateDrops(model, options("unique", " Nope "))).toThrow("Unique item not found:  Nope ");
        expect(() => calculateDrops(model, options("set", "nope"))).toThrow("Set item not found: nope");
        expect(() => calculateDrops(model, options("misc", "nope"))).toThrow("Misc code not found: nope");
        expect(() => calculateDrops(model, options("unique", "real"))).toThrow("Base item not found for code: zzz");
    });

    it("returns no rows for an empty query", () => {
        expect(calculateDrops(prepareModel(EMPTY), options("unique", "   "))).toEqual([]);
    });

    it("resolves an empty-code target to the first empty-code base row: an empty table, not an error", () => {
        const model = prepareModel({...EMPTY,
            MonStats: [monster("m1", "TC X", 10)],
            TreasureClassEx: [tc("TC X", [["hax", 1]])],
            Weapons: [{code: "", level: "0", spawnable: "0"}, {code: "hax", level: "1", spawnable: "1", type: "axe"}],
            UniqueItems: [{index: "Rings", code: "", lvl: ""}],
        });
        expect(calculateDrops(model, options("unique", "rings"))).toEqual([]);
    });

    it("walks each root TC once per query and counts the work in stats", () => {
        const model = prepareModel({...EMPTY,
            MonStats: [monster("m1", "TC X", 10), monster("m2", "TC X", 12), monster("m3", "TC Y", 10)],
            TreasureClassEx: [tc("TC X", [["hax", 1]]), tc("TC Y", [["hax", 1]])],
            Misc: [{code: "hax", level: "1"}],
        });
        const stats = {};
        expect(calculateDrops(model, options("misc", "hax"), stats)).toHaveLength(3);
        expect(stats).toEqual({walkNodes: 4, walks: 2, outcomes: 3});
    });
});

describe("calculateDrops on the real tables", () => {
    it("matches the legacy code's output for the golden query set", async () => {
        const models = {standard: loadDropCalcModel("standard"), damnation: loadDropCalcModel("damnation")};
        const text = formatGolden(GOLDEN_QUERIES.map((q) => runGolden(q, models[q.damnation ? "damnation" : "standard"])));
        await expect(text).toMatchFileSnapshot("./__snapshots__/dropCalc.golden.txt");
    }, 60000);

    it("reads only columns listed in DROP_CALC_COLUMNS", () => {
        for (const mode of ["standard", "damnation"]) {
            const read = {};
            const tables = Object.fromEntries(Object.entries(loadDropCalcTables(mode)).map(([name, rows]) => {
                read[name] = new Set();
                return [name, rows.map((row) => new Proxy(row, {
                    get(target, key, receiver) {
                        if (typeof key === "string") read[name].add(key);
                        return Reflect.get(target, key, receiver);
                    },
                }))];
            }));
            const model = prepareModel(tables);
            for (const q of GOLDEN_QUERIES) runGolden(q, model);

            for (const [name, keys] of Object.entries(read)) {
                const spec = DROP_CALC_COLUMNS[name];
                if (spec.all) continue;
                const listed = new Set([...spec.required, ...(spec.optional ?? [])]);
                expect([...keys].filter((k) => !listed.has(k)), `${mode} ${name}`).toEqual([]);
            }
        }
    }, 60000);
});
```

- [ ] **Step 2: Add `loadDropCalcModel` to `src/dropCalcFixtures.js`**

Add `import {prepareModel} from "./dropCalcEngine.js";` to the imports, and append:

```js
// The prepared model of one mode, built from the .txt tables the way the browser builds it.
export function loadDropCalcModel(mode) {
    return prepareModel(loadDropCalcTables(mode));
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npx vitest run src/dropCalcEngine.test.js`
Expected: FAIL. It can't resolve `./dropCalcEngine.js`.

- [ ] **Step 4: Create `src/dropCalcEngine.js`**

Every function except `prepareModel`, `getRootTc`, `collectPaths`, `finalQualityFactor`, `calculateDropChanceFromRoot` and `calculateDrops` is copied **verbatim** from `DropCalculatorPanel` in `src/App.jsx`. Don't change the order of any arithmetic.

```js
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && CI=1 npx vitest run src/dropCalcEngine.test.js`

Expected: PASS, 9 tests. `CI=1` stops Vitest from rewriting the snapshot, so a mismatch fails instead of being accepted.

If the golden test fails, **do not update the snapshot.** Diff the output (Vitest prints it), find which function deviates from the legacy copy, and fix the engine. The column test failing means a column is missing from `DROP_CALC_COLUMNS`: add it to `src/dropCalcData.js`, then re-run Task 2's tests.

- [ ] **Step 6: Run everything, lint, commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && CI=1 npm test && npm run lint
git add src/dropCalcEngine.js src/dropCalcEngine.test.js src/dropCalcFixtures.js
git commit -m "Drop calculator: indexed engine (dropCalcEngine.js) matching the legacy golden snapshot"
```

---

### Task 4: `src/dropCalcLoad.js`, fetching once per mode

**Files:**
- Create: `src/dropCalcLoad.js`
- Test: `src/dropCalcLoad.test.js`

**Interfaces:**
- Consumes: `DROP_CALC_FILE`, `jsonToTables` (Task 2), `prepareModel` (Task 3).
- Produces: `loadModel(damnationMode: boolean)`, which returns a `Promise` of the model, cached per mode. A rejected promise is evicted.

Note on the spec: it also asks for a test that "evicting it doesn't remove a newer entry". That case can't be reached through `loadModel`. The eviction handler is attached when the promise is created, so it always runs before any caller can see the rejection and ask again. The identity guard (`cache.get(mode) === promise`) stays as a one-line safeguard, without a test.

- [ ] **Step 1: Write the failing tests, `src/dropCalcLoad.test.js`**

```js
import {afterEach, describe, expect, it, vi} from "vitest";
import {DROP_CALC_FILE, DROP_CALC_TABLES, DROP_CALC_VERSION} from "./dropCalcData.js";

const EMPTY_JSON = {
    version: DROP_CALC_VERSION,
    tables: Object.fromEntries(DROP_CALC_TABLES.map((name) => [name, {columns: [], rows: []}])),
};
const ok = (json) => ({ok: true, status: 200, json: async () => json});

// A fresh module per test, so the module-level cache starts empty.
async function freshLoader(fetchImpl) {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn(fetchImpl));
    return (await import("./dropCalcLoad.js")).loadModel;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("loadModel", () => {
    it("fetches each mode's file once, with no-store, and reuses the model", async () => {
        const loadModel = await freshLoader(async () => ok(EMPTY_JSON));
        const first = await loadModel(false);
        expect(await loadModel(false)).toBe(first);
        await loadModel(true);

        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch.mock.calls[0][0]).toMatch(/data\/standard\/DropCalculator\.json$/);
        expect(fetch.mock.calls[0][1]).toEqual({cache: "no-store"});
        expect(fetch.mock.calls[1][0]).toMatch(/data\/damnation\/DropCalculator\.json$/);
    });

    it("reports an HTTP error, then retries on the next call", async () => {
        let calls = 0;
        const loadModel = await freshLoader(async () => (++calls === 1 ? {ok: false, status: 404} : ok(EMPTY_JSON)));
        await expect(loadModel(false)).rejects.toThrow(`${DROP_CALC_FILE}: HTTP 404`);
        await expect(loadModel(false)).resolves.toHaveProperty("monStats", []);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("rejects a file with an unknown version", async () => {
        const loadModel = await freshLoader(async () => ok({...EMPTY_JSON, version: 99}));
        await expect(loadModel(false)).rejects.toThrow(`${DROP_CALC_FILE}: unsupported version 99`);
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npx vitest run src/dropCalcLoad.test.js`
Expected: FAIL. It can't resolve `./dropCalcLoad.js`.

- [ ] **Step 3: Create `src/dropCalcLoad.js`**

```js
// Loads the Drop calculator's data for one mode: DropCalculator.json (generated from the .txt tables
// by the drop-calc-data plugin in vite.config.js), fetched once per mode per page load and prepared.
import {DROP_CALC_FILE, jsonToTables} from "./dropCalcData.js";
import {prepareModel} from "./dropCalcEngine.js";

const cache = new Map();

async function fetchModel(mode) {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${mode}/${DROP_CALC_FILE}`, {cache: "no-store"});
    if (!res.ok) throw new Error(`${DROP_CALC_FILE}: HTTP ${res.status}`);
    return prepareModel(jsonToTables(await res.json()));
}

// A failed load is evicted, so the next query tries again.
export function loadModel(damnationMode) {
    const mode = damnationMode ? "damnation" : "standard";
    let promise = cache.get(mode);

    if (!promise) {
        promise = fetchModel(mode);
        cache.set(mode, promise);
        promise.catch(() => {
            if (cache.get(mode) === promise) cache.delete(mode);
        });
    }

    return promise;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npx vitest run src/dropCalcLoad.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 5: Run everything, lint, commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && CI=1 npm test && npm run lint
git add src/dropCalcLoad.js src/dropCalcLoad.test.js
git commit -m "Drop calculator: loadModel fetches DropCalculator.json once per mode, retrying after a failure"
```

---

### Task 5: The `drop-calc-data` Vite plugin

**Files:**
- Modify: `vite.config.js` (whole file below)
- Modify: `.gitignore` (append)

**Interfaces:**
- Consumes: `DROP_CALC_FILE`, `DROP_CALC_TABLES`, `tablesToJson` (Task 2).
- Produces: `public/data/{standard,damnation}/DropCalculator.json`, written in `configResolved` under `vite`, `vite build` and the dev server, never under Vitest or `vite preview`. In dev, editing a `.txt` file regenerates its mode.

- [ ] **Step 1: Confirm nothing generates the JSON yet**

```bash
ls public/data/standard/DropCalculator.json 2>&1   # expect: No such file
```

- [ ] **Step 2: Replace `vite.config.js`**

```js
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { DROP_CALC_FILE, DROP_CALC_TABLES, tablesToJson } from './src/dropCalcData.js'

const DROP_CALC_MODES = ['standard', 'damnation']

// Writes public/data/<mode>/DropCalculator.json from that folder's .txt tables (src/dropCalcData.js).
// It runs in configResolved, before the dev server lists public/ (a file first written in buildStart
// could 404 until a restart), and again in dev when one of those .txt files changes. Skipped under
// Vitest (mode "test") and vite preview (which only serves dist/). The JSON is gitignored.
function dropCalcData() {
  let skip = false
  let dataDir = ''

  function generate(mode) {
    const dir = path.join(dataDir, mode)
    const texts = Object.fromEntries(DROP_CALC_TABLES.map((name) => [name, readFileSync(path.join(dir, `${name}.txt`), 'utf8')]))
    const json = JSON.stringify(tablesToJson(texts))
    const out = path.join(dir, DROP_CALC_FILE)
    if (!existsSync(out) || readFileSync(out, 'utf8') !== json) writeFileSync(out, json)
  }

  return {
    name: 'drop-calc-data',
    config(_, env) {
      skip = env.mode === 'test' || !!env.isPreview
    },
    configResolved(config) {
      if (skip || !config.publicDir) return
      dataDir = path.join(config.publicDir, 'data')
      for (const mode of DROP_CALC_MODES) {
        try {
          generate(mode)
        } catch (e) {
          // A build must not ship without the calculator's data; the dev server keeps running.
          if (config.command === 'build') throw e
          config.logger.error(`drop-calc-data: ${mode}: ${e.message}`)
        }
      }
    },
    configureServer(server) {
      if (!dataDir) return
      server.watcher.on('change', (file) => {
        const [mode, name, ...rest] = path.relative(dataDir, file).split(path.sep)
        if (rest.length || !DROP_CALC_MODES.includes(mode) || !name?.endsWith('.txt')) return
        try {
          generate(mode)
          server.config.logger.info(`drop-calc-data: regenerated ${mode}/${DROP_CALC_FILE}`)
        } catch (e) {
          server.config.logger.error(`drop-calc-data: ${mode}: ${e.message}`)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), dropCalcData()],
  base: '/TheArchivistSoE/'
})
```

- [ ] **Step 3: Gitignore the generated file**

Append to `.gitignore`:

```
# Generated from public/data/<mode>/*.txt by the drop-calc-data plugin (vite.config.js)
public/data/*/DropCalculator.json
```

- [ ] **Step 4: Vitest must not generate it**

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && CI=1 npm test && ls public/data/standard/DropCalculator.json 2>&1
```

Expected: the tests pass, then `No such file`.

- [ ] **Step 5: Fresh-clone dev start (Review Focus 3): served on the very first request**

```bash
cd /home/emanresu/TheArchivistSoE/.worktrees/dropcalc-perf
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && rm -f public/data/*/DropCalculator.json && nohup env npm_package_version=1.2.1 node node_modules/vite/bin/vite.js --port 5193 --strictPort > $SCRATCH/vite-5193.log 2>&1 &
echo $! > $SCRATCH/vite-5193.pid
```

Then poll until the server answers, and fetch each file once:

```bash
for i in $(seq 50); do curl -s -o /dev/null http://localhost:5193/TheArchivistSoE/ && break; sleep 0.2; done
for m in standard damnation; do curl -s -o /dev/null -w "$m %{http_code} %{size_download}\n" http://localhost:5193/TheArchivistSoE/data/$m/DropCalculator.json; done
git status --short
```

Expected:
- `standard 200 ~550000` and `damnation 200 ~550000`.
- `git status` shows no `DropCalculator.json`, because it's ignored.

- [ ] **Step 6: Editing a `.txt` file regenerates its mode**

```bash
touch public/data/damnation/Levels.txt && sleep 1 && tail -3 $SCRATCH/vite-5193.log
```

Expected: `drop-calc-data: regenerated damnation/DropCalculator.json`. A `touch` changes no content, so the file itself isn't rewritten, but the log line proves the watcher fired.

- [ ] **Step 7: A broken header (Review Focus 4): the dev server logs it, the build fails**

```bash
sed -i '1s/LevelName/LevelNameX/' public/data/standard/Levels.txt && sleep 1 && tail -2 $SCRATCH/vite-5193.log
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npm run build; echo "build exit $?"
git checkout public/data/standard/Levels.txt && sleep 1 && tail -1 $SCRATCH/vite-5193.log
kill "$(cat $SCRATCH/vite-5193.pid)"
```

Expected:
- The dev log shows `drop-calc-data: standard: Levels.txt: missing required column(s) "LevelName"`, and the server keeps running.
- The build prints the same message and `build exit 1`.
- After the checkout, the log shows `regenerated standard/DropCalculator.json`.

- [ ] **Step 8: A normal build ships both files**

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npm run build && ls -la dist/data/standard/DropCalculator.json dist/data/damnation/DropCalculator.json && npm run lint
```

Expected: both files exist (~550 KB each), and lint reports 0 problems.

- [ ] **Step 9: Commit**

```bash
git add vite.config.js .gitignore
git commit -m "Drop calculator: drop-calc-data Vite plugin generates DropCalculator.json per mode (gitignored)"
```

---

### Task 6: Wire the panel to the engine, discard stale runs, and the browser check

**Files:**
- Create: `tools/checks/check-dropcalc.mjs`
- Modify: `src/App.jsx`. The imports (top), and in `DropCalculatorPanel` everything from the comment `// Effect events read the latest callbacks` down to the line before `    const pageRows = rows.slice(pager.start, pager.end);` (~lines 1419–2160).

**Interfaces:**
- Consumes: `loadModel` (Task 4), `calculateDrops` (Task 3), `loadDropCalcModel` (fixtures), the plugin (Task 5).
- Produces: a `DropCalculatorPanel` with the same props `{request, clearRequest, damnationMode}` and the same JSX, and `tools/checks/check-dropcalc.mjs`.

- [ ] **Step 1: Write the browser check, `tools/checks/check-dropcalc.mjs`**

```js
// Drop calculator in the browser: results, data fetching, stale runs, and main-thread time.
// node check-dropcalc.mjs   (APP_URL = this branch's dev server)
// FAIL lines: wrong rows or fetches, which don't depend on the machine. WARN lines: a long main-thread task, which does;
// budgets DROPCALC_DESKTOP_TASK_MS (default 300) and DROPCALC_PHONE_TASK_MS (default 1000), never failing.
// Desktop checks run first: touch emulation can't be switched back to hover: hover in one browser.
import {run, checker, BASE, sleep} from "./cdp.mjs";
import {calculateDrops} from "../../src/dropCalcEngine.js";
import {loadDropCalcModel} from "../../src/dropCalcFixtures.js";

const c = checker();
const DESKTOP_MS = Number(process.env.DROPCALC_DESKTOP_TASK_MS ?? 300);
const PHONE_MS = Number(process.env.DROPCALC_PHONE_TASK_MS ?? 1000);

// Expected row counts come from the engine itself, run in Node on the same tables.
const models = {standard: loadDropCalcModel("standard"), damnation: loadDropCalcModel("damnation")};
const expected = (mode, query, difficulty = "") =>
    calculateDrops(models[mode], {dropMode: "unique", query, difficulty, players: "1", mf: ""}).length;

const QUERY_INPUT = `input[placeholder^="Enter item name"]`;
const TOTAL = `(() => {
    const m = /of (\\d+)/.exec(document.querySelector(".affixPager")?.innerText ?? "");
    return m ? Number(m[1]) : null;
})()`;
const MESSAGE = `document.querySelector(".affixTableScroll .table-message")?.textContent.trim() ?? null`;
const LONG_TASK_OBSERVER = `window.__longTasks = [];
    new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__longTasks.push(e.duration); })
        .observe({type: "longtask", buffered: true});`;
const LONGEST_TASK = `Math.round(Math.max(0, ...window.__longTasks))`;

async function waitTotal(page, count, label) {
    try {
        await page.waitFor(`${TOTAL} === ${count} && ${MESSAGE} === null`, 30000);
        c.ok(true, label, `${count} rows`);
    } catch {
        c.ok(false, label, `expected ${count} rows, page shows ${await page.eval(TOTAL)} (message: ${await page.eval(MESSAGE)})`);
    }
}

function reportTask(label, ms, budget) {
    console.log(`${ms > budget ? "WARN" : "INFO"} longest main-thread task, ${label}: ${ms} ms (budget ${budget} ms)`);
}

// Sets an input's value the way typing does, so React's onChange fires (works for "" too).
const setInput = (selector, value) => `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event("input", {bubbles: true}));
})()`;

// A unique whose Normal row counts differ between the modes, so a mode switch shows in the total.
const modeQuery = models.standard.uniqueItems.map((u) => String(u.index ?? "").trim()).find((q) => {
    if (!q) return false;
    const s = expected("standard", q);
    const d = expected("damnation", q);
    return s > 0 && d > 0 && s !== d;
});

await run(async (page) => {
    const requests = [];
    await page.send("Network.enable");
    page.on("Network.requestWillBeSent", (p) => requests.push(p.request.url));
    const fetched = (re) => requests.filter((u) => re.test(u)).length;
    await page.send("Page.addScriptToEvaluateOnNewDocument", {source: LONG_TASK_OBSERVER});

    const openCalculator = async () => {
        await page.goto(`${BASE}#/dropcalc`);
        await page.waitFor(`!!document.querySelector(${JSON.stringify(QUERY_INPUT)})`);
    };

    // --- Desktop: results and fetching
    await page.desktop();
    await openCalculator();
    const queries = ["The Gnasher", "Deathspade", "Nagelring"];
    const counts = queries.map((q) => expected("standard", q));
    c.ok(new Set(counts).size === 3, "precondition: the three queries have different row counts", counts.join(", "));
    for (const [i, q] of queries.entries()) {
        await page.type(QUERY_INPUT, q);
        await waitTotal(page, counts[i], `desktop: "${q}" (Normal) shows the engine's rows`);
    }
    c.ok(fetched(/\/standard\/DropCalculator\.json/) === 1, "desktop: three queries fetch standard/DropCalculator.json once",
        String(fetched(/\/standard\/DropCalculator\.json/)));
    c.ok(fetched(/\/data\/.*\.txt(\?|$)/) === 0, "desktop: no .txt table is fetched", String(fetched(/\/data\/.*\.txt(\?|$)/)));
    reportTask("desktop, three queries", await page.eval(LONGEST_TASK), DESKTOP_MS);

    // --- Desktop: the Damnation toggle fetches its own file once
    c.ok(!!modeQuery, "precondition: found a unique whose row count differs between the modes", modeQuery);
    await page.type(QUERY_INPUT, modeQuery);
    await waitTotal(page, expected("standard", modeQuery), `desktop: "${modeQuery}" in Standard`);
    await page.click(".topBarToggle input");
    await waitTotal(page, expected("damnation", modeQuery), `desktop: Damnation shows Damnation's rows for "${modeQuery}"`);
    await page.click(".topBarToggle input");
    await waitTotal(page, expected("standard", modeQuery), "desktop: back in Standard, Standard's rows again");
    c.ok(fetched(/\/damnation\/DropCalculator\.json/) === 1, "desktop: damnation/DropCalculator.json fetched once");
    c.ok(fetched(/\/standard\/DropCalculator\.json/) === 1, "desktop: standard/DropCalculator.json still fetched once");

    // --- Race (Review Focus 2): a run waiting for Standard's data must not overwrite Damnation's rows
    const held = [];
    page.on("Fetch.requestPaused", (p) => held.push(p.requestId));
    await page.send("Fetch.enable", {patterns: [{urlPattern: "*standard/DropCalculator.json*", requestStage: "Request"}]});
    await page.eval(`localStorage.setItem("damnation", "false")`);
    await openCalculator();
    await page.type(QUERY_INPUT, modeQuery);
    await sleep(700); // the debounced run starts and waits for the held data
    c.ok(held.length > 0, "race: standard/DropCalculator.json is held");
    await page.click(".topBarToggle input"); // Damnation: a newer run, with data that isn't held
    await waitTotal(page, expected("damnation", modeQuery), "race: Damnation's rows appear while Standard's data is held");
    for (const requestId of held.splice(0)) await page.send("Fetch.continueRequest", {requestId});
    await sleep(1500);
    c.ok(await page.eval(TOTAL) === expected("damnation", modeQuery), "race: releasing Standard's data leaves Damnation's rows",
        String(await page.eval(TOTAL)));

    // --- Clear while loading (Review Focus 1): no stuck "Calculating..."
    await page.eval(`localStorage.setItem("damnation", "false")`);
    await openCalculator();
    await page.type(QUERY_INPUT, "The Gnasher");
    await sleep(700);
    c.ok(await page.eval(MESSAGE) === "Calculating...", "clear while loading: 'Calculating...' while the data is held",
        String(await page.eval(MESSAGE)));
    await page.eval(setInput(QUERY_INPUT, ""));
    await sleep(700);
    c.ok(await page.eval(MESSAGE) === null && await page.eval(TOTAL) === 0, "clear while loading: empty table, no message",
        `message ${await page.eval(MESSAGE)}, total ${await page.eval(TOTAL)}`);
    for (const requestId of held.splice(0)) await page.send("Fetch.continueRequest", {requestId});
    await sleep(1500);
    c.ok(await page.eval(MESSAGE) === null && await page.eval(TOTAL) === 0, "clear while loading: still empty once the data arrives");
    await page.send("Fetch.disable");

    // --- Phone: 390x844, touch, CPU slowed 4x; the slowest target in Hell
    await page.mobile();
    await page.send("Emulation.setCPUThrottlingRate", {rate: 4});
    await openCalculator();
    await sleep(2000); // the warm-up download
    await page.click(".dropCalcDifficulty .selTrigger");
    await page.click(".dropCalcDifficulty .selOption", {text: "Hell"});
    await page.eval("window.__longTasks = []");
    await page.type(QUERY_INPUT, "The Gnasher");
    await waitTotal(page, expected("standard", "The Gnasher", "H"), `phone: "The Gnasher" (Hell) shows the engine's rows`);
    reportTask("phone (CPU x4), The Gnasher in Hell", await page.eval(LONGEST_TASK), PHONE_MS);
    await page.send("Emulation.setCPUThrottlingRate", {rate: 1});
});

c.done();
```

- [ ] **Step 2: Run the check against the legacy panel to see it fail**

```bash
cd /home/emanresu/TheArchivistSoE/.worktrees/dropcalc-perf
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && nohup env npm_package_version=1.2.1 node node_modules/vite/bin/vite.js --port 5193 --strictPort > $SCRATCH/vite-5193.log 2>&1 &
echo $! > $SCRATCH/vite-5193.pid
```

```bash
cd /home/emanresu/TheArchivistSoE/.worktrees/dropcalc-perf/tools/checks
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && APP_URL=http://localhost:5193/TheArchivistSoE/ timeout 300 node check-dropcalc.mjs
```

Expected: FAIL lines. The checks "fetch standard/DropCalculator.json once" (0 fetches) and "no .txt table is fetched" fail at least.
- Each legacy Normal query freezes the page for ~14 s, and the throttled-phone Hell query for minutes. The `timeout 300` may kill the run before it finishes, which is fine here: the first FAIL lines are the point.
- If it was killed, delete any leftover `tools/checks/chrome-profile-*` directory. They're gitignored, but disk space matters.
- Leave the server running.

- [ ] **Step 3: Add the imports to `src/App.jsx`**

After `import {usePager} from "./pager.js";` add:

```js
import {calculateDrops} from "./dropCalcEngine.js";
import {loadModel} from "./dropCalcLoad.js";
```

- [ ] **Step 4: Replace the panel's effects and calculation code**

In `DropCalculatorPanel`, replace everything from the line `    // Effect events read the latest callbacks without being effect dependencies, so these effects` down to (not including) `    const pageRows = rows.slice(pager.start, pager.end);` with the code below. That removes the legacy helpers `n` … `calculateAll`: the file's top-level `n` (`const n = (v) => …` near line 200) takes over.

Do it with this script, which checks the markers before writing:

```bash
cd /home/emanresu/TheArchivistSoE/.worktrees/dropcalc-perf
cat > $SCRATCH/panel-new.txt <<'EOF'
    // Effect events read the latest callbacks without being effect dependencies, so these effects
    // still fire only when `request` or the inputs change.
    const consumeRequest = useEffectEvent(() => clearRequest?.());
    const runCalculation = useEffectEvent((isCancelled) => calculateAll(isCancelled));

    useEffect(() => {
        if (!request) return;

        setDropMode("unique");
        setDifficulty("H");
        setQuery(request.item);

        consumeRequest();

    }, [request]);

    // Starts downloading this mode's data as soon as the tab opens; a failure surfaces on the next query.
    useEffect(() => {
        loadModel(damnationMode).catch(() => {});
    }, [damnationMode]);

    React.useEffect(() => {
        let cancelled = false;
        const id = window.setTimeout(() => {
            runCalculation(() => cancelled);
        }, 300);

        return () => {
            cancelled = true;
            window.clearTimeout(id);
        };
    }, [dropMode, query, difficulty, players, mf, damnationMode]);

    // A run whose inputs changed while it waited for the data (isCancelled) sets no state, so an older
    // query's rows never replace a newer query's.
    async function calculateAll(isCancelled) {
        if (!n(query)) {
            setRows([]);
            setError("");
            setLoading(false);
            return;
        }

        setLoading(true);
        setError("");

        let result;
        try {
            const model = await loadModel(damnationMode);
            result = {rows: calculateDrops(model, {dropMode, query, difficulty, players, mf})};
        } catch (e) {
            result = {error: e instanceof Error ? e.message : String(e)};
        }

        if (isCancelled()) return;

        setRows(result.rows ?? []);
        setError(result.error ?? "");
        setLoading(false);
    }

EOF
python3 - "$SCRATCH/panel-new.txt" <<'PY'
import sys
p = "src/App.jsx"
s = open(p).read()
new = open(sys.argv[1]).read()
panel = s.index("function DropCalculatorPanel(")
start = s.index("    // Effect events read the latest callbacks without being effect dependencies, so these effects", panel)
end = s.index("    const pageRows = rows.slice(pager.start, pager.end);", start)
old = s[start:end]
assert "async function calculateAll()" in old and "function collectPaths(" in old, "unexpected block"
assert s.count("function collectPaths(") == 1
open(p, "w").write(s[:start] + new + s[end:])
print("replaced", old.count("\n"), "lines with", new.count("\n"))
PY
```

Expected: `replaced ~741 lines with ~65`.

- [ ] **Step 5: Lint, unit tests, build**

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npm run lint && CI=1 npm test && npm run build
grep -n "collectPaths\|loadTxt\|BASE DEBUG" src/App.jsx   # expect no output
```

Expected: lint reports 0 problems, the tests pass, and the build succeeds.

- [ ] **Step 6: Run the browser check against the new panel**

The dev server from Step 2 is still running, and Vite reloads `App.jsx` itself.

```bash
cd /home/emanresu/TheArchivistSoE/.worktrees/dropcalc-perf/tools/checks
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && APP_URL=http://localhost:5193/TheArchivistSoE/ timeout 600 node check-dropcalc.mjs
```

Expected: every line PASS (or INFO/WARN for timings), ending in `all checks passed`. On this machine the desktop longest task is expected well under 300 ms, and the phone one under 1,000 ms.

- [ ] **Step 7: Stop the server and commit**

```bash
kill "$(cat $SCRATCH/vite-5193.pid)"
cd /home/emanresu/TheArchivistSoE/.worktrees/dropcalc-perf
git add src/App.jsx tools/checks/check-dropcalc.mjs
git commit -m "Drop calculator: panel uses the engine and cached data, discards stale runs; browser check"
```

---

### Task 7: The "View drop rates" link sends the unique's internal index

**Files:**
- Modify: `src/App.jsx`, `UniqueTooltip`'s `tooltip-link` (~line 3141 on `main`; search `openDropCalculator(n(u?.displayName)`)
- Modify: `src/dropCalcFixtures.js` (add `readUniquesJson`)
- Test: `src/dropCalcEngine.test.js` (append a `describe`)
- Modify: `tools/checks/check-dropcalc.mjs` (add a desktop link check)

**Interfaces:**
- Consumes: `loadDropCalcModel` (Task 3).
- Produces: `readUniquesJson(mode)`, the parsed `public/data/Uniques.json` (standard) or `public/data/damnation/Uniques.json`.

- [ ] **Step 1: Add `readUniquesJson` to `src/dropCalcFixtures.js`**

```js
// The wiki's unique cards (Uniques.json) of one mode.
export function readUniquesJson(mode) {
    const file = mode === "damnation" ? "damnation/Uniques.json" : "Uniques.json";
    return JSON.parse(readFileSync(new URL(file, DATA), "utf8"));
}
```

- [ ] **Step 2: Write the link-data test (append to `src/dropCalcEngine.test.js`)**

Extend the fixtures import to `import {formatGolden, GOLDEN_QUERIES, loadDropCalcModel, loadDropCalcTables, readUniquesJson} from "./dropCalcFixtures.js";`, then append:

```js
// The unique card's "View drop rates" link sends u.index; the calculator matches it exactly against
// UniqueItems.txt's index. The display name often differs ("Skull Splitter" is "Mindrend").
describe("View drop rates link targets", () => {
    const shown = (u) => ![true, 1, "1", "true"].includes(typeof u.dontDisplay === "string" ? u.dontDisplay.toLowerCase() : u.dontDisplay);

    for (const mode of ["standard", "damnation"]) {
        it(`resolves every linkable ${mode} unique exactly by its index`, () => {
            const indexes = new Set(loadDropCalcModel(mode).uniqueItems.map((r) => String(r.index ?? "").trim().toLowerCase()));
            const linkable = readUniquesJson(mode).filter((u) => shown(u) && !u.hellforged);
            expect(linkable.length).toBeGreaterThan(500);
            const missing = linkable.filter((u) => !indexes.has(String(u.index ?? "").trim().toLowerCase()));
            expect(missing.map((u) => `${u.displayName} [${u.index}]`)).toEqual([]);
        });
    }
});
```

- [ ] **Step 3: Run it**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && CI=1 npx vitest run src/dropCalcEngine.test.js`

Expected: PASS. This test pins the data the fix relies on; it doesn't exercise the link. The link's failing test is the browser check in Step 4.

- [ ] **Step 4: Add the link check to `tools/checks/check-dropcalc.mjs` and see it fail**

Insert this block right after the `// --- Desktop: the Damnation toggle fetches its own file once` section (before `// --- Race`):

```js
    // --- Desktop: "View drop rates" on a unique card whose display name differs from its index
    await page.goto(`${BASE}#/uniques`);
    await page.waitFor(`!!document.querySelector('input[placeholder="Search item name…"]')`);
    await page.type(`input[placeholder="Search item name…"]`, "Skull Splitter");
    await sleep(500);
    await page.click(".tooltip-link", {text: "View drop rates"});
    await page.waitFor(`location.hash === "#/dropcalc"`);
    const linked = await page.eval(`document.querySelector(${JSON.stringify(QUERY_INPUT)}).value`);
    c.ok(linked === "Mindrend", "link: View drop rates on Skull Splitter sends its index", linked);
    await waitTotal(page, expected("standard", "Mindrend", "H"), "link: the calculator shows Mindrend's Hell rows");
```

Start the dev server (Task 6 Step 2's command), then run the check (Task 6 Step 6's command).

Expected: `FAIL link: View drop rates on Skull Splitter sends its index | Skull Splitter`, plus the "Unique item not found" wait failing. Every other line passes.

- [ ] **Step 5: Fix the link**

In `src/App.jsx`, `UniqueTooltip`:

```jsx
                onClick={() => openDropCalculator(n(u?.displayName) || n(u?.index))}
```

becomes

```jsx
                onClick={() => openDropCalculator(n(u?.index) || n(u?.displayName))}
```

- [ ] **Step 6: Re-run the check, lint, test, stop, commit**

Run the check (Task 6 Step 6's command). Expected: `all checks passed`. Then:

```bash
kill "$(cat $SCRATCH/vite-5193.pid)"
cd /home/emanresu/TheArchivistSoE/.worktrees/dropcalc-perf
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npm run lint && CI=1 npm test
git add src/App.jsx src/dropCalcFixtures.js src/dropCalcEngine.test.js tools/checks/check-dropcalc.mjs
git commit -m "View drop rates: send the unique's internal index (107 cards found nothing, 20 opened another unique)"
```

---

### Task 8: `tools/checks/bench-dropcalc.mjs`, the sweep with work ceilings

**Files:**
- Create: `tools/checks/bench-dropcalc.mjs`

**Interfaces:**
- Consumes: `calculateDrops` with `stats` (Task 3), `loadDropCalcModel` (fixtures).

- [ ] **Step 1: Create the script, with no ceilings yet**

```js
// Every Drop calculator target (all uniques, set items and misc codes) in every difficulty and both
// modes, with the data already loaded: time and work per query.
// node bench-dropcalc.mjs   (DROPCALC_BUDGET_MS = the time budget per query, default 150)
// FAIL (exit 1): a target over a work ceiling below, which doesn't depend on the machine.
// WARN: a target over the time budget, which does; it never fails.
import {calculateDrops} from "../../src/dropCalcEngine.js";
import {loadDropCalcModel} from "../../src/dropCalcFixtures.js";

// Measured maxima across the whole sweep, plus 25%. Measured <date>: walkNodes <max> (<target>),
// outcomes <max> (<target>).
const MAX_WALK_NODES = Infinity;
const MAX_OUTCOMES = Infinity;

const BUDGET_MS = Number(process.env.DROPCALC_BUDGET_MS ?? 150);
const DIFFICULTIES = {"": "Normal", N: "Nightmare", H: "Hell"};
let failures = 0;
let warnings = 0;
const peak = {walkNodes: {value: 0}, outcomes: {value: 0}};

for (const mode of ["standard", "damnation"]) {
    const model = loadDropCalcModel(mode);
    const targets = [
        ...model.uniqueItems.map((r) => ["unique", r.index]),
        ...model.setItems.map((r) => ["set", r.index]),
        ...model.misc.map((r) => ["misc", r.code]),
    ].map(([dropMode, q]) => [dropMode, String(q ?? "").trim()]).filter(([, q]) => q);

    const runOne = (dropMode, query, difficulty) => {
        const stats = {};
        const t = performance.now();
        let rows = 0;
        try {
            rows = calculateDrops(model, {dropMode, query, difficulty, players: "1", mf: ""}, stats).length;
        } catch {
            // "not found" and similar: still timed and counted
        }
        return {ms: performance.now() - t, rows, dropMode, query, ...stats};
    };

    for (const [dropMode, query] of targets.slice(0, 30)) runOne(dropMode, query, "H"); // warm-up, untimed

    for (const [difficulty, label] of Object.entries(DIFFICULTIES)) {
        const results = targets.map(([dropMode, query]) => runOne(dropMode, query, difficulty));
        const byTime = [...results].sort((a, b) => b.ms - a.ms);
        const at = (fraction) => byTime[Math.floor(byTime.length * fraction)].ms.toFixed(0);
        const worst = byTime[0];
        console.log(`${mode} ${label}: ${results.length} targets, median ${at(0.5)} ms, slowest 10% from ${at(0.1)} ms, `
            + `worst ${worst.ms.toFixed(0)} ms (${worst.dropMode} ${worst.query}, ${worst.rows} rows)`);

        for (const r of results) {
            for (const key of ["walkNodes", "outcomes"]) {
                if (r[key] > peak[key].value) peak[key] = {value: r[key], where: `${mode} ${label} ${r.dropMode} ${r.query}`};
            }
            if (r.walkNodes > MAX_WALK_NODES || r.outcomes > MAX_OUTCOMES) {
                failures++;
                console.log(`FAIL ${mode} ${label} ${r.dropMode} "${r.query}": walkNodes ${r.walkNodes} (ceiling ${MAX_WALK_NODES}), `
                    + `outcomes ${r.outcomes} (ceiling ${MAX_OUTCOMES})`);
            }
            if (r.ms > BUDGET_MS) {
                warnings++;
                console.log(`WARN ${mode} ${label} ${r.dropMode} "${r.query}": ${r.ms.toFixed(0)} ms (budget ${BUDGET_MS} ms)`);
            }
        }
    }
}

console.log(`peak walkNodes ${peak.walkNodes.value} (${peak.walkNodes.where}), peak outcomes ${peak.outcomes.value} (${peak.outcomes.where})`);
console.log(failures ? `${failures} target(s) over a work ceiling` : `all targets within the work ceilings; ${warnings} timing warning(s)`);
if (failures) process.exitCode = 1;
```

- [ ] **Step 2: Run it to measure the peaks**

```bash
cd /home/emanresu/TheArchivistSoE/.worktrees/dropcalc-perf/tools/checks
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && timeout 600 node bench-dropcalc.mjs | grep -v "^WARN" | tail -10
```

Expected:
- Six summary lines. In the spec's measurements the medians are 35–64 ms and the worst cases 92–159 ms, a little lower now with the occurrence cache.
- The `peak walkNodes` line, around 56,000 (The Gnasher, Hell).
- The `peak outcomes` line.

- [ ] **Step 3: Fill in the ceilings**

Set `MAX_WALK_NODES` and `MAX_OUTCOMES` to each peak × 1.25, rounded **up** to the next 1,000. Replace the comment's `<date>`, `<max>` and `<target>` with today's date and the measured values.

For example, a peak of 55,954 walk nodes gives 69,943, rounded up to `70000`, with the comment `walkNodes 55954 (standard Hell unique The Gnasher)`.

- [ ] **Step 4: Prove that a ceiling catches the old walk**

Temporarily disable the walk cache: in `src/dropCalcEngine.js`, `calculateDropChanceFromRoot`, change `let acc = ctx.walkCache.get(rootTc);` to `let acc = undefined;`. Then run:

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && timeout 600 node bench-dropcalc.mjs | grep -c "^FAIL"; echo "exit ${PIPESTATUS[0]}"
cd /home/emanresu/TheArchivistSoE/.worktrees/dropcalc-perf && git checkout src/dropCalcEngine.js
```

Expected: a count greater than 0, and `exit 1`. Then the engine is restored.

Re-run the bench once more. Expected: `all targets within the work ceilings` and exit 0.

- [ ] **Step 5: Commit**

```bash
cd /home/emanresu/TheArchivistSoE/.worktrees/dropcalc-perf
git add tools/checks/bench-dropcalc.mjs
git commit -m "tools/checks: bench-dropcalc sweeps every target, failing on work ceilings, warning on time"
```

---

### Task 9: Tier filter order, Normal, Exceptional, Elite

**Files:**
- Create: `src/tiers.js`
- Test: `src/tiers.test.js`
- Create: `tools/checks/check-tier-order.mjs`
- Modify: `src/App.jsx`, `App`'s `tierOptions` memo (~line 3551 on `main`; search `const tierOptions = useMemo`)

**Interfaces:**
- Produces, in `src/tiers.js`:
  - `TIER_ORDER`: the array `["Normal", "Exceptional", "Elite"]`.
  - `sortTiers(tiers: string[])`: a new array with the known tiers in `TIER_ORDER`, then the others (numbers ascending, otherwise `localeCompare`).

- [ ] **Step 1: Write the failing unit tests, `src/tiers.test.js`**

```js
import {describe, expect, it} from "vitest";
import {sortTiers, TIER_ORDER} from "./tiers.js";

describe("sortTiers", () => {
    it("lists the three tiers Normal, Exceptional, Elite whatever the input order", () => {
        for (const input of [["Elite", "Exceptional", "Normal"], ["Exceptional", "Normal", "Elite"], ["Normal", "Elite", "Exceptional"]]) {
            expect(sortTiers(input)).toEqual(TIER_ORDER);
        }
    });

    it("keeps a subset in tier order", () => {
        expect(sortTiers(["Elite", "Normal"])).toEqual(["Normal", "Elite"]);
    });

    it("puts unknown values after the known tiers, numbers ascending, then alphabetical", () => {
        expect(sortTiers(["Elite", "10", "Mythic", "2", "Normal"])).toEqual(["Normal", "Elite", "2", "10", "Mythic"]);
    });

    it("doesn't change its input", () => {
        const input = ["Elite", "Normal"];
        sortTiers(input);
        expect(input).toEqual(["Elite", "Normal"]);
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npx vitest run src/tiers.test.js`
Expected: FAIL. It can't resolve `./tiers.js`.

- [ ] **Step 3: Create `src/tiers.js`**

```js
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
```

- [ ] **Step 4: Run them to verify they pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npx vitest run src/tiers.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the browser check, `tools/checks/check-tier-order.mjs`**

```js
// The tier filter lists Normal, Exceptional, Elite in that order on every tab that has it.
// node check-tier-order.mjs   (APP_URL = a dev server)
import {run, checker, BASE, openTab} from "./cdp.mjs";

const c = checker();
const EXPECTED = ["All tiers", "Normal", "Exceptional", "Elite"];

await run(async (page) => {
    await page.desktop();
    await page.goto(BASE);
    await page.waitFor(`!!document.querySelector(".tabs .tab")`);
    for (const key of ["weapons", "armors", "uniques"]) {
        await openTab(page, key);
        await page.click(".selTrigger", {text: "All tiers"});
        const options = await page.eval(`[...document.querySelectorAll(".selDropdown .selOption")].map((e) => e.textContent.trim())`);
        c.ok(JSON.stringify(options) === JSON.stringify(EXPECTED), `${key}: the tier filter lists ${EXPECTED.join(", ")}`, options.join(", "));
        await page.click(".selTrigger", {text: "All tiers"}); // close it again
    }
});

c.done();
```

- [ ] **Step 6: Run the check to see it fail**

Start the dev server (Task 6 Step 2's command), then:

```bash
cd /home/emanresu/TheArchivistSoE/.worktrees/dropcalc-perf/tools/checks
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && APP_URL=http://localhost:5193/TheArchivistSoE/ node check-tier-order.mjs
```

Expected: three FAIL lines, each with `| All tiers, Elite, Exceptional, Normal`.

- [ ] **Step 7: Use `sortTiers` in `App`**

Add `import {sortTiers} from "./tiers.js";` after the `./dropCalcLoad.js` import in `src/App.jsx`, and replace the memo

```js
    const tierOptions = useMemo(() => {
        const tiers = Array.from(new Set(items.map((it) => n(it?.itemTier)).filter(Boolean)));
        return tiers.sort((a, b) => {
            const an = Number(a), bn = Number(b);
            if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
            return a.localeCompare(b);
        });
    }, [items]);
```

with

```js
    const tierOptions = useMemo(
        () => sortTiers(Array.from(new Set(items.map((it) => n(it?.itemTier)).filter(Boolean)))),
        [items]
    );
```

- [ ] **Step 8: Re-run the check, lint, test, stop, commit**

Run the check again (Step 6's command). Expected: three PASS lines and `all checks passed`. Then:

```bash
kill "$(cat $SCRATCH/vite-5193.pid)"
cd /home/emanresu/TheArchivistSoE/.worktrees/dropcalc-perf
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npm run lint && CI=1 npm test
git add src/tiers.js src/tiers.test.js src/App.jsx tools/checks/check-tier-order.mjs
git commit -m "Tier filter lists Normal, Exceptional, Elite (sortTiers) instead of alphabetically"
```

---

### Task 10: Docs, desktop screenshots, final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`**

Make these replacements, each one exact.

**1.** In **Layout**, after the `src/StickyHeadTable.jsx` bullet, insert:

```markdown
- The Drop calculator: `src/dropCalcData.js` (the columns read from each `.txt` table, `parseTxt`, the
  `DropCalculator.json` format), `src/dropCalcEngine.js` (`prepareModel` builds indexes once per mode;
  `calculateDrops` walks each root treasure class once per query), `src/dropCalcLoad.js` (`loadModel`:
  fetched once per mode, cached, retried after a failure). `DropCalculatorPanel` in `App.jsx` keeps only
  UI state; a run whose inputs changed while it waited for data sets no state. `src/dropCalcFixtures.js`
  is Node-only (tests and `tools/checks/`), never imported by the app.
```

**2.** Replace the bullet

```markdown
- `public/data/standard/*.txt`, `public/data/damnation/*.txt`: raw game tables
  (MonStats, TreasureClassEx, Weapons, …) used by the Drop calculator.
```

with

```markdown
- `public/data/standard/*.txt`, `public/data/damnation/*.txt`: raw game tables
  (MonStats, TreasureClassEx, Weapons, …), the source of the Drop calculator's data. The `drop-calc-data`
  plugin in `vite.config.js` turns them into `public/data/<mode>/DropCalculator.json` (gitignored) when
  Vite starts (dev, build) and again in dev when a `.txt` file changes. A missing required column fails
  the build. The plugin imports `src/dropCalcData.js`, so editing that file restarts the dev server.
```

**3.** In **Data**, replace

```markdown
- Damnation mode (the header toggle, persisted in `localStorage`) swaps only `Uniques.json`
  (to `data/damnation/`) and the Drop calculator's `.txt` folder. Everything else is shared.
```

with

```markdown
- Damnation mode (the header toggle, persisted in `localStorage`) swaps only `Uniques.json`
  (to `data/damnation/`) and the Drop calculator's `DropCalculator.json`. Everything else is shared.
- The Drop calculator's results are pinned by a golden snapshot (`src/__snapshots__/dropCalc.golden.txt`,
  captured from the pre-refactor code by `tools/checks/golden-dropcalc-legacy.mjs`). An upstream data drop
  or a deliberate formula change shows up as a snapshot diff: review it, then accept with `npx vitest -u`.
- The unique card's "View drop rates" link sends the unique's internal `index` (e.g. "Mindrend"), not
  its display name ("Skull Splitter"): the calculator matches `UniqueItems.txt`'s `index`.
```

**4.** In **Layout**, replace

```markdown
- `src/sortCompare.js` (Affixes sort rules), `src/hashTab.js` (tab ↔ URL hash), `src/pager.js`,
  `src/tabList.js` and `useIsMobile`'s `mobileQuery`: pure helpers, with their tests beside them.
```

with

```markdown
- `src/sortCompare.js` (Affixes sort rules), `src/hashTab.js` (tab ↔ URL hash), `src/pager.js`,
  `src/tabList.js`, `src/tiers.js` (the tier filter's Normal → Exceptional → Elite order) and
  `useIsMobile`'s `mobileQuery`: pure helpers, with their tests beside them.
```

**5.** In **Verifying UI changes**, the harness list has the one-line bullet
`- Feature checks: \`check-sticky.mjs\` (floating table header), \`check-multisort.mjs\` (Affixes multi-sort).`
Insert this new bullet right after it:

```markdown
- Drop calculator: `check-dropcalc.mjs` (browser: rows, one fetch per mode, no `.txt`, stale runs, the
  View drop rates link; WARN-only timing budgets `DROPCALC_DESKTOP_TASK_MS`, `DROPCALC_PHONE_TASK_MS`) and
  `bench-dropcalc.mjs` (Node: every target, every difficulty, both modes; FAIL over the work ceilings,
  WARN over `DROPCALC_BUDGET_MS`). Tier filter: `check-tier-order.mjs`.
```

- [ ] **Step 2: Desktop screenshots, before and after**

Start a server for `main` (from the main checkout) and one for the branch:

```bash
cd /home/emanresu/TheArchivistSoE
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && nohup env npm_package_version=1.2.1 node node_modules/vite/bin/vite.js --port 5194 --strictPort > $SCRATCH/vite-5194.log 2>&1 &
echo $! > $SCRATCH/vite-5194.pid
cd /home/emanresu/TheArchivistSoE/.worktrees/dropcalc-perf
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && nohup env npm_package_version=1.2.1 node node_modules/vite/bin/vite.js --port 5193 --strictPort > $SCRATCH/vite-5193.log 2>&1 &
echo $! > $SCRATCH/vite-5193.pid
```

```bash
cd /home/emanresu/TheArchivistSoE/.worktrees/dropcalc-perf/tools/checks
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && node compare-desktop.mjs main http://localhost:5194/TheArchivistSoE/ && node compare-desktop.mjs branch http://localhost:5193/TheArchivistSoE/ && node diff-shots.mjs main branch
kill "$(cat $SCRATCH/vite-5194.pid)"; kill "$(cat $SCRATCH/vite-5193.pid)"
```

Expected: no differences on any of the 19 tabs.

- [ ] **Step 3: Final gates**

```bash
cd /home/emanresu/TheArchivistSoE/.worktrees/dropcalc-perf
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npm run lint && CI=1 npm test && npm run build && ls dist/data/*/DropCalculator.json && git status --short
free -h
```

Expected:
- Lint reports 0 problems, the tests pass, and the build succeeds.
- Both JSON files are in `dist/`.
- `git status` shows only `CLAUDE.md` modified.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "CLAUDE.md: Drop calculator modules, generated DropCalculator.json, golden snapshot, checks"
```

- [ ] **Step 5: Hand back to the user (controller, not a subagent)**

- **Memory:** update the notes outside the repo.
  - `drop-calculator-slow`: implemented on branch `dropcalc-perf`.
  - `preexisting-app-bugs`: the View drop rates link is fixed; the `r01` rune-stack bug is still open.
- **Report:**
  - the bench summary (the medians and worst per mode and difficulty);
  - the browser check's timing lines;
  - the branch's commits.
- **Ask** whether the user wants a real-phone check over Tailscale (dev server bound only to `--host 100.91.245.9`) before finishing the branch.
