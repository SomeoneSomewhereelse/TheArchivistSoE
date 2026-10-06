import {describe, expect, it} from "vitest";
import {pagerState} from "./pager.js";

describe("pagerState", () => {
    it("describes the first of several pages (0-based page, 1-based label)", () => {
        expect(pagerState({page: 0, itemCount: 120, pageSize: 50})).toEqual({
            page: 0, pageCount: 3, start: 0, end: 50, label: "Page 1 / 3", canPrev: false, canNext: true,
        });
    });

    it("ends the last page at the item count", () => {
        expect(pagerState({page: 2, itemCount: 120, pageSize: 50})).toEqual({
            page: 2, pageCount: 3, start: 100, end: 120, label: "Page 3 / 3", canPrev: true, canNext: false,
        });
    });

    it("clamps a page past the end or before the start", () => {
        expect(pagerState({page: 9, itemCount: 120, pageSize: 50}).page).toBe(2);
        expect(pagerState({page: -4, itemCount: 120, pageSize: 50}).page).toBe(0);
    });

    it("treats no items as one empty page", () => {
        expect(pagerState({page: 3, itemCount: 0, pageSize: 50})).toEqual({
            page: 0, pageCount: 1, start: 0, end: 0, label: "Page 1 / 1", canPrev: false, canNext: false,
        });
    });

    it("uses a full page when the count is an exact multiple", () => {
        const s = pagerState({page: 1, itemCount: 100, pageSize: 50});
        expect([s.pageCount, s.start, s.end, s.canNext]).toEqual([2, 50, 100, false]);
    });
});
