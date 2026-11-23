import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Station } from "@/lib/types";

type Point = { t: number; [key: string]: number | null };
type Series = { points: Point[] };
const BASE = "https://raw.githubusercontent.com/matteotidili/sardegna-meteolive-data/main/";
const OPTIONS: Record<string, { key: string; label: string; unit: string }[]> = {
  mareografico: [
    { key: "water_temp_c", label: "Temperatura acqua", unit: "°C" }, { key: "temp", label: "Temperatura aria", unit: "°C" },
    { key: "sea_level_m", label: "Livello del mare", unit: "m" }, { key: "wind_kmh", label: "Velocità vento", unit: "km/h" },
    { key: "pressure_hpa", label: "Pressione", unit: "hPa" }, { key: "precip_mm", label: "Precipitazione cumulata", unit: "mm" },
  ],
  ron: [
    { key: "wave_height_significant_m", label: "Altezza significativa onde", unit: "m" }, { key: "wave_height_max_m", label: "Altezza massima onde", unit: "m" },
    { key: "period_mean_s", label: "Periodo medio", unit: "s" }, { key: "period_peak_s", label: "Periodo di picco", unit: "s" },
    { key: "wave_direction_mean_deg", label: "Direzione media onde", unit: "°" }, { key: "water_temp_c", label: "Temperatura acqua", unit: "°C" },
    { key: "current_speed_ms", label: "Velocità corrente", unit: "m/s" }, { key: "current_direction_deg", label: "Direzione corrente", unit: "°" },
  ],
};
const HM = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
const DHM = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const colors: Record<string, string> = { wave_height_significant_m: "#38BDF8", wave_height_max_m: "#FB7185", water_temp_c: "#FDBA74", temp: "#FB923C", sea_level_m: "#A78BFA", period_mean_s: "#34D399", period_peak_s: "#FBBF24", wave_direction_mean_deg: "#60A5FA", current_speed_ms: "#2DD4BF", current_direction_deg: "#C084FC", wind_kmh: "#F472B6", pressure_hpa: "#FACC15", precip_mm: "#38BDF8" };

export default function MarineBuoyHistoryChart({ station }: { station: Station }) {
  const [range, setRange] = useState(24);
  const [parameter, setParameter] = useState(OPTIONS[station.network]?.[0]?.key ?? "water_temp_c");
  const stationId = station.id.split(":").slice(1).join(":");
  const query = useQuery({
    queryKey: ["marine-buoy-history", station.id, station.last],
    queryFn: async () => {
      const path = station.network === "ron" ? "data/ron.json" : "data/mareografico.json";
      const response = await fetch(BASE + path + "?t=" + Math.floor(Date.now() / 300000));
      if (!response.ok) throw new Error("Archivio boe non raggiungibile");
      const data = await response.json();
      const row = (data.stations ?? []).find((r: { station_id: string }) => r.station_id === stationId);
      return { points: (row?.history ?? []) as Point[], generated: data.generated_at as string | undefined } as Series & { generated?: string };
    },
    enabled: station.network === "ron" || station.network === "mareografico",
    staleTime: 5 * 60_000, retry: 1,
  });
  const available = OPTIONS[station.network] ?? [];
  const options = available.filter((o) => query.data?.points.some((p) => typeof p[o.key] === "number"));
  const selected = options.some((o) => o.key === parameter) ? parameter : options[0]?.key ?? parameter;
  const shown = useMemo(() => (query.data?.points ?? []).filter((p) => p.t >= Date.now() - range * 3600_000 && typeof p[selected] === "number"), [query.data, range, selected]);
  const end = Date.now(), start = end - range * 3600_000;
  return (
    <section className="mt-3 border-t border-slate-700 pt-2" data-testid="marine-buoy-history">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-cyan-300">Storico acquisito</h4>
        <div className="flex gap-1">
          {[24, 72, 168].map((h) => <button key={h} type="button" onClick={() => setRange(h)} className={`rounded px-2 py-0.5 text-[10px] ${range === h ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-300"}`}>{h === 24 ? "24 h" : h === 72 ? "3 giorni" : "7 giorni"}</button>)}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <label htmlFor={`marine-history-${station.id}`} className="text-[10px] text-slate-400">Parametro</label>
        <select id={`marine-history-${station.id}`} value={selected} onChange={(e) => setParameter(e.target.value)} className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-100">
          {available.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>
      {query.isLoading && <div className="mt-2 h-32 animate-pulse rounded bg-slate-800/50" />}
      {query.isError && <p className="mt-2 text-[11px] text-slate-400">Archivio storico temporaneamente non raggiungibile.</p>}
      {query.data && shown.length > 1 && (
        <>
          <div className="mt-2 h-36">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={shown} margin={{ top: 5, right: 8, bottom: 0, left: -14 }}>
                <CartesianGrid stroke="#1F2937" strokeDasharray="3 3" />
                <XAxis dataKey="t" type="number" scale="time" domain={[start, end]} tickFormatter={(v: number) => range <= 24 ? HM.format(v) : DHM.format(v)} tick={{ fill: "#64748B", fontSize: 9 }} stroke="#334155" tickCount={5} />
                <YAxis domain={["auto", "auto"]} tick={{ fill: "#94A3B8", fontSize: 9 }} stroke="#334155" width={45} />
                <Tooltip contentStyle={{ background: "#0F172A", border: "1px solid #334155", fontSize: 11 }} labelFormatter={(v: number) => DHM.format(Number(v))} formatter={(v: number) => [`${Number(v).toLocaleString("it-IT", { maximumFractionDigits: 2 })} ${available.find((o) => o.key === selected)?.unit ?? ""}`, available.find((o) => o.key === selected)?.label ?? selected]} />
                <Line dataKey={selected} type="linear" stroke={colors[selected] ?? "#38BDF8"} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[9px] text-slate-500">{shown.length} campioni · da {DHM.format(shown[0].t)} a {DHM.format(shown[shown.length - 1].t)} · letture ISPRA, senza interpolazione</p>
        </>
      )}
      {query.data && shown.length <= 1 && <p className="mt-2 text-[11px] leading-snug text-slate-400">Archivio in raccolta: per questo intervallo sono disponibili {shown.length} campioni. Il grafico comparirà quando ci saranno almeno due letture.</p>}
    </section>
  );
}
