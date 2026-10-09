# Item Builder — design

**Date:** 2026-10-09
**Branch:** to be created from `main` when implementation starts (manual worktree, `.worktrees/<name>`, suggested name `item-builder`)
**Status:** design approved section by section in brainstorming (2026-10-09); written spec awaiting review

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
ItemBuilderPanel ── src/itemBuilderRules.js (alvl, filters, caps, row state, required level)
        │        └─ src/itemBuilderHash.js (build ↔ URL query)
        ▼
App: builder query string ⇄ location.hash via src/hashTab.js
```

| Module | Role | Tests |
|---|---|---|
| `src/itemBuilderData.js` | Column lists, `.txt` + JSON → `ItemBuilder.json`, the join and the loud checks. Node-safe: `vite.config.js` imports it. | `itemBuilderData.test.js` |
| `src/itemBuilderRules.js` | alvl, crafted ilvl, caps tables, type matching, eligible list, row state, required level, count hint. | `itemBuilderRules.test.js` |
| `src/itemBuilderHash.js` | Encode and decode a build. | `itemBuilderHash.test.js` |
| `src/itemBuilderLoad.js` | Fetch once, cache, retry after a failure (like `dropCalcLoad.js`). | — |
| `src/ItemBuilderPanel.jsx` | UI state only. | browser check |

`App.jsx` only gains the panel hookup and the builder query state; nothing else grows it.

### Source tables

- New: `public/data/standard/MagicPrefix.txt` and `MagicSuffix.txt`, copied from the mod repo.
- Already present: `Weapons.txt`, `Armor.txt`, `Misc.txt`, `ItemTypes.txt` (`public/data/standard/`).
- Read at build time: `public/data/Affixes.json` (display strings, `displayProperties`), `Weapons.json` and
  `Armors.json` (base display names, tiers).
- **Data-update duty:** a data update must copy the two new `.txt` files along with the usual JSON. If it
  doesn't, the row-join check fails the build.

### `ItemBuilder.json`

```js
{
  version: 1,
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
    {key: "p412", suffix: false, name: "Lapis", level: 35, maxLevel: null, levelreq: 26, rare: true,
     classSpecific: null, classLevelReq: null, group: 116, frequency: 4,
     itypes: ["weap", "tors", "helm", "boot"], etypes: ["orb"],
     mods: [{code: "res-cold", param: "", min: 21, max: 30}],
     displayProperties: [...]},     // copied from Affixes.json, same shape
    ...
  ]
}
```

(Values in the example are illustrative.)

- **Affix key:** `p<row>` / `s<row>`, the row's index in its raw table, counting non-spawnable and blank
  rows as the game does. That is the identity the game stores in item saves, so a mod can't reorder rows
  without breaking every existing item. It is unique, stable and short. `p` and `s` keep the two tables apart.
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
- **Base `group`:** the optgroup label (Orbs, Staves, Circlets, Rings, Grand Charms, …), from the base's
  primary type.
- **Loud checks** (the build fails; dev logs and keeps running):
  - the filtered raw rows and `Affixes.json` differ in count, or in name, level or group at any position;
  - a required column is missing from any table;
  - an in-scope base's type is missing from `ItemTypes.txt`.

### The Vite plugin

`item-builder-data`, beside `drop-calc-data` in `vite.config.js` and built the same way: it runs in
`configResolved` (dev and build), again in dev when one of its source files changes, and is skipped
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
- **Base:** one native `<select>` with `<optgroup>`s, options like "Swirling Crystal · qlvl 50". Phones get
  the system picker.
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

**List:**
- Prefixes / Suffixes switch with counts ("Prefixes 2/3"), and a search box matching names and stat text.
- Rows: name, stat lines, Grp, alvl, rlvl. Tap picks or drops. Picked rows get ✓. Rows in state `group`
  or `full` stay visible, greyed, with the reason underneath ("Group taken by Garnet", "Slots full").
  Showing locked group members is deliberate: they're a reference.
- Ineligible rows are hidden.
- Empty side: "No prefixes can roll at alvl 3".

**Layout:**
- **Desktop (> 980px):** card on the left, list on the right in its own scroll box (viewport height), so the
  card stays in view.
- **Phone (≤ 980px):** one column, no inner scroll box. A slim bar pins under the tab row once the card
  scrolls away ("P 2/3 · S 1/3 · Req. lvl 62", "↑ card"), with `top: var(--topbar-h)`. Sticky works there
  because `.appRoot` is `overflow-x: clip` on mobile.
- Mobile rules must be checked against the duplicated 980 / 720 / 480px blocks in `styles.css`.

**Notice line** above the card, for link cleanup and control changes. Cleared by the next user action.

**Loading:** "Loading item data…"; a failed fetch shows "Couldn't load the item data" with Retry.

### URL format

`#/itembuilder?b=obc&q=r&il=85&a=p412-p77-s230`

| Param | Meaning | Default when absent |
|---|---|---|
| `b` | base code | none: the card asks for a base |
| `q` | `m`, `r` or `c` | the base's first allowed quality |
| `il` | ilvl (magic, rare) | 99 |
| `cl`, `gl` | clvl, ingredient ilvl (crafted) | 99 |
| `a` | affix keys in pick order, `-`-separated | none |

- Defaults are left out of written links. `-` survives chat apps unescaped (commas get `%2C`).
- No version field; a future format adds `v=2`, and a link without `v` is version 1.

**Decoding**, in this order:
1. A repeated parameter: the first one wins.
2. A repeated affix key: kept once.
3. Unknown base, disallowed quality, or a level outside 1–99: that control falls back to its default.
4. Affixes are applied in URL order. A key is dropped if it doesn't exist, is not eligible, its group is
   taken, or its side or the total is full. So the earlier affix wins a conflict.
5. If anything was dropped or replaced, the notice says so ("2 affixes from the link no longer fit and were
   removed"), and the URL is replaced with the cleaned build, so a reload doesn't repeat the notice.

**`src/hashTab.js` changes:**
- `parseTabFromHash` accepts an optional `?…` after the key, and a parser returns the query too.
- `hashWriteAction` compares the parsed tab, not the whole string (today it would see
  `#/itembuilder?…` ≠ `#/itembuilder` and wipe the build). **Push** when the tab changes, **replace**
  when only the query changes, so picks don't flood the Back history.
- On `popstate`, the query is read back too.

**State ownership:**
- `App` holds the builder's query string (as it holds `affixSort`). It is read from the hash at load and on
  `popstate`, and written by the hash layout effect together with the tab. The query survives switching
  tabs, which matters because the panel remounts on every tab switch (its `ErrorBoundary` is keyed by tab).
- **The query string is the single source of truth.** The panel decodes it against the loaded data during
  render; every pick, removal or control change encodes a new query and hands it to `App`.
- **Link cleanup** happens during render with the `prevX` pattern (`App`'s `prevTab`), never with
  `setState` in an effect, to satisfy the React Compiler lint rules.

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
    orb only Sorceress); magic-only rows hidden on rare and crafted.
  - Allowed qualities: charms magic only, jewels not craftable, circlets craftable.
  - Row state: a group locking across sides, crafted total of 4 closing both sides, `group` over `full`.
  - Control changes: dropped picks and shrinking caps keep the earliest picks.
- **`itemBuilderData.test.js`**
  - Fixture tables: keys with non-spawnable and blank rows interspersed; each loud check fails as
    described; misc display names.
  - Smoke test on the real files: 1,412 affixes; *Lapis* eligible on a staff, not on an orb; *Burning*
    eligible on an orb, not on a Druid pelt.
- **`itemBuilderHash.test.js`**: round trips; defaults left out; first duplicate parameter wins; duplicate
  affixes collapse; invalid keys dropped; URL order decides conflicts; control fallbacks.
- **`hashTab.test.js`**: the query survives the tab write; push vs replace; a query on an unknown tab
  normalises as before.

### Browser check: `tools/checks/check-itembuilder.mjs`

Run against a dev server, desktop then a 390×844 phone (desktop hover checks first):
- the tab loads; base, quality and affixes can be picked;
- a group locks with its reason; a side fills; crafted shows clvl / ingredient ilvl and the total of 4;
- a reload restores the build from the URL; Back/Forward between tabs keeps it;
- a doctored link shows the notice and the URL gets cleaned;
- phone: the pinned bar appears once the card scrolls away; no horizontal overflow.

### Regression gates

- `compare-desktop.mjs` before and after, diffed with `diff-shots.mjs`: every existing tab identical. The
  tab list in `tools/checks/cdp.mjs` gains `itembuilder`.
- `npm run lint` at 0 problems; `npm test` green, including the Drop calculator golden snapshot;
  `npm run build` succeeds.

## Documentation

`CLAUDE.md`: the new modules, the plugin, the two new `.txt` files, the data-update duty, the tab, and the
hash query format. `.gitignore`: the generated `ItemBuilder.json`.
