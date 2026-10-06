// A table whose header row stays visible while the page scrolls (Affixes, Corruptions, Drop calculator).
// The real <thead> stays inside .affixTableScroll, where native sticky still covers the desktop box's own
// scroll. A position: fixed, aria-hidden copy of the same header row shows under the stick line once the
// real one has scrolled away; the same `head` element is rendered twice, so sorting and Tips work on both.
import React from "react";
import {floatingHeadVisible} from "./stickyHead.js";

// Keeps the copy's position, column widths, horizontal scroll and visibility in step with the real
// table. Plain DOM work outside React (no state, no re-renders); returns the cleanup.
function attachFloatingHead({scroller, table, realHead, copy}) {
    const copyTable = copy.querySelector("table");
    let cssTop = 0;

    // CSS decides the line (top: var(--topbar-h, 0px)); it computes even while the copy is display: none.
    function readCssTop() {
        copy.style.top = "";
        cssTop = parseFloat(getComputedStyle(copy).top) || 0;
    }

    function sync() {
        // All reads first, then all writes, so each call lays out once.
        const box = scroller.getBoundingClientRect();
        const tableRect = table.getBoundingClientRect();
        const headRect = realHead.getBoundingClientRect();
        const widths = Array.from(realHead.rows[0].cells, (cell) => cell.getBoundingClientRect().width);
        // On mobile the pinned top bar's real height wins when it is taller than --topbar-h (a min-height;
        // a 900px-wide desktop window renders it 53px tall), so the copy never sits under the bar.
        const bar = cssTop > 0 ? document.querySelector(".tabsPanel") : null;
        // Pinch-zoomed in, `position: fixed` stays in the layout viewport and pans out of view with it (the
        // top bar does too), so the line follows the visible area's top instead.
        const vv = window.visualViewport;
        const zoomed = vv && vv.scale > 1.01;
        const stickTop = zoomed ? vv.offsetTop : Math.max(cssTop, bar ? bar.offsetHeight : 0);
        const visible = floatingHeadVisible({
            headTop: headRect.top,
            headHeight: headRect.height,
            tableEnd: Math.min(box.bottom, tableRect.bottom),
            stickTop,
        });

        copy.style.top = stickTop === cssTop ? "" : `${stickTop}px`;
        copy.style.left = `${box.left}px`;
        copy.style.width = `${scroller.clientWidth}px`;
        copy.style.setProperty("--copy-scroll", `${scroller.scrollLeft}px`);
        copyTable.style.width = `${tableRect.width}px`;
        const cells = copyTable.tHead.rows[0].cells;
        widths.forEach((width, i) => {
            cells[i].style.width = `${width}px`;
            cells[i].style.minWidth = `${width}px`;
        });
        // Safe: React renders the copy's className as a constant, so it never rewrites this attribute.
        copy.classList.toggle("on", visible);
    }

    function onResize() {
        readCssTop(); // crossing the 980px breakpoint moves the line
        sync();
    }

    // Only the real table is observed; the copy's own writes can't feed back into the observer.
    const observer = new ResizeObserver(sync);
    observer.observe(scroller);
    observer.observe(table);
    for (const cell of realHead.rows[0].cells) observer.observe(cell);
    window.addEventListener("scroll", sync, {passive: true});
    window.addEventListener("resize", onResize);
    scroller.addEventListener("scroll", sync, {passive: true});
    window.visualViewport?.addEventListener("scroll", sync);
    window.visualViewport?.addEventListener("resize", sync);
    readCssTop();
    sync();

    return () => {
        observer.disconnect();
        window.removeEventListener("scroll", sync);
        window.removeEventListener("resize", onResize);
        scroller.removeEventListener("scroll", sync);
        window.visualViewport?.removeEventListener("scroll", sync);
        window.visualViewport?.removeEventListener("resize", sync);
    };
}

export default function StickyHeadTable({className, head, children}) {
    const scrollerRef = React.useRef(null);
    const tableRef = React.useRef(null);
    const headRef = React.useRef(null);
    const copyRef = React.useRef(null);

    React.useEffect(() => attachFloatingHead({
        scroller: scrollerRef.current,
        table: tableRef.current,
        realHead: headRef.current,
        copy: copyRef.current,
    }), []);

    return (<>
        <div className="affixTableScroll" ref={scrollerRef}>
            <table className={className} ref={tableRef}>
                <thead ref={headRef}>{head}</thead>
                <tbody>{children}</tbody>
            </table>
        </div>
        <div className="floatingHead" ref={copyRef} aria-hidden="true">
            <table className={className}>
                <thead>{head}</thead>
            </table>
        </div>
    </>);
}
