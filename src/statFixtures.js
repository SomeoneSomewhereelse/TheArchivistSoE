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

// Engine bases (the shape of src/itemTooltip.js engineBase) for the engine's tests, one per kind funcs 5-7
// tell apart, with SoE's numbers: Hand Axe, Giant Axe, Bastard Sword, Throwing Axe, Monarch.
export const ENGINE_TEST_BASES = {
    oneHanded: {isWeapon: true, dmg1: [3, 6], dmg2: null, dmgThrow: null, throwable: false, txtMaxDamage: 6, cells: 3, gemsockets: 2, maxSock: [4, 5, 6]},
    twoHanded: {isWeapon: true, dmg1: null, dmg2: [22, 45], dmgThrow: null, throwable: false, txtMaxDamage: 45, cells: 6, gemsockets: 6, maxSock: [4, 5, 6]},
    oneOrTwo: {isWeapon: true, dmg1: [7, 19], dmg2: [20, 28], dmgThrow: null, throwable: false, txtMaxDamage: 28, cells: 4, gemsockets: 4, maxSock: [3, 4, 6]},
    throwable: {isWeapon: true, dmg1: [4, 7], dmg2: null, dmgThrow: [7, 8], throwable: true, txtMaxDamage: 7, cells: 2, gemsockets: 1, maxSock: [2, 3, 3]},
    nonWeapon: {isWeapon: false, dmg1: null, dmg2: null, dmgThrow: null, throwable: false, txtMaxDamage: 0, cells: 6, gemsockets: 4, maxSock: [3, 3, 4]},
};
