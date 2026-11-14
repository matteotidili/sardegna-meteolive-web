import { useEffect, useMemo, useState } from "react";
import { Activity, Clock3, MapPin, X } from "lucide-react";
import { fmtTime } from "@/lib/meteo";
import { radarCell, useRadarNumericManifest, useRadarPointSeries, type RadarPoint } from "@/lib/radarPoint";

type Hours = 1 | 2 | 3;
interface Props {
  product: string;
  time: string;
  point: RadarPoint;
  onClose: () => void;
}

function decimal(n: number, digits = 1): string {
  return n.toLocaleString("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function clock(iso: string): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(iso));
}

export default function RadarPointPanel({ product, time, point, onClose }: Props) {
  const [hours, setHours] = useState<Hours>(3);
  const [showChart, setShowChart] = useState(true);
  const numeric = useRadarNumericManifest(product !== "OPERA");
  const manifest = numeric.data;
  // Anche sul layer VMI mostriamo solo l'intensità numerica SRI della
  // *stessa* scansione; non applichiamo una conversione teorica dei dBZ.
  const seriesQ = useRadarPointSeries(manifest, product === "OPERA" ? null : "SRI", time, point, hours);
  const list = seriesQ.data ?? [];
  // Non ripiegare mai su un'altra scansione: il valore deve appartenere
  // esclusivamente al fotogramma scelto, anche quando il suo raster manca.
  const curr = list.find((r) => r.time === time);
  const intensity = curr?.available ? curr.value : null;
  const isVmi = product === "VMI";
  const inDomain = manifest ? radarCell(point, manifest) !== null : null;
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => { setHover(null); }, [product, point.lat, point.lon, time, hours]);

  const chart = useMemo(() => {
    if (!list.length) return null;
    const vals = list.map((r) => r.available && r.value !== null && Number.isFinite(r.value) ? r.value : null);
    const valid = vals.filter((v): v is number => v !== null);
    if (!valid.length) return null;
    const maxValue = Math.max(...valid);
    const ymin = 0;
    const ymax = Math.max(maxValue * 1.14, 1);
    const x = (i: number) => 34 + i * 288 / Math.max(1, vals.length - 1);
    const y = (v: number) => 128 - (v - ymin) * 102 / (ymax - ymin);
    const segments: string[] = [];
    let points: string[] = [];
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] === null) {
        if (points.length >= 2) segments.push(points.join(" "));
        points = [];
      } else {
        points.push(`${x(i).toFixed(1)},${y(vals[i]!).toFixed(1)}`);
      }
    }
    if (points.length >= 2) segments.push(points.join(" "));
    const maxIndex = vals.findIndex((v) => v !== null && v === maxValue);
    // 3h/2h: orari ogni 30 min; 1h: ogni 15 min. Il massimo,
    // se intermedio, ha comunque linea e orario esatti propri.
    const every = hours === 1 ? 3 : 6;
    const timeTicks = list.map((r, i) => ({ time: r.time, i }))
      .filter(({ i }) => i % every === 0 || i === list.length - 1);
    return { vals, ymin, ymax, maxIndex, maxValue, segments, x, y, timeTicks };
  }, [list, hours]);

  const isOpera = product === "OPERA";
  const busy = !isOpera && (numeric.isLoading || seriesQ.isLoading || seriesQ.isFetching);
  return (
    <div data-testid="radar-point-panel"
      className="pointer-events-auto w-full max-w-[360px] overflow-hidden rounded-2xl border border-sky-700/65 bg-slate-950/97 text-slate-100 shadow-2xl shadow-black/70 backdrop-blur-xl">
      <div className="flex items-start justify-between gap-2 border-b border-slate-800 bg-slate-900/85 px-3 py-2">
        <div>
          <div className="text-xs font-semibold">Radar {product === "OPERA" ? "EUMETNET OPERA" : `DPC · ${product}`}</div>
          <div className="mt-0.5 text-[10px] text-slate-400">Interrogazione puntuale · raster numerico originale</div>
        </div>
        <button data-testid="radar-point-close" aria-label="Chiudi analisi radar" onClick={onClose}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="size-4" /></button>
      </div>
      <div className="thin-scroll max-h-[min(68vh,620px)] space-y-2 overflow-y-auto px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
          <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{decimal(point.lat,4)}°N · {decimal(point.lon,4)}°E</span>
          <span className="inline-flex items-center gap-1"><Clock3 className="size-3" />{fmtTime(time)}</span>
        </div>
        {isOpera ? (
          <p className="rounded-lg border border-amber-700/30 bg-amber-950/30 p-2 text-xs text-amber-100">
            Interrogazione numerica non disponibile per le tile RadarEU/OPERA: la palette grafica non permette di ricostruire con certezza i mm/h. Il radar rimane visibile, senza valori puntuali inventati.
          </p>
        ) : numeric.isError ? (
          <p className="text-xs text-amber-200">Archivio radar numerico DPC temporaneamente non disponibile. Riprova aggiornando la pagina.</p>
        ) : inDomain === false ? (
          <p className="text-xs text-amber-200">Punto esterno alla griglia quantitativa della Sardegna. Nessun valore attribuito.</p>
        ) : (
          <>
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2.5">
              <p className="text-[10px] text-slate-400">Intensità pluviometrica stimata al suolo</p>
              <div className="mt-0.5 flex items-baseline gap-2">
                <strong data-testid="radar-point-value" className="font-num text-[24px] tabular-nums leading-tight">
                  {busy && !curr ? "…" : intensity == null ? "n.d." : decimal(intensity)}
                </strong>
                <span className="text-sm text-slate-300">mm/h</span>
              </div>
              {isVmi && <p className="mt-1 text-[10px] leading-snug text-slate-400">
                Fonte: prodotto SRI della stessa scansione VMI. Nessuna conversione teorica da dBZ.
              </p>}
              {curr?.available && curr.value === null && <p className="mt-1 text-[10px] text-slate-400">Cella senza valore numerico valido: non equivale a pioggia nulla.</p>}
              {!busy && !curr?.available && <p className="mt-1 text-[10px] text-amber-200">Questa scansione non è disponibile nell'archivio numerico; non vengono visualizzati valori di altri orari.</p>}
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <button data-testid="radar-chart-toggle" aria-expanded={showChart}
                onClick={() => setShowChart((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium hover:text-sky-200">
                <Activity className="size-3.5 text-sky-300" /> Evoluzione nel punto {showChart ? "▾" : "▸"}
              </button>
              {showChart && <div className="flex gap-1" role="group" aria-label="Finestra temporale">
                {([1, 2, 3] as const).map((n) => (
                  <button key={n} data-testid={`radar-hours-${n}`} onClick={() => setHours(n)}
                    className={`rounded-md px-2 py-1 font-num text-[10px] ${n === hours ? "bg-sky-700 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
                    {n} h
                  </button>
                ))}
              </div>}
            </div>
            {showChart && chart && (
              <div data-testid="radar-point-chart" className="rounded-lg border border-slate-800 bg-slate-900/60 p-1.5">
                <svg viewBox="0 0 352 184" className="w-full" role="img"
                  aria-label={`Intensità stimata in mm/h nelle ultime ${hours} ore. Picco ${decimal(chart.maxValue)} mm/h alle ${clock(list[chart.maxIndex].time)} ora italiana.`}>
                  {[0, 0.5, 1].map((ratio) => {
                    const y = 128 - 102 * ratio;
                    return <g key={ratio}>
                      <line x1="34" x2="322" y1={y} y2={y} stroke="#334155" strokeDasharray="3 4" />
                      <text x="29" y={y + 3} textAnchor="end" fill="#94a3b8" fontSize="9">
                        {(chart.ymin + (chart.ymax - chart.ymin) * ratio).toFixed(chart.ymax < 10 ? 1 : 0)}
                      </text>
                    </g>;
                  })}
                  {/* Il riferimento verticale indica l'orario del picco reale, non sempre il bordo destro. */}
                  <line x1={chart.x(chart.maxIndex)} x2={chart.x(chart.maxIndex)}
                    y1="23" y2="128" stroke="#fbbf24" strokeWidth="1.4" strokeDasharray="4 3" />
                  <text x={Math.max(39, Math.min(317, chart.x(chart.maxIndex)))}
                    y="16" textAnchor={chart.x(chart.maxIndex) > 262 ? "end" : chart.x(chart.maxIndex) < 90 ? "start" : "middle"}
                    fontSize="10" fontWeight="bold" fill="#fbbf24">
                    {clock(list[chart.maxIndex].time)} · picco
                  </text>
                  {chart.segments.map((p,i) => <polyline key={i} points={p} fill="none"
                    stroke="#38bdf8" strokeWidth="2" strokeLinejoin="round" />)}
                  {chart.vals.map((v,i) => v === null ? null : (
                    <circle key={i} cx={chart.x(i)} cy={chart.y(v)}
                      r={i === chart.maxIndex ? 4.4 : hover === i ? 3.7 : 2.1}
                      stroke={i === chart.maxIndex ? "#fbbf24" : "#0b0f17"} strokeWidth="1"
                      fill={i === chart.maxIndex ? "#fbbf24" : "#7dd3fc"}
                      onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                      <title>{clock(list[i].time)} · {decimal(v)} mm/h</title>
                    </circle>
                  ))}
                  {/* Asse orizzontale: orari locali espliciti con tacche regolari. */}
                  {chart.timeTicks.map(({ i, time }) => (
                    <g key={time}>
                      <line x1={chart.x(i)} x2={chart.x(i)} y1="130" y2="135" stroke="#94a3b8" />
                      <text x={chart.x(i)} y="148" fontSize="9.5" textAnchor="middle" fill="#cbd5e1">
                        {clock(time)}
                      </text>
                    </g>
                  ))}
                  <text x="178" y="171" textAnchor="middle" fontSize="9.5" fill="#94a3b8">
                    Orario italiano · {hours} h
                  </text>
                </svg>
                <p className="text-[10px] text-slate-300">
                  {hover !== null && chart.vals[hover] !== null
                    ? `${clock(list[hover].time)} · ${decimal(chart.vals[hover]!)} mm/h`
                    : `Picco ${decimal(chart.maxValue)} mm/h alle ${clock(list[chart.maxIndex].time)} (ora italiana)`}
                </p>
                <p className="mt-0.5 text-[9px] text-slate-500">Interruzioni nella linea = scansioni mancanti o celle senza dato valido. Non è un pluviogramma.</p>
              </div>
            )}
            {showChart && busy && <p className="text-[10px] text-slate-400">Lettura dei fotogrammi originali in corso…</p>}
            {showChart && !busy && !chart && <p className="text-[10px] text-amber-200">Nessuna serie numerica valida per l'intervallo selezionato.</p>}
            <p className="text-[9px] leading-snug text-slate-500">
              Fonte quantitativa: Radar-DPC SRI (mm/h), ritaglio GeoTIFF numerico senza interpolazione, 1 km; precisione dell'archivio 0,1 mm/h.
              Dati automatici non validati. © Dipartimento della Protezione Civile · CC BY-SA 4.0.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
