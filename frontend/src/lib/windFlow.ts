import L from "leaflet";
import type { WindGrid } from "@/lib/types";

/*
 * AROME HD 10 m wind streamlines (port of scripts/arome-wind-flow.js).
 * U/V in m/s on a 0.1° sub-sampled grid. The animation speed is ILLUSTRATIVE:
 * it is not a real-time simulation of atmospheric transport.
 */
export interface WindField { grid: WindGrid; vec: Float32Array }

export function decodeWind(buf: ArrayBuffer, grid: WindGrid): WindField {
  if (grid.encoding !== "interleaved_signed_int16_little_endian" || buf.byteLength !== grid.width * grid.height * 4) {
    throw new Error("Griglia vettoriale AROME non valida");
  }
  const view = new DataView(buf), vec = new Float32Array(grid.width * grid.height * 2);
  for (let k = 0; k < vec.length; k++) {
    const v = view.getInt16(k * 2, true);
    vec[k] = v === grid.missing ? NaN : v * 0.01;
  }
  return { grid, vec };
}

export function sampleWind(f: WindField, lon: number, lat: number): [number, number] | null {
  const g = f.grid;
  if (lon < g.west || lon > g.east || lat < g.south || lat > g.north) return null;
  const gx = (lon - g.west) / g.step_degrees, gy = (g.north - lat) / g.step_degrees;
  const x = Math.min(g.width - 2, Math.floor(gx)), y = Math.min(g.height - 2, Math.floor(gy));
  const tx = gx - x, ty = gy - y, W = g.width, v = f.vec;
  const c = [(y * W + x) * 2, (y * W + x + 1) * 2, ((y + 1) * W + x) * 2, ((y + 1) * W + x + 1) * 2];
  const w = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
  let u = 0, vv = 0;
  for (let n = 0; n < 4; n++) {
    if (!Number.isFinite(v[c[n]]) || !Number.isFinite(v[c[n] + 1])) return null;
    u += v[c[n]] * w[n]; vv += v[c[n] + 1] * w[n];
  }
  return [u, vv];
}

interface Particle { lon: number; lat: number; age: number; life: number }

export interface WindFlowOptions {
  /** Leaflet pane name; each flow layer needs its own canvas. */
  pane?: string;
  zIndex?: number;
  testid?: string;
  /** Per-particle colour from wind speed (m/s); white streamlines when omitted. */
  colorFor?: (speedMs: number) => string;
}

export class WindFlowLayer {
  private map: L.Map;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private field: WindField | null = null;
  private particles: (Particle | null)[] = [];
  private raf = 0;
  private last = 0;
  private w = 0;
  private h = 0;
  private onResize = () => this.resize();
  private onPause = () => this.stop();
  private onResume = () => { this.resize(); this.start(); };
  private onVis = () => (document.hidden ? this.stop() : this.start());

  private colorFor: ((ms: number) => string) | undefined;

  constructor(map: L.Map, opts: WindFlowOptions = {}) {
    this.map = map;
    this.colorFor = opts.colorFor;
    const name = opts.pane ?? "aromeFlow";
    const pane = map.getPane(name) ?? map.createPane(name);
    pane.style.zIndex = String(opts.zIndex ?? 370);
    pane.style.pointerEvents = "none";
    this.canvas = L.DomUtil.create("canvas", "", pane);
    Object.assign(this.canvas.style, { position: "absolute", pointerEvents: "none", opacity: "0.92" });
    this.canvas.dataset.testid = opts.testid ?? "wind-flow-canvas";
    this.ctx = this.canvas.getContext("2d")!;
    map.on("resize moveend zoomend", this.onResize);
    map.on("movestart zoomstart", this.onPause);
    map.on("moveend zoomend", this.onResume);
    document.addEventListener("visibilitychange", this.onVis);
    this.resize();
  }

  setField(f: WindField | null) {
    this.field = f;
    this.particles = [];
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.stop();
    this.start();
  }

  private resize() {
    const s = this.map.getSize();
    L.DomUtil.setPosition(this.canvas, this.map.containerPointToLayerPoint([0, 0]));
    if (s.x === this.w && s.y === this.h) return;
    this.w = s.x; this.h = s.y;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(s.x * dpr); this.canvas.height = Math.round(s.y * dpr);
    this.canvas.style.width = `${s.x}px`; this.canvas.style.height = `${s.y}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.particles = [];
  }

  private spawn(): Particle | null {
    if (!this.field) return null;
    const g = this.field.grid, b = this.map.getBounds();
    const west = Math.max(g.west, b.getWest()), east = Math.min(g.east, b.getEast());
    const south = Math.max(g.south, b.getSouth()), north = Math.min(g.north, b.getNorth());
    if (east <= west || north <= south) return null;
    for (let n = 0; n < 20; n++) {
      const lon = west + Math.random() * (east - west), lat = south + Math.random() * (north - south);
      const uv = sampleWind(this.field, lon, lat);
      if (uv && Math.hypot(uv[0], uv[1]) > 0.5) return { lon, lat, age: 0, life: 42 + Math.random() * 68 };
    }
    return null;
  }

  private start() {
    if (!this.field || document.hidden || this.raf) return;
    this.resize();
    this.last = 0;
    this.raf = requestAnimationFrame((t) => this.draw(t));
  }

  private stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private draw(t: number) {
    this.raf = 0;
    if (!this.field || document.hidden) return;
    this.raf = requestAnimationFrame((tt) => this.draw(tt));
    if (this.last && t - this.last < 32) return;
    this.last = t;
    const ctx = this.ctx, f = this.field;
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = "rgba(0,0,0,0.915)";
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = "source-over";
    ctx.lineWidth = 1.25; ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(247,252,255,.8)";
    const byColor = this.colorFor ? new Map<string, number[]>() : null;
    ctx.shadowColor = "rgba(0,16,27,.8)"; ctx.shadowBlur = 1.6;
    const target = window.innerWidth <= 800 ? 130 : 330;
    if (this.particles.length > target) this.particles.length = target;
    while (this.particles.length < target) { const p = this.spawn(); if (!p) break; this.particles.push(p); }
    for (let n = 0; n < this.particles.length; n++) {
      const p = this.particles[n];
      if (!p) { this.particles[n] = this.spawn(); continue; }
      const uv = sampleWind(f, p.lon, p.lat);
      if (!uv || Math.hypot(uv[0], uv[1]) < 0.5 || p.age >= p.life) { this.particles[n] = this.spawn(); continue; }
      const a = this.map.latLngToContainerPoint([p.lat, p.lon]);
      let dLat = (uv[1] * 500) / 111320;
      let dLon = (uv[0] * 500) / (111320 * Math.max(0.2, Math.cos((p.lat * Math.PI) / 180)));
      const e = this.map.latLngToContainerPoint([p.lat + dLat, p.lon + dLon]);
      const k = Math.min(1, 3.2 / Math.max(0.01, Math.hypot(e.x - a.x, e.y - a.y)));
      dLat *= k; dLon *= k;
      const lat = p.lat + dLat, lon = p.lon + dLon;
      const b = this.map.latLngToContainerPoint([lat, lon]);
      if (a.x >= -4 && a.x <= this.w + 4 && a.y >= -4 && a.y <= this.h + 4) {
        if (byColor) {
          const c = this.colorFor!(Math.hypot(uv[0], uv[1]));
          let seg = byColor.get(c);
          if (!seg) byColor.set(c, (seg = []));
          seg.push(a.x, a.y, b.x, b.y);
        } else { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      }
      p.lat = lat; p.lon = lon; p.age += 1;
    }
    if (byColor) {
      ctx.lineWidth = 1.6;
      for (const [c, seg] of byColor) {
        ctx.strokeStyle = c;
        ctx.beginPath();
        for (let i = 0; i < seg.length; i += 4) { ctx.moveTo(seg[i], seg[i + 1]); ctx.lineTo(seg[i + 2], seg[i + 3]); }
        ctx.stroke();
      }
    }
    ctx.shadowBlur = 0;
  }

  destroy() {
    this.stop();
    this.map.off("resize moveend zoomend", this.onResize);
    this.map.off("movestart zoomstart", this.onPause);
    this.map.off("moveend zoomend", this.onResume);
    document.removeEventListener("visibilitychange", this.onVis);
    this.canvas.remove();
  }
}
