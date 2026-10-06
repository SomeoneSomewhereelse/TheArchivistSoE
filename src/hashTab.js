// Keeps the current tab in the URL hash (#/<tabKey>) so tabs can be linked and Back/Forward work.
import {useEffect, useLayoutEffect, useState} from "react";

export function hashForTab(tab) {
    return `#/${tab}`;
}

// The tab named by a "#/<key>" hash, or null when the hash is empty, malformed or names no valid tab.
export function parseTabFromHash(hash, validKeys) {
    const match = /^#\/([^/?#]+)$/.exec(hash ?? "");
    return match && validKeys.includes(match[1]) ? match[1] : null;
}

// How the hash must change to name `tab`: "push" a history entry, "replace" the current one (an empty
// or unknown hash is just normalised in place), or null when there is nothing to write.
export function hashWriteAction(currentHash, tab, validKeys) {
    if (currentHash === hashForTab(tab) || !validKeys.includes(tab)) return null;
    return parseTabFromHash(currentHash, validKeys) ? "push" : "replace";
}

// Tab state synced with location.hash in both directions. The write keys off the tab state itself,
// so every path that changes the tab (clicks, jumps, links) updates the URL. It only writes when the
// hash differs, which keeps popstate and StrictMode's double effects from adding duplicate entries.
// It runs in a layout effect, in the same task as the commit, so a quick second Back can't land
// between the render and the write. `validKeys` must be a stable array (a module-level constant).
export function useHashTab(validKeys, fallback) {
    const [tab, setTab] = useState(() => parseTabFromHash(window.location.hash, validKeys) ?? fallback);

    useLayoutEffect(() => {
        const action = hashWriteAction(window.location.hash, tab, validKeys);
        if (action === "push") window.history.pushState(null, "", hashForTab(tab));
        else if (action === "replace") window.history.replaceState(null, "", hashForTab(tab));
    }, [tab, validKeys]);

    useEffect(() => {
        const onPopState = () => {
            const next = parseTabFromHash(window.location.hash, validKeys);
            if (next === null) window.history.replaceState(null, "", hashForTab(fallback));
            setTab(next ?? fallback);
        };
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, [validKeys, fallback]);

    return [tab, setTab];
}
