import {describe, expect, it} from "vitest";
import {sortTiers, TIER_ORDER} from "./tiers.js";

describe("sortTiers", () => {
    it("lists the three tiers Normal, Exceptional, Elite whatever the input order", () => {
        for (const input of [["Elite", "Exceptional", "Normal"], ["Exceptional", "Normal", "Elite"], ["Normal", "Elite", "Exceptional"]]) {
            expect(sortTiers(input)).toEqual(TIER_ORDER);
        }
    });

    it("keeps a subset in tier order", () => {
        expect(sortTiers(["Elite", "Normal"])).toEqual(["Normal", "Elite"]);
    });

    it("puts unknown values after the known tiers, numbers ascending, then alphabetical", () => {
        expect(sortTiers(["Elite", "10", "Mythic", "2", "Normal"])).toEqual(["Normal", "Elite", "2", "10", "Mythic"]);
    });

    it("doesn't change its input", () => {
        const input = ["Elite", "Normal"];
        sortTiers(input);
        expect(input).toEqual(["Elite", "Normal"]);
    });
});
