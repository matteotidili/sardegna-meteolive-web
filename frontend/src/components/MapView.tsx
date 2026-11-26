import { webcamLink, type Webcam } from "@/lib/webcams";
import { useEffect, useRef } from "react";
import { satelliteMinZoom } from "@/lib/satelliteView";
import { radarFrameKey } from "@/lib/radarFrame";
import type { RadarPoint } from "@/lib/radarPoint";
import L from "leaflet";
import type { AlertWarning, FireDetection, Station, Stroke } from "@/lib/types";
import { colorFor, fmtTime, observationTimeFor, fmtValue, freshnessFor, PARAM_BY_KEY, slug, stationMarkerTitle, stationMarkerValue, valueOf, type ParamDef } from "@/lib/meteo";
import { createDpcLayer } from "@/lib/dpcRadar";
import { mercatorImage } from "@/lib/mercator";
import { preloadOverlayImage } from "@/lib/overlayImage";
import { MarineVectorLayer } from "@/lib/marineVectorLayer";
import { WindFlowLayer, type WindField } from "@/lib/windFlow";
import { liveWindColor } from "@/lib/liveWind";

const aromeGustColor = (kmh: number) => kmh >= 95 ? "rgba(255,104,92,.98)"
  : kmh >= 65 ? "rgba(255,190,75,.98)"
  : kmh >= 40 ? "rgba(255,239,120,.96)"
  : "rgba(218,249,255,.94)";
import { sampleWind } from "@/lib/windFlow";
import { windDirLabel } from "@/lib/meteo";
import { lightningColor } from "@/lib/lightning";
import { fetchHydroHistory, hydroColor, hydroFmtLevel, hydroPopupHtml, type HydroStation } from "@/lib/hydro";
import { DEFAULT_CENTER, DEFAULT_ZOOM, MEDITERRANEAN_BOUNDS, mapControls, mapFitPadding } from "@/lib/mapControls";
import { OPERA_TILE_BASE, operaStamp } from "@/lib/clientData";
import { BOUNDARY_HALO, BOUNDARY_LINE, MUNICIPAL_LINE, MUNICIPAL_MIN_ZOOM, SUBREGION_LABEL_MIN_ZOOM, SUBREGION_LINE, bboxCenter, loadBoundaries, loadMunicipalities, loadSubregions } from "@/lib/boundaries";
import { insideSardinia, loadSardiniaMask, type SardiniaMask } from "@/lib/sardiniaMask";
import { smoothSurface } from "@/lib/interpolationSurface";
import { createStationInterpolator, interpolateAt, interpolationColor, interpolationCoverage, type InterpolationCoverage, type InterpolationKey, type InterpolationSample } from "@/lib/stationInterpolation";

export type Basemap = "dark" | "satellite" | "light" | "streets" | "relief";
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
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    labels: "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    attr: "Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS user community",
  },
  streets: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attr: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
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
  satelliteBounds: [number, number][] | null;
  basemap: Basemap;
  stations: Station[];
  param: ParamDef;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  radar: { product: string; time: string } | null;
  radarPoint: RadarPoint | null;
  onRadarPoint: (p: RadarPoint) => void;
  aromePointEnabled: boolean;
  onAromePoint: (p: RadarPoint) => void;
  overlay: { url: string; bounds: [number, number][]; warp: boolean; attribution: string; group?: string } | null;
  marineVectors: GeoJSON.FeatureCollection | null;
  wind: WindField | null;
  strokes: Stroke[] | null;
  onBounds: (b: [number, number, number, number]) => void;
  opacity: number;
  onLayerReady: (key: string) => void;
  fires: FireDetection[] | null;
  alerts: AlertWarning[] | null;
  webcams: Webcam[];
  hydrometers: HydroStation[] | null;
  initialView: MapViewState;
  onViewChange: (v: MapViewState) => void;
  flyTo: { lat: number; lon: number; seq: number } | null;
  liveWind: WindField | null;
  stationArrows: boolean;
  boundaries: boolean;
  subregions: boolean;
  municipalities: boolean;
  interpolationEnabled?: boolean;
  interpolationKey?: InterpolationKey;
  interpolationSamples: InterpolationSample[];
  onInterpolationCoverage: (coverage: InterpolationCoverage) => void;
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const ALERT_COLORS: Record<number, string> = { 2: "#EAB308", 3: "#F97316", 4: "#DC2626" };
const convexHull = (points: L.Point[]) => {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return [];
  const cross = (o: L.Point, a: L.Point, b: L.Point) => (a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lower: L.Point[] = [], upper: L.Point[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], point) <= 0) lower.pop();
    lower.push(point);
  }
  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
};
const insidePolygon = (point: L.Point, polygon: L.Point[]) => {
  let inside = false;
  for (let i=0,j=polygon.length-1; i<polygon.length; j=i++) {
    const a=polygon[i], b=polygon[j];
    if ((a.y>point.y)!==(b.y>point.y) && point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
};
// Leaflet 1.9 supports an existing IMG; this overload is absent from the installed typings.
const preloadedImageOverlay = L.imageOverlay as (
  image: string | HTMLImageElement, bounds: L.LatLngBoundsExpression, options?: L.ImageOverlayOptions,
) => L.ImageOverlay;

export default function MapView(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseRef = useRef<L.TileLayer[]>([]);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const sardiniaMask = useRef<SardiniaMask | null>(null);
  const interpolationCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const radarRef = useRef<L.GridLayer | null>(null);
  const radarPointRef = useRef<L.CircleMarker | null>(null);
  const radarPendingRef = useRef<L.GridLayer | null>(null);
  const aromeRef = useRef<L.ImageOverlay | null>(null);
  const aromeTokenRef = useRef(0);
  const overlayGroupRef = useRef<string | null>(null);
  const firesRef = useRef<L.LayerGroup | null>(null);
  const webcamsRef = useRef<L.LayerGroup | null>(null);
  const hydroRef = useRef<L.LayerGroup | null>(null);
  const alertsRef = useRef<L.GeoJSON | null>(null);
  const windRef = useRef<WindFlowLayer | null>(null);
  const liveWindRef = useRef<WindFlowLayer | null>(null);
  const marineRef = useRef<MarineVectorLayer | null>(null);
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
      minZoom: 3, maxZoom: 13, zoomControl: false, worldCopyJump: false,
      zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 120,
      // ResizeObserver owns size updates so Leaflet cannot emit a delayed moveend after unmount.
      trackResize: false,
      // Commit map tiles and station anchors together; interrupted CSS zooms can
      // leave tile panes and markers at different transforms.
      zoomAnimation: false, markerZoomAnimation: false, fadeAnimation: false,
      maxBounds: L.latLngBounds([26, -20], [54, 42]), preferCanvas: false,
    });
    m.createPane("weather").style.zIndex = "350";
    const interpolationCanvas = document.createElement("canvas");
    interpolationCanvas.dataset.testid = "station-interpolation-canvas";
    interpolationCanvas.style.position = "absolute";
    interpolationCanvas.style.inset = "0";
    interpolationCanvas.style.pointerEvents = "none";
    const interpolationPane = m.createPane("stationInterpolation");
    interpolationPane.style.zIndex = "355";
    interpolationPane.style.pointerEvents = "none";
    interpolationPane.appendChild(interpolationCanvas);
    interpolationCanvasRef.current = interpolationCanvas;
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
    m.createPane("hydrometers").style.zIndex = "615";
    hydroRef.current = L.layerGroup().addTo(m);
    m.createPane("webcams").style.zIndex = "625";
    webcamsRef.current = L.layerGroup().addTo(m);
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
    m.on("zoomend", () => {
      // Reproject station anchors after every wheel, pinch and programmatic zoom.
      markersRef.current?.eachLayer((layer) => {
        if (layer instanceof L.Marker) layer.setLatLng(layer.getLatLng());
      });
      // Reset any CSS zoom transform on the still-visible raster while the
      // larger viewport image loads, even if its timestamp did not change.
      const overlay = aromeRef.current;
      if (overlay) overlay.setBounds(overlay.getBounds());
    });
    m.on("moveend", () => {
      if (mapRef.current !== m) return;
      const c = m.getCenter();
      cb.current.onViewChange({ center: [+c.lat.toFixed(4), +c.lng.toFixed(4)], zoom: m.getZoom() });
      emitBounds();
    });
    m.on("click", (e: L.LeafletMouseEvent) => {
      if (cb.current.radar) {
        cb.current.onSelect(null);
        cb.current.onRadarPoint({ lat: e.latlng.lat, lon: e.latlng.lng });
      } else if (cb.current.aromePointEnabled) {
        cb.current.onSelect(null);
        cb.current.onAromePoint({ lat: e.latlng.lat, lon: e.latlng.lng });
      } else if (cb.current.interpolationEnabled && cb.current.interpolationKey) {
        cb.current.onSelect(null);
        const key = cb.current.interpolationKey;
        const samples = cb.current.interpolationSamples;
        const hull = convexHull(samples.map(({ station }) => m.latLngToContainerPoint([station.lat, station.lon])));
        const estimate = sardiniaMask.current && insideSardinia(sardiniaMask.current, e.latlng.lat, e.latlng.lng)
          && hull.length >= 3 && insidePolygon(e.containerPoint, hull)
          ? interpolateAt(e.latlng.lat, e.latlng.lng, samples, key) : null;
        const param = PARAM_BY_KEY[key];
        const latest = (estimate?.stations ?? []).map((station) => observationTimeFor(station, param)).filter((x): x is string => !!x)
          .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
        const content = estimate
          ? `<strong>${esc(param.label)} interpolata</strong><br><b>${fmtValue(estimate.value, param)} ${esc(param.unit)}</b><br><span style="opacity:.75">Stima IDW² · ${estimate.count} stazioni recenti · dato più recente ${fmtTime(latest)} · ${e.latlng.lat.toFixed(3)}°, ${e.latlng.lng.toFixed(3)}°</span>`
          : `<strong>Nessuna stima disponibile</strong><br><span style="opacity:.75">Servono almeno 3 stazioni recenti entro il raggio di copertura. Questo punto non viene estrapolato.</span>`;
        L.popup({ maxWidth: 280 }).setLatLng(e.latlng).setContent(content).openOn(m);
      } else cb.current.onSelect(null);
    });
    mapRef.current = m;
    mapControls.zoomIn = () => m.zoomIn();
    mapControls.zoomOut = () => m.zoomOut();
    mapControls.reset = () => m.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { duration: 0.6 });
    mapControls.fitSardinia = () => mapControls.reset();
    mapControls.fitMediterranean = () => {
      const size = m.getSize(), p = mapFitPadding(size.x, size.y);
      m.fitBounds(MEDITERRANEAN_BOUNDS, { paddingTopLeft: [p.left, p.top], paddingBottomRight: [p.right, p.bottom], duration: 0.6 });
    };
    return () => {
      ++aromeTokenRef.current;
      marineRef.current?.destroy(); marineRef.current = null;
      windRef.current?.destroy(); windRef.current = null;
      liveWindRef.current?.destroy(); liveWindRef.current = null;
      radarPointRef.current?.remove(); radarPointRef.current = null;
      mapRef.current = null;
      m.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Observation-only interpolation canvas. Masked to the station convex hull and
  // to a variable-specific radius, so uncovered areas remain transparent.
  useEffect(() => {
    const m = mapRef.current, canvas = interpolationCanvasRef.current;
    if (!m || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { interpolationEnabled, interpolationKey: key, interpolationSamples: samples, onInterpolationCoverage } = props;
    const estimateAt = key ? createStationInterpolator(samples, key) : null;
    let frame = 0;
    let alive = true;
    let maskStatus: InterpolationCoverage["maskStatus"] = sardiniaMask.current ? "ready" : "loading";
    const surface = document.createElement("canvas");
    const raster = surface.getContext("2d");
    const maskCanvas = document.createElement("canvas");
    const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
    if (!raster || !maskContext) return;
    const redraw = () => {
      frame = 0;
      const size = m.getSize(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
      canvas.width = Math.max(1, Math.round(size.x * dpr));
      canvas.height = Math.max(1, Math.round(size.y * dpr));
      L.DomUtil.setPosition(canvas, m.containerPointToLayerPoint([0, 0]));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!interpolationEnabled || !key || !estimateAt || !sardiniaMask.current || samples.length < 3) {
        onInterpolationCoverage({ variable: key ?? null, count: 0, latest: null, oldest: null, maskStatus });
        return;
      }
      const hull = convexHull(samples.map((x) => m.latLngToContainerPoint([x.station.lat, x.station.lon])));
      if (hull.length < 3) {
        onInterpolationCoverage({ variable: key ?? null, count: 0, latest: null, oldest: null, maskStatus });
        return;
      }
      const xs = hull.map((p) => p.x), ys = hull.map((p) => p.y);
      const minX = Math.max(0, Math.floor(Math.min(...xs))), maxX = Math.min(size.x, Math.ceil(Math.max(...xs)));
      const minY = Math.max(0, Math.floor(Math.min(...ys))), maxY = Math.min(size.y, Math.ceil(Math.max(...ys)));
      const width = maxX - minX, height = maxY - minY;
      if (width <= 0 || height <= 0) {
        onInterpolationCoverage({ variable: key, count: 0, latest: null, oldest: null, maskStatus });
        return;
      }
      const coast = new Path2D();
      const origin = m.getPixelOrigin().add(m.containerPointToLayerPoint([0, 0]));
      for (const polygon of sardiniaMask.current) for (const ring of polygon) {
        ring.forEach(([lon, lat], i) => {
          // Project in floating point so small islands and coastal holes survive at overview zoom.
          const pixel = m.project([lat, lon]).subtract(origin);
          if (i === 0) coast.moveTo(pixel.x, pixel.y);
          else coast.lineTo(pixel.x, pixel.y);
        });
        coast.closePath();
      }
      surface.width = width;
      surface.height = height;
      maskCanvas.width = width;
      maskCanvas.height = height;
      maskContext.translate(-minX, -minY);
      maskContext.fill(coast, "evenodd");
      const land = maskContext.getImageData(0, 0, width, height).data;
      const usedStations = new Map<string, Station>();
      smoothSurface(raster, width, height, (x, y) => {
        const point = L.point(minX + x, minY + y);
        if (!insidePolygon(point, hull)) return null;
        const { lat, lng } = m.containerPointToLatLng(point);
        const estimate = estimateAt(lat, lng);
        if (!estimate) return null;
        if (land[(Math.min(height - 1, Math.floor(y)) * width + Math.min(width - 1, Math.floor(x))) * 4 + 3]) {
          estimate.stations.forEach((station) => usedStations.set(station.id, station));
        }
        return interpolationColor(estimate.value, key);
      });
      ctx.save();
      ctx.clip(coast, "evenodd");
      ctx.globalAlpha = 0.56;
      ctx.drawImage(surface, minX, minY);
      ctx.restore();
      onInterpolationCoverage({ ...interpolationCoverage(usedStations.values(), key), maskStatus });
    };
    const scheduleRedraw = () => { if (!frame) frame = requestAnimationFrame(redraw); };
    scheduleRedraw();
    if (interpolationEnabled && !sardiniaMask.current) {
      void loadSardiniaMask().then((mask) => {
        if (!alive) return;
        sardiniaMask.current = mask;
        maskStatus = "ready";
        scheduleRedraw();
      }).catch(() => {
        if (!alive) return;
        maskStatus = "error";
        scheduleRedraw();
      });
    }
    m.on("moveend zoomend resize", scheduleRedraw);
    const resize = new ResizeObserver(() => {
      if (mapRef.current === m) m.invalidateSize({ pan: false });
    });
    resize.observe(m.getContainer());
    return () => {
      alive = false;
      m.off("moveend zoomend resize", scheduleRedraw);
      resize.disconnect();
      cancelAnimationFrame(frame);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [props.interpolationEnabled, props.interpolationKey, props.interpolationSamples, props.onInterpolationCoverage]);

  // Restrict the full viewport to the actual raster while satellite mode is active.
  const satelliteBoundsKey = JSON.stringify(props.satelliteBounds);
  useEffect(() => {
    const m = mapRef.current, bounds = props.satelliteBounds;
    if (!m || !bounds) return;
    const previousBounds = m.options.maxBounds;
    const previousMinZoom = m.getMinZoom();
    const previousViscosity = m.options.maxBoundsViscosity;
    const coverage = L.latLngBounds(bounds as L.LatLngTuple[]);
    m.options.maxBoundsViscosity = 1;
    const constrain = () => {
      const size = m.getSize();
      m.setMinZoom(satelliteMinZoom(bounds, size.x, size.y));
      m.panInsideBounds(coverage, { animate: false });
    };
    m.setMaxBounds(coverage);
    constrain();
    m.on("resize", constrain);
    return () => {
      m.off("resize", constrain);
      if (mapRef.current !== m) return;
      m.setMinZoom(previousMinZoom);
      m.setMaxBounds(previousBounds ?? L.latLngBounds([26, -20], [54, 42]));
      m.options.maxBoundsViscosity = previousViscosity;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satelliteBoundsKey]);

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
      .filter((x) => (x.v !== null && x.f !== "unavailable")
        || (x.s.network === "cedoc" && p.rain));
    items.sort((a, b) =>
      (b.s.id === props.selectedId ? 1 : 0) - (a.s.id === props.selectedId ? 1 : 0) ||
      FRESH_PRIORITY[a.f] - FRESH_PRIORITY[b.f] ||
      (NET_PRIORITY[a.s.network] ?? 9) - (NET_PRIORITY[b.s.network] ?? 9));
    // Every station is always drawn as a value badge (never collapsed to a dot), at any zoom.
    // Overlaps are resolved only by stacking order: selected > fresh > stale > historic, then network priority.
    const total = items.length;
    items.forEach(({ s, v, f }, rank) => {
      const text = stationMarkerValue(s, p, v);
      const w = text.length * 7 + 12, h = 20;
      const color = v === null ? "#64748B" : colorFor(p, v);
      const sel = s.id === props.selectedId ? " stn-sel" : "";
      const tid = `station-marker-${slug(s.id)}`;
      const icon = L.divIcon({
        className: "stn-icon",
        html: `<div class="stn stn-${f} ${NET_CLASS[s.network] ?? ""}${sel}" style="--c:${color}" data-testid="${tid}">${text}</div>`,
        iconSize: [w, h], iconAnchor: [w / 2, h / 2],
      });
      // zIndexOffset must dominate Leaflet's latitude-based ordering (≈ pixel y), hence the large step
      const mk = L.marker([s.lat, s.lon], { icon, zIndexOffset: (total - rank) * 1000, keyboard: false });
      mk.bindTooltip(esc(stationMarkerTitle(s, p, v)), { direction: "top", offset: [0, -10], className: "" });
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
      cb.current.onLayerReady(radarFrameKey({ product, time }));
    });
    layer.addTo(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.radar?.product, props.radar?.time]);

  // Image overlay (AROME lat/lon rasters → warped to Mercator; satellite WMS already in EPSG:3857).
  // Swap only after the new image is ready (no blank flashes); failed frames are never shown.
  const overlayUrl = props.overlay?.url;
  const overlayGroup = props.overlay?.group;
  const overlayBounds = props.overlay?.bounds.flat().join(",");
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const token = ++aromeTokenRef.current;
    if (!props.overlay) {
      aromeRef.current?.remove(); aromeRef.current = null;
      overlayGroupRef.current = null;
      return;
    }
    const [[s, w], [n, e]] = props.overlay.bounds;
    const { url: src, warp, attribution, group } = props.overlay;
    const nextGroup = group ?? "default";
    if (overlayGroupRef.current !== nextGroup) {
      aromeRef.current?.remove(); aromeRef.current = null;
    }
    overlayGroupRef.current = nextGroup;
    const controller = new AbortController();
    const current = () => !controller.signal.aborted && token === aromeTokenRef.current && mapRef.current === m && cb.current.overlay?.url === src;
    void preloadOverlayImage(warp ? mercatorImage(src, s, n) : src, controller.signal).then((image) => {
      if (!current()) return;
      // Use the already loaded image: one displayed overlay and one cancellable preload.
      const ov = preloadedImageOverlay(image, [[s, w], [n, e]], { pane: "weather", opacity: cb.current.opacity, interactive: false, attribution });
      ov.addTo(m);
      aromeRef.current?.remove();
      aromeRef.current = ov;
      cb.current.onLayerReady(`overlay:${src}`);
    }).catch(() => {
      if (current()) cb.current.onLayerReady(`overlay-error:${src}`);
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayUrl, overlayGroup, overlayBounds, props.overlay?.warp]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (!props.marineVectors) { marineRef.current?.setData(null); return; }
    if (!marineRef.current) marineRef.current = new MarineVectorLayer(m);
    marineRef.current.setData(props.marineVectors);
  }, [props.marineVectors]);

  // Evidenziatore geografico del punto di interrogazione, non interferisce
  // con i clic su idrometri o stazioni.
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    radarPointRef.current?.remove();
    radarPointRef.current = null;
    if (!props.radar || !props.radarPoint) return;
    const marker = L.circleMarker([props.radarPoint.lat, props.radarPoint.lon], {
      pane: "markerPane", radius: 6, weight: 2, color: "#ffffff",
      fillColor: "#0ea5e9", fillOpacity: 1, interactive: false,
    });
    marker.addTo(m);
    radarPointRef.current = marker;
  }, [props.radarPoint, props.radar?.product]);

  // AROME wind streamlines
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (!props.wind) { windRef.current?.destroy(); windRef.current = null; return; }
    if (!windRef.current) windRef.current = new WindFlowLayer(m, { colorFor: aromeGustColor, lineWidth: 1.65, pxPerParticle: 1250, fade: 0.88 });
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
      const color = liveWindColor(kmh), to = (s.wind_dir + 180) % 360;
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

  // Rete fiduciaria idrometrica ARPAS: layer indipendente dai filtri
  // meteorologici, valido anche quando non è selezionata la pioggia.
  useEffect(() => {
    const group = hydroRef.current;
    if (!group) return;
    group.clearLayers();
    for (const s of props.hydrometers ?? []) {
      const marker = L.circleMarker([s.lat, s.lon], {
        pane: "hydrometers", radius: 7.5, color: "#ffffff", weight: 1.8,
        fillColor: hydroColor(s), fillOpacity: 0.96,
      });
      const popup = L.popup({ maxWidth: 360 }).setContent(hydroPopupHtml(s));
      marker.bindPopup(popup);
      marker.bindTooltip(`<b>${esc(s.name)}</b><br>${hydroFmtLevel(s.value)}`, { direction: "top" });
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        void fetchHydroHistory(s.id).then((history) => {
          if (marker.isPopupOpen()) popup.setContent(hydroPopupHtml(s, history));
        }).catch(() => {
          if (marker.isPopupOpen()) popup.setContent(hydroPopupHtml(s, null, true));
        });
      });
      group.addLayer(marker);
    }
  }, [props.hydrometers]);

  useEffect(() => {
    const group = webcamsRef.current;
    if (!group) return;
    group.clearLayers();
    for (const webcam of props.webcams) {
      const icon = L.divIcon({ className: "webcam-map-icon", html: webcamLink(webcam), iconSize: [64, 44], iconAnchor: [32, 22] });
      L.marker([webcam.lat, webcam.lon], { pane: "webcams", icon, keyboard: false }).addTo(group);
    }
    return () => { group.clearLayers(); };
  }, [props.webcams]);

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

