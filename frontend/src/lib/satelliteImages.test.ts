import { afterEach, expect, it, vi } from "vitest";
import { createSatelliteCache, satelliteNeighbors, satelliteStackUrl, satelliteSandwichUrl, sandwichDay, blendSandwich, isSatelliteImage } from "./satelliteImages";

const imageUrl = (frame: number) => `https://view.eumetsat.int/test?time=${frame}&width=2048&height=1050`;
const response = () => new Response(new Blob(["original"], { type: "image/png" }));
function mockImages(width = 1400, height = 1000) {
  class FakeImage {
    src = "";
    naturalWidth = width;
    naturalHeight = height;
    decode = vi.fn().mockResolvedValue(undefined);
  }
  vi.stubGlobal("Image", FakeImage);
}

afterEach(() => vi.unstubAllGlobals());

it("shares an in-flight WMS image with display and returns independent cache-hit elements", async () => {
  mockImages();
  let complete!: (response: Response) => void;
  const fetcher = vi.fn(() => new Promise<Response>((resolve) => { complete = resolve; }));
  vi.stubGlobal("fetch", fetcher);
  const cache = createSatelliteCache(), source = imageUrl(1);
  const worker = new AbortController(), viewer = new AbortController();
  const preload = cache.prefetch(source, worker.signal);
  const cancelled = expect(preload).rejects.toMatchObject({ name: "AbortError" });
  const prepared = cache.prepare(source, viewer.signal);
  const display = cache.display(source, viewer.signal);
  worker.abort();
  await cancelled;
  complete(response());
  await prepared;
  const first = await display;
  const second = await cache.display(source, viewer.signal);
  expect(first.src).toBe(second.src);
  expect(first).not.toBe(second);
  expect(first.naturalWidth).toBe(1400);
  expect(fetcher).toHaveBeenCalledOnce();
  expect(cache.snapshot()).toMatchObject({ cacheHits: 1, joined: 1, requests: 1, cancelled: 0 });
});

it("limits raw downloads across prefetch and stack, and aborts obsolete requests", async () => {
  mockImages();
  const starts: { url: string; signal: AbortSignal; finish: () => void }[] = [];
  vi.stubGlobal("fetch", vi.fn((url: string, { signal }: { signal: AbortSignal }) =>
    new Promise<Response>((resolve, reject) => {
      starts.push({ url, signal, finish: () => resolve(response()) });
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    })));
  const cache = createSatelliteCache({ concurrency: 3 });
  const worker = new AbortController();
  const jobs = [1, 2, 3, 4].map((i) => cache.prefetch(imageUrl(i), worker.signal));
  const settled = Promise.allSettled(jobs);
  expect(starts.map((entry) => entry.url)).toEqual([imageUrl(1), imageUrl(2)]);
  const viewer = new AbortController();
  const display = cache.display(imageUrl(5), viewer.signal);
  expect(starts.map((entry) => entry.url)).toEqual([imageUrl(1), imageUrl(2), imageUrl(5)]);
  worker.abort();
  await settled;
  starts[2].finish();
  await display;
  expect(starts.slice(0, 2).every(({ signal }) => signal.aborted)).toBe(true);
  expect(starts).toHaveLength(3);
  expect(cache.snapshot()).toMatchObject({ peakRequests: 3, cancelled: 4 });
});

it("retries failed frames, evicts by decoded size and treats request dimensions independently", async () => {
  mockImages(10, 10);
  const fetcher = vi.fn().mockResolvedValueOnce(new Response("<ServiceException/>", { headers: { "Content-Type": "text/xml" } }))
    .mockImplementation(async () => response());
  vi.stubGlobal("fetch", fetcher);
  const cache = createSatelliteCache({ maxBytes: 850 });
  const signal = new AbortController().signal;
  await expect(cache.display(imageUrl(1), signal)).rejects.toThrow("priva di immagine");
  const original = await cache.display(imageUrl(1), signal);
  const resized = await cache.display(imageUrl(1).replace("2048", "1280"), signal);
  expect(resized.src).not.toBe(original.src);
  await cache.display(imageUrl(2), signal);
  expect(cache.snapshot()).toMatchObject({ errors: 1, evictions: 1 });
  expect(cache.snapshot().bytes).toBeLessThanOrEqual(850);
  await cache.display(imageUrl(1), signal);
  expect(fetcher).toHaveBeenCalledTimes(5);
});

it("composes at original dimensions, reuses raw layers between opacities and prefetches nearby frames only", async () => {
  mockImages();
  const draws: number[] = [];
  const context = { globalAlpha: 1, drawImage: () => draws.push(context.globalAlpha) };
  const canvas = { width: 0, height: 0, getContext: () => context,
    toBlob: (done: (value: Blob) => void) => {
      expect([canvas.width, canvas.height]).toEqual([1400, 1000]);
      done(new Blob(["composed"], { type: "image/png" }));
    } };
  vi.stubGlobal("document", { createElement: () => canvas });
  const fetcher = vi.fn(async () => response());
  vi.stubGlobal("fetch", fetcher);
  const cache = createSatelliteCache();
  const signal = new AbortController().signal;
  for (const opacity of [0.5, 0.25]) {
    await cache.display(satelliteStackUrl([{ url: imageUrl(1), opacity: 1 }, { url: imageUrl(2), opacity }]), signal);
  }
  expect(draws).toEqual([1, 0.5, 1, 0.25]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(satelliteNeighbors(8, 19, -1, false)).toEqual([7, 9]);
  expect(satelliteNeighbors(18, 19, 1, true)).toEqual([0, 1, 17]);
  expect(satelliteNeighbors(8, 19, -1, false, true)).toEqual([]);
});


it("selects solar daylight rather than fixed UTC hours for the sandwich", () => {
  expect(sandwichDay("2026-11-26T11:00:00Z")).toBe(true);
  expect(sandwichDay("2026-11-26T20:00:00Z")).toBe(false);
  expect(sandwichDay("2026-06-21T18:00:00Z")).toBe(true);
  expect(sandwichDay("2026-06-21T23:00:00Z")).toBe(false);
});
it("uses a distinct cache key and retains visible texture with relative IR colour", () => {
  expect(isSatelliteImage(satelliteSandwichUrl(imageUrl(1),imageUrl(2)))).toBe(true);
  expect(satelliteSandwichUrl(imageUrl(1),imageUrl(2))).not.toBe(satelliteStackUrl([{url:imageUrl(1),opacity:1},{url:imageUrl(2),opacity:1}]));
  const vis=new Uint8ClampedArray([80,80,80,255,220,220,220,255]);
  const ir=new Uint8ClampedArray([245,245,245,255,245,245,245,255]);
  blendSandwich(vis,ir);
  expect(vis[0]).toBeLessThan(vis[4]);
  expect(vis[0]).not.toEqual(vis[1]);
  expect(vis[3]).toBe(255);
});
