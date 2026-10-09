// The Item Builder tab end to end: picking, group locks, caps, crafted levels, links, history, level
// input, Ctrl+F, and the phone layout (pinned bar, no horizontal overflow).
// node check-itembuilder.mjs   (APP_URL = a dev server)
import {run, checker, BASE, sleep, clickDesktopTab, OVERFLOW_CHECK} from "./cdp.mjs";

const c = checker();
const state = (page) => page.eval(`({
    hash: location.hash,
    title: document.querySelector(".ibTitle")?.textContent ?? null,
    filled: [...document.querySelectorAll(".ibSlot.filled .ibAffixName")].map((e) => e.textContent),
    notice: document.querySelector(".ibNotice")?.textContent ?? null,
    base: document.querySelector(".ibBase .selTrigger span")?.className === "placeholder" ? "" : (document.querySelector(".ibBase .selTrigger span")?.textContent ?? null),
})`);
// The base picker is the app's SearchableSelect: open it, filter by the base's label, click its option.
let baseLabels = null; // code -> "Name · qlvl N", read from the same data file the app loads
const selectBase = async (page, code) => {
    baseLabels ??= await page.eval(`fetch("data/standard/ItemBuilder.json").then((r) => r.json()).then((j) => Object.fromEntries(j.bases.map((b) => [b.code, b.name + " · qlvl " + b.qlvl])))`);
    const label = baseLabels[code];
    if (!label) throw new Error(`No base ${code}`);
    await page.click(".ibControls .selTrigger");
    await page.waitFor(`!!document.querySelector(".ibControls .selSearchInput")`);
    await page.type(".ibControls .selSearchInput", label);
    const hit = await page.eval(`(() => { const o = [...document.querySelectorAll(".ibControls .selOption")].filter((e) => e.textContent === ${JSON.stringify(label)}); if (o.length !== 1) return o.length; o[0].click(); return 1; })()`);
    if (hit !== 1) throw new Error(`Base ${code} (${label}) matched ${hit} options`);
    await sleep(300);
};
// Picks up to n free rows of one side ("Prefix" or "Suffix") from the merged list, found by the row's
// tag; stops early when none is left (a group can lock the rest).
const pickFree = async (page, n, side) => {
    for (let i = 0; i < n; i++) {
        const ok = await page.eval(`(() => { const r = [...document.querySelectorAll(".ibRow.free")].find((e) => e.querySelector(".ibRowMeta").textContent.startsWith(${JSON.stringify(side)})); if (!r) return false; r.click(); return true; })()`);
        if (!ok) break;
        await sleep(200);
    }
};
const typeNth = async (page, selector, nth, text) => {
    await page.eval(`(() => { const el = document.querySelectorAll(${JSON.stringify(selector)})[${nth}]; el.focus(); el.select(); })()`);
    await page.send("Input.insertText", {text});
    await sleep(250);
};

await run(async (page) => {
    // Desktop first: hover checks must run before any touch emulation (CLAUDE.md).
    await page.desktop();
    await page.goto(BASE + "#/itembuilder");
    await page.waitFor(`!!document.querySelector(".ibBase .selTrigger")`);
    const aria = await page.eval(`document.querySelector(".ibControls .selTrigger").getAttribute("aria-label")`);
    c.ok(/^Base item/.test(aria ?? ""), "the base picker's trigger has an accessible name", String(aria));
    const v = await page.eval(`fetch("data/standard/ItemBuilder.json").then((r) => r.json()).then((j) => j.linkVersion)`);

    // The base filter (Change 1): a group's name matches all of its members, headings are not options.
    await page.click(".ibControls .selTrigger");
    await page.type(".ibControls .selSearchInput", "bow");
    const bowList = await page.eval(`({
        options: [...document.querySelectorAll(".ibControls .selOption")].map((e) => e.textContent),
        groups: [...document.querySelectorAll(".ibControls .selGroup")].map((e) => e.textContent),
    })`);
    c.ok(bowList.options.some((o) => /^Arbalest\b/.test(o)) && bowList.options.some((o) => /^Ballista\b/.test(o)) && bowList.groups.includes("Crossbows"),
        "typing 'bow' in the base filter lists Crossbows bases whose names lack 'bow' under a Crossbows heading", JSON.stringify(bowList.groups));
    c.ok(bowList.options.every((o) => !/^Choose/.test(o)) && bowList.groups.length >= 3, "the filter keeps only matching groups with their headings", JSON.stringify(bowList.groups));
    await page.screenshot("shots/itembuilder-desktop-dropdown.png");
    await page.click(".ibControls .selTrigger"); // closes it

    // Picking, group lock, full side.
    await selectBase(page, "cst");
    await page.click(".ibQualityBtn", {text: "Rare"});
    await page.click(`.ibRow[data-key="p352"]`);
    let s = await state(page);
    c.ok(s.hash === `#/itembuilder?v=${v}&b=cst&q=r&a=p352`, "picking writes the build to the hash", s.hash);
    const tags = await page.eval(`(() => { const t = [...document.querySelectorAll(".ibRowMeta")].map((e) => e.textContent.split(" · ")[0]); return {prefix: t.filter((x) => x === "Prefix").length, suffix: t.filter((x) => x === "Suffix").length, other: t.filter((x) => x !== "Prefix" && x !== "Suffix").length, tabs: document.querySelectorAll(".ibSideTab").length}; })()`);
    c.ok(tags.prefix > 0 && tags.suffix > 0 && tags.other === 0 && tags.tabs === 0, "one merged list: rows carry Prefix and Suffix tags, no side tabs", JSON.stringify(tags));
    const why = await page.eval(`document.querySelector('.ibRow[data-key="p354"] .ibWhy')?.textContent`);
    c.ok(why === "Group taken by Lapis", "a taken group greys its other members with the reason", why);
    await pickFree(page, 2, "Prefix");
    const full = await page.eval(`[...document.querySelectorAll(".ibRow.full .ibWhy")].length > 0`);
    c.ok(full, "a full side greys the remaining rows as 'Slots full'");

    // Base change drops what no longer fits (Review Focus 2).
    await selectBase(page, "cm3");
    s = await state(page);
    c.ok(s.title === "Magic Grand Charm" && s.filled.length === 0 && /no longer fit/.test(s.notice ?? ""),
        "switching to a magic-only charm drops the picks with a notice", JSON.stringify(s));
    c.ok(await page.eval(`!document.querySelector(".ibQuality")`), "a charm shows no quality control");

    // Crafted: two level inputs, total of 4.
    await selectBase(page, "rin");
    await page.click(".ibQualityBtn", {text: "Crafted"});
    const labels = await page.eval(`[...document.querySelectorAll(".ibLevel span")].map((e) => e.textContent)`);
    c.ok(JSON.stringify(labels) === JSON.stringify(["clvl", "ingredient ilvl"]), "crafted shows clvl and ingredient ilvl", labels.join(", "));
    await pickFree(page, 3, "Prefix");
    await pickFree(page, 1, "Suffix");
    const crafted = await page.eval(`({
        reached: [...document.querySelectorAll(".ibSlot")].some((e) => e.textContent === "total reached"),
        free: document.querySelectorAll(".ibRow.free").length,
    })`);
    c.ok(crafted.reached && crafted.free === 0, "4 crafted affixes close both sides", JSON.stringify(crafted));

    // Level input (Review Focus 1): clearing or 0 keeps the build; blur restores the value.
    await page.click(".ibQualityBtn", {text: "Rare"});
    const before = (await state(page)).hash;
    await typeNth(page, ".ibLevelInput", 0, "0");
    c.ok((await state(page)).hash === before, "typing 0 in ilvl does not change the build");
    await page.eval(`document.querySelector(".ibLevelInput").blur()`);
    await sleep(200);
    c.ok(await page.eval(`document.querySelector(".ibLevelInput").value === "99"`), "leaving the field shows the last valid ilvl");
    await typeNth(page, ".ibLevelInput", 0, "4"); // two separate keystrokes, like a person typing
    await page.send("Input.insertText", {text: "0"});
    await sleep(200);
    c.ok((await state(page)).hash === before, "typing does not commit before the field is left");
    await page.eval(`document.querySelector(".ibLevelInput").blur()`);
    await sleep(200);
    c.ok(/&il=40/.test((await state(page)).hash), "leaving the field commits ilvl 40");

    // Reload restores the build.
    s = await state(page);
    await page.goto(BASE + s.hash);
    await page.waitFor(`!!document.querySelector(".ibTitle")`);
    const reloaded = await state(page);
    c.ok(reloaded.hash === s.hash && JSON.stringify(reloaded.filled) === JSON.stringify(s.filled), "a reload restores the build", reloaded.hash);

    // History (Review Focus 3): picks replace, Back leaves the tab, the build survives other tabs.
    const lapisLink = `#/itembuilder?v=${v}&b=cst&q=r&a=p352`;
    await page.goto(BASE + "#/weapons");
    await page.waitFor(`!!document.querySelector(".tabs .tab")`);
    await page.eval(`location.hash = ${JSON.stringify(lapisLink)}`);
    await page.waitFor(`!!document.querySelector(".ibTitle")`);
    await page.click(`.ibRow[data-key="p354"]`); // greyed by Lapis's group: a disabled button, so no change
    await page.click(`.ibRow[data-key="p352"]`); // drops Lapis
    await page.click(`.ibRow[data-key="p354"]`); // picks Cobalt
    c.ok((await state(page)).hash === `#/itembuilder?v=${v}&b=cst&q=r&a=p354`, "picks replace the hash in place");
    await page.eval("history.back()");
    await sleep(500);
    c.ok(await page.eval(`location.hash === "#/weapons"`), "Back after picks returns to the previous tab");
    // Click the tab, as a person would: setting location.hash = "#/itembuilder" (what openTab does) is a
    // navigation to a bare builder link, which opens an empty build by design.
    await clickDesktopTab(page, "itembuilder");
    await sleep(300);
    s = await state(page);
    c.ok(JSON.stringify(s.filled) === JSON.stringify(["Cobalt"]), "returning to the tab shows the build", JSON.stringify(s.filled));

    // Ctrl+F (Review Focus 5).
    for (const type of ["keyDown", "keyUp"]) {
        await page.send("Input.dispatchKeyEvent", {type, key: "f", code: "KeyF", modifiers: 2, windowsVirtualKeyCode: 70});
    }
    await sleep(200);
    c.ok(await page.eval(`document.activeElement?.classList.contains("ibSearch")`), "Ctrl+F focuses the affix search");
    await typeNth(page, ".ibSearch", 0, "cold resist");
    const matches = await page.eval(`(() => { const rows = [...document.querySelectorAll(".ibRow")]; return rows.length > 0 && rows.every((r) => /cold resist/i.test(r.textContent)); })()`);
    c.ok(matches, "the search matches stat text (e.g. 'Cold Resist +16-20%')");

    // Doctored and old links.
    await page.goto(`${BASE}#/itembuilder?v=${v}&b=cst&q=r&a=p352-p352-p999999-s0x`);
    await page.waitFor(`!!document.querySelector(".ibNotice")`);
    s = await state(page);
    c.ok(/no longer fit/.test(s.notice) && s.hash === `#/itembuilder?v=${v}&b=cst&q=r&a=p352`, "a doctored link is cleaned with a notice", s.hash);
    await page.goto(`${BASE}#/itembuilder?v=0&b=cst`);
    await page.waitFor(`!!document.querySelector(".ibNotice")`);
    s = await state(page);
    c.ok(s.notice === "This link was made for older game data and can't be opened." && s.hash === "#/itembuilder" && s.base === "Choose a base item…",
        "an old link opens blank with the old-data notice", JSON.stringify(s));

    // Phone (Review Focus 4): skill affixes on an amulet, no overflow, pinned bar.
    await page.mobile();
    await page.goto(BASE + "#/itembuilder");
    await page.waitFor(`!!document.querySelector(".ibBase .selTrigger")`);
    await selectBase(page, "amu");
    await page.click(".ibQualityBtn", {text: "Rare"});
    await typeNth(page, ".ibSearch", 0, "skills"); // skill prefixes share group 125: one pick, the rest greyed with a reason
    await pickFree(page, 3, "Prefix");
    const overflow = await page.eval(OVERFLOW_CHECK);
    c.ok(overflow.count === 0 && overflow.scrollWidth <= overflow.vw, "no horizontal overflow at 390px", JSON.stringify(overflow.offenders));
    // The base dropdown on a phone: opens by tap, lists scrollably, stays inside the screen.
    await page.tap(".ibControls .selTrigger");
    await page.waitFor(`!!document.querySelector(".ibControls .selDropdown")`);
    const dd = await page.eval(`(() => { const r = document.querySelector(".ibControls .selDropdown").getBoundingClientRect(); const o = document.querySelector(".ibControls .selOptions"); return {left: Math.round(r.left), right: Math.round(r.right), vw: innerWidth, scrolls: o.scrollHeight > o.clientHeight, groups: document.querySelectorAll(".ibControls .selGroup").length}; })()`);
    const ddOverflow = await page.eval(OVERFLOW_CHECK);
    c.ok(dd.left >= 0 && dd.right <= dd.vw && dd.scrolls && dd.groups > 0 && ddOverflow.count === 0 && ddOverflow.scrollWidth <= ddOverflow.vw,
        "the base dropdown opens on a phone, scrolls, and causes no horizontal overflow", JSON.stringify({dd, offenders: ddOverflow.offenders}));
    await page.screenshot("shots/itembuilder-phone-dropdown.png");
    await page.tap(".ibControls .selTrigger"); // closes it again
    await typeNth(page, ".ibSearch", 0, "a"); // a long list, so the page can scroll the card away
    c.ok(await page.eval(`getComputedStyle(document.querySelector(".ibPinBar")).visibility === "hidden"`), "the pinned bar hides while the card is in view");
    await page.eval(`window.scrollTo(0, document.querySelector(".ibCard").getBoundingClientRect().bottom + window.scrollY + 300)`);
    await sleep(400);
    const bar = await page.eval(`(() => { const b = document.querySelector(".ibPinBar"); return {vis: getComputedStyle(b).visibility, top: Math.round(b.getBoundingClientRect().top)}; })()`);
    c.ok(bar.vis === "visible" && bar.top >= 40 && bar.top <= 80, "the pinned bar shows under the tab row once the card scrolls away", JSON.stringify(bar));

    // Desktop tab click still works after all this (sanity for the More menu entry).
    await page.desktop();
    await page.goto(BASE + "#/weapons");
    await page.waitFor(`!!document.querySelector(".tabs .tab")`);
    await clickDesktopTab(page, "itembuilder");
    await sleep(300);
    c.ok(await page.eval(`location.hash.startsWith("#/itembuilder")`), "the More menu opens the Item Builder");
});

c.done();
