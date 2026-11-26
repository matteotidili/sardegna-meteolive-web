// The key is the complete original GetMap URL, including product, time,
// projection, bounds, format and dimensions. A stack has its own opacity key.
export const isSatelliteImage = (url: string) => url.startsWith("https://view.eumetsat.int/") || url.startsWith("satellite-stack:");
type Layer = { url: string; opacity: number };
type Priority = "display" | "prefetch";
type Raster = { image: HTMLImageElement; url: string; bytes: number };
type Entry = { controller: AbortController; promise: Promise<Raster>; users: number; priority: Priority; raster?: Raster };
type Download = { entry: Entry; run: () => Promise<Raster>; resolve: (value: Raster) => void; reject: (error: unknown) => void };
const abortError = () => new DOMException("Richiesta satellitare annullata", "AbortError");

export function satelliteStackUrl(layers: Layer[]): string {
  return layers.length === 1 && layers[0].opacity === 1 ? layers[0].url : "satellite-stack:" + JSON.stringify(layers);
}

function layersOf(url: string): Layer[] | null {
  return url.startsWith("satellite-stack:") ? JSON.parse(url.slice("satellite-stack:".length)) as Layer[] : null;
}

async function decode(url: string, signal: AbortSignal, image = new Image()) {
  signal.throwIfAborted();
  const abort = () => { image.src = ""; };
  signal.addEventListener("abort", abort, { once: true });
  try {
    image.src = url;
    await image.decode();
    signal.throwIfAborted();
    return image;
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

async function fromBlob(blob: Blob, signal: AbortSignal): Promise<Raster> {
  const url = URL.createObjectURL(blob);
  try {
    const image = await decode(url, signal);
    return { image, url, bytes: blob.size + image.naturalWidth * image.naturalHeight * 4 };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export function createSatelliteCache({ maxBytes = 192 * 1024 * 1024, maxImages = 56, concurrency = 3, timeout = 20_000 } = {}) {
  const images = new Map<string, Entry>();
  const queue: Download[] = [];
  let active = 0, activePrefetch = 0, bytes = 0;
  const stats = { selections: 0, cacheHits: 0, joined: 0, requests: 0, completed: 0, errors: 0,
    cancelled: 0, prefetched: 0, responseMs: 0, peakRequests: 0, evictions: 0 };
  const snapshot = () => ({ ...stats, bytes, active, queued: queue.length });

  function drain() {
    while (active < concurrency) {
      const foreground = queue.findIndex(({ entry }) => entry.priority === "display");
      const index = foreground >= 0 ? foreground : activePrefetch < Math.max(1, concurrency - 1) ? 0 : -1;
      if (index < 0 || !queue.length) return;
      const [job] = queue.splice(index, 1);
      const signal = job.entry.controller.signal;
      if (signal.aborted) { job.reject(abortError()); continue; }
      const background = job.entry.priority === "prefetch";
      active++;
      if (background) activePrefetch++;
      stats.peakRequests = Math.max(stats.peakRequests, active);
      void job.run().then(job.resolve, job.reject).finally(() => {
        active--;
        if (background) activePrefetch--;
        drain();
      });
    }
  }

  function download(url: string, entry: Entry) {
    return new Promise<Raster>((resolve, reject) => {
      queue.push({ entry, resolve, reject, run: async () => {
        stats.requests++;
        const start = performance.now();
        const signal = AbortSignal.any([entry.controller.signal, AbortSignal.timeout(timeout)]);
        try {
          const response = await fetch(url, { signal });
          if (!response.ok) throw new Error(`Satellite HTTP ${response.status}`);
          const blob = await response.blob();
          if (!blob.type.startsWith("image/")) throw new Error("Risposta WMS priva di immagine");
          const raster = await fromBlob(blob, signal);
          stats.completed++;
          stats.responseMs += performance.now() - start;
          return raster;
        } catch (error) {
          if (entry.controller.signal.aborted) stats.cancelled++;
          else stats.errors++;
          throw error;
        }
      } });
      drain();
    });
  }

  function trim(keep?: Entry) {
    // Map order is LRU. Active users keep their images until both renderers
    // have obtained an independent decoded element.
    for (const [key, entry] of images) {
      if (bytes <= maxBytes && images.size <= maxImages) break;
      if (entry === keep || entry.users || !entry.raster) continue;
      images.delete(key);
      bytes -= entry.raster.bytes;
      URL.revokeObjectURL(entry.raster.url);
      stats.evictions++;
    }
  }

  function promote(url: string, entry: Entry) {
    if (entry.priority === "display") return;
    entry.priority = "display";
    for (const layer of layersOf(url) ?? []) {
      const child = images.get(layer.url);
      if (child) promote(layer.url, child);
    }
  }

  async function compose(layers: Layer[], entry: Entry): Promise<Raster> {
    const signal = AbortSignal.any([entry.controller.signal, AbortSignal.timeout(timeout)]);
    const rasters = await Promise.all(layers.map(({ url }) => acquire(url, signal, entry.priority)));
    signal.throwIfAborted();
    const canvas = document.createElement("canvas");
    canvas.width = rasters[0].image.naturalWidth;
    canvas.height = rasters[0].image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Composizione satellitare non disponibile");
    rasters.forEach(({ image }, i) => {
      if (image.naturalWidth !== canvas.width || image.naturalHeight !== canvas.height) {
        throw new Error("Dimensioni WMS incompatibili nello stack");
      }
      ctx.globalAlpha = layers[i].opacity;
      ctx.drawImage(image, 0, 0);
    });
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    canvas.width = canvas.height = 0;
    if (!blob) throw new Error("Composizione satellitare non disponibile");
    return fromBlob(blob, signal);
  }

  function acquire(url: string, signal: AbortSignal | undefined, priority: Priority): Promise<Raster>;
  function acquire<T>(url: string, signal: AbortSignal, priority: Priority, clone: (raster: Raster) => Promise<T>): Promise<T>;
  function acquire<T>(url: string, signal: AbortSignal | undefined, priority: Priority, clone?: (raster: Raster) => Promise<T>): Promise<T | Raster> {
    if (signal?.aborted) return Promise.reject(abortError());
    let entry = images.get(url);
    if (entry) {
      images.delete(url);
      images.set(url, entry);
      if (priority === "display") promote(url, entry);
    } else {
      const fresh = { controller: new AbortController(), users: 0, priority } as Entry;
      images.set(url, fresh);
      const layers = layersOf(url);
      fresh.promise = (layers ? compose(layers, fresh) : download(url, fresh)).then((raster) => {
        if (fresh.controller.signal.aborted) {
          URL.revokeObjectURL(raster.url);
          throw abortError();
        }
        fresh.raster = raster;
        bytes += raster.bytes;
        trim(fresh);
        return raster;
      }).catch((error) => {
        fresh.controller.abort();
        if (images.get(url) === fresh) images.delete(url);
        throw error;
      });
      entry = fresh;
    }
    const owned = entry;
    owned.users++;
    drain();
    return new Promise<T | Raster>((resolve, reject) => {
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        signal?.removeEventListener("abort", abort);
        owned.users--;
        queueMicrotask(() => {
          if (owned.users) return;
          if (owned.raster) { trim(owned); return; }
          if (images.get(url) === owned) images.delete(url);
          owned.controller.abort();
          const queued = queue.findIndex((job) => job.entry === owned);
          if (queued >= 0) {
            queue.splice(queued, 1)[0].reject(abortError());
            stats.cancelled++;
          }
        });
      };
      const abort = () => { release(); reject(abortError()); };
      signal?.addEventListener("abort", abort, { once: true });
      void owned.promise.then<T | Raster>((raster) => signal?.aborted ? Promise.reject(abortError()) : clone ? clone(raster) : raster)
        .then(resolve, reject).finally(release);
    });
  }

  return {
    snapshot,
    async prepare(url: string, signal: AbortSignal) {
      await acquire(url, signal, "display");
    },
    async prefetch(url: string, signal: AbortSignal) {
      const already = images.get(url)?.raster;
      await acquire(url, signal, "prefetch");
      if (!already && !signal.aborted) stats.prefetched++;
    },
    async display(url: string, signal: AbortSignal) {
      const entry = images.get(url);
      stats.selections++;
      if (entry?.raster) stats.cacheHits++;
      else if (entry) stats.joined++;
      // Leaflet mutates the DOM element when attaching it.
      return await acquire(url, signal, "display", ({ url: local }) => decode(local, signal));
    },
  };
}

export const satelliteCache = createSatelliteCache();
export const waitForSatelliteImage = satelliteCache.display;

/** Prioritize the direction of travel and keep one nearby frame on the other side. */
export function satelliteNeighbors(index: number, length: number, direction: number, playing: boolean, saveData = false): number[] {
  if (length < 2 || saveData) return [];
  const distances = playing ? [1, 2, -1] : [direction, -direction];
  const neighbors = distances.map((offset) => index + offset)
    .filter((i) => playing || (i >= 0 && i < length))
    .map((i) => (i + length) % length)
    .filter((i) => i !== index);
  return [...new Set(neighbors)];
}
