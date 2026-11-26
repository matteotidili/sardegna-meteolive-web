import { describe, expect, it } from "vitest";
import type { Station } from "./types";
import { interpolateAt, interpolationColor, interpolationSamples } from "./stationInterpolation";

const timestamp = new Date().toISOString();
const gauge = (id: string, lat: number, lon: number, value: number, freshness: Station["freshness"] = "fresh") => ({
  id, lat, lon, rain_48h: value, freshness, network: "cedoc", elev: null, last: timestamp, is_today: true,
  cedoc: { rain_48h: { value, freshness, observed_at: timestamp } },
}) as Station;

describe("observational interpolation", () => {
  const a = gauge("a", 39.2, 8.5, 0);
  const b = gauge("b", 39.35, 8.56, 80, "stale");
  const c = gauge("c", 39.3, 8.7, 30);
  it("includes a measured zero and the network delay window and excludes old, untimed and colocated inputs", () => {
    const untimed = { ...gauge("untimed", 39.1, 8.65, 12), cedoc: undefined, last: null };
    const samples = interpolationSamples([
      a, b, c, gauge("copy", a.lat, a.lon, 99), gauge("archived", 39.3, 8.55, 20, "historic"), untimed,
    ], "rain_48h");
    expect(samples.map(({ value }) => value)).toEqual([0, 80, 30]);
    const estimate = interpolateAt(39.3, 8.56, samples, "rain_48h")!;
    expect(estimate.count).toBe(3);
    expect(estimate.value).toBeGreaterThan(0);
    expect(estimate.value).toBeLessThan(80);
    expect(interpolationColor(estimate.value, "rain_48h")).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("leaves unsupported cells transparent", () => {
    const distant = gauge("distant", 40.6, 8.57, 80);
    expect(interpolateAt(a.lat, a.lon, interpolationSamples([a, b, distant], "rain_48h"), "rain_48h")).toBeNull();
    expect(interpolateAt(a.lat, a.lon, interpolationSamples([a, b], "rain_48h"), "rain_48h")).toBeNull();
  });
});

const base = Date.parse("2026-11-26T11:00:00Z");
const positions = [[39.2, 8.5], [39.35, 8.56], [39.3, 8.7]];
const cases = [
  ["temp", -3, 12, 100], ["tmin", -10, 2, -100], ["tmax", 20, 30, 100],
  ["rain_rate", 0, 14, 500], ["rain_today", 0, 37, 1100], ["rain_48h", 0, 84, 1600],
  ["wind_kmh", 0, 23, 300], ["gust_kmh", 10, 65, 400],
] as const;

it.each(cases)("%s validates normalized units, plausibility, time, and local support", (key, low, high, invalid) => {
  const row = (index: number, value: number, time: string) => ({
    ...gauge(String(index), positions[index % 3][0], positions[index % 3][1], value),
    network: "ecowitt", cedoc: undefined, [key]: value, freshness: "fresh", last: time, is_today: true,
  }) as Station;
  const day = "2026-11-26T10:55:00Z";
  const samples = interpolationSamples([
    row(0, low, day), row(1, high, day), row(2, high, "2026-11-26T09:00:00Z"),
    row(3, invalid, day), row(4, low, "2026-11-26T12:00:00Z"), row(5, low, "2026-11-26T07:00:00Z"),
  ], key, base);
  expect(samples).toHaveLength(3);
  const estimate = interpolateAt(39.3, 8.56, samples, key)!;
  expect(estimate.value).toBeGreaterThan(low);
  expect(estimate.value).toBeLessThanOrEqual(high);
  expect(interpolateAt(39.38, 8.58, samples, key)).toBeNull();
});

it("excludes yesterday's daily rain after Rome midnight even if a stored status is fresh", () => {
  const station = { ...gauge("midnight", 39.3, 8.6, 11), network: "ecowitt", cedoc: undefined,
    rain_today: 11, last: "2026-11-25T22:50:00Z", is_today: true };
  expect(interpolationSamples([station], "rain_today", Date.parse("2026-11-25T23:02:00Z"))).toEqual([]);
});
