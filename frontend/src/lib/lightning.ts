import { useEffect, useRef, useState } from "react";
import type { Stroke } from "@/lib/types";

/*
 * Blitzortung / LightningMaps live feed (same public websocket protocol as the original app).
 * Strokes kept 60 min, filtered server-side on the subscribed bbox. Real-time network
 * detections — distinct from the archived MTG Lightning Imager satellite product.
 */
const WS_URL = "wss://live2.lightningmaps.org/";
const MAX_AGE = 60 * 60 * 1000;

export function lightningColor(ageMin: number): string {
  if (ageMin < 5) return "#fff34d";
  if (ageMin < 15) return "#ff9f1a";
  if (ageMin < 30) return "#ef5b35";
  if (ageMin < 45) return "#b53b4b";
  return "#6f3a44";
}

export type LightningStatus = "off" | "connecting" | "live" | "error";

export function useLightning(enabled: boolean, bbox: [number, number, number, number] | null) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [status, setStatus] = useState<LightningStatus>("off");
  const wsRef = useRef<WebSocket | null>(null);
  const bufRef = useRef<Map<string, Stroke>>(new Map());
  const lastIdRef = useRef<Record<string, number>>({});
  const loopsRef = useRef(0);
  const bboxRef = useRef(bbox);
  bboxRef.current = bbox;

  const subscribe = () => {
    const ws = wsRef.current, b = bboxRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !b) return;
    loopsRef.current++;
    ws.send(JSON.stringify({
      v: 24, i: loopsRef.current === 1 ? {} : { ...lastIdRef.current }, s: false, x: 0, w: 0, tx: 0, tw: 1, a: 4,
      z: 8, b: !document.hidden, h: "", l: loopsRef.current, t: 1, from_lightningmaps_org: true, p: b, r: "A",
    }));
  };

  useEffect(() => {
    if (!enabled) { setStatus("off"); return; }
    let closed = false, retry = 0, timer = 0;
    const connect = () => {
      if (closed) return;
      setStatus("connecting");
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      loopsRef.current = 0;
      ws.onopen = () => { setStatus("live"); subscribe(); };
      ws.onmessage = (e) => {
        let d: { strokes?: { time: number; lat: number; lon: number; id?: number; src?: number }[] };
        try { d = JSON.parse(e.data); } catch { return; }
        if (!Array.isArray(d?.strokes)) return;
        const now = Date.now();
        for (const s of d.strokes) {
          const time = Number(s.time), lat = Number(s.lat), lon = Number(s.lon);
          if (![time, lat, lon].every(Number.isFinite) || time < now - MAX_AGE || time > now + 60_000) continue;
          bufRef.current.set(`${s.src ?? ""}:${s.id ?? `${time}:${lat}:${lon}`}`, { time, lat, lon });
          if (s.src != null && s.id != null && (lastIdRef.current[s.src] ?? -1) < s.id) lastIdRef.current[s.src] = s.id;
        }
      };
      ws.onclose = () => {
        if (closed) return;
        setStatus("error");
        retry = Math.min(30_000, 2500 * 2 ** loopsRef.current);
        timer = window.setTimeout(connect, retry);
      };
      ws.onerror = () => ws.close();
    };
    connect();
    // render every 5 s, pruning strokes older than 60 min
    const tick = window.setInterval(() => {
      const cut = Date.now() - MAX_AGE;
      for (const [k, s] of bufRef.current) if (s.time < cut) bufRef.current.delete(k);
      setStrokes([...bufRef.current.values()]);
    }, 5000);
    return () => {
      closed = true;
      window.clearTimeout(timer);
      window.clearInterval(tick);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [enabled]);

  // re-subscribe when the viewport changes
  const key = bbox?.join(",");
  useEffect(() => { if (enabled) subscribe(); }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return { strokes, status };
}
