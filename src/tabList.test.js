import {describe, expect, it} from "vitest";
import {QUERY_TABS, TAB_GROUPS, TABS, VALID_TAB_KEYS} from "./tabList.js";

describe("tab list", () => {
    it("titles every tab the mobile sheet shows", () => {
        for (const key of TAB_GROUPS.flatMap((g) => g.keys)) expect(TABS[key], key).toBeTruthy();
    });

    it("lets the hash name every sheet tab plus Changelog, but never the panel-less Essences", () => {
        expect(VALID_TAB_KEYS).toContain("changelog");
        expect(VALID_TAB_KEYS).not.toContain("essences");
        expect(VALID_TAB_KEYS).toHaveLength(20);
    });

    it("lists no tab twice", () => {
        expect(new Set(VALID_TAB_KEYS).size).toBe(VALID_TAB_KEYS.length);
    });

    it("only lets valid tabs carry a hash query", () => {
        for (const key of QUERY_TABS) expect(VALID_TAB_KEYS).toContain(key);
    });
});
