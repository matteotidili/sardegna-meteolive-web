import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preloadOverlayImage } from "./overlayImage";
import { mapFitPadding } from "./mapControls";

class TestImage {
  static images: TestImage[] = [];
  src = "";
  crossOrigin = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { TestImage.images.push(this); }
}

beforeEach(() => {
  vi.useFakeTimers();
  TestImage.images = [];
  vi.stubGlobal("Image", TestImage);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("bounded overlay image preload", () => {
  it("cancels the pending image without clearing a completed one", async () => {
    const cancelled = new AbortController();
    const pending = preloadOverlayImage("first.png", cancelled.signal).catch((error: unknown) => error);
    await Promise.resolve();
    cancelled.abort();
    await expect(pending).resolves.toMatchObject({ name: "AbortError" });
    expect(TestImage.images[0].src).toBe("");
    const completed = new AbortController();
    const loaded = preloadOverlayImage("second.png", completed.signal);
    await Promise.resolve();
    TestImage.images[1].onload!();
    expect(await loaded).toBe(TestImage.images[1]);
    completed.abort();
    expect(TestImage.images[1].src).toBe("second.png");
  });

  it("ignores projection results arriving after cancellation", async () => {
    let resolve!: (url: string) => void;
    const source = new Promise<string>((done) => { resolve = done; });
    const controller = new AbortController();
    const pending = preloadOverlayImage(source, controller.signal).catch((error: unknown) => error);
    controller.abort();
    resolve("obsolete.png");
    await expect(pending).resolves.toMatchObject({ name: "AbortError" });
    expect(TestImage.images).toHaveLength(0);
  });

  it("times out stalled projection as well as stalled image loading", async () => {
    const pending = preloadOverlayImage(new Promise(() => {}), new AbortController().signal)
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(pending).resolves.toMatchObject({ name: "TimeoutError" });
    expect(TestImage.images).toHaveLength(0);
  });

  it("leaves useful map space on desktop, mobile and short windows", () => {
    expect(mapFitPadding(1280, 800)).toEqual({ left: 320, right: 360, top: 100, bottom: 170 });
    for (const [width, height] of [[390, 844], [800, 300], [1280, 400]]) {
      const p = mapFitPadding(width, height);
      expect(p.left + p.right).toBeLessThan(width);
      expect(p.top + p.bottom).toBeLessThan(height);
      if (width < 1024) expect(p.left + p.right).toBe(32);
    }
  });
});
