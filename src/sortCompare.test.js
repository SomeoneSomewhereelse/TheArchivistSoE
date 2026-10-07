import {describe, expect, it} from "vitest";
import {
    AFFIX_SORT_KEYS,
    AFFIX_SORT_LABELS,
    DEFAULT_AFFIX_SORT,
    affixPrimaryPropertyAndMax,
    affixSortValue,
    clickSort,
    compareAffixes,
    compareAffixesBy,
    compareValues,
    effectiveSort,
    flipSortKey,
    isMissing,
    parseStoredFlag,
    parseStoredSort,
    removeSortKey,
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

// ---- Multi-column sort ----------------------------------------------------------------------------

const asc = (key) => ({key, dir: "asc"});
const desc = (key) => ({key, dir: "desc"});

// A frozen list of frozen entries: any helper that mutates its input throws (ES modules are strict).
const frozen = (...entries) => Object.freeze(entries.map((e) => Object.freeze({...e})));

function sortIdsBy(rows, list) {
    return [...rows].sort((a, b) => compareAffixesBy(a, b, list)).map((r) => r.id);
}

describe("compareAffixesBy", () => {
    const rows = [
        affix("a", {group: 2, level: 10, maxLevel: null, requiredLevel: 5}),
        affix("b", {group: 1, level: 20, maxLevel: 40, requiredLevel: null}),
        affix("c", {group: 2, level: 30, maxLevel: 60, requiredLevel: null}),
        affix("d", {group: 1, level: 20, maxLevel: null, requiredLevel: 9}),
        affix("e", {group: 2, level: 10, maxLevel: 50, requiredLevel: 1}),
    ];

    it("with one key, matches compareAffixes for every column in both directions", () => {
        const sample = [
            ...rows,
            affix("f", {
                name: "Bronze", rare: "", frequency: 3, classDisplayName: "Amazon",
                displayItemTypeNames: ["Amulets"], displayExcludedItemTypeNames: ["Wand"],
                displayProperties: [{property: "dex", max: 3}],
            }),
        ];
        for (const key of AFFIX_SORT_KEYS) {
            for (const dir of ["asc", "desc"]) {
                for (const x of sample) {
                    for (const y of sample) {
                        expect(compareAffixesBy(x, y, [{key, dir}]), `${key} ${dir} ${x.id} ${y.id}`)
                            .toBe(compareAffixes(x, y, key, dir));
                    }
                }
            }
        }
    });

    it("uses a later key only to break the ties left by earlier ones", () => {
        expect(sortIdsBy(rows, [asc("group"), desc("level")])).toEqual(["b", "d", "c", "a", "e"]);
        expect(sortIdsBy(rows, [desc("level"), asc("group")])).toEqual(["c", "b", "d", "a", "e"]);
    });

    it("keeps each key's missing-value rule inside a list", () => {
        // Max lvl: null is "no cap", so it sorts last ascending within each group.
        expect(sortIdsBy(rows, [asc("group"), asc("maxLevel")])).toEqual(["b", "d", "e", "c", "a"]);
        // Req lvl: null is missing, so it sorts first ascending within each group.
        expect(sortIdsBy(rows, [asc("group"), asc("reqLevel")])).toEqual(["b", "d", "c", "e", "a"]);
    });

    it("keeps rows tied on every key in their incoming order", () => {
        expect(sortIdsBy(rows, [asc("rare"), desc("freq")])).toEqual(["a", "b", "c", "d", "e"]);
    });

    it("returns 0 for an empty list", () => {
        expect(compareAffixesBy(rows[0], rows[1], [])).toBe(0);
    });

    it("throws for an unknown key in the list, once it is reached", () => {
        expect(() => compareAffixesBy(rows[0], rows[1], [asc("bogus")])).toThrow(/bogus/);
        // b and d tie on Grp, so the second key is reached.
        expect(() => compareAffixesBy(rows[1], rows[3], [asc("group"), asc("bogus")])).toThrow(/bogus/);
    });
});

describe("effectiveSort", () => {
    it("falls back to the frozen default for an empty list", () => {
        expect(effectiveSort([])).toBe(DEFAULT_AFFIX_SORT);
        expect(DEFAULT_AFFIX_SORT).toEqual([{key: "attrs", dir: "asc"}]);
        expect(Object.isFrozen(DEFAULT_AFFIX_SORT)).toBe(true);
        expect(Object.isFrozen(DEFAULT_AFFIX_SORT[0])).toBe(true);
    });

    it("returns a non-empty list itself, not a copy", () => {
        const list = [asc("group")];
        expect(effectiveSort(list)).toBe(list);
    });
});

describe("clickSort", () => {
    describe("plain click (Multi-sort off)", () => {
        it("on an empty list, Attributes flips the default", () => {
            expect(clickSort(frozen(), "attrs", {multi: false})).toEqual([desc("attrs")]);
        });

        it("on an empty list, another column sorts ascending without Attributes", () => {
            expect(clickSort(frozen(), "group", {multi: false})).toEqual([asc("group")]);
        });

        it("flips the sole key when it is clicked again", () => {
            expect(clickSort(frozen(asc("group")), "group", {multi: false})).toEqual([desc("group")]);
            expect(clickSort(frozen(desc("group")), "group", {multi: false})).toEqual([asc("group")]);
        });

        it("replaces any other list with the clicked column ascending", () => {
            expect(clickSort(frozen(asc("group")), "level", {multi: false})).toEqual([asc("level")]);
            const list = frozen(asc("group"), desc("level"));
            expect(clickSort(list, "level", {multi: false})).toEqual([asc("level")]);
            expect(clickSort(list, "name", {multi: false})).toEqual([asc("name")]);
        });
    });

    describe("multi click (Multi-sort on)", () => {
        it("on an empty list, starts the list with the clicked column, without the default", () => {
            expect(clickSort(frozen(), "group", {multi: true})).toEqual([asc("group")]);
            expect(clickSort(frozen(), "attrs", {multi: true})).toEqual([asc("attrs")]);
        });

        it("appends a new column ascending at the end", () => {
            expect(clickSort(frozen(asc("group"), desc("level")), "maxLevel", {multi: true}))
                .toEqual([asc("group"), desc("level"), asc("maxLevel")]);
        });

        it("flips a column already in the list in place", () => {
            expect(clickSort(frozen(asc("group"), desc("level"), asc("name")), "level", {multi: true}))
                .toEqual([asc("group"), asc("level"), asc("name")]);
        });
    });

    it("never mutates its input and always returns a new array", () => {
        const list = frozen(asc("group"));
        for (const [key, multi] of [["group", false], ["level", false], ["group", true], ["level", true]]) {
            expect(clickSort(list, key, {multi})).not.toBe(list);
        }
        expect(list).toEqual([asc("group")]);
    });
});

describe("flipSortKey", () => {
    it("flips only its key, in place", () => {
        expect(flipSortKey(frozen(asc("group"), desc("level")), "level")).toEqual([asc("group"), asc("level")]);
        expect(flipSortKey(frozen(asc("group"), desc("level")), "group")).toEqual([desc("group"), desc("level")]);
    });

    it("returns the same list for a key that isn't in it", () => {
        const list = frozen(asc("group"));
        expect(flipSortKey(list, "level")).toBe(list);
    });
});

describe("removeSortKey", () => {
    it("removes only its key, keeping the others in order", () => {
        expect(removeSortKey(frozen(asc("group"), desc("level"), asc("name")), "level"))
            .toEqual([asc("group"), asc("name")]);
    });

    it("returns an empty list when the last key is removed", () => {
        expect(removeSortKey(frozen(asc("group")), "group")).toEqual([]);
    });

    it("returns the same list for a key that isn't in it", () => {
        const list = frozen(asc("group"));
        expect(removeSortKey(list, "level")).toBe(list);
    });
});

describe("parseStoredSort", () => {
    it("returns an empty list for nothing, invalid JSON and non-arrays, without throwing", () => {
        for (const raw of [null, undefined, "", "nope", "{nope", "{}", "42", "null", "[]"]) {
            expect(parseStoredSort(raw), String(raw)).toEqual([]);
        }
    });

    it("drops entries that aren't {key, dir} objects with a known key and asc or desc", () => {
        const raw = JSON.stringify([
            null, 1, "attrs", ["group", "asc"], {key: "bogus", dir: "asc"},
            {key: "group"}, {key: "level", dir: "up"}, {key: "name", dir: "desc"},
        ]);
        expect(parseStoredSort(raw)).toEqual([desc("name")]);
    });

    it("keeps the first of duplicate keys and drops extra fields", () => {
        const raw = JSON.stringify([{key: "group", dir: "desc", extra: 1}, {key: "group", dir: "asc"}, asc("level")]);
        expect(parseStoredSort(raw)).toEqual([desc("group"), asc("level")]);
    });

    it("round-trips a valid list", () => {
        const list = [asc("types"), asc("attrs"), desc("maxLevel")];
        expect(parseStoredSort(JSON.stringify(list))).toEqual(list);
    });
});

describe("AFFIX_SORT_LABELS", () => {
    it("has a non-empty label for every sortable column, and nothing else", () => {
        expect(Object.keys(AFFIX_SORT_LABELS).sort()).toEqual([...AFFIX_SORT_KEYS].sort());
        for (const key of AFFIX_SORT_KEYS) expect(AFFIX_SORT_LABELS[key], key).toMatch(/\S/);
    });
});

describe("parseStoredFlag", () => {
    it("is true only for the JSON value true", () => {
        expect(parseStoredFlag("true")).toBe(true);
    });

    it("is false for nothing, false, invalid JSON and other types, without throwing", () => {
        for (const raw of [null, undefined, "", "false", "nope", "{nope", "1", '"true"', "[]", "null"]) {
            expect(parseStoredFlag(raw), String(raw)).toBe(false);
        }
    });
});
