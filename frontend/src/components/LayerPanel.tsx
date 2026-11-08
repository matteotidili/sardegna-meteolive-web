import { Radar, CloudSun, Flame, ShieldAlert } from "lucide-react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AromeResponse } from "@/lib/types";
import { AROME_NOTES, AROME_PRECIP_KEY } from "@/lib/meteo";
import { cn } from "@/lib/utils";

export type AnimLayer = "none" | "radar-VMI" | "radar-SRI" | "arome";

interface Props {
  anim: AnimLayer;
  setAnim: (a: AnimLayer) => void;
  aromeParam: string;
  setAromeParam: (k: string) => void;
  arome: AromeResponse | undefined;
  opacity: number;
  setOpacity: (n: number) => void;
  fires: boolean;
  setFires: (b: boolean) => void;
  alerts: boolean;
  setAlerts: (b: boolean) => void;
  fireCount: number | null;
}

function Toggle({ on, onClick, icon, title, sub, testid }: { on: boolean; onClick: () => void; icon: React.ReactNode; title: string; sub: string; testid: string }) {
  return (
    <button
      data-testid={testid}
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors duration-150",
        on ? "border-sky-600/70 bg-sky-950/50 text-slate-50" : "border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700 hover:bg-slate-800/60",
      )}
    >
      <span className={cn("grid size-7 place-items-center rounded-md", on ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium">{title}</span>
        <span className="block truncate text-[10px] text-slate-400">{sub}</span>
      </span>
      <span className={cn("font-num text-[10px]", on ? "text-sky-300" : "text-slate-500")}>{on ? "ON" : "OFF"}</span>
    </button>
  );
}

export default function LayerPanel(p: Props) {
  const groups = new Map<string, AromeResponse["parameters"]>();
  (p.arome?.parameters ?? []).forEach((x) => groups.set(x.group, [...(groups.get(x.group) ?? []), x]));
  const labelOf = (k: string) => (k === AROME_PRECIP_KEY ? "Precipitazione oraria" : p.arome?.parameters.find((x) => x.key === k)?.label ?? k);

  return (
    <div className="space-y-3" data-testid="layer-panel">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Osservazioni radar</div>
      <Toggle testid="layer-toggle-radar-vmi" on={p.anim === "radar-VMI"} onClick={() => p.setAnim(p.anim === "radar-VMI" ? "none" : "radar-VMI")}
        icon={<Radar className="size-4" />} title="Radar DPC · VMI" sub="Massima riflettività verticale (dBZ)" />
      <Toggle testid="layer-toggle-radar-sri" on={p.anim === "radar-SRI"} onClick={() => p.setAnim(p.anim === "radar-SRI" ? "none" : "radar-SRI")}
        icon={<Radar className="size-4" />} title="Radar DPC · SRI" sub="Intensità di precipitazione al suolo (mm/h)" />

      <div className="pt-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">Modello numerico</div>
      <Toggle testid="layer-toggle-arome" on={p.anim === "arome"} onClick={() => p.setAnim(p.anim === "arome" ? "none" : "arome")}
        icon={<CloudSun className="size-4" />} title="AROME-France HD"
        sub={p.arome ? `Corsa ${p.arome.run_time.slice(11, 16)} UTC · età ${p.arome.run_age_hours.toString().replace(".", ",")} h` : "Previsione 0,01° · H+1…H+51"} />
      {p.anim === "arome" && (
        <div className="space-y-1.5 pl-1">
          <Select value={p.aromeParam} onValueChange={(v: string) => p.setAromeParam(v)}>
            <SelectTrigger data-testid="arome-parameter-select" className="h-8 w-full border-slate-700 bg-slate-950/60 text-xs">
              <SelectValue>{(v) => labelOf(v as string)}</SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-80 border-slate-700 bg-slate-900">
              <SelectGroup>
                <SelectLabel>Precipitazioni</SelectLabel>
                <SelectItem value={AROME_PRECIP_KEY} data-testid="arome-param-option-precip_1h">Precipitazione oraria</SelectItem>
              </SelectGroup>
              {[...groups.entries()].map(([g, list]) => (
                <SelectGroup key={g}>
                  <SelectLabel>{g}</SelectLabel>
                  {list.map((x) => (
                    <SelectItem key={x.key} value={x.key} data-testid={`arome-param-option-${x.key}`}>{x.label}</SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          {AROME_NOTES[p.aromeParam] && <p className="text-[10px] leading-snug text-amber-200/80" data-testid="arome-param-note">{AROME_NOTES[p.aromeParam]}</p>}
          {p.arome && !p.arome.complete && <p className="text-[10px] text-red-300">Corsa incompleta: {p.arome.frames.length}/{p.arome.horizon_hours} scadenze.</p>}
        </div>
      )}

      {p.anim !== "none" && (
        <label className="block pt-1">
          <span className="flex justify-between text-[11px] text-slate-400">Opacità layer <span className="font-num">{Math.round(p.opacity * 100)}%</span></span>
          <input data-testid="layer-opacity-slider" type="range" min={0.3} max={1} step={0.05} value={p.opacity}
            onChange={(e) => p.setOpacity(Number(e.target.value))} className="meteo-range" />
        </label>
      )}

      <div className="pt-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">Sovrapposizioni</div>
      <Toggle testid="layer-toggle-alerts" on={p.alerts} onClick={() => p.setAlerts(!p.alerts)} icon={<ShieldAlert className="size-4" />}
        title="Aree allerta MeteoAlarm" sub="Poligoni avvisi ufficiali Sardegna" />
      <Toggle testid="layer-toggle-frp" on={p.fires} onClick={() => p.setFires(!p.fires)} icon={<Flame className="size-4" />}
        title="Anomalie termiche FRP" sub={p.fires && p.fireCount !== null ? `${p.fireCount} rilevazioni MTG FCI · ultimi 90 min` : "EUMETSAT MTG FCI · non incendi confermati"} />
    </div>
  );
}
