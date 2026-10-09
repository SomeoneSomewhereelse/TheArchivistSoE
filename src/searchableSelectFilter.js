// The filter behind SearchableSelect. An options array may hold heading entries `{group: "Axes"}` (no
// `value`) followed by that group's options. With a query, a group whose label matches lists all of its
// options; otherwise only the options whose own label matches are listed. A heading shows only when it
// matched or has a listed option. Options before any heading, and lists with no headings at all, match
// by their own label.
export function filterOptions(options, query) {
    const q = (query ?? "").trim().toLowerCase();
    if (!q) return options;
    const matches = (text) => (text || "").toLowerCase().includes(q);
    const out = [];
    let heading = null;
    let headingMatched = false;
    let headingShown = false;
    for (const opt of options) {
        if (opt.group !== undefined) {
            heading = opt;
            headingMatched = matches(opt.group);
            headingShown = false;
        } else if (heading === null ? matches(opt.label) : headingMatched || matches(opt.label)) {
            if (heading !== null && !headingShown) {
                out.push(heading);
                headingShown = true;
            }
            out.push(opt);
        }
    }
    return out;
}

// Keyboard navigation. The "active" option is an index into the (filtered) options array; headings
// (`group` entries) are never active. -1 means no selectable option.
export const selectableIndexes = (options) =>
    options.flatMap((o, i) => (o.group === undefined ? [i] : []));

// On open: the current value's option when it is listed, else the first selectable one.
export function initialActive(options, value) {
    const idx = selectableIndexes(options);
    const hit = idx.find((i) => String(options[i].value) === String(value));
    return hit ?? idx[0] ?? -1;
}

// The active index after a navigation key. ArrowDown/ArrowUp step through selectable options with wrap
// (from no active option: Down picks the first, Up the last), Home/End jump to the ends, any other key
// leaves `current` alone.
export function nextActive(options, current, key) {
    const idx = selectableIndexes(options);
    if (idx.length === 0) return -1;
    if (key === "Home") return idx[0];
    if (key === "End") return idx[idx.length - 1];
    if (key !== "ArrowDown" && key !== "ArrowUp") return current;
    // Next selectable after / before `current` (which may be -1 or a heading), wrapping around.
    if (key === "ArrowDown") return idx.find((i) => i > current) ?? idx[0];
    return idx.findLast((i) => i < current) ?? idx[idx.length - 1];
}
