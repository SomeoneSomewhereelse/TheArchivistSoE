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
