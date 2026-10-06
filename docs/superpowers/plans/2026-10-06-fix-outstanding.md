# Fix Outstanding Issues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the 14 pre-existing ESLint problems (and whatever fixing them surfaces), fix the eight deferred mobile-review minors and the same-tab `app:` link filter bug, with no desktop change.

**Architecture:** Lint first, because fixing the `immutability` errors stops the React Compiler rules bailing out on `App`, and everything after that is written against the full rule set and must keep lint at 0. Pure logic goes into small tested modules (`src/hashTab.js`, `src/sortCompare.js`, new `src/pager.js`, `src/useIsMobile.js`); UI pieces move out of `App.jsx` only where the move is mechanical.

**Tech Stack:** React 19, Vite 7, ESLint 9 (react-hooks compiler rules), Vitest, headless Chromium over CDP (harness in the previous session's scratchpad).

**Spec:** `docs/superpowers/specs/2026-10-05-mobile-friendly-design.md` (shipped; not reopened). Background: `docs/superpowers/plans/2026-10-05-mobile-friendly.md`.

## Global Constraints

- Out of scope: the Drop calculator's speed, misc-mode rune codes returning 0 rows, and `DropCalculatorPanel`'s calculation logic. Only its hook wiring (lint) and its pager (B7) may change.
- No `eslint-disable`. New lint problems fixed with "adjust state during render" or derived state.
- Desktop must be pixel-identical (all 18 tabs + Changelog at 1500px, before/after diff). Mobile (≤980px, `max-width: 980px`) must not regress.
- Mobile CSS rules are duplicated across the 980/720/480px blocks: search the whole `styles.css` before changing one. Inline `style={{}}` beats media queries.
- Runtime URLs use `import.meta.env.BASE_URL`. In-app links keep `<a href="#">` + `preventDefault`.
- Node: `export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" &&`. Work only in `.worktrees/fix-outstanding`. No push, PR or merge.
- Test files import `describe/it/expect` from `vitest`. Pure modules get a failing test first.
- Every commit leaves `npm test`, `npm run build` and `npm run lint` no worse than before it (lint ends at 0 after Task 2).

## Decisions needed from you (please answer in review)

1. **B2, guard against a sort-key throw blanking the page.** Options:
   - **(a) Error boundary around the active tab panel (recommended).** Keeps `affixSortValue`'s deliberate loud throw (so the bug is never silent), but a throw in any panel shows "This tab failed to load" + a reload button instead of a blank page; switching tabs resets it. It protects against every render-time crash, not only this one, and works at runtime where CI's test can't see.
   - (b) A test cross-checking rendered sortable headers against `AFFIX_SORT_KEYS`. There is no DOM test environment (no jsdom; only `react`/`react-dom` at runtime), so it would have to regex-parse `App.jsx`, which is brittle, and it only protects against this one mistake.
   - I'll do (a) unless you say otherwise.
2. **B8, tall Affixes rows on phones.** Adding `min-width: ~14rem` to the Attributes / Item types / Excluded item types columns (mobile only) cuts the median row from ~81px to ~47px (max was ~149px) but adds ~300px of sideways swiping. **Do you want it?** Default if you don't answer: **no change**, and I record it as declined. (If yes, it is a small CSS-only Task 11, with a before/after row-height survey.)
3. **B1, rotation.** I'll set `activeIndex` when a row is expanded, and leave it unchanged when it is collapsed (so collapsing doesn't snap the desktop selection elsewhere). OK?
4. **B7 scope.** I'll extract `usePager` (pure helpers unit-tested) and move `PagerButtons`, `DamnationToggle`, `TabSheet`, `MobileTabsBar` to `src/` modules only if the dependencies on `TAB_GROUPS`/`renderTabTitle` can move with them without a circular import (they'd go into `src/tabs.jsx` together). If that turns out not to be clean I'll move only the pager and say so. OK?

## Review Focus

- A `app:` link naming the current tab, then a real tab change: search and filters must reset (Task 3).
- Expand a row on mobile, then widen to desktop: TooltipShell shows that row (Task 4).
- Jump to a unique, press Back before Uniques.json finishes loading, come back to Uniques later: nothing is selected/expanded (Task 8).
- Resize across 980px repeatedly: `useIsMobile` and the CSS agree on the layout (Task 5).
- A bogus sort key: the page shows the failure panel, not a blank page, and other tabs still work (Task 7).

## File Structure

- Modify `src/App.jsx`: lint fixes, bug fixes, removal of moved code.
- Modify `src/hashTab.js` (+ test): pure `hashWriteAction`, `useLayoutEffect`.
- Create `src/useIsMobile.js`: `matchMedia`-based hook (+ `mobileQuery` pure helper, tested).
- Create `src/ErrorBoundary.jsx`: class boundary with reset key.
- Create `src/pager.js` (+ `src/pager.test.js`): pure `pagerState`, plus `usePager` hook.
- Create `src/tabs.jsx` (conditional on Decision 4) and `src/PagerButtons.jsx`, `src/DamnationToggle.jsx`.
- Modify `src/styles.css`: filter-select width classes.
- Modify `.github/workflows/ci.yml`, `CLAUDE.md`, memory files.
- Scratchpad (not in repo): copy of the previous `checks/` folder + new checks.

---

### Task 0: Baseline and harness

**Files:** none in repo.

- [ ] **Step 1:** Copy `/tmp/claude-1000/-home-emanresu-TheArchivistSoE/f5c29967-01d0-4553-b18d-dfb244f5b17e/scratchpad/checks/` into `$SCRATCH/checks/` (`$SCRATCH` = this session's scratchpad). If `shots/desktop-main/` is stale, re-shoot it from the `main` checkout (`compare-desktop.mjs`) with the hover-capable Chromium flags.
- [ ] **Step 2:** In the worktree record baseline: `npm test` (note count), `npm run build`, `npm run lint -- -f json > $SCRATCH/lint-before.json`; save `rule + message` list ignoring line numbers (`lint-summary.mjs`).
- [ ] **Step 3:** Start the dev server on a free port from the worktree (`cd` as its own statement; `nohup node node_modules/vite/bin/vite.js --port 5180 --strictPort > log 2>&1 &`; `echo $! > pidfile`), run `runchecks.sh` against it and confirm all existing checks pass. Fix harness paths/ports if needed; keep exit codes (no piping through tail).
- [ ] **Step 4:** `free -h`; note `available`.

### Task 1: Trivial lint problems (unused vars, hook deps)

**Files:** Modify `src/App.jsx`.

- [ ] **Step 1:** Delete the six unused items: `getTitleByTab` (~207), `typeCode` (~366), `applyPicks` (~1537), `isExpansionItem` (~1633), `name` in the `filtered` memo (~3937), `typeFilterNorm` (~4055). For each, `grep` first to confirm no other reference (and drop imports/constants only they used).
- [ ] **Step 2:** `SUBTILE_TO_YARDS` in the AuraRadius `useMemo` (~2496): if it's a module-level constant, nothing to depend on; otherwise add it to deps (the warning says it's referenced from an outer scope, so hoist it to module level if it's a local const).
- [ ] **Step 3:** StaticDataPanel (~3363): compute `all` inside the memo (or `useMemo` the `all` branch) so deps are stable, with identical output.
- [ ] **Step 4:** DropCalculatorPanel effects (~1489/1497): wire `clearRequest` and `calculateAll` into deps by wrapping them in `useCallback` (or reading through a ref) so the effects fire exactly when they do today. Do not alter what `calculateAll` computes. Verify in browser that changing an input still triggers exactly one calculation after the 300ms debounce, and that opening the tab doesn't double-calculate (count fetches of `data/*/MonStats.txt` before/after).
- [ ] **Step 5:** `npm run lint`: expect 4 fewer errors-and-warnings than baseline for the `no-unused-vars` and `exhaustive-deps` rules (10 left: 4 `immutability` + whatever). `npm test`, `npm run build`.
- [ ] **Step 6:** Commit `Lint: remove unused code and fix hook dependencies`.

### Task 2: Immutability errors and the problems they surface

**Files:** Modify `src/App.jsx`.

- [ ] **Step 1:** Move `useState` for `cubeSearch`/`changesSearch`/`skillsSearch` (~3788–3793) above the tab-change effects (~3752–3766), and `[activeIndex, setActiveIndex]` (~4125) above the filter-reset effect (~3929). Hoist only the declarations, keeping their order relative to other hooks otherwise.
- [ ] **Step 2:** `npm run lint`; write down every new problem (expected: `react-hooks/set-state-in-effect` on the tab-change search clears, the filter-reset effect, the `activeIndex` reset effect, `pendingExpandIndex`, `pendingLinkTarget`/`pendingUniqueCode`/`pendingSacredMatch` effects, `refs` rules, etc.). Add the list to this plan's execution notes.
- [ ] **Step 3:** Fix each properly, without behaviour change:
  - Tab-change clears (`tab !== "cube"` → clear search etc.): adjust state during render with a `prevTab` state (`if (tab !== prevTab) { setPrevTab(tab); ...resets }`).
  - Filter-reset effect: same `prevTab` block, honouring `skipFilterResetRef` (a ref read during render is itself flagged by `react-hooks/refs`; if so, turn the flag into state `skipFilterReset` set together with `setTab` in the jump paths and consumed in the render-time block).
  - `activeIndex` reset on `[tab, search, tierValue, …]`: key an `activeIndex` state with the filter signature (`useState({sig, index})`, reset when the signature differs, still honouring skip-once for jumps) or compute it during render the same way.
  - `pendingExpandIndex`: fold it into the same render-time pattern, or set `expanded` directly where the target's list is known. Keep the "expansion belongs to one `filtered` array" invariant.
  - The pending-jump effects that wait on loading data are genuine synchronisation with async data: keep them as effects if the rule accepts them after being restructured, otherwise convert to render-time derivation. No `eslint-disable`.
- [ ] **Step 4:** Browser regression after each of the three restructurings (not just at the end): the existing `check-list`, `check-filters`, `check-hash`, `check-review-fixes` checks, plus a manual walk of: tier jump, unique jump, sacred jump, `app:` links with and without name, tab change resets search/filters, filter change resets the highlighted row to 0.
- [ ] **Step 5:** `npm run lint` → **0 problems**. `npm test`, `npm run build`.
- [ ] **Step 6:** Commit (one commit per restructured area if they separate cleanly).

### Task 3: `app:` link to the current tab leaves the skip flag set (C)

**Files:** Modify `src/App.jsx` (`handleMarkdownAppLink`); check in scratchpad `check-applink-sametab.mjs`.

- [ ] **Step 1 (failing check first):** On Weapons, type a search and pick a type filter; trigger an `app:` link naming a Weapons item (e.g. an item description link; or call through a Runewords/Uniques tooltip link, or dispatch a click on a `.md` app link); then switch to Armors; assert search and type filter are **cleared**. Run it against the worktree before the fix: it must FAIL (old search kept).
- [ ] **Step 2:** Fix: only set the skip flag/state when `t !== tab`. `handleMarkdownAppLink` depends on `tab`, so add it to the `useCallback` deps (it is currently `[setTab]`), or read the current tab from a ref (but note Task 2 may have turned the flag into state).
- [ ] **Step 3:** The check passes; also assert the same-tab link still selects/expands the named item, and the cross-tab link still keeps the search (`skip` consumed).
- [ ] **Step 4:** `npm run lint` (0), `npm test`. Commit `Fix filter reset skipped after a same-tab app: link`.

### Task 4: Expanding a row sets `activeIndex` (B1)

**Files:** Modify `src/App.jsx` (`toggleExpanded`); `check-rotate.mjs`.

- [ ] **Step 1 (failing check):** At 390×844 on Weapons, expand row 5, then `Emulation.setDeviceMetricsOverride` to 1500×900; assert the TooltipShell shows row 5's name, not row 0's. Must FAIL before the fix.
- [ ] **Step 2:** In `toggleExpanded(i)`, when the row ends up expanded, `setActiveIndex(i)`. Collapsing leaves `activeIndex` alone (Decision 3). Make sure it doesn't trip the activeIndex-reset signature logic from Task 2.
- [ ] **Step 3:** Check passes; confirm on desktop clicking a row still selects it and ↑/↓ still work.
- [ ] **Step 4:** Lint 0, tests, commit.

### Task 5: `useIsMobile` with `matchMedia` (B3)

**Files:** Create `src/useIsMobile.js`, `src/useIsMobile.test.js`; modify `src/App.jsx`.

- [ ] **Step 1 (failing test):**
  ```js
  import {describe, expect, it} from "vitest";
  import {mobileQuery} from "./useIsMobile.js";
  describe("mobileQuery", () => {
      it("matches the CSS breakpoint syntax", () => {
          expect(mobileQuery(980)).toBe("(max-width: 980px)");
          expect(mobileQuery(720)).toBe("(max-width: 720px)");
      });
  });
  ```
  Run `npx vitest run src/useIsMobile.test.js` → FAIL (module missing).
- [ ] **Step 2:** Implement:
  ```js
  import {useSyncExternalStore} from "react";
  export const mobileQuery = (maxWidth) => `(max-width: ${maxWidth}px)`;
  export function useIsMobile(maxWidth = 980) {
      const query = mobileQuery(maxWidth);
      return useSyncExternalStore(
          (notify) => {
              const mql = window.matchMedia(query);
              mql.addEventListener("change", notify);
              return () => mql.removeEventListener("change", notify);
          },
          () => window.matchMedia(query).matches,
          () => false,
      );
  }
  ```
  (`useSyncExternalStore` also avoids a setState-in-effect lint hit.) Delete the old hook in `App.jsx`, import the new one. Check `grep useIsMobile` for other callers/arguments.
- [ ] **Step 3:** Test passes. Browser check: at widths 980 and 981 (`setDeviceMetricsOverride`), `window.matchMedia("(max-width: 980px)").matches` equals "mobile layout is showing" (`.mobileTabsBar` present vs `.tabs`), and resizing back and forth flips layout both ways with no stale state. (CDP can't set fractional viewport widths, so the fractional band itself is covered by construction: JS and CSS now evaluate the same media query. I'll say so in the report.)
- [ ] **Step 4:** Lint 0, tests, build, commit.

### Task 6: Hash write in `useLayoutEffect` (B4)

**Files:** Modify `src/hashTab.js`, `src/hashTab.test.js`.

- [ ] **Step 1 (failing test):** Extract the decision into a pure `hashWriteAction(currentHash, tab, validKeys)` returning `"push" | "replace" | null`, and add tests: same hash → `null`; invalid tab → `null`; current hash a valid other tab → `"push"`; empty or unknown hash → `"replace"`. Run → FAIL (not exported).
- [ ] **Step 2:** Implement `hashWriteAction`, call it from the effect, and switch that effect to `useLayoutEffect` (the popstate listener stays `useEffect`). Update the header comment.
- [ ] **Step 3:** `npx vitest run src/hashTab.test.js` all green (existing + new). `check-hash.mjs` still passes, including the Back/Forward cases. Add a case: two `history.back()` calls in the same task right after a tab click; assert `history.length` doesn't grow beyond the single push (the race is unverified, so say in the report whether it reproduced before the change).
- [ ] **Step 4:** Lint 0, build, commit.

### Task 7: Error boundary around the active tab panel (B2, Decision 1a)

**Files:** Create `src/ErrorBoundary.jsx`; modify `src/App.jsx`, `src/styles.css`.

- [ ] **Step 1 (failing check):** Temporarily (scratch edit, never committed) add a bogus sortable column header calling the sort handler with key `"bogus"` in `AffixesPanel`; at `#/affixes`, click it; assert the page body is **not** empty and shows the failure panel with a working "Reload" button and clickable tabs. It FAILS now (blank page).
- [ ] **Step 2:** `ErrorBoundary` class (`getDerivedStateFromError`, `componentDidCatch` → `console.error`), props `children`, `resetKey`; resets when `resetKey` changes (the tab). Wrap the tab-panel region in `App` with `resetKey={tab}`. Small, theme-consistent `.errorPanel` style using existing colour variables, shown at desktop and mobile widths.
- [ ] **Step 3:** Check passes; revert the temporary bogus header; confirm `git diff` has no trace of it. Confirm a normal session renders unchanged (desktop diff in Task 12 covers it).
- [ ] **Step 4:** Lint 0, build, commit.

### Task 8: Clear stale pending jump state when leaving the target tab (B6)

**Files:** Modify `src/App.jsx`; `check-stale-jump.mjs`.

- [ ] **Step 1 (failing check):** Damnation mode on, throttle `Uniques.json` (`Network.emulateNetworkConditions` or a request-interception delay), jump to a unique from another tab's link, press Back before it loads, wait for the load, then click into Uniques normally: assert nothing is selected/expanded other than row 0/none. FAILS before the fix.
- [ ] **Step 2:** Clear `pendingUniqueCode` (and the equivalent `pendingSacredMatch` and `pendingLinkTarget`, plus a pending tier jump if there is one) when `tab` is no longer that jump's target tab, using the render-time `prevTab` block from Task 2 (not an effect).
- [ ] **Step 3:** Check passes; the normal jump (no Back) still lands on the target, including in Damnation with the delayed load.
- [ ] **Step 4:** Lint 0, tests, commit.

### Task 9: Filter-select widths into classes (B5)

**Files:** Modify `src/App.jsx` (`FiltersBar` ~1088–1135), `src/styles.css`.

- [ ] **Step 1 (before shots):** Desktop screenshots of every tab that shows each select (Weapons/Armors/Uniques type, Weapons sockets, Runewords rune count, Uniques tier, Affixes affix type) and mobile screenshots with the Filters fold open, plus measured `getBoundingClientRect().width` of each `.selSearchWrap`.
- [ ] **Step 2:** Replace `style={{maxWidth: N}}` with `className="selW260|selW180|selW200"` (names `filterSelWide`, `filterSelNarrow`, `filterSelMid`), defining them next to `.filtersPanel .selSearchWrap` with the same specificity as that rule (`.filtersPanel .filterSelNarrow { max-width: 180px }`) so desktop widths are identical. Inside `@media (max-width: 980px)` add `.filtersPanel .selSearchWrap { max-width: none; flex: 1 1 100% }` (as done for `.dropCalcInputs`). Check the 720px and 480px blocks for duplicates of `.selSearchWrap`/`.filtersPanel` rules first.
- [ ] **Step 3:** Desktop widths and screenshots identical; mobile selects are full width in the fold, no horizontal overflow (survey).
- [ ] **Step 4:** Lint 0, build, commit.

### Task 10: `usePager`, and move components out of `App.jsx` (B7)

**Files:** Create `src/pager.js`, `src/pager.test.js`, `src/PagerButtons.jsx`, `src/DamnationToggle.jsx`, `src/tabs.jsx`; modify `src/App.jsx`.

- [ ] **Step 1 (failing test):** `pagerState({page, pageCount})` (0-based `page`, clamped) → `{page, label: "Page 2 / 5", canPrev, canNext}`. Test: clamps above/below range; `pageCount` 0 treated as 1; first page `canPrev` false; last `canNext` false; label is 1-based. Run → FAIL.
- [ ] **Step 2:** Implement `pagerState` and `usePager(pageCount, {ghost})` returning `{pageIndex, setPageIndex, ...pagerProps}` ready to spread into `PagerButtons`. Tables that store 1-based pages today (Drop calculator, Corruptions) convert at the call site only; page-state storage stays as is where changing it would alter behaviour on reset.
- [ ] **Step 3:** Replace the three hand-built `pager` objects (~2235, ~2895, ~3032) with `usePager`. Browser check: Prev/Next labels and disabled states on Affixes, Corruptions, Drop calculator (without running a calculation change), and page clamping when a filter shrinks the row count.
- [ ] **Step 4:** Move `PagerButtons` and `DamnationToggle` to their own modules. Move `MobileTabsBar` and `TabSheet` with `TAB_GROUPS`/`renderTabTitle` into `src/tabs.jsx` only if `TABS`/`TAB_GROUPS` can move there as well without `App.jsx` and `tabs.jsx` importing each other (Decision 4); otherwise stop at the first two and report. Pure move: no edits to bodies.
- [ ] **Step 5:** Lint 0, tests, build, `check-header`, `check-tables`, `check-tips`, desktop diff. Commit (pager and moves as separate commits).

### Task 11: Tall mobile Affixes rows (B8): only if you say yes

- [ ] **Step 1:** If approved: mobile-only `min-width: 14rem` on the Attributes / Item types / Excluded item types `th/td` in the Affixes table (search all three media blocks first), re-measure row heights sorted by Max lvl (median and max) and sideways scroll width; expect ~47px median and ~300px extra scroll. Otherwise skip and record "declined" in memory.
- [ ] **Step 2:** Lint 0, tests, build, survey, commit.

### Task 12: CI gate, docs and memory

**Files:** `.github/workflows/ci.yml`, `CLAUDE.md`, memory files.

- [ ] **Step 1:** `LINT_BASELINE: 0` in `ci.yml` and rewrite its comment ("Lint must be clean"). Update the CI step's name to match.
- [ ] **Step 2:** CLAUDE.md: replace the "Lint baseline" paragraph with "`npm run lint` must report 0 problems; CI fails on any"; update the Layout section for the new modules, the `useIsMobile`/`matchMedia` statement if mentioned, and the error boundary.
- [ ] **Step 3:** Memory: delete `lint-baseline-problems.md` and `deferred-mobile-review-minors.md` (or trim to B8 if declined); trim `preexisting-app-bugs.md` to item 2 only; keep `drop-calculator-slow.md`; update `MEMORY.md` index lines accordingly.
- [ ] **Step 4:** Commit docs. (Memory files live outside the repo and aren't committed.)

### Task 13: Full verification

- [ ] **Step 1:** `npm test`, `npm run build`, `npm run lint` (0): evidence pasted into the report.
- [ ] **Step 2:** `runchecks.sh` (all old + new checks) with exit codes preserved.
- [ ] **Step 3:** Desktop: screenshot all 18 tabs + Changelog at 1500px and pixel-diff against `main` (`compare-desktop.mjs` + `diff-shots.mjs`); expect no diffs (explain any).
- [ ] **Step 4:** Mobile: 390×844 overflow survey on all tabs.
- [ ] **Step 5:** `free -h`; warn if `available` < ~1.5 GB.
- [ ] **Step 6:** Real-device check: serve bound only to `100.91.245.9:5179` using `env npm_package_version=<version> node node_modules/vite/bin/vite.js --host 100.91.245.9 --port 5179 --strictPort`, give you `http://100.91.245.9:5179/TheArchivistSoE/` with a checklist (rotation keeps the expanded row, filters fold, Back across tabs, Affixes sorting), wait for your OK, then stop it by recorded PID.
- [ ] **Step 7:** Invoke `code-review` on the full branch diff vs `main`, single agent (no subagents), most capable model, HIGH effort. For each real finding: failing check first, fix, re-run Step 1–4. Report what changed, evidence, rulings, and anything deferred.

## Self-review notes

- Spec coverage: A → Tasks 1, 2, 12; B1 → 4; B2 → 7; B3 → 5; B4 → 6; B5 → 9; B6 → 8; B7 → 10; B8 → 11 (gated); C → 3. Verification, real-device check and review → 13.
- Ordering risk: Tasks 3, 4 and 8 touch the same flag/pending state that Task 2 restructures, so they come after it and are written against the restructured code. Their exact edits depend on what Task 2 produces, so I'll re-read that code at execution time rather than pre-writing diffs here.
- Task 2's fix list depends on which rules fire once the compiler stops bailing out; the plan states the likely ones and the technique, and the real list is recorded at execution.
