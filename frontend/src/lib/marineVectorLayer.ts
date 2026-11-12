import L from "leaflet";
import { declutterMarineVectors, projectMarineArrow } from "./marineVectors";

const EVENTS = "move zoom resize viewreset moveend zoomend";

/** A single transparent canvas; no DOM markers or continuous animation loop. */
export class MarineVectorLayer {
  private readonly map: L.Map;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private data: GeoJSON.FeatureCollection | null = null;
  private raf: number | null = null;
  private destroyed = false;

  private schedule = () => {
    if (this.destroyed || this.raf !== null) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = null;
      if (!this.destroyed) this.draw();
    });
  };

  private onUnload = () => this.destroy();

  constructor(map: L.Map) {
    this.map = map;
    const pane = map.getPane("marineVectors") ?? map.createPane("marineVectors");
    pane.style.zIndex = "365";
    pane.style.pointerEvents = "none";
    this.canvas = L.DomUtil.create("canvas", "marine-vector-canvas", pane);
    Object.assign(this.canvas.style, { position: "absolute", pointerEvents: "none" });
    this.canvas.dataset.testid = "marine-vectors-canvas";
    this.canvas.setAttribute("aria-hidden", "true");
    this.ctx = this.canvas.getContext("2d");
    map.on(EVENTS, this.schedule);
    map.on("unload", this.onUnload);
    this.schedule();
  }

  setData(data: GeoJSON.FeatureCollection | null) {
    if (this.destroyed) return;
    this.data = data;
    this.schedule();
  }

  private draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    const size = this.map.getSize();
    const width = Math.max(0, size.x), height = Math.max(0, size.y);
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    L.DomUtil.setPosition(this.canvas, this.map.containerPointToLayerPoint([0, 0]));
    const pixelWidth = Math.round(width * dpr), pixelHeight = Math.round(height * dpr);
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!width || !height || !this.data) return;
    const bounds = this.map.getBounds();
    const arrows = declutterMarineVectors(this.data,
      [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      ([lon, lat]) => {
        const point = this.map.latLngToContainerPoint([lat, lon]);
        return point.x >= -16 && point.x <= width + 16 && point.y >= -16 && point.y <= height + 16 ? point : null;
      });
    if (!arrows.length) return;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (const arrow of arrows) {
      try {
        const shape = projectMarineArrow(
          this.map.latLngToContainerPoint([arrow.tail[1], arrow.tail[0]]),
          this.map.latLngToContainerPoint([arrow.head[1], arrow.head[0]]),
        );
        if (!shape) continue;
        const [a, b] = shape.body;
        if (Math.max(a.x, b.x) < -16 || Math.min(a.x, b.x) > width + 16
          || Math.max(a.y, b.y) < -16 || Math.min(a.y, b.y) > height + 16) continue;
        for (const line of [shape.body, shape.head]) {
          ctx.moveTo(line[0].x, line[0].y);
          for (let index = 1; index < line.length; index++) ctx.lineTo(line[index].x, line[index].y);
        }
      } catch {
        // Ignore a single projection outside Leaflet's supported map domain.
      }
    }
    ctx.strokeStyle = "rgba(11,15,23,0.92)";
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.96)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.map.off(EVENTS, this.schedule);
    this.map.off("unload", this.onUnload);
    this.data = null;
    this.canvas.remove();
    this.canvas.width = 0;
    this.canvas.height = 0;
  }
}
