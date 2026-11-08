import type { AromeParameter } from "@/lib/types";
import { AROME_PRECIP_STOPS, PHASE_LABELS, type ParamDef } from "@/lib/meteo";
import { DPC_LEGEND } from "@/lib/dpcRadar";

export function StationLegend({ param }: { param: ParamDef }) {
  return (
    <div data-testid="station-legend" className="pointer-events-auto rounded-xl border border-slate-800 bg-slate-900/90 px-2.5 py-2 text-slate-200 shadow-xl backdrop-blur-xl">
      <div className="mb-1 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.16em] text-slate-400">
        <span>{param.label}</span><span className="font-num normal-case">{param.unit}</span>
      </div>
      <div className="flex gap-px overflow-hidden rounded">
        {param.ramp.map((s) => (
          <div key={s.label} className="min-w-9 flex-1 py-0.5 text-center font-num text-[9px] font-medium text-white" style={{ background: s.color }}>{s.label}</div>
        ))}
      </div>
      <div className="mt-1.5 flex items-center gap-2.5 text-[9px] text-slate-400">
        <span className="inline-flex items-center gap-1"><span className="stn" style={{ ["--c" as string]: "#10B981", height: 12, padding: "0 4px", fontSize: 8 }}>12</span>recente</span>
        <span className="inline-flex items-center gap-1"><span className="stn stn-stale" style={{ ["--c" as string]: "#10B981", height: 12, padding: "0 4px", fontSize: 8 }}>12</span>in ritardo</span>
        <span className="inline-flex items-center gap-1"><span className="stn stn-historic" style={{ ["--c" as string]: "#10B981", height: 12, padding: "0 4px", fontSize: 8 }}>12</span>storico</span>
      </div>
    </div>
  );
}

const rgb = (c: number[]) => `rgb(${c.join(",")})`;

export function AromeLegend({ meta, isPrecip }: { meta: AromeParameter | undefined; isPrecip: boolean }) {
  if (meta?.scale === "phase" && meta.phase_colors) {
    return (
      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-300" data-testid="arome-legend">
        {Object.entries(meta.phase_colors).map(([k, c]) => (
          <span key={k} className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm" style={{ background: rgb(c) }} />{PHASE_LABELS[k] ?? k}</span>
        ))}
      </div>
    );
  }
  const stops = isPrecip ? AROME_PRECIP_STOPS : meta?.stops ?? [];
  if (!stops.length) return null;
  const lo = stops[0][0], hi = stops[stops.length - 1][0];
  const grad = stops.map(([v, c]) => `${rgb(c)} ${(((v - lo) / (hi - lo || 1)) * 100).toFixed(1)}%`).join(", ");
  const unit = isPrecip ? "mm/h" : meta?.unit ?? "";
  return (
    <div className="mt-2" data-testid="arome-legend">
      <div className="h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${grad})` }} />
      <div className="mt-0.5 flex justify-between font-num text-[9px] text-slate-400">
        {stops.filter((_, i) => stops.length <= 7 || i % 2 === 0 || i === stops.length - 1).map(([v]) => <span key={v}>{v}</span>)}
        <span className="text-slate-500">{unit}</span>
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
