import { Activity, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { AlertsResponse, AromeResponse, NetworkStatus, RadarFrames, Rain48Response } from "@/lib/types";
import { fmtTime } from "@/lib/meteo";
import { cn } from "@/lib/utils";

interface Props {
  networks: NetworkStatus[] | undefined;
  stationsError: boolean;
  arome: AromeResponse | undefined;
  alerts: AlertsResponse | undefined;
  radar: RadarFrames | undefined;
  rain48: Rain48Response | undefined;
  serverTime: string | undefined;
  updatedAt: number;
}

const ICON = {
  ok: <CheckCircle2 className="size-4 text-emerald-400" />,
  degraded: <AlertTriangle className="size-4 text-amber-400" />,
  unavailable: <XCircle className="size-4 text-red-400" />,
};
const LABEL = { ok: "Operativa", degraded: "Degradata", unavailable: "Non disponibile" };

export default function HealthDialog(p: Props) {
  const worst = p.stationsError ? "unavailable"
    : p.networks?.some((n) => n.status === "unavailable") ? "unavailable"
    : p.networks?.some((n) => n.status === "degraded") ? "degraded" : "ok";
  const dot = { ok: "bg-emerald-400", degraded: "bg-amber-400", unavailable: "bg-red-500" }[worst];
  return (
    <Dialog>
      <DialogTrigger data-testid="data-health-status-btn"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/50 px-2.5 text-xs text-slate-200 transition-colors hover:bg-slate-800 hover:text-sky-300">
        <span className={cn("size-2 rounded-full live-dot", dot)} />
        <Activity className="size-3.5" />
        <span className="hidden sm:inline">Stato fonti</span>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-slate-800 bg-slate-900 text-slate-100 sm:max-w-xl" data-testid="data-health-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">Stato delle fonti dati</DialogTitle>
          <DialogDescription className="text-slate-400">
            Freschezza calcolata dall'orario reale di ciascuna osservazione (non dall'orario del file o del controllo).
            Ora server: <span className="font-num">{fmtTime(p.serverTime)}</span> · ultimo aggiornamento client: <span className="font-num">{p.updatedAt ? fmtTime(new Date(p.updatedAt).toISOString()) : "n.d."}</span>
          </DialogDescription>
        </DialogHeader>
        {p.stationsError && <div className="rounded-md border border-red-800 bg-red-950/50 p-2 text-xs text-red-200">Backend non raggiungibile: dati stazioni non aggiornati.</div>}
        <ul className="space-y-2">
          {(p.networks ?? []).map((n) => (
            <li key={n.key} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3" data-testid={`health-network-${n.key}`}>
              <div className="flex items-center gap-2">
                {ICON[n.status]}
                <span className="font-medium">{n.label}</span>
                <span className="ml-auto text-[11px] text-slate-400" data-testid={`health-network-status-${n.key}`}>{LABEL[n.status]}</span>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 font-num text-[11px] text-slate-400 sm:grid-cols-4">
                <span>Stazioni {n.station_count}</span>
                <span className="text-emerald-300/90">Recenti {n.fresh_count}</span>
                <span className="text-amber-300/90">Ritardo {n.stale_count}</span>
                <span>Storiche {n.historic_count}</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                Ultima osservazione: <span className="font-num text-slate-200">{fmtTime(n.latest_obs)}</span>
                {n.checked_at && <> · controllo: <span className="font-num">{fmtTime(n.checked_at)}</span></>}
              </div>
              {n.warning && <p className="mt-1 text-[11px] text-amber-200/90">{n.warning}</p>}
            </li>
          ))}
          <li className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-[11px] text-slate-400" data-testid="health-products">
            <div className="mb-1 font-medium text-slate-200">Prodotti</div>
            <div>Radar DPC: ultimo frame <span className="font-num text-slate-200">{p.radar ? fmtTime(p.radar.latest_time) : "attivare il layer radar"}</span></div>
            <div>AROME-France HD: corsa <span className="font-num text-slate-200">{p.arome ? fmtTime(p.arome.run_time) : "n.d."}</span>{p.arome && <> · età {p.arome.run_age_hours} h · {p.arome.complete ? "completa" : "INCOMPLETA"}</>}</div>
            <div>MeteoAlarm: feed <span className="font-num text-slate-200">{fmtTime(p.alerts?.feed_updated)}</span></div>
            <div data-testid="health-rain48">Pioggia 48 h: {p.rain48 ? (p.rain48.operational ? `${p.rain48.station_count} stazioni` : "NON operativa – dataset senza stazioni") : "n.d."}</div>
            <div className="mt-1 text-slate-500">Weather Underground e WeatherLink sospese per decisione operativa.</div>
          </li>
        </ul>
      </DialogContent>
    </Dialog>
  );
}
