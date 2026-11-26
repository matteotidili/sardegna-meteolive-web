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
