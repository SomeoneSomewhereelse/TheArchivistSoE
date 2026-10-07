// Floating sticky header on the Affixes, Corruptions and Drop calculator tables.
// node check-sticky.mjs <screenshot dir>   (APP_URL = the branch's dev server)
// Desktop checks run first: touch emulation can't be switched back to hover: hover in one browser.
import {run, checker, BASE, sleep, OVERFLOW_CHECK} from "./cdp.mjs";

const OUT = process.argv[2] ?? ".";
const c = checker();

const COPY_ON = `document.querySelector(".floatingHead")?.classList.contains("on") ?? false`;

// Largest left-edge or width difference between the real header cells and the copied ones.
const MISALIGN = `(() => {
    const real = [...document.querySelector(".affixTableScroll thead tr").cells].map((e) => e.getBoundingClientRect());
    const copy = [...document.querySelector(".floatingHead thead tr").cells].map((e) => e.getBoundingClientRect());
    if (real.length !== copy.length) return 999;
    let worst = 0;
    real.forEach((r, i) => { worst = Math.max(worst, Math.abs(r.left - copy[i].left), Math.abs(r.width - copy[i].width)); });
    return Math.round(worst * 100) / 100;
})()`;

const COPY_TOP = `Math.round(document.querySelector(".floatingHead").getBoundingClientRect().top)`;

// Page scroll that puts the real header `past` px above the stick line (desktop: puts the box top there).
function scrollPast(past, {box = false} = {}) {
    return `(() => {
        const s = document.querySelector(".affixTableScroll");
        const el = ${box} ? s : s.querySelector("thead");
        const stick = parseFloat(getComputedStyle(document.querySelector(".floatingHead")).top) || 0;
        window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - stick + ${past});
        return new Promise((r) => setTimeout(r, 350));
    })()`;
}

// Page scroll that puts the table's end `above` px below the stick line.
function scrollToEnd(above) {
    return `(() => {
        const s = document.querySelector(".affixTableScroll");
        const end = Math.min(s.getBoundingClientRect().bottom, s.querySelector("table").getBoundingClientRect().bottom);
        const stick = parseFloat(getComputedStyle(document.querySelector(".floatingHead")).top) || 0;
        window.scrollTo(0, end + window.scrollY - stick - ${above});
        return new Promise((r) => setTimeout(r, 350));
    })()`;
}

// Scroll room below the table: the Affixes page is barely taller than a 1000px viewport, so without it
// the page can't scroll the table's top (or its end) past the stick line and the copy never shows.
const ROOM = `document.body.style.paddingBottom = "2000px"`;

async function openTable(page, tab, query = null) {
    // The Affixes sort is saved in localStorage, so a sort made by an earlier part of this run would carry
    // into the next page load and change what is on page 1 (column widths, where a Tip lands). Every
    // table starts from the default order, as it did before the sort was saved.
    await page.eval(`try { localStorage.removeItem("the-archivist-affix-sort"); } catch {}`);
    await page.goto(`${BASE}#/${tab}`);
    if (query !== null) {
        await page.waitFor(`!!document.querySelector('input[placeholder^="Enter item name"]')`);
        await page.type(`input[placeholder^="Enter item name"]`, query);
        await sleep(1500);
        await page.waitFor(`![...document.querySelectorAll(".table-message")].some((e) => e.textContent.includes("Calculating"))`, 120000);
        await sleep(500);
    } else {
        await page.waitFor(`document.querySelectorAll(".affixTableScroll tbody tr").length > 1`);
    }
    await page.eval(ROOM);
    await page.eval("window.scrollTo(0, 0)");
    await sleep(400);
}

// A real mouse click / hover at the centre of the nth match of selector.
async function mouseAt(page, selector, type) {
    const p = await page.eval(`(() => {
        const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();
        return r ? {x: r.left + r.width / 2, y: r.top + r.height / 2} : null;
    })()`);
    if (!p) throw new Error(`No element for ${selector}`);
    if (type === "click") {
        for (const t of ["mousePressed", "mouseReleased"]) {
            await page.send("Input.dispatchMouseEvent", {type: t, x: p.x, y: p.y, button: "left", clickCount: 1});
        }
    } else {
        await page.send("Input.dispatchMouseEvent", {type: "mouseMoved", x: p.x, y: p.y});
    }
    await sleep(400);
    return p;
}

const SORT_ARROW_ON_NAME = `!!document.querySelector(".affixTableScroll thead th:first-child .sortArrow")`;

await run(async (page) => {
    // ---------------- Desktop, 1500px ----------------
    await page.desktop(1500, 1000);
    for (const [tab, query] of [["affixes", null], ["corruptions", null], ["dropcalc", "Deathspade"]]) {
        await openTable(page, tab, query);
        c.ok(!(await page.eval(COPY_ON)), `desktop ${tab}: hidden at rest`);

        await page.eval(`(() => { document.querySelector(".affixTableScroll").scrollTop = 300; return new Promise((r) => setTimeout(r, 350)); })()`);
        c.ok(!(await page.eval(COPY_ON)), `desktop ${tab}: scrolling only the 800px box shows no copy`);
        await page.eval(`(() => { document.querySelector(".affixTableScroll").scrollTop = 0; return new Promise((r) => setTimeout(r, 350)); })()`);

        await page.eval(scrollPast(200, {box: true}));
        c.ok(await page.eval(COPY_ON), `desktop ${tab}: page scroll past the box top shows the copy`);
        c.ok((await page.eval(COPY_TOP)) === 0, `desktop ${tab}: copy at top 0`, String(await page.eval(COPY_TOP)));
        const mis = await page.eval(MISALIGN);
        c.ok(mis <= 0.5, `desktop ${tab}: copied cells line up`, `worst ${mis}px`);
        await page.screenshot(`${OUT}/sticky-desktop-${tab}.png`);

        await page.eval(scrollToEnd(20));
        c.ok(!(await page.eval(COPY_ON)), `desktop ${tab}: hidden once the table ends`);
    }

    // Affixes: sort from the copy, hover the right-most Tip on the copy.
    await openTable(page, "affixes");
    await page.eval(scrollPast(200, {box: true}));
    await mouseAt(page, ".floatingHead thead th:first-child", "click");
    c.ok(await page.eval(SORT_ARROW_ON_NAME), "desktop affixes: clicking the copied Name header sorts by Name");
    await page.eval(scrollPast(200, {box: true}));
    await mouseAt(page, ".floatingHead thead th:last-child .tipWrap", "hover");
    const tip = await page.eval(`(() => {
        const copy = document.querySelector(".floatingHead");
        const b = copy.querySelector("th:last-child .tipBubble");
        return {opacity: getComputedStyle(b).opacity, overflowY: getComputedStyle(copy).overflowY,
            below: b.getBoundingClientRect().bottom > copy.getBoundingClientRect().bottom};
    })()`);
    c.ok(tip.opacity === "1" && tip.overflowY === "visible" && tip.below, "desktop affixes: Req lvl Tip bubble shows below the copy", JSON.stringify(tip));
    await page.screenshot(`${OUT}/sticky-desktop-reqlvl-tip.png`);
    await page.send("Input.dispatchMouseEvent", {type: "mouseMoved", x: 0, y: 0});

    // Short table: "Shako" finds no unique, so the Drop calculator shows a single message row while its
    // box stays 400px tall. With the table's end just under the stick line and the box reaching far below
    // it, the copy must hide: it follows the table, not the box.
    await openTable(page, "dropcalc", "Shako");
    const short = await page.eval(`(() => {
        const s = document.querySelector(".affixTableScroll");
        const head = s.querySelector("thead").getBoundingClientRect();
        window.scrollTo(0, s.querySelector("table").getBoundingClientRect().bottom + window.scrollY - 10);
        return new Promise((r) => setTimeout(() => r({
            on: ${COPY_ON},
            tableBottom: Math.round(s.querySelector("table").getBoundingClientRect().bottom),
            boxBottom: Math.round(s.getBoundingClientRect().bottom),
            headHeight: head.height,
        }), 350));
    })()`);
    c.ok(short.boxBottom > short.headHeight * 3, "desktop dropcalc (short table): the box reaches well below the line (precondition)", JSON.stringify(short));
    c.ok(!short.on, "desktop dropcalc (short table): no copy over the empty part of the 400px box", JSON.stringify(short));

    // Damnation toggle with the copy showing: the table changes, the copy re-syncs or hides.
    await openTable(page, "dropcalc", "Deathspade");
    await page.eval(scrollPast(200, {box: true}));
    await page.eval(`document.querySelector(".topBarToggle input").click()`);
    await sleep(1500);
    await page.waitFor(`![...document.querySelectorAll(".table-message")].some((e) => e.textContent.includes("Calculating"))`, 120000);
    await page.eval(`new Promise((r) => setTimeout(r, 500))`);
    const damnOn = await page.eval(COPY_ON);
    const damnMis = damnOn ? await page.eval(MISALIGN) : 0;
    c.ok(!damnOn || damnMis <= 0.5, "desktop dropcalc: Damnation toggle leaves the copy hidden or aligned", `on=${damnOn} worst ${damnMis}px`);
    await page.eval(`document.querySelector(".topBarToggle input").click()`);
    await sleep(1500);

    // Narrower desktop: Affixes scrolls sideways; the copy follows scrollLeft.
    await page.desktop(1100, 900);
    await openTable(page, "affixes");
    const sideways = await page.eval(`(() => { const s = document.querySelector(".affixTableScroll"); return s.scrollWidth > s.clientWidth; })()`);
    c.ok(sideways, "desktop 1100px affixes: table scrolls sideways (precondition)");
    await page.eval(`(() => { document.querySelector(".affixTableScroll").scrollLeft = 200; return new Promise((r) => setTimeout(r, 350)); })()`);
    await page.eval(scrollPast(200, {box: true}));
    const narrowMis = await page.eval(MISALIGN);
    c.ok((await page.eval(COPY_ON)) && narrowMis <= 0.5, "desktop 1100px affixes: copy follows scrollLeft", `worst ${narrowMis}px`);

    // Crossing 980px with the copy showing: the stick line moves from 0 to the top bar's bottom.
    await page.desktop(900, 900);
    await sleep(400);
    await page.eval(scrollPast(300));
    const crossed = await page.eval(`({top: ${COPY_TOP}, bar: Math.round(document.querySelector(".tabsPanel").getBoundingClientRect().bottom), on: ${COPY_ON}})`);
    // The bar can be taller than --topbar-h (53px at 900px); the copy follows its real height.
    c.ok(crossed.on && crossed.top === crossed.bar && crossed.bar >= 52, "900px affixes: copy right under the pinned bar", JSON.stringify(crossed));

    // ---------------- Phone, 390x844 ----------------
    await page.mobile();
    for (const [tab, query] of [["affixes", null], ["corruptions", null], ["dropcalc", "Deathspade"]]) {
        await openTable(page, tab, query);
        c.ok(!(await page.eval(COPY_ON)), `phone ${tab}: hidden at rest`);

        await page.eval(scrollPast(1000));
        const pos = await page.eval(`({top: ${COPY_TOP}, bar: Math.round(document.querySelector(".tabsPanel").getBoundingClientRect().bottom), on: ${COPY_ON}})`);
        c.ok(pos.on && pos.top === 52 && pos.bar === 52, `phone ${tab}: copy at 52px under a 52px bar`, JSON.stringify(pos));

        await page.eval(`(() => { document.querySelector(".affixTableScroll").scrollLeft = 250; return new Promise((r) => setTimeout(r, 350)); })()`);
        const mis = await page.eval(MISALIGN);
        c.ok(mis <= 0.5, `phone ${tab}: after a sideways swipe the copy (corner included) lines up`, `worst ${mis}px`);
        await page.screenshot(`${OUT}/sticky-phone-${tab}.png`);

        const overflow = await page.eval(OVERFLOW_CHECK);
        c.ok(overflow.count === 0, `phone ${tab}: no horizontal overflow`, JSON.stringify(overflow.offenders));

        await page.eval(scrollToEnd(20));
        c.ok(!(await page.eval(COPY_ON)), `phone ${tab}: hidden once the table ends`);
    }

    // Affixes on the phone: sort and Tip from the copy, page change, tab sheet, rotation.
    await openTable(page, "affixes");
    await page.eval(scrollPast(1000));
    await page.eval(`(() => { document.querySelector(".affixTableScroll").scrollLeft = 0; return new Promise((r) => setTimeout(r, 350)); })()`);
    let p = await page.eval(`(() => { const r = document.querySelector(".floatingHead thead th:first-child").getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; })()`);
    await page.tapAt(p.x, p.y);
    c.ok(await page.eval(SORT_ARROW_ON_NAME), "phone affixes: tapping the copied Name header sorts by Name");

    await page.eval(scrollPast(1000));
    p = await page.eval(`(() => { const r = document.querySelector(".floatingHead thead th:nth-child(3) .tipWrap").getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; })()`);
    await page.tapAt(p.x, p.y);
    const touchTip = await page.eval(`(() => {
        const w = document.querySelector(".floatingHead thead th:nth-child(3) .tipWrap");
        const b = w.querySelector(".tipBubble");
        const r = b.getBoundingClientRect();
        return {open: w.classList.contains("open"), position: getComputedStyle(b).position, opacity: getComputedStyle(b).opacity,
            inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth};
    })()`);
    c.ok(touchTip.open && touchTip.position === "fixed" && touchTip.opacity === "1" && touchTip.inView, "phone affixes: tapping a copied Tip opens the bottom bubble", JSON.stringify(touchTip));
    await page.screenshot(`${OUT}/sticky-phone-tip.png`);

    await page.eval(`[...document.querySelectorAll(".affixPagerBottom button")].find((b) => b.textContent.includes("Next")).click()`);
    await sleep(500);
    await page.eval(scrollPast(1000));
    const pageMis = await page.eval(MISALIGN);
    c.ok((await page.eval(COPY_ON)) && pageMis <= 0.5, "phone affixes: page 2 re-syncs the copy", `worst ${pageMis}px`);

    await page.eval(`document.querySelector(".tabMenuBtn").click()`);
    await sleep(500);
    const covered = await page.eval(`(() => {
        const r = document.querySelector(".floatingHead").getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !top?.closest(".floatingHead");
    })()`);
    c.ok(covered, "phone affixes: the tab sheet covers the copy");
    await page.screenshot(`${OUT}/sticky-phone-sheet.png`);
    await page.key("Escape");
    await page.eval(`document.querySelector(".tabSheetBackdrop")?.click()`);
    await sleep(400);

    await page.send("Emulation.setDeviceMetricsOverride", {width: 844, height: 390, deviceScaleFactor: 2, mobile: true});
    await sleep(600);
    await page.eval(scrollPast(400));
    const rotMis = await page.eval(MISALIGN);
    c.ok((await page.eval(COPY_ON)) && rotMis <= 0.5, "phone affixes rotated 844x390: copy aligned", `worst ${rotMis}px`);
});
c.done();
