import {describe, expect, it} from "vitest";
import {
    AFFIX_SORT_KEYS,
    affixPrimaryPropertyAndMax,
    affixSortValue,
    compareAffixes,
    compareValues,
    isMissing,
} from "./sortCompare.js";

// Minimal rows shaped like public/data/Affixes.json entries.
function affix(id, fields = {}) {
    return {
        id,
        name: `Affix ${id}`,
        level: 1,
        group: 1,
        rare: "1",
        frequency: 1,
        maxLevel: null,
        requiredLevel: 1,
        classDisplayName: null,
        displayItemTypeNames: ["Rings"],
        displayExcludedItemTypeNames: [],
        displayProperties: [{property: "str", max: 1, displayString: "+1 to Strength"}],
        ...fields,
    };
}

function sortIds(rows, key, dir) {
    return [...rows].sort((a, b) => compareAffixes(a, b, key, dir)).map((r) => r.id);
}

describe("isMissing", () => {
    it("treats null, undefined, an empty string and an empty array as missing", () => {
        for (const v of [null, undefined, "", []]) expect(isMissing(v)).toBe(true);
    });

    it("treats zero, false, '0', whitespace and non-empty arrays as present", () => {
        for (const v of [0, false, "0", " ", ["x"]]) expect(isMissing(v)).toBe(false);
    });
});

describe("compareValues", () => {
    it("compares numbers numerically, not as text", () => {
        expect(compareValues(9, 10, "asc")).toBe(-1);
        expect(compareValues(10, 9, "asc")).toBe(1);
        expect(compareValues(9, 10, "desc")).toBe(1);
    });

    it("compares strings with localeCompare", () => {
        expect(compareValues("Amazon", "Sorceress", "asc")).toBe(-1);
        expect(compareValues("Amazon", "Sorceress", "desc")).toBe(1);
    });

    it("compares arrays by their comma-joined text", () => {
        expect(compareValues(["Amulets", "Rings"], ["Amulets"], "asc")).toBe(1);
    });

    it("sorts missing values lowest by default: first ascending, last descending", () => {
        expect(compareValues(null, 1, "asc")).toBe(-1);
        expect(compareValues(null, 1, "desc")).toBe(1);
        expect(compareValues("", "a", "asc")).toBe(-1);
        expect(compareValues([], ["a"], "asc")).toBe(-1);
    });

    it("sorts missing values highest with missing: 'high': last ascending, first descending", () => {
        expect(compareValues(null, 1, "asc", {missing: "high"})).toBe(1);
        expect(compareValues(null, 1, "desc", {missing: "high"})).toBe(-1);
    });

    it("returns exactly 0 for ties in both directions", () => {
        expect(compareValues(null, undefined, "asc")).toBe(0);
        expect(compareValues(null, undefined, "desc")).toBe(0);
        expect(compareValues(5, 5, "desc")).toBe(0);
        expect(compareValues("a", "a", "desc")).toBe(0);
    });
});

describe("affixSortValue", () => {
    it("has a value for every sortable column of a fully populated affix", () => {
        const full = affix("x", {
            maxLevel: 50,
            classDisplayName: "Amazon",
            displayExcludedItemTypeNames: ["Staff Class"],
        });
        for (const key of AFFIX_SORT_KEYS.filter((k) => k !== "attrs")) {
            expect(isMissing(affixSortValue(full, key)), key).toBe(false);
        }
    });

    it("reads Rares as a boolean: '' is No (0), not missing", () => {
        expect(affixSortValue(affix("a", {rare: ""}), "rare")).toBe(0);
        expect(affixSortValue(affix("b", {rare: "1"}), "rare")).toBe(1);
    });

    it("throws for a column key it has no case for, instead of tying every row", () => {
        expect(() => affixSortValue(affix("a"), "bogus")).toThrow(/bogus/);
        expect(() => compareAffixes(affix("a"), affix("b"), "bogus", "asc")).toThrow(/bogus/);
    });

    it("treats null numeric fields as missing", () => {
        expect(isMissing(affixSortValue(affix("a", {maxLevel: null}), "maxLevel"))).toBe(true);
        expect(isMissing(affixSortValue(affix("a", {requiredLevel: null}), "reqLevel"))).toBe(true);
    });
});

describe("compareAffixes", () => {
    it("Max lvl: missing (no cap) counts as highest, so last ascending, first descending", () => {
        const rows = [
            affix("a", {maxLevel: null}),
            affix("b", {maxLevel: 40}),
            affix("c", {maxLevel: 20}),
            affix("d", {maxLevel: null}),
        ];
        expect(sortIds(rows, "maxLevel", "asc")).toEqual(["c", "b", "a", "d"]);
        expect(sortIds(rows, "maxLevel", "desc")).toEqual(["a", "d", "b", "c"]);
    });

    it("Req lvl: missing counts as lowest", () => {
        const rows = [
            affix("a", {requiredLevel: 3}),
            affix("b", {requiredLevel: null}),
            affix("c", {requiredLevel: 10}),
        ];
        expect(sortIds(rows, "reqLevel", "asc")).toEqual(["b", "a", "c"]);
        expect(sortIds(rows, "reqLevel", "desc")).toEqual(["c", "a", "b"]);
    });

    it("Class: missing counts as lowest", () => {
        const rows = [
            affix("a"),
            affix("b", {classDisplayName: "Sorceress"}),
            affix("c", {classDisplayName: "Amazon"}),
            affix("d"),
        ];
        expect(sortIds(rows, "class", "asc")).toEqual(["a", "d", "c", "b"]);
        expect(sortIds(rows, "class", "desc")).toEqual(["b", "c", "a", "d"]);
    });

    it("Item types and Excluded item types: an empty list counts as lowest", () => {
        const types = [
            affix("a", {displayItemTypeNames: ["Rings"]}),
            affix("b", {displayItemTypeNames: []}),
            affix("c", {displayItemTypeNames: ["Amulets"]}),
        ];
        expect(sortIds(types, "types", "asc")).toEqual(["b", "c", "a"]);

        const excluded = [affix("a", {displayExcludedItemTypeNames: ["Wand"]}), affix("b")];
        expect(sortIds(excluded, "excluded", "asc")).toEqual(["b", "a"]);
        expect(sortIds(excluded, "excluded", "desc")).toEqual(["a", "b"]);
    });

    it("Rares: No sorts before Yes ascending, after it descending", () => {
        const rows = [affix("a", {rare: "1"}), affix("b", {rare: ""}), affix("c", {rare: "1"})];
        expect(sortIds(rows, "rare", "asc")).toEqual(["b", "a", "c"]);
        expect(sortIds(rows, "rare", "desc")).toEqual(["a", "c", "b"]);
    });

    it("Attributes: groups by property, then max; empty displayProperties sort lowest", () => {
        const rows = [
            affix("a", {displayProperties: [{property: "str", max: 10}]}),
            affix("b", {displayProperties: []}),
            affix("c", {displayProperties: [{property: "dex", max: 5}]}),
            affix("d", {displayProperties: [{property: "str", max: 2}]}),
        ];
        expect(sortIds(rows, "attrs", "asc")).toEqual(["b", "c", "d", "a"]);
        expect(sortIds(rows, "attrs", "desc")).toEqual(["a", "d", "c", "b"]);
    });

    it("Lvl, Grp and Freq sort numerically", () => {
        const levels = [affix("a", {level: 10}), affix("b", {level: 9}), affix("c", {level: 100})];
        expect(sortIds(levels, "level", "asc")).toEqual(["b", "a", "c"]);
        const groups = [affix("a", {group: 12}), affix("b", {group: 3})];
        expect(sortIds(groups, "group", "asc")).toEqual(["b", "a"]);
        const freqs = [affix("a", {frequency: 4}), affix("b", {frequency: 20})];
        expect(sortIds(freqs, "freq", "desc")).toEqual(["b", "a"]);
    });

    it("Name sorts alphabetically", () => {
        const rows = [affix("a", {name: "of Wrath"}), affix("b", {name: "Bronze"})];
        expect(sortIds(rows, "name", "asc")).toEqual(["b", "a"]);
    });

    it("keeps ties in their incoming order in both directions", () => {
        const rows = [
            affix("a", {level: 5}),
            affix("b", {level: 5}),
            affix("c", {level: 1}),
            affix("d", {level: 5}),
        ];
        expect(sortIds(rows, "level", "asc")).toEqual(["c", "a", "b", "d"]);
        expect(sortIds(rows, "level", "desc")).toEqual(["a", "b", "d", "c"]);
    });
});

describe("affixPrimaryPropertyAndMax", () => {
    it("reads the first property object, trimming the name and numbering the max", () => {
        expect(affixPrimaryPropertyAndMax(affix("a", {displayProperties: [{property: " str ", max: "7"}]})))
            .toEqual({property: "str", max: 7});
    });

    it("returns an empty property for missing or empty displayProperties", () => {
        expect(affixPrimaryPropertyAndMax(affix("a", {displayProperties: []}))).toEqual({property: "", max: 0});
        expect(affixPrimaryPropertyAndMax(affix("a", {displayProperties: null}))).toEqual({property: "", max: 0});
    });
});
