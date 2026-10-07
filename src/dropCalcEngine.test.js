import {describe, expect, it} from "vitest";
import {DROP_CALC_COLUMNS} from "./dropCalcData.js";
import {calculateDrops, prepareModel} from "./dropCalcEngine.js";
import {formatGolden, GOLDEN_QUERIES, loadDropCalcModel, loadDropCalcTables, readUniquesJson} from "./dropCalcFixtures.js";

const EMPTY = {MonStats: [], TreasureClassEx: [], Weapons: [], Armor: [], Misc: [], UniqueItems: [], SetItems: [],
    ItemRatio: [], ItemTypes: [], Levels: []};
const monster = (id, tc, level) => ({Id: id, NameStr: `${id} name`, TreasureClass1: tc, Level: String(level)});
const tc = (name, items, {group = "", level = "", noDrop = "0", picks = "1"} = {}) => {
    const row = {"Treasure Class": name, group, level, Picks: picks, NoDrop: noDrop};
    items.forEach(([item, prob], i) => {
        row[`Item${i + 1}`] = item;
        row[`Prob${i + 1}`] = String(prob);
    });
    return row;
};
const options = (dropMode, query) => ({dropMode, query, difficulty: "", players: "1", mf: ""});

function runGolden(q, model) {
    try {
        return {q, rows: calculateDrops(model, q)};
    } catch (e) {
        return {q, error: e.message};
    }
}

describe("calculateDrops on hand-built tables", () => {
    it("looks treasure classes up by trimmed, lowercased name, and the first row wins", () => {
        const model = prepareModel({...EMPTY,
            MonStats: [monster("m1", " act 1 GOOD ", 10)],
            TreasureClassEx: [tc("Act 1 Good", [["hax", 1]]), tc("Act 1 Good", [["hax", 1]], {noDrop: "1"})],
            Misc: [{code: "hax", level: "1"}],
        });
        const rows = calculateDrops(model, options("misc", "hax"));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({monsterId: "m1", monsterName: "m1 name", treasureClass: "act 1 GOOD", chance: 1});
    });

    it("derives oneIn and percent from chance", () => {
        const model = prepareModel({...EMPTY,
            MonStats: [monster("m1", "TC X", 10)],
            TreasureClassEx: [tc("TC X", [["hax", 1]], {noDrop: "1"})],
            Misc: [{code: "hax", level: "1"}],
        });
        expect(calculateDrops(model, options("misc", "hax"))[0]).toMatchObject({chance: 0.5, oneIn: 2, percent: 50});
    });

    it("upgrades the root TC to the highest level within the monster's level, file order on ties", () => {
        const model = prepareModel({...EMPTY,
            MonStats: [monster("m1", "TC A", 15)],
            TreasureClassEx: [
                tc("TC A", [["hax", 1]], {group: "7", level: "5"}),
                tc("TC B", [["hax", 1]], {group: "7", level: "10"}),
                tc("TC C", [["hax", 1]], {group: "7", level: "10"}),
                tc("TC D", [["hax", 1]], {group: "7", level: "20"}),
            ],
            Misc: [{code: "hax", level: "1"}],
        });
        expect(calculateDrops(model, options("misc", "hax"))[0].treasureClass).toBe("TC B");
    });

    it("throws the legacy messages, with the query as typed", () => {
        const model = prepareModel({...EMPTY, UniqueItems: [{index: "Real", code: "zzz", lvl: "1"}]});
        expect(() => calculateDrops(model, options("unique", " Nope "))).toThrow("Unique item not found:  Nope ");
        expect(() => calculateDrops(model, options("set", "nope"))).toThrow("Set item not found: nope");
        expect(() => calculateDrops(model, options("misc", "nope"))).toThrow("Misc code not found: nope");
        expect(() => calculateDrops(model, options("unique", "real"))).toThrow("Base item not found for code: zzz");
    });

    it("returns no rows for an empty query", () => {
        expect(calculateDrops(prepareModel(EMPTY), options("unique", "   "))).toEqual([]);
    });

    it("resolves an empty-code target to the first empty-code base row: an empty table, not an error", () => {
        const model = prepareModel({...EMPTY,
            MonStats: [monster("m1", "TC X", 10)],
            TreasureClassEx: [tc("TC X", [["hax", 1]])],
            Weapons: [{code: "", level: "0", spawnable: "0"}, {code: "hax", level: "1", spawnable: "1", type: "axe"}],
            UniqueItems: [{index: "Rings", code: "", lvl: ""}],
        });
        expect(calculateDrops(model, options("unique", "rings"))).toEqual([]);
    });

    // SoE's treasure classes drop runes and gems as stacks ("r01s"), never as the plain code ("r01").
    it("counts a misc item's stackable <code>s variant as the item", () => {
        const tables = {...EMPTY,
            MonStats: [monster("m1", "TC X", 10)],
            TreasureClassEx: [tc("TC X", [["haxs", 1]], {noDrop: "1"})],
            Misc: [{code: "hax", level: "1", stackable: "0"}, {code: "haxs", level: "1", stackable: "1"}],
        };
        const rows = calculateDrops(prepareModel(tables), options("misc", "hax"));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({monsterId: "m1", chance: 0.5});
        expect(calculateDrops(prepareModel(tables), options("misc", "haxs"))).toEqual(rows);
    });

    it("adds the plain and the stack drops of one TC, and ignores a <code>s row that isn't stackable", () => {
        const both = prepareModel({...EMPTY,
            MonStats: [monster("m1", "TC X", 10)],
            TreasureClassEx: [tc("TC X", [["hax", 1], ["haxs", 1], ["other", 2]])],
            Misc: [{code: "hax", level: "1", stackable: "0"}, {code: "haxs", level: "1", stackable: "1"}],
        });
        expect(calculateDrops(both, options("misc", "hax"))[0].chance).toBe(0.5);

        const notStack = prepareModel({...EMPTY,
            MonStats: [monster("m1", "TC X", 10)],
            TreasureClassEx: [tc("TC X", [["haxs", 1]])],
            Misc: [{code: "hax", level: "1", stackable: "0"}, {code: "haxs", level: "1", stackable: "0"}],
        });
        expect(calculateDrops(notStack, options("misc", "hax"))).toEqual([]);
    });

    it("walks each root TC once per query and counts the work in stats", () => {
        const model = prepareModel({...EMPTY,
            MonStats: [monster("m1", "TC X", 10), monster("m2", "TC X", 12), monster("m3", "TC Y", 10)],
            TreasureClassEx: [tc("TC X", [["hax", 1]]), tc("TC Y", [["hax", 1]])],
            Misc: [{code: "hax", level: "1"}],
        });
        const stats = {};
        expect(calculateDrops(model, options("misc", "hax"), stats)).toHaveLength(3);
        expect(stats).toEqual({walkNodes: 4, walks: 2, outcomes: 3});
    });
});

describe("calculateDrops on the real tables", () => {
    it("matches the legacy code's output for the golden query set", async () => {
        const models = {standard: loadDropCalcModel("standard"), damnation: loadDropCalcModel("damnation")};
        const text = formatGolden(GOLDEN_QUERIES.map((q) => runGolden(q, models[q.damnation ? "damnation" : "standard"])));
        await expect(text).toMatchFileSnapshot("./__snapshots__/dropCalc.golden.txt");
    }, 60000);

    it("reads only columns listed in DROP_CALC_COLUMNS", () => {
        for (const mode of ["standard", "damnation"]) {
            const read = {};
            const tables = Object.fromEntries(Object.entries(loadDropCalcTables(mode)).map(([name, rows]) => {
                read[name] = new Set();
                return [name, rows.map((row) => new Proxy(row, {
                    get(target, key, receiver) {
                        if (typeof key === "string") read[name].add(key);
                        return Reflect.get(target, key, receiver);
                    },
                }))];
            }));
            const model = prepareModel(tables);
            for (const q of GOLDEN_QUERIES) runGolden(q, model);

            for (const [name, keys] of Object.entries(read)) {
                const spec = DROP_CALC_COLUMNS[name];
                if (spec.all) continue;
                const listed = new Set([...spec.required, ...(spec.optional ?? [])]);
                expect([...keys].filter((k) => !listed.has(k)), `${mode} ${name}`).toEqual([]);
            }
        }
    }, 60000);
});

describe("rune stacks", () => {
    it("a rune's rows are its stack's rows, in both modes and every difficulty", () => {
        for (const mode of ["standard", "damnation"]) {
            const model = loadDropCalcModel(mode);
            for (const difficulty of ["", "N", "H"]) {
                const rows = (query) => calculateDrops(model, {dropMode: "misc", query, difficulty, players: "1", mf: ""});
                const stack = rows("r01s");
                expect(stack.length, `${mode} r01s`).toBeGreaterThan(0);
                expect(rows("r01"), `${mode} ${difficulty || "N"} r01`).toEqual(stack);
            }
        }
    });
});

// The unique card's "View drop rates" link sends u.index; the calculator matches it exactly against
// UniqueItems.txt's index. The display name often differs ("Skull Splitter" is "Mindrend").
describe("View drop rates link targets", () => {
    const shown = (u) => ![true, 1, "1", "true"].includes(typeof u.dontDisplay === "string" ? u.dontDisplay.toLowerCase() : u.dontDisplay);

    for (const mode of ["standard", "damnation"]) {
        it(`resolves every linkable ${mode} unique exactly by its index`, () => {
            const indexes = new Set(loadDropCalcModel(mode).uniqueItems.map((r) => String(r.index ?? "").trim().toLowerCase()));
            const linkable = readUniquesJson(mode).filter((u) => shown(u) && !u.hellforged);
            expect(linkable.length).toBeGreaterThan(500);
            const missing = linkable.filter((u) => !indexes.has(String(u.index ?? "").trim().toLowerCase()));
            expect(missing.map((u) => `${u.displayName} [${u.index}]`)).toEqual([]);
        });
    }
});
