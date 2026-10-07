// The Affixes sort bar: the sort order as chips (tap to reverse, × to remove), Reset, and the Multi-sort
// switch that makes header clicks append columns. Stateless: the sort list lives in App, the switch in
// AffixesPanel.
import React from "react";
import {AFFIX_SORT_LABELS, DEFAULT_AFFIX_SORT, flipSortKey, removeSortKey} from "./sortCompare.js";

const arrow = (dir) => (dir === "asc" ? "▲" : "▼");
const word = (dir) => (dir === "asc" ? "ascending" : "descending");

export default function AffixSortBar({sort, onChange, multi, onMultiChange}) {
    const fallback = DEFAULT_AFFIX_SORT[0];

    return (<div className="affixSortBar">
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
                            onClick={() => onChange(removeSortKey(sort, key))}
                        >
                            ×
                        </button>
                    </span>
                </React.Fragment>);
            })}
            {sort.length > 0 && (
                <button type="button" className="sortReset" onClick={() => onChange([])}>
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
