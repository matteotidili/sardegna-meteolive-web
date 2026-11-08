import { useCallback, useEffect, useMemo, useState } from "react";
import { Layers, List, RefreshCw, Map as MapIcon, Plus, Minus, LocateFixed, Box, MonitorPlay, PanelLeftOpen, PanelLeftClose } from "lucide-react";
import OpsClock from "@/components/OpsClock";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MapView, { type Basemap, type MapViewState } from "@/components/MapView";
import MapView3D from "@/components/MapView3D";
import StationList from "@/components/StationList";
import StationCard from "@/components/StationCard";
import LayerPanel, { SAT_OPTIONS, type AnimLayer } from "@/components/LayerPanel";
import TimelinePlayer from "@/components/TimelinePlayer";
import AlertBanner from "@/components/AlertBanner";
import HealthDialog from "@/components/HealthDialog";
import { AromeLegend, LightningLegend, LiveWindLegend, OperaLegend, RadarLegend, StationLegend } from "@/components/Legends";
import { useAlerts, useArome, useFrp, useRadar, useRain48, useSatellite, useStations, useWindField, useWindMeta } from "@/hooks/useMeteo";
import { useIsDesktop, usePersistentState } from "@/hooks/usePersistentState";
import { AROME_PRECIP_KEY, PARAMS, PARAM_BY_KEY, fmtDayTime, fmtTime, type ParamKey } from "@/lib/meteo";
import { mercatorImage } from "@/lib/mercator";
import { useLightning } from "@/lib/lightning";
import { useLiveWind } from "@/lib/liveWind";
import { DEFAULT_CENTER, DEFAULT_ZOOM, mapControls, satelliteUrl } from "@/lib/mapControls";
import type { Station } from "@/lib/types";
import { cn } from "@/lib/utils";

const BASEMAP_LABEL: Record<Basemap, string> = { dark: "Operativa scura", satellite: "Satellite", light: "Chiara", relief: "Rilievo" };
const DEFAULT_VIEW: MapViewState = { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
const BASE_DELAY = 900; // ms per frame at 1×

export default function Home() {
  const isDesktop = useIsDesktop();
  const [basemap, setBasemap] = usePersistentState<Basemap>("basemap", "dark");
  const [paramKey, setParamKey] = usePersistentState<ParamKey>("param", "temp");
  const [networks, setNetworks] = usePersistentState<Record<string, boolean>>("networks", {});
  const [anim, setAnim] = usePersistentState<AnimLayer>("anim", "none");
  const [aromeParam, setAromeParam] = usePersistentState<string>("aromeParam", AROME_PRECIP_KEY);
  const [opacity, setOpacity] = usePersistentState<number>("opacity", 0.75);
  const [firesOn, setFiresOn] = usePersistentState<boolean>("fires", false);
  const [alertsOn, setAlertsOn] = usePersistentState<boolean>("alertsLayer", true);
  const [view, setView] = usePersistentState<MapViewState>("view", DEFAULT_VIEW);
  const [mode3d, setMode3d] = usePersistentState<boolean>("mode3d", false);
  const [windOn, setWindOn] = usePersistentState<boolean>("windFlow", false);
  const [lightningOn, setLightningOn] = usePersistentState<boolean>("lightning", false);
  const [boundariesOn, setBoundariesOn] = usePersistentState<boolean>("boundaries", true);
  const [subregionsOn, setSubregionsOn] = usePersistentState<boolean>("subregions", false);
  const [municipalOn, setMunicipalOn] = usePersistentState<boolean>("municipalities", true);
  const [liveWindOn, setLiveWindOn] = usePersistentState<boolean>("liveWind", false);
  const liveWindQ = useLiveWind(liveWindOn && !mode3d);
  const [stationArrowsOn, setStationArrowsOn] = usePersistentState<boolean>("stationArrows", true);
  const liveWindTime = liveWindQ.data?.time ? `${fmtTime(liveWindQ.data.time)} · ${new Date(liveWindQ.data.time).toISOString().slice(11, 16)} UTC` : null;
  const liveWindSub = liveWindQ.isError ? "Analisi non disponibile ora · nessun flusso mostrato"
    : liveWindQ.data ? `ICON-2I · valido ${liveWindTime} · ${liveWindQ.data.points} punti` : liveWindOn ? "Caricamento analisi…" : "Analisi modello del quarto d'ora corrente";
  const [wall, setWall] = usePersistentState<boolean>("wallMode", false);
  const [wallLayers, setWallLayers] = useState(false);
  const wallOn = wall && isDesktop;

  // Big-screen mode: fullscreen + keep the display awake while the room is monitoring
  useEffect(() => {
    if (!wallOn) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const acquire = () => { if (document.visibilityState === "visible") nav.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => {}); };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => { document.removeEventListener("visibilitychange", acquire); void lock?.release().catch(() => {}); };
  }, [wallOn]);
  const toggleWall = () => {
    const next = !wall;
    setWall(next);
    setWallLayers(false);
    if (next) void document.documentElement.requestFullscreen?.().catch(() => {});
    else if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  };
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);
  const [satIdx, setSatIdx] = useState<number | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lon: number; seq: number } | null>(null);
  const [radarIdx, setRadarIdx] = useState<number | null>(null);
  const [leadIdx, setLeadIdx] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [readyKey, setReadyKey] = useState("");
  const [sheet, setSheet] = useState<"none" | "stations" | "layers">("none");

  const param = PARAM_BY_KEY[paramKey] ?? PARAMS[0];
  const stationsQ = useStations();
  const alertsQ = useAlerts();
  const radarProduct = anim.startsWith("radar-") ? anim.slice(6) : null;
  const radarQ = useRadar(radarProduct);
  const aromeQ = useArome(true);
  const frpQ = useFrp(firesOn);
  const rain48Q = useRain48();
  const satProduct = anim.startsWith("sat-") ? anim.slice(4) : null;
  const satQ = useSatellite(satProduct);
  const lightning = useLightning(lightningOn, bbox);

  const all = useMemo(() => (stationsQ.isError ? [] : stationsQ.data?.stations ?? []), [stationsQ.data, stationsQ.isError]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    all.forEach((s) => { c[s.network] = (c[s.network] ?? 0) + 1; });
    return c;
  }, [all]);
  const visible = useMemo(
    () => all.filter((s) => networks[s.network] !== false && (param.rain || !s.rain_only)),
    [all, networks, param.rain],
  );
  const selected = all.find((s) => s.id === selectedId) ?? null;

  // ---- timeline state ----
  const radarFrames = radarQ.data?.frames ?? [];
  const rIdx = radarFrames.length ? Math.min(radarIdx ?? radarFrames.length - 1, radarFrames.length - 1) : 0;
  const arome = aromeQ.data;
  const aromeFrames = arome?.frames ?? [];
  const defaultLead = useMemo(() => {
    const now = Date.now();
    const i = aromeFrames.findIndex((f) => Date.parse(f.valid_time) >= now);
    return i < 0 ? 0 : i;
  }, [aromeFrames]);
  const lIdx = aromeFrames.length ? Math.min(leadIdx ?? defaultLead, aromeFrames.length - 1) : 0;
  const aromeUrlAt = useCallback((i: number) => {
    const f = aromeFrames[i];
    if (!f || !arome) return null;
    if (aromeParam === AROME_PRECIP_KEY) return f.precip_url;
    return arome.product_url_template.replace("{parameter}", aromeParam).replace("{lead}", String(f.lead_hours).padStart(2, "0"));
  }, [aromeFrames, arome, aromeParam]);

  const radarLayer = radarProduct && radarFrames.length ? { product: radarProduct, time: radarFrames[rIdx] } : null;
  const aromeUrl = anim === "arome" ? aromeUrlAt(lIdx) : null;
  const sat = satQ.data && satProduct && !satQ.isError ? satQ.data : null;
  const satFrames = sat?.frames ?? [];
  const sIdx = satFrames.length ? Math.min(satIdx ?? satFrames.length - 1, satFrames.length - 1) : 0;
  const satUrlAt = useCallback((i: number) => (sat && satFrames[i]
    ? satelliteUrl(sat.wms_url, sat.layer, sat.format, sat.bounds, satFrames[i], isDesktop ? 1400 : 900) : null), [sat, satFrames, isDesktop]);
  const overlay = aromeUrl && arome
    ? { url: aromeUrl, bounds: arome.bounds, warp: true, attribution: "AROME-France HD © Météo-France (Licence Ouverte 2.0)" }
    : sat && satUrlAt(sIdx) ? { url: satUrlAt(sIdx)!, bounds: sat.bounds, warp: false, attribution: sat.attribution } : null;
  const currentKey = radarLayer ? `radar:${radarLayer.time}` : overlay ? `overlay:${overlay.url}` : "";
  const frameFailed = !!overlay && readyKey === `overlay-error:${overlay.url}`;
  const frameReady = currentKey !== "" && (readyKey === currentKey || frameFailed);

  // AROME wind streamlines: only with the same run as the displayed AROME field, synced to its lead
  const windMetaQ = useWindMeta(anim === "arome" && windOn && !mode3d);
  const windMeta = windMetaQ.data;
  const windRunOk = !!windMeta && !!arome && windMeta.run_time === arome.run_time;
  const windFrame = windRunOk ? windMeta!.frames.find((f) => f.lead_hours === aromeFrames[lIdx]?.lead_hours) : undefined;
  const windQ = useWindField(anim === "arome" && windOn && !mode3d && windFrame ? windFrame.url : null, windMeta?.grid);
  const windWarning = !windOn || anim !== "arome" ? null
    : windMetaQ.isError ? "Vettori vento non disponibili."
    : windMeta && arome && !windRunOk ? `Vettori della corsa ${fmtTime(windMeta.run_time)} diversa dal campo AROME mostrato: linee non visualizzate.`
    : windMeta && !windFrame ? "Scadenza senza vettori vento pubblicati." : windQ.isError ? "File vettoriale non valido." : null;

  // reset timeline when the animated layer changes
  useEffect(() => { setPlaying(false); setRadarIdx(null); setSatIdx(null); }, [anim]);

  // playback: advance only once the current frame is fully drawn (no partial frames)
  useEffect(() => {
    if (!playing || !frameReady) return;
    const t = window.setTimeout(() => {
      if (radarLayer) setRadarIdx((rIdx + 1) % radarFrames.length);
      else if (aromeUrl) setLeadIdx((lIdx + 1) % aromeFrames.length);
      else if (sat) setSatIdx((sIdx + 1) % satFrames.length);
    }, BASE_DELAY / speed);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, frameReady, speed, rIdx, lIdx, sIdx]);

  // prefetch the next frames (AROME warped images / satellite images)
  useEffect(() => {
    if (anim === "arome" && arome) {
      const [[s], [n]] = arome.bounds;
      [1, 2].forEach((d) => { const u = aromeUrlAt((lIdx + d) % aromeFrames.length); if (u) void mercatorImage(u, s, n); });
    } else if (sat && satFrames.length) {
      [1, 2].forEach((d) => { const u = satUrlAt((sIdx + d) % satFrames.length); if (u) { const im = new Image(); im.crossOrigin = "anonymous"; im.src = u; } });
    }
  }, [anim, arome, lIdx, aromeUrlAt, aromeFrames.length, sat, sIdx, satUrlAt, satFrames.length]);

  const pick = (s: Station) => {
    setSelectedId(s.id);
    setFlyTo({ lat: s.lat, lon: s.lon, seq: Date.now() });
    if (!isDesktop) setSheet("none");
  };

  const aromeMeta = arome?.parameters.find((p) => p.key === aromeParam);
  const timeline = radarLayer ? (
    <TimelinePlayer
      title={radarProduct === "OPERA" ? "Radar Europa EUMETNET OPERA · osservato" : `Radar DPC ${radarProduct} · osservato`}
      labels={radarFrames.map((t) => fmtTime(t))}
      index={rIdx} setIndex={setRadarIdx} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed}
      loading={!frameReady} legend={radarProduct === "OPERA" ? <OperaLegend /> : <RadarLegend product={radarProduct!} />}
      note={radarProduct === "OPERA"
        ? `Ultime 3 ore, passo 15 min, ${radarFrames.length} frame verificati. NIMBUS rain rate (Z–R Marshall–Palmer) · EUMETNET OPERA CC BY 4.0 · tiles RadarEU.`
        : "Ultime 3 ore, passo 5 min. © Dipartimento della Protezione Civile."}
    />
  ) : aromeUrl && arome ? (
    <TimelinePlayer
      title={`AROME HD · previsione · ${aromeParam === AROME_PRECIP_KEY ? "precipitazione oraria" : aromeMeta?.label ?? aromeParam}`}
      labels={aromeFrames.map((f) => `H+${String(f.lead_hours).padStart(2, "0")} · ${fmtDayTime(f.valid_time)}`)}
      index={lIdx} setIndex={setLeadIdx} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed}
      loading={!frameReady} legend={<AromeLegend meta={aromeMeta} isPrecip={aromeParam === AROME_PRECIP_KEY} />}
      note={`Corsa ${fmtTime(arome.run_time)} (età ${String(arome.run_age_hours).replace(".", ",")} h) · ${arome.producer} · celle senza dati trasparenti.${windQ.data && windOn && !mode3d ? " Linee di flusso 10 m: velocità illustrativa." : ""}${frameFailed ? " Frame non disponibile." : ""}`}
    />
  ) : sat ? (
    <TimelinePlayer
      title={`${sat.label} · osservato`}
      labels={satFrames.map((t) => fmtTime(t))}
      index={sIdx} setIndex={setSatIdx} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed}
      loading={!frameReady}
      note={`${sat.attribution} · passo ${sat.step_minutes} min · solo frame verificati disponibili.${sat.daytime_only ? " Prodotto diurno: di notte l'immagine è scura." : ""}${frameFailed ? " Frame non caricato: non mostrato." : ""}`}
    />
  ) : satProduct && (satQ.isError || satQ.isLoading) ? (
    <div className="pointer-events-auto rounded-xl border border-slate-700 bg-slate-900/95 p-3 text-xs text-slate-300" data-testid="satellite-status">
      {satQ.isLoading ? "Verifica dei frame EUMETSAT disponibili…" : satProduct === "li"
        ? "MTG Lightning Imager: nessun frame con attività nelle ultime 2 ore, oppure archivio non disponibile. Nessuna immagine mostrata."
        : "EUMETSAT: nessun frame disponibile al momento. Nessuna immagine mostrata."}
    </div>
  ) : anim.startsWith("radar-") && radarQ.isError ? (
    <div className="pointer-events-auto rounded-xl border border-red-900 bg-slate-900/95 p-3 text-xs text-red-200" data-testid="radar-unavailable">
      Radar-DPC: ultimo prodotto non disponibile. Nessun frame mostrato.
    </div>
  ) : null;

  const layerPanel = (
    <LayerPanel anim={anim} setAnim={setAnim} aromeParam={aromeParam} setAromeParam={setAromeParam} arome={arome}
      opacity={opacity} setOpacity={setOpacity} fires={firesOn} setFires={setFiresOn} alerts={alertsOn} setAlerts={setAlertsOn}
      fireCount={frpQ.data ? frpQ.data.detections.length : null} wind={windOn} setWind={setWindOn} windWarning={windWarning}
      is3d={mode3d} lightning={lightningOn} setLightning={setLightningOn} lightningStatus={lightning.status} strokeCount={lightning.strokes.length}
      liveWind={liveWindOn} setLiveWind={setLiveWindOn} liveWindSub={liveWindSub}
      stationArrows={stationArrowsOn} setStationArrows={setStationArrowsOn}
      arrowCount={visible.filter((s) => s.wind_kmh != null && s.wind_dir != null && s.freshness !== "unavailable").length}
      boundaries={boundariesOn} setBoundaries={setBoundariesOn} subregions={subregionsOn} setSubregions={setSubregionsOn}
      municipalities={municipalOn} setMunicipalities={setMunicipalOn} />
  );
  const stationList = (
    <StationList stations={visible} param={param} selectedId={selectedId} onPick={pick} networks={networks}
      onToggleNetwork={(k) => setNetworks((n) => ({ ...n, [k]: n[k] === false }))} counts={counts} loading={stationsQ.isLoading} />
  );
  const mapProps = {
    basemap, stations: visible, param, selectedId, onSelect: setSelectedId, radar: radarLayer, overlay, opacity,
    onLayerReady: setReadyKey, fires: firesOn ? frpQ.data?.detections ?? null : null,
    alerts: alertsOn && !alertsQ.isError ? alertsQ.data?.warnings ?? null : null,
    strokes: lightningOn ? lightning.strokes : null, initialView: view, onViewChange: setView, onBounds: setBbox, flyTo, boundaries: boundariesOn,
    subregions: subregionsOn, municipalities: municipalOn,
  };
  const legends = (
    <>
      <StationLegend param={param} />
      {liveWindOn && !mode3d && <LiveWindLegend time={liveWindQ.isError ? "non disponibile" : liveWindTime} />}
      {lightningOn && <LightningLegend live={lightning.status === "live"} count={lightning.strokes.length} />}
    </>
  );

  return (
    <div data-testid="app-root" data-wall={wallOn ? "on" : "off"} className={cn("fixed inset-0 overflow-hidden bg-[#0B0F17]", wallOn && "wall")}>
      {mode3d
        ? <MapView3D key={`3d-${basemap}`} {...mapProps} />
        : <MapView key="2d" {...mapProps} liveWind={liveWindOn ? liveWindQ.data?.field ?? null : null} stationArrows={liveWindOn && stationArrowsOn} wind={anim === "arome" && windOn ? windQ.data ?? null : null} />}

      {/* ---------- top HUD ---------- */}
      <header className="pointer-events-none fixed inset-x-2 top-2 z-30 flex flex-col gap-2 md:inset-x-4 md:top-3">
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/90 px-2.5 py-2 shadow-2xl shadow-black/50 backdrop-blur-xl md:px-3">
          <div data-testid="app-header-brand" className="flex shrink-0 items-center gap-2 pr-1">
            <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-700 font-heading text-sm font-bold text-white shadow-lg shadow-sky-900/50">SM</div>
            <div className="hidden leading-tight sm:block">
              <div className="font-heading text-[15px] font-semibold tracking-tight">Sardegna MeteoLive</div>
              <div data-testid="app-header-subtitle" className="text-[10px] uppercase tracking-[0.18em] text-slate-400">Sala operativa · Nowcasting</div>
            </div>
          </div>
          <div data-testid="parameter-selector-bar" className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-lg border border-slate-800/80 bg-slate-950/60 p-1">
            {PARAMS.map((p) => (
              <button key={p.key} data-testid={`parameter-chip-${p.key}`} aria-pressed={p.key === paramKey} onClick={() => setParamKey(p.key)}
                className={cn("shrink-0 rounded-md px-2.5 py-1 text-xs transition-colors duration-150",
                  p.key === paramKey ? "bg-sky-600 font-medium text-white shadow-sm shadow-sky-500/30" : "text-slate-300 hover:bg-slate-800 hover:text-slate-100")}>
                {p.label}
              </button>
            ))}
          </div>
          {wallOn && <OpsClock />}
          <div className="flex shrink-0 items-center gap-1.5">
            {isDesktop && (
              <button data-testid="wall-mode-toggle" aria-pressed={wallOn} onClick={toggleWall} title={wallOn ? "Esci dalla modalità sala" : "Modalità sala: schermo intero per monitor di sala operativa"}
                className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg border px-2 text-xs transition-colors",
                  wallOn ? "border-sky-600 bg-sky-600/20 text-sky-200 hover:bg-sky-600/30" : "border-slate-700 bg-slate-950/50 text-slate-300 hover:bg-slate-800 hover:text-sky-300")}>
                <MonitorPlay className="size-3.5" /><span className="hidden xl:inline">{wallOn ? "Esci sala" : "Modalità sala"}</span>
              </button>
            )}
            <Select value={basemap} onValueChange={(v: string) => setBasemap(v as Basemap)}>
              <SelectTrigger data-testid="basemap-selector-dropdown" size="sm" className="h-8 border-slate-700 bg-slate-950/50 text-xs">
                <MapIcon className="size-3.5" />
                <span className="hidden md:inline"><SelectValue>{(v) => BASEMAP_LABEL[v as Basemap]}</SelectValue></span>
              </SelectTrigger>
              <SelectContent className="border-slate-700 bg-slate-900">
                {(Object.keys(BASEMAP_LABEL) as Basemap[]).map((b) => (
                  <SelectItem key={b} value={b} data-testid={`basemap-option-${b}`}>{BASEMAP_LABEL[b]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <HealthDialog networks={stationsQ.data?.networks} stationsError={stationsQ.isError} arome={arome} alerts={alertsQ.data}
              radar={radarQ.data} rain48={rain48Q.data} serverTime={stationsQ.data?.server_time} updatedAt={stationsQ.dataUpdatedAt} />
            <button data-testid="refresh-data-btn" onClick={() => void stationsQ.refetch()} aria-label="Aggiorna dati"
              className="hidden h-8 items-center rounded-lg border border-slate-700 bg-slate-950/50 px-2 text-slate-300 transition-colors hover:bg-slate-800 hover:text-sky-300 sm:inline-flex">
              <RefreshCw className={cn("size-3.5", stationsQ.isFetching && "animate-spin")} />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AlertBanner data={alertsQ.isError ? { source: "", feed_updated: null, generated_at: null, active_count: 0, upcoming_count: 0, max_level: 0, warnings: [], available: false } : alertsQ.data} />
        </div>
      </header>

      {/* ---------- desktop panels ---------- */}
      {isDesktop && (
        <>
          {wallOn && (
            <button data-testid="wall-layers-toggle" aria-pressed={wallLayers} onClick={() => setWallLayers(!wallLayers)}
              className="fixed left-4 top-[124px] z-30 inline-flex h-9 items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/92 px-3 text-xs text-slate-200 shadow-xl backdrop-blur-xl transition-colors hover:border-sky-700 hover:text-sky-200">
              {wallLayers ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />} Layer {anim !== "none" && <span className="size-1.5 rounded-full bg-sky-400" />}
            </button>
          )}
          {(!wallOn || wallLayers) && <aside className={cn("thin-scroll fixed bottom-4 left-4 z-20 w-72", "overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/92 p-3 shadow-2xl shadow-black/60 backdrop-blur-xl", wallOn ? "top-[170px]" : "top-[124px]")} data-testid="desktop-layer-panel" style={{ maxHeight: wallOn ? "calc(100vh - 186px - 90px)" : "calc(100vh - 140px - 90px)" }}>
            {layerPanel}
          </aside>}
          <aside className="fixed bottom-4 right-4 top-[124px] z-20 flex w-[340px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/92 shadow-2xl shadow-black/60 backdrop-blur-xl" data-testid="desktop-station-panel">
            {selected && <StationCard station={selected} param={param} onClose={() => setSelectedId(null)} className="m-2 mb-0 shrink-0 rounded-xl" />}
            {stationList}
          </aside>
          <div className="fixed bottom-4 left-4 z-20 w-72">{legends}</div>
          <div className="pointer-events-none fixed bottom-4 left-[316px] right-[372px] z-20 flex justify-center">
            <div className="w-full max-w-2xl">{timeline}</div>
          </div>
        </>
      )}

      {/* ---------- mobile ---------- */}
      {!isDesktop && (
        <>
          <div className="fixed bottom-3 left-2 right-2 z-20 flex flex-col gap-2" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            {selected && <StationCard station={selected} param={param} onClose={() => setSelectedId(null)} className="max-h-[45vh] overflow-y-auto" />}
            {timeline}
            {!selected && !timeline && <div className="self-start">{legends}</div>}
            <div className="flex gap-2">
              <Sheet open={sheet === "layers"} onOpenChange={(o) => setSheet(o ? "layers" : "none")}>
                <SheetTrigger data-testid="mobile-layers-sheet-trigger" className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900/95 text-sm text-slate-100 shadow-xl backdrop-blur-xl active:scale-[.98]">
                  <Layers className="size-4" /> Layer {anim !== "none" && <span className="size-1.5 rounded-full bg-sky-400" />}
                </SheetTrigger>
                <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl border-slate-800 bg-slate-900 p-4 text-slate-100">
                  <SheetHeader className="p-0 pb-2"><SheetTitle className="font-heading">Layer meteorologici</SheetTitle></SheetHeader>
                  {layerPanel}
                </SheetContent>
              </Sheet>
              <Sheet open={sheet === "stations"} onOpenChange={(o) => setSheet(o ? "stations" : "none")}>
                <SheetTrigger data-testid="mobile-stations-sheet-trigger" className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900/95 text-sm text-slate-100 shadow-xl backdrop-blur-xl active:scale-[.98]">
                  <List className="size-4" /> Stazioni <span className="font-num text-xs text-slate-400">{visible.length}</span>
                </SheetTrigger>
                <SheetContent side="bottom" className="flex h-[78vh] data-[side=bottom]:h-[78vh] flex-col rounded-t-2xl border-slate-800 bg-slate-900 p-0 text-slate-100">
                  <SheetHeader className="px-4 pb-0 pt-4"><SheetTitle className="font-heading">Stazioni · {param.label}</SheetTitle></SheetHeader>
                  {stationList}
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </>
      )}

      {/* zoom controls */}
      <div className={cn("fixed z-20 flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90 shadow-xl backdrop-blur-xl",
        isDesktop ? "right-[372px] top-[124px]" : "right-2 top-[118px]")}>
        <button data-testid="map-zoom-in" aria-label="Zoom avanti" onClick={() => mapControls.zoomIn()} className="p-2 text-slate-300 transition-colors hover:bg-slate-800 hover:text-sky-300"><Plus className="size-4" /></button>
        <button data-testid="map-zoom-out" aria-label="Zoom indietro" onClick={() => mapControls.zoomOut()} className="border-t border-slate-800 p-2 text-slate-300 transition-colors hover:bg-slate-800 hover:text-sky-300"><Minus className="size-4" /></button>
        <button data-testid="map-reset-view" aria-label="Centra sulla Sardegna" onClick={() => mapControls.reset()} className="border-t border-slate-800 p-2 text-slate-300 transition-colors hover:bg-slate-800 hover:text-sky-300"><LocateFixed className="size-4" /></button>
        <button data-testid="map-mode-toggle" aria-pressed={mode3d} aria-label="Vista 2D/3D" onClick={() => setMode3d(!mode3d)}
          className={cn("border-t border-slate-800 p-2 font-num text-[11px] font-semibold transition-colors hover:bg-slate-800", mode3d ? "text-sky-300" : "text-slate-300")}>
          <Box className="mx-auto size-4" />{mode3d ? "3D" : "2D"}
        </button>
      </div>
      <span className="hidden" data-testid="map-view-state">{view.zoom}</span>
    </div>
  );
}
