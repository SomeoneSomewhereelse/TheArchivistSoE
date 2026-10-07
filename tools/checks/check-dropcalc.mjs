// Drop calculator in the browser: results, data fetching, stale runs, and main-thread time.
// node check-dropcalc.mjs   (APP_URL = this branch's dev server)
// FAIL lines: wrong rows or fetches, which don't depend on the machine. WARN lines: a long main-thread task, which does;
// budgets DROPCALC_DESKTOP_TASK_MS (default 300) and DROPCALC_PHONE_TASK_MS (default 1000), never failing.
// Desktop checks run first: touch emulation can't be switched back to hover: hover in one browser.
import {run, checker, BASE, sleep} from "./cdp.mjs";
import {calculateDrops} from "../../src/dropCalcEngine.js";
import {loadDropCalcModel} from "../../src/dropCalcFixtures.js";

const c = checker();
const DESKTOP_MS = Number(process.env.DROPCALC_DESKTOP_TASK_MS ?? 300);
const PHONE_MS = Number(process.env.DROPCALC_PHONE_TASK_MS ?? 1000);

// Expected row counts come from the engine itself, run in Node on the same tables.
const models = {standard: loadDropCalcModel("standard"), damnation: loadDropCalcModel("damnation")};
const run_ = (mode, query, difficulty = "") =>
    calculateDrops(models[mode], {dropMode: "unique", query, difficulty, players: "1", mf: ""});
const expected = (mode, query, difficulty = "") => run_(mode, query, difficulty).length;
// The two modes' row counts never differ for a unique, but their chances do: the top row's percent tells them apart.
const expectedTop = (mode, query, difficulty = "") => {
    const top = run_(mode, query, difficulty)[0];
    return top ? `${top.percent.toFixed(6)}%` : null;
};

const QUERY_INPUT = `input[placeholder^="Enter item name"]`;
const TOTAL = `(() => {
    const m = /of (\\d+)/.exec(document.querySelector(".affixPager")?.innerText ?? "");
    return m ? Number(m[1]) : null;
})()`;
const TOP_PERCENT = `(document.querySelector(".affixTable tbody tr td:last-child")?.textContent.trim() ?? null)`;
const MESSAGE = `(document.querySelector(".affixTableScroll .table-message")?.textContent.trim() ?? null)`;
const LONG_TASK_OBSERVER = `window.__longTasks = [];
    new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__longTasks.push(e.duration); })
        .observe({type: "longtask", buffered: true});`;
const LONGEST_TASK = `Math.round(Math.max(0, ...window.__longTasks))`;

// top: the first row's percent text, also required when given.
async function waitTotal(page, count, label, top = undefined) {
    const topCheck = top === undefined ? "" : ` && ${TOP_PERCENT} === ${JSON.stringify(top)}`;
    try {
        await page.waitFor(`${TOTAL} === ${count} && ${MESSAGE} === null${topCheck}`, 30000);
        c.ok(true, label, `${count} rows`);
    } catch {
        c.ok(false, label, `expected ${count} rows${topCheck ? ` and top ${top}` : ""}, page shows ${await page.eval(TOTAL)}`
            + ` (top ${await page.eval(TOP_PERCENT)}, message: ${await page.eval(MESSAGE)})`);
    }
}

function reportTask(label, ms, budget) {
    console.log(`${ms > budget ? "WARN" : "INFO"} longest main-thread task, ${label}: ${ms} ms (budget ${budget} ms)`);
}

// Sets an input's value the way typing does, so React's onChange fires (works for "" too).
const setInput = (selector, value) => `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event("input", {bubbles: true}));
})()`;

// A unique whose top row differs between the modes, so a mode switch shows on the page.
const modeQuery = models.standard.uniqueItems.map((u) => String(u.index ?? "").trim()).find((q) => {
    if (!q) return false;
    const s = expectedTop("standard", q);
    const d = expectedTop("damnation", q);
    return s !== null && d !== null && s !== d;
});

await run(async (page) => {
    const requests = [];
    await page.send("Network.enable");
    page.on("Network.requestWillBeSent", (p) => requests.push(p.request.url));
    const fetched = (re) => requests.filter((u) => re.test(u)).length;
    await page.send("Page.addScriptToEvaluateOnNewDocument", {source: LONG_TASK_OBSERVER});

    const openCalculator = async () => {
        await page.goto(`${BASE}#/dropcalc`);
        await page.waitFor(`!!document.querySelector(${JSON.stringify(QUERY_INPUT)})`);
    };

    // --- Desktop: results and fetching
    await page.desktop();
    await openCalculator();
    const queries = ["The Gnasher", "Deathspade", "Nagelring"];
    const counts = queries.map((q) => expected("standard", q));
    c.ok(new Set(counts).size === 3, "precondition: the three queries have different row counts", counts.join(", "));
    for (const [i, q] of queries.entries()) {
        await page.type(QUERY_INPUT, q);
        await waitTotal(page, counts[i], `desktop: "${q}" (Normal) shows the engine's rows`);
    }
    c.ok(fetched(/\/standard\/DropCalculator\.json/) === 1, "desktop: three queries fetch standard/DropCalculator.json once",
        String(fetched(/\/standard\/DropCalculator\.json/)));
    c.ok(fetched(/\/data\/.*\.txt(\?|$)/) === 0, "desktop: no .txt table is fetched", String(fetched(/\/data\/.*\.txt(\?|$)/)));
    reportTask("desktop, three queries", await page.eval(LONGEST_TASK), DESKTOP_MS);

    // --- Desktop: the Damnation toggle fetches its own file once
    c.ok(!!modeQuery, "precondition: found a unique whose top row differs between the modes", modeQuery);
    await page.type(QUERY_INPUT, modeQuery);
    await waitTotal(page, expected("standard", modeQuery), `desktop: "${modeQuery}" in Standard`, expectedTop("standard", modeQuery));
    await page.click(".topBarToggle input");
    await waitTotal(page, expected("damnation", modeQuery), `desktop: Damnation shows Damnation's rows for "${modeQuery}"`,
        expectedTop("damnation", modeQuery));
    await page.click(".topBarToggle input");
    await waitTotal(page, expected("standard", modeQuery), "desktop: back in Standard, Standard's rows again",
        expectedTop("standard", modeQuery));
    c.ok(fetched(/\/damnation\/DropCalculator\.json/) === 1, "desktop: damnation/DropCalculator.json fetched once");
    c.ok(fetched(/\/standard\/DropCalculator\.json/) === 1, "desktop: standard/DropCalculator.json still fetched once");

    // --- Race (Review Focus 2): a run waiting for Standard's data must not overwrite Damnation's rows
    const held = [];
    page.on("Fetch.requestPaused", (p) => held.push(p.requestId));
    await page.send("Fetch.enable", {patterns: [{urlPattern: "*standard/DropCalculator.json*", requestStage: "Request"}]});
    await page.eval(`localStorage.setItem("damnation", "false")`);
    await openCalculator();
    await page.type(QUERY_INPUT, modeQuery);
    await sleep(700); // the debounced run starts and waits for the held data
    c.ok(held.length > 0, "race: standard/DropCalculator.json is held");
    await page.click(".topBarToggle input"); // Damnation: a newer run, with data that isn't held
    await waitTotal(page, expected("damnation", modeQuery), "race: Damnation's rows appear while Standard's data is held",
        expectedTop("damnation", modeQuery));
    for (const requestId of held.splice(0)) await page.send("Fetch.continueRequest", {requestId});
    await sleep(1500);
    c.ok(await page.eval(TOTAL) === expected("damnation", modeQuery) && await page.eval(TOP_PERCENT) === expectedTop("damnation", modeQuery),
        "race: releasing Standard's data leaves Damnation's rows", `${await page.eval(TOTAL)} rows, top ${await page.eval(TOP_PERCENT)}`);

    // --- Clear while loading (Review Focus 1): no stuck "Calculating..."
    await page.eval(`localStorage.setItem("damnation", "false")`);
    await openCalculator();
    await page.type(QUERY_INPUT, "The Gnasher");
    await sleep(700);
    c.ok(await page.eval(MESSAGE) === "Calculating...", "clear while loading: 'Calculating...' while the data is held",
        String(await page.eval(MESSAGE)));
    await page.eval(setInput(QUERY_INPUT, ""));
    await sleep(700);
    c.ok(await page.eval(MESSAGE) === null && await page.eval(TOTAL) === 0, "clear while loading: empty table, no message",
        `message ${await page.eval(MESSAGE)}, total ${await page.eval(TOTAL)}`);
    for (const requestId of held.splice(0)) await page.send("Fetch.continueRequest", {requestId});
    await sleep(1500);
    c.ok(await page.eval(MESSAGE) === null && await page.eval(TOTAL) === 0, "clear while loading: still empty once the data arrives");
    await page.send("Fetch.disable");

    // --- Phone: 390x844, touch, CPU slowed 4x; the slowest target in Hell
    await page.mobile();
    await page.send("Emulation.setCPUThrottlingRate", {rate: 4});
    await openCalculator();
    await sleep(2000); // the warm-up download
    await page.click(".dropCalcDifficulty .selTrigger");
    await page.click(".dropCalcDifficulty .selOption", {text: "Hell"});
    await page.eval("window.__longTasks = []");
    await page.type(QUERY_INPUT, "The Gnasher");
    await waitTotal(page, expected("standard", "The Gnasher", "H"), `phone: "The Gnasher" (Hell) shows the engine's rows`);
    reportTask("phone (CPU x4), The Gnasher in Hell", await page.eval(LONGEST_TASK), PHONE_MS);
    await page.send("Emulation.setCPUThrottlingRate", {rate: 1});
});

c.done();
