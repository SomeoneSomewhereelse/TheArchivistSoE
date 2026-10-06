// The tab list: titles, the mobile sheet's groups, and the tab keys the URL hash may name.

export const TABS = {
    weapons: "Weapons",
    armors: "Armors",
    uniques: "Uniques",
    runewords: "Runewords",
    affixes: "Affixes",
    sacreds: "Sacreds",
    corruptions: {
        title: "Corruptions",
        badge: "Beta"
    },
    skills: "Skills",
    cube: "Cube Recipes",
    changes: "Standard Mode",
    help: "Help",
    changelog: "Changelog",
    calculators: "Skill Calculators",
    dropcalc: {
        title: "Drop calculator",
        badge: "Alpha"
    },
    damnation: {
        title: "Damnation Mode",
        badge: "Beta"
    },
    ascendancies: "Ascendancies",
    mapping: "Mapping",
    fatecards: "Fate Cards",
    kiln: "Infernal Kiln",
    essences: "Essences"
};

// The tab sheet's groups on mobile (every tab except Changelog, which the footer opens).
export const TAB_GROUPS = [
    {title: "Items", keys: ["weapons", "armors", "uniques", "runewords", "sacreds", "fatecards"]},
    {title: "Mechanics", keys: ["affixes", "skills", "ascendancies", "corruptions", "mapping", "kiln", "cube"]},
    {title: "Tools", keys: ["calculators", "dropcalc"]},
    {title: "About", keys: ["changes", "damnation", "help"]},
];

// Tabs the URL hash may name. Not Object.keys(TABS): "essences" has no panel.
export const VALID_TAB_KEYS = [...TAB_GROUPS.flatMap((g) => g.keys), "changelog"];
