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
