/*
 * AROME rasters are published on a regular lat/lon grid (0.01°). Leaflet shows
 * Web Mercator, so a plain imageOverlay would stretch latitudes linearly and
 * misplace fields by several km across 37.5–47.5°N. Each image is re-sampled
 * row by row into Mercator before display. Results are cached as object URLs.
 */
const cache = new Map<string, Promise<string | null>>();
const MAX = 14;

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const invMercY = (y: number) => (Math.atan(Math.sinh(y)) * 180) / Math.PI;

async function warp(url: string, south: number, north: number): Promise<string | null> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  const ok = await new Promise<boolean>((res) => {
    img.onload = () => res(true);
    img.onerror = () => res(false);
    img.src = url;
  });
  if (!ok) return null;
  const W = img.naturalWidth, H = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  const yN = mercY(north), yS = mercY(south);
  for (let j = 0; j < H; j++) {
    const lat = invMercY(yN - ((j + 0.5) / H) * (yN - yS));
    const src = Math.min(H - 1, Math.max(0, Math.floor(((north - lat) / (north - south)) * H)));
    ctx.drawImage(img, 0, src, W, 1, 0, j, W, 1);
  }
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  return blob ? URL.createObjectURL(blob) : null;
}

export function mercatorImage(url: string, south: number, north: number): Promise<string | null> {
  const hit = cache.get(url);
  if (hit) return hit;
  const p = warp(url, south, north);
  cache.set(url, p);
  while (cache.size > MAX) {
    const k = cache.keys().next().value as string;
    cache.get(k)?.then((u) => u && URL.revokeObjectURL(u));
    cache.delete(k);
  }
  return p;
}
