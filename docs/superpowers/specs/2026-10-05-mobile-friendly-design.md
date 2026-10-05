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

- **Only the top row is pinned** (`position: sticky; top: 0`, ~50px): the `TabsBar`, which on
  mobile renders a menu button showing the current tab's title (`☰ Uniques ▾`) and the
  Damnation toggle. `TabsBar` is rendered once at App level (App.jsx ~4320), so pinning it is
  CSS-only.
- The tab's search input and — on tabs that have extra filters — a `Filters (n) ▾` button sit
  on one row directly below, **in normal flow**: they scroll away with the page, and the
  existing go-to-top button brings them back in one tap. (Pinning the search row was
  considered and rejected: each tab renders its own search input inside its own
  `.filtersStack` alongside `InfoPanel` and the Rune filter panel, so pinning it would need a
  per-tab JSX restructure.) The expanded Filters panel is likewise in normal flow.
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
  highlighted in the sheet. `changelog` (reached from the footer's "Wiki version" link) is not
  in the sheet; while it is active the menu button reads "☰ Changelog ▾".
- The sheet closes on: selecting a tab, tapping the backdrop, or pressing Escape. Opening the
  sheet does **not** add a browser history entry — intentionally, pressing Back while the
  sheet is open goes to the previous tab rather than just closing the sheet.
- Desktop keeps today's tab row + "More" dropdown unchanged.
- **Prerequisite for pinning:** `.appRoot { overflow-x: hidden }` (styles.css:44) forces
  `overflow-y` to compute to `auto`, making `.appRoot` a (never-scrolling) scroll container
  that captures `position: sticky`. In the mobile media query only, change it to
  `overflow-x: clip`, which clips without creating a scroll container. Not changed globally:
  that would activate the currently-inert desktop `.tooltip { position: sticky }`.

**Filters folding.** On the tabs whose `FiltersBar` has selects/toggles beyond the search box
— Weapons, Armors, Uniques, Runewords, Sacreds, Affixes, Corruptions — those controls fold
behind the `Filters (n) ▾` button (collapsed by default), where `n` counts the folded filters
that are currently **truthy** (a non-empty select value, a toggle set to `"yes"`, a non-empty
`selectedRunes` counting as one). Truthiness rather than "differs from initial state" because
`uberValue`/`hellforgedValue` start as `false` but toggle between `"yes"` and `""`. Search
stays visible. Tabs whose
panel is only a search input (Fate Cards, Skills, Ascendancies, Kiln, Mapping, Cube, Standard
Mode) show no Filters button. The Drop calculator's selects are its primary inputs and are not
folded (see §5). The existing collapsible Rune filter panel (Runewords/Sacreds) is left as is.

## 2. URL reflects the current tab (desktop and mobile)

- Format: `#/<tabKey>`, e.g. `https://…/TheArchivistSoE/#/affixes`. Hash-based so it works on
  GitHub Pages without server-side fallback.
- **Valid keys** are an explicit list: the 18 sheet tabs plus `changelog`. Not
  `Object.keys(TABS)` — `TABS` also contains `essences`, which has no panel (`#/essences`
  would render a Weapons list with no tooltip).
- A new module `src/hashTab.js` exports:
  - `parseTabFromHash(hash, validKeys)` → a valid tab key, or `null` for empty/unknown/malformed
    hashes (pure, unit-tested).
  - `useHashTab(...)` hook (or equivalent wiring in `App`) that syncs both directions.
- **Initial state** is lazy: `useState(() => parseTabFromHash(location.hash, VALID) ?? "weapons")`,
  so a deep link never flashes Weapons first. If the hash was empty/invalid, normalise it to
  `#/weapons` with `replaceState` (no extra history entry).
- **Sync is driven by the `tab` state itself**, not by `selectTab`: several paths call `setTab`
  directly (`handleMarkdownAppLink`, `openDropCalculator`, `handleVersionClick`, the
  jump-to-unique/sacred flows), so an effect on `tab` writes the hash. It pushes a history
  entry **only when the hash differs from `#/<tab>`** — otherwise popstate → `setTab` → effect
  would push again, and React StrictMode (main.jsx) double-fires effects in dev.
  `popstate` sets `tab` from the hash.
- Existing tab-change side effects (filter/`activeIndex` resets, etc.) run unchanged because
  they key off `tab`, whichever path changed it.
- The three existing `<a href="#">` in-app links already call `preventDefault`, so they will
  not clobber the hash; this must stay true for any link touched by this work.

## 3. List + detail tabs (mobile only)

Applies to Weapons, Armors, Uniques, Runewords, Sacreds, Fate Cards.

**Pattern: expand in list** (mockup "D2").

- The list loses its own scroll box on mobile; the page scrolls as one, under the pinned
  header. `.list { max-height: 45vh }` appears in **both** the 980px and 720px media blocks
  (styles.css ~1696 and ~2035) — both must change.
- Mobile gating in JSX uses the existing `useIsMobile()` hook (default 980px), matching the CSS
  breakpoint.
- No item is pre-selected on mobile; the expanded row is its own state (`expandedIndex`,
  `null` by default), separate from the desktop `activeIndex`. Tapping a row expands that
  item's existing tooltip component (`WeaponTooltip`, `UniqueTooltip`, …) directly beneath
  the row. Tapping the same row collapses it; tapping another row collapses the first and
  expands the new one.
- **Rendering:** `ListPanel` receives a `renderDetail(item)` prop from `App` (the tooltips need
  App-level callbacks: `jumpToCode`, `jumpToUnique`, `jumpToSacred`, `handleMarkdownAppLink`,
  `openDropCalculator`). The detail renders as a **sibling after** the `.row` element, not
  inside it, so taps on links or `Tip`s inside the detail don't trigger the row's toggle.
- **ListPanel side effects on mobile:** the `.active` class and the `scrollIntoView` on
  `activeIndex` change (App.jsx ~1179–1197) are driven by `expandedIndex` instead, so the
  page isn't scrolled to row 0 on load and row 0 isn't highlighted.
- After expanding, the opened row is scrolled so its top sits just below the pinned top row
  (`scroll-margin-top` equal to the pinned top row's height), so a collapse above it doesn't
  throw the user's place off-screen.
- **`expandedIndex` lifecycle:**
  - Reset to `null` whenever `tab` or the `filtered` list changes (any search/filter change —
    the existing `activeIndex` reset effect misses `affixTypeValue`, `runeCountValue`,
    `selectedRunes` and `hellforgedValue`, so it must not be relied on).
  - Every jump path that sets `activeIndex` to a target — `jumpToCode`, the
    `pendingUniqueCode`, `pendingSacredMatch` and `pendingLinkTarget` effects — also sets
    `expandedIndex` to the same index on mobile and scrolls it into view, so cross-tab jumps
    land on the expanded target. (Order matters: the jump must win over the reset.)
- The separate `TooltipShell` beside/below the list is not rendered on mobile; desktop keeps
  the two-column list + tooltip layout and first-item auto-selection.
- The text-heavy tabs (Skills, Ascendancies, Kiln, Mapping, Cube, Standard Mode, Damnation,
  Help) change only through the new header. The go-to-top button stays.

## 4. Tables

All three tables share `.affixTable` / `.affixTableScroll`, so the mobile rules are shared.

**Swipe-table pattern** (mockup "A"), mobile only:

- `.affixTableScroll` keeps `overflow-x: auto` but drops its `max-height` and `min-height`
  (desktop `min-height: 400px`; `max-height: 420px` set in **both** the 980px block ~1915 and
  the 480px block ~2129 — both must change) so the page scrolls vertically and the table
  scrolls horizontally.
- The first column is pinned with `position: sticky; left: 0` and an opaque background. On
  mobile the table uses `border-collapse: separate; border-spacing: 0` (desktop uses
  `collapse`, under which borders don't travel with sticky cells). Message rows using
  `colSpan` (e.g. Drop calculator's empty/loading rows) are excluded from the pinned rule.
- The header row scrolls away with the page (sticky-top and horizontal overflow can't combine
  without reintroducing a nested vertical scroll box). Tapping a header sorts, as on desktop.

**Affixes**

- Remove the `isMobile` early return ("The Affixes table is not viewable on mobile") and its
  `useIsMobile(895)` call in `AffixesPanel` (the hook stays in use for §3's mobile gating, so
  no unused-symbol lint error).
- On mobile, add a second pager below the table so users don't scroll back up after 50 rows
  to change page. (Mobile only, keeping desktop within the *Constraints* exceptions.)
- The Rares header's `Tip` currently wraps the sort arrow (App.jsx ~3148); move the arrow
  outside the `Tip` to match the other headers.
- **Short labels, everywhere:** `Affix level` → `Lvl`, `Group` → `Grp`, `Frequency` → `Freq`,
  `Max level` → `Max lvl`, `Required level` → `Req lvl`. Each of these headers has a `Tip`
  whose text is the full name, a colon, then the explanation — e.g. "Affix level: Determines
  minimum item level…". Required level has no tooltip today; it gets a new
  `affixRequiredLevel` entry in `TOOLTIPS_TEXT_MAP`: "Required level: Minimum character level
  needed to use an item with this affix."

**Corruptions:** same swipe-table rules, and the same mobile-only bottom pager (it pages 1,087
rows by 50, with the same scroll-back problem). With three columns it mostly fits; overflow-x
covers long cells.

**Drop calculator results:** same swipe-table rules with the first (Monster) column pinned,
and the same mobile-only bottom pager (it also pages by 50).

**Null-aware sorting (desktop and mobile, Affixes table)**

- New module `src/sortCompare.js` exporting a comparator, e.g.
  `compareValues(a, b, dir, { missing: "low" | "high" })`, plus an `isMissing(v)` helper.
  Pure, unit-tested.
- **Missing** means `null`, `undefined`, `""`, or an empty array.
- Rule: a missing value counts as the **lowest** value — first when ascending, last when
  descending — so flipping direction reverses the order of distinct values (ties keep their
  incoming order in both directions).
- In practice only **Max lvl** changes order versus today: for the other columns, missing
  values already sort lowest (`Number(null || 0)`, `""` in `localeCompare`, empty `attrs`
  property `""`). The comparator makes that explicit and guards against regressions.
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
  and holds selects with inline `flex: "0 0 260px"` / `220px` / `180px` (App.jsx ~2201–2222),
  making it 856px wide and widening the whole page — which is also why the tab row ran
  off-screen on that tab. Move both the row's and the selects' inline styles into classes
  (inline styles would beat media-query rules); the row wraps, and on mobile the selects go
  full width. Desktop sizes stay as today.
- **Skill calculators:** the Reset button lives in `.filtersResetPanel` inside `.infoHeader`,
  a non-wrapping flex row; mobile CSS sets `.filtersResetPanel { width: 100% }`, pushing it
  ~170px off-screen. Let `.infoHeader` wrap on mobile so the button drops below the title.
- **Uniques SoE asterisk:** the survey flagged the `*` after long unique names as extending
  past the viewport, but it sits inside `.uniqueName { overflow: hidden }`, so it may be a
  clipped box rather than visible overflow. Verify visually first; fix only if it actually
  shows outside the row.
- **Tooltips on touch devices** — all rules below are gated on `@media (hover: none)`
  (including the `backdrop-filter` change, so tablets wider than 980px behave the same);
  desktop hover unchanged:
  - `Tip` gains tap-to-toggle state; tapping elsewhere closes it. Only one tooltip is open at
    a time.
  - Neutralise `.tipWrap:hover .tipBubble` (styles.css ~822) so touch browsers' sticky
    `:hover` after a tap doesn't fight the toggle state.
  - The bubble renders `position: fixed` as a strip near the bottom of the viewport (8px side
    insets, no min-width), so it can't run off-screen and isn't clipped inside the swipe
    tables.
  - Drop `backdrop-filter` on `.affixTable thead` (it would become the containing block for
    the fixed bubble).
  - In sortable headers, one tap both sorts and shows the label's tooltip.
- **Footer spacing:** the footer is not fixed — `.footer` is `position: relative;
  margin-top: auto` (styles.css ~1406) — but the "Mobile footer" blocks add
  `padding-bottom: 80px` to `.wrap`, leaving empty space at the end of every page on mobile.
  Remove that padding from **both** the 980px and 720px blocks (~2140–2162). Desktop
  unchanged.

## 6. README: credit the original project

`README.md` is still the unmodified Vite template boilerplate. Replace it with a short
project README:

- Title and a one-line description: The Archivist, a wiki for the Project Diablo 2 mod
  *Sanctuary of Exile*, deployed to GitHub Pages.
- **Credit:** this repository is a fork of
  [Lukaszpg/TheArchivistSoE](https://github.com/Lukaszpg/TheArchivistSoE), created by
  MindH1ve ([@Lukaszpg](https://github.com/Lukaszpg)) — matching the attribution already in
  the site footer — with a link to the original repository.
- Local development: `npm ci`, `npm run dev`, `npm run build`, `npm run lint`, `npm test`.

## 7. Testing and verification

- **Vitest** (dev dependency, `npm test` script) for the two pure modules, written test-first.
  Test files import `describe`/`it`/`expect` explicitly from `vitest` (ESLint has no vitest
  globals configured):
  - `sortCompare`: each missing-value rule in both directions, Max lvl's inverted rule, Rares
    boolean handling, numeric vs string comparison, stability of ties.
  - `hashTab`: valid key, unknown key, empty hash, malformed hash (`#`, `#/`, extra segments).
- **Headless-browser checks** (Chromium via CDP, scripts kept out of the repo):
  - **Mobile survey, 390×844:** all 18 tabs plus Changelog — no *visible* element's right
    edge beyond the viewport (ignoring boxes clipped by an `overflow: hidden` ancestor),
    Affixes renders a table.
  - **Deep links:** loading `#/affixes` directly opens Affixes with no Weapons flash;
    `#/essences` and `#/bogus` fall back to Weapons with the hash normalised.
  - **Cross-tab jumps on mobile:** a tier link and a unique/sacred link land on the target tab
    with the target row expanded and in view.
  - **Mobile interactions:** tab sheet open/select/backdrop-close; hash updates and Back
    button; row expand/collapse and scroll position; Filters fold + count; tooltip tap
    open/close and on-screen placement; null-aware sort on Max lvl / Class / Req lvl in both
    directions; top and bottom pagers on Affixes, Corruptions and Drop calculator.
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
