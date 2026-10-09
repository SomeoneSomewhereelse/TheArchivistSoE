import {describe, it, expect} from "vitest";
import {filterOptions} from "./searchableSelectFilter.js";

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
});
