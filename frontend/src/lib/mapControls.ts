/** Imperative handle to whichever map (2D Leaflet / 3D MapLibre) is currently mounted. */
export interface MapControls {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  fitMediterranean: () => void;
  fitSardinia: () => void;
}

export const mapControls: MapControls = {
  zoomIn: () => {}, zoomOut: () => {}, reset: () => {},
  fitMediterranean: () => {}, fitSardinia: () => {},
};

export const MEDITERRANEAN_BOUNDS: [[number, number], [number, number]] = [[29.5, -8], [46.5, 37.5]];

/** Leave room for desktop side panels; mobile sheets do not reserve side space. */
export function mapFitPadding(width: number, height: number) {
  const desktop = width >= 1024;
  return {
    left: desktop ? 320 : 16,
    right: desktop ? 360 : 16,
    top: Math.min(desktop ? 100 : 80, Math.round(height * 0.18)),
    bottom: Math.min(desktop ? 170 : 140, Math.round(height * 0.25)),
  };
}

export const DEFAULT_CENTER: [number, number] = [40.08, 9.03];
export const DEFAULT_ZOOM = 8;

const R = 6378137;
/** Web Mercator bbox for a lat/lon box — satellites are requested directly in EPSG:3857. */
export function mercBbox([[s, w], [n, e]]: [number, number][]): string {
  const x = (lon: number) => (R * lon * Math.PI) / 180;
  const y = (lat: number) => R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return [x(w), y(s), x(e), y(n)].join(",");
}

export function satelliteUrl(wms: string, layer: string, format: string, bounds: [number, number][], iso: string, width: number) {
  const [[s, w], [n, e]] = bounds;
  const ratio = (Math.log(Math.tan(Math.PI / 4 + (n * Math.PI) / 360)) - Math.log(Math.tan(Math.PI / 4 + (s * Math.PI) / 360))) / (((e - w) * Math.PI) / 180);
  const q = new URLSearchParams({
    service: "WMS", request: "GetMap", version: "1.1.1", layers: layer, styles: "", format,
    transparent: format === "image/png" ? "true" : "false", srs: "EPSG:3857", bbox: mercBbox(bounds),
    width: String(width), height: String(Math.round(width * ratio)), time: new Date(iso).toISOString(),
  });
  return `${wms}?${q.toString()}`;
}
