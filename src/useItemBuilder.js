// The Item Builder's state, owned by App (spec "State ownership"). The build lives in the URL query
// (useHashTab); this hook loads the data the first time the tab opens, decodes the query during render,
// and replaces a dirty query with its cleaned form, also during render. That is legal because the query
// and the notice are both App's own state, and it converges because a clean query decodes to itself.
import {useEffect, useMemo, useState} from "react";
import {controlNotice, decodeBuildQuery, encodeBuildQuery} from "./itemBuilderHash.js";
import {loadItemBuilder} from "./itemBuilderLoad.js";
import {resolveBuild} from "./itemBuilderRules.js";
import {ITEM_BUILDER_TAB} from "./tabList.js";

export function useItemBuilder({tab, query, setQuery}) {
    const [model, setModel] = useState(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState(null);
    const active = tab === ITEM_BUILDER_TAB;

    // Starts the download the first time the tab is open; retry() clears the error to run it again.
    useEffect(() => {
        if (!active || model || error) return undefined;
        let live = true;
        loadItemBuilder().then(
            (m) => {
                if (live) setModel(m);
            },
            (e) => {
                if (live) setError(e instanceof Error ? e.message : String(e));
            },
        );
        return () => {
            live = false;
        };
    }, [active, model, error]);

    // A notice belongs to the visit that produced it.
    const [prevTab, setPrevTab] = useState(tab);
    if (tab !== prevTab) {
        setPrevTab(tab);
        if (notice) setNotice(null);
    }

    const decoded = useMemo(() => (model ? decodeBuildQuery(model, query) : null), [model, query]);
    if (decoded) {
        const clean = encodeBuildQuery(model, decoded.build);
        if (clean !== query) {
            setQuery(clean);
            setNotice(decoded.notice);
        }
    }

    const setBuild = (next) => {
        const {build, dropped} = resolveBuild(model, next);
        setQuery(encodeBuildQuery(model, build));
        setNotice(controlNotice(dropped));
    };

    return {
        status: model ? "ready" : error ? "error" : "loading",
        error,
        retry: () => setError(""),
        model,
        build: decoded?.build ?? null,
        notice,
        setBuild,
    };
}
