import { useEffect, useRef, useState } from "react";
import { Radar, CloudSun, ShieldAlert, Wind, Satellite, Zap, MapIcon, Landmark, Grid2x2, Navigation, Waves, Camera } from "lucide-react";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AromeResponse, Icon2iResponse } from "@/lib/types";
import { AROME_NOTES, AROME_PRECIP_KEY } from "@/lib/meteo";
import type { LightningStatus } from "@/lib/lightning";
import { cn } from "@/lib/utils";
import { SUBREGIONS_CREDIT } from "@/lib/boundaries";

export type AnimLayer = "none" | "radar-VMI" | "radar-SRI" | "radar-OPERA" | "arome" | "icon2i" | "marine" | `sat-${string}`;

export const SAT_OPTIONS: { key: string; title: string; sub: string }[] = [
  { key: "eview", title: "MSG European HRV RGB", sub: "Vista europea HRV · passo 15 min" },
  { key: "airmass", title: "MSG Airmass RGB", sub: "Masse d’aria · giorno e notte · passo 15 min" },
  { key: "rdt", title: "RDT · Celle temporalesche", sub: "MSG / NWC SAF · passo 15 min" },
  { key: "truecolour", title: "MTG GeoColour RGB", sub: "FCI · giorno e notte" },
  { key: "cloudtype", title: "MTG Cloud Type RGB", sub: "Tipologia delle nubi · diurno" },
  { key: "ir105", title: "MTG IR10.5 µm", sub: "FCI HRFI · giorno e notte" },
  { key: "sandwich", title: "MTG Sandwich VIS/IR HD", sub: "Composito qualitativo · IR notturno · nessuna scala termica calibrata" },
  { key: "cloudphase", title: "MTG Cloud Phase RGB", sub: "Microfisica nubi · diurno" },
  { key: "snowfog", title: "MTG Day Snow Fog RGB", sub: "Neve, nebbia, nubi basse · diurno" },
  { key: "preciprate", title: "H SAF H40B", sub: "Precipitation rate · prodotto derivato" },
  { key: "li", title: "MTG LI · Area dei lampi (AFA)", sub: "EUMETSAT · giorno e notte · passo 5 min" },
];

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
  icon2iParam: string;
  setIcon2iParam: (k: string) => void;
  icon2i: Icon2iResponse | undefined;
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
  const shortLabels: Record<string, string> = {
    t2m: "Temperatura a 2 m", tmaxrun: "Temperatura massima a 2 m", tminrun: "Temperatura minima a 2 m",
    windchill: "Wind chill", humidex: "Humidex", td2m: "Punto di rugiada a 2 m", rh2m: "Umidità a 2 m",
    wind10: "Vento a 10 m", winddir10: "Direzione del vento", gust10: "Raffiche", gustmaxrun: "Raffica massima",
    cape: "CAPE (CAPE_INS)", pressure_sfc: "Pressione al suolo", cloud_low: "Nubi basse", cloud_mid: "Nubi medie",
    cloud_high: "Nubi alte", sim_refl: "Riflettività simulata", rain_acc: "Precipitazioni cumulate",
    rain_liquid_acc: "Pioggia cumulata", rain_1h: "Pioggia oraria", snow_1h: "Neve oraria",
    graupel_1h: "Graupel orario", snow_acc: "Neve cumulata", graupel_acc: "Graupel cumulato",
    frozen_acc: "Neve e graupel cumulati", precip_phase: "Fase delle precipitazioni", sim_ir: "Infrarosso simulato",
  };
  const labelOf = (k: string) => (k === AROME_PRECIP_KEY ? "Precipitazione oraria" : shortLabels[k] ?? p.arome?.parameters.find((x) => x.key === k)?.label ?? k);
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
      <Toggle testid="layer-toggle-radar-opera" on={p.anim === "radar-OPERA"} onClick={() => toggleAnim("radar-OPERA")}
        icon={<Radar className="size-4" />} title="Radar Europa · OPERA" sub="EUMETNET NIMBUS rain rate (mm/h) · passo 15 min" />
      <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5" data-testid="dpc-accumulation-control">
        <div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-[13px] font-medium text-slate-200">Cumulate Radar-DPC</span><span className="text-[10px] text-slate-500">mm</span></div>
        <div className="grid grid-cols-5 gap-1">
          {[['SRT1','1 h'],['CUM3','3 h'],['CUM6','6 h'],['CUM12','12 h'],['CUM24','24 h']].map(([code, label]) => (
            <button key={code} type="button" data-testid={`dpc-accumulation-${code.toLowerCase()}`} aria-pressed={p.accumulation === code}
              onClick={() => { const next = p.accumulation === code ? null : code; p.setAccumulation(next); if (next) p.setAnim("none"); }}
              className={cn("rounded-md border px-1 py-1.5 text-[10px] font-semibold transition-colors", p.accumulation === code ? "border-sky-500 bg-sky-600 text-white" : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500")}>{label}</button>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-slate-400">{p.accumulationStatus || "Seleziona la fascia di accumulo osservata."}</p>
      </div>

      <div className={SECTION}>Satelliti EUMETSAT</div>
      <div className="grid grid-cols-1 gap-1.5">
        {SAT_OPTIONS.map((s) => (
          <div key={s.key}>
          <Toggle testid={`layer-toggle-sat-${s.key}`} on={p.anim.startsWith("sat-") && p.satellites.includes(s.key)} onClick={() => p.toggleSatellite(s.key)}
            icon={<Satellite className="size-4" />} title={s.title} sub={s.sub} />
          {p.anim.startsWith("sat-") && p.satellites.includes(s.key) && <label className="flex items-center gap-2 px-2 py-1 text-[10px] text-slate-300">Opacità {Math.round((p.satelliteOpacity[s.key] ?? 1)*100)}%<input aria-label={`Opacità ${s.title}`} type="range" min="0" max="1" step="0.05" value={p.satelliteOpacity[s.key] ?? 1} onChange={(e) => p.setSatelliteOpacity(s.key, Number(e.target.value))} /></label>}
          </div>
        ))}
      </div>

      <div className={SECTION}>Modello numerico</div>
      <Toggle testid="layer-toggle-icon2i" on={p.anim === "icon2i"} onClick={() => toggleAnim("icon2i")}
        icon={<CloudSun className="size-4" />} title="ICON-2I ItaliaMeteo"
        sub={p.icon2i ? `Corsa ${p.icon2i.run_time.slice(11, 16)} UTC · H+1…H+${p.icon2i.horizon_hours}` : "Previsione a circa 2,2 km · fino a 72 ore"} />
      {p.anim === "icon2i" && !p.icon2i && <p className="px-1 text-[10px] text-amber-200">Catalogo ICON-2I in caricamento o temporaneamente non disponibile.</p>}
      {p.anim === "icon2i" && p.icon2i && (
        <div className="space-y-1.5 pl-1">
          <Select value={p.icon2iParam} onValueChange={(v: string) => p.setIcon2iParam(v)}>
            <SelectTrigger data-testid="icon2i-parameter-select" className="h-8 w-full border-slate-700 bg-slate-950/60 text-xs">
              <SelectValue>{(v) => p.icon2i?.parameters.find((x) => x.key === v)?.label ?? String(v)}</SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-80 border-slate-700 bg-slate-900">
              {[...new Set(p.icon2i.parameters.map((x) => x.group))].map((g) => <SelectGroup key={g}>
                <SelectLabel>{g}</SelectLabel>
                {p.icon2i!.parameters.filter((x) => x.group === g).map((x) => <SelectItem key={x.key} value={x.key} data-testid={`icon2i-param-option-${x.key}`}>{x.label}</SelectItem>)}
              </SelectGroup>)}
            </SelectContent>
          </Select>
          {!p.icon2i.complete && <p className="text-[10px] text-amber-200">Corsa parziale: {p.icon2i.frames.length}/{p.icon2i.horizon_hours} scadenze disponibili.</p>}
        </div>
      )}
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
                    <SelectItem key={x.key} value={x.key} data-testid={`arome-param-option-${x.key}`}>{labelOf(x.key)}</SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          {AROME_NOTES[p.aromeParam] && <p className="text-[10px] leading-snug text-amber-200/80" data-testid="arome-param-note">{AROME_NOTES[p.aromeParam]}</p>}
          {p.arome && !p.arome.complete && <p className="text-[10px] text-red-300">Corsa incompleta: {p.arome.frames.length}/{p.arome.horizon_hours} scadenze.</p>}
          <Toggle testid="layer-toggle-wind-flow" on={p.wind && !p.is3d} disabled={p.is3d} onClick={() => p.setWind(!p.wind)}
            icon={<Wind className="size-4" />} title="Linee di flusso vento 10 m"
            sub={p.is3d ? "Disponibili solo in 2D" : "Colore e velocità seguono le raffiche previste"} />
          {p.wind && p.windWarning && <p className="text-[10px] text-amber-200/90" data-testid="wind-flow-warning">{p.windWarning}</p>}
        </div>
      )}

      <div className={SECTION}>Mare · boe osservate</div>
      <Toggle testid="layer-toggle-ispra-mareografico" on={p.showIspraBuoys} onClick={() => p.setShowIspraBuoys(!p.showIspraBuoys)}
        icon={<Waves className="size-4" />} title="ISPRA · Rete Mareografica" sub="Livello mare, temperatura acqua e parametri meteo" />
      <Toggle testid="layer-toggle-ispra-ron" on={p.showRonBuoys} onClick={() => p.setShowRonBuoys(!p.showRonBuoys)}
        icon={<Waves className="size-4" />} title="ISPRA · RON" sub="Boe ondametriche · onde, correnti e dati meteo" />
      {(p.showIspraBuoys || p.showRonBuoys) && <p className="px-1 text-[10px] leading-snug text-slate-400">Attiva le reti che vuoi vedere e clicca una boa per aprire rilievi e previsione marina.</p>}

      <div className={SECTION}>Previsioni marine</div>
      <Toggle testid="layer-toggle-marine" on={p.anim === "marine"} onClick={() => toggleAnim("marine")}
        icon={<Waves className="size-4" />} title="WW3 MEDITA · SHYFEM" sub="Onde e livello del mare · Mediterraneo" />
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

      <div className={SECTION}>Vento in tempo reale</div>
      <Toggle testid="layer-toggle-live-wind" on={p.liveWind && !p.is3d} disabled={p.is3d} onClick={() => p.setLiveWind(!p.liveWind)}
        icon={<Wind className="size-4" />} title="Flusso vento attuale 10 m"
        sub={p.is3d ? "Disponibile solo in 2D" : p.liveWindSub} />
      {p.liveWind && !p.is3d && (
        <p data-testid="live-wind-note" className="px-1 text-[10px] leading-snug text-slate-400">
          Campo previsto del vento a 10 m via Open-Meteo: Mediterraneo con griglia campionata a 1° (best match) e Sardegna con campionamento a 0,125° del modello ICON-2I (risoluzione nativa ~2 km, nuove corse ogni 12 ore). Non sono misure anemometriche. L'animazione delle linee è illustrativa.
        </p>
      )}
      {p.liveWind && !p.is3d && (
        <Toggle testid="layer-toggle-station-arrows" on={p.stationArrows} onClick={() => p.setStationArrows(!p.stationArrows)}
          icon={<Navigation className="size-4" />} title="Frecce vento stazioni"
          sub={`Misurato · ${p.arrowCount} stazioni con direzione · tocca per confronto`} />
      )}

      <div className={SECTION}>Webcam</div>
      <Toggle testid="layer-toggle-webcams" on={p.webcams} onClick={() => p.setWebcams(!p.webcams)}
        icon={<Camera className="size-4" />} title="Webcam"
        sub={`${p.webcamCount} località · Panoramicams`} />
      {p.webcams && <p className="px-1 text-[11px] leading-snug text-slate-400">Foto di copertina Panoramicams, non ultimo frame. Tocca la foto per aprire il live.</p>}

      <div className={SECTION}>Idrologia e monitoraggio</div>
      <Toggle testid="layer-toggle-hydrometers" on={p.hydrometers} onClick={() => p.setHydrometers(!p.hydrometers)}
        icon={<Waves className="size-4" />} title="Idrometri ARPAS" sub={p.hydroStatus} />
      {p.hydrometers && <p data-testid="hydro-note" className="px-1 text-[10px] leading-snug text-slate-400">
        Livelli della rete fiduciaria ARPAS, riferiti allo zero idrometrico di ciascuna sezione.
        Le soglie S1–S3 non sono livelli di allerta territoriale.
      </p>}

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
    </div>
  );
}

