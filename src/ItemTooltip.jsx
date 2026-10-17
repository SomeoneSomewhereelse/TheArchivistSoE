// The Item Builder's item tooltip card: buildTooltip's lines (src/itemTooltip.js), styled by kind. Props
// only. It calls buildTooltip while rendering, so a throw lands in the ErrorBoundary around it.
import React, {useMemo, useState} from "react";
import {buildTooltip} from "./itemTooltip.js";

const BY_ROLL_TITLE = "Depends on the roll: on this base, low rolls add maximum damage instead of Enhanced Damage.";
const QUALITY_CLASS = {magic: "ibTipMagic", rare: "ibTipRare", crafted: "ibTipCrafted"};

// The "(by roll)" tag: hover shows the title; a tap (phones have no hover) opens the same note under the line.
function ByRollTag() {
    const [open, setOpen] = useState(false);
    return (
        <>
            {" "}
            <button type="button" className="ibTipByRoll" title={BY_ROLL_TITLE} aria-expanded={open} onClick={() => setOpen((o) => !o)}>(by roll)</button>
            {open && <span className="ibTipByRollNote">{BY_ROLL_TITLE}</span>}
        </>
    );
}

function TooltipLine({line}) {
    switch (line.kind) {
        case "name":
        case "baseName":
            return <p className={`ibTipLine ibTipName ${QUALITY_CLASS[line.quality]}`}>{line.text}</p>;
        case "placeholder":
            return <p className={`ibTipLine ibTipName ibTipPlaceholder ${QUALITY_CLASS[line.quality]}`}>{line.text}</p>;
        case "base":
            return (
                <p className="ibTipLine">
                    {line.label}
                    {line.value !== undefined && <>{" "}<span className={line.changed ? "ibTipBlue" : undefined}>{line.value}</span></>}
                </p>
            );
        case "mod":
            return (
                <p className="ibTipLine ibTipBlue">
                    {line.text}
                    {line.byRoll && <ByRollTag/>}
                </p>
            );
        default: // footer
            return <p className="ibTipLine ibTipBlue">{line.text}</p>;
    }
}

export default function ItemTooltip({model, ctx, build}) {
    const lines = useMemo(() => buildTooltip(model, ctx, build), [model, ctx, build]);
    return (
        <section className="ibTooltip" aria-label="Item tooltip">
            {lines.map((line, i) => <TooltipLine key={i} line={line}/>)}
        </section>
    );
}
