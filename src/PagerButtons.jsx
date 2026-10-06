import React from "react";

// Prev / page / Next controls shared by the three paged tables (see usePager in pager.js). The bottom
// copy (mobile only, via CSS) passes scrollTargetRef so a page change scrolls back to the top of the table.
export default function PagerButtons({label, canPrev, canNext, onPrev, onNext, ghost = false, scrollTargetRef = null}) {
    const btnClass = ghost ? "btn ghost affixPagerBtn" : "btn affixPagerBtn";
    const go = (fn) => () => {
        fn();
        scrollTargetRef?.current?.scrollIntoView({block: "start"});
    };

    return (<div className="affixPagerRight">
        <button type="button" className={btnClass} disabled={!canPrev} onClick={go(onPrev)}>
            ‹ Prev
        </button>
        <span className="affixPagerInfo">{label}</span>
        <button type="button" className={btnClass} disabled={!canNext} onClick={go(onNext)}>
            Next ›
        </button>
    </div>);
}
