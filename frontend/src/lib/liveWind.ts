import { useQuery } from "@tanstack/react-query";
import type { WindGrid } from "@/lib/types";
import type { WindField } from "@/lib/windFlow";

/*
 * "Vento attuale": current 10 m wind from the Open-Meteo forecast API (public, no key, CORS open),
 * ItaliaMeteo-ARPAE ICON-2I (~2 km) on a 0.125° grid over Sardinia, fetched in ONE multi-location GET.
 * It is a MODEL analysis of the current 15-min step, not an anemometer observation.
 */
const ENDPOINT = "https://api.open-meteo.com/v1/forecast";
export const LIVE_WIND_MODEL = "italia_meteo_arpae_icon_2i";
export const LIVE_WIND_MODEL_LABEL = "ItaliaMeteo-ARPAE ICON-2I";
const STEP = 0.125;
const GRID: WindGrid = {
  west: 7.75, east: 10.25, north: 41.5, south: 38.75, step_degrees: STEP,
  width: Math.round((10.25 - 7.75) / STEP) + 1, height: Math.round((41.5 - 38.75) / STEP) + 1,
  encoding: "open-meteo-current", missing: -32768,
};

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

async function getLiveWind(): Promise<LiveWind> {
  const lats: number[] = [], lons: number[] = [];
  for (let y = 0; y < GRID.height; y++) for (let x = 0; x < GRID.width; x++) {
    lats.push(+(GRID.north - y * STEP).toFixed(3));
    lons.push(+(GRID.west + x * STEP).toFixed(3));
  }
  const q = new URLSearchParams({
    latitude: lats.join(","), longitude: lons.join(","),
    current: "wind_speed_10m,wind_direction_10m", wind_speed_unit: "ms", timezone: "GMT", models: LIVE_WIND_MODEL,
  });
  const r = await fetch(`${ENDPOINT}?${q}`);
  if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
  const body = (await r.json()) as OmPoint[] | OmPoint;
  const rows = Array.isArray(body) ? body : [body];
  if (rows.length !== lats.length) throw new Error("Griglia vento incompleta");
  const vec = new Float32Array(rows.length * 2);
  let time = "", valid = 0;
  rows.forEach((p, i) => {
    const s = p.current?.wind_speed_10m, d = p.current?.wind_direction_10m;
    if (s == null || d == null) { vec[i * 2] = NaN; vec[i * 2 + 1] = NaN; return; }
    const rad = (d * Math.PI) / 180; // meteorological "from" direction → u/v towards
    vec[i * 2] = -s * Math.sin(rad);
    vec[i * 2 + 1] = -s * Math.cos(rad);
    valid++;
    if (!time && p.current?.time) time = `${p.current.time}:00Z`;
  });
  if (!valid) throw new Error("Nessun valore di vento");
  return { field: { grid: GRID, vec }, time, points: valid };
}

export const useLiveWind = (enabled: boolean) =>
  useQuery({ queryKey: ["liveWind"], queryFn: getLiveWind, enabled, refetchInterval: 15 * 60_000, staleTime: 10 * 60_000, retry: 1 });
