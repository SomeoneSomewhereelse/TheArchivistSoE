# Item Builder stat summing and item tooltip — design

**Date:** 2026-10-12
**Branch:** `item-builder-stat-summing`
**Status:** designed and approved section by section in brainstorming (2026-10-11 and 2026-10-12). The in-game checks
it listed as pending were all closed by the user on 2026-10-15 (see "Verification log") and the spec was revised to
match. An independent review (one solo reviewer on Opus 5.5, 2026-10-15) found 2 blocking and 7 should-fix issues
and a set of minors; all are folded in below. The one new in-game check that came out of it (V1, the two-handed
damage pair) was closed by the user on 2026-10-16, along with the crafted note (dropped) and the charm line's colour
(white). Next: the user's approval, then planning.

## Intent

The Item Builder lists each picked affix and its range on its own. Players want to see **the item**: what a magic
*Cruel Berserker Axe of Evisceration* or a rare Monarch with these affixes looks like in game, with the base's
defense, damage, block and requirements worked out and the affixes' stats summed the way the game sums them.

This spec adds a full item tooltip to the builder. It reuses the stat engine
(`docs/superpowers/specs/2026-10-11-stat-engine-affixes-design.md`), which until now ran only at build time, and
it adds the base-item lines the engine never had. It also adds **ethereal** items and Arreat Summit-style
**per-class block**, and it folds in the engine fixes deferred from the engine's final review.

### Success criteria

- With a base chosen, the builder shows a tooltip in the game's line order: name, Defense, Chance to Block, damage,
  Quantity, the charm line, Durability, class restriction, requirements, modifiers, and the ethereal/socketed line.
- Modifier lines are the engine's lines over **summed** stats (per stat and layer, the game's way), with no English
  parsed anywhere. The base lines are computed from the game tables with the game's formulas and rounding.
- Each line shows one summed range: low = every minimum roll, high = every maximum roll.
- Ethereal can be switched on for every base that can be ethereal in SoE, with PD2's rules.
- The Affixes tab is unchanged (its golden snapshot doesn't move). Every tab other than Item Builder is
  pixel-identical before and after.
- Every rule rests on a named source or an in-game test; the ones that rest on neither are listed under "Noted, not
  changed".

### Out of scope

- Uniques, sets, runewords, sacreds and corruptions in the builder.
- A viewer: no character class, level or Dexterity. Block is shown per class (below) instead. No Smite/Kick damage,
  no attack-speed line, no red "requirement not met" colouring.
- Superior, low-quality and unidentified items. Normal quality isn't a builder quality, so the grey name of a
  normal ethereal item is noted but never shown.
- Odds of an ethereal item. The roll-odds line is unchanged: ethereal items also come from cube recipes, so an
  ethereal chance would not be a roll probability.
- Rare and crafted name pickers or sample names (a placeholder is shown instead).
- The crafted recipe's fixed mods (the builder doesn't model recipes), and any note about them on the tooltip.
- Two deferred stat-engine minors that aren't about summing stay deferred: the Affixes Stat select wrapping long
  labels, and about 1 MB of unused `.txt`/`.tbl` tables copied into `dist/`. Fixing the first would change the
  Affixes tab's pixels; the second is a separate packaging change.
- `package.json` version and `Changelog.json`, as before.

## Research

Evidence lives in the local vault `docs/research/stat-summing/` (git-excluded, never committed; start at its
`INDEX.md`):

- `notes/base-lines-report.md`: defense, damage, requirements, block, durability, sockets and line order, from
  D2MOO and D2ItemToolkit (the 1.14d tooltip writer).
- `notes/ethereal-block-report.md`: PD2's ethereal rules, which bases can be ethereal, SoE's ethereal craft rows,
  the Arreat block format, BlockFactor, worked examples and test recipes. Its correction section records SoE's
  block cap.
- `notes/rare-names-report.md`: rare and crafted names (RarePrefix/RareSuffix, colours), with test recipes and a
  CubeMain row template.

The key facts, each with its source, are under "Decisions" and "Design". Unsettled points are in the
"Verification log".

## Decisions

| Question | Decision |
|---|---|
| Scope | The Item Builder only. |
| What is shown | A full item tooltip, including base lines (defense, damage, block, requirements, durability). |
| Summing | Per (stat, layer), the game's way (`sumEntries`). |
| Text | From the engine and the game's string tables; no English parsed. |
| Where the engine runs | **In the browser**, at the builder's exact item level (Option A). The trimmed dictionary ships inside `ItemBuilder.json`. Rejected: precomputing each affix's entries (B), precomputing per base (C, combinatorial). |
| Ranges | One summed range per line: low = every minimum roll, high = every maximum roll. The slots card keeps the per-affix breakdown. |
| Where the tooltip goes | A **new** card in the left column under the roll odds; nothing it replaces. Phone: controls → slots card → odds → tooltip → pinned bar → list. |
| Magic name | "Prefix Base Suffix" from the picked affix names, in blue. |
| Rare/crafted name | A muted "Random Name" placeholder in the quality colour above the base name (Option A). |
| Ethereal | A toggle for every base that can be ethereal (all weapons and armor with durability; not bows, crossbows, Phase Blades, quivers, jewelry, charms or jewels). Magic, rare and crafted. Old links open non-ethereal. |
| Block | "Chance to Block: 42% (Pal: 72%, Ama/Asn/Bar: 67%, Dru/Nec/Sor: 62%)", capped at **80** (SoE 13.0.0). |
| Poison | Sources summed, then `(v·frames + 128) >> 8` over frames/25 seconds, with no `poison_count` division (verified in game). |
| Charges | Shown full: "(52/52 Charges)". |
| Unverified game behaviour | Named here with a CubeMain test recipe (`Diablo II.exe -direct -txt`), never guessed silently. |

## Design

### File layout

```
src/
  statData.js          + trimStatData(dict, codes), statDataFromJson(json); CharStats BlockFactor; TOOLTIP_STRINGS
  statEngine.js        ctx = {ilvl, base}; exported sumEntries; base-aware funcs 5/6/7/14; source-aware dgrp; deferred fixes
  baseLines.js         NEW: the base-line formulas (defense, block, damage, quantity, durability, requirements)
  itemTooltip.js       NEW: engineBase(model, base), expandPicks(picks, dict, ctx), buildTooltip(model, ctx, build)
  ItemTooltip.jsx      NEW: calls buildTooltip and renders its lines (props only, inside its own ErrorBoundary)
  ErrorBoundary.jsx    + an optional fallback prop
  itemBuilderData.js   ItemBuilder.json version 3: base fields, type fields, statDict
  itemBuilderRules.js  build.eth, canEthereal, the ethereal eligibility rule, resolveBuild cleaning
  itemBuilderHash.js   e=1
  useItemBuilder.js    the base-change notice for ethereal
  ItemBuilderPanel.jsx the Ethereal toggle; the tooltip card under the odds
  styles.css           .ibTooltip and its line kinds
  baseStrings.json     regenerated: the tooltip's label keys
tools/checks/check-itembuilder.mjs   extended
```

New logic goes into the small modules above, never into `App.jsx`.

### Data: `ItemBuilder.json` version 3

`ITEM_BUILDER_VERSION` becomes 3. `prepareItemBuilder` refuses any other version, as today. The link fingerprint
(affix keys, sides, names, levels, groups, base codes) doesn't change, so **the link version doesn't change**.

**Base fields.** New `TABLE_COLUMNS`, read per table; a missing column fails the build:

| Field | Weapons.txt | Armor.txt | Misc.txt |
|---|---|---|---|
| `minac`, `maxac`, `block` | – | `minac`, `maxac`, `block` | – |
| `dmg1` `[min, max]` | `mindam`, `maxdam` | – | – |
| `dmg2` `[min, max]` | `2handmindam`, `2handmaxdam` | – | – |
| `dmgThrow` `[min, max]` | `minmisdam`, `maxmisdam` | – | – |
| `twoHanded`, `oneOrTwo` | `2handed`, `1or2handed` | – | – |
| `reqstr`, `reqdex` | `reqstr`, `reqdex` | `reqstr` | – |
| `durability`, `nodurability` | yes | yes | `nodurability` |
| `gemsockets`, `invwidth`, `invheight` | yes | yes | yes |
| `maxstack` | when `stackable` = 1 | when `stackable` = 1 | when `stackable` = 1 |

A damage pair whose two values are 0 is stored as `null`. Absent fields default to 0. `canEthereal` is derived at
build time: the base's type chain reaches `weap` or `armo`, `nodurability` = 0, and `durability` > 0. In SoE that
excludes the 42 `bow`/`xbow`/`abow` bases and both Phase Blades (`7cr`, `7cr2`, `nodurability` = 1), and every
Misc base (quivers descend from `misc`). The Misc bases need no ethereal columns.

**Type fields.** Each `ItemTypes.txt` type gains `throwable` (`Throwable` = 1), `charm` (`Charm` = 1) and `maxSock`
(`[MaxSock1, MaxSock25, MaxSock40]`). The game reads them from the item's own type record (`type`), not the chain. In
SoE the builder's four charm bases have types `scha`, `mcha`, `lcha` and `ocha`, all with `Charm` = 1.

**`statDict`.** The plugin builds the full dictionary (`buildStatData`) as it does for `Affixes.json`, then
`trimStatData(dict, codes)` keeps only what the builder's affixes reach: their `Properties.txt` codes, the stats
those codes write (plus every member of each `dgrp` they touch), **`ENGINE_STATS`**, the skills their params name,
the CharStats class rows, and the strings all of these use plus `TOOLTIP_STRINGS`. `ENGINE_STATS` (exported by
`statEngine.js`) lists the stats the engine writes or reads by name rather than through a `Properties.txt` stat
column: funcs 5, 6 and 7 have empty stat columns (`dmg-min`, `dmg-max`, `dmg%`), so `mindamage`/`maxdamage`,
`secondary_mindamage`/`secondary_maxdamage`, `item_throw_mindamage`/`item_throw_maxdamage`,
`item_mindamage_percent`/`item_maxdamage_percent`, the element pairs' stats and `coldlength`/`poisonlength` are
named there.
Measured before this spec: 147 codes, 139 stats, 15 skills, 183 strings, 55,720 bytes, **7,864 bytes gzipped**.
`ItemBuilder.json` is 631,747 bytes (58,913 gzipped) today, so it grows by about 13%.

- Maps become arrays of entries or plain objects; `statDataFromJson(json)` rebuilds the `Map`s and the `string()`
  lookup in the browser. A trimmed string table is final: it holds the resolved value of each key (patch →
  expansion → base already applied).
- **Loud check (build time):** after trimming, every builder affix is described at ilvl 1 and 99 with both
  dictionaries, with no base and with one representative base of each kind (1H only, 2H only, 1-or-2-handed,
  throwable, non-weapon), and the lines must be identical. Any missing code, stat, skill or string throws, naming it.
- **CharStats** gains `BlockFactor` (column 32, in `STAT_TABLE_COLUMNS`).
- **`TOOLTIP_STRINGS`** (beside `HARDCODED_STRINGS`, and read by `tools/extract-base-strings.mjs` too): `ItemStats1h`
  "Defense:", `ItemStats1r` "Chance to Block: " (SoE patch), `ItemStats1l` "One-Hand Damage:", `ItemStats1m`
  "Two-Hand Damage:", `ItemStats1n` "Throw Damage:", `ItemStast1k` "to" (the game's own spelling of the key),
  `ItemStats1i` "Quantity:", `ItemStats1d` "Durability:", `ItemStats1j` "of", `ItemStats1f` "Required Dexterity:",
  `ItemStats1e` "Required Strength:", `ItemStats1p` "Required Level:", `strEtherealDisplay` "Ethereal (Cannot Be
  Repaired)", `strSocketedDisplay` "Socketed", `Charmdes` "Keep in Inventory to Gain Bonus" (expansion table).
  `src/baseStrings.json` is regenerated with
  `node tools/extract-base-strings.mjs <string.tbl> <expansionstring.tbl>` from the user's own tables (the vault's
  `modrepo/` copies) and committed; the Blizzard tables never are. Labels are trimmed and joined to their value
  with one space.
- The engine and dictionary code enter the app bundle for the first time: `statEngine.js` is 21,940 bytes
  (6,754 gzipped) today, `statData.js` adds about 2.5 KB gzipped, and the new modules a little more: about 10 KB
  gzipped of code in all. There is no code splitting.

### Engine changes (`statEngine.js`)

**Context.** `ctx = {ilvl, base}`, where `ilvl` keeps the engine's existing `{min, max}` shape: the builder passes
`{min: n, max: n}`. `base` is null on the Affixes tab, whose output is unchanged (the golden snapshot
`affixLines.golden.txt` must not move). In the builder, `base` is `engineBase(model, base)` (in `itemTooltip.js`):
`{isWeapon, dmg1, dmg2, dmgThrow, throwable, txtMaxDamage, cells, gemsockets, maxSock}`, built once per base;
`maxSock` is the type's `[MaxSock1, MaxSock25, MaxSock40]`, and the socket cap is computed in func 14 from it and
`ctx.ilvl`.

**ilvl.** The builder's ilvl (`rollContext`'s `ilvl`; for crafted items the crafted item level), **not raised to
qlvl**. This drives the 7 ilvl-dependent mods (charges and procs) and the socket band. The slots card keeps today's
lines, which show charges over every ilvl the affix can roll at, so a charges line can differ between the slots card
(a range) and the tooltip (the exact ilvl). That is intended: the card describes the affix, the tooltip the item. Verified for charges (E1: an
Archon Staff of Teleportation made at `lvl=1` shows "Level 1 Teleport (29/33 Charges)"). The socket band reads the
same stored item level (`ITEMS_GetMaxSockets`), so it follows.

**Funcs 5 and 6 (+min, +max damage)**, D2MOO `ITEMMODS_PropertyFunc05/06`:

- write `mindamage`/`maxdamage` if the base has 1H damage or has no 2H damage;
- write `secondary_mindamage`/`secondary_maxdamage` if it has 2H damage or has no 1H damage;
- write `item_throw_mindamage`/`item_throw_maxdamage` if its type is throwable;
- on a non-weapon base, write all three;
- with no base (the Affixes tab), only `mindamage`/`maxdamage`, as today.
- `describe` suppresses a `secondary_*` line when the matching 1H stat exists, so a 1-or-2-hander prints once. The
  suppression runs before the pairs are taken.
- **The two-handed pair.** On a 2H-only base (120 in SoE) funcs 5/6 write only `secondary_*`, and today the
  "Adds a-b damage" branch reads only `mindamage`/`maxdamage`. So a rare two-handed axe with *of Excellence* and *of
  Evisceration* would print two lines where a one-handed weapon prints one. The game prints one (**V1**: a Giant
  Axe with +5 minimum and +10 maximum damage shows "Adds 5-10 damage", as a Hand Axe does), so `secondary_*` gets
  the same pair branch, with the same rule (one line only when min is below max).

**Func 7 (Enhanced Damage %)**, D2MOO `ITEMMODS_PropertyFunc07`: on a weapon, a roll `r` falls back to **+1 maximum
damage** (func 6's path) when `trunc(txtMaxDamage × r / 100) ≤ 0`, where `txtMaxDamage` = max(Weapons.txt `maxdam`,
`2handmaxdam`). The fallback compares against the txt value, before ethereal.

- **Always fallback** (every roll falls back): the mod becomes a plain +1 maximum damage.
- **Mixed** (some rolls fall back).
- Counts: over every builder weapon base × every ED row, 53 always and 189 mixed; over the pairs that can actually
  roll (item types and excluded types applied), 8 always and 34 mixed, all from p186–p188 and p257–p259 on low-tier
  one-handed, throwing and bow bases. Example: *Jagged* (10–20%) on a Hand Axe (txt max 6) falls
  back for rolls 10–16 and gives ED for 17–20. The mod expands to two entries, each flagged `byRoll`: ED 17–20% and
  +1 maximum damage. The modifier lines read "+17-20% Enhanced Damage" and "+1 to Maximum Damage", each followed
  by a muted **"(by roll)"**. The base damage line is exact at both ends (see `sumEnds` below).
- **Several mixed mods on one item.** *Jagged* (p186, group 105) and *Sharp* (p257, group 111) are both 10–20% and
  can both be on a rare Hand Axe. `byRoll` entries are never added across mods. Per stat, the tooltip prints one
  `byRoll` line whose range runs from the smallest single-mod value to the sum of every mod's maximum: "+17-40%
  Enhanced Damage (by roll)" and "+1-2 to Maximum Damage (by roll)". The real outcomes (no ED, 17–20% or 34–40%;
  +0, +1 or +2) all fall inside, and the tag says the line depends on the rolls. A `byRoll` line also prints beside
  a plain line of the same stat (*Jagged* with *Cruel*: "+201-300% Enhanced Damage" and "+17-20% Enhanced Damage (by
  roll)") where the game prints one sum; keeping them apart is what lets the tag stay honest.
- The lowest dmg% row is *Cinnabar* (p195, 5–10).

**Func 14 (sockets)**, D2MOO `ITEMMODS_PropertyFunc14` with `ITEMS_GetMaxSockets`: `n` = the param when the mod has
no roll (min ≤ 0), else the roll; the engine already does this (`statEngine.js` func 14). On the builder's four socket
rows (p420 *Mechanist's* 1–2; p421 and p760 *Artificer's* param 3; p422 *Jeweler's* param 4) this is the same as "the
param wins when set". New: with a base, `n` is clamped at each end to the cap = min(`cells` (`invwidth ×
invheight`), `gemsockets`, `maxSock` for ilvl ≤ 25 / 26–40 / > 40). Sockets are a SET, not an add; summing is still
safe because every socket row is in group 122, so two never meet. A cap of 0 drops the entry. With no base, today's
behaviour.

**Sources and `sumEntries`.** `expandPicks(picks, dict, ctx)` (in `itemTooltip.js`) calls `expandMods` once per
mod and attaches `src`, a set holding one `"pick:mod"` tag (pick index in the build, mod index in the affix);
`expandMods` itself is unchanged in shape, so its existing tests still compare `{stat, layer, min, max}`.
`sumEntries(entries)` (exported from `statEngine.js`, and now step 1 of `describe`, which already sums per (stat,
layer) internally) merges entries per (stat, layer): it adds `min` and `max` and unions the `src` sets. `byRoll`
entries are merged apart from plain ones, by the rule under func 7. An entry with no `src` (the Affixes tab, and
`affixData.js`'s single-stat lookups) counts as one shared source, so folding there is exactly today's.

**Source-aware `dgrp` folding.** A `dgrp` group prints as one line only when all members are present, their values
are equal (today's rule) **and their `src` sets are identical**. "All Resistances +10" from one mod folds;
four resistances from four affixes that happen to show the same range don't, because they roll independently. The
review checked every affix row: no row spreads a full group over several mods, so none of the 168 folding rows
changes and the golden snapshot holds.

**`sumEnds(picks, ctx)`.** For the base lines, each mod is collapsed to one roll (min = max = its min, then its max),
expanded and summed: two exact totals, `low` and `high`, with the func-7 fallback resolved per end. Base lines use
these, never the ranged entries. Per-level stats are never folded into base lines (1.14d doesn't); they stay
modifier lines. Every term is monotone in its roll, so the two ends bound every roll. One theoretical exception: on a
1-or-2-handed base whose smaller pair is below `txtMaxDamage`, the first ED roll past the fallback can add 0 where the
fallback added 1. No pair that can roll in SoE hits it; `sumEnds` documents it and a test pins the current data.

**Deferred fixes folded in** (from the engine's final review):

1. The Enhanced Damage line merges `item_mindamage_percent` and `item_maxdamage_percent` only when min% == max%.
2. Negative per-level values print through `span()` ("-1 to -99", not "-99 to -1").
3. A `dgrp` member with no `descfunc` throws a named error (stat and group) instead of a bare `TypeError` (the crash
   site is `affixData.js`'s via-lookup, `describe([...])[0]` on a member that prints no line).
4. Labels follow the form the value prints in. Repair: `ModStre9t` "Repairs # durability per second" when the value
   prints per second, `ModStre9u` "Repairs # durability in # seconds" otherwise (today the label is always the
   second). ED: "-#% Enhanced Damage" when negative. Today's affix rows print neither form, so no Stat filter option
   changes.
5. `statEngine.test.js` "func 3 and func 8 reuse the previous slot" uses a stubbed property whose reused value
   differs from the roll, so the test can fail.
6. `strModMinDamage` leaves `HARDCODED_STRINGS` if it is still unused after the funcs 5/6 change.

**Overlapping pair ranges** (Snowflake p614/p618/p622, *of Frost* s176): keep today's rule (the single form only when
every roll gives min ≥ max). It is an approximation and is documented as one.

**Unchanged:** poison (verified), charges, per-level lines, the Affixes tab's output.

### Base lines (`baseLines.js`)

Pure functions over `(base, type info, eth, low/high totals)`. `pct(x, p) = trunc(x × p / 100)` (toward zero);
`eth(x) = trunc(x × 5 / 4)` (PD2: "Ethereal bonus reduced from 50% to 25%"). Each line is computed at the low end and
the high end and shown as one value when they're equal, "lo-hi" otherwise.

**Defense** (`armo` types; shown when > 0):

- `B0` = `maxac + 1` if any `ac%` mod is present (func 2 forces it: D2MOO `sub_6FD92CF0`), else `minac..maxac`.
- `B` = `eth(B0)` when ethereal, else `B0`.
- **Defense = B + Σ`ac` + pct(B, ΣED%)**. Flat defense is never multiplied.
- Order verified numerically against the PD2 wiki: maxac+1, then ×5/4, then ED (Skullder's Ire 759–876, Purgatory
  1632–1836). Per-level defense stays its own modifier line.

**Chance to Block** (`shld` types: `shie`, `head`, `ashd`; **always shown** on them):

- `block` = Armor.txt `block` + Σ affix `block` (func 1 on `toblock`). Ethereal doesn't change it.
- Per class: min(**80**, `block` + CharStats `BlockFactor`). Classes with equal BlockFactor share one entry. Entries
  are ordered by BlockFactor, highest first, and the classes inside one entry alphabetically by abbreviation: Pal 30,
  Ama/Asn/Bar 25, Dru/Nec/Sor 20, using the Arreat Summit abbreviations (a fixed map from class to abbreviation,
  which fails loudly on an unknown class).
- `shie`: "Chance to Block: 42% (Pal: 72%, Ama/Asn/Bar: 67%, Dru/Nec/Sor: 62%)". `ashd` shows Pal only and `head`
  Nec only: "Chance to Block: 30% (Pal: 60%)".
- The first number is the item's own block (Arreat's bracket). Every number is capped at 80.
- **Cap: `BLOCK_CAP = 80`**, from SoE 13.0.0's patch notes ("Increased Maximum Block Chance from 75% to 80%"). The
  cap is in the closed game code, not the tables, so it is a named constant.
- The "% Increased Chance of Blocking" modifier still prints as its own line.

**Damage** (weapons; each end of each pair):

- `b` = `eth(txt value)` when ethereal, else the txt value.
- **min = b_min + Σ+min + pct(b_min, ΣED%)**; **max = b_max + Σ+max + pct(b_max, ΣED%)**, with each pair's own stats
  (`mindamage`/`maxdamage`, `secondary_*`, `item_throw_*`).
- Throwables show "Throw Damage: …" **above** the main line.
- The main line is "Two-Hand Damage:" when `2handed`, else "One-Hand Damage:". A 1-or-2-handed weapon shows
  "Two-Hand Damage: …" and then "One-Hand Damage: … (Bar)": the game shows the second line only to Barbarians.
- The main line clamps `max ≥ min + 1` (1.14d 0x485931); the throw and the "(Bar)" lines don't.
- Format: "One-Hand Damage: 111-148 to 375-507" (`ItemStast1k` "to").

**Quantity** (throwables and quivers): "Quantity: " + `maxstack`, shown full. No affix changes quantity.

**Durability:** "Durability: 86 of 86" (max of max). A new item's current durability is random (seen in U4 and U9),
so the tooltip shows the maximum twice, as charges are shown full. Hidden when `nodurability` = 1 or `durability` ≤ 0, when the
item is indestructible (*of Ages*), and on throwables. Ethereal doesn't halve it in PD2 ("Ethereal items no longer
have half durability"). No builder affix uses `dur` or `dur%`, so the value is the txt durability.

**Class restriction:** "(Paladin Only)" etc. from CharStats `StrClassOnly`, for class-only bases: the builder's
class code (`baseClass`, from ItemTypes `Class`, e.g. `pal`) goes through `CLASS_NAMES` to the CharStats row whose
`class` is that name.

**Requirements** (Required Dexterity, then Required Strength):

- **req = base + pct(base, Σ`ease`) − 10 if ethereal** (percent first, then −10; D2MOO `ITEMS_CheckRequirements`).
  No clamp. The line is hidden when the base is 0 or the total ≤ 0. Verified (U3).
- **Required Level** = `requiredLevel(base, picked)` (the card's value), hidden when ≤ 1.

**Colours:** labels white. Defense is blue when the affixes change it from `B`; damage is blue when the merged value
exceeds `b`. Both compare with the ethereal-adjusted base. With ethereal alone, the numbers stay white (verified, U1). Block's numbers are blue only when an affix
adds block (`block`), white otherwise (verified, U11: PD2 folds the viewer's BlockFactor into the number but colours
it by the `block` property alone). Durability, requirements and the charm line are white.

### Name and modifier lines (`itemTooltip.js`)

`buildTooltip(model, ctx, build)` returns the lines in order. Each line is an object:

```
{kind: "name" | "placeholder" | "baseName" | "base" | "mod" | "note" | "footer",
 text?, label?, value?, changed?, byRoll?, quality?}
```

`base` lines carry `label` (white) and `value` (blue when `changed`); `mod` lines carry the engine's `text` and
`byRoll`; the component maps kinds to classes, so `buildTooltip` holds no styling.

1. **Name.** Magic: "Prefix Base Suffix" from the picked names (either may be absent), in blue. Rare/crafted: a muted
   "Random Name" placeholder (`placeholder`, in the quality colour), then the base name (`baseName`, yellow for
   rare, orange for crafted). Layout and colours verified (R1).
2. Defense, Chance to Block, Throw Damage, One/Two-Hand Damage, Quantity, the charm line, Durability, class
   restriction, Required Dexterity, Required Strength, Required Level (above).
3. **Modifiers:** `describe(sumEntries(expandPicks(picks, dict, ctx)), dict)`, in the engine's priority order,
   blue, **minus the `item_numsockets` line**, which `describe` prints as "Socketed (n)" and which the footer prints
   instead. `byRoll` lines get the muted "(by roll)" tag.
4. **Footer:** "Ethereal (Cannot Be Repaired)", "Socketed (n)", or both joined by ", " (1.14d
   `INV_FormatEtherealSocketedText`), blue, at the very bottom. Verified (U2). The socket count is the clamped
   `item_numsockets` value: one number, or a range for *Mechanist's* ("Socketed (1-2)"). It is the only socket line.

**Charm line:** on a base whose type has `Charm` = 1, "Keep in Inventory to Gain Bonus" (`Charmdes`, from the
expansion table) between Quantity and Durability, white. Verified (C1): SoE prints this text, in white, not its patch table's
unused `Charmdes_PD2` "Active in Charm Inventory".

**Not shown:** attack speed, Smite/Kick, the viewer's Dexterity or level, unidentified, superior and low quality.

### Ethereal

- **Eligibility:** `base.canEthereal` (above). Ethereal applies to magic, rare and crafted.
  For crafted, it means the craft ran on an ethereal base: most of SoE's equipment crafts come as a `noe` row and an
  `eth` row that adds an `ethereal` mod (343 `noe` rows, 301 `eth`). Verified (U9): a crafted ethereal helm
  keeps the ×5/4 defense and full maximum durability.
- **Effects (PD2):** base defense and each base damage end ×5/4 by truncation; Str and Dex −10; durability unchanged;
  sockets and block unchanged; the footer line.
- **Indestructible conflict:** `indestruct` (*of Ages*, s404) can't be on an ethereal item (the game's ethereal
  check fails once an item is indestructible, and affixes roll first; U5: SoE's ethereal cube recipe refuses an
  *of Ages* shield). With `eth` on, *of Ages* rows can't be picked (see UI); `canRoll` and the roll odds don't
  change.
- **Verified:** bows and crossbows can't be ethereal (the user). The ×1.25-by-truncation rule and the maxac+1 → ×5/4
  → ED order were checked numerically against PD2 wiki items, then in game end to end on the drop path (U4), the
  func-23 cube path (U5) and crafting (U9).

### UI

**Ethereal control.**

- An "Ethereal" toggle button (`btn`, `aria-pressed`) in `.ibControls` after the quality buttons, shown only when a
  base is chosen and it has `canEthereal`.
- State: `build.eth` (boolean). The URL carries `e=1` only when it's on.
- `resolveBuild` resets `eth` to false when the base can't be ethereal and returns a separate `ethOff` flag beside
  `dropped` and `fixed`. From a link, `ethOff` counts as `fixed` (the existing "Some settings in the link were invalid
  and were reset." notice), and so does any `e` value other than `1`. From the controls, `setBuild` passes `ethOff`
  to `controlNotice(dropped, ethOff)`, which says "Ethereal was turned off: <base> can't be ethereal.", followed by
  the existing affix sentence when picks were dropped too.
- `rowState(affix, picked, caps, eth)` returns a new state, `ethereal`, for any row with an `indestruct` mod (matched
  by code, not by row key) while `eth` is on. `AffixRow` shows it as "Not on ethereal items" in the place of "Group
  taken by …" and treats it as locked, like `group` and `full`. `canRoll` is unchanged, so the list and the roll odds
  don't move. Turning Ethereal on with *of Ages* picked drops it through `resolveBuild` (a pick whose row state would
  be `ethereal`), and the existing `controlNotice` says "1 affix no longer fits and was removed." The toggle is never
  disabled.

**Tooltip card.**

- `<section className="ibTooltip">` inside `.ibCardCol`, after `.ibOdds`. `ItemTooltip` receives `model`, `ctx` and
  `build` and calls `buildTooltip` while rendering, so a throw happens inside its own `ErrorBoundary`. The boundary
  gets a new optional `fallback` prop (a short "The tooltip couldn't be built." message instead of the tab-wide
  "failed to load" panel) and the build's query string as `resetKey`, so the next change retries. It shows whenever a
  base is chosen, with or without picks. The slots card, its breakdown and the list are unchanged.
- Because `.ibCardCol` is one flex item on phones, the phone order needs no new mobile CSS. If a mobile rule turns
  out to be needed, the 980px, 720px and 480px blocks are searched for copies first.
- Look: the same dark panel and gold border as `.ibOdds`, lines centred like the game's tooltip, colours from the
  card's tokens (`--c-blue`, `--ib-rare`, `--ib-crafted`), a muted colour for the placeholder and the "(by roll)"
  tag. `overflow-wrap: anywhere`, so the long block line wraps at 390px.
- The "(by roll)" tag has a `title`: "Depends on the roll: on this base, low rolls add maximum damage instead of
  Enhanced Damage."
- The tooltip is plain text in reading order, not `aria-hidden`.

**Unchanged:** the pinned bar, the roll odds (no ethereal note), the Affixes tab, the link version.

### Worked examples (SoE data, PD2 rules)

**Ethereal magic Monarch: Holy (`ac%` 81–100) … of Ease (`ease` −20).** Monarch (`uit`): minac 133, maxac 148,
block 22, reqstr 156, levelreq 54, durability 86, 4 gem sockets.

```
Holy Monarch of Ease
Defense: 336-372                                   (186 + pct(186, 81..100); 186 = trunc(149 × 5/4))
Chance to Block: 22% (Pal: 52%, Ama/Asn/Bar: 47%, Dru/Nec/Sor: 42%)
Durability: 86 of 86
Required Strength: 115                             (156 + trunc(−31.2) − 10)
Required Level: 54
+81-100% Enhanced Defense
Requirements -20%
Ethereal (Cannot Be Repaired)
```

**Ethereal magic Berserker Axe: Cruel (`dmg%` 201–300) … of Evisceration (`dmg-max` 41–63).** `7wa`: 1H 30–89,
reqstr 138, reqdex 59, levelreq 64, durability 78. Base 37–111.

```
Cruel Berserker Axe of Evisceration
One-Hand Damage: 111-148 to 375-507
Durability: 78 of 78
Required Dexterity: 49
Required Strength: 128
Required Level: 64
+201-300% Enhanced Damage
+41-63 to Maximum Damage
Ethereal (Cannot Be Repaired)
```

**Jagged Hand Axe (`dmg%` 10–20).** Hand Axe: 1H 3–6. Low end roll 10 → +1 max → 3 to 7. High end
roll 20 → 3 + pct(3, 20) = 3, 6 + pct(6, 20) = 7. "One-Hand Damage: 3 to 7"; modifiers "+17-20% Enhanced Damage
(by roll)" and "+1 to Maximum Damage (by roll)".

**Magic Aegis of Deflecting (`block` +20).** Aegis (`uow`): block 46. "Chance to Block: 66% (Pal: 80%,
Ama/Asn/Bar: 80%, Dru/Nec/Sor: 80%)".

## Errors

- **Build time (the `affix-data` plugin):** missing base, type or CharStats columns; any code, stat, skill or string
  missing from the trimmed dictionary (with the trimmed-vs-full line check); a class with no abbreviation. Each
  throws a named error and fails the build, as today.
- **Browser:** `statDataFromJson` validates the shape it gets. The engine keeps its named errors, plus the new
  `dgrp` member error. If `buildTooltip` throws, the tooltip card's `ErrorBoundary` shows its `fallback`; the rest of
  the builder keeps working, and the next build change retries.

## Testing and verification

### Unit tests (Vitest, beside each module)

- **`baseLines.test.js`:** the worked examples above; the PD2 wiki items (Skullder's Ire 759–876, Purgatory
  1632–1836, Warlord's Trust 71–92 to 209–269, Ethereal Edge 242–271 to 430–481); the Aegis at the cap for every
  class; `ashd` and `head` showing one class; the order inside a block entry; Hand Axe + Jagged; a 1-or-2-handed sword's "(Bar)" line; a throwable
  (throw line, quantity, no durability); requirement lines hidden at ≤ 0 (the ethereal Buckler of Ease, U3).
- **`itemTooltip.test.js`:** line order and kinds; `changed` (defense and damage blue from affixes, white with
  ethereal alone; block blue only with a `block` affix); the class-restriction line on a Paladin shield and a
  Necromancer head; exactly one socket line, in the footer, with "Socketed (1-2)" for *Mechanist's*; a rare Hand
  Axe with *Jagged* and *Sharp* ("+17-40% Enhanced Damage (by roll)", "+1-2 to Maximum Damage (by roll)"); the magic name with either affix missing; the rare and crafted
  placeholder; no crafted note; the charm line on the four charm bases only; the footer in all three forms; the socket cap, and no socket line at cap 0; durability
  hidden on indestructible items and throwables; Required Level hidden at ≤ 1.
- **`statData.test.js`:** `trimStatData` then a JSON round trip through `statDataFromJson` describes every builder
  affix at ilvl 1 and 99, with no base and with each kind of base, exactly as the full dictionary does; every
  `ENGINE_STATS` name survives the trim; BlockFactor is read.
- **`statEngine.test.js`:** funcs 5/6 for each kind of base (1H, 2H, 1-or-2, throwable, non-weapon, no base); func 7
  always-fallback, mixed (`byRoll`) and plain; the 2H pair (`secondary_*` min and max print one "Adds a-b damage" line, V1); func 14's param, roll
  and clamp by ilvl band; `sumEntries` (including several `byRoll` mods); `sumEnds`; source-aware `dgrp` folding,
  and entries with no `src` folding as today; each deferred fix; the fixed "func 3 and func 8" test.
- **`itemBuilderRules.test.js` / `itemBuilderHash.test.js`:** `eth` cleaning and `ethOff`; the `e=1` round trip;
  `e=0` and `e=x` count as fixed; old links open non-ethereal; the `ethereal` row state (locked, `canRoll` and the
  odds unchanged) and the *of Ages* drop notice; the base-change notice alone and combined with dropped picks.
- **Golden snapshot:** `affixLines.golden.txt` stays unchanged. A diff means the no-base path changed: stop and
  report it rather than accept it.

### Browser check (`tools/checks/check-itembuilder.mjs`, extended)

- The tooltip shows for a base with no picks and updates as affixes are picked.
- The Ethereal toggle shows on an eligible base, hides on a bow, and `e=1` survives a reload.
- Turning Ethereal on drops *of Ages* with its notice.
- The phone order at 390×844, with no horizontal overflow.
- The "(by roll)" tag on Hand Axe + Jagged.

### Regression gates

- `compare-desktop.mjs` before and after, then `diff-shots.mjs`: only the Item Builder tab may differ.
- `npm run lint` at 0 problems, `npm test`, `npm run build`.
- Report the size growth: about 8 KB gzipped of data in `ItemBuilder.json`, about 10 KB gzipped of code in the bundle.

### Documentation

`CLAUDE.md`'s Item Builder bullet gains `baseLines.js`, `itemTooltip.js`, `ItemTooltip.jsx`, the ethereal flag and a
pointer to this spec; the stat-engine bullet notes that the engine now also runs in the browser.

## Verification log

### Verified

| What | How |
|---|---|
| Poison: sources summed, `(v·frames+128)>>8` over frames/25 s, no `poison_count` division | In game (the user): *Septic* + *of Blight* → "+27 poison damage over 5 seconds" |
| Charges: level and count by ilvl, shown full | In game (the user): *of Teleportation* staff and amulet |
| Repair line | In game (the user): "Repairs 1 durability in 33 seconds" |
| Property codes match case-insensitively | In game (the user): `Deep-Wounds` → *of Bleeding* (`suf=806`) |
| Multi-line strings stack bottom-up | In game (the user) |
| Bows and crossbows can't be ethereal | The user |
| SoE's block cap is 80 | SoE 13.0.0 patch notes, "General mechanics changes" (linked from the v13.0.0 release); the wiki's data is 13.0.2 |
| Ethereal ×5/4 by truncation; maxac+1 → ×5/4 → ED | PD2 wiki numbers checked against SoE's txt rows (Skullder's Ire, Purgatory, Warlord's Trust, Ethereal Edge). Wiki-derived, strong, not tested in game |
| Ethereal −10 Str/Dex, durability not halved | PD2 wiki (Item Bases, General Changes) |
| BlockFactor Pal 30, Ama/Asn/Bar 25, Dru/Nec/Sor 20 | SoE CharStats.txt; PD2 wiki Item Bases |

### Closed in game (the user, 2026-10-15)

All recipes were rows added to SoE's `CubeMain.txt`, run with `Diablo II.exe -direct -txt`. `pre=`/`suf=` N is the
**0-based data row** (file line − 2). Rows used: Holy `pre=149`, Cruel `pre=194`, of Ease `suf=370`, of
Evisceration `suf=203`, of Deflecting `suf=173`. A CubeMain row has 105 tab-separated columns; the Node one-liner
template is in the vault's `rare-names-report.md`.

| ID | Question | Recipe | Result |
|---|---|---|---|
| E1 | Do charges and procs use the stored ilvl, not raised to qlvl? | Archon Staff of Teleportation, output `lvl=1` | "Level 1 Teleport (29/33 Charges)": the stored ilvl |
| U1 | Are ethereal-only numbers white in PD2? | `output="uit,nor,eth"` and `output="uit,nor"`, `lvl=99`, `input 1="key"` | Both white |
| U2 | The one-line "Ethereal (Cannot Be Repaired), Socketed (4)": text, position, colour | `output="uit,nor,eth,sock=4"` | As expected: that text, blue, at the bottom |
| U3 | Requirements: percent then −10, no clamp, line hidden at ≤ 0 | `output="buc,mag,eth,suf=370"` and `output="buc,mag,eth"` | As expected: no Required Strength line with Ease; "Required Strength: 2" without |
| U4 | PD2's drop path for magic ethereal items | `output="uit,mag,eth,pre=149,suf=370"` and `output="7wa,mag,eth,pre=194,suf=203"`, `lvl=99` | As expected (Defense in 336–372, Str 115; damage within 111–148 to 375–507, Str 128, Dex 49). Current durability is random; show max of max |
| U5 | The func-23 path: same ×1.25, durability unchanged, refuses indestructible | `input 1="shld,noe"`, `input 2="key"`, `output="useitem"`, `mod 1=ethereal` | As expected; the recipe doesn't accept the *of Ages* shield |
| U7 | Sazabi's Cobalt Redeemer (`indestruct` listed before `ethereal`) | `output="Sazabi's Cobalt Redeemer"` | As expected: not ethereal |
| U8 | Indestructible + ethereal tooltip | `output="Ethereal Edge"` | As expected: no Durability line, "Indestructible", the ethereal footer, 2H 242–271 to 430–481 |
| U9 | A crafted ethereal output keeps ×1.25 and full durability | Ethereal magic helm + jewel + r06 + perfect sapphire (CubeMain line 1779) | As expected; current durability is random, as in U4 |
| U11 | Does PD2 fold BlockFactor into the tooltip, and how is it coloured? | Any shield, on a Paladin and a Sorceress | Folded; white unless the `block` property modifies it |
| R1 | Rare/crafted names: two lines, name on top, quality colour | **TEST rare ring** / **TEST crafted ring** | As expected |
| R2 | Crafted items use the same name pools, always two words | **TEST crafted ring**, **TEST crafted amulet** | As expected |
| R3 | Mythic Jewels get the jewel name pools | **TEST rare mythic jewel** | As expected |
| C1 | Which charm line SoE prints, and its colour | Any magic Grand Charm | "Keep in Inventory to Gain Bonus", white |
| V1 | On a two-handed-only weapon, do +min and +max damage print as one "Adds a-b damage" line, as on a one-handed weapon? | Two rows with `output` mods: `output="gix,nor"` (Giant Axe, 2H only) and `output="hax,nor"` (Hand Axe, 1H), each with `mod 1=dmg-min` 5–5, `mod 2=dmg-max` 10–10 (chance 100) | Both print "Adds 5-10 damage" (2026-10-16) |

### Noted, not changed

- **Rare Mythic Jewel affix count.** Vanilla gives a rare jewel 3–4 affixes only when the base type is exactly
  `jewl`; Mythic Jewel's type is `mjwg`, so vanilla would give it the ordinary rare's 4–6. The builder assumes the
  jewel's cap of 4. R3 checked the name pools only; counting the affixes over several **TEST rare mythic jewel**
  transmutes settles it. Some affixes print several lines, so the count uses local string tables that end each stat
  line with the IDs of the affixes that can print it (research vault, never committed). If they reach 5 or 6, a
  separate fix changes `capsFor`.
- **Crafted required level.** The builder's `requiredLevel` (and so the tooltip's) is the highest of the base's and
  the affixes' requirements. Vanilla adds 10 + 3 per affix to crafted items. Whether PD2/SoE does is unchecked; the
  tooltip follows the card until it is.
- **"Storm" twice in RareSuffix** and the unreachable Warp and Rift rows: names only, not shown by the builder.
