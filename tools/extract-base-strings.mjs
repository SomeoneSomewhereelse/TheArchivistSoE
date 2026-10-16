// Writes src/baseStrings.json: the base game's strings (string.tbl, expansionstring.tbl) for every key the
// committed tables, the stat engine or the item tooltip can ask for. Run it with your own copies of the two tables, extracted
// from Diablo II's MPQs (data\local\lng\eng\), when a data update makes the build's string check fail:
//   node tools/extract-base-strings.mjs <string.tbl> <expansionstring.tbl>
// Keys the patch table also has are kept, so a later SoE patch that drops one still builds. Blizzard's
// full tables are never committed; this file holds only the referenced keys.
import {readFileSync, writeFileSync} from "node:fs";
import {parseTxt} from "../src/dropCalcData.js";
import {parseTbl} from "../src/tblFile.js";
import {HARDCODED_STRINGS, TOOLTIP_STRINGS} from "../src/statData.js";

const [stringPath, expansionPath] = process.argv.slice(2);
if (!stringPath || !expansionPath) throw new Error("usage: node tools/extract-base-strings.mjs <string.tbl> <expansionstring.tbl>");

const EXCEL = new URL("../public/data/standard/data/global/excel/", import.meta.url);
const OUT = new URL("../src/baseStrings.json", import.meta.url);
const table = (name) => parseTxt(readFileSync(new URL(`${name}.txt`, EXCEL), "utf8"));

// The fixed list of places a string key can come from (an empty key is absent).
const SOURCES = {
    ItemStatCost: ["descstrpos", "descstrneg", "descstr2", "dgrpstrpos", "dgrpstrneg", "dgrpstr2"],
    CharStats: ["StrAllSkills", "StrSkillTab1", "StrSkillTab2", "StrSkillTab3", "StrClassOnly"],
    Skilldesc: ["str name"],
};
const keys = new Set([...HARDCODED_STRINGS, ...TOOLTIP_STRINGS]);
for (const [name, columns] of Object.entries(SOURCES)) {
    for (const row of table(name)) {
        for (const c of columns) {
            const key = (row[c] ?? "").trim();
            if (key) keys.add(key);
        }
    }
}

// The game looks a key up in the patch table, then the expansion table, then the base table.
const expansion = parseTbl(new Uint8Array(readFileSync(expansionPath)));
const base = parseTbl(new Uint8Array(readFileSync(stringPath)));
const out = {};
for (const key of [...keys].sort()) {
    const value = expansion.get(key) ?? base.get(key);
    if (value !== undefined) out[key] = value;
}
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${Object.keys(out).length} of ${keys.size} referenced keys to src/baseStrings.json`);
