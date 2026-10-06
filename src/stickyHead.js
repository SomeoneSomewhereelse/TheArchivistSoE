// When the floating copy of a table header shows (see StickyHeadTable.jsx). Pure, unit-tested in
// stickyHead.test.js. All values are viewport px.

// True when the real header has passed the stick line (the pinned top bar's bottom on mobile, the
// viewport top on desktop) and the table still reaches more than one header height below it.
// `tableEnd` is min(scroller bottom, table bottom): the desktop scroller has a 400px min-height, so
// for a short table its bottom lies below the last row.
export function floatingHeadVisible({headTop, headHeight, tableEnd, stickTop}) {
    return headTop < stickTop && tableEnd > stickTop + headHeight;
}
