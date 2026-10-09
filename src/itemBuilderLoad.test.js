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
