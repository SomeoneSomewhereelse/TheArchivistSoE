import {describe, expect, it} from "vitest";
import {chargesAt, expandMods, skillLevelAt} from "./statEngine.js";
import {realStatData} from "./statFixtures.js";

const dict = realStatData();
const mod = (code, min = null, max = null, param = "") => ({code, param, min, max});
const ILVL_99 = {ilvl: {min: 99, max: 99}};
const expand = (mods, ctx = ILVL_99) => expandMods(mods, dict, ctx);
const entries = (mods, ctx) => expand(mods, ctx).entries.map(({stat, layer, min, max}) => ({stat, layer, min, max}));

describe("skillLevelAt and chargesAt", () => {
    const teleport = {reqlevel: 18, maxlvl: 20};

    it("spread a negative max over the item levels from the skill's reqlevel to 99", () => {
        expect(skillLevelAt(teleport, -6, 99)).toBe(6); // ⌊81 / ⌊81/6⌋⌋
        expect(skillLevelAt(teleport, -3, 99)).toBe(3); // ⌊81 / 27⌋
        expect(skillLevelAt(teleport, -6, 18)).toBe(1); // at least 1
    });

    it("add a level per 4 item levels for max 0, up to maxlvl (20 when unset), and keep a positive max", () => {
        expect(skillLevelAt(teleport, 0, 30)).toBe(4);
        expect(skillLevelAt(teleport, 0, 99)).toBe(20);
        expect(skillLevelAt({reqlevel: 1, maxlvl: 0}, 0, 99)).toBe(20);
        expect(skillLevelAt(teleport, 7, 99)).toBe(7);
    });

    it("scale negative charges by the level, clamp to 1-255, and give 5 for 0", () => {
        expect(chargesAt(-30, 6)).toBe(52); // ⌊6·30/8⌋ + 30
        expect(chargesAt(-20, 3)).toBe(27);
        expect(chargesAt(0, 9)).toBe(5);
        expect(chargesAt(300, 1)).toBe(255);
    });
});

describe("expandMods", () => {
    it("funcs 1 and 2 roll min..max into one stat, swapping a reversed range", () => {
        expect(entries([mod("res-cold", 11, 20)])).toEqual([{stat: "coldresist", layer: 0, min: 11, max: 20}]);
        expect(entries([mod("res-cold", 20, 11)])).toEqual([{stat: "coldresist", layer: 0, min: 11, max: 20}]);
        expect(entries([mod("ac%", 10, 20)])).toEqual([{stat: "item_armor_percent", layer: 0, min: 10, max: 20}]);
    });

    it("func 3 and func 8 reuse the previous slot's value", () => {
        expect(entries([mod("res-all", 3, 6)]).map((e) => [e.stat, e.min, e.max])).toEqual([
            ["fireresist", 3, 6], ["lightresist", 3, 6], ["coldresist", 3, 6], ["poisonresist", 3, 6]]);
        expect(entries([mod("map-mon-att-cast-speed", 40, 60)]).map((e) => [e.stat, e.min, e.max])).toEqual([
            ["map_mon_fasterattackrate", 40, 60], ["map_mon_fastercastrate", 40, 60]]);
    });

    it("funcs 5, 6 and 7 write the damage stats their rows leave blank", () => {
        expect(entries([mod("dmg-min", 1, 4), mod("dmg-max", 6, 9)]).map((e) => e.stat)).toEqual(["mindamage", "maxdamage"]);
        expect(entries([mod("dmg%", 10, 20)])).toEqual([
            {stat: "item_mindamage_percent", layer: 0, min: 10, max: 20}, {stat: "item_maxdamage_percent", layer: 0, min: 10, max: 20}]);
    });

    it("func 10 stores a skill tab param as class * 8 + tab, func 21 takes the layer from val", () => {
        expect(entries([mod("skilltab", 1, 1, "13")])).toEqual([{stat: "item_addskill_tab", layer: 33, min: 1, max: 1}]);
        expect(entries([mod("sor", 1, 1)])).toEqual([{stat: "item_addclassskills", layer: 1, min: 1, max: 1}]);
    });

    it("func 11 takes the chance from min (5 when unset), the level from max and the skill from the param", () => {
        const [e] = expand([mod("hit-skill", 10, 8, "36")]).entries;
        expect(e).toEqual({stat: "item_skillonhit", layer: (36 << 6) + 8, min: 10, max: 10, skill: 36, level: {min: 8, max: 8}});
        expect(expand([mod("gethit-skill", 0, 3, "38")]).entries[0].min).toBe(5);
    });

    it("func 14 takes the socket count from the roll, or from the param when there is none", () => {
        expect(entries([mod("sock", 1, 2)])).toEqual([{stat: "item_numsockets", layer: 0, min: 1, max: 2}]);
        expect(entries([mod("sock", null, null, "3")])).toEqual([{stat: "item_numsockets", layer: 0, min: 3, max: 3}]);
    });

    it("funcs 15, 16 and 17 take min, max and param", () => {
        expect(entries([mod("dmg-pois", 31, 31, "50")]).map((e) => [e.stat, e.min])).toEqual([
            ["poisonmindam", 31], ["poisonmaxdam", 31], ["poisonlength", 50]]);
        expect(entries([mod("hp/lvl", null, null, "6")])).toEqual([{stat: "item_hp_perlevel", layer: 0, min: 6, max: 6}]);
    });

    it("func 19 gives charges by the item level (in-game: Teleportation on a staff and an amulet at ilvl 99)", () => {
        expect(expand([mod("charged", -30, -6, "54")]).entries[0]).toMatchObject({stat: "item_charged_skill", min: 52, max: 52, skill: 54, level: {min: 6, max: 6}});
        expect(expand([mod("charged", -20, -3, "54")]).entries[0]).toMatchObject({min: 27, max: 27, level: {min: 3, max: 3}});
        expect(expand([mod("charged", -30, -6, "54")], {ilvl: {min: 24, max: 99}}).entries[0]).toMatchObject({min: 33, max: 52, level: {min: 1, max: 6}});
        expect(() => expand([mod("charged", -30, -6, "54")], {})).toThrow(/no ilvl/);
    });

    it("func 20 sets indestructible", () => {
        expect(entries([mod("indestruct")])).toEqual([{stat: "item_indesctructible", layer: 0, min: 1, max: 1}]);
    });

    it("matches codes case-insensitively, reports unknown codes, and drops zero values", () => {
        expect(expand([mod("Deep-Wounds", 8, 12)]).entries[0].stat).toBe("deep_wounds");
        expect(expand([mod("map-mon-droparmor", 1, 1)])).toEqual({entries: [], unknown: ["map-mon-droparmor"]});
        expect(entries([mod("res-cold", 0, 0)])).toEqual([]);
    });

    it("throws on a property func the engine doesn't implement", () => {
        const odd = {...dict, properties: new Map(dict.properties).set("odd", [{func: 99, stat: "strength", set: 0, val: 0}])};
        expect(() => expandMods([mod("odd", 1, 1)], odd)).toThrow(/property "odd" uses func 99/);
    });
});
