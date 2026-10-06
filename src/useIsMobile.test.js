import {describe, expect, it} from "vitest";
import {mobileQuery} from "./useIsMobile.js";

describe("mobileQuery", () => {
    it("matches the CSS breakpoint syntax", () => {
        expect(mobileQuery(980)).toBe("(max-width: 980px)");
        expect(mobileQuery(720)).toBe("(max-width: 720px)");
    });
});
