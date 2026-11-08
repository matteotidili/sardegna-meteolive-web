import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStationHistory } from "@/hooks/useMeteo";
import type { Station } from "@/lib/types";
import type { HistoryPoint } from "@/lib/clientData";

const HM = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
const DHM = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const MAX_GAP = 80 * 60000; // longer gaps are drawn as breaks, never interpolated

function withGaps(points: HistoryPoint[], key: "temp" | "rain") {
  const out: Record<string, number | null>[] = [];
  let prev: number | null = null;
  for (const p of points) {
    if (p[key] === null) continue;
    if (prev !== null && p.t - prev > MAX_GAP) out.push({ t: prev + 1, [key]: null });
    out.push({ t: p.t, [key]: p[key] });
    prev = p.t;
  }
  return out;
}

/** Observed 24 h trend: temperature + daily rain counter. Only real samples, gaps left empty. */
export default function StationHistoryChart({ station }: { station: Station }) {
  const q = useStationHistory(station);
  const pts = q.data?.points ?? [];
  const temp = station.rain_only ? [] : withGaps(pts, "temp");
  const rain = withGaps(pts, "rain");
  const now = Date.now(), domain: [number, number] = [now - 24 * 3600_000, now];
  const has = temp.length > 1 || rain.length > 1;

  return (
    <div className="mt-3 border-t border-slate-800 pt-2" data-testid="station-history-chart">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-slate-400">
        <span>Ultime 24 ore · osservato</span>
        <span className="flex gap-2 normal-case tracking-normal">
          {temp.length > 0 && <span className="inline-flex items-center gap-1"><span className="h-0.5 w-3 rounded bg-orange-400" />T °C</span>}
          {rain.length > 0 && <span className="inline-flex items-center gap-1"><span className="h-0.5 w-3 rounded bg-sky-400" />Pioggia mm</span>}
        </span>
      </div>
      {q.isLoading && <div className="h-28 animate-pulse rounded bg-slate-800/50" />}
      {q.isError && <p className="text-[11px] text-slate-500">Storico non raggiungibile.</p>}
      {q.data && has && (
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart margin={{ top: 4, right: 0, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="#1F2937" strokeDasharray="3 3" />
              <XAxis dataKey="t" type="number" domain={domain} scale="time" tickFormatter={(v: number) => HM.format(v)}
                tick={{ fill: "#64748B", fontSize: 9 }} stroke="#334155" tickCount={5} allowDuplicatedCategory={false} />
              {temp.length > 0 && <YAxis yAxisId="t" tick={{ fill: "#FDBA74", fontSize: 9 }} stroke="#334155" domain={["auto", "auto"]} width={42} />}
              {rain.length > 0 && <YAxis yAxisId="r" orientation="right" tick={{ fill: "#7DD3FC", fontSize: 9 }} stroke="#334155" domain={[0, "auto"]} width={30} />}
              <Tooltip
                contentStyle={{ background: "#0F172A", border: "1px solid #334155", fontSize: 11 }}
                labelFormatter={(l: string) => DHM.format(Number(l))}
                formatter={(value: number, name: string) => [`${value.toLocaleString("it-IT", { maximumFractionDigits: 1 })} ${name === "temp" ? "°C" : "mm"}`, name === "temp" ? "Temperatura" : "Pioggia (contatore giornaliero)"]}
              />
              {temp.length > 0 && <Line yAxisId="t" data={temp} dataKey="temp" stroke="#FB923C" strokeWidth={1.8} dot={false} connectNulls={false} isAnimationActive={false} />}
              {rain.length > 0 && <Line yAxisId="r" data={rain} dataKey="rain" type="stepAfter" stroke="#38BDF8" strokeWidth={1.6} dot={false} connectNulls={false} isAnimationActive={false} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {q.data && !has && <p className="text-[11px] text-slate-500" data-testid="station-history-empty">Nessuna serie osservata disponibile per questa stazione nelle ultime 24 ore.</p>}
      {q.data && (
        <p className="mt-1 text-[9.5px] leading-snug text-slate-500" data-testid="station-history-note">
          Solo campioni reali, interruzioni oltre 80 min lasciate vuote. Pioggia = cumulata giornaliera, azzerata a mezzanotte (ora di Roma).
          {!station.rain_only && !q.data.tempSource && (q.data.tempPublished
            ? " Nessuna temperatura storica per questa stazione."
            : " Storico temperatura non ancora pubblicato dal repository dati (station_history_24h.json).")}
          {q.data.rainSource && ` Fonte pioggia: ${q.data.rainSource}.`}
        </p>
      )}
    </div>
  );
}
