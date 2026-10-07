// The Affixes sort bar: the sort order as chips (tap to reverse, × to remove), Reset, and the Multi-sort
// switch that makes header clicks append columns. Stateless: the sort list and the switch live in App.
import React from "react";
import {AFFIX_SORT_LABELS, DEFAULT_AFFIX_SORT, flipSortKey, removeSortKey} from "./sortCompare.js";

const arrow = (dir) => (dir === "asc" ? "▲" : "▼");
const word = (dir) => (dir === "asc" ? "ascending" : "descending");

export default function AffixSortBar({sort, onChange, multi, onMultiChange}) {
    const fallback = DEFAULT_AFFIX_SORT[0];
    const barRef = React.useRef(null);

    // × and Reset unmount the button that has focus, which would drop it to <body> and send a keyboard user
    // back to the top of the page. Before changing the list, move focus to something that stays mounted: a
    // neighbouring chip's flip button, else the Multi-sort switch.
    const keepFocus = (neighbour) => {
        const bar = barRef.current;
        const target = neighbour?.querySelector(".sortChipFlip") ?? bar?.querySelector(".multiSortToggle input");
        target?.focus();
    };

    return (<div className="affixSortBar" ref={barRef}>
        <div className="sortOrder">
            <span className="sortByLabel">Sorted by:</span>
            {sort.length === 0 ? (
                <span className="sortDefault">
                    {AFFIX_SORT_LABELS[fallback.key]} {arrow(fallback.dir)} (default)
                </span>
            ) : sort.map(({key, dir}, i) => {
                const label = AFFIX_SORT_LABELS[key];
                return (<React.Fragment key={key}>
                    {i > 0 && <span className="sortChipSep" aria-hidden="true">›</span>}
                    <span className="sortChip">
                        <button
                            type="button"
                            className="sortChipFlip"
                            aria-label={`${label} ${word(dir)}, reverse`}
                            onClick={() => onChange(flipSortKey(sort, key))}
                        >
                            {label} {arrow(dir)}
                        </button>
                        <button
                            type="button"
                            className="sortChipRemove"
                            aria-label={`Remove ${label}`}
                            onClick={(e) => {
                                const chip = e.currentTarget.closest(".sortChip");
                                keepFocus(chip.nextElementSibling?.nextElementSibling ?? chip.previousElementSibling?.previousElementSibling);
                                onChange(removeSortKey(sort, key));
                            }}
                        >
                            ×
                        </button>
                    </span>
                </React.Fragment>);
            })}
            {sort.length > 0 && (
                <button type="button" className="sortReset" onClick={() => {
                    keepFocus(null);
                    onChange([]);
                }}>
                    Reset
                </button>
            )}
        </div>

        <label className="toggleWrap multiSortToggle">
            <span className="toggleLabel">Multi-sort</span>
            <div className="toggle">
                <input
                    type="checkbox"
                    checked={multi}
                    onChange={(e) => onMultiChange(e.target.checked)}
                />
                <span className="toggleSlider"/>
            </div>
        </label>
    </div>);
}
