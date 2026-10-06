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
- Any change to the desktop 800px box, the pager, or the real `thead` styling.
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
- **Visible** when the real `thead`'s top is above the stick line **and** the scroller's bottom is
  more than one header height below it; hidden otherwise (at rest, and once the table ends).
- **Position:** left edge and width equal the scroller's visible box (`getBoundingClientRect().left`
  and `clientWidth`, so the desktop box's vertical scrollbar is never covered). Each copied cell
  takes the real cell's rendered width.
- **Horizontal scroll:** the copy follows the scroller's `scrollLeft`; on mobile its first cell stays
  put (the corner of the pinned first column).
- **Interaction:** it is the same header element rendered twice, so a tap/click on a copied
  Affixes header sorts, and copied `Tip`s open (tap on touch: the fixed bottom strip; hover on
  desktop: the bubble below the header, not clipped). A vertical drag on the copy scrolls the page.
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
// table still reaches more than one header height below it.
export function floatingHeadVisible({headTop, headHeight, boxBottom, stickTop}) {
    return headTop < stickTop && boxBottom > stickTop + headHeight;
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

Its callbacks write directly to the copy's DOM through refs:

- `--copy-scroll` custom property = the scroller's `scrollLeft` (in px);
- `left` / `width` of `.floatingHead` from the scroller's rect and `clientWidth`;
- the copy table's `width` and each copied cell's `width` and `min-width` from the real cells'
  `getBoundingClientRect().width`;
- `.on` toggled by `floatingHeadVisible`, with `stickTop` read from the copy's own computed `top`
  (CSS remains the single source of truth for 0 vs 52px; re-read on `resize`, since crossing the
  980px breakpoint changes it).

React never clears these inline widths, because it sets no `style` on those cells. The
ResizeObserver catches every width change: page change, sort-arrow change, font load, rotation.
The effect cleans up all listeners and the observer on unmount (tab switch).

### CSS (`src/styles.css`)

New block next to the Affixes table rules:

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

.floatingHead thead {
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
`.affixTable th:first-child` (0,2,1) wherever either sits. Search the 720px and 480px blocks for any
other first-column rule that could still interfere.

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
rest (header below the line); shown once the header passes the line; hidden when the box bottom
is within one header height of the line; the exact boundaries; with `stickTop` 0 and 52.

**Browser (headless Chromium over CDP; the earlier harness copied into the scratchpad):**

1. **Desktop, 1500px, before any touch emulation:**
   - full-page screenshots of all 19 tabs at rest, `main` vs branch: pixel-identical;
   - on Affixes, Corruptions and the Drop calculator: scrolling the page past the box top shows
     the copy at `top: 0`, every copied cell's left edge matching the real header's to the pixel;
   - scrolling only inside the 800px box: native sticky header, no copy;
   - a hover `Tip` on the copy is not clipped; clicking a copied Affixes header sorts.
2. **Phone emulation, 390×844**, same three tables:
   - the copy sits at 52px, hidden at rest and after the table ends;
   - after a sideways swipe the columns line up and the corner cell stays pinned;
   - a tap on a copied header sorts; a tap on a copied `Tip` opens the fixed bottom bubble;
   - changing page and rotating re-sync the widths;
   - no horizontal page overflow.
3. `npm run lint` (0 problems), `npm test`, `npm run build`.
4. **Real phone:** the branch served on the Tailscale address only
   (`--host 100.91.245.9 --port 5179 --strictPort`) for a fling, swipe and sort feel check.

## Risks

- **Horizontal sync lags a frame** behind a fast swipe on some devices (scroll events vs
  compositor). Accepted in the mockup; vertical following is unaffected.
- **iOS Safari and `min-width` on table cells** (open item in the deferred review minors): the
  copied cells get explicit `width` as well as `min-width`, so the copy doesn't depend on
  `min-width` being honoured; the real table's behaviour is unchanged by this work.
