import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { BASEMAPS, type Basemap, type MapViewState } from "@/components/MapView";
import { BOUNDARY_HALO, BOUNDARY_LINE, MUNICIPAL_LINE, MUNICIPAL_MIN_ZOOM, SUBREGION_LABEL_MIN_ZOOM, SUBREGION_LINE, labelPoints, loadBoundaries, loadMunicipalities, loadSubregions } from "@/lib/boundaries";
import type { AlertWarning, FireDetection, Station, Stroke } from "@/lib/types";
import { colorFor, fmtValue, freshnessFor, slug, valueOf, type ParamDef } from "@/lib/meteo";
import { dpcTilePng } from "@/lib/dpcRadar";
import { Radar3D } from "@/lib/radar3d";
import { mercatorImage } from "@/lib/mercator";
import { preloadOverlayImage } from "@/lib/overlayImage";
import { declutterMarineVectors, marineArrowFeatures } from "@/lib/marineVectors";
import { lightningColor } from "@/lib/lightning";
import { DEFAULT_CENTER, DEFAULT_ZOOM, MEDITERRANEAN_BOUNDS, mapControls, mapFitPadding } from "@/lib/mapControls";
import { OPERA_TILE_BASE, operaStamp } from "@/lib/clientData";

/*
 * 3D view (MapLibre GL + Mapterhorn terrain). MapLibre zoom = Leaflet zoom − 1 (512 px tiles).
 * Same data and rules as 2D: badges always shown, radar decoded, AROME warped, satellites in EPSG:3857.
 * Wind streamlines are 2D-only.
 */
let protocolReady = false;
function ensureProtocol() {
  if (protocolReady) return;
  protocolReady = true;
  maplibregl.addProtocol("dpc", async (params, abort) => {
    const m = params.url.match(/^dpc:\/\/(\w+)\/([^/]+)\/(\d+)\/(\d+)\/(\d+)$/);
    if (!m) throw new Error("bad dpc url");
    const data = await dpcTilePng(m[1], decodeURIComponent(m[2]), +m[3], +m[4], +m[5], abort.signal);
    return { data };
  });
}

const tiles = (u: string) => (u.includes("{s}") ? ["a", "b", "c", "d"].map((s) => u.replace("{s}", s)) : [u]).map((t) => t.replace("{r}", ""));
const ALERT_COLORS: Record<number, string> = { 2: "#EAB308", 3: "#F97316", 4: "#DC2626" };
const FRESH_PRIORITY = { fresh: 0, stale: 1, historic: 2, unavailable: 3 } as const;
const NET_PRIORITY: Record<string, number> = { "aeronautica-militare": 0, "dpcn-sardegna": 1, ecowitt: 2, meteonetwork: 3, cedoc: 4 };
const EMPTY = { type: "FeatureCollection" as const, features: [] as GeoJSON.Feature[] };
const EMPTY_OVERLAY = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

interface Props {
  basemap: Basemap;
  stations: Station[];
  param: ParamDef;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  radar: { product: string; time: string } | null;
  overlay: { url: string; bounds: [number, number][]; warp: boolean; attribution: string; group?: string } | null;
  marineVectors: GeoJSON.FeatureCollection | null;
  opacity: number;
  onLayerReady: (key: string) => void;
  fires: FireDetection[] | null;
  alerts: AlertWarning[] | null;
  strokes: Stroke[] | null;
  initialView: MapViewState;
  onViewChange: (v: MapViewState) => void;
  onBounds: (b: [number, number, number, number]) => void;
  flyTo: { lat: number; lon: number; seq: number } | null;
  boundaries: boolean;
  subregions: boolean;
  municipalities: boolean;
}

export default function MapView3D(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const subLabelsRef = useRef<maplibregl.Marker[]>([]);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const radarRef = useRef<Radar3D | null>(null);
  const tokenRef = useRef(0);
  const overlayLoadRef = useRef<AbortController | null>(null);
  const overlayWatchRef = useRef<(() => void) | null>(null);
  const overlayGroupRef = useRef<string | null>(null);
  const overlayVisibleRef = useRef(false);
  const marineRafRef = useRef(0);
  const cb = useRef(props);
  cb.current = props;

  useEffect(() => {
    if (!el.current) return;
    ensureProtocol();
    const b = BASEMAPS[props.basemap];
    const m = new maplibregl.Map({
      container: el.current,
      center: [props.initialView.center[1], props.initialView.center[0]],
      zoom: props.initialView.zoom - 1, minZoom: 2, pitch: 55, bearing: -12, maxPitch: 75,
      attributionControl: { compact: true },
      style: {
        version: 8,
        sources: {
          base: { type: "raster", tiles: tiles(b.url), tileSize: 256, attribution: b.attr, maxzoom: 18 },
          ...(b.labels ? { labels: { type: "raster" as const, tiles: tiles(b.labels), tileSize: 256, maxzoom: 18 } } : {}),
          terrain: { type: "raster-dem", url: "https://tiles.mapterhorn.com/tilejson.json" },
          hill: { type: "raster-dem", url: "https://tiles.mapterhorn.com/tilejson.json" },
        },
        layers: [
          { id: "base", type: "raster", source: "base" },
          { id: "hillshade", type: "hillshade", source: "hill", paint: { "hillshade-exaggeration": 0.45, "hillshade-shadow-color": "#0B0F17" } },
          ...(b.labels ? [{ id: "labels", type: "raster" as const, source: "labels" }] : []),
        ],
      },
    });
    mapRef.current = m;
    m.on("load", () => {
      readyRef.current = true;
      // terrain only after load: an easing frame before the DEM exists crashes MapLibre's elevation lookup
      m.setTerrain({ source: "terrain", exaggeration: 1.4 });
      m.addSource("overlay", { type: "image", url: EMPTY_OVERLAY, coordinates: [[0, 1], [1, 1], [1, 0], [0, 0]] });
      m.addLayer({ id: "overlay", type: "raster", source: "overlay", paint: { "raster-opacity": 0, "raster-fade-duration": 0 } }, b.labels ? "labels" : undefined);
      m.addSource("marine-vectors", { type: "geojson", data: EMPTY });
      m.addLayer({ id: "marine-vector-casing", type: "line", source: "marine-vectors",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#0B0F17", "line-width": 3.5, "line-opacity": 0.85 } }, b.labels ? "labels" : undefined);
      m.addLayer({ id: "marine-vector-lines", type: "line", source: "marine-vectors",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#F8FAFC", "line-width": 1.5, "line-opacity": 0.95 } }, b.labels ? "labels" : undefined);
      radarRef.current = new Radar3D(m, (r) => r.product === "OPERA"
        ? { type: "raster", tiles: [`${OPERA_TILE_BASE}${operaStamp(r.time)}/{z}/{x}/{y}.png`], tileSize: 256, maxzoom: 7, bounds: [-15, 30, 28, 55], attribution: "EUMETNET OPERA NIMBUS · CC BY 4.0" }
        : { type: "raster", tiles: [`dpc://${r.product}/${encodeURIComponent(r.time)}/{z}/{x}/{y}`], tileSize: 256, maxzoom: 7, bounds: [5, 35, 20, 48] },
      (key) => cb.current.onLayerReady(key));
      m.addSource("municipal", { type: "geojson", data: EMPTY });
      m.addLayer({ id: "municipal-line", type: "line", source: "municipal", minzoom: MUNICIPAL_MIN_ZOOM - 1, paint: { "line-color": MUNICIPAL_LINE.color, "line-width": MUNICIPAL_LINE.weight, "line-opacity": MUNICIPAL_LINE.opacity } });
      m.addSource("subregions", { type: "geojson", data: EMPTY });
      m.addLayer({ id: "subregions-line", type: "line", source: "subregions", paint: { "line-color": SUBREGION_LINE.color, "line-width": 2.4, "line-opacity": SUBREGION_LINE.opacity, "line-dasharray": [3, 2] } });
      m.addSource("bounds", { type: "geojson", data: EMPTY });
      m.addLayer({ id: "bounds-halo", type: "line", source: "bounds", paint: { "line-color": BOUNDARY_HALO.color, "line-width": BOUNDARY_HALO.weight, "line-opacity": BOUNDARY_HALO.opacity } });
      m.addLayer({ id: "bounds-line", type: "line", source: "bounds", paint: { "line-color": BOUNDARY_LINE.color, "line-width": BOUNDARY_LINE.weight, "line-opacity": BOUNDARY_LINE.opacity } });
      m.addSource("alerts", { type: "geojson", data: EMPTY });
      m.addLayer({ id: "alerts-fill", type: "fill", source: "alerts", paint: { "fill-color": ["get", "c"], "fill-opacity": 0.14 } });
      m.addLayer({ id: "alerts-line", type: "line", source: "alerts", paint: { "line-color": ["get", "c"], "line-width": 2 } });
      m.addSource("fires", { type: "geojson", data: EMPTY });
      m.addLayer({ id: "fires", type: "circle", source: "fires", paint: { "circle-radius": 6, "circle-color": "#F97316", "circle-stroke-color": "#FEF3C7", "circle-stroke-width": 2 } });
      m.addSource("strokes", { type: "geojson", data: EMPTY });
      m.addLayer({ id: "strokes", type: "circle", source: "strokes", paint: { "circle-radius": ["get", "r"], "circle-color": ["get", "c"], "circle-stroke-color": "#111", "circle-stroke-width": 1 } });
      syncAll();
    });
    const emit = () => {
      const c = m.getCenter(), bb = m.getBounds(), r = (v: number) => Math.round(v * 10) / 10;
      cb.current.onViewChange({ center: [+c.lat.toFixed(4), +c.lng.toFixed(4)], zoom: Math.round(m.getZoom() + 1) });
      cb.current.onBounds([r(bb.getNorth()), r(bb.getEast()), r(bb.getSouth()), r(bb.getWest())]);
      queueMarineVectors();
    };
    m.on("moveend", emit);
    m.on("zoomend", () => syncSubLabels());
    m.on("resize", queueMarineVectors);
    m.on("click", (e) => { if (!(e.originalEvent.target as HTMLElement).closest(".stn")) cb.current.onSelect(null); });
    mapControls.zoomIn = () => m.zoomIn();
    mapControls.zoomOut = () => m.zoomOut();
    mapControls.reset = () => { if (readyRef.current) m.flyTo({ center: [DEFAULT_CENTER[1], DEFAULT_CENTER[0]], zoom: DEFAULT_ZOOM - 1, pitch: 55, bearing: -12 }); };
    mapControls.fitSardinia = () => mapControls.reset();
    mapControls.fitMediterranean = () => {
      const container = m.getContainer(), padding = mapFitPadding(container.clientWidth, container.clientHeight);
      const [[s, w], [n, e]] = MEDITERRANEAN_BOUNDS;
      // A flat overview keeps the whole basin in view, including on narrow screens.
      m.fitBounds([[w, s], [e, n]], { padding, pitch: 0, bearing: 0, duration: readyRef.current ? 600 : 0 });
    };
    return () => {
      readyRef.current = false;
      ++tokenRef.current;
      overlayLoadRef.current?.abort(); overlayLoadRef.current = null;
      overlayWatchRef.current?.(); overlayWatchRef.current = null;
      cancelAnimationFrame(marineRafRef.current); marineRafRef.current = 0;
      radarRef.current?.destroy();
      radarRef.current = null;
      markersRef.current.forEach((x) => x.remove());
      subLabelsRef.current.forEach((x) => x.remove());
      subLabelsRef.current = [];
      m.remove();
      mapRef.current = null;
    };
    // basemap change remounts (key in parent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function syncAll() { syncMarkers(); syncOverlay(); syncRadar(); syncGeo(); syncBounds(); syncSubregions(); syncMunicipal(); syncMarineVectors(); }

  function queueMarineVectors() {
    if (marineRafRef.current) return;
    marineRafRef.current = requestAnimationFrame(() => { marineRafRef.current = 0; syncMarineVectors(); });
  }

  function syncMarineVectors() {
    const m = mapRef.current;
    if (!m || !readyRef.current) return;
    const source = m.getSource("marine-vectors") as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    const bounds = m.getBounds();
    const container = m.getContainer();
    const arrows = declutterMarineVectors(cb.current.marineVectors,
      [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      (center) => {
        const p = m.project(center);
        return p.x >= -16 && p.x <= container.clientWidth + 16 && p.y >= -16 && p.y <= container.clientHeight + 16 ? p : null;
      });
    source.setData(marineArrowFeatures(arrows,
      (p) => m.project(p), (p) => { const c = m.unproject([p.x, p.y]); return [c.lng, c.lat]; }));
  }

  function setVis(ids: string[], on: boolean) {
    const m = mapRef.current;
    if (!m) return;
    ids.forEach((id) => m.getLayer(id) && m.setLayoutProperty(id, "visibility", on ? "visible" : "none"));
  }

  function syncSubregions() {
    const m = mapRef.current;
    if (!m || !readyRef.current) return;
    setVis(["subregions-line"], cb.current.subregions);
    syncSubLabels();
    if (cb.current.subregions && !subLabelsRef.current.length) loadSubregions().then((fc) => {
      if (mapRef.current !== m || !readyRef.current || subLabelsRef.current.length) return;
      (m.getSource("subregions") as maplibregl.GeoJSONSource | undefined)?.setData(fc);
      // HTML labels (no glyph server needed), same look as 2D
      subLabelsRef.current = labelPoints(fc).features.map((f) => {
        const div = document.createElement("div");
        div.className = "subregions-label subregions-label-3d";
        div.textContent = String((f.properties as { nome?: string })?.nome ?? "");
        return new maplibregl.Marker({ element: div }).setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number]);
      });
      syncSubLabels();
    }).catch((e) => console.warn("Subregioni storiche", e));
  }

  function syncSubLabels() {
    const m = mapRef.current;
    if (!m) return;
    const show = cb.current.subregions && m.getZoom() >= SUBREGION_LABEL_MIN_ZOOM; // same 3D threshold as the original app
    subLabelsRef.current.forEach((mk) => (show ? mk.addTo(m) : mk.remove()));
  }

  function syncMunicipal() {
    const m = mapRef.current;
    if (!m || !readyRef.current) return;
    setVis(["municipal-line"], cb.current.municipalities);
    if (cb.current.municipalities) loadMunicipalities().then((fc) => {
      if (mapRef.current === m && readyRef.current) (m.getSource("municipal") as maplibregl.GeoJSONSource | undefined)?.setData(fc);
    }).catch((e) => console.warn("Confini comunali", e));
  }

  function syncBounds() {
    const m = mapRef.current;
    if (!m || !readyRef.current) return;
    const vis = cb.current.boundaries ? "visible" : "none";
    m.setLayoutProperty("bounds-halo", "visibility", vis);
    m.setLayoutProperty("bounds-line", "visibility", vis);
    if (cb.current.boundaries) loadBoundaries().then((fc) => {
      if (mapRef.current === m && readyRef.current) (m.getSource("bounds") as maplibregl.GeoJSONSource | undefined)?.setData(fc);
    }).catch((e) => console.warn(e));
  }

  function syncMarkers() {
    const m = mapRef.current;
    if (!m) return;
    markersRef.current.forEach((x) => x.remove());
    const p = cb.current.param, sel = cb.current.selectedId;
    const items = cb.current.stations
      .map((s) => ({ s, v: valueOf(s, p), f: freshnessFor(s, p) }))
      .filter((x): x is { s: Station; v: number; f: Station["freshness"] } => x.v !== null && x.f !== "unavailable")
      .sort((a, b) => (b.s.id === sel ? 1 : 0) - (a.s.id === sel ? 1 : 0) || FRESH_PRIORITY[a.f] - FRESH_PRIORITY[b.f] ||
        (NET_PRIORITY[a.s.network] ?? 9) - (NET_PRIORITY[b.s.network] ?? 9));
    markersRef.current = items.map(({ s, v, f }, rank) => {
      const div = document.createElement("div");
      div.className = `stn stn-${f}${s.id === sel ? " stn-sel" : ""}`;
      div.style.setProperty("--c", colorFor(p, v));
      div.style.zIndex = String(items.length - rank);
      div.dataset.testid = `station-marker-${slug(s.id)}`;
      div.title = s.name;
      div.textContent = fmtValue(v, p);
      div.addEventListener("click", (e) => { e.stopPropagation(); cb.current.onSelect(s.id); });
      const mk = new maplibregl.Marker({ element: div }).setLngLat([s.lon, s.lat]).addTo(m);
      mk.getElement().style.zIndex = String(items.length - rank);
      return mk;
    });
  }

  function syncOverlay() {
    const m = mapRef.current, ov = cb.current.overlay;
    if (!m || !readyRef.current) return;
    const token = ++tokenRef.current;
    overlayLoadRef.current?.abort(); overlayLoadRef.current = null;
    overlayWatchRef.current?.(); overlayWatchRef.current = null;
    const source = m.getSource("overlay") as maplibregl.ImageSource;
    const clear = () => {
      overlayVisibleRef.current = false;
      m.setPaintProperty("overlay", "raster-opacity", 0);
      source.updateImage({ url: EMPTY_OVERLAY });
    };
    if (!ov) {
      if (overlayGroupRef.current !== null) clear();
      overlayGroupRef.current = null;
      return;
    }
    const nextGroup = ov.group ?? "default";
    if (overlayGroupRef.current !== nextGroup) clear();
    overlayGroupRef.current = nextGroup;
    const [[s, w], [n, e]] = ov.bounds;
    const controller = new AbortController();
    overlayLoadRef.current = controller;
    const current = () => !controller.signal.aborted && token === tokenRef.current && mapRef.current === m;
    void preloadOverlayImage(ov.warp ? mercatorImage(ov.url, s, n) : ov.url, controller.signal).then((image) => {
      if (!current()) return;
      let finished = false, imageLoaded = false;
      const finish = (success: boolean) => {
        if (finished || !current()) return;
        finished = true;
        unwatch();
        if (overlayWatchRef.current === unwatch) overlayWatchRef.current = null;
        if (overlayLoadRef.current === controller) overlayLoadRef.current = null;
        if (success) overlayVisibleRef.current = true;
        m.setPaintProperty("overlay", "raster-opacity", overlayVisibleRef.current ? cb.current.opacity : 0);
        cb.current.onLayerReady(`${success ? "overlay" : "overlay-error"}:${ov.url}`);
      };
      const rendered = () => {
        if (current() && imageLoaded && m.isSourceLoaded("overlay")) finish(true);
      };
      const data = (event: { sourceId?: string; sourceDataType?: string }) => {
        // Ignore an old aborted request toggling the fixed source's loaded flag.
        if (event.sourceId === "overlay" && event.sourceDataType === "metadata") imageLoaded = true;
      };
      const error = (event: { sourceId?: string; error?: Error }) => {
        if (event.sourceId === "overlay" && event.error?.name !== "AbortError") finish(false);
      };
      const timer = setTimeout(() => finish(false), 20_000);
      const unwatch = () => {
        clearTimeout(timer);
        m.off("render", rendered);
        m.off("sourcedata", data);
        m.off("error", error);
      };
      overlayWatchRef.current = unwatch;
      m.on("render", rendered);
      m.on("sourcedata", data);
      m.on("error", error);
      try {
        source.updateImage({ url: image.src, coordinates: [[w, n], [e, n], [e, s], [w, s]] });
      } catch { finish(false); }
    }).catch(() => {
      if (overlayLoadRef.current === controller) overlayLoadRef.current = null;
      if (current()) cb.current.onLayerReady(`overlay-error:${ov.url}`);
    });
  }

  function syncRadar() {
    radarRef.current?.setOpacity(cb.current.opacity);
    radarRef.current?.set(cb.current.radar);
  }

  function syncGeo() {
    const m = mapRef.current;
    if (!m || !readyRef.current) return;
    const p = cb.current;
    (m.getSource("alerts") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: (p.alerts ?? []).filter((a) => a.geometry).map((a) => ({ type: "Feature", geometry: a.geometry!, properties: { c: ALERT_COLORS[a.level] ?? "#EAB308" } })),
    });
    (m.getSource("fires") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: (p.fires ?? []).map((f) => ({ type: "Feature", geometry: { type: "Point", coordinates: [f.lon, f.lat] }, properties: {} })),
    });
    const now = Date.now();
    (m.getSource("strokes") as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: (p.strokes ?? []).map((s) => {
        const age = (now - s.time) / 60000;
        return { type: "Feature", geometry: { type: "Point", coordinates: [s.lon, s.lat] }, properties: { c: lightningColor(age), r: age < 5 ? 5 : 3.5 } };
      }),
    });
  }

  useEffect(syncMarkers, [props.stations, props.param, props.selectedId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(syncOverlay, [props.overlay?.url, props.overlay?.group, props.overlay?.bounds.flat().join(","), props.overlay?.warp]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(syncMarineVectors, [props.marineVectors]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(syncRadar, [props.radar?.product, props.radar?.time]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(syncGeo, [props.alerts, props.fires, props.strokes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(syncBounds, [props.boundaries]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(syncSubregions, [props.subregions]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(syncMunicipal, [props.municipalities]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !readyRef.current) return;
    if (props.overlay) m.setPaintProperty("overlay", "raster-opacity", overlayVisibleRef.current ? props.opacity : 0);
    radarRef.current?.setOpacity(props.opacity);
  }, [props.opacity]); // eslint-disable-line react-hooks/exhaustive-deps
  const flySeqRef = useRef(props.flyTo?.seq ?? 0); // ignore a fly request that predates this mount
  useEffect(() => {
    const m = mapRef.current;
    if (!props.flyTo || !m || props.flyTo.seq === flySeqRef.current) return;
    flySeqRef.current = props.flyTo.seq;
    const go = () => m.flyTo({ center: [props.flyTo!.lon, props.flyTo!.lat], zoom: Math.max(m.getZoom(), 9) });
    if (readyRef.current) go(); else m.once("load", go);
  }, [props.flyTo]);

  return (
    <div className="absolute inset-0 z-0">
      {/* maplibre CSS forces position:relative on its container — keep it inside a sized wrapper */}
      <div ref={el} className="h-full w-full" data-testid="map-canvas-3d" />
    </div>
  );
}
