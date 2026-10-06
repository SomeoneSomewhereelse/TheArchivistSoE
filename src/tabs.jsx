// The tab bars (desktop and mobile), the tab list and its URL-hash keys.
import React from "react";
import {createPortal} from "react-dom";
import {TAB_GROUPS, TABS} from "./tabList.js";

export function TabTitle({tab}) {
    const value = TABS[tab];

    if (value && typeof value === "object") {
        return (
            <>
                {value.title}
                {value.badge && <span className="tabBadge">{value.badge}</span>}
            </>
        );
    }

    return value;
}

function DamnationToggle({damnationMode, toggleDamnationMode}) {
    return (<label className="toggleWrap topBarToggle">
        <span className="toggleLabel">Damnation</span>
        <div className="toggle">
            <input
                type="checkbox"
                checked={damnationMode}
                onChange={(e) => toggleDamnationMode(e.target.checked)}
            />
            <span className="toggleSlider"/>
        </div>
    </label>);
}

// Mobile's tab list: a bottom sheet of all tabs, grouped. Rendered into <body> by MobileTabsBar.
function TabSheet({tab, onSelect, onClose}) {
    return (<div className="tabSheetBackdrop" onClick={onClose}>
        <div
            className="tabSheet"
            role="dialog"
            aria-modal="true"
            aria-label="Tabs"
            onClick={(e) => e.stopPropagation()}
        >
            {TAB_GROUPS.map((group) => (<section key={group.title} className="tabSheetGroup">
                <div className="tabSheetGroupTitle">{group.title}</div>
                <div className="tabSheetGrid">
                    {group.keys.map((key) => (<button
                        key={key}
                        type="button"
                        className={"tabSheetItem" + (tab === key ? " active" : "")}
                        onClick={() => onSelect(key)}
                    >
                        <TabTitle tab={key}/>
                    </button>))}
                </div>
            </section>))}
        </div>
    </div>);
}

// Mobile's top row (pinned by CSS): a menu button naming the current tab, and the Damnation toggle.
// Opening the sheet adds no history entry, so Back while it's open goes to the previous tab. App keys
// this component by tab, so any tab change (Back/Forward, jumps) remounts it with the sheet closed.
export function MobileTabsBar({tab, setTab, damnationMode, toggleDamnationMode}) {
    const [sheetOpen, setSheetOpen] = React.useState(false);

    React.useEffect(() => {
        if (!sheetOpen) return;

        function onKeyDown(e) {
            if (e.key === "Escape") setSheetOpen(false);
        }

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [sheetOpen]);

    const selectTab = (key) => {
        // The page is long now that lists don't scroll on their own; start the new tab at the top.
        if (key !== tab) window.scrollTo(0, 0);
        setTab(key);
        setSheetOpen(false);
    };

    return (<div className="tabsPanel">
        <button
            type="button"
            className="tabMenuBtn"
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            onClick={() => setSheetOpen(true)}
        >
            <span aria-hidden="true">☰</span>
            <span className="tabMenuTitle"><TabTitle tab={tab}/></span>
            <span aria-hidden="true">▾</span>
        </button>

        <div className="tabsRight">
            <DamnationToggle damnationMode={damnationMode} toggleDamnationMode={toggleDamnationMode}/>
        </div>

        {sheetOpen && createPortal(
            <TabSheet tab={tab} onSelect={selectTab} onClose={() => setSheetOpen(false)}/>,
            document.body,
        )}
    </div>);
}

export function TabsBar({
                     tab,
                     setTab,
                     damnationMode,
                     toggleDamnationMode,
                 }) {
    const [moreOpen, setMoreOpen] = React.useState(false);
    const moreRef = React.useRef(null);

    const mainKeys = [
        "weapons",
        "armors",
        "uniques",
        "runewords",
        "affixes",
        "skills",
        "sacreds",
        "ascendancies",
    ];

    const moreKeys = [
        "fatecards",
        "kiln",
        "corruptions",
        "mapping",
        "cube",
        "changes",
        "damnation",
        "calculators",
        "dropcalc",
        "help",
    ];

    React.useEffect(() => {
        function onClick(e) {
            if (!moreRef.current?.contains(e.target)) {
                setMoreOpen(false);
            }
        }

        document.addEventListener("mousedown", onClick);
        return () => document.removeEventListener("mousedown", onClick);
    }, []);

    const moreActive = moreKeys.includes(tab);

    const selectTab = (key) => {
        setTab(key);
        setMoreOpen(false);
    };

    return (
        <div className="tabsPanel">
            <div className="tabsLeft">
                <div className="tabs">
                    {mainKeys.map((key) => (
                        <div
                            key={key}
                            className={"tab" + (tab === key ? " active" : "")}
                            onClick={() => selectTab(key)}
                            role="button"
                            tabIndex={0}
                        >
                            <TabTitle tab={key}/>
                        </div>
                    ))}

                    <div className="moreTabsWrap" ref={moreRef}>
                        <div
                            className={"tab" + (moreActive ? " active" : "")}
                            onClick={() => setMoreOpen((v) => !v)}
                            role="button"
                            tabIndex={0}
                        >
                            More ▾
                        </div>

                        {moreOpen && (
                            <div className="moreTabsDropdown">
                                {moreKeys.map((key) => (
                                    <div
                                        key={key}
                                        className={"moreTabItem" + (tab === key ? " active" : "")}
                                        onClick={() => selectTab(key)}
                                        role="button"
                                        tabIndex={0}
                                    >
                                        <TabTitle tab={key}/>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="tabsRight">
                <DamnationToggle damnationMode={damnationMode} toggleDamnationMode={toggleDamnationMode}/>
            </div>
        </div>
    );
}
