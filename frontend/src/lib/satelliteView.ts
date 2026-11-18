import { MEDITERRANEAN_BOUNDS, satelliteUrl } from "./mapControls";

/** One stable regional raster per product/time, independent of map zoom and pan. */
export function satelliteRegionBounds(domain: [number, number][]): [number, number][] | null {
  const [[s, w], [n, e]] = MEDITERRANEAN_BOUNDS;
  const south = Math.max(s, domain[0][0]), west = Math.max(w, domain[0][1]);
  const north = Math.min(n, domain[1][0]), east = Math.min(e, domain[1][1]);
  return south < north && west < east ? [[south, west], [north, east]] : null;
}

export function regionalSatelliteUrl(wms: string, layer: string, format: string, bounds: [number, number][], time: string, desktop: boolean) {
  return satelliteUrl(wms, layer, format, bounds, time, desktop ? 2048 : 1280);
}

/** Cover the viewport with imagery: fitting the whole image would expose its edges. */
export function satelliteMinZoom(bounds: [number, number][], width: number, height: number, tileSize = 256) {
  const [[south, west], [north, east]] = bounds;
  const y = (lat: number) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI);
  const xSpan = (east - west) / 360, ySpan = y(north) - y(south);
  const zoom = Math.log2(Math.max((width + 2) / (tileSize * xSpan), (height + 2) / (tileSize * ySpan)));
  return Math.ceil(zoom * 4) / 4;
}
