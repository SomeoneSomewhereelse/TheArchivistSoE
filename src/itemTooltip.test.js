import {describe, expect, it} from "vitest";
import {checkTrimmedStatData, engineBase, expandPicks} from "./itemTooltip.js";
import {buildBases, buildTypes} from "./itemBuilderData.js";
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
