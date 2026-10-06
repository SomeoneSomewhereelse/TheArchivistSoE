# Sticky Table Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the header row of the Affixes, Corruptions and Drop calculator tables visible while the page scrolls, on desktop and mobile, via a fixed floating copy of the header.

**Architecture:** A new `StickyHeadTable` component renders today's `.affixTableScroll > table` markup unchanged plus a `position: fixed`, `aria-hidden` copy of the same header row. A plain-DOM `attachFloatingHead` function (outside React) syncs the copy's position, column widths, horizontal scroll and visibility from scroll/resize listeners and a ResizeObserver; the show/hide rule is a pure, unit-tested function in `src/stickyHead.js`.

**Tech Stack:** React 19, Vite 7, plain JS/JSX, plain CSS, Vitest (dev only), headless Chromium over CDP for UI checks.

**Spec:** `docs/superpowers/specs/2026-10-06-sticky-table-header-design.md` (read it before starting; this plan argues from it).

## Global Constraints

- Plain JavaScript (no TypeScript), plain CSS; no new runtime dependencies (only `react` and `react-dom`).
- `npm run lint` must report **0 problems** (CI enforces `LINT_BASELINE: 0`); no `eslint-disable`.
- React Compiler rules are active: no `setState` in effects, no ref reads during render.
- Test files import `describe`/`it`/`expect` from `"vitest"` explicitly.
- New logic goes in small new modules under `src/`, not in `src/App.jsx`.
- Desktop at rest must stay **pixel-identical** on all 19 tabs (1500px full-page screenshots, `main` vs branch).
- Stick line: `var(--topbar-h)` (52px) on mobile (≤ 980px), `0` on desktop; the copy's z-index is **30**.
- Work in a manual worktree: `git worktree add .worktrees/sticky-table-header -b sticky-table-header main`. **Never use the EnterWorktree tool.** Commit on the branch; don't push, open PRs or merge.
- Node is not on the Bash tool's PATH: prefix commands with `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" &&` (check `ls ~/.nvm/versions/node` first).
- Servers: `cd` as its own statement, then `nohup env npm_package_version=1.2.1 node node_modules/vite/bin/vite.js --port <p> --strictPort > <log> 2>&1 &` and `echo $! > <pidfile>`; stop with `kill "$(cat <pidfile>)"`. **Never `pkill -f` / `pgrep -f`.** The real-phone server binds **only** to `--host 100.91.245.9` (Tailscale), never `0.0.0.0` or the LAN.
- Memory is constrained (WSL): run `free -h` before and after heavy work; if `available` drops below ~1.5 GB, tell the user.
- Commit messages: plain, no attribution lines.

## Review Focus

1. **Short tables** (Drop calculator with 0 rows or "Calculating...", a small Corruptions page): on desktop the box is ≥ 400px tall, so the copy must hide when the *table* ends, not the box. Pinned by `check-sticky.mjs` ("desktop dropcalc (0 rows)") in Task 3.
2. **Crossing the 980px breakpoint / rotating** with the copy showing: the stick line moves between 0 and 52px and widths change. Pinned by the "900px affixes" and "rotated 844x390" checks in Task 3.
3. **Page change from the bottom pager** (its `scrollIntoView`) and **Damnation toggle** on the Drop calculator: the table content changes under a visible copy; it must re-sync or hide, never show stale widths. Pinned by "page 2 re-syncs" and "Damnation toggle" checks in Task 3.
4. **A copied `Tip` on touch**: its bubble is `position: fixed`; any transform/filter on the copy would trap it. Pinned by "tapping a copied Tip opens the bottom bubble" in Task 3, and by the CSS in Task 2 using `left`, never `transform`.
5. **Sorting from the copy** must hit the same handler as the real header (same element rendered twice). Pinned by the desktop click and phone tap checks in Task 3.

---

## File Structure

- Create `src/stickyHead.js`: the pure visibility rule `floatingHeadVisible`.
- Create `src/stickyHead.test.js`: its unit tests.
- Create `src/StickyHeadTable.jsx`: the component (markup) and `attachFloatingHead` (DOM syncing).
- Modify `src/App.jsx`: import `StickyHeadTable`; use it in `DropCalculatorPanel` (~line 2238), `CorruptionsTable` (~line 2791) and `AffixesPanel` (~line 2912).
- Modify `src/styles.css`: delete the dead `.scrolled` / empty `:has` rules (~lines 1061–1068); add the `.floatingHead` block after `.affixAttr` (~line 1092); add one rule to the 980px block after the pinned-first-column rule (~line 2366).
- Modify `CLAUDE.md`: Layout and CSS gotchas mention the new component.

Line numbers are from `main` at `50bbebe` and drift; search for the quoted code.

---

### Task 1: Worktree and the pure visibility rule

**Files:**
- Create: `src/stickyHead.js`
- Test: `src/stickyHead.test.js`

**Interfaces:**
- Produces: `export function floatingHeadVisible({headTop, headHeight, tableEnd, stickTop})` → `boolean`. All four are numbers in viewport px. `tableEnd` is `Math.min(scrollerRect.bottom, tableRect.bottom)`, computed by the caller.

- [ ] **Step 1: Create the worktree and install**

```bash
cd /home/emanresu/TheArchivistSoE
git worktree add .worktrees/sticky-table-header -b sticky-table-header main
cd .worktrees/sticky-table-header
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npm ci
```

All later paths are relative to `.worktrees/sticky-table-header`.

- [ ] **Step 2: Write the failing test**

Create `src/stickyHead.test.js`:

```js
import {describe, expect, it} from "vitest";
import {floatingHeadVisible} from "./stickyHead.js";

// A 40px header; the stick line defaults to the mobile top bar's bottom (52px).
function visible(headTop, tableEnd, stickTop = 52) {
    return floatingHeadVisible({headTop, headHeight: 40, tableEnd, stickTop});
}

describe("floatingHeadVisible", () => {
    it("is hidden at rest, while the real header is at or below the stick line", () => {
        expect(visible(300, 3000)).toBe(false);
        expect(visible(52, 3000)).toBe(false);
    });

    it("shows once the real header has passed the stick line", () => {
        expect(visible(51, 3000)).toBe(true);
        expect(visible(-1500, 3000)).toBe(true);
    });

    it("hides when the table ends within one header height of the stick line", () => {
        expect(visible(-1500, 92)).toBe(false); // 52 + 40: no room left for a whole header
        expect(visible(-1500, 93)).toBe(true);
        expect(visible(-1500, 10)).toBe(false); // table already gone
    });

    it("works with the desktop stick line at 0", () => {
        expect(visible(10, 3000, 0)).toBe(false);
        expect(visible(0, 3000, 0)).toBe(false);
        expect(visible(-1, 3000, 0)).toBe(true);
        expect(visible(-1, 40, 0)).toBe(false);
        expect(visible(-1, 41, 0)).toBe(true);
    });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npx vitest run src/stickyHead.test.js`
Expected: FAIL (cannot resolve `./stickyHead.js`).

- [ ] **Step 4: Write the implementation**

Create `src/stickyHead.js`:

```js
// When the floating copy of a table header shows (see StickyHeadTable.jsx). Pure, unit-tested in
// stickyHead.test.js. All values are viewport px.

// True when the real header has passed the stick line (the pinned top bar's bottom on mobile, the
// viewport top on desktop) and the table still reaches more than one header height below it.
// `tableEnd` is min(scroller bottom, table bottom): the desktop scroller has a 400px min-height, so
// for a short table its bottom lies below the last row.
export function floatingHeadVisible({headTop, headHeight, tableEnd, stickTop}) {
    return headTop < stickTop && tableEnd > stickTop + headHeight;
}
```

- [ ] **Step 5: Run the tests and lint**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npm test && npm run lint`
Expected: all test files pass (including the existing `sortCompare`, `hashTab`, `pager`, `tabList`, `useIsMobile` tests); lint reports 0 problems.

- [ ] **Step 6: Commit**

```bash
git add src/stickyHead.js src/stickyHead.test.js
git commit -m "Sticky header: pure floatingHeadVisible rule with tests"
```

---

### Task 2: StickyHeadTable component, CSS, and the three panels

**Files:**
- Create: `src/StickyHeadTable.jsx`
- Modify: `src/App.jsx` (imports at the top; `DropCalculatorPanel` ~2238–2278; `CorruptionsTable` ~2791–2815; `AffixesPanel` ~2911–3040)
- Modify: `src/styles.css` (~1061–1068 delete; after `.affixAttr` ~1092 add; 980px block ~2366 add)

**Interfaces:**
- Consumes: `floatingHeadVisible({headTop, headHeight, tableEnd, stickTop})` from `src/stickyHead.js` (Task 1).
- Produces: `export default function StickyHeadTable({className, head, children})`. `className` is the `<table>`'s class string (e.g. `"affixTable affixesTable"`); `head` is one `<tr>` element of header cells; `children` are the body rows. Renders a fragment: the scroller (`div.affixTableScroll`) and the copy (`div.floatingHead`).

- [ ] **Step 1: Create the component**

Create `src/StickyHeadTable.jsx`:

```jsx
// A table whose header row stays visible while the page scrolls (Affixes, Corruptions, Drop calculator).
// The real <thead> stays inside .affixTableScroll, where native sticky still covers the desktop box's own
// scroll. A position: fixed, aria-hidden copy of the same header row shows under the stick line once the
// real one has scrolled away; the same `head` element is rendered twice, so sorting and Tips work on both.
import React from "react";
import {floatingHeadVisible} from "./stickyHead.js";

// Keeps the copy's position, column widths, horizontal scroll and visibility in step with the real
// table. Plain DOM work outside React (no state, no re-renders); returns the cleanup.
function attachFloatingHead({scroller, table, realHead, copy}) {
    const copyTable = copy.querySelector("table");
    let stickTop = 0;

    // CSS decides the line (top: var(--topbar-h, 0px)); it computes even while the copy is display: none.
    function readStickTop() {
        stickTop = parseFloat(getComputedStyle(copy).top) || 0;
    }

    function sync() {
        // All reads first, then all writes, so each call lays out once.
        const box = scroller.getBoundingClientRect();
        const tableRect = table.getBoundingClientRect();
        const headRect = realHead.getBoundingClientRect();
        const widths = Array.from(realHead.rows[0].cells, (cell) => cell.getBoundingClientRect().width);
        const visible = floatingHeadVisible({
            headTop: headRect.top,
            headHeight: headRect.height,
            tableEnd: Math.min(box.bottom, tableRect.bottom),
            stickTop,
        });

        copy.style.left = `${box.left}px`;
        copy.style.width = `${scroller.clientWidth}px`;
        copy.style.setProperty("--copy-scroll", `${scroller.scrollLeft}px`);
        copyTable.style.width = `${tableRect.width}px`;
        const cells = copyTable.tHead.rows[0].cells;
        widths.forEach((width, i) => {
            cells[i].style.width = `${width}px`;
            cells[i].style.minWidth = `${width}px`;
        });
        // Safe: React renders the copy's className as a constant, so it never rewrites this attribute.
        copy.classList.toggle("on", visible);
    }

    function onResize() {
        readStickTop(); // crossing the 980px breakpoint moves the line
        sync();
    }

    // Only the real table is observed; the copy's own writes can't feed back into the observer.
    const observer = new ResizeObserver(sync);
    observer.observe(scroller);
    observer.observe(table);
    for (const cell of realHead.rows[0].cells) observer.observe(cell);
    window.addEventListener("scroll", sync, {passive: true});
    window.addEventListener("resize", onResize);
    scroller.addEventListener("scroll", sync, {passive: true});
    readStickTop();
    sync();

    return () => {
        observer.disconnect();
        window.removeEventListener("scroll", sync);
        window.removeEventListener("resize", onResize);
        scroller.removeEventListener("scroll", sync);
    };
}

export default function StickyHeadTable({className, head, children}) {
    const scrollerRef = React.useRef(null);
    const tableRef = React.useRef(null);
    const headRef = React.useRef(null);
    const copyRef = React.useRef(null);

    React.useEffect(() => attachFloatingHead({
        scroller: scrollerRef.current,
        table: tableRef.current,
        realHead: headRef.current,
        copy: copyRef.current,
    }), []);

    return (<>
        <div className="affixTableScroll" ref={scrollerRef}>
            <table className={className} ref={tableRef}>
                <thead ref={headRef}>{head}</thead>
                <tbody>{children}</tbody>
            </table>
        </div>
        <div className="floatingHead" ref={copyRef} aria-hidden="true">
            <table className={className}>
                <thead>{head}</thead>
            </table>
        </div>
    </>);
}
```

The header cells must never get a `style` prop (React would then overwrite the synced widths); none of the three tables passes one today.

- [ ] **Step 2: Import it in `App.jsx`**

In `src/App.jsx`, after `import PagerButtons from "./PagerButtons.jsx";` add:

```jsx
import StickyHeadTable from "./StickyHeadTable.jsx";
```

- [ ] **Step 3: Drop calculator (`DropCalculatorPanel`)**

Replace:

```jsx
                    <div className="affixTableScroll">
                        <table className="affixTable">
                            <thead>
                            <tr>
                                <th>Monster</th>
                                <th>Treasure Class</th>
                                <th>Level</th>
                                <th>Drop chance</th>
                                <th>Drop chance %</th>
                            </tr>
                            </thead>

                            <tbody>
```

with:

```jsx
                    <StickyHeadTable
                        className="affixTable"
                        head={<tr>
                            <th>Monster</th>
                            <th>Treasure Class</th>
                            <th>Level</th>
                            <th>Drop chance</th>
                            <th>Drop chance %</th>
                        </tr>}
                    >
```

and, at the end of the same block, replace:

```jsx
                            </tbody>
                        </table>
                    </div>

                    <div className="affixPager affixPagerBottom">
```

with:

```jsx
                    </StickyHeadTable>

                    <div className="affixPager affixPagerBottom">
```

Then re-indent the body (the `{loading && …}`, `{!loading && error && …}` and `pageRows.map` blocks, including the `colSpan="5"` message rows, unchanged otherwise) so it sits one level inside `<StickyHeadTable>` (24 spaces for the opening `{`).

- [ ] **Step 4: Corruptions (`CorruptionsTable`)**

Replace:

```jsx
            <div className="affixTableScroll">
                <table className="affixTable corruptionsTable">
                    <thead>
                    <tr>
                        <th>Item</th>
                        <th>Corruption</th>
                        <th>Chance</th>
                    </tr>
                    </thead>

                    <tbody>
```

with:

```jsx
            <StickyHeadTable
                className="affixTable corruptionsTable"
                head={<tr>
                    <th>Item</th>
                    <th>Corruption</th>
                    <th>Chance</th>
                </tr>}
            >
```

and replace the block's end:

```jsx
                    ))}
                    </tbody>
                </table>
            </div>

            <div className="affixPager affixPagerBottom">
                <PagerButtons {...pager.pagerProps} scrollTargetRef={wrapperRef}/>
            </div>
        </div>
    );
}
```

with:

```jsx
                    ))}
            </StickyHeadTable>

            <div className="affixPager affixPagerBottom">
                <PagerButtons {...pager.pagerProps} scrollTargetRef={wrapperRef}/>
            </div>
        </div>
    );
}
```

Re-indent the `{pageItems.map(…)}` block so it sits one level inside `<StickyHeadTable>` (16 spaces for the opening `{`).

- [ ] **Step 5: Affixes (`AffixesPanel`)**

Replace the opening:

```jsx
            {/* Scrollable table */}
            <div className="affixTableScroll">
                <table className="affixTable affixesTable">
                    <thead>
                    <tr>
```

with:

```jsx
            {/* Scrollable table; its header row also floats while the page scrolls */}
            <StickyHeadTable
                className="affixTable affixesTable"
                head={<tr>
```

Leave the eleven `<th className="sortable" onClick={() => handleSort(…)}>` cells exactly as they are. Replace the end of the header and start of the body:

```jsx
                        </th>
                    </tr>
                    </thead>

                    <tbody>
```

with:

```jsx
                        </th>
                    </tr>}
            >
```

(This is the `</th>` closing the Req lvl cell; it is the only `</th>` followed by `</tr>` and `</thead>` in `AffixesPanel`.) Replace the block's end:

```jsx
                    </tr>))}
                    </tbody>
                </table>
            </div>
```

with:

```jsx
                    </tr>))}
            </StickyHeadTable>
```

Re-indent the `{current.map(…)}` block so it sits one level inside `<StickyHeadTable>` (16 spaces for the opening `{`). Leave the header cells' indentation as it is (re-indenting all eleven cells would bloat the diff; topic 2, multi-field sorting, rewrites them).

- [ ] **Step 6: CSS — delete the dead rules**

In `src/styles.css`, delete:

```css
.affixTableScroll:has(tbody tr:first-child:hover),
.affixTableScroll:has(tbody tr:first-child) {
    /* no shadow initially */
}

.affixTableScroll.scrolled thead {
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
}
```

(nothing in `src/` adds `scrolled`; the `:has` rule is empty).

- [ ] **Step 7: CSS — the floating copy**

Directly after the `.affixAttr { white-space: pre-wrap; }` rule (the end of the "Affixes table" section, before the "Searchable select" banner) add:

```css
/* Floating copy of a table header (StickyHeadTable): shown under the stick line once the real header has
   scrolled away. Fixed, so it follows the page scroll that sticky can't (.appRoot is a scroll container on
   desktop; the scroller is one on mobile). Horizontal scroll is mirrored with `left`, never `transform`:
   a transform would trap the touch Tip's position: fixed bubble, like thead's backdrop-filter does. */
.floatingHead {
    position: fixed;
    top: var(--topbar-h, 0px);
    z-index: 30; /* inside .wrap: above pinned cells (1) and thead (2), below .selDropdown (40) */
    display: none;
    overflow-x: clip; /* y stays visible: desktop Tip bubbles hang below the header */
    background: var(--bg);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
}

.floatingHead.on {
    display: block;
}

.floatingHead table {
    table-layout: fixed;
    position: relative;
    left: calc(-1 * var(--copy-scroll, 0px));
}

.floatingHead .affixTable thead {
    position: static;
    backdrop-filter: none;
}
```

- [ ] **Step 8: CSS — the pinned corner on mobile**

In the `@media (max-width: 980px)` block that contains `/* Pinned first column; colSpan message rows (Drop calculator) stay unpinned. */`, directly after that rule (the one ending `box-shadow: 1px 0 0 rgba(255, 255, 255, 0.08);\n    }`) add:

```css
    /* The floating header's corner: the copy isn't a scroll container, so sticky can't pin its first
       cell; it counter-shifts by the mirrored scroll instead. */
    .floatingHead .affixTable th:first-child {
        position: relative;
        left: var(--copy-scroll, 0px);
    }
```

(Specificity 0,3,1 beats the pinned-column rule's 0,2,1; the 720px and 480px blocks have no first-column table rules.)

- [ ] **Step 9: Lint, tests, build**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npm run lint && npm test && npm run build`
Expected: lint 0 problems; all tests pass; build succeeds. If lint flags anything in `StickyHeadTable.jsx`, fix the cause (all DOM writes must stay inside `attachFloatingHead`, outside the component); never add `eslint-disable`.

- [ ] **Step 10: Quick smoke check in the browser**

```bash
cd /home/emanresu/TheArchivistSoE/.worktrees/sticky-table-header
nohup env npm_package_version=1.2.1 node node_modules/vite/bin/vite.js --port 5186 --strictPort > "$SCRATCH/vite-5186.log" 2>&1 &
echo $! > "$SCRATCH/vite-5186.pid"
```

(`$SCRATCH` = your session scratchpad directory.) Smoke check (the full checks are Task 3): load `http://localhost:5186/TheArchivistSoE/#/affixes` at 390×844, scroll the page into the table and confirm the copy appears under the top bar (screenshot). Keep the server running for Task 3.

- [ ] **Step 11: Commit**

```bash
git add src/StickyHeadTable.jsx src/App.jsx src/styles.css
git commit -m "Floating sticky header for the Affixes, Corruptions and Drop calculator tables"
```

---

### Task 3: Verification and docs

**Files:**
- Modify: `CLAUDE.md`
- Scratchpad only (not committed): the check harness and `check-sticky.mjs`.

**Interfaces:**
- Consumes: the `.floatingHead` copy and its `.on` class (Task 2), `StickyHeadTable` (Task 2).

- [ ] **Step 1: Set up the harness**

Copy the earlier session's harness into your own scratchpad (don't edit it in place):

```bash
mkdir -p "$SCRATCH/checks"
cp /tmp/claude-1000/-home-emanresu-TheArchivistSoE/9bc3f30b-f231-41ca-8332-69a988f507bd/scratchpad/checks/{cdp.mjs,compare-desktop.mjs,diff-shots.mjs,runchecks.sh} "$SCRATCH/checks/"
```

If that directory is gone, the same files are at `/tmp/claude-1000/-home-emanresu-TheArchivistSoE/750aa444-ca35-49c3-a26a-63e4f2a37ed1/scratchpad/checks/`; if both are gone, stop and ask the user. Then write `$SCRATCH/checks/check-sticky.mjs` with the content in **Appendix A** below (it uses `run`, `checker`, `BASE`, `sleep`, `OVERFLOW_CHECK` from `cdp.mjs`, and `page.send`, `page.tapAt`, `page.key`, `page.type`, `page.waitFor`, `page.mobile`, `page.desktop`).

- [ ] **Step 2: Run the sticky checks**

```bash
free -h
cd "$SCRATCH/checks" && export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && APP_URL=http://localhost:5186/TheArchivistSoE/ node check-sticky.mjs "$SCRATCH" 2>&1 | tee check-sticky.log
```

Expected: every line `PASS`, ending `all checks passed`. The Drop calculator is slow (each "Deathspade" calculation can take tens of seconds; the script waits up to 120s per calculation). Look at the screenshots it writes (`sticky-desktop-*.png`, `sticky-phone-*.png`): header text readable, nothing showing through, corner cell pinned, the Req lvl bubble below the copy on desktop.

If a check fails, debug it (superpowers:systematic-debugging) and fix the code; don't weaken the check. If a check itself is wrong (e.g. a selector that doesn't exist), fix the check and say so in your report.

- [ ] **Step 3: Desktop pixel identity, `main` vs branch**

Start a `main` server from the main checkout:

```bash
cd /home/emanresu/TheArchivistSoE
nohup env npm_package_version=1.2.1 node node_modules/vite/bin/vite.js --port 5185 --strictPort > "$SCRATCH/vite-5185.log" 2>&1 &
echo $! > "$SCRATCH/vite-5185.pid"
```

Then:

```bash
cd "$SCRATCH/checks" && export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" \
  && node compare-desktop.mjs main http://localhost:5185/TheArchivistSoE/ \
  && node compare-desktop.mjs branch http://localhost:5186/TheArchivistSoE/ \
  && node diff-shots.mjs main branch
```

Expected: 19 lines, every one `{"diffPixels":0,"bbox":null}`. Any difference is a regression to fix (the copy is `display: none` at rest and `position: fixed`, so it must not move anything).

Stop the `main` server: `kill "$(cat "$SCRATCH/vite-5185.pid")"`.

- [ ] **Step 4: Lint, tests, build (final)**

Run: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" && npm run lint && npm test && npm run build`
Expected: lint 0 problems, all tests pass, build succeeds.

- [ ] **Step 5: Update `CLAUDE.md`**

In the **Layout** section, after the bullet that starts ``- `src/tabList.js` (`TABS`, …``, add:

```markdown
- `src/StickyHeadTable.jsx`: the scroller + table used by Affixes, Corruptions and the Drop calculator, plus
  a fixed, `aria-hidden` floating copy of the header row that shows once the real header scrolls away
  (`attachFloatingHead` syncs it by direct DOM writes; the show/hide rule is `floatingHeadVisible` in
  `src/stickyHead.js`, tested beside it).
```

In the **Affixes** section, replace the bullet

```markdown
- Affixes, Corruptions and the Drop calculator results all share the
  `.affixTable` / `.affixTableScroll` classes. A CSS change to one affects all three.
```

with:

```markdown
- Affixes, Corruptions and the Drop calculator results all render through `StickyHeadTable` and share the
  `.affixTable` / `.affixTableScroll` classes. A CSS change to one affects all three. The floating header
  copy (`.floatingHead`) carries the same table classes, so `.affixTable th` rules style it too; its header
  cells get inline widths, so never give those `th`s a `style` prop.
```

In **CSS gotchas**, add a bullet:

```markdown
- `.floatingHead` mirrors horizontal scroll with `position: relative; left`, not `transform`: a transform
  on it would become the containing block of the touch `Tip`'s fixed bubble (the same trap as `thead`'s
  `backdrop-filter`). It sits at `top: var(--topbar-h, 0px)` with z-index 30 inside `.wrap`.
```

Commit:

```bash
git add CLAUDE.md
git commit -m "CLAUDE.md: StickyHeadTable and the floating header copy"
```

- [ ] **Step 6: Real-phone check (the user)**

Stop the local branch server (`kill "$(cat "$SCRATCH/vite-5186.pid")"`), then serve the branch on the Tailscale address only:

```bash
cd /home/emanresu/TheArchivistSoE/.worktrees/sticky-table-header
nohup env npm_package_version=1.2.1 node node_modules/vite/bin/vite.js --host 100.91.245.9 --port 5179 --strictPort > "$SCRATCH/vite-5179.log" 2>&1 &
echo $! > "$SCRATCH/vite-5179.pid"
```

Ask the user to open `http://100.91.245.9:5179/TheArchivistSoE/#/affixes` on their phone and check: a fast fling down the table (the copy stays put under the bar), a sideways swipe (columns follow, Name corner pinned), tapping a copied header (sorts), tapping a copied Lvl/Grp tip (bubble near the bottom), a pinch-zoom with the copy showing, and the same on `#/corruptions` and `#/dropcalc` (search "Deathspade"). Wait for their verdict; fix anything they report (re-running Steps 2–4 after a fix). Then stop the server: `kill "$(cat "$SCRATCH/vite-5179.pid")"`.

- [ ] **Step 7: Report**

Report: the commits on `sticky-table-header`, the `check-sticky.log` summary, the 19-line diff result, lint/test/build output, and the user's phone verdict. Don't push, open a PR or merge.

---

## Appendix A: `check-sticky.mjs`

```js
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

async function openTable(page, tab, query = null) {
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

    // Short table: Drop calculator with 0 rows; its box is 400px tall but the table is just the header.
    await openTable(page, "dropcalc", "Shako");
    await page.eval(scrollPast(5));
    c.ok(!(await page.eval(COPY_ON)), "desktop dropcalc (0 rows): no copy over the empty 400px box");

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
    c.ok(crossed.on && crossed.top === 52 && crossed.bar === 52, "900px affixes: copy at 52px under a 52px bar", JSON.stringify(crossed));

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
```
