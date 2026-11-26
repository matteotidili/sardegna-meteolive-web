import type { AromeParameter } from "@/lib/types";
import { AROME_PRECIP_STOPS, PHASE_LABELS, RAIN_GRADIENT, RATE_GRADIENT, TEMP_GRADIENT, type ParamDef } from "@/lib/meteo";
import { DPC_LEGEND } from "@/lib/dpcRadar";
import { LIVE_WIND_STOPS } from "@/lib/liveWind";
import { interpolationScale, interpolationParam, type InterpolationCoverage, type InterpolationKey } from "@/lib/stationInterpolation";
import { fmtAge, fmtTime } from "@/lib/meteo";

export function StationLegend({ param, showHistoricDay }: { param: ParamDef; showHistoricDay?: boolean }) {
  const temperature = param.key === "temp" || param.key === "tmin" || param.key === "tmax";
  const low = TEMP_GRADIENT[0].value;
  const high = TEMP_GRADIENT[TEMP_GRADIENT.length - 1].value;
  const gradient = TEMP_GRADIENT.map(
    ({ value, color }) => `${color} ${(((value - low) / (high - low)) * 100).toFixed(2)}%`
  ).join(", ");

  return (
    <div data-testid="station-legend" className="pointer-events-auto rounded-xl border border-slate-800 bg-slate-900/90 px-2.5 py-2 text-slate-200 shadow-xl backdrop-blur-xl">
      <div className="mb-1 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.16em] text-slate-400">
        <span>{param.label}</span><span className="font-num normal-case">{param.unit}</span>
      </div>
      {temperature ? (
        <>
          <div data-testid="station-temperature-gradient" className="h-2.5 w-full rounded-md border border-white/10" style={{ background: `linear-gradient(90deg, ${gradient})` }} role="img" aria-label="Gradiente continuo delle temperature da -10 a 42 gradi Celsius" />
          <div className="mt-1 flex justify-between font-num text-[9px] tabular-nums text-slate-300">
            {[-10, 0, 10, 20, 30, 40].map((value) => <span key={value}>{value}</span>)}
          </div>
        </>
      ) : param.rain ? (
        <>
          <div data-testid="station-rainfall-scale" role="img" aria-label={`Sfumatura continua ${param.label} in ${param.unit}`}
            className="h-2.5 w-full rounded-md border border-white/10"
            style={{ background: `linear-gradient(90deg, ${(param.key === "rain_rate" ? RATE_GRADIENT : RAIN_GRADIENT).map(({ value, color }) => `${color} ${Math.log1p(value) / Math.log1p(param.key === "rain_rate" ? 60 : 100) * 100}%`).join(", ")})` }} />
          <div className="relative mt-1 h-3 font-num text-[9px] tabular-nums text-slate-300">
            {(param.key === "rain_rate" ? [0, 2, 10, 30, 60] : [0, 1, 5, 20, 100]).map((v, i, a) => <span key={v} className="absolute" style={{ left: `${Math.log1p(v) / Math.log1p(a[a.length-1]) * 100}%`, transform: i === 0 ? undefined : i === a.length-1 ? "translateX(-100%)" : "translateX(-50%)" }}>{v}{i === a.length-1 ? "+" : ""}</span>)}
          </div>
        </>
      ) : (
        <div className="flex gap-px overflow-hidden rounded">
          {param.ramp.map((stop) => (
            <div key={stop.label} className="min-w-9 flex-1 py-0.5 text-center font-num text-[9px] font-medium text-white" style={{ background: stop.color }}>{stop.label}</div>
          ))}
        </div>
      )}
      {showHistoricDay && <p className="mt-1 text-[9px] text-slate-300">* CEDOC · cumulata di un giorno precedente</p>}
    </div>
  );
}

export function StationInterpolationLegend({ variable, coverage, count }: {
  variable: InterpolationKey; coverage: InterpolationCoverage; count: number;
}) {
  const pending = coverage.variable !== variable;
  const { count: used, latest, oldest } = pending ? { count: 0, latest: null, oldest: null } : coverage;
  const param = interpolationParam(variable);
  const scale = interpolationScale(variable);
  const gradient = `linear-gradient(90deg, ${scale.map(({ color, position }) => `${color} ${position}%`).join(", ")})`;
  return (
    <div data-testid="station-interpolation-legend" aria-busy={pending} className="mb-2 rounded-xl border border-slate-700 bg-slate-900/95 px-2.5 py-2 text-slate-100 shadow-xl backdrop-blur-xl">
      <div className="mb-1 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.14em] text-slate-300">
        <span>{param.label} · interpolata</span><span className="font-num normal-case">{param.unit}</span>
      </div>
      {used > 0 ? (
        <>
          <div className="h-2.5 rounded-md border border-white/15" role="img" aria-label={`Scala cromatica continua ${param.label} in ${param.unit}`}
            style={{ background: gradient }} />
          <div className="relative mx-1.5 mt-1 h-3 font-num text-[9px] tabular-nums text-slate-300">
            {scale.map(({ value, position }) => <span key={value} className="absolute -translate-x-1/2" style={{ left: `${position}%` }}>{String(value).replace(".", ",")}</span>)}
          </div>
        </>
      ) : (
        <p className="text-[10px] text-amber-200">
          {pending ? "Calcolo della copertura…" : count < 3 ? "Servono almeno 3 stazioni recenti con questa misura." : "Nessuna area con copertura sufficiente nella vista."}
        </p>
      )}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 text-[9px] text-slate-400">
        <span>IDW² · {used} stazioni utilizzate{used !== count && ` su ${count} idonee`}</span>
        {latest && <span>Ultimo dato {fmtTime(latest)} · {fmtAge(Math.max(0, (Date.now() - Date.parse(latest)) / 60000))}</span>}
        {oldest && oldest !== latest && <span>Età massima {fmtAge(Math.max(0, (Date.now() - Date.parse(oldest)) / 60000))}</span>}
      </div>
    </div>
  );
}

const rgb = (c: number[]) => `rgb(${c.join(",")})`;

export function AromeLegend({ meta, isPrecip, hourlyPrecipStops }: {
  meta: AromeParameter | undefined;
  isPrecip: boolean;
  hourlyPrecipStops?: [number, [number, number, number]][];
}) {
  if (meta?.scale === "phase" && meta.phase_colors) {
    return (
      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-300" data-testid="arome-legend">
        {Object.entries(meta.phase_colors).map(([k, c]) => (
          <span key={k} className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm" style={{ background: rgb(c) }} />{PHASE_LABELS[k] ?? k}</span>
        ))}
      </div>
    );
  }
  // Soglie e colori hanno origine dallo stesso manifest dei raster, mai da una
  // seconda scala arbitraria; per i vecchi manifest esiste un fallback esatto.
  const stops = isPrecip ? hourlyPrecipStops?.length ? hourlyPrecipStops : AROME_PRECIP_STOPS : meta?.stops ?? [];
  if (!stops.length) return null;
  const n = stops.length;
  const rainfall = isPrecip || meta?.scale === "precip" || meta?.scale === "precip_total";
  // Ogni segmento rappresenta l'intervallo fra due soglie successive. La
  // legenda NON è un asse lineare dei mm: mette in evidenza gli accumuli deboli
  // senza ammassarne le etichette all'estremità sinistra.
  const grad = stops.map(([, c], i) => `${rgb(c)} ${((i / Math.max(1, n - 1)) * 100).toFixed(3)}%`).join(", ");
  const ticks = rainfall && n > 9
    ? [0, 2, 4, 6, 8, 10, n - 1]
    : rainfall && n >= 7
      ? [0, 2, 4, 6, n - 1]
      : n > 7 ? [0, 2, 4, 6, n - 1] : stops.map((_, i) => i);
  const tickIndices = [...new Set(ticks.filter((i) => i < n))];
  const unit = isPrecip ? "mm" : meta?.unit ?? "";
  return (
    <div className="mt-2" data-testid="arome-legend">
      <div role="img" aria-label={`Scala cromatica ${unit}: ${stops.map(([v]) => v).join(", ")}`}
        className="h-2.5 rounded-full border border-white/10"
        style={{ background: `linear-gradient(90deg, ${grad})` }} />
      <div className="relative mt-1 h-3.5 w-full font-num text-[9px] tabular-nums text-slate-300">
        {tickIndices.map((i) => (
          <span key={i} className="absolute whitespace-nowrap"
            style={{
              left: `${(i / Math.max(1, n - 1)) * 100}%`,
              transform: i === 0 ? undefined : i === n - 1 ? "translateX(-100%)" : "translateX(-50%)",
            }}>
            {String(stops[i][0]).replace(".", ",")}
          </span>
        ))}
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[9px] text-slate-500">
        <span>{rainfall ? "Intervalli di accumulo non lineari" : "Scala cromatica"}</span>
        <span className="font-num">{unit}</span>
      </div>
    </div>
  );
}

export function LightningLegend({ live, count }: { live: boolean; count: number }) {
  const items: [string, string][] = [["#fff34d", "<5′"], ["#ff9f1a", "5–15′"], ["#ef5b35", "15–30′"], ["#b53b4b", "30–45′"], ["#6f3a44", "45–60′"]];
  return (
    <div data-testid="lightning-legend" className="pointer-events-auto mt-1.5 rounded-xl border border-slate-800 bg-slate-900/90 px-2.5 py-2 text-slate-200 shadow-xl backdrop-blur-xl">
      <div className="mb-1 flex justify-between text-[10px] uppercase tracking-[0.16em] text-slate-400">
        <span>Fulmini · età scarica</span><span className="font-num normal-case">{live ? `LIVE · ${count}` : "in connessione"}</span>
      </div>
      <div className="flex gap-2 text-[9px] text-slate-300">
        {items.map(([c, l]) => <span key={l} className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full border border-black" style={{ background: c }} />{l}</span>)}
      </div>
      <p className="mt-1 text-[9px] text-slate-500">© Blitzortung.org / LightningMaps.org · rilevazioni di rete in tempo reale</p>
    </div>
  );
}

export function LiveWindLegend({ time }: { time: string | null }) {
  return (
    <div data-testid="live-wind-legend" className="pointer-events-auto mt-1.5 rounded-xl border border-slate-800 bg-slate-900/90 px-2.5 py-2 text-slate-200 shadow-xl backdrop-blur-xl">
      <div className="mb-1 flex justify-between gap-3 text-[10px] uppercase tracking-[0.16em] text-slate-400">
        <span>Vento attuale 10 m</span><span className="font-num normal-case">km/h</span>
      </div>
      <div className="flex gap-px overflow-hidden rounded">
        {LIVE_WIND_STOPS.map((s) => (
          <div key={s.label} className="min-w-9 flex-1 py-0.5 text-center font-num text-[9px] font-medium text-slate-950" style={{ background: s.color }}>{s.label}</div>
        ))}
      </div>
      <p data-testid="live-wind-legend-time" className="mt-1 text-[9px] text-slate-500">Analisi modello · Mediterraneo + ICON-2I Sardegna · {time ?? "in caricamento"} · non è una misura</p>
    </div>
  );
}

const OPERA_COLORS = ["120,200,255", "60,160,255", "30,110,240", "40,190,120", "30,150,80", "255,220,60", "255,170,40", "255,110,30", "235,50,35", "200,20,90", "170,40,200", "250,120,250", "255,255,255"];
export function OperaLegend() {
  return (
    <div className="mt-2" data-testid="opera-legend">
      <div className="grid h-2 grid-cols-13 overflow-hidden rounded-full" style={{ gridTemplateColumns: "repeat(13, 1fr)" }}>
        {OPERA_COLORS.map((c) => <span key={c} style={{ background: `rgb(${c})` }} />)}
      </div>
      <div className="mt-0.5 flex justify-between font-num text-[9px] text-slate-400">
        {["0,1", "0,3", "1,3", "5,6", "24", "100", ">200"].map((l) => <span key={l}>{l}</span>)}<span className="text-slate-500">mm/h</span>
      </div>
    </div>
  );
}

export function RadarLegend({ product }: { product: string }) {
  return (
    <div className="mt-2" data-testid="radar-legend">
      <div className="h-2 rounded-full" style={{ background: DPC_LEGEND(product) }} />
      <div className="mt-0.5 flex justify-between text-[9px] text-slate-400">
        <span>debole</span><span>scala qualitativa {product === "VMI" ? "riflettività" : "intensità"} · non LUT ufficiale</span><span>forte</span>
      </div>
    </div>
  );
}

export function DpcAccumulationLegend({ product, time }: { product: string; time: string }) {
  const band = product === "SRT1" ? "1 h" : product === "CUM3" ? "3 h" : product === "CUM6" ? "6 h" : product === "CUM12" ? "12 h" : "24 h";
  const stamp = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(time));
  return <div data-testid="dpc-accumulation-legend" className="pointer-events-auto rounded-xl border border-slate-800 bg-slate-900/90 px-2.5 py-2 text-slate-200 shadow-xl backdrop-blur-xl">
    <div className="mb-1 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.14em] text-slate-300"><span>Accumulo Radar-DPC · {band}</span><span>mm</span></div>
    <div className="h-2 rounded-full" style={{ background: DPC_LEGEND(product) }} />
    <div className="mt-1 flex justify-between text-[9px] text-slate-400"><span>Debole</span><span>Moderato</span><span>Intenso</span><span>Molto intenso</span></div>
    <div className="mt-1 text-[9px] text-slate-500">Ultimo prodotto disponibile · {stamp} ora italiana · scala cromatica qualitativa, non LUT ufficiale.</div>
  </div>;
}
