// Filters are cleared by a tab change and by the jump-to-item flows, and a jump lands on its target.
// node check-jumps.mjs   (APP_URL = a dev server)
import {run, checker, BASE} from "./cdp.mjs";

const c = checker();
const SEARCH = `document.querySelector(".searchBar")?.value ?? null`;

await run(async (page) => {
    await page.desktop();
    await page.goto(BASE + "#/uniques");
    await page.waitFor(`document.querySelectorAll(".listPanel .row").length > 3`);
    await page.type(".searchBar", "ring");
    await page.eval(`location.hash = "#/runewords"`);
    await page.waitFor(`document.querySelectorAll(".listPanel .row").length > 3`);
    c.ok((await page.eval(SEARCH)) === "", "a tab change clears the search", String(await page.eval(SEARCH)));

    // A runeword's sacred link: the Sacreds tab opens with every filter cleared and the sacred expanded.
    await page.mobile();
    await page.goto(BASE + "#/runewords");
    await page.waitFor(`document.querySelectorAll(".listPanel .row").length > 3`);
    await page.eval(`document.querySelectorAll(".listPanel .row")[2].click()`);
    await page.waitFor(`!!document.querySelector(".rowDetail a")`);
    await page.eval(`document.querySelector(".rowDetail a").click()`);
    await page.waitFor(`location.hash === "#/sacreds" && !!document.querySelector(".rowDetail")`);
    c.ok(!(await page.eval(`!!document.querySelector(".errorPanel")`)), "the jump renders without a failure panel");
    c.ok((await page.eval(SEARCH)) === "", "the jump leaves the search cleared");
    const inView = await page.eval(`(() => { const r = document.querySelector(".rowDetail").getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; })()`);
    c.ok(inView, "the opened sacred is scrolled into view", String(inView));
});

c.done();
