// Keeps the current tab in the URL hash (#/<tabKey>) so tabs can be linked and Back/Forward work. Tabs
// listed in `queryTabs` may also carry a query (#/<tabKey>?<query>), held in the hook's state: the Item
// Builder keeps its build there. The query belongs to the listed tab (one today) and survives visits
// to other tabs.
import {useEffect, useLayoutEffect, useState} from "react";

const NO_QUERY_TABS = [];

export function hashForTab(tab, query = "") {
    return query ? `#/${tab}?${query}` : `#/${tab}`;
}

// {tab, query} for "#/<key>" or "#/<key>?<query>", or null when the hash is empty, malformed, names no
// valid tab, or carries a query for a tab that doesn't take one. query is "" when absent.
export function parseHash(hash, validKeys, queryTabs = NO_QUERY_TABS) {
    const match = /^#\/([^/?#]+)(?:\?([^#]*))?$/.exec(hash ?? "");
    if (!match || !validKeys.includes(match[1])) return null;
    if (match[2] !== undefined && !queryTabs.includes(match[1])) return null;
    return {tab: match[1], query: match[2] ?? ""};
}

// The tab named by the hash, or null (see parseHash).
export function parseTabFromHash(hash, validKeys, queryTabs = NO_QUERY_TABS) {
    return parseHash(hash, validKeys, queryTabs)?.tab ?? null;
}

// The hash that names `tab`, with `query` when the tab takes one.
export function targetHash(tab, query, queryTabs = NO_QUERY_TABS) {
    return hashForTab(tab, queryTabs.includes(tab) ? query : "");
}

// How the hash must change to name `tab` (and its query): "push" a history entry when the tab changes,
// "replace" the current one when only the query changes or the hash is empty/unknown, or null when
// there is nothing to write. Picks in the Item Builder replace, so they don't flood Back.
export function hashWriteAction(currentHash, tab, validKeys, query = "", queryTabs = NO_QUERY_TABS) {
    if (!validKeys.includes(tab) || currentHash === targetHash(tab, query, queryTabs)) return null;
    const current = parseTabFromHash(currentHash, validKeys, queryTabs);
    return current && current !== tab ? "push" : "replace";
}

// Tab (and query) state synced with location.hash in both directions. The write keys off the state
// itself, so every path that changes the tab (clicks, jumps, links) updates the URL. It only writes
// when the hash differs, which keeps popstate and StrictMode's double effects from adding duplicate
// entries. It runs in a layout effect, in the same task as the commit, so a quick second Back can't
// land between the render and the write. `validKeys` and `queryTabs` must be stable arrays
// (module-level constants).
export function useHashTab(validKeys, fallback, queryTabs = NO_QUERY_TABS) {
    const [tab, setTab] = useState(() => parseTabFromHash(window.location.hash, validKeys, queryTabs) ?? fallback);
    const [query, setQuery] = useState(() => parseHash(window.location.hash, validKeys, queryTabs)?.query ?? "");

    useLayoutEffect(() => {
        const action = hashWriteAction(window.location.hash, tab, validKeys, query, queryTabs);
        const hash = targetHash(tab, query, queryTabs);
        if (action === "push") window.history.pushState(null, "", hash);
        else if (action === "replace") window.history.replaceState(null, "", hash);
    }, [tab, query, validKeys, queryTabs]);

    useEffect(() => {
        const onPopState = () => {
            const next = parseHash(window.location.hash, validKeys, queryTabs);
            if (next === null) window.history.replaceState(null, "", hashForTab(fallback));
            setTab(next?.tab ?? fallback);
            // Only a hash naming a query tab carries its query; Back onto another tab keeps the build.
            if (next && queryTabs.includes(next.tab)) setQuery(next.query);
        };
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, [validKeys, fallback, queryTabs]);

    return [tab, setTab, query, setQuery];
}
