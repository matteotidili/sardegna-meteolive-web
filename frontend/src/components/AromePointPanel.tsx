import { Clock3, MapPin, X } from "lucide-react";
import type { PointValue } from "@/lib/types";
import { fmtTime } from "@/lib/meteo";
import type { RadarPoint } from "@/lib/radarPoint";

interface Props {
  point: RadarPoint;
  time: string;
  value: PointValue | undefined;
  loading: boolean;
  error: boolean;
  onClose: () => void;
}

const decimal = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

export default function AromePointPanel({ point, time, value, loading, error, onClose }: Props) {
  return (
    <div data-testid="arome-point-panel" className="pointer-events-auto w-full max-w-[360px] overflow-hidden rounded-2xl border border-violet-700/65 bg-slate-950/97 text-slate-100 shadow-2xl shadow-black/70 backdrop-blur-xl">
      <div className="flex items-start justify-between gap-2 border-b border-slate-800 bg-slate-900/85 px-3 py-2">
        <div>
          <div className="text-xs font-semibold">AROME HD · valore puntuale</div>
          <div className="mt-0.5 text-[10px] text-slate-400">Valore letto dal raster del prodotto selezionato</div>
        </div>
        <button data-testid="arome-point-close" aria-label="Chiudi valore AROME" onClick={onClose}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"><X className="size-4" /></button>
      </div>
      <div className="space-y-2 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400">
          <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{decimal(point.lat)}°N · {decimal(point.lon)}°E</span>
          <span className="inline-flex items-center gap-1"><Clock3 className="size-3" />{fmtTime(time)}</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2.5">
          <p className="text-[10px] text-slate-400">{value?.label ?? "Parametro AROME"}</p>
          {loading ? <p className="mt-1 text-lg font-semibold">Lettura…</p>
            : error ? <p className="mt-1 text-xs text-amber-200">Raster non disponibile per questa interrogazione.</p>
            : value?.value === null || value?.value === undefined
              ? <p className="mt-1 text-lg font-semibold">n.d. <span className="text-sm font-medium text-slate-400">{value?.unit}</span></p>
              : <p className="mt-1 text-lg font-semibold">{value.value.toLocaleString("it-IT", { maximumFractionDigits: 1 })} <span className="text-sm font-medium text-slate-400">{value.unit}</span></p>}
        </div>
        <p className="text-[9px] leading-snug text-slate-500">Valore ricavato dalla scala cromatica del prodotto AROME; è una previsione di griglia, non una misura osservata.</p>
      </div>
    </div>
  );
}
