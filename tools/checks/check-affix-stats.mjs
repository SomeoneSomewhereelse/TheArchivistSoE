// The Affixes tab's Stat filter, desktop then a 390x844 phone. node check-affix-stats.mjs   (APP_URL = a dev server)
import {run, checker, BASE, openTab, OVERFLOW_CHECK, sleep} from "./cdp.mjs";

const c = checker();
const ROWS = `[...document.querySelectorAll(".affixTableScroll tbody tr")].map((tr) => ({name: tr.cells[0].textContent.trim(), attrs: tr.cells[1].textContent.trim(), types: tr.cells[7].textContent.trim()}))`;
const TOTAL = `Number(/of (\\d+)/.exec(document.querySelector(".affixPager")?.textContent ?? "")?.[1] ?? 0)`;
const STAT_TRIGGER = `[...document.querySelectorAll(".filtersPanel .selTrigger")].find((t) => /stat/i.test(t.textContent))`;

async function chooseStat(page, label) {
    await page.eval(`${STAT_TRIGGER}.click()`);
    await sleep(200);
    await page.type(".selDropdown .selSearchInput", label);
    await page.click(".selDropdown .selOption", {text: label});
    await sleep(400);
}

async function checkFilter(page, where) {
    const all = await page.eval(TOTAL);
    await chooseStat(page, "Cold Resist +#%");
    const total = await page.eval(TOTAL);
    const rows = await page.eval(ROWS);
    c.ok(total > 0 && total < all, `${where}: Cold Resist narrows the table`, `${total} of ${all}`);
    c.ok(rows.every((r) => /Cold Resist|All Resistances/.test(r.attrs)), `${where}: every row prints Cold Resist or All Resistances`);
    c.ok(rows.some((r) => /via All Resistances/.test(r.attrs)), `${where}: indirect rows carry "via All Resistances"`);
    c.ok(rows.some((r) => !/via/.test(r.attrs)), `${where}: direct rows carry no tag`);
}

await run(async (page) => {
    await page.desktop();
    await page.goto(`${BASE}#/affixes`);
    await page.waitFor(`document.querySelectorAll(".affixTableScroll tbody tr").length > 1`);
    await checkFilter(page, "desktop");

    // Combined with Prefix/Suffix by AND: all 49 Cold Resist rows are prefixes.
    const coldRows = await page.eval(TOTAL);
    await page.click(".filtersPanel .selTrigger", {text: "All affix types"});
    await page.click(".selDropdown .selOption", {text: "Prefix"});
    await sleep(400);
    c.ok((await page.eval(TOTAL)) === coldRows, "desktop: Stat + Prefix keeps every Cold Resist row");
    await page.click(".filtersPanel .selTrigger", {text: "Prefix"});
    await page.click(".selDropdown .selOption", {text: "Suffix"});
    await sleep(400);
    const empty = await page.eval(`document.querySelector(".emptyState")?.textContent ?? ""`);
    c.ok(/No affixes match/.test(empty), "desktop: Stat + Suffix combine by AND (no suffix gives Cold Resist)", empty);

    // Item type options are exact names.
    await page.click(".filtersPanel .selTrigger", {text: "All types"});
    const types = await page.eval(`[...document.querySelectorAll(".selDropdown .selOption")].map((e) => e.textContent.trim())`);
    c.ok(types.includes("Orb") && types.includes("Grand Charm") && !types.includes("Staff Class"), "desktop: item types are exact names", types.slice(0, 8).join(", "));
    await page.key("Escape");

    // A tab switch resets the filter.
    await openTab(page, "weapons");
    await openTab(page, "affixes");
    await page.waitFor(`document.querySelectorAll(".affixTableScroll tbody tr").length > 1`);
    const label = await page.eval(`${STAT_TRIGGER}?.textContent.trim()`);
    c.ok(/Any stat/.test(label ?? ""), "desktop: leaving the tab resets the Stat filter", label);

    // The Damnation toggle doesn't change the file.
    const before = await page.eval(TOTAL);
    await page.click(".topBarToggle input");
    await sleep(800);
    c.ok((await page.eval(TOTAL)) === before, "desktop: the Damnation toggle shows the same rows");
    await page.click(".topBarToggle input");

    await page.mobile();
    await page.goto(`${BASE}#/affixes`);
    await page.waitFor(`document.querySelectorAll(".affixTableScroll tbody tr").length > 1`);
    await page.click(".filtersToggle");
    await checkFilter(page, "phone");
    const overflow = await page.eval(OVERFLOW_CHECK);
    c.ok(overflow.count === 0, "phone: no horizontal overflow", JSON.stringify(overflow.offenders));
});

c.done();
