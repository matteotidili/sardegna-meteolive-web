import { expect, it, vi } from "vitest";
import { satelliteImage, waitForSatelliteImage } from "./satelliteImages";

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
  try {
    const url = "https://view.eumetsat.int/test-full-quality";
    const prefetched = satelliteImage(url);
    const cancelled = new AbortController();
    const waiter = waitForSatelliteImage(url, cancelled.signal);
    const rejection = expect(waiter).rejects.toMatchObject({ name: "AbortError" });
    cancelled.abort();
    await rejection;
    expect(created).toHaveLength(1);
    expect(created[0].src).toBe(url);
    await created[0].onload!();
    const image = await prefetched;
    expect(await satelliteImage(url)).toBe(image);
    expect(image.naturalWidth).toBe(1400);
    expect(created[0].decode).toHaveBeenCalledOnce();
    expect(created).toHaveLength(1);
  } finally { vi.unstubAllGlobals(); }
});
