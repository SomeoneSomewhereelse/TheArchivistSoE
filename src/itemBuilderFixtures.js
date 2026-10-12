// Test helpers for the Item Builder. Node-only (node:fs for the real tables), so the app must never
// import this module.
import {readFileSync} from "node:fs";
import {ITEM_BUILDER_TABLES, ITEM_BUILDER_VERSION, buildItemBuilderJson, prepareItemBuilder} from "./itemBuilderData.js";
import {readExcel, realAffixData} from "./statFixtures.js";

export {affixTableText, tableText} from "./statFixtures.js";

const DATA = new URL("../public/data/", import.meta.url);

export function readJson(path) {
    return JSON.parse(readFileSync(new URL(path, DATA), "utf8"));
}

// Everything the plugin passes to buildItemBuilderJson, from the real files.
export function readItemBuilderInputs() {
    return {
        texts: Object.fromEntries(ITEM_BUILDER_TABLES.map((name) => [name, readExcel(name)])),
        affixes: realAffixData().rows,
        weaponsJson: readJson("Weapons.json"),
        armorsJson: readJson("Armors.json"),
    };
}

export function realItemBuilderModel() {
    return prepareItemBuilder({...buildItemBuilderJson(readItemBuilderInputs()), linkVersion: 1});
}

const affix = (key, fields) => ({
    key, suffix: key.startsWith("s"), name: key, level: 1, maxLevel: null, levelreq: 1, rare: true,
    classSpecific: null, classLevelReq: null, group: 0, frequency: 1, itypes: ["weap"], etypes: [], mods: [],
    lines: [`${key} stat`], sort: {property: "x", max: 1}, ...fields,
});

// A small model covering every rule: classes, magic-only rows, max levels, exclusions, a group shared
// by a prefix and a suffix (2), a jewel, a magic-only charm and a magic-lvl circlet.
export function tinyModel() {
    return prepareItemBuilder({
        version: ITEM_BUILDER_VERSION,
        linkVersion: 3,
        types: {
            weap: {chain: ["weap"], class: null, rare: true},
            "1han": {chain: ["1han", "weap"], class: null, rare: true},
            axe: {chain: ["axe", "mele", "weap"], class: null, rare: true},
            orb: {chain: ["orb", "weap", "sorc", "clas"], class: "sor", rare: true},
            amul: {chain: ["amul", "misc"], class: null, rare: true},
            jewl: {chain: ["jewl", "sock", "misc"], class: null, rare: true},
            lcha: {chain: ["lcha", "char", "misc"], class: null, rare: false},
            circ: {chain: ["circ", "helm", "armo"], class: null, rare: true},
        },
        bases: [
            {code: "axe", name: "Test Axe", group: "Axes", tier: "Normal", qlvl: 30, magicLvl: 0, levelreq: 10, types: ["axe", "1han"]},
            {code: "orb", name: "Test Orb", group: "Sorceress Orbs", tier: "Normal", qlvl: 50, magicLvl: 1, levelreq: 20, types: ["orb"]},
            {code: "amu", name: "Amulet", group: "Amulets", tier: null, qlvl: 1, magicLvl: 0, levelreq: 0, types: ["amul"]},
            {code: "jew", name: "Jewel", group: "Jewels", tier: null, qlvl: 1, magicLvl: 0, levelreq: 0, types: ["jewl"]},
            {code: "cm3", name: "Grand Charm", group: "Grand Charms", tier: null, qlvl: 1, magicLvl: 0, levelreq: 0, types: ["lcha"]},
            {code: "ci3", name: "Diadem", group: "Circlets", tier: "Elite", qlvl: 85, magicLvl: 18, levelreq: 64, types: ["circ"]},
        ],
        affixes: [
            affix("p0", {name: "Sharp", group: 1, itypes: ["weap", "amul", "jewl"],
                lines: ["+5-10% Damage"], sort: {property: "dmg%", max: 10}}),
            affix("p1", {name: "Sharper", group: 1, level: 40,
                lines: ["+15-20% Damage"], sort: {property: "dmg%", max: 20}}),
            affix("p2", {name: "Magicky", group: 2, rare: false, itypes: ["weap", "amul"]}),
            affix("p3", {name: "Sorcy", group: 3, classSpecific: "sor", itypes: ["weap", "amul"]}),
            affix("p4", {name: "Barby", group: 4, classSpecific: "bar"}),
            affix("p5", {name: "Capped", group: 5, maxLevel: 20}),
            affix("p6", {name: "NoOrb", group: 6, etypes: ["orb"]}),
            affix("p7", {name: "Fourth", group: 7, itypes: ["weap", "amul", "jewl"]}),
            affix("s0", {name: "of Life", group: 10, itypes: ["weap", "amul", "jewl", "lcha"], levelreq: 30}),
            affix("s1", {name: "of Shared", group: 2, itypes: ["weap", "amul"]}),
            affix("s2", {name: "of Mana", group: 11, itypes: ["weap", "amul", "jewl"]}),
            affix("s3", {name: "of Speed", group: 12, itypes: ["weap", "amul", "jewl"]}),
            affix("s4", {name: "of Req", group: 13, itypes: ["weap", "amul"], levelreq: 40, classLevelReq: {class: "sor", level: 30}}),
        ],
    });
}
