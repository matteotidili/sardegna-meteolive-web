import { useState } from "react";
import { useMarineScale } from "@/hooks/useMarine";
import { marineLegendUrl, type MarineParameter } from "@/lib/marine";
import { MARINE_LABELS } from "@/components/MarineControls";

export default function MarineLegend({ parameter }: { parameter: MarineParameter }) {
  const q = useMarineScale(parameter, true);
  const [expanded, setExpanded] = useState(false);
  const entries = q.data ?? [];
  const fmt = (value: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 3 }).format(value);
  // The final WW3 style entry uses 300 as its catch-all upper bound.
  const labelAt = (i: number) => i === entries.length - 1 && entries[i].value >= 100 && i > 0
    ? `>${fmt(entries[i - 1].value)}` : entries[i].label || fmt(entries[i].value);
  const stride = Math.max(1, Math.ceil(entries.length / 6));
  return (
    <div className="mt-2" data-testid="marine-legend">
      <div className="mb-1 flex items-center justify-between text-[10px] text-slate-300">
        <span>{MARINE_LABELS[parameter].label} ({MARINE_LABELS[parameter].unit})</span>
        <button data-testid="marine-legend-expand" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}
          className="ml-2 shrink-0 text-sky-300 underline">{expanded ? "Riduci" : "Scala completa"}</button>
      </div>
      {entries.length ? (
        <>
          <div className="grid h-2.5 overflow-hidden rounded" style={{ gridTemplateColumns: `repeat(${entries.length}, minmax(0, 1fr))` }}>
            {entries.map((entry, i) => <span key={i} style={{ background: entry.color, opacity: entry.opacity }}
              title={`${labelAt(i)} ${MARINE_LABELS[parameter].unit}`} />)}
          </div>
          <div className="mt-0.5 grid font-num text-[9px] text-slate-300" style={{ gridTemplateColumns: `repeat(${entries.length}, minmax(0, 1fr))` }}>
            {entries.map((_, i) => <span className={i === entries.length - 1 ? "text-right" : ""} key={i}>
              {(i % stride === 0 || i === entries.length - 1) ? labelAt(i) : ""}
            </span>)}
          </div>
          {expanded && <div className="mt-1.5 grid grid-cols-4 gap-x-2 gap-y-1 text-[9px] text-slate-300">
            {entries.map((entry, i) => <span key={i} className="flex items-center gap-1"><span className="size-2 shrink-0 rounded-sm" style={{ background: entry.color }} />
              {labelAt(i)} {MARINE_LABELS[parameter].unit}</span>)}
          </div>}
        </>
      ) : (
        <div className="text-[10px] text-slate-400">
          {q.isLoading ? "Caricamento legenda ufficiale…" : "Legenda ufficiale"}
          {expanded && <img data-testid="marine-legend-image" src={marineLegendUrl(parameter)} alt={`Legenda ufficiale: ${MARINE_LABELS[parameter].label}`}
            className="mt-1 max-h-64 max-w-full rounded bg-white p-1" />}
        </div>
      )}
    </div>
  );
}
