import {describe, expect, it} from "vitest";
import {controlNotice, decodeBuildQuery, encodeBuildQuery, linkNotice, OLD_LINK_NOTICE, parseBuildQuery} from "./itemBuilderHash.js";
import {EMPTY_BUILD} from "./itemBuilderRules.js";
import {tinyModel} from "./itemBuilderFixtures.js";

const model = tinyModel(); // linkVersion 3
const build = (fields) => ({...EMPTY_BUILD, picks: [], ...fields});

describe("encodeBuildQuery", () => {
    it("writes v and the base always, and leaves defaults out", () => {
        expect(encodeBuildQuery(model, build({}))).toBe("");
        expect(encodeBuildQuery(model, build({base: "axe", quality: "magic"}))).toBe("v=3&b=axe");
        expect(encodeBuildQuery(model, build({base: "axe", quality: "rare", ilvl: 85, picks: ["p0", "s0"]})))
            .toBe("v=3&b=axe&q=r&il=85&a=p0-s0");
    });

    it("writes clvl and ingredient ilvl only for crafted items, and ilvl only otherwise", () => {
        expect(encodeBuildQuery(model, build({base: "axe", quality: "crafted", ilvl: 50, clvl: 80})))
            .toBe("v=3&b=axe&q=c&cl=80");
        expect(encodeBuildQuery(model, build({base: "axe", quality: "magic", ilvl: 50, clvl: 80})))
            .toBe("v=3&b=axe&il=50");
    });
});

describe("parseBuildQuery", () => {
    it("takes the first of repeated parameters and marks malformed values", () => {
        expect(parseBuildQuery("v=3&b=axe&b=orb&il=50&il=60&q=x&cl=abc&a=p0--s1")).toEqual({
            version: 3, base: "axe", quality: "invalid", ilvl: 50, clvl: Number.NaN, gilvl: undefined, picks: ["p0", "s1"],
        });
    });

    it("reads a missing or malformed version as null", () => {
        expect(parseBuildQuery("b=axe").version).toBeNull();
        expect(parseBuildQuery("v=x&b=axe").version).toBeNull();
    });
});

describe("decodeBuildQuery", () => {
    it("opens an empty query, or v alone, as a blank form without a notice", () => {
        expect(decodeBuildQuery(model, "")).toEqual({build: EMPTY_BUILD, notice: null});
        expect(decodeBuildQuery(model, "v=3")).toMatchObject({build: {base: null}, notice: null});
    });

    it("refuses an old or missing version as a whole", () => {
        expect(decodeBuildQuery(model, "v=2&b=axe&a=p0")).toEqual({build: EMPTY_BUILD, notice: OLD_LINK_NOTICE});
        expect(decodeBuildQuery(model, "b=axe")).toEqual({build: EMPTY_BUILD, notice: OLD_LINK_NOTICE});
    });

    it("round-trips every encoded build", () => {
        for (const b of [
            build({base: "axe", quality: "rare", ilvl: 85, picks: ["p0", "s0"]}),
            build({base: "axe", quality: "crafted", clvl: 70, gilvl: 40, picks: ["p0", "p3", "p4", "s0"]}),
            build({base: "jew", quality: "rare", picks: ["p0", "p7", "s0", "s2"]}),
            build({base: "cm3", quality: "magic", ilvl: 20, picks: ["s0"]}),
        ]) {
            expect(decodeBuildQuery(model, encodeBuildQuery(model, b))).toEqual({build: b, notice: null});
        }
    });

    it("collapses a repeated affix silently", () => {
        const {build: b, notice} = decodeBuildQuery(model, "v=3&b=axe&a=p0-p0");
        expect(b.picks).toEqual(["p0"]);
        expect(notice).toBeNull();
    });

    it("drops unknown or conflicting affixes, URL order first, with a notice", () => {
        expect(decodeBuildQuery(model, "v=3&b=axe&a=p0-p99")).toMatchObject({
            build: {picks: ["p0"]}, notice: "1 affix from the link no longer fits and was removed.",
        });
        expect(decodeBuildQuery(model, "v=3&b=axe&a=p7-p0-s1")).toMatchObject({
            build: {picks: ["p7", "s1"]}, notice: "1 affix from the link no longer fits and was removed.",
        });
    });

    it("resets invalid settings with a notice, and combines both notices", () => {
        expect(decodeBuildQuery(model, "v=3&b=cm3&q=r")).toMatchObject({
            build: {quality: "magic"}, notice: "Some settings in the link were invalid and were reset.",
        });
        expect(decodeBuildQuery(model, "v=3&b=nope&a=p0-s0").notice)
            .toBe("2 affixes from the link no longer fit and were removed. Some settings in the link were invalid and were reset.");
    });

    it("produces queries that decode to themselves (so App's cleanup converges)", () => {
        for (const q of ["v=3", "v=3&b=axe&a=p0-p0", "v=3&b=axe&il=99&q=m", "v=3&b=nope", "v=3&b=axe&a=p7-p0-s1", "v=3&b=cm3&q=r&il=0"]) {
            const clean = encodeBuildQuery(model, decodeBuildQuery(model, q).build);
            expect(decodeBuildQuery(model, clean).notice, q).toBeNull();
            expect(encodeBuildQuery(model, decodeBuildQuery(model, clean).build), q).toBe(clean);
        }
    });
});

describe("notices", () => {
    it("say nothing when nothing changed", () => {
        expect(linkNotice(0, 0)).toBeNull();
        expect(controlNotice(0)).toBeNull();
    });

    it("count removed affixes after a control change", () => {
        expect(controlNotice(1)).toBe("1 affix no longer fits and was removed.");
        expect(controlNotice(3)).toBe("3 affixes no longer fit and were removed.");
    });
});
