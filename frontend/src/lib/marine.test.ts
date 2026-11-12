import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let marine: typeof import("./marine");
const RUN = "2026-11-12T00:00:00Z";
const NEXT_RUN = "2026-11-13T00:00:00Z";
const ORIGIN = "https://maps.mistralportal.it";

function at(run: string, hours: number) {
  return new Date(Date.parse(run) + hours * 3_600_000).toISOString().replace(".000Z", "Z");
}

function compact(run: string, length = 10) {
  return run.replace(/\D/g, "").slice(0, length);
}

function query(input: string | URL) {
  const url = new URL(input);
  return new Map([...url.searchParams].map(([key, value]) => [key.toUpperCase(), value]));
}

function times(run: string, first: number, last: number, omit?: number) {
  return Array.from({ length: last - first + 1 }, (_, i) => i + first)
    .filter((hour) => hour !== omit).map((hour) => at(run, hour)).join(",");
}

function box(south = 30, west = -7, north = 46, east = 36) {
  return `<w:EX_GeographicBoundingBox>
    <w:westBoundLongitude>${west}</w:westBoundLongitude><w:eastBoundLongitude>${east}</w:eastBoundLongitude>
    <w:southBoundLatitude>${south}</w:southBoundLatitude><w:northBoundLatitude>${north}</w:northBoundLatitude>
  </w:EX_GeographicBoundingBox>`;
}

function capabilities(run = RUN) {
  return `<?xml version="1.0"?>
  <w:WMS_Capabilities xmlns:w="http://www.opengis.net/wms" version="1.3.0">
    <w:Capability><w:Layer><w:Title>Marine fields</w:Title>${box()}
      <w:Dimension name="time" units="ISO8601">${at(run, -23)}/${at(run, 73)}/PT1H</w:Dimension>
      <w:Layer><w:Name>meteohub:ww3_hs-hs</w:Name></w:Layer>
      <w:Layer><w:Name>meteohub:ww3_t01-t01</w:Name>
        <w:Dimension name="time" units="ISO8601">${times(run, -1, 73, 1)}</w:Dimension>
      </w:Layer>
      <w:Layer><w:Name>meteohub:SHYFEM-BOLAM-wl</w:Name>
        <w:Dimension name="time" units="ISO8601">${at(run, -24)}/${at(run, 48)}/PT1H</w:Dimension>
      </w:Layer>
      <w:Layer><w:Name>meteohub:SHYFEM-ECMWF-wl</w:Name>
        <w:Dimension name="time" units="ISO8601">${at(run, 0)}/${at(run, 72)}/PT1H</w:Dimension>
      </w:Layer>
      <w:Layer><w:Name>meteohub:SHYFEM-ICON-wl</w:Name>${box(31, -6, 45, 21)}
        <w:Dimension name="time" units="ISO8601">${at(run, 0)}/${at(run, 72)}/PT1H</w:Dimension>
      </w:Layer>
    </w:Layer></w:Capability>
  </w:WMS_Capabilities>`;
}

function catalogFetch(state: { run: string; mapRun?: string; availableForcings?: string[] }) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    expect(url.origin).toBe(ORIGIN);
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
    expect(init?.credentials).not.toBe("include");
    if (url.pathname === "/api/ww3/status") {
      return Response.json({ id: "ww3", ingestion: { status: "ready", lastRun: compact(state.run),
        from: at(state.run, -23).replace("Z", ""), to: at(state.run, 72).replace("Z", ""),
        start_offset: -23, end_offset: 72, step: 1 }, data: { variables: [], runs: [] } });
    }
    if (url.pathname === "/api/marine/shyfem/status") {
      return Response.json({ id: "marine", ingestion: { status: "ready", lastRun: compact(state.run, 8),
        availableForcings: state.availableForcings ?? ["ECMWF", "ICON"],
        forcings: {
          BOLAM: { status: "ready", lastRun: compact(at(state.run, -24), 8) },
          ECMWF: { status: "ready", lastRun: compact(state.run, 8) },
          ICON: { status: "ready", lastRun: compact(state.run, 8) },
        } }, data: { variables: ["wl"], runs: [] } });
    }
    if (query(url).get("REQUEST")?.toUpperCase() === "GETCAPABILITIES") {
      expect(url.pathname).toBe("/wms");
      return new Response(capabilities(state.mapRun ?? state.run), { headers: { "Content-Type": "text/xml" } });
    }
    throw new Error(`Unexpected marine endpoint: ${url}`);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(async () => {
  vi.resetModules();
  marine = await import("./marine");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("official marine metadata", () => {
  it("parses namespace-prefixed layers, inherited bounds/time and hourly ISO intervals without DOM", () => {
    vi.stubGlobal("DOMParser", undefined);
    const layers = marine.parseMarineCapabilities(capabilities());
    const hs = layers.get("ww3_hs-hs")!;
    expect(hs.name).toBe("meteohub:ww3_hs-hs");
    expect(hs.bounds).toEqual([[30, -7], [46, 36]]);
    expect(hs.frames).toHaveLength(97);
    expect(hs.frames[0]).toBe(at(RUN, -23));
    expect(hs.frames.at(-1)).toBe(at(RUN, 73));
    expect(layers.get("ww3_t01-t01")!.frames).not.toContain(at(RUN, 1));
    expect(layers.get("SHYFEM-ICON-wl")!.bounds).toEqual([[31, -6], [45, 21]]);
    expect(layers.get("SHYFEM-ICON-wl")!.frames).toHaveLength(73);
  });

  it.each([
    ["20261112", RUN], ["2026111200", RUN],
    ["2026111212", "2026-11-12T12:00:00Z"],
    ["2026-11-12T03:15:00.000Z", "2026-11-12T03:15:00Z"],
  ])("normalizes the source run %s to UTC", (input, expected) => {
    expect(marine.marineRunTime(input)).toBe(expected);
  });

  it.each([null, {}, [], "not a run", "20260230", "20261301", "2026111299", "202611"])(
    "rejects invalid or impossible run metadata %j", (input) => {
      expect(() => marine.marineRunTime(input)).toThrow();
    },
  );

  it("intersects the real HS/T01 times and excludes spin-up, H+00 and beyond H+72", async () => {
    catalogFetch({ run: RUN });
    const catalog = await marine.getMarineCatalog("ww3", "ECMWF");
    expect(catalog.model).toBe("ww3");
    expect(catalog.frames).toHaveLength(71);
    expect(catalog.frames[0]).toBe(at(RUN, 2));
    expect(catalog.frames.at(-1)).toBe(at(RUN, 72));
    expect(catalog.frames).not.toContain(at(RUN, 1));
    expect(catalog.frames.every((time) => Date.parse(time) > Date.parse(RUN))).toBe(true);
    expect(catalog.bounds).toEqual([[30, -7], [46, 36]]);
  });

  it("uses availableForcings rather than stale layers or all ready forcing keys", async () => {
    catalogFetch({ run: RUN, availableForcings: ["ICON"] });
    const catalog = await marine.getMarineCatalog("shyfem", "BOLAM");
    expect(catalog.forcing).toBe("ICON");
    expect(catalog.availableForcings).toEqual(["ICON"]);
    expect(catalog.frames).toHaveLength(73);
    expect(catalog.frames[0]).toBe(RUN);
    expect(catalog.frames.at(-1)).toBe(at(RUN, 72));
    expect(catalog.bounds).toEqual([[31, -6], [45, 21]]);
    const url = new URL(marine.marineImageUrl(catalog, "wl", RUN, 900));
    expect(query(url).get("LAYERS")).toBe("meteohub:SHYFEM-ICON-wl");
  });

  it("keeps the selected forcing's run when another forcing is newer", async () => {
    catalogFetch({ run: RUN, availableForcings: ["BOLAM", "ICON"] });
    const catalog = await marine.getMarineCatalog("shyfem", "BOLAM");
    expect(catalog.forcing).toBe("BOLAM");
    expect(catalog.frames[0]).toBe(at(RUN, -24));
    expect(catalog.frames.at(-1)).toBe(at(RUN, 48));
  });

  it("refuses to combine a newer run status with an older WMS window", async () => {
    catalogFetch({ run: NEXT_RUN, mapRun: RUN });
    await expect(marine.getMarineCatalog("ww3", "ECMWF")).rejects.toThrow();
  });

  it("refreshes run identity and keeps image URLs distinct for the same valid time", async () => {
    const state = { run: RUN };
    catalogFetch(state);
    const first = await marine.getMarineCatalog("ww3", "ECMWF");
    state.run = NEXT_RUN;
    const second = await marine.getMarineCatalog("ww3", "ECMWF");
    const commonTime = at(NEXT_RUN, 2);
    expect(first.frames).toContain(commonTime);
    expect(second.frames).toContain(commonTime);
    expect(marine.marineImageUrl(first, "hs", commonTime, 900))
      .not.toBe(marine.marineImageUrl(second, "hs", commonTime, 900));
  });
});

describe("marine public map requests", () => {
  it("uses projected EPSG:3857 bounds for the official WMS PNG", async () => {
    catalogFetch({ run: RUN });
    const catalog = await marine.getMarineCatalog("ww3", "ECMWF");
    const url = new URL(marine.marineImageUrl(catalog, "hs", at(RUN, 2), 900));
    const params = query(url);
    expect(url.origin).toBe(ORIGIN);
    expect(params.get("REQUEST")?.toUpperCase()).toBe("GETMAP");
    expect(params.get("CRS") ?? params.get("SRS")).toBe("EPSG:3857");
    expect(params.get("FORMAT")).toBe("image/png");
    expect(params.get("LAYERS")).toBe("meteohub:ww3_hs-hs");
    expect(params.get("TIME")).toBe(at(RUN, 2));
    expect(params.get("WIDTH")).toBe("900");
    const bbox = params.get("BBOX")!.split(",").map(Number);
    expect(bbox).toHaveLength(4);
    [-779236.435553, 3503549.843504, 4007501.668558, 5780349.220256]
      .forEach((coordinate, index) => expect(bbox[index]).toBeCloseTo(coordinate, 2));
  });

  it("rejects absent frame times and parameters from another model", async () => {
    catalogFetch({ run: RUN });
    const waves = await marine.getMarineCatalog("ww3", "ECMWF");
    const levels = await marine.getMarineCatalog("shyfem", "ICON");
    expect(() => marine.marineImageUrl(waves, "hs", at(RUN, 1), 900)).toThrow();
    expect(() => marine.marineImageUrl(waves, "wl", at(RUN, 2), 900)).toThrow();
    expect(() => marine.marineImageUrl(levels, "hs", RUN, 900)).toThrow();
  });

  it("requests the official legend for each marine parameter", () => {
    for (const parameter of ["hs", "t01", "wl"] as const) {
      const url = new URL(marine.marineLegendUrl(parameter));
      const params = query(url);
      expect(url.origin).toBe(ORIGIN);
      expect(params.get("REQUEST")?.toUpperCase()).toBe("GETLEGENDGRAPHIC");
      expect(params.get("FORMAT")).toBe("image/png");
      expect(params.get("LAYER") ?? params.get("LAYERS")).toContain(parameter);
    }
  });

  it("clamps vector zoom to 5..7 and sends the UTC valid time without authentication", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).has("Authorization")).toBe(false);
      expect(init?.credentials).not.toBe("include");
      return Response.json({ type: "FeatureCollection", features: [] });
    });
    vi.stubGlobal("fetch", fetch);
    await marine.getMarineVectors("2026-11-12T04:30:00Z", 2);
    await marine.getMarineVectors("2026-11-12T04:30:00Z", 20);
    const urls = fetch.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls.map((url) => url.pathname)).toEqual([
      "/api/ww3/vectors/5/12-11-2026-04-30.geojson",
      "/api/ww3/vectors/7/12-11-2026-04-30.geojson",
    ]);
    expect(urls.every((url) => url.origin === ORIGIN)).toBe(true);
  });

  it("distinguishes vector requests from different runs at the same valid time", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL) => Response.json({ type: "FeatureCollection", features: [] }));
    vi.stubGlobal("fetch", fetch);
    const valid = at(NEXT_RUN, 2);
    await marine.getMarineVectors(valid, 6, undefined, RUN);
    await marine.getMarineVectors(valid, 6, undefined, NEXT_RUN);
    const urls = fetch.mock.calls.map((args) => new URL(String(args[0])));
    expect(urls[0].pathname).toBe(urls[1].pathname);
    expect(urls[0].searchParams.get("run")).toBe(RUN);
    expect(urls[1].searchParams.get("run")).toBe(NEXT_RUN);
  });

  it("propagates cancellation rather than returning an empty vector fallback", async () => {
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        if (init?.signal?.aborted) {
          reject(new DOMException("Cancelled", "AbortError"));
          return;
        }
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
      })));
    const controller = new AbortController();
    const request = marine.getMarineVectors(at(RUN, 2), 6, controller.signal);
    const rejected = expect(request).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejected;
  });

  it("rejects a malformed vector payload instead of inventing an empty field", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ type: "FeatureCollection", features: {} })));
    await expect(marine.getMarineVectors(at(RUN, 2), 6)).rejects.toThrow();
  });
});

describe("official marine scale", () => {
  it("reads finite SLD ColorMap thresholds, colors and opacity through GetStyles 1.1.1", async () => {
    const style = `<?xml version="1.0"?>
      <sld:StyledLayerDescriptor xmlns:sld="http://www.opengis.net/sld" version="1.0.0">
        <sld:NamedLayer><sld:Name>meteohub:ww3_hs-hs</sld:Name><sld:UserStyle>
          <sld:FeatureTypeStyle><sld:Rule><sld:RasterSymbolizer><sld:ColorMap type="intervals">
            <sld:ColorMapEntry color="#87CEEB" quantity="0.1" label="Low waves" opacity="0.4"/>
            <sld:ColorMapEntry color="#4495D2" quantity="0.3"/>
            <sld:ColorMapEntry color="#611269" quantity="300"/>
            <sld:ColorMapEntry color="#000000" quantity="Infinity"/>
            <sld:ColorMapEntry color="#000000" quantity="NoData"/>
          </sld:ColorMap></sld:RasterSymbolizer></sld:Rule></sld:FeatureTypeStyle>
        </sld:UserStyle></sld:NamedLayer>
      </sld:StyledLayerDescriptor>`;
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input)), params = query(url);
      expect(url.origin).toBe(ORIGIN);
      expect(url.pathname).toBe("/wms");
      expect(params.get("REQUEST")?.toUpperCase()).toBe("GETSTYLES");
      expect(params.get("VERSION")).toBe("1.1.1");
      expect(params.get("LAYERS")).toBe("meteohub:ww3_hs-hs");
      expect(new Headers(init?.headers).has("Authorization")).toBe(false);
      return new Response(style, { headers: { "Content-Type": "text/xml" } });
    });
    vi.stubGlobal("fetch", fetch);
    const scale = await marine.getMarineScale("hs");
    expect(scale.map(({ value, color, opacity }) => ({ value, color: color.toLowerCase(), opacity })))
      .toEqual([
        { value: 0.1, color: "#87ceeb", opacity: 0.4 },
        { value: 0.3, color: "#4495d2", opacity: 1 },
        { value: 300, color: "#611269", opacity: 1 },
      ]);
    expect(scale[0].label).toBe("Low waves");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
