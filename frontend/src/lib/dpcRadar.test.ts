import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("leaflet", () => ({ default: {} }));

const RUN = "2026-11-11T12:00:00Z";
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
let images: TestImage[];
let pendingEncodes: BlobCallback[];
let pauseEncoding: boolean;
let tile: typeof import("./dpcRadar").dpcTilePng;
const drawImage = vi.fn();
const toBlob = vi.fn();

class TestImage {
  crossOrigin = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";
  constructor() { images.push(this); }
  load() { this.onload?.(); }
  fail() { this.onerror?.(); }
}

function pngBlob() {
  return new Blob([PNG.slice().buffer], { type: "image/png" });
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  images = [];
  pendingEncodes = [];
  pauseEncoding = false;
  drawImage.mockReset();
  toBlob.mockReset();
  vi.stubGlobal("Image", TestImage);
  vi.stubGlobal("document", {
    createElement: vi.fn((tag: string) => {
      if (tag !== "canvas") throw new Error(`Unexpected element: ${tag}`);
      return {
        width: 0, height: 0,
        getContext: () => ({
          drawImage,
          getImageData: () => ({ data: new Uint8ClampedArray(256 * 256 * 4) }),
          putImageData: vi.fn(),
        }),
        toBlob: (callback: BlobCallback, type: string) => {
          toBlob(type);
          if (pauseEncoding) pendingEncodes.push(callback);
          else callback(pngBlob());
        },
      };
    }),
  });
  tile = (await import("./dpcRadar")).dpcTilePng;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("DPC PNG jobs for the 3D radar", () => {
  it("rejects an already aborted consumer without starting work", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(tile("VMI", RUN, 7, 67, 48, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(images).toHaveLength(0);
    expect(toBlob).not.toHaveBeenCalled();
  });

  it("keeps a shared job alive when only one consumer cancels", async () => {
    const firstController = new AbortController();
    const first = tile("VMI", RUN, 7, 67, 48, firstController.signal);
    const firstResult = first.catch((error: unknown) => error);
    const second = tile("VMI", RUN, 7, 67, 48);
    expect(images).toHaveLength(1);
    const url = images[0].src;
    firstController.abort();
    await expect(firstResult).resolves.toMatchObject({ name: "AbortError" });
    expect(images[0].src).toBe(url);
    images[0].load();
    expect(new Uint8Array(await second)).toEqual(PNG);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(toBlob).toHaveBeenCalledTimes(1);
  });

  it("cancels the image after the last consumer leaves and permits an immediate retry", async () => {
    const controller = new AbortController();
    const cancelled = tile("SRI", RUN, 7, 67, 48, controller.signal).catch((error: unknown) => error);
    controller.abort();
    expect(images[0].src).toBe("");
    const retried = tile("SRI", RUN, 7, 67, 48);
    expect(images).toHaveLength(2);
    images[1].load();
    await expect(cancelled).resolves.toMatchObject({ name: "AbortError" });
    expect(new Uint8Array(await retried)).toEqual(PNG);
    expect(drawImage).toHaveBeenCalledTimes(1);
  });

  it("returns independent buffers to shared consumers and survives a detached result", async () => {
    const first = tile("VMI", RUN, 7, 67, 48);
    const second = tile("VMI", RUN, 7, 67, 48);
    images[0].load();
    const [one, two] = await Promise.all([first, second]);
    expect(one).not.toBe(two);
    new Uint8Array(one)[0] = 0;
    expect(new Uint8Array(two)).toEqual(PNG);
    structuredClone(one, { transfer: [one] });
    expect(one.byteLength).toBe(0);
    const cached = await tile("VMI", RUN, 7, 67, 48);
    expect(cached).not.toBe(two);
    expect(new Uint8Array(cached)).toEqual(PNG);
    expect(images).toHaveLength(1);
    expect(toBlob).toHaveBeenCalledTimes(1);
  });

  it("keeps missing tiles transparent without caching the failed image permanently", async () => {
    const missing = tile("VMI", RUN, 7, 67, 48);
    images[0].fail();
    expect(new Uint8Array(await missing)).toEqual(PNG);
    expect(drawImage).not.toHaveBeenCalled();
    const retried = tile("VMI", RUN, 7, 67, 48);
    expect(images).toHaveLength(2);
    images[1].load();
    await retried;
    await tile("VMI", RUN, 7, 67, 48);
    expect(images).toHaveLength(2);
    expect(drawImage).toHaveBeenCalledTimes(1);
  });

  it("times out a stuck image, releases it and allows a later retry", async () => {
    const timedOut = tile("VMI", RUN, 7, 67, 48).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(timedOut).resolves.toMatchObject({ name: "TimeoutError" });
    expect(images[0].src).toBe("");
    expect(toBlob).not.toHaveBeenCalled();
    const retried = tile("VMI", RUN, 7, 67, 48);
    images[1].load();
    expect(new Uint8Array(await retried)).toEqual(PNG);
  });

  it("discards an encoding result completed after its consumer cancelled", async () => {
    pauseEncoding = true;
    const controller = new AbortController();
    const cancelled = tile("VMI", RUN, 7, 67, 48, controller.signal).catch((error: unknown) => error);
    images[0].load();
    for (let turn = 0; turn < 5 && !pendingEncodes.length; turn++) await Promise.resolve();
    expect(pendingEncodes).toHaveLength(1);
    controller.abort();
    await expect(cancelled).resolves.toMatchObject({ name: "AbortError" });
    pendingEncodes[0](pngBlob());
    pauseEncoding = false;
    const retried = tile("VMI", RUN, 7, 67, 48);
    expect(images).toHaveLength(2);
    images[1].load();
    expect(new Uint8Array(await retried)).toEqual(PNG);
  });

  it("bounds completed PNG memory with an LRU and retains recently reused tiles", async () => {
    for (let x = 0; x < 128; x++) {
      const request = tile("VMI", RUN, 7, x, 0);
      images.at(-1)!.load();
      await request;
    }
    await tile("VMI", RUN, 7, 0, 0); // Keep this first tile recent.
    const extra = tile("VMI", RUN, 7, 0, 1);
    images.at(-1)!.load();
    await extra;
    await tile("VMI", RUN, 7, 0, 0);
    expect(images).toHaveLength(129);
    const evicted = tile("VMI", RUN, 7, 1, 0);
    expect(images).toHaveLength(130);
    images.at(-1)!.load();
    await evicted;
  });
});
