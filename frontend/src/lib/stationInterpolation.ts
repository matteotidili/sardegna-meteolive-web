import type { Station } from "@/lib/types";
import { colorFor, freshnessFor, PARAM_BY_KEY, RAIN_GRADIENT, RATE_GRADIENT, TEMP_GRADIENT, valueOf, type ParamDef, type ParamKey } from "@/lib/meteo";

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
  return stations.flatMap((station) => {
    if (!Number.isFinite(station.lat) || !Number.isFinite(station.lon)
      || station.lat < -90 || station.lat > 90 || station.lon < -180 || station.lon > 180
      || station.network === "mareografico" || station.network === "ron") return [];
    const freshness = freshnessFor(station, param);
    if (freshness !== "fresh" && freshness !== "stale") return [];
    const value = valueOf(station, param);
    if (value == null || value < low || value > high) return [];
    return [{ station, value }];
  });
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
  if (neighbors[0].distance < 0.15) return { value: neighbors[0].value, count: neighbors.length };

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
  return Number.isFinite(value) ? { value, count: neighbors.length } : null;
}

export function interpolationColor(value: number, key: InterpolationKey) {
  return colorFor(interpolationParam(key), value);
}

export function interpolationGradient(key: InterpolationKey) {
  const rainfall = key === "rain_rate" || key === "rain_today" || key === "rain_48h";
  const stops = key === "rain_rate" ? RATE_GRADIENT
    : key === "rain_today" || key === "rain_48h" ? RAIN_GRADIENT
    : key === "temp" || key === "tmin" || key === "tmax" ? TEMP_GRADIENT
    : interpolationParam(key).ramp.filter((stop) => Number.isFinite(stop.max))
      .map((stop) => ({ value: stop.max, color: stop.color }));
  const first = stops[0].value, last = stops[stops.length - 1].value;
  const position = (value: number) => rainfall
    ? Math.log1p(Math.max(0, value)) / Math.log1p(last) * 100
    : (value - first) / (last - first) * 100;
  return `linear-gradient(90deg, ${stops.map((stop) => `${stop.color} ${position(stop.value).toFixed(1)}%`).join(", ")})`;
}
