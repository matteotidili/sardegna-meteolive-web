import { useQuery } from "@tanstack/react-query";
import type { WindGrid } from "@/lib/types";
import type { WindField } from "@/lib/windFlow";

/*
 * "Vento attuale": current 10 m wind from the Open-Meteo forecast API (public, no key, CORS open).
 * Two nested grids, both MODEL analyses of the current 15-min step (not anemometer observations):
 *  - Mediterranean 1° grid (best_match: ICON-EU / global models), refreshed hourly;
 *  - Sardinia 0.125° grid, ItaliaMeteo-ARPAE ICON-2I (~2 km), refreshed every 30 min, sampled first.
 * Open-Meteo weights multi-location calls (~0.2 per point here): ~6.6k calls/day even with the page
 * open 24 h, under the 10k/day free limit. Results are cached in localStorage across reloads.
 */
const ENDPOINT = "https://api.open-meteo.com/v1/forecast";
export const LIVE_WIND_MODEL_LABEL = "ItaliaMeteo-ARPAE ICON-2I";
const CHUNK = 370; // keeps each GET URL well under ~8 KB

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
interface GridResult { vec: number[]; time: string; points: number; fetchedAt: number }

async function fetchGrid(spec: GridSpec): Promise<GridResult> {
  const cacheKey = `liveWindCache:${spec.key}`;
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey) ?? "null") as GridResult | null;
    if (c && Date.now() - c.fetchedAt < spec.ttlMs && c.vec.length === spec.grid.width * spec.grid.height * 2) return c;
  } catch { /* ignore bad cache */ }

  const g = spec.grid, lats: number[] = [], lons: number[] = [];
  for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
    lats.push(+(g.north - y * g.step_degrees).toFixed(3));
    lons.push(+(g.west + x * g.step_degrees).toFixed(3));
  }
  const chunks: Promise<OmPoint[]>[] = [];
  for (let i = 0; i < lats.length; i += CHUNK) {
    const q = new URLSearchParams({
      latitude: lats.slice(i, i + CHUNK).join(","), longitude: lons.slice(i, i + CHUNK).join(","),
      current: "wind_speed_10m,wind_direction_10m", wind_speed_unit: "ms", timezone: "GMT",
      ...(spec.model ? { models: spec.model } : {}),
    });
    chunks.push(fetch(`${ENDPOINT}?${q}`).then(async (r) => {
      if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
      const b = (await r.json()) as OmPoint[] | OmPoint;
      return Array.isArray(b) ? b : [b];
    }));
  }
  const rows = (await Promise.all(chunks)).flat();
  if (rows.length !== lats.length) throw new Error("Griglia vento incompleta");
  const vec: number[] = new Array(rows.length * 2);
  let time = "", points = 0;
  rows.forEach((p, i) => {
    const s = p.current?.wind_speed_10m, d = p.current?.wind_direction_10m;
    if (s == null || d == null) { vec[i * 2] = NaN; vec[i * 2 + 1] = NaN; return; }
    const rad = (d * Math.PI) / 180; // meteorological "from" direction → u/v towards
    vec[i * 2] = -s * Math.sin(rad);
    vec[i * 2 + 1] = -s * Math.cos(rad);
    points++;
    if (!time && p.current?.time) time = `${p.current.time}:00Z`;
  });
  if (!points) throw new Error("Nessun valore di vento");
  const res: GridResult = { vec, time, points, fetchedAt: Date.now() };
  try { localStorage.setItem(cacheKey, JSON.stringify(res)); } catch { /* quota */ }
  return res;
}

const toField = (spec: GridSpec, r: GridResult): WindField => ({ grid: spec.grid, vec: Float32Array.from(r.vec) });

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
  return { data, isError: med.isError && sard.isError, partial: !!data && (med.isError || sard.isError) };
}
