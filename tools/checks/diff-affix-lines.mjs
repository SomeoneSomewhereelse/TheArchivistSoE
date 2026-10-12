// Compares every affix row's engine lines with upstream's last Affixes.json (read from git history) and
// writes a Markdown report into the research vault, grouped by shape (numbers as N). A review aid, not a
// gate: each shape gets a verdict, "upstream bug" or "engine bug". node diff-affix-lines.mjs
import {execFileSync} from "node:child_process";
import {readFileSync, writeFileSync} from "node:fs";
import {parseTbl} from "../../src/tblFile.js";
import {STAT_TABLES, buildStatData} from "../../src/statData.js";
import {AFFIX_TABLES, describeAffixes, itemTypeNames, readAffixes} from "../../src/affixData.js";

const ROOT = new URL("../../", import.meta.url);
const STANDARD = new URL("public/data/standard/", ROOT);
// The research vault is git-excluded, so it exists only in the main checkout: use its absolute path.
const OUT = new URL("file:///home/emanresu/TheArchivistSoE/docs/research/stat-summing/notes/affix-lines-diff.md");
const git = (...args) => execFileSync("git", args, {cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20});

// The commit that deleted upstream's file (its parent still has it), or HEAD before the deletion.
const deletedIn = git("log", "-1", "--format=%H", "--diff-filter=D", "--", "public/data/Affixes.json").trim();
const source = deletedIn ? `${deletedIn.slice(0, 8)}^` : "HEAD";
const upstream = JSON.parse(git("show", `${source}:public/data/Affixes.json`));

const texts = Object.fromEntries([...new Set([...AFFIX_TABLES, ...STAT_TABLES])].map((name) =>
    [name, readFileSync(new URL(`data/global/excel/${name}.txt`, STANDARD), "utf8")]));
const dict = buildStatData({
    texts,
    patchStrings: parseTbl(new Uint8Array(readFileSync(new URL("data/local/LNG/ENG/patchstring.tbl", STANDARD)))),
    baseStrings: JSON.parse(readFileSync(new URL("src/baseStrings.json", ROOT), "utf8")),
});
const {rows} = describeAffixes(readAffixes(texts), dict, itemTypeNames(texts.ItemTypes));
if (rows.length !== upstream.length) throw new Error(`${rows.length} rows vs upstream's ${upstream.length}`);

const shape = (s) => s.replace(/\d+(\.\d+)?/g, "N");
const groups = new Map();
rows.forEach((row, i) => {
    const up = upstream[i];
    if (up.name !== row.name || up.level !== row.level) throw new Error(`row ${i}: ${row.key} "${row.name}" vs upstream "${up.name}"`);
    const mine = row.lines.join(" / ");
    const theirs = (up.displayProperties ?? []).map((p) => p.displayString).join(" / ");
    if (mine === theirs) return;
    const key = `${shape(mine)} || ${shape(theirs)}`;
    groups.set(key, [...(groups.get(key) ?? []), {key: row.key, name: row.name, mine, theirs}]);
});

const out = [`# Engine lines vs upstream's Affixes.json`, "", `Upstream: \`${source}:public/data/Affixes.json\`. `
    + `${[...groups.values()].flat().length} of ${rows.length} rows differ, in ${groups.size} shapes. Fill each Verdict.`, ""];
for (const [, list] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    out.push(`## ${list.length} × ${list[0].mine || "(no lines)"}`, "", `Upstream: ${list[0].theirs || "(none)"}`, "",
        `Rows: ${list.map((r) => r.key).join(", ")}`, "", "Verdict: ", "");
}
writeFileSync(OUT, out.join("\n"));
console.log(`wrote ${OUT.pathname}: ${groups.size} shapes`);
