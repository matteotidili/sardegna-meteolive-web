import type { Map, RasterSourceSpecification } from "maplibre-gl";
import { radarFrameErrorKey, radarFrameKey, type RadarFrame } from "./radarFrame";

interface Buffer { id: string; frame: RadarFrame }

/** Owns at most two radar sources: the displayed frame and its pending replacement. */
export class Radar3D {
  private displayed: Buffer | null = null;
  private pending: Buffer | null = null;
  private unwatch: (() => void) | null = null;
  private sequence = 0;
  private opacity = 0.75;
  private destroyed = false;
  private map: Map;
  private sourceFor: (frame: RadarFrame) => RasterSourceSpecification;
  private onReady: (key: string) => void;
  private timeoutMs: number;

  constructor(
    map: Map,
    sourceFor: (frame: RadarFrame) => RasterSourceSpecification,
    onReady: (key: string) => void,
    timeoutMs = 20000,
  ) {
    this.map = map;
    this.sourceFor = sourceFor;
    this.onReady = onReady;
    this.timeoutMs = timeoutMs;
  }

  setOpacity(opacity: number) {
    this.opacity = opacity;
    if (this.displayed) this.map.setPaintProperty(this.displayed.id, "raster-opacity", opacity);
  }

  set(frame: RadarFrame | null) {
    if (this.destroyed) return;
    if (frame && this.pending && radarFrameKey(frame) === radarFrameKey(this.pending.frame)) return;
    this.cancelPending();
    if (!frame) { this.remove(this.displayed); this.displayed = null; return; }
    if (this.displayed && radarFrameKey(frame) === radarFrameKey(this.displayed.frame)) {
      this.onReady(radarFrameKey(frame));
      return;
    }

    const next = { id: `radar-buffer-${++this.sequence}`, frame };
    this.pending = next;
    let failed = false;
    const finish = (success: boolean) => {
      if (this.pending !== next || this.destroyed) return;
      this.unwatch?.();
      this.unwatch = null;
      this.pending = null;
      if (success) {
        this.map.setPaintProperty(next.id, "raster-opacity", this.opacity);
        this.remove(this.displayed);
        this.displayed = next;
      } else this.remove(next);
      this.onReady(success ? radarFrameKey(frame) : radarFrameErrorKey(frame));
    };
    // A render follows the source-cache update. Metadata alone is too early, and
    // global "idle" may never arrive while terrain/base tiles are still loading.
    const rendered = () => {
      if (this.pending === next && this.map.isSourceLoaded(next.id)) finish(!failed);
    };
    const error = (event: { sourceId?: string }) => {
      if (event.sourceId === next.id) failed = true;
    };
    const timer = setTimeout(() => finish(false), this.timeoutMs);
    this.unwatch = () => {
      clearTimeout(timer);
      this.map.off("render", rendered);
      this.map.off("error", error);
    };
    this.map.on("render", rendered);
    this.map.on("error", error);
    try {
      this.map.addSource(next.id, this.sourceFor(frame));
      this.map.addLayer({ id: next.id, type: "raster", source: next.id,
        paint: { "raster-opacity": 0, "raster-fade-duration": 0 } }, "overlay");
    } catch {
      finish(false);
    }
  }

  destroy() {
    this.destroyed = true;
    this.cancelPending();
    this.remove(this.displayed);
    this.displayed = null;
  }

  private cancelPending() {
    this.unwatch?.();
    this.unwatch = null;
    const old = this.pending;
    this.pending = null;
    this.remove(old);
  }

  private remove(buffer: Buffer | null) {
    if (!buffer) return;
    if (this.map.getLayer(buffer.id)) this.map.removeLayer(buffer.id);
    if (this.map.getSource(buffer.id)) this.map.removeSource(buffer.id);
  }
}
