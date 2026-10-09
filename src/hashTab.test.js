import {describe, expect, it} from "vitest";
import {hashForTab, hashWriteAction, parseHash, parseTabFromHash, targetHash} from "./hashTab.js";

const KEYS = ["weapons", "affixes", "changelog"];

describe("parseTabFromHash", () => {
    it("returns the key of a valid #/<key> hash", () => {
        expect(parseTabFromHash("#/affixes", KEYS)).toBe("affixes");
        expect(parseTabFromHash("#/changelog", KEYS)).toBe("changelog");
    });

    it("returns null for an unknown key, including tabs that exist but aren't valid", () => {
        expect(parseTabFromHash("#/bogus", KEYS)).toBeNull();
        expect(parseTabFromHash("#/essences", KEYS)).toBeNull();
        expect(parseTabFromHash("#/Affixes", KEYS)).toBeNull();
    });

    it("returns null for an empty or absent hash", () => {
        expect(parseTabFromHash("", KEYS)).toBeNull();
        expect(parseTabFromHash(undefined, KEYS)).toBeNull();
        expect(parseTabFromHash(null, KEYS)).toBeNull();
    });

    it("returns null for malformed hashes", () => {
        for (const hash of ["#", "#/", "#affixes", "#//affixes", "#/affixes/", "#/affixes/extra", "#/affixes?x=1"]) {
            expect(parseTabFromHash(hash, KEYS), hash).toBeNull();
        }
    });
});

describe("hashForTab", () => {
    it("formats #/<key> and round-trips through parseTabFromHash", () => {
        expect(hashForTab("uniques")).toBe("#/uniques");
        for (const key of KEYS) expect(parseTabFromHash(hashForTab(key), KEYS)).toBe(key);
    });
});

describe("hashWriteAction", () => {
    it("does nothing when the hash already names the tab", () => {
        expect(hashWriteAction("#/affixes", "affixes", KEYS)).toBeNull();
    });

    it("does nothing for a tab that is not a valid hash target", () => {
        expect(hashWriteAction("#/weapons", "essences", KEYS)).toBeNull();
    });

    it("pushes a history entry when leaving one valid tab for another", () => {
        expect(hashWriteAction("#/weapons", "affixes", KEYS)).toBe("push");
    });

    it("replaces an empty or unknown hash in place", () => {
        expect(hashWriteAction("", "weapons", KEYS)).toBe("replace");
        expect(hashWriteAction("#/bogus", "weapons", KEYS)).toBe("replace");
        expect(hashWriteAction("#", "weapons", KEYS)).toBe("replace");
    });
});

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
