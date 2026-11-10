import { useQuery } from "@tanstack/react-query";
import type { WindGrid } from "@/lib/types";
import type { WindField } from "@/lib/windFlow";

/*
 * "Vento attuale": current 10 m wind from the Open-Meteo forecast API (public, no key, CORS open).
 * Two nested grids, both MODEL analyses of the current 15-min step (not anemometer observations):
 *  - Mediterranean 1° grid (best_match: ICON-EU / global models), refreshed hourly;
 *  - Sardinia 0.125° sampled field from ItaliaMeteo-ARPAE ICON-2I (~2 km native),
 *    updated when the valid forecast time changes; ICON-2I model runs every 12 hours.
 * Open-Meteo counts multiple coordinates towards its API quota. Requests are
 * serialized to prevent public-endpoint concurrency errors and cached locally.
 * On temporary errors, only a recent previously fetched field may be displayed.
 */
const ENDPOINT = "https://api.open-meteo.com/v1/forecast";
export const LIVE_WIND_MODEL_LABEL = "ItaliaMeteo-ARPAE ICON-2I";
const CHUNK = 370; // keeps each GET URL well under ~8 KB
const MAX_FALLBACK_AGE_MS = 6 * 60 * 60_000;
let apiQueue: Promise<void> = Promise.resolve();

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Open-Meteo limita a una richiesta concorrente per IP sull'API gratuita.
// La coda vale per entrambe le griglie (Mediterraneo e Sardegna).
function serializedFetch(url: string): Promise<Response> {
  const job = apiQueue.then(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        if (response.ok) return response;
        if ((response.status === 429 || response.status >= 500) && attempt < 2) {
          await wait(Math.min(6000, 1500 * 2 ** attempt));
          continue;
        }
        throw new Error(`Open-Meteo HTTP ${response.status}`);
      } catch (error) {
        if (attempt === 2 || (error instanceof Error && error.message.startsWith("Open-Meteo HTTP"))) throw error;
        await wait(900 * (attempt + 1));
      }
    }
    throw new Error("Open-Meteo non disponibile");
  });
  apiQueue = job.then(() => undefined, () => undefined);
  return job;
}

interface GridSpec { key: string; grid: WindGrid; model?: string; ttlMs: number }

const mkGrid = (west: number, east: number, south: number, north: number, step: number): WindGrid => ({
  west, east, south, north, step_degrees: step,
  width: Math.round((east - west) / step) + 1, height: Math.round((north - south) / step) + 1,
  encoding: "open-meteo-current", missing: -32768,
});

const MED: GridSpec = { key: "med-v1", grid: mkGrid(-6, 36, 30, 46, 1), ttlMs: 60 * 60_000 };
const SARD: GridSpec = { key: "sard-v1", grid: mkGrid(7.75, 10.25, 38.75, 41.5, 0.125), model: "italia_meteo_arpae_icon_2i", ttlMs: 30 * 60_000 };

export interface LiveWind { field: WindField; time: string; points: number }

/** Speed ramp in km/h (legend) — lines are coloured by the same stops. */
export const LIVE_WIND_STOPS: { max: number; color: string; label: string }[] = [
  { max: 10, color: "#7dd3fc", label: "<10" },
  { max: 20, color: "#34d399", label: "10–20" },
  { max: 30, color: "#a3e635", label: "20–30" },
  { max: 50, color: "#facc15", label: "30–50" },
  { max: 70, color: "#fb923c", label: "50–70" },
  { max: Infinity, color: "#f43f5e", label: ">70" },
];
export const liveWindColor = (ms: number) => {
  const kmh = ms * 3.6;
  return (LIVE_WIND_STOPS.find((s) => kmh < s.max) ?? LIVE_WIND_STOPS[LIVE_WIND_STOPS.length - 1]).color;
};

interface OmPoint { current?: { time?: string; wind_speed_10m?: number | null; wind_direction_10m?: number | null } }
interface GridResult { vec: number[]; time: string; points: number; fetchedAt: number; partial?: boolean; cachedFallback?: boolean }

async function fetchGrid(spec: GridSpec): Promise<GridResult> {
  const cacheKey = `liveWindCache:${spec.key}`;
  let cached: GridResult | null = null;
  try {
    const stored = JSON.parse(localStorage.getItem(cacheKey) ?? "null") as GridResult | null;
    if (stored && Array.isArray(stored.vec) && stored.vec.length === spec.grid.width * spec.grid.height * 2 &&
        Number.isFinite(stored.fetchedAt) && Date.now() >= stored.fetchedAt &&
        Date.now() - stored.fetchedAt < MAX_FALLBACK_AGE_MS && stored.points > 0) {
      cached = stored;
      if (Date.now() - stored.fetchedAt < spec.ttlMs && !stored.partial && !stored.cachedFallback)
        return { ...stored, cachedFallback: false };
    }
  } catch { /* ignore bad cache */ }

  try {
    const g = spec.grid, lats: number[] = [], lons: number[] = [];
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      lats.push(+(g.north - y * g.step_degrees).toFixed(3));
      lons.push(+(g.west + x * g.step_degrees).toFixed(3));
    }

    const chunks: Promise<{ start: number; rows: OmPoint[] | null }>[] = [];
    for (let i = 0; i < lats.length; i += CHUNK) {
      const start = i;
      const count = Math.min(CHUNK, lats.length - i);
      const q = new URLSearchParams({
        latitude: lats.slice(i, i + count).join(","), longitude: lons.slice(i, i + count).join(","),
        current: "wind_speed_10m,wind_direction_10m", wind_speed_unit: "ms", timezone: "GMT",
        forecast_days: "1",
        ...(spec.model ? { models: spec.model } : {}),
      });
      chunks.push(serializedFetch(`${ENDPOINT}?${q}`).then(async (response) => {
        const body = (await response.json()) as OmPoint[] | OmPoint;
        const rows = Array.isArray(body) ? body : [body];
        if (rows.length !== count) throw new Error("Risposta Open-Meteo incompleta");
        return { start, rows };
      }).catch((error: unknown) => {
        console.warn(`Vento Open-Meteo ${spec.key}, blocco ${start}:`, error);
        return { start, rows: null };
      }));
    }

    // Se un blocco non risponde, conserviamo gli indici degli altri punti.
    // Mai spostare i valori sulla griglia, né chiamare "attuale" il vecchio cache.
    const results = await Promise.all(chunks);
    const rows: OmPoint[] = Array.from({ length: lats.length }, () => ({}));
    let missingChunks = 0;
    for (const result of results) {
      if (!result.rows) { missingChunks++; continue; }
      for (let i = 0; i < result.rows.length; i++) rows[result.start + i] = result.rows[i];
    }
    const vec: number[] = new Array(rows.length * 2);
    let time = "", points = 0;
    rows.forEach((p, i) => {
      const speed = p.current?.wind_speed_10m, direction = p.current?.wind_direction_10m;
      if (speed == null || direction == null || !Number.isFinite(speed) || !Number.isFinite(direction)) {
        vec[i * 2] = NaN; vec[i * 2 + 1] = NaN;
        return;
      }
      const rad = (direction * Math.PI) / 180;
      vec[i * 2] = -speed * Math.sin(rad);
      vec[i * 2 + 1] = -speed * Math.cos(rad);
      points++;
      if (!time && p.current?.time) time = `${p.current.time}:00Z`;
    });
    if (!points) throw new Error("Open-Meteo: nessun vettore valido");

    const result: GridResult = { vec, time, points, fetchedAt: Date.now(), partial: missingChunks > 0 };
    // Salviamo solo campi completi: un errore transitorio non deve
    // sovrascrivere la cache precedente con grandi zone senza dati.
    if (!result.partial) {
      try { localStorage.setItem(cacheKey, JSON.stringify(result)); } catch { /* quota */ }
    }
    if (result.partial && cached && cached.points >= points) return { ...cached, cachedFallback: true };
    return result;
  } catch (error) {
    if (cached) return { ...cached, cachedFallback: true };
    throw error;
  }
}

// JSON di localStorage serializza NaN come null: preservarli come dati mancanti
// invece di convertirli a vento calmo (0 m/s) quando si ripristina la cache.
const toField = (spec: GridSpec, r: GridResult): WindField => ({
  grid: spec.grid,
  vec: Float32Array.from(r.vec, (value) => typeof value === "number" && Number.isFinite(value) ? value : NaN),
});

/** Mediterranean field with the Sardinia ICON-2I field nested inside (sampled first). */
export function useLiveWind(enabled: boolean) {
  const med = useQuery({ queryKey: ["liveWind", MED.key], queryFn: () => fetchGrid(MED), enabled, refetchInterval: MED.ttlMs, staleTime: MED.ttlMs - 60_000, retry: 1 });
  const sard = useQuery({ queryKey: ["liveWind", SARD.key], queryFn: () => fetchGrid(SARD), enabled, refetchInterval: SARD.ttlMs, staleTime: SARD.ttlMs - 60_000, retry: 1 });
  let data: LiveWind | undefined;
  if (med.data || sard.data) {
    const outer = med.data ? toField(MED, med.data) : toField(SARD, sard.data!);
    if (med.data && sard.data) outer.fine = toField(SARD, sard.data);
    data = { field: outer, time: sard.data?.time || med.data?.time || "", points: (med.data?.points ?? 0) + (sard.data?.points ?? 0) };
  }
  return {
    data,
    isError: !data && med.isError && sard.isError,
    partial: !!data && (med.isError || sard.isError || !med.data || !sard.data || !!med.data?.partial || !!sard.data?.partial),
    cachedFallback: !!(med.data?.cachedFallback || sard.data?.cachedFallback),
  };
}
