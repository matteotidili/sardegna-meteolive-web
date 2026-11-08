import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { BASEMAPS, type Basemap, type MapViewState } from "@/components/MapView";
import { BOUNDARY_HALO, BOUNDARY_LINE, loadBoundaries } from "@/lib/boundaries";
import type { AlertWarning, FireDetection, Station, Stroke } from "@/lib/types";
import { colorFor, fmtValue, freshnessFor, slug, valueOf, type ParamDef } from "@/lib/meteo";
import { dpcTilePng } from "@/lib/dpcRadar";
import { mercatorImage } from "@/lib/mercator";
import { lightningColor } from "@/lib/lightning";
import { DEFAULT_CENTER, DEFAULT_ZOOM, mapControls } from "@/lib/mapControls";
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
  maplibregl.addProtocol("dpc", async (params) => {
    const m = params.url.match(/^dpc:\/\/(\w+)\/([^/]+)\/(\d+)\/(\d+)\/(\d+)$/);
    if (!m) throw new Error("bad dpc url");
    const data = await dpcTilePng(m[1], decodeURIComponent(m[2]), +m[3], +m[4], +m[5]);
    return { data };
  });
}

const tiles = (u: string) => (u.includes("{s}") ? ["a", "b", "c", "d"].map((s) => u.replace("{s}", s)) : [u]).map((t) => t.replace("{r}", ""));
const ALERT_COLORS: Record<number, string> = { 2: "#EAB308", 3: "#F97316", 4: "#DC2626" };
const FRESH_PRIORITY = { fresh: 0, stale: 1, historic: 2, unavailable: 3 } as const;
const NET_PRIORITY: Record<string, number> = { "aeronautica-militare": 0, "dpcn-sardegna": 1, ecowitt: 2, cedoc: 3 };
const EMPTY = { type: "FeatureCollection" as const, features: [] as GeoJSON.Feature[] };

interface Props {
  basemap: Basemap;
  stations: Station[];
  param: ParamDef;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  radar: { product: string; time: string } | null;
  overlay: { url: string; bounds: [number, number][]; warp: boolean; attribution: string } | null;
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
}

export default function MapView3D(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const radarIdRef = useRef<string | null>(null);
  const tokenRef = useRef(0);
  const cb = useRef(props);
  cb.current = props;

  useEffect(() => {
    if (!el.current) return;
    ensureProtocol();
    const b = BASEMAPS[props.basemap];
    const m = new maplibregl.Map({
      container: el.current,
      center: [props.initialView.center[1], props.initialView.center[0]],
      zoom: props.initialView.zoom - 1, pitch: 55, bearing: -12, maxPitch: 75,
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
      m.addSource("overlay", { type: "image", url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", coordinates: [[0, 1], [1, 1], [1, 0], [0, 0]] });
      m.addLayer({ id: "overlay", type: "raster", source: "overlay", paint: { "raster-opacity": 0, "raster-fade-duration": 0 } }, b.labels ? "labels" : undefined);
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
    };
    m.on("moveend", emit);
    m.on("click", (e) => { if (!(e.originalEvent.target as HTMLElement).closest(".stn")) cb.current.onSelect(null); });
    mapControls.zoomIn = () => m.zoomIn();
    mapControls.zoomOut = () => m.zoomOut();
    mapControls.reset = () => { if (readyRef.current) m.flyTo({ center: [DEFAULT_CENTER[1], DEFAULT_CENTER[0]], zoom: DEFAULT_ZOOM - 1, pitch: 55, bearing: -12 }); };
    return () => { readyRef.current = false; markersRef.current.forEach((x) => x.remove()); m.remove(); mapRef.current = null; };
    // basemap change remounts (key in parent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function syncAll() { syncMarkers(); syncOverlay(); syncRadar(); syncGeo(); syncBounds(); }

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
    if (!ov) { m.setPaintProperty("overlay", "raster-opacity", 0); return; }
    const [[s, w], [n, e]] = ov.bounds;
    (ov.warp ? mercatorImage(ov.url, s, n) : Promise.resolve(ov.url)).then((url) => {
      if (token !== tokenRef.current || !mapRef.current) return;
      if (!url) { cb.current.onLayerReady(`overlay:${ov.url}`); return; }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (token !== tokenRef.current || !mapRef.current) return;
        (m.getSource("overlay") as maplibregl.ImageSource).updateImage({ url, coordinates: [[w, n], [e, n], [e, s], [w, s]] });
        m.setPaintProperty("overlay", "raster-opacity", cb.current.opacity);
        cb.current.onLayerReady(`overlay:${ov.url}`);
      };
      img.onerror = () => { if (token === tokenRef.current) cb.current.onLayerReady(`overlay-error:${ov.url}`); };
      img.src = url;
    });
  }

  function syncRadar() {
    const m = mapRef.current, r = cb.current.radar;
    if (!m || !readyRef.current) return;
    const prev = radarIdRef.current;
    if (!r) {
      if (prev) { m.removeLayer(prev); m.removeSource(prev); radarIdRef.current = null; }
      return;
    }
    const id = `radar-${r.product}-${r.time}`;
    if (id === prev) return;
    m.addSource(id, r.product === "OPERA"
      ? { type: "raster", tiles: [`${OPERA_TILE_BASE}${operaStamp(r.time)}/{z}/{x}/{y}.png`], tileSize: 256, maxzoom: 7, bounds: [-15, 30, 28, 55], attribution: "EUMETNET OPERA NIMBUS · CC BY 4.0" }
      : { type: "raster", tiles: [`dpc://${r.product}/${encodeURIComponent(r.time)}/{z}/{x}/{y}`], tileSize: 256, maxzoom: 7, bounds: [5, 35, 20, 48] });
    m.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": 0, "raster-fade-duration": 0 } }, "overlay");
    radarIdRef.current = id;
    const done = () => {
      if (!mapRef.current || radarIdRef.current !== id) return;
      m.setPaintProperty(id, "raster-opacity", cb.current.opacity);
      if (prev && m.getLayer(prev)) { m.removeLayer(prev); m.removeSource(prev); }
      cb.current.onLayerReady(`radar:${r.time}`);
    };
    m.once("idle", done);
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
  useEffect(syncOverlay, [props.overlay?.url]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(syncRadar, [props.radar?.product, props.radar?.time]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(syncGeo, [props.alerts, props.fires, props.strokes]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(syncBounds, [props.boundaries]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !readyRef.current) return;
    if (props.overlay) m.setPaintProperty("overlay", "raster-opacity", props.opacity);
    if (radarIdRef.current) m.setPaintProperty(radarIdRef.current, "raster-opacity", props.opacity);
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
