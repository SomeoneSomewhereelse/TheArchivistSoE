import {describe, expect, it} from "vitest";
import {floatingHeadVisible, stickLine} from "./stickyHead.js";

// A 40px header; the stick line defaults to the mobile top bar's bottom (52px).
function visible(headTop, tableEnd, stickTop = 52) {
    return floatingHeadVisible({headTop, headHeight: 40, tableEnd, stickTop});
}

describe("floatingHeadVisible", () => {
    it("is hidden at rest, while the real header is at or below the stick line", () => {
        expect(visible(300, 3000)).toBe(false);
        expect(visible(52, 3000)).toBe(false);
    });

    it("shows once the real header has passed the stick line", () => {
        expect(visible(51, 3000)).toBe(true);
        expect(visible(-1500, 3000)).toBe(true);
    });

    it("hides when the table ends within one header height of the stick line", () => {
        expect(visible(-1500, 92)).toBe(false); // 52 + 40: no room left for a whole header
        expect(visible(-1500, 93)).toBe(true);
        expect(visible(-1500, 10)).toBe(false); // table already gone
    });

    it("works with the desktop stick line at 0", () => {
        expect(visible(10, 3000, 0)).toBe(false);
        expect(visible(0, 3000, 0)).toBe(false);
        expect(visible(-1, 3000, 0)).toBe(true);
        expect(visible(-1, 40, 0)).toBe(false);
        expect(visible(-1, 41, 0)).toBe(true);
    });
});

describe("stickLine", () => {
    it("is the CSS line, or the pinned bar's height when that is taller", () => {
        expect(stickLine({cssTop: 52, barHeight: 52})).toBe(52);
        expect(stickLine({cssTop: 52, barHeight: 53})).toBe(53);
        expect(stickLine({cssTop: 0, barHeight: 0})).toBe(0);
    });

    it("follows the visible area's top while pinch-zoomed, but never goes behind the pinned bar", () => {
        expect(stickLine({cssTop: 52, barHeight: 52, zoomOffsetTop: 300})).toBe(300);
        expect(stickLine({cssTop: 52, barHeight: 52, zoomOffsetTop: 0})).toBe(52);
        expect(stickLine({cssTop: 52, barHeight: 52, zoomOffsetTop: 30})).toBe(52);
        expect(stickLine({cssTop: 0, barHeight: 0, zoomOffsetTop: 120})).toBe(120);
    });
});
