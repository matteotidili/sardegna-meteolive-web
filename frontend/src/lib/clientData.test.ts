import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("leaflet", () => ({ default: {} }));

import { getArome, getSatellite, getStations, getWindMeta } from "./clientData";
import { PARAM_BY_KEY, stationParameterLabel } from "./meteo";

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

it("opens the IR archive from published catalogue times with no image probes", async () => {
  const latest = "2026-11-18T12:00:00Z";
  const dimension = {
    textContent: `2024-09-23T00:00:00Z/${latest}/PT10M`,
    getAttribute: (key: string) => key === "name" ? "time" : key === "default" ? latest : null,
  };
  const value = (localName: string, textContent: string) => ({ localName, textContent });
  const layer = { parentElement: null, children: [value("Name", "ir105_hrfi"), {
    localName: "EX_GeographicBoundingBox", children: [value("westBoundLongitude", "-80"), value("eastBoundLongitude", "80"), value("southBoundLatitude", "-80"), value("northBoundLatitude", "80")],
  }] };
  vi.stubGlobal("DOMParser", class {
    parseFromString() { return { getElementsByTagNameNS: (_ns: string, tag: string) => tag === "Layer" ? [layer] : [dimension] }; }
  });
  const fetcher = vi.fn(async (_url: string) => new Response("<catalogue/>"));
  vi.stubGlobal("fetch", fetcher);
  const catalog = await getSatellite("ir105");
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0][0]).toContain("/mtg_fd/ir105_hrfi/ows?service=WMS&request=GetCapabilities");
  expect(catalog.frames).toHaveLength(19);
  expect(catalog.frames[0]).toBe("2026-11-18T09:00:00.000Z");
  expect(catalog.frames.at(-1)).toBe("2026-11-18T12:00:00.000Z");
});

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

describe("CEDOC station measurements", () => {
  const source = "https://www.sardegnacedoc.it/idrografico";
  const at = new Date("2026-11-26T00:20:00Z");
  const catalog = (station_id: string) => ({ station_id, name: `Sito ${station_id}`, lat: 39.30139, lon: 8.56361 });
  const measurement = (value: number, observed_at: string, retained = false) =>
    ({ value, observed_at, fetched_at: "2026-11-26T00:15:00Z", unit: "mm", status: "fresh", retained, source_url: `${source}/stazione/451800` });
  const report = (stations: object[], extra: object = {}) => ({ stations, generated_at: "2026-11-26T00:16:00Z", ...extra });

  afterEach(() => vi.useRealTimers());

  it("merges live, historical and catalog rows by code, with separate times for each variable", async () => {
    vi.useFakeTimers({ now: at });
    let live: object | null = report([
      { ...catalog("451800"), name: "Iglesias RF", sensor_id: "35523", variables: {
        rain_48h: measurement(53.8, "2026-11-25T22:50:00Z"),
      } },
    ], { status: "degraded", coverage: { censused: 3, unreachable: 1 } });
    const archived = report([
      { ...catalog("451800"), sensor_id: "35523", variables: {
        rain_today: measurement(7, "2026-11-25T22:45:00Z"),
        rain_48h: measurement(46.8, "2026-11-25T22:45:00Z"),
      } },
      { ...catalog("426400"), last: "2026-11-24T09:35:00Z", rain_48h: 0, source_url: `${source}/sensore/426400/33147/20207` },
    ]);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("/cedoc.json?")) return live === null ? new Response("", { status: 503 }) : Response.json(live);
      if (url.includes("/cedoc_last_valid.json?")) return Response.json(archived);
      if (url.includes("/cedoc_sites.json?")) return Response.json(report([catalog("451800"), catalog("426400"), catalog("505900")]));
      return Response.json({ stations: [] });
    }));

    const result = await getStations();
    const iglesias = result.stations.find((s) => s.id === "cedoc:451800")!;
    expect(iglesias).toMatchObject({
      name: "Iglesias RF", rain_48h: 53.8, rain_today: 7,
      cedoc: {
        rain_48h: { value: 53.8, freshness: "fresh", retained: false },
        rain_today: { value: 7, local_day: "2026-11-25", observed_at: "2026-11-25T22:45:00Z", freshness: "historic", retained: true },
      },
    });
    expect(stationParameterLabel(iglesias, PARAM_BY_KEY.rain_today)).toBe("Pioggia del 25/11/2026");
    expect(result.stations.find((s) => s.id === "cedoc:426400")).toMatchObject({ freshness: "historic", rain_48h: 0 });
    expect(result.stations.find((s) => s.id === "cedoc:505900")).toMatchObject({ freshness: "unavailable", rain_48h: null });
    expect(result.networks.find((n) => n.key === "cedoc")).toMatchObject({
      status: "degraded", with_measure_count: 2, without_measure_count: 1, unreachable_count: 1,
    });

    live = null;
    const outage = await getStations();
    expect(outage.stations.find((s) => s.id === iglesias.id)?.cedoc?.rain_48h).toMatchObject({
      value: 53.8, freshness: "stale", retained: true, observed_at: "2026-11-25T22:50:00Z",
    });
    live = { error: "Invalid JSON object for this feed" };
    expect((await getStations()).stations.find((s) => s.id === iglesias.id)?.rain_48h).toBe(53.8);
  });
});
