import {describe, expect, it} from "vitest";
import {hashForTab, hashWriteAction, parseTabFromHash} from "./hashTab.js";

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
