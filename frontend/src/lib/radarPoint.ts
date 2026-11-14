import { useQuery } from "@tanstack/react-query";
import proj4 from "proj4";

/** Dati quantitativi, non convertiti dalla palette grafica WebP. */
export interface RadarPoint {
  lat: number;
  lon: number;
}
export type DpcRadarProduct = "SRI" | "VMI";
export type RadarPointProduct = DpcRadarProduct | "OPERA";
export interface RadarNumericGrid {
  grid: { x0_m: number; y0_m: number; pixel_m: number; width: number; height: number };
  crs_proj4: string;
  encoding: { format: string; nodata_code: number; scale: number; bias: number };
  frames: { time: string; file: string }[];
}
export interface RadarNumericManifest {
  schema_version: number;
  source: string;
  source_url: string;
  license: string;
  generated_at: string;
  crs_proj4: string;
  grid: { x0_m: number; y0_m: number; pixel_m: number; width: number; height: number };
  encoding: { format: string; nodata_code: number; scale: number; bias: number };
  frames: Record<DpcRadarProduct, { time: string; file: string }[]>;
  opera?: RadarNumericGrid;
}
export interface RadarPointSample {
  time: string;
  value: number | null;
  available: boolean;
}

const RAW = "https://raw.githubusercontent.com/matteotidili/sardegna-meteolive-data/main/";
const PNG_LIMIT = 48;
const imageCache = new Map<string, Promise<ImageData>>();

export const marshallPalmer = (dbz: number) => Math.pow(Math.pow(10, dbz / 10) / 200, 1 / 1.6);

export function numericCell(valueR: number, valueG: number, scale: number, bias: number): number | null {
  const code = valueR + 256 * valueG;
  if (code === 0 || !(scale > 0)) return null;
  return (code - 1) / scale - bias;
}

export async function fetchRadarNumericManifest(): Promise<RadarNumericManifest> {
  const res = await fetch(`${RAW}data/radar_points/manifest.json?poll=${Math.floor(Date.now() / 120_000)}`,
    { cache: "no-store" });
  if (!res.ok) throw new Error(`Catalogo radar numerico HTTP ${res.status}`);
  const data = await res.json() as RadarNumericManifest;
  if (data.schema_version !== 1 || data.encoding?.format !== "PNG-RG16" ||
      !(data.grid?.width > 0 && data.grid?.height > 0) ||
      !data.crs_proj4 || !data.frames?.SRI || !data.frames?.VMI) {
    throw new Error("Manifest radar numerico non valido");
  }
  return data;
}
export function useRadarNumericManifest(enabled: boolean) {
  return useQuery({
    queryKey: ["radar-numeric-manifest"],
    queryFn: fetchRadarNumericManifest,
    enabled,
    refetchInterval: 2 * 60_000,
    staleTime: 60_000,
    refetchOnWindowFocus: "always",
    retry: 1,
  });
}

function loadNumericImage(path: string): Promise<ImageData> {
  const url = RAW + path;
  const previous = imageCache.get(url);
  if (previous) {
    imageCache.delete(url);
    imageCache.set(url, previous);
    return previous;
  }
  const request = (async () => {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) throw new Error(`Raster radar numerico HTTP ${response.status}`);
    const image = await createImageBitmap(await response.blob());
    try {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas numerico non disponibile");
      ctx.drawImage(image, 0, 0);
      return ctx.getImageData(0, 0, image.width, image.height);
    } finally {
      image.close();
    }
  })();
  imageCache.set(url, request);
  while (imageCache.size > PNG_LIMIT) imageCache.delete(imageCache.keys().next().value as string);
  request.catch(() => { if (imageCache.get(url) === request) imageCache.delete(url); });
  return request;
}

function configFor(m: RadarNumericManifest, product: RadarPointProduct): RadarNumericGrid {
  if (product === "OPERA") {
    if (!m.opera) throw new Error("Archivio numerico OPERA RATE non disponibile");
    return m.opera;
  }
  return { grid: m.grid, crs_proj4: m.crs_proj4, encoding: m.encoding, frames: m.frames[product] };
}

/** Pixel nativo: proiezione WGS84 nel CRS del prodotto, senza interpolazione. */
export function radarCell(
  point: RadarPoint, m: RadarNumericManifest, product: RadarPointProduct = "SRI",
): [number, number] | null {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return null;
  const config = configFor(m, product);
  const [x, y] = proj4("EPSG:4326", config.crs_proj4, [point.lon, point.lat]);
  const { x0_m, y0_m, pixel_m, width, height } = config.grid;
  const col = Math.floor((x - x0_m) / pixel_m), row = Math.floor((y0_m - y) / pixel_m);
  if (row < 0 || row >= height || col < 0 || col >= width) return null;
  return [row, col];
}
export async function sampleRadarPoint(
  m: RadarNumericManifest, file: string, point: RadarPoint, product: RadarPointProduct = "SRI",
): Promise<number | null> {
  const config = configFor(m, product);
  const cell = radarCell(point, m, product);
  if (!cell) return null;
  const image = await loadNumericImage(file);
  if (image.width !== config.grid.width || image.height !== config.grid.height) {
    throw new Error("Geometria raster radar non coerente");
  }
  const index = (cell[0] * image.width + cell[1]) * 4;
  const value = numericCell(image.data[index], image.data[index + 1], config.encoding.scale, config.encoding.bias);
  // NoData is unknown, including SRI. Only an encoded zero means 0 mm/h.
  return value;
}

/** Select the exact product timestamp; never substitute an older rain rate. */
export function selectedRadarSample(
  samples: RadarPointSample[], time: string, product: RadarPointProduct,
): RadarPointSample | undefined {
  const step = (product === "OPERA" ? 15 : 5) * 60_000;
  const requested = Date.parse(time);
  if (!Number.isFinite(requested)) return undefined;
  const timestamp = Math.floor(requested / step) * step;
  return samples.find((sample) => Date.parse(sample.time) === timestamp);
}

export async function radarSeries(
  manifest: RadarNumericManifest, product: RadarPointProduct,
  endTime: string, point: RadarPoint, hours: 1 | 2 | 3,
): Promise<RadarPointSample[]> {
  const requestedEnd = Date.parse(endTime), step = (product === "OPERA" ? 15 : 5) * 60_000;
  if (!Number.isFinite(requestedEnd)) return [];
  // Allinea la serie alla cadenza reale del prodotto: il fotogramma animato
  // può avere un orario che non coincide con quello dell'archivio OPERA.
  const end = Math.floor(requestedEnd / step) * step;
  const config = configFor(manifest, product);
  const lookup = new Map(config.frames.map((f) => [Date.parse(f.time), f.file]));
  const count = hours * 60 * 60_000 / step;
  const times = Array.from({ length: count + 1 }, (_, i) => end - (count - i) * step);
  // Concorrenza limitata. Non interroghiamo un raster non pubblicato, né
  // riempiamo i buchi con zero o con frame adiacenti.
  const out: RadarPointSample[] = new Array(times.length);
  let next = 0;
  const worker = async () => {
    while (next < times.length) {
      const ix = next++, timestamp = times[ix], file = lookup.get(timestamp);
      const time = new Date(timestamp).toISOString();
      if (!file) { out[ix] = { time, value: null, available: false }; continue; }
      try {
        out[ix] = { time, value: await sampleRadarPoint(manifest, file, point, product), available: true };
      } catch (error) {
        out[ix] = { time, value: null, available: false };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, times.length) }, worker));
  return out;
}
export function useRadarPointSeries(
  manifest: RadarNumericManifest | undefined,
  product: RadarPointProduct | null,
  endTime: string | undefined, point: RadarPoint | null, hours: 1 | 2 | 3,
) {
  const enabled = !!manifest && (product === "VMI" || product === "SRI" || (product === "OPERA" && !!manifest.opera)) && !!endTime && !!point;
  return useQuery({
    queryKey: ["radar-point", manifest?.generated_at, product, endTime, point?.lat, point?.lon, hours],
    queryFn: () => radarSeries(manifest!, product as RadarPointProduct, endTime!, point!, hours),
    enabled,
    staleTime: Infinity,
    retry: false,
  });
}
