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
