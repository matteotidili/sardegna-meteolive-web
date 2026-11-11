import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("leaflet", () => ({ default: {} }));

import { getArome, getWindMeta } from "./clientData";

const oldRun = "2026-11-10T18:00:00Z";
const newRun = "2026-11-11T03:00:00Z";

function manifests(run: string) {
  return {
    forecast: {
      run_time: run,
      forecast_horizon_hours: 1,
      bounds: [[37, -12], [47, 16]],
      product_path_template: "data/arome/products/{parameter}/h{lead:02d}.webp",
      frames: [{ lead_hours: 1, valid_time: new Date(Date.parse(run) + 3600000).toISOString(), image: "data/arome/precip_h01.png" }],
    },
    wind: {
      run_time: run,
      grid: { west: -12, east: 16, north: 47, south: 37, step_degrees: 0.1, width: 281, height: 101, encoding: "interleaved_signed_int16_little_endian", missing: -32768 },
      frames: [{ lead_hours: 1, valid_time: new Date(Date.parse(run) + 3600000).toISOString(), file: "data/arome/wind_vectors/h01.bin" }],
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("AROME model-run changes", () => {
  it("reloads raster and wind assets when filenames are reused for a new run", async () => {
    let run = oldRun;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const snapshot = manifests(run);
      return new Response(JSON.stringify(url.includes("wind_vectors.json") ? snapshot.wind : snapshot.forecast));
    }));

    const rasterBefore = await getArome();
    const windBefore = await getWindMeta();
    run = newRun;
    const rasterAfter = await getArome();
    const windAfter = await getWindMeta();

    expect(rasterAfter.run_time).toBe(windAfter.run_time);
    expect(rasterAfter.frames[0].precip_url).not.toBe(rasterBefore.frames[0].precip_url);
    expect(rasterAfter.product_url_template).not.toBe(rasterBefore.product_url_template);
    expect(windAfter.frames[0].url).not.toBe(windBefore.frames[0].url);
    for (const url of [rasterAfter.frames[0].precip_url, rasterAfter.product_url_template, windAfter.frames[0].url]) {
      expect(new URL(url).searchParams.get("run")).toBe(newRun);
    }
    expect(rasterAfter.product_url_template).toContain("{parameter}/h{lead}.webp");
    expect(windAfter.grid).toEqual(windBefore.grid);
    expect(windAfter.frames[0].valid_time).toBe("2026-11-11T04:00:00.000Z");
  });

  it("rejects wind metadata with an invalid run time", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      ...manifests(oldRun).wind, run_time: "invalid",
    }))));
    await expect(getWindMeta()).rejects.toThrow("Corsa dei vettori vento AROME non valida");
  });
});
