import L from "leaflet";

/*
 * Radar-DPC v2 WebP tiles. Ported from the original MeteoLive decoder:
 * some VMI/SRI tiles carry the radar value in the RED channel (black/red image)
 * and must be re-coloured; pure black = no echo → transparent. The palette is
 * QUALITATIVE (no official LUT), so no numeric dBZ / mm/h is attached to it.
 */
const TILES = "https://s3-prod-dpc-radar-webp-cache.s3.eu-south-1.amazonaws.com";
const MAX_NATIVE_Z = 7;

type Band = [number, [number, number, number]];
export const DPC_VMI_BANDS: Band[] = [
  [0, [126, 209, 246]], [0.18, [70, 173, 225]], [0.32, [47, 172, 120]], [0.45, [133, 213, 72]],
  [0.57, [246, 223, 57]], [0.7, [244, 154, 47]], [0.84, [225, 72, 45]], [1, [178, 38, 51]],
];
export const DPC_SRI_BANDS: Band[] = [
  [0, [125, 207, 246]], [0.18, [70, 176, 229]], [0.33, [54, 188, 125]], [0.47, [151, 216, 75]],
  [0.6, [246, 221, 60]], [0.73, [248, 154, 43]], [0.86, [229, 70, 60]], [1, [142, 55, 174]],
];

function paletteAt(t: number, bands: Band[]) {
  const x = Math.min(1, Math.max(0, t));
  for (let j = 1; j < bands.length; j++) {
    const lo = bands[j - 1], hi = bands[j];
    if (x <= hi[0]) {
      const k = (x - lo[0]) / (hi[0] - lo[0]);
      return lo[1].map((n, i) => Math.round(n + (hi[1][i] - n) * k));
    }
  }
  return bands[bands.length - 1][1];
}

function decode(ctx: CanvasRenderingContext2D, product: string) {
  const img = ctx.getImageData(0, 0, 256, 256), px = img.data;
  let active = 0, redLike = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    if (Math.max(r, g, b) <= 9) continue;
    active++;
    if (r > 9 && g <= Math.max(3, r * 0.12) && b <= Math.max(3, r * 0.12)) redLike++;
  }
  const encoded = active >= 12 && redLike / active > 0.7;
  const palette = product === "VMI" ? DPC_VMI_BANDS : DPC_SRI_BANDS;
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    if (a === 0) continue;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const max = Math.max(r, g, b);
    if (encoded) {
      // Nei tile codificati sul rosso anche i valori deboli sono echi validi:
      // ricolorali prima del filtro dei pixel scuri, altrimenti diventano aloni neri.
      if (r <= 12) { px[i + 3] = 0; continue; }
      const c = paletteAt((r - 12) / 243, palette);
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
      px[i + 3] = Math.round(a * Math.min(1, Math.max(0.36, (r - 12) / 65)));
    } else if (max <= 22) {
      // Il nero e le sue sfumature non sono precipitazione: lascia trasparente.
      px[i + 3] = 0;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// LRU of loaded tile images, so animation frames are reused without new HTTP requests.
const cache = new Map<string, Promise<HTMLImageElement | null>>();
function loadImage(url: string) {
  const hit = cache.get(url);
  if (hit) { cache.delete(url); cache.set(url, hit); return hit; }
  const p = new Promise<HTMLImageElement | null>((resolve) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = url;
  });
  cache.set(url, p);
  while (cache.size > 220) cache.delete(cache.keys().next().value as string);
  return p;
}

function tileUrl(product: string, iso: string, z: number, x: number, y: number) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const path = `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
  return `${TILES}/${product}/${path}/${z}/${x}/${y}/${product.toLowerCase()}.webp`;
}

function sourceTile(c: L.Coords) {
  if (c.z <= MAX_NATIVE_Z) return { z: c.z, x: c.x, y: c.y, scale: 1, ox: 0, oy: 0 };
  const scale = 2 ** (c.z - MAX_NATIVE_Z);
  return { z: MAX_NATIVE_Z, x: Math.floor(c.x / scale), y: Math.floor(c.y / scale), scale, ox: c.x % scale, oy: c.y % scale };
}

export function createDpcLayer(product: string, iso: string, opacity: number, pane: string): L.GridLayer {
  const Layer = L.GridLayer.extend({
    createTile(coords: L.Coords, done: L.DoneCallback) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const s = sourceTile(coords);
      loadImage(tileUrl(product, iso, s.z, s.x, s.y)).then((im) => {
        if (im) {
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.imageSmoothingEnabled = false;
            const sz = 256 / s.scale;
            ctx.drawImage(im, s.ox * sz, s.oy * sz, sz, sz, 0, 0, 256, 256);
            try { decode(ctx, product); } catch { /* tainted canvas: leave raw */ }
          }
        }
        done(undefined, canvas);
      });
      return canvas;
    },
  });
  const LayerCtor = Layer as unknown as new (o: L.GridLayerOptions & { attribution?: string }) => L.GridLayer;
  return new LayerCtor({
    opacity, pane, tileSize: 256, maxNativeZoom: 12, updateWhenZooming: false, keepBuffer: 1,
    bounds: L.latLngBounds([35.0, 5.0], [48.0, 20.0]),
    attribution: "Radar © Dipartimento della Protezione Civile",
  });
}

export const DPC_LEGEND = (product: string) =>
  `linear-gradient(90deg, ${(product === "VMI" ? DPC_VMI_BANDS : DPC_SRI_BANDS)
    .map(([t, c]) => `rgb(${c.join(",")}) ${t * 100}%`).join(", ")})`;

const PNG_CACHE_LIMIT = 128;
const IMAGE_TIMEOUT_MS = 15_000;
const pngCache = new Map<string, ArrayBuffer>();
interface PngJob {
  controller: AbortController;
  consumers: number;
  settled: boolean;
  promise: Promise<ArrayBuffer>;
}
const pngJobs = new Map<string, PngJob>();

const abortError = () => new DOMException("Radar tile request aborted", "AbortError");
function checkAbort(signal: AbortSignal) {
  if (signal.aborted) throw abortError();
}

/** The 3D job owns this image; individual consumers only cancel their wait. */
function loadPngImage(url: string, signal: AbortSignal): Promise<HTMLImageElement | null> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return; }
    const im = new Image();
    let finished = false;
    let timer: ReturnType<typeof setTimeout>;
    const finish = (image: HTMLImageElement | null, error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      im.onload = im.onerror = null;
      if (error) {
        im.src = "";
        reject(error);
      } else resolve(image);
    };
    const onAbort = () => finish(null, abortError());
    timer = setTimeout(() => {
      const error = new Error("Radar tile image timed out");
      error.name = "TimeoutError";
      finish(null, error);
    }, IMAGE_TIMEOUT_MS);
    signal.addEventListener("abort", onAbort, { once: true });
    im.crossOrigin = "anonymous";
    im.onload = () => finish(im);
    im.onerror = () => finish(null); // Missing DPC tiles remain transparent, but are not cached.
    im.src = url;
  });
}

async function renderPng(product: string, url: string, s: ReturnType<typeof sourceTile>, signal: AbortSignal) {
  const im = await loadPngImage(url, signal);
  checkAbort(signal);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  let cacheable = false;
  if (im) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      const sz = 256 / s.scale;
      ctx.drawImage(im, s.ox * sz, s.oy * sz, sz, sz, 0, 0, 256, 256);
      try { decode(ctx, product); } catch { /* leave raw */ }
      cacheable = true;
    }
  }
  checkAbort(signal);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  checkAbort(signal);
  const data = blob ? await blob.arrayBuffer() : new ArrayBuffer(0);
  checkAbort(signal);
  return { data, cacheable: cacheable && data.byteLength > 0 };
}

function startPngJob(key: string, product: string, url: string, s: ReturnType<typeof sourceTile>): PngJob {
  const controller = new AbortController();
  const job: PngJob = { controller, consumers: 0, settled: false, promise: Promise.resolve(new ArrayBuffer(0)) };
  job.promise = renderPng(product, url, s, controller.signal).then(({ data, cacheable }) => {
    if (cacheable) {
      pngCache.delete(key);
      pngCache.set(key, data);
      while (pngCache.size > PNG_CACHE_LIMIT) pngCache.delete(pngCache.keys().next().value as string);
    }
    return data;
  }).finally(() => {
    job.settled = true;
    if (pngJobs.get(key) === job) pngJobs.delete(key);
  });
  pngJobs.set(key, job);
  return job;
}

function consumePng(key: string, job: PngJob, signal?: AbortSignal): Promise<ArrayBuffer> {
  job.consumers++;
  return new Promise((resolve, reject) => {
    let active = true;
    const finish = (data?: ArrayBuffer, error?: unknown) => {
      if (!active) return;
      active = false;
      signal?.removeEventListener("abort", onAbort);
      job.consumers--;
      if (!job.consumers && !job.settled) {
        if (pngJobs.get(key) === job) pngJobs.delete(key);
        job.controller.abort();
      }
      if (error !== undefined) reject(error);
      else {
        // MapLibre may transfer/detach its buffer. Never hand out a cached or shared one.
        try { resolve(data!.slice(0)); } catch (error) { reject(error); }
      }
    };
    const onAbort = () => finish(undefined, abortError());
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    job.promise.then(
      (data) => signal?.aborted ? onAbort() : finish(data),
      (error) => finish(undefined, error),
    );
  });
}

/** Decoded DPC tile as PNG bytes for 3D. Missing tiles → transparent PNG; aborted jobs are discarded. */
export async function dpcTilePng(product: string, iso: string, z: number, x: number, y: number, signal?: AbortSignal): Promise<ArrayBuffer> {
  if (signal?.aborted) throw abortError();
  const s = sourceTile({ z, x, y } as L.Coords);
  const url = tileUrl(product, iso, s.z, s.x, s.y);
  const key = `${url}|${s.scale}:${s.ox}:${s.oy}`;
  const cached = pngCache.get(key);
  if (cached) {
    pngCache.delete(key);
    pngCache.set(key, cached);
    return cached.slice(0);
  }
  return consumePng(key, pngJobs.get(key) ?? startPngJob(key, product, url, s), signal);
}
