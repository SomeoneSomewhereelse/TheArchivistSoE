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
