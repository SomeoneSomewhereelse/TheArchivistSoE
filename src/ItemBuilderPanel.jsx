// The Item Builder tab: base, quality and level controls, the item card, and the affix list. The build
// comes from useItemBuilder (src/useItemBuilder.js) through props; this component only keeps UI state
// (search text, copy-link state, whether the card is in view).
import React, {useEffect, useMemo, useRef, useState} from "react";
import SearchableSelect from "./SearchableSelect.jsx";
import {compareAffixes} from "./sortCompare.js";
import {allowedQualities, countHint, eligibleAffixes, requiredLevel, rollContext, rowState} from "./itemBuilderRules.js";

const QUALITY_LABELS = {magic: "Magic", rare: "Rare", crafted: "Crafted"};
const CLASS_NAMES = {ama: "Amazon", ass: "Assassin", bar: "Barbarian", dru: "Druid", nec: "Necromancer", pal: "Paladin", sor: "Sorceress"};

const statText = (affix) => affix.displayProperties.map((p) => p.displayString).join(", ");

function levelText(ctx, build) {
    const {base, ilvl, effectiveIlvl, alvl} = ctx;
    const crafted = build.quality === "crafted" ? `crafted ilvl ${ilvl} = ⌊${build.clvl}/2⌋ + ⌊${build.gilvl}/2⌋; ` : "";
    const raised = effectiveIlvl > ilvl ? ` (ilvl ${ilvl} raised to qlvl ${base.qlvl})` : "";
    if (base.magicLvl > 0) {
        const capped = effectiveIlvl + base.magicLvl > 99 ? ", capped at 99" : "";
        return `${crafted}alvl ${alvl} = ilvl ${effectiveIlvl} + magic lvl ${base.magicLvl}${capped}${raised}`;
    }
    return `${crafted}alvl ${alvl} from ilvl ${effectiveIlvl} and qlvl ${base.qlvl}${raised}`;
}

function classNotes(picked) {
    return picked.filter((a) => a.classLevelReq)
        .map((a) => ` (${CLASS_NAMES[a.classLevelReq.class] ?? a.classLevelReq.class}: ${a.classLevelReq.level})`)
        .join("");
}

// A 1-99 input that commits on blur or Enter, never per keystroke: typing "85" must not pass through
// ilvl 8 (which would drop picks for good). An empty or out-of-range value is discarded on blur, and the
// field shows the last committed value again.
function LevelInput({label, value, onCommit}) {
    const [text, setText] = useState(null);
    const commit = () => {
        const n = Number(text);
        if (text && n >= 1 && n <= 99 && n !== value) onCommit(n);
        setText(null);
    };
    return (
        <label className="ibLevel">
            <span>{label}</span>
            <input
                type="text"
                inputMode="numeric"
                className="ibLevelInput"
                aria-label={label}
                value={text ?? String(value)}
                onChange={(e) => setText(e.target.value.replace(/\D/g, "").slice(0, 3))}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                }}
            />
        </label>
    );
}

function Slots({title, affixes, cap, totalReached, onRemove}) {
    const empty = Math.max(0, cap - affixes.length);
    const slotName = title === "Prefixes" ? "Prefix" : "Suffix";
    return (
        <div className="ibSlots">
            <div className="ibSlotsHead">{title} {affixes.length}/{cap}</div>
            {affixes.map((a) => (
                <div key={a.key} className="ibSlot filled">
                    <span><span className="ibAffixName">{a.name}</span> · {statText(a)}</span>
                    <button type="button" className="ibRemove" aria-label={`Remove ${a.name}`} onClick={() => onRemove(a)}>×</button>
                </div>
            ))}
            {Array.from({length: empty}, (_, i) => (
                <div key={`empty-${i}`} className="ibSlot">{totalReached ? "total reached" : `${slotName} slot`}</div>
            ))}
        </div>
    );
}

function AffixRow({affix, state, onToggle}) {
    const locked = state.state === "group" || state.state === "full";
    return (
        <button
            type="button"
            className={`ibRow ${state.state}`}
            data-key={affix.key}
            disabled={locked}
            aria-pressed={state.state === "picked"}
            onClick={() => onToggle(affix)}
        >
            <span className="ibRowMain">
                <span className="ibAffixName">{affix.name}</span>
                {affix.displayProperties.map((p, i) => <span key={i} className="ibStat">{p.displayString}</span>)}
            </span>
            <span className="ibRowMeta">
                {affix.suffix ? "Suffix" : "Prefix"} · Grp {affix.group} · alvl {affix.level} · rlvl {affix.levelreq}{state.state === "picked" ? " ✓" : ""}
            </span>
            {state.state === "group" && <span className="ibWhy">Group taken by {state.by.name}</span>}
            {state.state === "full" && <span className="ibWhy">Slots full</span>}
        </button>
    );
}

export default function ItemBuilderPanel({status, error, retry, model, build, notice, setBuild, searchRef}) {
    const [search, setSearch] = useState("");
    const [copyState, setCopyState] = useState("idle");
    const [cardVisible, setCardVisible] = useState(true);
    const cardRef = useRef(null);

    // The phone's pinned summary bar shows only while the card is out of view. 52px is the pinned tab
    // row's height on mobile (--topbar-h), so "in view" means below that row.
    useEffect(() => {
        const el = cardRef.current;
        if (!el || typeof IntersectionObserver === "undefined") return undefined;
        const observer = new IntersectionObserver(([entry]) => setCardVisible(entry.isIntersecting), {rootMargin: "-52px 0px 0px 0px"});
        observer.observe(el);
        return () => observer.disconnect();
    }, [status]);

    const ctx = useMemo(() => (model && build?.base ? rollContext(model, build) : null), [model, build]);
    const picked = useMemo(() => (ctx ? build.picks.map((k) => model.affixByKey.get(k)) : []), [ctx, model, build]);
    const eligible = useMemo(() => (ctx ? eligibleAffixes(model, ctx) : []), [model, ctx]);
    const rows = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return eligible
            .filter((a) => !needle || a.name.toLowerCase().includes(needle) || statText(a).toLowerCase().includes(needle))
            .sort((a, b) => compareAffixes(a, b, "attrs", "desc"));
    }, [eligible, search]);

    if (status === "loading") return <div className="infoPanel ibStatus">Loading item data…</div>;
    if (status === "error") {
        return (
            <div className="infoPanel ibStatus">
                Couldn't load the item data ({error}). <button type="button" className="btn" onClick={retry}>Retry</button>
            </div>
        );
    }

    const base = ctx?.base ?? null;
    const caps = ctx?.caps ?? null;
    const qualities = base ? allowedQualities(model, base) : [];
    const crafted = build.quality === "crafted";
    const count = (suffix) => picked.filter((a) => a.suffix === suffix).length;
    const req = base ? requiredLevel(base, picked) : 0;

    const baseOptions = [
        {value: "", label: "Choose a base item…"},
        ...model.groups.flatMap((g) => [{group: g.label}, ...g.bases.map((b) => ({value: b.code, label: `${b.name} · qlvl ${b.qlvl}`}))]),
    ];
    const update = (patch) => {
        setCopyState("idle");
        setBuild({...build, ...patch});
    };
    const toggle = (affix) => update({
        picks: build.picks.includes(affix.key) ? build.picks.filter((k) => k !== affix.key) : [...build.picks, affix.key],
    });
    async function copyLink() {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setCopyState("copied");
        } catch {
            setCopyState("manual");
        }
    }

    return (
        <div className="ibRoot">
            <div className="filtersPanel ibControls">
                <SearchableSelect className="ibBase" ariaLabel="Base item" value={build.base ?? ""} options={baseOptions} placeholder="Choose a base item…"
                                  onChange={(v) => update({base: v || null})}/>
                {qualities.length > 1 && (
                    <div className="ibQuality" role="group" aria-label="Quality">
                        {qualities.map((q) => (
                            <button key={q} type="button" className={`btn ibQualityBtn${q === build.quality ? " active" : ""}`}
                                    aria-pressed={q === build.quality} onClick={() => update({quality: q})}>
                                {QUALITY_LABELS[q]}
                            </button>
                        ))}
                    </div>
                )}
                {base && !crafted && <LevelInput label="ilvl" value={build.ilvl} onCommit={(v) => update({ilvl: v})}/>}
                {base && crafted && (
                    <>
                        <LevelInput label="clvl" value={build.clvl} onCommit={(v) => update({clvl: v})}/>
                        <LevelInput label="ingredient ilvl" value={build.gilvl} onCommit={(v) => update({gilvl: v})}/>
                    </>
                )}
            </div>

            {notice && <div className="ibNotice" role="status">{notice}</div>}

            <section className={`ibCard${build.quality ? ` ib-${build.quality}` : ""}`} ref={cardRef}>
                {!base ? (
                    <p className="ibEmpty">Choose a base item to start.</p>
                ) : (
                    <>
                        <h2 className="ibTitle">{QUALITY_LABELS[build.quality]} {base.name}</h2>
                        <p className="ibSub">{levelText(ctx, build)}</p>
                        {ctx.cls && <p className="ibSub">{CLASS_NAMES[ctx.cls] ?? ctx.cls} only</p>}
                        <p className="ibSub">{countHint(ctx)}</p>
                        <Slots title="Prefixes" affixes={picked.filter((a) => !a.suffix)} cap={caps.prefix}
                               totalReached={picked.length >= caps.total} onRemove={toggle}/>
                        <Slots title="Suffixes" affixes={picked.filter((a) => a.suffix)} cap={caps.suffix}
                               totalReached={picked.length >= caps.total} onRemove={toggle}/>
                        {crafted && <p className="ibSub">{picked.length}/{caps.total} random affixes, plus the recipe's fixed mods</p>}
                        <p className="ibReq">Required level {req}{classNotes(picked)}</p>
                        <div className="ibActions">
                            <button type="button" className="btn" onClick={copyLink}>{copyState === "copied" ? "Copied" : "Copy link"}</button>
                            <button type="button" className="btn" disabled={!picked.length} onClick={() => update({picks: []})}>Clear</button>
                        </div>
                        {copyState === "manual" && (
                            <input className="ibLinkField" readOnly autoFocus aria-label="Link to this build"
                                   value={window.location.href} onFocus={(e) => e.target.select()}/>
                        )}
                    </>
                )}
            </section>

            {base && (
                <div className={`ibPinBar${cardVisible ? "" : " show"}`} aria-hidden={cardVisible}>
                    <span>P {count(false)}/{caps.prefix} · S {count(true)}/{caps.suffix} · Req. lvl {req}</span>
                    <a href="#" onClick={(e) => {
                        e.preventDefault();
                        cardRef.current?.scrollIntoView({block: "start"});
                    }}>↑ card</a>
                </div>
            )}

            <section className="ibList">
                <input type="text" className="ibSearch" ref={searchRef} placeholder="Search names and stats…"
                       aria-label="Search affixes" value={search} onChange={(e) => setSearch(e.target.value)}/>
                <div className="ibRows">
                    {!base ? (
                        <p className="ibEmpty">Choose a base item to see its affixes.</p>
                    ) : rows.length === 0 ? (
                        <p className="ibEmpty">
                            {search.trim() ? "No affixes match the search." : `No affixes can roll at alvl ${ctx.alvl}.`}
                        </p>
                    ) : (
                        rows.map((a) => <AffixRow key={a.key} affix={a} state={rowState(a, picked, caps)} onToggle={toggle}/>)
                    )}
                </div>
            </section>
        </div>
    );
}
