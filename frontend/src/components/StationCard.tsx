import { X, ExternalLink, Mountain, Clock } from "lucide-react";
import type { Station } from "@/lib/types";
import {
  FRESHNESS_CLASS, FRESHNESS_LABEL, NETWORK_META, PARAMS, fmtAge, fmtDay, fmtTime, fmtValue, freshnessFor,
  valueOf, windDirLabel, type ParamDef,
} from "@/lib/meteo";
import { cn } from "@/lib/utils";
import ModelCompare from "@/components/ModelCompare";

interface Props { station: Station; param: ParamDef; onClose: () => void; className?: string }

export default function StationCard({ station: s, param, onClose, className }: Props) {
  const net = NETWORK_META[s.network];
  const f = freshnessFor(s, param);
  const v = valueOf(s, param);
  const rows = PARAMS.filter((p) => p.key !== param.key && valueOf(s, p) !== null);
  return (
    <div data-testid="station-popup-card" className={cn("hud-in rounded-xl border border-slate-700/80 bg-slate-900/95 p-3.5 text-slate-100 shadow-2xl shadow-black/60 backdrop-blur-xl", className)}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-slate-400">
            <span className="size-1.5 rounded-full" style={{ background: net?.color }} />
            <span data-testid="station-card-network">{net?.label ?? s.network}</span>
          </div>
          <h3 data-testid="station-card-name" className="font-heading truncate text-lg font-semibold tracking-tight">{s.name}</h3>
        </div>
        <button data-testid="station-card-close" onClick={onClose} aria-label="Chiudi" className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100">
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-2 flex items-end gap-2">
        <div className="text-[11px] text-slate-400">{param.label}</div>
        <div className="ml-auto font-num text-3xl font-semibold leading-none" data-testid="station-card-value">
          {v !== null ? fmtValue(v, param) : "n.d."}
          {v !== null && <span className="ml-1 text-sm font-normal text-slate-400">{param.unit}</span>}
        </div>
      </div>
      {param.dayBound && !s.is_today && v !== null && (
        <div className="mt-1 rounded-md border border-amber-600/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200" data-testid="station-card-day-warning">
          Valore del giorno {fmtDay(s.obs_day)} – NON riferito a oggi
        </div>
      )}
      {param.key === "rain_48h" && v !== null && (
        <div className="mt-1 text-[11px] text-slate-400">Fonte 48 h: {s.rain_48h_source === "cedoc_direct" ? "dato diretto CEDOC" : (s.rain_48h_source ?? "n.d.")}</div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span data-testid="station-card-freshness" className={cn("rounded-full border px-2 py-0.5", FRESHNESS_CLASS[f])}>{FRESHNESS_LABEL[f]}</span>
        <span className="inline-flex items-center gap-1 font-num text-slate-300" data-testid="station-card-time">
          <Clock className="size-3" /> {fmtTime(s.last)} <span className="text-slate-500">({fmtAge(s.age_min)})</span>
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-400" data-testid="station-card-elev">
        <Mountain className="size-3" />
        {s.elev != null ? <>Quota {Math.round(s.elev)} m s.l.m. <span className="text-slate-500">· fonte: {s.elev_source === "rete" ? "rete originale" : s.elev_source}</span></> : "Quota non disponibile"}
      </div>

      {rows.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-slate-800 pt-2 text-[11px]">
          {rows.map((p) => {
            const pv = valueOf(s, p)!;
            const old = p.dayBound && !s.is_today;
            return (
              <div key={p.key} className="flex justify-between gap-2">
                <dt className="text-slate-400">{p.label}{old ? " *" : ""}</dt>
                <dd className={cn("font-num", old ? "text-slate-500" : "text-slate-100")}>
                  {fmtValue(pv, p)} {p.unit}
                  {p.key === "wind_kmh" && s.wind_dir != null ? ` ${windDirLabel(s.wind_dir)}` : ""}
                  {p.key === "tmax" && s.tmax_provisional ? " (prov.)" : ""}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      {rows.some((p) => p.dayBound) && !s.is_today && <p className="mt-1 text-[10px] text-slate-500">* valori del {fmtDay(s.obs_day)}</p>}
      {s.raw_message && <p className="mt-2 break-all rounded bg-slate-950/70 p-1.5 font-num text-[10px] text-slate-400" data-testid="station-card-raw">{s.raw_message}</p>}
      <ModelCompare station={s} />
      {s.source_url && (
        <a href={s.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] text-sky-300 hover:underline" data-testid="station-card-source-link">
          Scheda sensore <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}
