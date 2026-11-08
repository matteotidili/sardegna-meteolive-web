import { useModelPoint } from "@/hooks/useMeteo";
import type { Station } from "@/lib/types";
import { fmtTime, windDirLabel } from "@/lib/meteo";
import { cn } from "@/lib/utils";

const OBS_FOR: Record<string, keyof Station> = { t2m: "temp", rh2m: "rh", wind10: "wind_kmh", gust10: "gust_kmh" };
const DEC: Record<string, number> = { t2m: 1, rh2m: 0, wind10: 0, gust10: 0 };

const fmt = (v: number, d: number) => v.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Observation vs AROME at the station's own observation time (nearest model lead). */
export default function ModelCompare({ station }: { station: Station }) {
  const q = useModelPoint(station.rain_only ? null : station);
  if (station.rain_only) return null;
  return (
    <div className="mt-3 border-t border-slate-800 pt-2" data-testid="station-model-compare">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-slate-400">
        <span>Misura vs AROME HD</span>
        {q.data && <span className="font-num normal-case tracking-normal text-slate-500">H+{q.data.lead_hours} · valida {fmtTime(q.data.valid_time)}</span>}
      </div>
      {q.isLoading && <div className="h-14 animate-pulse rounded bg-slate-800/50" />}
      {q.isError && <p className="text-[11px] text-slate-500" data-testid="station-model-unavailable">Confronto non disponibile per l'orario di questa osservazione (fuori dalla corsa AROME o catalogo non raggiungibile).</p>}
      {q.data && (
        <>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-slate-500">
                <th className="text-left font-normal" />
                <th className="text-right font-normal">Misura</th>
                <th className="text-right font-normal">AROME</th>
                <th className="text-right font-normal">Δ</th>
              </tr>
            </thead>
            <tbody>
              {q.data.values.map((v) => {
                const obsRaw = station[OBS_FOR[v.key]];
                const obs = typeof obsRaw === "number" ? obsRaw : null;
                const d = DEC[v.key] ?? 1;
                const diff = obs !== null && v.value !== null ? obs - v.value : null;
                return (
                  <tr key={v.key} data-testid={`model-row-${v.key}`}>
                    <td className="py-0.5 text-slate-400">{v.label.replace(", stima da componenti massime", "")}{v.method === "scala cromatica" ? " ≈" : ""}</td>
                    <td className="text-right font-num text-slate-100">{obs !== null ? fmt(obs, d) : "–"}</td>
                    <td className="text-right font-num text-sky-200">
                      {v.value !== null ? fmt(v.value, d) : "fuori dominio"}
                      {v.key === "wind10" && v.direction_deg != null ? ` ${windDirLabel(v.direction_deg)}` : ""}
                    </td>
                    <td className={cn("text-right font-num", diff === null ? "text-slate-600" : diff > 0 ? "text-orange-300" : "text-cyan-300")}>
                      {diff !== null ? `${diff > 0 ? "+" : ""}${fmt(diff, d)}` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-1 text-[9.5px] leading-snug text-slate-500">
            Corsa {fmtTime(q.data.run_time)} · scarto orario {Math.round(q.data.offset_min)} min. ≈ = stima ricavata dalla scala cromatica del prodotto (approssimata); vento dai vettori U/V a 0,1°. Previsione, non osservazione. Unità: °C, %, km/h.
          </p>
        </>
      )}
    </div>
  );
}
