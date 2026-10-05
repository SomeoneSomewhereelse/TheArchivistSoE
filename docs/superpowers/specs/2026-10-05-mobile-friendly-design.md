# Mobile-friendly GitHub Pages site — design

**Date:** 2026-10-05
**Branch:** `mobile-friendly` (based on `affixes-group-column`)
**Status:** approved in brainstorming, awaiting spec review

## Intent

People open The Archivist on phones mostly to **browse and theorycraft away from the PC**,
not for quick in-game lookups. The priority is therefore full access to the data — every tab,
every table column — in a layout that doesn't fight a 390px-wide touch screen.

### Success criteria

- Every one of the 18 tabs is usable at 390px width: no element extends past the viewport
  edge, nothing is blocked (the Affixes table currently is).
- The header no longer consumes 190–350px before content; lists use a single page scroll
  instead of a nested scroll box; selecting an item shows its details where the user's
  hand already is.
- Desktop looks and behaves as today, except for the three deliberate desktop-visible
  changes listed under *Constraints*.

### Constraints

- **Breakpoint:** "mobile" means `max-width: 980px`, the breakpoint the stylesheet already uses.
- **Desktop unchanged**, except: (1) short labels on numeric Affixes columns, (2) null-aware
  sorting on the Affixes table, (3) the current tab is reflected in the URL hash.
- **Visual identity unchanged:** ExocetBlizzard font, dark/gold theme, existing tokens in
  `src/styles.css`.
- **No new runtime dependencies.** Hash routing is a small in-house hook, not a router
  library. Vitest is added as a **dev** dependency only.
- **Approach:** CSS-first. Most changes are media-query rules in `src/styles.css`; JSX changes
  in `src/App.jsx` are surgical; genuinely new logic goes in small new modules under `src/`
  rather than growing the 4,700-line `App.jsx`. A wholesale `App.jsx` split is out of scope.

### Out of scope

- Deep links to items, search terms or filter state (URL carries the tab only).
- Visual redesign (typography, spacing system, density) — that was the rejected "option C".
- Cleaning up duplicate entries in `Affixes.json` `displayExcludedItemTypeNames`
  (177 affixes list the same excluded type several times; a data issue, displayed as-is).
- Restructuring `App.jsx` into modules beyond the new helper files below.

## 1. Navigation and header (mobile only)

**Pattern: menu button + tab sheet** (mockup "H2").

- The header is pinned (`position: sticky; top: 0`) and contains two rows:
  1. A menu button showing the current tab's title (`☰ Uniques ▾`), and the Damnation toggle.
  2. The tab's search input, plus — on tabs that have extra filters — a `Filters (n) ▾` button.
- Tapping the menu button opens a bottom sheet listing all 18 tabs in a two-column grid,
  under these group headings (existing tab keys in parentheses):
  - **Items:** Weapons (`weapons`), Armors (`armors`), Uniques (`uniques`),
    Runewords (`runewords`), Sacreds (`sacreds`), Fate Cards (`fatecards`)
  - **Mechanics:** Affixes (`affixes`), Skills (`skills`), Ascendancies (`ascendancies`),
    Corruptions (`corruptions`), Mapping (`mapping`), Infernal Kiln (`kiln`),
    Cube Recipes (`cube`)
  - **Tools:** Skill Calculators (`calculators`), Drop calculator (`dropcalc`)
  - **About:** Standard Mode (`changes`), Damnation Mode (`damnation`), Help (`help`)
- Badges (Beta/Alpha) render as they do today via `renderTabTitle`. The active tab is
  highlighted in the sheet.
- The sheet closes on: selecting a tab, tapping the backdrop, or pressing Escape. Opening the
  sheet does **not** add a browser history entry.
- Desktop keeps today's tab row + "More" dropdown unchanged.

**Filters folding.** On the tabs whose `FiltersBar` has selects/toggles beyond the search box
— Weapons, Armors, Uniques, Runewords, Sacreds, Affixes, Corruptions — those controls fold
behind the `Filters (n) ▾` button (collapsed by default), where `n` is the number of those
filters whose value differs from its initial state value. Search stays visible. Tabs whose
panel is only a search input (Fate Cards, Skills, Ascendancies, Kiln, Mapping, Cube, Standard
Mode) show no Filters button. The Drop calculator's selects are its primary inputs and are not
folded (see §5). The existing collapsible Rune filter panel (Runewords/Sacreds) is left as is.

## 2. URL reflects the current tab (desktop and mobile)

- Format: `#/<tabKey>` using the existing `TABS` keys, e.g.
  `https://…/TheArchivistSoE/#/affixes`. Hash-based so it works on GitHub Pages without
  server-side fallback.
- A new module `src/hashTab.js` exports:
  - `parseTabFromHash(hash, validKeys)` → a valid tab key, or `null` for empty/unknown hashes
    (pure, unit-tested).
  - `useHashTab(...)` hook (or equivalent wiring in `App`) that syncs both directions.
- **Sync is driven by the `tab` state itself**, not by `selectTab`: in-app links
  (`handleMarkdownAppLink`, jump-to-code/unique/sacred) call `setTab` directly, so an effect
  on `tab` writes the hash. Changes push a history entry so Back/Forward step through tabs;
  `hashchange`/`popstate` sets `tab` from the hash.
- On load, a valid hash wins over the default tab; empty or unknown hash → `weapons` (today's
  default), and the hash is normalised to `#/weapons` with `replaceState` (no extra history
  entry).
- Existing keyboard tab navigation (←/→) keeps working and updates the hash through the same
  effect.
- The three existing `<a href="#">` in-app links already call `preventDefault`, so they will
  not clobber the hash; this must stay true for any link touched by this work.

## 3. List + detail tabs (mobile only)

Applies to Weapons, Armors, Uniques, Runewords, Sacreds, Fate Cards.

**Pattern: expand in list** (mockup "D2").

- The list loses its own scroll box on mobile (today `.list { max-height: 45vh }`); the page
  scrolls as one, under the pinned header.
- No item is pre-selected on mobile; the expanded row is its own state (e.g. `expandedIndex`,
  `null` by default), separate from the desktop `activeIndex`. Tapping a row expands that item's existing tooltip
  component (`WeaponTooltip`, `UniqueTooltip`, …) directly beneath the row. Tapping the same
  row collapses it; tapping another row collapses the first and expands the new one.
- After expanding, the opened row is scrolled so its top sits just below the pinned header
  (`scroll-margin-top` equal to the header height), so a collapse above it doesn't throw the
  user's place off-screen.
- The separate `TooltipShell` beside/below the list is not rendered on mobile; desktop keeps
  the two-column list + sticky tooltip layout and first-item auto-selection.
- Links inside an expanded tooltip behave as today (jump to another item/tab); a jump within
  the same tab expands the target row.
- The text-heavy tabs (Skills, Ascendancies, Kiln, Mapping, Cube, Standard Mode, Damnation,
  Help) change only through the new header. The go-to-top button stays.

## 4. Tables

All three tables share `.affixTable` / `.affixTableScroll`, so the mobile rules are shared.

**Swipe-table pattern** (mockup "A"), mobile only:

- `.affixTableScroll` keeps `overflow-x: auto` but drops its `max-height` (420px on mobile
  today) so the page scrolls vertically and the table scrolls horizontally.
- The first column is pinned with `position: sticky; left: 0` and an opaque background.
- The header row scrolls away with the page (sticky-top and horizontal overflow can't combine
  without reintroducing a nested vertical scroll box). Tapping a header sorts, as on desktop.

**Affixes**

- Remove the `isMobile` early return ("The Affixes table is not viewable on mobile") and the
  now-unused `useIsMobile(895)` call in `AffixesPanel`.
- On mobile, add a second pager below the table so users don't scroll back up after 50 rows
  to change page. (Mobile only, keeping desktop within the *Constraints* exceptions.)
- **Short labels, everywhere:** `Affix level` → `Lvl`, `Group` → `Grp`, `Frequency` → `Freq`,
  `Max level` → `Max lvl`, `Required level` → `Req lvl`. Each of these headers has a `Tip`
  whose text is the full name, a colon, then the explanation — e.g. "Affix level: Determines
  minimum item level…". Required level has no tooltip today; it gets a new
  `affixRequiredLevel` entry in `TOOLTIPS_TEXT_MAP`: "Required level: Minimum character level
  needed to use an item with this affix."

**Corruptions:** same swipe-table rules, and the same mobile-only bottom pager (it pages 1,087
rows by 50, with the same scroll-back problem). With three columns it mostly fits; overflow-x
covers long cells.

**Drop calculator results:** same swipe-table rules with the first (Monster) column pinned.

**Null-aware sorting (desktop and mobile, Affixes table)**

- New module `src/sortCompare.js` exporting a comparator, e.g.
  `compareValues(a, b, dir, { missing: "low" | "high" })`, plus an `isMissing(v)` helper.
  Pure, unit-tested.
- **Missing** means `null`, `undefined`, `""`, or an empty array.
- Rule: a missing value counts as the **lowest** value — first when ascending, last when
  descending — so flipping direction reverses the whole list.
- Per-column semantics:

  | Column | Missing in data | Treatment |
  |---|---|---|
  | Max lvl (`maxLevel`) | 1,027 rows | missing = **highest** (no cap) — last asc, first desc |
  | Req lvl (`requiredLevel`) | 6 | missing = lowest |
  | Class (`classDisplayName`) | 1,281 | missing = lowest |
  | Item types | 10 | missing = lowest |
  | Excluded item types | 1,177 | missing = lowest |
  | Attributes (empty `displayProperties`) | 12 | missing = lowest (the `attrs` special-case sort uses the same rule) |
  | Rares (`rare`) | 205 stored as `""` | **not** missing — boolean, `""` = No |
  | Name, Lvl, Grp, Freq | 0 | n/a |

- Ties keep their incoming order (`Array.prototype.sort` is stable; the incoming order is the
  existing type-then-name pre-sort).
- This replaces today's coercions such as `Number(it?.maxLevel || 0)`, which sorts missing
  Max level as `0`.

## 5. Overflow fixes and tooltips (mobile only unless noted)

- **Drop calculator filters:** the inline-styled flex row at `App.jsx` (`<div style={{display:
  "flex", gap: 12, width: "100%"}}>` inside the Drop calculator's `filtersPanel`) never wraps
  and holds fixed-260px selects, making it 856px wide and widening the whole page — which is
  also why the tab row ran off-screen on that tab. Replace the inline style with a class that
  wraps; on mobile the selects go full width.
- **Skill calculators:** the Reset button lives in `.filtersResetPanel` inside `.infoHeader`,
  a non-wrapping flex row; mobile CSS sets `.filtersResetPanel { width: 100% }`, pushing it
  ~170px off-screen. Let `.infoHeader` wrap on mobile so the button drops below the title.
- **Uniques SoE asterisk:** the `*` after long unique names overflows its row by a few
  pixels; contain it within the ellipsised name.
- **Tooltips on touch devices** (`@media (hover: none)`; desktop hover unchanged):
  - `Tip` gains tap-to-toggle state; tapping elsewhere closes it. Only one tooltip is open at
    a time.
  - The bubble renders `position: fixed` as a strip near the bottom of the viewport (8px side
    insets, no min-width), so it can't run off-screen and isn't clipped inside the swipe
    tables.
  - Drop `backdrop-filter` on `.affixTable thead` on mobile (it would become the containing
    block for the fixed bubble, and the header isn't sticky there anyway).
  - In sortable headers, one tap both sorts and shows the label's tooltip.
- **Footer:** on mobile, change from fixed-to-viewport to a normal end-of-page footer,
  removing the `padding-bottom: 80px` compensation on `.wrap`. Desktop unchanged.

## 6. Testing and verification

- **Vitest** (dev dependency, `npm test` script) for the two pure modules, written test-first:
  - `sortCompare`: each missing-value rule in both directions, Max lvl's inverted rule, Rares
    boolean handling, numeric vs string comparison, stability of ties.
  - `hashTab`: valid key, unknown key, empty hash, malformed hash (`#`, `#/`, extra segments).
- **Headless-browser checks** (Chromium via CDP, scripts kept out of the repo):
  - **Mobile survey, 390×844:** all 18 tabs — no element's right edge beyond the viewport,
    Affixes renders a table.
  - **Mobile interactions:** tab sheet open/select/backdrop-close; hash updates and Back
    button; row expand/collapse and scroll position; Filters fold + count; tooltip tap
    open/close and on-screen placement; null-aware sort on Max lvl / Class / Req lvl in both
    directions; top and bottom pagers on Affixes and Corruptions.
  - **Desktop regression, 1500px:** screenshot every tab on `main` and on the branch and
    compare; the only expected differences are the Affixes Group column (from
    `affixes-group-column`), the short labels and their tooltip text, null-aware sort order,
    and the URL hash.
- **Real-device check:** serve the dev build bound to the Tailscale address only
  (`100.91.245.9`) for the user to test on their phone before merging.
- **Lint/build:** `npm run build` passes; `npm run lint` reports no problems beyond the 14
  present on `main` today.

## Delivery

- `affixes-group-column` (Group column + Affix level sort fix) is committed; `mobile-friendly`
  branches from it because both touch the Affixes sort logic.
- `origin` points at `https://github.com/SomeoneSomewhereelse/TheArchivistSoE.git` for fetch
  and push. Pushing and opening PRs happen only when the user asks.
