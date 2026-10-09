import React from "react";
import {filterOptions} from "./searchableSelectFilter.js";

export default function SearchableSelect({
                              value, onChange, options, placeholder = "Select…", style, className = "", ariaLabel,
                          }) {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const wrapRef = React.useRef(null);
    const inputRef = React.useRef(null);

    const currentLabel = options.find((o) => o.group === undefined && String(o.value) === String(value))?.label || "";

    const filteredOptions = React.useMemo(() => filterOptions(options, query), [options, query]);

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

    const handleSelect = (val) => {
        onChange(val);
        setOpen(false);
        setQuery("");
    };

    return (<div
        ref={wrapRef}
        className={`selSearchWrap ${className}`}
        style={style}
    >
        <button
            type="button"
            className="selTrigger"
            aria-label={ariaLabel ? `${ariaLabel}: ${currentLabel || placeholder}` : undefined}
            onClick={() => setOpen((o) => !o)}
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
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter options…"
            />
            <div className="selOptions">
                {filteredOptions.length === 0 ? (
                    <div className="selOption selEmpty">No matches</div>) : (filteredOptions.map((opt, i) => (opt.group !== undefined ? (<div
                    key={`group:${i}:${opt.group}`}
                    className="selGroup"
                >
                    {opt.group}
                </div>) : (<div
                    key={String(opt.value) || opt.label}
                    className="selOption"
                    onClick={() => handleSelect(opt.value)}
                >
                    {opt.label}
                </div>))))}
            </div>
        </div>)}
    </div>);
}
