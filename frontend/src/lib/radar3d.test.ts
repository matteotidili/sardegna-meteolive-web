import { afterEach, describe, expect, it, vi } from "vitest";
import type { Map as GLMap } from "maplibre-gl";
import { Radar3D } from "./radar3d";
import { radarFrameErrorKey, radarFrameKey, type RadarFrame } from "./radarFrame";

class TestMap {
  sources = new Map<string, { loaded: boolean }>();
  layers = new Map<string, { opacity: number }>();
  listeners = new Map<string, Set<(event: { sourceId?: string }) => void>>();
  addSource(id: string) {
    if (this.sources.has(id)) throw new Error("Duplicate source");
    this.sources.set(id, { loaded: false });
  }
  addLayer(layer: { id: string; paint: { "raster-opacity": number } }) {
    this.layers.set(layer.id, { opacity: layer.paint["raster-opacity"] });
  }
  getSource(id: string) { return this.sources.get(id); }
  getLayer(id: string) { return this.layers.get(id); }
  removeLayer(id: string) { this.layers.delete(id); }
  removeSource(id: string) {
    if (this.layers.has(id)) throw new Error("Source still in use");
    this.sources.delete(id);
  }
  setPaintProperty(id: string, _property: string, opacity: number) { this.layers.get(id)!.opacity = opacity; }
  isSourceLoaded(id: string) { return this.sources.get(id)?.loaded ?? false; }
  on(event: string, fn: (event: { sourceId?: string }) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }
  off(event: string, fn: (event: { sourceId?: string }) => void) { this.listeners.get(event)?.delete(fn); }
  emit(event: string, data: { sourceId?: string } = {}) { [...this.listeners.get(event) ?? []].forEach((fn) => fn(data)); }
  newest() { return [...this.sources.keys()].at(-1)!; }
  load(id = this.newest()) { this.sources.get(id)!.loaded = true; this.emit("render"); }
  listenerCount() { return [...this.listeners.values()].reduce((n, set) => n + set.size, 0); }
}

const frame = (i: number, product = "VMI"): RadarFrame => ({ product, time: new Date(1700000000000 + i * 300000).toISOString() });
function setup() {
  const map = new TestMap(), ready = vi.fn();
  const radar = new Radar3D(map as unknown as GLMap, () => ({ type: "raster", tiles: ["test://{z}/{x}/{y}"] }), ready, 1000);
  return { map, ready, radar };
}
afterEach(() => vi.useRealTimers());

describe("3D radar frame ownership", () => {
  it("keeps at most two sources during scrubbing and removes every superseded frame", () => {
    const { map, radar, ready } = setup();
    radar.set(frame(0)); map.load();
    for (let i = 1; i <= 1000; i++) {
      radar.set(frame(i % 36));
      expect(map.sources.size).toBeLessThanOrEqual(2);
      expect(map.layers.size).toBe(map.sources.size);
      expect(map.listenerCount()).toBeLessThanOrEqual(2);
      if (i % 7 === 0) map.load();
    }
    map.load();
    expect(ready).toHaveBeenLastCalledWith(radarFrameKey(frame(1000 % 36)));
    expect(map.sources.size).toBe(1);
    expect(map.listenerCount()).toBe(0);
    radar.destroy();
    expect(map.sources.size).toBe(0);
    expect(map.layers.size).toBe(0);
  });

  it("waits for radar tiles instead of metadata or global map idle", () => {
    const { map, radar, ready } = setup();
    radar.set(frame(1));
    map.emit("sourcedata", { sourceId: map.newest() });
    map.emit("idle"); map.emit("render");
    expect(ready).not.toHaveBeenCalled();
    map.load(); // no global idle event: unrelated terrain can still be loading
    expect(ready).toHaveBeenCalledExactlyOnceWith(radarFrameKey(frame(1)));
    radar.destroy();
  });

  it("cancels pending when returning to displayed, without a late swap", () => {
    const { map, radar, ready } = setup();
    radar.set(frame(1)); map.load();
    const displayed = map.newest();
    radar.set(frame(2));
    radar.set(frame(1));
    expect([...map.sources.keys()]).toEqual([displayed]);
    expect(ready).toHaveBeenLastCalledWith(radarFrameKey(frame(1)));
    expect(map.listenerCount()).toBe(0);
    map.emit("render");
    expect([...map.sources.keys()]).toEqual([displayed]);
    radar.destroy();
  });

  it("changes only displayed opacity while its replacement is loading", () => {
    const { map, radar, ready } = setup();
    radar.set(frame(1)); map.load();
    const displayed = map.newest();
    radar.set(frame(2));
    radar.setOpacity(0.4);
    expect(map.layers.get(displayed)?.opacity).toBe(0.4);
    expect(map.layers.get(map.newest())?.opacity).toBe(0);
    map.load();
    expect(ready).toHaveBeenLastCalledWith(radarFrameKey(frame(2)));
    expect(map.layers.get(map.newest())?.opacity).toBe(0.4);
    radar.destroy();
  });

  it("never displays the previous product beneath a different legend after a failed switch", () => {
    vi.useFakeTimers();
    const { map, radar, ready } = setup();
    radar.set(frame(1)); map.load();
    const vmi = map.newest();
    radar.set(frame(1, "SRI"));
    expect(map.sources.has(vmi)).toBe(false);
    expect(map.sources.size).toBe(1);
    expect(map.layers.get(map.newest())?.opacity).toBe(0);
    expect(radarFrameKey(frame(1))).not.toBe(radarFrameKey(frame(1, "SRI")));
    vi.advanceTimersByTime(1000);
    expect(ready).toHaveBeenLastCalledWith(radarFrameErrorKey(frame(1, "SRI")));
    expect(map.sources.size).toBe(0);
    expect(map.listenerCount()).toBe(0);
    radar.destroy();
  });

  it("retains the last successful frame on source error or timeout and cleans watchers", () => {
    vi.useFakeTimers();
    const { map, radar, ready } = setup();
    radar.set(frame(1)); map.load();
    const displayed = map.newest();
    radar.set(frame(2));
    map.emit("error", { sourceId: "terrain" }); map.load();
    expect(ready).toHaveBeenLastCalledWith(radarFrameKey(frame(2)));
    const current = map.newest();
    expect(map.sources.has(displayed)).toBe(false);
    radar.set(frame(3));
    map.emit("error", { sourceId: map.newest() }); map.load();
    expect(ready).toHaveBeenLastCalledWith(radarFrameErrorKey(frame(3)));
    expect([...map.sources.keys()]).toEqual([current]);
    radar.set(frame(4)); vi.advanceTimersByTime(1000);
    expect(ready).toHaveBeenLastCalledWith(radarFrameErrorKey(frame(4)));
    expect([...map.sources.keys()]).toEqual([current]);
    expect(map.listenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    radar.destroy();
  });

  it("clears pending and displayed on disable/unmount and ignores stale completion", () => {
    vi.useFakeTimers();
    const { map, radar, ready } = setup();
    radar.set(frame(1)); map.load();
    radar.set(frame(2)); radar.set(null);
    expect(map.sources.size).toBe(0);
    expect(map.listenerCount()).toBe(0);
    radar.set(frame(3)); radar.destroy();
    map.emit("render"); vi.runAllTimers(); radar.set(frame(4));
    expect(ready).toHaveBeenCalledTimes(1);
    expect(map.sources.size).toBe(0);
    expect(map.listenerCount()).toBe(0);
  });
});
