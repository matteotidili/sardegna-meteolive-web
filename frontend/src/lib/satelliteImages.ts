// Retain original decoded WMS images; never resize or recompress them.
const images = new Map<string, { promise: Promise<HTMLImageElement>; pixels: number }>();
const MAX_PIXELS = 32_000_000;
const MAX_IMAGES = 40;
export const isSatelliteImage = (url: string) => url.startsWith("https://view.eumetsat.int/") || url.startsWith("satellite-stack:");

export function satelliteStackUrl(layers: { url: string; opacity: number }[]): string {
  return layers.length === 1 && layers[0].opacity === 1 ? layers[0].url : "satellite-stack:" + JSON.stringify(layers);
}

export function satelliteImage(url: string): Promise<HTMLImageElement> {
  const hit = images.get(url);
  if (hit) { images.delete(url); images.set(url, hit); return hit.promise; }
  const image = new Image();
  image.crossOrigin = "anonymous";
  const entry = { promise: null as unknown as Promise<HTMLImageElement>, pixels: 0 };
  entry.promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const timer = setTimeout(() => { image.src = ""; reject(new Error("Satellite image timed out")); }, 30_000);
    image.onerror = () => { clearTimeout(timer); reject(new Error("Satellite image unavailable")); };
    image.onload = async () => {
      clearTimeout(timer);
      try {
        await image.decode();
        entry.pixels = image.naturalWidth * image.naturalHeight;
        let pixels = Array.from(images.values()).reduce((sum, e) => sum + e.pixels, 0);
        for (const [key, value] of images) {
          if (images.size <= MAX_IMAGES && pixels <= MAX_PIXELS) break;
          if (key !== url && value.pixels) { images.delete(key); pixels -= value.pixels; }
        }
        resolve(image);
      } catch (error) { reject(error); }
    };
    if (url.startsWith("satellite-stack:")) {
      const layers = JSON.parse(url.slice("satellite-stack:".length)) as { url: string; opacity: number }[];
      void Promise.all(layers.map((layer) => satelliteImage(layer.url))).then((loaded) => {
        const canvas = document.createElement("canvas");
        canvas.width = loaded[0].naturalWidth; canvas.height = loaded[0].naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Composizione satellitare non disponibile");
        loaded.forEach((im, i) => { ctx.globalAlpha = layers[i].opacity; ctx.drawImage(im, 0, 0); });
        image.src = canvas.toDataURL("image/png");
      }).catch(() => { clearTimeout(timer); reject(new Error("Satellite stack unavailable")); });
    } else image.src = url;
  });
  images.set(url, entry);
  void entry.promise.catch(() => { if (images.get(url) === entry) images.delete(url); });
  return entry.promise;
}

export function waitForSatelliteImage(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException("Overlay cancelled", "AbortError"));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    satelliteImage(url).then(async (cached) => {
      if (signal.aborted) return;
      // The cache owns a pristine image. Leaflet mutates DOM transforms and
      // event handlers, so every displayed layer must own its own element.
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = cached.src;
      await image.decode();
      signal.removeEventListener("abort", abort);
      if (!signal.aborted) resolve(image);
    }).catch((error) => { signal.removeEventListener("abort", abort); reject(error); });
  });
}
