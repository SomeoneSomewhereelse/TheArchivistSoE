// True while the viewport matches the CSS mobile breakpoint. It asks the same media query the
// stylesheet uses (`@media (max-width: 980px)`), so the layout JS picks and the layout CSS applies
// can't disagree on a fractional viewport width the way an integer window.innerWidth could.
import {useSyncExternalStore} from "react";

export function mobileQuery(maxWidth) {
    return `(max-width: ${maxWidth}px)`;
}

export function useIsMobile(maxWidth = 980) {
    const query = mobileQuery(maxWidth);

    return useSyncExternalStore(
        (notify) => {
            const mql = window.matchMedia(query);
            mql.addEventListener("change", notify);
            return () => mql.removeEventListener("change", notify);
        },
        () => window.matchMedia(query).matches,
        () => false,
    );
}
