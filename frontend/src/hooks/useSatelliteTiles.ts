import { useEffect, useRef } from "react";
import type L from "leaflet";
import { satelliteTileLayer, type SatelliteTileProduct } from "@/lib/satelliteTiles";

type Entry = { layers: L.TileLayer.WMS[]; products: SatelliteTileProduct[]; ready: Set<L.TileLayer.WMS> };
const keyOf = (p: SatelliteTileProduct[]) => JSON.stringify(p);

/** Keep decoded geographic frames alive and warm the next frames sequentially. */
export function useSatelliteTiles(map: React.RefObject<L.Map | null>, products: SatelliteTileProduct[], upcoming: SatelliteTileProduct[][], opacity: number, frameKey: string | undefined, onReady: (key: string) => void) {
  const state = useRef({ products, upcoming, opacity, frameKey, onReady });
  state.current = { products, upcoming, opacity, frameKey, onReady };
  const cache = useRef(new Map<string, Entry>());
  const displayed = useRef<string | null>(null);
  const wake = useRef<() => void>(() => {});
  const signature = keyOf(products), futureSignature = JSON.stringify(upcoming);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    let alive = true, moving = false, timer: ReturnType<typeof setTimeout> | undefined;
    const drop = (key: string) => {
      cache.current.get(key)?.layers.forEach(l => { l.remove(); l.off(); });
      cache.current.delete(key);
    };
    const ready = (e: Entry) => e.ready.size === e.layers.length && e.layers.every(l => !l.isLoading());
    const create = (p: SatelliteTileProduct[]) => {
      const k = keyOf(p);
      const hit = cache.current.get(k);
      if (hit) return hit;
      const e: Entry = { products: p, layers: p.map(x => satelliteTileLayer(x, 0)), ready: new Set() };
      cache.current.set(k, e);
      e.layers.forEach(l => {
        l.on("loading", () => e.ready.delete(l));
        l.on("load", () => { e.ready.add(l); if (alive) wake.current(); });
        l.addTo(m);
      });
      return e;
    };
    const sync = () => {
      if (!alive) return;
      clearTimeout(timer);
      const s = state.current;
      if (!s.products.length) {
        [...cache.current.keys()].forEach(drop); displayed.current = null; return;
      }
      const activeKey = keyOf(s.products), active = create(s.products);
      if (ready(active)) {
        displayed.current = activeKey;
        if (s.frameKey) s.onReady(`overlay:${s.frameKey}`);
      }
      for (const [key, entry] of cache.current) {
        entry.layers.forEach((l, i) => l.setOpacity(key === displayed.current ? s.opacity * entry.products[i].opacity : 0));
      }
      if (moving || !ready(active)) return;
      // Bound decoded memory by viewport size, screen density and product count.
      const size = m.getSize();
      const framePixels = Math.max(1, size.x * size.y * Math.pow(Math.min(window.devicePixelRatio || 1, 2), 2) * s.products.length);
      const capacity = Math.max(3, Math.min(25, Math.floor(48_000_000 / framePixels)));
      const next = s.upcoming.slice(0, capacity - 1);
      const keep = new Set([activeKey, ...next.map(keyOf)]);
      for (const key of cache.current.keys()) if (!keep.has(key) && key !== displayed.current) drop(key);
      // One background frame at a time leaves network capacity for interaction.
      const pending = next.find(p => { const e = cache.current.get(keyOf(p)); return !e || !ready(e); });
      if (pending && !cache.current.has(keyOf(pending))) timer = setTimeout(() => create(pending), 80);
    };
    wake.current = sync;
    const start = () => {
      moving = true; clearTimeout(timer);
      const activeKey = keyOf(state.current.products);
      for (const key of cache.current.keys()) if (key !== activeKey && key !== displayed.current) drop(key);
    };
    const end = () => { moving = false; sync(); };
    m.on("movestart", start); m.on("moveend", end);
    sync();
    return () => {
      alive = false; clearTimeout(timer);
      m.off("movestart", start); m.off("moveend", end);
      [...cache.current.keys()].forEach(drop);
      displayed.current = null;
    };
  }, [map]);
  useEffect(() => wake.current(), [signature, futureSignature, opacity, frameKey]);
}
