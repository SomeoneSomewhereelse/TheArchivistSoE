// Captures the golden snapshot from the legacy Drop calculator: DropCalculatorPanel's helpers and
// calculateAll, extracted verbatim from an App.jsx, run in Node over the real tables.
// node golden-dropcalc-legacy.mjs <legacy App.jsx> <out.txt>
// The legacy code: git show c5070a9:src/App.jsx > <file>. Slow: about 55 s per Hell query, ~9 min in all.
import {readFileSync, writeFileSync} from "node:fs";
import {GOLDEN_QUERIES, formatGolden} from "../../src/dropCalcFixtures.js";

const [appPath, outPath] = process.argv.slice(2);
if (!appPath || !outPath) throw new Error("usage: node golden-dropcalc-legacy.mjs <legacy App.jsx> <out.txt>");
const DATA = new URL("../../public/data/", import.meta.url);

const src = readFileSync(appPath, "utf8").split("\n");
const panel = src.findIndex((l) => l.startsWith("function DropCalculatorPanel"));
const start = src.findIndex((l, i) => i > panel && l.includes("const n = (v) =>"));
const end = src.findIndex((l, i) => i > start && l.startsWith("    const pageRows ="));
if (panel < 0 || start < 0 || end < 0) throw new Error(`DropCalculatorPanel's code not found in ${appPath}`);
const body = src.slice(start, end).join("\n").replace("import.meta.env.BASE_URL", '""');
const makeCalculateAll = new Function("query", "dropMode", "difficulty", "players", "mf", "damnationMode",
    "setRows", "setError", "setLoading", `${body}\nreturn calculateAll;`);

// The legacy loadTxt fetches "data/<mode>/<file>.txt"; serve it from the repo.
globalThis.fetch = async (url) => {
    const [mode, file] = url.split("/").slice(-2);
    return {ok: true, text: async () => readFileSync(new URL(`${mode}/${file}`, DATA), "utf8")};
};
console.log = () => {}; // the legacy code logs "BASE DEBUG" for Aldur targets

const entries = [];
for (const q of GOLDEN_QUERIES) {
    let rows = [];
    let error = "";
    const t = performance.now();
    await makeCalculateAll(q.query, q.dropMode, q.difficulty, q.players, q.mf, q.damnation,
        (r) => { rows = r; }, (e) => { error = e; }, () => {})();
    entries.push(error ? {q, error} : {q, rows});
    process.stderr.write(`${JSON.stringify(q)}: ${error || `${rows.length} rows`} (${Math.round((performance.now() - t) / 1000)} s)\n`);
}
writeFileSync(outPath, formatGolden(entries));
process.stderr.write(`wrote ${outPath}\n`);
