import React, {useEffect, useEffectEvent, useMemo, useState} from "react";
import {useIsMobile} from "./useIsMobile.js";
import ErrorBoundary from "./ErrorBoundary.jsx";
import PagerButtons from "./PagerButtons.jsx";
import StickyHeadTable from "./StickyHeadTable.jsx";
import AffixSortBar from "./AffixSortBar.jsx";
import {MobileTabsBar, TabsBar, TabTitle} from "./tabs.jsx";
import {VALID_TAB_KEYS} from "./tabList.js";
import {usePager} from "./pager.js";
import {calculateDrops} from "./dropCalcEngine.js";
import {loadModel} from "./dropCalcLoad.js";
import {sortTiers} from "./tiers.js";

import SwordIcon from "./icons/sword.svg";
import StaffIcon from "./icons/staff.svg";
import BowIcon from "./icons/bow.svg";
import JavelinIcon from "./icons/javelin.svg";
import SpearIcon from "./icons/spear.svg";
import AxeIcon from "./icons/axe.svg";
import MaceIcon from "./icons/mace.svg";
import KnifeIcon from "./icons/knife.svg";
import CrossbowIcon from "./icons/crossbow.svg";
import ClawsIcon from "./icons/claws.svg";
import PolearmIcon from "./icons/polearm.svg";
import ScepterIcon from "./icons/scepter.svg";
import WandIcon from "./icons/wand.svg";
import ThrowingAxeIcon from "./icons/throwing-axe.svg";
import ThrowingKnifeIcon from "./icons/throwing-knife.svg";
import SorceressOrbIcon from "./icons/orb.svg";
import HammerIcon from "./icons/hammer.svg";
import ScytheIcon from "./icons/scythe.svg";
import HelmetIcon from "./icons/helmet.svg";
import BodyArmorIcon from "./icons/armor.svg";
import ShieldIcon from "./icons/shield.svg";
import BootsIcon from "./icons/boots.svg";
import GlovesIcon from "./icons/gloves.svg";
import BeltIcon from "./icons/belt.svg";
import RingIcon from "./icons/ring.svg";
import AmuletIcon from "./icons/amulet.svg";
import QuiverIcon from "./icons/quiver.svg";
import JewelIcon from "./icons/jewel.svg";
import MapIcon from "./icons/map.svg";
import MythicJewelIcon from "./icons/mythic.svg";
import OrnateCharmIcon from "./icons/cm4.svg";
import RuneIcon from "./icons/rune.svg";
import SacredIcon from "./icons/sacred.svg";
import FateCardIcon from "./icons/fatecard.svg";
import {AFFIX_SORT_LABELS, clickSort, compareAffixesBy, effectiveSort, parseStoredFlag, parseStoredSort} from "./sortCompare.js";
import {useHashTab} from "./hashTab.js";

const APP_VERSION = import.meta.env.VITE_APP_VERSION;
const GAME_VERSION = "13.0.2";
const LATEST_RELEASE = "https://github.com/Lukaszpg/PD2-Sanctuary-of-Exile/releases/tag/v13.0.2";

const HIDDEN_MODIFIERS = [
    "One Ring to bring them all and in the darkness bind them",
];

const ALL_RUNES = ["El", "Eld", "Tir", "Nef", "Eth", "Ith", "Tal", "Ral", "Ort", "Thul", "Amn", "Sol", "Shael", "Dol", "Hel", "Io", "Lum", "Ko", "Fal", "Lem", "Pul", "Um", "Mal", "Ist", "Gul", "Vex", "Ohm", "Lo", "Sur", "Ber", "Jah", "Cham", "Zod"];

const PROP_HIGHLIGHT_RULES = [{test: /corrupted/i, className: "propRed"},];

const WEAPON_ICON_MAP = {
    sword: SwordIcon,
    staff: StaffIcon,
    bow: BowIcon,
    javelin: JavelinIcon,
    spear: SpearIcon,
    axe: AxeIcon,
    mace: MaceIcon,
    knife: KnifeIcon,
    crossbow: CrossbowIcon,
    claws: ClawsIcon,
    polearm: PolearmIcon,
    scepter: ScepterIcon,
    wand: WandIcon,
    throwingAxe: ThrowingAxeIcon,
    throwingKnife: ThrowingKnifeIcon,
    orb: SorceressOrbIcon,
    hammer: HammerIcon,
    scythe: ScytheIcon,
    quiver: QuiverIcon
};

const ARMOR_ICON_MAP = {
    helm: HelmetIcon,
    pahm: HelmetIcon,
    phlm: HelmetIcon,
    pelt: HelmetIcon,
    circ: HelmetIcon,
    tors: BodyArmorIcon,
    shie: ShieldIcon,
    boot: BootsIcon,
    glov: GlovesIcon,
    belt: BeltIcon,
    bels: BeltIcon,
    ashd: ShieldIcon,
    head: ShieldIcon
};

const JEWELRY_ICON_MAP = {
    rin: RingIcon,
    amu: AmuletIcon,
    ram: AmuletIcon,
    aqv: QuiverIcon,
    aqv2: QuiverIcon,
    aqv3: QuiverIcon,
    cqv: QuiverIcon,
    cqv2: QuiverIcon,
    cqv3: QuiverIcon,
    jew: JewelIcon,
    t51: MapIcon,
    t52: MapIcon,
    t53: MapIcon,
    t54: MapIcon,
    t55: MapIcon,
    t56: MapIcon,
    mjw: MythicJewelIcon,
    cm4: OrnateCharmIcon,
    cm2: OrnateCharmIcon,
    cm3: OrnateCharmIcon,
    cm1: OrnateCharmIcon,
};

const MOD_EXPANSIONS = [{
    whenIncludes: "all resistances",
    implies: ["fire resistance", "cold resistance", "lightning resistance", "poison resistance",],
},

    {
        whenIncludes: "all attributes", implies: ["strength", "dexterity", "vitality", "energy"],
    }];

const ARMOR_TYPE_MAP = {
    helm: "Helm",
    tors: "Armor",
    shie: "Shield",
    glov: "Gloves",
    boot: "Boots",
    belt: "Belt",
    bels: "Belt",
    pelt: "Druid Pelt",
    phlm: "Barbarian Helm",
    ashd: "Paladin Shield",
    head: "Necromancer Head",
    circ: "Circlet",
    pahm: "Paladin Helmet"
};

const TOOLTIPS_TEXT_MAP = {
    "qualityLevel": "Quality level is a stat that determines to which treasure class the item belongs. It's important for gambling (higher quality level means lower chance to upgrade the item tier) and unique item drop generation, as items with higher quality level tend to drop less.",
    "runes": "Runes here are shown in the exact order you should put them in your item to create a runeword.",
    "occurrenceChance": "Occurrence chance is chance for this item to drop when the game rolls an unique item on base and base has more than one unique item attached to it.",
    "dropRate": "Drop rate is chance for this item to drop from specific monster, most likely from Uber Boss.",
    "code": "This code can be used in your loot filter to highlight this specific base.",
    "uniCode": "This code can be used in your loot filter to highlight this specific base - remember to add UNI modifier.",
    "sacred": "Additionally to items mentioned here it is required to use Sacred Orb in the Cube.",
    "mythicDivineOrb": "In Sanctuary of Exile unique items can be created in the Cube by using base and an currency orb appropriate for item tier - Mythic Orb for normal and exceptional bases and Divine Orb for elite bases.",
    "affixMaxLevel": "Max level: If the item level is high enough, then some affixes will not be eligible to roll on it, making it more likely for better affixes to appear on the item.",
    "affixFrequency": "Frequency: Frequency parameter determines how often will you roll this modifier on an item.",
    "affixRares": "If true, then this modifier can occur on rare items.",
    "affixLevel": "Affix level: Determines minimum item level of the item for this affix to show.",
    "affixGroup": "Group: Affixes that share a group can't roll together on the same item.",
    "affixRequiredLevel": "Required level: Minimum character level needed to use an item with this affix."
};

const INFO_BY_TAB = {
    sacreds: {
        title: "About Sacred Items",
        text: "Sacred items system is exclusive to Sanctuary of Exile. It allows to harness the power of a runeword and imprint it to `Unique` or `Crafted` item:\n\n" + "- Making an item sacred requires finding `Sacred Orb` which drops in `T4 Dungeons` or from monsters added by `Terror of Opulence`\n\n" + "- To sacred an item, first use `Sacred Orb` with `Runes` (or additional items - consult appropriate recipe in the list below) used to create a runeword to create `Sacred Orb of X`\n\n" + "- Runes have to be in stacked form, each with the quantity presented in the Sacred tooltip on this page\n\n" + "- Use the created orb with `Unique` or `Crafted` item you wish to make sacred. Please note that added modifiers may vary by item type\n\n" + "- Sacred items can be corrupted with `World Stone Shard`\n\n" + "- Sacred modifiers along with sacred status can be removed from `Unique` items by using `Demonic Cube` as long as it's **not** `Corrupted`\n\n" + "- Sacred modifiers along with sacred status **CANNOT** be removed from `Crafted` items, so choose wisely!\n\n" + "- The additional equipment component mentioned in the recipe can be of any quality and tier"
    },
};

function visibleProperties(properties) {
    return (properties || []).filter((prop) => {
        const text = String(prop);

        return !HIDDEN_MODIFIERS.some((hidden) =>
            text.includes(hidden)
        );
    });
}

function sacredTypes(it) {
    const a = Array.isArray(it?.itemTypesDisplayNames) ? it.itemTypesDisplayNames : [];
    return a.map((x) => n(x)).filter(Boolean);
}

function sacredIngredients(it) {
    const out = [];

    repeatIngredient(it?.firstInputDisplayName, it?.firstInputQuantity).forEach(v => out.push(v));
    repeatIngredient(it?.secondInputDisplayName, it?.secondInputQuantity).forEach(v => out.push(v));
    repeatIngredient(it?.thirdInputDisplayName, it?.thirdInputQuantity).forEach(v => out.push(v));
    repeatIngredient(it?.fourthInputDisplayName, it?.fourthInputQuantity).forEach(v => out.push(v));
    repeatIngredient(it?.fifthInputDisplayName, it?.fifthInputQuantity).forEach(v => out.push(v));
    repeatIngredient(it?.sixthInputDisplayName, it?.sixthInputQuantity).forEach(v => out.push(v));

    return out;
}

// ---- tiny helpers ----
const n = (v) => (v === null || v === undefined ? "" : String(v).trim());
const has = (v) => n(v) !== "";
const nz = (v) => has(v) && n(v) !== "0";
const fmtSigned = (v) => {
    if (!has(v)) return "";
    const x = Number(v);
    if (Number.isNaN(x)) return String(v);
    return (x > 0 ? "+" : "") + x;
};

function runewordRuneCount(rw) {
    return [rw?.firstRuneDisplayName, rw?.secondRuneDisplayName, rw?.thirdRuneDisplayName, rw?.fourthRuneDisplayName, rw?.fifthRuneDisplayName, rw?.sixthRuneDisplayName,].filter((x) => n(x)).length;
}

function runewordRunes(rw) {
    return [rw?.firstRuneDisplayName, rw?.secondRuneDisplayName, rw?.thirdRuneDisplayName, rw?.fourthRuneDisplayName, rw?.fifthRuneDisplayName, rw?.sixthRuneDisplayName,]
        .map((x) => n(x))
        .filter(Boolean);
}

// ----- Affix helpers -----

function affixDisplayString(affix) {
    const dp = affix?.displayProperties;
    if (!dp) return "";

    // If it's an array
    if (Array.isArray(dp)) {
        // Array of objects: use displayString
        if (dp.length && typeof dp[0] === "object") {
            return dp
                .map((p) => p && p.displayString)
                .filter(Boolean)
                .join(" / ");
        }
        // Array of strings (old format) – keep supporting it
        return dp.filter(Boolean).join(" / ");
    }

    // Single object
    if (typeof dp === "object") {
        return dp.displayString || "";
    }

    // Fallback – if someone ever makes it a raw string
    return String(dp);
}

function repeatIngredient(name, qtyRaw) {
    const nameStr = n(name);
    if (!nameStr) return [];

    const qty = Number(qtyRaw);
    // quantity 0 or invalid → show once (for things like "Armor", "Any Shield")
    if (!Number.isFinite(qty) || qty <= 1) {
        return [nameStr];
    }

    return Array.from({length: qty}, () => nameStr);
}

function isHighlightedItem(u) {
    return u?.highlight === true;
}

function isUberUnique(u) {
    const src = u?.dropSource;
    return src !== null && src !== undefined && String(src).trim() !== "";
}

function isHellforged(u) {
    return u?.hellforged;
}

function getItemIconUrl(tab, item) {
    if (tab === "weapons") {
        const key = weaponIconKeyForItem(item);
        return key ? WEAPON_ICON_MAP[key] : null;
    }

    if (tab === "armors") {
        const key = armorIconKeyForItem(item);
        return key ? ARMOR_ICON_MAP[key] : null;
    }

    if (tab === "uniques") {
        return getUniqueBaseIconUrl(item);
    }

    if (tab === "runewords") {
        return RuneIcon;
    }

    if (tab === "sacreds") {
        return SacredIcon;
    }

    if (tab === "fatecards") {
        return FateCardIcon;
    }

    return null;
}

function getUniqueBaseIconUrl(u) {
    if (u?.jeweleryBase?.code) {
        const code = String(u.jeweleryBase.code).toLowerCase();
        if (JEWELRY_ICON_MAP[code]) {
            return JEWELRY_ICON_MAP[code];
        }
    }

    if (u?.armorBase) {
        const armorBase = u.armorBase;
        const key = armorIconKeyForItem(armorBase);
        if (key) {
            return ARMOR_ICON_MAP[key];
        }

    }

    if (u?.weaponBase) {
        const weaponBase = u.weaponBase;
        const key = weaponIconKeyForItem(weaponBase);
        if (key) {
            return WEAPON_ICON_MAP[key];
        }
    }

    return null;
}

function armorIconKeyForItem(a) {
    const t = n(a?.itemType?.code) || n(a?.displayType) || ARMOR_TYPE_MAP[n(a?.type)] || n(a?.type);

    return t.toLowerCase();
}

function weaponIconKeyForItem(it) {
    const type = n(it?.itemType?.itemType || it?.itemType).toLowerCase();

    if (type.includes("scythe")) return "scythe";
    if (type.includes("hammer")) return "hammer";
    if (type.includes("orb")) return "orb";
    if (type.includes("throwing knife")) return "throwingKnife";
    if (type.includes("throwing axe")) return "throwingAxe";
    if (type.includes("sword")) return "sword";
    if (type.includes("staff")) return "staff";
    if (type.includes("bow")) return "bow";
    if (type.includes("javelin")) return "javelin";
    if (type.includes("spear")) return "spear";
    if (type.includes("axe")) return "axe";
    if (type.includes("club") || type.includes("mace") || type.includes("hammer")) return "mace";
    if (type.includes("knife")) return "knife";
    if (type.includes("crossbow")) return "crossbow";
    if (type.includes("claws")) return "claws";
    if (type.includes("scythe") || type.includes("polearm")) return "polearm";
    if (type.includes("scepter")) return "scepter";
    if (type.includes("wand")) return "wand";

    return null;
}

function sacredPropertiesText(s) {
    const map = s?.propertiesByItemType && typeof s.propertiesByItemType === "object" ? s.propertiesByItemType : {};

    const lines = [];
    for (const key of Object.keys(map)) {
        const arr = Array.isArray(map[key]) ? map[key] : [];
        for (const v of arr) {
            if (v != null && String(v).trim() !== "") lines.push(String(v));
        }
    }
    return lines.join("\n");
}


function renderInlineMarkdown(text, onLink) {
    const s = String(text ?? "");

    const parts = s.split(/(`[^`]*`)/g);

    // helper: split a plain string into text + link pieces
    function renderWithLinks(str, keyPrefix) {
        const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
        const out = [];
        let last = 0;
        let m;
        let idx = 0;

        while ((m = linkRe.exec(str)) !== null) {
            if (m.index > last) {
                out.push(<React.Fragment key={`${keyPrefix}-t-${idx}`}>
                    {str.slice(last, m.index)}
                </React.Fragment>);
            }

            const label = m[1];
            const href = m[2];

            if (href.startsWith("app:") && typeof onLink === "function") {
                const payload = href.slice(4); // remove "app:"
                const [tabRaw, ...rest] = payload.split(":");
                const tab = (tabRaw || "").toLowerCase();
                const name = decodeURIComponent(rest.join(":")).trim();

                out.push(<button
                    key={`${keyPrefix}-app-${idx}`}
                    type="button"
                    className="mdLink mdLinkInternal"
                    onClick={() => onLink({tab, name})}
                >
                    {label}
                </button>);
            } else {
                out.push(<a
                    key={`${keyPrefix}-ext-${idx}`}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="mdLink"
                >
                    {label}
                </a>);
            }

            last = linkRe.lastIndex;
            idx += 1;
        }

        if (last < str.length) {
            out.push(<React.Fragment key={`${keyPrefix}-tail`}>
                {str.slice(last)}
            </React.Fragment>);
        }

        return out;
    }

    return parts.map((part, idx) => {
        if (part.startsWith("`") && part.endsWith("`")) {
            return (<code key={idx} className="mdCode">
                {part.slice(1, -1)}
            </code>);
        }

        const boldSplit = part.split(/(\*\*[^*]+\*\*)/g);
        return boldSplit.map((b, j) => {
            if (b.startsWith("**") && b.endsWith("**")) {
                return (<strong key={`${idx}-${j}`} className="mdStrong">
                    {b.slice(2, -2)}
                </strong>);
            }

            const italicSplit = b.split(/(\*[^*]+\*)/g);
            return italicSplit.map((it, k) => {
                if (it.startsWith("*") && it.endsWith("*")) {
                    return (<em key={`${idx}-${j}-${k}`} className="mdEm">
                        {it.slice(1, -1)}
                    </em>);
                }

                // this is the plain text segment: run link parsing here
                return (<React.Fragment key={`${idx}-${j}-${k}`}>
                    {renderWithLinks(it, `${idx}-${j}-${k}`)}
                </React.Fragment>);
            });
        });
    });
}

function Markdown({text, onLink}) {
    const src = Array.isArray(text) ? text.join("\n") : text;
    const raw = String(src ?? "").replace(/\r\n/g, "\n");
    const lines = raw.split("\n");

    const blocks = [];
    let buf = [];

    const flushParagraph = () => {
        if (!buf.length) return;
        const joined = buf.join(" ").trim();
        if (joined) blocks.push({type: "p", text: joined});
        buf = [];
    };

    // listBuf now stores objects: { text, children: [] }
    let listBuf = [];
    const flushList = () => {
        if (!listBuf.length) return;
        blocks.push({type: "ul", items: listBuf});
        listBuf = [];
    };

    for (const line of lines) {
        const t = line.trimEnd();

        if (!t.trim()) {
            flushList();
            flushParagraph();
            continue;
        }

        // capture indent + bullet
        const bullet = t.match(/^(\s*)[-*]\s+(.+)$/);
        if (bullet) {
            const indent = bullet[1].length; // number of leading spaces
            const content = bullet[2].trim();

            flushParagraph();

            // top-level bullet: no indent
            if (indent === 0) {
                listBuf.push({text: content, children: []});
            } else {
                // second-level bullet: attach to last top-level item
                const parent = listBuf[listBuf.length - 1];
                if (parent) {
                    if (!parent.children) parent.children = [];
                    parent.children.push(content);
                } else {
                    // if somehow no parent exists, fall back to top-level
                    listBuf.push({text: content, children: []});
                }
            }
            continue;
        }

        flushList();
        buf.push(t.trim());
    }

    flushList();
    flushParagraph();

    return (<div className="md">
        {blocks.map((b, i) => {
            if (b.type === "ul") {
                return (<ul key={i} className="mdUl">
                    {b.items.map((item, j) => (<li key={j} className="mdLi">
                        {renderInlineMarkdown(item.text, onLink)}
                        {item.children && item.children.length > 0 && (<ul className="mdUl mdUlNested">
                            {item.children.map((child, k) => (<li key={k} className="mdLi mdLiNested">
                                {renderInlineMarkdown(child, onLink)}
                            </li>))}
                        </ul>)}
                    </li>))}
                </ul>);
            }
            return (<p key={i} className="mdP">
                {renderInlineMarkdown(b.text, onLink)}
            </p>);
        })}
    </div>);
}


function classForPropertyLine(line) {
    const s = String(line || "");
    for (const rule of PROP_HIGHLIGHT_RULES) {
        if (rule?.test?.test(s)) return rule.className;
    }
    return "";
}

function parseSearchQuery(input) {
    const text = input.trim().toLowerCase();
    if (!text) return {phrases: [], terms: []};

    const phrases = [];
    const phraseRegex = /"([^"]+)"/g;

    let rest = text;
    let m;

    while ((m = phraseRegex.exec(text)) !== null) {
        phrases.push(m[1]);
        rest = rest.replace(m[0], " ");
    }

    const terms = rest
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

    return {phrases, terms};
}

function isDontDisplay(it) {
    const v = it ? it.dontDisplay : false;
    return (v === true || v === 1 || v === "1" || (typeof v === "string" && v.toLowerCase() === "true"));
}

function Tip({text, children}) {
    const [open, setOpen] = React.useState(false);
    const wrapRef = React.useRef(null);

    // Touch screens show the bubble on tap (CSS keys off .open under hover: none). Any tap outside
    // closes it, so only one bubble is open at a time. In a sortable header, one tap also sorts.
    React.useEffect(() => {
        if (!open) return;

        function onPointerDown(e) {
            if (!wrapRef.current?.contains(e.target)) setOpen(false);
        }

        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [open]);

    if (!text) return children;

    const parts = String(text).split("\n");

    return (<span ref={wrapRef} className={"tipWrap" + (open ? " open" : "")} onClick={() => setOpen((o) => !o)}>
      {children}
        <span className="tipBubble" role="tooltip">
        {parts.map((line, i) => (<React.Fragment key={i}>
            {line}
            {i < parts.length - 1 ? <br/> : null}
        </React.Fragment>))}
      </span>
    </span>);
}

function buildSearchTextForItem(tab, it) {
    const name = (n(it?.displayName) || n(it?.runewordName) || n(it?.name)).toLowerCase();

    if (tab === "uniques" || tab === "runewords") {
        const props = Array.isArray(it?.displayProperties) ? it.displayProperties : [];
        const propsText = props
            .filter((x) => x != null)
            .map((x) => String(x).toLowerCase())
            .join("\n");

        return applyModifierExpansions(`${name}\n${propsText}`);
    }

    if (tab === "sacreds") {
        const ing = sacredIngredients(it).join("\n").toLowerCase();
        const props = sacredPropertiesText(it).toLowerCase();
        return `${name}\n${ing}\n${props}`;
    }

    if (tab === "corruptions") {
        const name = n(it?.displayName);

        const props = Array.isArray(it?.corruptionProperties)
            ? it.corruptionProperties.join(" ")
            : "";

        return `${name} ${props}`.toLowerCase();
    }

    if (tab === "affixes") {
        const dp = it?.displayProperties;
        let attrsText = "";

        if (Array.isArray(dp)) {
            if (dp.length && typeof dp[0] === "object") {
                // Array of { displayString, max, ... }
                attrsText = dp
                    .map((p) => p && p.displayString)
                    .filter(Boolean)
                    .join("\n")
                    .toLowerCase();
            } else {
                // Backwards-compat: array of strings
                attrsText = dp
                    .filter(Boolean)
                    .map((x) => String(x).toLowerCase())
                    .join("\n");
            }
        } else if (dp && typeof dp === "object") {
            attrsText = String(dp.displayString || "").toLowerCase();
        }

        return applyModifierExpansions(`${name}\n${attrsText}`);
    }

    return name;
}

function applyModifierExpansions(searchText) {
    let out = searchText;

    for (const rule of MOD_EXPANSIONS) {
        if (!rule?.whenIncludes || !Array.isArray(rule?.implies)) continue;

        if (out.includes(rule.whenIncludes.toLowerCase())) {
            out += "\n" + rule.implies.map((s) => s.toLowerCase()).join("\n");
        }
    }

    return out;
}

function affixTypes(it) {
    const a = Array.isArray(it?.displayItemTypeNames) ? it.displayItemTypeNames : [];
    return a.map((x) => n(x)).filter(Boolean);
}

function runewordAllTypes(rw) {
    const a = Array.isArray(rw?.displayItemTypes) ? rw.displayItemTypes : [];
    const b = Array.isArray(rw?.itemTypes) ? rw.itemTypes : [];
    return (a.length ? a : b).map((x) => n(x)).filter(Boolean);
}

function filterVisible(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.filter((it) => !isDontDisplay(it));
}

function weaponTypeLabel(w) {
    const primary = n(w?.itemType?.displayName) || n(w?.displayType) || n(w?.type);
    const secondary = n(w?.secondItemType?.displayName) || n(w?.secondDisplayType) || n(w?.secondType);
    return has(secondary) ? `${primary} / ${secondary}` : primary || "weapon";
}

function weaponTypeForFilter(w) {
    return n(w?.itemType?.itemType) || n(w?.type);
}

function armorTypeLabel(a) {
    const dt = n(a?.displayType);
    const sdt = n(a?.secondDisplayType);
    const base = dt || ARMOR_TYPE_MAP[n(a?.type)] || n(a?.type) || "armor";
    const sec = has(sdt) ? sdt : "";
    return has(sec) ? `${base} / ${sec}` : base;
}

function armorTypeForFilter(a) {
    return n(a?.displayType) || ARMOR_TYPE_MAP[n(a?.type)] || n(a?.type);
}

function uniqueBase(u) {
    return u?.weaponBase ?? u?.armorBase ?? u?.jeweleryBase ?? null;
}

function uniqueBaseTypeLabel(u) {
    const base = uniqueBase(u);
    return n(base?.itemType?.itemType) || n(base?.displayName) || n(base?.type);
}

function uniqueBaseTypeLabelPretty(u) {
    const base = uniqueBase(u);
    return n(base?.itemType?.displayName) || n(base?.displayName) || n(base?.displayType) || uniqueBaseTypeLabel(u);
}

function weaponDmgLines(w) {
    const out = [];
    const min = n(w?.minDamage), max = n(w?.maxDamage);
    const tmin = n(w?.twoHandedMinDamage), tmax = n(w?.twoHandedMaxDamage);
    const mmin = n(w?.minMissileDamage), mmax = n(w?.maxMissileDamage);

    if (has(min) && has(max)) out.push({k: "One-Hand Damage", v: `${min} to ${max}`});
    if (has(tmin) && has(tmax)) out.push({k: "Two-Hand Damage", v: `${tmin} to ${tmax}`});
    if (has(mmin) && has(mmax)) out.push({k: "Throw Damage", v: `${mmin} to ${mmax}`});
    return out;
}

function armorDefenseLine(a) {
    const minD = n(a?.minDefense), maxD = n(a?.maxDefense);
    if (has(minD) && has(maxD)) return `${minD} to ${maxD}`;
    if (has(minD)) return `${minD}`;
    return "";
}

function useJson(fileName, damnationMode) {
    const [state, setState] = React.useState({
        loading: true, data: [], error: null,
    });

    React.useEffect(() => {
        let cancelled = false;

        const url =
            damnationMode && fileName === "Uniques.json"
                ? `${import.meta.env.BASE_URL}data/damnation/${fileName}`
                : `${import.meta.env.BASE_URL}data/${fileName}`;

        setState((s) => ({...s, loading: true, error: null}));

        fetch(url, {cache: "no-store"}) // <-- prevents 304 responses
            .then(async (r) => {
                if (!r.ok) {
                    throw new Error(`HTTP ${r.status} ${r.statusText}`);
                }
                return r.json();
            })
            .then((json) => {
                if (cancelled) return;
                const arr = Array.isArray(json) ? json : [];
                setState({loading: false, data: filterVisible(arr), error: null});
            })
            .catch((e) => {
                if (cancelled) return;
                const err = e instanceof Error ? e : new Error(String(e));
                setState({loading: false, data: [], error: err});
            });

        return () => {
            cancelled = true;
        };
    }, [fileName, damnationMode]);

    return state;
}

function lineKV(k, v, extraClass = "", tooltipText = "") {
    var showTooltip = tooltipText !== null && tooltipText !== "";
    return (<div className={("line kv " + (extraClass || "")).trim()}>
        {showTooltip ? <Tip text={String(tooltipText)}><span>{k}</span></Tip> : <span>{k}</span>}
        <span>{String(v)}</span>
    </div>);
}

function getItemTypeForUnique(u) {
    if (has(u?.weaponBase)) {
        return "WEAPON";
    }

    if (has(u?.armorBase)) {
        return "ARMOR";
    }

    if (has(u?.jeweleryBase)) {
        return "JEWELERY";
    }
}

function getRequiredLevelForUnique(u, itemType) {
    if (u?.requiredLevel > 0) {
        return u?.requiredLevel;
    }

    if (itemType === "WEAPON") {
        return u?.weaponBase?.requiredLevel;
    }

    if (itemType === "ARMOR") {
        return u?.armorBase?.requiredLevel;
    }

    if (itemType === "JEWELERY") {
        return u?.jeweleryBase?.requiredLevel;
    }
}

function getRequiredStrengthForUnique(u, itemType) {
    if (itemType === "WEAPON") {
        return u?.weaponBase?.requiredStrength;
    }

    if (itemType === "ARMOR") {
        return u?.armorBase?.requiredStrength;
    }
}

function getRequiredDexterityForUnique(u) {
    return u?.weaponBase?.requiredDexterity;
}

function SearchableSelect({
                              value, onChange, options, placeholder = "Select…", style, className = "",
                          }) {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const wrapRef = React.useRef(null);
    const inputRef = React.useRef(null);

    const currentLabel = options.find((o) => String(o.value) === String(value))?.label || "";

    const filteredOptions = React.useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options;
        return options.filter((opt) => (opt.label || "").toLowerCase().includes(q));
    }, [options, query]);

    // Close on outside click
    React.useEffect(() => {
        if (!open) return;

        function handleClick(e) {
            if (!wrapRef.current) return;
            if (!wrapRef.current.contains(e.target)) {
                setOpen(false);
            }
        }

        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    // Auto-focus search input when dropdown opens
    React.useEffect(() => {
        if (open && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [open]);

    const handleSelect = (val) => {
        onChange(val);
        setOpen(false);
        setQuery("");
    };

    return (<div
        ref={wrapRef}
        className={`selSearchWrap ${className}`}
        style={style}
    >
        <button
            type="button"
            className="selTrigger"
            onClick={() => setOpen((o) => !o)}
        >
        <span className={currentLabel ? "" : "placeholder"}>
          {currentLabel || placeholder}
        </span>
            <span className="selArrow">▾</span>
        </button>

        {open && (<div className="selDropdown">
            <input
                ref={inputRef}
                className="selSearchInput"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter options…"
            />
            <div className="selOptions">
                {filteredOptions.length === 0 ? (
                    <div className="selOption selEmpty">No matches</div>) : (filteredOptions.map((opt) => (<div
                    key={String(opt.value) || opt.label}
                    className="selOption"
                    onClick={() => handleSelect(opt.value)}
                >
                    {opt.label}
                </div>)))}
            </div>
        </div>)}
    </div>);
}

function FiltersBar({
                        search,
                        setSearch,
                        typeValue,
                        setTypeValue,
                        tierValue,
                        setTierValue,
                        socketsValue,
                        setSocketsValue,
                        uberValue,
                        setUberValue,
                        hellforgedValue,
                        setHellforgedValue,
                        types,
                        tiers,
                        showSockets,
                        showUber,
                        showHellforged,
                        typePlaceholder,
                        searchInputRef,
                        showType = true,
                        showTier = true,
                        showHighlight = false,
                        highlightOnly,
                        setHighlightOnly,
                        showAffixType = false,
                        affixTypeValue = "",
                        setAffixTypeValue = () => {
                        },
                        showRuneCount = false,
                        runeCountValue = "",
                        setRuneCountValue = () => {
                        },
                        extraActiveCount = 0,
                    }) {
    // Build option lists once per render
    const typeOptions = [{value: "", label: typePlaceholder}, ...types.map((t) => ({value: t, label: t})),];

    const runeCountOptions = [{value: "", label: "All counts"}, {value: "2", label: "2 runes"}, {
        value: "3",
        label: "3 runes"
    }, {value: "4", label: "4 runes"}, {value: "5", label: "5 runes"}, {value: "6", label: "6 runes"},];

    const socketsOptions = [{
        value: "",
        label: "All sockets"
    }, ...Array.from({length: 7}, (_, i) => String(i)).map((s) => ({
        value: s, label: s,
    })),];

    const tierOptions = [{value: "", label: "All tiers"}, ...tiers.map((t) => ({value: t, label: t})),];

    const affixTypeOptions = [{value: "", label: "All affix types"}, {
        value: "Prefix",
        label: "Prefix"
    }, {value: "Suffix", label: "Suffix"},];

    // Mobile folds everything but the search box behind a "Filters (n)" button. n counts folded
    // filters that are set (truthy), plus extraActiveCount (the Rune filter's selection).
    const [foldOpen, setFoldOpen] = React.useState(false);
    const hasFolded = showType || showSockets || showRuneCount || showTier || showAffixType || showUber || showHellforged || showHighlight;
    const activeCount = [
        showType && typeValue,
        showSockets && socketsValue,
        showRuneCount && runeCountValue,
        showTier && tierValue,
        showAffixType && affixTypeValue,
        showUber && uberValue,
        showHellforged && hellforgedValue,
        showHighlight && highlightOnly,
    ].filter(Boolean).length + extraActiveCount;

    return (<div className="filtersRow">
        <div className="filtersPanel">
            <div className="filtersSearchRow">
                <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    className="searchBar"
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search item name…"
                />
                {hasFolded && (<button
                    type="button"
                    className="filtersToggle"
                    aria-expanded={foldOpen}
                    onClick={() => setFoldOpen((v) => !v)}
                >
                    Filters ({activeCount}) {foldOpen ? "▴" : "▾"}
                </button>)}
            </div>

            <div className={"filtersFold" + (foldOpen ? " open" : "")}>

                {showType && (
                    <SearchableSelect
                        value={typeValue}
                        onChange={setTypeValue}
                        options={typeOptions}
                        placeholder={typePlaceholder}
                        className="filterSelWide"
                    />)}

                {showSockets && (<SearchableSelect
                    value={socketsValue}
                    onChange={setSocketsValue}
                    options={socketsOptions}
                    placeholder="All sockets"
                    className="filterSelNarrow"
                />)}

                {showRuneCount && (<SearchableSelect
                    value={runeCountValue}
                    onChange={setRuneCountValue}
                    options={runeCountOptions}
                    placeholder="All counts"
                    className="filterSelNarrow"
                />)}

                {/* Tier (searchable) */}
                {showTier && (<SearchableSelect
                    value={tierValue}
                    onChange={setTierValue}
                    options={tierOptions}
                    placeholder="All tiers"
                    className="filterSelNarrow"
                />)}

                {/* Affix type (Prefix / Suffix) – affixes tab only */}
                {showAffixType && (<SearchableSelect
                    value={affixTypeValue}
                    onChange={setAffixTypeValue}
                    options={affixTypeOptions}
                    placeholder="All affix types"
                    className="filterSelMid"
                />)}

                {/* Uber boss toggle (unchanged) */}
                {showUber && (<label className="toggleWrap">
                    <span className="toggleLabel">Uber boss unique</span>
                    <div className="toggle">
                        <input
                            type="checkbox"
                            checked={!!uberValue}
                            onChange={(e) => setUberValue(e.target.checked ? "yes" : "")}
                        />
                        <span className="toggleSlider"/>
                    </div>
                </label>)}

                {showHellforged && (<label className="toggleWrap">
                    <span className="toggleLabel">Hellforged</span>
                    <div className="toggle">
                        <input
                            type="checkbox"
                            checked={!!hellforgedValue}
                            onChange={(e) => setHellforgedValue(e.target.checked ? "yes" : "")}
                        />
                        <span className="toggleSlider"/>
                    </div>
                </label>)}

                {/* Highlight toggle (unchanged) */}
                {showHighlight && (<label className="toggleWrap">
                    <span className="toggleLabel">SoE exclusive</span>
                    <div className="toggle">
                        <input
                            type="checkbox"
                            checked={!!highlightOnly}
                            onChange={(e) => setHighlightOnly(e.target.checked)}
                        />
                        <span className="toggleSlider"/>
                    </div>
                </label>)}
            </div>
        </div>
    </div>);
}

function InfoPanel({title, markdownText, isOpen, onToggle, onLink}) {
    if (!markdownText) return null;

    return (<div className="infoPanel">
        <div className="infoHeader">
            <div className="infoTitle">{title}</div>

            <button type="button" className="infoToggle" onClick={onToggle}>
                {isOpen ? "Hide" : "Show"}
            </button>
        </div>

        {isOpen ? (<div className="infoBody">
            <Markdown text={markdownText} onLink={onLink}/>
        </div>) : null}
    </div>);
}

function ListPanel({
                       title, countLabel, items, activeIndex, setActiveIndex, subLabel, tinyLabel, tab,
                       mobile = false, expandedIndex = null, onToggleExpanded, renderDetail,
                   }) {

    const activeRowRef = React.useRef(null);
    // Desktop highlights the selected row; mobile highlights the expanded one (none by default).
    const focusIndex = mobile ? expandedIndex : activeIndex;

    // On mobile a jump to another tab can open the same row index that was open before; the tab
    // is a dependency so that still scrolls to it. Desktop only follows the selected row.
    const scrollTab = mobile ? tab : null;
    React.useEffect(() => {
        if (focusIndex === null) return;
        // On mobile, scroll-margin-top lands the opened row just below the pinned top row.
        activeRowRef.current?.scrollIntoView({block: mobile ? "start" : "nearest"});
    }, [focusIndex, mobile, scrollTab]);

    return (<div className="listPanel">
        <div className="listHeader">
            <div className="title">{title}</div>
            <div className="count">{countLabel}</div>
        </div>

        <div className="list" role="list">
            {items.length === 0 ? (
                <div className="emptyState">No items match your filters.</div>) : (items.map((it, i) => {
                const iconUrl = getItemIconUrl(tab, it);
                const isFocus = i === focusIndex;

                return (<React.Fragment key={`${i}::${n(it?.code)}::${n(it?.displayName) || n(it?.name)}`}>
                    <div
                        ref={isFocus ? activeRowRef : null}
                        className={"row" + (isFocus ? " active" : "")}
                        onClick={() => (mobile ? onToggleExpanded(i) : setActiveIndex(i))}
                        role="listitem"
                    >
                        <div className="ico">
                            {iconUrl ? (<img src={iconUrl} className="icon" alt=""/>) : null}
                        </div>
                        <div className="meta">
                            <div className={tab === "uniques" ? "uniqueName" : "name"}>
                                {n(it?.displayName) || n(it?.name) || "Unknown"} {isHighlightedItem(it) && (tab === "uniques" || tab === "armors" || tab === "weapons" || tab === "runewords") ?
                                <span className="uniqueSOEAsterisk">*</span> : null}
                            </div>
                            <div className="sub">{subLabel(it)}</div>
                            <div className="tiny">{tinyLabel(it)}</div>
                        </div>
                    </div>

                    {/* A sibling of the row, not a child, so taps on links and tips inside don't toggle it. */}
                    {mobile && isFocus ? (<div className="rowDetail">
                        <div className="tooltip">{renderDetail(it)}</div>
                    </div>) : null}
                </React.Fragment>);
            }))}
        </div>
    </div>);
}


function TooltipShell({children}) {
    return (<div className="tooltipShell">
        <div className="tooltip">{children}</div>
    </div>);
}

function TierLinks({entries, onGo}) {
    const usable = entries.filter((e) => has(e.name) && has(e.code));
    if (!usable.length) return null;

    return (<>
        {usable.map((e) => (<div key={e.tierLabel + "|" + e.code} className="line kv">
            <span>{e.tierLabel} Tier Item:</span>
            <span>
            <a
                className="d2link"
                href="#"
                onClick={(ev) => {
                    ev.preventDefault();
                    onGo(e.code);
                }}
            >
              {e.name}
            </a>
          </span>
        </div>))}
    </>);
}

function UniquesPanel({uniques, onGoUnique}) {
    const list = Array.isArray(uniques) ? uniques : [];
    if (!list.length) return null;

    return (<>
        <div className="hr"/>
        <div className="uniqueHeader">Uniques</div>

        {list.map((u, idx) => {
            const name = n(u?.uniqueName);
            const code = n(u?.uniqueCode);
            if (!name) return null;

            return (<div key={`${idx}::${name}::${code}`} className="line goToLink">
                {code ? (<a
                    className="d2link"
                    href="#"
                    onClick={(ev) => {
                        ev.preventDefault();
                        onGoUnique(code);
                    }}
                    title={`Go to unique: ${code}`}
                >
                    {name}
                </a>) : (<span className="d2linkText">{name}</span>)}
            </div>);
        })}
    </>);
}

function SacredTooltip({s, onLink}) {
    if (!s) return <div className="emptyState">Select an item.</div>;

    const title = n(s?.displayName) || "Sacred";
    const types = sacredTypes(s);
    const ing = sacredIngredients(s);

    const map = s?.propertiesByItemType && typeof s.propertiesByItemType === "object" ? s.propertiesByItemType : {};

    const typeKeys = Object.keys(map);

    return (<>
        <div className="tipTitle">{title}</div>

        {types.length ? (<div className="tipSubtitle">
            <span className="dim"></span>
            {types.join(" / ")}
        </div>) : null}

        <div className="hr"/>

        {ing.length ? (<div className="line runesDisplay">
            <Tip text={String(TOOLTIPS_TEXT_MAP["sacred"])}>
                {ing.join(" · ")}
            </Tip>
        </div>) : (<div className="line dim">No runes listed.</div>)}

        <div className="hr"/>

        <div className="sacredModsHeader">Mods by item type</div>
        {typeKeys.length ? (typeKeys.map((k) => {
            const arr = Array.isArray(map[k]) ? map[k] : [];
            if (!arr.length) return null;

            return (<div key={k} style={{marginBottom: 10}}>
                <div className="sacredModsItemType">{k}</div>
                {arr.flatMap((p, i) => {
                    const raw = String(p ?? "");
                    const normalized = raw.replace(/\\n/g, "\n");
                    const lines = normalized
                        .split("\n")
                        .map((l) => l.trim())
                        .filter(Boolean);

                    return lines.map((line, j) => (<div
                        key={`${k}-${i}-${j}`}
                        className="runeModLine"
                    >
                        {renderInlineMarkdown(line, onLink)}
                    </div>));
                })}
            </div>);
        })) : (<div className="line dim">No modifiers listed.</div>)}
    </>);
}

function CurseEffectCalculator() {
    const [baseValue, setBaseValue] = React.useState("");
    const [bonusValue, setBonusValue] = React.useState("");

    const num = (v) => {
        const x = Number(String(v).replace(",", "."));
        return Number.isFinite(x) ? x : 0;
    };

    const result = React.useMemo(() => {
        const base = num(baseValue);
        const bonus = num(bonusValue);

        const raw = base * (100 + ((bonus * 70) / (bonus + 22))) / 100;

        return Number.isFinite(raw) ? Math.floor(raw) : 0;
    }, [baseValue, bonusValue]);

    const fmt = (x) => {
        const r = Math.round(x * 100) / 100;
        return String(r);
    };

    const reset = () => {
        setBaseValue("");
        setBonusValue("");
    };

    return (<div className="infoPanel">
        <div className="infoHeader">
            <div className="infoTitle">Curse Effect Calculator</div>

            <div className="filtersResetPanel">
                <button
                    type="button"
                    className="btn secondary"
                    onClick={reset}
                >
                    Reset
                </button>
            </div>
        </div>

        <div className="meta">
            Calculates final curse effect with diminishing returns.
        </div>

        <div className="hr"/>

        <div className="calcGrid">

            <div className="calcRow">
                <div className="calcLabel">Base value</div>
                <input
                    className="calcInput"
                    type="number"
                    value={baseValue}
                    onChange={(e) => setBaseValue(e.target.value)}
                    placeholder="e.g. 100"
                />
            </div>

            <div className="calcRow">
                <div className="calcLabel">Curse effect bonus</div>
                <input
                    className="calcInput"
                    type="number"
                    value={bonusValue}
                    onChange={(e) => setBonusValue(e.target.value)}
                    placeholder="e.g. 50"
                />
            </div>

            <div className="calcOut">
                <div className="calcOutLabel">Final effect</div>
                <div className="calcOutValue">{fmt(result)}</div>
            </div>

            <div className="calcFormula dim">
                X = base × (100 + (bonus × 70)/(bonus + 22)) / 100
            </div>

        </div>
    </div>);
}

function DropCalculatorPanel({request, clearRequest, damnationMode}) {
    const [dropMode, setDropMode] = React.useState("unique");
    const [query, setQuery] = React.useState("");
    const [rows, setRows] = React.useState([]);
    const pager = usePager(rows.length, {resetKey: rows});
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState("");
    const [difficulty, setDifficulty] = React.useState("");
    const [players, setPlayers] = React.useState("1");
    const [mf, setMf] = React.useState("");
    const wrapperRef = React.useRef(null);

    // Effect events read the latest callbacks without being effect dependencies, so these effects
    // still fire only when `request` or the inputs change.
    const consumeRequest = useEffectEvent(() => clearRequest?.());

    // A run whose inputs changed while it waited for the data (isCancelled) sets no state, so an older
    // query's rows never replace a newer query's.
    async function calculateAll(isCancelled) {
        if (!n(query)) {
            setRows([]);
            setError("");
            setLoading(false);
            return;
        }

        setLoading(true);
        setError("");

        let result;
        try {
            const model = await loadModel(damnationMode);
            result = {rows: calculateDrops(model, {dropMode, query, difficulty, players, mf})};
        } catch (e) {
            result = {error: e instanceof Error ? e.message : String(e)};
        }

        if (isCancelled()) return;

        setRows(result.rows ?? []);
        setError(result.error ?? "");
        setLoading(false);
    }

    const runCalculation = useEffectEvent((isCancelled) => calculateAll(isCancelled));

    // A new request fills the form during render (not in an effect), then asks the parent to clear it.
    const [prevRequest, setPrevRequest] = React.useState(null);
    if (request !== prevRequest) {
        setPrevRequest(request);
        if (request) {
            setDropMode("unique");
            setDifficulty("H");
            setQuery(request.item);
        }
    }

    useEffect(() => {
        if (request) consumeRequest();
    }, [request]);

    // Starts downloading this mode's data as soon as the tab opens; a failure surfaces on the next query.
    useEffect(() => {
        loadModel(damnationMode).catch(() => {});
    }, [damnationMode]);

    React.useEffect(() => {
        let cancelled = false;
        const id = window.setTimeout(() => {
            runCalculation(() => cancelled);
        }, 300);

        return () => {
            cancelled = true;
            window.clearTimeout(id);
        };
    }, [dropMode, query, difficulty, players, mf, damnationMode]);

    const pageRows = rows.slice(pager.start, pager.end);

    return (
        <>
            <div className="filtersStack">
                <div className="filtersRow">
                    <div className="filtersPanel">
                        <div className="dropCalcInputs">
                            <SearchableSelect
                                value={dropMode}
                                onChange={setDropMode}
                                options={[
                                    {value: "unique", label: "Unique Item"},
                                    {value: "set", label: "Set Item"},
                                    {value: "misc", label: "Misc item by name"},
                                ]}
                                className="dropCalcMode"
                            />

                            <SearchableSelect
                                value={difficulty}
                                onChange={setDifficulty}
                                options={[
                                    {value: "", label: "Normal"},
                                    {value: "N", label: "Nightmare"},
                                    {value: "H", label: "Hell"},
                                ]}
                                className="dropCalcDifficulty"
                            />

                            <SearchableSelect
                                value={players}
                                onChange={setPlayers}
                                options={Array.from({length: 8}, (_, i) => ({
                                    value: String(i + 1),
                                    label: `Players ${i + 1}`,
                                }))}
                                className="dropCalcPlayers"
                            />

                            <input
                                type="text"
                                inputMode="numeric"
                                className="searchBar dropCalcMf"
                                value={mf}
                                onChange={(e) => {
                                    const value = e.target.value.replace(/\D/g, "");
                                    setMf(value);
                                }}
                                placeholder="Magic Find"
                            />
                        </div>

                        <input
                            type="text"
                            className="searchBar"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={dropMode === "misc" ? "Enter misc code..." : "Enter item name..."}
                        />
                    </div>
                </div>
            </div>

            <div className="affixPanel">
                <div className="affixTableWrapper" ref={wrapperRef}>
                    <div className="affixPager">
                        <div>
                            <div className="helpTitle">Drop calculator</div>
                            <div>
                                Showing {rows.length ? pager.start + 1 : 0}
                                -{pager.end} of {rows.length}
                            </div>
                        </div>

                        <PagerButtons {...pager.pagerProps}/>
                    </div>

                    <StickyHeadTable
                        className="affixTable"
                        head={<tr>
                            <th>Monster</th>
                            <th>Treasure Class</th>
                            <th>Level</th>
                            <th>Drop chance</th>
                            <th>Drop chance %</th>
                        </tr>}
                    >
                        {loading && (
                            <tr>
                                <td colSpan="5" className="table-message">
                                    Calculating...
                                </td>
                            </tr>
                        )}

                        {!loading && error && (
                            <tr>
                                <td colSpan="5" className="table-message">
                                    {error}
                                </td>
                            </tr>
                        )}

                        {!loading && !error && pageRows.map((r, i) => (
                            <tr key={`${r.monsterId || r.monsterName}-${i}`}>
                                <td>{r.monsterName}</td>
                                <td>{r.treasureClass}</td>
                                <td>{r.levelName}</td>
                                <td>1:{r.oneIn}</td>
                                <td>{r.percent.toFixed(6)}%</td>
                            </tr>
                        ))}
                    </StickyHeadTable>

                    <div className="affixPager affixPagerBottom">
                        <PagerButtons {...pager.pagerProps} scrollTargetRef={wrapperRef}/>
                    </div>
                </div>
            </div>
        </>
    );
}

function AuraEffectCalculator() {
    const [baseValue, setBaseValue] = React.useState("");
    const [bonusValue, setBonusValue] = React.useState("");

    const num = (v) => {
        const x = Number(String(v).replace(",", "."));
        return Number.isFinite(x) ? x : 0;
    };

    const result = React.useMemo(() => {
        const base = num(baseValue);
        const bonus = num(bonusValue);

        const raw = base * (100 + ((bonus * 60) / (bonus + 25))) / 100;

        return Number.isFinite(raw) ? Math.floor(raw) : 0;
    }, [baseValue, bonusValue]);

    const fmt = (x) => {
        const r = Math.round(x * 100) / 100;
        return String(r);
    };

    const reset = () => {
        setBaseValue("");
        setBonusValue("");
    };

    return (<div className="infoPanel">
        <div className="infoHeader">
            <div className="infoTitle">Aura Effect Calculator</div>

            <div className="filtersResetPanel">
                <button
                    type="button"
                    className="btn secondary"
                    onClick={reset}
                >
                    Reset
                </button>
            </div>
        </div>

        <div className="meta">
            Calculates final aura effect with diminishing returns.
        </div>

        <div className="hr"/>

        <div className="calcGrid">

            <div className="calcRow">
                <div className="calcLabel">Base value</div>
                <input
                    className="calcInput"
                    type="number"
                    value={baseValue}
                    onChange={(e) => setBaseValue(e.target.value)}
                    placeholder="e.g. 100"
                />
            </div>

            <div className="calcRow">
                <div className="calcLabel">Aura effect bonus</div>
                <input
                    className="calcInput"
                    type="number"
                    value={bonusValue}
                    onChange={(e) => setBonusValue(e.target.value)}
                    placeholder="e.g. 50"
                />
            </div>

            <div className="calcOut">
                <div className="calcOutLabel">Final effect</div>
                <div className="calcOutValue">{fmt(result)}</div>
            </div>

            <div className="calcFormula dim">
                X = base × (100 + (bonus × 60)/(bonus + 25)) / 100
            </div>

        </div>
    </div>);
}

const SUBTILE_TO_YARDS = 2 / 3;          // 0.666666...

function AuraRadiusEffectCalculator() {

    // Radius inputs
    const [radiusBase, setRadiusBase] = React.useState("");
    const [radiusBonus, setRadiusBonus] = React.useState("");

    // Effect inputs
    const [effectBase, setEffectBase] = React.useState("");
    const [effectBonus, setEffectBonus] = React.useState("");

    const num = (v) => {
        const x = Number(String(v).replace(",", "."));
        return Number.isFinite(x) ? x : 0;
    };

    const YARDS_TO_SUBTILES = 1.5; // 1.5

    const calcRadiusYards = React.useMemo(() => {
        // user input (yards)
        const baseYards = num(radiusBase);
        const skill_radius_bonus = num(radiusBonus);

        // convert yards -> subtiles (game internal)
        // IMPORTANT: subtiles are discrete, so we round to int
        const baseSubtiles = Math.round(baseYards * YARDS_TO_SUBTILES);

        // DR bonus term (still in % units)
        const bonusTerm = (skill_radius_bonus * 70) / ((skill_radius_bonus + 18) || 1);

        // apply formula in subtiles
        const xSubtilesRaw = (baseSubtiles * (100 + bonusTerm)) / 100;

        // IMPORTANT: game uses discrete subtiles
        const xSubtiles = Math.round(xSubtilesRaw);

        // convert back to yards for display
        const xYards = xSubtiles * SUBTILE_TO_YARDS;

        return Number.isFinite(xYards) ? xYards : 0;
    }, [radiusBase, radiusBonus]);

    const calcEffect = React.useMemo(() => {
        const base_value = num(effectBase);
        const aura_effect_bonus = num(effectBonus);
        const bonusTerm = (aura_effect_bonus * 60) / (aura_effect_bonus + 25 || 1);
        const Y = (base_value * (100 + bonusTerm)) / 100;
        return Number.isFinite(Y) ? Y : 0;
    }, [effectBase, effectBonus]);

    const fmt = (x) => {
        // keep it readable, but stable
        const r = Math.round(x * 100) / 100;
        return String(r);
    };

    const reset = () => {
        setRadiusBase("");
        setRadiusBonus("");
        setEffectBase("");
        setEffectBonus("");
    };

    return (<div className="infoPanel">
        <div className="infoHeader">
            <div className="infoTitle">Aura radius and effect</div>
            <button type="button" className="btn ghost" onClick={reset}>
                Reset
            </button>
        </div>

        <div className="meta">
            Enter the base value and the bonus value; the calculator applies the
            diminishing returns formulas used by the mod.
        </div>

        <div className="hr"/>

        <div className="calcGrid">
            <div className="calcCard">
                <div className="calcTitle">Radius</div>

                <div className="calcRow">
                    <div className="calcLabel">Base value</div>
                    <input
                        className="calcInput"
                        type="number"
                        inputMode="decimal"
                        value={radiusBase}
                        onChange={(e) => setRadiusBase(e.target.value)}
                        placeholder="e.g. 10"
                    />
                </div>

                <div className="calcRow">
                    <div className="calcLabel">Skill radius bonus</div>
                    <input
                        className="calcInput"
                        type="number"
                        inputMode="decimal"
                        value={radiusBonus}
                        onChange={(e) => setRadiusBonus(e.target.value)}
                        placeholder="e.g. 50"
                    />
                </div>

                <div className="calcOut">
                    <div className="calcOutLabel">Radius result (X)</div>
                    <div className="calcOutValue">{fmt(calcRadiusYards)}</div>
                </div>

                <div className="calcFormula dim">
                    X = base × (100 + ((bonus×70)/(bonus+18))) / 100
                </div>
            </div>

            <div className="calcCard">
                <div className="calcTitle">Effect</div>

                <div className="calcRow">
                    <div className="calcLabel">Base value</div>
                    <input
                        className="calcInput"
                        type="number"
                        inputMode="decimal"
                        value={effectBase}
                        onChange={(e) => setEffectBase(e.target.value)}
                        placeholder="e.g. 100"
                    />
                </div>

                <div className="calcRow">
                    <div className="calcLabel">Aura effect bonus</div>
                    <input
                        className="calcInput"
                        type="number"
                        inputMode="decimal"
                        value={effectBonus}
                        onChange={(e) => setEffectBonus(e.target.value)}
                        placeholder="e.g. 80"
                    />
                </div>

                <div className="calcOut">
                    <div className="calcOutLabel">Effect result (Y)</div>
                    <div className="calcOutValue">{fmt(calcEffect)}</div>
                </div>

                <div className="calcFormula dim">
                    Y = base × (100 + ((bonus×60)/(bonus+25))) / 100
                </div>
            </div>
        </div>
    </div>);
}

function HelpPanel() {
    return (<div className="helpPanel">
        <div className="helpTitle">Help</div>

        <div className="helpBody">
            <p><b>Navigation</b></p>
            <ul>
                <li><b>← / →</b> switch tabs</li>
                <li><b>↑ / ↓</b> move selection in the item list</li>
                <li><b>Ctrl/Cmd + F</b> hotkey - focus search</li>
                <li><b>Esc</b> unfocus search (when focused on it)</li>
            </ul>

            <p><b>Search</b></p>
            <ul>
                <li>Use quotes for exact phrases: <code>"faster cast rate"</code></li>
                <li>In <b>Uniques</b>, <b>Runewords</b>, <b>Sacreds</b> and <b>Affixes</b> tabs, search also checks
                    modifiers.
                </li>
            </ul>

            <p><b>UI</b></p>
            <ul>
                <li>Dotted underline under label means that it contains useful hint on hover.</li>
                <li>Dashed underline under label means that it links to an entry on this site and will transfer to
                    it on click.
                </li>
                <li>Click the version on the right side of the footer to see <code>The Archivist</code> changelog
                </li>
                <li>Orange asterisk next to a name of the unique item means it was added in Sanctuary of Exile</li>
            </ul>
        </div>
    </div>);
}

function FateCardTooltip({card}) {
    if (!card) return <div className="emptyState">Select a fate card.</div>;

    return (
        <>
            <div className="tipTitle">{n(card.name)}</div>

            <div className="hr"/>

            <div className="uniqueHeader">Description</div>

            {String(card.description || "")
                .replace(/\r\n/g, "\n")
                .trim()
                .split("\n")
                .map((line, i) => {
                    const text = line.trim();

                    if (!text) {
                        return <div key={i} style={{height: 8}}/>;
                    }

                    return (
                        <div key={i} className="runeModLine">
                            {text}
                        </div>
                    );
                })}

            <div className="hr"/>

            {lineKV("Code:", n(card.code))}
            {lineKV("Required amount:", n(card.requiredAmount))}
        </>
    );
}

function WeaponTooltip({w, onGoCode, onGoUnique}) {
    if (!w) return <div className="emptyState">Select an item.</div>;
    const title = n(w?.displayName) || n(w?.name) || "Unknown Item";
    const hasRequirements = (has(w?.requiredStrength) || has(w?.requiredDexterity) || has(w?.requiredLevel) && w?.requiredLevel != 0 && w?.requiredDexterity != 0 && w?.requiredStrength != 0);

    const tierEntries = [{
        tierLabel: "Normal", name: n(w?.normalItemDisplayName), code: n(w?.normalTierCode),
    }, {
        tierLabel: "Exceptional", name: n(w?.exceptionalItemDisplayName), code: n(w?.exceptionalTierCode),
    }, {
        tierLabel: "Elite", name: n(w?.eliteItemDisplayName), code: n(w?.eliteTierCode),
    },];

    return (<>
        <div className="tipTitle">{title}</div>
        <div className="tipSubtitle">{weaponTypeLabel(w)}</div>
        <div className="hr"/>

        {weaponDmgLines(w).map((d) => (<React.Fragment key={d.k}>{lineKV(d.k + ":", d.v)}</React.Fragment>))}

        {has(w?.speed) && lineKV("Weapon Speed Modifier:", fmtSigned(w?.speed) || n(w?.speed))}

        {n(w?.noDurability) === "1" ? (<div
            className="line dim">Indestructible</div>) : (has(w?.durability) && lineKV("Durability:", n(w?.durability)))}

        {has(w?.maxSockets) && lineKV("Maximum Sockets:", n(w?.maxSockets))}

        {hasRequirements ? (<>
            <div className="hr"/>
            <div className="dropHeader">Requirements</div>
            {nz(w?.requiredLevel) && lineKV("Required Level:", n(w?.requiredLevel), "req")}
            {(nz(w?.requiredStrength) || nz(w?.requiredDexterity))}
            {nz(w?.requiredStrength) && lineKV("Required Strength:", n(w?.requiredStrength), "req")}
            {nz(w?.requiredDexterity) && lineKV("Required Dexterity:", n(w?.requiredDexterity), "req")}
        </>) : null}

        <div className="hr"/>
        <div className="dropHeader">Additional item information</div>
        {has(w?.itemTier) && lineKV("Item Tier:", n(w?.itemTier), "")}
        {has(w?.level) && lineKV("Quality Level:", n(w?.level), "", TOOLTIPS_TEXT_MAP["qualityLevel"])}
        {lineKV("Code:", n(w?.code), "", TOOLTIPS_TEXT_MAP["code"])}
        <TierLinks entries={tierEntries} onGo={onGoCode}/>
        <UniquesPanel uniques={w?.uniques} onGoUnique={onGoUnique}/>
    </>);
}

function ArmorTooltip({a, onGoCode, onGoUnique}) {
    if (!a) return <div className="emptyState">Select an item.</div>;
    const title = n(a?.displayName) || n(a?.name) || "Unknown Item";
    const def = armorDefenseLine(a);
    const hasRequirements = (has(a?.requiredStrength) && a?.requiredStrength > 0 && has(a?.requiredLevel) && a?.requiredLevel > 0) || (has(a?.requiredStrength) && a?.requiredStrength > 0);

    const tierEntries = [{
        tierLabel: "Normal", name: n(a?.normalItemDisplayName), code: n(a?.normalTierCode),
    }, {
        tierLabel: "Exceptional", name: n(a?.exceptionalItemDisplayName), code: n(a?.exceptionalTierCode),
    }, {
        tierLabel: "Elite", name: n(a?.eliteItemDisplayName), code: n(a?.eliteTierCode),
    },];

    return (<>
        <div className="tipTitle">{title}</div>
        <div className="tipSubtitle">{armorTypeLabel(a)}</div>
        <div className="hr"/>

        {has(def) && lineKV("Defense:", def)}
        {nz(a?.block) && lineKV("Chance to Block:", `${n(a?.block)}%`)}
        {nz(a?.maxSockets) && lineKV("Maximum Sockets:", n(a?.maxSockets))}
        {has(a?.durability) && lineKV("Durability:", n(a?.durability))}

        {hasRequirements ? (<>
            <div className="hr"/>
            <div className="dropHeader">Requirements</div>
            {nz(a?.requiredLevel) && lineKV("Required Level:", n(a?.requiredLevel), "req")}
            {nz(a?.requiredStrength) && lineKV("Required Strength:", n(a?.requiredStrength), "req")}
        </>) : null}

        <div className="hr"/>
        <div className="dropHeader">Additional item information</div>
        {has(a?.itemTier) && lineKV("Item Tier:", n(a?.itemTier), "dim")}
        {has(a?.level) && lineKV("Quality Level:", n(a?.level), "", TOOLTIPS_TEXT_MAP["qualityLevel"])}
        {lineKV("Code:", n(a?.code), "dim", TOOLTIPS_TEXT_MAP["code"])}
        <TierLinks label="Tiers:" entries={tierEntries} onGo={onGoCode}/>
        <UniquesPanel uniques={a?.uniques} onGoUnique={onGoUnique}/>
    </>);
}

function RunewordTooltip({rw, onGoSacred, onLink}) {
    if (!rw) return <div className="emptyState">Select an item.</div>;

    const title = n(rw?.displayName) || n(rw?.runewordName) || "Runeword";
    const hasRequirements = rw?.requiredlevel > 0;

    const runes = [n(rw?.firstRuneDisplayName), n(rw?.secondRuneDisplayName), n(rw?.thirdRuneDisplayName), n(rw?.fourthRuneDisplayName), n(rw?.fifthRuneDisplayName), n(rw?.sixthRuneDisplayName),].filter(Boolean);

    const types = runewordAllTypes(rw);
    const mods = Array.isArray(rw?.displayProperties) ? rw.displayProperties.filter((x) => x != null && String(x).trim() !== "") : [];

    const rwSacreds = Array.isArray(rw?.sacreds) ? rw.sacreds : [];

    return (<>
        <div className="tipTitle">{title}</div>
        {types.length ? (<div className="tipSubtitle">{types.join(" / ")}</div>) : null}

        <div className="hr"/>
        {runes.length ? (<div className="runesDisplay">
            <Tip text={String(TOOLTIPS_TEXT_MAP["runes"])}>
                {runes.join(" · ")}
            </Tip>
        </div>) : null}

        <div className="hr"/>
        <div className="uniqueHeader">Properties</div>
        {mods.length ? (mods.flatMap((m, i) => {
            const raw = String(m ?? "");
            const normalized = raw.replace(/\\n/g, "\n");
            const lines = normalized
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean);

            return lines.map((line, j) => {
                const cls = classForPropertyLine(line);
                const key = `${i}-${j}`;
                return (<div key={key} className={"runeModLine " + cls}>
                    {renderInlineMarkdown(line, onLink)}
                </div>);
            });
        })) : (<div className="line dim">No properties listed.</div>)}

        {hasRequirements ? (<>
            <div className="hr"/>
            <div className="dropHeader">Requirements</div>
            {nz(rw?.requiredlevel) && lineKV("Required Level:", n(rw?.requiredlevel), "req")}
        </>) : null}

        {rwSacreds.length ? (<>
            <div className="hr"/>
            <div className="dropHeader">Sacreds</div>
            {rwSacreds.map((s, idx) => {
                const name = n(s?.sacredName);
                const typesText = Array.isArray(s?.itemTypes) ? s.itemTypes.filter(Boolean).join(" / ") : "";
                if (!name) return null;

                return (<div key={`${idx}::${name}`} className="line goToLink">
                    {onGoSacred ? (<a
                        href="#"
                        className="d2link"
                        onClick={(ev) => {
                            ev.preventDefault();
                            onGoSacred(name, Array.isArray(s?.itemTypes) ? s.itemTypes : []);
                        }}
                        title={`Go to sacred: ${name}`}
                    >
                        {name} {typesText ? `(${typesText})` : ""}
                    </a>) : (<span className="d2linkText">{name}</span>)}
                </div>);
            })}
        </>) : null}
    </>);
}

// Identifies a tab + filter combination for the selected row (see `active` in App). Every filter that
// changes the filtered list belongs in the state object, so a change to any of them selects row 0.
function activeSig(filterState) {
    return JSON.stringify(filterState);
}

function CorruptionsTable({items}) {
    const pager = usePager(items.length, {resetKey: items});
    const wrapperRef = React.useRef(null);

    const pageItems = items.slice(pager.start, pager.end);

    return (
        <div className="affixTableWrapper" ref={wrapperRef}>
            <div className="affixPager">
                <div>
                    <div className="helpTitle">Corruptions</div>
                    <div>
                        Showing {pager.start + 1}-{pager.end} of {items.length}
                    </div>
                </div>

                <PagerButtons {...pager.pagerProps}/>
            </div>

            <StickyHeadTable
                className="affixTable corruptionsTable"
                head={<tr>
                    <th>Item</th>
                    <th>Corruption</th>
                    <th>Chance</th>
                </tr>}
            >
                {pageItems.map((it, idx) => (
                    <tr key={`${pager.page}-${idx}-${n(it?.displayName)}-${n(it?.chance)}`}>
                        <td>{n(it?.displayName)}</td>
                        <td className="affixAttr">
                            {Array.isArray(it?.corruptionProperties) && it.corruptionProperties.length
                                ? it.corruptionProperties.join("\n")
                                : "—"}
                        </td>
                        <td className="corruptionChance">{n(it?.chance)}%</td>
                    </tr>
                ))}
            </StickyHeadTable>

            <div className="affixPager affixPagerBottom">
                <PagerButtons {...pager.pagerProps} scrollTargetRef={wrapperRef}/>
            </div>
        </div>
    );
}

// The Affixes columns in display order (the order of AFFIX_SORT_KEYS); `tip` names a TOOLTIPS_TEXT_MAP
// entry. Header texts come from AFFIX_SORT_LABELS.
const AFFIX_COLUMNS = [
    {key: "name"},
    {key: "attrs"},
    {key: "level", tip: "affixLevel"},
    {key: "group", tip: "affixGroup"},
    {key: "rare", tip: "affixRares"},
    {key: "freq", tip: "affixFrequency"},
    {key: "maxLevel", tip: "affixMaxLevel"},
    {key: "types"},
    {key: "excluded"},
    {key: "class"},
    {key: "reqLevel", tip: "affixRequiredLevel"},
];

function AffixesPanel({data, loading, error, sort, onChangeSort, multi, onChangeMulti}) {
    const wrapperRef = React.useRef(null);

    // Normalised data coming from global filters/search
    const all = React.useMemo(() => (Array.isArray(data) ? data : []), [data]);

    // An empty sort list sorts by the default (Attributes ▲) without listing it. Same reference as
    // `sort` (or the shared default), so the memo below only re-sorts when something changed.
    const active = effectiveSort(sort);

    const sorted = React.useMemo(
        () => [...all].sort((a, b) => compareAffixesBy(a, b, active)),
        [all, active],
    );

    // Pagination runs on the *sorted* rows and goes back to page 1 whenever they change: new filtered
    // data or a new sort.
    const pager = usePager(sorted.length, {resetKey: sorted, ghost: true});

    // Every sort change shows row 1. The desktop box scrolls back to its top (scrollLeft is kept, so a
    // phone's sideways position survives); if the floating header was showing (the change came from deep
    // in the table), the page scrolls back to the table the way the bottom pager does.
    const changeSort = (next) => {
        onChangeSort(next);
        const wrapper = wrapperRef.current;
        if (!wrapper) return;
        const scroller = wrapper.querySelector(".affixTableScroll");
        if (scroller) scroller.scrollTop = 0;
        if (wrapper.querySelector(".floatingHead")?.classList.contains("on")) {
            wrapper.scrollIntoView({block: "start"});
        }
    };

    const handleSort = (key) => changeSort(clickSort(sort, key, {multi}));

    // A lone arrow for a one-key sort (as before); with several keys each sorted column also shows its
    // position: 1▲ 2▼.
    const sortMarkerFor = (key) => {
        const index = active.findIndex((s) => s.key === key);
        if (index < 0) return null;
        return (<span className="sortArrow">
            {active.length > 1 && <span className="sortIndex">{index + 1}</span>}
            {active[index].dir === "asc" ? "▲" : "▼"}
        </span>);
    };

    // ARIA allows aria-sort on one column: the first key.
    const ariaSortFor = (key) => {
        if (active[0].key !== key) return undefined;
        return active[0].dir === "asc" ? "ascending" : "descending";
    };

    // --- Loading / empty ----------------------------------------------------

    if (loading) {
        return (<div className="infoPanel">
            <div className="infoHeader">
                <div className="infoTitle">Affixes</div>
            </div>
            <div className="meta">Loading affixes…</div>
        </div>);
    }

    if (error) {
        return (<div className="infoPanel">
            <div className="infoHeader">
                <div className="infoTitle">Affixes</div>
            </div>
            <div className="meta">
                Failed to load affixes: {String(error.message || error)}
            </div>
        </div>);
    }


    const total = sorted.length;
    if (!total) {
        return (<div className="infoPanel">
            <div className="infoHeader">
                <div className="infoTitle">Affixes</div>
            </div>
            <div className="emptyState">No affixes match your filters.</div>
        </div>);
    }

    const current = sorted.slice(pager.start, pager.end);

    // --- Render table --------------------------------------------------------

    return (<div className="infoPanel">
        <div className="infoHeader">
            <div className="infoTitle">Affixes</div>
        </div>

        <div className="affixTableWrapper" ref={wrapperRef}>
            {/* Pager above table */}
            <div className="affixPager">
                <div className="affixPagerLeft">
            <span>
              Showing {pager.start + 1}–{pager.end} of {total}
            </span>
                </div>
                <PagerButtons {...pager.pagerProps}/>
            </div>

            <AffixSortBar sort={sort} onChange={changeSort} multi={multi} onMultiChange={onChangeMulti}/>

            {/* Scrollable table; its header row also floats while the page scrolls */}
            <StickyHeadTable
                className="affixTable affixesTable"
                head={<tr>
                    {AFFIX_COLUMNS.map(({key, tip}) => {
                        const label = AFFIX_SORT_LABELS[key];
                        return (<th
                            key={key}
                            className="sortable"
                            aria-sort={ariaSortFor(key)}
                            onClick={() => handleSort(key)}
                        >
                            <span className="thLabel">
                                {tip ? <Tip text={String(TOOLTIPS_TEXT_MAP[tip])}>{label}</Tip> : label} {sortMarkerFor(key)}
                            </span>
                        </th>);
                    })}
                </tr>}
            >
                {current.map((it, idx) => (<tr key={`${pager.page}-${idx}-${it.id || it.name}`}>
                    <td>{n(it?.name)}</td>
                    <td>{affixDisplayString(it)}</td>
                    <td>{has(it?.level) ? it.level : ""}</td>
                    <td>{has(it?.group) ? it.group : ""}</td>
                    <td>{it?.rare ? "Yes" : "No"}</td>
                    <td>{has(it?.frequency) ? it.frequency : ""}</td>
                    <td>{has(it?.maxLevel) ? it.maxLevel : ""}</td>
                    <td>
                        {(it?.displayItemTypeNames || []).join(", ")}
                    </td>
                    <td>
                        {(it?.displayExcludedItemTypeNames || []).join(", ")}
                    </td>
                    <td>{n(it?.classDisplayName)}</td>
                    <td>
                        {has(it?.requiredLevel) ? it.requiredLevel : ""}
                    </td>
                </tr>))}
            </StickyHeadTable>

            <div className="affixPager affixPagerBottom">
                <PagerButtons {...pager.pagerProps} scrollTargetRef={wrapperRef}/>
            </div>
        </div>
    </div>);
}

function UniqueTooltip({u, openDropCalculator, onLink}) {
    if (!u) return <div className="emptyState">Select an item.</div>;

    const title = n(u?.displayName) || "Unknown Unique";

    const base = uniqueBase(u);
    const baseName = n(base?.displayName) || n(base?.name) || "";

    const mods = visibleProperties(
        Array.isArray(u?.displayProperties)
            ? u.displayProperties.filter((x) => x != null && String(x).trim() !== "")
            : []
    );

    const dropSource = u?.dropSource;
    const dropRate = u?.dropRate;
    const occurrenceChance = u?.occurrenceChance;
    const occurrenceChanceCurrency = u?.occurrenceChanceCurrency;

    const hasDropSource = dropSource !== null && dropSource !== undefined && String(dropSource).trim() !== "";
    const hasDropRate = dropRate !== null && dropRate !== undefined && String(dropRate).trim() !== "";
    const hasOccurrenceChance = occurrenceChance !== null && occurrenceChance !== undefined && String(occurrenceChance).trim() !== "";
    const hasOccurrenceChanceCurrency = occurrenceChanceCurrency !== null && occurrenceChanceCurrency !== undefined && String(occurrenceChanceCurrency).trim() !== "";
    const hasDropInfo = hasDropSource || hasDropRate || hasOccurrenceChance || hasOccurrenceChanceCurrency;

    const itemType = getItemTypeForUnique(u);
    const requiredLevel = getRequiredLevelForUnique(u, itemType);
    const requiredDexterity = getRequiredDexterityForUnique(u, itemType);
    const requiredStrength = getRequiredStrengthForUnique(u, itemType);
    const hasRequirements = (requiredLevel > 0 && requiredStrength > 0) || (requiredLevel > 0 && requiredDexterity > 0) || (requiredLevel > 0 && requiredDexterity > 0 && requiredStrength > 0);

    const mythicOrbIndexes = new Set([
        "Nagelring",
        "Manald Heal",
        "Raven Frost",
        "Dwarf Star",
        "Carrion Wind",
        "Nokozan Relic",
        "Atma's Scarab",
        "The Eye of Etlich",
        "Crescent Moon",
        "Saracen's Chance",
        "The Mahim-Oak Curio",
        "The Cat's Eye",
    ]);

    const divineOrbIndexes = new Set([
        "The Stone of Jordan",
        "Bul Katho's Wedding Band",
        "Nature's Peace",
        "Constricting Ring",
        "Wisp",
        "Deaths Poise",
        "Call of the Brotherhood",
        "Baals Pass",
        "Baals Respite",
        "Baals Grip",
        "The Rising Sun",
        "Highlord's Wrath",
        "Mara's Kaleidoscope",
        "Seraph's Hymn",
        "Metalgrid",
        "Defiance of Destiny",
        "Astramentis",
    ]);

    const creationOrb = mythicOrbIndexes.has(u?.index)
        ? "Mythic Orb"
        : divineOrbIndexes.has(u?.index)
            ? "Divine Orb"
            : (u?.itemTier === "Normal" || u?.itemTier === "Exceptional")
                ? "Mythic Orb"
                : "Divine Orb";

    return (<>
        <div className="tipUniqueTitle">{title}</div>
        <div className="tipSubtitle">
            {baseName}
        </div>

        {u?.carryOne === "1" ? (<div className="carryOne">
            You can have only one in your inventory and stash!
        </div>) : null}

        {has(u?.weaponBase) ? (<>
            <div className="hr"/>
            {has(u?.displayOneHandDamage) && lineKV("One hand damage:", n(u?.displayOneHandDamage), "")}
            {has(u?.displayTwoHandDamage) && lineKV("Two hand damage:", n(u?.displayTwoHandDamage), "")}
        </>) : null}

        {has(u?.armorBase) ? (<>
            <div className="hr"/>
            {has(u?.displayDefense) && lineKV("Defense:", n(u?.displayDefense), "")}
        </>) : null}

        <div className="hr"/>
        <div className="uniqueHeader">Unique modifiers</div>

        {mods.length ? (mods.flatMap((m, idx) => {
            const raw = String(m ?? "");
            // support both "\n" and actual newlines
            const normalized = raw.replace(/\\n/g, "\n");
            const lines = normalized
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean);

            return lines.map((line, j) => {
                const cls = classForPropertyLine(line);
                const key = `${idx}-${j}`;

                return (<div key={key} className={"uniqueMod " + cls}>
                    {renderInlineMarkdown(line, onLink)}
                </div>);
            });
        })) : (<div className="line dim">No modifiers listed.</div>)}

        {hasDropInfo && !u?.hellforged ? (<>
            <div className="hr"/>
            <div className="dropHeader">Drop information</div>
            {hasDropSource && lineKV("Drop source:", String(dropSource), "")}
            {hasDropRate && lineKV("Drop rate:", String(dropRate), "")}
            {hasOccurrenceChance && lineKV("Occurrence chance:", String(occurrenceChance), "")}
        </>) : null}

        {hasRequirements ? (<>
            <div className="hr"/>
            <div className="dropHeader">Requirements</div>
            {nz(requiredLevel) && lineKV("Required Level:", n(requiredLevel), "req")}
            {nz(requiredStrength) && lineKV("Required Strength:", n(requiredStrength), "req")}
            {nz(requiredDexterity) && lineKV("Required Dexterity:", n(requiredDexterity), "req")}
        </>) : null}

        {u?.showCanBeCreatedWith === true && !u?.hellforged ? (<>
            <div className="hr"/>
            <div className="dropHeader">Crafting</div>
            {hasOccurrenceChanceCurrency && occurrenceChance !== occurrenceChanceCurrency && lineKV("Occurrence chance for currency:", String(occurrenceChanceCurrency), "")}
            <br/>
            <div className="line dim">
                You can create this unique with a{" "}
                <span className="highlight">{creationOrb}</span> on its base item.
            </div>
        </>) : null}

        {u?.hellforged ? (<>
            <div className="hr"/>
            <div className="dropHeader">Crafting</div>
            <div className="line dim">
                You can create this unique with a special Infernal Kiln Cube Recipes. Check Cube recipes tab above.
            </div>
        </>) : null}

        {!u?.hellforged ? (<>
            <div
                className="tooltip-link"
                onClick={() => openDropCalculator(n(u?.index) || n(u?.displayName))}
            >
                View drop rates
            </div>
        </>) : null}
    </>);
}

function StaticDataPanel({data, loading, error, search, onLink}) {
    const [openMap, setOpenMap] = React.useState({});

    const filtered = React.useMemo(() => {
        const all = Array.isArray(data) ? data : [];
        const q = (search || "").trim().toLowerCase();
        if (!q) return all;

        return all.filter((r) => {
            const title = (n(r?.title) || "").toLowerCase();

            const textArr = Array.isArray(r?.text) ? r.text : [r?.text];
            const textJoined = textArr
                .filter(Boolean)
                .join("\n")
                .toLowerCase();

            return title.includes(q) || textJoined.includes(q);
        });
    }, [data, search]);

    const toggle = (id) => {
        setOpenMap((m) => {
            const current = m[id] ?? true;
            return {...m, [id]: !current};
        });
    };

    if (loading) {
        return (
            <div className="helpPanel">
                <div className="helpBody">Loading data…</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="helpPanel">
                <div className="helpBody">
                    Failed to load <code>data</code>:{" "}
                    {String(error.message || error)}
                </div>
            </div>
        );
    }

    if (!filtered.length) {
        return (
            <div className="helpPanel">
                <div className="helpBody">
                    <div className="emptyState">No cube recipes match your search.</div>
                </div>
            </div>
        );
    }

    return (<>
        {filtered.map((r, idx) => {
            const id = r.id || `${r.type || "recipe"}-${idx}`;
            const isOpen = openMap[id] ?? true;
            const title = n(r.title) || `Recipe ${idx + 1}`;
            const kind = n(r.type);

            return (<div key={id} className="infoPanel" style={{marginBottom: 10}}>
                <div className="infoHeader">
                    <div className="infoTitle" style={{fontSize: 18}}>
                        {title}
                        {kind && (<span
                            style={{
                                fontSize: 14,
                                marginLeft: 8,
                                color: "var(--muted)",
                                textTransform: "none",
                                letterSpacing: 0,
                                fontWeight: 400,
                            }}
                        >
                    · {kind}
                  </span>)}
                    </div>

                    <button
                        type="button"
                        className="infoToggle"
                        onClick={() => toggle(id)}
                    >
                        {isOpen ? "Hide" : "Show"}
                    </button>
                </div>

                {isOpen && (<div className="infoBody cubeInfoBody">
                    <Markdown text={r.text} onLink={onLink}/>
                </div>)}
            </div>);
        })}
    </>);
}

export default function App() {
    const [damnationMode, setDamnationMode] = React.useState(
        localStorage.getItem("damnation") === "true"
    );
    const weapons = useJson("Weapons.json", damnationMode);
    const armors = useJson("Armors.json", damnationMode);
    const uniques = useJson("Uniques.json", damnationMode);
    const runewords = useJson("Runewords.json", damnationMode);
    const sacreds = useJson("Sacreds.json", damnationMode);
    const cube = useJson("Cube.json", damnationMode);
    const ascendancies = useJson("Ascendancies.json", damnationMode);
    const mapping = useJson("Mapping.json", damnationMode);
    const standard = useJson("Standard.json", damnationMode);
    const changelog = useJson("Changelog.json", damnationMode);
    const affixes = useJson("Affixes.json", damnationMode);
    const skills = useJson("Skills.json", damnationMode);
    const damnation = useJson("Damnation.json", damnationMode);
    const corruptions = useJson("Corruptions.json", damnationMode);
    const fateCards = useJson("FateCards.json", damnationMode);
    const kiln = useJson("Kiln.json", damnationMode);

    const INFO_OPEN_STORAGE_KEY = "the-archivist-v1";
    const searchInputRef = React.useRef(null);
    const cubeSearchInputRef = React.useRef(null);
    const ascendanciesSearchInputRef = React.useRef(null);
    const kilnSearchInputRef = React.useRef(null);
    const mappingSearchInputRef = React.useRef(null);
    const skillsSearchInputRef = React.useRef(null);
    const changesSearchInputRef = React.useRef(null);
    const [pendingLinkTarget, setPendingLinkTarget] = useState(null);
    const [showTopButton, setShowTopButton] = useState(false);

    const [tab, setTab] = useHashTab(VALID_TAB_KEYS, "weapons");
    const isMobile = useIsMobile();
    const [dropCalculatorRequest, setDropCalculatorRequest] = useState(null);

    const [search, setSearch] = useState("");
    const [typeValue, setTypeValue] = useState("");
    const [tierValue, setTierValue] = useState("");
    const [socketsValue, setSocketsValue] = useState("");
    const [cubeSearch, setCubeSearch] = useState("");
    const [kilnSearch, setKilnSearch] = useState("");
    const [ascendanciesSearch, setAscendanciesSearch] = useState("");
    const [mappingSearch, setMappingSearch] = useState("");
    const [changesSearch, setChangesSearch] = useState("");
    const [skillsSearch, setSkillsSearch] = useState("");
    const [uberValue, setUberValue] = useState(false);
    const [hellforgedValue, setHellforgedValue] = useState(false);
    const [pendingUniqueCode, setPendingUniqueCode] = useState("");
    const [pendingSacredMatch, setPendingSacredMatch] = useState(null);
    const [highlightOnly, setHighlightOnly] = useState(false);
    const [affixTypeValue, setAffixTypeValue] = useState("");
    const [runeCountValue, setRuneCountValue] = useState("");
    const [selectedRunes, setSelectedRunes] = useState([]);
    const [showRuneFilterBar, setShowRuneFilterBar] = useState(false);

    // The selected row belongs to one tab + filter combination: a different combination derives row 0.
    // Jumps that change the filters and select a row in the same update store their own signature.
    const filterState = {
        tab, search, tierValue, typeValue, socketsValue, uberValue, hellforgedValue, highlightOnly,
        affixTypeValue, runeCountValue, selectedRunes,
    };
    const filterSig = activeSig(filterState);
    const [active, setActive] = useState({sig: filterSig, index: 0});
    if (active.sig !== filterSig) setActive({sig: filterSig, index: 0});
    const activeIndex = active.sig === filterSig ? active.index : 0;
    const setActiveIndex = (next) => setActive((prev) => ({
        sig: prev.sig, index: typeof next === "function" ? next(prev.index) : next,
    }));

    // Switching tabs clears the other tabs' searches and resets the filters, except after an internal
    // Markdown app: link, which skips the filter reset once.
    const [prevTab, setPrevTab] = useState(tab);
    const [skipFilterReset, setSkipFilterReset] = useState(false);
    if (tab !== prevTab) {
        setPrevTab(tab);

        if (tab !== "cube") setCubeSearch("");
        if (tab !== "changes") setChangesSearch("");
        if (tab !== "skills") setSkillsSearch("");

        // A jump still waiting for its data is abandoned once the tab is no longer its target (Back
        // before the load finished); left set, it would fire on some later visit.
        if (pendingLinkTarget && pendingLinkTarget.tab !== tab) setPendingLinkTarget(null);
        if (pendingUniqueCode && tab !== "uniques") setPendingUniqueCode("");
        if (pendingSacredMatch && tab !== "sacreds") setPendingSacredMatch(null);

        if (skipFilterReset) {
            setSkipFilterReset(false);
        } else {
            setSearch("");
            setTypeValue("");
            setTierValue("");
            setSocketsValue("");
            setUberValue(false);
            setHellforgedValue(false);
            setHighlightOnly(false);
            setAffixTypeValue("");
            setRuneCountValue("");
            setSelectedRunes([]);
        }
    }

    const openDropCalculator = (itemName) => {
        setDropCalculatorRequest({
            item: itemName
        });

        setTab("dropcalc");
    };

    const toggleDamnationMode = (checked) => {
        setDamnationMode(checked);
        localStorage.setItem("damnation", checked ? "true" : "false");
    };

    // The Affixes sort list (empty = the implicit Attributes ▲, see effectiveSort), kept across visits.
    const AFFIX_SORT_STORAGE_KEY = "the-archivist-affix-sort";
    const [affixSort, setAffixSort] = useState(() => {
        try {
            return parseStoredSort(window.localStorage.getItem(AFFIX_SORT_STORAGE_KEY));
        } catch (e) {
            console.warn("Failed to read the Affixes sort from storage", e);
            return [];
        }
    });

    // The Multi-sort switch is kept too, so a restored multi-key sort comes back with it on.
    const AFFIX_MULTI_STORAGE_KEY = "the-archivist-affix-multi";
    const [affixMulti, setAffixMulti] = useState(() => {
        try {
            return parseStoredFlag(window.localStorage.getItem(AFFIX_MULTI_STORAGE_KEY));
        } catch (e) {
            console.warn("Failed to read the Multi-sort switch from storage", e);
            return false;
        }
    });

    const changeAffixMulti = (next) => {
        setAffixMulti(next);
        try {
            window.localStorage.setItem(AFFIX_MULTI_STORAGE_KEY, JSON.stringify(next));
        } catch (e) {
            console.warn("Failed to save the Multi-sort switch", e);
        }
    };

    // Saved in the handler, not an effect or a state updater (StrictMode runs updaters twice).
    const changeAffixSort = (next) => {
        setAffixSort(next);
        try {
            window.localStorage.setItem(AFFIX_SORT_STORAGE_KEY, JSON.stringify(next));
        } catch (e) {
            console.warn("Failed to save the Affixes sort", e);
        }
    };

    const [infoOpenByTab, setInfoOpenByTab] = useState(() => {
        const defaults = {weapons: true, armors: true, uniques: true, runewords: true, sacreds: true};
        try {
            const raw = window.localStorage.getItem(INFO_OPEN_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            return parsed && typeof parsed === "object" ? {...defaults, ...parsed} : defaults;
        } catch (e) {
            console.warn("Failed to read info panel state from storage", e);
            return defaults;
        }
    });

    const info = INFO_BY_TAB[tab] || {title: "About", text: ""};
    const infoOpen = !!infoOpenByTab[tab];

    const dataset = tab === "weapons" ? weapons : tab === "armors" ? armors : tab === "uniques" ?
        uniques : tab === "runewords" ? runewords : tab === "sacreds" ? sacreds : tab === "affixes" ?
            affixes : tab === "skills" ? skills : tab === "corruptions" ? corruptions : tab === "fatecards" ?
                fateCards : weapons; // fallback

    useEffect(() => {
        const onScroll = () => {
            setShowTopButton(window.scrollY > 400);
        };

        window.addEventListener("scroll", onScroll, {passive: true});
        onScroll();

        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    function goToTop() {
        window.scrollTo({top: 0, behavior: "smooth"});
    }

    function toggleRuneFilter(rune) {
        setSelectedRunes((prev) =>
            prev.includes(rune)
                ? prev.filter((x) => x !== rune)
                : [...prev, rune]
        );
    }

    function sacredRunes(s) {
        return sacredIngredients(s).filter((x) =>
            ALL_RUNES.includes(n(x))
        );
    }

    const items = dataset.data;

    const handleVersionClick = () => {
        setTab("changelog");
    };

    const handleMarkdownAppLink = React.useCallback(({tab: targetTab, name}) => {
        const t = (targetTab || "").toLowerCase();
        const label = (name || "").trim();
        const hasName = !!label;
        const needle = label.toLowerCase();

        // --- Cube Recipes tab ---
        if (t === "cube") {
            setTab("cube");
            if (hasName) {
                setCubeSearch(needle);
                if (cubeSearchInputRef.current) {
                    cubeSearchInputRef.current.focus();
                    cubeSearchInputRef.current.select();
                }
            }
            // if no name → just jump to tab, keep existing cubeSearch as-is
            return;
        }

        // --- SoE changes tab ---
        if (t === "changes") {
            setTab("changes");
            if (hasName) {
                setChangesSearch(needle);
                if (changesSearchInputRef.current) {
                    changesSearchInputRef.current.focus();
                    changesSearchInputRef.current.select();
                }
            }
            return;
        }

        // --- Skills tab ---
        if (t === "skills") {
            setTab("skills");
            if (hasName) {
                setSkillsSearch(needle);
                if (skillsSearchInputRef.current) {
                    skillsSearchInputRef.current.focus();
                    skillsSearchInputRef.current.select();
                }
            }
            // if no name → just jump to tab, keep existing skillsSearch as-is
            return;
        }

        // If there's no name part, just jump to the tab and let normal
        // "tab change" behavior reset filters etc.
        if (!hasName) {
            setTab(t);
            return;
        }

        // Name present → full "go-to-item" behavior
        // Only a real tab change consumes the skip; a link to the current tab would leave it set.
        if (t !== tab) setSkipFilterReset(true);

        setTab(t);
        setSearch(needle);
        setPendingLinkTarget({tab: t, name: needle});
    }, [setTab, tab]);


    const typeOptions = useMemo(() => {
        if (!items.length) return [];

        if (tab === "weapons") return Array.from(new Set(items.map(weaponTypeForFilter).filter(Boolean))).sort();

        if (tab === "armors") return Array.from(new Set(items.map(armorTypeForFilter).filter(Boolean))).sort();

        if (tab === "uniques") return Array.from(new Set(items.map(uniqueBaseTypeLabel).filter(Boolean))).sort();

        if (tab === "runewords") {
            const all = items.flatMap(runewordAllTypes);
            return Array.from(new Set(all)).sort();
        }

        if (tab === "affixes") {
            const all = items.flatMap(affixTypes);
            return Array.from(new Set(all)).sort();
        }

        if (tab === "corruptions") {
            return [...new Set(items.map((it) => n(it?.displayName)).filter(Boolean))].sort();
        }

        const all = items.flatMap(sacredTypes);
        return Array.from(new Set(all)).sort();
    }, [items, tab]);

    const tierOptions = useMemo(
        () => sortTiers(Array.from(new Set(items.map((it) => n(it?.itemTier)).filter(Boolean)))),
        [items]
    );

    const filtered = useMemo(() => {
        const {phrases, terms} = parseSearchQuery(search);

        // 1) Apply all existing filters first
        const base = items.filter((it) => {
            const searchText = buildSearchTextForItem(tab, it);

            for (const p of phrases) {
                if (!searchText.includes(p)) return false;
            }

            for (const t of terms) {
                if (!searchText.includes(t)) return false;
            }

            if (tierValue && n(it?.itemTier) !== tierValue) return false;

            if (tab === "weapons") {
                if (typeValue && weaponTypeForFilter(it) !== typeValue) return false;
                if (socketsValue && Number(it?.maxSockets) !== Number(socketsValue)) return false;

                if (highlightOnly && !isHighlightedItem(it)) {
                    return false;
                }
            }

            if (tab === "armors") {
                if (typeValue && armorTypeForFilter(it) !== typeValue) return false;
                if (socketsValue && Number(it?.maxSockets) !== Number(socketsValue)) return false;

                if (highlightOnly && !isHighlightedItem(it)) {
                    return false;
                }
            }

            if (tab === "uniques") {
                if (typeValue && uniqueBaseTypeLabel(it) !== typeValue) return false;

                if (uberValue && !isUberUnique(it)) {
                    return false;
                }

                if (hellforgedValue && !isHellforged(it)) {
                    return false;
                }

                if (highlightOnly && !isHighlightedItem(it)) {
                    return false;
                }
            }

            if (tab === "runewords") {
                if (typeValue) {
                    const types = runewordAllTypes(it);
                    if (!types.includes(typeValue)) return false;
                }

                if (highlightOnly && !isHighlightedItem(it)) {
                    return false;
                }

                if (runeCountValue) {
                    if (runewordRuneCount(it) !== Number(runeCountValue)) return false;
                }

                if (selectedRunes.length) {
                    const itemRunes = runewordRunes(it).map((r) => r.toLowerCase());

                    const hasAllSelectedRunes = selectedRunes.every((r) => itemRunes.includes(r.toLowerCase()));

                    if (!hasAllSelectedRunes) return false;
                }
            }

            if (tab === "sacreds") {
                if (typeValue) {
                    const types = sacredTypes(it);
                    if (!types.includes(typeValue)) return false;
                }

                if (selectedRunes.length) {
                    const itemRunes = sacredRunes(it).map((r) => r.toLowerCase());

                    const hasAllSelectedRunes = selectedRunes.every((r) =>
                        itemRunes.includes(r.toLowerCase())
                    );

                    if (!hasAllSelectedRunes) return false;
                }
            }

            if (tab === "affixes") {
                if (typeValue) {
                    const types = affixTypes(it);
                    if (!types.includes(typeValue)) return false;
                }

                if (affixTypeValue === "Suffix") {
                    if (!it?.suffix) return false;
                } else if (affixTypeValue === "Prefix") {
                    if (it?.suffix) return false;
                }
            }

            if (tab === "corruptions") {
                if (typeValue && n(it?.displayName) !== typeValue) {
                    return false;
                }
            }

            if (tab === "fatecards") {
                if (typeValue && n(it?.displayName) !== typeValue) {
                    return false;
                }
            }

            return true;
        });

        // 2) Extra sort for Affixes tab: sort by item type, then by name
        if (tab === "affixes") {
            const sorted = [...base].sort((a, b) => {
                // Build a textual key from all item types (e.g. "Amulets, Rings")
                const aTypes = affixTypes(a);
                const bTypes = affixTypes(b);

                const aKeyAll = aTypes.join(", ").toLowerCase();
                const bKeyAll = bTypes.join(", ").toLowerCase();

                // If a specific type is selected, you could prioritize it here,
                // but since the global filter already ensures it’s present,
                // we just sort alphabetically by the combined type string.
                const typeCmp = aKeyAll.localeCompare(bKeyAll);
                if (typeCmp !== 0) return typeCmp;

                // Tie-break by name for stable ordering
                const aName = (n(a?.name) || n(a?.displayName) || "").toLowerCase();
                const bName = (n(b?.name) || n(b?.displayName) || "").toLowerCase();

                return aName.localeCompare(bName);
            });

            return sorted;
        }

        // 3) Other tabs: just return filtered list as before
        return base;
    }, [items, tab, search, tierValue, typeValue, socketsValue, uberValue, hellforgedValue, highlightOnly, affixTypeValue, runeCountValue, selectedRunes]);

    // Mobile list rows expand in place. An expansion belongs to one `filtered` array, so any tab,
    // search or filter change (a new array) collapses it, with no reset effect to race the jumps.
    const [expanded, setExpanded] = useState({list: null, index: null});
    const expandedIndex = expanded.list === filtered ? expanded.index : null;
    // Expanding also selects the row, so widening to the desktop layout shows the row that was open.
    const toggleExpanded = (i) => {
        const collapsing = expandedIndex === i;
        setExpanded({list: filtered, index: collapsing ? null : i});
        if (!collapsing) setActiveIndex(i);
    };

    // Jumps (tier, unique, sacred and app: links) select and expand their target once its list has
    // settled. They wait for the target tab's data, then resolve in the render that has it.
    const [pendingExpandIndex, setPendingExpandIndex] = useState(null);
    if (pendingExpandIndex !== null) {
        setPendingExpandIndex(null);
        setExpanded({list: filtered, index: pendingExpandIndex});
    }

    if (pendingLinkTarget && tab === pendingLinkTarget.tab && !dataset.loading) {
        const targetName = pendingLinkTarget.name;

        const idx = filtered.findIndex((it) => {
            const nm = (n(it?.displayName) || n(it?.runewordName) || n(it?.name)).toLowerCase();

            return nm === targetName;
        });

        setPendingLinkTarget(null);
        if (idx >= 0) {
            setActiveIndex(idx);
            setPendingExpandIndex(idx);
        } else if (filtered.length) {
            setActiveIndex(0);
        }
    }

    if (pendingUniqueCode && tab === "uniques" && !dataset.loading) {
        const idx = dataset.data.findIndex((it) => n(it?.code) === pendingUniqueCode);

        setPendingUniqueCode("");
        if (idx >= 0) {
            setActiveIndex(idx);
            setPendingExpandIndex(idx);
        }
    }

    if (pendingSacredMatch && tab === "sacreds" && !sacreds.loading) {
        const {name, types} = pendingSacredMatch;

        const all = sacreds.data;
        const idx = all.findIndex((s) => {
            const sName = n(s?.displayName).toLowerCase();
            if (name && sName !== name) return false;

            const sTypes = sacredTypes(s).map((t) => t.toLowerCase());
            for (const t of types) {
                if (!sTypes.includes(t)) return false;
            }
            return true;
        });

        setPendingSacredMatch(null);
        if (idx >= 0) {
            setActiveIndex(idx);
            setPendingExpandIndex(idx);
        }
    }

    const activeItem = filtered[activeIndex] ?? null;

    function jumpToSacred(sacredName, itemTypes) {
        const name = n(sacredName);
        const types = Array.isArray(itemTypes) ? itemTypes.map((t) => n(t).toLowerCase()).filter(Boolean) : [];

        if (!name && !types.length) return;

        setTab("sacreds");

        setSearch("");
        setTypeValue("");
        setTierValue("");
        setSocketsValue("");
        setUberValue(false);
        setHellforgedValue(false);
        setHighlightOnly(false);

        setPendingSacredMatch({
            name: name.toLowerCase(), types,
        });
    }

    function jumpToCode(code) {
        const c = n(code);
        if (!c) return;

        setSearch("");
        setTypeValue("");
        setTierValue("");
        setSocketsValue("");
        setUberValue(false);
        setHellforgedValue(false);
        setHighlightOnly(false);

        const all = dataset.data;
        const idx = all.findIndex((it) => n(it?.code) === c);
        if (idx >= 0) {
            setActive({
                sig: activeSig({
                    ...filterState, search: "", tierValue: "", typeValue: "", socketsValue: "",
                    uberValue: false, hellforgedValue: false, highlightOnly: false,
                }),
                index: idx,
            });
            setPendingExpandIndex(idx);
        }
    }

    function jumpToUnique(code) {
        const c = n(code);
        if (!c) return;

        setTab("uniques");

        setSearch("");
        setTypeValue("");
        setTierValue("");
        setSocketsValue("");
        setUberValue(false);
        setHellforgedValue(false);
        setHighlightOnly(false);
        setPendingUniqueCode(c);
    }

    useEffect(() => {
        function onKeyDown(e) {

            if (e.key === "Escape") {
                if (tab === "cube") {
                    cubeSearchInputRef.current?.blur();
                } else if (tab === "changes") {
                    changesSearchInputRef.current?.blur();
                } else {
                    searchInputRef.current?.blur();
                }
            }

            if (e.ctrlKey && e.key === "f") {
                e.preventDefault();
                if (tab === "cube") {
                    if (cubeSearchInputRef.current) {
                        cubeSearchInputRef.current.focus();
                        cubeSearchInputRef.current.select();
                    }
                } else if (tab === "changes") {
                    if (changesSearchInputRef.current) {
                        changesSearchInputRef.current.focus();
                        changesSearchInputRef.current.select();
                    }
                } else {
                    if (searchInputRef.current) {
                        searchInputRef.current.focus();
                        searchInputRef.current.select();
                    }
                }
            }

            const tag = e.target?.tagName;
            if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

            // On mobile the arrows have no list selection to move; leave them to scroll the page.
            if (isMobile) return;

            if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
                return;
            }

            if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
                return;
            }
        }

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [tab, filtered.length, isMobile]);


    const subLabel = useMemo(() => {
        if (tab === "weapons") return (it) => weaponTypeLabel(it);
        if (tab === "armors") return (it) => armorTypeLabel(it);
        if (tab === "uniques") {
            return (it) => {
                const bt = uniqueBaseTypeLabelPretty(it) || uniqueBaseTypeLabel(it);
                const base = uniqueBase(it);
                const bn = n(base?.displayName) || n(base?.name);
                return bn ? `${bt}` : bt;
            };
        }
        if (tab === "sacreds") {
            return (it) => {
                const types = sacredTypes(it);
                return types.length ? types.join(" / ") : "Sacred";
            };
        }

        if (tab === "fatecards") {
            return () => {
                return "Fate Card";
            };
        }

        return (it) => {
            const types = runewordAllTypes(it);
            return types.length ? types.join(" / ") : "Runeword";
        };
    }, [tab]);

    const tinyLabel = useMemo(() => {
        if (tab === "weapons") {
            return (it) => {
                const parts = [];
                const dmg = weaponDmgLines(it);
                if (dmg.length) parts.push(`${dmg[0].k.replace(" Damage", "")}: ${dmg[0].v}`);
                if (nz(it?.requiredLevel)) parts.push(`Req Lvl ${n(it?.requiredLevel)}`);
                if (nz(it?.requiredStrength)) parts.push(`Str ${n(it?.requiredStrength)}`);
                if (nz(it?.requiredDexterity)) parts.push(`Dex ${n(it?.requiredDexterity)}`);
                if (nz(it?.maxSockets)) parts.push(`Sockets ${n(it?.maxSockets)}`);
                if (has(it?.itemTier)) parts.push(`Tier ${n(it?.itemTier)}`);
                return parts.join(" • ");
            };
        }

        if (tab === "armors") {
            return (it) => {
                const parts = [];
                const def = armorDefenseLine(it);
                if (has(def)) parts.push(`Defense: ${def}`);
                if (nz(it?.block)) parts.push(`Block ${n(it?.block)}%`);
                if (nz(it?.maxSockets)) parts.push(`Sockets ${n(it?.maxSockets)}`);
                if (nz(it?.requiredLevel)) parts.push(`Req Lvl ${n(it?.requiredLevel)}`);
                if (nz(it?.requiredStrength)) parts.push(`Str ${n(it?.requiredStrength)}`);
                if (has(it?.itemTier)) parts.push(`Tier ${n(it?.itemTier)}`);
                return parts.join(" • ");
            };
        }

        if (tab === "runewords") {
            return (it) => {
                const runes = [n(it?.firstRune), n(it?.secondRune), n(it?.thirdRune), n(it?.fourthRune), n(it?.fifthRune), n(it?.sixthRune),].filter(Boolean);

                const count = runes.length ? `${runes.length} runes` : "";
                const props = Array.isArray(it?.displayProperties) ? it.displayProperties.filter(Boolean).length : 0;
                return [count, props ? `${props} mods` : ""].filter(Boolean).join(" • ");
            };
        }

        if (tab === "sacreds") {
            return (it) => {
                const ing = sacredIngredients(it);
                const map = it?.propertiesByItemType && typeof it.propertiesByItemType === "object" ? it.propertiesByItemType : {};
                const typeCount = Object.keys(map).length;
                return [ing.length ? `${ing.length} inputs` : "", typeCount ? `${typeCount} type variants` : "",].filter(Boolean).join(" • ");
            };
        }

        return (it) => {
            const parts = [];
            if (nz(it?.requiredLevel)) parts.push(`Req Lvl ${n(it?.requiredLevel)}`);
            if (has(it?.level)) parts.push(`Quality Lvl ${n(it?.level)}`);
            if (has(it?.itemTier)) parts.push(`Tier ${n(it?.itemTier)}`);
            return parts.join(" • ");
        };
    }, [tab]);

    // An item's details: desktop shows them in TooltipShell, mobile under the expanded row.
    const renderTooltip = (item) => {
        if (tab === "weapons") return <WeaponTooltip w={item} onGoCode={jumpToCode} onGoUnique={jumpToUnique}/>;
        if (tab === "armors") return <ArmorTooltip a={item} onGoCode={jumpToCode} onGoUnique={jumpToUnique}/>;
        if (tab === "runewords") return <RunewordTooltip rw={item} onGoSacred={jumpToSacred} onLink={handleMarkdownAppLink}/>;
        if (tab === "uniques") return <UniqueTooltip u={item} onLink={handleMarkdownAppLink} openDropCalculator={openDropCalculator}/>;
        if (tab === "sacreds") return <SacredTooltip s={item} onLink={handleMarkdownAppLink}/>;
        if (tab === "fatecards") return <FateCardTooltip card={item}/>;
        return null;
    };

    const countLabel = dataset.loading ? "Loading…" : dataset.error ? `Error: ${dataset.error.message}` : `${filtered.length} items`;
    const showSockets = tab === "weapons" || tab === "armors";
    const typePlaceholder = tab === "uniques" ? "All base types" : (tab === "runewords" || tab === "sacreds") ? "All item types" : "All types";

    return (<div className="appRoot">
        <div className="wrap">
            {isMobile ? (
                <MobileTabsBar key={tab} tab={tab} setTab={setTab} damnationMode={damnationMode}
                               toggleDamnationMode={toggleDamnationMode}/>
            ) : (
                <TabsBar tab={tab} setTab={setTab} damnationMode={damnationMode}
                         toggleDamnationMode={toggleDamnationMode}/>
            )}

            <ErrorBoundary resetKey={tab}>
            {tab === "help" ? (<HelpPanel/>) : tab === "calculators" ? (<>
                    <div className="calcWide">
                        <div className="panels">
                            <AuraEffectCalculator/>
                            <CurseEffectCalculator/>
                        </div>
                    </div>
                </>
            ) : tab === "dropcalc" ? (
                <DropCalculatorPanel
                    request={dropCalculatorRequest}
                    clearRequest={() => setDropCalculatorRequest(null)}
                    damnationMode={damnationMode}
                />
            ) : tab === "kiln" ? (<>
                <div className="filtersStack">
                    <div className="filtersPanel">
                        <input
                            type="text"
                            ref={kilnSearchInputRef}
                            value={kilnSearch}
                            onChange={(e) => setKilnSearch(e.target.value)}
                            className="searchBar"
                            placeholder="Search..."
                        />
                    </div>
                </div>
                <StaticDataPanel
                    data={kiln.data}
                    loading={kiln.loading}
                    error={kiln.error}
                    search={kilnSearch}
                    onLink={handleMarkdownAppLink}
                />
            </>) : tab === "cube" ? (<>
                <div className="filtersStack">
                    <div className="filtersPanel">
                        <input
                            type="text"
                            ref={cubeSearchInputRef}
                            value={cubeSearch}
                            onChange={(e) => setCubeSearch(e.target.value)}
                            className="searchBar"
                            placeholder="Search cube recipes…"
                        />
                    </div>
                </div>
                <StaticDataPanel
                    data={cube.data}
                    loading={cube.loading}
                    error={cube.error}
                    search={cubeSearch}
                    onLink={handleMarkdownAppLink}
                />
            </>) : tab === "ascendancies" ? (<>
                <div className="filtersStack">
                    <div className="filtersPanel">
                        <input
                            type="text"
                            ref={ascendanciesSearchInputRef}
                            value={ascendanciesSearch}
                            onChange={(e) => setAscendanciesSearch(e.target.value)}
                            className="searchBar"
                            placeholder="Search..."
                        />
                    </div>
                </div>
                <StaticDataPanel
                    data={ascendancies.data}
                    loading={ascendancies.loading}
                    error={ascendancies.error}
                    search={ascendanciesSearch}
                    onLink={handleMarkdownAppLink}
                />
            </>) : tab === "mapping" ? (<>
                <div className="filtersStack">
                    <div className="filtersPanel">
                        <input
                            type="text"
                            ref={mappingSearchInputRef}
                            value={mappingSearch}
                            onChange={(e) => setMappingSearch(e.target.value)}
                            className="searchBar"
                            placeholder="Search..."
                        />
                    </div>
                </div>
                <StaticDataPanel
                    data={mapping.data}
                    loading={mapping.loading}
                    error={mapping.error}
                    search={mappingSearch}
                    onLink={handleMarkdownAppLink}
                />
            </>) : tab === "corruptions" ? (<>
                <div className="filtersStack">
                    <FiltersBar
                        key={tab}
                        search={search}
                        setSearch={setSearch}
                        typeValue={typeValue}
                        setTypeValue={setTypeValue}
                        tierValue={tierValue}
                        setTierValue={setTierValue}
                        socketsValue={socketsValue}
                        setSocketsValue={setSocketsValue}
                        uberValue={uberValue}
                        setUberValue={setUberValue}
                        hellforgedValue={hellforgedValue}
                        setHellforgedValue={setHellforgedValue}
                        types={typeOptions}
                        tiers={tierOptions}
                        showSockets={showSockets}
                        showUber={tab === "uniques"}
                        typePlaceholder={typePlaceholder}
                        searchInputRef={searchInputRef}
                        showTier={tab !== "runewords" && tab !== "sacreds" && tab !== "affixes" && tab !== "corruptions" && tab !== "fatecards"}
                        showHighlight={tab === "uniques" || tab === "runewords" || tab === "weapons" || tab === "armors"}
                        highlightOnly={highlightOnly}
                        setHighlightOnly={setHighlightOnly}
                        showAffixType={tab === "affixes"}
                        affixTypeValue={affixTypeValue}
                        setAffixTypeValue={setAffixTypeValue}
                        showHellforged={tab === "uniques"}
                    />
                </div>
                <div className="affixPanel corruptionsPanel">
                    <CorruptionsTable items={filtered}/>
                </div>
            </>) : tab === "skills" ? (<>
                <div className="filtersStack">
                    <div className="filtersPanel">
                        <input
                            type="text"
                            ref={skillsSearchInputRef}
                            value={skillsSearch}
                            onChange={(e) => setSkillsSearch(e.target.value)}
                            className="searchBar"
                            placeholder="Search skills…"
                        />
                    </div>
                </div>
                <StaticDataPanel
                    data={skills.data}
                    loading={skills.loading}
                    error={skills.error}
                    search={skillsSearch}
                    onLink={handleMarkdownAppLink}
                />
            </>) : tab === "affixes" ? (<>
                <div className="filtersStack">
                    <FiltersBar
                        key={tab}
                        search={search}
                        setSearch={setSearch}
                        typeValue={typeValue}
                        setTypeValue={setTypeValue}
                        tierValue={tierValue}
                        setTierValue={setTierValue}
                        socketsValue={socketsValue}
                        setSocketsValue={setSocketsValue}
                        uberValue={uberValue}
                        setUberValue={setUberValue}
                        hellforgedValue={hellforgedValue}
                        setHellforgedValue={setHellforgedValue}
                        types={typeOptions}
                        tiers={tierOptions}
                        showSockets={showSockets}
                        showUber={tab === "uniques"}
                        typePlaceholder={typePlaceholder}
                        searchInputRef={searchInputRef}
                        showTier={tab !== "runewords" && tab !== "sacreds" && tab !== "affixes" && tab !== "fatecards"}
                        showHighlight={tab === "uniques" || tab === "runewords" || tab === "weapons" || tab === "armors"}
                        highlightOnly={highlightOnly}
                        setHighlightOnly={setHighlightOnly}
                        showAffixType={tab === "affixes"}
                        affixTypeValue={affixTypeValue}
                        setAffixTypeValue={setAffixTypeValue}
                        showHellforged={tab === "uniques"}
                    />
                    <InfoPanel
                        title={info.title}
                        markdownText={info.text}
                        isOpen={infoOpen}
                        onLink={handleMarkdownAppLink}
                        onToggle={() => setInfoOpenByTab((prev) => {
                            const next = {...prev, [tab]: !prev[tab]};
                            try {
                                window.localStorage.setItem(INFO_OPEN_STORAGE_KEY, JSON.stringify(next));
                            } catch (e) {
                                console.warn("Failed to save info panel state", e);
                            }
                            return next;
                        })}
                    />
                </div>
                <AffixesPanel
                    data={filtered}
                    loading={affixes.loading}
                    error={affixes.error}
                    sort={affixSort}
                    onChangeSort={changeAffixSort}
                    multi={affixMulti}
                    onChangeMulti={changeAffixMulti}
                />
            </>) : tab === "damnation" ? (<>
                <StaticDataPanel
                    data={damnation.data}
                    loading={damnation.loading}
                    error={damnation.error}
                    onLink={handleMarkdownAppLink}
                />
            </>) : tab === "changes" ? (<>
                <div className="filtersStack">
                    <div className="filtersPanel">
                        <input
                            type="text"
                            ref={changesSearchInputRef}
                            value={changesSearch}
                            onChange={(e) => setChangesSearch(e.target.value)}
                            className="searchBar"
                            placeholder="Search SoE changes…"
                        />
                    </div>
                </div>
                <StaticDataPanel
                    data={standard.data}
                    loading={standard.loading}
                    error={standard.error}
                    search={changesSearch}
                    onLink={handleMarkdownAppLink}
                />
            </>) : tab === "changelog" ? (<>
                <StaticDataPanel
                    data={changelog.data}
                    loading={changelog.loading}
                    error={changelog.error}
                />
            </>) : (<>
                <div className="filtersStack">
                    <FiltersBar
                        search={search}
                        setSearch={setSearch}
                        typeValue={typeValue}
                        setTypeValue={setTypeValue}
                        tierValue={tierValue}
                        setTierValue={setTierValue}
                        socketsValue={socketsValue}
                        setSocketsValue={setSocketsValue}
                        uberValue={uberValue}
                        setUberValue={setUberValue}
                        hellforgedValue={hellforgedValue}
                        setHellforgedValue={setHellforgedValue}
                        types={typeOptions}
                        tiers={tierOptions}
                        showSockets={showSockets}
                        showUber={tab === "uniques"}
                        showHellforged={tab === "uniques"}
                        typePlaceholder={typePlaceholder}
                        searchInputRef={searchInputRef}
                        showType={tab !== "fatecards"}
                        showTier={tab !== "runewords" && tab !== "sacreds" && tab !== "fatecards"}
                        showHighlight={tab === "uniques" || tab === "runewords" || tab === "weapons" || tab === "armors"}
                        highlightOnly={highlightOnly}
                        setHighlightOnly={setHighlightOnly}
                        showRuneCount={tab === "runewords"}
                        runeCountValue={runeCountValue}
                        setRuneCountValue={setRuneCountValue}
                        key={tab}
                        extraActiveCount={selectedRunes.length ? 1 : 0}
                    />
                    {(tab === "runewords" || tab === "sacreds") && (
                        <div className="runeFilterPanel">
                            <div className="runeFilterHeader">
                                <div className="runeFilterTitle">
                                    Rune Filter
                                    {selectedRunes.length ? ` (${selectedRunes.length})` : ""}
                                </div>

                                <div className="runeFilterActions">
                                    {selectedRunes.length > 0 && (
                                        <button
                                            type="button"
                                            className="btn runeFilterClear"
                                            onClick={() => setSelectedRunes([])}
                                        >
                                            Clear
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        className="infoToggle"
                                        onClick={() => setShowRuneFilterBar((v) => !v)}
                                    >
                                        {showRuneFilterBar ? "Hide" : "Show"}
                                    </button>
                                </div>
                            </div>

                            {showRuneFilterBar && (
                                <div className="runeGrid">
                                    {ALL_RUNES.map((rune) => {
                                        const active = selectedRunes.includes(rune);

                                        return (
                                            <button
                                                key={rune}
                                                type="button"
                                                className={`runeChip${active ? " active" : ""}`}
                                                onClick={() => toggleRuneFilter(rune)}
                                            >
                                                <img src={RuneIcon} alt="" className="runeChipIcon"/>
                                                <span>{rune}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                    <InfoPanel
                        title={info.title}
                        markdownText={info.text}
                        isOpen={infoOpen}
                        onLink={handleMarkdownAppLink}
                        onToggle={() => setInfoOpenByTab((prev) => {
                            const next = {...prev, [tab]: !prev[tab]};
                            try {
                                window.localStorage.setItem(INFO_OPEN_STORAGE_KEY, JSON.stringify(next));
                            } catch (e) {
                                console.warn("Failed to save info panel state", e);
                            }
                            return next;
                        })}
                    />
                </div>

                <ListPanel
                    tab={tab}
                    title={<TabTitle tab={tab}/>}
                    countLabel={countLabel}
                    items={filtered}
                    activeIndex={activeIndex}
                    setActiveIndex={setActiveIndex}
                    subLabel={subLabel}
                    tinyLabel={tinyLabel}
                    mobile={isMobile}
                    expandedIndex={expandedIndex}
                    onToggleExpanded={toggleExpanded}
                    renderDetail={renderTooltip}
                />

                {!isMobile && <TooltipShell>{renderTooltip(activeItem)}</TooltipShell>}
            </>)}
            </ErrorBoundary>
        </div>

        <footer className="footer">
            <div className="footerInner">
                    <span className="footerLeft">by <a className="footerGitLink" target="_blank"
                                                       href="https://github.com/Lukaszpg">MindH1ve</a></span>

                <a
                    className="footerRight"
                    href={LATEST_RELEASE}
                    target="_blank"
                    style={{cursor: "pointer"}}
                >Mod version: v{GAME_VERSION}</a>

                <span
                    className="footerRight"
                    onClick={handleVersionClick}
                    style={{cursor: "pointer"}}
                >Wiki version: v{APP_VERSION}</span>
            </div>
        </footer>

        {showTopButton && (
            <button
                type="button"
                className="goTopBtn"
                onClick={goToTop}
                aria-label="Go to top"
                title="Go to top"
            >
                ↑
            </button>
        )}
    </div>);
}