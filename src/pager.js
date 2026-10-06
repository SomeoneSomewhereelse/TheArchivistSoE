// Paging for the long tables (Affixes, Corruptions, Drop calculator results).
import {useState} from "react";

export const PAGE_SIZE = 50;

// Everything a table needs to render one page. `page` is 0-based and clamped into range; only the
// label counts from 1. An empty list is one empty page.
export function pagerState({page, itemCount, pageSize = PAGE_SIZE}) {
    const pageCount = Math.max(1, Math.ceil(itemCount / pageSize));
    const safePage = Math.min(Math.max(page, 0), pageCount - 1);
    const start = safePage * pageSize;

    return {
        page: safePage,
        pageCount,
        start,
        end: Math.min(start + pageSize, itemCount),
        label: `Page ${safePage + 1} / ${pageCount}`,
        canPrev: safePage > 0,
        canNext: safePage < pageCount - 1,
    };
}

// Page state plus the props <PagerButtons/> takes. The page goes back to the first whenever `resetKey`
// (the rows array, or whatever they derive from) changes identity. Slice rows with `start`/`end`.
export function usePager(itemCount, {resetKey, pageSize = PAGE_SIZE, ghost = false} = {}) {
    const [page, setPage] = useState(0);
    const [prevResetKey, setPrevResetKey] = useState(resetKey);
    if (resetKey !== prevResetKey) {
        setPrevResetKey(resetKey);
        setPage(0);
    }

    const state = pagerState({page, itemCount, pageSize});

    return {
        ...state,
        pagerProps: {
            label: state.label,
            canPrev: state.canPrev,
            canNext: state.canNext,
            onPrev: () => setPage(Math.max(0, state.page - 1)),
            onNext: () => setPage(Math.min(state.pageCount - 1, state.page + 1)),
            ghost,
        },
    };
}
