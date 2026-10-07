// The tier filter lists Normal, Exceptional, Elite in that order on every tab that has it.
// node check-tier-order.mjs   (APP_URL = a dev server)
import {run, checker, BASE, openTab} from "./cdp.mjs";

const c = checker();
const EXPECTED = ["All tiers", "Normal", "Exceptional", "Elite"];

await run(async (page) => {
    await page.desktop();
    await page.goto(BASE);
    await page.waitFor(`!!document.querySelector(".tabs .tab")`);
    for (const key of ["weapons", "armors", "uniques"]) {
        await openTab(page, key);
        await page.click(".selTrigger", {text: "All tiers"});
        const options = await page.eval(`[...document.querySelectorAll(".selDropdown .selOption")].map((e) => e.textContent.trim())`);
        c.ok(JSON.stringify(options) === JSON.stringify(EXPECTED), `${key}: the tier filter lists ${EXPECTED.join(", ")}`, options.join(", "));
        await page.click(".selTrigger", {text: "All tiers"}); // close it again
    }
});

c.done();
