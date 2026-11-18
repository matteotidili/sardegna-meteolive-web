import { expect, it, vi } from "vitest";
import { satelliteImage, waitForSatelliteImage } from "./satelliteImages";

function mockDownloads() {
  const fetcher = vi.fn(async () => new Response(new Blob(["original encoded image"], { type: "image/png" })));
  vi.stubGlobal("fetch", fetcher);
  class FakeReader {
    result = "data:image/png;base64,b3JpZ2luYWw=";
    onload?: () => void;
    readAsDataURL() { queueMicrotask(() => this.onload?.()); }
  }
  vi.stubGlobal("FileReader", FakeReader);
  return fetcher;
}

it("shares one full-resolution decoded image across prefetch and display; cancelling a consumer preserves it", async () => {
  const created: FakeImage[] = [];
  class FakeImage {
    src = ""; crossOrigin = "";
    naturalWidth = 1400; naturalHeight = 1000;
    onload?: () => Promise<void>;
    decode = vi.fn().mockResolvedValue(undefined);
    constructor() { created.push(this); }
  }
  vi.stubGlobal("Image", FakeImage);
  const fetcher = mockDownloads();
  try {
    const url = "https://view.eumetsat.int/test-full-quality";
    const prefetched = satelliteImage(url);
    const cancelled = new AbortController();
    const waiter = waitForSatelliteImage(url, cancelled.signal);
    const rejection = expect(waiter).rejects.toMatchObject({ name: "AbortError" });
    cancelled.abort();
    await rejection;
    expect(created).toHaveLength(1);
    await vi.waitFor(() => expect(created[0].src).toMatch(/^data:image\/png;base64,/));
    await created[0].onload!();
    const image = await prefetched;
    expect(await satelliteImage(url)).toBe(image);
    expect(image.naturalWidth).toBe(1400);
    expect(created[0].decode).toHaveBeenCalledOnce();
    expect(created).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledOnce();
  } finally { vi.unstubAllGlobals(); }
});


it("gives concurrent display layers independent DOM elements from the shared cache", async () => {
  const created: FakeImage[] = [];
  class FakeImage {
    src = ""; crossOrigin = ""; naturalWidth = 1400; naturalHeight = 1000;
    onload?: () => Promise<void>;
    decode = vi.fn().mockResolvedValue(undefined);
    constructor() { created.push(this); }
  }
  vi.stubGlobal("Image", FakeImage);
  const fetcher = mockDownloads();
  try {
    const url = "https://view.eumetsat.int/test-zoom-isolation";
    const original = satelliteImage(url);
    await vi.waitFor(() => expect(created[0].src).toMatch(/^data:image\/png;base64,/));
    await created[0].onload!();
    const cached = await original;
    const a = await waitForSatelliteImage(url, new AbortController().signal);
    const b = await waitForSatelliteImage(url, new AbortController().signal);
    expect(a).not.toBe(cached);
    expect(b).not.toBe(a);
    expect(a.src).toBe(cached.src);
    expect(b.src).toBe(cached.src);
    expect(await satelliteImage(url)).toBe(cached);
    expect(fetcher).toHaveBeenCalledOnce();
  } finally { vi.unstubAllGlobals(); }
});

it("composes selected layers in order with independent opacity and native dimensions", async () => {
  class FakeImage {
    crossOrigin = ""; naturalWidth = 1400; naturalHeight = 1000;
    onload?: () => void; onerror?: () => void;
    private value = "";
    get src() { return this.value; }
    set src(value: string) { this.value = value; queueMicrotask(() => this.onload?.()); }
    decode = vi.fn().mockResolvedValue(undefined);
  }
  const draws: unknown[] = [];
  const context = { globalAlpha: 1, drawImage: (...args: unknown[]) => draws.push([args, context.globalAlpha]) };
  const canvas = { width: 0, height: 0, getContext: () => context, toDataURL: vi.fn(() => "data:image/png;base64,test") };
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("document", { createElement: () => canvas });
  const fetcher = mockDownloads();
  try {
    const layers = [{ url: "https://view.eumetsat.int/base-test", opacity: 1 }, { url: "https://view.eumetsat.int/top-test", opacity: 0.5 }];
    const image = await satelliteImage("satellite-stack:" + JSON.stringify(layers));
    expect(canvas.width).toBe(1400);
    expect(canvas.height).toBe(1000);
    expect(draws).toHaveLength(2);
    expect((draws[0] as unknown[])[1]).toBe(1);
    expect((draws[1] as unknown[])[1]).toBe(0.5);
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/png");
    expect(image.src).toBe("data:image/png;base64,test");
    expect(fetcher).toHaveBeenCalledTimes(2);
  } finally { vi.unstubAllGlobals(); }
});
