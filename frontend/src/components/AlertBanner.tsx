import { ShieldAlert, ShieldCheck, ExternalLink } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AlertsResponse } from "@/lib/types";
import { fmtTime } from "@/lib/meteo";
import { cn } from "@/lib/utils";

const LEVEL: Record<number, { name: string; cls: string; dot: string }> = {
  2: { name: "Gialla", cls: "bg-yellow-950/85 border-yellow-700/70 text-yellow-100", dot: "bg-yellow-400" },
  3: { name: "Arancione", cls: "bg-orange-950/85 border-orange-700/70 text-orange-100", dot: "bg-orange-400" },
  4: { name: "Rossa", cls: "bg-red-950/85 border-red-700/70 text-red-100", dot: "bg-red-500" },
};

export default function AlertBanner({ data }: { data: AlertsResponse | undefined }) {
  if (!data) return null;
  if (!data.available) {
    return (
      <div data-testid="meteo-alert-banner" className="pointer-events-auto inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/85 px-3 py-1.5 text-xs text-slate-300 backdrop-blur-xl">
        <ShieldAlert className="size-3.5" /> MeteoAlarm non disponibile
      </div>
    );
  }
  if (data.warnings.length === 0) {
    return (
      <div data-testid="meteo-alert-banner" className="pointer-events-auto inline-flex items-center gap-2 rounded-lg border border-emerald-800/60 bg-slate-900/85 px-3 py-1.5 text-xs text-emerald-200 backdrop-blur-xl">
        <ShieldCheck className="size-3.5" /> Nessuna allerta MeteoAlarm in corso o prevista per la Sardegna
      </div>
    );
  }
  const lv = LEVEL[data.max_level] ?? LEVEL[2];
  return (
    <Popover>
      <PopoverTrigger
        data-testid="meteo-alert-banner"
        className={cn("pointer-events-auto inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium backdrop-blur-xl transition-transform active:scale-[.98]", lv.cls)}
      >
        <span className={cn("size-2 rounded-full live-dot", lv.dot)} />
        <ShieldAlert className="size-3.5" />
        Allerta {lv.name} MeteoAlarm · Sardegna
        <span className="font-num opacity-80">{data.active_count} in corso · {data.upcoming_count} prevista/e</span>
      </PopoverTrigger>
      <PopoverContent className="w-80 border-slate-700 bg-slate-900 p-3 text-slate-100" data-testid="meteo-alert-details">
        <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">Avvisi ufficiali MeteoAlarm / EUMETNET</div>
        <ul className="space-y-2">
          {data.warnings.map((w) => (
            <li key={w.id} className="rounded-md border border-slate-800 bg-slate-950/60 p-2 text-xs" data-testid={`alert-item-${w.id}`}>
              <div className="flex items-center gap-2 font-medium">
                <span className={cn("size-2 rounded-full", LEVEL[w.level]?.dot)} />
                {w.type_name || w.event}
                <span className="ml-auto text-[10px] uppercase text-slate-400">{w.status === "active" ? "in corso" : "prevista"}</span>
              </div>
              <div className="mt-1 font-num text-[11px] text-slate-400">{fmtTime(w.onset)} → {fmtTime(w.expires)}</div>
              <div className="text-[11px] text-slate-400">{w.area_desc}</div>
              {w.cap_url && (
                <a href={w.cap_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] text-sky-300 hover:underline">
                  Messaggio CAP <ExternalLink className="size-3" />
                </a>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] leading-snug text-slate-500">
          Livelli riportati senza reinterpretazione; non sostituiscono i bollettini della Protezione Civile regionale. Feed: {fmtTime(data.feed_updated)}
        </p>
      </PopoverContent>
    </Popover>
  );
}
