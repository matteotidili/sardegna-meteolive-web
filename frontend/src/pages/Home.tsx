import { WEBCAMS } from "@/lib/webcams";
import { useSatelliteStack } from "@/hooks/useSatelliteStack";
import { satelliteCache, satelliteNeighbors, satelliteStackUrl, satelliteSandwichUrl, sandwichDay } from "@/lib/satelliteImages";
import { preloadOverlayImage } from "@/lib/overlayImage";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layers, List, RefreshCw, Map as MapIcon, Plus, Minus, LocateFixed, Box, MonitorPlay, PanelLeftOpen, PanelLeftClose } from "lucide-react";
import OpsClock from "@/components/OpsClock";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MapView, { type Basemap, type MapViewState } from "@/components/MapView";
import StationList from "@/components/StationList";
import StationCard from "@/components/StationCard";
import LayerPanel, { SAT_OPTIONS, type AnimLayer } from "@/components/LayerPanel";
import TimelinePlayer from "@/components/TimelinePlayer";
import AlertBanner from "@/components/AlertBanner";
import HealthDialog from "@/components/HealthDialog";
import { AromeLegend, DpcAccumulationLegend, LightningLegend, LiveWindLegend, OperaLegend, RadarLegend, StationLegend } from "@/components/Legends";
import { useAlerts, useArome, useAromePoint, useDpcAccumulation, useRadar, useRain48, useStations, useWindField, useWindMeta } from "@/hooks/useMeteo";
import { useIsDesktop, usePersistentState } from "@/hooks/usePersistentState";
import { AROME_PRECIP_KEY, NETWORK_META, networkGroup, PARAMS, PARAM_BY_KEY, fmtDayTime, fmtTime, stationParameterLabel, type ParamKey } from "@/lib/meteo";
import { mercatorImage } from "@/lib/mercator";
import { useLightning } from "@/lib/lightning";
import { useLiveWind } from "@/lib/liveWind";
import { DEFAULT_CENTER, DEFAULT_ZOOM, MEDITERRANEAN_BOUNDS, mapControls } from "@/lib/mapControls";
import { regionalSatelliteUrl, satelliteRegionBounds } from "@/lib/satelliteView";
import type { Station } from "@/lib/types";
import { cn } from "@/lib/utils";
import { radarFrameErrorKey, radarFrameKey } from "@/lib/radarFrame";
import RadarPointPanel from "@/components/RadarPointPanel";
import AromePointPanel from "@/components/AromePointPanel";
import { quantitativeRadarFrames, useRadarNumericManifest, type RadarPoint } from "@/lib/radarPoint";
import MarineControls, { MARINE_LABELS, MarineAttribution } from "@/components/MarineControls";
import MarineLegend from "@/components/MarineLegend";
import HydroLegend from "@/components/HydroLegend";
import { useHydrometers } from "@/lib/hydro";
import { useMarineCatalog, useMarineVectors } from "@/hooks/useMarine";
import { marineImageUrl, type MarineForcing, type MarineModel, type MarineParameter } from "@/lib/marine";
import { marineViewportBounds } from "@/lib/marineViewport";

const MapView3D = lazy(() => import("@/components/MapView3D"));

const BASEMAP_LABEL: Record<Basemap, string> = { dark: "Operativa scura", satellite: "Satellite", light: "Chiara", streets: "Stradale", relief: "Rilievo" };
const DEFAULT_VIEW: MapViewState = { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
const BASE_DELAY = 900; // ms per frame at 1×

export default function Home() {
  const isDesktop = useIsDesktop();
  const [basemap, setBasemap] = usePersistentState<Basemap>("basemap", "dark");
  const [paramKey, setParamKey] = usePersistentState<ParamKey>("param", "temp");
  const [networks, setNetworks] = usePersistentState<Record<string, boolean>>("networks", {});
  const [showIspraBuoys, setShowIspraBuoys] = usePersistentState<boolean>("showIspraBuoys", false);
  const [showRonBuoys, setShowRonBuoys] = usePersistentState<boolean>("showRonBuoys", false);
  const [anim, setAnim] = usePersistentState<AnimLayer>("anim", "none");
  const [accumulation, setAccumulation] = usePersistentState<string | null>("dpc-accumulation", null);
  const [aromeParam, setAromeParam] = usePersistentState<string>("aromeParam", AROME_PRECIP_KEY);
  const [marineModel, setMarineModel] = usePersistentState<MarineModel>("marineModel", "ww3");
  const [marineParameter, setMarineParameter] = usePersistentState<MarineParameter>("marineParameter", "hs");
  const [marineForcing, setMarineForcing] = usePersistentState<MarineForcing>("marineForcing", "ECMWF");
  const [marineArrows, setMarineArrows] = usePersistentState<boolean>("marineArrows", true);
  const [opacity, setOpacity] = usePersistentState<number>("opacity", 0.75);
  const [webcamsOn, setWebcamsOn] = usePersistentState<boolean>("webcams", false);
  const [hydrometersOn, setHydrometersOn] = usePersistentState<boolean>("hydrometersArpas", false);
  const hydrometersQ = useHydrometers(hydrometersOn);
  const hydroStatus = hydrometersQ.data?.length
    ? `${hydrometersQ.data.length} sezioni · ${hydrometersQ.isError ? "ultimo dataset disponibile" : "dati ARPAS"}`
    : hydrometersOn && hydrometersQ.isLoading ? "Caricamento livelli idrometrici…"
    : hydrometersOn && hydrometersQ.isError ? "Servizio ARPAS non disponibile" : "Rete fiduciaria · livelli e soglie S1–S3";
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
  const liveWindSub = liveWindQ.isError ? "Campo modellistico non disponibile · riprova più tardi"
    : liveWindQ.data
      ? `Vento 10 m · valido ${liveWindTime}${liveWindQ.cachedFallback ? " · ultimo campo disponibile" : liveWindQ.partial ? " · copertura parziale" : ""}`
      : liveWindOn ? "Caricamento campo del vento…" : "Previsione del vento valida per l'ora corrente";
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
  const [satSelection, setSatSelection] = useState<{ time: string; direction: number } | null>(null);
  const prefetching = useRef(new Map<string, AbortController>());

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<{ lat: number; lon: number; seq: number } | null>(null);
  const [radarIdx, setRadarIdx] = useState<number | null>(null);
  const [radarPoint, setRadarPoint] = useState<RadarPoint | null>(null);
  const [aromePoint, setAromePoint] = useState<RadarPoint | null>(null);
  const [leadIdx, setLeadIdx] = useState<number | null>(null);
  const [marineIdx, setMarineIdx] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const renderer = useMemo(() => ({}), [mode3d, mode3d ? basemap : null]);
  const [readyFrame, setReadyFrame] = useState<{ renderer: object; key: string } | null>(null);
  const readyKey = readyFrame?.renderer === renderer ? readyFrame.key : "";

  const [sheet, setSheet] = useState<"none" | "stations" | "layers">("none");

  const param = PARAM_BY_KEY[paramKey] ?? PARAMS[0];
  const stationsQ = useStations();
  const alertsQ = useAlerts();
  const radarProduct = anim.startsWith("radar-") ? anim.slice(6) : null;
  const radarQ = useRadar(radarProduct);
  const accumulationProduct = anim === "none" ? accumulation : null;
  const accumulationQ = useDpcAccumulation(accumulationProduct);
  const radarNumericQ = useRadarNumericManifest(!!radarProduct);
  const aromeQ = useArome(true);
  const rain48Q = useRain48();
  const satProduct = anim.startsWith("sat-") ? anim.slice(4) : null;
  const [satellites, setSatellites] = usePersistentState<string[]>("satellite-stack", []);
  const [satelliteOpacity, setSatelliteOpacity] = usePersistentState<Record<string, number>>("satellite-opacity", {});
  const activeSatellites = useMemo(() => satellites.length ? satellites : satProduct ? [satProduct] : [], [satellites, satProduct]);
  const satQ = useSatelliteStack(activeSatellites, !!satProduct);
  const toggleSatellite = (key: string) => {
    const selected = satProduct ? activeSatellites : [];
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
    setSatellites(next);
    if (!selected.includes(key) && next.length > 1 && satelliteOpacity[key] === undefined) setSatelliteOpacity({ ...satelliteOpacity, [key]: ["rdt", "li", "preciprate"].includes(key) ? 1 : 0.5 });
    setAnim(next.length ? `sat-${next[0]}` : "none");
    setPlaying(false);
  };
  const lightning = useLightning(lightningOn, bbox);
  const marineOn = anim === "marine";
  const marineQ = useMarineCatalog(marineModel, marineForcing, marineOn);
  const marine = marineQ.data?.model === marineModel ? marineQ.data : undefined;
  const marineParam: MarineParameter = marineModel === "shyfem" ? "wl" : marineParameter === "t01" ? "t01" : "hs";

  const all = useMemo(() => stationsQ.data?.stations ?? [], [stationsQ.data]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    all.forEach((s) => { const group = networkGroup(s.network); c[group] = (c[group] ?? 0) + 1; });
    return c;
  }, [all]);
  const marineView = showIspraBuoys || showRonBuoys;
  const visible = useMemo(
    () => all.filter((s) => {
      const isIspra = s.network === "mareografico";
      const isRon = s.network === "ron";
      if (isIspra || isRon) return (isIspra && showIspraBuoys || isRon && showRonBuoys) && networks[networkGroup(s.network)] !== false;
      return !marineView && networks[networkGroup(s.network)] !== false && (param.rain || !s.rain_only);
    }),
    [all, networks, param.rain, marineView, showIspraBuoys, showRonBuoys],
  );
  const selected = all.find((s) => s.id === selectedId) ?? null;

  // ---- timeline state ----
  // The displayed image and point value must share the exact scan timestamp.
  const radarFrames = useMemo(() => quantitativeRadarFrames(
    radarQ.data?.frames ?? [], radarNumericQ.data, radarProduct,
  ), [radarQ.data, radarNumericQ.data, radarProduct]);
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
  const accumulationLayer = accumulationProduct && accumulationQ.data ? { product: accumulationProduct, time: accumulationQ.data } : null;
  const mapRadarLayer = radarLayer ?? accumulationLayer;
  const aromeUrl = anim === "arome" ? aromeUrlAt(lIdx) : null;
  const sat = satProduct ? satQ.data : undefined;
  const satFrames = sat?.frames ?? [];
  const selectionIndex = satSelection ? satFrames.findIndex((time) => Date.parse(time) >= Date.parse(satSelection.time)) : -1;
  const sIdx = selectionIndex < 0 ? Math.max(0, satFrames.length - 1) : selectionIndex;
  const satRenderBounds = useMemo(() => sat ? satelliteRegionBounds(sat.bounds) : null, [sat]);
  const satUrls = useMemo(() => sat && satRenderBounds ? sat.frames.map((time) =>
    satelliteStackUrl(satQ.catalogs.map((catalog) => {
      const ir = regionalSatelliteUrl(catalog.wms_url, catalog.layer, catalog.format, satRenderBounds, time, isDesktop);
      const visible = catalog.sandwich_visible;
      const url = visible && sandwichDay(time)
        ? satelliteSandwichUrl(regionalSatelliteUrl(visible.wms_url, visible.layer, visible.format, satRenderBounds, time, isDesktop), ir)
        : ir;
      return { url, opacity: satelliteOpacity[catalog.product] ?? 1 };
    }))) : [], [sat, satRenderBounds, satQ.catalogs, satelliteOpacity, isDesktop]);
  const satUrl = satUrls[sIdx];
  useEffect(() => {
    if (!mode3d || !satUrl) return;
    // Start the selected frame alongside the WebGL chunk, basemap and terrain.
    const controller = new AbortController();
    void satelliteCache.prepare(satUrl, controller.signal).catch(() => {});
    return () => controller.abort();
  }, [mode3d, satUrl]);
  const satCandidate = sat && satRenderBounds && satUrl ? {
    url: satUrl, bounds: satRenderBounds, warp: false, attribution: sat.attribution, group: "satellite",
  } : null;
  const [shownSatellite, setShownSatellite] = useState<{
    renderer: object; overlay: NonNullable<typeof satCandidate>; time: string; label: string;
  } | null>(null);
  const shownSat = satProduct && shownSatellite?.renderer === renderer ? shownSatellite : null;
  const [shownRadar, setShownRadar] = useState<{ renderer: object; product: string; time: string } | null>(null);
  const displayedRadar = radarProduct && shownRadar?.renderer === renderer && shownRadar.product === radarProduct
    ? shownRadar : null;
  const selectSatellite = (index: number, direction = Math.sign(index - sIdx)) => {
    if (!satFrames[index]) return;
    setSatSelection({ time: satFrames[index], direction: direction || satSelection?.direction || -1 });
    if (readyKey.startsWith("overlay-error:")) setReadyFrame(null);
  };
  const marineFrames = marine?.frames ?? [];
  const defaultMarineIdx = useMemo(() => {
    const idx = marineFrames.findIndex((time) => Date.parse(time) >= Date.now());
    return idx < 0 ? Math.max(0, marineFrames.length - 1) : idx;
  }, [marineFrames]);
  const mIdx = marineFrames.length ? Math.min(marineIdx ?? defaultMarineIdx, marineFrames.length - 1) : 0;
  const marineTime = marineOn ? marineFrames[mIdx] ?? null : null;
  const marineRenderCatalog = useMemo(() => marine ? { ...marine, bounds: marineViewportBounds(marine.bounds, bbox) } : undefined, [marine, bbox]);
  const marineUrlAt = useCallback((idx: number) => marineRenderCatalog && marineFrames[idx]
    ? marineImageUrl(marineRenderCatalog, marineParam, marineFrames[idx], isDesktop ? 1600 : 1100) : null,
  [marineRenderCatalog, marineFrames, marineParam, isDesktop]);
  const marineUrl = marineOn ? marineUrlAt(mIdx) : null;
  const marineDirections = marineOn && marineModel === "ww3" && marineArrows;
  const marineVectorsQ = useMarineVectors(marineTime, Math.round(view.zoom), marineDirections, marine?.run_time);
  const marineGroup = marineUrl && marine ? `marine:${marine.model}:${marineParam}:${marine.forcing ?? ""}:${marine.run_time}` : null;
  const aromeGroup = aromeUrl && arome ? `arome:${aromeParam}:${arome.run_time}` : null;
  const modelGroup = marineGroup ?? aromeGroup;
  const marineLabels = marine ? marineFrames.map((time) =>
    `H+${String(Math.round((Date.parse(time) - Date.parse(marine.run_time)) / 3600000)).padStart(2, "0")} · ${fmtDayTime(time)}`) : [];
  const aromeLabels = aromeFrames.map((f) => `H+${String(f.lead_hours).padStart(2, "0")} · ${fmtDayTime(f.valid_time)}`);
  const overlay = marineUrl && marine
    ? { url: marineUrl, bounds: marineRenderCatalog!.bounds, warp: false, attribution: marine.attribution,
        group: marineGroup! }
    : aromeUrl && arome
    ? { url: aromeUrl, bounds: arome.bounds, warp: true, attribution: "AROME-France HD © Météo-France (Licence Ouverte 2.0)", group: aromeGroup! }
    : satCandidate ?? shownSat?.overlay ?? null;
  const [shownModel, setShownModel] = useState<{ renderer: object; group: string; label: string } | null>(null);
  const displayedModelLabel = shownModel?.renderer === renderer && shownModel.group === modelGroup ? shownModel.label : null;
  const onLayerReady = (key: string) => {
    setReadyFrame({ renderer, key });
    if (radarLayer && key === radarFrameKey(radarLayer)) setShownRadar({ renderer, ...radarLayer });
    if (satCandidate && key === `overlay:${satCandidate.url}`) {
      setShownSatellite({ renderer, overlay: satCandidate, time: satFrames[sIdx], label: sat!.label });
    }
    if (modelGroup && overlay && key === `overlay:${overlay.url}`) {
      setShownModel({ renderer, group: modelGroup, label: marineGroup ? marineLabels[mIdx] : aromeLabels[lIdx] });
    }
    if (satCandidate && key.endsWith(satCandidate.url) && new URLSearchParams(window.location.search).get("diagnostica") === "satellite") {
      console.info("EUMETSAT", JSON.stringify({ frame: satFrames[sIdx], ...satelliteCache.snapshot() }));
    }
  };
  const currentKey = radarLayer ? radarFrameKey(radarLayer) : overlay ? `overlay:${overlay.url}` : "";
  const frameFailed = radarLayer ? readyKey === radarFrameErrorKey(radarLayer)
    : !!overlay && readyKey === `overlay-error:${overlay.url}`;
  const frameReady = (!satProduct || !!satCandidate) && currentKey !== "" && (readyKey === currentKey || frameFailed)
    && (!marineDirections || !!marineVectorsQ.data || marineVectorsQ.isError || frameFailed);
  const visibleMarineVectors = marineDirections && marineUrl && readyKey === `overlay:${marineUrl}`
    ? marineVectorsQ.data ?? null : null;

  // AROME wind streamlines: only with the same run as the displayed AROME field, synced to its lead
  const windMetaQ = useWindMeta(anim === "arome" && windOn && !mode3d);
  const windMeta = windMetaQ.data;
  const windRunOk = !!windMeta && !!arome && windMeta.run_time === arome.run_time;
  const windFrame = windRunOk ? windMeta!.frames.find((f) => f.lead_hours === aromeFrames[lIdx]?.lead_hours) : undefined;
  const gustParam = arome?.parameters.find((p) => p.key === "gust10");
  const gustUrl = arome && windFrame
    ? arome.product_url_template.replace("{parameter}", "gust10").replace("{lead}", String(windFrame.lead_hours).padStart(2, "0")) : null;
  const windQ = useWindField(
    anim === "arome" && windOn && !mode3d && windFrame ? windFrame.url : null,
    windMeta?.grid,
    anim === "arome" && windOn && !mode3d && windFrame ? gustUrl : null,
    gustParam?.stops,
    arome?.bounds,
  );
  const windWarning = !windOn || anim !== "arome" ? null
    : windMetaQ.isError ? "Vettori vento non disponibili."
    : windMeta && arome && !windRunOk ? `Vettori della corsa ${fmtTime(windMeta.run_time)} diversa dal campo AROME mostrato: linee non visualizzate.`
    : windMeta && !windFrame ? "Scadenza senza vettori vento pubblicati." : windQ.isError ? "File vettoriale non valido." : null;

  // reset timeline when the animated layer changes
  useEffect(() => { setPlaying(false); setRadarIdx(null); }, [anim]);
  useEffect(() => { if (!modelGroup) setShownModel(null); }, [modelGroup]);
  useEffect(() => { if (!radarProduct) setShownRadar(null); }, [radarProduct]);
  useEffect(() => {
    if (!satProduct) { setSatSelection(null); setShownSatellite(null); }
  }, [satProduct]);
  // SRI is no longer offered as a display layer. Clear a saved selection from
  // older sessions so it cannot remain active invisibly in the background.
  useEffect(() => { if (anim === "radar-SRI") setAnim("none"); }, [anim, setAnim]);
  useEffect(() => { if ((anim as string) === "icon2i") setAnim("none"); }, [anim, setAnim]);
  // Il punto resta fisso durante l'animazione e la timeline. Fuori dal
  // contesto radar il pannello non deve sovrapporsi agli altri layer.
  useEffect(() => { if (!radarProduct) setRadarPoint(null); }, [radarProduct]);
  useEffect(() => { setPlaying(false); setMarineIdx(null); }, [marineModel, marineParam, marineForcing, marine?.run_time]);

  // Prepare the next frame before changing the selected timestamp.
  useEffect(() => {
    if (!playing || !frameReady) return;
    let cancelled = false;
    let timer: number | undefined;
    const controller = new AbortController();
    const marineNext = marineUrl ? (mIdx + 1) % marineFrames.length : -1;
    const aromeNext = aromeUrl ? (lIdx + 1) % aromeFrames.length : -1;
    const nextUrl = marineUrl ? marineUrlAt(marineNext) : aromeUrl ? aromeUrlAt(aromeNext) : null;
    const prepare = async () => {
      if (marineUrl && nextUrl) await preloadOverlayImage(nextUrl, controller.signal);
      else if (aromeUrl && nextUrl && arome) {
        const projected = await mercatorImage(nextUrl, arome.bounds[0][0], arome.bounds[1][0]);
        if (projected) await preloadOverlayImage(projected, controller.signal);
      } else if (satFrames.length > 1) {
        const url = satUrls[(sIdx + 1) % satUrls.length];
        if (url) await satelliteCache.prefetch(url, controller.signal);
      }
      if (cancelled) return;
      timer = window.setTimeout(() => {
        if (cancelled) return;
        if (marineUrl) setMarineIdx(marineNext);
        else if (radarLayer) setRadarIdx((rIdx + 1) % radarFrames.length);
        else if (aromeUrl) setLeadIdx(aromeNext);
        else if (satFrames.length) selectSatellite((sIdx + 1) % satFrames.length, 1);
      }, Math.max(0, BASE_DELAY / speed));
    };
    void prepare().catch(() => {});
    return () => { cancelled = true; controller.abort(); if (timer !== undefined) window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, frameReady, speed, rIdx, lIdx, sIdx, mIdx, currentKey]);

  // Keep nearby satellite and AROME images decoded in the background.
  useEffect(() => {
    if (!satProduct || satUrls.length < 2) return;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (connection?.saveData || connection?.effectiveType?.endsWith("2g")) return;
    const controller = new AbortController();
    const jobs = [1, 2, 3, 4].map((step) => {
      const url = satUrls[(sIdx + step) % satUrls.length];
      return url ? satelliteCache.prefetch(url, controller.signal).catch(() => {}) : Promise.resolve();
    });
    return () => { controller.abort(); void Promise.allSettled(jobs); };
  }, [satProduct, satUrls, sIdx]);

  useEffect(() => {
    if (anim !== "arome" || !arome || !aromeFrames.length) return;
    const controller = new AbortController();
    const urls = [1, 2].map((step) => aromeUrlAt((lIdx + step) % aromeFrames.length)).filter((url): url is string => !!url);
    const jobs = urls.map(async (url) => {
      const projected = await mercatorImage(url, arome.bounds[0][0], arome.bounds[1][0]);
      if (projected && !controller.signal.aborted) await preloadOverlayImage(projected, controller.signal);
    });
    void Promise.allSettled(jobs);
    return () => controller.abort();
  }, [anim, arome, aromeFrames.length, lIdx, aromeUrlAt]);

  const pick = (s: Station) => {
    setSelectedId(s.id);
    setFlyTo({ lat: s.lat, lon: s.lon, seq: Date.now() });
    if (!isDesktop) setSheet("none");
  };

  const aromeMeta = arome?.parameters.find((p) => p.key === aromeParam);
  const aromePointStops = aromeParam === AROME_PRECIP_KEY ? arome?.hourly_precip_stops : aromeMeta?.stops;
  const aromePointRequest = useMemo(() => {
    if (!aromePoint || anim !== "arome" || !aromeUrl || readyKey !== `overlay:${aromeUrl}` || !arome || !aromePointStops?.length) return null;
    return {
      ...aromePoint, url: aromeUrl, bounds: arome.bounds, key: aromeParam,
      label: aromeParam === AROME_PRECIP_KEY ? "Precipitazione oraria" : aromeMeta?.label ?? aromeParam,
      unit: aromeParam === AROME_PRECIP_KEY ? "mm" : aromeMeta?.unit ?? "",
      stops: aromePointStops,
      maskUrl: aromeParam === AROME_PRECIP_KEY
        ? arome.product_url_template.replace("{parameter}", "t2m").replace("{lead}", String(aromeFrames[lIdx]?.lead_hours ?? 0).padStart(2, "0"))
        : undefined,
    };
  }, [aromePoint, anim, aromeUrl, readyKey, arome, aromeParam, aromePointStops, aromeMeta, aromeFrames, lIdx]);
  const aromePointQ = useAromePoint(aromePointRequest);
  const timeline = marineOn ? marine && marineUrl ? (
    <TimelinePlayer
      title={`${marine.model === "ww3" ? "WW3 MEDITA" : `SHYFEM · ${marine.forcing === "ICON" ? "ICON-2I" : marine.forcing}`} · ${MARINE_LABELS[marineParam].short} (${MARINE_LABELS[marineParam].unit})`}
      labels={marineLabels}
      index={mIdx} setIndex={setMarineIdx} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed}
      loading={!frameReady} displayedLabel={displayedModelLabel} legend={<MarineLegend parameter={marineParam} />}
      note={`Corsa ${new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(marine.run_time))} UTC · orari della timeline locali · ${marineFrames.length} scadenze pubblicate.${Date.now() - Date.parse(marine.run_time) > 36 * 3600000 ? " Corsa meno recente: verificare l’ora di emissione." : ""}${marineQ.isError ? " Aggiornamento non riuscito: ultima corsa verificata." : ""}${frameFailed ? " Fotogramma non caricato: resta l’ultimo caricato, se presente." : ""}${marineDirections && marineVectorsQ.isError ? " Direzioni delle onde non disponibili per questo orario." : ""}`}
    >
      <MarineAttribution catalog={marine} />
    </TimelinePlayer>
  ) : (
    <div data-testid="marine-status" className="pointer-events-auto rounded-xl border border-slate-700 bg-slate-900/95 p-3 text-xs text-slate-200">
      {marineQ.isLoading ? "Verifica delle previsioni marine disponibili…" : "Previsioni marine momentaneamente non disponibili."}
      {marineQ.isError && <button data-testid="marine-retry" onClick={() => void marineQ.refetch()} className="ml-2 text-sky-300 underline">Riprova</button>}
    </div>
  ) : radarLayer ? (
    <TimelinePlayer
      title={radarProduct === "OPERA" ? "Radar Europa EUMETNET OPERA · osservato" : `Radar DPC ${radarProduct} · osservato`}
      labels={radarFrames.map((t) => fmtTime(t))}
      index={rIdx} setIndex={setRadarIdx} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed}
      loading={!frameReady} displayedLabel={displayedRadar ? fmtTime(displayedRadar.time) : null} legend={radarProduct === "OPERA" ? <OperaLegend /> : <RadarLegend product={radarProduct!} />}
      note={(radarProduct === "OPERA"
        ? `Ultime 3 ore, passo 15 min, ${radarFrames.length} frame verificati. NIMBUS rain rate (Z–R Marshall–Palmer) · EUMETNET OPERA CC BY 4.0 · tiles RadarEU.`
        : "Ultime 3 ore, passo 5 min. © Dipartimento della Protezione Civile.")
        + (frameFailed ? " Fotogramma non caricato: resta visibile l’ultimo disponibile, se presente." : "")}
    />
  ) : aromeUrl && arome ? (
    <TimelinePlayer
      title={`AROME HD · previsione · ${aromeParam === AROME_PRECIP_KEY ? "precipitazione oraria" : aromeMeta?.label ?? aromeParam}`}
      labels={aromeLabels}
      index={lIdx} setIndex={setLeadIdx} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed}
      loading={!frameReady} displayedLabel={displayedModelLabel} legend={<AromeLegend meta={aromeMeta} isPrecip={aromeParam === AROME_PRECIP_KEY} hourlyPrecipStops={arome.hourly_precip_stops} />}
      note={`Corsa ${fmtTime(arome.run_time)} (età ${String(arome.run_age_hours).replace(".", ",")} h) · ${arome.producer} · clicca sulla mappa per interrogare un punto. Celle senza dati trasparenti.${windQ.data && windOn && !mode3d ? " Flussi 10 m animati in base alle raffiche previste." : ""}${frameFailed ? " Frame non disponibile." : ""}`}
    />
  ) : sat ? (
    <TimelinePlayer
      title={`${sat.label} · osservato`}
      labels={satFrames.map((t) => fmtTime(t))}
      index={sIdx} setIndex={selectSatellite} playing={playing} setPlaying={setPlaying} speed={speed} setSpeed={setSpeed}
      loading={!frameReady}
      displayedLabel={shownSat ? `${fmtTime(shownSat.time)}${shownSat.label === sat.label ? "" : ` · ${shownSat.label}`}` : null}
      legend={satProduct === "rdt" ? <div className="text-[10px] text-slate-200"><span className="mr-1 inline-block h-3 w-3 border-2 border-red-500" />Contorni delle celle convettive identificate dal satellite · RDT (NWC SAF)</div> : satProduct === "cloudtype" ? <details className="text-[10px] text-slate-200"><summary className="cursor-pointer">Legenda Cloud Type RGB · italiano</summary><div className="grid grid-cols-2 gap-1 py-2">{[
        ["#df2929", "Cirri sottili; rosso più scuro sul mare"],
        ["#ffee35", "Nubi spesse di ghiaccio; ghiaccio alla sommità"],
        ["#6752b3", "Terra emersa (blu/viola)"],
        ["#a4ecf2", "Nubi d’acqua basse e medie"],
        ["#41964b", "Nubi a fase mista basse e medie"],
        ["#ed58c1", "Nubi d’acqua alte e sottili; aranciate con ghiaccio"],
        ["#ffffff", "Nubi d’acqua sopraffusa"],
        ["#71ff28", "Neve e ghiaccio al suolo"],
      ].map(([color, text]) => <div key={text} className="flex items-center gap-1"><span className="h-3 w-3 shrink-0 rounded" style={{backgroundColor: color}} />{text}</div>)}</div><p>Colori indicativi · prodotto diurno.</p><a href="https://user.eumetsat.int/s3/eup-strapi-media/QG_Cloud_Type_RGB_ab06957dd1.pdf" target="_blank" rel="noreferrer">Guida EUMETSAT / EUMeTrain</a></details> : undefined}
      note={`${sat.attribution} · Mediterraneo · passo ${sat.step_minutes} min.${sat.daytime_only ? " Prodotto diurno: di notte l'immagine è scura." : ""}${satQ.isError ? " Catalogo temporaneamente indisponibile, archivio precedente in uso." : ""}${frameFailed ? " Fotogramma non disponibile. Resta l’ultima immagine caricata, se presente." : ""}`}
    />
  ) : satProduct && (satQ.isError || satQ.isLoading) ? (
    <div className="pointer-events-auto rounded-xl border border-slate-700 bg-slate-900/95 p-3 text-xs text-slate-300" data-testid="satellite-status">
      {satQ.isLoading ? "Verifica dei frame EUMETSAT disponibili…" : satProduct === "li"
        ? "MTG Lightning Imager: nessun frame con attività nelle ultime 2 ore, oppure archivio non disponibile. Nessuna immagine mostrata."
        : "EUMETSAT: catalogo al momento indisponibile."}
      {shownSat && <div>In vista {shownSat.label} · {fmtTime(shownSat.time)}</div>}
    </div>
  ) : radarProduct ? (
    <div role="status" className="pointer-events-auto rounded-xl border border-slate-700 bg-slate-900/95 p-3 text-xs text-slate-200" data-testid="radar-unavailable">
      {radarQ.isError ? "Radar: ultimo prodotto non disponibile."
        : radarNumericQ.isError ? "Radar: archivio dei valori puntuali non disponibile."
        : radarQ.isLoading || radarNumericQ.isLoading ? "Radar: verifica dei fotogrammi e dei valori puntuali…"
        : "Radar: nessun orario comune fra immagini e valori puntuali."}
    </div>
  ) : null;

  const layerPanel = (
    <LayerPanel satellites={activeSatellites} toggleSatellite={toggleSatellite} satelliteOpacity={satelliteOpacity} setSatelliteOpacity={(key, value) => setSatelliteOpacity({ ...satelliteOpacity, [key]: value })} anim={anim} accumulation={accumulationProduct} setAccumulation={setAccumulation}
      accumulationStatus={accumulationProduct ? accumulationQ.isFetching && !accumulationQ.data ? "Ricerca dell'ultimo prodotto DPC…" : accumulationQ.isError && !accumulationQ.data ? "Prodotto DPC temporaneamente non disponibile." : accumulationQ.data ? `Aggiornato: ${fmtDayTime(accumulationQ.data)} · Protezione Civile` : "" : ""}
      setAnim={(next) => {
      setAnim(next);
      if (next !== "none") setAccumulation(null);
      if (next === "marine" && anim !== "marine") requestAnimationFrame(() => mapControls.fitMediterranean());
    }} aromeParam={aromeParam} setAromeParam={setAromeParam} arome={arome}
      showIspraBuoys={showIspraBuoys} setShowIspraBuoys={(on) => {
        setShowIspraBuoys(on);
        if (on) setParamKey("water_temp_c");
        else if (!showRonBuoys) setParamKey("temp");
      }}
      showRonBuoys={showRonBuoys} setShowRonBuoys={(on) => {
        setShowRonBuoys(on);
        if (on) setParamKey("water_temp_c");
        else if (!showIspraBuoys) setParamKey("temp");
      }}
      marineControls={<MarineControls model={marineModel} onModel={(model) => {
        setMarineModel(model); setMarineParameter(model === "shyfem" ? "wl" : "hs");
      }} parameter={marineParam} onParameter={setMarineParameter} forcing={marineForcing} onForcing={setMarineForcing}
        catalog={marine} loading={marineQ.isFetching} error={marineQ.isError} arrows={marineArrows} onArrows={setMarineArrows}
        onMediterranean={() => { setSheet("none"); mapControls.fitMediterranean(); }}
        onSardinia={() => { setSheet("none"); mapControls.fitSardinia(); }} />}
      opacity={opacity} setOpacity={setOpacity} alerts={alertsOn} setAlerts={setAlertsOn}
      webcams={webcamsOn} setWebcams={setWebcamsOn} webcamCount={WEBCAMS.length}
      hydrometers={hydrometersOn} setHydrometers={setHydrometersOn} hydroStatus={hydroStatus}
      wind={windOn} setWind={setWindOn} windWarning={windWarning}
      is3d={mode3d} lightning={lightningOn} setLightning={setLightningOn} lightningStatus={lightning.status} strokeCount={lightning.strokes.length}
      liveWind={liveWindOn} setLiveWind={setLiveWindOn} liveWindSub={liveWindSub}
      stationArrows={stationArrowsOn} setStationArrows={setStationArrowsOn}
      arrowCount={visible.filter((s) => s.wind_kmh != null && s.wind_dir != null && s.freshness !== "unavailable").length}
      boundaries={boundariesOn} setBoundaries={setBoundariesOn} subregions={subregionsOn} setSubregions={setSubregionsOn}
      municipalities={municipalOn} setMunicipalities={setMunicipalOn} />
  );
  const stationList = (
    <StationList cedocStatus={stationsQ.data?.networks.find((n) => n.key === "cedoc")} stations={visible} param={param} selectedId={selectedId} onPick={pick} networks={networks}
      onToggleNetwork={(k) => setNetworks((n) => ({ ...n, [k]: n[k] === false }))}
      onSetAllNetworks={(enabled) => {
        setNetworks((current) => {
          const next = { ...current };
          for (const key of new Set([...Object.keys(NETWORK_META), ...Object.keys(counts), ...Object.keys(current)])) next[key] = enabled;
          return next;
        });
        if (!enabled) setSelectedId(null);
      }}
      counts={counts} loading={stationsQ.isLoading} />
  );
  const mapProps = {
    satelliteBounds: satProduct ? satRenderBounds ?? shownSat?.overlay.bounds ?? MEDITERRANEAN_BOUNDS : null,
    basemap, stations: visible, param, selectedId, onSelect: setSelectedId, radar: mapRadarLayer,
    radarPoint: radarLayer ? radarPoint : null,
    onRadarPoint: (point: RadarPoint) => { setRadarPoint(point); setAromePoint(null); },
    aromePointEnabled: anim === "arome" && !!aromeUrl && readyKey === `overlay:${aromeUrl}` && !mode3d,
    onAromePoint: (point: RadarPoint) => { setAromePoint(point); setRadarPoint(null); },
    overlay, opacity,
    onLayerReady, fires: null,
    webcams: webcamsOn ? WEBCAMS : [],
    hydrometers: hydrometersOn ? hydrometersQ.data ?? null : null,
    alerts: alertsOn && !alertsQ.isError ? alertsQ.data?.warnings ?? null : null,
    strokes: lightningOn ? lightning.strokes : null, initialView: view, onViewChange: setView, onBounds: setBbox, flyTo, boundaries: boundariesOn,
    subregions: subregionsOn, municipalities: municipalOn, marineVectors: visibleMarineVectors,
  };
  const legends = (
    <>
      <StationLegend param={param} showHistoricDay={param.key === "rain_today" && visible.some((station) => stationParameterLabel(station, param) !== param.label)} />
      {hydrometersOn && <HydroLegend count={hydrometersQ.data?.length ?? 0} />}
      {accumulationLayer && <DpcAccumulationLegend product={accumulationLayer.product} time={accumulationLayer.time} />}
      {liveWindOn && !mode3d && <LiveWindLegend time={liveWindQ.isError ? "non disponibile" : liveWindTime} />}
      {lightningOn && <LightningLegend live={lightning.status === "live"} count={lightning.strokes.length} />}
    </>
  );

  return (
    <div data-testid="app-root" data-wall={wallOn ? "on" : "off"} className={cn("fixed inset-0 overflow-hidden bg-[#0B0F17]", wallOn && "wall")}>
      {mode3d
        ? <Suspense fallback={<div className="fixed inset-0 grid place-items-center text-sm text-slate-300" role="status">Caricamento vista 3D…</div>}>
          <MapView3D key={`3d-${basemap}`} {...mapProps} onUnavailable={() => setMode3d(false)} />
        </Suspense>
        : <MapView key="2d" {...mapProps} liveWind={liveWindOn ? liveWindQ.data?.field ?? null : null} stationArrows={liveWindOn && stationArrowsOn} wind={anim === "arome" && windOn ? windQ.data ?? null : null} />}

      {displayedRadar && radarPoint && (
        <div className="pointer-events-none fixed right-3 top-[115px] z-40 w-[min(360px,calc(100vw-24px))] md:right-4 md:top-[92px]">
          <RadarPointPanel product={displayedRadar.product} time={displayedRadar.time}
            point={radarPoint} onClose={() => setRadarPoint(null)} />
        </div>
      )}
      {anim === "arome" && aromeUrl && readyKey === `overlay:${aromeUrl}` && aromePoint && (
        <div className="pointer-events-none fixed right-3 top-[115px] z-40 w-[min(360px,calc(100vw-24px))] md:right-4 md:top-[92px]">
          <AromePointPanel point={aromePoint} time={aromeFrames[lIdx]?.valid_time ?? ""}
            value={aromePointQ.data} loading={aromePointQ.isLoading || aromePointQ.isFetching}
            error={aromePointQ.isError} onClose={() => setAromePoint(null)} />
        </div>
      )}

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
            {PARAMS.filter((p) => !p.marine).map((p) => (
              <button key={p.key} data-testid={`parameter-chip-${p.key}`} aria-pressed={p.key === paramKey} onClick={() => { setShowIspraBuoys(false); setShowRonBuoys(false); setParamKey(p.key); }}
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

