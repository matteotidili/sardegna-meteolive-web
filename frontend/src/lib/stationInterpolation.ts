import type { Station } from "@/lib/types";
import { gradientColor, freshnessFor, observationFreshness, observationTimeFor, romeObservationDay, PARAM_BY_KEY, RAIN_GRADIENT, RATE_GRADIENT, TEMP_GRADIENT, valueOf, type ParamDef, type ParamKey } from "@/lib/meteo";

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
export function interpolationSamples(stations: Station[], key: InterpolationKey, now = Date.now()): InterpolationSample[] {
  const param = interpolationParam(key), [low, high] = plausible[key];
  const byLocation = new Map<string, InterpolationSample>();
  const today = param.dayBound ? romeObservationDay(new Date(now)) : null;
  for (const station of stations) {
    if (!Number.isFinite(station.lat) || !Number.isFinite(station.lon)
      || station.lat < -90 || station.lat > 90 || station.lon < -180 || station.lon > 180
      || station.network === "mareografico" || station.network === "ron") continue;
    const freshness = freshnessFor(station, param);
    const observed = Date.parse(observationTimeFor(station, param) ?? "");
    const current = observationFreshness(observed, station.network, now);
    if ((freshness !== "fresh" && freshness !== "stale") || (current !== "fresh" && current !== "stale")
      || (today && romeObservationDay(new Date(observed)) !== today)) continue;
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
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, q)));
}

export interface InterpolationCoverage {
  maskStatus?: "loading" | "ready" | "error";
  variable: InterpolationKey | null;
  count: number;
  latest: string | null;
  oldest: string | null;
}

export function interpolationCoverage(stations: Iterable<Station>, key: InterpolationKey): InterpolationCoverage {
  const param = interpolationParam(key);
  let count = 0, latest: string | null = null, oldest: string | null = null;
  for (const station of stations) {
    const time = observationTimeFor(station, param);
    if (!time) continue;
    count++;
    if (!latest || Date.parse(time) > Date.parse(latest)) latest = time;
    if (!oldest || Date.parse(time) < Date.parse(oldest)) oldest = time;
  }
  return { variable: key, count, latest, oldest };
}

const RAD = Math.PI / 180;
/** IDW². Every estimate is inside the local support, with at least three gauges. */
export function createStationInterpolator(samples: InterpolationSample[], key: InterpolationKey) {
  const radius = interpolationRadiusKm(key);
  const rows = new Map<number, InterpolationSample[]>();
  for (const sample of samples) {
    const row = Math.floor(sample.station.lat * 2);
    const existing = rows.get(row);
    if (existing) existing.push(sample);
    else rows.set(row, [sample]);
  }
  const latRange = radius / 110;
  return (lat: number, lon: number) => {
    const neighbors: (InterpolationSample & { distance: number })[] = [];
    for (let r = Math.floor((lat - latRange) * 2); r <= Math.floor((lat + latRange) * 2); r++) {
      for (const sample of rows.get(r) ?? []) {
        const distance = distanceKm(lat, lon, sample.station.lat, sample.station.lon);
        if (distance <= radius) neighbors.push({ ...sample, distance });
      }
    }
    if (neighbors.length < 3) return null;
    neighbors.sort((a, b) => a.distance - b.distance);
    const local = neighbors.slice(0, 12);
    const stations = local.map(({ station }) => station);
    const nearest = local[0];
    if (nearest.distance <= 0.001) return { value: nearest.value, count: stations.length, stations };

    // A point cannot be inside the local hull if all bearings lie in the
    // same open half-plane. Using local bearings also works across the antimeridian.
    const sinLat = Math.sin(lat * RAD), cosLat = Math.cos(lat * RAD);
    const angles = stations.map((station) => {
      const dLon = (station.lon - lon) * RAD, dest = station.lat * RAD;
      return Math.atan2(Math.sin(dLon) * Math.cos(dest),
        cosLat * Math.sin(dest) - sinLat * Math.cos(dest) * Math.cos(dLon));
    }).sort((a, b) => a - b);
    const largestGap = Math.max(angles[0] + 2 * Math.PI - angles[angles.length - 1],
      ...angles.slice(1).map((angle, i) => angle - angles[i]));
    if (largestGap > Math.PI + 1e-6) return null;

    // Use known elevations as a weak coherence term. No terrain correction is inferred.
    let known = 0, weightedElevation = 0, elevationWeight = 0;
    for (const { station, distance } of local) {
      if (station.elev === null || !Number.isFinite(station.elev)) continue;
      known++;
      const weight = 1 / distance ** 2;
      weightedElevation += station.elev * weight;
      elevationWeight += weight;
    }
    const roughElevation = known >= 2 ? weightedElevation / elevationWeight : null;
    let total = 0, weightedValue = 0;
    for (const { station, value, distance } of local) {
      const terrain = roughElevation !== null && station.elev !== null && Number.isFinite(station.elev)
        ? Math.exp(-Math.abs(station.elev - roughElevation) / 1800) : 1;
      const weight = terrain / distance ** 2;
      total += weight;
      weightedValue += value * weight;
    }
    const value = weightedValue / total;
    return Number.isFinite(value) ? { value, count: stations.length, stations } : null;
  };
}

export const interpolateAt = (lat: number, lon: number, samples: InterpolationSample[], key: InterpolationKey) =>
  createStationInterpolator(samples, key)(lat, lon);

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
