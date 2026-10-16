import {describe, expect, it} from "vitest";
import {chargesAt, checkEntries, describe as describeEntries, displayPieces, entryKey, expandMods, fill, rangeText, skillLevelAt, socketCap, sumEnds, sumEntries} from "./statEngine.js";
import {ENGINE_TEST_BASES as B, realStatData} from "./statFixtures.js";

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
        // A stub whose first slot (func 17) takes the param, so the reused value differs from the roll.
        const stub = {...dict, properties: new Map(dict.properties).set("stub", [
            {func: 17, stat: "strength", set: 0, val: 0}, {func: 3, stat: "dexterity", set: 0, val: 0}, {func: 8, stat: "vitality", set: 0, val: 0}])};
        expect(expandMods([mod("stub", 1, 2, "7")], stub, ILVL_99).entries.map((e) => [e.stat, e.min, e.max])).toEqual([
            ["strength", 7, 7], ["dexterity", 7, 7], ["vitality", 7, 7]]);
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

describe("text helpers", () => {
    it("rangeText prints single values, ranges, signs, negatives (smaller magnitude first), brackets and labels", () => {
        expect(rangeText({min: 5, max: 5}, {plus: "signed"})).toBe("+5");
        expect(rangeText({min: 0, max: 0}, {plus: "signed"})).toBe("0");
        expect(rangeText({min: 0, max: 0}, {plus: "zero"})).toBe("+0");
        expect(rangeText({min: 3, max: 6}, {plus: "signed"})).toBe("+3-6");
        expect(rangeText({min: -4, max: -2})).toBe("-2 to -4");
        expect(rangeText({min: 20, max: 30}, {bracket: true})).toBe("[20-30]");
        expect(rangeText({min: 1, max: 1}, {bracket: true})).toBe("1");
        expect(rangeText({min: 3, max: 6}, {plus: "signed", label: true})).toBe("+#");
        expect(rangeText({min: -4, max: -2}, {label: true})).toBe("-#");
    });

    it("fill substitutes printf arguments in order, and %% is a percent sign", () => {
        expect(fill("%d%% Chance to cast level %d %s on striking", ["10", "8", "Fire Bolt"])).toBe("10% Chance to cast level 8 Fire Bolt on striking");
        expect(fill("All Resistances +%d", ["3-6"])).toBe("All Resistances +3-6");
    });

    it("displayPieces strips colour codes and stacks a multi-line string bottom-up", () => {
        expect(displayPieces("ÿc0Magic Find:ÿc3 +5%")).toEqual(["Magic Find: +5%"]);
        expect(displayPieces("+25% Enhanced Damage\n")).toEqual(["+25% Enhanced Damage"]);
        expect(displayPieces("Bottom\nTop")).toEqual(["Top", "Bottom"]);
    });

    it("entryKey keys a stat, a stat per layer, and a stat per skill", () => {
        expect(entryKey({stat: "coldresist", layer: 0})).toBe("coldresist");
        expect(entryKey({stat: "item_addskill_tab", layer: 33})).toBe("item_addskill_tab/33");
        expect(entryKey({stat: "item_skillongethit", layer: (38 << 6) + 3, skill: 38})).toBe("item_skillongethit:38");
    });
});

const describeMods = (mods, ctx = ILVL_99) => describeEntries(expand(mods, ctx).entries, dict);
const text = (mods, ctx) => describeMods(mods, ctx).flatMap((l) => l.pieces);

describe("describe: the in-game results (character level 60, ilvl 99)", () => {
    it("prints poison as (v * frames + 128) >> 8 over frames / 25 seconds, every source summed", () => {
        expect(text([mod("dmg-pois", 31, 31, "50")])).toEqual(["+6 poison damage over 2 seconds"]); // Septic p555
        expect(text([mod("dmg-pois", 24, 24, "75")])).toEqual(["+7 poison damage over 3 seconds"]); // of Blight s234
        expect(text([mod("dmg-pois", 31, 31, "50"), mod("dmg-pois", 24, 24, "75")])).toEqual(["+27 poison damage over 5 seconds"]);
    });

    it("prints charges full, by the item level", () => {
        expect(text([mod("charged", -30, -6, "54")])).toEqual(["Level 6 Teleport (52/52 Charges)"]); // staff, s532
        expect(text([mod("charged", -20, -3, "54")])).toEqual(["Level 3 Teleport (27/27 Charges)"]); // amulet, s533
    });

    it("prints repair from rep-dur's param", () => {
        expect(text([mod("rep-dur", null, null, "3")])).toEqual(["Repairs 1 durability in 33 seconds"]); // of Self-Repair s402
    });
});

describe("describe: values", () => {
    it("prints a range, a single value and a negative range in the game's wording", () => {
        expect(text([mod("res-cold", 11, 20)])).toEqual(["Cold Resist +11-20%"]);
        expect(text([mod("res-cold", 15, 15)])).toEqual(["Cold Resist +15%"]);
        expect(text([mod("map-play-ac%", -30, -20)])).toEqual(["Players have -20 to -30% Enhanced Defense"]);
        expect(text([mod("pierce-fire", 2, 4)])).toEqual(["-2 to -4% to Enemy Fire Resistance"]); // descfunc 20 negates
    });

    it("brackets the ranges of a line that prints several values", () => {
        expect(text([mod("cold-min", 20, 30), mod("cold-max", 64, 101), mod("cold-len", 25, 25)])).toEqual(["Adds [20-30]-[64-101] cold damage"]);
        expect(text([mod("ltng-min", 1, 1), mod("ltng-max", 49, 120)])).toEqual(["Adds 1-[49-120] lightning damage"]);
        expect(text([mod("charged", -30, -6, "54")], {ilvl: {min: 24, max: 99}})).toEqual(["Level [1-6] Teleport ([33-52]/[33-52] Charges)"]);
    });

    it("prints per-level stats over character levels 1-99, then the rate per level", () => {
        expect(text([mod("mana/lvl", null, null, "6")])).toEqual(["+0-74 to Mana (Based on Character Level), 0.75 per level"]); // eighths
        expect(text([mod("att/lvl", null, null, "12")])).toEqual(["+6-594 to Attack Rating (Based on Character Level), 6 per level"]); // halves
    });
});

describe("describe: pairs", () => {
    it("prints an elemental pair as one line: single when min >= max (the max), else a range", () => {
        expect(text([mod("dmg-cold", 1, 1, "25")])).toEqual(["+1 cold damage"]);
        expect(text([mod("fire-min", 28, 43), mod("fire-max", 53, 103)])).toEqual(["Adds [28-43]-[53-103] fire damage"]);
    });

    it("prints enhanced damage from min% and max%, its multi-line string as one line", () => {
        expect(text([mod("dmg%", 10, 20)])).toEqual(["+10-20% Enhanced Damage"]);
    });

    it("prints physical min and max damage as one line only when min is below max", () => {
        expect(text([mod("dmg-min", 1, 4)])).toEqual(["+1-4 to Minimum Damage"]);
        expect(text([mod("dmg-min", 1, 4), mod("dmg-max", 6, 9)])).toEqual(["Adds [1-4]-[6-9] damage"]);
    });
});

describe("describe: dgrp groups", () => {
    it("fold every member with one value into the group's line (func 19), else each member prints", () => {
        expect(text([mod("res-all", 3, 6)])).toEqual(["All Resistances +3-6"]);
        expect(text([mod("res-all", 3, 6), mod("res-cold", 5, 5)])).toEqual([
            "Cold Resist +8-11%", "Lightning Resist +3-6%", "Fire Resist +3-6%", "Poison Resist +3-6%"]);
    });

    it("use each group's func, value placement and strings (funcs 1, 4, 7, 8)", () => {
        expect(text(["str", "dex", "vit", "enr"].map((c) => mod(c, 5, 5)))).toEqual(["+5 to all Attributes"]);
        expect(text(["extra-fire", "extra-cold", "extra-ltng", "extra-pois"].map((c) => mod(c, 2, 2)))).toEqual(["+2% to All Elemental Skill Damage"]);
        expect(text([mod("map-play-mag-gold%", 20, 25)])).toEqual(["Magic and Gold Find: +20-25%"]);
        expect(text([mod("map-play-res-all", -15, -10)])).toEqual(["Players have -10 to -15% to All Resistances"]);
        expect(text([mod("map-mon-att-cast-speed", 40, 60)])).toEqual(["Monsters have +40-60% Increased Cast and Attack Speed"]);
    });

    it("print at the priority of the member with the lowest stat id, and name the group for the via tag", () => {
        // dgrp 5: map_mon_tohit (id 394, priority 115) prints, not map_mon_pierce (132); att% sits at 117.
        expect(text([mod("map-mon-att-pierce", 30, 50), mod("att%", 10, 20)])).toEqual([
            "10-20% Bonus to Attack Rating", "Monsters have +30-50% Attack Rating and Chance to Pierce"]);
        expect(describeMods([mod("res-all", 3, 6)])[0]).toMatchObject({key: "dgrp2", via: "All Resistances", label: "All Resistances +#",
            stats: ["fireresist", "lightresist", "coldresist", "poisonresist"]});
    });
});

describe("describe: descfuncs", () => {
    it("place the value by descval, with the sign and percent each func adds", () => {
        expect(text([mod("mag%", 5, 7)])).toEqual(["5-7% Better Chance of Getting Magic Items"]); // 2
        expect(text([mod("thorns", 3, 6)])).toEqual(["Attacker Takes Damage of 3-6"]); // 3
        expect(text([mod("knock", 1, 1)])).toEqual(["Knockback"]); // 3, descval 0
        expect(text([mod("map-mon-crush", 15, 25)])).toEqual(["Monsters have 15-25% Chance of Crushing Blow"]); // 7
        expect(text([mod("map-mon-ed%", 10, 15)])).toEqual(["Monsters have +10-15% Enhanced Physical Damage"]); // 8
        expect(text([mod("map-mon-red-dmg", 100, 200)])).toEqual(["Monsters take 100-200 Reduced Physical Damage"]); // 9
        expect(text([mod("map-mon-splash", 100, 1, "358")])).toEqual(["Monster's Melee Attacks Deal Splash Damage"]); // 9, descval 0
    });

    it("name class skills, skill tabs and chance-to-cast skills from CharStats and the skill tables", () => {
        expect(text([mod("sor", 1, 1)])).toEqual(["+1 to Sorceress Skill Levels"]); // 13
        expect(text([mod("skilltab", 1, 1, "12")])).toEqual(["+1 to Combat Skills (Barbarian Only)"]); // 14 (Expert's)
        expect(text([mod("skilltab", 1, 1, "13")])).toEqual(["+1 to Masteries (Barbarian Only)"]); // (Fanatic)
        expect(text([mod("skilltab", 1, 1, "9")])).toEqual(["+1 to Combat Skills (Paladin Only)"]); // the hash-probe winner
        expect(text([mod("hit-skill", 10, 8, "36")])).toEqual(["10% Chance to cast level 8 Fire Bolt on striking"]); // 15
        expect(text([mod("gethit-skill", 10, 3, "38")])).toEqual(["10% Chance to cast level 3 Charged Bolt when struck"]);
    });

    it("print indestructible, and sockets below every other line", () => {
        expect(text([mod("indestruct")])).toEqual(["Indestructible"]);
        expect(text([mod("sock", 1, 2), mod("res-cold", 11, 20)])).toEqual(["Cold Resist +11-20%", "Socketed (1-2)"]);
    });

    it("order lines by descpriority, highest first", () => {
        expect(text([mod("res-cold", 11, 20), mod("str", 1, 2)])).toEqual(["+1-2 to Strength", "Cold Resist +11-20%"]);
    });
});

describe("describe: keys and labels", () => {
    it("label each line with # for its values, and key it by stat, layer, skill, pair or group", () => {
        const one = (mods) => describeMods(mods).map((l) => [l.key, l.label]);
        expect(one([mod("res-cold", 11, 20)])).toEqual([["coldresist", "Cold Resist +#%"]]);
        expect(one([mod("skilltab", 1, 1, "13")])).toEqual([["item_addskill_tab/33", "+# to Masteries (Barbarian Only)"]]);
        expect(one([mod("dmg-pois", 31, 31, "50")])).toEqual([["poisondamage", "+# poison damage over # seconds"]]);
        expect(one([mod("charged", -30, -6, "54")])).toEqual([["item_charged_skill:54", "Level # Teleport (#/# Charges)"]]);
        // of Charged Shield s421-s423: three levels, one key.
        const keys = [3, 4, 5].map((level) => describeMods([mod("gethit-skill", 10, level, "38")])[0].key);
        expect(new Set(keys)).toEqual(new Set(["item_skillongethit:38"]));
    });
});

describe("checkEntries", () => {
    it("passes the real data's stats", () => {
        expect(() => checkEntries(expand([mod("res-all", 3, 6), mod("charged", -30, -6, "54"), mod("hit-skill", 10, 8, "36")]).entries, dict)).not.toThrow();
    });

    it("lists a descfunc the engine doesn't implement, a missing string and a skill with no name", () => {
        const odd = {
            ...dict,
            stats: new Map(dict.stats).set("coldresist", {...dict.stats.get("coldresist"), func: 99}),
            string: (key) => (key === "ModStr1j" ? null : dict.string(key)),
        };
        const problems = () => checkEntries(expandMods([mod("res-cold", 1, 1), mod("res-fire", 1, 1), mod("charged", 5, 1, "358")], odd, ILVL_99).entries, odd);
        expect(problems).toThrow(/stat coldresist uses descfunc 99/);
        expect(problems).toThrow(/string "ModStr1j"/);
        expect(problems).toThrow(/skill 358 \("proc_SplashDamage"\) has no name string/);
    });

    it("lists a dgrpfunc the engine doesn't implement, a missing CharStats class or tab, a missing hardcoded string and a non-level op", () => {
        const odd = {
            ...dict,
            stats: new Map(dict.stats)
                .set("fireresist", {...dict.stats.get("fireresist"), groupFunc: 99})
                .set("strength", {...dict.stats.get("strength"), op: 3}),
            classes: dict.classes.slice(0, 1),
            string: (key) => (key === "ModStre10b" ? null : dict.string(key)),
        };
        const problems = () => checkEntries(expandMods([mod("res-fire", 1, 1), mod("sor", 1, 1), mod("skilltab", 1, 1, "13"), mod("str", 1, 1)], odd, ILVL_99).entries, odd);
        expect(problems).toThrow(/dgrp 2 uses dgrpfunc 99/);
        expect(problems).toThrow(/CharStats\.txt has no class 1/);
        expect(problems).toThrow(/CharStats\.txt has no skill tab for layer 33/);
        expect(problems).toThrow(/string "ModStre10b" \(used by the stat engine\)/);
        expect(problems).toThrow(/stat strength scales by a stat other than the character level \(op 3\)/);
    });
});

const E = (stat, min, max, extra = {}) => ({stat, layer: 0, min, max, ...extra});
const shown = (list) => describeEntries(list, dict).map((l) => [l.pieces.join(" "), !!l.byRoll]);

describe("sumEntries", () => {
    it("adds min to min and max to max per stat and layer, uniting the sources", () => {
        const [sum] = sumEntries([E("coldresist", 5, 10, {src: new Set(["0:0"])}), E("coldresist", 1, 2, {src: new Set(["1:0"])})]);
        expect(sum).toMatchObject({stat: "coldresist", layer: 0, min: 6, max: 12});
        expect([...sum.src].sort()).toEqual(["0:0", "1:0"]);
        expect(sumEntries([E("coldresist", 5, 10), {...E("coldresist", 1, 1), layer: 3}])).toHaveLength(2);
    });

    it("sums byRoll entries apart: from the smallest single value to the sum of the maximums (Jagged + Sharp)", () => {
        const sums = sumEntries([
            E("item_mindamage_percent", 17, 20, {byRoll: true}), E("item_mindamage_percent", 17, 20, {byRoll: true}),
            E("item_mindamage_percent", 201, 300)]);
        expect(sums.map((e) => [e.min, e.max, !!e.byRoll])).toEqual([[17, 40, true], [201, 300, false]]);
    });

    it("leaves entries without sources without a src", () => {
        expect(sumEntries([E("strength", 1, 1), E("strength", 2, 2)])[0].src).toBeUndefined();
    });
});

describe("describe: sources and by-roll lines", () => {
    it("describes byRoll entries on their own tagged lines, beside a plain line of the same stat", () => {
        expect(shown([
            E("item_mindamage_percent", 201, 300), E("item_maxdamage_percent", 201, 300),
            E("item_mindamage_percent", 17, 20, {byRoll: true}), E("item_maxdamage_percent", 17, 20, {byRoll: true}),
            E("maxdamage", 1, 1, {byRoll: true}),
        ])).toEqual([["+201-300% Enhanced Damage", false], ["+17-20% Enhanced Damage", true], ["+1 to Maximum Damage", true]]);
    });

    it("folds a dgrp group only when its members share their sources; entries without sources fold as before", () => {
        const four = ["fireresist", "lightresist", "coldresist", "poisonresist"];
        expect(shown(four.map((s) => E(s, 5, 5, {src: new Set(["0:0"])})))).toEqual([["All Resistances +5", false]]);
        expect(shown(four.map((s, i) => E(s, 5, 5, {src: new Set([`${i}:0`])})))).toEqual([
            ["Cold Resist +5%", false], ["Lightning Resist +5%", false], ["Fire Resist +5%", false], ["Poison Resist +5%", false]]);
        expect(shown(four.map((s) => E(s, 5, 5)))).toEqual([["All Resistances +5", false]]);
    });
});

describe("describe: the deferred fixes", () => {
    const lines = (list) => describeEntries(list, dict).map((l) => [l.pieces.join(" "), l.label]);

    it("merges Enhanced Damage only when min% equals max%", () => {
        expect(lines([E("item_mindamage_percent", 10, 20), E("item_maxdamage_percent", 10, 30)])).toEqual([
            ["Enhanced Minimum Damage", "Enhanced Minimum Damage"], ["Enhanced Maximum Damage", "Enhanced Maximum Damage"]]);
    });

    it("prints a negative per-level value from the smaller magnitude", () => {
        expect(lines([E("item_hp_perlevel", -8, -8)])).toEqual([
            ["-1 to -99 to Life (Based on Character Level), -1 per level", "-# to Life (Based on Character Level), # per level"]]);
    });

    it("labels repair and negative Enhanced Damage in the form their value prints", () => {
        expect(lines([E("item_replenish_durability", 100, 100)])).toEqual([["Repairs 1 durability per second", "Repairs # durability per second"]]);
        expect(lines([E("item_replenish_durability", 3, 3)])).toEqual([["Repairs 1 durability in 33 seconds", "Repairs # durability in # seconds"]]);
        expect(lines([E("item_mindamage_percent", -20, -10), E("item_maxdamage_percent", -20, -10)])).toEqual([
            ["-10 to -20% Enhanced Damage", "-#% Enhanced Damage"]]);
    });
});

const on = (base, ilvl = 99) => ({ilvl: {min: ilvl, max: ilvl}, base});
const withRoll = (mods, ctx) => expand(mods, ctx).entries.map((e) => [e.stat, e.min, e.max, !!e.byRoll]);

describe("expandMods with a base", () => {
    const damage = [mod("dmg-min", 5, 5), mod("dmg-max", 10, 10)];

    it("funcs 5 and 6 write the pairs each kind of base carries", () => {
        const stats = (base) => entries(damage, on(base)).map((e) => e.stat);
        expect(stats(null)).toEqual(["mindamage", "maxdamage"]);
        expect(stats(B.oneHanded)).toEqual(["mindamage", "maxdamage"]);
        expect(stats(B.twoHanded)).toEqual(["secondary_mindamage", "secondary_maxdamage"]);
        expect(stats(B.oneOrTwo)).toEqual(["mindamage", "secondary_mindamage", "maxdamage", "secondary_maxdamage"]);
        expect(stats(B.throwable)).toEqual(["mindamage", "item_throw_mindamage", "maxdamage", "item_throw_maxdamage"]);
        expect(stats(B.nonWeapon)).toEqual(["mindamage", "secondary_mindamage", "item_throw_mindamage", "maxdamage", "secondary_maxdamage", "item_throw_maxdamage"]);
    });

    it("prints +min and +max as one line on every kind of base (V1: a Giant Axe shows 'Adds 5-10 damage')", () => {
        for (const base of Object.values(B)) expect(text(damage, on(base))).toEqual(["Adds 5-10 damage"]);
        expect(text([mod("dmg-min", 3, 3)], on(B.twoHanded))).toEqual(["+3 to Minimum Damage"]);
    });

    it("func 7 falls back to +1 maximum damage for rolls with trunc(txtMax * r / 100) <= 0", () => {
        // Jagged 10-20% on a Hand Axe (txt max 6): rolls 10-16 fall back, 17-20 give ED.
        expect(withRoll([mod("dmg%", 10, 20)], on(B.oneHanded))).toEqual([
            ["item_mindamage_percent", 17, 20, true], ["item_maxdamage_percent", 17, 20, true], ["maxdamage", 1, 1, true]]);
        // Cinnabar 5-10% always falls back; Cruel 201-300% never does; armor and no base keep plain ED.
        expect(withRoll([mod("dmg%", 5, 10)], on(B.oneHanded))).toEqual([["maxdamage", 1, 1, false]]);
        expect(withRoll([mod("dmg%", 201, 300)], on(B.oneHanded))).toEqual([
            ["item_mindamage_percent", 201, 300, false], ["item_maxdamage_percent", 201, 300, false]]);
        expect(withRoll([mod("dmg%", 10, 20)], on(B.nonWeapon))).toEqual([
            ["item_mindamage_percent", 10, 20, false], ["item_maxdamage_percent", 10, 20, false]]);
        // A throwing weapon takes the +1 on both of its max stats (func 6's path).
        expect(withRoll([mod("dmg%", 10, 20)], on(B.throwable))).toEqual([
            ["item_mindamage_percent", 15, 20, true], ["item_maxdamage_percent", 15, 20, true],
            ["maxdamage", 1, 1, true], ["item_throw_maxdamage", 1, 1, true]]);
    });

    it("describes Jagged on a Hand Axe as two by-roll lines, and Jagged + Sharp as one range each", () => {
        expect(shown(expand([mod("dmg%", 10, 20)], on(B.oneHanded)).entries)).toEqual([
            ["+17-20% Enhanced Damage", true], ["+1 to Maximum Damage", true]]);
        expect(shown(expand([mod("dmg%", 10, 20), mod("dmg%", 10, 20)], on(B.oneHanded)).entries)).toEqual([
            ["+17-40% Enhanced Damage", true], ["+1-2 to Maximum Damage", true]]);
    });

    it("func 14 clamps sockets to the base's cap at the item level; a cap of 0 drops the entry", () => {
        expect(socketCap(B.oneHanded, 99)).toBe(2); // min(1x3 cells, 2 gem sockets, 6)
        expect(entries([mod("sock", 1, 2)], on(B.oneHanded))).toEqual([{stat: "item_numsockets", layer: 0, min: 1, max: 2}]);
        expect(entries([mod("sock", null, null, "4")], on(B.oneHanded))).toEqual([{stat: "item_numsockets", layer: 0, min: 2, max: 2}]);
        const banded = {...B.nonWeapon, cells: 6, gemsockets: 6, maxSock: [1, 2, 3]};
        expect([25, 26, 40, 41].map((ilvl) => entries([mod("sock", null, null, "4")], on(banded, ilvl))[0].max)).toEqual([1, 2, 2, 3]);
        expect(entries([mod("sock", 1, 2)], on({...B.nonWeapon, gemsockets: 0}))).toEqual([]);
        expect(entries([mod("sock", null, null, "4")])).toEqual([{stat: "item_numsockets", layer: 0, min: 4, max: 4}]); // no base: as before
    });
});

describe("sumEnds", () => {
    it("totals every mod at its lowest roll, then its highest, resolving the func-7 fallback per end", () => {
        const {low, high} = sumEnds([mod("dmg%", 10, 20)], dict, on(B.oneHanded));
        expect([...low]).toEqual([["maxdamage", 1]]);
        expect([...high]).toEqual([["item_mindamage_percent", 20], ["item_maxdamage_percent", 20]]);
    });

    it("adds every source of a stat and skips mods whose funcs don't take the roll (charges)", () => {
        const {low, high} = sumEnds([mod("ac%", 81, 100), mod("ease", -20, -20), mod("ac", 5, 10), mod("ac", 1, 2), mod("charged", -30, -6, "54")], dict, on(B.nonWeapon));
        expect(Object.fromEntries(low)).toEqual({item_armor_percent: 81, item_req_percent: -20, armorclass: 6});
        expect(Object.fromEntries(high)).toEqual({item_armor_percent: 100, item_req_percent: -20, armorclass: 12});
    });
});
