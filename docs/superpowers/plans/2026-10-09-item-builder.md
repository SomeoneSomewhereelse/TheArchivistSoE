# Item Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new "Item Builder" tab where a player picks a base item, a quality (magic, rare, crafted) and levels, then tries prefix and suffix combinations, with only the combinations the game can roll allowed, and the build kept in the URL.

**Architecture:** A Vite plugin joins the raw affix tables (`MagicPrefix.txt`, `MagicSuffix.txt`) with the base and item-type tables and `Affixes.json` into a generated `ItemBuilder.json`. Pure modules hold the game rules (`itemBuilderRules.js`) and the URL format (`itemBuilderHash.js`). `useHashTab` carries the builder's query string in the URL, and an `App`-level hook (`useItemBuilder`) loads the data, decodes and cleans the query, and feeds a props-only panel.

**Tech Stack:** React 19, Vite 7, plain JavaScript (JSX), plain CSS, Vitest, headless Chromium over CDP for browser checks (`tools/checks/`).

**Spec:** `docs/superpowers/specs/2026-10-09-item-builder-design.md` (read it before starting; this plan implements it and quotes its rules).

## Global Constraints

- Node is installed with nvm and not on the Bash tool's PATH: prefix every `npm`/`npx`/`node` command with `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" &&`.
- Runtime dependencies stay `react` and `react-dom` only. No new npm packages.
- Plain JavaScript (`.js`/`.jsx`), no TypeScript. Test files import `describe`/`it`/`expect` from `vitest` explicitly.
- `npm run lint` must report 0 problems. No `eslint-disable`. React Compiler rules are active: no synchronous `setState` in an effect, no reading refs during render. State adjustments happen during render, guarded by a comparison (the `if (tab !== prevTab)` pattern).
- Build runtime URLs with `import.meta.env.BASE_URL`, never a hard-coded `/`.
- `src/App.jsx` only gains the extended `useHashTab` call, the `useItemBuilder` call and the panel hookup. New logic goes in new modules under `src/`.
- In-app links use `<a href="#">` with `preventDefault`.
- The mobile breakpoint is `max-width: 980px`. Mobile rules are duplicated across the 980/720/480px blocks of `src/styles.css`; new Item Builder CSS goes in its own section at the end of the file, so it wins ties.
- Caps (spec "Caps"): magic 1/1/2, rare 3/3/6, rare jewel and rare Mythic Jewel 2/2/4, crafted 3/3/4 (prefixes/suffixes/total).
- Every level input is an integer 1–99, default 99.
- URL: `#/itembuilder?v=<linkVersion>&b=<base>&q=<m|r|c>&il=<ilvl>&cl=<clvl>&gl=<ingredient ilvl>&a=<key>-<key>…`; `v` always written, defaults left out.
- Old-link notice text, exactly: `This link was made for older game data and can't be opened.`
- Commits: small and frequent, on the feature branch; do not push.

## Review Focus

1. **Typing in a level input:** clearing the field or typing `0` or `100` must not reset the build or rewrite the URL mid-typing; leaving the field shows the last valid value. (Test: Task 9, browser check "level input".)
2. **Changing the base or quality with picks in place** (rare staff with 3 prefixes → Grand Charm, which is magic-only): picks that no longer fit are dropped, earliest kept, with a notice; nothing throws. (Tests: Task 4 `resolveBuild` "control change"; Task 9 browser check "base change".)
3. **Back after several picks** leaves the Item Builder for the previous tab, because picks replace the history entry, and returning shows the build. (Test: Task 9 browser check "history".)
4. **Long affix text on a phone** (skill affixes like "+1 to Fire Skills (Sorceress Only)") must not overflow 390px. (Test: Task 9 browser check "phone overflow", on an amulet build with skill affixes.)
5. **Ctrl+F on the Item Builder tab** focuses the builder's search box instead of doing nothing (App's handler calls `preventDefault` and focuses `searchInputRef`). (Test: Task 8 wires `searchRef`; Task 9 browser check "ctrl+f".)

---

### Task 1: Raw affix tables and the affix join

**Files:**
- Create: `public/data/standard/MagicPrefix.txt`, `public/data/standard/MagicSuffix.txt` (copied from the mod repo)
- Create: `src/itemBuilderData.js`
- Create: `src/itemBuilderFixtures.js`
- Test: `src/itemBuilderData.test.js`

**Interfaces:**
- Consumes: `parseTxt` from `src/dropCalcData.js` (not used yet in this task).
- Produces:
  - `ITEM_BUILDER_FILE = "ItemBuilder.json"`, `ITEM_BUILDER_VERSION = 1`
  - `ITEM_BUILDER_TABLES = ["MagicPrefix", "MagicSuffix", "Weapons", "Armor", "Misc", "ItemTypes"]`
  - `ITEM_BUILDER_JSON_FILES = ["Affixes.json", "Weapons.json", "Armors.json"]`
  - `AFFIX_TABLE_COLUMNS: string[]`, `TABLE_COLUMNS: {[table]: string[]}`
  - `parseTableRows(text) → Array<{[column]: string}>` (keeps blank rows)
  - `checkColumns(table, text)` throws on a missing table or column
  - `joinAffixes(texts, affixesJson) → Affix[]` where `Affix = {key, suffix, name, level, maxLevel, levelreq, rare, classSpecific, classLevelReq, group, frequency, itypes, etypes, mods, displayProperties}`; `classLevelReq` is `null | {class, level}`, `mods` is `Array<{code, param, min, max}>`
  - fixtures: `tableText(columns, rows) → string`, `affixTableText(rows) → string`

- [ ] **Step 1: Take the desktop baseline screenshots (before any code change)**

The regression gate in Task 9 diffs every tab against this set, so it must be taken on unchanged code.

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && (npx vite --port 5181 --strictPort > /tmp/ib-dev.log 2>&1 &) && sleep 6 && cd tools/checks && node compare-desktop.mjs before http://localhost:5181/TheArchivistSoE/ ; pkill -f "vite --port 5181"
```

Expected: 19 `shot before <tab>` lines; `tools/checks/shots/desktop-before/` holds 19 PNGs.

- [ ] **Step 2: Copy the raw affix tables from the mod repo and verify them**

```bash
cd /home/emanresu/TheArchivistSoE && for f in MagicPrefix MagicSuffix; do gh api "repos/Lukaszpg/PD2-Sanctuary-of-Exile/contents/standard-mode/data/global/excel/$f.txt" -H 'Accept: application/vnd.github.raw' > public/data/standard/$f.txt; done && git hash-object public/data/standard/MagicPrefix.txt public/data/standard/MagicSuffix.txt
```

Expected output (the blob SHAs the spec was written against):
```
69072c036466d7e42fc4b494906ba6da22a0ea31
6fcd8354987acf33ee63d02c1789a380f98c42b9
```
If they differ, the mod repo has moved on: stop and report, because row keys in later tests (`p351`, `p352`, `p481`, `s123`) may have shifted.

- [ ] **Step 3: Write the fixtures module**

`src/itemBuilderFixtures.js`:

```js
// Test helpers for the Item Builder. Node-only (node:fs for the real tables), so the app must never
// import this module.
import {readFileSync} from "node:fs";
import {AFFIX_TABLE_COLUMNS} from "./itemBuilderData.js";

const DATA = new URL("../public/data/", import.meta.url);

// A tab-separated table with a header line and one line per row object; missing cells are "".
export function tableText(columns, rows) {
    return [columns.join("\t"), ...rows.map((row) => columns.map((c) => row[c] ?? "").join("\t"))].join("\n") + "\n";
}

// An affix table: every row defaults to spawnable, frequency 1, group 1, level 1, rare, itype1 "weap".
export function affixTableText(rows) {
    return tableText(AFFIX_TABLE_COLUMNS, rows.map((row) => (row === null ? {} : {
        spawnable: "1", frequency: "1", group: "1", level: "1", rare: "1", itype1: "weap", ...row,
    })));
}

export function readText(path) {
    return readFileSync(new URL(path, DATA), "utf8");
}

export function readJson(path) {
    return JSON.parse(readText(path));
}
```

(`row === null` writes a fully blank line, to test that blank rows keep their index.)

- [ ] **Step 4: Write the failing tests**

`src/itemBuilderData.test.js`:

```js
import {describe, expect, it} from "vitest";
import {AFFIX_TABLE_COLUMNS, checkColumns, joinAffixes, parseTableRows} from "./itemBuilderData.js";
import {affixTableText, readJson, readText} from "./itemBuilderFixtures.js";

const shown = (name, level, group, suffix, extra = {}) => ({name, level, group, suffix, displayProperties: [], ...extra});

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

describe("checkColumns", () => {
    it("names the missing table and the missing columns", () => {
        expect(() => checkColumns("MagicPrefix", undefined)).toThrow("MagicPrefix.txt: missing");
        expect(() => checkColumns("MagicPrefix", "Name\tlevel\n")).toThrow(/MagicPrefix\.txt: missing required column\(s\) "spawnable"/);
        expect(() => checkColumns("MagicPrefix", AFFIX_TABLE_COLUMNS.join("\t") + "\n")).not.toThrow();
    });
});

describe("joinAffixes", () => {
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
    const json = [shown("Sharp", 3, 5, false, {displayProperties: [{displayString: "+10-20% Damage"}]}), shown("of Tele", 1, 9, true)];

    it("keys rows by their index in the raw table, counting skipped and blank rows", () => {
        expect(joinAffixes(texts, json).map((a) => a.key)).toEqual(["p3", "s0"]);
    });

    it("reads every field the builder uses", () => {
        const [sharp, tele] = joinAffixes(texts, json);
        expect(sharp).toEqual({
            key: "p3", suffix: false, name: "Sharp", level: 3, maxLevel: 20, levelreq: 2, rare: true,
            classSpecific: null, classLevelReq: null, group: 5, frequency: 1, itypes: ["weap", "amul"], etypes: ["orb"],
            mods: [{code: "dmg%", param: "", min: 10, max: 20}],
            displayProperties: [{displayString: "+10-20% Damage"}],
        });
        expect(tele.rare).toBe(false);
        expect(tele.maxLevel).toBeNull();
        expect(tele.classSpecific).toBe("sor");
        expect(tele.classLevelReq).toEqual({class: "sor", level: 18});
        expect(tele.mods[0].param).toBe("Teleport");
    });

    it("fails loudly when Affixes.json has a different row count", () => {
        expect(() => joinAffixes(texts, json.slice(0, 1))).toThrow(/Affixes\.json has 1 rows but .* have 2/);
    });

    it("fails loudly when a row's name, level, group or side differs", () => {
        expect(() => joinAffixes(texts, [shown("Sharp", 4, 5, false), json[1]])).toThrow(/Affixes\.json row 0/);
        expect(() => joinAffixes(texts, [json[0], shown("of Tele", 1, 9, false)])).toThrow(/Affixes\.json row 1/);
    });
});

describe("the real affix tables", () => {
    const texts = {MagicPrefix: readText("standard/MagicPrefix.txt"), MagicSuffix: readText("standard/MagicSuffix.txt")};
    const affixes = joinAffixes(texts, readJson("Affixes.json"));
    const byKey = new Map(affixes.map((a) => [a.key, a]));

    it("join Affixes.json row by row: 1,412 affixes, unique keys", () => {
        expect(affixes).toHaveLength(1412);
        expect(byKey.size).toBe(1412);
    });

    it("key the rows the spec names", () => {
        expect(byKey.get("p351")).toMatchObject({name: "Lapis", level: 12, etypes: []});
        expect(byKey.get("p352")).toMatchObject({name: "Lapis", level: 35, itypes: ["weap", "tors", "helm", "boot"], etypes: ["orb"]});
        expect(byKey.get("p481")).toMatchObject({name: "Expert's", classSpecific: "bar", itypes: ["phlm", "weap", "helm"], etypes: ["miss", "rod"]});
        expect(byKey.get("s123")).toMatchObject({name: "of Anima"});
        expect(byKey.get("s123").itypes).toContain("amu");
    });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && npx vitest run src/itemBuilderData.test.js`
Expected: FAIL, because `./itemBuilderData.js` does not exist.

- [ ] **Step 6: Write the implementation**

`src/itemBuilderData.js`:

```js
// The Item Builder's data: the affix tables (MagicPrefix/MagicSuffix.txt), the base items (Weapons,
// Armor, Misc.txt, with display names from Weapons/Armors.json) and the item-type tree (ItemTypes.txt),
// cut down to what the builder uses. Pure, so it runs in Vite, Vitest and the browser: the
// item-builder-data plugin (vite.config.js) writes ItemBuilder.json with buildItemBuilderJson, and the
// browser prepares it with prepareItemBuilder.

export const ITEM_BUILDER_FILE = "ItemBuilder.json";
export const ITEM_BUILDER_VERSION = 1;
export const ITEM_BUILDER_TABLES = ["MagicPrefix", "MagicSuffix", "Weapons", "Armor", "Misc", "ItemTypes"];
export const ITEM_BUILDER_JSON_FILES = ["Affixes.json", "Weapons.json", "Armors.json"];

const numbered = (prefix, n) => Array.from({length: n}, (_, i) => `${prefix}${i + 1}`);
const MOD_COLUMNS = [1, 2, 3].flatMap((i) => [`mod${i}code`, `mod${i}param`, `mod${i}min`, `mod${i}max`]);

export const AFFIX_TABLE_COLUMNS = ["Name", "spawnable", "rare", "level", "maxlevel", "levelreq", "classspecific",
    "class", "classlevelreq", "frequency", "group", ...MOD_COLUMNS, ...numbered("itype", 7), ...numbered("etype", 5)];
const BASE_COLUMNS = ["code", "type", "type2", "level", "levelreq", "spawnable"];

// Per table, the columns the builder reads. A missing one fails the build.
export const TABLE_COLUMNS = {
    MagicPrefix: AFFIX_TABLE_COLUMNS,
    MagicSuffix: AFFIX_TABLE_COLUMNS,
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

export function checkColumns(table, text) {
    if (typeof text !== "string") throw new Error(`${table}.txt: missing`);
    const have = new Set((lines(text)[0] ?? "").split("\t").map((h) => h.trim()));
    const missing = TABLE_COLUMNS[table].filter((c) => !have.has(c));
    if (missing.length) {
        throw new Error(`${table}.txt: missing required column(s) ${missing.map((c) => `"${c}"`).join(", ")}`);
    }
}

// The rows that can roll (spawnable, frequency > 0), each with its key: p/s plus its row index.
function rollableRows(text, suffix) {
    return parseTableRows(text)
        .map((row, index) => ({row, suffix, key: `${suffix ? "s" : "p"}${index}`}))
        .filter(({row}) => cell(row.spawnable) === "1" && int(row.frequency) > 0);
}

function toAffix({row, suffix, key}, shown) {
    const list = (prefix, n) => numbered(prefix, n).map((c) => cell(row[c])).filter(Boolean);
    const classLevel = int(row.classlevelreq);
    return {
        key,
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
        displayProperties: shown.displayProperties ?? [],
    };
}

// Affixes.json lists exactly the rollable raw rows, prefixes then suffixes, in file order. The join is by
// position, checked on name, level, group and side; any drift fails loudly.
export function joinAffixes(texts, affixesJson) {
    const raw = [...rollableRows(texts.MagicPrefix, false), ...rollableRows(texts.MagicSuffix, true)];
    if (!Array.isArray(affixesJson)) throw new Error("Affixes.json: not a list");
    if (raw.length !== affixesJson.length) {
        throw new Error(`Affixes.json has ${affixesJson.length} rows but MagicPrefix/MagicSuffix.txt have ${raw.length} rollable rows`);
    }

    return raw.map((r, i) => {
        const shown = affixesJson[i];
        const name = cell(r.row.Name);
        const level = int(r.row.level);
        const group = int(r.row.group);
        if (shown?.name !== name || shown?.level !== level || shown?.group !== group || Boolean(shown?.suffix) !== r.suffix) {
            throw new Error(`Affixes.json row ${i} ("${shown?.name}", level ${shown?.level}, group ${shown?.group}) doesn't match `
                + `${r.suffix ? "MagicSuffix" : "MagicPrefix"}.txt ${r.key} ("${name}", level ${level}, group ${group})`);
        }
        return toAffix(r, shown);
    });
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && npx vitest run src/itemBuilderData.test.js`
Expected: PASS (all tests).

- [ ] **Step 8: Lint and commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && npm run lint && git add public/data/standard/MagicPrefix.txt public/data/standard/MagicSuffix.txt src/itemBuilderData.js src/itemBuilderFixtures.js src/itemBuilderData.test.js && git commit -m "Item Builder: raw affix tables and the row-by-row join with Affixes.json"
```

---

### Task 2: Item types, bases, the JSON file and the link version logic

**Files:**
- Modify: `src/itemBuilderData.js` (append)
- Modify: `src/itemBuilderFixtures.js` (append)
- Test: `src/itemBuilderData.test.js` (append)

**Interfaces:**
- Consumes: Task 1's `parseTableRows`, `checkColumns`, `joinAffixes`; `parseTxt` from `src/dropCalcData.js`.
- Produces:
  - `buildTypes(text) → {[code]: {chain: string[], class: string|null, rare: boolean}}`
  - `GROUP_LABELS: Array<[typeCode, label]>`, `MISC_BASES: {[code]: name}`
  - `buildBases(texts, weaponsJson, armorsJson, types) → Base[]`, `Base = {code, name, group, tier, qlvl, magicLvl, levelreq, types}`
  - `buildItemBuilderJson({texts, affixesJson, weaponsJson, armorsJson}) → {json: {version, types, bases, affixes}, warnings: string[]}`
  - `prepareItemBuilder(json) → Model`, `Model = {version, linkVersion, types, bases, affixes, groups: Array<{label, bases}>, baseByCode: Map, affixByKey: Map}`
  - `linkFingerprint(json) → string` (8 hex chars)
  - `resolveLinkVersion({fingerprint, stored, command}) → {version, write}` or throws (command `"build"`)
  - fixtures: `readItemBuilderInputs()`, `realItemBuilderModel()`, `tinyModel()` (`linkVersion: 3`)

- [ ] **Step 1: Append the failing tests**

Add to the imports of `src/itemBuilderData.test.js`: `buildBases, buildItemBuilderJson, buildTypes, linkFingerprint, prepareItemBuilder, resolveLinkVersion` from `./itemBuilderData.js`, and `readItemBuilderInputs, tableText` from `./itemBuilderFixtures.js`. Then append:

```js
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
        const model = prepareItemBuilder({version: 1, linkVersion: 2, types: {}, affixes: [{key: "p0"}],
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
    const {json, warnings} = buildItemBuilderJson(readItemBuilderInputs());

    it("builds without errors and warns only about the affix that uses the item code amu as a type", () => {
        expect(warnings).toEqual([expect.stringContaining('affix type "amu" is not in ItemTypes.txt (s123)')]);
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

Append to `src/itemBuilderFixtures.js` (and add `ITEM_BUILDER_TABLES, ITEM_BUILDER_VERSION, buildItemBuilderJson, prepareItemBuilder` to its import from `./itemBuilderData.js`):

```js
// Everything the plugin reads, from the real files.
export function readItemBuilderInputs() {
    return {
        texts: Object.fromEntries(ITEM_BUILDER_TABLES.map((name) => [name, readText(`standard/${name}.txt`)])),
        affixesJson: readJson("Affixes.json"),
        weaponsJson: readJson("Weapons.json"),
        armorsJson: readJson("Armors.json"),
    };
}

export function realItemBuilderModel() {
    const {json} = buildItemBuilderJson(readItemBuilderInputs());
    return prepareItemBuilder({...json, linkVersion: 1});
}

const affix = (key, fields) => ({
    key, suffix: key.startsWith("s"), name: key, level: 1, maxLevel: null, levelreq: 1, rare: true,
    classSpecific: null, classLevelReq: null, group: 0, frequency: 1, itypes: ["weap"], etypes: [], mods: [],
    displayProperties: [{displayString: `${key} stat`, property: "x", min: 1, max: 1}], ...fields,
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
                displayProperties: [{displayString: "+5-10% Damage", property: "dmg%", min: 5, max: 10}]}),
            affix("p1", {name: "Sharper", group: 1, level: 40,
                displayProperties: [{displayString: "+15-20% Damage", property: "dmg%", min: 15, max: 20}]}),
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

- [ ] **Step 2: Run the tests to verify they fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && npx vitest run src/itemBuilderData.test.js`
Expected: FAIL, with `buildTypes` (and the other new exports) not exported.

- [ ] **Step 3: Append the implementation**

Add `import {parseTxt} from "./dropCalcData.js";` at the top of `src/itemBuilderData.js` (below the header comment), then append:

```js
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

function unknownTypeWarnings(affixes, types) {
    const unknown = new Map();
    for (const a of affixes) {
        for (const t of [...a.itypes, ...a.etypes]) {
            if (!types[t]) unknown.set(t, [...(unknown.get(t) ?? []), a.key]);
        }
    }
    return [...unknown].map(([t, keys]) => `affix type "${t}" is not in ItemTypes.txt (${keys.join(", ")}); the game ignores it`);
}

// inputs: {texts: {[table]: .txt content}, affixesJson, weaponsJson, armorsJson}. Throws on bad data;
// returns warnings for problems the game itself tolerates. The plugin adds linkVersion.
export function buildItemBuilderJson({texts, affixesJson, weaponsJson, armorsJson}) {
    for (const table of ITEM_BUILDER_TABLES) checkColumns(table, texts[table]);
    const types = buildTypes(texts.ItemTypes);
    const bases = buildBases(texts, weaponsJson, armorsJson, types);
    const affixes = joinAffixes(texts, affixesJson);
    return {json: {version: ITEM_BUILDER_VERSION, types, bases, affixes}, warnings: unknownTypeWarnings(affixes, types)};
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && npx vitest run src/itemBuilderData.test.js`
Expected: PASS. If "the real data" fails on a missing optgroup label, a spawnable base type is not in `GROUP_LABELS`: add it with a plural label, and say so in the commit message.

- [ ] **Step 5: Lint and commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && npm run lint && git add src/itemBuilderData.js src/itemBuilderFixtures.js src/itemBuilderData.test.js && git commit -m "Item Builder: item types, bases, ItemBuilder.json format and link-version logic"
```

---

### Task 3: The `item-builder-data` Vite plugin and the committed link version

**Files:**
- Modify: `vite.config.js`
- Create: `src/itemBuilderVersion.json` (written by the plugin on first dev start, then committed)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `ITEM_BUILDER_FILE`, `ITEM_BUILDER_TABLES`, `ITEM_BUILDER_JSON_FILES`, `buildItemBuilderJson`, `linkFingerprint`, `resolveLinkVersion` from `src/itemBuilderData.js`.
- Produces: `public/data/standard/ItemBuilder.json` = `{version: 1, linkVersion, types, bases, affixes}`; `src/itemBuilderVersion.json` = `{"version": N, "fingerprint": "<8 hex>"}`.

- [ ] **Step 1: Add the plugin to `vite.config.js`**

Add to the imports:

```js
import { ITEM_BUILDER_FILE, ITEM_BUILDER_JSON_FILES, ITEM_BUILDER_TABLES, buildItemBuilderJson, linkFingerprint, resolveLinkVersion } from './src/itemBuilderData.js'
```

Add after `dropCalcData()`'s definition:

```js
// Writes public/data/standard/ItemBuilder.json from the standard .txt tables plus Affixes/Weapons/
// Armors.json (src/itemBuilderData.js), with the link version from src/itemBuilderVersion.json. In dev
// a change in what links depend on bumps that version and rewrites the file (commit it); a build fails
// instead. Same timing as drop-calc-data; skipped under Vitest and vite preview. The JSON is gitignored.
function itemBuilderData() {
  let skip = false
  let dataDir = ''
  let versionFile = ''
  let command = 'serve'

  function generate(logger) {
    const texts = Object.fromEntries(ITEM_BUILDER_TABLES.map((name) => [name, readFileSync(path.join(dataDir, 'standard', `${name}.txt`), 'utf8')]))
    const [affixesJson, weaponsJson, armorsJson] = ITEM_BUILDER_JSON_FILES.map((f) => JSON.parse(readFileSync(path.join(dataDir, f), 'utf8')))
    const { json, warnings } = buildItemBuilderJson({ texts, affixesJson, weaponsJson, armorsJson })
    for (const w of warnings) logger.warn(`item-builder-data: ${w}`)

    const fingerprint = linkFingerprint(json)
    const stored = existsSync(versionFile) ? JSON.parse(readFileSync(versionFile, 'utf8')) : null
    const { version, write } = resolveLinkVersion({ fingerprint, stored, command })
    if (write) {
      writeFileSync(versionFile, JSON.stringify({ version, fingerprint }, null, 2) + '\n')
      logger.warn(`item-builder-data: link version set to ${version} (commit src/itemBuilderVersion.json)`)
    }

    const out = path.join(dataDir, 'standard', ITEM_BUILDER_FILE)
    const text = JSON.stringify({ ...json, linkVersion: version })
    if (!existsSync(out) || readFileSync(out, 'utf8') !== text) writeFileSync(out, text)
  }

  return {
    name: 'item-builder-data',
    config(_, env) {
      skip = env.mode === 'test' || !!env.isPreview
    },
    configResolved(config) {
      if (skip || !config.publicDir) return
      dataDir = path.join(config.publicDir, 'data')
      versionFile = path.join(config.root, 'src', 'itemBuilderVersion.json')
      command = config.command
      try {
        generate(config.logger)
      } catch (e) {
        // A build must not ship without the builder's data; the dev server keeps running.
        if (config.command === 'build') throw e
        config.logger.error(`item-builder-data: ${e.message}`)
      }
    },
    configureServer(server) {
      if (!dataDir) return
      const sources = new Set([
        ...ITEM_BUILDER_TABLES.map((name) => path.join(dataDir, 'standard', `${name}.txt`)),
        ...ITEM_BUILDER_JSON_FILES.map((f) => path.join(dataDir, f)),
      ])
      const onFile = (file) => {
        if (!sources.has(path.resolve(file))) return
        try {
          generate(server.config.logger)
          server.config.logger.info(`item-builder-data: regenerated standard/${ITEM_BUILDER_FILE}`)
        } catch (e) {
          server.config.logger.error(`item-builder-data: ${e.message}`)
        }
      }
      server.watcher.on('change', onFile)
      server.watcher.on('add', onFile)
    },
  }
}
```

Change the plugins line to `plugins: [react(), dropCalcData(), itemBuilderData()],`.

- [ ] **Step 2: Gitignore the generated file**

Append to `.gitignore`:

```
# Generated from public/data/standard/*.txt and public/data/*.json by the item-builder-data plugin (vite.config.js)
public/data/standard/ItemBuilder.json
```

- [ ] **Step 3: Start the dev server once to create the version file**

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && rm -f src/itemBuilderVersion.json && (npx vite --port 5182 --strictPort > /tmp/ib-dev.log 2>&1 &) && sleep 6 && pkill -f "vite --port 5182"; cat /tmp/ib-dev.log | grep item-builder-data; cat src/itemBuilderVersion.json; node -e 'const j=require("./public/data/standard/ItemBuilder.json"); console.log(j.version, j.linkVersion, j.bases.length, j.affixes.length)'
```

Expected:
- the log shows the `amu` warning and `link version set to 1 (commit src/itemBuilderVersion.json)`;
- `src/itemBuilderVersion.json` is `{"version": 1, "fingerprint": "<8 hex>"}`;
- the last line is `1 1 <more than 500> 1412`.

- [ ] **Step 4: Verify a build passes with the committed version, and fails without it**

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && npm run build 2>&1 | tail -3 && cp src/itemBuilderVersion.json /tmp/ib-version.json && echo '{"version": 1, "fingerprint": "00000000"}' > src/itemBuilderVersion.json && (npm run build 2>&1 | grep -o "link data changed.*") ; cp /tmp/ib-version.json src/itemBuilderVersion.json
```

Expected: the first build succeeds (`built in …`); the second prints `link data changed: run the dev server once and commit src/itemBuilderVersion.json (the link version bump)`; the file is restored.

- [ ] **Step 5: Lint and commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && npm run lint && npm test && git status --short && git add vite.config.js .gitignore src/itemBuilderVersion.json && git commit -m "Item Builder: item-builder-data Vite plugin and the committed link version"
```

Expected: `git status --short` does not list `public/data/standard/ItemBuilder.json` (gitignored).

---

### Task 4: The rules engine

**Files:**
- Create: `src/itemBuilderRules.js`
- Test: `src/itemBuilderRules.test.js`

**Interfaces:**
- Consumes: `Model` from Task 2 (`types`, `affixes`, `baseByCode`, `affixByKey`); fixtures `tinyModel()`, `realItemBuilderModel()`.
- Produces:
  - `QUALITIES = ["magic", "rare", "crafted"]`, `CAPS`, `CRAFT_TYPES`, `EMPTY_BUILD`
  - `Build = {base: string|null, quality: "magic"|"rare"|"crafted"|null, ilvl, clvl, gilvl: number, picks: string[]}`
  - `affixLevel({ilvl, qlvl, magicLvl}) → number`, `craftedItemLevel(clvl, ingredientIlvl) → number`
  - `baseChain(model, base) → Set<string>`, `baseClass(model, base) → string|null`, `itemKind(model, base) → "jewel"|"charm"|"jewelry"|"equipment"`
  - `allowedQualities(model, base) → string[]`, `capsFor(model, base, quality) → {prefix, suffix, total}`
  - `rollContext(model, build) → Ctx`, `Ctx = {base, chain, cls, kind, quality, ilvl, effectiveIlvl, alvl, caps}`
  - `canRoll(affix, ctx) → boolean`, `eligibleAffixes(model, ctx) → Affix[]`
  - `rowState(affix, picked: Affix[], caps) → {state: "picked"|"group"|"full"|"free", by?: Affix}`
  - `requiredLevel(base, picked) → number`, `countHint(ctx) → string`
  - `resolveBuild(model, raw) → {build: Build, dropped: number, fixed: number}`; `raw` is a partial build whose levels may be `undefined` (default), a valid integer, or anything else (counted in `fixed`)

- [ ] **Step 1: Write the failing tests**

`src/itemBuilderRules.test.js`:

```js
import {describe, expect, it} from "vitest";
import {
    affixLevel, allowedQualities, CAPS, canRoll, countHint, craftedItemLevel, EMPTY_BUILD, eligibleAffixes, itemKind,
    requiredLevel, resolveBuild, rollContext, rowState,
} from "./itemBuilderRules.js";
import {realItemBuilderModel, tinyModel} from "./itemBuilderFixtures.js";

const model = tinyModel();
const build = (fields) => ({...EMPTY_BUILD, quality: "rare", ...fields});
const ctxFor = (fields) => rollContext(model, build(fields));
const keys = (affixes) => affixes.map((a) => a.key);
const A = (key) => model.affixByKey.get(key);

describe("affixLevel", () => {
    it("raises ilvl to qlvl first", () => {
        expect(affixLevel({ilvl: 10, qlvl: 30, magicLvl: 0})).toBe(15);
    });

    it("adds magic lvl, capped at 99", () => {
        expect(affixLevel({ilvl: 85, qlvl: 67, magicLvl: 1})).toBe(86);
        expect(affixLevel({ilvl: 85, qlvl: 85, magicLvl: 18})).toBe(99);
    });

    it("switches formula at 99 - floor(qlvl / 2)", () => {
        expect(affixLevel({ilvl: 86, qlvl: 86, magicLvl: 0})).toBe(73);
        expect(affixLevel({ilvl: 55, qlvl: 30, magicLvl: 0})).toBe(40);
        expect(affixLevel({ilvl: 84, qlvl: 30, magicLvl: 0})).toBe(69);
        expect(affixLevel({ilvl: 99, qlvl: 1, magicLvl: 0})).toBe(99);
    });

    it("clamps to 1-99", () => {
        expect(affixLevel({ilvl: 0, qlvl: 0, magicLvl: 0})).toBe(1);
    });
});

describe("craftedItemLevel", () => {
    it("halves both levels, rounding down (Arreat Summit example: Berserker Axe, clvl 78, ingredient ilvl 85)", () => {
        expect(craftedItemLevel(78, 85)).toBe(81);
        expect(affixLevel({ilvl: craftedItemLevel(78, 85), qlvl: 86, magicLvl: 0})).toBe(73);
        expect(craftedItemLevel(99, 99)).toBe(98);
    });
});

describe("allowedQualities and item kinds", () => {
    it("allows rare by the type's Rare flag and crafted by category; jewels and charms are not craftable", () => {
        const q = (code) => allowedQualities(model, model.baseByCode.get(code));
        expect(q("axe")).toEqual(["magic", "rare", "crafted"]);
        expect(q("amu")).toEqual(["magic", "rare", "crafted"]);
        expect(q("ci3")).toEqual(["magic", "rare", "crafted"]);
        expect(q("jew")).toEqual(["magic", "rare"]);
        expect(q("cm3")).toEqual(["magic"]);
    });

    it("classifies jewels, charms, jewelry and equipment", () => {
        const kind = (code) => itemKind(model, model.baseByCode.get(code));
        expect([kind("jew"), kind("cm3"), kind("amu"), kind("axe")]).toEqual(["jewel", "charm", "jewelry", "equipment"]);
    });

    it("caps a rare jewel at 2 + 2 and crafted items at 4 in total", () => {
        expect(ctxFor({base: "jew"}).caps).toEqual(CAPS.rareJewel);
        expect(ctxFor({base: "axe", quality: "crafted"}).caps).toEqual({prefix: 3, suffix: 3, total: 4});
        expect(ctxFor({base: "axe", quality: "magic"}).caps).toEqual({prefix: 1, suffix: 1, total: 2});
    });
});

describe("canRoll / eligibleAffixes", () => {
    it("applies level, max level, types, exclusions, the rare flag and the class rule", () => {
        expect(keys(eligibleAffixes(model, ctxFor({base: "axe"})))).toEqual(["p0", "p1", "p3", "p4", "p6", "p7", "s0", "s1", "s2", "s3", "s4"]);
        expect(keys(eligibleAffixes(model, ctxFor({base: "orb"})))).toEqual(["p0", "p1", "p3", "p7", "s0", "s1", "s2", "s3", "s4"]);
    });

    it("lets magic items take magic-only rows", () => {
        expect(canRoll(A("p2"), ctxFor({base: "axe", quality: "magic"}))).toBe(true);
        expect(canRoll(A("p2"), ctxFor({base: "axe", quality: "rare"}))).toBe(false);
    });

    it("hides rows below their level and above their max level", () => {
        const low = ctxFor({base: "axe", quality: "magic", ilvl: 30}); // alvl 15
        expect(low.alvl).toBe(15);
        expect(canRoll(A("p5"), low)).toBe(true);
        expect(canRoll(A("p1"), low)).toBe(false);
        expect(canRoll(A("p5"), ctxFor({base: "axe", quality: "magic"}))).toBe(false);
    });

    it("uses the crafted item level for crafted items", () => {
        const ctx = ctxFor({base: "axe", quality: "crafted", clvl: 20, gilvl: 20}); // crafted ilvl 20 -> qlvl 30 -> alvl 15
        expect(ctx.ilvl).toBe(20);
        expect(ctx.effectiveIlvl).toBe(30);
        expect(ctx.alvl).toBe(15);
    });
});

describe("rowState", () => {
    const magic = ctxFor({base: "axe", quality: "magic"}).caps;

    it("marks picked rows, a taken group on either side, and full sides", () => {
        expect(rowState(A("p2"), [A("p2")], magic).state).toBe("picked");
        expect(rowState(A("s1"), [A("p2")], magic)).toEqual({state: "group", by: A("p2")});
        expect(rowState(A("p0"), [A("p2")], magic).state).toBe("full");
        expect(rowState(A("s0"), [A("p2")], magic).state).toBe("free");
    });

    it("puts group before full", () => {
        expect(rowState(A("p1"), [A("p0")], magic)).toEqual({state: "group", by: A("p0")});
    });

    it("closes both sides when a crafted item reaches 4 affixes", () => {
        const crafted = ctxFor({base: "axe", quality: "crafted"}).caps;
        const picked = [A("p0"), A("p3"), A("p4"), A("s0")];
        expect(rowState(A("s2"), picked, crafted).state).toBe("full");
        expect(rowState(A("s2"), picked.slice(0, 3), crafted).state).toBe("free");
    });
});

describe("requiredLevel and countHint", () => {
    it("takes the highest of the base's and the picks' level requirements", () => {
        expect(requiredLevel(model.baseByCode.get("axe"), [A("s0"), A("s4")])).toBe(40);
        expect(requiredLevel(model.baseByCode.get("axe"), [])).toBe(10);
    });

    it("describes how many affixes a real drop rolls", () => {
        expect(countHint(ctxFor({base: "axe", quality: "magic", ilvl: 70}))).toBe("A magic item at ilvl 70 always rolls 2 affixes");
        expect(countHint(ctxFor({base: "jew", quality: "magic", ilvl: 70}))).toBe("A magic item at ilvl 70 rolls 1–2 affixes (always 2 from ilvl 85)");
        expect(countHint(ctxFor({base: "axe", ilvl: 50}))).toBe("A rare at ilvl 50 rolls 4–6 affixes");
        expect(countHint(ctxFor({base: "axe", ilvl: 85}))).toBe("A rare at ilvl 85 always rolls 6 affixes");
        expect(countHint(ctxFor({base: "jew"}))).toBe("A rare jewel always rolls 4 affixes");
        expect(countHint(ctxFor({base: "axe", quality: "crafted"}))).toBe("A crafted item at ilvl 98 always rolls 4 random affixes");
        expect(countHint(ctxFor({base: "axe", quality: "crafted", clvl: 80, gilvl: 1}))).toBe("A crafted item at ilvl 40 rolls 2–4 random affixes");
    });
});

describe("resolveBuild", () => {
    it("keeps a valid build as it is", () => {
        const raw = {base: "axe", quality: "rare", ilvl: 85, clvl: 99, gilvl: 99, picks: ["p0", "s0"]};
        expect(resolveBuild(model, raw)).toEqual({build: raw, dropped: 0, fixed: 0});
    });

    it("defaults missing levels to 99 and resets invalid ones, counting them", () => {
        const {build, fixed} = resolveBuild(model, {base: "axe", quality: "magic", ilvl: 0, clvl: 100, gilvl: Number.NaN, picks: []});
        expect([build.ilvl, build.clvl, build.gilvl, fixed]).toEqual([99, 99, 99, 3]);
        expect(resolveBuild(model, {base: "axe", quality: "magic"}).fixed).toBe(0);
    });

    it("falls back to the first allowed quality", () => {
        expect(resolveBuild(model, {base: "cm3", quality: "rare"})).toMatchObject({build: {quality: "magic"}, fixed: 1});
        expect(resolveBuild(model, {base: "cm3"})).toMatchObject({build: {quality: "magic"}, fixed: 0});
    });

    it("drops every pick of an unknown base", () => {
        expect(resolveBuild(model, {base: "nope", quality: "rare", picks: ["p0", "s0"]}))
            .toEqual({build: {...EMPTY_BUILD}, dropped: 2, fixed: 1});
    });

    it("collapses repeated keys and keeps the earliest picks on a conflict", () => {
        expect(resolveBuild(model, {base: "axe", quality: "magic", picks: ["p0", "p0", "p7", "s1", "p9"]}))
            .toMatchObject({build: {picks: ["p0", "s1"]}, dropped: 2});
    });

    it("control change: switching a rare axe with 3 prefixes to magic keeps the first prefix", () => {
        const {build, dropped} = resolveBuild(model, {base: "axe", quality: "magic", picks: ["p0", "p3", "p4", "s0"]});
        expect(build.picks).toEqual(["p0", "s0"]);
        expect(dropped).toBe(2);
    });

    it("control change: switching to a base that can't take the picks drops them", () => {
        expect(resolveBuild(model, {base: "cm3", quality: "rare", picks: ["p0", "s0"]}))
            .toMatchObject({build: {base: "cm3", quality: "magic", picks: ["s0"]}, dropped: 1});
    });
});

describe("the rules on the real data", () => {
    const real = realItemBuilderModel();
    const ctx = (base) => rollContext(real, {...EMPTY_BUILD, base, quality: "rare"});
    const R = (key) => real.affixByKey.get(key);

    it("the level-35 Lapis rolls on a staff but not an orb; the level-12 Lapis rolls on an orb", () => {
        expect(canRoll(R("p352"), ctx("cst"))).toBe(true);
        expect(canRoll(R("p352"), ctx("ob1"))).toBe(false);
        expect(canRoll(R("p351"), ctx("ob1"))).toBe(true);
    });

    it("Expert's (Barbarian, itype weap) rolls on an axe and is blocked on an orb by the class rule alone", () => {
        const orb = ctx("ob1");
        expect(R("p481").itypes.some((t) => orb.chain.has(t))).toBe(true);
        expect(R("p481").etypes.some((t) => orb.chain.has(t))).toBe(false);
        expect(canRoll(R("p481"), orb)).toBe(false);
        expect(canRoll(R("p481"), ctx("hax"))).toBe(true);
    });

    it("every weapon and armor base can be magic, rare and crafted", () => {
        for (const base of real.bases.filter((b) => b.tier)) {
            expect(allowedQualities(real, base), base.code).toEqual(["magic", "rare", "crafted"]);
        }
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && npx vitest run src/itemBuilderRules.test.js`
Expected: FAIL, because `./itemBuilderRules.js` does not exist.

- [ ] **Step 3: Write the implementation**

`src/itemBuilderRules.js`:

```js
// The game's affix rules for the Item Builder (spec "Game rules"). Pure, unit-tested in
// itemBuilderRules.test.js. `model` is prepareItemBuilder's result (src/itemBuilderData.js).

export const QUALITIES = ["magic", "rare", "crafted"];

// Unsettled caps use the conservative default (spec "Caps"): rare jewels and Mythic Jewels 2 + 2.
export const CAPS = {
    magic: {prefix: 1, suffix: 1, total: 2},
    rare: {prefix: 3, suffix: 3, total: 6},
    rareJewel: {prefix: 2, suffix: 2, total: 4},
    crafted: {prefix: 3, suffix: 3, total: 4},
};

// A base can be crafted when its type chain reaches one of these (circlets through SoE's infusions).
export const CRAFT_TYPES = ["amul", "ring", "belt", "glov", "boot", "helm", "tors", "shld", "weap", "bowq", "xboq", "circ"];

export const EMPTY_BUILD = Object.freeze({base: null, quality: null, ilvl: 99, clvl: 99, gilvl: 99, picks: Object.freeze([])});

const MAGIC_TWO_AFFIX_ILVL = {equipment: 65, jewelry: 85, jewel: 85, charm: 90};

export function affixLevel({ilvl, qlvl, magicLvl}) {
    const level = Math.max(ilvl, qlvl);
    const half = Math.floor(qlvl / 2);
    let alvl;
    if (magicLvl > 0) alvl = level + magicLvl;
    else if (level < 99 - half) alvl = level - half;
    else alvl = 2 * level - 99;
    return Math.min(99, Math.max(1, alvl));
}

export function craftedItemLevel(clvl, ingredientIlvl) {
    return Math.floor(clvl / 2) + Math.floor(ingredientIlvl / 2);
}

export function baseChain(model, base) {
    const chain = new Set();
    for (const type of base.types) for (const t of model.types[type]?.chain ?? [type]) chain.add(t);
    return chain;
}

// The class of a class-specific base: its primary type's ItemTypes "Class", as the game reads it.
export function baseClass(model, base) {
    return model.types[base.types[0]]?.class ?? null;
}

export function itemKind(model, base) {
    const chain = baseChain(model, base);
    if (chain.has("jewl")) return "jewel";
    if (chain.has("char")) return "charm";
    if (chain.has("ring") || chain.has("amul")) return "jewelry";
    return "equipment";
}

export function allowedQualities(model, base) {
    const qualities = ["magic"];
    if (model.types[base.types[0]]?.rare) qualities.push("rare");
    const chain = baseChain(model, base);
    if (CRAFT_TYPES.some((t) => chain.has(t))) qualities.push("crafted");
    return qualities;
}

export function capsFor(model, base, quality) {
    return quality === "rare" && itemKind(model, base) === "jewel" ? CAPS.rareJewel : CAPS[quality];
}

// Everything the rules need about one base, quality and set of levels. build.base must exist.
export function rollContext(model, build) {
    const base = model.baseByCode.get(build.base);
    const ilvl = build.quality === "crafted" ? craftedItemLevel(build.clvl, build.gilvl) : build.ilvl;
    return {
        base,
        chain: baseChain(model, base),
        cls: baseClass(model, base),
        kind: itemKind(model, base),
        quality: build.quality,
        ilvl,
        effectiveIlvl: Math.max(ilvl, base.qlvl),
        alvl: affixLevel({ilvl, qlvl: base.qlvl, magicLvl: base.magicLvl}),
        caps: capsFor(model, base, build.quality),
    };
}

// Whether the row can roll at all on this item (spec "Which affixes can roll", rules 1-5).
export function canRoll(affix, ctx) {
    if (affix.level > ctx.alvl) return false;
    if (affix.maxLevel !== null && ctx.alvl > affix.maxLevel) return false;
    if (!affix.itypes.some((t) => ctx.chain.has(t))) return false;
    if (affix.etypes.some((t) => ctx.chain.has(t))) return false;
    if (ctx.quality !== "magic" && !affix.rare) return false;
    if (affix.classSpecific && ctx.cls && ctx.cls !== affix.classSpecific) return false;
    return true;
}

export function eligibleAffixes(model, ctx) {
    return model.affixes.filter((a) => canRoll(a, ctx));
}

// An eligible row's state next to the picks: a group taken on either side beats a full side.
export function rowState(affix, picked, caps) {
    if (picked.some((p) => p.key === affix.key)) return {state: "picked"};
    const holder = picked.find((p) => p.group === affix.group);
    if (holder) return {state: "group", by: holder};
    const side = picked.filter((p) => p.suffix === affix.suffix).length;
    if (side >= (affix.suffix ? caps.suffix : caps.prefix) || picked.length >= caps.total) return {state: "full"};
    return {state: "free"};
}

export function requiredLevel(base, picked) {
    return Math.max(base.levelreq, ...picked.map((a) => a.levelreq));
}

export function countHint(ctx) {
    const {quality, ilvl, kind} = ctx;
    if (quality === "magic") {
        const from = MAGIC_TWO_AFFIX_ILVL[kind];
        return ilvl >= from
            ? `A magic item at ilvl ${ilvl} always rolls 2 affixes`
            : `A magic item at ilvl ${ilvl} rolls 1–2 affixes (always 2 from ilvl ${from})`;
    }
    if (quality === "rare") {
        if (kind === "jewel") return "A rare jewel always rolls 4 affixes";
        if (ilvl >= 85) return `A rare at ilvl ${ilvl} always rolls 6 affixes`;
        return `A rare at ilvl ${ilvl} rolls ${ilvl >= 65 ? "5–6" : ilvl >= 45 ? "4–6" : "3–6"} affixes`;
    }
    if (ilvl > 70) return `A crafted item at ilvl ${ilvl} always rolls 4 random affixes`;
    return `A crafted item at ilvl ${ilvl} rolls ${ilvl > 50 ? "3–4" : ilvl > 30 ? "2–4" : "1–4"} random affixes`;
}

const LEVEL_KEYS = ["ilvl", "clvl", "gilvl"];
const validLevel = (v) => Number.isInteger(v) && v >= 1 && v <= 99;

// Turns any build-shaped input (a decoded link, or the current build plus one control change) into a
// valid build: levels default to 99, an unknown base empties the build, a disallowed quality falls back
// to the base's first allowed one, and picks are applied in order, each kept only if it can roll and is
// free next to the picks before it. `fixed` counts reset settings, `dropped` the removed picks.
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

    const picks = [...new Set(raw.picks ?? [])];
    const base = raw.base ? model.baseByCode.get(raw.base) ?? null : null;
    if (raw.base && !base) fixed++;
    if (!base) return {build: {...EMPTY_BUILD, ...levels, picks: []}, dropped: dropped + picks.length, fixed};

    const allowed = allowedQualities(model, base);
    let quality = raw.quality;
    if (!allowed.includes(quality)) {
        if (quality) fixed++;
        quality = allowed[0];
    }

    const build = {base: base.code, quality, ...levels, picks: []};
    const ctx = rollContext(model, build);
    const picked = [];
    for (const key of picks) {
        const affix = model.affixByKey.get(key);
        if (affix && canRoll(affix, ctx) && rowState(affix, picked, ctx.caps).state === "free") picked.push(affix);
        else dropped++;
    }
    build.picks = picked.map((a) => a.key);
    return {build, dropped, fixed};
}
```

Note for the "unknown base" test: `{...EMPTY_BUILD, ...levels, picks: []}` equals `{...EMPTY_BUILD}` when every level is 99, which `toEqual` compares structurally.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && npx vitest run src/itemBuilderRules.test.js`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && npm run lint && git add src/itemBuilderRules.js src/itemBuilderRules.test.js && git commit -m "Item Builder: rules engine (alvl, eligibility, caps, row state, build resolution)"
```

---

### Task 5: The URL format

**Files:**
- Create: `src/itemBuilderHash.js`
- Test: `src/itemBuilderHash.test.js`

**Interfaces:**
- Consumes: `EMPTY_BUILD`, `allowedQualities`, `resolveBuild` from Task 4; `tinyModel()` (`linkVersion: 3`).
- Produces:
  - `OLD_LINK_NOTICE` (the exact text from Global Constraints)
  - `parseBuildQuery(query) → {version: number|null, base, quality, ilvl, clvl, gilvl, picks}` (levels `undefined` when absent, `NaN` when malformed; quality `"invalid"` for an unknown letter)
  - `encodeBuildQuery(model, build) → string` (`""` for a build with no base)
  - `decodeBuildQuery(model, query) → {build: Build, notice: string|null}`
  - `linkNotice(dropped, fixed) → string|null`, `controlNotice(dropped) → string|null`

- [ ] **Step 1: Write the failing tests**

`src/itemBuilderHash.test.js`:

```js
import {describe, expect, it} from "vitest";
import {controlNotice, decodeBuildQuery, encodeBuildQuery, linkNotice, OLD_LINK_NOTICE, parseBuildQuery} from "./itemBuilderHash.js";
import {EMPTY_BUILD} from "./itemBuilderRules.js";
import {tinyModel} from "./itemBuilderFixtures.js";

const model = tinyModel(); // linkVersion 3
const build = (fields) => ({...EMPTY_BUILD, picks: [], ...fields});

describe("encodeBuildQuery", () => {
    it("writes v and the base always, and leaves defaults out", () => {
        expect(encodeBuildQuery(model, build({}))).toBe("");
        expect(encodeBuildQuery(model, build({base: "axe", quality: "magic"}))).toBe("v=3&b=axe");
        expect(encodeBuildQuery(model, build({base: "axe", quality: "rare", ilvl: 85, picks: ["p0", "s0"]})))
            .toBe("v=3&b=axe&q=r&il=85&a=p0-s0");
    });

    it("writes clvl and ingredient ilvl only for crafted items, and ilvl only otherwise", () => {
        expect(encodeBuildQuery(model, build({base: "axe", quality: "crafted", ilvl: 50, clvl: 80})))
            .toBe("v=3&b=axe&q=c&cl=80");
        expect(encodeBuildQuery(model, build({base: "axe", quality: "magic", ilvl: 50, clvl: 80})))
            .toBe("v=3&b=axe&il=50");
    });
});

describe("parseBuildQuery", () => {
    it("takes the first of repeated parameters and marks malformed values", () => {
        expect(parseBuildQuery("v=3&b=axe&b=orb&il=50&il=60&q=x&cl=abc&a=p0--s1")).toEqual({
            version: 3, base: "axe", quality: "invalid", ilvl: 50, clvl: Number.NaN, gilvl: undefined, picks: ["p0", "s1"],
        });
    });

    it("reads a missing or malformed version as null", () => {
        expect(parseBuildQuery("b=axe").version).toBeNull();
        expect(parseBuildQuery("v=x&b=axe").version).toBeNull();
    });
});

describe("decodeBuildQuery", () => {
    it("opens an empty query, or v alone, as a blank form without a notice", () => {
        expect(decodeBuildQuery(model, "")).toEqual({build: EMPTY_BUILD, notice: null});
        expect(decodeBuildQuery(model, "v=3")).toMatchObject({build: {base: null}, notice: null});
    });

    it("refuses an old or missing version as a whole", () => {
        expect(decodeBuildQuery(model, "v=2&b=axe&a=p0")).toEqual({build: EMPTY_BUILD, notice: OLD_LINK_NOTICE});
        expect(decodeBuildQuery(model, "b=axe")).toEqual({build: EMPTY_BUILD, notice: OLD_LINK_NOTICE});
    });

    it("round-trips every encoded build", () => {
        for (const b of [
            build({base: "axe", quality: "rare", ilvl: 85, picks: ["p0", "s0"]}),
            build({base: "axe", quality: "crafted", clvl: 70, gilvl: 40, picks: ["p0", "p3", "p4", "s0"]}),
            build({base: "jew", quality: "rare", picks: ["p0", "p7", "s0", "s2"]}),
            build({base: "cm3", quality: "magic", ilvl: 20, picks: ["s0"]}),
        ]) {
            expect(decodeBuildQuery(model, encodeBuildQuery(model, b))).toEqual({build: b, notice: null});
        }
    });

    it("collapses a repeated affix silently", () => {
        const {build: b, notice} = decodeBuildQuery(model, "v=3&b=axe&a=p0-p0");
        expect(b.picks).toEqual(["p0"]);
        expect(notice).toBeNull();
    });

    it("drops unknown or conflicting affixes, URL order first, with a notice", () => {
        expect(decodeBuildQuery(model, "v=3&b=axe&a=p0-p99")).toMatchObject({
            build: {picks: ["p0"]}, notice: "1 affix from the link no longer fits and was removed.",
        });
        expect(decodeBuildQuery(model, "v=3&b=axe&a=p7-p0-s1")).toMatchObject({
            build: {picks: ["p7", "s1"]}, notice: "1 affix from the link no longer fits and was removed.",
        });
    });

    it("resets invalid settings with a notice, and combines both notices", () => {
        expect(decodeBuildQuery(model, "v=3&b=cm3&q=r")).toMatchObject({
            build: {quality: "magic"}, notice: "Some settings in the link were invalid and were reset.",
        });
        expect(decodeBuildQuery(model, "v=3&b=nope&a=p0-s0").notice)
            .toBe("2 affixes from the link no longer fit and were removed. Some settings in the link were invalid and were reset.");
    });

    it("produces queries that decode to themselves (so App's cleanup converges)", () => {
        for (const q of ["v=3", "v=3&b=axe&a=p0-p0", "v=3&b=axe&il=99&q=m", "v=3&b=nope", "v=3&b=axe&a=p7-p0-s1", "v=3&b=cm3&q=r&il=0"]) {
            const clean = encodeBuildQuery(model, decodeBuildQuery(model, q).build);
            expect(decodeBuildQuery(model, clean).notice, q).toBeNull();
            expect(encodeBuildQuery(model, decodeBuildQuery(model, clean).build), q).toBe(clean);
        }
    });
});

describe("notices", () => {
    it("say nothing when nothing changed", () => {
        expect(linkNotice(0, 0)).toBeNull();
        expect(controlNotice(0)).toBeNull();
    });

    it("count removed affixes after a control change", () => {
        expect(controlNotice(1)).toBe("1 affix no longer fits and was removed.");
        expect(controlNotice(3)).toBe("3 affixes no longer fit and were removed.");
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && npx vitest run src/itemBuilderHash.test.js`
Expected: FAIL, because `./itemBuilderHash.js` does not exist.

- [ ] **Step 3: Write the implementation**

`src/itemBuilderHash.js`:

```js
// The Item Builder's build as a URL query (spec "URL format"): v (link version, always written),
// b (base), q (m/r/c, left out when it's the base's first allowed quality), il (ilvl, magic/rare),
// cl and gl (clvl and ingredient ilvl, crafted), a (affix keys in pick order, "-"-separated).
// Levels at 99 are left out. Pure, unit-tested in itemBuilderHash.test.js.
import {allowedQualities, EMPTY_BUILD, resolveBuild} from "./itemBuilderRules.js";

export const OLD_LINK_NOTICE = "This link was made for older game data and can't be opened.";

const QUALITY_CODE = {magic: "m", rare: "r", crafted: "c"};
const CODE_QUALITY = {m: "magic", r: "rare", c: "crafted"};

// undefined when absent, NaN when not a plain integer (resolveBuild counts it as a reset setting).
function level(value) {
    if (value === null) return undefined;
    return /^\d+$/.test(value) ? Number(value) : Number.NaN;
}

// URLSearchParams.get returns the first of repeated parameters, so the first one wins.
export function parseBuildQuery(query) {
    const params = new URLSearchParams(query);
    const v = params.get("v");
    return {
        version: v !== null && /^\d+$/.test(v) ? Number(v) : null,
        base: params.get("b") || null,
        quality: params.has("q") ? CODE_QUALITY[params.get("q")] ?? "invalid" : null,
        ilvl: level(params.get("il")),
        clvl: level(params.get("cl")),
        gilvl: level(params.get("gl")),
        picks: (params.get("a") ?? "").split("-").filter(Boolean),
    };
}

export function encodeBuildQuery(model, build) {
    if (!build.base) return "";
    const parts = [`v=${model.linkVersion}`, `b=${build.base}`];
    if (build.quality !== allowedQualities(model, model.baseByCode.get(build.base))[0]) {
        parts.push(`q=${QUALITY_CODE[build.quality]}`);
    }
    if (build.quality === "crafted") {
        if (build.clvl !== 99) parts.push(`cl=${build.clvl}`);
        if (build.gilvl !== 99) parts.push(`gl=${build.gilvl}`);
    } else if (build.ilvl !== 99) {
        parts.push(`il=${build.ilvl}`);
    }
    if (build.picks.length) parts.push(`a=${build.picks.join("-")}`);
    return parts.join("&");
}

const affixes = (n) => `${n} ${n === 1 ? "affix" : "affixes"}`;

export function linkNotice(dropped, fixed) {
    const parts = [];
    if (dropped) parts.push(`${affixes(dropped)} from the link no longer ${dropped === 1 ? "fits and was" : "fit and were"} removed.`);
    if (fixed) parts.push("Some settings in the link were invalid and were reset.");
    return parts.length ? parts.join(" ") : null;
}

export function controlNotice(dropped) {
    return dropped ? `${affixes(dropped)} no longer ${dropped === 1 ? "fits and was" : "fit and were"} removed.` : null;
}

// A query with no version, or another version, is refused as a whole: the builder opens blank.
export function decodeBuildQuery(model, query) {
    if (!query) return {build: EMPTY_BUILD, notice: null};
    const raw = parseBuildQuery(query);
    if (raw.version !== model.linkVersion) return {build: EMPTY_BUILD, notice: OLD_LINK_NOTICE};
    const {build, dropped, fixed} = resolveBuild(model, raw);
    return {build, notice: linkNotice(dropped, fixed)};
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && npx vitest run src/itemBuilderHash.test.js`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && npm run lint && git add src/itemBuilderHash.js src/itemBuilderHash.test.js && git commit -m "Item Builder: URL format (versioned links, decoding with cleanup and notices)"
```

---

### Task 6: `useHashTab` carries a query for listed tabs

**Files:**
- Modify: `src/hashTab.js` (whole file)
- Test: `src/hashTab.test.js` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `hashForTab(tab, query = "")`, `parseHash(hash, validKeys, queryTabs = []) → {tab, query}|null`
  - `parseTabFromHash(hash, validKeys, queryTabs = [])`, `targetHash(tab, query, queryTabs = [])`
  - `hashWriteAction(currentHash, tab, validKeys, query = "", queryTabs = []) → "push"|"replace"|null`
  - `useHashTab(validKeys, fallback, queryTabs = []) → [tab, setTab, query, setQuery]`

- [ ] **Step 1: Append the failing tests**

Change the import in `src/hashTab.test.js` to `import {hashForTab, hashWriteAction, parseHash, parseTabFromHash, targetHash} from "./hashTab.js";` and append:

```js
const QKEYS = ["weapons", "affixes", "itembuilder"];
const QTABS = ["itembuilder"];

describe("parseHash with query tabs", () => {
    it("accepts a query only after a listed tab", () => {
        expect(parseHash("#/itembuilder?v=1&b=axe", QKEYS, QTABS)).toEqual({tab: "itembuilder", query: "v=1&b=axe"});
        expect(parseHash("#/itembuilder", QKEYS, QTABS)).toEqual({tab: "itembuilder", query: ""});
        expect(parseHash("#/itembuilder?", QKEYS, QTABS)).toEqual({tab: "itembuilder", query: ""});
        expect(parseHash("#/affixes?x=1", QKEYS, QTABS)).toBeNull();
        expect(parseTabFromHash("#/itembuilder?v=1", QKEYS)).toBeNull();
    });
});

describe("targetHash and hashWriteAction with a query", () => {
    it("adds the query only for listed tabs", () => {
        expect(targetHash("itembuilder", "v=1", QTABS)).toBe("#/itembuilder?v=1");
        expect(targetHash("itembuilder", "", QTABS)).toBe("#/itembuilder");
        expect(targetHash("weapons", "v=1", QTABS)).toBe("#/weapons");
        expect(hashForTab("itembuilder", "v=1")).toBe("#/itembuilder?v=1");
    });

    it("replaces when only the query changes, pushes when the tab changes", () => {
        expect(hashWriteAction("#/itembuilder?v=1&b=axe", "itembuilder", QKEYS, "v=1&b=axe", QTABS)).toBeNull();
        expect(hashWriteAction("#/itembuilder?v=1&b=axe", "itembuilder", QKEYS, "v=1&b=orb", QTABS)).toBe("replace");
        expect(hashWriteAction("#/itembuilder", "itembuilder", QKEYS, "v=1", QTABS)).toBe("replace");
        expect(hashWriteAction("#/itembuilder?", "itembuilder", QKEYS, "", QTABS)).toBe("replace");
        expect(hashWriteAction("#/itembuilder?v=1", "weapons", QKEYS, "v=1", QTABS)).toBe("push");
        expect(hashWriteAction("#/weapons", "itembuilder", QKEYS, "v=1", QTABS)).toBe("push");
    });

    it("keeps today's behaviour for tabs without a query", () => {
        expect(hashWriteAction("#/weapons", "weapons", QKEYS, "v=1", QTABS)).toBeNull();
        expect(hashWriteAction("#/affixes?x=1", "affixes", QKEYS, "", QTABS)).toBe("replace");
    });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && npx vitest run src/hashTab.test.js`
Expected: FAIL (`parseHash` and `targetHash` are not exported).

- [ ] **Step 3: Replace `src/hashTab.js`**

```js
// Keeps the current tab in the URL hash (#/<tabKey>) so tabs can be linked and Back/Forward work. Tabs
// listed in `queryTabs` may also carry a query (#/<tabKey>?<query>), held in the hook's state: the Item
// Builder keeps its build there. The query belongs to the listed tab (one today) and survives visits
// to other tabs.
import {useEffect, useLayoutEffect, useState} from "react";

const NO_QUERY_TABS = [];

export function hashForTab(tab, query = "") {
    return query ? `#/${tab}?${query}` : `#/${tab}`;
}

// {tab, query} for "#/<key>" or "#/<key>?<query>", or null when the hash is empty, malformed, names no
// valid tab, or carries a query for a tab that doesn't take one. query is "" when absent.
export function parseHash(hash, validKeys, queryTabs = NO_QUERY_TABS) {
    const match = /^#\/([^/?#]+)(?:\?([^#]*))?$/.exec(hash ?? "");
    if (!match || !validKeys.includes(match[1])) return null;
    if (match[2] !== undefined && !queryTabs.includes(match[1])) return null;
    return {tab: match[1], query: match[2] ?? ""};
}

// The tab named by the hash, or null (see parseHash).
export function parseTabFromHash(hash, validKeys, queryTabs = NO_QUERY_TABS) {
    return parseHash(hash, validKeys, queryTabs)?.tab ?? null;
}

// The hash that names `tab`, with `query` when the tab takes one.
export function targetHash(tab, query, queryTabs = NO_QUERY_TABS) {
    return hashForTab(tab, queryTabs.includes(tab) ? query : "");
}

// How the hash must change to name `tab` (and its query): "push" a history entry when the tab changes,
// "replace" the current one when only the query changes or the hash is empty/unknown, or null when
// there is nothing to write. Picks in the Item Builder replace, so they don't flood Back.
export function hashWriteAction(currentHash, tab, validKeys, query = "", queryTabs = NO_QUERY_TABS) {
    if (!validKeys.includes(tab) || currentHash === targetHash(tab, query, queryTabs)) return null;
    const current = parseTabFromHash(currentHash, validKeys, queryTabs);
    return current && current !== tab ? "push" : "replace";
}

// Tab (and query) state synced with location.hash in both directions. The write keys off the state
// itself, so every path that changes the tab (clicks, jumps, links) updates the URL. It only writes
// when the hash differs, which keeps popstate and StrictMode's double effects from adding duplicate
// entries. It runs in a layout effect, in the same task as the commit, so a quick second Back can't
// land between the render and the write. `validKeys` and `queryTabs` must be stable arrays
// (module-level constants).
export function useHashTab(validKeys, fallback, queryTabs = NO_QUERY_TABS) {
    const [tab, setTab] = useState(() => parseTabFromHash(window.location.hash, validKeys, queryTabs) ?? fallback);
    const [query, setQuery] = useState(() => parseHash(window.location.hash, validKeys, queryTabs)?.query ?? "");

    useLayoutEffect(() => {
        const action = hashWriteAction(window.location.hash, tab, validKeys, query, queryTabs);
        const hash = targetHash(tab, query, queryTabs);
        if (action === "push") window.history.pushState(null, "", hash);
        else if (action === "replace") window.history.replaceState(null, "", hash);
    }, [tab, query, validKeys, queryTabs]);

    useEffect(() => {
        const onPopState = () => {
            const next = parseHash(window.location.hash, validKeys, queryTabs);
            if (next === null) window.history.replaceState(null, "", hashForTab(fallback));
            setTab(next?.tab ?? fallback);
            // Only a hash naming a query tab carries its query; Back onto another tab keeps the build.
            if (next && queryTabs.includes(next.tab)) setQuery(next.query);
        };
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, [validKeys, fallback, queryTabs]);

    return [tab, setTab, query, setQuery];
}
```

- [ ] **Step 4: Run all tests to verify they pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && npm test`
Expected: PASS, including the unchanged existing `hashTab` tests (`#/affixes?x=1` is still malformed without query tabs).

- [ ] **Step 5: Lint and commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && npm run lint && git add src/hashTab.js src/hashTab.test.js && git commit -m "useHashTab: listed tabs carry a query in the hash (replace on query change, kept across tabs)"
```

---

### Task 7: Loader and tab registration

**Files:**
- Create: `src/itemBuilderLoad.js`
- Test: `src/itemBuilderLoad.test.js`
- Modify: `src/tabList.js`, `src/tabList.test.js`, `src/tabs.jsx:130-141`, `tools/checks/cdp.mjs:11-22`

**Interfaces:**
- Consumes: `ITEM_BUILDER_FILE`, `ITEM_BUILDER_VERSION`, `prepareItemBuilder` (Task 2).
- Produces: `loadItemBuilder() → Promise<Model>`; `ITEM_BUILDER_TAB = "itembuilder"` and `QUERY_TABS = ["itembuilder"]` exported from `src/tabList.js`.

- [ ] **Step 1: Write the failing loader tests**

`src/itemBuilderLoad.test.js`:

```js
import {afterEach, describe, expect, it, vi} from "vitest";
import {ITEM_BUILDER_FILE, ITEM_BUILDER_VERSION} from "./itemBuilderData.js";

const JSON_OK = {version: ITEM_BUILDER_VERSION, linkVersion: 1, types: {}, bases: [], affixes: []};
const ok = (json) => ({ok: true, status: 200, json: async () => json});

// A fresh module per test, so the module-level cache starts empty.
async function freshLoader(fetchImpl) {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn(fetchImpl));
    return (await import("./itemBuilderLoad.js")).loadItemBuilder;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("loadItemBuilder", () => {
    it("fetches the standard file once, with no-store, and reuses the model", async () => {
        const load = await freshLoader(async () => ok(JSON_OK));
        const first = await load();
        expect(await load()).toBe(first);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch.mock.calls[0][0]).toMatch(/data\/standard\/ItemBuilder\.json$/);
        expect(fetch.mock.calls[0][1]).toEqual({cache: "no-store"});
        expect(first.linkVersion).toBe(1);
    });

    it("reports an HTTP error, then retries on the next call", async () => {
        let calls = 0;
        const load = await freshLoader(async () => (++calls === 1 ? {ok: false, status: 404} : ok(JSON_OK)));
        await expect(load()).rejects.toThrow(`${ITEM_BUILDER_FILE}: HTTP 404`);
        await expect(load()).resolves.toHaveProperty("groups", []);
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("reports a 200 response that isn't JSON", async () => {
        const load = await freshLoader(async () => ({ok: true, status: 200, json: async () => { throw new SyntaxError("<"); }}));
        await expect(load()).rejects.toThrow(`${ITEM_BUILDER_FILE}: not valid JSON (file missing or not generated?)`);
    });

    it("rejects an unknown file version", async () => {
        const load = await freshLoader(async () => ok({...JSON_OK, version: 99}));
        await expect(load()).rejects.toThrow(`${ITEM_BUILDER_FILE}: unsupported version 99`);
    });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && npx vitest run src/itemBuilderLoad.test.js`
Expected: FAIL, because `./itemBuilderLoad.js` does not exist.

- [ ] **Step 3: Write the loader**

`src/itemBuilderLoad.js`:

```js
// Loads the Item Builder's data: ItemBuilder.json (generated by the item-builder-data plugin in
// vite.config.js), fetched once per page load and prepared. The same file serves both modes.
import {ITEM_BUILDER_FILE, prepareItemBuilder} from "./itemBuilderData.js";

let cached = null;

async function fetchModel() {
    const res = await fetch(`${import.meta.env.BASE_URL}data/standard/${ITEM_BUILDER_FILE}`, {cache: "no-store"});
    if (!res.ok) throw new Error(`${ITEM_BUILDER_FILE}: HTTP ${res.status}`);
    // A dev server answers a missing file with index.html and status 200, so the parse can fail too.
    const json = await res.json().catch(() => {
        throw new Error(`${ITEM_BUILDER_FILE}: not valid JSON (file missing or not generated?)`);
    });
    return prepareItemBuilder(json);
}

// A failed load is evicted, so the next call tries again.
export function loadItemBuilder() {
    if (!cached) {
        const promise = fetchModel();
        cached = promise;
        promise.catch(() => {
            if (cached === promise) cached = null;
        });
    }
    return cached;
}
```

- [ ] **Step 4: Register the tab**

In `src/tabList.js`, add to `TABS` after `dropcalc`:

```js
    itembuilder: {
        title: "Item Builder",
        badge: "Beta"
    },
```

change the Tools group to `{title: "Tools", keys: ["calculators", "dropcalc", "itembuilder"]},`, and append:

```js
// The Item Builder's tab key; it keeps its build in the hash query (#/itembuilder?…).
export const ITEM_BUILDER_TAB = "itembuilder";

// Tabs whose hash may carry a query (useHashTab's third argument).
export const QUERY_TABS = [ITEM_BUILDER_TAB];
```

In `src/tabList.test.js`, change the import to include `QUERY_TABS`, change `toHaveLength(19)` to `toHaveLength(20)`, and add:

```js
    it("only lets valid tabs carry a hash query", () => {
        for (const key of QUERY_TABS) expect(VALID_TAB_KEYS).toContain(key);
    });
```

In `src/tabs.jsx`, add `"itembuilder",` to `moreKeys` right after `"dropcalc",`.

In `tools/checks/cdp.mjs`, add `"itembuilder"` to `TAB_KEYS` right after `"dropcalc"`, change the comment above it to `// The 19 sheet tabs plus Changelog, in tab-sheet order.`, and add `itembuilder: "Item Builder",` to `TAB_TITLES` after `dropcalc`.

- [ ] **Step 5: Run all tests**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && npm test`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && npm run lint && git add src/itemBuilderLoad.js src/itemBuilderLoad.test.js src/tabList.js src/tabList.test.js src/tabs.jsx tools/checks/cdp.mjs && git commit -m "Item Builder: data loader and tab registration (More menu, Tools sheet group)"
```

---

### Task 8: `useItemBuilder`, the panel, its CSS, and the App hookup

**Files:**
- Create: `src/useItemBuilder.js`
- Create: `src/ItemBuilderPanel.jsx`
- Modify: `src/App.jsx` (imports; the `useHashTab` call at about line 2623; the panel branch at about line 3360)
- Modify: `src/styles.css` (append a section at the end)

**Interfaces:**
- Consumes: `loadItemBuilder` (Task 7); `decodeBuildQuery`, `encodeBuildQuery`, `controlNotice` (Task 5); `resolveBuild`, `rollContext`, `eligibleAffixes`, `rowState`, `requiredLevel`, `countHint`, `allowedQualities` (Task 4); `useHashTab` (Task 6); `ITEM_BUILDER_TAB`, `QUERY_TABS` (Task 7); `compareAffixes` from `src/sortCompare.js`.
- Produces: `useItemBuilder({tab, query, setQuery}) → {status: "loading"|"error"|"ready", error, retry, model, build, notice, setBuild}`; `<ItemBuilderPanel {...that} searchRef={ref}/>`.

- [ ] **Step 1: Write the hook**

`src/useItemBuilder.js`:

```js
// The Item Builder's state, owned by App (spec "State ownership"). The build lives in the URL query
// (useHashTab); this hook loads the data the first time the tab opens, decodes the query during render,
// and replaces a dirty query with its cleaned form, also during render. That is legal because the query
// and the notice are both App's own state, and it converges because a clean query decodes to itself.
import {useEffect, useMemo, useState} from "react";
import {controlNotice, decodeBuildQuery, encodeBuildQuery} from "./itemBuilderHash.js";
import {loadItemBuilder} from "./itemBuilderLoad.js";
import {resolveBuild} from "./itemBuilderRules.js";
import {ITEM_BUILDER_TAB} from "./tabList.js";

export function useItemBuilder({tab, query, setQuery}) {
    const [model, setModel] = useState(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState(null);
    const active = tab === ITEM_BUILDER_TAB;

    // Starts the download the first time the tab is open; retry() clears the error to run it again.
    useEffect(() => {
        if (!active || model || error) return undefined;
        let live = true;
        loadItemBuilder().then(
            (m) => {
                if (live) setModel(m);
            },
            (e) => {
                if (live) setError(e instanceof Error ? e.message : String(e));
            },
        );
        return () => {
            live = false;
        };
    }, [active, model, error]);

    // A notice belongs to the visit that produced it.
    const [prevTab, setPrevTab] = useState(tab);
    if (tab !== prevTab) {
        setPrevTab(tab);
        if (notice) setNotice(null);
    }

    const decoded = useMemo(() => (model ? decodeBuildQuery(model, query) : null), [model, query]);
    if (decoded) {
        const clean = encodeBuildQuery(model, decoded.build);
        if (clean !== query) {
            setQuery(clean);
            setNotice(decoded.notice);
        }
    }

    const setBuild = (next) => {
        const {build, dropped} = resolveBuild(model, next);
        setQuery(encodeBuildQuery(model, build));
        setNotice(controlNotice(dropped));
    };

    return {
        status: model ? "ready" : error ? "error" : "loading",
        error,
        retry: () => setError(""),
        model,
        build: decoded?.build ?? null,
        notice,
        setBuild,
    };
}
```

- [ ] **Step 2: Write the panel**

`src/ItemBuilderPanel.jsx`:

```jsx
// The Item Builder tab: base, quality and level controls, the item card, and the affix list. The build
// comes from useItemBuilder (src/useItemBuilder.js) through props; this component only keeps UI state
// (list side, search text, copy-link state, whether the card is in view).
import React, {useEffect, useMemo, useRef, useState} from "react";
import {compareAffixes} from "./sortCompare.js";
import {allowedQualities, countHint, eligibleAffixes, requiredLevel, rollContext, rowState} from "./itemBuilderRules.js";

const QUALITY_LABELS = {magic: "Magic", rare: "Rare", crafted: "Crafted"};
const CLASS_NAMES = {ama: "Amazon", ass: "Assassin", bar: "Barbarian", dru: "Druid", nec: "Necromancer", pal: "Paladin", sor: "Sorceress"};

const statText = (affix) => affix.displayProperties.map((p) => p.displayString).join(", ");

function levelText(ctx, build) {
    const {base, ilvl, effectiveIlvl, alvl} = ctx;
    const crafted = build.quality === "crafted" ? `crafted ilvl ${ilvl} = ⌊${build.clvl}/2⌋ + ⌊${build.gilvl}/2⌋; ` : "";
    const raised = effectiveIlvl > ilvl ? ` (ilvl ${ilvl} raised to qlvl ${base.qlvl})` : "";
    if (base.magicLvl > 0) {
        const capped = effectiveIlvl + base.magicLvl > 99 ? ", capped at 99" : "";
        return `${crafted}alvl ${alvl} = ilvl ${effectiveIlvl} + magic lvl ${base.magicLvl}${capped}${raised}`;
    }
    return `${crafted}alvl ${alvl} from ilvl ${effectiveIlvl} and qlvl ${base.qlvl}${raised}`;
}

function classNotes(picked) {
    return picked.filter((a) => a.classLevelReq)
        .map((a) => ` (${CLASS_NAMES[a.classLevelReq.class] ?? a.classLevelReq.class}: ${a.classLevelReq.level})`)
        .join("");
}

// A 1-99 input that only commits valid values: clearing it or typing 0 never resets the build, and
// leaving the field shows the last committed value again.
function LevelInput({label, value, onCommit}) {
    const [text, setText] = useState(null);
    return (
        <label className="ibLevel">
            <span>{label}</span>
            <input
                type="text"
                inputMode="numeric"
                className="ibLevelInput"
                aria-label={label}
                value={text ?? String(value)}
                onChange={(e) => {
                    const next = e.target.value.replace(/\D/g, "").slice(0, 2);
                    setText(next);
                    const n = Number(next);
                    if (next && n >= 1 && n <= 99) onCommit(n);
                }}
                onBlur={() => setText(null)}
            />
        </label>
    );
}

function Slots({title, affixes, cap, totalReached, onRemove}) {
    const empty = Math.max(0, cap - affixes.length);
    const slotName = title === "Prefixes" ? "Prefix" : "Suffix";
    return (
        <div className="ibSlots">
            <div className="ibSlotsHead">{title} {affixes.length}/{cap}</div>
            {affixes.map((a) => (
                <div key={a.key} className="ibSlot filled">
                    <span><span className="ibAffixName">{a.name}</span> · {statText(a)}</span>
                    <button type="button" className="ibRemove" aria-label={`Remove ${a.name}`} onClick={() => onRemove(a)}>×</button>
                </div>
            ))}
            {Array.from({length: empty}, (_, i) => (
                <div key={`empty-${i}`} className="ibSlot">{totalReached ? "total reached" : `${slotName} slot`}</div>
            ))}
        </div>
    );
}

function AffixRow({affix, state, onToggle}) {
    const locked = state.state === "group" || state.state === "full";
    return (
        <button
            type="button"
            className={`ibRow ${state.state}`}
            data-key={affix.key}
            disabled={locked}
            aria-pressed={state.state === "picked"}
            onClick={() => onToggle(affix)}
        >
            <span className="ibRowMain">
                <span className="ibAffixName">{affix.name}</span>
                {affix.displayProperties.map((p, i) => <span key={i} className="ibStat">{p.displayString}</span>)}
            </span>
            <span className="ibRowMeta">
                Grp {affix.group} · alvl {affix.level} · rlvl {affix.levelreq}{state.state === "picked" ? " ✓" : ""}
            </span>
            {state.state === "group" && <span className="ibWhy">Group taken by {state.by.name}</span>}
            {state.state === "full" && <span className="ibWhy">Slots full</span>}
        </button>
    );
}

export default function ItemBuilderPanel({status, error, retry, model, build, notice, setBuild, searchRef}) {
    const [side, setSide] = useState("prefix");
    const [search, setSearch] = useState("");
    const [copyState, setCopyState] = useState("idle");
    const [cardVisible, setCardVisible] = useState(true);
    const cardRef = useRef(null);

    // The phone's pinned summary bar shows only while the card is out of view. 52px is the pinned tab
    // row's height on mobile (--topbar-h), so "in view" means below that row.
    useEffect(() => {
        const el = cardRef.current;
        if (!el || typeof IntersectionObserver === "undefined") return undefined;
        const observer = new IntersectionObserver(([entry]) => setCardVisible(entry.isIntersecting), {rootMargin: "-52px 0px 0px 0px"});
        observer.observe(el);
        return () => observer.disconnect();
    }, [status]);

    const ctx = useMemo(() => (model && build?.base ? rollContext(model, build) : null), [model, build]);
    const picked = useMemo(() => (ctx ? build.picks.map((k) => model.affixByKey.get(k)) : []), [ctx, model, build]);
    const eligible = useMemo(() => (ctx ? eligibleAffixes(model, ctx) : []), [model, ctx]);
    const rows = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return eligible
            .filter((a) => a.suffix === (side === "suffix"))
            .filter((a) => !needle || a.name.toLowerCase().includes(needle) || statText(a).toLowerCase().includes(needle))
            .sort((a, b) => compareAffixes(a, b, "attrs", "desc"));
    }, [eligible, side, search]);

    if (status === "loading") return <div className="infoPanel ibStatus">Loading item data…</div>;
    if (status === "error") {
        return (
            <div className="infoPanel ibStatus">
                Couldn't load the item data ({error}). <button type="button" className="btn" onClick={retry}>Retry</button>
            </div>
        );
    }

    const base = ctx?.base ?? null;
    const caps = ctx?.caps ?? null;
    const qualities = base ? allowedQualities(model, base) : [];
    const crafted = build.quality === "crafted";
    const count = (suffix) => picked.filter((a) => a.suffix === suffix).length;
    const req = base ? requiredLevel(base, picked) : 0;

    const update = (patch) => {
        setCopyState("idle");
        setBuild({...build, ...patch});
    };
    const toggle = (affix) => update({
        picks: build.picks.includes(affix.key) ? build.picks.filter((k) => k !== affix.key) : [...build.picks, affix.key],
    });
    async function copyLink() {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setCopyState("copied");
        } catch {
            setCopyState("manual");
        }
    }

    return (
        <div className="ibRoot">
            <div className="filtersPanel ibControls">
                <select className="ibBase" aria-label="Base item" value={build.base ?? ""} onChange={(e) => update({base: e.target.value || null})}>
                    <option value="">Choose a base item…</option>
                    {model.groups.map((g) => (
                        <optgroup key={g.label} label={g.label}>
                            {g.bases.map((b) => <option key={b.code} value={b.code}>{b.name} · qlvl {b.qlvl}</option>)}
                        </optgroup>
                    ))}
                </select>
                {qualities.length > 1 && (
                    <div className="ibQuality" role="group" aria-label="Quality">
                        {qualities.map((q) => (
                            <button key={q} type="button" className={`btn ibQualityBtn${q === build.quality ? " active" : ""}`}
                                    aria-pressed={q === build.quality} onClick={() => update({quality: q})}>
                                {QUALITY_LABELS[q]}
                            </button>
                        ))}
                    </div>
                )}
                {base && !crafted && <LevelInput label="ilvl" value={build.ilvl} onCommit={(v) => update({ilvl: v})}/>}
                {base && crafted && (
                    <>
                        <LevelInput label="clvl" value={build.clvl} onCommit={(v) => update({clvl: v})}/>
                        <LevelInput label="ingredient ilvl" value={build.gilvl} onCommit={(v) => update({gilvl: v})}/>
                    </>
                )}
            </div>

            {notice && <div className="ibNotice" role="status">{notice}</div>}

            <section className={`ibCard${build.quality ? ` ib-${build.quality}` : ""}`} ref={cardRef}>
                {!base ? (
                    <p className="ibEmpty">Choose a base item to start.</p>
                ) : (
                    <>
                        <h2 className="ibTitle">{QUALITY_LABELS[build.quality]} {base.name}</h2>
                        <p className="ibSub">{levelText(ctx, build)}</p>
                        {ctx.cls && <p className="ibSub">{CLASS_NAMES[ctx.cls] ?? ctx.cls} only</p>}
                        <p className="ibSub">{countHint(ctx)}</p>
                        <Slots title="Prefixes" affixes={picked.filter((a) => !a.suffix)} cap={caps.prefix}
                               totalReached={picked.length >= caps.total} onRemove={toggle}/>
                        <Slots title="Suffixes" affixes={picked.filter((a) => a.suffix)} cap={caps.suffix}
                               totalReached={picked.length >= caps.total} onRemove={toggle}/>
                        {crafted && <p className="ibSub">{picked.length}/{caps.total} random affixes, plus the recipe's fixed mods</p>}
                        <p className="ibReq">Required level {req}{classNotes(picked)}</p>
                        <div className="ibActions">
                            <button type="button" className="btn" onClick={copyLink}>{copyState === "copied" ? "Copied" : "Copy link"}</button>
                            <button type="button" className="btn" disabled={!picked.length} onClick={() => update({picks: []})}>Clear</button>
                        </div>
                        {copyState === "manual" && (
                            <input className="ibLinkField" readOnly autoFocus aria-label="Link to this build"
                                   value={window.location.href} onFocus={(e) => e.target.select()}/>
                        )}
                    </>
                )}
            </section>

            {base && (
                <div className={`ibPinBar${cardVisible ? "" : " show"}`} aria-hidden={cardVisible}>
                    <span>P {count(false)}/{caps.prefix} · S {count(true)}/{caps.suffix} · Req. lvl {req}</span>
                    <a href="#" onClick={(e) => {
                        e.preventDefault();
                        cardRef.current?.scrollIntoView({block: "start"});
                    }}>↑ card</a>
                </div>
            )}

            <section className="ibList">
                <div className="ibSideTabs" role="tablist" aria-label="Affix side">
                    {["prefix", "suffix"].map((s) => (
                        <button key={s} type="button" role="tab" aria-selected={side === s}
                                className={`ibSideTab${side === s ? " active" : ""}`} onClick={() => setSide(s)}>
                            {s === "prefix" ? "Prefixes" : "Suffixes"}
                            {caps ? ` ${count(s === "suffix")}/${s === "prefix" ? caps.prefix : caps.suffix}` : ""}
                        </button>
                    ))}
                </div>
                <input type="text" className="ibSearch" ref={searchRef} placeholder="Search names and stats…"
                       aria-label="Search affixes" value={search} onChange={(e) => setSearch(e.target.value)}/>
                <div className="ibRows">
                    {!base ? (
                        <p className="ibEmpty">Choose a base item to see its affixes.</p>
                    ) : rows.length === 0 ? (
                        <p className="ibEmpty">
                            {search.trim() ? "No affixes match the search." : `No ${side === "prefix" ? "prefixes" : "suffixes"} can roll at alvl ${ctx.alvl}.`}
                        </p>
                    ) : (
                        rows.map((a) => <AffixRow key={a.key} affix={a} state={rowState(a, picked, caps)} onToggle={toggle}/>)
                    )}
                </div>
            </section>
        </div>
    );
}
```

- [ ] **Step 3: Hook it into `App.jsx`**

Add to the imports at the top of `src/App.jsx`:

```js
import ItemBuilderPanel from "./ItemBuilderPanel.jsx";
import {useItemBuilder} from "./useItemBuilder.js";
```

and change line 8, `import {VALID_TAB_KEYS} from "./tabList.js";`, to `import {QUERY_TABS, VALID_TAB_KEYS} from "./tabList.js";`.

Replace the line `const [tab, setTab] = useHashTab(VALID_TAB_KEYS, "weapons");` with:

```js
    const [tab, setTab, builderQuery, setBuilderQuery] = useHashTab(VALID_TAB_KEYS, "weapons", QUERY_TABS);
    const itemBuilder = useItemBuilder({tab, query: builderQuery, setQuery: setBuilderQuery});
```

In the panel switch inside `<ErrorBoundary resetKey={tab}>`, change `) : tab === "dropcalc" ? (` so the builder comes first:

```jsx
            ) : tab === "itembuilder" ? (
                <ItemBuilderPanel {...itemBuilder} searchRef={searchInputRef}/>
            ) : tab === "dropcalc" ? (
```

(`searchInputRef` is App's ref for the list tabs' search box; the Item Builder's search takes it while its tab is open, so App's Ctrl+F and Escape handlers work there.)

- [ ] **Step 4: Append the CSS**

Append to the end of `src/styles.css`:

```css
/* -------------------------------------------------------------------------- */
/* Item Builder (src/ItemBuilderPanel.jsx)                                     */
/* -------------------------------------------------------------------------- */

.ibRoot {
    --ib-rare: #f4e36b;
    --ib-crafted: #f0a050;
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
    gap: 18px;
    align-items: start;
}

.ibControls,
.ibNotice,
.ibStatus {
    grid-column: 1 / -1;
}

.ibControls {
    justify-content: flex-start;
}

/* select.ibBase ties `.filtersPanel select` on specificity and wins by coming later. */
.ibControls select.ibBase {
    flex: 1 1 320px;
    max-width: 460px;
}

.ibQuality {
    display: flex;
    gap: 6px;
}

.ibQualityBtn {
    padding: 8px 14px;
    border-radius: 8px;
    opacity: 0.7;
}

.ibQualityBtn.active {
    opacity: 1;
    border-color: rgba(202, 161, 74, 0.9);
}

.ibLevel {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    white-space: nowrap;
}

/* input.ibLevelInput ties `.filtersPanel input[type="text"]` (also in the mobile blocks) and wins by coming later. */
.ibControls input.ibLevelInput {
    flex: 0 0 64px;
    width: 64px;
    text-align: center;
}

.ibNotice {
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid rgba(202, 161, 74, 0.55);
    background: rgba(202, 161, 74, 0.12);
    color: var(--c-white);
}

.ibCard,
.ibList {
    min-width: 0;
    padding: 12px 14px;
    border-radius: 12px;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.35));
    border: 1px solid rgba(255, 255, 255, 0.09);
}

.ibCard {
    grid-column: 1;
}

.ibList {
    grid-column: 2;
}

.ibTitle {
    margin: 0 0 6px;
    font-size: 20px;
}

.ib-magic .ibTitle {
    color: var(--c-blue);
}

.ib-rare .ibTitle {
    color: var(--ib-rare);
}

.ib-crafted .ibTitle {
    color: var(--ib-crafted);
}

.ibSub,
.ibReq,
.ibEmpty {
    margin: 4px 0;
    color: var(--muted);
    font-size: 14px;
}

.ibReq {
    color: var(--text);
}

.ibSlots {
    margin-top: 10px;
}

.ibSlotsHead {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--c-orange);
    margin-bottom: 4px;
}

.ibSlot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    margin: 3px 0;
    padding: 5px 8px;
    border: 1px dashed rgba(255, 255, 255, 0.18);
    border-radius: 8px;
    color: var(--muted);
    font-size: 14px;
    overflow-wrap: anywhere;
}

.ibSlot.filled {
    border-style: solid;
    border-color: rgba(202, 161, 74, 0.6);
    color: var(--text);
}

.ibRemove {
    flex: 0 0 auto;
    background: none;
    border: 0;
    color: var(--c-white);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    padding: 2px 6px;
}

.ibActions {
    display: flex;
    gap: 8px;
    margin-top: 10px;
}

.ibActions .btn {
    padding: 8px 14px;
    border-radius: 8px;
}

.ibActions .btn:disabled {
    opacity: 0.5;
    cursor: default;
}

.ibLinkField {
    width: 100%;
    margin-top: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.4);
    color: var(--text);
    border: 1px solid rgba(255, 255, 255, 0.14);
}

.ibPinBar {
    display: none;
}

.ibSideTabs {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
}

.ibSideTab {
    flex: 1;
    padding: 8px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(0, 0, 0, 0.35);
    color: var(--text);
    font: inherit;
    cursor: pointer;
}

.ibSideTab.active {
    background: linear-gradient(180deg, rgba(202, 161, 74, 0.3), rgba(107, 75, 22, 0.25));
    border-color: rgba(202, 161, 74, 0.55);
    color: var(--c-white);
}

.ibSearch {
    width: 100%;
    margin-bottom: 8px;
    padding: 10px 12px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.4);
    color: var(--text);
    border: 1px solid rgba(255, 255, 255, 0.14);
    outline: none;
}

.ibRows {
    max-height: calc(100vh - 220px);
    overflow-y: auto;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.ibRow {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2px 10px;
    width: 100%;
    padding: 8px 10px;
    text-align: left;
    background: transparent;
    border: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    color: var(--text);
    font: inherit;
    font-size: 14px;
    cursor: pointer;
}

.ibRow:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.05);
}

.ibRow.picked {
    background: rgba(202, 161, 74, 0.18);
}

.ibRow:disabled {
    opacity: 0.55;
    cursor: default;
}

.ibRowMain {
    min-width: 0;
    overflow-wrap: anywhere;
}

.ibAffixName {
    color: var(--c-blue);
    font-weight: 700;
    margin-right: 6px;
}

.ibStat {
    display: block;
}

.ibRowMeta {
    color: var(--muted);
    font-size: 12px;
    text-align: right;
    white-space: nowrap;
}

.ibWhy {
    grid-column: 1 / -1;
    font-size: 12px;
    color: var(--c-orange);
}

@media (max-width: 980px) {
    /* A flex column, not a grid: a sticky child is confined to its grid area, but to the whole flex container. */
    .ibRoot {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .ibControls select.ibBase {
        flex: 1 1 100%;
        max-width: none;
    }

    .ibCard {
        scroll-margin-top: calc(var(--topbar-h, 0px) + 4px);
    }

    .ibRows {
        max-height: none;
        overflow: visible;
    }

    .ibRowMeta {
        grid-column: 1 / -1;
        text-align: left;
        white-space: normal;
    }

    .ibPinBar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        position: sticky;
        top: var(--topbar-h, 0px);
        z-index: 25;
        padding: 6px 10px;
        border-radius: 8px;
        border: 1px solid rgba(202, 161, 74, 0.55);
        background: #0f0d0a;
        color: var(--c-white);
        font-size: 13px;
        visibility: hidden;
    }

    .ibPinBar.show {
        visibility: visible;
    }

    .ibPinBar a {
        color: var(--c-orange);
        white-space: nowrap;
    }
}
```

- [ ] **Step 5: Lint, test, build**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && npm run lint && npm test && npm run build`
Expected: lint 0 problems, tests pass, build succeeds. If lint flags the render-time `setQuery`/`setNotice` in `useItemBuilder`, do not add `eslint-disable`: guard it with a `prevQuery` state (`if (decoded && query !== prevQuery) { setPrevQuery(query); … }`, the same pattern as `prevTab`) and re-run.

- [ ] **Step 6: Smoke-check in a browser**

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && (npx vite --port 5181 --strictPort > /tmp/ib-dev.log 2>&1 &) && sleep 6 && cd tools/checks && node -e '
import("./cdp.mjs").then(({run, BASE, sleep}) => run(async (page) => {
  await page.desktop();
  await page.goto(BASE + "#/itembuilder");
  await page.waitFor(`!!document.querySelector(".ibBase")`);
  await page.eval(`(() => { const s = document.querySelector(".ibBase"); s.value = "cst"; s.dispatchEvent(new Event("change", {bubbles: true})); })()`);
  await sleep(300);
  await page.click(".ibQualityBtn", {text: "Rare"});
  await page.click(".ibRow[data-key=\"p352\"]");
  console.log(await page.eval(`JSON.stringify({hash: location.hash, slots: document.querySelectorAll(".ibSlot.filled").length, cobalt: document.querySelector(".ibRow[data-key=\"p354\"]")?.className, why: document.querySelector(".ibRow[data-key=\"p354\"] .ibWhy")?.textContent})`));
  await page.screenshot("/tmp/ib-desktop.png");
}))'; pkill -f "vite --port 5181"
```

Expected: `{"hash":"#/itembuilder?v=1&b=cst&q=r&a=p352","slots":1,"cobalt":"ibRow group","why":"Group taken by Lapis"}`. Look at `/tmp/ib-desktop.png`: card on the left, list on the right.

- [ ] **Step 7: Commit**

```bash
cd /home/emanresu/TheArchivistSoE && git add src/useItemBuilder.js src/ItemBuilderPanel.jsx src/App.jsx src/styles.css && git commit -m "Item Builder: the tab (useItemBuilder hook, panel, styles, App hookup)"
```

---

### Task 9: Browser check, regression gate and docs

**Files:**
- Create: `tools/checks/check-itembuilder.mjs`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the running app; `run`, `checker`, `BASE`, `sleep`, `clickDesktopTab`, `openTab`, `OVERFLOW_CHECK` from `tools/checks/cdp.mjs`.
- Produces: a check script that prints PASS/FAIL lines and exits non-zero on any FAIL.

- [ ] **Step 1: Write the browser check**

`tools/checks/check-itembuilder.mjs`:

```js
// The Item Builder tab end to end: picking, group locks, caps, crafted levels, links, history, level
// input, Ctrl+F, and the phone layout (pinned bar, no horizontal overflow).
// node check-itembuilder.mjs   (APP_URL = a dev server)
import {run, checker, BASE, sleep, clickDesktopTab, openTab, OVERFLOW_CHECK} from "./cdp.mjs";

const c = checker();
const state = (page) => page.eval(`({
    hash: location.hash,
    title: document.querySelector(".ibTitle")?.textContent ?? null,
    filled: [...document.querySelectorAll(".ibSlot.filled .ibAffixName")].map((e) => e.textContent),
    notice: document.querySelector(".ibNotice")?.textContent ?? null,
    base: document.querySelector(".ibBase")?.value ?? null,
})`);
const selectBase = async (page, code) => {
    await page.eval(`(() => { const s = document.querySelector(".ibBase"); s.value = ${JSON.stringify(code)}; s.dispatchEvent(new Event("change", {bubbles: true})); })()`);
    await sleep(300);
};
// Picks up to n free rows on the current side; stops early when none is left (a group can lock the rest).
const pickFree = async (page, n) => {
    for (let i = 0; i < n; i++) {
        if (!(await page.eval(`!!document.querySelector(".ibRow.free")`))) break;
        await page.click(".ibRow.free");
    }
};
const typeNth = async (page, selector, nth, text) => {
    await page.eval(`(() => { const el = document.querySelectorAll(${JSON.stringify(selector)})[${nth}]; el.focus(); el.select(); })()`);
    await page.send("Input.insertText", {text});
    await sleep(250);
};

await run(async (page) => {
    // Desktop first: hover checks must run before any touch emulation (CLAUDE.md).
    await page.desktop();
    await page.goto(BASE + "#/itembuilder");
    await page.waitFor(`!!document.querySelector(".ibBase")`);
    const v = await page.eval(`fetch("data/standard/ItemBuilder.json").then((r) => r.json()).then((j) => j.linkVersion)`);

    // Picking, group lock, full side.
    await selectBase(page, "cst");
    await page.click(".ibQualityBtn", {text: "Rare"});
    await page.click(`.ibRow[data-key="p352"]`);
    let s = await state(page);
    c.ok(s.hash === `#/itembuilder?v=${v}&b=cst&q=r&a=p352`, "picking writes the build to the hash", s.hash);
    const why = await page.eval(`document.querySelector('.ibRow[data-key="p354"] .ibWhy')?.textContent`);
    c.ok(why === "Group taken by Lapis", "a taken group greys its other members with the reason", why);
    await pickFree(page, 2);
    const full = await page.eval(`[...document.querySelectorAll(".ibRow.full .ibWhy")].length > 0`);
    c.ok(full, "a full side greys the remaining rows as 'Slots full'");

    // Base change drops what no longer fits (Review Focus 2).
    await selectBase(page, "cm3");
    s = await state(page);
    c.ok(s.title === "Magic Grand Charm" && s.filled.length === 0 && /no longer fit/.test(s.notice ?? ""),
        "switching to a magic-only charm drops the picks with a notice", JSON.stringify(s));
    c.ok(await page.eval(`!document.querySelector(".ibQuality")`), "a charm shows no quality control");

    // Crafted: two level inputs, total of 4.
    await selectBase(page, "rin");
    await page.click(".ibQualityBtn", {text: "Crafted"});
    const labels = await page.eval(`[...document.querySelectorAll(".ibLevel span")].map((e) => e.textContent)`);
    c.ok(JSON.stringify(labels) === JSON.stringify(["clvl", "ingredient ilvl"]), "crafted shows clvl and ingredient ilvl", labels.join(", "));
    await pickFree(page, 3);
    await page.click(".ibSideTab", {text: "Suffixes"});
    await pickFree(page, 1);
    const crafted = await page.eval(`({
        reached: [...document.querySelectorAll(".ibSlot")].some((e) => e.textContent === "total reached"),
        free: document.querySelectorAll(".ibRow.free").length,
    })`);
    c.ok(crafted.reached && crafted.free === 0, "4 crafted affixes close both sides", JSON.stringify(crafted));

    // Level input (Review Focus 1): clearing or 0 keeps the build; blur restores the value.
    await page.click(".ibQualityBtn", {text: "Rare"});
    const before = (await state(page)).hash;
    await typeNth(page, ".ibLevelInput", 0, "0");
    c.ok((await state(page)).hash === before, "typing 0 in ilvl does not change the build");
    await page.eval(`document.querySelector(".ibLevelInput").blur()`);
    await sleep(200);
    c.ok(await page.eval(`document.querySelector(".ibLevelInput").value === "99"`), "leaving the field shows the last valid ilvl");
    await typeNth(page, ".ibLevelInput", 0, "40");
    c.ok(/&il=40/.test((await state(page)).hash), "typing 40 commits ilvl 40");

    // Reload restores the build.
    s = await state(page);
    await page.goto(BASE + s.hash);
    await page.waitFor(`!!document.querySelector(".ibTitle")`);
    const reloaded = await state(page);
    c.ok(reloaded.hash === s.hash && JSON.stringify(reloaded.filled) === JSON.stringify(s.filled), "a reload restores the build", reloaded.hash);

    // History (Review Focus 3): picks replace, Back leaves the tab, the build survives other tabs.
    const lapisLink = `#/itembuilder?v=${v}&b=cst&q=r&a=p352`;
    await page.goto(BASE + "#/weapons");
    await page.waitFor(`!!document.querySelector(".tabs .tab")`);
    await page.eval(`location.hash = ${JSON.stringify(lapisLink)}`);
    await page.waitFor(`!!document.querySelector(".ibTitle")`);
    await page.click(`.ibRow[data-key="p354"]`); // greyed by Lapis's group: a disabled button, so no change
    await page.click(`.ibRow[data-key="p352"]`); // drops Lapis
    await page.click(`.ibRow[data-key="p354"]`); // picks Cobalt
    c.ok((await state(page)).hash === `#/itembuilder?v=${v}&b=cst&q=r&a=p354`, "picks replace the hash in place");
    await page.eval("history.back()");
    await sleep(500);
    c.ok(await page.eval(`location.hash === "#/weapons"`), "Back after picks returns to the previous tab");
    await openTab(page, "itembuilder");
    await sleep(300);
    s = await state(page);
    c.ok(JSON.stringify(s.filled) === JSON.stringify(["Cobalt"]), "returning to the tab shows the build", JSON.stringify(s.filled));

    // Ctrl+F (Review Focus 5).
    for (const type of ["keyDown", "keyUp"]) {
        await page.send("Input.dispatchKeyEvent", {type, key: "f", code: "KeyF", modifiers: 2, windowsVirtualKeyCode: 70});
    }
    await sleep(200);
    c.ok(await page.eval(`document.activeElement?.classList.contains("ibSearch")`), "Ctrl+F focuses the affix search");
    await typeNth(page, ".ibSearch", 0, "cold resist");
    const matches = await page.eval(`(() => { const rows = [...document.querySelectorAll(".ibRow")]; return rows.length > 0 && rows.every((r) => /cold resist/i.test(r.textContent)); })()`);
    c.ok(matches, "the search matches stat text (e.g. 'Cold Resist +16-20%')");

    // Doctored and old links.
    await page.goto(`${BASE}#/itembuilder?v=${v}&b=cst&q=r&a=p352-p352-p999999-s0x`);
    await page.waitFor(`!!document.querySelector(".ibNotice")`);
    s = await state(page);
    c.ok(/no longer fit/.test(s.notice) && s.hash === `#/itembuilder?v=${v}&b=cst&q=r&a=p352`, "a doctored link is cleaned with a notice", s.hash);
    await page.goto(`${BASE}#/itembuilder?v=0&b=cst`);
    await page.waitFor(`!!document.querySelector(".ibNotice")`);
    s = await state(page);
    c.ok(s.notice === "This link was made for older game data and can't be opened." && s.hash === "#/itembuilder" && s.base === "",
        "an old link opens blank with the old-data notice", JSON.stringify(s));

    // Phone (Review Focus 4): skill affixes on an amulet, no overflow, pinned bar.
    await page.mobile();
    await page.goto(BASE + "#/itembuilder");
    await page.waitFor(`!!document.querySelector(".ibBase")`);
    await selectBase(page, "amu");
    await page.click(".ibQualityBtn", {text: "Rare"});
    await typeNth(page, ".ibSearch", 0, "skills"); // skill prefixes share group 125: one pick, the rest greyed with a reason
    await pickFree(page, 3);
    const overflow = await page.eval(OVERFLOW_CHECK);
    c.ok(overflow.count === 0 && overflow.scrollWidth <= overflow.vw, "no horizontal overflow at 390px", JSON.stringify(overflow.offenders));
    await typeNth(page, ".ibSearch", 0, "a"); // a long list, so the page can scroll the card away
    c.ok(await page.eval(`getComputedStyle(document.querySelector(".ibPinBar")).visibility === "hidden"`), "the pinned bar hides while the card is in view");
    await page.eval(`window.scrollTo(0, document.querySelector(".ibCard").getBoundingClientRect().bottom + window.scrollY + 300)`);
    await sleep(400);
    const bar = await page.eval(`(() => { const b = document.querySelector(".ibPinBar"); return {vis: getComputedStyle(b).visibility, top: Math.round(b.getBoundingClientRect().top)}; })()`);
    c.ok(bar.vis === "visible" && bar.top >= 40 && bar.top <= 80, "the pinned bar shows under the tab row once the card scrolls away", JSON.stringify(bar));

    // Desktop tab click still works after all this (sanity for the More menu entry).
    await page.desktop();
    await page.goto(BASE + "#/weapons");
    await page.waitFor(`!!document.querySelector(".tabs .tab")`);
    await clickDesktopTab(page, "itembuilder");
    await sleep(300);
    c.ok(await page.eval(`location.hash.startsWith("#/itembuilder")`), "the More menu opens the Item Builder");
});

c.done();
```

- [ ] **Step 2: Run the check against a dev server**

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && (npx vite --port 5181 --strictPort > /tmp/ib-dev.log 2>&1 &) && sleep 6 && cd tools/checks && APP_URL=http://localhost:5181/TheArchivistSoE/ node check-itembuilder.mjs; pkill -f "vite --port 5181"
```

Expected: every line PASS, ending with the checker's all-passed line. A FAIL is a real bug: fix it in the owning file (rules, hash, hook, panel or CSS), re-run the unit tests, and re-run this check before continuing.

- [ ] **Step 3: Regression gate: desktop screenshots of every existing tab**

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && (npx vite --port 5181 --strictPort > /tmp/ib-dev.log 2>&1 &) && sleep 6 && cd tools/checks && node compare-desktop.mjs after http://localhost:5181/TheArchivistSoE/ && node diff-shots.mjs before after; pkill -f "vite --port 5181"
```

Expected: `diff-shots.mjs` iterates the "before" set (19 tabs, no `itembuilder`), so the new tab is skipped; every line reports `"diffPixels":0`. Any non-zero diff on an existing tab is a regression: find the CSS or App change that caused it and fix it.

Also run the existing feature checks, which share CSS and `App`: `check-sticky.mjs`, `check-multisort.mjs`, `check-dropcalc.mjs`, `check-tier-order.mjs` (same `APP_URL` pattern); all PASS.

- [ ] **Step 4: Update `CLAUDE.md`**

In "Layout", after the Drop calculator bullet, add:

```markdown
- The Item Builder (`itembuilder` tab): `src/itemBuilderData.js` (`MagicPrefix`/`MagicSuffix.txt` joined row by row
  with `Affixes.json`, bases, the item-type tree, the `ItemBuilder.json` format, the link-version fingerprint),
  `src/itemBuilderRules.js` (alvl, eligibility, caps, row state, `resolveBuild`), `src/itemBuilderHash.js` (the URL
  query), `src/itemBuilderLoad.js`, `src/useItemBuilder.js` (called by `App`: loads, decodes and cleans the query
  during render) and `src/ItemBuilderPanel.jsx` (props only). `src/itemBuilderFixtures.js` is Node-only (tests).
  Design: `docs/superpowers/specs/2026-10-09-item-builder-design.md`.
- The `item-builder-data` plugin in `vite.config.js` writes `public/data/standard/ItemBuilder.json` (gitignored) from
  the standard `.txt` tables plus `Affixes.json`/`Weapons.json`/`Armors.json`. A data update must also copy
  `MagicPrefix.txt` and `MagicSuffix.txt` from the mod repo (`Lukaszpg/PD2-Sanctuary-of-Exile`,
  `standard-mode/data/global/excel/`), run the dev server once, and commit `src/itemBuilderVersion.json` if the link
  version was bumped; otherwise the build fails.
```

In "Tabs", after the `VALID_TAB_KEYS` sentence, add:

```markdown
`QUERY_TABS` (`itembuilder`) may carry a query in the hash (`#/itembuilder?v=1&b=cst&q=r&a=p352`); `useHashTab`
returns it as `[tab, setTab, query, setQuery]`, replaces the history entry when only the query changes, and keeps
the query while other tabs are open. Any other tab's `?…` is malformed.
```

In "Verifying UI changes", in the harness list, add `check-itembuilder.mjs` (Item Builder end to end) to the feature checks, and change "all 19 tabs" to "all 20 tabs".

- [ ] **Step 5: Final gates and commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && cd /home/emanresu/TheArchivistSoE && npm run lint && npm test && npm run build && git add tools/checks/check-itembuilder.mjs CLAUDE.md && git commit -m "Item Builder: browser check, CLAUDE.md"
```

Expected: lint 0 problems, all tests pass (including the Drop calculator golden snapshot), build succeeds.
