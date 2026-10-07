// Node-only helpers for the Drop calculator's tests and tools/checks scripts. Later parts read files
// with node:fs, so the app must never import this module.

import {readFileSync} from "node:fs";
import {DROP_CALC_TABLES, jsonToTables, tablesToJson} from "./dropCalcData.js";
import {prepareModel} from "./dropCalcEngine.js";

const DATA = new URL("../public/data/", import.meta.url);

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

// The prepared model of one mode, built from the .txt tables the way the browser builds it.
export function loadDropCalcModel(mode) {
    return prepareModel(loadDropCalcTables(mode));
}
