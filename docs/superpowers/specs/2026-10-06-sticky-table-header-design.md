# Sticky header row on the Affixes-style tables — design

**Date:** 2026-10-06
**Branch:** to be created from `main` when implementation starts (manual worktree, `.worktrees/<name>`)
**Status:** approved in brainstorming, awaiting spec review

## Intent

Deep in a 50-row page of the Affixes table, the column labels and the sort arrow scroll away, so
you have to scroll back up to see which column is which or what's sorted. The header row should
stay readable **whenever any part of the table body is on screen**, on both layouts:

- **Mobile (≤ 980px):** the page scrolls vertically and the table only swipes horizontally, so
  today's `position: sticky` on `thead` never sticks (it sticks to `.affixTableScroll`, which is
  a scroll container because of `overflow-x: auto` but has no vertical scroll).
- **Desktop:** the header already sticks inside the 800px `.affixTableScroll` box, but when the
  page scroll takes that box's top off-screen, the header goes with it.

### Success criteria

- Phone (390×844): once the real header has scrolled under the pinned top bar, a header row is
  shown directly under the bar (`--topbar-h`, 52px) until the table ends. After a sideways swipe
  its columns line up with the body and its first cell stays pinned (the corner).
- Desktop (1500px): same when the page scroll takes the box top off-screen, at `top: 0`. Scrolling
  inside the 800px box keeps working as today (native sticky).
- Every tab at rest is **pixel-identical** on desktop before and after.
- Sorting and the header `Tip`s work from the floating header exactly as from the real one.

### Constraints

- Applies to all three tables sharing `.affixTable` / `.affixTableScroll`: **Affixes, Corruptions,
  Drop calculator results**, through one shared component.
- No new runtime dependencies, no `eslint-disable`, lint stays at 0. React Compiler rules: no
  `setState` in effects, no ref reads during render.
- `.appRoot { overflow-x: hidden }` swallows `position: sticky` relative to the page on desktop.
  It stays as is: switching it to `clip` would also activate the currently inert desktop
  `.tooltip { position: sticky }` on every item tab. Hence `position: fixed`, not sticky.
- New logic in small new modules, not in `App.jsx`.

### Out of scope

- The Drop calculator's speed and its misc-mode rune-code results.
- Reworking the Affixes header-cell JSX (topic 2, multi-field sorting, changes those cells).
- Any change to the desktop 800px box, the pager, or the real `thead`'s live styling (only the dead
  `.scrolled` rule is deleted).
- A "slide away" animation at the table's end; the floating header simply hides.
- Swiping the floating header itself sideways.

## Approaches considered

A throwaway mockup (`Today / 1 Copy / 2 Shift / 3 Box`) was tried on a real Android phone.

1. **Floating copy of the header (chosen).** A fixed, `aria-hidden` copy of the header row, shown
   only while the real one is out of view, with column widths and horizontal scroll synced by JS.
   Vertical following is native (a fixed element doesn't move during scroll), so it doesn't lag
   on fling scrolls.
2. **Translate the real `thead` from scroll events.** No copy, horizontal swipe for free, but
   driven by main-thread scroll events, so the header lags/jitters on a phone fling. Rejected.
3. **Viewport-tall inner scroll box (CSS only).** Native sticky header, column and corner, no JS,
   but it brings back a nested vertical scroll area on mobile (removed on purpose by the
   mobile-friendly work), and on desktop the page can still scroll the box top away. Rejected.

## Behaviour

- **Stick line:** the bottom of the pinned top bar on mobile (`var(--topbar-h)`, 52px), the top of
  the viewport (0) on desktop.
- **Visible** when the real `thead`'s top is above the stick line **and** the table's end is more
  than one header height below it; hidden otherwise (at rest, and once the table ends). "The table's
  end" is `min(scroller bottom, table bottom)`: on desktop the box has `min-height: 400px`, so for a
  short table (a few Drop calculator rows, "Calculating...", a small Corruptions page) the box
  bottom lies below the last row, and using it alone would leave the copy over empty space.
- **Position:** left edge and width equal the scroller's visible box (`getBoundingClientRect().left`
  and `clientWidth`, so the desktop box's vertical scrollbar is never covered). Each copied cell
  takes the real cell's rendered width.
- **Horizontal scroll:** the copy follows the scroller's `scrollLeft`; on mobile its first cell stays
  put (the corner of the pinned first column).
- **Interaction:** it is the same header element rendered twice, so a tap/click on a copied
  Affixes header sorts, and copied `Tip`s open (tap on touch: the fixed bottom strip; hover on
  desktop: the bubble below the header, not clipped vertically; horizontally it is clipped at the
  copy's edges exactly as the real header's bubbles are clipped by the scroll box, e.g. Req lvl's
  300px-wide bubble, so this is parity, not a regression). A vertical drag on the copy scrolls the
  page; on desktop a mouse wheel over the copy scrolls the page, not the 800px box (the copy isn't
  inside the box). A copied `Tip` left open while the copy hides stays open in state; the next
  touch outside closes it, as today.
- **Accessibility:** the copy is `aria-hidden="true"`; screen readers use the real `thead`. No
  copied cell is focusable.
- **Look:** opaque `var(--bg)` background (the real header's 85% black lets rows show through,
  which the mockup's option 3 made visible) and a soft shadow, `0 2px 6px rgba(0, 0, 0, 0.6)`.
- **Layering:** `.wrap` (z-index 1) is a stacking context containing the tables, so the copy is
  automatically under the top bar (50), the More dropdown (1000), the tab sheet (2000), the
  go-to-top button (1000) and `Tip` bubbles (999). Inside `.wrap` it uses **z-index 30**: above the
  pinned cells (1) and `thead` (2), below `.selDropdown` (40).

## Structure

### `src/stickyHead.js` (pure, unit-tested)

```js
// True when the floating header should show: the real header has passed the stick line and the
// table still reaches more than one header height below it. `tableEnd` is
// min(scroller bottom, table bottom), computed by the caller.
export function floatingHeadVisible({headTop, headHeight, tableEnd, stickTop}) {
    return headTop < stickTop && tableEnd > stickTop + headHeight;
}
```

### `src/StickyHeadTable.jsx`

```jsx
<StickyHeadTable className="affixTable affixesTable" head={<tr>…header cells…</tr>}>
    {…body rows…}
</StickyHeadTable>
```

Renders (as a fragment):

```jsx
<div className="affixTableScroll" ref={scrollerRef}>
    <table className={className} ref={tableRef}>
        <thead ref={headRef}>{head}</thead>
        <tbody>{children}</tbody>
    </table>
</div>
<div className="floatingHead" ref={copyRef} aria-hidden="true">
    <table className={className}><thead>{head}</thead></table>
</div>
```

The scroller markup is identical to today's, so desktop pixels don't change. The copy is
`position: fixed`, so it is out of `.affixTableWrapper`'s flex flow and adds no `gap`.

**Syncing, without React state.** One effect (empty deps) registers:

- `scroll` on `window` (passive), `scroll` on the scroller (passive), `resize` on `window`;
- a `ResizeObserver` on the scroller, the table and each real header cell.

The effect also runs one `sync()` immediately after registering, so the copy is correct before
the first event. Every callback is that same `sync()`, which does **all rect reads first, then all
style writes** (no layout thrash), writing directly to the copy's DOM through refs:

- `--copy-scroll` custom property, set on `.floatingHead`, = the scroller's `scrollLeft` (in px);
- `left` / `width` of `.floatingHead` from the scroller's rect and `clientWidth`;
- the copy table's `width` and each copied cell's `width` and `min-width` from the real cells'
  `getBoundingClientRect().width`;
- `.on` toggled with `classList` by `floatingHeadVisible`, with `stickTop` read from the copy's own
  computed `top` (CSS remains the single source of truth for 0 vs 52px; it reads correctly even
  while the copy is `display: none`; re-read on `resize`, since crossing the 980px breakpoint
  changes it). `classList` is safe because the copy's `className` is the constant `"floatingHead"`,
  so React never rewrites the attribute.

React never clears these inline widths, because it sets no `style` on those cells (none of the
three header rows passes a `style` prop to a `th`). The ResizeObserver catches every width change:
page change, sort-arrow change, font load, rotation. The copy itself is never observed, so its
writes can't feed back into a ResizeObserver loop. The effect cleans up all listeners and the
observer on unmount (tab switch, and StrictMode's dev double-run).

**Known limit:** a ResizeObserver reports size changes, not movement. If content above the table
changes height with no scroll (the Affixes info-panel toggle, the mobile "Filters (n)" fold),
visibility is stale until the next scroll or resize. While the copy is showing, that content is
off-screen above, so this is practically unreachable; accepted.

### CSS (`src/styles.css`)

New block **after** the `.affixTable` rules (it must come after `.affixTable thead`, which it ties
with if written as `.floatingHead thead`; the selector below avoids relying on order anyway):

```css
.floatingHead {
    position: fixed;
    top: var(--topbar-h, 0px);
    z-index: 30;
    display: none;
    overflow-x: clip;          /* y stays visible: desktop Tip bubbles hang below the header */
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

In the existing 980px block, after the pinned-first-column rule:

```css
.floatingHead .affixTable th:first-child {
    position: relative;
    left: var(--copy-scroll, 0px);
}
```

`.floatingHead .affixTable th:first-child` (specificity 0,3,1) beats the pinned-column rule
`.affixTable th:first-child` (0,2,1) wherever either sits. The 720px and 480px blocks have no
first-column table rules (checked). The only other first/last-column rules are the base
`.corruptionsTable th:first-child` (`width: 180px`) and `th:last-child` (`width: 110px`, right-aligned,
nowrap): the copy's inline widths override the widths, and alignment and nowrap apply to both
copies equally.

Why `left` and not `transform` or `scrollLeft`: a transform on the copy's table would make it the
containing block of the touch `Tip`'s `position: fixed` bubble (the same trap as `thead`'s
`backdrop-filter`), and making `.floatingHead` an `overflow: hidden` scroll box would clip the
desktop hover bubbles vertically.

Remove the dead `.affixTableScroll.scrolled thead` and the empty
`.affixTableScroll:has(tbody tr:first-child…)` rules (nothing adds `scrolled`).

### Panels (`src/App.jsx`)

`AffixesPanel`, `CorruptionsTable` and `DropCalculatorPanel` each replace their
`<div className="affixTableScroll"><table …><thead><tr>…</tr></thead><tbody>…</tbody></table></div>`
with `<StickyHeadTable className={…} head={<tr>…</tr>}>…</StickyHeadTable>`, keeping their
existing header cells, body rows (including the Drop calculator's `colSpan` message rows) and
table class names.

## Testing

**Unit (Vitest, written first):** `src/stickyHead.test.js` covers `floatingHeadVisible`: hidden at
rest (header below the line); shown once the header passes the line; hidden when the table end
is within one header height of the line; the exact boundaries; with `stickTop` 0 and 52.

**Browser (headless Chromium over CDP; the earlier harness copied into the scratchpad):**

1. **Desktop, 1500px, before any touch emulation:**
   - full-page screenshots of all 19 tabs at rest, `main` vs branch: pixel-identical;
   - on Affixes, Corruptions and the Drop calculator: scrolling the page past the box top shows
     the copy at `top: 0`, every copied cell's left edge matching the real header's to the pixel;
   - scrolling only inside the 800px box: native sticky header, no copy;
   - a short table (Drop calculator with few rows, or showing "Calculating...") hides the copy
     once its last row passes, not at the 400px box's bottom;
   - hovering the copied **Req lvl** `Tip` (right-most column): the bubble isn't clipped vertically
     and is clipped horizontally no worse than the real header's; clicking a copied Affixes header
     sorts;
   - at a narrower desktop width where the Affixes table scrolls sideways (e.g. 1100px), the copy
     follows `scrollLeft` with columns aligned;
   - the Drop calculator is checked with a named query that yields more than one page (pick it
     when writing the plan), and the harness waits until "Calculating..." is gone;
   - with the copy showing: toggle Damnation on the Drop calculator (the table changes; the copy
     re-syncs or hides), and resize across 980px (the stick line switches between 0 and 52).
2. **Phone emulation, 390×844**, same three tables:
   - the copy sits at 52px and `.tabsPanel`'s bottom is 52px too (`--topbar-h` is a `min-height`,
     so a taller bar would cover the copy); hidden at rest and after the table ends;
   - after a sideways swipe the columns line up and the corner cell stays pinned;
   - a tap on a copied header sorts; a tap on a copied `Tip` opens the fixed bottom bubble;
   - changing page and rotating re-sync the widths;
   - opening the tab sheet while the copy shows: the sheet covers it;
   - no horizontal page overflow.
3. `npm run lint` (0 problems), `npm test`, `npm run build`.
4. **Real phone:** the branch served on the Tailscale address only
   (`--host 100.91.245.9 --port 5179 --strictPort`) for a fling, swipe and sort feel check, plus a
   pinch-zoom with the copy showing.

## Risks

- **Horizontal sync lags a frame** behind a fast swipe on some devices (scroll events vs
  compositor). Accepted in the mockup; vertical following is unaffected.
- **Top bar taller than 52px** (for example large Android text scaling): `--topbar-h` is the bar's
  `min-height`, so the copy would sit partly under the bar. The phone checks assert the bar is 52px;
  if it ever isn't, read the stick line from `.tabsPanel`'s rect on mobile instead.
- **iOS Safari and `min-width` on table cells** (open item in the deferred review minors): the
  copied cells get explicit `width` as well as `min-width`, so the copy doesn't depend on
  `min-width` being honoured; the real table's behaviour is unchanged by this work.
