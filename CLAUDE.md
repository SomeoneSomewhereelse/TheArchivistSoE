# The Archivist

A static, single-page wiki for **Sanctuary of Exile**, a Project Diablo 2 mod: items,
uniques, runewords, affixes, skills, cube recipes, mapping, a drop calculator and more.
Deployed to GitHub Pages.

This repository is a fork of [Lukaszpg/TheArchivistSoE](https://github.com/Lukaszpg/TheArchivistSoE)
(author: MindH1ve). `origin` points at the fork
(`SomeoneSomewhereelse/TheArchivistSoE`). Don't push or open PRs unless asked.

## Stack

- React 19 + Vite 7, plain JavaScript (JSX, no TypeScript), plain CSS. Runtime dependencies
  are only `react` and `react-dom`, and adding more needs a good reason.
- ESLint 9 flat config (`eslint.config.js`): `no-unused-vars` ignores names matching `^[A-Z_]`.
- No router library: the current tab is React state (`tab` in `App`), kept in sync with the URL
  hash (`#/<tabKey>`) by `useHashTab` in `src/hashTab.js`.
- Vitest (dev dependency only) unit-tests the pure helper modules (`src/*.test.js`). Test files
  import `describe`/`it`/`expect` from `vitest` explicitly; ESLint has no Vitest globals.

## Commands

```
npm ci            # install (Node ≥ 22.12: Vitest 5; Vite 7 alone needs 20.19)
npm run dev       # dev server at http://localhost:5173/TheArchivistSoE/
npm run build     # production build to dist/
npm run lint      # ESLint
npm test          # Vitest unit tests (vitest run)
npm run preview   # serve dist/
```

**Lint is clean:** `npm run lint` reports 0 problems and CI fails on any (`LINT_BASELINE: 0` in
`ci.yml`). The React Compiler rules (`react-hooks/set-state-in-effect`, `immutability`, `refs`) are
active on `App`, so don't set state synchronously in an effect or read refs during render: adjust
state during render instead (`if (tab !== prevTab) {setPrevTab(tab); ...}`, as `App` does) or derive
the value. No `eslint-disable`.

## Layout

- `src/App.jsx`: most of the app, about 4,400 lines: constants, helpers, every panel
  and tooltip component, and `App` itself. Put new, self-contained logic in small new
  modules under `src/` instead of growing this file further.
- `src/tabList.js` (`TABS`, `TAB_GROUPS`, `VALID_TAB_KEYS`) and `src/tabs.jsx` (`TabsBar`,
  `MobileTabsBar`, `TabTitle`, the Damnation toggle); `src/pager.js` (`pagerState`, `usePager`) and
  `src/PagerButtons.jsx` for the paged tables; `src/useIsMobile.js`; `src/ErrorBoundary.jsx`.
- `src/StickyHeadTable.jsx`: the scroller + table used by Affixes, Corruptions and the Drop calculator, plus
  a fixed, `aria-hidden` floating copy of the header row that shows once the real header scrolls away
  (`attachFloatingHead` syncs it by direct DOM writes; the show/hide rule is `floatingHeadVisible` in
  `src/stickyHead.js`, tested beside it).
- `src/styles.css`: all real styling, about 2,400 lines (`src/App.css` is an unused template leftover; nothing imports it).
- `src/sortCompare.js` (Affixes sort rules), `src/hashTab.js` (tab ↔ URL hash), `src/pager.js`,
  `src/tabList.js` and `useIsMobile`'s `mobileQuery`: pure helpers, with their tests beside them.
- `src/main.jsx`: renders `<App/>` inside `React.StrictMode`, so effects double-fire in dev.
- `src/icons/*.svg`: item-type icons, imported as URLs.
- `public/data/*.json`: game data, fetched at runtime (see Data).
- `public/data/standard/*.txt`, `public/data/damnation/*.txt`: raw game tables
  (MonStats, TreasureClassEx, Weapons, …) used by the Drop calculator.
- `.github/workflows/ci.yml`: unit tests, a lint gate and the build, on pull requests and pushes
  to other branches. `.github/workflows/deploy.yml` runs it on every push to `main` and deploys
  to GitHub Pages only if it passes.
- `docs/superpowers/specs/`, `docs/superpowers/plans/`: design specs and implementation plans.

## Deployment and versions

- `vite.config.js` sets `base: '/TheArchivistSoE/'`. Build runtime URLs with
  `import.meta.env.BASE_URL`, never a hard-coded `/`.
- The wiki version is `package.json` `version`, exposed as `VITE_APP_VERSION` through the
  tracked `.env` (`VITE_APP_VERSION=$npm_package_version`). It shows in the footer, and
  clicking it opens the Changelog tab (`public/data/Changelog.json`).
- The mod version is the `GAME_VERSION` / `LATEST_RELEASE` constants at the top of `App.jsx`.

## How the app works

### Tabs

- `TABS` (`src/tabList.js`) maps tab keys to titles. A value is either a string or
  `{title, badge}` (Beta/Alpha), rendered by `<TabTitle/>`.
- The tab bar shows `mainKeys` plus a "More" dropdown of `moreKeys` (18 tabs in total).
  `TABS` also holds `changelog`, which is reached only from the footer, and `essences`,
  which has **no panel**, so don't expose it.
- On mobile (≤980px, via `useIsMobile`, which asks the same `matchMedia` query as the CSS)
  `MobileTabsBar` replaces `TabsBar`: a pinned top row with a menu button that
  opens a bottom sheet grouped by `TAB_GROUPS`. `VALID_TAB_KEYS` (the `TAB_GROUPS` keys plus
  `changelog`) is what the URL hash may name.
- `tab` changes through many paths, not just `selectTab`: `handleMarkdownAppLink`,
  `openDropCalculator`, `handleVersionClick` and the jump-to-unique/sacred flows call
  `setTab` directly. Anything that has to follow the current tab should key off the `tab`
  state. The URL-hash sync keys off `tab` too, so every path updates the URL.
- Keyboard: ↑/↓ move the selection in item lists on desktop (on mobile they're left alone, so
  they scroll the page), Escape blurs search, Ctrl+F (not Cmd) focuses search. There is no ←/→
  tab switching.
- A tab's panel renders inside `ErrorBoundary` (keyed by tab): a render-time throw shows a failure
  panel instead of a blank page, and the tab bar keeps working.
- `activeIndex` (the selected list row) is derived from a `{sig, index}` state keyed by the tab and
  filters, so any filter change selects row 0. Jumps that clear filters and select a row in the same
  update call `setActive({sig: activeSig({...filterState, ...cleared}), index})`. Jumps that wait for data
  (`pendingLinkTarget`, `pendingUniqueCode`, `pendingSacredMatch`) resolve during render once it has
  loaded, and are dropped if the tab leaves their target first. Expanding a mobile row also selects it.
- In-app links use `<a href="#">` with `preventDefault`. Keep that pattern, so a link never
  writes `#` to the URL.

### Data

- `useJson(fileName, damnationMode)` fetches `${BASE_URL}data/<file>` with
  `cache: "no-store"` and drops hidden entries via `filterVisible`.
- Damnation mode (the header toggle, persisted in `localStorage`) swaps only `Uniques.json`
  (to `data/damnation/`) and the Drop calculator's `.txt` folder. Everything else is shared.
- Item list tabs (Weapons, Armors, Uniques, Runewords, Sacreds, Fate Cards) use `ListPanel`
  plus a `*Tooltip` component inside `TooltipShell`. The tooltips depend on App-level
  callbacks (`jumpToCode`, `jumpToUnique`, `jumpToSacred`, `handleMarkdownAppLink`,
  `openDropCalculator`).

### Affixes (`public/data/Affixes.json`, `AffixesPanel`)

- `group`: affixes with the same group can't roll together on one item.
- Missing values are meaningful:
  - `maxLevel: null` means **no cap** (true for about 1,000 rows).
  - `rare: ""` means No. It's a boolean, not missing data.
  - `classDisplayName`, `requiredLevel`, item-type arrays and `displayProperties` can each
    be null or empty.
- `displayExcludedItemTypeNames` sometimes repeats an entry ("Staff Class" three times).
  That's a data quirk, displayed as-is.
- Sorting goes through `compareAffixes` in `src/sortCompare.js`. **Every sortable column needs
  an entry in `AFFIX_SORT_KEYS` and a case in `affixSortValue`.** A unit test fails for a listed
  key with no case, and an unlisted key with no case throws on first sort rather than silently
  tying every row (the old Affix level bug). Missing values sort lowest, except Max lvl, where
  null (no cap) sorts highest.
- Affixes, Corruptions and the Drop calculator results all render through `StickyHeadTable` and share the
  `.affixTable` / `.affixTableScroll` classes. A CSS change to one affects all three. The floating header
  copy (`.floatingHead`) carries the same table classes, so `.affixTable th` rules style it too; its header
  cells get inline widths, so never give those `th`s a `style` prop.
- On mobile the three tables scroll horizontally with a pinned first column, and get a second
  pager below the table.

## CSS gotchas

- **The mobile breakpoint is `max-width: 980px`**, matching `useIsMobile()`'s default.
  Mobile rules are **duplicated** across the 980px, 720px and 480px media blocks. A phone
  matches all three, so a rule changed in one block can be overridden by a copy in a later
  one. Search the whole file before changing a mobile rule.
- `.appRoot { overflow-x: hidden }` makes `.appRoot` a scroll container, so
  `position: sticky` inside it does nothing (the desktop `.tooltip` sticky is inert for
  this reason). Use `overflow-x: clip` where sticky has to work. On mobile it's overridden to
  `overflow-x: clip`, which is what lets the top row (`.tabsPanel`) stick.
- On mobile, `.wrap > * { min-width: 0 }`: grid items default to `min-width: auto`, so wide
  content (the Affixes table) would otherwise stretch its panel past the screen, where
  `.appRoot`'s clip silently cuts it off instead of the table scrolling.
- Inline `style={{...}}` in JSX (for example the Drop calculator's filter row and select
  widths) beats media-query rules. Move it into a class before trying to make it responsive.
- `Tip` (dotted-underline tooltips) shows on hover on desktop; under `@media (hover: none)` it
  toggles on tap (`.tipWrap.open`) and the bubble is a fixed strip near the bottom of the
  viewport. Its `TOOLTIPS_TEXT_MAP` holds the texts.
- `.affixTable thead` has `backdrop-filter`. That makes it the containing block for any
  `position: fixed` descendant. It's removed under `hover: none` so the fixed touch tooltip
  works.
- `.floatingHead` mirrors horizontal scroll with `position: relative; left`, not `transform`: a transform
  on it would become the containing block of the touch `Tip`'s fixed bubble (the same trap as `thead`'s
  `backdrop-filter`). It sits at `top: var(--topbar-h, 0px)` (or the pinned bar's real height if taller)
  with z-index 30 inside `.wrap`.
- On mobile, list rows expand in place (`.rowDetail` after the `.row`); lists and tables have no
  inner vertical scroll box. Rules that land things under the pinned row use `--topbar-h`
  (mobile only) for `scroll-margin-top`.

## Verifying UI changes

There's no UI test suite, so check changes in a real browser: run the dev server and drive
headless Chromium through the DevTools protocol. Node 24's global `WebSocket` is enough;
no Playwright or Puppeteer dependency is needed. Emulate a 390×844 phone viewport for mobile
checks. Tabs are `.tabs .tab` divs, and More-menu items are `.moreTabItem`, not buttons. On
mobile the tab row is replaced by `.tabMenuBtn` and the sheet's `.tabSheetItem` buttons; setting
`location.hash = "#/<key>"` switches tabs on any layout. When checking for horizontal overflow,
ignore boxes clipped by an `overflow: hidden` ancestor that sits inside the screen, but not
content cut off at the screen edge by `.appRoot` or an edge-to-edge panel.

Headless Chromium has no mouse, so it reports `hover: none` even at desktop width, and CDP's
`Emulation.setEmulatedMedia` ignores the `hover` feature. Launch it with
`--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4`
for desktop checks; touch emulation switches to `hover: none` but switching it off doesn't switch
back, so run desktop hover checks before any mobile emulation in the same browser.

Desktop must keep working. After layout work, compare screenshots of every tab at desktop
width before and after the change.

The harness is committed in `tools/checks/` (Node ≥ 22, no dependencies; outputs such as `shots/`,
`*.png`, `*.log` and the temporary Chrome profiles are gitignored there):

- `cdp.mjs`: launches headless Chromium (desktop hover flags included) and drives it; `page` helpers
  (`goto`, `eval`, `waitFor`, `desktop()`, `mobile()`, `click`, `tap`/`tapAt`, `type`, `screenshot`, raw
  `send`), `checker()` for PASS/FAIL lines, `OVERFLOW_CHECK` for horizontal overflow.
- `compare-desktop.mjs <label> <url>` takes full-page 1500px screenshots of all 19 tabs into
  `shots/desktop-<label>/`; `diff-shots.mjs <labelA> <labelB>` pixel-diffs two sets.
- Feature checks: `check-sticky.mjs` (floating table header), `check-multisort.mjs` (Affixes multi-sort).

Run them from `tools/checks/` against a dev server:
`APP_URL=http://localhost:<port>/TheArchivistSoE/ node check-sticky.mjs <screenshot dir>`. The `.mjs`
files sit outside the app's `**/*.{js,jsx}` ESLint block, so the browser and React rules don't apply.
