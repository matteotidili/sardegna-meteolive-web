import { useEffect, useRef, useState } from "react";
import { Radar, CloudSun, Flame, ShieldAlert, Wind, Satellite, Zap, MapIcon, Landmark, Grid2x2, Navigation } from "lucide-react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AromeResponse } from "@/lib/types";
import { AROME_NOTES, AROME_PRECIP_KEY } from "@/lib/meteo";
import type { LightningStatus } from "@/lib/lightning";
import { cn } from "@/lib/utils";
import { SUBREGIONS_CREDIT } from "@/lib/boundaries";

export type AnimLayer = "none" | "radar-VMI" | "radar-SRI" | "radar-OPERA" | "arome" | `sat-${string}`;

export const SAT_OPTIONS: { key: string; title: string; sub: string }[] = [
  { key: "truecolour", title: "MTG True Colour RGB", sub: "FCI 1 km · solo diurno" },
  { key: "ir105", title: "MTG IR10.5 µm", sub: "FCI HRFI · giorno e notte" },
  { key: "cloudphase", title: "MTG Cloud Phase RGB", sub: "Microfisica nubi · diurno" },
  { key: "snowfog", title: "MTG Day Snow Fog RGB", sub: "Neve, nebbia, nubi basse · diurno" },
  { key: "preciprate", title: "H SAF H40B", sub: "Precipitation rate · prodotto derivato" },
  { key: "li", title: "MTG Lightning Imager", sub: "Archivio satellitare · passo 5 min" },
];

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
  wind: boolean;
  setWind: (b: boolean) => void;
  windWarning: string | null;
  is3d: boolean;
  lightning: boolean;
  setLightning: (b: boolean) => void;
  lightningStatus: LightningStatus;
  strokeCount: number;
  liveWind: boolean;
  setLiveWind: (b: boolean) => void;
  liveWindSub: string;
  stationArrows: boolean;
  setStationArrows: (b: boolean) => void;
  arrowCount: number;
  boundaries: boolean;
  setBoundaries: (b: boolean) => void;
  subregions: boolean;
  setSubregions: (b: boolean) => void;
  municipalities: boolean;
  setMunicipalities: (b: boolean) => void;
}

function Toggle({ on, onClick, icon, title, sub, testid, disabled }: { on: boolean; onClick: () => void; icon: React.ReactNode; title: string; sub: string; testid: string; disabled?: boolean }) {
  return (
    <button
      data-testid={testid}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
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

const SECTION = "pt-1 text-[10px] uppercase tracking-[0.18em] text-slate-500";
const LSTATUS: Record<LightningStatus, string> = { off: "Blitzortung / LightningMaps · ultimi 60 min", connecting: "Connessione al feed…", live: "LIVE", error: "Feed interrotto · nuovo tentativo…" };

export default function LayerPanel(p: Props) {
  const groups = new Map<string, AromeResponse["parameters"]>();
  (p.arome?.parameters ?? []).forEach((x) => groups.set(x.group, [...(groups.get(x.group) ?? []), x]));
  const labelOf = (k: string) => (k === AROME_PRECIP_KEY ? "Precipitazione oraria" : p.arome?.parameters.find((x) => x.key === k)?.label ?? k);
  const toggleAnim = (a: AnimLayer) => p.setAnim(p.anim === a ? "none" : a);

  // Opacity: local state while dragging, committed on release (no re-render storm on mobile)
  const [op, setOp] = useState(p.opacity);
  const dragging = useRef(false);
  useEffect(() => { if (!dragging.current) setOp(p.opacity); }, [p.opacity]);

  return (
    <div className="space-y-3" data-testid="layer-panel">
      <div className={SECTION}>Osservazioni radar</div>
      <Toggle testid="layer-toggle-radar-vmi" on={p.anim === "radar-VMI"} onClick={() => toggleAnim("radar-VMI")}
        icon={<Radar className="size-4" />} title="Radar DPC · VMI" sub="Massima riflettività verticale (dBZ)" />
      <Toggle testid="layer-toggle-radar-sri" on={p.anim === "radar-SRI"} onClick={() => toggleAnim("radar-SRI")}
        icon={<Radar className="size-4" />} title="Radar DPC · SRI" sub="Intensità di precipitazione al suolo (mm/h)" />
      <Toggle testid="layer-toggle-radar-opera" on={p.anim === "radar-OPERA"} onClick={() => toggleAnim("radar-OPERA")}
        icon={<Radar className="size-4" />} title="Radar Europa · OPERA" sub="EUMETNET NIMBUS rain rate (mm/h) · passo 15 min" />

      <div className={SECTION}>Satelliti EUMETSAT</div>
      <div className="grid grid-cols-1 gap-1.5">
        {SAT_OPTIONS.map((s) => (
          <Toggle key={s.key} testid={`layer-toggle-sat-${s.key}`} on={p.anim === `sat-${s.key}`} onClick={() => toggleAnim(`sat-${s.key}`)}
            icon={<Satellite className="size-4" />} title={s.title} sub={s.sub} />
        ))}
      </div>

      <div className={SECTION}>Modello numerico</div>
      <Toggle testid="layer-toggle-arome" on={p.anim === "arome"} onClick={() => toggleAnim("arome")}
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
          <Toggle testid="layer-toggle-wind-flow" on={p.wind && !p.is3d} disabled={p.is3d} onClick={() => p.setWind(!p.wind)}
            icon={<Wind className="size-4" />} title="Linee di flusso vento 10 m"
            sub={p.is3d ? "Disponibili solo in 2D" : "Sincronizzate con la scadenza · velocità illustrativa"} />
          {p.wind && p.windWarning && <p className="text-[10px] text-amber-200/90" data-testid="wind-flow-warning">{p.windWarning}</p>}
        </div>
      )}

      {p.anim !== "none" && (
        <label className="block pt-1">
          <span className="flex justify-between text-[11px] text-slate-400">Opacità layer <span className="font-num">{Math.round(op * 100)}%</span></span>
          <input data-testid="layer-opacity-slider" type="range" min={0.3} max={1} step={0.05} value={op}
            onPointerDown={() => { dragging.current = true; }}
            onChange={(e) => { setOp(Number(e.target.value)); if (!dragging.current) p.setOpacity(Number(e.target.value)); }}
            onPointerUp={() => { dragging.current = false; p.setOpacity(op); }}
            className="meteo-range" />
        </label>
      )}

      <div className={SECTION}>Vento in tempo reale</div>
      <Toggle testid="layer-toggle-live-wind" on={p.liveWind && !p.is3d} disabled={p.is3d} onClick={() => p.setLiveWind(!p.liveWind)}
        icon={<Wind className="size-4" />} title="Flusso vento attuale 10 m"
        sub={p.is3d ? "Disponibile solo in 2D" : p.liveWindSub} />
      {p.liveWind && !p.is3d && (
        <p data-testid="live-wind-note" className="px-1 text-[10px] leading-snug text-slate-400">
          Analisi del quarto d'ora corrente via Open-Meteo: Mediterraneo con griglia 1° (best match, ICON-EU/globali, agg. orario), Sardegna con ItaliaMeteo-ARPAE ICON-2I ~2 km (agg. 30 min). Modello, non osservazione. Colori per velocità; animazione illustrativa.
        </p>
      )}
      {p.liveWind && !p.is3d && (
        <Toggle testid="layer-toggle-station-arrows" on={p.stationArrows} onClick={() => p.setStationArrows(!p.stationArrows)}
          icon={<Navigation className="size-4" />} title="Frecce vento stazioni"
          sub={`Misurato · ${p.arrowCount} stazioni con direzione · tocca per confronto`} />
      )}

      <div className={SECTION}>Fulmini e sovrapposizioni</div>
      <Toggle testid="layer-toggle-lightning" on={p.lightning} onClick={() => p.setLightning(!p.lightning)} icon={<Zap className="size-4" />}
        title="Fulmini in tempo reale"
        sub={p.lightning && p.lightningStatus === "live" ? `LIVE · ${p.strokeCount} scariche negli ultimi 60 min` : LSTATUS[p.lightning ? p.lightningStatus : "off"]} />
      <Toggle testid="layer-toggle-boundaries" on={p.boundaries} onClick={() => p.setBoundaries(!p.boundaries)} icon={<MapIcon className="size-4" />}
        title="Confini amministrativi" sub="Regioni italiane e Corsica" />
      <Toggle testid="layer-toggle-municipalities" on={p.municipalities} onClick={() => p.setMunicipalities(!p.municipalities)} icon={<Grid2x2 className="size-4" />}
        title="Confini comunali" sub="377 comuni sardi · visibili da zoom 9" />
      <Toggle testid="layer-toggle-subregions" on={p.subregions} onClick={() => p.setSubregions(!p.subregions)} icon={<Landmark className="size-4" />}
        title="Subregioni storiche" sub="Limiti storico-geografici indicativi" />
      {p.subregions && (
        <p data-testid="subregions-note" className="px-1 text-[10px] leading-snug text-slate-400">
          Confini storico-geografici indicativi, distinti dai limiti amministrativi.{" "}
          <a data-testid="subregions-credit-link" href={SUBREGIONS_CREDIT.url} target="_blank" rel="noopener noreferrer" className="text-sky-400 underline">
            Realizzato da {SUBREGIONS_CREDIT.text} sulla piattaforma GeoNue
          </a>
        </p>
      )}
      <Toggle testid="layer-toggle-alerts" on={p.alerts} onClick={() => p.setAlerts(!p.alerts)} icon={<ShieldAlert className="size-4" />}
        title="Aree allerta MeteoAlarm" sub="Poligoni avvisi ufficiali Sardegna" />
      <Toggle testid="layer-toggle-frp" on={p.fires} onClick={() => p.setFires(!p.fires)} icon={<Flame className="size-4" />}
        title="Anomalie termiche FRP" sub={p.fires && p.fireCount !== null ? `${p.fireCount} rilevazioni MTG FCI · ultimi 90 min` : "EUMETSAT MTG FCI · non incendi confermati"} />
    </div>
  );
}
