// Headless-Chromium harness for The Archivist UI checks, over CDP with Node's global WebSocket.
import {spawn} from "node:child_process";
import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import path from "node:path";

const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
const HERE = path.dirname(new URL(import.meta.url).pathname);
export const BASE = process.env.APP_URL ?? "http://localhost:5181/TheArchivistSoE/";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The 18 sheet tabs plus Changelog, in tab-sheet order.
export const TAB_KEYS = ["weapons", "armors", "uniques", "runewords", "sacreds", "fatecards", "affixes", "skills",
    "ascendancies", "corruptions", "mapping", "kiln", "cube", "calculators", "dropcalc", "changes", "damnation",
    "help", "changelog"];

export const TAB_TITLES = {
    weapons: "Weapons", armors: "Armors", uniques: "Uniques", runewords: "Runewords", sacreds: "Sacreds",
    fatecards: "Fate Cards", affixes: "Affixes", skills: "Skills", ascendancies: "Ascendancies",
    corruptions: "Corruptions", mapping: "Mapping", kiln: "Infernal Kiln", cube: "Cube Recipes",
    calculators: "Skill Calculators", dropcalc: "Drop calculator", changes: "Standard Mode",
    damnation: "Damnation Mode", help: "Help", changelog: "Changelog",
};

// JS source for "the element matching selector, optionally containing text, optionally the nth match".
function finder(selector, {text = null, nth = 0} = {}) {
    const filter = text === null ? "" : `.filter((e) => e.textContent.includes(${JSON.stringify(text)}))`;
    return `[...document.querySelectorAll(${JSON.stringify(selector)})]${filter}[${nth}]`;
}

async function launchChrome(port) {
    const userDir = mkdtempSync(path.join(HERE, "chrome-profile-"));
    // Headless has no mouse, so by default it reports hover: none. Start it as a hover-capable fine
    // pointer (desktop); mobile() turns on touch emulation, which switches it to coarse / none.
    const proc = spawn(CHROME, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
        "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4",
        `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`, "about:blank"], {stdio: "ignore"});
    for (let i = 0; i < 50; i++) {
        try {
            await fetch(`http://127.0.0.1:${port}/json/version`);
            return {proc, userDir};
        } catch {
            await sleep(200);
        }
    }
    proc.kill();
    throw new Error("Chrome did not start");
}

async function openPage(port) {
    const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {method: "PUT"});
    const {webSocketDebuggerUrl} = await res.json();
    const ws = new WebSocket(webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = reject;
    });

    let nextId = 0;
    const pending = new Map();
    const waiters = [];
    const listeners = [];
    ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id !== undefined) {
            const p = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
            else p.resolve(msg.result);
            return;
        }
        for (const l of listeners) if (l.method === msg.method) l.fn(msg.params);
        for (const w of [...waiters]) {
            if (w.method === msg.method) {
                waiters.splice(waiters.indexOf(w), 1);
                w.resolve(msg.params);
            }
        }
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, {resolve, reject, method});
        ws.send(JSON.stringify({id, method, params}));
    });
    const once = (method) => new Promise((resolve) => waiters.push({method, resolve}));
    // Calls fn(params) for every event named method, for the page's lifetime.
    const on = (method, fn) => listeners.push({method, fn});

    await send("Page.enable");
    await send("Runtime.enable");

    const page = {
        send,
        once,
        on,
        async eval(expression) {
            const r = await send("Runtime.evaluate", {expression, awaitPromise: true, returnByValue: true});
            if (r.exceptionDetails) {
                throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
            }
            return r.result.value;
        },
        // Always a fresh document: going via about:blank avoids same-document hash navigations.
        async goto(url) {
            for (const target of ["about:blank", url]) {
                const loaded = once("Page.loadEventFired");
                await send("Page.navigate", {url: target});
                await loaded;
            }
        },
        async waitFor(expression, timeout = 15000) {
            const end = Date.now() + timeout;
            while (Date.now() < end) {
                if (await page.eval(expression)) return;
                await sleep(100);
            }
            throw new Error(`Timed out waiting for: ${expression}`);
        },
        async mobile() {
            await send("Emulation.setDeviceMetricsOverride", {width: 390, height: 844, deviceScaleFactor: 2, mobile: true});
            await send("Emulation.setTouchEmulationEnabled", {enabled: true, maxTouchPoints: 5});
            await send("Emulation.setEmulatedMedia", {features: [{name: "hover", value: "none"}, {name: "pointer", value: "coarse"}]});
            await sleep(300);
        },
        async desktop(width = 1500, height = 1000) {
            await send("Emulation.setDeviceMetricsOverride", {width, height, deviceScaleFactor: 1, mobile: false});
            await send("Emulation.setTouchEmulationEnabled", {enabled: false});
            // Headless Chromium has no mouse, so it reports hover: none unless told otherwise.
            await send("Emulation.setEmulatedMedia", {features: [{name: "hover", value: "hover"}, {name: "pointer", value: "fine"}]});
            await sleep(300);
        },
        async center(selector, opts = {}) {
            const point = await page.eval(`(() => {
                const el = ${finder(selector, opts)};
                if (!el) return null;
                el.scrollIntoView({block: "center", inline: "nearest"});
                const r = el.getBoundingClientRect();
                return {x: r.left + r.width / 2, y: r.top + r.height / 2};
            })()`);
            if (!point) throw new Error(`No element for ${selector} ${JSON.stringify(opts)}`);
            return point;
        },
        // A real touch tap (touchStart + touchEnd), which the browser turns into pointer events and a click.
        async tap(selector, opts = {}) {
            const {x, y} = await page.center(selector, opts);
            await page.tapAt(x, y);
        },
        async tapAt(x, y) {
            await send("Input.dispatchTouchEvent", {type: "touchStart", touchPoints: [{x, y}]});
            await send("Input.dispatchTouchEvent", {type: "touchEnd", touchPoints: []});
            await sleep(250);
        },
        async click(selector, opts = {}) {
            const ok = await page.eval(`(() => { const el = ${finder(selector, opts)}; if (!el) return false; el.click(); return true; })()`);
            if (!ok) throw new Error(`No element for ${selector} ${JSON.stringify(opts)}`);
            await sleep(200);
        },
        async hover(selector, opts = {}) {
            const {x, y} = await page.center(selector, opts);
            await send("Input.dispatchMouseEvent", {type: "mouseMoved", x, y});
            await sleep(250);
        },
        // Replaces the input's value through real text input, so React's onChange fires.
        async type(selector, text) {
            const ok = await page.eval(`(() => { const el = ${finder(selector)}; if (!el) return false; el.focus(); el.select(); return true; })()`);
            if (!ok) throw new Error(`No input for ${selector}`);
            await send("Input.insertText", {text});
            await sleep(200);
        },
        async key(key) {
            const codes = {Escape: 27, Enter: 13, ArrowDown: 40, ArrowUp: 38};
            for (const type of ["keyDown", "keyUp"]) {
                await send("Input.dispatchKeyEvent", {type, key, code: key, windowsVirtualKeyCode: codes[key] ?? 0});
            }
            await sleep(200);
        },
        async screenshot(file, {fullPage = false} = {}) {
            const params = {format: "png"};
            if (fullPage) {
                const {cssContentSize} = await send("Page.getLayoutMetrics");
                params.clip = {x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1};
                params.captureBeyondViewport = true;
            }
            const {data} = await send("Page.captureScreenshot", params);
            writeFileSync(file, Buffer.from(data, "base64"));
        },
        close() {
            ws.close();
        },
    };
    return page;
}

// Launches Chrome, runs fn(page), always cleans up (the browser is killed by its own PID).
export async function run(fn, {port = 9333} = {}) {
    const {proc, userDir} = await launchChrome(port);
    const page = await openPage(port);
    try {
        await fn(page);
    } catch (e) {
        console.log(`FAIL (exception) ${e.message}`);
        process.exitCode = 1;
    } finally {
        page.close();
        proc.kill();
        await sleep(300);
        rmSync(userDir, {recursive: true, force: true});
    }
}

export function checker() {
    let failures = 0;
    return {
        ok(cond, label, detail = "") {
            console.log(`${cond ? "PASS" : "FAIL"} ${label}${detail ? ` | ${detail}` : ""}`);
            if (!cond) failures++;
        },
        done() {
            // run() reports an exception as FAIL and sets exitCode; that must not read as a pass.
            console.log(failures ? `${failures} check(s) failed` : process.exitCode ? "stopped by an exception (see FAIL above)" : "all checks passed");
            if (failures) process.exitCode = 1;
        },
    };
}

// Desktop only: clicks a tab in the tab row, the More menu, or (Changelog) the footer link.
export async function clickDesktopTab(page, key) {
    if (key === "changelog") {
        await page.click(".footerRight", {text: "Wiki version"});
        return;
    }
    const title = TAB_TITLES[key];
    const clicked = await page.eval(`(() => {
        const t = [...document.querySelectorAll(".tabs .tab")].find((e) => e.textContent.trim().startsWith(${JSON.stringify(title)}));
        if (!t) return false;
        t.click();
        return true;
    })()`);
    if (clicked) return;
    await page.click(".tabs .tab", {text: "More"});
    await page.click(".moreTabItem", {text: title});
}

export async function activeDesktopTab(page) {
    return page.eval(`document.querySelector(".tabs .tab.active")?.textContent.trim() ?? null`);
}

// Switches tab in place through the URL hash.
export async function openTab(page, key) {
    await page.eval(`location.hash = "#/${key}"`);
    await sleep(700);
}

// Visible elements whose box ends past the viewport's right (or starts past its left) edge. Exempt:
// content inside a horizontal scroller (auto/scroll, e.g. a swipe table: reachable by swiping), and
// content clipped by a hidden/clip box that sits strictly inside the screen (an intentional in-row
// truncation such as .uniqueName). A hidden/clip box flush with the screen edge (.appRoot, the
// edge-to-edge .listPanel) doesn't exempt anything: content cut off at the screen edge is a failure.
export const OVERFLOW_CHECK = `(() => {
    const vw = document.documentElement.clientWidth;
    const offenders = [];
    for (const el of document.querySelectorAll(".appRoot *, body > :not(#root):not(script)")) {
        if (!el.checkVisibility({opacityProperty: true, visibilityProperty: true})) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right <= vw + 0.5 && r.left >= -0.5) continue;
        let clipped = false;
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
            const ox = getComputedStyle(a).overflowX;
            if (ox === "visible") continue;
            const ar = a.getBoundingClientRect();
            const inside = ar.right <= vw + 0.5 && ar.left >= -0.5;
            const strictlyInside = ar.right < vw - 0.5 && ar.left > 0.5;
            if ((ox === "auto" || ox === "scroll") ? inside : strictlyInside) {
                clipped = true;
                break;
            }
        }
        if (!clipped) {
            offenders.push({tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 50),
                left: Math.round(r.left), right: Math.round(r.right), text: (el.textContent || "").trim().slice(0, 40)});
        }
    }
    return {vw, scrollWidth: document.documentElement.scrollWidth, count: offenders.length, offenders: offenders.slice(0, 12)};
})()`;
