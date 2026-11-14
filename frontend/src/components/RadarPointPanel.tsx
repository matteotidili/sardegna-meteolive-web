import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Clock3, MapPin, X } from "lucide-react";
import { fmtTime } from "@/lib/meteo";
import { marshallPalmer, radarCell, sampleRadarPoint, useRadarNumericManifest, useRadarPointSeries, type RadarPoint } from "@/lib/radarPoint";

type Hours = 1 | 2 | 3;
type Measure = "mmh" | "dbz";
interface Props {
  product: string;
  time: string;
  point: RadarPoint;
  onClose: () => void;
}

function decimal(n: number, digits = 1): string {
  return n.toLocaleString("it-IT", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export default function RadarPointPanel({ product, time, point, onClose }: Props) {
  const [hours, setHours] = useState<Hours>(3);
  const [showChart, setShowChart] = useState(true);
  const [measure, setMeasure] = useState<Measure>("mmh");
  const numeric = useRadarNumericManifest(product !== "OPERA");
  const manifest = numeric.data;
  const seriesQ = useRadarPointSeries(manifest, product, time, point, hours);
  const list = seriesQ.data ?? [];
  // Non ripiegare mai su un'altra scansione: il valore deve appartenere
  // esclusivamente al fotogramma scelto, anche quando il suo raster manca.
  const curr = list.find((r) => r.time === time);
  const value = curr?.available ? curr.value : null;
  const isVmi = product === "VMI";
  const original = value === null || value === undefined ? null : value;
  const rate = original == null ? null : isVmi ? marshallPalmer(original) : original;
  const inDomain = manifest ? radarCell(point, manifest) !== null : null;
  const matchingSri = manifest?.frames.SRI.find((f) => f.time === time);
  const sriQ = useQuery({
    queryKey: ["radar-vmi-sri-companion", manifest?.generated_at, time, point.lat, point.lon],
    enabled: isVmi && !!manifest && !!matchingSri,
    queryFn: () => sampleRadarPoint(manifest!, matchingSri!.file, point),
    staleTime: Infinity,
    retry: false,
  });
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => { setMeasure("mmh"); }, [product]);
  useEffect(() => { setHover(null); }, [product, point.lat, point.lon, time, hours]);

  const chart = useMemo(() => {
    if (!list.length) return null;
    const vals = list.map((r) => r.available && r.value !== null
      ? isVmi && measure === "mmh" ? marshallPalmer(r.value) : r.value : null);
    const valid = vals.filter((v): v is number => v !== null && Number.isFinite(v));
    if (!valid.length) return null;
    const maxValue = Math.max(...valid);
    const ymin = measure === "dbz" && isVmi ? Math.min(0, ...valid) : 0;
    const ymax = Math.max(maxValue + (maxValue - ymin) * 0.12, ymin + 1);
    const x = (i: number) => 30 + i * 292 / Math.max(1, vals.length - 1);
    const y = (v: number) => 126 - (v - ymin) * 107 / (ymax - ymin);
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
    return { vals, ymin, ymax, maxIndex, maxValue, segments, x, y };
  }, [list, isVmi, measure]);

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
              <p className="text-[10px] text-slate-400">{isVmi ? "Riflettività massima verticale" : "Intensità stimata al suolo"}</p>
              <div className="mt-0.5 flex items-baseline gap-2">
                <strong data-testid="radar-point-value" className="font-num text-[24px] tabular-nums leading-tight">
                  {busy && !curr ? "…" : original == null ? "n.d." : decimal(original)}
                </strong>
                <span className="text-sm text-slate-300">{isVmi ? "dBZ" : "mm/h"}</span>
              </div>
              {isVmi && (
                <div className="mt-1.5 border-t border-slate-700 pt-1.5">
                  <p className="text-[10px] text-slate-400">Equivalente teorico Marshall–Palmer</p>
                  <strong className="font-num text-lg">{rate === null ? "n.d." : decimal(rate)}</strong>
                  <span className="ml-1 text-xs">mm/h</span>
                  <p className="mt-1 text-[10px] leading-snug text-amber-200">
                    Da Z=200R^1,6. Il VMI non rappresenta la pioggia al suolo: possibile sovrastima in presenza di grandine, bright band e altre anomalie.
                  </p>
                  <div className="mt-2 border-t border-slate-700 pt-2">
                    <p className="text-[10px] text-slate-400">SRI stimato al suolo · stessa scansione</p>
                    <strong className="font-num text-lg">
                      {!matchingSri ? "n.d." : sriQ.isLoading ? "…" :
                        sriQ.isError || sriQ.data === null || sriQ.data === undefined ? "n.d." : decimal(sriQ.data)}
                    </strong>
                    <span className="ml-1 text-xs">mm/h</span>
                    <p className="mt-0.5 text-[9px] text-slate-500">Dato distinto dal VMI, prioritario per la stima quantitativa al suolo.</p>
                  </div>
                </div>
              )}
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
            {showChart && isVmi && <div className="flex gap-1" role="group" aria-label="Unità del grafico">
              {(["mmh","dbz"] as const).map((unit) => (
                <button key={unit} data-testid={`radar-chart-${unit}`} onClick={() => setMeasure(unit)}
                  className={`rounded-md px-2 py-1 text-[10px] ${measure === unit ? "bg-sky-700" : "bg-slate-800"}`}>
                  {unit === "mmh" ? "mm/h equivalenti" : "dBZ"}
                </button>
              ))}
            </div>}
            {showChart && chart && (
              <div data-testid="radar-point-chart" className="rounded-lg border border-slate-800 bg-slate-900/60 p-1.5">
                <svg viewBox="0 0 352 156" className="w-full" role="img" aria-label={`Serie delle ultime ${hours} ore per il punto selezionato`}>
                  {[0, 0.5, 1].map((ratio) => {
                    const y = 126 - 107 * ratio;
                    return <g key={ratio}><line x1="30" x2="322" y1={y} y2={y} stroke="#334155" strokeDasharray="3 4" />
                      <text x="26" y={y+3} textAnchor="end" fill="#94a3b8" fontSize="9">
                        {(chart.ymin+(chart.ymax-chart.ymin)*ratio).toFixed(chart.ymax<10?1:0)}
                      </text></g>;
                  })}
                  <line x1="322" x2="322" y1="19" y2="126" stroke="#fbbf24" strokeWidth="1.3" strokeDasharray="3 3" />
                  {chart.segments.map((p,i) => <polyline key={i} points={p} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinejoin="round" />)}
                  {chart.vals.map((v,i) => v === null ? null : (
                    <circle key={i} cx={chart.x(i)} cy={chart.y(v)} r={hover === i ? 4 : i === chart.vals.length - 1 ? 3 : 2}
                      stroke="#0b0f17" strokeWidth="0.7" fill={i === chart.maxIndex ? "#fbbf24" : "#7dd3fc"}
                      onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
                      <title>{fmtTime(list[i].time)} · {decimal(v)} {measure==="dbz"?"dBZ":"mm/h"}</title>
                    </circle>
                  ))}
                  <text x="30" y="147" fill="#94a3b8" fontSize="9">{fmtTime(list[0].time)}</text>
                  <text x="322" y="147" textAnchor="end" fill="#94a3b8" fontSize="9">{fmtTime(list[list.length-1].time)}</text>
                </svg>
                <p className="text-[10px] text-slate-300">
                  {hover !== null && chart.vals[hover] !== null
                    ? `${fmtTime(list[hover].time)} · ${decimal(chart.vals[hover]!)} ${measure === "dbz" ? "dBZ" : "mm/h"}`
                    : `Massimo: ${decimal(chart.maxValue)} ${measure==="dbz"?"dBZ":"mm/h"} · ${fmtTime(list[chart.maxIndex].time)}`}
                </p>
                <p className="mt-0.5 text-[9px] text-slate-500">Interruzioni nella linea = scansioni mancanti o celle senza dato valido. Non è un pluviogramma.</p>
              </div>
            )}
            {showChart && busy && <p className="text-[10px] text-slate-400">Lettura dei fotogrammi originali in corso…</p>}
            {showChart && !busy && !chart && <p className="text-[10px] text-amber-200">Nessuna serie numerica valida per l'intervallo selezionato.</p>}
            <p className="text-[9px] leading-snug text-slate-500">
              GeoTIFF Radar-DPC, ritaglio numerico senza interpolazione, 1 km; precisione dell'archivio 0,1 unità.
              Dati automatici non validati. © Dipartimento della Protezione Civile · CC BY-SA 4.0.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
