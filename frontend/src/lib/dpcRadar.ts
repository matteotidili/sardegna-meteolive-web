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
    if (Math.max(r, g, b) <= 22) continue;
    active++;
    if (r > 30 && g < Math.max(18, r * 0.2) && b < Math.max(18, r * 0.2)) redLike++;
  }
  const encoded = active >= 12 && redLike / active > 0.7;
  const palette = product === "VMI" ? DPC_VMI_BANDS : DPC_SRI_BANDS;
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    if (a === 0) continue;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max <= 9) { px[i + 3] = 0; continue; }
    if (max <= 22 && max - min <= 8) {
      px[i + 3] = Math.round((a * Math.max(0, max - 9)) / 13);
    } else if (encoded) {
      const c = paletteAt((r - 12) / 243, palette);
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
      px[i + 3] = Math.round(a * Math.min(1, Math.max(0.36, (r - 12) / 65)));
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

/** Decoded DPC tile as PNG bytes (used by the MapLibre 3D custom protocol). Missing tiles → transparent PNG. */
export async function dpcTilePng(product: string, iso: string, z: number, x: number, y: number): Promise<ArrayBuffer> {
  const s = sourceTile({ z, x, y } as L.Coords);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const im = await loadImage(tileUrl(product, iso, s.z, s.x, s.y));
  if (im) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      const sz = 256 / s.scale;
      ctx.drawImage(im, s.ox * sz, s.oy * sz, sz, sz, 0, 0, 256, 256);
      try { decode(ctx, product); } catch { /* leave raw */ }
    }
  }
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  return blob ? blob.arrayBuffer() : new ArrayBuffer(0);
}
