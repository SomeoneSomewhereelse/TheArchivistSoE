// When the floating copy of a table header shows (see StickyHeadTable.jsx). Pure, unit-tested in
// stickyHead.test.js. All values are viewport px.

// True when the real header has passed the stick line (the pinned top bar's bottom on mobile, the
// viewport top on desktop) and the table still reaches more than one header height below it.
// `tableEnd` is min(scroller bottom, table bottom): the desktop scroller has a 400px min-height, so
// for a short table its bottom lies below the last row.
export function floatingHeadVisible({headTop, headHeight, tableEnd, stickTop}) {
    return headTop < stickTop && tableEnd > stickTop + headHeight;
}

// The stick line in viewport px: the CSS line (top: var(--topbar-h, 0px)) or the pinned top bar's real
// height when that is taller. While pinch-zoomed (`zoomOffsetTop` given: visualViewport.offsetTop) the
// line follows the visible area's top, but never goes behind the pinned bar, which sits at the layout
// viewport's top and covers it while offsetTop is smaller than the bar's height.
export function stickLine({cssTop, barHeight, zoomOffsetTop}) {
    const base = Math.max(cssTop, barHeight);
    return zoomOffsetTop === undefined ? base : Math.max(base, zoomOffsetTop);
}
