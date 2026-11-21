import { X, ExternalLink, Mountain, Clock } from "lucide-react";
import type { Station } from "@/lib/types";
import {
  NETWORK_META, PARAMS, fmtDay, fmtTime, fmtValue,
  valueOf, windDirLabel, type ParamDef,
} from "@/lib/meteo";
import { cn } from "@/lib/utils";
import ModelCompare from "@/components/ModelCompare";
import StationHistoryChart from "@/components/StationHistoryChart";
import { useDemElevation } from "@/hooks/useMeteo";

const ELEV_SOURCE: Record<string, string> = {
  rete: "dichiarata dalla rete originale",
  dtm10: "stima terreno DTM 10 m Regione Sardegna (non quota del sensore)",
  srtm30: "stima terreno SRTM 30 m (non quota del sensore)",
};

interface Props { station: Station; param: ParamDef; onClose: () => void; className?: string }

export default function StationCard({ station: s, param, onClose, className }: Props) {
  const net = NETWORK_META[s.network];
  const v = valueOf(s, param);
  const rows = PARAMS.filter((p) => p.key !== param.key && valueOf(s, p) !== null);
  const dem = useDemElevation(s);
  return (
    <div data-testid="station-popup-card" className={cn("hud-in rounded-xl border border-slate-700/80 bg-slate-900/95 p-3.5 text-slate-100 shadow-2xl shadow-black/60 backdrop-blur-xl", className)}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-slate-400">
            <span className="size-1.5 rounded-full" style={{ background: net?.color }} />
            <span data-testid="station-card-network">{net?.label ?? s.network}</span>
          </div>
          <h3 data-testid="station-card-name" className="font-heading truncate text-lg font-semibold tracking-tight">{s.name}</h3>
          {s.observation_type?.startsWith("Panoramicams · Ecowitt") && (
            <p className="mt-0.5 text-[10px] leading-snug text-slate-400" data-testid="station-card-location-note">
              Centralina condivisa nell’area webcam; posizione indicativa.
            </p>
          )}
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
      {param.key === "rain_48h" && v !== null && (
        <div className="mt-1 text-[11px] text-slate-400">Fonte 48 h: {s.rain_48h_source === "cedoc_direct" ? "dato diretto CEDOC" : (s.rain_48h_source ?? "n.d.")}</div>
      )}

      <div className="mt-3 flex items-center gap-1.5 font-num text-[11px] text-slate-300" data-testid="station-card-time">
        <Clock className="size-3 shrink-0" /> {(s.network === "mareografico" || s.network === "ron") ? `Acquisizione feed: ${fmtTime(s.last)}` : `Osservazione: ${fmtTime(s.last)}`}
      </div>
      {s.network !== "mareografico" && s.network !== "ron" && <div className="mt-1.5 flex items-start gap-1 text-[11px] text-slate-400" data-testid="station-card-elev">
        <Mountain className="mt-0.5 size-3 shrink-0" />
        <span>
          {s.elev != null ? <>Quota {Math.round(s.elev)} m s.l.m. <span className="text-slate-500">· {ELEV_SOURCE[s.elev_source ?? ""] ?? `fonte: ${s.elev_source}`}</span></>
            : dem.data != null ? <>Quota ~{dem.data} m s.l.m. <span className="text-slate-500">· stima DEM Mapterhorn (terreno, non sensore)</span></>
            : dem.isLoading ? "Stima quota dal DEM…" : "Quota non disponibile"}
        </span>
      </div>}

      {rows.length > 0 && s.network !== "mareografico" && s.network !== "ron" && (
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
                  {(p.key === "tmin" && s.tmin_provisional) || (p.key === "tmax" && s.tmax_provisional) ? (s.extrema_source?.includes("network_sampled_10min") ? " (camp.)" : " (prov.)") : ""}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      {rows.some((p) => p.dayBound) && !s.is_today && <p className="mt-1 text-[10px] text-slate-500">* valori del {fmtDay(s.obs_day)}</p>}
      {s.extrema_source?.includes("network_sampled_10min") && <p className="mt-1 text-[10px] leading-snug text-slate-500">Estremi campionati dalle letture della rete (circa ogni 10 minuti); eventuali picchi tra due rilevazioni possono non essere intercettati.</p>}
      {(s.network === "mareografico" || s.network === "ron") && (
        <>
          <div className="mt-1 text-[10px] font-num text-slate-500">{s.lat.toFixed(4)}°N · {s.lon.toFixed(4)}°E</div>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-slate-800 pt-2 text-[11px]" data-testid="station-card-marine-data">
            {[
              ["Livello del mare", s.marine?.sea_level_m, "m"], ["Temperatura acqua", s.marine?.water_temp_c, "°C"],
              ["Temperatura aria", s.temp, "°C"], ["Umidità relativa", s.rh, "%"], ["Pressione atmosferica", s.pressure_hpa, "hPa"],
              ["Direzione vento", s.wind_dir, "°"], ["Velocità vento", s.wind_kmh == null ? null : s.wind_kmh / 3.6, "m/s"],
              ["Radiazione solare media (30 min)", s.marine?.solar_wm2, "W/m²"], ["Precipitazione cumulata", s.marine?.precip_mm, "mm"],
              ["Periodo medio onda", s.sea_state?.period_mean_s, "s"], ["Periodo di picco onda", s.sea_state?.period_peak_s, "s"],
              ["Altezza significativa onda", s.sea_state?.wave_height_significant_m, "m"], ["Direzione media onda", s.sea_state?.wave_direction_mean_deg, "°"],
              ["Altezza massima onda", s.sea_state?.wave_height_max_m, "m"], ["Velocità corrente", s.sea_state?.current_speed_ms, "m/s"],
              ["Direzione corrente", s.sea_state?.current_direction_deg, "°"],
            ].map(([label, value, unit]) => (
              <div key={String(label)} className="flex justify-between gap-2">
                <dt className="text-slate-400">{label}</dt>
                <dd className="font-num text-slate-100">{value == null ? "n.d." : Number(value).toLocaleString("it-IT", { maximumFractionDigits: 1 })} {value == null ? "" : unit}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[10px] leading-snug text-slate-400">Dati dinamici ISPRA non validati. La precipitazione è cumulata (periodo non specificato per RON). L’orario indica l’acquisizione del feed, non necessariamente quello di ogni parametro.</p>
        </>
      )}
      {s.raw_message && <p className="mt-2 break-all rounded bg-slate-950/70 p-1.5 font-num text-[10px] text-slate-400" data-testid="station-card-raw">{s.raw_message}</p>}
      {s.network !== "mareografico" && s.network !== "ron" && <StationHistoryChart station={s} />}
      {s.network !== "mareografico" && s.network !== "ron" && <ModelCompare station={s} />}
      {s.network === "meteonetwork" && (
        <p data-testid="station-card-mnw-credit" className="mt-2 text-[11px] text-slate-400">
          Rete amatoriale · dati © <a href="https://www.meteonetwork.it" target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">MeteoNetwork</a>, licenza CC-BY 4.0
        </p>
      )}
      {s.source_url && (
        <a href={s.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] text-sky-300 hover:underline" data-testid="station-card-source-link">
          {s.network === "mareografico" || s.network === "ron" ? "Dati completi e storico ISPRA" : "Scheda sensore"} <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}
