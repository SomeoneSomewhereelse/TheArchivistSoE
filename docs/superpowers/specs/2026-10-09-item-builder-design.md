# Item Builder — design

**Date:** 2026-10-09
**Branch:** `item-builder`, in a manual worktree at `.worktrees/item-builder` (plain `git worktree add`; plan Task 1 Step 0)
**Status:** design approved section by section in brainstorming (2026-10-09); revised after an independent review (link cleanup moved into an App-level hook, query handling in `useHashTab`, link version, test fixes); approved by the user (2026-10-09)

## Intent

A new tab where a player plans a magic, rare or crafted item. They pick a base item, a quality and the
levels that drive affix generation, then try prefix and suffix combinations. The builder only allows
combinations the game can actually roll: the affix level window, item-type and class restrictions, the
magic-only flag, affix groups and the prefix/suffix caps.

Most users will plan end-game items, so every level defaults to 99. Lowering the levels narrows the lists
for early- and mid-game planning.

### Success criteria

- An affix is pickable in the builder if and only if the game's rules (below) let it roll on that base, at
  that quality and those levels, alongside the affixes already picked.
- Caps follow the table in "Caps". Where sources disagree, the stricter rule is the default, and the
  defaults live in one table so a correction is a one-line change.
- A build survives a reload and can be shared as a link. Old or doctored links never crash; whatever
  no longer fits is dropped with a visible notice.
- Only controls that change the rules are shown (no quality control for charms, no clvl outside crafting,
  1 + 1 slots for magic items).
- Works on desktop and on a 390×844 phone; every existing tab is pixel-identical before and after.

### Out of scope (this spec)

- **Stat summing** of picked affixes: its own follow-up spec. The findings so far are in "Follow-up: stat
  summing" below, and this design keeps each affix's raw mods so the follow-up needs no data rework.
- Crafting recipes' fixed mods (Blood, Caster, …): the card only notes "plus the recipe's fixed mods".
- Maps (Map T1–T5 affixes): a separate SoE system with its own, unresearched affix counts.
- Unique, set and runeword items; sockets; ethereal; base-item effects of affixes (requirements, speed).
- The 7 suffixes with a class-specific level requirement get a note on the card, nothing more.
- `package.json` version and `Changelog.json`: this fork has never edited them; they stay with upstream.

## Game rules

Sources: the PD2 wiki ([Item Affixes](https://wiki.projectdiablo2.com/wiki/Item_Affixes),
[Crafting](https://wiki.projectdiablo2.com/wiki/Crafting)), the reverse-engineered vanilla code
([D2MOO `ItemsMagic.cpp`](https://github.com/ThePhrozenKeep/D2MOO/blob/master/source/D2Game/src/ITEMS/ItemsMagic.cpp)),
the Arreat Summit, and the SoE data itself. SoE's wiki defers to PD2 for anything it doesn't change.

### Affix level (alvl)

1. `ilvl = max(ilvl, qlvl)`.
2. If the base has `magic lvl` > 0: `alvl = ilvl + magic lvl`. In SoE that is 1 for normal and exceptional
   wands and for every staff and orb, and 3 / 8 / 13 / 18 for Circlet / Coronet / Tiara / Diadem.
3. Otherwise, if `ilvl < 99 − ⌊qlvl/2⌋`: `alvl = ilvl − ⌊qlvl/2⌋`; else `alvl = 2·ilvl − 99`.
4. Clamp to 1–99.

Crafted items: `crafted ilvl = ⌊clvl/2⌋ + ⌊ingredient ilvl/2⌋`, then the same formula.

### Which affixes can roll

An affix row can roll on the item when all of these hold:

1. `level ≤ alvl`, and `alvl ≤ maxlevel` when `maxlevel` is set (blank means no cap).
2. One of its `itype1–7` is in the equivalence chain (`ItemTypes.txt` `Equiv1`/`Equiv2`, followed
   recursively) of the base's `type` or `type2`.
3. None of its `etype1–5` is in either chain.
4. On rare and crafted items, `rare = 1`. Magic items take every row.
5. If `classspecific` is set: the base's type has no `Class` in `ItemTypes.txt`, or the same class. So an
   amulet can roll any class's skills, an orb only Sorceress ones.
6. `spawnable = 1` and `frequency > 0` (true of every row the builder loads).
7. No affix already on the item has the same `group`, **counting prefixes and suffixes together**.

### Caps

| Item | Prefixes | Suffixes | Total |
|---|---|---|---|
| Magic | 1 | 1 | 2 |
| Rare | 3 | 3 | 6 |
| Rare Jewel, rare Mythic Jewel | 2 | 2 | 4 |
| Crafted (random affixes) | 3 | 3 | 4 |

qlvl never changes a cap; it only shifts alvl.

**Unsettled, so the conservative default is used** (PD2's code is closed):

| Question | Sources | Default |
|---|---|---|
| Rare jewel prefix/suffix split | vanilla code caps only 3/3 with 4 total; community wikis say 2/2 | 2 + 2 |
| Do Mythic Jewels follow the jewel rule? | the vanilla code checks the jewel type exactly; `mjwg` is its own type | yes: 2 + 2, 4 total |
| Is alvl still clamped at 99? | vanilla clamps; one SoE affix has level 110 | yes, so that affix never shows |

### Affix count by ilvl (shown as a hint, never enforced)

| Quality | ilvl | Affixes rolled |
|---|---|---|
| Magic | weapons/armor 65+, jewels/jewelry 85+, charms 90+ | always 2 (else 1–2) |
| Rare | 1–44 / 45–64 / 65–84 / 85+ | 3–6 / 4–6 / 5–6 / 6 |
| Rare jewel | any | 4 |
| Crafted (crafted ilvl) | 1–30 / 31–50 / 51–70 / 71+ | 1–4 / 2–4 / 3–4 / 4 |

### Qualities per base

- **Magic:** every in-scope base.
- **Rare:** bases whose type has `Rare = 1` in `ItemTypes.txt` (so not charms or Ornate Charms).
- **Crafted:** bases whose type chain reaches `amul`, `ring`, `belt`, `glov`, `boot`, `helm`, `tors`,
  `shld`, `weap`, `bowq`, `xboq` or `circ` (circlets through SoE's infusion recipes). Not jewels.
  *Assumption:* PD2 accepts any base of those categories; vanilla's per-recipe base inputs are not
  modelled.

### Required level

The highest of the base's `levelreq` and each picked affix's `levelreq`. PD2 removed the old crafted
penalty (+10, +3 per affix), so crafted items follow the same rule.

### Roll odds

**Meaning:** "≈ 1 in X to roll these affixes" is the chance that one drop of the current base, quality and
levels carries **all** the picked affixes; its other affix slots roll anything. It works for 1–6 picks and is
hidden when nothing is picked. `src/itemBuilderOdds.js` (`rollOdds(model, ctx, picks)`, `formatOdds(p)`).

**The model** (vanilla D2's roll, as far as it is known; PD2's own code is closed):

1. The item rolls N affixes, N **uniform** over the "Affix count by ilvl" range (`affixCountRange(ctx)` in
   `itemBuilderRules.js`, which `countHint` reads too). Uniform is an **assumption**: PD2's real distribution
   is not public.
2. Each draw is a prefix or a suffix, 50/50 while both sides are open, else the open side. A side closes at its
   cap, or when no row with a free group is left on it (the draw goes to the other side). With no open side
   the item rolls fewer affixes. `caps.total` stops the draws too (it is never below N).
3. Within the side, a row is drawn with probability proportional to its weight among the rows that can roll
   (`canRoll`) and whose group no affix on the item already holds. Weight = `frequency`, times the row's
   `level` on a base with `magic lvl` > 0 (vanilla `ComputeAffixFrequency`).

**The calculation is exact for this model**, not an approximation:

- Drawing a row by weight among the free-group rows is the same as drawing a free *group* by its total weight
  and then a row inside it. So one side's draws are a weighted draw of groups without replacement, and a
  pick succeeds when its group is drawn and then the pick is the row chosen inside it (weight / group weight).
- No group is shared by a prefix and a suffix on any builder base (the shared groups are map groups; checked
  over every base, quality and level band), so the two sides are independent given how many draws each
  gets. A side has at most 26 groups and 3 draws, so `rollOdds` enumerates every draw sequence of each side
  (stopping once the picks' groups are all drawn), combines them with the distribution of (prefix draws,
  suffix draws) after N draws, and averages over N. Well under a millisecond for 6 picks.
- **Why not the first sketch** (a DP over the picks found so far, with draws that miss every pick assumed to
  change nothing): a Monte Carlo of the model above showed it off by up to 67 % (a rare Diadem, one prefix
  and one suffix), because a miss uses up a side slot and removes its whole group, and a few heavy groups
  carry most of a side's weight (most of all with magic-lvl weights). Tracking side counts and sibling rows
  still left errors of 12–62 %.
- `itemBuilderOdds.test.js` checks hand-computed cases and compares `rollOdds` with a seeded Monte Carlo of
  the draw-by-draw roll on real data (rare, magic, crafted, rare jewel, orb and Diadem builds), within
  max(5 %, 4 standard errors).

**Not modelled:** a crafted recipe's fixed mods (the odds cover the random affixes only); any PD2 change to
affix weights or to the count distribution; the rare-jewel and Mythic Jewel caps follow "Caps" (2 + 2).

## Data findings

- **`Affixes.json` is lossy for item types.** It stores in-game display names, and one name covers several
  codes: "Staff Class" is `orb` + `staf` + `wand`, "Mace Class" is `club` + `hamm` + `mace` + `scep`.
  Example: *Lapis* (+resist) excludes only `orb`, but the JSON shows "Staff Class" as excluded. Rules
  built on the JSON would wrongly hide it on staves and wands.
- **The raw tables are available** in the mod repo
  ([`Lukaszpg/PD2-Sanctuary-of-Exile`](https://github.com/Lukaszpg/PD2-Sanctuary-of-Exile),
  `standard-mode/data/global/excel/`). `MagicPrefix.txt` (blob `69072c03`) and `MagicSuffix.txt`
  (blob `6fcd8354`) at the time of writing.
- **`Affixes.json` is exactly the raw rows with `spawnable = 1` and `frequency > 0`, in the same order**
  (prefixes, then suffixes): all 1,412 rows line up by name, level and group.
- **Damnation shares everything the builder uses.** Its compiled affix tables are byte-identical to
  Standard's, and `Weapons.txt`, `Armor.txt`, `ItemTypes.txt` and the builder's `Misc.txt` rows are
  identical. The builder ignores the Damnation toggle.
- **Charm qlvl:** SoE's `Misc.txt` gives every charm qlvl 1. The PD2 wiki's 14 / 28 for large / small
  charms matches SoE's unused PVP charms.
- **Names repeat:** 342 affix names have several rows, and even name + level + group repeats 268 times
  (*Stout*, level 1, group 101, once per charm size). Rows need a key of their own.
- **Groups shared by prefixes and suffixes** (157, 158, 164, 165, 166, 316) are all map groups today, but the
  rule is implemented generally.
- Base display names: every spawnable armor and weapon is in `Armors.json` / `Weapons.json`, except 18
  throwing potions (out of scope).

## Design

### Modules and data flow

```
public/data/standard/{MagicPrefix,MagicSuffix,Weapons,Armor,Misc,ItemTypes}.txt
public/data/{Affixes,Weapons,Armors}.json
        │  item-builder-data plugin (vite.config.js) → src/itemBuilderData.js
        ▼
public/data/standard/ItemBuilder.json   (gitignored)
        │  src/itemBuilderLoad.js (fetch once, cache, retry)
        ▼
App ── useHashTab (src/hashTab.js): tab + the builder's query ⇄ location.hash
  └─ useItemBuilder (src/useItemBuilder.js): loads the model, decodes and cleans the query
        │        ├─ src/itemBuilderRules.js (alvl, filters, caps, row state, required level)
        │        └─ src/itemBuilderHash.js (build ↔ URL query)
        ▼
ItemBuilderPanel (props: model, build, notice, setBuild; local UI state only)
```

| Module | Role | Tests |
|---|---|---|
| `src/itemBuilderData.js` | Column lists, `.txt` + JSON → `ItemBuilder.json`, the join and the loud checks. Node-safe: `vite.config.js` imports it. | `itemBuilderData.test.js` |
| `src/itemBuilderRules.js` | alvl, crafted ilvl, caps tables, type matching, eligible list, row state, required level, affix count range and hint. | `itemBuilderRules.test.js` |
| `src/itemBuilderOdds.js` | Roll odds: the chance a drop rolls every pick (see "Roll odds"), and its "1 in X" text. | `itemBuilderOdds.test.js` |
| `src/itemBuilderHash.js` | Encode and decode a build. | `itemBuilderHash.test.js` |
| `src/itemBuilderLoad.js` | Fetch once, cache, retry after a failure (like `dropCalcLoad.js`). | — |
| `src/useItemBuilder.js` | Hook called by `App`: model loading, decode, link cleanup, notice (see "State ownership"). | browser check |
| `src/ItemBuilderPanel.jsx` | Rendering and local UI state only (search text). | browser check |

`App.jsx` only gains the extended `useHashTab` call, the `useItemBuilder` call and the panel hookup.

### Source tables

- New: `public/data/standard/MagicPrefix.txt` and `MagicSuffix.txt`, copied from the mod repo.
- Already present: `Weapons.txt`, `Armor.txt`, `Misc.txt`, `ItemTypes.txt` (`public/data/standard/`).
- Read at build time: `public/data/Affixes.json` (display strings, `displayProperties`), `Weapons.json` and
  `Armors.json` (base display names, tiers).
- **Data-update duty:** a data update must copy the two new `.txt` files along with the usual JSON (if it
  doesn't, the row-join check fails the build), run the dev server once, and commit
  `src/itemBuilderVersion.json` if the link version was bumped (if it isn't, the build fails).

### `ItemBuilder.json`

```js
{
  version: 1,        // the file format
  linkVersion: 1,    // from src/itemBuilderVersion.json, see "Link version"
  types: {           // every ItemTypes.txt code
    "orb": {chain: ["orb", "weap", "sorc", "clas"], class: "sor", rare: true},
    ...
  },
  bases: [           // in-scope, spawnable bases
    {code: "obc", name: "Eldritch Orb", group: "Orbs", tier: "Elite", qlvl: 67, magicLvl: 1,
     levelreq: 50, types: ["orb"]},  // type, then type2 when set
    ...
  ],
  affixes: [         // Affixes.json order
    {key: "p352", suffix: false, name: "Lapis", level: 35, maxLevel: null, levelreq: 26, rare: true,
     classSpecific: null, classLevelReq: null, group: 116, frequency: 4,
     itypes: ["weap", "tors", "helm", "boot"], etypes: ["orb"],
     mods: [{code: "res-cold", param: "", min: 21, max: 30}],
     displayProperties: [...]},     // copied from Affixes.json, same shape
    ...
  ]
}
```

(Values in the example are illustrative.)

- **Affix key:** `p<row>` / `s<row>`, the row's 0-based index among the data rows of its raw table (the
  header line excluded; non-spawnable, blank and "Expansion" rows counted, as the game does). That is the
  identity the game stores in item saves, so a mod can't reorder rows without breaking every existing
  item. It is unique and short. `p` and `s` keep the two tables apart. A mod can still *insert* rows
  between seasons, shifting later indexes; the link version (below) keeps old links from silently pointing
  at different affixes.
- **Link version:** `ItemBuilder.json` carries `linkVersion`, an integer, which every link writes as `v`.
  See "Link version".
- **The join:** filter the raw rows to `spawnable = 1` and `frequency > 0`, then pair them with
  `Affixes.json` by position.
- **Bases:** the `Weapons.json` / `Armors.json` entries that are spawnable in the `.txt` and not
  `dontDisplay`, plus a small explicit table for misc bases, because PD2 renames some of them:

  | Code | Name | Code | Name |
  |---|---|---|---|
  | `amu` | Amulet | `cm1` | Small Charm |
  | `rin` | Ring | `cm2` | Large Charm |
  | `jew` | Jewel | `cm3` | Grand Charm |
  | `mjw` | Mythic Jewel | `cm4` | Ornate Charm |
  | `aqv`, `aqv2`, `aqv3` | Arrows | `cqv`, `cqv2`, `cqv3` | Bolts |

  The three quiver tiers share a name; the option label's qlvl (0 / 25 / 45) tells them apart.
- **Base fields:** qlvl (`level`), `levelreq`, `magic lvl`, `type`, `type2` and `spawnable` come from the
  `.txt` tables (the JSON files carry some of them as strings, e.g. `Armors.json` circlet `level: "24"`);
  only the display name and tier come from `Weapons.json` / `Armors.json`.
- **Base `group`:** the optgroup label, from an explicit map in `itemBuilderData.js` keyed by the base's
  primary type code (`orb` → "Orbs", `staf` → "Staves", `lcha` → "Grand Charms", `mcha` → "Large Charms",
  …). Neither `ItemTypes.txt` (which calls `lcha` "Large Charm") nor the JSON gives usable plural labels.
  A spawnable in-scope base whose type has no label fails the build.
- **Loud checks** (the build fails; dev logs and keeps running):
  - the filtered raw rows and `Affixes.json` differ in count, or in name, level or group at any position;
  - a required column is missing from any table;
  - an in-scope base's type is missing from `ItemTypes.txt`, or has no optgroup label.
- **Link-version mismatch** (build only): see "Link version".
- **Warning only:** an affix `itype`/`etype` code that isn't in `ItemTypes.txt` is logged, not fatal (one
  live row uses the item code `amu` as an itype; the game ignores it, and so does the builder).

### Link version

Links name affixes by row index and bases by code, so a data update that inserts affix rows, or removes or
renames a base, would change what an old link means. Such links are refused, not reinterpreted.

- **Fingerprint:** the plugin hashes what links depend on: for each affix, its key, side, name, level and
  group, in order; and the sorted list of in-scope base codes. Stat values are not included: an old link
  stays valid when only an affix's values change, and simply shows the new values.
- **`src/itemBuilderVersion.json`** (committed): `{"version": 1, "fingerprint": "<hex>"}`. Only the plugin
  reads it (with `fs`); the app never imports it, so rewriting it triggers no reload.
- **Dev server:** if the fingerprint differs from the file's, the plugin increments `version`, writes the
  new fingerprint, and logs "item-builder-data: link version bumped to N (commit
  src/itemBuilderVersion.json)". The person updating the data commits the bump with the data.
- **`npm run build`** (and therefore CI and deploy): a fingerprint mismatch fails the build with the same
  instruction. A forgotten bump can't ship.
- The generated `ItemBuilder.json` carries the file's `version` as `linkVersion`.

### The Vite plugin

`item-builder-data`, beside `drop-calc-data` in `vite.config.js` and built the same way: it runs in
`configResolved` (dev and build), again in dev when one of its source files changes (the six `.txt`
files in `public/data/standard/` and the three JSON files in `public/data/`), and is skipped
under Vitest and `vite preview`. It writes only when the content changed. `.gitignore` gains
`public/data/standard/ItemBuilder.json`.

### Rules engine (`src/itemBuilderRules.js`)

- `affixLevel({ilvl, qlvl, magicLvl})` and `craftedItemLevel(clvl, ingredientIlvl)`: the formulas above.
- `CAPS` and `COUNT_HINTS`: the tables above, in one place each.
- `allowedQualities(base, types)`: the "Qualities per base" rules.
- `eligibleAffixes(model, base, quality, alvl)`: rules 1–6 of "Which affixes can roll".
- `rowState(affix, picks, caps)` → `picked` | `group` (with the picked affix that holds the group) |
  `full` | `free`. `group` takes priority over `full`. A side is `full` when its own cap is reached or
  the total is (for crafted items, 4 picks close both sides).
- `requiredLevel(base, picks)`.
- **Control changes:** after a base, quality or level change, picks that no longer qualify are dropped.
  If a cap shrinks (rare → magic), the earliest picks are kept. The notice line says what was removed.
- **Sort:** `compareAffixes(a, b, "attrs", "desc")` from `src/sortCompare.js`, unchanged (the generated
  affixes carry `displayProperties`). Like **Attributes ▼** in the Affixes table: rows cluster by their
  first property's code, largest max first within a cluster.

### UI (`ItemBuilderPanel`)

**Tab:** key `itembuilder`, title "Item Builder", badge "Beta". Desktop: in the More menu, after
"Drop calculator". Mobile: in the sheet's "Tools" group. Added to `TABS`, `TAB_GROUPS` and `moreKeys`.

**Controls row** (only what changes the rules):
- **Base:** the app's `SearchableSelect` (the same control as the Filters bars), options like "Swirling
  Crystal · qlvl 50" under non-selectable group headings. Typing filters it, and a group's name matches all
  of its bases ("bow" lists every Crossbows base too).
- **Quality:** Magic | Rare | Crafted buttons, limited to the base's allowed qualities, hidden when only
  one is allowed.
- **Levels:** ilvl for magic and rare; clvl and ingredient ilvl for crafted. Number inputs, 1–99,
  default 99.

**Item card:**
- Title coloured by quality (magic blue, rare yellow, crafted orange).
- The alvl working ("alvl 86 = ilvl 85 + magic lvl 1", "crafted ilvl 98 → alvl 98"), and a class line
  for class items ("Sorceress only").
- The affix-count hint ("A rare at ilvl 85 always rolls 6 affixes").
- **Slots:** prefix and suffix slots up to the caps. Crafted items show 3 + 3 slots with an "n/4 affixes"
  counter; at 4 the empty slots read "total reached". Each filled slot has ×.
- Required level (with "(Sorceress: 18)"-style notes for the class level requirement rows), and
  "plus the recipe's fixed mods" on crafted items.
- **Copy link** and **Clear**.
- **Below the card** (desktop: same column; phone: in flow before the pinned bar), once something is picked:
  "≈ 1 in 1,300 to roll these affixes" and the caption "Estimate under vanilla D2 roll rules; PD2's exact
  odds aren't public." (see "Roll odds"); "These affixes can't roll together." if the chance is 0.

**List:**
- One merged list of every eligible prefix and suffix, and a search box matching names and stat text.
- Rows: name, stat lines, a Prefix or Suffix tag, Grp, alvl, rlvl. Tap picks or drops. Picked rows get ✓. Rows in state `group`
  or `full` stay visible, greyed, with the reason underneath ("Group taken by Garnet", "Slots full").
  Showing locked group members is deliberate: they're a reference.
- Ineligible rows are hidden.
- Empty list: "No affixes can roll at alvl 3".

**Layout:**
- **Desktop (> 980px):** card on the left, list on the right in its own scroll box (viewport height), so the
  card stays in view.
- **Phone (≤ 980px):** one column, no inner scroll box. A slim bar ("P 2/3 · S 1/3 · Req. lvl 62",
  "↑ card") is `position: sticky` under the tab row (`top: var(--topbar-h)`; sticky works there because
  `.appRoot` is `overflow-x: clip` on mobile), and is shown only while the card is out of view: an
  `IntersectionObserver` on the card sets a `cardVisible` state from its callback (allowed by the lint
  rules, unlike a synchronous `setState` in an effect).
- Mobile rules must be checked against the duplicated 980 / 720 / 480px blocks in `styles.css`.

**Notice line** above the card, for link cleanup and control changes. Cleared by the next user action or a tab change.

**Loading:** "Loading item data…"; a failed fetch shows "Couldn't load the item data" with Retry.

### URL format

`#/itembuilder?v=1&b=obc&q=r&il=85&a=p352-p77-s230`

| Param | Meaning | Default when absent |
|---|---|---|
| `v` | link version (`linkVersion`); always written | treated as an old link |
| `b` | base code | none: the card asks for a base |
| `q` | `m`, `r` or `c` | the base's first allowed quality |
| `il` | ilvl (magic, rare) | 99 |
| `cl`, `gl` | clvl, ingredient ilvl (crafted) | 99 |
| `a` | affix keys in pick order, `-`-separated | none |

- Defaults are left out of written links (`v` is always written). `-` survives chat apps unescaped (commas
  get `%2C`).
- A query with no parameters other than `v` (or an empty one) is a blank form.

**Decoding**, in this order:
0. **Version:** if `v` is missing or isn't the current `linkVersion`, the whole link is refused: the builder
   opens blank, the notice reads "This link was made for older game data and can't be opened", and the
   query is replaced with an empty one.
1. A repeated parameter: the first one wins.
2. A repeated affix key: kept once.
3. Unknown base, disallowed quality, or a level outside 1–99: that control falls back to its default.
4. Affixes are applied in URL order. A key is dropped if it doesn't exist, is not eligible, its group is
   taken, or its side or the total is full. So the earlier affix wins a conflict.
5. If anything was dropped or replaced, the notice says so ("2 affixes from the link no longer fit and were
   removed"), and the URL is replaced with the cleaned build, so a reload doesn't repeat the notice.

**`src/hashTab.js` changes:**
- **Only listed tabs take a query.** `useHashTab(validKeys, fallback, queryTabs)` gains a third argument, a
  stable module-level array (`["itembuilder"]`). The parser accepts `#/<key>?<query>` only when `<key>` is
  in `queryTabs`; any other `?…` stays malformed, exactly as today (`#/affixes?x=1` still normalises,
  and its existing test keeps passing).
- **The query lives in the hook.** `useHashTab` returns `[tab, setTab, query, setQuery]`. The query is the
  current build's query string, kept in hook state, and survives switching tabs. That matters because the
  panel remounts on every tab switch (each tab renders a different component; `ErrorBoundary` takes
  `resetKey={tab}`).
- **Writing:** the layout effect writes `#/<tab>` plus `?<query>` when the tab is in `queryTabs` and the
  query is non-empty. `hashWriteAction` compares the parsed tab, not the whole string (today it would see
  `#/itembuilder?…` ≠ `#/itembuilder` and wipe the build): **push** when the tab changes, **replace** when
  only the query changes, so picks don't flood the Back history.
- **`popstate`:** the query is re-read only when the popped hash names a tab in `queryTabs`. Going Back to
  `#/weapons` leaves the build alone, so returning to the Item Builder tab shows it again.

**State ownership:**
- **The query string is the single source of truth**, held by `useHashTab` in `App`.
- **`useItemBuilder({tab, query, setQuery})`**, a hook in `src/useItemBuilder.js` called by `App`:
  - starts loading `ItemBuilder.json` the first time the tab is the Item Builder (the model arrives through
    a promise callback, which may set state);
  - once the model is loaded, decodes the query during render, and returns `{status, model, build,
    notice, setBuild, retry}`;
  - **link cleanup:** when the decoded build's encoding differs from the query, it calls `setQuery(clean)`
    and stores the notice, during render. That is legal because the hook's state and `useHashTab`'s are
    both `App`'s own state (the same rule as `App`'s `prevTab` adjustment); it converges because a clean
    query decodes to itself. No `setState` in an effect, no panel-to-parent update during render.
  - `setBuild(next)` (picks, removals, control changes) encodes `next`, calls `setQuery`, and replaces the
    notice with the control-change notice or clears it. The notice also clears when the tab changes.
- **`ItemBuilderPanel`** receives those values as props and keeps only local UI state (search
  text, `cardVisible`).

**Copy link** copies `location.href`; if the clipboard API is unavailable, it shows the URL in a read-only,
pre-selected field.

## Follow-up: stat summing

Wanted: sum picked affixes whose properties hit the same stat, to show the item's totals. Affix
properties only; not how they change the base (requirements, attack speed). Its own spec, because:

- Each affix row has up to 3 mods (property code, param, min, max). `Properties.txt` (in the mod repo)
  expands each into stats through 17 different functions: `res-all` becomes four resist stats, `dmg%`
  becomes min and max damage, and so on.
- 44 equipment stats can come from more than one affix group, so totals really do stack: resists (all
  resists plus a single resist), dexterity and energy (all attributes plus the single stat), FCR, IAS,
  MF, crushing blow and more.
- The text for a total comes from `ItemStatCost.txt`'s description strings, which live only in a binary
  `patchstring.tbl`; the base PD2 strings aren't in the repo at all. The follow-up has to choose between
  a hand-written label map and templates derived from `Affixes.json`'s existing display strings.
- `Properties.txt` has 3 codes the affix tables use but it doesn't define (`map-mon-dropweapons`,
  `map-mon-droparmor`, `Deep-Wounds`), all outside this spec's scope.

This design keeps `mods` on every affix in `ItemBuilder.json`, so the follow-up adds a module and a card
section without reworking the data.

## Testing and verification

### Unit tests (Vitest, beside each module)

- **`itemBuilderRules.test.js`**
  - alvl: the qlvl raise, `magic lvl` bases (orb, Diadem), both sides of the `99 − ⌊qlvl/2⌋` boundary,
    the 1–99 clamps.
  - Crafted ilvl, including the Arreat Summit example: Berserker Axe (qlvl 86), clvl 78, ingredient ilvl 85
    → crafted ilvl 81, raised to 86, alvl 73.
  - Filters: type chains through `type2`; exclusion beats inclusion; class rule (amulet takes any class,
    orb only Sorceress, using a fixture whose item types match the orb so only the class rule can block
    it); magic-only rows hidden on rare and crafted.
  - Allowed qualities: charms magic only, jewels not craftable, circlets craftable.
  - Row state: a group locking across sides, crafted total of 4 closing both sides, `group` over `full`.
  - Control changes: dropped picks and shrinking caps keep the earliest picks.
- **`itemBuilderData.test.js`**
  - Fixture tables: keys with non-spawnable and blank rows interspersed; each loud check fails as
    described; the unknown-type warning; misc display names and optgroup labels.
  - Link version: the fingerprint ignores stat values but changes when a row is inserted or a base code
    removed; the dev path bumps and rewrites the version file, the build path fails on a mismatch.
  - Smoke test on the real files, asserting on specific keys (row numbers as of the spec's data):
    1,412 affixes; the level-35 *Lapis* `p352` (`etype1 = orb`) eligible on a staff, hidden on an orb,
    while the level-12 *Lapis* `p351` is eligible on an orb; the Barbarian *Expert's* `p481` (itypes
    `phlm`, `weap`) eligible on an axe, hidden on an orb by the class rule alone.
- **`itemBuilderHash.test.js`**: round trips; defaults left out; first duplicate parameter wins; duplicate
  affixes collapse; invalid keys dropped; URL order decides conflicts; control fallbacks; a missing or
  old `v` refuses the whole link; a cleaned query decodes to itself.
- **`hashTab.test.js`**: a query is accepted only for `queryTabs` (`#/affixes?x=1` still malformed); the
  query survives the tab write; push when the tab changes, replace when only the query does.

### Browser check: `tools/checks/check-itembuilder.mjs`

Run against a dev server, desktop then a 390×844 phone (desktop hover checks first):
- the tab loads; base, quality and affixes can be picked;
- a group locks with its reason; a side fills; crafted shows clvl / ingredient ilvl and the total of 4;
- a reload restores the build from the URL; Back to another tab and then clicking Item Builder keeps the
  build; Back/Forward between tabs keeps it;
- a doctored link shows the notice and the URL gets cleaned; a link with `v=0` opens blank with the
  old-data notice;
- phone: the pinned bar appears once the card scrolls away; no horizontal overflow.

### Regression gates

- `compare-desktop.mjs` before and after, diffed with `diff-shots.mjs`: every existing tab identical. Take
  the "before" shots on `main` before `tools/checks/cdp.mjs` gains `itembuilder`, and diff only the tabs
  both sets have (check that `diff-shots.mjs` skips a tab missing from one set rather than failing).
- `npm run lint` at 0 problems; `npm test` green, including the Drop calculator golden snapshot;
  `npm run build` succeeds.

## Documentation

`CLAUDE.md`: the new modules, the plugin, the two new `.txt` files, the data-update duty (copy the tables;
commit a link-version bump if the dev server made one), the tab, and the hash query format. `.gitignore`: the generated `ItemBuilder.json`.
