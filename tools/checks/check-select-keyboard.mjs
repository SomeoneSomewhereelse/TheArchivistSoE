// SearchableSelect is keyboard operable: ArrowDown opens, arrows/Home/End move an active option over the
// selectable options only (wrapping), Enter picks, Escape closes and refocuses the trigger. No mouse after
// the initial focus. Covers the Item Builder base picker, a Weapons filter select and the phone layout.
// node check-select-keyboard.mjs   (APP_URL = a dev server)
import {run, checker, BASE, sleep, openTab, OVERFLOW_CHECK} from "./cdp.mjs";

const c = checker();
const KEYS = {Escape: 27, Enter: 13, ArrowDown: 40, ArrowUp: 38, Home: 36, End: 35, Tab: 9};
const press = async (page, key) => {
    for (const type of ["keyDown", "keyUp"]) {
        await page.send("Input.dispatchKeyEvent", {type, key, code: key, windowsVirtualKeyCode: KEYS[key]});
    }
    await sleep(150);
};
const typeText = async (page, text) => {
    await page.send("Input.insertText", {text});
    await sleep(200);
};
const focus = (page, selector) => page.eval(`document.querySelector(${JSON.stringify(selector)}).focus()`);
const snap = (page, root) => page.eval(`(() => {
    const w = document.querySelector(${JSON.stringify(root)});
    const trig = w.querySelector(".selTrigger");
    const input = w.querySelector(".selSearchInput");
    const act = input ? document.getElementById(input.getAttribute("aria-activedescendant")) : null;
    return {
        open: !!input,
        expanded: trig.getAttribute("aria-expanded"),
        popup: trig.getAttribute("aria-haspopup"),
        label: trig.querySelector("span").textContent,
        trigFocused: document.activeElement === trig,
        inputFocused: !!input && document.activeElement === input,
        activeText: act ? act.textContent : null,
        activeClass: act ? act.className : null,
        activeCount: w.querySelectorAll(".selActive").length,
        options: [...w.querySelectorAll(".selOption:not(.selEmpty)")].map((e) => e.textContent),
        roles: [...w.querySelectorAll(".selOption:not(.selEmpty)")].every((e) => e.getAttribute("role") === "option" && e.id),
        listbox: !!w.querySelector('.selOptions[role="listbox"]'),
        selected: [...w.querySelectorAll('[aria-selected="true"]')].map((e) => e.textContent),
        groups: [...w.querySelectorAll(".selGroup")].map((e) => e.textContent),
        groupRoleOk: [...w.querySelectorAll(".selGroup")].every((e) => e.getAttribute("role") === "presentation"),
    };
})()`);

await run(async (page) => {
    await page.desktop();
    await page.goto(BASE + "#/itembuilder");
    await page.waitFor(`!!document.querySelector(".ibBase .selTrigger")`);
    const W = ".ibControls .selSearchWrap";
    const hash = () => page.eval(`location.hash`);

    // (a) open with ArrowDown, filter, choose with the keyboard.
    await focus(page, ".ibControls .selTrigger");
    let s = await snap(page, W);
    c.ok(s.popup === "listbox" && s.expanded === "false" && !s.open, "closed trigger: aria-haspopup=listbox, aria-expanded=false", JSON.stringify([s.popup, s.expanded]));
    await press(page, "ArrowDown");
    s = await snap(page, W);
    c.ok(s.open && s.expanded === "true" && s.inputFocused, "ArrowDown on the trigger opens the dropdown, filter input focused", JSON.stringify([s.open, s.expanded, s.inputFocused]));
    c.ok(s.listbox && s.roles && s.groupRoleOk, "listbox / option roles with ids, headings are presentation");
    c.ok(s.activeCount === 1 && /^Choose/.test(s.activeText ?? "") && s.activeClass.includes("selActive"), "opening activates the selected option (the placeholder row here)", String(s.activeText));
    c.ok(s.selected.length === 1 && /^Choose/.test(s.selected[0]), "aria-selected marks the current value", JSON.stringify(s.selected));
    await typeText(page, "arbal");
    s = await snap(page, W);
    c.ok(s.options.length >= 1 && s.options.every((o) => /arbal/i.test(o)) && /^Arbalest/.test(s.activeText ?? "") && s.activeCount === 1,
        "typing resets the active option to the first match", JSON.stringify([s.options, s.activeText]));
    await press(page, "ArrowDown");
    s = await snap(page, W);
    const picked = s.activeText;
    await press(page, "Enter");
    const after = await snap(page, W);
    const h = await hash();
    c.ok(!after.open && after.expanded === "false" && after.label === picked, "Enter selects the active option, closes, trigger shows it", `${picked} -> ${after.label}`);
    c.ok(/[?&]b=[a-z0-9]+/i.test(h), "the hash carries b= of the chosen base", h);
    const baseCode = (h.match(/[?&]b=([^&]+)/) ?? [])[1];

    // (b) reopen: the chosen base is active; ArrowDown x2 then Enter picks the 3rd selectable.
    await focus(page, ".ibControls .selTrigger");
    await press(page, "ArrowDown");
    s = await snap(page, W);
    c.ok(s.activeText === picked, "reopening activates the currently selected base", String(s.activeText));
    await press(page, "Home");
    s = await snap(page, W);
    const all = s.options;
    c.ok(s.activeText === all[0], "Home goes to the first option", String(s.activeText));
    await press(page, "ArrowDown");
    await press(page, "ArrowDown");
    s = await snap(page, W);
    c.ok(s.activeText === all[2] && s.activeCount === 1, "ArrowDown x2 from the first lands on the 3rd selectable (headings skipped)", `${s.activeText} vs ${all[2]}`);
    await press(page, "Enter");
    s = await snap(page, W);
    const h2 = await hash();
    c.ok(!s.open && s.label === all[2] && !s.groups.includes(s.label) && h2 !== h, "the 3rd selectable is chosen, not a heading", `${s.label} | ${h2}`);
    c.ok((h2.match(/[?&]b=([^&]+)/) ?? [])[1] !== baseCode, "the build's base changed", h2);

    // (e) wrap-around.
    await focus(page, ".ibControls .selTrigger");
    await press(page, "ArrowDown");
    await press(page, "Home");
    s = await snap(page, W);
    const first = s.activeText;
    await press(page, "ArrowUp");
    s = await snap(page, W);
    c.ok(s.activeText === all[all.length - 1] && s.activeText !== first, "ArrowUp from the first option wraps to the last", String(s.activeText));
    await press(page, "ArrowDown");
    s = await snap(page, W);
    c.ok(s.activeText === first, "ArrowDown from the last wraps to the first", String(s.activeText));
    await press(page, "End");
    s = await snap(page, W);
    c.ok(s.activeText === all[all.length - 1], "End goes to the last option", String(s.activeText));

    // (c) + (f) Escape closes, focuses the trigger, changes nothing, and the page's global Escape never runs.
    const hBefore = await hash();
    const labelBefore = (await snap(page, W)).label;
    await typeText(page, "zzzz-nomatch");
    s = await snap(page, W);
    c.ok(s.activeText === null && s.activeCount === 0, "no matches: no active option");
    await press(page, "Enter");
    s = await snap(page, W);
    c.ok(s.open, "Enter with no active option does nothing");
    await press(page, "Escape");
    s = await snap(page, W);
    c.ok(!s.open && s.expanded === "false" && s.trigFocused, "Escape closes the dropdown and returns focus to the trigger", JSON.stringify([s.open, s.trigFocused]));
    c.ok(s.label === labelBefore && (await hash()) === hBefore, "Escape leaves the value unchanged", s.label);
    await press(page, "ArrowDown");
    s = await snap(page, W);
    c.ok(s.open && s.inputFocused && (await page.eval(`document.querySelector(".selSearchInput").value`)) === "", "reopening after Escape starts with a cleared filter");
    // Tab closes.
    await press(page, "Tab");
    s = await snap(page, W);
    c.ok(!s.open, "Tab closes the dropdown");
    // The global Escape handler (blurs the search box) must not run for an Escape the select handled.
    await page.eval(`window.__escSeen = false; window.addEventListener("keydown", (e) => { if (e.key === "Escape") window.__escSeen = true; });`);
    await focus(page, ".ibControls .selTrigger");
    await press(page, "ArrowDown");
    await press(page, "Escape");
    const seen = await page.eval(`window.__escSeen`);
    c.ok(seen === false, "a handled Escape does not bubble to window handlers", String(seen));
    await press(page, "Escape"); // closed now: Escape on the focused trigger must still reach window
    c.ok(await page.eval(`window.__escSeen`) === true, "(control) Escape on the closed trigger still reaches window handlers");

    // (d) a non-Item-Builder select: the Weapons filters pick by keyboard and the list filters.
    await openTab(page, "weapons");
    await page.waitFor(`document.querySelectorAll(".listPanel .row").length > 1`);
    const FW = ".filtersPanel .selSearchWrap";
    const rows = () => page.eval(`document.querySelectorAll(".listPanel .row").length`);
    const rowsBefore = await rows();
    await focus(page, ".filtersPanel .selTrigger");
    await press(page, "ArrowDown");
    s = await snap(page, FW);
    c.ok(s.open && s.expanded === "true" && s.inputFocused && s.activeCount === 1, "Weapons filter: ArrowDown opens it with an active option", String(s.activeText));
    const opts = s.options;
    await press(page, "ArrowDown");
    s = await snap(page, FW);
    const chosen = s.activeText;
    await press(page, "Enter");
    s = await snap(page, FW);
    await sleep(300);
    const rowsAfter = await rows();
    c.ok(!s.open && s.label === chosen && chosen !== opts[0], "Weapons filter: Enter picks the second option", `${chosen} (of ${opts.length})`);
    c.ok(rowsAfter !== rowsBefore && rowsAfter > 0, "the weapon list actually filtered", `${rowsBefore} -> ${rowsAfter}`);

    // (g) phone: open dropdown on the Item Builder, no horizontal overflow.
    await page.mobile();
    await page.goto(BASE + "#/itembuilder");
    await page.waitFor(`!!document.querySelector(".ibBase .selTrigger")`);
    await focus(page, ".ibControls .selTrigger");
    await press(page, "ArrowDown");
    s = await snap(page, W);
    c.ok(s.open && s.activeCount === 1, "phone: the base dropdown opens by keyboard with an active option");
    const ov = await page.eval(OVERFLOW_CHECK);
    c.ok(ov.count === 0 && ov.scrollWidth <= ov.vw, "phone: no horizontal overflow with the dropdown open", JSON.stringify(ov.offenders));
});

c.done();
