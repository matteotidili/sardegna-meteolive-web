import type { Station } from "@/lib/types";
import { gradientColor, freshnessFor, observationTimeFor, PARAM_BY_KEY, RAIN_GRADIENT, RATE_GRADIENT, TEMP_GRADIENT, valueOf, type ParamDef, type ParamKey } from "@/lib/meteo";

export type InterpolationKey = "temp" | "tmin" | "tmax" | "rain_rate" | "rain_today" | "rain_48h" | "wind_kmh" | "gust_kmh";

export const INTERPOLATION_OPTIONS: { key: InterpolationKey; label: string }[] = [
  { key: "temp", label: "Temperatura attuale" },
  { key: "tmin", label: "Temperatura minima" },
  { key: "tmax", label: "Temperatura massima" },
  { key: "rain_rate", label: "Intensità di pioggia" },
  { key: "rain_today", label: "Precipitazione cumulata oggi" },
  { key: "rain_48h", label: "Precipitazione cumulata 48 h" },
  { key: "wind_kmh", label: "Vento" },
  { key: "gust_kmh", label: "Raffiche" },
];

export interface InterpolationSample {
  station: Station;
  value: number;
}

export const interpolationParam = (key: InterpolationKey): ParamDef => PARAM_BY_KEY[key as ParamKey];

const plausible: Record<InterpolationKey, [number, number]> = {
  temp: [-50, 55], tmin: [-60, 45], tmax: [-40, 60],
  rain_rate: [0, 300], rain_today: [0, 1000], rain_48h: [0, 1500],
  wind_kmh: [0, 250], gust_kmh: [0, 350],
};

/** Keep recent observations (fresh or still within their network's stale window).
 * Network visibility is a map presentation choice and must not disable analysis. */
export function interpolationSamples(stations: Station[], key: InterpolationKey): InterpolationSample[] {
  const param = interpolationParam(key), [low, high] = plausible[key];
  const byLocation = new Map<string, InterpolationSample>();
  for (const station of stations) {
    if (!Number.isFinite(station.lat) || !Number.isFinite(station.lon)
      || station.lat < -90 || station.lat > 90 || station.lon < -180 || station.lon > 180
      || station.network === "mareografico" || station.network === "ron") continue;
    const freshness = freshnessFor(station, param);
    const observed = Date.parse(observationTimeFor(station, param) ?? "");
    if (!Number.isFinite(observed) || observed > Date.now() + 360000
      || freshness !== "fresh" && freshness !== "stale") continue;
    const value = valueOf(station, param);
    if (value == null || value < low || value > high) continue;
    const location = `${station.lat.toFixed(4)}:${station.lon.toFixed(4)}`;
    const previous = byLocation.get(location);
    if (!previous || observed > Date.parse(observationTimeFor(previous.station, param) ?? "")) {
      byLocation.set(location, { station, value });
    }
  }
  return [...byLocation.values()];
}

const MAX_DISTANCE_KM: Record<InterpolationKey, number> = {
  temp: 65, tmin: 65, tmax: 65,
  rain_rate: 30, rain_today: 40, rain_48h: 45,
  wind_kmh: 65, gust_kmh: 65,
};

export function interpolationRadiusKm(key: InterpolationKey) {
  return MAX_DISTANCE_KM[key];
}

export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}

/** IDW² estimate. Three or more stations must support every displayed point. */
export function interpolateAt(lat: number, lon: number, samples: InterpolationSample[], key: InterpolationKey) {
  const radius = interpolationRadiusKm(key);
  const neighbors = samples.map((sample) => ({
    ...sample,
    distance: distanceKm(lat, lon, sample.station.lat, sample.station.lon),
  })).filter((x) => x.distance <= radius).sort((a, b) => a.distance - b.distance).slice(0, 12);
  if (neighbors.length < 3) return null;
  const stations = neighbors.map(({ station }) => station);
  if (neighbors[0].distance < 0.15) return { value: neighbors[0].value, count: stations.length, stations };

  // Use elevations as a weak terrain-coherence term where the network provides them.
  // Without a gridded DEM, this avoids mixing stations from very different altitude
  // bands too aggressively but does not claim a cell-by-cell orographic correction.
  const knownElevations = neighbors.filter((x) => Number.isFinite(x.station.elev));
  const roughElevation = knownElevations.length >= 2
    ? knownElevations.reduce((sum, x) => sum + x.station.elev! / x.distance ** 2, 0)
      / knownElevations.reduce((sum, x) => sum + 1 / x.distance ** 2, 0)
    : null;
  const weighted = neighbors.map((x) => {
    const terrainWeight = roughElevation != null && x.station.elev != null
      ? Math.exp(-Math.abs(x.station.elev - roughElevation) / 1800)
      : 1;
    return { ...x, weight: terrainWeight / x.distance ** 2 };
  });
  const total = weighted.reduce((sum, x) => sum + x.weight, 0);
  const value = weighted.reduce((sum, x) => sum + x.value * x.weight, 0) / total;
  return Number.isFinite(value) ? { value, count: stations.length, stations } : null;
}

const interpolationStops = (key: InterpolationKey) => {
  if (key === "rain_rate") return RATE_GRADIENT;
  if (key === "rain_today" || key === "rain_48h") return RAIN_GRADIENT;
  if (key === "temp" || key === "tmin" || key === "tmax") return TEMP_GRADIENT;
  const ramp = interpolationParam(key).ramp;
  return ramp.map((stop, i) => ({ value: i === 0 ? 0 : ramp[i - 1].max, color: stop.color }));
};

export function interpolationColor(value: number, key: InterpolationKey) {
  return gradientColor(value, interpolationStops(key), interpolationParam(key).rain);
}

export function interpolationScale(key: InterpolationKey) {
  const rainfall = interpolationParam(key).rain;
  const stops = interpolationStops(key);
  const first = stops[0].value, last = stops[stops.length - 1].value;
  return stops.map((stop) => ({ ...stop, position: rainfall
    ? Math.log1p(stop.value) / Math.log1p(last) * 100
    : (stop.value - first) / (last - first) * 100 }));
}
