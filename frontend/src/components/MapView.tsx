import { useEffect, useRef } from "react";
import L from "leaflet";
import type { AlertWarning, FireDetection, Station, Stroke } from "@/lib/types";
import { colorFor, fmtValue, freshnessFor, slug, valueOf, type ParamDef } from "@/lib/meteo";
import { createDpcLayer } from "@/lib/dpcRadar";
import { mercatorImage } from "@/lib/mercator";
import { WindFlowLayer, type WindField } from "@/lib/windFlow";
import { liveWindColor } from "@/lib/liveWind";
import { sampleWind } from "@/lib/windFlow";
import { fmtTime, windDirLabel } from "@/lib/meteo";
import { lightningColor } from "@/lib/lightning";
import { DEFAULT_CENTER, DEFAULT_ZOOM, mapControls } from "@/lib/mapControls";
import { OPERA_TILE_BASE, operaStamp } from "@/lib/clientData";
import { BOUNDARY_HALO, BOUNDARY_LINE, MUNICIPAL_LINE, MUNICIPAL_MIN_ZOOM, SUBREGION_LABEL_MIN_ZOOM, SUBREGION_LINE, bboxCenter, loadBoundaries, loadMunicipalities, loadSubregions } from "@/lib/boundaries";

export type Basemap = "dark" | "satellite" | "light" | "relief";
export interface MapViewState { center: [number, number]; zoom: number }

export const BASEMAPS: Record<Basemap, { url: string; attr: string; labels?: string }> = {
  dark: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    labels: "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    attr: "Esri, HERE, Garmin, © OpenStreetMap",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attr: "Esri, Maxar, Earthstar Geographics",
  },
  light: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attr: "© OpenStreetMap, © CARTO",
  },
  relief: {
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}",
    labels: "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    attr: "Esri, USGS, NGA, NASA",
  },
};

const NET_PRIORITY: Record<string, number> = { "aeronautica-militare": 0, "dpcn-sardegna": 1, ecowitt: 2, meteonetwork: 3, cedoc: 4 };
const FRESH_PRIORITY = { fresh: 0, stale: 1, historic: 2, unavailable: 3 } as const;
const NET_CLASS: Record<string, string> = { "aeronautica-militare": "stn-net-am", cedoc: "stn-net-cedoc" };

interface Props {
  basemap: Basemap;
  stations: Station[];
  param: ParamDef;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  radar: { product: string; time: string } | null;
  overlay: { url: string; bounds: [number, number][]; warp: boolean; attribution: string } | null;
  wind: WindField | null;
  strokes: Stroke[] | null;
  onBounds: (b: [number, number, number, number]) => void;
  opacity: number;
  onLayerReady: (key: string) => void;
  fires: FireDetection[] | null;
  alerts: AlertWarning[] | null;
  initialView: MapViewState;
  onViewChange: (v: MapViewState) => void;
  flyTo: { lat: number; lon: number; seq: number } | null;
  liveWind: WindField | null;
  stationArrows: boolean;
  boundaries: boolean;
  subregions: boolean;
  municipalities: boolean;
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const ALERT_COLORS: Record<number, string> = { 2: "#EAB308", 3: "#F97316", 4: "#DC2626" };

export default function MapView(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseRef = useRef<L.TileLayer[]>([]);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const radarRef = useRef<L.GridLayer | null>(null);
  const radarPendingRef = useRef<L.GridLayer | null>(null);
  const aromeRef = useRef<L.ImageOverlay | null>(null);
  const aromeTokenRef = useRef(0);
  const firesRef = useRef<L.LayerGroup | null>(null);
  const alertsRef = useRef<L.GeoJSON | null>(null);
  const windRef = useRef<WindFlowLayer | null>(null);
  const liveWindRef = useRef<WindFlowLayer | null>(null);
  const arrowsRef = useRef<L.LayerGroup | null>(null);
  const strokesRef = useRef<L.LayerGroup | null>(null);
  const canvasRef = useRef<L.Canvas | null>(null);
  const boundsRef = useRef<L.LayerGroup | null>(null);
  const subRef = useRef<{ lines: L.GeoJSON; labels: L.LayerGroup } | null>(null);
  const muniRef = useRef<L.GeoJSON | null>(null);
  const cb = useRef(props);
  cb.current = props;

  // init once
  useEffect(() => {
    if (!el.current || mapRef.current) return;
    const m = L.map(el.current, {
      center: props.initialView.center, zoom: props.initialView.zoom,
      minZoom: 5, maxZoom: 13, zoomControl: false, worldCopyJump: false,
      maxBounds: L.latLngBounds([26, -20], [54, 42]), preferCanvas: false,
    });
    m.createPane("weather").style.zIndex = "350";
    m.createPane("bounds").style.zIndex = "370";
    m.getPane("bounds")!.style.pointerEvents = "none";
    m.createPane("municipal").style.zIndex = "360";
    m.getPane("municipal")!.style.pointerEvents = "none";
    m.createPane("subregions").style.zIndex = "375";
    m.createPane("sublabels").style.zIndex = "395";
    m.getPane("sublabels")!.style.pointerEvents = "none";
    m.createPane("alerts").style.zIndex = "380";
    m.createPane("labels").style.zIndex = "390";
    m.getPane("labels")!.style.pointerEvents = "none";
    markersRef.current = L.layerGroup().addTo(m);
    firesRef.current = L.layerGroup().addTo(m);
    m.createPane("windArrows").style.zIndex = "610";
    arrowsRef.current = L.layerGroup().addTo(m);
    m.createPane("lightning").style.zIndex = "445";
    m.getPane("lightning")!.style.pointerEvents = "none";
    canvasRef.current = L.canvas({ pane: "lightning", padding: 0.5 });
    strokesRef.current = L.layerGroup().addTo(m);
    const emitBounds = () => {
      const b = m.getBounds(), r = (v: number) => Math.round(v * 10) / 10;
      cb.current.onBounds([r(b.getNorth()), r(b.getEast()), r(b.getSouth()), r(b.getWest())]);
    };
    emitBounds();
    m.on("moveend", () => {
      const c = m.getCenter();
      cb.current.onViewChange({ center: [+c.lat.toFixed(4), +c.lng.toFixed(4)], zoom: m.getZoom() });
      emitBounds();
    });
    m.on("click", () => cb.current.onSelect(null));
    mapRef.current = m;
    mapControls.zoomIn = () => m.zoomIn();
    mapControls.zoomOut = () => m.zoomOut();
    mapControls.reset = () => m.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { duration: 0.6 });
    return () => { windRef.current?.destroy(); windRef.current = null; liveWindRef.current?.destroy(); liveWindRef.current = null; m.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // basemap
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    baseRef.current.forEach((l) => l.remove());
    const b = BASEMAPS[props.basemap];
    const layers = [L.tileLayer(b.url, { attribution: b.attr, maxZoom: 13, subdomains: "abcd" }).addTo(m)];
    if (b.labels) layers.push(L.tileLayer(b.labels, { pane: "labels", maxZoom: 13, subdomains: "abcd" }).addTo(m));
    baseRef.current = layers;
  }, [props.basemap]);

  // administrative boundaries (original sources, white line + dark halo)
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (!props.boundaries) { boundsRef.current?.remove(); return; }
    let alive = true;
    if (boundsRef.current) { boundsRef.current.addTo(m); return; }
    loadBoundaries().then((fc) => {
      if (!alive || !mapRef.current) return;
      const opt = (st: typeof BOUNDARY_LINE) => ({ pane: "bounds", interactive: false, style: () => ({ ...st, fill: false }) });
      boundsRef.current = L.layerGroup([L.geoJSON(fc, opt(BOUNDARY_HALO)), L.geoJSON(fc, opt(BOUNDARY_LINE))]).addTo(mapRef.current);
    }).catch((e) => console.warn(e));
    return () => { alive = false; };
  }, [props.boundaries]);

  // historic subregions (original GeoNue/Nordai layer): dashed cyan lines, names from zoom 7.8
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    let alive = true;
    const sync = () => {
      const sr = subRef.current;
      if (!sr) return;
      const on = cb.current.subregions;
      if (on) sr.lines.addTo(m); else sr.lines.remove();
      if (on && m.getZoom() >= SUBREGION_LABEL_MIN_ZOOM) sr.labels.addTo(m); else sr.labels.remove();
    };
    if (props.subregions && !subRef.current) {
      loadSubregions().then((fc) => {
        if (!alive || subRef.current) return;
        const labels = L.layerGroup();
        const lines = L.geoJSON(fc, {
          pane: "subregions",
          style: () => ({ ...SUBREGION_LINE, dashArray: "7 5", fill: false }),
          onEachFeature: (f, layer) => {
            const name = esc(String((f.properties as { nome?: string })?.nome ?? ""));
            layer.bindPopup(`<strong>${name}</strong><br>Confine storico-geografico indicativo. Non è un limite amministrativo.`);
            const c = f.geometry ? bboxCenter(f.geometry) : null;
            if (c) labels.addLayer(L.marker(c, { pane: "sublabels", interactive: false, keyboard: false, icon: L.divIcon({ className: "subregions-label", html: name, iconSize: null as unknown as L.PointExpression }) }));
          },
        });
        subRef.current = { lines, labels };
        sync();
      }).catch((e) => console.warn("Subregioni storiche", e));
    }
    sync();
    m.on("zoomend", sync);
    return () => { alive = false; m.off("zoomend", sync); };
  }, [props.subregions]);

  // municipal boundaries: thin lines only once zoomed in enough to locate stations
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    let alive = true;
    const sync = () => {
      const show = cb.current.municipalities && m.getZoom() >= MUNICIPAL_MIN_ZOOM;
      if (show && !muniRef.current) {
        loadMunicipalities().then((fc) => {
          if (!alive || muniRef.current) return;
          muniRef.current = L.geoJSON(fc, { pane: "municipal", interactive: false, style: () => ({ ...MUNICIPAL_LINE, fill: false }) });
          sync();
        }).catch((e) => console.warn("Confini comunali", e));
        return;
      }
      if (show) muniRef.current?.addTo(m); else muniRef.current?.remove();
    };
    sync();
    m.on("zoomend", sync);
    return () => { alive = false; m.off("zoomend", sync); };
  }, [props.municipalities]);

  // fly to
  const flySeqRef = useRef(props.flyTo?.seq ?? 0); // ignore a fly request that predates this mount
  useEffect(() => {
    if (!props.flyTo || !mapRef.current || props.flyTo.seq === flySeqRef.current) return;
    flySeqRef.current = props.flyTo.seq;
    mapRef.current.flyTo([props.flyTo.lat, props.flyTo.lon], Math.max(mapRef.current.getZoom(), 10), { duration: 0.6 });
  }, [props.flyTo]);

  // station markers with zoom-aware decluttering (all networks share one placement pass)
  useEffect(() => {
    const m = mapRef.current, g = markersRef.current;
    if (!m || !g) return;
    g.clearLayers();
    const p = props.param;
    const items = props.stations
      .map((s) => ({ s, v: valueOf(s, p), f: freshnessFor(s, p) }))
      .filter((x): x is { s: Station; v: number; f: Station["freshness"] } => x.v !== null && x.f !== "unavailable");
    items.sort((a, b) =>
      (b.s.id === props.selectedId ? 1 : 0) - (a.s.id === props.selectedId ? 1 : 0) ||
      FRESH_PRIORITY[a.f] - FRESH_PRIORITY[b.f] ||
      (NET_PRIORITY[a.s.network] ?? 9) - (NET_PRIORITY[b.s.network] ?? 9));
    // Every station is always drawn as a value badge (never collapsed to a dot), at any zoom.
    // Overlaps are resolved only by stacking order: selected > fresh > stale > historic, then network priority.
    const total = items.length;
    items.forEach(({ s, v, f }, rank) => {
      const text = fmtValue(v, p);
      const w = text.length * 7 + 12, h = 20;
      const color = colorFor(p, v);
      const sel = s.id === props.selectedId ? " stn-sel" : "";
      const tid = `station-marker-${slug(s.id)}`;
      const icon = L.divIcon({
        className: "stn-icon",
        html: `<div class="stn stn-${f} ${NET_CLASS[s.network] ?? ""}${sel}" style="--c:${color}" data-testid="${tid}">${text}</div>`,
        iconSize: [w, h], iconAnchor: [w / 2, h / 2],
      });
      // zIndexOffset must dominate Leaflet's latitude-based ordering (≈ pixel y), hence the large step
      const mk = L.marker([s.lat, s.lon], { icon, zIndexOffset: (total - rank) * 1000, keyboard: false });
      mk.bindTooltip(`${s.name} · ${text} ${p.unit}`, { direction: "top", offset: [0, -10], className: "" });
      mk.on("click", (e) => { L.DomEvent.stopPropagation(e); cb.current.onSelect(s.id); });
      g.addLayer(mk);
    });
  }, [props.stations, props.param, props.selectedId]);

  // DPC radar — the new frame is added on top and the old one removed only when every tile is ready
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (!props.radar) {
      radarRef.current?.remove(); radarPendingRef.current?.remove();
      radarRef.current = radarPendingRef.current = null;
      return;
    }
    radarPendingRef.current?.remove();
    const { product, time } = props.radar;
    const layer: L.GridLayer = product === "OPERA"
      ? L.tileLayer(`${OPERA_TILE_BASE}${operaStamp(time)}/{z}/{x}/{y}.png`, {
          pane: "weather", opacity: props.opacity, tileSize: 256, maxNativeZoom: 7, maxZoom: 15, updateWhenZooming: false, keepBuffer: 2,
          bounds: L.latLngBounds([30, -15], [55, 28]), attribution: "Radar: EUMETNET OPERA NIMBUS · CC BY 4.0 · tiles RadarEU",
        })
      : createDpcLayer(product, time, props.opacity, "weather");
    radarPendingRef.current = layer;
    layer.once("load", () => {
      if (radarPendingRef.current !== layer) return;
      radarRef.current?.remove();
      radarRef.current = layer;
      radarPendingRef.current = null;
      cb.current.onLayerReady(`radar:${time}`);
    });
    layer.addTo(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.radar?.product, props.radar?.time]);

  // Image overlay (AROME lat/lon rasters → warped to Mercator; satellite WMS already in EPSG:3857).
  // Swap only after the new image is ready (no blank flashes); failed frames are never shown.
  const overlayUrl = props.overlay?.url;
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const token = ++aromeTokenRef.current;
    if (!props.overlay) { aromeRef.current?.remove(); aromeRef.current = null; return; }
    const [[s, w], [n, e]] = props.overlay.bounds;
    const { url: src, warp, attribution } = props.overlay;
    (warp ? mercatorImage(src, s, n) : Promise.resolve(src)).then((url) => {
      if (token !== aromeTokenRef.current || !mapRef.current) return;
      if (!url) { cb.current.onLayerReady(`overlay:${src}`); return; }
      const ov = L.imageOverlay(url, [[s, w], [n, e]], { pane: "weather", opacity: cb.current.opacity, interactive: false, attribution });
      ov.once("load", () => {
        if (token !== aromeTokenRef.current) { ov.remove(); return; }
        aromeRef.current?.remove();
        aromeRef.current = ov;
        cb.current.onLayerReady(`overlay:${src}`);
      });
      ov.once("error", () => { ov.remove(); if (token === aromeTokenRef.current) cb.current.onLayerReady(`overlay-error:${src}`); });
      ov.addTo(mapRef.current);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayUrl]);

  // AROME wind streamlines
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (!props.wind) { windRef.current?.destroy(); windRef.current = null; return; }
    if (!windRef.current) windRef.current = new WindFlowLayer(m);
    windRef.current.setField(props.wind);
  }, [props.wind]);

  // current-wind streamlines (model analysis), coloured by speed, own canvas
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (!props.liveWind) { liveWindRef.current?.destroy(); liveWindRef.current = null; return; }
    if (!liveWindRef.current) liveWindRef.current = new WindFlowLayer(m, { pane: "liveFlow", zIndex: 372, testid: "live-wind-canvas", colorFor: liveWindColor, lineWidth: 0.9, pxPerParticle: 520, fade: 0.94 });
    liveWindRef.current.setField(props.liveWind);
  }, [props.liveWind]);

  // measured station wind arrows, drawn just above each badge; popup compares with the analysis
  useEffect(() => {
    const g = arrowsRef.current;
    if (!g) return;
    g.clearLayers();
    if (!props.stationArrows) return;
    for (const s of props.stations) {
      if (s.wind_kmh == null || s.wind_dir == null || s.freshness === "unavailable") continue;
      const kmh = s.wind_kmh, calm = kmh < 1;
      const color = liveWindColor(kmh / 3.6), to = (s.wind_dir + 180) % 360;
      const muted = s.freshness === "historic" ? 0.45 : s.freshness === "stale" ? 0.75 : 1;
      const svg = calm
        ? `<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="4.5" fill="none" stroke="${color}" stroke-width="2"/></svg>`
        : `<svg width="26" height="26" viewBox="0 0 26 26" style="transform:rotate(${to}deg)"><path d="M13 2 L19 12 L14.6 11 L14.6 24 L11.4 24 L11.4 11 L7 12 Z" fill="${color}" stroke="#0B0F17" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
      const size = calm ? 14 : 26;
      const icon = L.divIcon({ className: "wind-arrow", html: svg, iconSize: [size, size], iconAnchor: [size / 2, size / 2 + 22] });
      const mk = L.marker([s.lat, s.lon], { icon, pane: "windArrows", keyboard: false, opacity: muted });
      const uv = props.liveWind ? sampleWind(props.liveWind, s.lon, s.lat) : null;
      let cmp = "Analisi ICON-2I non disponibile in questo punto.";
      if (uv) {
        const aKmh = Math.hypot(uv[0], uv[1]) * 3.6;
        const aFrom = ((Math.atan2(-uv[0], -uv[1]) * 180) / Math.PI + 360) % 360;
        const dDir = Math.abs(((s.wind_dir - aFrom + 540) % 360) - 180);
        const dSpd = kmh - aKmh;
        cmp = `Analisi ICON-2I: <b>${aKmh.toFixed(0)} km/h</b> da ${windDirLabel(aFrom)} (${aFrom.toFixed(0)}°)<br>Scarto misura − analisi: ${dSpd >= 0 ? "+" : ""}${dSpd.toFixed(0)} km/h · ${dDir.toFixed(0)}° di direzione`;
      }
      const name = s.name.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
      mk.bindPopup(`<div data-testid="wind-arrow-popup"><strong>${name}</strong><br>Misurato: <b>${kmh.toFixed(0)} km/h</b> da ${windDirLabel(s.wind_dir)} (${s.wind_dir.toFixed(0)}°)` +
        `${s.gust_kmh != null ? ` · raffica ${s.gust_kmh.toFixed(0)} km/h` : ""}<br><span style="opacity:.75">Osservazione: ${fmtTime(s.last)}</span><br>${cmp}</div>`);
      mk.on("click", (e) => L.DomEvent.stopPropagation(e));
      g.addLayer(mk);
    }
  }, [props.stationArrows, props.stations, props.liveWind]);

  // lightning strokes (canvas, colour by age)
  useEffect(() => {
    const g = strokesRef.current, r = canvasRef.current;
    if (!g || !r) return;
    g.clearLayers();
    const now = Date.now();
    (props.strokes ?? []).forEach((s) => {
      const age = (now - s.time) / 60000;
      g.addLayer(L.circleMarker([s.lat, s.lon], {
        renderer: r, radius: age < 5 ? 5 : 3.5, weight: 1, color: "#111", fillColor: lightningColor(age), fillOpacity: 0.95, interactive: false,
      }));
    });
  }, [props.strokes]);

  // opacity
  useEffect(() => {
    radarRef.current?.setOpacity(props.opacity);
    radarPendingRef.current?.setOpacity(props.opacity);
    aromeRef.current?.setOpacity(props.opacity);
  }, [props.opacity]);

  // fires
  useEffect(() => {
    const g = firesRef.current;
    if (!g) return;
    g.clearLayers();
    (props.fires ?? []).forEach((f, i) => {
      const mk = L.marker([f.lat, f.lon], {
        icon: L.divIcon({ className: "stn-icon", html: `<div class="frp-dot" data-testid="frp-marker-${i}"></div>`, iconSize: [12, 12] }),
      });
      mk.bindTooltip(`Anomalia termica (FRP) ${f.frp_mw != null ? f.frp_mw.toFixed(1) + " MW" : ""} · non necessariamente incendio confermato`);
      g.addLayer(mk);
    });
  }, [props.fires]);

  // alert polygons
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    alertsRef.current?.remove();
    alertsRef.current = null;
    const feats = (props.alerts ?? []).filter((a) => a.geometry).map((a) => ({
      type: "Feature" as const, geometry: a.geometry as GeoJSON.Geometry,
      properties: { level: a.level, event: a.type_name || a.event, status: a.status },
    }));
    if (!feats.length) return;
    alertsRef.current = L.geoJSON({ type: "FeatureCollection", features: feats } as GeoJSON.FeatureCollection, {
      pane: "alerts", interactive: false,
      style: (f) => {
        const c = ALERT_COLORS[(f?.properties as { level: number }).level] ?? "#EAB308";
        return { color: c, weight: 2, fillColor: c, fillOpacity: (f?.properties as { status: string }).status === "active" ? 0.14 : 0.05, dashArray: (f?.properties as { status: string }).status === "active" ? undefined : "6 4" };
      },
    }).addTo(m);
  }, [props.alerts]);

  return <div ref={el} className="absolute inset-0 z-0" data-testid="map-canvas" />;
}
