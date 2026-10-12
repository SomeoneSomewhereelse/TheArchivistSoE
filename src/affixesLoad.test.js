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
