import {describe, expect, it} from "vitest";
import {DEFAULT_DROP_SORT, nextDropSort, sortDropRows} from "./dropCalcSort.js";

const row = (monsterName, treasureClass, levelName, chance) => ({monsterName, treasureClass, levelName, chance});
const ROWS = [
    row("Bone", "TC B", "Act 2", 0.1),
    row("andariel", "TC A", "Act 10", 0.3),
    row("Cow", "TC C", "Act 1", 0.2),
    row("Dup", "TC D", "Act 1", 0.2),
];
const names = (rows) => rows.map((r) => r.monsterName);

describe("sortDropRows", () => {
    it("the default sort (chance, highest first) keeps the engine's order, which is already sorted that way", () => {
        const engine = [row("A", "x", "l", 0.3), row("B", "x", "l", 0.2), row("C", "x", "l", 0.2), row("D", "x", "l", 0.1)];
        expect(sortDropRows(engine, DEFAULT_DROP_SORT)).toEqual(engine);
    });

    it("sorts text columns ignoring case, with numbers in order (Act 2 before Act 10)", () => {
        expect(names(sortDropRows(ROWS, {key: "monster", dir: "asc"}))).toEqual(["andariel", "Bone", "Cow", "Dup"]);
        expect(names(sortDropRows(ROWS, {key: "level", dir: "asc"}))).toEqual(["Cow", "Dup", "Bone", "andariel"]);
        expect(names(sortDropRows(ROWS, {key: "treasureClass", dir: "desc"}))).toEqual(["Dup", "Cow", "Bone", "andariel"]);
    });

    it("sorts chance ascending and keeps tied rows in their incoming order in both directions", () => {
        expect(names(sortDropRows(ROWS, {key: "chance", dir: "asc"}))).toEqual(["Bone", "Cow", "Dup", "andariel"]);
        expect(names(sortDropRows(ROWS, {key: "chance", dir: "desc"}))).toEqual(["andariel", "Cow", "Dup", "Bone"]);
    });

    it("returns a new array and leaves its input alone", () => {
        const copy = [...ROWS];
        const out = sortDropRows(ROWS, {key: "monster", dir: "asc"});
        expect(out).not.toBe(ROWS);
        expect(ROWS).toEqual(copy);
    });
});

describe("nextDropSort", () => {
    it("starts a new text column ascending and a new chance column descending", () => {
        expect(nextDropSort(DEFAULT_DROP_SORT, "monster")).toEqual({key: "monster", dir: "asc"});
        expect(nextDropSort({key: "monster", dir: "asc"}, "chance")).toEqual({key: "chance", dir: "desc"});
    });

    it("flips the direction when the same column is clicked again", () => {
        expect(nextDropSort({key: "monster", dir: "asc"}, "monster")).toEqual({key: "monster", dir: "desc"});
        expect(nextDropSort(DEFAULT_DROP_SORT, "chance")).toEqual({key: "chance", dir: "asc"});
    });
});
