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
