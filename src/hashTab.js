// Keeps the current tab in the URL hash (#/<tabKey>) so tabs can be linked and Back/Forward work.
import {useEffect, useState} from "react";

export function hashForTab(tab) {
    return `#/${tab}`;
}

// The tab named by a "#/<key>" hash, or null when the hash is empty, malformed or names no valid tab.
export function parseTabFromHash(hash, validKeys) {
    const match = /^#\/([^/?#]+)$/.exec(hash ?? "");
    return match && validKeys.includes(match[1]) ? match[1] : null;
}

// Tab state synced with location.hash in both directions. The effect keys off the tab state itself,
// so every path that changes the tab (clicks, jumps, links) updates the URL. It only writes when the
// hash differs, which keeps popstate and StrictMode's double effects from adding duplicate entries.
// `validKeys` must be a stable array (a module-level constant).
export function useHashTab(validKeys, fallback) {
    const [tab, setTab] = useState(() => parseTabFromHash(window.location.hash, validKeys) ?? fallback);

    useEffect(() => {
        const target = hashForTab(tab);
        if (window.location.hash === target || !validKeys.includes(tab)) return;

        // Leaving a valid tab is a real navigation; an empty or unknown hash is just normalised in place.
        if (parseTabFromHash(window.location.hash, validKeys)) {
            window.history.pushState(null, "", target);
        } else {
            window.history.replaceState(null, "", target);
        }
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
