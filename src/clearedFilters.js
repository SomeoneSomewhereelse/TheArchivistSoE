// The item-list filters at their cleared values (the keys of App's filterState except `tab`). Every path
// that wipes the filters (a tab change, the jump-to-item flows) goes through this one list, so a new filter
// can't be cleared by some paths and forgotten by others; a test pins the keys to the filter state's.
export const CLEARED_FILTERS = Object.freeze({
    search: "",
    tierValue: "",
    typeValue: "",
    socketsValue: "",
    uberValue: false,
    hellforgedValue: false,
    highlightOnly: false,
    affixTypeValue: "",
    statValue: "",
    runeCountValue: "",
    selectedRunes: Object.freeze([]),
});
