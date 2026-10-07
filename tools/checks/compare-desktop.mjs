// Full-page 1500px screenshots of every tab: node compare-desktop.mjs <label> <url>
// Fresh browser profile per run, so localStorage starts empty.
import {mkdirSync} from "node:fs";
import {run, TAB_KEYS, clickDesktopTab, sleep} from "./cdp.mjs";

const [label, url] = process.argv.slice(2);
const dir = new URL(`./shots/desktop-${label}/`, import.meta.url).pathname;
mkdirSync(dir, {recursive: true});

await run(async (page) => {
    await page.desktop();
    for (const key of TAB_KEYS) {
        await page.goto(url);
        await page.waitFor(`!!document.querySelector(".tabs .tab")`);
        await sleep(1500);
        await clickDesktopTab(page, key);
        await sleep(1500);
        await page.eval("window.scrollTo(0, 0)");
        await page.send("Input.dispatchMouseEvent", {type: "mouseMoved", x: 0, y: 0});
        await page.screenshot(`${dir}${key}.png`, {fullPage: true});
        console.log("shot", label, key);
    }
});
