import { useEffect, useRef, useState } from "react";
import { Radar, CloudSun, ShieldAlert, Wind, Satellite, Zap, MapIcon, Landmark, Grid2x2, Navigation, Waves, Camera } from "lucide-react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AromeResponse } from "@/lib/types";
import { AROME_NOTES, AROME_PRECIP_KEY } from "@/lib/meteo";
import type { LightningStatus } from "@/lib/lightning";
import { cn } from "@/lib/utils";
import { forecastTitle, SAT_OPTIONS } from "@/lib/layerPresentation";
import { SUBREGIONS_CREDIT } from "@/lib/boundaries";
import { INTERPOLATION_OPTIONS, type InterpolationCoverage, type InterpolationKey } from "@/lib/stationInterpolation";

export type AnimLayer = "none" | "radar-VMI" | "radar-SRI" | "radar-OPERA" | "arome" | "marine" | `sat-${string}`;

interface Props {
  satellites: string[];
  toggleSatellite: (key: string) => void;
  satelliteOpacity: Record<string, number>;
  setSatelliteOpacity: (key: string, opacity: number) => void;
  anim: AnimLayer;
  setAnim: (a: AnimLayer) => void;
  accumulation: string | null;
  setAccumulation: (product: string | null) => void;
  accumulationStatus: string;
  aromeParam: string;
  setAromeParam: (k: string) => void;
  arome: AromeResponse | undefined;
  opacity: number;
  setOpacity: (n: number) => void;
  webcams: boolean;
  setWebcams: (on: boolean) => void;
  webcamCount: number;
  hydrometers: boolean;
  setHydrometers: (on: boolean) => void;
  hydroStatus: string;
  alerts: boolean;
  setAlerts: (b: boolean) => void;
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
  marineControls: React.ReactNode;
  showIspraBuoys: boolean;
  setShowIspraBuoys: (on: boolean) => void;
  showRonBuoys: boolean;
  setShowRonBuoys: (on: boolean) => void;
  interpolationEnabled: boolean;
  setInterpolationEnabled: (on: boolean) => void;
  interpolationKey: InterpolationKey;
  setInterpolationKey: (key: InterpolationKey) => void;
  interpolationMaskStatus: InterpolationCoverage["maskStatus"];
  interpolationCount: number;
  interpolationUsed: number;
  interpolationLatest: string | null;
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
        <span className="block text-[11px] leading-snug text-slate-400">{sub}</span>
      </span>
      <span className={cn("font-num text-[10px]", on ? "text-sky-300" : "text-slate-500")}>{on ? "Attivo" : ""}</span>
    </button>
  );
}

const SECTION = "pt-1 text-[10px] uppercase tracking-[0.18em] text-slate-500";
const LSTATUS: Record<LightningStatus, string> = { off: "Blitzortung / LightningMaps · ultimi 60 min", connecting: "Collegamento alla rete di rilevamento…", live: "LIVE", error: "Dati interrotti, nuovo tentativo in corso…" };

export default function LayerPanel(p: Props) {
  const groups = new Map<string, AromeResponse["parameters"]>();
  (p.arome?.parameters ?? []).forEach((x) => groups.set(x.group, [...(groups.get(x.group) ?? []), x]));
  const labelOf = (k: string) => forecastTitle(k, p.arome?.parameters.find((x) => x.key === k), true);
  const toggleAnim = (a: AnimLayer) => p.setAnim(p.anim === a ? "none" : a);

  // Opacity: local state while dragging, committed on release (no re-render storm on mobile)
  const [op, setOp] = useState(p.opacity);
  const dragging = useRef(false);
  useEffect(() => { if (!dragging.current) setOp(p.opacity); }, [p.opacity]);

  const primarySatellites = new Set(["ir105", "truecolour", "cloudtype", "li"]);
  const satelliteToggle = (s: (typeof SAT_OPTIONS)[number]) => {
    const selected = p.anim.startsWith("sat-") && p.satellites.includes(s.key);
    return (
      <div key={s.key}>
        <Toggle testid={`layer-toggle-sat-${s.key}`} on={selected} onClick={() => p.toggleSatellite(s.key)}
          icon={<Satellite className="size-4" />} title={s.title} sub={s.sub} />
        {selected && <label className="flex items-center gap-2 px-2 py-1 text-[10px] text-slate-300">
          Opacità {Math.round((p.satelliteOpacity[s.key] ?? 1) * 100)}%
          <input aria-label={`Opacità ${s.title}`} type="range" min="0" max="1" step="0.05"
            value={p.satelliteOpacity[s.key] ?? 1} onChange={(e) => p.setSatelliteOpacity(s.key, Number(e.target.value))} />
        </label>}
      </div>
    );
  };

  return (
    <div className="space-y-3" data-testid="layer-panel">
      <div className={SECTION}>Radar e piogge osservate</div>
      <Toggle testid="layer-toggle-radar-vmi" on={p.anim === "radar-VMI"} onClick={() => toggleAnim("radar-VMI")}
        icon={<Radar className="size-4" />} title="Echi radar sull’Italia" sub="Mostra dove il radar rileva echi più deboli o più forti." />
      <Toggle testid="layer-toggle-radar-opera" on={p.anim === "radar-OPERA"} onClick={() => toggleAnim("radar-OPERA")}
        icon={<Radar className="size-4" />} title="Intensità di pioggia in Europa" sub="Stima da radar in mm/h." />
      <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5" data-testid="dpc-accumulation-control">
        <div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-[13px] font-medium text-slate-200">Pioggia accumulata da radar</span><span className="text-[10px] text-slate-500">mm</span></div>
        <div className="grid grid-cols-5 gap-1">
          {[['SRT1','1 h'],['CUM3','3 h'],['CUM6','6 h'],['CUM12','12 h'],['CUM24','24 h']].map(([code, label]) => (
            <button key={code} type="button" data-testid={`dpc-accumulation-${code.toLowerCase()}`} aria-pressed={p.accumulation === code}
              onClick={() => { const next = p.accumulation === code ? null : code; p.setAccumulation(next); if (next) p.setAnim("none"); }}
              className={cn("rounded-md border px-1 py-1.5 text-[10px] font-semibold transition-colors", p.accumulation === code ? "border-sky-500 bg-sky-600 text-white" : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500")}>{label}</button>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-slate-400">{p.accumulationStatus || "Seleziona la fascia di accumulo osservata."}</p>
      </div>

      <div className={SECTION}>Stazioni e osservazioni</div>
      <Toggle testid="layer-toggle-station-interpolation" on={p.interpolationEnabled && !p.is3d}
        disabled={p.is3d} onClick={() => p.setInterpolationEnabled(!p.interpolationEnabled)}
        icon={<Grid2x2 className="size-4" />} title="Mappa stimata dalle stazioni"
        sub={p.is3d ? "Disponibile nella vista 2D" : "Aree stimate dai dati recenti delle stazioni"} />
      {p.interpolationEnabled && !p.is3d && <div className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
        <label className="block text-[10px] text-slate-400" htmlFor="station-interpolation-variable">Misura da rappresentare</label>
        <Select value={p.interpolationKey} onValueChange={(v: string) => p.setInterpolationKey(v as InterpolationKey)}>
          <SelectTrigger id="station-interpolation-variable" data-testid="station-interpolation-variable" className="h-8 w-full border-slate-700 bg-slate-950/60 text-xs">
            <SelectValue>{(v) => INTERPOLATION_OPTIONS.find((x) => x.key === v)?.label ?? "Temperatura attuale"}</SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-80 border-slate-700 bg-slate-900">
            {INTERPOLATION_OPTIONS.map((option) => <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-[10px] leading-snug text-slate-400">
          {p.interpolationEnabled ? `${p.interpolationUsed} stazioni utilizzate su ${p.interpolationCount} idonee` : `${p.interpolationCount} stazioni idonee`} · ultimo dato {p.interpolationLatest ?? "non disponibile"}.
          {" "}I colori mostrano stime basate sulle misure recenti e sulla distanza dalle stazioni (IDW²).
          {p.interpolationEnabled && !p.is3d && p.interpolationUsed === 0 && (
            <span className="mt-1 block text-amber-200" data-testid="station-interpolation-no-coverage">
              {p.interpolationMaskStatus === "error" ? "Confine della Sardegna non disponibile. Mappa stimata sospesa."
                : p.interpolationMaskStatus !== "ready" ? "Caricamento del confine regionale…"
                : p.interpolationCount < 3 ? "Servono almeno 3 stazioni recenti con questa misura."
                : "Nessuna area nella vista è coperta da almeno 3 stazioni entro il raggio della variabile."}
            </span>
          )}
        </p>
      </div>}

      <div className={SECTION}>Immagini satellitari</div>
      <div className="grid grid-cols-1 gap-1.5">
        {SAT_OPTIONS.filter((s) => primarySatellites.has(s.key)).map(satelliteToggle)}
        <details className="rounded-lg border border-slate-800 px-2 py-1.5">
          <summary className="cursor-pointer text-xs text-slate-300">Altre immagini satellitari</summary>
          <div className="mt-2 space-y-1.5">{SAT_OPTIONS.filter((s) => !primarySatellites.has(s.key)).map(satelliteToggle)}</div>
        </details>
      </div>

      <div className={SECTION}>Previsioni meteo</div>
      <Toggle testid="layer-toggle-arome" on={p.anim === "arome"} onClick={() => toggleAnim("arome")}
        icon={<CloudSun className="size-4" />} title="Previsioni meteo sulla Sardegna"
        sub={p.arome ? `Corsa ${p.arome.run_time.slice(11, 16)} UTC · età ${p.arome.run_age_hours.toString().replace(".", ",")} h` : "Pioggia, temperatura, vento e altri fenomeni"} />
      {p.anim === "arome" && (
        <div className="space-y-1.5 pl-1">
          <Select value={p.aromeParam} onValueChange={(v: string) => p.setAromeParam(v)}>
            <SelectTrigger data-testid="arome-parameter-select" className="h-8 w-full border-slate-700 bg-slate-950/60 text-xs">
              <SelectValue>{(v) => labelOf(v as string)}</SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-80 border-slate-700 bg-slate-900">
              <SelectGroup>
                <SelectLabel>Precipitazioni</SelectLabel>
                <SelectItem value={AROME_PRECIP_KEY} data-testid="arome-param-option-precip_1h">{labelOf(AROME_PRECIP_KEY)}</SelectItem>
              </SelectGroup>
              {[...groups.entries()].map(([g, list]) => (
                <SelectGroup key={g}>
                  <SelectLabel>{g}</SelectLabel>
                  {list.map((x) => (
                    <SelectItem key={x.key} value={x.key} data-testid={`arome-param-option-${x.key}`}>{labelOf(x.key)}</SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          {AROME_NOTES[p.aromeParam] && <p className="text-[10px] leading-snug text-amber-200/80" data-testid="arome-param-note">{AROME_NOTES[p.aromeParam]}</p>}
          {p.arome && !p.arome.complete && <p className="text-[10px] text-red-300">Corsa incompleta: {p.arome.frames.length}/{p.arome.horizon_hours} scadenze.</p>}
          <Toggle testid="layer-toggle-wind-flow" on={p.wind && !p.is3d} disabled={p.is3d} onClick={() => p.setWind(!p.wind)}
            icon={<Wind className="size-4" />} title="Vento previsto in movimento"
            sub={p.is3d ? "Disponibili solo in 2D" : "Colore e velocità seguono le raffiche previste"} />
          {p.wind && p.windWarning && <p className="text-[10px] text-amber-200/90" data-testid="wind-flow-warning">{p.windWarning}</p>}
        </div>
      )}

      <div className={SECTION}>Mare e boe</div>
      <Toggle testid="layer-toggle-ispra-mareografico" on={p.showIspraBuoys} onClick={() => p.setShowIspraBuoys(!p.showIspraBuoys)}
        icon={<Waves className="size-4" />} title="Stazioni del livello del mare" sub="Livello mare, temperatura acqua e parametri meteo" />
      <Toggle testid="layer-toggle-ispra-ron" on={p.showRonBuoys} onClick={() => p.setShowRonBuoys(!p.showRonBuoys)}
        icon={<Waves className="size-4" />} title="Boe delle onde" sub="Boe ondametriche · onde, correnti e dati meteo" />
      {(p.showIspraBuoys || p.showRonBuoys) && <p className="px-1 text-[10px] leading-snug text-slate-400">Attiva le reti che vuoi vedere e clicca una boa per aprire rilievi e previsione marina.</p>}


      <Toggle testid="layer-toggle-marine" on={p.anim === "marine"} onClick={() => toggleAnim("marine")}
        icon={<Waves className="size-4" />} title="Previsioni di onde e livello del mare" sub="Onde e livello del mare · Mediterraneo" />
      {p.anim === "marine" && p.marineControls}

      {p.anim !== "none" && (
        <label className="block pt-1">
          <span className="flex justify-between text-[11px] text-slate-400">{p.anim.startsWith("radar-") ? "Opacità radar · 2D e 3D" : "Opacità layer"} <span className="font-num">{Math.round(op * 100)}%</span></span>
          <input data-testid="layer-opacity-slider" aria-label={p.anim.startsWith("radar-") ? "Opacità radar 2D e 3D" : "Opacità layer"} type="range" min={0} max={1} step={0.05} value={op}
            onPointerDown={() => { dragging.current = true; }}
            onChange={(e) => { setOp(Number(e.target.value)); if (!dragging.current) p.setOpacity(Number(e.target.value)); }}
            onPointerUp={() => { dragging.current = false; p.setOpacity(op); }}
            className="meteo-range" />
        </label>
      )}

      <div className={SECTION}>Vento vicino al suolo</div>
      <Toggle testid="layer-toggle-live-wind" on={p.liveWind && !p.is3d} disabled={p.is3d} onClick={() => p.setLiveWind(!p.liveWind)}
        icon={<Wind className="size-4" />} title="Vento stimato per l’ora attuale"
        sub={p.is3d ? "Disponibile solo in 2D" : p.liveWindSub} />
      {p.liveWind && !p.is3d && (
        <p data-testid="live-wind-note" className="px-1 text-[10px] leading-snug text-slate-400">
          Campo previsto del vento a 10 m via Open-Meteo: Mediterraneo con griglia campionata a 1° (best match) e Sardegna con campionamento a 0,125° del modello ICON-2I (risoluzione nativa ~2 km, nuove corse ogni 12 ore). Non sono misure anemometriche. L'animazione delle linee è illustrativa.
        </p>
      )}
      {p.liveWind && !p.is3d && (
        <Toggle testid="layer-toggle-station-arrows" on={p.stationArrows} onClick={() => p.setStationArrows(!p.stationArrows)}
          icon={<Navigation className="size-4" />} title="Vento misurato dalle stazioni"
          sub={`Misurato · ${p.arrowCount} stazioni con direzione · tocca per confronto`} />
      )}

      <details className="space-y-2 rounded-lg border border-slate-800 p-2">
      <summary className="cursor-pointer text-xs font-medium text-slate-200">Altri dati</summary>
      <Toggle testid="layer-toggle-webcams" on={p.webcams} onClick={() => p.setWebcams(!p.webcams)}
        icon={<Camera className="size-4" />} title="Webcam"
        sub={`${p.webcamCount} località · Panoramicams`} />
      {p.webcams && <p className="px-1 text-[11px] leading-snug text-slate-400">Foto di copertina Panoramicams, non ultimo frame. Tocca la foto per aprire il live.</p>}


      <Toggle testid="layer-toggle-hydrometers" on={p.hydrometers} onClick={() => p.setHydrometers(!p.hydrometers)}
        icon={<Waves className="size-4" />} title="Livello di fiumi e corsi d’acqua" sub={p.hydroStatus} />
      {p.hydrometers && <p data-testid="hydro-note" className="px-1 text-[10px] leading-snug text-slate-400">
        Livelli della rete fiduciaria ARPAS, riferiti allo zero idrometrico di ciascuna sezione.
        Le soglie S1–S3 non sono livelli di allerta territoriale.
      </p>}


      <Toggle testid="layer-toggle-lightning" on={p.lightning} onClick={() => p.setLightning(!p.lightning)} icon={<Zap className="size-4" />}
        title="Fulmini rilevati da terra"
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
        title="Zone con allerte meteo" sub="Avvisi ufficiali MeteoAlarm per la Sardegna" />
      </details>
    </div>
  );
}

