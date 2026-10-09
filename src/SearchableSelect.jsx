import React from "react";
import {filterOptions, initialActive, nextActive} from "./searchableSelectFilter.js";

export default function SearchableSelect({
                              value, onChange, options, placeholder = "Select…", style, className = "", ariaLabel,
                          }) {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const wrapRef = React.useRef(null);
    const inputRef = React.useRef(null);
    const triggerRef = React.useRef(null);
    const baseId = React.useId();
    // The keyboard-active option: an index into filteredOptions (see searchableSelectFilter.js).
    const [active, setActive] = React.useState(-1);

    const currentLabel = options.find((o) => o.group === undefined && String(o.value) === String(value))?.label || "";

    const filteredOptions = React.useMemo(() => filterOptions(options, query), [options, query]);

    // A stale index (the options changed while open) falls back to the first selectable option.
    const activeIdx = filteredOptions[active] && filteredOptions[active].group === undefined
        ? active : nextActive(filteredOptions, -1, "Home");
    const optionId = (i) => `${baseId}-opt-${i}`;

    // Close on outside click
    React.useEffect(() => {
        if (!open) return;

        function handleClick(e) {
            if (!wrapRef.current) return;
            if (!wrapRef.current.contains(e.target)) {
                setOpen(false);
            }
        }

        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    // Auto-focus search input when dropdown opens
    React.useEffect(() => {
        if (open && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [open]);

    // Keep the keyboard-active option visible inside the scrolling list.
    React.useEffect(() => {
        if (!open || activeIdx < 0) return;
        document.getElementById(`${baseId}-opt-${activeIdx}`)?.scrollIntoView({block: "nearest"});
    }, [open, activeIdx, baseId]);

    const handleSelect = (val) => {
        onChange(val);
        setOpen(false);
        setQuery("");
    };

    const openDropdown = () => {
        setActive(initialActive(filteredOptions, value));
        setOpen(true);
    };

    const handleTriggerKeyDown = (e) => {
        if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            e.stopPropagation();
            openDropdown();
        }
    };

    const handleInputKeyDown = (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
            e.preventDefault();
            e.stopPropagation();
            setActive(nextActive(filteredOptions, activeIdx, e.key));
        } else if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            if (activeIdx >= 0) handleSelect(filteredOptions[activeIdx].value);
        } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
            setQuery("");
            triggerRef.current?.focus();
        } else if (e.key === "Tab") {
            setOpen(false);
            setQuery("");
        }
    };

    return (<div
        ref={wrapRef}
        className={`selSearchWrap ${className}`}
        style={style}
    >
        <button
            ref={triggerRef}
            type="button"
            className="selTrigger"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={ariaLabel ? `${ariaLabel}: ${currentLabel || placeholder}` : undefined}
            onClick={() => (open ? setOpen(false) : openDropdown())}
            onKeyDown={handleTriggerKeyDown}
        >
        <span className={currentLabel ? "" : "placeholder"}>
          {currentLabel || placeholder}
        </span>
            <span className="selArrow">▾</span>
        </button>

        {open && (<div className="selDropdown">
            <input
                ref={inputRef}
                className="selSearchInput"
                type="text"
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(nextActive(filterOptions(options, e.target.value), -1, "Home"));
                }}
                onKeyDown={handleInputKeyDown}
                role="combobox"
                aria-expanded="true"
                aria-haspopup="listbox"
                aria-autocomplete="list"
                aria-controls={`${baseId}-list`}
                aria-activedescendant={activeIdx >= 0 ? optionId(activeIdx) : undefined}
                aria-label={ariaLabel ? `${ariaLabel} filter` : "Filter options"}
                placeholder="Filter options…"
            />
            <div className="selOptions" id={`${baseId}-list`} role="listbox" aria-label={ariaLabel}>
                {filteredOptions.length === 0 ? (
                    <div className="selOption selEmpty">No matches</div>) : (filteredOptions.map((opt, i) => (opt.group !== undefined ? (<div
                    key={`group:${i}:${opt.group}`}
                    className="selGroup"
                    role="presentation"
                >
                    {opt.group}
                </div>) : (<div
                    key={String(opt.value) || opt.label}
                    id={optionId(i)}
                    role="option"
                    aria-selected={String(opt.value) === String(value)}
                    className={i === activeIdx ? "selOption selActive" : "selOption"}
                    onClick={() => handleSelect(opt.value)}
                >
                    {opt.label}
                </div>))))}
            </div>
        </div>)}
    </div>);
}
