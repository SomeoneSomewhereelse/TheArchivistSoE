// Multi-field sorting on the Affixes table. node check-multisort.mjs <screenshot dir>
// APP_URL = a dev server with the multi-sort feature (it fails on code without the sort bar). Fresh
// browser profile, so localStorage starts empty.
// Desktop checks run first: touch emulation can't be switched back to hover: hover in one browser.
import {run, checker, BASE, sleep, OVERFLOW_CHECK} from "./cdp.mjs";

const OUT = process.argv[2] ?? ".";
const c = checker();
const STORAGE_KEY = "the-archivist-affix-sort";
const URL_AFFIXES = `${BASE}#/affixes`;
const HEADERS = ["Name", "Attributes", "Lvl", "Grp", "Rares", "Freq", "Max lvl", "Item types",
    "Excluded item types", "Class", "Req lvl"];
const COL = {name: 0, attrs: 1, level: 2, group: 3, rare: 4, freq: 5, maxLevel: 6, types: 7, excluded: 8, class: 9, reqLevel: 10};
const TH = ".affixTableScroll thead th";

// Everything the sort UI shows. `markers` / `aria` are {header text: value} for the cells that have one.
const STATE = `(() => {
    const bar = document.querySelector(".affixSortBar");
    const ths = [...document.querySelectorAll(${JSON.stringify(TH)})];
    const text = (e) => e.textContent.replace(/\\s+/g, " ").trim();
    // The label text alone: without the Tip bubble's text and the sort marker.
    const headers = ths.map((th) => {
        const label = th.querySelector(".thLabel").cloneNode(true);
        label.querySelectorAll(".tipBubble, .sortArrow").forEach((e) => e.remove());
        return text(label);
    });
    const pick = (values) => Object.fromEntries(headers.map((h, i) => [h, values[i]]).filter(([, v]) => v));
    return {
        chips: [...document.querySelectorAll(".affixSortBar .sortChipFlip")].map(text),
        def: bar?.querySelector(".sortDefault") ? text(bar.querySelector(".sortDefault")) : null,
        reset: !!bar?.querySelector(".sortReset"),
        multi: bar?.querySelector(".multiSortToggle input")?.checked ?? null,
        headers,
        markers: pick(ths.map((th) => th.querySelector(".sortArrow")?.textContent ?? "")),
        copyMarkers: pick([...document.querySelectorAll(".floatingHead thead th")].map((th) => th.querySelector(".sortArrow")?.textContent ?? "")),
        aria: pick(ths.map((th) => th.getAttribute("aria-sort") ?? "")),
        page: document.querySelector(".affixPager .affixPagerInfo")?.textContent ?? "",
        rows: document.querySelectorAll(".affixTableScroll tbody tr").length,
        failed: !!document.querySelector(".errorPanel"),
    };
})()`;

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Null when the rendered rows follow `keys` ([{col, dir, numeric}]) with remaining ties in the
// incoming order (item-types text, then name, both lowercased); otherwise the first offending row.
function orderCheck(keys) {
    return `(() => {
        const keys = ${JSON.stringify(keys)};
        const rows = [...document.querySelectorAll(".affixTableScroll tbody tr")].map((tr) => [...tr.cells].map((td) => td.textContent.trim()));
        const num = (s) => (s === "" ? -Infinity : Number(s));
        const cmpText = (x, y) => (x === "" && y === "") ? 0 : x === "" ? -1 : y === "" ? 1 : Math.sign(x.localeCompare(y));
        for (let i = 1; i < rows.length; i++) {
            const a = rows[i - 1], b = rows[i];
            let cmp = 0;
            for (const k of keys) {
                const x = a[k.col], y = b[k.col];
                if (k.numeric) {
                    const p = num(x), q = num(y);
                    cmp = p === q ? 0 : p < q ? -1 : 1;
                } else {
                    cmp = cmpText(x, y);
                }
                if (k.dir === "desc") cmp = -cmp;
                if (cmp !== 0) break;
            }
            if (cmp === 0) {
                cmp = Math.sign(a[${COL.types}].toLowerCase().localeCompare(b[${COL.types}].toLowerCase()))
                    || Math.sign(a[${COL.name}].toLowerCase().localeCompare(b[${COL.name}].toLowerCase()));
            }
            if (cmp > 0) return {row: i, prev: a.slice(0, 4), next: b.slice(0, 4)};
        }
        return null;
    })()`;
}

const FIRST_NAMES = `[...document.querySelectorAll(".affixTableScroll tbody tr")].slice(0, 10).map((tr) => tr.cells[0].textContent.trim()).join("|")`;
const COPY_ON = `document.querySelector(".floatingHead")?.classList.contains("on") ?? false`;

// Scroll room below the table: the Affixes page is barely taller than a 1000px viewport, so without it
// the page can't scroll the table's top past the stick line and the floating header never shows.
async function freshAffixes(page) {
    await page.goto(URL_AFFIXES);
    await page.waitFor(`document.querySelectorAll(".affixTableScroll tbody tr").length > 1`);
    await page.eval(`document.body.style.paddingBottom = "2000px"`);
    await page.eval("window.scrollTo(0, 0)");
    await sleep(400);
}

async function clickHeader(page, label) {
    await page.click(TH, {nth: HEADERS.indexOf(label)});
    await sleep(300);
}

async function state(page) {
    return page.eval(STATE);
}

await run(async (page) => {
    // ---------------- Desktop, 1500px ----------------
    await page.desktop(1500, 1000);
    await page.goto(URL_AFFIXES);
    await page.eval(`localStorage.removeItem(${JSON.stringify(STORAGE_KEY)})`);
    await freshAffixes(page);

    let s = await state(page);
    c.ok(same(s.headers, HEADERS), "desktop: header texts unchanged, in order", JSON.stringify(s.headers));
    c.ok(s.def === "Attributes ▲ (default)" && s.chips.length === 0 && !s.reset && s.multi === false,
        "desktop at rest: default label, no chips, no Reset, switch off", JSON.stringify(s));
    c.ok(same(s.markers, {Attributes: "▲"}) && same(s.aria, {Attributes: "ascending"}),
        "desktop at rest: lone ▲ and aria-sort on Attributes only", JSON.stringify([s.markers, s.aria]));
    await page.screenshot(`${OUT}/multisort-desktop-rest.png`);

    // Plain clicks: replace, flip the sole key, replace again.
    await clickHeader(page, "Grp");
    s = await state(page);
    c.ok(same(s.chips, ["Grp ▲"]) && same(s.markers, {Grp: "▲"}) && s.reset, "plain: Grp → [Grp ▲]", JSON.stringify(s.chips));
    await clickHeader(page, "Grp");
    s = await state(page);
    c.ok(same(s.chips, ["Grp ▼"]) && same(s.markers, {Grp: "▼"}), "plain: Grp again → [Grp ▼]", JSON.stringify(s.chips));
    await clickHeader(page, "Lvl");
    s = await state(page);
    c.ok(same(s.chips, ["Lvl ▲"]), "plain: Lvl → [Lvl ▲]", JSON.stringify(s.chips));
    let bad = await page.eval(orderCheck([{col: COL.level, dir: "asc", numeric: true}]));
    c.ok(bad === null, "plain: rows ordered by Lvl ▲, ties in incoming order", JSON.stringify(bad));

    await page.click(".affixSortBar .sortReset");
    s = await state(page);
    c.ok(s.def === "Attributes ▲ (default)" && s.chips.length === 0 && !s.reset, "Reset → default", JSON.stringify(s));

    // Multi: append, flip in place.
    await page.click(".multiSortToggle input");
    await clickHeader(page, "Grp");
    await clickHeader(page, "Lvl");
    await clickHeader(page, "Lvl");
    s = await state(page);
    c.ok(same(s.chips, ["Grp ▲", "Lvl ▼"]), "multi: Grp, Lvl, Lvl → Grp ▲ › Lvl ▼", JSON.stringify(s.chips));
    c.ok(same(s.markers, {Lvl: "2▼", Grp: "1▲"}) || same(s.markers, {Grp: "1▲", Lvl: "2▼"}), "multi: header markers 1▲ / 2▼", JSON.stringify(s.markers));
    c.ok(same(s.aria, {Grp: "ascending"}), "multi: aria-sort on the first key only", JSON.stringify(s.aria));
    c.ok(same(s.copyMarkers, s.markers), "multi: floating header shows the same markers", JSON.stringify(s.copyMarkers));
    bad = await page.eval(orderCheck([{col: COL.group, dir: "asc", numeric: true}, {col: COL.level, dir: "desc", numeric: true}]));
    c.ok(bad === null, "multi: rows ordered by Grp ▲ then Lvl ▼, then incoming order", JSON.stringify(bad));
    await page.screenshot(`${OUT}/multisort-desktop-multi.png`);

    // Chips: flip, remove, remove the last.
    await page.click(".affixSortBar .sortChipFlip", {nth: 0});
    s = await state(page);
    c.ok(same(s.chips, ["Grp ▼", "Lvl ▼"]), "chip flip: Grp ▼ › Lvl ▼", JSON.stringify(s.chips));
    await page.click(".affixSortBar .sortChipRemove", {nth: 0});
    s = await state(page);
    c.ok(same(s.chips, ["Lvl ▼"]) && same(s.markers, {Lvl: "▼"}), "chip ×: [Lvl ▼], lone arrow again", JSON.stringify([s.chips, s.markers]));
    await page.click(".affixSortBar .sortChipRemove", {nth: 0});
    s = await state(page);
    c.ok(s.def === "Attributes ▲ (default)" && s.chips.length === 0, "removing the last chip → default label", JSON.stringify(s));

    // Multi on, empty list, Attributes: becomes a real chip; rows don't move.
    const before = await page.eval(FIRST_NAMES);
    await clickHeader(page, "Attributes");
    s = await state(page);
    c.ok(same(s.chips, ["Attributes ▲"]) && (await page.eval(FIRST_NAMES)) === before,
        "multi, empty list, Attributes → [Attributes ▲], rows unchanged", JSON.stringify(s.chips));
    await page.click(".affixSortBar .sortReset");
    await page.click(".multiSortToggle input");

    // Any sort change goes back to page 1.
    for (let i = 0; i < 2; i++) await page.click(".affixPager:not(.affixPagerBottom) button", {text: "Next"});
    s = await state(page);
    c.ok(s.page.startsWith("Page 3 /"), "pager on page 3 (precondition)", s.page);
    await clickHeader(page, "Grp");
    s = await state(page);
    c.ok(s.page.startsWith("Page 1 /"), "a sort change from page 3 → page 1", s.page);

    // Deep inside the 800px box, the real sticky header sorts and the box returns to its top; the page stays put.
    await page.eval(`(() => { window.scrollTo(0, 0); document.querySelector(".affixTableScroll").scrollTop = 400; return new Promise((r) => setTimeout(r, 350)); })()`);
    await clickHeader(page, "Lvl");
    const box = await page.eval(`({top: document.querySelector(".affixTableScroll").scrollTop, y: window.scrollY, on: ${COPY_ON}})`);
    c.ok(box.top === 0 && box.y === 0 && !box.on, "sorting deep in the 800px box resets its scrollTop, page unmoved", JSON.stringify(box));

    // From the floating header deep in the page: the table top comes back into view.
    await page.eval(`(() => {
        const w = document.querySelector(".affixTableScroll");
        window.scrollTo(0, w.getBoundingClientRect().top + window.scrollY + 200);
        return new Promise((r) => setTimeout(r, 400));
    })()`);
    c.ok(await page.eval(COPY_ON), "floating header showing (precondition)");
    const p = await page.eval(`(() => { const r = document.querySelector(".floatingHead thead th:nth-child(6)").getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2}; })()`);
    for (const type of ["mousePressed", "mouseReleased"]) {
        await page.send("Input.dispatchMouseEvent", {type, x: p.x, y: p.y, button: "left", clickCount: 1});
    }
    await sleep(600);
    const back = await page.eval(`({top: Math.round(document.querySelector(".affixTableWrapper").getBoundingClientRect().top), chips: [...document.querySelectorAll(".affixSortBar .sortChipFlip")].map((b) => b.textContent.trim())})`);
    c.ok(Math.abs(back.top) <= 2 && same(back.chips, ["Freq ▲"]), "sorting from the floating header scrolls the table top into view", JSON.stringify(back));

    // Persistence: reload restores the list, the switch starts off.
    await page.click(".multiSortToggle input");
    await clickHeader(page, "Grp");
    const saved = (await state(page)).chips;
    await freshAffixes(page);
    s = await state(page);
    c.ok(same(s.chips, saved) && saved.length === 2 && s.multi === false, "reload restores the sort list, switch off", JSON.stringify([saved, s.chips, s.multi]));

    // A corrupt stored value loads the default.
    await page.eval(`localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, "{nope")`);
    await freshAffixes(page);
    s = await state(page);
    c.ok(s.def === "Attributes ▲ (default)" && !s.failed && s.rows > 1, "corrupt stored value → default, table renders", JSON.stringify(s));

    // ---------------- Phone, 390x844 ----------------
    await page.mobile();
    await page.eval(`localStorage.removeItem(${JSON.stringify(STORAGE_KEY)})`);
    await freshAffixes(page);

    const overflow = await page.eval(OVERFLOW_CHECK);
    c.ok(overflow.count === 0, "phone: no horizontal overflow at rest", JSON.stringify(overflow.offenders));

    await page.tap(".multiSortToggle");
    s = await state(page);
    c.ok(s.multi === true, "phone: tapping the Multi-sort switch turns it on");
    await page.tap(TH, {nth: HEADERS.indexOf("Grp")});
    await page.tap(TH, {nth: HEADERS.indexOf("Lvl")});
    await page.tapAt(5, 300); // close the Lvl Tip bubble the tap opened
    s = await state(page);
    c.ok(same(s.chips, ["Grp ▲", "Lvl ▲"]), "phone: header taps append Grp, Lvl", JSON.stringify(s.chips));

    await page.eval("window.scrollTo(0, 0)");
    await sleep(300);
    const sizes = await page.eval(`[...document.querySelectorAll(".affixSortBar .sortChipFlip, .affixSortBar .sortChipRemove, .affixSortBar .sortReset, .multiSortToggle")].map((e) => Math.round(e.getBoundingClientRect().height))`);
    c.ok(sizes.length >= 6 && sizes.every((h) => h >= 32), "phone: chips, Reset and the switch are ≥ 32px tall", JSON.stringify(sizes));
    const overflow2 = await page.eval(OVERFLOW_CHECK);
    c.ok(overflow2.count === 0, "phone: no horizontal overflow with chips", JSON.stringify(overflow2.offenders));
    await page.screenshot(`${OUT}/multisort-phone-chips.png`);

    await page.tap(".affixSortBar .sortChipFlip", {nth: 0});
    await page.tap(".affixSortBar .sortChipRemove", {nth: 1});
    s = await state(page);
    c.ok(same(s.chips, ["Grp ▼"]), "phone: chip tap flips, × removes", JSON.stringify(s.chips));

    // Swiped sideways and deep in the table: a tap on a copied header appends it, the table top comes back
    // under the pinned bar, and the sideways position is kept.
    await page.eval(`(() => {
        const sc = document.querySelector(".affixTableScroll");
        sc.scrollLeft = 300;
        window.scrollTo(0, sc.querySelector("thead").getBoundingClientRect().top + window.scrollY + 1000);
        return new Promise((r) => setTimeout(r, 400));
    })()`);
    c.ok(await page.eval(COPY_ON), "phone: floating header showing (precondition)");
    const target = await page.eval(`(() => {
        const cells = [...document.querySelectorAll(".floatingHead thead th")];
        const pinned = cells[0].getBoundingClientRect().right;
        const i = cells.findIndex((th, k) => {
            const r = th.getBoundingClientRect();
            return k > 0 && k !== ${COL.group} && r.left > pinned && r.right < innerWidth;
        });
        const r = cells[i].getBoundingClientRect();
        return {i, x: r.left + r.width / 2, y: r.top + r.height / 2};
    })()`);
    await page.tapAt(target.x, target.y);
    await page.tapAt(5, 300);
    await sleep(400);
    const after = await page.eval(`({
        chips: [...document.querySelectorAll(".affixSortBar .sortChipFlip")].map((b) => b.textContent.trim()),
        top: document.querySelector(".affixTableWrapper").getBoundingClientRect().top,
        bar: document.querySelector(".tabsPanel").getBoundingClientRect().bottom,
        left: document.querySelector(".affixTableScroll").scrollLeft,
    })`);
    c.ok(after.chips.length === 2 && after.chips[1].startsWith(HEADERS[target.i]), "phone: tapping a copied header appends it", JSON.stringify([target, after.chips]));
    c.ok(Math.abs(after.top - (after.bar + 4)) <= 2, "phone: the table top is back under the pinned bar", JSON.stringify(after));
    c.ok(after.left === 300, "phone: sideways scroll position kept", String(after.left));

    await page.tap(".affixSortBar .sortReset");
    s = await state(page);
    c.ok(s.def === "Attributes ▲ (default)", "phone: Reset → default", JSON.stringify(s.chips));
});
c.done();
