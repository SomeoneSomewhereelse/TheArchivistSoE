# Multi-field sorting for the Affixes table — design

**Date:** 2026-10-07
**Branch:** to be created from `main` when implementation starts (manual worktree, `.worktrees/<name>`)
**Status:** approved in brainstorming, awaiting spec review

## Intent

The Affixes table (1,412 rows) sorts by one column. Many columns repeat heavily (Rares, Grp, Freq,
Lvl, Item types), so ties are everywhere and their order is just `Affixes.json` order. Readers want
orders like "Grp, then Lvl" (each affix family's tiers in order) or "Item types, then Attributes,
then Max lvl".

The audience is **wiki readers in general**, on desktop and on phones: multi-sort has to be visible
and obvious, and a reader who only ever sorts by one column must notice nothing new except the
sort bar.

### Success criteria

- A reader can build, read, reorder the direction of, and remove a multi-column sort on a 390px
  touch screen as easily as on desktop, with no hidden gestures.
- The full sort order is always readable, even when the sorted headers are swiped out of view.
- Every existing single-column rule still holds inside a multi-column sort (missing values lowest,
  Max lvl's null "no cap" highest, Rares boolean, Attributes by property then max, stable ties).
- A plain header click with the checkbox off behaves as today.
- Desktop at rest is pixel-identical on every tab except Affixes (which gains the sort bar).

### Constraints

- Plain JS, plain CSS, no new runtime dependencies; lint 0 problems, no `eslint-disable`; React
  Compiler rules (no `setState` in effects, no ref reads during render).
- Pure logic goes in `src/sortCompare.js`, tests first (Vitest; test files import `describe`/`it`/
  `expect` from `"vitest"`). The existing `compareAffixes` and its tests stay intact.
- New UI goes in a small new module, not inline in `App.jsx`.

### Out of scope

- Sorting for Corruptions and the Drop calculator (they have no sortable headers; that stays).
- Putting the sort in the URL hash (it stays `#/<tab>`).
- Presets or saved sorts (persistence covers the "my usual sort" case).
- Shift-click or any other modifier gesture: the checkbox is the only way into multi-sort.
- Saving the checkbox state.

## Approaches considered

1. **Checkbox plus a sort summary line (chosen).** A "Multi-sort" checkbox turns header clicks from
   "replace" into "append"; an always-visible "Sorted by:" line of chips shows the order and lets
   you flip or remove each key.
2. **Checkbox only, numbered header arrows.** No summary line; removal by cycling a header
   ▲ → ▼ → off. Rejected: on a phone the sorted headers are usually swiped out of view, and the
   three-state cycle is hidden.
3. **Sort builder** ("+ Add column" dropdown with chips), header clicks single-column. Rejected:
   more UI than needed, and the user preferred the sticky-Shift checkbox idea.

Shift-click as a desktop shortcut was considered and dropped: it would interact confusingly with
the checkbox (hold Shift while the checkbox is on?) for little gain.

## Behaviour

### The sort list and the default

- The sort is an ordered list of `{key, dir}` (`dir` is `"asc"` or `"desc"`), keys unique.
- **The list can be empty, and that is the starting state.** An empty list *sorts* by the default,
  **Attributes ▲**, as an implicit fallback, but Attributes is not a *member* of the list:
  `effectiveSort(list) = list.length ? list : DEFAULT_AFFIX_SORT`.
- Sorting, header markers and `aria-sort` use the effective sort. The sort bar, clicks, and storage
  use the list itself.

### Header clicks

- **Checkbox off (plain click)** acts on the effective sort, exactly like today's single sort:
  - if the effective sort is exactly one key and it is the clicked column, the list becomes that
    column with its direction flipped (so with an empty list, clicking Attributes gives
    `[Attributes ▼]`);
  - otherwise the list becomes `[clicked ▲]`, replacing everything (a multi-key list included).
- **Checkbox on (multi click)** acts on the list:
  - a column not in the list is **appended** with ▲ (with an empty list, clicking Grp gives
    `[Grp ▲]`, not `[Attributes ▲, Grp ▲]`; clicking Attributes gives `[Attributes ▲]`: the rows
    don't move, but the muted default label becomes a real chip, acknowledging the click);
  - a column already in the list has its direction **flipped in place**, keeping its position;
  - nothing is removed by a header click; removal is only through the chip ×.
- A header click also hits the `Tip` inside the cell, as today (on touch it opens the bubble and
  sorts). The floating sticky header renders the same cells, so it behaves identically.

### Header markers

- Effective sort of one key (including the empty-list default): a lone arrow on that column, the
  same markup as today (`<span className="sortArrow">▲</span>`). At rest the headers look exactly
  as they do now.
- Two or more keys: each sorted column shows its 1-based position and arrow, e.g. `1▲`, `2▼`
  (`<span className="sortArrow"><span className="sortIndex">2</span>▼</span>`).
- `aria-sort="ascending" | "descending"` on the effective sort's **first** column only (ARIA allows
  one); no `aria-sort` attribute on the others.

### The sort bar

A new row in `AffixesPanel`, between the top pager and the table:

```
Sorted by: [Grp ▲ ×] › [Lvl ▲ ×] › [Max lvl ▼ ×]   Reset        ☐ Multi-sort
```

- **Non-empty list:** one chip per key, in order, separated by `›`. A chip has two buttons: the
  label-and-arrow part flips that key (`aria-label` "Grp ascending, reverse"), and **×** removes it
  (`aria-label` "Remove Grp"). Removing the last chip empties the list (back to the default).
- **Empty list:** a single muted, non-interactive label "Attributes ▲ (default)" (plain text, not a
  button; no ×).
- **Reset** (a button styled as a link) shows whenever the list is non-empty and empties it.
- **Multi-sort** checkbox: a real `<input type="checkbox">` inside a `<label>`, unchecked on every
  visit (not saved), reset when leaving the Affixes tab (the panel unmounts).
- Phone: the row wraps (chips and Reset first, the checkbox right-aligned on its own line if
  needed); chips, Reset and the checkbox's label are at least 32px tall.

### After any sort change

- **Page 1:** any change to the list returns the pager to the first page (today a sort change keeps
  the page number, showing an unrelated slice of the new order).
- **Back to the top:** if the table's top is above the viewport (you sorted from the floating
  sticky header deep in the table), scroll the table wrapper into view the way the bottom pager
  does (`scrollIntoView({block: "start"})`, which honours the mobile `scroll-margin-top`), and set
  the desktop box's `scrollTop` to 0. If the table's top is already on screen, nothing scrolls.

### Persistence

- The list is saved to `localStorage` under `"the-archivist-affix-sort"` as JSON on every change
  (an empty list saves as `[]`) and restored on load.
- A missing, corrupt or stale value (invalid JSON, not an array, unknown keys, bad directions,
  duplicate keys) is cleaned: invalid entries dropped, duplicates removed keeping the first; if
  nothing valid remains, the list is empty.
- Storage that throws (blocked, private mode) is ignored: the sort still works for the session.

## Structure

### Pure logic in `src/sortCompare.js` (tests first, in `src/sortCompare.test.js`)

Added beside the existing exports, all returning new arrays and never mutating their input:

```js
export const DEFAULT_AFFIX_SORT = [{key: "attrs", dir: "asc"}];

// Header text per sortable column; every key in AFFIX_SORT_KEYS needs one (a test enforces it).
export const AFFIX_SORT_LABELS = {
    name: "Name", attrs: "Attributes", level: "Lvl", group: "Grp", rare: "Rares", freq: "Freq",
    maxLevel: "Max lvl", types: "Item types", excluded: "Excluded item types", class: "Class",
    reqLevel: "Req lvl",
};

export function effectiveSort(list)                 // list.length ? list : DEFAULT_AFFIX_SORT
export function compareAffixesBy(a, b, sortList)    // first non-zero compareAffixes over the list; 0 if all tie
export function clickSort(list, key, {multi})       // the header-click rules above
export function flipSortKey(list, key)              // flip one key in place; no-op if absent
export function removeSortKey(list, key)            // drop one key; may return []; no-op if absent
export function parseStoredSort(raw)                // localStorage string (or null) -> clean list, [] if nothing valid
```

`compareAffixesBy` is called with `effectiveSort(list)`, so it never sees an empty list; given one,
it returns 0 (stable). An unknown key inside the list still throws through `affixSortValue`.

### State in `App` (`src/App.jsx`)

- `affixSort` becomes the list: `useState(() => readStoredSort())`, where `readStoredSort` wraps
  `parseStoredSort(localStorage.getItem("the-archivist-affix-sort"))` in try/catch (→ `[]`).
- `changeAffixSort(next)`: `setAffixSort(next)` and, in the same handler, a try/catch
  `localStorage.setItem(...)`. No effect, and nothing inside a state updater (StrictMode runs
  updaters twice).
- `AffixesPanel` gets `sort={affixSort}` and `onChangeSort={changeAffixSort}` (now taking the next
  list, not an updater function).

### `AffixesPanel` (`src/App.jsx`)

- `const [multi, setMulti] = React.useState(false)` above the early returns.
- `const active = effectiveSort(sort)`; `sorted` is memoized on `[all, sort]` and sorts with
  `compareAffixesBy(a, b, active)`.
- `usePager(sorted.length, {resetKey: sorted, ghost: true})`: `sorted` changes identity whenever the
  data or the sort changes, so the existing render-time reset in `pager.js` gives "page 1 after a
  sort change" with no change to `pager.js`.
- `changeSort(next)`: calls `onChangeSort(next)`, then the "back to the top" scroll, using the
  existing `wrapperRef` and the scroller (`wrapperRef.current.querySelector(".affixTableScroll")`),
  only when `wrapperRef.current.getBoundingClientRect().top < 0`. Used by header clicks and the sort
  bar.
- `handleSort(key)` = `changeSort(clickSort(sort, key, {multi}))`.
- The eleven hand-written header cells become one module-level list mapped to cells:

  ```jsx
  const AFFIX_COLUMNS = [
      {key: "name"}, {key: "attrs"},
      {key: "level", tip: "affixLevel"}, {key: "group", tip: "affixGroup"},
      {key: "rare", tip: "affixRares"}, {key: "freq", tip: "affixFrequency"},
      {key: "maxLevel", tip: "affixMaxLevel"},
      {key: "types"}, {key: "excluded"}, {key: "class"},
      {key: "reqLevel", tip: "affixRequiredLevel"},
  ];
  ```

  Each renders `<th className="sortable" aria-sort={…} onClick={() => handleSort(key)}>` with
  `<span className="thLabel">{tip ? <Tip text={String(TOOLTIPS_TEXT_MAP[tip])}>{label}</Tip> :
  label} {marker}</span>`, `label = AFFIX_SORT_LABELS[key]`. Same column order, same text, same
  Tips as today. No `style` prop on any `th` (the floating header writes inline widths).
- `<AffixSortBar sort={sort} onChange={changeSort} multi={multi} onMultiChange={setMulti}/>` between
  the top `.affixPager` and `<StickyHeadTable>`.

### `src/AffixSortBar.jsx` (new)

`export default function AffixSortBar({sort, onChange, multi, onMultiChange})`: stateless; renders
the "Sorted by:" label, the chips (or the muted default label), Reset and the checkbox, calling
`onChange(flipSortKey(sort, key))`, `onChange(removeSortKey(sort, key))`, `onChange([])` and
`onMultiChange(checked)`. Labels from `AFFIX_SORT_LABELS`.

### CSS (`src/styles.css`)

New block after the Affixes table / floating header rules: `.affixSortBar` (flex row, wrap, gap,
muted "Sorted by:"), `.sortChip` (button look from the existing tokens: the gold border family
used by active controls), `.sortChipFlip`, `.sortChipRemove`, `.sortChipSep`, `.sortDefault`
(muted), `.sortReset` (link look), `.multiSortToggle`, `.sortIndex` (small number before the arrow).
Touch sizing (≥ 32px) and wrapping in the 980px block; search the 720px and 480px blocks for any
rule that could override them.

### Docs

`CLAUDE.md`, Affixes section: the sort is an ordered list (empty = implicit Attributes ▲), stored
in `localStorage`, built with the Multi-sort checkbox; `compareAffixesBy` / `clickSort` live in
`sortCompare.js`; and the rule "every sortable column needs an entry in `AFFIX_SORT_KEYS` and a case
in `affixSortValue`" gains "and a label in `AFFIX_SORT_LABELS`".

## Testing

### Unit (Vitest, written first; additions to `src/sortCompare.test.js`)

- `compareAffixesBy`:
  - a one-key list equals `compareAffixes` for every key in `AFFIX_SORT_KEYS`, both directions;
  - a second key breaks only the first key's ties (rows the first key orders never reorder);
  - per-key missing rules hold inside a list (Grp ▲ then Max lvl ▲ puts null "no cap" last within
    each group; Grp ▲ then Req lvl ▲ puts null first within each group);
  - rows tied on every key keep their incoming order; an empty list returns 0;
  - an unknown key in the list throws.
- `effectiveSort`: `[]` → `DEFAULT_AFFIX_SORT`; a non-empty list → the same list.
- `clickSort`:
  - plain, empty list, Attributes → `[attrs desc]`; plain, empty list, Grp → `[group asc]`;
  - plain, sole key clicked → flipped; plain, multi-key list, any column → `[clicked asc]`;
  - multi, empty list, Grp → `[group asc]`; multi, empty list, Attributes → `[attrs asc]`;
  - multi, new column → appended `asc` at the end; multi, existing column → flipped in place, order
    unchanged.
- `flipSortKey` / `removeSortKey`: only their key changes; removing the last key → `[]`; an absent key
  → an equal list.
- Immutability: every helper given an `Object.freeze`-d list (and frozen entries) doesn't throw and
  returns a new array.
- `parseStoredSort`: `null`, `""`, `"nope"`, `"{}"`, `"[]"` → `[]`; unknown keys and bad directions
  dropped; duplicates keep the first; a valid list round-trips equal.
- `AFFIX_SORT_LABELS`: a non-empty string for every key in `AFFIX_SORT_KEYS`, and no extra keys.

### Browser (headless Chromium over CDP; a new `check-multisort.mjs` in the scratchpad)

1. **Desktop 1500px, before any touch emulation:**
   - all tabs except Affixes: full-page screenshots at rest, `main` vs branch, pixel-identical;
     Affixes: inspected by eye (the sort bar is the intended change; the header row itself is
     unchanged at rest);
   - at rest: "Attributes ▲ (default)", no Reset, checkbox off, lone ▲ on Attributes,
     `aria-sort="ascending"` on Attributes only;
   - plain clicks: Grp → `[Grp ▲]`; Grp again → `[Grp ▼]`; Lvl → `[Lvl ▲]`;
   - Reset → default; checkbox on; click Grp, Lvl, Lvl → chips "Grp ▲ › Lvl ▼", headers `1▲` /
     `2▼`, and the rendered rows are ordered by group ascending then level descending (read from
     the DOM); the floating header shows the same markers;
   - chip flip and ×; removing the last chip → default label;
   - from page 3, any sort change → page 1;
   - sorting from the floating header deep in the page scrolls the table top into view;
   - reload: the list is restored, the checkbox is off; a corrupt stored value loads the default
     with no console errors.
2. **Phone 390×844:**
   - the sort bar wraps with no horizontal page overflow; chips, Reset and checkbox label ≥ 32px
     tall;
   - tap flows: checkbox, header taps (real touch events), chip flip and ×, Reset;
   - with the table swiped sideways, the chips still show the whole order;
   - with the checkbox on, tapping a copied header in the floating header appends it.
3. `npm run lint` (0 problems), `npm test`, `npm run build`.
4. Real phone over Tailscale (bound only to `100.91.245.9:5179`): a feel check of the bar and the
   checkbox flow.

## Risks

- **Clicking a Tip in a header both opens the bubble and sorts** (existing behaviour). With the
  checkbox on, a reader tapping "Lvl" just to read its tip appends Lvl. Accepted, as today's single
  sort already re-sorts on that tap; chip × undoes it.
- **A long list wraps to several lines on a phone**, pushing the table down. Eleven keys at most;
  realistic lists are two or three.
