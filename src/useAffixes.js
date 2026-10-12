// The Affixes tab's data, owned by App: Affixes.json is fetched the first time the tab opens, and the
// result is taken in the promise's callbacks (never synchronously in the effect), like useItemBuilder.
import {useEffect, useState} from "react";
import {loadAffixes} from "./affixesLoad.js";

export function useAffixes(tab) {
    const [file, setFile] = useState(null);
    const [error, setError] = useState("");
    const active = tab === "affixes";

    // retry() clears the error, which runs the effect again.
    useEffect(() => {
        if (!active || file || error) return undefined;
        let live = true;
        loadAffixes().then(
            (f) => {
                if (live) setFile(f);
            },
            (e) => {
                if (live) setError(e instanceof Error ? e.message : String(e));
            },
        );
        return () => {
            live = false;
        };
    }, [active, file, error]);

    return {
        status: file ? "ready" : error ? "error" : "loading",
        data: file,
        error,
        retry: () => setError(""),
    };
}
