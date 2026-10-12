# Item Builder stat summing and item tooltip — design

**Date:** 2026-10-12
**Branch:** `item-builder-stat-summing`
**Status:** **Draft: pending in-game checks.** Designed section by section in brainstorming (2026-10-11 and
2026-10-12) and approved section by section. Every rule that rests on an unverified behaviour is marked
**⏳ pending &lt;ID&gt;** where it is used, and is listed in the "Verification log". Once the user closes them, the spec is
revised, gets an independent review (one solo reviewer on Opus 5.5), and is then locked for planning.

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
  Quantity, Durability, class restriction, requirements, modifiers, and the ethereal/socketed line.
- Modifier lines are the engine's lines over **summed** stats (per stat and layer, the game's way), with no English
  parsed anywhere. The base lines are computed from the game tables with the game's formulas and rounding.
- Each line shows one summed range: low = every minimum roll, high = every maximum roll.
- Ethereal can be switched on for every base that can be ethereal in SoE, with PD2's rules.
- The Affixes tab is unchanged (its golden snapshot doesn't move). Every tab other than Item Builder is
  pixel-identical before and after.
- Every rule not settled by the sources or an in-game test is named, with a test recipe.

### Out of scope

- Uniques, sets, runewords, sacreds and corruptions in the builder.
- A viewer: no character class, level or Dexterity. Block is shown per class (below) instead. No Smite/Kick damage,
  no attack-speed line, no red "requirement not met" colouring.
- Superior, low-quality and unidentified items. Normal quality isn't a builder quality, so the grey name of a
  normal ethereal item is noted but never shown.
- Odds of an ethereal item. The roll-odds line is unchanged: ethereal items also come from cube recipes, so an
  ethereal chance would not be a roll probability.
- Rare and crafted name pickers or sample names (a placeholder is shown instead).
- The crafted recipe's fixed mods (the builder doesn't model recipes; see "Name and modifier lines").
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
  itemTooltip.js       NEW: buildTooltip(model, ctx, build) → the tooltip's lines
  ItemTooltip.jsx      NEW: renders those lines (props only)
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

**Type fields.** Each `ItemTypes.txt` type gains `throwable` (`Throwable` = 1) and `maxSock`
(`[MaxSock1, MaxSock25, MaxSock40]`). The game reads both from the item's own type record (`type`), not the chain.

**`statDict`.** The plugin builds the full dictionary (`buildStatData`) as it does for `Affixes.json`, then
`trimStatData(dict, codes)` keeps only what the builder's affixes reach: their `Properties.txt` codes, the stats
those codes write (plus every member of each `dgrp` they touch, and the pair stats the damage lines read), the
skills their params name, the CharStats class rows, and the strings all of these use plus `TOOLTIP_STRINGS`.
Measured before this spec: 147 codes, 139 stats, 15 skills, 183 strings, 55,720 bytes, **7,864 bytes gzipped**.
`ItemBuilder.json` is 631,747 bytes (58,913 gzipped) today, so it grows by about 13%.

- Maps become arrays of entries or plain objects; `statDataFromJson(json)` rebuilds the `Map`s and the `string()`
  lookup in the browser. A trimmed string table is final: it holds the resolved value of each key (patch →
  expansion → base already applied).
- **Loud check (build time):** after trimming, every builder affix is described at ilvl 1 and 99 with both
  dictionaries and the lines must be identical. Any missing code, stat, skill or string throws, naming it.
- **CharStats** gains `BlockFactor` (column 32, in `STAT_TABLE_COLUMNS`).
- **`TOOLTIP_STRINGS`** (beside `HARDCODED_STRINGS`, and read by `tools/extract-base-strings.mjs` too): `ItemStats1h`
  "Defense:", `ItemStats1r` "Chance to Block: " (SoE patch), `ItemStats1l` "One-Hand Damage:", `ItemStats1m`
  "Two-Hand Damage:", `ItemStats1n` "Throw Damage:", `ItemStast1k` "to" (the game's own spelling of the key),
  `ItemStats1i` "Quantity:", `ItemStats1d` "Durability:", `ItemStats1j` "of", `ItemStats1f` "Required Dexterity:",
  `ItemStats1e` "Required Strength:", `ItemStats1p` "Required Level:", `strEtherealDisplay` "Ethereal (Cannot Be
  Repaired)", `strSocketedDisplay` "Socketed". `src/baseStrings.json` is regenerated with
  `node tools/extract-base-strings.mjs <string.tbl> <expansionstring.tbl>` from the user's own tables (the vault's
  `modrepo/` copies) and committed; the Blizzard tables never are. Labels are trimmed and joined to their value
  with one space.
- The engine and dictionary code enter the app bundle for the first time: `statEngine.js` is 21,940 bytes
  (6,754 gzipped) today. There is no code splitting.

### Engine changes (`statEngine.js`)

**Context.** `ctx = {ilvl, base}`. `base` is null on the Affixes tab, whose output is unchanged (the golden
snapshot `affixLines.golden.txt` must not move). In the builder, `base` is `engineBase(model, base)`:
`{isWeapon, dmg1, dmg2, dmgThrow, throwable, txtMaxDamage, sockCap}`, built once per base.

**ilvl.** The builder's ilvl (`rollContext`'s `ilvl`; for crafted items the crafted item level), **not raised to
qlvl**. This drives the 7 ilvl-dependent mods (charges and procs) and the socket band. **⏳ pending E1.**

**Funcs 5 and 6 (+min, +max damage)**, D2MOO `ITEMMODS_PropertyFunc05/06`:

- write `mindamage`/`maxdamage` if the base has 1H damage or has no 2H damage;
- write `secondary_mindamage`/`secondary_maxdamage` if it has 2H damage or has no 1H damage;
- write `item_throw_mindamage`/`item_throw_maxdamage` if its type is throwable;
- on a non-weapon base, write all three;
- with no base (the Affixes tab), only `mindamage`/`maxdamage`, as today.
- `describe` suppresses a `secondary_*` line when the matching 1H stat exists, so a 1-or-2-hander prints once.

**Func 7 (Enhanced Damage %)**, D2MOO `ITEMMODS_PropertyFunc07`: on a weapon, a roll `r` falls back to **+1 maximum
damage** (func 6's path) when `trunc(txtMaxDamage × r / 100) ≤ 0`, where `txtMaxDamage` = max(Weapons.txt `maxdam`,
`2handmaxdam`). The fallback compares against the txt value, before ethereal.

- **Always fallback** (every roll falls back): the mod becomes a plain +1 maximum damage. SoE has 53 such
  (affix, base) pairs.
- **Mixed** (some rolls fall back): 189 pairs in SoE. Example: *Jagged* (10–20%) on a Hand Axe (txt max 6) falls
  back for rolls 10–16 and gives ED for 17–20. The mod expands to two entries, each flagged `byRoll`: ED 17–20% and
  +1 maximum damage. The modifier lines read "+17-20% Enhanced Damage" and "+1 to Maximum Damage", each followed
  by a muted **"(by roll)"**. The base damage line is exact at both ends (see `sumEnds` below).
- The lowest dmg% row is *Cinnabar* (p195, 5–10).

**Func 14 (sockets)**, D2MOO `ITEMMODS_PropertyFunc14` with `ITEMS_GetMaxSockets`: `n` = the param when the mod has
no roll (min ≤ 0), else the roll. On SoE's five socket rows (p420 *Mechanist's* 1–2; p421, p760, p761
*Artificer's* param 3; p422 *Jeweler's* param 4) this is the same as "the param wins when set". `n` is clamped to
`base.sockCap` = min(`invwidth × invheight`, `gemsockets`, the type's `MaxSock1`/`MaxSock25`/`MaxSock40` for ilvl
≤ 25 / 26–40 / > 40). Sockets are a SET, not an add. A cap of 0 means no socket line. With no base, today's
behaviour.

**Sources and `sumEntries`.** Every entry carries `src`, a set of `"pick:mod"` tags (pick index in the build, mod
index in the affix). `sumEntries(entries)` merges entries per (stat, layer): it adds `min` and `max` and unions the
`src` sets; `byRoll` entries are kept apart from plain ones. It is exported and is the only summing path.

**Source-aware `dgrp` folding.** A `dgrp` group prints as one line only when all members are present, their values
are equal (today's rule) **and their `src` sets are identical**. "All Resistances +10" from one mod folds;
four resistances from four affixes that happen to show the same range don't, because they roll independently.

**`sumEnds(picks, ctx)`.** For the base lines, each mod is collapsed to one roll (min = max = its min, then its max),
expanded and summed: two exact totals, `low` and `high`, with the func-7 fallback resolved per end. Base lines use
these, never the ranged entries. Per-level stats are never folded into base lines (1.14d doesn't); they stay
modifier lines. Every term is monotone in its roll, so the two ends bound every roll.

**Deferred fixes folded in** (from the engine's final review):

1. The Enhanced Damage line merges `item_mindamage_percent` and `item_maxdamage_percent` only when min% == max%.
2. Negative per-level values print through `span()` ("-1 to -99", not "-99 to -1").
3. A `dgrp` member with no `descfunc` throws a named error (stat and group) instead of a bare `TypeError`.
4. The repair label uses its "1 in # seconds" form only for that string; the ED label prints "-#%" when negative.
5. The socket rule above (the param when there is no roll).
6. `statEngine.test.js` "func 3 and func 8 reuse the previous slot" uses a stubbed property whose reused value
   differs from the roll, so the test can fail.
7. `strModMinDamage` leaves `HARDCODED_STRINGS` if it is still unused after the funcs 5/6 change.

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
- Per class: min(**80**, `block` + CharStats `BlockFactor`). Classes with equal BlockFactor share one entry, ordered
  by BlockFactor, highest first: Pal 30, Ama/Asn/Bar 25, Dru/Nec/Sor 20, using the Arreat Summit abbreviations
  (a fixed map from class to abbreviation, which fails loudly on an unknown class).
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

**Durability:** "Durability: 86 of 86" (max of max). Hidden when `nodurability` = 1 or `durability` ≤ 0, when the
item is indestructible (*of Ages*), and on throwables. Ethereal doesn't halve it in PD2 ("Ethereal items no longer
have half durability"). No builder affix uses `dur` or `dur%`, so the value is the txt durability.

**Class restriction:** "(Paladin Only)" etc. from CharStats `StrClassOnly`, for class-only bases.

**Requirements** (Required Dexterity, then Required Strength):

- **req = base + pct(base, Σ`ease`) − 10 if ethereal** (percent first, then −10; D2MOO `ITEMS_CheckRequirements`).
  No clamp. The line is hidden when the base is 0 or the total ≤ 0. **⏳ pending U3.**
- **Required Level** = `requiredLevel(base, picked)` (the card's value), hidden when ≤ 1.

**Colours** (1.14d rules): labels white. Defense is blue when the affixes change it; damage is blue when the merged
value exceeds the base. With ethereal alone, the numbers stay white. **⏳ pending U1.** Block's value is blue when
an affix adds block. **⏳ pending U11.** Durability and requirements are white.

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
   rare, orange for crafted). **⏳ pending R1** (layout and colours).
2. Defense, Chance to Block, Throw Damage, One/Two-Hand Damage, Quantity, Durability, class restriction, Required
   Dexterity, Required Strength, Required Level (above).
3. **Modifiers:** `describe(sumEntries(all picks' entries), ctx)`, in the engine's priority order, blue.
   `byRoll` lines get the muted "(by roll)" tag.
4. **Crafted note** (*added while writing; not yet discussed*): for crafted items, a muted line "Plus the recipe's
   fixed modifiers", matching the card's existing sub-line, since those mods aren't modelled.
5. **Footer:** "Ethereal (Cannot Be Repaired)", "Socketed (n)", or both joined by ", " (1.14d
   `INV_FormatEtherealSocketedText`), blue, at the very bottom. **⏳ pending U2.**

**Charm line** (*added while writing; not yet discussed*): the game prints a charm line between Quantity and
Durability. SoE's patch
table has both `Charmdes` "Keep in Inventory to Gain Bonus" and `Charmdes_PD2` "Active in Charm Inventory". If the
user wants the line, the spec will name the key after check **C1**; until then it is not shown.

**Not shown:** attack speed, Smite/Kick, the viewer's Dexterity or level, unidentified, superior and low quality.

### Ethereal

- **Eligibility:** `base.canEthereal` (above). Ethereal applies to magic, rare and crafted.
  For crafted, it means the craft ran on an ethereal base: SoE's CubeMain pairs every equipment craft as a `noe` row
  and an `eth` row that adds an `ethereal` mod (343 `noe`, 301 `eth`). **⏳ pending U9.**
- **Effects (PD2):** base defense and each base damage end ×5/4 by truncation; Str and Dex −10; durability unchanged;
  sockets and block unchanged; the footer line.
- **Indestructible conflict:** `indestruct` (*of Ages*, s404) can't be on an ethereal item (the game's ethereal
  check fails once an item is indestructible, and affixes roll first). With `eth` on, *of Ages* rows are
  ineligible.
- **Verified:** bows and crossbows can't be ethereal (the user). The ×1.25-by-truncation rule and the maxac+1 → ×5/4
  → ED order were checked numerically against PD2 wiki items. The drop path end to end is **⏳ pending U4**.

### UI

**Ethereal control.**

- An "Ethereal" toggle button (`btn`, `aria-pressed`) in `.ibControls` after the quality buttons, shown only when a
  base is chosen and it has `canEthereal`.
- State: `build.eth` (boolean). The URL carries `e=1` only when it's on.
- `resolveBuild` resets `eth` to false when the base can't be ethereal. From a link that counts as `fixed` (the
  existing "Some settings in the link were invalid and were reset." notice). From a base change in the controls,
  `useItemBuilder` shows "Ethereal was turned off: <base> can't be ethereal."
- *of Ages* gets a new row state, `ethereal`, shown as "Not on ethereal items" in the place of "Group taken by …".
  Turning Ethereal on with *of Ages* picked drops it through `resolveBuild`, and the existing `controlNotice` says
  "1 affix no longer fits and was removed." The toggle is never disabled.

**Tooltip card.**

- `<section className="ibTooltip">` inside `.ibCardCol`, after `.ibOdds`, wrapped in its own `ErrorBoundary`. It
  shows whenever a base is chosen, with or without picks. The slots card, its breakdown and the list are unchanged.
- Because `.ibCardCol` is one flex item on phones, the phone order needs no new mobile CSS. If a mobile rule turns
  out to be needed, the 980px, 720px and 480px blocks are searched for copies first.
- Look: the same dark panel and gold border as `.ibOdds`, lines centred like the game's tooltip, colours from the
  card's tokens (`--c-blue`, `--ib-rare`, `--ib-crafted`), a muted colour for the placeholder, the "(by roll)" tag
  and the crafted note. `overflow-wrap: anywhere`, so the long block line wraps at 390px.
- The "(by roll)" tag has a `title`: "The low rolls add +1 maximum damage instead on this base."
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
  `dgrp` member error. If `buildTooltip` throws, the tooltip card's `ErrorBoundary` shows a short failure message;
  the rest of the builder keeps working.

## Testing and verification

### Unit tests (Vitest, beside each module)

- **`baseLines.test.js`:** the worked examples above; the PD2 wiki items (Skullder's Ire 759–876, Purgatory
  1632–1836, Warlord's Trust 71–92 to 209–269, Ethereal Edge 242–271 to 430–481); the Aegis at the cap for every
  class; `ashd` and `head` showing one class; Hand Axe + Jagged; a 1-or-2-handed sword's "(Bar)" line; a throwable
  (throw line, quantity, no durability); requirement lines hidden at ≤ 0 (the Buckler of Ease, marked pending U3).
- **`itemTooltip.test.js`:** line order and kinds; the magic name with either affix missing; the rare and crafted
  placeholder; the crafted note; the footer in all three forms; the socket cap, and no socket line at cap 0; durability
  hidden on indestructible items and throwables; Required Level hidden at ≤ 1.
- **`statData.test.js`:** `trimStatData` then a JSON round trip through `statDataFromJson` describes every builder
  affix at ilvl 1 and 99 exactly as the full dictionary does; BlockFactor is read.
- **`statEngine.test.js`:** funcs 5/6 for each kind of base (1H, 2H, 1-or-2, throwable, non-weapon, no base); func 7
  always-fallback, mixed (`byRoll`) and plain; func 14's param, roll and clamp; `sumEntries`; `sumEnds`; source-aware
  `dgrp` folding; each deferred fix; the fixed "func 3 and func 8" test.
- **`itemBuilderRules.test.js` / `itemBuilderHash.test.js`:** `eth` cleaning; the `e=1` round trip; old links open
  non-ethereal; the *of Ages* rule and its drop notice; the base-change notice.
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
- Report the size growth: about 8 KB gzipped of data in `ItemBuilder.json`, about 7 KB gzipped of engine in the bundle.

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

### Pending (to close before the spec is locked)

All recipes are rows added to SoE's `CubeMain.txt`, run with `Diablo II.exe -direct -txt`. `pre=`/`suf=` N is the
**0-based data row** (file line − 2). Rows used: Holy `pre=149`, Cruel `pre=194`, of Ease `suf=370`, of
Evisceration `suf=203`, of Deflecting `suf=173`. A CubeMain row has 105 tab-separated columns; the Node one-liner
template is in the vault's `rare-names-report.md`.

| ID | Question | Recipe | Expected |
|---|---|---|---|
| E1 | Do charges, procs and the socket band use the stored ilvl, not raised to qlvl? | A staff below its qlvl with *of Teleportation* (output `lvl` under the staff's qlvl) | Charge level and count follow the output `lvl`, not the qlvl |
| U1 | Are ethereal-only numbers white in PD2 (and the normal item's name grey)? | `output="uit,nor,eth"` and `output="uit,nor"`, `lvl=99`, `input 1="key"` | Eth Defense = trunc(rolled × 1.25) in white; grey name |
| U2 | The one-line "Ethereal (Cannot Be Repaired), Socketed (4)" in PD2: text, position, colour | `output="uit,nor,eth,sock=4"` | That text, blue, at the bottom |
| U3 | Requirements: percent then −10, no clamp, line hidden at ≤ 0 | `output="buc,mag,eth,suf=370"` and `output="buc,mag,eth"` | With Ease: 12 + trunc(−2.4) − 10 = 0 → no Required Strength line. Without: "Required Strength: 2" |
| U4 | PD2's drop path for magic ethereal items | `output="uit,mag,eth,pre=149,suf=370"` and `output="7wa,mag,eth,pre=194,suf=203"`, `lvl=99`, a few times | Defense in 336–372, Durability 86 of 86, Str 115; damage within 111–148 to 375–507, Durability 78 of 78, Str 128, Dex 49 |
| U5 | The func-23 path (Lightsong, the crafted `ethereal` mod): same ×1.25, durability unchanged, refuses indestructible | `input 1="shld,noe"`, `input 2="key"`, `output="useitem"`, `mod 1=ethereal` (chance 100, min 1, max 1); cube a Holy Monarch, then a shield with *of Ages* | Defense rises to the ethereal value, Durability stays 86; the *of Ages* shield comes out unchanged |
| U7 | Sazabi's Cobalt Redeemer (`indestruct` listed before `ethereal`) | `output="Sazabi's Cobalt Redeemer"` | Not ethereal by the vanilla rule; if ethereal, PD2 changed func 23 or the order |
| U8 | Indestructible + ethereal tooltip | `output="Ethereal Edge"` | No Durability line; "Indestructible"; the ethereal footer; 2H 242–271 to 430–481 |
| U9 | A crafted ethereal output keeps ×1.25 and full durability | Ethereal magic helm + jewel + r06 + perfect sapphire (SoE CubeMain line 1779) | Ethereal crafted helm with trunc(1.25 × base) defense, full durability |
| U11 | Does the PD2 client fold BlockFactor into the tooltip, and colour it like 1.14d? | Any shield, viewed on a Paladin and a Sorceress | 22 + 30 = 52 (blue) and 22 + 20 = 42 |
| R1 | Rare/crafted names: two lines, name on top, both in the quality colour | **TEST rare ring** / **TEST crafted ring** (vault template) | "Prefix Suffix" over "Ring", yellow / orange |
| R2 | Crafted items use the same name pools and always get two words | **TEST crafted ring**, **TEST crafted amulet**, about 10 each | No one-word names, no words outside the ring/amulet lists |
| R3 | Mythic Jewels get the jewel name pools | **TEST rare mythic jewel**, about 10 | Suffix ∈ {Eye, Gyre, Whorl, Talisman, Heart, Scarab} |
| C1 | Which charm line PD2/SoE prints, if the charm line is wanted | Any magic Grand Charm | "Keep in Inventory to Gain Bonus" or "Active in Charm Inventory" |

### Noted, not changed

- **Rare Mythic Jewel affix count.** Vanilla gives a rare jewel 3–4 affixes only when the base type is exactly
  `jewl`; Mythic Jewel's type is `mjwg`, so vanilla would give it the ordinary rare's 4–6. The builder assumes the
  jewel's cap of 4. Check it with R3's recipe (count the affixes); if it holds, a separate fix changes `capsFor`.
- **Crafted required level.** The builder's `requiredLevel` (and so the tooltip's) is the highest of the base's and
  the affixes' requirements. Vanilla adds 10 + 3 per affix to crafted items. Whether PD2/SoE does is unchecked; the
  tooltip follows the card until it is.
- **"Storm" twice in RareSuffix** and the unreachable Warp and Rift rows: names only, not shown by the builder.
