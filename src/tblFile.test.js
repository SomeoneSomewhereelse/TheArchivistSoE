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
