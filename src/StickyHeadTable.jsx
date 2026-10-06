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
    let stickTop = 0;

    // CSS decides the line (top: var(--topbar-h, 0px)); it computes even while the copy is display: none.
    function readStickTop() {
        stickTop = parseFloat(getComputedStyle(copy).top) || 0;
    }

    function sync() {
        // All reads first, then all writes, so each call lays out once.
        const box = scroller.getBoundingClientRect();
        const tableRect = table.getBoundingClientRect();
        const headRect = realHead.getBoundingClientRect();
        const widths = Array.from(realHead.rows[0].cells, (cell) => cell.getBoundingClientRect().width);
        const visible = floatingHeadVisible({
            headTop: headRect.top,
            headHeight: headRect.height,
            tableEnd: Math.min(box.bottom, tableRect.bottom),
            stickTop,
        });

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
        readStickTop(); // crossing the 980px breakpoint moves the line
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
    readStickTop();
    sync();

    return () => {
        observer.disconnect();
        window.removeEventListener("scroll", sync);
        window.removeEventListener("resize", onResize);
        scroller.removeEventListener("scroll", sync);
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
