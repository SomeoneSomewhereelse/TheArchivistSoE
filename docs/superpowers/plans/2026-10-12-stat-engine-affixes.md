# Stat engine and Affixes redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Describe every affix the way the game does, from the game's own tables and string tables, generate `Affixes.json` in the fork, show the engine's text in the Affixes tab and the Item Builder, and add a Stat filter to the Affixes tab.

**Architecture:** Four pure modules run at build time inside a Vite plugin: `tblFile.js` decodes `.tbl` string tables, `statData.js` builds a stat dictionary from `Properties`/`ItemStatCost`/`CharStats`/`Skills`/`Skilldesc.txt`, `statEngine.js` expands affix mods into stats and describes them as lines, and `affixData.js` turns the raw affix rows into generated rows plus the Stat filter's options. The renamed `affix-data` plugin writes `public/data/standard/Affixes.json` and `ItemBuilder.json`; the browser only displays them.

**Tech Stack:** React 19, Vite 7, plain JavaScript (ES modules), Vitest 5, ESLint 9 (React Compiler rules), headless Chromium over CDP for browser checks.

**Spec:** `docs/superpowers/specs/2026-10-11-stat-engine-affixes-design.md` (read it with this plan; the plan argues from it). Task 1 folds a few plan-time refinements into the spec, each backed by the reverse-engineered game code; the spec stays the reference.

## Global Constraints

- Node runs through nvm: start every shell command with `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"`.
- Work on branch `stat-engine`. One commit per task (Task 1's table move is its own commit). No attribution lines in commit messages. Never push.
- Runtime dependencies stay `react` and `react-dom`. Add no packages.
- `npm run lint` reports 0 problems after every task. The React Compiler rules apply: no synchronous `setState` in an effect, no ref reads during render, no `eslint-disable`.
- `src/tblFile.js`, `src/statData.js`, `src/statEngine.js`, `src/affixData.js`, `src/itemBuilderData.js` stay pure (no `node:fs`), because Vite, Vitest and the browser all import them. `src/statFixtures.js` and `src/itemBuilderFixtures.js` are Node-only; the app never imports them.
- Style: `src/` uses 4-space indents and double quotes; `vite.config.js` uses 2-space indents, single quotes, no semicolons. Test files import `describe`/`it`/`expect` from `vitest` explicitly.
- Runtime URLs use `import.meta.env.BASE_URL`, never a hard-coded `/`.
- Blizzard's full string tables are never committed. Only the generated, trimmed `src/baseStrings.json` is. The user's copies live in the local research vault: `/home/emanresu/TheArchivistSoE/docs/research/stat-summing/modrepo/string.tbl` and `.../expansionstring.tbl` (the vault is git-excluded; use the absolute path even from a worktree).
- The new mod tables come from the vault too (`docs/research/stat-summing/modrepo/`, fetched from `Lukaszpg/PD2-Sanctuary-of-Exile` at `961bd69f`): `Properties.txt`, `ItemStatCost.txt`, `CharStats.txt`, `Skills.txt`, `Skilldesc.txt`, `patchstring.tbl`. Copy them byte for byte.
- **Dev server** (port 5190): start it with the Bash tool's `run_in_background` (`npm run dev -- --port 5190 --strictPort > /tmp/claude-1000/dev.log 2>&1`), then wait until it answers: `timeout 60 bash -c 'until curl -sf -o /dev/null http://localhost:5190/TheArchivistSoE/; do sleep 1; done'` (if the harness rejects that, use the Monitor tool with the same until-loop; a bare foreground `sleep` is blocked). Stop it with `pkill -f "[v]ite.*5190"` as a command of its own (the bracket keeps the pattern from matching the shell running it). Below, "start the dev server" means exactly this.
- Browser checks that take a screenshot folder need it to exist: `mkdir -p` it first.
- Every tab except Affixes and Item Builder stays pixel-identical (Task 1 takes the "before" screenshots; Task 11 compares).
- The Drop calculator's golden snapshot (`src/__snapshots__/dropCalc.golden.txt`) never changes.

## Review Focus

- **A data update brings a stat, descfunc, dgrpfunc, property func, non-level `op` scaling or string the engine doesn't know.** Expect the build to fail with a message naming it, never a blank or wrong line. Pinned by `expandMods`' unknown-func test (Task 4) and `checkEntries`' tests (Task 5).
- **A row that prints nothing** (*of the Smith*: its only code is unknown). Expect an empty Attributes cell, `sort: null` sorting lowest, no Stat filter match, and no crash in the tab or the builder. Pinned by `describeAffixes`' no-lines test (Task 6) and the `sort: null` sort test (Task 7).
- **`Affixes.json` fails to load, or is upstream's old list format** (a stale deploy, a dev server whose plugin errored). Expect the error panel with a working Retry, not an empty table. Pinned by `affixesLoad.test.js` (Task 8) and the by-hand Retry step in Task 9.
- **The Damnation toggle on the Affixes tab.** The file is mode-independent; expect the same rows with the toggle on. Pinned by `check-affix-stats.mjs` (Task 9).
- **A Stat filter choice when the tab changes or data reloads.** Expect a tab switch to reset the filter to "Any stat" like the other filters, and the row selection to go back to row 0. Pinned by `check-affix-stats.mjs` (Task 9).

---

### Task 1: Move the game tables to their in-MPQ paths

The tables move to `public/data/<mode>/data/global/excel/`, every reader follows, and nothing else changes. This is its own commit: the Drop calculator's golden snapshot must stay identical.

**Files:**
- Move: `public/data/standard/*.txt` → `public/data/standard/data/global/excel/`, `public/data/damnation/*.txt` → `public/data/damnation/data/global/excel/`
- Modify: `vite.config.js` (both plugins' table reads, the drop-calc dev watcher)
- Modify: `src/dropCalcFixtures.js:47-51`, `src/itemBuilderFixtures.js:21-33`, `src/itemBuilderData.test.js:74`, `tools/checks/golden-dropcalc-legacy.mjs:21-25`, `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-10-11-stat-engine-affixes-design.md` (plan-time refinements, Step 9)

**Interfaces:**
- Produces: the layout every later task reads. Standard tables: `public/data/standard/data/global/excel/<Name>.txt`.

- [ ] **Step 1: Take the "before" desktop screenshots**

Start the dev server (see Global Constraints) on the branch as it is (only docs differ from main), then shoot every tab:

```bash
cd tools/checks && node compare-desktop.mjs before http://localhost:5190/TheArchivistSoE/
```

Expected: 20 lines `shot before <tab>`; PNGs in `tools/checks/shots/desktop-before/`. Stop the dev server.

- [ ] **Step 2: Move the tables**

```bash
cd /home/emanresu/TheArchivistSoE
for mode in standard damnation; do
  mkdir -p public/data/$mode/data/global/excel
  git mv public/data/$mode/*.txt public/data/$mode/data/global/excel/
done
git status --short | head -30
```

Expected: 22 renames (12 standard, 10 damnation). `DropCalculator.json`, `ItemBuilder.json` and `damnation/Uniques.json` stay where they are.

- [ ] **Step 3: Point the plugins at the new paths**

In `vite.config.js`, add after `const DROP_CALC_MODES = ['standard', 'damnation']`:

```js

// The game tables keep their paths inside the game's MPQs, under public/data/<mode>/.
const EXCEL_DIR = path.join('data', 'global', 'excel')
```

In `dropCalcData()`'s `generate`, replace

```js
    const texts = Object.fromEntries(DROP_CALC_TABLES.map((name) => [name, readFileSync(path.join(dir, `${name}.txt`), 'utf8')]))
```

with

```js
    const texts = Object.fromEntries(DROP_CALC_TABLES.map((name) => [name, readFileSync(path.join(dir, EXCEL_DIR, `${name}.txt`), 'utf8')]))
```

Replace the watcher's path test

```js
        const [mode, name, ...rest] = path.relative(dataDir, file).split(path.sep)
        if (rest.length || !DROP_CALC_MODES.includes(mode) || !name?.endsWith('.txt')) return
```

with

```js
        // <mode>/data/global/excel/<name>.txt: anything shallower or deeper is not a table.
        const [mode, ...rest] = path.relative(dataDir, file).split(path.sep)
        const name = rest.pop()
        if (rest.join('/') !== 'data/global/excel' || !DROP_CALC_MODES.includes(mode) || !name?.endsWith('.txt')) return
```

Update the plugin's comment `from that folder's .txt tables` to `from that mode's data/global/excel/ tables`.

In `itemBuilderData()`, replace both `path.join(dataDir, 'standard', \`${name}.txt\`)` (in `generate` and in `configureServer`'s `sources`) with `path.join(dataDir, 'standard', EXCEL_DIR, \`${name}.txt\`)`.

- [ ] **Step 4: Point the Node readers at the new paths**

`src/dropCalcFixtures.js`, in `readDropCalcTexts`:

```js
        name, readFileSync(new URL(`${mode}/data/global/excel/${name}.txt`, DATA), "utf8"),
```

`src/itemBuilderFixtures.js`, in `readItemBuilderInputs`:

```js
        texts: Object.fromEntries(ITEM_BUILDER_TABLES.map((name) => [name, readText(`standard/data/global/excel/${name}.txt`)])),
```

`src/itemBuilderData.test.js:74`:

```js
    const texts = {MagicPrefix: readText("standard/data/global/excel/MagicPrefix.txt"), MagicSuffix: readText("standard/data/global/excel/MagicSuffix.txt")};
```

`tools/checks/golden-dropcalc-legacy.mjs` (the legacy code still fetches the flat `data/<mode>/<file>.txt`):

```js
// The legacy loadTxt fetches "data/<mode>/<file>.txt"; serve it from the tables' in-MPQ paths.
globalThis.fetch = async (url) => {
    const [mode, file] = url.split("/").slice(-2);
    return {ok: true, text: async () => readFileSync(new URL(`${mode}/data/global/excel/${file}`, DATA), "utf8")};
};
```

- [ ] **Step 5: Run the tests and the build**

```bash
npm test && npm run lint && npm run build
```

Expected: every test passes, the golden snapshot is unchanged (no `Snapshots … written/updated` line), lint reports nothing, the build succeeds. `git status` must not list `src/__snapshots__/dropCalc.golden.txt`.

- [ ] **Step 6: Check the dev watcher still regenerates**

Start the dev server, then:

```bash
touch public/data/standard/data/global/excel/MonStats.txt public/data/damnation/data/global/excel/Levels.txt
timeout 20 bash -c 'until [ "$(grep -c "drop-calc-data: regenerated" /tmp/claude-1000/dev.log)" -ge 2 ]; do sleep 1; done'
grep "drop-calc-data: regenerated" /tmp/claude-1000/dev.log
```

Expected: `drop-calc-data: regenerated standard/DropCalculator.json` and `... damnation/DropCalculator.json`. Stop the dev server.

- [ ] **Step 7: Update CLAUDE.md**

In `CLAUDE.md`:
- The Item Builder paragraph's data-update sentence: "copy `MagicPrefix.txt` and `MagicSuffix.txt` from the mod repo (…`standard-mode/data/global/excel/`)" becomes "copy them into `public/data/standard/data/global/excel/`".
- The `public/data/standard/*.txt`, `public/data/damnation/*.txt` bullet becomes `public/data/<mode>/data/global/excel/*.txt`: "raw game tables at their in-MPQ paths (MonStats, TreasureClassEx, Weapons, …)", and "when a `.txt` file changes" stays.
- The `item-builder-data` bullet: "from the standard `.txt` tables" becomes "from the standard `data/global/excel/` tables".

- [ ] **Step 8: Commit the move**

```bash
git add -A public/data vite.config.js src/dropCalcFixtures.js src/itemBuilderFixtures.js src/itemBuilderData.test.js tools/checks/golden-dropcalc-legacy.mjs CLAUDE.md
git commit -m "Move the game tables to their in-MPQ paths (data/global/excel/); every reader and the drop-calc watcher follow"
```

- [ ] **Step 9: Fold the plan-time refinements into the spec**

These came from reading D2ItemToolkit (an MIT reimplementation of the 1.14d tooltip writer, diff-tested against game output) and D2MOO while writing this plan. Edit `docs/superpowers/specs/2026-10-11-stat-engine-affixes-design.md`:

1. Status line: replace "awaiting the user's review of this file" with "approved by the user (2026-10-12) after the in-game checks; refined while planning (see the plan's Task 1)".
2. "Description" step 6 (Order): replace "A pair or group line takes its highest member's priority." with "A pair line takes its min stat's priority (the higher of the two). A group line takes the priority of its member with the lowest stat id, which is the member the game prints it for (D2ItemToolkit `isGrouped`: the primary is the lowest id)."
3. Step 4, the repair special case: replace "with 1 and ⌊100 / value⌋" with "with 1 and ⌊(⌊2500 / value⌋ + 12) / 25⌋, or `ModStre9t` "Repairs %d durability per second" with 1 when ⌊2500 / value⌋ is 30 or less (D2ItemToolkit `formatRepair`; for SoE's params 3 and 5 this equals ⌊100 / value⌋)".
4. Step 4, sockets: replace "`strSocketedDisplay` "Socketed (n)"" with "`Socketable` "Socketed", a space and "(n)" (string index 3453, the key the game's hardcoded lookup uses)". In "Errors" and in the extractor paragraph, replace `strSocketedDisplay` with `Socketable`, and `ModStre10d` with `ModStre9t` in the list of hardcoded keys (`ModStre10d` is `item_charged_skill`'s own `descstrpos`).
5. Step 2 (Pairs): after "otherwise the range string" add "The game prints the single string when min ≥ max, with the max. Physical min and max damage print `strModMinDamageRange` only when min is below max; otherwise each prints its own line."
6. Step 4: after "a range prints `a-b`, or `-a to -b` when negative" add "(smaller magnitude first: "-2 to -4")".
7. "Expansion": replace "Funcs 1, 2, 8 and 13 take min..max." with "Funcs 1, 2 and 21 take min..max; funcs 3, 5–8, 10 and 14 reuse the first slot's value when it is set (D2MOO passes `nFirstValue`, the first slot's result, to every later slot)." Add: "Func 10's layer is `param % 3 + 8 · ⌊param / 3⌋` (D2MOO writes `8 * param / 3`, a precedence slip; the tooltip decodes class = layer >> 3, tab = layer & 7)."
8. Modules table: `statData.js` also exports `HARDCODED_STRINGS`; `statEngine.js`'s API is `expandMods(mods, dict, ctx)`, `describe(entries, dict)` (lines with their Stat filter key and label) and `checkEntries(entries, dict)` (the loud checks). Replace "`statKeysOf(mods, dict)` → filter keys; `statOptionLabel(key, dict)`" accordingly, and in `statData.js`'s row replace "Runs the loud checks." with "Checks its columns; the engine's `checkEntries` runs the other loud checks."
9. "The Stat filter", Matching: replace "(the group line's label without the value, e.g. "All Resistances")" with "(the group's own name, from its `dgrpstr2` or `dgrpstrpos` without value tokens, a leading "to " or a trailing ":", e.g. "All Resistances", "all Attributes")". Labels: add "When one key prints in two forms (a pair's single and range strings), the label is the form most rows print."
10. "Generated `Affixes.json`", item types: replace "(`lcha` → "Grand Charm", `mcha` → "Large Charm", and the PVP charm types)" with "(`lcha` → "Grand Charm", `mcha` → "Large Charm", `lchp`/`mchp` → "Grand/Large Charm PVP", `misl` → "Bow/Crossbow Quiver")", and replace "shared with the builder's existing overrides in `itemBuilderData.js`" with "kept in `affixData.js`".
11. "Errors", warnings: unknown codes and unknown item types are each one warning per code, listing the row keys.

Commit:

```bash
git add docs/superpowers/specs/2026-10-11-stat-engine-affixes-design.md
git commit -m "Stat engine spec: plan-time refinements (group priority, repair, socket string, pair rules, func 10 layer, via names, type overrides)"
```

---

### Task 2: The `.tbl` decoder and SoE's string table

**Files:**
- Create: `src/tblFile.js`, `src/tblFile.test.js`, `src/statFixtures.js`
- Add: `public/data/standard/data/local/LNG/ENG/patchstring.tbl` (copied from the vault)

**Interfaces:**
- Produces: `parseTbl(bytes: Uint8Array): Map<string, string>`. `statFixtures.js` (Node-only): `tableText(columns, rows)`, `readExcel(name)`, `readPatchStrings()`, `tblBytes(nodes, hashSize)`.

- [ ] **Step 1: Add SoE's string table**

```bash
mkdir -p public/data/standard/data/local/LNG/ENG
cp /home/emanresu/TheArchivistSoE/docs/research/stat-summing/modrepo/patchstring.tbl public/data/standard/data/local/LNG/ENG/
cmp public/data/standard/data/local/LNG/ENG/patchstring.tbl /home/emanresu/TheArchivistSoE/docs/research/stat-summing/modrepo/patchstring.tbl && echo same
```

Expected: `same` (323,963 bytes).

- [ ] **Step 2: Write the test fixtures module**

Create `src/statFixtures.js`:

```js
// Node-only helpers for the stat engine's and the affix data's tests (node:fs for the real tables), so
// the app must never import this module.
import {readFileSync} from "node:fs";
import {parseTbl} from "./tblFile.js";

const STANDARD = new URL("../public/data/standard/", import.meta.url);

// A tab-separated table with a header line and one line per row object; missing cells are "".
export function tableText(columns, rows) {
    return [columns.join("\t"), ...rows.map((row) => columns.map((c) => row[c] ?? "").join("\t"))].join("\n") + "\n";
}

// One of the standard mode's game tables, from its in-MPQ path.
export function readExcel(name) {
    return readFileSync(new URL(`data/global/excel/${name}.txt`, STANDARD), "utf8");
}

export function readPatchStrings() {
    return parseTbl(new Uint8Array(readFileSync(new URL("data/local/LNG/ENG/patchstring.tbl", STANDARD))));
}

// A .tbl file built in memory. nodes: [{slot, key, value, hash = slot, active = true}] in the hash table
// of `hashSize` slots; values are written as UTF-8 with a trailing NUL. `valueBytes` overrides a value's
// bytes (to test invalid UTF-8).
export function tblBytes(nodes, hashSize = 8) {
    const enc = new TextEncoder();
    const header = 21;
    const indexBytes = 2 * nodes.length;
    const nodesAt = header + indexBytes;
    let at = nodesAt + 17 * hashSize;
    const strings = [];
    const placed = nodes.map((n) => {
        const key = enc.encode(`${n.key}\0`);
        const value = n.valueBytes ?? enc.encode(`${n.value}\0`);
        const keyAt = at;
        at += key.length;
        const valueAt = at;
        at += value.length;
        strings.push(key, value);
        return {...n, keyAt, valueAt, valueLength: value.length};
    });
    const bytes = new Uint8Array(at);
    const view = new DataView(bytes.buffer);
    view.setUint16(2, nodes.length, true);
    view.setUint32(4, hashSize, true);
    bytes[8] = 0;
    view.setUint32(9, nodesAt + 17 * hashSize, true);
    view.setUint32(13, hashSize, true);
    view.setUint32(17, at, true);
    placed.forEach((n, i) => {
        view.setUint16(header + 2 * i, n.slot, true);
        const o = nodesAt + 17 * n.slot;
        bytes[o] = n.active === false ? 0 : 1;
        view.setUint16(o + 1, i, true);
        view.setUint32(o + 3, n.hash ?? n.slot, true);
        view.setUint32(o + 7, n.keyAt, true);
        view.setUint32(o + 11, n.valueAt, true);
        view.setUint16(o + 15, n.valueLength, true);
    });
    let offset = nodesAt + 17 * hashSize;
    for (const s of strings) {
        bytes.set(s, offset);
        offset += s.length;
    }
    return bytes;
}
```

- [ ] **Step 3: Write the failing tests**

Create `src/tblFile.test.js`:

```js
import {describe, expect, it} from "vitest";
import {parseTbl} from "./tblFile.js";
import {readPatchStrings, tblBytes} from "./statFixtures.js";

describe("parseTbl", () => {
    it("reads keys and UTF-8 values, dropping the trailing NUL", () => {
        const strings = parseTbl(tblBytes([{slot: 2, key: "MapGlobMF", value: "ÿc0Magic Find:ÿc3"}, {slot: 5, key: "a", value: "b"}]));
        expect(strings.get("MapGlobMF")).toBe("ÿc0Magic Find:ÿc3");
        expect(strings.get("a")).toBe("b");
        expect(strings.size).toBe(2);
    });

    it("resolves a duplicated key the way the game's hash probe does, not by file order", () => {
        // Both nodes hash to slot 5. Probing from 5 wraps 5, 6, 7, 0, 1: slot 1 is reached before slot 3.
        const strings = parseTbl(tblBytes([
            {slot: 3, key: "StrSklTabItem6", value: "+%d to Summoning Skills", hash: 5},
            {slot: 1, key: "StrSklTabItem6", value: "+%d to Combat Skills", hash: 5},
        ]));
        expect(strings.get("StrSklTabItem6")).toBe("+%d to Combat Skills");
    });

    it("skips inactive nodes and empty keys", () => {
        const strings = parseTbl(tblBytes([{slot: 0, key: "gone", value: "x", active: false}, {slot: 1, key: "", value: "skill text"}]));
        expect(strings.size).toBe(0);
    });

    it("rejects a header whose file size disagrees, and a value that isn't UTF-8", () => {
        const bytes = tblBytes([{slot: 0, key: "a", value: "b"}]);
        expect(() => parseTbl(bytes.subarray(0, bytes.length - 1))).toThrow(/header says/);
        expect(() => parseTbl(tblBytes([{slot: 0, key: "bad", valueBytes: new Uint8Array([0xff, 0])}]))).toThrow(/"bad".*not valid UTF-8/);
    });
});

describe("SoE's patchstring.tbl", () => {
    const strings = readPatchStrings();

    it("decodes the keys the spec names", () => {
        expect(strings.get("StrSklTabItem6")).toBe("+%d to Combat Skills");
        expect(strings.get("strModEnhancedDamage")).toBe("Enhanced Damage\n");
        expect(strings.get("MapGlobMF")).toBe("ÿc0Magic Find:ÿc3");
        expect(strings.size).toBeGreaterThan(4000);
    });
});
```

- [ ] **Step 4: Run them to see them fail**

Run: `npx vitest run src/tblFile.test.js`
Expected: FAIL, `Failed to resolve import "./tblFile.js"`.

- [ ] **Step 5: Write the decoder**

Create `src/tblFile.js`:

```js
// Diablo II string tables (.tbl): a 21-byte header, a u16 index per string, then a hash table of
// 17-byte nodes. Keys and values are UTF-8 (the colour code byte ÿ is C3 BF). Pure, so it runs in
// Vite, Vitest and Node tools; it takes bytes, never a path.

const HEADER_SIZE = 21;
const NODE_SIZE = 17;

const utf8 = new TextDecoder("utf-8", {fatal: true});

// bytes: a Uint8Array of the whole file. Returns a Map of key -> string. A key stored more than once
// resolves the way the game's lookup does: probing from the key's hash modulo the table size, the first
// active node with that key wins (file order would give the wrong answer for 6 of SoE's keys). Nodes
// with an empty key are skipped: the game never looks one up.
export function parseTbl(bytes) {
    if (bytes.length < HEADER_SIZE) throw new Error(`.tbl: ${bytes.length} bytes is shorter than the header`);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = view.getUint16(2, true);
    const hashSize = view.getUint32(4, true);
    const fileSize = view.getUint32(17, true);
    if (fileSize !== bytes.length) throw new Error(`.tbl: the header says ${fileSize} bytes, the file has ${bytes.length}`);
    const nodesAt = HEADER_SIZE + 2 * count;
    if (nodesAt + hashSize * NODE_SIZE > bytes.length) throw new Error(".tbl: the hash table runs past the end of the file");

    const text = (start, end, what) => {
        try {
            return utf8.decode(bytes.subarray(start, end));
        } catch {
            throw new Error(`.tbl: ${what} at byte ${start} is not valid UTF-8`);
        }
    };

    // key -> {slot, distance}: the node the game's probe reaches first.
    const best = new Map();
    for (let slot = 0; slot < hashSize; slot++) {
        const at = nodesAt + slot * NODE_SIZE;
        if (!bytes[at]) continue;
        const hash = view.getUint32(at + 3, true);
        const keyAt = view.getUint32(at + 7, true);
        const keyEnd = bytes.indexOf(0, keyAt);
        const key = text(keyAt, keyEnd < 0 ? bytes.length : keyEnd, "a key");
        if (!key) continue;
        const distance = (slot - (hash % hashSize) + hashSize) % hashSize;
        const seen = best.get(key);
        if (!seen || distance < seen.distance) best.set(key, {slot, distance});
    }

    const strings = new Map();
    for (const [key, {slot}] of best) {
        const at = nodesAt + slot * NODE_SIZE;
        const valueAt = view.getUint32(at + 11, true);
        const length = view.getUint16(at + 15, true);
        let end = valueAt + length;
        while (end > valueAt && bytes[end - 1] === 0) end--;
        strings.set(key, text(valueAt, end, `the value of "${key}"`));
    }
    return strings;
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/tblFile.test.js && npm run lint`
Expected: 5 tests pass; lint clean.

- [ ] **Step 7: Commit**

```bash
git add src/tblFile.js src/tblFile.test.js src/statFixtures.js public/data/standard/data/local/LNG/ENG/patchstring.tbl
git commit -m "tblFile: decode .tbl string tables (UTF-8, duplicate keys by the game's hash probe); SoE's patchstring.tbl at its in-MPQ path"
```

---

### Task 3: The stat dictionary, its tables and the base strings

**Files:**
- Add: `public/data/standard/data/global/excel/{Properties,ItemStatCost,CharStats,Skills,Skilldesc}.txt` (from the vault)
- Create: `src/statData.js`, `src/statData.test.js`, `tools/extract-base-strings.mjs`, `src/baseStrings.json` (generated)
- Modify: `src/statFixtures.js` (whole file below)

**Interfaces:**
- Consumes: `parseTbl` (Task 2); `parseTxt(text)` from `src/dropCalcData.js`.
- Produces: `buildStatData({texts, patchStrings, baseStrings})` → `dict = {properties: Map<code, [{func, stat, set, val}]>, stats: Map<name, {name, id, priority, func, val, pos, neg, str2, group, groupFunc, groupVal, groupPos, groupNeg, groupStr2, op, perLevelShift}>, groups: Map<dgrp, [stat names by id]>, classes: [{name, allSkills, tabs: [3 keys], classOnly}], skills: Map<id, {id, name, nameKey, reqlevel, maxlvl}>, skillIds: Map<lower name, id>, string(key) → string|null}`; `skillOf(dict, param)`, `skillName(dict, skill)`; `STAT_TABLES`, `STAT_TABLE_COLUMNS`, `HARDCODED_STRINGS`. Fixtures: `readBaseStrings()`, `readStatInputs()`, `realStatData()` (cached).

- [ ] **Step 1: Add the five tables**

```bash
V=/home/emanresu/TheArchivistSoE/docs/research/stat-summing/modrepo
for n in Properties ItemStatCost CharStats Skills Skilldesc; do cp $V/$n.txt public/data/standard/data/global/excel/; done
git status --short public/data
```

Expected: five new `.txt` files (LF line endings, ASCII).

- [ ] **Step 2: Write the dictionary**

Create `src/statData.js`:

```js
// The stat dictionary: what the stat engine (src/statEngine.js) needs from the game's tables, read once.
// Properties.txt turns an affix mod into stats, ItemStatCost.txt describes each stat, CharStats.txt
// names the class skill lines, Skills.txt and Skilldesc.txt name skills. Strings resolve through SoE's
// patchstring.tbl first, then the base game's strings (src/baseStrings.json). Pure, so it runs in Vite,
// Vitest and Node tools.
import {parseTxt} from "./dropCalcData.js";

const numbered = (prefix, n) => Array.from({length: n}, (_, i) => `${prefix}${i + 1}`);

// Per table, the columns read. A missing one fails the build.
export const STAT_TABLE_COLUMNS = {
    Properties: ["code", ...[1, 2, 3, 4, 5, 6, 7].flatMap((i) => [`set${i}`, `val${i}`, `func${i}`, `stat${i}`])],
    ItemStatCost: ["Stat", "ID", "op", "op param", "op base", "descpriority", "descfunc", "descval", "descstrpos",
        "descstrneg", "descstr2", "dgrp", "dgrpfunc", "dgrpval", "dgrpstrpos", "dgrpstrneg", "dgrpstr2"],
    CharStats: ["class", "StrAllSkills", ...numbered("StrSkillTab", 3), "StrClassOnly"],
    Skills: ["skill", "Id", "skilldesc", "reqlevel", "maxlvl"],
    Skilldesc: ["skilldesc", "str name"],
};

export const STAT_TABLES = Object.keys(STAT_TABLE_COLUMNS);

// The string keys the stat engine uses without any table naming them: the damage pairs, repair, charges
// and sockets. tools/extract-base-strings.mjs keeps them in src/baseStrings.json.
export const HARDCODED_STRINGS = [
    "strModMinDamage", "strModMinDamageRange", "strModEnhancedDamage",
    "strModFireDamage", "strModFireDamageRange", "strModLightningDamage", "strModLightningDamageRange",
    "strModMagicDamage", "strModMagicDamageRange", "strModColdDamage", "strModColdDamageRange",
    "strModPoisonDamage", "strModPoisonDamageRange",
    "ModStre9t", "ModStre9u", "ModStre10b", "Socketable",
];

const cell = (v) => (v ?? "").trim();
const int = (v, fallback = 0) => {
    const x = Number.parseInt(v, 10);
    return Number.isFinite(x) ? x : fallback;
};

function checkStatColumns(table, text) {
    if (typeof text !== "string") throw new Error(`${table}.txt: missing`);
    const first = text.replace(/\r\n/g, "\n").split("\n")[0] ?? "";
    const have = new Set(first.split("\t").map((h) => h.trim()));
    const missing = STAT_TABLE_COLUMNS[table].filter((c) => !have.has(c));
    if (missing.length) {
        throw new Error(`${table}.txt: missing required column(s) ${missing.map((c) => `"${c}"`).join(", ")}`);
    }
}

// inputs: {texts: {[table]: .txt content}, patchStrings: Map from parseTbl, baseStrings: {key: string}}.
export function buildStatData({texts, patchStrings, baseStrings}) {
    for (const table of STAT_TABLES) checkStatColumns(table, texts[table]);

    // An empty key is absent: the patch table maps "" to a skill description.
    const string = (key) => (key ? patchStrings.get(key) ?? baseStrings[key] ?? null : null);

    // Codes are matched case-insensitively, as the game does ("Deep-Wounds" is deep-wounds).
    const properties = new Map();
    for (const row of parseTxt(texts.Properties)) {
        const code = cell(row.code).toLowerCase();
        if (!code || properties.has(code)) continue;
        const slots = [1, 2, 3, 4, 5, 6, 7]
            .map((i) => ({func: int(row[`func${i}`]), stat: cell(row[`stat${i}`]), set: int(row[`set${i}`]), val: int(row[`val${i}`])}))
            .filter((s) => s.func > 0);
        properties.set(code, slots);
    }

    const stats = new Map();
    const groups = new Map();
    for (const row of parseTxt(texts.ItemStatCost)) {
        const name = cell(row.Stat);
        if (!name) continue;
        const stat = {
            name,
            id: int(row.ID),
            priority: int(row.descpriority),
            func: int(row.descfunc),
            val: int(row.descval),
            pos: cell(row.descstrpos),
            neg: cell(row.descstrneg),
            str2: cell(row.descstr2),
            group: int(row.dgrp),
            groupFunc: int(row.dgrpfunc),
            groupVal: int(row.dgrpval),
            groupPos: cell(row.dgrpstrpos),
            groupNeg: cell(row.dgrpstrneg),
            groupStr2: cell(row.dgrpstr2),
            op: int(row.op),
            // Per-level stats: the value counts in 1 / 2^perLevelShift per character level.
            perLevelShift: [2, 4, 5].includes(int(row.op)) && cell(row["op base"]) === "level" ? int(row["op param"]) : null,
        };
        stats.set(name, stat);
        if (stat.group) groups.set(stat.group, [...(groups.get(stat.group) ?? []), name]);
    }
    for (const members of groups.values()) members.sort((a, b) => stats.get(a).id - stats.get(b).id);

    // Class ids count the CharStats rows that have a class string ("Expansion" has none).
    const classes = parseTxt(texts.CharStats)
        .filter((row) => cell(row.StrAllSkills))
        .map((row) => ({
            name: cell(row.class),
            allSkills: cell(row.StrAllSkills),
            tabs: numbered("StrSkillTab", 3).map((c) => cell(row[c])),
            classOnly: cell(row.StrClassOnly),
        }));

    const nameKeys = new Map(parseTxt(texts.Skilldesc).map((row) => [cell(row.skilldesc), cell(row["str name"])]));
    const skills = new Map();
    const skillIds = new Map();
    for (const row of parseTxt(texts.Skills)) {
        const name = cell(row.skill);
        if (!name) continue;
        const id = int(row.Id);
        skills.set(id, {id, name, nameKey: nameKeys.get(cell(row.skilldesc)) ?? "", reqlevel: int(row.reqlevel), maxlvl: int(row.maxlvl)});
        if (!skillIds.has(name.toLowerCase())) skillIds.set(name.toLowerCase(), id);
    }

    return {properties, stats, groups, classes, skills, skillIds, string};
}

// A mod's skill param: a Skills.txt Id, or a skill name (matched case-insensitively). Throws when
// neither matches: the game would drop the mod, so the data is wrong.
export function skillOf(dict, param) {
    const p = cell(String(param ?? ""));
    const id = /^\d+$/.test(p) ? Number(p) : dict.skillIds.get(p.toLowerCase());
    const skill = dict.skills.get(id);
    if (!skill) throw new Error(`skill "${p}" is not in Skills.txt`);
    return skill;
}

// The skill's display name, or null when Skilldesc.txt has no name for it (skill 358, a map proc).
export function skillName(dict, skill) {
    return dict.string(skill.nameKey);
}
```

- [ ] **Step 3: Write the base-strings extractor and generate the file**

Create `tools/extract-base-strings.mjs`:

```js
// Writes src/baseStrings.json: the base game's strings (string.tbl, expansionstring.tbl) for every key the
// committed tables or the stat engine can ask for. Run it with your own copies of the two tables, extracted
// from Diablo II's MPQs (data\local\lng\eng\), when a data update makes the build's string check fail:
//   node tools/extract-base-strings.mjs <string.tbl> <expansionstring.tbl>
// Keys the patch table also has are kept, so a later SoE patch that drops one still builds. Blizzard's
// full tables are never committed; this file holds only the referenced keys.
import {readFileSync, writeFileSync} from "node:fs";
import {parseTxt} from "../src/dropCalcData.js";
import {parseTbl} from "../src/tblFile.js";
import {HARDCODED_STRINGS} from "../src/statData.js";

const [stringPath, expansionPath] = process.argv.slice(2);
if (!stringPath || !expansionPath) throw new Error("usage: node tools/extract-base-strings.mjs <string.tbl> <expansionstring.tbl>");

const EXCEL = new URL("../public/data/standard/data/global/excel/", import.meta.url);
const OUT = new URL("../src/baseStrings.json", import.meta.url);
const table = (name) => parseTxt(readFileSync(new URL(`${name}.txt`, EXCEL), "utf8"));

// The fixed list of places a string key can come from (an empty key is absent).
const SOURCES = {
    ItemStatCost: ["descstrpos", "descstrneg", "descstr2", "dgrpstrpos", "dgrpstrneg", "dgrpstr2"],
    CharStats: ["StrAllSkills", "StrSkillTab1", "StrSkillTab2", "StrSkillTab3", "StrClassOnly"],
    Skilldesc: ["str name"],
};
const keys = new Set(HARDCODED_STRINGS);
for (const [name, columns] of Object.entries(SOURCES)) {
    for (const row of table(name)) {
        for (const c of columns) {
            const key = (row[c] ?? "").trim();
            if (key) keys.add(key);
        }
    }
}

// The game looks a key up in the patch table, then the expansion table, then the base table.
const expansion = parseTbl(new Uint8Array(readFileSync(expansionPath)));
const base = parseTbl(new Uint8Array(readFileSync(stringPath)));
const out = {};
for (const key of [...keys].sort()) {
    const value = expansion.get(key) ?? base.get(key);
    if (value !== undefined) out[key] = value;
}
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${Object.keys(out).length} of ${keys.size} referenced keys to src/baseStrings.json`);
```

Run it with the user's tables from the vault:

```bash
V=/home/emanresu/TheArchivistSoE/docs/research/stat-summing/modrepo
node tools/extract-base-strings.mjs $V/string.tbl $V/expansionstring.tbl
head -4 src/baseStrings.json
```

Expected: `wrote 334 of 618 referenced keys to src/baseStrings.json`, about 11.6 KB, starting with `"AmaOnly": "(Amazon Only)"`. (The other referenced keys resolve from `patchstring.tbl`.)

- [ ] **Step 4: Extend the fixtures**

Replace `src/statFixtures.js` with:

```js
// Node-only helpers for the stat engine's and the affix data's tests (node:fs for the real tables), so
// the app must never import this module.
import {readFileSync} from "node:fs";
import {parseTbl} from "./tblFile.js";
import {STAT_TABLES, buildStatData} from "./statData.js";

const STANDARD = new URL("../public/data/standard/", import.meta.url);

// A tab-separated table with a header line and one line per row object; missing cells are "".
export function tableText(columns, rows) {
    return [columns.join("\t"), ...rows.map((row) => columns.map((c) => row[c] ?? "").join("\t"))].join("\n") + "\n";
}

// One of the standard mode's game tables, from its in-MPQ path.
export function readExcel(name) {
    return readFileSync(new URL(`data/global/excel/${name}.txt`, STANDARD), "utf8");
}

export function readPatchStrings() {
    return parseTbl(new Uint8Array(readFileSync(new URL("data/local/LNG/ENG/patchstring.tbl", STANDARD))));
}

export function readBaseStrings() {
    return JSON.parse(readFileSync(new URL("./baseStrings.json", import.meta.url), "utf8"));
}

// Everything buildStatData reads, from the real files.
export function readStatInputs() {
    return {
        texts: Object.fromEntries(STAT_TABLES.map((name) => [name, readExcel(name)])),
        patchStrings: readPatchStrings(),
        baseStrings: readBaseStrings(),
    };
}

let realDict = null;
export function realStatData() {
    realDict ??= buildStatData(readStatInputs());
    return realDict;
}

// A .tbl file built in memory. nodes: [{slot, key, value, hash = slot, active = true}] in the hash table
// of `hashSize` slots; values are written as UTF-8 with a trailing NUL. `valueBytes` overrides a value's
// bytes (to test invalid UTF-8).
export function tblBytes(nodes, hashSize = 8) {
    const enc = new TextEncoder();
    const header = 21;
    const indexBytes = 2 * nodes.length;
    const nodesAt = header + indexBytes;
    let at = nodesAt + 17 * hashSize;
    const strings = [];
    const placed = nodes.map((n) => {
        const key = enc.encode(`${n.key}\0`);
        const value = n.valueBytes ?? enc.encode(`${n.value}\0`);
        const keyAt = at;
        at += key.length;
        const valueAt = at;
        at += value.length;
        strings.push(key, value);
        return {...n, keyAt, valueAt, valueLength: value.length};
    });
    const bytes = new Uint8Array(at);
    const view = new DataView(bytes.buffer);
    view.setUint16(2, nodes.length, true);
    view.setUint32(4, hashSize, true);
    bytes[8] = 0;
    view.setUint32(9, nodesAt + 17 * hashSize, true);
    view.setUint32(13, hashSize, true);
    view.setUint32(17, at, true);
    placed.forEach((n, i) => {
        view.setUint16(header + 2 * i, n.slot, true);
        const o = nodesAt + 17 * n.slot;
        bytes[o] = n.active === false ? 0 : 1;
        view.setUint16(o + 1, i, true);
        view.setUint32(o + 3, n.hash ?? n.slot, true);
        view.setUint32(o + 7, n.keyAt, true);
        view.setUint32(o + 11, n.valueAt, true);
        view.setUint16(o + 15, n.valueLength, true);
    });
    let offset = nodesAt + 17 * hashSize;
    for (const s of strings) {
        bytes.set(s, offset);
        offset += s.length;
    }
    return bytes;
}
```

- [ ] **Step 5: Write the tests**

Create `src/statData.test.js`:

```js
import {describe, expect, it} from "vitest";
import {STAT_TABLE_COLUMNS, buildStatData, skillName, skillOf} from "./statData.js";
import {realStatData, tableText} from "./statFixtures.js";

// Small tables with just the columns buildStatData reads.
function tinyTexts(overrides = {}) {
    return {
        Properties: tableText(STAT_TABLE_COLUMNS.Properties, [
            {code: "deep-wounds", func1: "1", stat1: "deep_wounds"},
            {code: "res-all", func1: "1", stat1: "fireresist", func2: "3", stat2: "coldresist"},
            {code: "ama", func1: "21", stat1: "item_addclassskills", val1: "0"},
        ]),
        ItemStatCost: tableText(STAT_TABLE_COLUMNS.ItemStatCost, [
            {Stat: "coldresist", ID: "43", descpriority: "40", descfunc: "4", descval: "2", descstrpos: "ModStr1k", descstrneg: "ModStr1k", dgrp: "2", dgrpfunc: "19", dgrpstrpos: "strModAllResistances"},
            {Stat: "fireresist", ID: "39", descpriority: "36", descfunc: "4", descval: "2", descstrpos: "ModStr1j", dgrp: "2", dgrpfunc: "19", dgrpstrpos: "strModAllResistances"},
            {Stat: "item_hp_perlevel", ID: "216", op: "2", "op param": "3", "op base": "level", descfunc: "6"},
            {Stat: "item_armor_percent", ID: "16", op: "13", descfunc: "4"},
        ]),
        CharStats: tableText(STAT_TABLE_COLUMNS.CharStats, [
            {class: "Amazon", StrAllSkills: "ModStr3a", StrSkillTab1: "StrSklTabItem3", StrSkillTab2: "StrSklTabItem2", StrSkillTab3: "StrSklTabItem1", StrClassOnly: "AmaOnly"},
            {class: "Expansion"},
            {class: "Druid", StrAllSkills: "ModStre8a_PD2", StrClassOnly: "DruOnly"},
        ]),
        Skills: tableText(STAT_TABLE_COLUMNS.Skills, [
            {skill: "Teleport", Id: "54", skilldesc: "teleport", reqlevel: "18", maxlvl: "20"},
            {skill: "proc_SplashDamage", Id: "358", skilldesc: "proc skill", reqlevel: "1"},
        ]),
        Skilldesc: tableText(STAT_TABLE_COLUMNS.Skilldesc, [{skilldesc: "teleport", "str name": "skillname54"}]),
        ...overrides,
    };
}

const tiny = (overrides) => buildStatData({
    texts: tinyTexts(overrides),
    patchStrings: new Map([["ModStr1k", "Cold Resist (patch)"], ["", "a skill description"]]),
    baseStrings: {ModStr1k: "Cold Resist", ModStr1j: "Fire Resist", skillname54: "Teleport"},
});

describe("buildStatData", () => {
    it("indexes property codes in lower case, with their func slots", () => {
        const dict = tiny();
        expect(dict.properties.get("deep-wounds")).toEqual([{func: 1, stat: "deep_wounds", set: 0, val: 0}]);
        expect(dict.properties.get("res-all").map((s) => [s.func, s.stat])).toEqual([[1, "fireresist"], [3, "coldresist"]]);
        expect(dict.properties.get("ama")[0].val).toBe(0);
    });

    it("reads each stat's description fields and its per-level unit", () => {
        const dict = tiny();
        expect(dict.stats.get("coldresist")).toMatchObject({id: 43, priority: 40, func: 4, val: 2, pos: "ModStr1k", group: 2, groupFunc: 19, op: 0, perLevelShift: null});
        expect(dict.stats.get("item_hp_perlevel").perLevelShift).toBe(3);
        expect(dict.stats.get("item_armor_percent").perLevelShift).toBeNull(); // op 13 isn't per level
    });

    it("lists each dgrp group's members by stat id", () => {
        expect(tiny().groups.get(2)).toEqual(["fireresist", "coldresist"]);
    });

    it("numbers classes by the CharStats rows that have a class string", () => {
        const dict = tiny();
        expect(dict.classes.map((c) => c.name)).toEqual(["Amazon", "Druid"]);
        expect(dict.classes[0].tabs).toEqual(["StrSklTabItem3", "StrSklTabItem2", "StrSklTabItem1"]);
    });

    it("resolves strings from the patch table first, then the base strings; an empty key is absent", () => {
        const dict = tiny();
        expect(dict.string("ModStr1k")).toBe("Cold Resist (patch)");
        expect(dict.string("ModStr1j")).toBe("Fire Resist");
        expect(dict.string("nope")).toBeNull();
        expect(dict.string("")).toBeNull();
    });

    it("finds skills by Id or by name, and their names through Skilldesc.txt", () => {
        const dict = tiny();
        expect(skillOf(dict, "54")).toBe(skillOf(dict, "teleport"));
        expect(skillName(dict, skillOf(dict, 54))).toBe("Teleport");
        expect(skillOf(dict, "54")).toMatchObject({reqlevel: 18, maxlvl: 20});
        expect(skillName(dict, skillOf(dict, "358"))).toBeNull();
        expect(() => skillOf(dict, "Nope")).toThrow(/skill "Nope" is not in Skills\.txt/);
    });

    it("fails loudly on a missing table or column", () => {
        expect(() => tiny({Skills: undefined})).toThrow("Skills.txt: missing");
        expect(() => tiny({Skilldesc: "skilldesc\n"})).toThrow(/Skilldesc\.txt: missing required column\(s\) "str name"/);
    });
});

describe("the real stat tables", () => {
    const dict = realStatData();

    it("define the codes and units the engine relies on", () => {
        expect(dict.properties.get("res-all")).toHaveLength(4);
        expect(dict.properties.has("deep-wounds")).toBe(true);
        expect(dict.stats.get("item_tohit_perlevel").perLevelShift).toBe(1); // attack rating counts in halves
        expect(dict.stats.get("item_mana_perlevel").perLevelShift).toBe(3); // mana in eighths
        expect(dict.classes.map((c) => c.name)).toEqual(["Amazon", "Sorceress", "Necromancer", "Paladin", "Barbarian", "Druid", "Assassin"]);
    });

    it("name skills, except the map proc 358", () => {
        expect(skillName(dict, skillOf(dict, 54))).toBe("Teleport");
        expect(skillName(dict, skillOf(dict, 358))).toBeNull();
    });
});
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/statData.test.js src/tblFile.test.js && npm run lint`
Expected: 14 tests pass; lint clean. (If a test fails because a table's column is missing, the vault copy is the wrong file: re-copy it.)

- [ ] **Step 7: Commit**

```bash
git add public/data/standard/data/global/excel src/statData.js src/statData.test.js src/statFixtures.js tools/extract-base-strings.mjs src/baseStrings.json
git commit -m "statData: the stat dictionary from Properties/ItemStatCost/CharStats/Skills/Skilldesc and the string tables; extract-base-strings writes the trimmed baseStrings.json"
```

---

### Task 4: The engine's expansion: mods → stat entries

**Files:**
- Create: `src/statEngine.js`, `src/statEngine.test.js`

**Interfaces:**
- Consumes: `skillOf` (Task 3), `realStatData()` (fixtures).
- Produces: `expandMods(mods, dict, ctx)` → `{entries: [{stat, layer, min, max, skill?, level?: {min, max}}], unknown: [code]}`, where `mods = [{code, param, min, max}]` (min/max may be null) and `ctx.ilvl = {min, max}`; `skillLevelAt(skill, max, ilvl)`, `chargesAt(min, level)`.

- [ ] **Step 1: Write the failing tests**

Create `src/statEngine.test.js`:

```js
import {describe, expect, it} from "vitest";
import {chargesAt, expandMods, skillLevelAt} from "./statEngine.js";
import {realStatData} from "./statFixtures.js";

const dict = realStatData();
const mod = (code, min = null, max = null, param = "") => ({code, param, min, max});
const ILVL_99 = {ilvl: {min: 99, max: 99}};
const expand = (mods, ctx = ILVL_99) => expandMods(mods, dict, ctx);
const entries = (mods, ctx) => expand(mods, ctx).entries.map(({stat, layer, min, max}) => ({stat, layer, min, max}));

describe("skillLevelAt and chargesAt", () => {
    const teleport = {reqlevel: 18, maxlvl: 20};

    it("spread a negative max over the item levels from the skill's reqlevel to 99", () => {
        expect(skillLevelAt(teleport, -6, 99)).toBe(6); // ⌊81 / ⌊81/6⌋⌋
        expect(skillLevelAt(teleport, -3, 99)).toBe(3); // ⌊81 / 27⌋
        expect(skillLevelAt(teleport, -6, 18)).toBe(1); // at least 1
    });

    it("add a level per 4 item levels for max 0, up to maxlvl (20 when unset), and keep a positive max", () => {
        expect(skillLevelAt(teleport, 0, 30)).toBe(4);
        expect(skillLevelAt(teleport, 0, 99)).toBe(20);
        expect(skillLevelAt({reqlevel: 1, maxlvl: 0}, 0, 99)).toBe(20);
        expect(skillLevelAt(teleport, 7, 99)).toBe(7);
    });

    it("scale negative charges by the level, clamp to 1-255, and give 5 for 0", () => {
        expect(chargesAt(-30, 6)).toBe(52); // ⌊6·30/8⌋ + 30
        expect(chargesAt(-20, 3)).toBe(27);
        expect(chargesAt(0, 9)).toBe(5);
        expect(chargesAt(300, 1)).toBe(255);
    });
});

describe("expandMods", () => {
    it("funcs 1 and 2 roll min..max into one stat, swapping a reversed range", () => {
        expect(entries([mod("res-cold", 11, 20)])).toEqual([{stat: "coldresist", layer: 0, min: 11, max: 20}]);
        expect(entries([mod("res-cold", 20, 11)])).toEqual([{stat: "coldresist", layer: 0, min: 11, max: 20}]);
        expect(entries([mod("ac%", 10, 20)])).toEqual([{stat: "item_armor_percent", layer: 0, min: 10, max: 20}]);
    });

    it("func 3 and func 8 reuse the previous slot's value", () => {
        expect(entries([mod("res-all", 3, 6)]).map((e) => [e.stat, e.min, e.max])).toEqual([
            ["fireresist", 3, 6], ["lightresist", 3, 6], ["coldresist", 3, 6], ["poisonresist", 3, 6]]);
        expect(entries([mod("map-mon-att-cast-speed", 40, 60)]).map((e) => [e.stat, e.min, e.max])).toEqual([
            ["map_mon_fasterattackrate", 40, 60], ["map_mon_fastercastrate", 40, 60]]);
    });

    it("funcs 5, 6 and 7 write the damage stats their rows leave blank", () => {
        expect(entries([mod("dmg-min", 1, 4), mod("dmg-max", 6, 9)]).map((e) => e.stat)).toEqual(["mindamage", "maxdamage"]);
        expect(entries([mod("dmg%", 10, 20)])).toEqual([
            {stat: "item_mindamage_percent", layer: 0, min: 10, max: 20}, {stat: "item_maxdamage_percent", layer: 0, min: 10, max: 20}]);
    });

    it("func 10 stores a skill tab param as class * 8 + tab, func 21 takes the layer from val", () => {
        expect(entries([mod("skilltab", 1, 1, "13")])).toEqual([{stat: "item_addskill_tab", layer: 33, min: 1, max: 1}]);
        expect(entries([mod("sor", 1, 1)])).toEqual([{stat: "item_addclassskills", layer: 1, min: 1, max: 1}]);
    });

    it("func 11 takes the chance from min (5 when unset), the level from max and the skill from the param", () => {
        const [e] = expand([mod("hit-skill", 10, 8, "36")]).entries;
        expect(e).toEqual({stat: "item_skillonhit", layer: (36 << 6) + 8, min: 10, max: 10, skill: 36, level: {min: 8, max: 8}});
        expect(expand([mod("gethit-skill", 0, 3, "38")]).entries[0].min).toBe(5);
    });

    it("func 14 takes the socket count from the roll, or from the param when there is none", () => {
        expect(entries([mod("sock", 1, 2)])).toEqual([{stat: "item_numsockets", layer: 0, min: 1, max: 2}]);
        expect(entries([mod("sock", null, null, "3")])).toEqual([{stat: "item_numsockets", layer: 0, min: 3, max: 3}]);
    });

    it("funcs 15, 16 and 17 take min, max and param", () => {
        expect(entries([mod("dmg-pois", 31, 31, "50")]).map((e) => [e.stat, e.min])).toEqual([
            ["poisonmindam", 31], ["poisonmaxdam", 31], ["poisonlength", 50]]);
        expect(entries([mod("hp/lvl", null, null, "6")])).toEqual([{stat: "item_hp_perlevel", layer: 0, min: 6, max: 6}]);
    });

    it("func 19 gives charges by the item level (in-game: Teleportation on a staff and an amulet at ilvl 99)", () => {
        expect(expand([mod("charged", -30, -6, "54")]).entries[0]).toMatchObject({stat: "item_charged_skill", min: 52, max: 52, skill: 54, level: {min: 6, max: 6}});
        expect(expand([mod("charged", -20, -3, "54")]).entries[0]).toMatchObject({min: 27, max: 27, level: {min: 3, max: 3}});
        expect(expand([mod("charged", -30, -6, "54")], {ilvl: {min: 24, max: 99}}).entries[0]).toMatchObject({min: 33, max: 52, level: {min: 1, max: 6}});
        expect(() => expand([mod("charged", -30, -6, "54")], {})).toThrow(/no ilvl/);
    });

    it("func 20 sets indestructible", () => {
        expect(entries([mod("indestruct")])).toEqual([{stat: "item_indesctructible", layer: 0, min: 1, max: 1}]);
    });

    it("matches codes case-insensitively, reports unknown codes, and drops zero values", () => {
        expect(expand([mod("Deep-Wounds", 8, 12)]).entries[0].stat).toBe("deep_wounds");
        expect(expand([mod("map-mon-droparmor", 1, 1)])).toEqual({entries: [], unknown: ["map-mon-droparmor"]});
        expect(entries([mod("res-cold", 0, 0)])).toEqual([]);
    });

    it("throws on a property func the engine doesn't implement", () => {
        const odd = {...dict, properties: new Map(dict.properties).set("odd", [{func: 99, stat: "strength", set: 0, val: 0}])};
        expect(() => expandMods([mod("odd", 1, 1)], odd)).toThrow(/property "odd" uses func 99/);
    });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/statEngine.test.js`
Expected: FAIL, `Failed to resolve import "./statEngine.js"`.

- [ ] **Step 3: Write the expansion**

Create `src/statEngine.js`:

```js
// The stat engine: affix mods -> stats -> the lines the game prints, from the stat dictionary
// (src/statData.js). Expansion follows Properties.txt the way D2MOO's ITEMMODS_PropertyFunc* do;
// description follows the game's tooltip writer (ItemStatCost.txt descfuncs, the hardcoded damage pairs,
// dgrp groups). Values are ranges {min, max}: one affix row describes every roll at once.
// Pure, so it runs in Vite, Vitest and the browser.
import {skillOf} from "./statData.js";

// ---- Expansion: mods -> entries {stat, layer, min, max, skill?, level?} ----------------------------

const span = (a, b) => (a <= b ? {min: a, max: b} : {min: b, max: a});
const fixed = (v) => ({min: v, max: v});
const isZero = (r) => r.min === 0 && r.max === 0;
const int = (v) => {
    const x = Number.parseInt(v, 10);
    return Number.isFinite(x) ? x : 0;
};

// D2MOO ITEMMODS_PropertyFunc11/19: the level of a charged or proc skill at item level `ilvl`. max > 0
// is the level itself; max < 0 spreads the levels from the skill's reqlevel to 99; max 0 adds one level
// per 4 item levels, up to the skill's maxlvl (20 when unset).
export function skillLevelAt(skill, max, ilvl) {
    if (max > 0) return max;
    if (max < 0) {
        const divisor = Math.max(1, Math.trunc(Math.max(1, 99 - skill.reqlevel) / -max));
        return Math.max(1, Math.trunc((ilvl - skill.reqlevel) / divisor));
    }
    const cap = skill.maxlvl > 0 ? skill.maxlvl : 20;
    return Math.min(cap, Math.max(1, Math.trunc((ilvl - skill.reqlevel) / 4) + 1));
}

// D2MOO ITEMMODS_PropertyFunc19: a charged skill's maximum charges at skill level `level`. min > 0 is the
// count itself; min < 0 gives level * -min / 8 - min; 0 gives 5. Clamped to 1-255.
export function chargesAt(min, level) {
    if (min === 0) return 5;
    const n = min < 0 ? Math.trunc(level * -min / 8) - min : min;
    return Math.min(255, Math.max(1, n));
}

// mods: [{code, param, min, max}] (min and max may be null). ctx.ilvl: {min, max}, the item levels to
// describe; values that depend on it (charges, proc levels) become ranges over it. Returns the entries
// and the codes Properties.txt doesn't define, which give no stats (as in the game). Throws on a
// property func the engine doesn't implement, a stat missing from ItemStatCost.txt or an unknown skill.
export function expandMods(mods, dict, ctx = {}) {
    const entries = [];
    const unknown = [];

    const push = (stat, layer, value, extra = {}) => {
        if (!dict.stats.has(stat)) throw new Error(`stat "${stat}" is not in ItemStatCost.txt`);
        if (!isZero(value)) entries.push({stat, layer, ...value, ...extra});
    };
    const levels = () => {
        if (!ctx.ilvl) throw new Error("this mod depends on the item level, but no ilvl was given");
        return [ctx.ilvl.min, ctx.ilvl.max];
    };

    for (const mod of mods) {
        const slots = dict.properties.get(String(mod.code).toLowerCase());
        if (!slots) {
            unknown.push(mod.code);
            continue;
        }
        const rolled = span(mod.min ?? 0, mod.max ?? 0);
        const param = int(mod.param);
        let first = null; // the first slot's value: the game passes it to every later slot (funcs 3, 5-8, 10, 14 reuse it)

        for (const [i, slot] of slots.entries()) {
            const reuse = first && !isZero(first) ? first : rolled;
            let value;
            switch (slot.func) {
                case 1:
                case 2:
                    value = rolled;
                    push(slot.stat, 0, value);
                    break;
                case 3:
                case 8:
                    value = reuse;
                    push(slot.stat, 0, value);
                    break;
                case 5:
                    value = reuse;
                    push("mindamage", 0, value);
                    break;
                case 6:
                    value = reuse;
                    push("maxdamage", 0, value);
                    break;
                case 7:
                    value = reuse;
                    push("item_mindamage_percent", 0, value);
                    push("item_maxdamage_percent", 0, value);
                    break;
                case 10:
                    // A skill tab: param = class * 3 + tab, stored as class * 8 + tab.
                    value = reuse;
                    push(slot.stat, (param % 3) + 8 * Math.trunc(param / 3), value);
                    break;
                case 11: {
                    // Chance to cast: chance = min (5 when unset), level = max, skill = param.
                    const skill = skillOf(dict, mod.param);
                    const max = mod.max ?? 0;
                    const level = max > 0 ? fixed(max) : span(...levels().map((ilvl) => skillLevelAt(skill, max, ilvl)));
                    value = fixed((mod.min ?? 0) > 0 ? mod.min : 5);
                    push(slot.stat, (skill.id << 6) + (level.min & 63), value, {skill: skill.id, level});
                    break;
                }
                case 14: {
                    // Sockets: the roll, or the param when there is none (the per-base cap is the summing spec's).
                    const n = reuse.min > 0 ? reuse : fixed(param);
                    value = {min: Math.max(1, n.min), max: Math.max(1, n.max)};
                    push(slot.stat, 0, value);
                    break;
                }
                case 15:
                    value = fixed(mod.min ?? 0);
                    push(slot.stat, 0, value);
                    break;
                case 16:
                    value = fixed(mod.max ?? 0);
                    push(slot.stat, 0, value);
                    break;
                case 17:
                    value = param ? fixed(param) : rolled;
                    push(slot.stat, 0, value);
                    break;
                case 19: {
                    // Charges: the skill level and the charges both follow the item level.
                    const skill = skillOf(dict, mod.param);
                    const lv = levels().map((ilvl) => skillLevelAt(skill, mod.max ?? 0, ilvl));
                    value = span(...lv.map((l) => chargesAt(mod.min ?? 0, l)));
                    push(slot.stat, skill.id << 6, value, {skill: skill.id, level: span(...lv)});
                    break;
                }
                case 20:
                    value = fixed(1);
                    push("item_indesctructible", 0, value);
                    break;
                case 21:
                    value = rolled;
                    push(slot.stat, slot.val, value);
                    break;
                default:
                    throw new Error(`property "${mod.code}" uses func ${slot.func}, which the stat engine doesn't implement`);
            }
            if (i === 0) first = value;
        }
    }
    return {entries, unknown};
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/statEngine.test.js && npm run lint`
Expected: 14 tests pass; lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/statEngine.js src/statEngine.test.js
git commit -m "statEngine: expand affix mods into stat entries by Properties.txt's funcs (D2MOO), charges and proc levels over an ilvl range"
```

---

### Task 5: The engine's description: stat entries → lines

**Files:**
- Modify: `src/statEngine.js` (import line; append), `src/statEngine.test.js` (import line; append)

**Interfaces:**
- Consumes: Task 4's entries; `HARDCODED_STRINGS`, `skillName` and each stat's `op` (Task 3).
- Produces: `describe(entries, dict)` → lines `[{pieces: [string], label, key, priority, order, stats: [stat names], value: {min, max}, via?}]` in display order; `checkEntries(entries, dict)` (throws one error listing every problem); `rangeText`, `fill`, `displayPieces`, `entryKey`, `groupName`, `DESC_FUNCS`, `GROUP_FUNCS`.

- [ ] **Step 1: Write the failing tests**

In `src/statEngine.test.js`, replace the import line

```js
import {chargesAt, expandMods, skillLevelAt} from "./statEngine.js";
```

with

```js
import {chargesAt, checkEntries, describe as describeEntries, displayPieces, entryKey, expandMods, fill, rangeText, skillLevelAt} from "./statEngine.js";
```

and append to the end of the file:

```js

describe("text helpers", () => {
    it("rangeText prints single values, ranges, signs, negatives (smaller magnitude first), brackets and labels", () => {
        expect(rangeText({min: 5, max: 5}, {plus: "signed"})).toBe("+5");
        expect(rangeText({min: 0, max: 0}, {plus: "signed"})).toBe("0");
        expect(rangeText({min: 0, max: 0}, {plus: "zero"})).toBe("+0");
        expect(rangeText({min: 3, max: 6}, {plus: "signed"})).toBe("+3-6");
        expect(rangeText({min: -4, max: -2})).toBe("-2 to -4");
        expect(rangeText({min: 20, max: 30}, {bracket: true})).toBe("[20-30]");
        expect(rangeText({min: 1, max: 1}, {bracket: true})).toBe("1");
        expect(rangeText({min: 3, max: 6}, {plus: "signed", label: true})).toBe("+#");
        expect(rangeText({min: -4, max: -2}, {label: true})).toBe("-#");
    });

    it("fill substitutes printf arguments in order, and %% is a percent sign", () => {
        expect(fill("%d%% Chance to cast level %d %s on striking", ["10", "8", "Fire Bolt"])).toBe("10% Chance to cast level 8 Fire Bolt on striking");
        expect(fill("All Resistances +%d", ["3-6"])).toBe("All Resistances +3-6");
    });

    it("displayPieces strips colour codes and stacks a multi-line string bottom-up", () => {
        expect(displayPieces("ÿc0Magic Find:ÿc3 +5%")).toEqual(["Magic Find: +5%"]);
        expect(displayPieces("+25% Enhanced Damage\n")).toEqual(["+25% Enhanced Damage"]);
        expect(displayPieces("Bottom\nTop")).toEqual(["Top", "Bottom"]);
    });

    it("entryKey keys a stat, a stat per layer, and a stat per skill", () => {
        expect(entryKey({stat: "coldresist", layer: 0})).toBe("coldresist");
        expect(entryKey({stat: "item_addskill_tab", layer: 33})).toBe("item_addskill_tab/33");
        expect(entryKey({stat: "item_skillongethit", layer: (38 << 6) + 3, skill: 38})).toBe("item_skillongethit:38");
    });
});

const describeMods = (mods, ctx = ILVL_99) => describeEntries(expand(mods, ctx).entries, dict);
const text = (mods, ctx) => describeMods(mods, ctx).flatMap((l) => l.pieces);

describe("describe: the in-game results (character level 60, ilvl 99)", () => {
    it("prints poison as (v * frames + 128) >> 8 over frames / 25 seconds, every source summed", () => {
        expect(text([mod("dmg-pois", 31, 31, "50")])).toEqual(["+6 poison damage over 2 seconds"]); // Septic p555
        expect(text([mod("dmg-pois", 24, 24, "75")])).toEqual(["+7 poison damage over 3 seconds"]); // of Blight s234
        expect(text([mod("dmg-pois", 31, 31, "50"), mod("dmg-pois", 24, 24, "75")])).toEqual(["+27 poison damage over 5 seconds"]);
    });

    it("prints charges full, by the item level", () => {
        expect(text([mod("charged", -30, -6, "54")])).toEqual(["Level 6 Teleport (52/52 Charges)"]); // staff, s532
        expect(text([mod("charged", -20, -3, "54")])).toEqual(["Level 3 Teleport (27/27 Charges)"]); // amulet, s533
    });

    it("prints repair from rep-dur's param", () => {
        expect(text([mod("rep-dur", null, null, "3")])).toEqual(["Repairs 1 durability in 33 seconds"]); // of Self-Repair s402
    });
});

describe("describe: values", () => {
    it("prints a range, a single value and a negative range in the game's wording", () => {
        expect(text([mod("res-cold", 11, 20)])).toEqual(["Cold Resist +11-20%"]);
        expect(text([mod("res-cold", 15, 15)])).toEqual(["Cold Resist +15%"]);
        expect(text([mod("map-play-ac%", -30, -20)])).toEqual(["Players have -20 to -30% Enhanced Defense"]);
        expect(text([mod("pierce-fire", 2, 4)])).toEqual(["-2 to -4% to Enemy Fire Resistance"]); // descfunc 20 negates
    });

    it("brackets the ranges of a line that prints several values", () => {
        expect(text([mod("cold-min", 20, 30), mod("cold-max", 64, 101), mod("cold-len", 25, 25)])).toEqual(["Adds [20-30]-[64-101] cold damage"]);
        expect(text([mod("ltng-min", 1, 1), mod("ltng-max", 49, 120)])).toEqual(["Adds 1-[49-120] lightning damage"]);
        expect(text([mod("charged", -30, -6, "54")], {ilvl: {min: 24, max: 99}})).toEqual(["Level [1-6] Teleport ([33-52]/[33-52] Charges)"]);
    });

    it("prints per-level stats over character levels 1-99, then the rate per level", () => {
        expect(text([mod("mana/lvl", null, null, "6")])).toEqual(["+0-74 to Mana (Based on Character Level), 0.75 per level"]); // eighths
        expect(text([mod("att/lvl", null, null, "12")])).toEqual(["+6-594 to Attack Rating (Based on Character Level), 6 per level"]); // halves
    });
});

describe("describe: pairs", () => {
    it("prints an elemental pair as one line: single when min >= max (the max), else a range", () => {
        expect(text([mod("dmg-cold", 1, 1, "25")])).toEqual(["+1 cold damage"]);
        expect(text([mod("fire-min", 28, 43), mod("fire-max", 53, 103)])).toEqual(["Adds [28-43]-[53-103] fire damage"]);
    });

    it("prints enhanced damage from min% and max%, its multi-line string as one line", () => {
        expect(text([mod("dmg%", 10, 20)])).toEqual(["+10-20% Enhanced Damage"]);
    });

    it("prints physical min and max damage as one line only when min is below max", () => {
        expect(text([mod("dmg-min", 1, 4)])).toEqual(["+1-4 to Minimum Damage"]);
        expect(text([mod("dmg-min", 1, 4), mod("dmg-max", 6, 9)])).toEqual(["Adds [1-4]-[6-9] damage"]);
    });
});

describe("describe: dgrp groups", () => {
    it("fold every member with one value into the group's line (func 19), else each member prints", () => {
        expect(text([mod("res-all", 3, 6)])).toEqual(["All Resistances +3-6"]);
        expect(text([mod("res-all", 3, 6), mod("res-cold", 5, 5)])).toEqual([
            "Cold Resist +8-11%", "Lightning Resist +3-6%", "Fire Resist +3-6%", "Poison Resist +3-6%"]);
    });

    it("use each group's func, value placement and strings (funcs 1, 4, 7, 8)", () => {
        expect(text(["str", "dex", "vit", "enr"].map((c) => mod(c, 5, 5)))).toEqual(["+5 to all Attributes"]);
        expect(text(["extra-fire", "extra-cold", "extra-ltng", "extra-pois"].map((c) => mod(c, 2, 2)))).toEqual(["+2% to All Elemental Skill Damage"]);
        expect(text([mod("map-play-mag-gold%", 20, 25)])).toEqual(["Magic and Gold Find: +20-25%"]);
        expect(text([mod("map-play-res-all", -15, -10)])).toEqual(["Players have -10 to -15% to All Resistances"]);
        expect(text([mod("map-mon-att-cast-speed", 40, 60)])).toEqual(["Monsters have +40-60% Increased Cast and Attack Speed"]);
    });

    it("print at the priority of the member with the lowest stat id, and name the group for the via tag", () => {
        // dgrp 5: map_mon_tohit (id 394, priority 115) prints, not map_mon_pierce (132); att% sits at 117.
        expect(text([mod("map-mon-att-pierce", 30, 50), mod("att%", 10, 20)])).toEqual([
            "10-20% Bonus to Attack Rating", "Monsters have +30-50% Attack Rating and Chance to Pierce"]);
        expect(describeMods([mod("res-all", 3, 6)])[0]).toMatchObject({key: "dgrp2", via: "All Resistances", label: "All Resistances +#",
            stats: ["fireresist", "lightresist", "coldresist", "poisonresist"]});
    });
});

describe("describe: descfuncs", () => {
    it("place the value by descval, with the sign and percent each func adds", () => {
        expect(text([mod("mag%", 5, 7)])).toEqual(["5-7% Better Chance of Getting Magic Items"]); // 2
        expect(text([mod("thorns", 3, 6)])).toEqual(["Attacker Takes Damage of 3-6"]); // 3
        expect(text([mod("knock", 1, 1)])).toEqual(["Knockback"]); // 3, descval 0
        expect(text([mod("map-mon-crush", 15, 25)])).toEqual(["Monsters have 15-25% Chance of Crushing Blow"]); // 7
        expect(text([mod("map-mon-ed%", 10, 15)])).toEqual(["Monsters have +10-15% Enhanced Physical Damage"]); // 8
        expect(text([mod("map-mon-red-dmg", 100, 200)])).toEqual(["Monsters take 100-200 Reduced Physical Damage"]); // 9
        expect(text([mod("map-mon-splash", 100, 1, "358")])).toEqual(["Monster's Melee Attacks Deal Splash Damage"]); // 9, descval 0
    });

    it("name class skills, skill tabs and chance-to-cast skills from CharStats and the skill tables", () => {
        expect(text([mod("sor", 1, 1)])).toEqual(["+1 to Sorceress Skill Levels"]); // 13
        expect(text([mod("skilltab", 1, 1, "12")])).toEqual(["+1 to Combat Skills (Barbarian Only)"]); // 14 (Expert's)
        expect(text([mod("skilltab", 1, 1, "13")])).toEqual(["+1 to Masteries (Barbarian Only)"]); // (Fanatic)
        expect(text([mod("skilltab", 1, 1, "9")])).toEqual(["+1 to Combat Skills (Paladin Only)"]); // the hash-probe winner
        expect(text([mod("hit-skill", 10, 8, "36")])).toEqual(["10% Chance to cast level 8 Fire Bolt on striking"]); // 15
        expect(text([mod("gethit-skill", 10, 3, "38")])).toEqual(["10% Chance to cast level 3 Charged Bolt when struck"]);
    });

    it("print indestructible, and sockets below every other line", () => {
        expect(text([mod("indestruct")])).toEqual(["Indestructible"]);
        expect(text([mod("sock", 1, 2), mod("res-cold", 11, 20)])).toEqual(["Cold Resist +11-20%", "Socketed (1-2)"]);
    });

    it("order lines by descpriority, highest first", () => {
        expect(text([mod("res-cold", 11, 20), mod("str", 1, 2)])).toEqual(["+1-2 to Strength", "Cold Resist +11-20%"]);
    });
});

describe("describe: keys and labels", () => {
    it("label each line with # for its values, and key it by stat, layer, skill, pair or group", () => {
        const one = (mods) => describeMods(mods).map((l) => [l.key, l.label]);
        expect(one([mod("res-cold", 11, 20)])).toEqual([["coldresist", "Cold Resist +#%"]]);
        expect(one([mod("skilltab", 1, 1, "13")])).toEqual([["item_addskill_tab/33", "+# to Masteries (Barbarian Only)"]]);
        expect(one([mod("dmg-pois", 31, 31, "50")])).toEqual([["poisondamage", "+# poison damage over # seconds"]]);
        expect(one([mod("charged", -30, -6, "54")])).toEqual([["item_charged_skill:54", "Level # Teleport (#/# Charges)"]]);
        // of Charged Shield s421-s423: three levels, one key.
        const keys = [3, 4, 5].map((level) => describeMods([mod("gethit-skill", 10, level, "38")])[0].key);
        expect(new Set(keys)).toEqual(new Set(["item_skillongethit:38"]));
    });
});

describe("checkEntries", () => {
    it("passes the real data's stats", () => {
        expect(() => checkEntries(expand([mod("res-all", 3, 6), mod("charged", -30, -6, "54"), mod("hit-skill", 10, 8, "36")]).entries, dict)).not.toThrow();
    });

    it("lists a descfunc the engine doesn't implement, a missing string and a skill with no name", () => {
        const odd = {
            ...dict,
            stats: new Map(dict.stats).set("coldresist", {...dict.stats.get("coldresist"), func: 99}),
            string: (key) => (key === "ModStr1j" ? null : dict.string(key)),
        };
        const problems = () => checkEntries(expandMods([mod("res-cold", 1, 1), mod("res-fire", 1, 1), mod("charged", 5, 1, "358")], odd, ILVL_99).entries, odd);
        expect(problems).toThrow(/stat coldresist uses descfunc 99/);
        expect(problems).toThrow(/string "ModStr1j"/);
        expect(problems).toThrow(/skill 358 \("proc_SplashDamage"\) has no name string/);
    });

    it("lists a dgrpfunc the engine doesn't implement, a missing CharStats class or tab, a missing hardcoded string and a non-level op", () => {
        const odd = {
            ...dict,
            stats: new Map(dict.stats)
                .set("fireresist", {...dict.stats.get("fireresist"), groupFunc: 99})
                .set("strength", {...dict.stats.get("strength"), op: 3}),
            classes: dict.classes.slice(0, 1),
            string: (key) => (key === "ModStre10b" ? null : dict.string(key)),
        };
        const problems = () => checkEntries(expandMods([mod("res-fire", 1, 1), mod("sor", 1, 1), mod("skilltab", 1, 1, "13"), mod("str", 1, 1)], odd, ILVL_99).entries, odd);
        expect(problems).toThrow(/dgrp 2 uses dgrpfunc 99/);
        expect(problems).toThrow(/CharStats\.txt has no class 1/);
        expect(problems).toThrow(/CharStats\.txt has no skill tab for layer 33/);
        expect(problems).toThrow(/string "ModStre10b" \(used by the stat engine\)/);
        expect(problems).toThrow(/stat strength scales by a stat other than the character level \(op 3\)/);
    });
});
```

The first block holds the user's in-game results (2026-10-12): they are the fixtures the spec promises.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/statEngine.test.js`
Expected: FAIL, `describe as describeEntries` / `rangeText` … are not exported (`is not a function`).

- [ ] **Step 3: Write the description**

In `src/statEngine.js`, replace the import line with

```js
import {HARDCODED_STRINGS, skillName, skillOf} from "./statData.js";
```

and append to the end of the file:

```js
// The descfuncs and dgrpfuncs the engine implements. Anything else in the data fails the build (checkEntries).
export const DESC_FUNCS = [1, 2, 3, 4, 6, 7, 8, 9, 11, 13, 14, 15, 19, 20, 24];
export const GROUP_FUNCS = [1, 2, 3, 4, 6, 7, 8, 9, 19, 20];

// ---- Text helpers ------------------------------------------------------------------------------------

// A range as text. plus: "signed" puts "+" before a positive value, "zero" before zero too. bracket:
// wrap a real range in [ ] (for lines that print several values). label: "#" instead of the value.
// A negative range prints the smaller magnitude first: "-2 to -4".
export function rangeText(r, {plus = "", bracket = false, label = false} = {}) {
    const sign = (v) => ((plus === "zero" && v >= 0) || (plus === "signed" && v > 0) ? "+" : "");
    if (label) return `${r.max < 0 ? "-" : sign(r.max)}#`;
    if (r.min === r.max) return `${sign(r.min)}${r.min}`;
    const text = r.max <= 0 ? `${r.max} to ${r.min}` : r.min < 0 ? `${r.min} to ${r.max}` : `${sign(r.max)}${r.min}-${r.max}`;
    return bracket ? `[${text}]` : text;
}

const negate = (r) => ({min: -r.max, max: -r.min});

// printf for the game's strings: %d %i %u %s and %+d take the next argument (already text); %% is "%".
export function fill(format, args) {
    let i = 0;
    return format.replace(/%\+?([dius%])/g, (m, kind) => (kind === "%" ? "%" : String(args[i++] ?? "")));
}

// A finished line's display pieces, top first: colour codes (ÿc plus one character) stripped, and a
// string with "\n" stacked bottom-up as the game draws it (the last piece is the top line).
export function displayPieces(text) {
    return text.replace(/ÿc./g, "").split("\n").filter((p) => p.trim() !== "").reverse();
}

function requireString(dict, key, why) {
    const s = dict.string(key);
    if (s === null) throw new Error(`string "${key}" (${why}) is in neither patchstring.tbl nor baseStrings.json`);
    return s;
}

function skillText(dict, e) {
    const skill = dict.skills.get(e.skill);
    const name = skillName(dict, skill);
    if (name === null) throw new Error(`skill ${skill.id} ("${skill.name}") has no name string`);
    return name;
}

// A filter key per line source: a stat, a stat per layer, or a stat per skill (its layer also holds the
// skill level, which would split one skill into one key per level).
export function entryKey(e) {
    if (e.skill !== undefined) return `${e.stat}:${e.skill}`;
    return e.layer ? `${e.stat}/${e.layer}` : e.stat;
}

// A group's name for the Stat filter's "via" tag, from its own string: "All Resistances", "all Attributes".
export function groupName(dict, primary) {
    const text = displayPieces(requireString(dict, primary.groupStr2 || primary.groupPos, `dgrp ${primary.group}`)).join(" ");
    return text.replace(/%\+?[dius]/g, "").replace(/(^|\s)[+-](?=\s|$)/g, " ").replace(/\s+/g, " ").trim()
        .replace(/^to /i, "").replace(/:$/, "");
}

// ---- Description: one stat line ----------------------------------------------------------------------

// The text of one stat line, or of a dgrp line when `d` holds the group's func, val and strings. label:
// "#" for each value. Returns "" when the game prints nothing (func 1 with descval 0).
function formatStat(d, e, dict, label) {
    const v = (r, plus = "", bracket = false) => rangeText(r, {plus, bracket, label});
    const str = (key) => requireString(dict, key, `stat ${e.stat}`);
    const text = d.func === 0 ? "" : str(e.min < 0 && d.neg ? d.neg : d.pos);
    // descval 1: the value first; 2: the value last; 0: no value (funcs 1 and 6 then print nothing).
    const place = (num, emptyWithoutValue = false) =>
        (d.val === 1 ? `${num} ${text}` : d.val === 2 ? `${text} ${num}` : emptyWithoutValue ? "" : text);
    const str2 = (s) => (d.func >= 6 && d.func <= 9 && d.str2 ? `${s} ${str(d.str2)}` : s);

    // Per-level stats: the value at character level L is v * L / 2^shift; the line shows L = 1-99, then the rate.
    let value = e;
    let perLevel = "";
    if (d.perLevelShift !== null && d.perLevelShift !== undefined) {
        const unit = 2 ** d.perLevelShift;
        value = {min: Math.floor(e.min / unit), max: Math.floor(e.max * 99 / unit)};
        perLevel = `, ${label ? "#" : rangeText({min: e.min / unit, max: e.max / unit})} per level`;
    }

    switch (d.func) {
        case 1:
        case 6:
            return str2(place(v(value, "signed"), true)) + perLevel;
        case 2:
        case 7:
            return str2(place(`${v(value)}%`)) + perLevel;
        case 3:
        case 9:
            return str2(place(v(value))) + perLevel;
        case 4:
        case 8:
            return str2(place(`${v(value, "zero")}%`)) + perLevel;
        case 20:
            return place(`${v(negate(value), "zero")}%`) + perLevel;
        case 19:
            return fill(text, [v(value)]);
        case 11: {
            // Repair: 1 durability every (2500 / v + 12) / 25 seconds, or "per second" at 30 frames or less.
            if (label) return fill(str("ModStre9u"), ["#", "#"]);
            const frames = Math.trunc(2500 / e.max);
            return e.max > 0 && frames > 30
                ? fill(str("ModStre9u"), ["1", String(Math.trunc((frames + 12) / 25))])
                : fill(str("ModStre9t"), [e.max > 0 ? "1" : "25"]);
        }
        case 13:
            return `${v(value, "signed")} ${str(dict.classes[e.layer].allSkills)}`;
        case 14: {
            const cls = dict.classes[e.layer >> 3];
            return `${fill(str(cls.tabs[e.layer & 7]), [v(value)])} ${str(cls.classOnly)}`;
        }
        case 15:
            return fill(str(d.pos), [v(value, "", true), v(e.level, "", true), skillText(dict, e)]);
        case 24:
            return `${str("ModStre10b")} ${v(e.level, "", true)} ${skillText(dict, e)} ${fill(str(d.pos), [v(value, "", true), v(value, "", true)])}`;
        default:
            throw new Error(`stat ${e.stat} uses descfunc ${d.func}, which the stat engine doesn't implement`);
    }
}

// ---- Description: entries -> lines ------------------------------------------------------------------

const ELEMENT_PAIRS = [
    {key: "firedamage", min: "firemindam", max: "firemaxdam", single: "strModFireDamage", range: "strModFireDamageRange"},
    {key: "lightdamage", min: "lightmindam", max: "lightmaxdam", single: "strModLightningDamage", range: "strModLightningDamageRange"},
    {key: "magicdamage", min: "magicmindam", max: "magicmaxdam", single: "strModMagicDamage", range: "strModMagicDamageRange"},
    {key: "colddamage", min: "coldmindam", max: "coldmaxdam", single: "strModColdDamage", range: "strModColdDamageRange"},
    {key: "poisondamage", min: "poisonmindam", max: "poisonmaxdam", length: "poisonlength", single: "strModPoisonDamage", range: "strModPoisonDamageRange"},
];

// entries -> lines [{pieces, label, key, priority, order, stats, value, via?}], in the game's order:
// descpriority, highest first (ties by stat id). pieces: the display lines, top first; label: the line
// with "#" for each value; key: the Stat filter key; stats: the stats the line prints (a group line's
// members); value: its first value's range; via: a group line's name.
export function describe(entries, dict) {
    // 1. Sum per (stat, layer).
    const live = new Map();
    for (const e of entries) {
        const id = `${e.stat}/${e.layer}`;
        const seen = live.get(id);
        live.set(id, seen ? {...seen, min: seen.min + e.min, max: seen.max + e.max} : {...e});
    }
    for (const [id, e] of live) if (isZero(e)) live.delete(id);

    const stat = (name) => dict.stats.get(name);
    const at0 = (name) => live.get(`${name}/0`);
    const take = (...names) => names.forEach((n) => live.delete(`${n}/0`));
    const lines = [];
    const add = ({text, labelText, ...line}) => {
        const pieces = displayPieces(text);
        if (pieces.length) lines.push({...line, pieces, label: displayPieces(labelText).join(" ")});
    };

    // 2. The damage pairs, printed as one line when both halves are present. Single value when min >= max
    // (the game prints the max), else "Adds a-b". Poison converts frames: (v * frames + 128) >> 8 over
    // frames / 25 seconds, every source summed (in-game: Septic + of Blight print 27 over 5 seconds).
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

    // Enhanced damage: min% and max% together print "+X% Enhanced Damage".
    const ed = at0("item_mindamage_percent");
    if (ed && at0("item_maxdamage_percent")) {
        const name = requireString(dict, "strModEnhancedDamage", "damage pair");
        add({text: `${rangeText(ed, {plus: "signed"})}% ${name}`, labelText: `+#% ${name}`, key: "enhanceddamage",
            priority: stat("item_mindamage_percent").priority, order: stat("item_mindamage_percent").id,
            stats: ["item_mindamage_percent", "item_maxdamage_percent"], value: ed});
        take("item_mindamage_percent", "item_maxdamage_percent");
    }

    // 3. dgrp groups: one line when every member is present with the same value. The member with the
    // lowest stat id prints it, at its own priority, as the game's emission loop does.
    for (const [group, members] of dict.groups) {
        const values = members.map(at0);
        if (values.some((e) => !e || e.min !== values[0].min || e.max !== values[0].max)) continue;
        const primary = stat(members[0]);
        const d = {func: primary.groupFunc, val: primary.groupVal, pos: primary.groupPos, neg: primary.groupNeg,
            str2: primary.groupStr2, perLevelShift: null};
        add({text: formatStat(d, values[0], dict, false), labelText: formatStat(d, values[0], dict, true), key: `dgrp${group}`,
            priority: primary.priority, order: primary.id, stats: [...members], value: values[0], via: groupName(dict, primary)});
        take(...members);
    }

    // 4. Everything else, by its own descfunc. Sockets print below every modifier.
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

    return lines.sort((a, b) => b.priority - a.priority || a.order - b.order);
}

// ---- Loud checks ----------------------------------------------------------------------------------------

// Run once over every entry the data produces: each stat's descfunc and dgrpfunc is implemented, every
// string it or its group needs resolves (and the engine's hardcoded ones), each class skill line has its
// CharStats strings, and each skill a line names has a name. Throws one error listing every problem.
export function checkEntries(entries, dict) {
    const problems = new Set();
    const need = (key, why) => {
        if (key && dict.string(key) === null) problems.add(`string "${key}" (${why}) is in neither patchstring.tbl nor baseStrings.json`);
    };
    for (const key of HARDCODED_STRINGS) need(key, "used by the stat engine");

    for (const e of entries) {
        const d = dict.stats.get(e.stat);
        const why = `stat ${e.stat}`;
        if (d.func && !DESC_FUNCS.includes(d.func)) problems.add(`${why} uses descfunc ${d.func}, which the stat engine doesn't implement`);
        if (d.op >= 2 && d.op <= 5 && d.perLevelShift === null) problems.add(`${why} scales by a stat other than the character level (op ${d.op}), which the stat engine doesn't implement`);
        if ([1, 2, 3, 4, 6, 7, 8, 9, 15, 19, 20, 24].includes(d.func)) {
            need(d.pos, why);
            need(d.neg, why);
        }
        if (d.func >= 6 && d.func <= 9) need(d.str2, why);
        if (d.func === 13) {
            const cls = dict.classes[e.layer];
            if (cls) need(cls.allSkills, why);
            else problems.add(`${why}: CharStats.txt has no class ${e.layer}`);
        }
        if (d.func === 14) {
            const cls = dict.classes[e.layer >> 3];
            if (cls && (e.layer & 7) <= 2) {
                need(cls.tabs[e.layer & 7], why);
                need(cls.classOnly, why);
            } else problems.add(`${why}: CharStats.txt has no skill tab for layer ${e.layer}`);
        }
        if ((d.func === 15 || d.func === 24) && e.skill !== undefined) {
            const skill = dict.skills.get(e.skill);
            if (skillName(dict, skill) === null) problems.add(`skill ${skill.id} ("${skill.name}") has no name string (${why})`);
        }
        if (d.group) {
            if (!GROUP_FUNCS.includes(d.groupFunc)) problems.add(`${why}: dgrp ${d.group} uses dgrpfunc ${d.groupFunc}, which the stat engine doesn't implement`);
            for (const key of [d.groupPos, d.groupNeg, d.groupStr2]) need(key, `dgrp ${d.group}`);
        }
    }
    if (problems.size) throw new Error([...problems].join("\n"));
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/statEngine.test.js && npm run lint`
Expected: 38 tests pass; lint clean.

- [ ] **Step 5: Commit**

```bash
git add src/statEngine.js src/statEngine.test.js
git commit -m "statEngine: describe stat entries the game's way (descfuncs, damage pairs, dgrp groups, per-level, charges, sockets), labels and filter keys, loud checks; in-game results as fixtures"
```

---

### Task 6: Affix rows, the Stat filter's options, and the golden snapshot

**Files:**
- Create: `src/affixData.js`, `src/affixData.test.js`, `src/__snapshots__/affixLines.golden.txt` (written by the first run)
- Modify: `src/statFixtures.js` (whole file below)

**Interfaces:**
- Consumes: `expandMods`, `describe`, `checkEntries` (Tasks 4–5); `parseTxt`.
- Produces: `readAffixes(texts)` → raw rows `{key, suffix, name, level, maxLevel, levelreq, rare, classSpecific, classLevelReq, group, frequency, itypes, etypes, mods}`; `describeAffixes(rows, dict, typeNames)` → `{rows: [raw row + {className, itemTypes, excludedItemTypes, lines, statKeys: [{key, via?}], sort: {property, max} | null}], stats: [{key, label, group: "Items"|"Maps"}], warnings}`; `itemTypeNames(itemTypesText)` → `Map<code, name>`; `affixesJson({rows, stats})`; `checkAffixesFile(json)`; `viaFor(affix, statKey)`; constants `AFFIXES_FILE`, `AFFIXES_VERSION`, `AFFIX_TABLES`, `AFFIX_TABLE_COLUMNS`, `CLASS_NAMES`, `TYPE_NAME_OVERRIDES`; `parseTableRows`, `checkAffixColumns`. Fixtures: `affixTableText(rows)`, `realAffixData()`.

- [ ] **Step 1: Extend the fixtures**

Replace `src/statFixtures.js` with:

```js
// Node-only helpers for the stat engine's and the affix data's tests (node:fs for the real tables), so
// the app must never import this module.
import {readFileSync} from "node:fs";
import {parseTbl} from "./tblFile.js";
import {STAT_TABLES, buildStatData} from "./statData.js";
import {AFFIX_TABLE_COLUMNS, describeAffixes, itemTypeNames, readAffixes} from "./affixData.js";

const STANDARD = new URL("../public/data/standard/", import.meta.url);

// A tab-separated table with a header line and one line per row object; missing cells are "".
export function tableText(columns, rows) {
    return [columns.join("\t"), ...rows.map((row) => columns.map((c) => row[c] ?? "").join("\t"))].join("\n") + "\n";
}

// One of the standard mode's game tables, from its in-MPQ path.
export function readExcel(name) {
    return readFileSync(new URL(`data/global/excel/${name}.txt`, STANDARD), "utf8");
}

export function readPatchStrings() {
    return parseTbl(new Uint8Array(readFileSync(new URL("data/local/LNG/ENG/patchstring.tbl", STANDARD))));
}

export function readBaseStrings() {
    return JSON.parse(readFileSync(new URL("./baseStrings.json", import.meta.url), "utf8"));
}

// Everything buildStatData reads, from the real files.
export function readStatInputs() {
    return {
        texts: Object.fromEntries(STAT_TABLES.map((name) => [name, readExcel(name)])),
        patchStrings: readPatchStrings(),
        baseStrings: readBaseStrings(),
    };
}

let realDict = null;
export function realStatData() {
    realDict ??= buildStatData(readStatInputs());
    return realDict;
}

// A .tbl file built in memory. nodes: [{slot, key, value, hash = slot, active = true}] in the hash table
// of `hashSize` slots; values are written as UTF-8 with a trailing NUL. `valueBytes` overrides a value's
// bytes (to test invalid UTF-8).
export function tblBytes(nodes, hashSize = 8) {
    const enc = new TextEncoder();
    const header = 21;
    const indexBytes = 2 * nodes.length;
    const nodesAt = header + indexBytes;
    let at = nodesAt + 17 * hashSize;
    const strings = [];
    const placed = nodes.map((n) => {
        const key = enc.encode(`${n.key}\0`);
        const value = n.valueBytes ?? enc.encode(`${n.value}\0`);
        const keyAt = at;
        at += key.length;
        const valueAt = at;
        at += value.length;
        strings.push(key, value);
        return {...n, keyAt, valueAt, valueLength: value.length};
    });
    const bytes = new Uint8Array(at);
    const view = new DataView(bytes.buffer);
    view.setUint16(2, nodes.length, true);
    view.setUint32(4, hashSize, true);
    bytes[8] = 0;
    view.setUint32(9, nodesAt + 17 * hashSize, true);
    view.setUint32(13, hashSize, true);
    view.setUint32(17, at, true);
    placed.forEach((n, i) => {
        view.setUint16(header + 2 * i, n.slot, true);
        const o = nodesAt + 17 * n.slot;
        bytes[o] = n.active === false ? 0 : 1;
        view.setUint16(o + 1, i, true);
        view.setUint32(o + 3, n.hash ?? n.slot, true);
        view.setUint32(o + 7, n.keyAt, true);
        view.setUint32(o + 11, n.valueAt, true);
        view.setUint16(o + 15, n.valueLength, true);
    });
    let offset = nodesAt + 17 * hashSize;
    for (const s of strings) {
        bytes.set(s, offset);
        offset += s.length;
    }
    return bytes;
}

// An affix table: every row defaults to spawnable, frequency 1, group 1, level 1, rare, itype1 "weap".
// null is a blank line.
export function affixTableText(rows) {
    return tableText(AFFIX_TABLE_COLUMNS, rows.map((row) => (row === null ? {} : {
        spawnable: "1", frequency: "1", group: "1", level: "1", rare: "1", itype1: "weap", ...row,
    })));
}

// The real affix rows, described: what the affix-data plugin computes.
export function realAffixData() {
    const texts = Object.fromEntries(["MagicPrefix", "MagicSuffix", "ItemTypes"].map((name) => [name, readExcel(name)]));
    return describeAffixes(readAffixes(texts), realStatData(), itemTypeNames(texts.ItemTypes));
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/affixData.test.js`:

```js
import {describe, expect, it} from "vitest";
import {AFFIXES_VERSION, affixesJson, checkAffixColumns, checkAffixesFile, describeAffixes, itemTypeNames, parseTableRows, readAffixes, viaFor} from "./affixData.js";
import {describe as describeEntries, expandMods} from "./statEngine.js";
import {affixTableText, readExcel, realAffixData, realStatData, tableText} from "./statFixtures.js";

describe("parseTableRows", () => {
    it("keeps blank rows so row indexes match the file, and drops only the final newline", () => {
        const rows = parseTableRows("Name\tlevel\r\nA\t1\r\n\t\r\n\r\nB\t2\r\n");
        expect(rows.map((r) => r.Name)).toEqual(["A", "", "", "B"]);
        expect(rows[3].level).toBe("2");
    });

    it("gives a short row's missing cells as empty strings", () => {
        expect(parseTableRows("a\tb\tc\nx\n")[0]).toEqual({a: "x", b: "", c: ""});
    });
});

describe("readAffixes", () => {
    const texts = {
        MagicPrefix: affixTableText([
            {Name: "Hidden", spawnable: "0"},
            null,
            {Name: "Expansion", spawnable: "", frequency: ""},
            {Name: "Sharp", group: "5", level: "3", maxlevel: "20", levelreq: "2", itype2: "amul", etype1: "orb",
                mod1code: "dmg%", mod1min: "10", mod1max: "20"},
            {Name: "NoFreq", frequency: "0"},
        ]),
        MagicSuffix: affixTableText([
            {Name: "of Tele", group: "9", rare: "", classspecific: "sor", class: "sor", classlevelreq: "18",
                mod1code: "oskill", mod1param: "Teleport", mod1min: "1", mod1max: "1"},
        ]),
    };

    it("keys rows by their index in the raw table, counting skipped and blank rows", () => {
        expect(readAffixes(texts).map((a) => a.key)).toEqual(["p3", "s0"]);
    });

    it("reads every field the builder uses", () => {
        const [sharp, tele] = readAffixes(texts);
        expect(sharp).toEqual({
            key: "p3", suffix: false, name: "Sharp", level: 3, maxLevel: 20, levelreq: 2, rare: true,
            classSpecific: null, classLevelReq: null, group: 5, frequency: 1, itypes: ["weap", "amul"], etypes: ["orb"],
            mods: [{code: "dmg%", param: "", min: 10, max: 20}],
        });
        expect(tele).toMatchObject({rare: false, maxLevel: null, classSpecific: "sor", classLevelReq: {class: "sor", level: 18}});
        expect(tele.mods[0].param).toBe("Teleport");
    });

    it("names the missing table and the missing columns", () => {
        expect(() => checkAffixColumns("MagicPrefix", undefined)).toThrow("MagicPrefix.txt: missing");
        expect(() => checkAffixColumns("MagicPrefix", "Name\tlevel\n")).toThrow(/MagicPrefix\.txt: missing required column\(s\) "spawnable"/);
    });
});

describe("itemTypeNames", () => {
    it("takes ItemTypes.txt's names, corrected where they don't match the game's", () => {
        const names = itemTypeNames(tableText(["ItemType", "Code"], [
            {ItemType: "Orb", Code: "orb"}, {ItemType: "Large Charm", Code: "lcha"}, {ItemType: "Medium Charm", Code: "mcha"}, {ItemType: "None"},
        ]));
        expect([...names]).toEqual([["orb", "Orb"], ["lcha", "Grand Charm"], ["mcha", "Large Charm"]]);
    });
});

describe("describeAffixes", () => {
    const dict = realStatData();
    const typeNames = new Map([["weap", "Weapon"], ["orb", "Orb"], ["lcha", "Grand Charm"]]);
    const affix = (key, mods, extra = {}) => ({key, suffix: key.startsWith("s"), name: key, level: 1, classSpecific: null, itypes: ["weap"], etypes: [], mods, ...extra});
    const m = (code, min, max, param = "") => ({code, param, min, max});
    const {rows, stats, warnings} = describeAffixes([
        affix("p0", [m("res-cold", 11, 20)], {etypes: ["orb"], itypes: ["weap", "lcha"]}),
        affix("p1", [m("res-all", 3, 6)]),
        affix("p2", [m("res-cold", 5, 5)]),
        affix("p3", [m("map-mon-droparmor", 1, 1)], {itypes: ["amu"]}),
        affix("p4", [m("map-play-mag-gold%", 20, 25)]),
        affix("s0", [m("str", 1, 2)], {classSpecific: "sor"}),
    ], dict, typeNames);
    const row = (key) => rows.find((r) => r.key === key);

    it("adds the engine's lines, the first line's sort key and the class's full name", () => {
        expect(row("p0")).toMatchObject({lines: ["Cold Resist +11-20%"], sort: {property: "coldresist", max: 20},
            itemTypes: ["Weapon", "Grand Charm"], excludedItemTypes: ["Orb"], className: null});
        expect(row("s0").className).toBe("Sorceress");
    });

    it("tags the members of a folded group line as indirect matches", () => {
        expect(row("p1").statKeys).toEqual([{key: "dgrp2"}, {key: "fireresist", via: "All Resistances"},
            {key: "lightresist", via: "All Resistances"}, {key: "coldresist", via: "All Resistances"}, {key: "poisonresist", via: "All Resistances"}]);
    });

    it("gives a row with no lines no sort value, and warns about unknown codes and item types", () => {
        expect(row("p3")).toMatchObject({lines: [], statKeys: [], sort: null, itemTypes: []});
        expect(warnings).toEqual([
            'property "map-mon-droparmor" is not in Properties.txt (p3); it adds no stats',
            'affix type "amu" is not in ItemTypes.txt (p3); the game ignores it',
        ]);
    });

    it("lists the Stat filter's options under Items, then Maps, sorted without leading value tokens", () => {
        expect(stats).toEqual([
            {key: "dgrp2", label: "All Resistances +#", group: "Items"},
            {key: "coldresist", label: "Cold Resist +#%", group: "Items"},
            {key: "fireresist", label: "Fire Resist +#%", group: "Items"},
            {key: "lightresist", label: "Lightning Resist +#%", group: "Items"},
            {key: "poisonresist", label: "Poison Resist +#%", group: "Items"},
            {key: "strength", label: "+# to Strength", group: "Items"},
            {key: "map_play_goldbonus", label: "Gold Find: +#%", group: "Maps"},
            {key: "dgrp6", label: "Magic and Gold Find: +#%", group: "Maps"},
            {key: "map_play_magicbonus", label: "Magic Find: +#%", group: "Maps"},
        ]);
    });

    it("writes Affixes.json's format", () => {
        const json = affixesJson({rows, stats});
        expect(json.version).toBe(AFFIXES_VERSION);
        expect(json.stats).toBe(stats);
        expect(Object.keys(json.affixes[0])).toEqual(["key", "suffix", "name", "level", "maxLevel", "requiredLevel", "rare", "frequency",
            "group", "classSpecific", "className", "itemTypes", "excludedItemTypes", "lines", "statKeys", "sort"]);
    });
});

describe("checkAffixesFile and viaFor", () => {
    it("accept only the current file version", () => {
        expect(checkAffixesFile({version: AFFIXES_VERSION, stats: [], affixes: []}).affixes).toEqual([]);
        expect(() => checkAffixesFile([])).toThrow("Affixes.json: unsupported version undefined");
    });

    it("tag a row that reaches the stat only through a group line", () => {
        const allRes = {statKeys: [{key: "dgrp2"}, {key: "coldresist", via: "All Resistances"}]};
        const both = {statKeys: [{key: "coldresist"}, {key: "coldresist", via: "All Resistances"}]};
        expect(viaFor(allRes, "coldresist")).toBe("All Resistances");
        expect(viaFor(allRes, "dgrp2")).toBeNull();
        expect(viaFor(both, "coldresist")).toBeNull();
        expect(viaFor(allRes, "")).toBeNull();
        expect(viaFor(allRes, "strength")).toBeNull();
    });
});

describe("the real affix tables", () => {
    const {rows, stats, warnings} = realAffixData();
    const byKey = new Map(rows.map((r) => [r.key, r]));

    it("describe 1,412 rollable rows with unique keys", () => {
        expect(rows).toHaveLength(1412);
        expect(byKey.size).toBe(1412);
        expect(stats.length).toBeGreaterThan(150);
    });

    it("warn only about the map-mon-drop codes (of the Smith, of the Armorer) and the item code amu used as a type", () => {
        expect(warnings).toEqual([
            'property "map-mon-dropweapons" is not in Properties.txt (s840, s841, s842, s966, s967, s968); it adds no stats',
            'property "map-mon-droparmor" is not in Properties.txt (s843, s844, s845, s969, s970, s971); it adds no stats',
            'affix type "amu" is not in ItemTypes.txt (s123); the game ignores it',
        ]);
    });

    it("print the spec's spot checks", () => {
        expect(byKey.get("p317")).toMatchObject({name: "Shimmering", lines: ["All Resistances +3-6"]});
        expect(byKey.get("p466").lines).toEqual(["+1 to Combat Skills (Paladin Only)"]);
        expect(byKey.get("s806").lines).toEqual(["+10% Chance of Open Wounds", "+8-12 Open Wounds Damage Per Second"]);
        expect(byKey.get("s840")).toMatchObject({name: "of the Smith", lines: [], sort: null});
        expect(byKey.get("p860").lines).toContain("Magic and Gold Find: +10-20%");
        expect(byKey.get("p352")).toMatchObject({name: "Lapis", excludedItemTypes: ["Orb"]});
        expect(byKey.get("p119").itemTypes).toContain("Grand Charm");
        expect(new Set(["s421", "s422", "s423"].map((k) => byKey.get(k).statKeys[0].key))).toEqual(new Set(["item_skillongethit:38"]));
    });

    it("never print two lines with the same priority in one row", () => {
        const dict = realStatData();
        const texts = Object.fromEntries(["MagicPrefix", "MagicSuffix"].map((name) => [name, readExcel(name)]));
        const tied = readAffixes(texts).filter((a) => {
            const lines = describeEntries(expandMods(a.mods, dict, {ilvl: {min: a.level, max: 99}}).entries, dict);
            return new Set(lines.map((l) => l.priority)).size !== lines.length;
        });
        expect(tied.map((a) => a.key)).toEqual([]);
    });

    it("match the golden snapshot of every row's lines", async () => {
        const text = rows.map((r) => `${r.key}\t${r.name}\t${r.lines.join(" / ")}`).join("\n") + "\n";
        await expect(text).toMatchFileSnapshot("./__snapshots__/affixLines.golden.txt");
    });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run src/affixData.test.js`
Expected: FAIL, `Failed to resolve import "./affixData.js"`.

- [ ] **Step 4: Write the affix data module**

Create `src/affixData.js`:

```js
// The affix rows: MagicPrefix/MagicSuffix.txt read row by row, described by the stat engine
// (src/statEngine.js), and the Stat filter's options. The affix-data plugin (vite.config.js) writes
// Affixes.json from these rows, and the Item Builder's ItemBuilder.json takes its affixes from them too.
// Pure, so it runs in Vite, Vitest and Node tools.
import {parseTxt} from "./dropCalcData.js";
import {checkEntries, describe, expandMods} from "./statEngine.js";

export const AFFIXES_FILE = "Affixes.json";
export const AFFIXES_VERSION = 1;
export const AFFIX_TABLES = ["MagicPrefix", "MagicSuffix", "ItemTypes"];

const numbered = (prefix, n) => Array.from({length: n}, (_, i) => `${prefix}${i + 1}`);
const MOD_COLUMNS = [1, 2, 3].flatMap((i) => [`mod${i}code`, `mod${i}param`, `mod${i}min`, `mod${i}max`]);

export const AFFIX_TABLE_COLUMNS = ["Name", "spawnable", "rare", "level", "maxlevel", "levelreq", "classspecific",
    "class", "classlevelreq", "frequency", "group", ...MOD_COLUMNS, ...numbered("itype", 7), ...numbered("etype", 5)];

// The classes' full names, by the affix tables' class codes.
export const CLASS_NAMES = {ama: "Amazon", ass: "Assassin", bar: "Barbarian", dru: "Druid", nec: "Necromancer", pal: "Paladin", sor: "Sorceress"};

// ItemTypes.txt names that don't match the game's: lcha is the in-game Grand Charm and mcha the Large
// Charm (PD2 renamed them; ItemTypes.txt kept the old names), and misl, the arrows and bolts.
export const TYPE_NAME_OVERRIDES = {
    lcha: "Grand Charm", mcha: "Large Charm", lchp: "Grand Charm PVP", mchp: "Large Charm PVP", misl: "Bow/Crossbow Quiver",
};

const cell = (v) => (v ?? "").trim();
const int = (v, fallback = 0) => {
    const x = Number.parseInt(v, 10);
    return Number.isFinite(x) ? x : fallback;
};
const lines = (text) => text.replace(/\r\n/g, "\n").split("\n");

// A tab-separated table as row objects. Unlike dropCalcData's parseTxt it keeps blank lines, because an
// affix's key is its row index; only the newline that ends the file is dropped.
export function parseTableRows(text) {
    const all = lines(text);
    if (all.at(-1) === "") all.pop();
    const headers = (all[0] ?? "").split("\t").map((h) => h.trim());

    return all.slice(1).map((line) => {
        const cols = line.split("\t");
        const row = {};
        headers.forEach((h, i) => {
            row[h] = cols[i] ?? "";
        });
        return row;
    });
}

export function checkAffixColumns(table, text) {
    if (typeof text !== "string") throw new Error(`${table}.txt: missing`);
    const have = new Set((lines(text)[0] ?? "").split("\t").map((h) => h.trim()));
    const missing = AFFIX_TABLE_COLUMNS.filter((c) => !have.has(c));
    if (missing.length) {
        throw new Error(`${table}.txt: missing required column(s) ${missing.map((c) => `"${c}"`).join(", ")}`);
    }
}

// The rows that can roll (spawnable, frequency > 0), prefixes then suffixes in file order, keyed p/s plus
// the row index, with the fields the builder uses.
export function readAffixes(texts) {
    const out = [];
    for (const [table, suffix] of [["MagicPrefix", false], ["MagicSuffix", true]]) {
        checkAffixColumns(table, texts[table]);
        parseTableRows(texts[table]).forEach((row, index) => {
            if (cell(row.spawnable) !== "1" || int(row.frequency) <= 0) return;
            const list = (prefix, n) => numbered(prefix, n).map((c) => cell(row[c])).filter(Boolean);
            const classLevel = int(row.classlevelreq);
            out.push({
                key: `${suffix ? "s" : "p"}${index}`,
                suffix,
                name: cell(row.Name),
                level: int(row.level),
                maxLevel: int(row.maxlevel) > 0 ? int(row.maxlevel) : null,
                levelreq: int(row.levelreq),
                rare: cell(row.rare) === "1",
                classSpecific: cell(row.classspecific) || null,
                classLevelReq: cell(row.class) && classLevel > 0 ? {class: cell(row.class), level: classLevel} : null,
                group: int(row.group),
                frequency: int(row.frequency),
                itypes: list("itype", 7),
                etypes: list("etype", 5),
                mods: [1, 2, 3]
                    .map((i) => ({code: cell(row[`mod${i}code`]), param: cell(row[`mod${i}param`]),
                        min: int(row[`mod${i}min`], null), max: int(row[`mod${i}max`], null)}))
                    .filter((m) => m.code),
            });
        });
    }
    return out;
}

// A Stat filter label without its leading value tokens, for sorting: "+# to Life" sorts under L.
const sortableLabel = (label) => label.replace(/^[\s#+\-%]+/, "");

const isMapCode = (code) => code.toLowerCase().startsWith("map-");

// affixes: readAffixes' rows. Adds lines, statKeys and sort to each, and returns the Stat filter's
// options, plus warnings for what the game tolerates (unknown property codes, unknown item types).
export function describeAffixes(affixes, dict, typeNames) {
    const warnings = [];
    const options = new Map(); // key -> {labels: Map(label -> count), items: bool}
    const note = (key, label, items) => {
        const o = options.get(key) ?? {labels: new Map(), items: false};
        o.labels.set(label, (o.labels.get(label) ?? 0) + 1);
        o.items ||= items;
        options.set(key, o);
    };

    const unknownTypes = new Map();
    const names = (codes, key) => codes.flatMap((code) => {
        if (!typeNames.has(code)) {
            unknownTypes.set(code, [...(unknownTypes.get(code) ?? []), key]);
            return [];
        }
        return [typeNames.get(code)];
    });

    const unknownCodes = new Map();
    const expanded = affixes.map((a) => {
        const {entries, unknown} = expandMods(a.mods, dict, {ilvl: {min: a.level, max: 99}});
        for (const code of unknown) unknownCodes.set(code, [...(unknownCodes.get(code) ?? []), a.key]);
        return entries;
    });
    for (const [code, keys] of unknownCodes) warnings.push(`property "${code}" is not in Properties.txt (${keys.join(", ")}); it adds no stats`);
    checkEntries(expanded.flat(), dict);

    const rows = affixes.map((a, i) => {
        const described = describe(expanded[i], dict);
        const items = !a.mods.every((m) => isMapCode(m.code));

        const statKeys = [];
        for (const line of described) {
            statKeys.push({key: line.key});
            note(line.key, line.label, items);
            if (line.key.startsWith("dgrp")) {
                // Each member of a folded group matches indirectly, tagged with the group line.
                for (const member of line.stats) {
                    const alone = describe([{stat: member, layer: 0, min: line.value.min, max: line.value.max}], dict)[0];
                    statKeys.push({key: alone.key, via: line.via});
                    note(alone.key, alone.label, items);
                }
            }
        }

        const first = described[0];
        return {
            ...a,
            className: a.classSpecific ? CLASS_NAMES[a.classSpecific] ?? a.classSpecific : null,
            itemTypes: names(a.itypes, a.key),
            excludedItemTypes: names(a.etypes, a.key),
            lines: described.flatMap((l) => l.pieces),
            statKeys,
            sort: first ? {property: first.key, max: first.value.max} : null,
        };
    });

    for (const [code, keys] of unknownTypes) warnings.push(`affix type "${code}" is not in ItemTypes.txt (${keys.join(", ")}); the game ignores it`);

    // The most common label wins (the pair lines have a single-value and a range form).
    const stats = [...options].map(([key, o]) => ({
        key,
        label: [...o.labels].sort((x, y) => y[1] - x[1])[0][0],
        group: o.items ? "Items" : "Maps",
    })).sort((x, y) => (x.group === y.group ? 0 : x.group === "Items" ? -1 : 1)
        || sortableLabel(x.label).localeCompare(sortableLabel(y.label)) || x.label.localeCompare(y.label));

    return {rows, stats, warnings};
}

// ItemTypes.txt code -> display name, through TYPE_NAME_OVERRIDES.
export function itemTypeNames(text) {
    const out = new Map();
    for (const row of parseTxt(text)) {
        const code = cell(row.Code);
        if (code && !out.has(code)) out.set(code, TYPE_NAME_OVERRIDES[code] ?? cell(row.ItemType));
    }
    return out;
}

// Affixes.json: what the Affixes tab shows.
export function affixesJson({rows, stats}) {
    return {
        version: AFFIXES_VERSION,
        stats,
        affixes: rows.map((r) => ({
            key: r.key, suffix: r.suffix, name: r.name, level: r.level, maxLevel: r.maxLevel, requiredLevel: r.levelreq,
            rare: r.rare, frequency: r.frequency, group: r.group, classSpecific: r.classSpecific, className: r.className,
            itemTypes: r.itemTypes, excludedItemTypes: r.excludedItemTypes, lines: r.lines, statKeys: r.statKeys, sort: r.sort,
        })),
    };
}

// The loaded Affixes.json, checked: an old or foreign file fails loudly rather than rendering nothing.
export function checkAffixesFile(json) {
    if (json?.version !== AFFIXES_VERSION) throw new Error(`${AFFIXES_FILE}: unsupported version ${json?.version}`);
    return json;
}

// The Stat filter's tag for a row that reaches `statKey` only through a group line ("All Resistances");
// null when the row prints the stat's own line, or doesn't reach it.
export function viaFor(affix, statKey) {
    const keys = affix?.statKeys ?? [];
    if (!statKey || keys.some((k) => k.key === statKey && !k.via)) return null;
    return keys.find((k) => k.key === statKey)?.via ?? null;
}
```

`parseTableRows` and the affix-row reading move here from `src/itemBuilderData.js`; Task 7 deletes the old copies.

- [ ] **Step 5: Run the tests (the first run writes the golden snapshot)**

Run: `npx vitest run src/affixData.test.js && npm run lint`
Expected: 18 tests pass, `Snapshots 1 written`; `src/__snapshots__/affixLines.golden.txt` has 1,412 lines (`wc -l`), about 77 KB. Spot-read it: `grep -P "^(p317|p466|s532|p555|s402)\t" src/__snapshots__/affixLines.golden.txt` shows "All Resistances +3-6", "+1 to Combat Skills (Paladin Only)", "Level [1-6] Teleport ([33-52]/[33-52] Charges)", "+6 poison damage over 2 seconds", "Repairs 1 durability in 33 seconds". Task 10 reviews the whole file against upstream before it counts as accepted.

- [ ] **Step 6: Commit**

```bash
git add src/affixData.js src/affixData.test.js src/statFixtures.js src/__snapshots__/affixLines.golden.txt
git commit -m "affixData: affix rows described by the stat engine, Stat filter keys and options, exact item-type names; golden snapshot of every row's lines"
```

---

### Task 7: The `affix-data` plugin and the Item Builder on the engine's lines

The plugin replaces `item-builder-data`, writes both files, and `ItemBuilder.json` (format 2) carries `lines` and `sort` instead of `displayProperties`. The builder's panel and its Attributes sort read them. Upstream's `public/data/Affixes.json` stays until Task 8, so the Affixes tab keeps working; its Attributes ▲ default sort ties every row in this one commit (its rows have no `sort` yet), which Task 8 fixes.

**Files:**
- Modify: `vite.config.js` (whole file below), `.gitignore`
- Modify: `src/itemBuilderData.js` (whole file below), `src/itemBuilderFixtures.js` (whole file below), `src/itemBuilderData.test.js` (whole file below), `src/itemBuilderOdds.test.js:9`
- Modify: `src/ItemBuilderPanel.jsx:9-18,98`, `src/sortCompare.js:74-97`, `src/sortCompare.test.js`

**Interfaces:**
- Consumes: everything from Tasks 2–6.
- Produces: `buildItemBuilderJson({texts, affixes, weaponsJson, armorsJson})` → the file's JSON (no warnings any more: the affix warnings come from `describeAffixes`); `ITEM_BUILDER_VERSION = 2`; `ITEM_BUILDER_TABLES = ["Weapons", "Armor", "Misc", "ItemTypes"]`; `ITEM_BUILDER_JSON_FILES = ["Weapons.json", "Armors.json"]`; `builderAffix(row)`. `affixPrimaryPropertyAndMax(affix)` reads `affix.sort`.

- [ ] **Step 1: Replace the builder's data module**

Replace `src/itemBuilderData.js` with:

```js
// The Item Builder's data: the affix rows (src/affixData.js, described by the stat engine), the base items
// (Weapons, Armor, Misc.txt, with display names from Weapons/Armors.json) and the item-type tree
// (ItemTypes.txt), cut down to what the builder uses. Pure, so it runs in Vite, Vitest and the browser: the
// affix-data plugin (vite.config.js) writes ItemBuilder.json with buildItemBuilderJson, and the browser
// prepares it with prepareItemBuilder.
import {parseTxt} from "./dropCalcData.js";

export const ITEM_BUILDER_FILE = "ItemBuilder.json";
export const ITEM_BUILDER_VERSION = 2;
export const ITEM_BUILDER_TABLES = ["Weapons", "Armor", "Misc", "ItemTypes"];
export const ITEM_BUILDER_JSON_FILES = ["Weapons.json", "Armors.json"];

const BASE_COLUMNS = ["code", "type", "type2", "level", "levelreq", "spawnable"];

// Per table, the columns the builder reads. A missing one fails the build.
export const TABLE_COLUMNS = {
    Weapons: [...BASE_COLUMNS, "magic lvl"],
    Armor: [...BASE_COLUMNS, "magic lvl"],
    Misc: BASE_COLUMNS,
    ItemTypes: ["Code", "Equiv1", "Equiv2", "Class", "Rare"],
};

const cell = (v) => (v ?? "").trim();
const int = (v, fallback = 0) => {
    const x = Number.parseInt(v, 10);
    return Number.isFinite(x) ? x : fallback;
};

export function checkColumns(table, text) {
    if (typeof text !== "string") throw new Error(`${table}.txt: missing`);
    const first = text.replace(/\r\n/g, "\n").split("\n")[0] ?? "";
    const have = new Set(first.split("\t").map((h) => h.trim()));
    const missing = TABLE_COLUMNS[table].filter((c) => !have.has(c));
    if (missing.length) {
        throw new Error(`${table}.txt: missing required column(s) ${missing.map((c) => `"${c}"`).join(", ")}`);
    }
}

// An affix row as the builder stores it: affixData's fields, the engine's lines and the sort key.
const BUILDER_AFFIX_FIELDS = ["key", "suffix", "name", "level", "maxLevel", "levelreq", "rare", "classSpecific",
    "classLevelReq", "group", "frequency", "itypes", "etypes", "mods", "lines", "sort"];
export const builderAffix = (row) => Object.fromEntries(BUILDER_AFFIX_FIELDS.map((f) => [f, row[f]]));

// ---- Item types ---------------------------------------------------------------------------------

// Every ItemTypes.txt code with its equivalence chain (Equiv1/Equiv2 followed recursively, the type
// itself first), its class (ItemTypes "Class") and whether it can be rare.
export function buildTypes(text) {
    const byCode = new Map(parseTxt(text).filter((r) => cell(r.Code)).map((r) => [cell(r.Code), r]));
    const types = {};

    for (const [code, row] of byCode) {
        const chain = [];
        const queue = [code];
        while (queue.length) {
            const c = queue.shift();
            if (!c || chain.includes(c) || !byCode.has(c)) continue;
            chain.push(c);
            queue.push(cell(byCode.get(c).Equiv1), cell(byCode.get(c).Equiv2));
        }
        types[code] = {chain, class: cell(row.Class) || null, rare: cell(row.Rare) === "1"};
    }

    return types;
}

// ---- Bases --------------------------------------------------------------------------------------

// The base picker's optgroups, in display order, keyed by the base's primary type. Neither
// ItemTypes.txt (which calls lcha "Large Charm") nor the JSON gives usable plural labels.
export const GROUP_LABELS = [
    ["axe", "Axes"], ["taxe", "Throwing Axes"], ["swor", "Swords"], ["knif", "Daggers"], ["tkni", "Throwing Knives"],
    ["club", "Clubs"], ["mace", "Maces"], ["hamm", "Hammers"], ["scep", "Scepters"], ["wand", "Wands"],
    ["staf", "Staves"], ["spea", "Spears"], ["jave", "Javelins"], ["pole", "Polearms"], ["sc9", "Scythes"],
    ["bow", "Bows"], ["xbow", "Crossbows"], ["orb", "Sorceress Orbs"], ["abow", "Amazon Bows"],
    ["aspe", "Amazon Spears"], ["ajav", "Amazon Javelins"], ["h2h", "Claws"], ["h2h2", "Claws"],
    ["helm", "Helms"], ["circ", "Circlets"], ["pahm", "Paladin Helms"], ["phlm", "Barbarian Helms"],
    ["pelt", "Druid Pelts"], ["tors", "Body Armor"], ["shie", "Shields"], ["ashd", "Paladin Shields"],
    ["head", "Necromancer Heads"], ["glov", "Gloves"], ["boot", "Boots"], ["belt", "Belts"],
    ["bowq", "Arrows"], ["xboq", "Bolts"], ["amul", "Amulets"], ["ring", "Rings"], ["jewl", "Jewels"],
    ["mjwg", "Mythic Jewels"], ["scha", "Small Charms"], ["mcha", "Large Charms"], ["lcha", "Grand Charms"],
    ["ocha", "Ornate Charms"],
];
const TYPE_GROUP = new Map(GROUP_LABELS);
const GROUP_ORDER = new Map();
for (const [, label] of GROUP_LABELS) if (!GROUP_ORDER.has(label)) GROUP_ORDER.set(label, GROUP_ORDER.size);

// Misc.txt bases and their in-game names (PD2 shows cm2 as "Large Charm" and cm3 as "Grand Charm").
// The three quiver tiers share a name; the picker's qlvl tells them apart.
export const MISC_BASES = {
    amu: "Amulet", rin: "Ring", jew: "Jewel", mjw: "Mythic Jewel", cm1: "Small Charm", cm2: "Large Charm",
    cm3: "Grand Charm", cm4: "Ornate Charm", aqv: "Arrows", aqv2: "Arrows", aqv3: "Arrows", cqv: "Bolts",
    cqv2: "Bolts", cqv3: "Bolts",
};

function toBase(row, name, tier, types) {
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
    return {code, name, group, tier, qlvl: int(row.level), magicLvl: int(row["magic lvl"]), levelreq: int(row.levelreq),
        types: type2 ? [type, type2] : [type]};
}

// Spawnable weapons and armor the wiki lists (Weapons/Armors.json, not dontDisplay), plus MISC_BASES.
export function buildBases(texts, weaponsJson, armorsJson, types) {
    const bases = [];

    for (const [table, json] of [["Weapons", weaponsJson], ["Armor", armorsJson]]) {
        const listed = new Map(json.filter((x) => !x.dontDisplay).map((x) => [x.code, x]));
        for (const row of parseTxt(texts[table])) {
            const entry = listed.get(cell(row.code));
            if (cell(row.spawnable) !== "1" || !entry) continue;
            bases.push(toBase(row, entry.displayName || entry.name, entry.itemTier ?? null, types));
        }
    }

    const misc = new Map(parseTxt(texts.Misc).map((r) => [cell(r.code), r]));
    for (const [code, name] of Object.entries(MISC_BASES)) {
        const row = misc.get(code);
        if (!row) throw new Error(`Misc.txt: base ${code} ("${name}") is missing`);
        bases.push(toBase(row, name, null, types));
    }

    return bases.sort((a, b) => GROUP_ORDER.get(a.group) - GROUP_ORDER.get(b.group)
        || a.qlvl - b.qlvl || a.name.localeCompare(b.name));
}

// ---- The file -----------------------------------------------------------------------------------

// inputs: {texts: {[table]: .txt content}, affixes: describeAffixes' rows, weaponsJson, armorsJson}. Throws on
// bad data. The plugin adds linkVersion.
export function buildItemBuilderJson({texts, affixes, weaponsJson, armorsJson}) {
    for (const table of ITEM_BUILDER_TABLES) checkColumns(table, texts[table]);
    const types = buildTypes(texts.ItemTypes);
    const bases = buildBases(texts, weaponsJson, armorsJson, types);
    return {version: ITEM_BUILDER_VERSION, types, bases, affixes: affixes.map(builderAffix)};
}

// The loaded file, indexed for the rules and grouped for the base picker.
export function prepareItemBuilder(json) {
    if (json?.version !== ITEM_BUILDER_VERSION) throw new Error(`${ITEM_BUILDER_FILE}: unsupported version ${json?.version}`);
    const groups = [];
    const byLabel = new Map();
    for (const base of json.bases) {
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
        groups,
        baseByCode: new Map(json.bases.map((b) => [b.code, b])),
        affixByKey: new Map(json.affixes.map((a) => [a.key, a])),
    };
}

// ---- Link version -------------------------------------------------------------------------------

function fnv1a(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
}

// What links depend on: each affix's key, side, name, level and group in order, and the base codes.
// Stat values are left out on purpose: an old link stays valid when only an affix's values change.
export function linkFingerprint(json) {
    const affixes = json.affixes.map((a) => `${a.key}|${a.suffix ? 1 : 0}|${a.name}|${a.level}|${a.group}`).join("\n");
    const bases = json.bases.map((b) => b.code).sort().join(",");
    return fnv1a(`${affixes}\n#\n${bases}`);
}

// stored: src/itemBuilderVersion.json's content, or null. command: Vite's "serve" or "build".
export function resolveLinkVersion({fingerprint, stored, command}) {
    if (stored && Number.isInteger(stored.version) && stored.fingerprint === fingerprint) {
        return {version: stored.version, write: false};
    }
    if (command === "build") {
        throw new Error(stored
            ? "the Item Builder's link data changed: run the dev server once and commit src/itemBuilderVersion.json (the link version bump)"
            : "src/itemBuilderVersion.json is missing: run the dev server once and commit it");
    }
    return {version: stored && Number.isInteger(stored.version) ? stored.version + 1 : 1, write: true};
}
```

- [ ] **Step 2: Replace the builder's fixtures**

Replace `src/itemBuilderFixtures.js` with:

```js
// Test helpers for the Item Builder. Node-only (node:fs for the real tables), so the app must never
// import this module.
import {readFileSync} from "node:fs";
import {ITEM_BUILDER_TABLES, ITEM_BUILDER_VERSION, buildItemBuilderJson, prepareItemBuilder} from "./itemBuilderData.js";
import {readExcel, realAffixData} from "./statFixtures.js";

export {affixTableText, tableText} from "./statFixtures.js";

const DATA = new URL("../public/data/", import.meta.url);

export function readJson(path) {
    return JSON.parse(readFileSync(new URL(path, DATA), "utf8"));
}

// Everything the plugin passes to buildItemBuilderJson, from the real files.
export function readItemBuilderInputs() {
    return {
        texts: Object.fromEntries(ITEM_BUILDER_TABLES.map((name) => [name, readExcel(name)])),
        affixes: realAffixData().rows,
        weaponsJson: readJson("Weapons.json"),
        armorsJson: readJson("Armors.json"),
    };
}

export function realItemBuilderModel() {
    return prepareItemBuilder({...buildItemBuilderJson(readItemBuilderInputs()), linkVersion: 1});
}

const affix = (key, fields) => ({
    key, suffix: key.startsWith("s"), name: key, level: 1, maxLevel: null, levelreq: 1, rare: true,
    classSpecific: null, classLevelReq: null, group: 0, frequency: 1, itypes: ["weap"], etypes: [], mods: [],
    lines: [`${key} stat`], sort: {property: "x", max: 1}, ...fields,
});

// A small model covering every rule: classes, magic-only rows, max levels, exclusions, a group shared
// by a prefix and a suffix (2), a jewel, a magic-only charm and a magic-lvl circlet.
export function tinyModel() {
    return prepareItemBuilder({
        version: ITEM_BUILDER_VERSION,
        linkVersion: 3,
        types: {
            weap: {chain: ["weap"], class: null, rare: true},
            "1han": {chain: ["1han", "weap"], class: null, rare: true},
            axe: {chain: ["axe", "mele", "weap"], class: null, rare: true},
            orb: {chain: ["orb", "weap", "sorc", "clas"], class: "sor", rare: true},
            amul: {chain: ["amul", "misc"], class: null, rare: true},
            jewl: {chain: ["jewl", "sock", "misc"], class: null, rare: true},
            lcha: {chain: ["lcha", "char", "misc"], class: null, rare: false},
            circ: {chain: ["circ", "helm", "armo"], class: null, rare: true},
        },
        bases: [
            {code: "axe", name: "Test Axe", group: "Axes", tier: "Normal", qlvl: 30, magicLvl: 0, levelreq: 10, types: ["axe", "1han"]},
            {code: "orb", name: "Test Orb", group: "Sorceress Orbs", tier: "Normal", qlvl: 50, magicLvl: 1, levelreq: 20, types: ["orb"]},
            {code: "amu", name: "Amulet", group: "Amulets", tier: null, qlvl: 1, magicLvl: 0, levelreq: 0, types: ["amul"]},
            {code: "jew", name: "Jewel", group: "Jewels", tier: null, qlvl: 1, magicLvl: 0, levelreq: 0, types: ["jewl"]},
            {code: "cm3", name: "Grand Charm", group: "Grand Charms", tier: null, qlvl: 1, magicLvl: 0, levelreq: 0, types: ["lcha"]},
            {code: "ci3", name: "Diadem", group: "Circlets", tier: "Elite", qlvl: 85, magicLvl: 18, levelreq: 64, types: ["circ"]},
        ],
        affixes: [
            affix("p0", {name: "Sharp", group: 1, itypes: ["weap", "amul", "jewl"],
                lines: ["+5-10% Damage"], sort: {property: "dmg%", max: 10}}),
            affix("p1", {name: "Sharper", group: 1, level: 40,
                lines: ["+15-20% Damage"], sort: {property: "dmg%", max: 20}}),
            affix("p2", {name: "Magicky", group: 2, rare: false, itypes: ["weap", "amul"]}),
            affix("p3", {name: "Sorcy", group: 3, classSpecific: "sor", itypes: ["weap", "amul"]}),
            affix("p4", {name: "Barby", group: 4, classSpecific: "bar"}),
            affix("p5", {name: "Capped", group: 5, maxLevel: 20}),
            affix("p6", {name: "NoOrb", group: 6, etypes: ["orb"]}),
            affix("p7", {name: "Fourth", group: 7, itypes: ["weap", "amul", "jewl"]}),
            affix("s0", {name: "of Life", group: 10, itypes: ["weap", "amul", "jewl", "lcha"], levelreq: 30}),
            affix("s1", {name: "of Shared", group: 2, itypes: ["weap", "amul"]}),
            affix("s2", {name: "of Mana", group: 11, itypes: ["weap", "amul", "jewl"]}),
            affix("s3", {name: "of Speed", group: 12, itypes: ["weap", "amul", "jewl"]}),
            affix("s4", {name: "of Req", group: 13, itypes: ["weap", "amul"], levelreq: 40, classLevelReq: {class: "sor", level: 30}}),
        ],
    });
}
```

In `src/itemBuilderOdds.test.js:9`, replace `mods: [], displayProperties: [], ...fields,` with `mods: [], lines: [], sort: null, ...fields,`.

- [ ] **Step 3: Replace the builder's data tests**

Replace `src/itemBuilderData.test.js` with:

```js
import {describe, expect, it} from "vitest";
import {ITEM_BUILDER_VERSION, buildBases, buildItemBuilderJson, buildTypes, checkColumns, linkFingerprint, prepareItemBuilder, resolveLinkVersion} from "./itemBuilderData.js";
import {readItemBuilderInputs, tableText} from "./itemBuilderFixtures.js";

describe("checkColumns", () => {
    it("names the missing table and the missing columns", () => {
        expect(() => checkColumns("Weapons", undefined)).toThrow("Weapons.txt: missing");
        expect(() => checkColumns("Weapons", "code\ttype\n")).toThrow(/Weapons\.txt: missing required column\(s\) "type2"/);
    });
});

const TYPES_TEXT = tableText(["ItemType", "Code", "Equiv1", "Equiv2", "Class", "Rare"], [
    {ItemType: "None"},
    {ItemType: "Weapon", Code: "weap", Rare: "1"},
    {ItemType: "Melee Weapon", Code: "mele", Equiv1: "weap", Rare: "1"},
    {ItemType: "Axe", Code: "axe", Equiv1: "mele", Rare: "1"},
    {ItemType: "Orb", Code: "orb", Equiv1: "weap", Equiv2: "sorc", Class: "sor", Rare: "1"},
    {ItemType: "Sorceress Item", Code: "sorc", Equiv1: "clas"},
    {ItemType: "Class Specific", Code: "clas"},
    {ItemType: "Charm", Code: "char", Equiv1: "misc"},
    {ItemType: "Misc", Code: "misc"},
    {ItemType: "Large Charm", Code: "lcha", Equiv1: "char"},
    {ItemType: "Amulet", Code: "amul", Equiv1: "misc", Rare: "1"},
]);

describe("buildTypes", () => {
    const types = buildTypes(TYPES_TEXT);

    it("follows Equiv1/Equiv2 recursively, the type itself first", () => {
        expect(types.axe.chain).toEqual(["axe", "mele", "weap"]);
        expect(types.orb.chain).toEqual(["orb", "weap", "sorc", "clas"]);
    });

    it("reads the class and the rare flag, and skips rows without a code", () => {
        expect(types.orb.class).toBe("sor");
        expect(types.axe.class).toBeNull();
        expect(types.lcha.rare).toBe(false);
        expect(types.amul.rare).toBe(true);
        expect(Object.keys(types)).not.toContain("");
    });
});

describe("buildBases", () => {
    const types = buildTypes(TYPES_TEXT);
    const weaponCols = ["name", "code", "type", "type2", "level", "levelreq", "spawnable", "magic lvl"];
    const miscCols = ["name", "code", "type", "type2", "level", "levelreq", "spawnable"];
    const miscRows = Object.keys({amu: 1, rin: 1, jew: 1, mjw: 1, cm1: 1, cm2: 1, cm3: 1, cm4: 1, aqv: 1, aqv2: 1, aqv3: 1, cqv: 1, cqv2: 1, cqv3: 1})
        .map((code) => ({code, type: code === "cm3" ? "lcha" : "amul", level: "1", levelreq: "0", spawnable: "1"}));
    const texts = {
        Weapons: tableText(weaponCols, [
            {name: "Hand Axe", code: "hax", type: "axe", level: "3", levelreq: "0", spawnable: "1"},
            {name: "Unused", code: "zzz", type: "axe", level: "3", spawnable: "0"},
            {name: "Not in JSON", code: "pot", type: "axe", level: "1", spawnable: "1"},
            {name: "Eagle Orb", code: "ob1", type: "orb", level: "1", levelreq: "0", spawnable: "1", "magic lvl": "1"},
        ]),
        Armor: tableText(weaponCols, []),
        Misc: tableText(miscCols, miscRows),
    };
    const weaponsJson = [
        {code: "hax", displayName: "Hand Axe", itemTier: "Normal"},
        {code: "zzz", displayName: "Unused", itemTier: "Normal"},
        {code: "ob1", displayName: "Eagle Orb", itemTier: "Normal"},
    ];

    it("keeps spawnable bases the wiki lists, with qlvl, magic lvl and types from the .txt", () => {
        const bases = buildBases(texts, weaponsJson, [], types);
        const orb = bases.find((b) => b.code === "ob1");
        expect(orb).toEqual({code: "ob1", name: "Eagle Orb", group: "Sorceress Orbs", tier: "Normal", qlvl: 1, magicLvl: 1, levelreq: 0, types: ["orb"]});
        expect(bases.map((b) => b.code)).not.toContain("zzz");
        expect(bases.map((b) => b.code)).not.toContain("pot");
    });

    it("names the misc bases the way PD2 does", () => {
        const bases = buildBases(texts, weaponsJson, [], types);
        expect(bases.find((b) => b.code === "cm2").name).toBe("Large Charm");
        expect(bases.find((b) => b.code === "cm3")).toMatchObject({name: "Grand Charm", group: "Grand Charms"});
    });

    it("sorts by group order, then qlvl, then name", () => {
        const codes = buildBases(texts, weaponsJson, [], types).map((b) => b.code);
        expect(codes.indexOf("hax")).toBeLessThan(codes.indexOf("ob1"));
        expect(codes.indexOf("ob1")).toBeLessThan(codes.indexOf("amu"));
    });

    it("fails loudly on a base type with no label, a type missing from ItemTypes.txt, or a missing misc base", () => {
        const bad = (type) => ({...texts, Weapons: tableText(weaponCols, [{name: "X", code: "hax", type, level: "1", spawnable: "1"}])});
        expect(() => buildBases(bad("mele"), weaponsJson, [], types)).toThrow(/no optgroup label for type "mele"/);
        expect(() => buildBases(bad("nope"), weaponsJson, [], types)).toThrow(/type "nope" is not in ItemTypes\.txt/);
        expect(() => buildBases({...texts, Misc: tableText(miscCols, [])}, weaponsJson, [], types)).toThrow(/Misc\.txt: base amu/);
    });
});

describe("linkFingerprint and resolveLinkVersion", () => {
    const json = {
        bases: [{code: "b2"}, {code: "b1"}],
        affixes: [{key: "p0", suffix: false, name: "Sharp", level: 1, group: 1, mods: [{min: 1, max: 2}]}],
    };

    it("ignores stat values but changes when a row moves or a base disappears", () => {
        const fp = linkFingerprint(json);
        expect(fp).toMatch(/^[0-9a-f]{8}$/);
        expect(linkFingerprint({...json, affixes: [{...json.affixes[0], mods: [{min: 5, max: 9}]}]})).toBe(fp);
        expect(linkFingerprint({...json, bases: [{code: "b1"}, {code: "b2"}]})).toBe(fp);
        expect(linkFingerprint({...json, affixes: [{...json.affixes[0], key: "p1"}]})).not.toBe(fp);
        expect(linkFingerprint({...json, bases: [{code: "b1"}]})).not.toBe(fp);
    });

    it("keeps the version while the fingerprint matches", () => {
        expect(resolveLinkVersion({fingerprint: "aa", stored: {version: 4, fingerprint: "aa"}, command: "build"}))
            .toEqual({version: 4, write: false});
    });

    it("bumps and writes in dev, starting at 1", () => {
        expect(resolveLinkVersion({fingerprint: "bb", stored: {version: 4, fingerprint: "aa"}, command: "serve"}))
            .toEqual({version: 5, write: true});
        expect(resolveLinkVersion({fingerprint: "bb", stored: null, command: "serve"})).toEqual({version: 1, write: true});
    });

    it("fails a build on a mismatch or a missing file", () => {
        expect(() => resolveLinkVersion({fingerprint: "bb", stored: {version: 4, fingerprint: "aa"}, command: "build"}))
            .toThrow(/commit src\/itemBuilderVersion\.json/);
        expect(() => resolveLinkVersion({fingerprint: "bb", stored: null, command: "build"}))
            .toThrow(/src\/itemBuilderVersion\.json is missing/);
    });
});

describe("prepareItemBuilder", () => {
    it("indexes bases and affixes and groups bases in order", () => {
        const model = prepareItemBuilder({version: ITEM_BUILDER_VERSION, linkVersion: 2, types: {}, affixes: [{key: "p0"}],
            bases: [{code: "a", group: "Axes"}, {code: "b", group: "Orbs"}, {code: "c", group: "Axes"}]});
        expect(model.groups.map((g) => [g.label, g.bases.map((b) => b.code)])).toEqual([["Axes", ["a", "c"]], ["Orbs", ["b"]]]);
        expect(model.baseByCode.get("b").code).toBe("b");
        expect(model.affixByKey.get("p0").key).toBe("p0");
        expect(model.linkVersion).toBe(2);
    });

    it("rejects an unknown file version", () => {
        expect(() => prepareItemBuilder({version: 99})).toThrow("ItemBuilder.json: unsupported version 99");
    });
});

describe("the real data", () => {
    const json = buildItemBuilderJson(readItemBuilderInputs());

    it("takes the affix rows from the affix data, with the engine's lines and sort key", () => {
        expect(json.version).toBe(ITEM_BUILDER_VERSION);
        expect(json.affixes).toHaveLength(1412);
        const lapis = json.affixes.find((a) => a.key === "p352");
        expect(lapis).toEqual({
            key: "p352", suffix: false, name: "Lapis", level: 35, maxLevel: null, levelreq: 26, rare: true, classSpecific: null,
            classLevelReq: null, group: 117, frequency: 3, itypes: ["weap", "tors", "helm", "boot"], etypes: ["orb"],
            mods: [{code: "res-cold", param: "", min: 11, max: 20}], lines: ["Cold Resist +11-20%"], sort: {property: "coldresist", max: 20},
        });
        expect(json.affixes.find((a) => a.key === "p481")).toMatchObject({name: "Expert's", classSpecific: "bar", lines: ["+1 to Combat Skills (Barbarian Only)"]});
    });

    it("has the in-scope bases, uniquely coded, with their levels from the .txt", () => {
        const byCode = new Map(json.bases.map((b) => [b.code, b]));
        expect(byCode.size).toBe(json.bases.length);
        expect(json.bases.length).toBeGreaterThan(500);
        expect(byCode.get("ci3")).toMatchObject({name: "Diadem", qlvl: 85, magicLvl: 18, group: "Circlets"});
        expect(byCode.get("obc")).toMatchObject({qlvl: 67, magicLvl: 1, group: "Sorceress Orbs"});
        expect(byCode.get("cm2")).toMatchObject({name: "Large Charm", group: "Large Charms", qlvl: 1});
        expect(byCode.has("gps")).toBe(false); // throwing potions are out of scope
    });

    it("has the type tree the rules rely on", () => {
        expect(json.types.orb).toEqual({chain: ["orb", "weap", "sorc", "clas"], class: "sor", rare: true});
        expect(json.types.lcha.rare).toBe(false);
        expect(json.types.ocha.rare).toBe(false);
        expect(json.types.mjwg.chain).toContain("jewl");
    });
});
```

(The row-join tests are gone: `affixData.test.js` covers reading the rows.)

- [ ] **Step 4: Make the Attributes sort read `sort`**

In `src/sortCompare.js`, replace the whole `affixPrimaryPropertyAndMax` function (from `export function affixPrimaryPropertyAndMax(affix) {` to its closing `}`) with:

```js
// The Attributes sort key: the first line's Stat filter key and the upper bound of its first value
// (Affixes.json's `sort`). A row with no lines has sort null and sorts lowest.
export function affixPrimaryPropertyAndMax(affix) {
    const sort = affix?.sort;
    if (!sort) return {property: "", max: 0};
    return {property: String(sort.property ?? ""), max: Number.isFinite(sort.max) ? sort.max : 0};
}
```

In `src/sortCompare.test.js`:
- In the `affix()` helper, replace `displayProperties: [{property: "str", max: 1, displayString: "+1 to Strength"}],` with `sort: {property: "strength", max: 1},`.
- Replace the test `"Attributes: groups by property, then max; empty displayProperties sort lowest"` with:

```js
    it("Attributes: groups by property, then max; a row with no lines (sort null) sorts lowest", () => {
        const rows = [
            affix("a", {sort: {property: "str", max: 10}}),
            affix("b", {sort: null}),
            affix("c", {sort: {property: "dex", max: 5}}),
            affix("d", {sort: {property: "str", max: 2}}),
        ];
        expect(sortIds(rows, "attrs", "asc")).toEqual(["b", "c", "d", "a"]);
        expect(sortIds(rows, "attrs", "desc")).toEqual(["a", "d", "c", "b"]);
    });
```

- Replace the `describe("affixPrimaryPropertyAndMax", …)` block with:

```js
describe("affixPrimaryPropertyAndMax", () => {
    it("reads the row's sort key", () => {
        expect(affixPrimaryPropertyAndMax(affix("a", {sort: {property: "coldresist", max: 20}}))).toEqual({property: "coldresist", max: 20});
    });

    it("returns an empty property for a row with no lines", () => {
        expect(affixPrimaryPropertyAndMax(affix("a", {sort: null}))).toEqual({property: "", max: 0});
        expect(affixPrimaryPropertyAndMax({})).toEqual({property: "", max: 0});
    });
});
```

- In the `compareAffixesBy` test that builds a fully populated row, replace `displayProperties: [{property: "dex", max: 3}],` with `sort: {property: "dex", max: 3},`.

- [ ] **Step 5: The builder panel reads `lines`**

In `src/ItemBuilderPanel.jsx`:
- Add `import {CLASS_NAMES} from "./affixData.js";` after the `sortCompare.js` import, and delete the local `const CLASS_NAMES = {…};` line.
- Replace `const statText = (affix) => affix.displayProperties.map((p) => p.displayString).join(", ");` with `const statText = (affix) => affix.lines.join(", ");`.
- In `AffixRow`, replace `{affix.displayProperties.map((p, i) => <span key={i} className="ibStat">{p.displayString}</span>)}` with `{affix.lines.map((line, i) => <span key={i} className="ibStat">{line}</span>)}`.

- [ ] **Step 6: Replace the plugin**

Replace `vite.config.js` with:

```js
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { DROP_CALC_FILE, DROP_CALC_TABLES, tablesToJson } from './src/dropCalcData.js'
import { ITEM_BUILDER_FILE, ITEM_BUILDER_JSON_FILES, ITEM_BUILDER_TABLES, buildItemBuilderJson, linkFingerprint, resolveLinkVersion } from './src/itemBuilderData.js'
import { AFFIXES_FILE, AFFIX_TABLES, affixesJson, describeAffixes, itemTypeNames, readAffixes } from './src/affixData.js'
import { STAT_TABLES, buildStatData } from './src/statData.js'
import { parseTbl } from './src/tblFile.js'

const DROP_CALC_MODES = ['standard', 'damnation']

// The game tables keep their paths inside the game's MPQs, under public/data/<mode>/.
const EXCEL_DIR = path.join('data', 'global', 'excel')
const PATCH_STRINGS = path.join('data', 'local', 'LNG', 'ENG', 'patchstring.tbl')

const writeIfChanged = (file, text) => {
  if (!existsSync(file) || readFileSync(file, 'utf8') !== text) writeFileSync(file, text)
}

// Writes public/data/<mode>/DropCalculator.json from that mode's data/global/excel/ tables
// (src/dropCalcData.js). It runs in configResolved, before the dev server lists public/ (a file first
// written in buildStart could 404 until a restart), and again in dev when one of those .txt files changes.
// Skipped under Vitest (mode "test") and vite preview (which only serves dist/). The JSON is gitignored.
function dropCalcData() {
  let skip = false
  let dataDir = ''

  function generate(mode) {
    const dir = path.join(dataDir, mode)
    const texts = Object.fromEntries(DROP_CALC_TABLES.map((name) => [name, readFileSync(path.join(dir, EXCEL_DIR, `${name}.txt`), 'utf8')]))
    writeIfChanged(path.join(dir, DROP_CALC_FILE), JSON.stringify(tablesToJson(texts)))
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
      const onTxt = (file) => {
        // <mode>/data/global/excel/<name>.txt: anything shallower or deeper is not a table.
        const [mode, ...rest] = path.relative(dataDir, file).split(path.sep)
        const name = rest.pop()
        if (rest.join('/') !== 'data/global/excel' || !DROP_CALC_MODES.includes(mode) || !name?.endsWith('.txt')) return
        try {
          generate(mode)
          server.config.logger.info(`drop-calc-data: regenerated ${mode}/${DROP_CALC_FILE}`)
        } catch (e) {
          server.config.logger.error(`drop-calc-data: ${mode}: ${e.message}`)
        }
      }
      // 'add' too: a table that was missing at startup, or written as a delete then create.
      server.watcher.on('change', onTxt)
      server.watcher.on('add', onTxt)
    },
  }
}

// Writes public/data/standard/Affixes.json and ItemBuilder.json. The affix rows come from the standard
// data/global/excel/ tables, described by the stat engine with SoE's patchstring.tbl and src/baseStrings.json
// (src/affixData.js); the builder adds bases and item types (src/itemBuilderData.js, with Weapons/Armors.json)
// and the link version from src/itemBuilderVersion.json. In dev a change in what links depend on bumps that
// version and rewrites the file (commit it); a build fails instead. Same timing as drop-calc-data; skipped
// under Vitest and vite preview. Both JSON files are gitignored.
function affixData() {
  let skip = false
  let dataDir = ''
  let root = ''
  let command = 'serve'
  const tables = [...new Set([...AFFIX_TABLES, ...ITEM_BUILDER_TABLES, ...STAT_TABLES])]
  const standard = () => path.join(dataDir, 'standard')
  const tablePath = (name) => path.join(standard(), EXCEL_DIR, `${name}.txt`)
  const baseStringsPath = () => path.join(root, 'src', 'baseStrings.json')

  function generate(logger) {
    const texts = Object.fromEntries(tables.map((name) => [name, readFileSync(tablePath(name), 'utf8')]))
    const dict = buildStatData({
      texts,
      patchStrings: parseTbl(new Uint8Array(readFileSync(path.join(standard(), PATCH_STRINGS)))),
      baseStrings: JSON.parse(readFileSync(baseStringsPath(), 'utf8')),
    })
    const { rows, stats, warnings } = describeAffixes(readAffixes(texts), dict, itemTypeNames(texts.ItemTypes))
    for (const w of warnings) logger.warn(`affix-data: ${w}`)
    writeIfChanged(path.join(standard(), AFFIXES_FILE), JSON.stringify(affixesJson({ rows, stats })))

    const [weaponsJson, armorsJson] = ITEM_BUILDER_JSON_FILES.map((f) => JSON.parse(readFileSync(path.join(dataDir, f), 'utf8')))
    const json = buildItemBuilderJson({ texts, affixes: rows, weaponsJson, armorsJson })
    const versionFile = path.join(root, 'src', 'itemBuilderVersion.json')
    const fingerprint = linkFingerprint(json)
    const stored = existsSync(versionFile) ? JSON.parse(readFileSync(versionFile, 'utf8')) : null
    const { version, write } = resolveLinkVersion({ fingerprint, stored, command })
    if (write) {
      writeFileSync(versionFile, JSON.stringify({ version, fingerprint }, null, 2) + '\n')
      logger.warn(`affix-data: link version set to ${version} (commit src/itemBuilderVersion.json)`)
    }
    writeIfChanged(path.join(standard(), ITEM_BUILDER_FILE), JSON.stringify({ ...json, linkVersion: version }))
  }

  return {
    name: 'affix-data',
    config(_, env) {
      skip = env.mode === 'test' || !!env.isPreview
    },
    configResolved(config) {
      if (skip || !config.publicDir) return
      dataDir = path.join(config.publicDir, 'data')
      root = config.root
      command = config.command
      try {
        generate(config.logger)
      } catch (e) {
        // A build must not ship without the affix data; the dev server keeps running.
        if (config.command === 'build') throw e
        config.logger.error(`affix-data: ${e.message}`)
      }
    },
    configureServer(server) {
      if (!dataDir) return
      const sources = new Set([
        ...tables.map(tablePath),
        path.join(standard(), PATCH_STRINGS),
        baseStringsPath(),
        ...ITEM_BUILDER_JSON_FILES.map((f) => path.join(dataDir, f)),
      ])
      const onFile = (file) => {
        if (!sources.has(path.resolve(file))) return
        try {
          generate(server.config.logger)
          server.config.logger.info(`affix-data: regenerated standard/${AFFIXES_FILE} and standard/${ITEM_BUILDER_FILE}`)
        } catch (e) {
          server.config.logger.error(`affix-data: ${e.message}`)
        }
      }
      server.watcher.on('change', onFile)
      server.watcher.on('add', onFile)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), dropCalcData(), affixData()],
  base: '/TheArchivistSoE/'
})
```

In `.gitignore`, replace the block

```
# Generated from public/data/standard/*.txt and public/data/*.json by the item-builder-data plugin (vite.config.js)
public/data/standard/ItemBuilder.json
```

with

```
# Generated from public/data/standard/data/ (game tables, patchstring.tbl), src/baseStrings.json and
# public/data/*.json by the affix-data plugin (vite.config.js)
public/data/standard/Affixes.json
public/data/standard/ItemBuilder.json
```

and the drop-calc comment `Generated from public/data/<mode>/*.txt` becomes `Generated from public/data/<mode>/data/global/excel/*.txt`.

- [ ] **Step 7: Run everything**

```bash
npx vitest run && npm run lint && npm run build 2>&1 | grep -E "affix-data|error|built in"
git status --short
```

Expected: all tests pass (the golden snapshots unchanged); lint clean; the build logs three `affix-data:` warnings (`map-mon-dropweapons` with 6 keys, `map-mon-droparmor` with 6 keys, `amu` (s123)) and `built in …`. `src/itemBuilderVersion.json` is NOT modified (the link fingerprint stays `4c24e370`); `public/data/standard/Affixes.json` and `ItemBuilder.json` don't appear in `git status` (ignored).

- [ ] **Step 8: Browser check the builder**

Start the dev server, then:

```bash
mkdir -p tools/checks/shots /tmp/claude-1000/shots-ib
cd tools/checks && APP_URL=http://localhost:5190/TheArchivistSoE/ node check-itembuilder.mjs /tmp/claude-1000/shots-ib; cd ../..
```

Expected: `all checks passed`. Its search test ("the search matches stat text (e.g. 'Cold Resist +16-20%')") still holds: the engine prints Cold Resist the same way. If a check that compares stat text fails only on wording, update the check's expected text to the engine's (that is the redesign) and say so in the commit message; any other failure is a bug to fix. Leave the dev server running for Task 8.

- [ ] **Step 9: Commit**

```bash
git add vite.config.js .gitignore src/itemBuilderData.js src/itemBuilderFixtures.js src/itemBuilderData.test.js src/itemBuilderOdds.test.js src/ItemBuilderPanel.jsx src/sortCompare.js src/sortCompare.test.js tools/checks
git commit -m "affix-data plugin: Affixes.json and ItemBuilder.json (format 2) from the stat engine; the builder shows the engine's lines and sorts by its sort key"
```

---

### Task 8: The Affixes tab on the generated file

**Files:**
- Create: `src/affixesLoad.js`, `src/affixesLoad.test.js`, `src/useAffixes.js`
- Delete: `public/data/Affixes.json`
- Modify: `src/App.jsx` (imports; `affixDisplayString`; `buildSearchTextForItem`; `affixTypes`; `App`'s data hook; `AffixesPanel`), `src/sortCompare.js:43-72`, `src/sortCompare.test.js`

**Interfaces:**
- Consumes: `AFFIXES_FILE`, `checkAffixesFile` (Task 6).
- Produces: `loadAffixes()` → `Promise<{version, stats, affixes}>` (cached; a failure is evicted). `useAffixes(tab)` → `{status: "loading"|"ready"|"error", data, error, retry}`.

- [ ] **Step 1: Write the loader's failing tests**

Create `src/affixesLoad.test.js`:

```js
import {afterEach, describe, expect, it, vi} from "vitest";
import {AFFIXES_FILE, AFFIXES_VERSION} from "./affixData.js";

const FILE = {version: AFFIXES_VERSION, stats: [], affixes: []};
const ok = (json) => ({ok: true, status: 200, json: async () => json});

// A fresh module per test, so the module-level cache starts empty.
async function freshLoader(fetchImpl) {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn(fetchImpl));
    return (await import("./affixesLoad.js")).loadAffixes;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("loadAffixes", () => {
    it("fetches the standard file once, with no-store, and reuses it", async () => {
        const loadAffixes = await freshLoader(async () => ok(FILE));
        const first = await loadAffixes();
        expect(await loadAffixes()).toBe(first);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch.mock.calls[0][0]).toMatch(/data\/standard\/Affixes\.json$/);
        expect(fetch.mock.calls[0][1]).toEqual({cache: "no-store"});
    });

    it("reports an HTTP error, then retries on the next call", async () => {
        let calls = 0;
        const loadAffixes = await freshLoader(async () => (++calls === 1 ? {ok: false, status: 404} : ok(FILE)));
        await expect(loadAffixes()).rejects.toThrow(`${AFFIXES_FILE}: HTTP 404`);
        await expect(loadAffixes()).resolves.toEqual(FILE);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("reports a response that isn't JSON, and a file of another version", async () => {
        const notJson = await freshLoader(async () => ({ok: true, status: 200, json: async () => { throw new SyntaxError("<"); }}));
        await expect(notJson()).rejects.toThrow(`${AFFIXES_FILE}: not valid JSON (file missing or not generated?)`);
        const upstream = await freshLoader(async () => ok([{name: "Stout"}])); // upstream's old list format
        await expect(upstream()).rejects.toThrow(`${AFFIXES_FILE}: unsupported version undefined`);
    });
});
```

Run: `npx vitest run src/affixesLoad.test.js`
Expected: FAIL, `Failed to resolve import "./affixesLoad.js"`.

- [ ] **Step 2: Write the loader and the hook**

Create `src/affixesLoad.js`:

```js
// Loads the Affixes tab's data: Affixes.json (generated by the affix-data plugin in vite.config.js),
// fetched once per page load. The same file serves both modes.
import {AFFIXES_FILE, checkAffixesFile} from "./affixData.js";

let cached = null;

async function fetchAffixes() {
    const res = await fetch(`${import.meta.env.BASE_URL}data/standard/${AFFIXES_FILE}`, {cache: "no-store"});
    if (!res.ok) throw new Error(`${AFFIXES_FILE}: HTTP ${res.status}`);
    // A dev server answers a missing file with index.html and status 200, so the parse can fail too.
    const json = await res.json().catch(() => {
        throw new Error(`${AFFIXES_FILE}: not valid JSON (file missing or not generated?)`);
    });
    return checkAffixesFile(json);
}

// A failed load is evicted, so the next call tries again.
export function loadAffixes() {
    if (!cached) {
        const promise = fetchAffixes();
        cached = promise;
        promise.catch(() => {
            if (cached === promise) cached = null;
        });
    }
    return cached;
}
```

Create `src/useAffixes.js`:

```js
// The Affixes tab's data, owned by App: Affixes.json is fetched the first time the tab opens, and the
// result is taken in the promise's callbacks (never synchronously in the effect), like useItemBuilder.
import {useEffect, useState} from "react";
import {loadAffixes} from "./affixesLoad.js";

export function useAffixes(tab) {
    const [file, setFile] = useState(null);
    const [error, setError] = useState("");
    const active = tab === "affixes";

    // retry() clears the error, which runs the effect again.
    useEffect(() => {
        if (!active || file || error) return undefined;
        let live = true;
        loadAffixes().then(
            (f) => {
                if (live) setFile(f);
            },
            (e) => {
                if (live) setError(e instanceof Error ? e.message : String(e));
            },
        );
        return () => {
            live = false;
        };
    }, [active, file, error]);

    return {
        status: file ? "ready" : error ? "error" : "loading",
        data: file,
        error,
        retry: () => setError(""),
    };
}
```

Run: `npx vitest run src/affixesLoad.test.js`
Expected: 3 tests pass.

- [ ] **Step 3: Sort by the new fields**

In `src/sortCompare.js`'s `affixSortValue`, replace

```js
        case "types":
            return affix?.displayItemTypeNames;
        case "excluded":
            return affix?.displayExcludedItemTypeNames;
        case "class":
            return affix?.classDisplayName;
```

with

```js
        case "types":
            return affix?.itemTypes;
        case "excluded":
            return affix?.excludedItemTypes;
        case "class":
            return affix?.className;
```

and in `src/sortCompare.test.js` rename the old fields:

```bash
sed -i -e 's/displayExcludedItemTypeNames/excludedItemTypes/g' -e 's/displayItemTypeNames/itemTypes/g' \
  -e 's/classDisplayName/className/g' -e 's/"Staff Class"/"Orb"/g' src/sortCompare.test.js
sed -i 's|// Minimal rows shaped like public/data/Affixes.json entries.|// Minimal rows shaped like the generated Affixes.json rows.|' src/sortCompare.test.js
grep -c "displayProperties\|displayItemTypeNames\|classDisplayName" src/sortCompare.test.js
```

Expected: `0`.

- [ ] **Step 4: Switch App to the generated file**

In `src/App.jsx`:

1. After `import {useItemBuilder} from "./useItemBuilder.js";` add `import {useAffixes} from "./useAffixes.js";`.
2. Replace the whole `affixDisplayString` function (from `function affixDisplayString(affix) {` through `    return String(dp);\n}`) with:

```js
// An affix row's lines, as the table shows them.
function affixDisplayString(affix) {
    return (affix?.lines ?? []).join(" / ");
}
```

3. In `buildSearchTextForItem`, replace the whole `if (tab === "affixes") { … }` block with:

```js
    if (tab === "affixes") {
        const lines = (it?.lines ?? []).join("\n").toLowerCase();
        return applyModifierExpansions(`${name}\n${lines}`);
    }
```

4. Replace `affixTypes`'s body line `const a = Array.isArray(it?.displayItemTypeNames) ? it.displayItemTypeNames : [];` with `const a = Array.isArray(it?.itemTypes) ? it.itemTypes : [];`.
5. Before `export default function App() {`, add:

```js
// The Affixes rows while Affixes.json loads or failed: one array, so memos keyed on it stay put.
const NO_AFFIXES = [];
```

6. In `App`, delete the line `const affixes = useJson("Affixes.json", damnationMode);` (the hook needs `tab`, which is declared later). Then, right after `const itemBuilder = useItemBuilder({tab, query: builderQuery, setQuery: setBuilderQuery});`, add:

```js
    const affixFile = useAffixes(tab);
    // Memoized: `affixes` feeds `dataset` and `items`, which the React Compiler checks as memo dependencies;
    // a fresh object per render fails lint (react-hooks/preserve-manual-memoization).
    const affixes = useMemo(() => ({
        loading: affixFile.status === "loading",
        error: affixFile.error,
        data: affixFile.data?.affixes ?? NO_AFFIXES,
    }), [affixFile.status, affixFile.error, affixFile.data]);
```

7. Pass the retry to the panel: in the `<AffixesPanel` element add `onRetry={affixFile.retry}`. In `AffixesPanel`'s signature add `onRetry`; in its error branch replace

```jsx
            <div className="meta">
                Failed to load affixes: {String(error.message || error)}
            </div>
```

with

```jsx
            <div className="meta">
                Failed to load affixes: {String(error.message || error)}{" "}
                <button type="button" className="btn" onClick={onRetry}>Retry</button>
            </div>
```

8. In `AffixesPanel`'s rows: the row key `` `${pager.page}-${idx}-${it.id || it.name}` `` becomes `` `${pager.page}-${idx}-${it.key}` ``; `(it?.displayItemTypeNames || []).join(", ")` becomes `(it?.itemTypes || []).join(", ")`; `(it?.displayExcludedItemTypeNames || []).join(", ")` becomes `(it?.excludedItemTypes || []).join(", ")`; `n(it?.classDisplayName)` becomes `n(it?.className)`.

Check that nothing reads the old fields: `grep -n "displayItemTypeNames\|displayExcludedItemTypeNames\|classDisplayName" src/App.jsx` prints nothing, and `grep -n "displayProperties" src/App.jsx` lists only the runewords, uniques and sacreds code (lines that read `rw?.`, `u?.` or the uniques/runewords search branch).

- [ ] **Step 5: Delete upstream's file**

```bash
git rm public/data/Affixes.json
```

- [ ] **Step 6: Run the tests, lint, build**

```bash
npx vitest run && npm run lint && npm run build 2>&1 | grep -E "error|built in"
```

Expected: everything passes; `built in …`.

- [ ] **Step 7: Browser check**

With the dev server from Task 7 (if it isn't running, start it):

```bash
cd tools/checks
for c in check-multisort check-sticky check-select-keyboard check-itembuilder check-dropcalc check-tier-order; do
  mkdir -p /tmp/claude-1000/shots-$c
  echo "== $c"; APP_URL=http://localhost:5190/TheArchivistSoE/ node $c.mjs /tmp/claude-1000/shots-$c | tail -3
done
cd ../..
```

Expected: every script ends with `all checks passed`. `check-multisort.mjs` compares sort orders through the table's own cells, so it tests the new fields; a failure there is a real bug. Then open `http://localhost:5190/TheArchivistSoE/#/affixes` in the screenshot harness or by eye: the Item types column shows "Grand Charm", "Orb", "Staff", and Lapis (level 35) excludes "Orb".

- [ ] **Step 8: Commit**

```bash
git add src/affixesLoad.js src/affixesLoad.test.js src/useAffixes.js src/App.jsx src/sortCompare.js src/sortCompare.test.js
git commit -m "Affixes tab: the generated Affixes.json (lines, exact item-type names, class names), loaded on first visit with a Retry; upstream's Affixes.json deleted"
```

---

### Task 9: The Stat filter

**Files:**
- Modify: `src/App.jsx` (`FiltersBar`, `App`'s filter state and `filtered`, `AffixesPanel`), `src/styles.css`
- Create: `tools/checks/check-affix-stats.mjs`

**Interfaces:**
- Consumes: `viaFor(affix, statKey)` and the file's `stats` (Task 6), `affixFile` (Task 8).

- [ ] **Step 1: The filter's control**

In `src/App.jsx`'s `FiltersBar`:
- Add to the destructured props, after `setAffixTypeValue = () => {\n                        },`:

```js
                        showStat = false,
                        statValue = "",
                        setStatValue = () => {
                        },
                        statOptions = [],
```

- In `hasFolded`, add `|| showStat` after `showAffixType`; in `activeCount`'s array add `showStat && statValue,` after `showAffixType && affixTypeValue,`.
- After the Affix type `SearchableSelect` block (the one ending `className="filterSelMid"\n                />)}`), add:

```jsx

                {/* Stat (direct and indirect sources) – affixes tab only */}
                {showStat && (<SearchableSelect
                    value={statValue}
                    onChange={setStatValue}
                    options={statOptions}
                    placeholder="Any stat"
                    className="filterSelWide"
                    ariaLabel="Stat"
                />)}
```

- [ ] **Step 2: The filter's state, options and matching**

In `App`:
- After `const [affixTypeValue, setAffixTypeValue] = useState("");` add `const [statValue, setStatValue] = useState("");`.
- In `filterState`, add `statValue` after `affixTypeValue,`.
- In the tab-change reset (`setAffixTypeValue("");`), add `setStatValue("");` after it.
- After the `affixes` object (Task 8), add:

```js
    // The Stat filter's options: "Any stat", then the stats under Items and Maps headings.
    const statOptions = useMemo(() => {
        const stats = affixFile.data?.stats ?? [];
        const under = (group) => stats.filter((s) => s.group === group).map((s) => ({value: s.key, label: s.label}));
        return [{value: "", label: "Any stat"}, {group: "Items"}, ...under("Items"), {group: "Maps"}, ...under("Maps")];
    }, [affixFile.data]);
```

- In `filtered`'s affixes branch, after the Prefix/Suffix test (`if (it?.suffix) return false;\n                }`), add:

```js

                if (statValue && !(it?.statKeys ?? []).some((k) => k.key === statValue)) return false;
```

and add `statValue` to `filtered`'s dependency array after `affixTypeValue`.
- On the Affixes tab's `<FiltersBar` (the one followed by `<InfoPanel`), add the props:

```jsx
                        showStat
                        statValue={statValue}
                        setStatValue={setStatValue}
                        statOptions={statOptions}
```

and on `<AffixesPanel` add `statValue={statValue}`.

- [ ] **Step 3: The "via" tag**

- Add `import {viaFor} from "./affixData.js";` after the `useAffixes` import.
- In `AffixesPanel`'s signature add `statValue`. Replace the Attributes cell `<td>{affixDisplayString(it)}</td>` with:

```jsx
                    <td>
                        {affixDisplayString(it)}
                        {viaFor(it, statValue) && <div className="affixVia">via {viaFor(it, statValue)}</div>}
                    </td>
```

- In `src/styles.css`, after the `.affixTable th { … }` rule block, add:

```css

/* Stat filter: a row that reaches the chosen stat only through a group line ("via All Resistances"). */
.affixVia {
    margin-top: 2px;
    font-size: 13px;
    color: var(--muted);
}
```

(It shows only while a stat is chosen, so no other tab and no default view changes. The filter select lives in `.filtersFold`, whose mobile rule `.filtersPanel .filtersFold .selSearchWrap { max-width: none; }` already stacks it full width; search the 720px and 480px blocks for `selSearchWrap` before adding any mobile rule — today none is needed.)

- [ ] **Step 4: Lint and unit tests**

Run: `npm run lint && npx vitest run`
Expected: clean; all pass.

- [ ] **Step 5: Write the browser check**

Create `tools/checks/check-affix-stats.mjs`:

```js
// The Affixes tab's Stat filter, desktop then a 390x844 phone. node check-affix-stats.mjs   (APP_URL = a dev server)
import {run, checker, BASE, openTab, OVERFLOW_CHECK, sleep} from "./cdp.mjs";

const c = checker();
const ROWS = `[...document.querySelectorAll(".affixTableScroll tbody tr")].map((tr) => ({name: tr.cells[0].textContent.trim(), attrs: tr.cells[1].textContent.trim(), types: tr.cells[7].textContent.trim()}))`;
const TOTAL = `Number(/of (\\d+)/.exec(document.querySelector(".affixPager")?.textContent ?? "")?.[1] ?? 0)`;
const STAT_TRIGGER = `[...document.querySelectorAll(".filtersPanel .selTrigger")].find((t) => /stat/i.test(t.textContent))`;

async function chooseStat(page, label) {
    await page.eval(`${STAT_TRIGGER}.click()`);
    await sleep(200);
    await page.type(".selDropdown .selSearchInput", label);
    await page.click(".selDropdown .selOption", {text: label});
    await sleep(400);
}

async function checkFilter(page, where) {
    const all = await page.eval(TOTAL);
    await chooseStat(page, "Cold Resist +#%");
    const total = await page.eval(TOTAL);
    const rows = await page.eval(ROWS);
    c.ok(total > 0 && total < all, `${where}: Cold Resist narrows the table`, `${total} of ${all}`);
    c.ok(rows.every((r) => /Cold Resist|All Resistances/.test(r.attrs)), `${where}: every row prints Cold Resist or All Resistances`);
    c.ok(rows.some((r) => /via All Resistances/.test(r.attrs)), `${where}: indirect rows carry "via All Resistances"`);
    c.ok(rows.some((r) => !/via/.test(r.attrs)), `${where}: direct rows carry no tag`);
}

await run(async (page) => {
    await page.desktop();
    await page.goto(`${BASE}#/affixes`);
    await page.waitFor(`document.querySelectorAll(".affixTableScroll tbody tr").length > 1`);
    await checkFilter(page, "desktop");

    // Combined with Prefix/Suffix by AND: all 49 Cold Resist rows are prefixes.
    const coldRows = await page.eval(TOTAL);
    await page.click(".filtersPanel .selTrigger", {text: "All affix types"});
    await page.click(".selDropdown .selOption", {text: "Prefix"});
    await sleep(400);
    c.ok((await page.eval(TOTAL)) === coldRows, "desktop: Stat + Prefix keeps every Cold Resist row");
    await page.click(".filtersPanel .selTrigger", {text: "Prefix"});
    await page.click(".selDropdown .selOption", {text: "Suffix"});
    await sleep(400);
    const empty = await page.eval(`document.querySelector(".emptyState")?.textContent ?? ""`);
    c.ok(/No affixes match/.test(empty), "desktop: Stat + Suffix combine by AND (no suffix gives Cold Resist)", empty);

    // Item type options are exact names.
    await page.click(".filtersPanel .selTrigger", {text: "All types"});
    const types = await page.eval(`[...document.querySelectorAll(".selDropdown .selOption")].map((e) => e.textContent.trim())`);
    c.ok(types.includes("Orb") && types.includes("Grand Charm") && !types.includes("Staff Class"), "desktop: item types are exact names", types.slice(0, 8).join(", "));
    await page.key("Escape");

    // A tab switch resets the filter.
    await openTab(page, "weapons");
    await openTab(page, "affixes");
    await page.waitFor(`document.querySelectorAll(".affixTableScroll tbody tr").length > 1`);
    const label = await page.eval(`${STAT_TRIGGER}?.textContent.trim()`);
    c.ok(/Any stat/.test(label ?? ""), "desktop: leaving the tab resets the Stat filter", label);

    // The Damnation toggle doesn't change the file.
    const before = await page.eval(TOTAL);
    await page.click(".topBarToggle input");
    await sleep(800);
    c.ok((await page.eval(TOTAL)) === before, "desktop: the Damnation toggle shows the same rows");
    await page.click(".topBarToggle input");

    await page.mobile();
    await page.goto(`${BASE}#/affixes`);
    await page.waitFor(`document.querySelectorAll(".affixTableScroll tbody tr").length > 1`);
    await page.click(".filtersToggle");
    await checkFilter(page, "phone");
    const overflow = await page.eval(OVERFLOW_CHECK);
    c.ok(overflow.count === 0, "phone: no horizontal overflow", JSON.stringify(overflow.offenders));
});

c.done();
```

Also check the Retry path by hand once: rename `public/data/standard/Affixes.json` away, reload `#/affixes`, see "Failed to load affixes … Retry", rename it back, click Retry, see rows.

- [ ] **Step 6: Run the browser checks**

```bash
cd tools/checks
APP_URL=http://localhost:5190/TheArchivistSoE/ node check-affix-stats.mjs
mkdir -p /tmp/claude-1000/shots-ms
APP_URL=http://localhost:5190/TheArchivistSoE/ node check-multisort.mjs /tmp/claude-1000/shots-ms | tail -2
cd ../..
```

Expected: `all checks passed` for both.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx src/styles.css tools/checks/check-affix-stats.mjs
git commit -m "Affixes tab: Stat filter (one stat, direct and via-group sources, Items and Maps), check-affix-stats browser check"
```

---

### Task 10: The upstream diff report

**Files:**
- Create: `tools/checks/diff-affix-lines.mjs`
- Output (not committed): `docs/research/stat-summing/notes/affix-lines-diff.md`

**Interfaces:**
- Consumes: `realAffixData()` is Node-only test code, so the tool rebuilds the rows itself from the same modules.

- [ ] **Step 1: Write the tool**

Create `tools/checks/diff-affix-lines.mjs`:

```js
// Compares every affix row's engine lines with upstream's last Affixes.json (read from git history) and
// writes a Markdown report into the research vault, grouped by shape (numbers as N). A review aid, not a
// gate: each shape gets a verdict, "upstream bug" or "engine bug". node diff-affix-lines.mjs
import {execFileSync} from "node:child_process";
import {readFileSync, writeFileSync} from "node:fs";
import {parseTbl} from "../../src/tblFile.js";
import {STAT_TABLES, buildStatData} from "../../src/statData.js";
import {AFFIX_TABLES, describeAffixes, itemTypeNames, readAffixes} from "../../src/affixData.js";

const ROOT = new URL("../../", import.meta.url);
const STANDARD = new URL("public/data/standard/", ROOT);
// The research vault is git-excluded, so it exists only in the main checkout: use its absolute path.
const OUT = new URL("file:///home/emanresu/TheArchivistSoE/docs/research/stat-summing/notes/affix-lines-diff.md");
const git = (...args) => execFileSync("git", args, {cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20});

// The commit that deleted upstream's file (its parent still has it), or HEAD before the deletion.
const deletedIn = git("log", "-1", "--format=%H", "--diff-filter=D", "--", "public/data/Affixes.json").trim();
const source = deletedIn ? `${deletedIn.slice(0, 8)}^` : "HEAD";
const upstream = JSON.parse(git("show", `${source}:public/data/Affixes.json`));

const texts = Object.fromEntries([...new Set([...AFFIX_TABLES, ...STAT_TABLES])].map((name) =>
    [name, readFileSync(new URL(`data/global/excel/${name}.txt`, STANDARD), "utf8")]));
const dict = buildStatData({
    texts,
    patchStrings: parseTbl(new Uint8Array(readFileSync(new URL("data/local/LNG/ENG/patchstring.tbl", STANDARD)))),
    baseStrings: JSON.parse(readFileSync(new URL("src/baseStrings.json", ROOT), "utf8")),
});
const {rows} = describeAffixes(readAffixes(texts), dict, itemTypeNames(texts.ItemTypes));
if (rows.length !== upstream.length) throw new Error(`${rows.length} rows vs upstream's ${upstream.length}`);

const shape = (s) => s.replace(/\d+(\.\d+)?/g, "N");
const groups = new Map();
rows.forEach((row, i) => {
    const up = upstream[i];
    if (up.name !== row.name || up.level !== row.level) throw new Error(`row ${i}: ${row.key} "${row.name}" vs upstream "${up.name}"`);
    const mine = row.lines.join(" / ");
    const theirs = (up.displayProperties ?? []).map((p) => p.displayString).join(" / ");
    if (mine === theirs) return;
    const key = `${shape(mine)} || ${shape(theirs)}`;
    groups.set(key, [...(groups.get(key) ?? []), {key: row.key, name: row.name, mine, theirs}]);
});

const out = [`# Engine lines vs upstream's Affixes.json`, "", `Upstream: \`${source}:public/data/Affixes.json\`. `
    + `${[...groups.values()].flat().length} of ${rows.length} rows differ, in ${groups.size} shapes. Fill each Verdict.`, ""];
for (const [, list] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    out.push(`## ${list.length} × ${list[0].mine || "(no lines)"}`, "", `Upstream: ${list[0].theirs || "(none)"}`, "",
        `Rows: ${list.map((r) => r.key).join(", ")}`, "", "Verdict: ", "");
}
writeFileSync(OUT, out.join("\n"));
console.log(`wrote ${OUT.pathname}: ${groups.size} shapes`);
```

- [ ] **Step 2: Run it**

```bash
node tools/checks/diff-affix-lines.mjs
```

Expected: about 412 differing rows in about 60 shapes.

- [ ] **Step 3: Give every shape a verdict**

Read the report and fill each "Verdict:". The plan's prototype run found these shapes, all upstream bugs or upstream wording (the engine prints the game's own strings):

| Shape (engine ‖ upstream) | Verdict |
|---|---|
| `Adds N-[N-N] lightning damage` ‖ `Adds [N-null] to [N-N] Lightning Damage` | upstream bug (null) and wording |
| `+N poison damage over N seconds` ‖ `Adds N-N Poison Damage over N Seconds` | upstream wording; the in-game check prints the engine's |
| `Adds [N-N]-[N-N] fire/cold damage` ‖ `Adds [N-N] to [N-N] … Damage` | upstream wording |
| `All Resistances +N-N` ‖ `… +N-N%` | upstream wording (the string has no `%`) |
| `N-N% Better Chance of Getting Magic Items`, `Extra Gold`, `Deadly Strike`, `Bonus to Attack Rating`, `Slower Stamina Drain` | upstream wording/case |
| map rows: `Magic and Gold Find: +N-N%` ‖ `Magic Find … / Gold Find …` | upstream: the game folds `dgrp` 6 |
| map rows: `Monsters have +N-N% …` ‖ `Monsters have N-N% …` | upstream: descfunc 8 prints `+` |
| map rows: `… Attack Rating and Chance to Pierce`, `… Cast and Attack Speed`, `Players have … to All Resistances` | upstream: the game folds `dgrp` 4, 5, 3 |
| `Monster's Melee Attacks Deal Splash Damage` ‖ `Monster's N-N Melee …` | upstream bug (descval 0 prints no value) |
| `+N to Combat Skills (Paladin Only)` ‖ `Summoning` | upstream bug (duplicate key, file order) |
| Barbarian `Combat Skills` ↔ `Masteries` swapped | upstream bug: param 12 is Combat Skills (Expert's), 13 Masteries (Fanatic), as in vanilla's affix lists |
| `Level [N-N] Teleport ([N-N]/[N-N] Charges)` ‖ `Level -N Teleport (-N Charges)` | upstream bug (negative charges) |
| per-level: `+N-N … (Based on Character Level), N.N per level` ‖ `+(N.N Per Character Level) …` | upstream bug in units (attack rating counts in halves) and wording |
| `Repairs N durability in N seconds` ‖ `… Every N Seconds` | upstream wording; in-game prints the engine's |
| `+N cold damage` ‖ `Adds N-N Cold Damage` | upstream: min ≥ max prints the single string |

A shape not in this table needs its own look: compare against the game's string and the rules in `statEngine.js`. If the engine is wrong, add a failing test to `statEngine.test.js`, fix the engine, re-run `npx vitest run -u src/affixData.test.js` to update the golden snapshot, and commit the fix with its own message before going on.

- [ ] **Step 4: Commit the tool**

```bash
git add tools/checks/diff-affix-lines.mjs
git commit -m "diff-affix-lines: review aid comparing the engine's lines with upstream's last Affixes.json"
```

---

### Task 11: Documentation and the final gates

**Files:**
- Modify: `CLAUDE.md`, `docs/superpowers/specs/2026-10-09-item-builder-design.md`

- [ ] **Step 1: CLAUDE.md**

Update `CLAUDE.md`:
- **Layout**, add a bullet after the Item Builder's: "The stat engine: `src/tblFile.js` (`parseTbl`: `.tbl` string tables, duplicate keys by the game's hash probe), `src/statData.js` (`buildStatData`: the stat dictionary from `Properties`, `ItemStatCost`, `CharStats`, `Skills`, `Skilldesc.txt` and the strings; `HARDCODED_STRINGS`), `src/statEngine.js` (`expandMods`: mods → stat entries by Properties.txt's funcs; `describe`: entries → the game's lines, each with a Stat filter key and label; `checkEntries`: the loud checks), `src/affixData.js` (`readAffixes`, `describeAffixes`, the `Affixes.json` format, `viaFor`), `src/affixesLoad.js` and `src/useAffixes.js` (the Affixes tab's file). `src/statFixtures.js` is Node-only. Design: `docs/superpowers/specs/2026-10-11-stat-engine-affixes-design.md`."
- Replace the `item-builder-data` plugin bullet with: "The `affix-data` plugin in `vite.config.js` writes `public/data/standard/Affixes.json` and `ItemBuilder.json` (both gitignored) from the standard `data/global/excel/` tables, `data/local/LNG/ENG/patchstring.tbl`, `src/baseStrings.json` and `Weapons.json`/`Armors.json`. A data update copies the changed `.txt` tables and `patchstring.tbl` from the mod repo (`Lukaszpg/PD2-Sanctuary-of-Exile`, `standard-mode/data/…`) into the same paths, runs the dev server once, and commits `src/itemBuilderVersion.json` if the link version was bumped. If the build fails on a missing string, re-run `node tools/extract-base-strings.mjs <string.tbl> <expansionstring.tbl>` with the game's own tables (never commit those) and commit `src/baseStrings.json`. An upstream merge that brings back `public/data/Affixes.json` is resolved by keeping it deleted."
- **Affixes** section: replace its first lines with: "`public/data/standard/Affixes.json` (generated, `{version, stats, affixes}`): each row has the engine's `lines`, `statKeys` (`{key, via?}`) and `sort` (`{property, max}` or null for a row with no lines). The **Stat filter** (Filters bar, after Prefix/Suffix) matches `statKeys`; a row that reaches the stat only through a group line shows "via …" under its lines." Drop the bullets about `classDisplayName`, `displayExcludedItemTypeNames` repeats and `rare: ""` (no longer true: `rare` is a boolean; item types are exact `ItemTypes.txt` names with `TYPE_NAME_OVERRIDES`). Keep `maxLevel: null` means no cap.
- **Verifying UI changes**, feature checks list: add `check-affix-stats.mjs` (Affixes Stat filter) and `diff-affix-lines.mjs` (Node: the engine's lines vs upstream's last `Affixes.json`, a report into the research vault).
- **Data**: the golden-snapshot sentence gains: "The affix lines are pinned by `src/__snapshots__/affixLines.golden.txt` the same way."

- [ ] **Step 2: The Item Builder spec's follow-up pointer**

In `docs/superpowers/specs/2026-10-09-item-builder-design.md`, in the "Follow-up: stat summing" section, add: "The engine it needs is designed in `2026-10-11-stat-engine-affixes-design.md` (built first; the builder already shows its lines). Stat summing (the full item tooltip, base lines, cross-affix merges) is the next spec; its research is in the local vault `docs/research/stat-summing/`."

- [ ] **Step 3: Full gates**

```bash
npm run lint && npm test && npm run build 2>&1 | grep -E "affix-data|error|built in"
```

Expected: lint 0 problems; every test passes with no snapshot written or updated; the build prints the three expected `affix-data` warnings and `built in …`.

- [ ] **Step 4: Desktop pixel comparison**

Stop the dev server if it's running and start it again (a fresh start runs the plugins on the final code), then:

```bash
cd tools/checks
node compare-desktop.mjs after http://localhost:5190/TheArchivistSoE/
node diff-shots.mjs before after
cd ../..
```

Expected: every tab identical except `affixes` and `itembuilder`. Look at those two screenshots: the Affixes table shows the engine's lines and exact type names; the builder's rows show the engine's lines. Any other tab that differs is a regression to fix before going on.

- [ ] **Step 5: Every browser check once more**

```bash
cd tools/checks
for c in check-affix-stats check-itembuilder check-multisort check-sticky check-select-keyboard check-dropcalc check-tier-order; do
  mkdir -p /tmp/claude-1000/shots-$c
  echo "== $c"; APP_URL=http://localhost:5190/TheArchivistSoE/ node $c.mjs /tmp/claude-1000/shots-$c | tail -2
done
cd ../..
```

Then stop the dev server.

Expected: `all checks passed` for each (check-dropcalc may print WARN timing lines; they don't fail).

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-10-09-item-builder-design.md
git commit -m "CLAUDE.md: the stat engine, the affix-data plugin and its data-update duty, the Stat filter; Item Builder spec points to the engine spec"
```
