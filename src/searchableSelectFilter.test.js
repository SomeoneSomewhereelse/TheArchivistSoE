import {describe, it, expect} from "vitest";
import {filterOptions, selectableIndexes, initialActive, nextActive} from "./searchableSelectFilter.js";

const flat = [
    {value: "a", label: "Apple"},
    {value: "b", label: "Banana"},
    {value: "c", label: "Cherry"},
];
const grouped = [
    {value: "", label: "Choose a base item…"},
    {group: "Bows"},
    {value: "sbw", label: "Short Bow · qlvl 1"},
    {group: "Crossbows"},
    {value: "lxb", label: "Light Crossbow · qlvl 5"},
    {value: "arb", label: "Arbalest · qlvl 20"},
    {value: "bal", label: "Ballista · qlvl 40"},
    {group: "Axes"},
    {value: "axe", label: "Hand Axe · qlvl 1"},
    {value: "bax", label: "Bow Axe · qlvl 3"},
];
const labels = (list) => list.map((o) => o.group ?? o.label);

describe("filterOptions", () => {
    it("returns every option for an empty or blank query", () => {
        expect(filterOptions(grouped, "")).toBe(grouped);
        expect(filterOptions(flat, "   ")).toBe(flat);
    });

    it("filters a list without groups by label, case-insensitively", () => {
        expect(filterOptions(flat, " AN ")).toEqual([flat[1]]);
        expect(filterOptions(flat, "zzz")).toEqual([]);
    });

    it("lists every member under a group whose label matches", () => {
        expect(labels(filterOptions(grouped, "crossbow"))).toEqual([
            "Crossbows", "Light Crossbow · qlvl 5", "Arbalest · qlvl 20", "Ballista · qlvl 40",
        ]);
    });

    it("lists a member whose own label matches under a non-matching group", () => {
        expect(labels(filterOptions(grouped, "hand"))).toEqual(["Axes", "Hand Axe · qlvl 1"]);
    });

    it("typing bow lists whole matching groups plus name matches elsewhere", () => {
        expect(labels(filterOptions(grouped, "bow"))).toEqual([
            "Bows", "Short Bow · qlvl 1",
            "Crossbows", "Light Crossbow · qlvl 5", "Arbalest · qlvl 20", "Ballista · qlvl 40",
            "Axes", "Bow Axe · qlvl 3",
        ]);
    });

    it("hides a heading with nothing under it", () => {
        const out = filterOptions(grouped, "arbalest");
        expect(labels(out)).toEqual(["Crossbows", "Arbalest · qlvl 20"]);
    });

    it("treats options before any heading by their own label", () => {
        expect(labels(filterOptions(grouped, "choose"))).toEqual(["Choose a base item…"]);
    });

    it("returns nothing when nothing matches", () => {
        expect(filterOptions(grouped, "zzz")).toEqual([]);
    });

    it("never lists a heading with no options under it", () => {
        const opts = [{group: "Empty"}, {group: "Bows"}, {value: "sbw", label: "Short Bow"}, {group: "Bowls"}];
        expect(labels(filterOptions(opts, "bow"))).toEqual(["Bows", "Short Bow"]);
        expect(filterOptions([{group: "Empty"}], "empty")).toEqual([]);
    });

    it("skips an option with no label instead of throwing", () => {
        const opts = [{value: "x"}, {value: "y", label: "Yes"}];
        expect(filterOptions(opts, "y")).toEqual([opts[1]]);
    });
});

describe("keyboard navigation helpers", () => {
    const list = [
        {value: "", label: "Choose"},
        {group: "Bows"},
        {value: "sbw", label: "Short Bow"},
        {group: "Axes"},
        {value: "axe", label: "Hand Axe"},
        {value: "bax", label: "Bow Axe"},
    ];
    // selectable indexes: 0, 2, 4, 5

    it("lists only selectable indexes", () => {
        expect(selectableIndexes(list)).toEqual([0, 2, 4, 5]);
        expect(selectableIndexes([])).toEqual([]);
        expect(selectableIndexes([{group: "A"}])).toEqual([]);
    });

    it("initial active is the selected option when listed, else the first selectable", () => {
        expect(initialActive(list, "axe")).toBe(4);
        expect(initialActive(list, "")).toBe(0);
        expect(initialActive(list, "zzz")).toBe(0);
        expect(initialActive(list.slice(1), "zzz")).toBe(1);
        expect(initialActive(list, 5)).toBe(0);
        expect(initialActive([], "a")).toBe(-1);
        expect(initialActive([{group: "A"}], "a")).toBe(-1);
    });

    it("ArrowDown/ArrowUp skip headings", () => {
        expect(nextActive(list, 0, "ArrowDown")).toBe(2);
        expect(nextActive(list, 2, "ArrowDown")).toBe(4);
        expect(nextActive(list, 4, "ArrowUp")).toBe(2);
        expect(nextActive(list, 2, "ArrowUp")).toBe(0);
    });

    it("wraps both ways", () => {
        expect(nextActive(list, 5, "ArrowDown")).toBe(0);
        expect(nextActive(list, 0, "ArrowUp")).toBe(5);
    });

    it("Home and End go to the first and last selectable", () => {
        expect(nextActive(list, 4, "Home")).toBe(0);
        expect(nextActive(list, 2, "End")).toBe(5);
        expect(nextActive(list.slice(1), 2, "Home")).toBe(1);
    });

    it("an empty list has no active option", () => {
        for (const k of ["ArrowDown", "ArrowUp", "Home", "End"]) expect(nextActive([], -1, k)).toBe(-1);
        expect(nextActive([{group: "A"}], -1, "ArrowDown")).toBe(-1);
    });

    it("from no or a stale active index, ArrowDown picks the first and ArrowUp the last", () => {
        expect(nextActive(list, -1, "ArrowDown")).toBe(0);
        expect(nextActive(list, -1, "ArrowUp")).toBe(5);
        expect(nextActive(list, 1, "ArrowDown")).toBe(2);
        expect(nextActive(list, 1, "ArrowUp")).toBe(0);
    });

    it("an unrelated key leaves the active option alone", () => {
        expect(nextActive(list, 4, "a")).toBe(4);
    });

    it("after filtering, the active option resets to the first selectable listed option", () => {
        const filtered = filterOptions(grouped, "bow");
        expect(filtered[nextActive(filtered, -1, "Home")].label).toBe("Short Bow · qlvl 1");
        expect(nextActive(filterOptions(grouped, "zzzz"), -1, "Home")).toBe(-1);
    });
});
