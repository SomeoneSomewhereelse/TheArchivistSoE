import {describe, expect, it} from "vitest";
import {buildTooltip, checkTrimmedStatData, engineBase, expandPicks} from "./itemTooltip.js";
import {buildBases, buildTypes} from "./itemBuilderData.js";
import {allowedQualities, canRoll, EMPTY_BUILD, rollContext} from "./itemBuilderRules.js";
import {pct} from "./baseLines.js";
import {statDataFromJson, trimStatData} from "./statData.js";
import {readItemBuilderInputs, realItemBuilderModel} from "./itemBuilderFixtures.js";
import {ENGINE_TEST_BASES} from "./statFixtures.js";

const model = realItemBuilderModel();
const base = (code) => model.baseByCode.get(code);
const A = (key) => model.affixByKey.get(key);

describe("engineBase", () => {
    it("gives the engine each base's damage, throwability and socket cap inputs", () => {
        expect(engineBase(model, base("hax"))).toEqual(ENGINE_TEST_BASES.oneHanded);
        expect(engineBase(model, base("gix"))).toEqual(ENGINE_TEST_BASES.twoHanded);
        expect(engineBase(model, base("bsw"))).toEqual(ENGINE_TEST_BASES.oneOrTwo);
        expect(engineBase(model, base("tax"))).toEqual(ENGINE_TEST_BASES.throwable);
        expect(engineBase(model, base("uit"))).toEqual(ENGINE_TEST_BASES.nonWeapon);
        expect(engineBase(model, base("hax"))).toBe(engineBase(model, base("hax"))); // built once per base
    });
});

describe("expandPicks", () => {
    it("tags each entry with its pick and mod (Sharp has two mods)", () => {
        const ctx = {ilvl: {min: 99, max: 99}, base: null};
        const tags = expandPicks([A("p352"), A("p257")], model.dict, ctx).map((e) => [e.stat, [...e.src]]);
        expect(tags).toEqual([
            ["coldresist", ["0:0"]], ["tohit", ["1:0"]], ["item_mindamage_percent", ["1:1"]], ["item_maxdamage_percent", ["1:1"]]]);
    });
});

describe("checkTrimmedStatData", () => {
    const inputs = readItemBuilderInputs();
    const types = buildTypes(inputs.texts.ItemTypes);
    const bases = buildBases(inputs.texts, inputs.weaponsJson, inputs.armorsJson, types);
    const lapis = inputs.affixes.filter((a) => a.key === "p352");
    const trimmedWith = (edit) => {
        const json = JSON.parse(JSON.stringify(trimStatData(inputs.dict, lapis.flatMap((a) => a.mods))));
        edit(json);
        return statDataFromJson(json);
    };

    it("passes the real trimmed dictionary", () => {
        expect(() => checkTrimmedStatData({full: inputs.dict, trimmed: model.dict, affixes: inputs.affixes, types, bases})).not.toThrow();
    });

    it("names an affix the trimmed dictionary can't describe, or describes differently", () => {
        const noStat = trimmedWith((json) => {
            json.stats = json.stats.filter((s) => s.name !== "coldresist");
        });
        expect(() => checkTrimmedStatData({full: inputs.dict, trimmed: noStat, affixes: lapis, types, bases}))
            .toThrow(/can't describe p352 \(Lapis\) at ilvl 1, no base: stat "coldresist" is not in ItemStatCost\.txt/);
        const renamed = trimmedWith((json) => {
            json.strings.ModStr1k = "Cold Resistance";
        });
        expect(() => checkTrimmedStatData({full: inputs.dict, trimmed: renamed, affixes: lapis, types, bases}))
            .toThrow(/describes p352 \(Lapis\) at ilvl 1, no base differently/);
    });
});

const tip = (fields) => {
    const build = {...EMPTY_BUILD, quality: "magic", ...fields};
    return buildTooltip(model, rollContext(model, build), build);
};
// Each line as the game prints it: "label value", or the text with its "(by roll)" tag.
const show = (lines) => lines.map((l) => (l.kind === "base" ? [l.label, l.value].filter((x) => x !== undefined).join(" ") : `${l.text}${l.byRoll ? " (by roll)" : ""}`));
const line = (lines, label) => lines.find((l) => l.label === label);

describe("buildTooltip: the worked examples", () => {
    it("ethereal magic Monarch: Holy … of Ease", () => {
        expect(show(tip({base: "uit", eth: true, picks: ["p149", "s370"]}))).toEqual([
            "Holy Monarch of Ease", "Defense: 336-372", "Chance to Block: 22% (Pal: 52%, Ama/Asn/Bar: 47%, Dru/Nec/Sor: 42%)",
            "Durability: 86 of 86", "Required Strength: 115", "Required Level: 54",
            "+81-100% Enhanced Defense", "Requirements -20%", "Ethereal (Cannot Be Repaired)"]);
    });

    it("ethereal magic Berserker Axe: Cruel … of Evisceration", () => {
        expect(show(tip({base: "7wa", eth: true, picks: ["p194", "s203"]}))).toEqual([
            "Cruel Berserker Axe of Evisceration", "One-Hand Damage: 111-148 to 375-507", "Durability: 78 of 78",
            "Required Dexterity: 49", "Required Strength: 128", "Required Level: 64",
            "+201-300% Enhanced Damage", "+41-63 to Maximum Damage", "Ethereal (Cannot Be Repaired)"]);
    });

    it("Jagged Hand Axe: exact damage, two by-roll modifiers, no Required Level at 1", () => {
        expect(show(tip({base: "hax", picks: ["p186"]}))).toEqual([
            "Jagged Hand Axe", "One-Hand Damage: 3 to 7", "Durability: 56 of 56",
            "+17-20% Enhanced Damage (by roll)", "+1 to Maximum Damage (by roll)"]);
    });

    it("magic Aegis of Deflecting: block at the cap for every class, blue", () => {
        const block = line(tip({base: "uow", picks: ["s173"]}), "Chance to Block:");
        expect(block).toMatchObject({value: "66% (Pal: 80%, Ama/Asn/Bar: 80%, Dru/Nec/Sor: 80%)", changed: true});
    });
});

describe("buildTooltip: modifiers", () => {
    it("sums Jagged and Sharp into one by-roll range per stat (B1)", () => {
        const mods = show(tip({base: "hax", quality: "rare", picks: ["p186", "p257"]}));
        expect(mods).toContain("+17-40% Enhanced Damage (by roll)");
        expect(mods).toContain("+1-2 to Maximum Damage (by roll)");
        expect(mods).toContain("+10-20 to Attack Rating");
    });

    it("prints a by-roll line beside a plain line of the same stat (Cruel + Sharp)", () => {
        const mods = show(tip({base: "hax", quality: "rare", picks: ["p194", "p257"]}));
        expect(mods).toContain("+201-300% Enhanced Damage");
        expect(mods).toContain("+17-20% Enhanced Damage (by roll)");
    });

    it("prints sockets once, in the footer, clamped to the base's cap", () => {
        const sockets = (fields) => show(tip(fields)).filter((t) => /Socketed/.test(t));
        expect(sockets({base: "hax", picks: ["p420"]})).toEqual(["Socketed (1-2)"]);
        expect(sockets({base: "hax", picks: ["p422"]})).toEqual(["Socketed (2)"]);
        expect(sockets({base: "hax", eth: true, picks: ["p420"]})).toEqual(["Ethereal (Cannot Be Repaired), Socketed (1-2)"]);
        expect(sockets({base: "rin", picks: ["p420"]})).toEqual([]); // cap 0: no socket line at all
    });
});

describe("buildTooltip: base lines", () => {
    it("colours defense and damage blue from affixes, white for ethereal alone", () => {
        expect(line(tip({base: "uit", eth: true}), "Defense:")).toMatchObject({value: "166-185", changed: false});
        expect(line(tip({base: "uit", picks: ["p149"]}), "Defense:").changed).toBe(true);
        expect(line(tip({base: "7wa", eth: true}), "One-Hand Damage:")).toMatchObject({value: "37 to 111", changed: false});
        expect(line(tip({base: "7wa", picks: ["s203"]}), "One-Hand Damage:").changed).toBe(true);
        expect(line(tip({base: "uit"}), "Chance to Block:").changed).toBe(false);
    });

    it("shows one class's block and the class restriction on class-only shields", () => {
        const targe = show(tip({base: "pa1"}));
        expect(targe).toContain("Chance to Block: 10% (Pal: 40%)");
        expect(targe).toContain("(Paladin Only)");
        const head = show(tip({base: "ne1"}));
        expect(head).toContain("Chance to Block: 3% (Nec: 23%)");
        expect(head).toContain("(Necromancer Only)");
    });

    it("shows Two-Hand Damage, then One-Hand Damage (Bar) on a 1-or-2-handed sword", () => {
        const lines = show(tip({base: "bsw"}));
        const at = lines.indexOf("Two-Hand Damage: 20 to 28");
        expect(at).toBeGreaterThan(0);
        expect(lines[at + 1]).toBe("One-Hand Damage: 7 to 19 (Bar)");
    });

    it("shows a throwable's throw line above its main line, its quantity, and no durability", () => {
        expect(show(tip({base: "tax"}))).toEqual(["Throwing Axe", "Throw Damage: 7 to 8", "One-Hand Damage: 4 to 7", "Quantity: 100", "Required Dexterity: 40"]);
        expect(show(tip({base: "aqv"}))).toContain("Quantity: 350");
    });

    it("hides durability on an indestructible item", () => {
        const ages = show(tip({base: "uit", picks: ["s404"]}));
        expect(ages.some((t) => t.startsWith("Durability:"))).toBe(false);
        expect(ages).toContain("Indestructible");
    });

    it("shows the charm line on the four charm bases only", () => {
        for (const code of ["cm1", "cm2", "cm3", "cm4"]) expect(show(tip({base: code})), code).toContain("Keep in Inventory to Gain Bonus");
        for (const code of ["rin", "amu", "jew", "mjw"]) expect(show(tip({base: code})), code).not.toContain("Keep in Inventory to Gain Bonus");
    });
});

describe("buildTooltip: names and the footer", () => {
    it("names a magic item from whichever affixes are picked", () => {
        expect(tip({base: "hax", picks: ["p186"]})[0]).toEqual({kind: "name", text: "Jagged Hand Axe", quality: "magic"});
        expect(tip({base: "hax", picks: ["s203"]})[0].text).toBe("Hand Axe of Evisceration");
        expect(tip({base: "hax"})[0].text).toBe("Hand Axe");
    });

    it("shows a rare or crafted item's placeholder over its base name, with no crafted note", () => {
        for (const quality of ["rare", "crafted"]) {
            const lines = tip({base: "rin", quality});
            expect(lines.slice(0, 2)).toEqual([
                {kind: "placeholder", text: "Random Name", quality}, {kind: "baseName", text: "Ring", quality}]);
            expect(lines.some((l) => /recipe/i.test(l.text ?? l.label ?? ""))).toBe(false);
        }
    });

    it("writes the footer in all three forms", () => {
        const footer = (fields) => tip(fields).filter((l) => l.kind === "footer").map((l) => l.text);
        expect(footer({base: "uit", eth: true})).toEqual(["Ethereal (Cannot Be Repaired)"]);
        expect(footer({base: "uit", picks: ["p420"]})).toEqual(["Socketed (1-2)"]); // Monarch cap 4: Mechanist's 1-2 stays
        expect(footer({base: "uit", eth: true, picks: ["p420"]})).toEqual(["Ethereal (Cannot Be Repaired), Socketed (1-2)"]);
        expect(footer({base: "uit"})).toEqual([]);
    });
});

describe("buildTooltip: robustness (Review Focus)", () => {
    it("builds a crafted item at crafted ilvl 0", () => {
        const lines = tip({base: "hax", quality: "crafted", clvl: 1, gilvl: 1, picks: ["p420"]});
        expect(lines[0]).toMatchObject({kind: "placeholder", quality: "crafted"});
        expect(show(lines)).toContain("Socketed (1-2)");
    });

    it("builds every base in every allowed quality with no picks, name first", () => {
        for (const b of model.bases) {
            for (const quality of allowedQualities(model, b)) {
                const lines = tip({base: b.code, quality});
                expect(lines[0].kind === "name" ? lines[0].text : lines[1].text, `${b.code} ${quality}`).toContain(b.name);
            }
        }
    });

    it("builds every affix alone at ilvl 1 and 99 on a base it can roll on", () => {
        const contexts = model.bases.map((b) => rollContext(model, {...EMPTY_BUILD, base: b.code, quality: "magic"}));
        for (const affix of model.affixes) {
            const ctx = contexts.find((c) => canRoll(affix, c));
            if (!ctx) continue; // rows no builder base can take (maps)
            for (const ilvl of [1, 99]) expect(() => tip({base: ctx.base.code, ilvl, picks: [affix.key]}), `${affix.key} ilvl ${ilvl}`).not.toThrow();
        }
    });

    it("no 1-or-2-handed base can roll an ED row whose first ED roll adds 0 to its smaller pair (sumEnds' monotonicity exception)", () => {
        const hits = [];
        for (const b of model.bases.filter((x) => x.dmg1 && x.dmg2)) {
            const t = Math.max(b.dmg1[1], b.dmg2[1]);
            const smaller = Math.min(b.dmg1[1], b.dmg2[1]);
            for (let ilvl = 1; ilvl <= 99; ilvl++) {
                const ctx = rollContext(model, {...EMPTY_BUILD, base: b.code, quality: "magic", ilvl});
                for (const affix of model.affixes.filter((a) => canRoll(a, ctx))) {
                    for (const m of affix.mods.filter((x) => x.code === "dmg%")) {
                        const falls = (r) => Math.trunc((t * r) / 100) <= 0;
                        if (!falls(m.min) || falls(m.max)) continue; // not mixed
                        let first = m.min;
                        while (falls(first)) first++;
                        if (pct(smaller, first) === 0) hits.push(`${b.code} ${affix.key}`);
                    }
                }
            }
        }
        expect([...new Set(hits)]).toEqual([]);
    });
});
