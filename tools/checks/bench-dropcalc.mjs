// Every Drop calculator target (all uniques, set items and misc codes) in every difficulty and both
// modes, with the data already loaded: time and work per query.
// node bench-dropcalc.mjs   (DROPCALC_BUDGET_MS = the time budget per query, default 150)
// FAIL (exit 1): a target over a work ceiling below, which doesn't depend on the machine.
// WARN: a target over the time budget, which does; it never fails.
import {calculateDrops} from "../../src/dropCalcEngine.js";
import {loadDropCalcModel} from "../../src/dropCalcFixtures.js";

// Measured maxima across the whole sweep, plus 25%, rounded up to the next 1,000. Measured 2026-10-07:
// walkNodes 56603 (standard Hell unique Kuko Shakaku), outcomes 872 (standard Hell misc r05s).
const MAX_WALK_NODES = 71000;
const MAX_OUTCOMES = 2000;

const BUDGET_MS = Number(process.env.DROPCALC_BUDGET_MS ?? 150);
const DIFFICULTIES = {"": "Normal", N: "Nightmare", H: "Hell"};
let failures = 0;
let warnings = 0;
const peak = {walkNodes: {value: 0}, outcomes: {value: 0}};

for (const mode of ["standard", "damnation"]) {
    const model = loadDropCalcModel(mode);
    const targets = [
        ...model.uniqueItems.map((r) => ["unique", r.index]),
        ...model.setItems.map((r) => ["set", r.index]),
        ...model.misc.map((r) => ["misc", r.code]),
    ].map(([dropMode, q]) => [dropMode, String(q ?? "").trim()]).filter(([, q]) => q);

    const runOne = (dropMode, query, difficulty) => {
        const stats = {};
        const t = performance.now();
        let rows = 0;
        try {
            rows = calculateDrops(model, {dropMode, query, difficulty, players: "1", mf: ""}, stats).length;
        } catch {
            // "not found" and similar: still timed and counted
        }
        return {ms: performance.now() - t, rows, dropMode, query, ...stats};
    };

    for (const [dropMode, query] of targets.slice(0, 30)) runOne(dropMode, query, "H"); // warm-up, untimed

    for (const [difficulty, label] of Object.entries(DIFFICULTIES)) {
        const results = targets.map(([dropMode, query]) => runOne(dropMode, query, difficulty));
        const byTime = [...results].sort((a, b) => b.ms - a.ms);
        const at = (fraction) => byTime[Math.floor(byTime.length * fraction)].ms.toFixed(0);
        const worst = byTime[0];
        console.log(`${mode} ${label}: ${results.length} targets, median ${at(0.5)} ms, slowest 10% from ${at(0.1)} ms, `
            + `worst ${worst.ms.toFixed(0)} ms (${worst.dropMode} ${worst.query}, ${worst.rows} rows)`);

        for (const r of results) {
            for (const key of ["walkNodes", "outcomes"]) {
                if (r[key] > peak[key].value) peak[key] = {value: r[key], where: `${mode} ${label} ${r.dropMode} ${r.query}`};
            }
            if (r.walkNodes > MAX_WALK_NODES || r.outcomes > MAX_OUTCOMES) {
                failures++;
                console.log(`FAIL ${mode} ${label} ${r.dropMode} "${r.query}": walkNodes ${r.walkNodes} (ceiling ${MAX_WALK_NODES}), `
                    + `outcomes ${r.outcomes} (ceiling ${MAX_OUTCOMES})`);
            }
            if (r.ms > BUDGET_MS) {
                warnings++;
                console.log(`WARN ${mode} ${label} ${r.dropMode} "${r.query}": ${r.ms.toFixed(0)} ms (budget ${BUDGET_MS} ms)`);
            }
        }
    }
}

console.log(`peak walkNodes ${peak.walkNodes.value} (${peak.walkNodes.where}), peak outcomes ${peak.outcomes.value} (${peak.outcomes.where})`);
console.log(failures ? `${failures} target(s) over a work ceiling` : `all targets within the work ceilings; ${warnings} timing warning(s)`);
if (failures) process.exitCode = 1;
