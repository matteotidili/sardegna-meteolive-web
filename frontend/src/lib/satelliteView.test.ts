import { describe, expect, it } from "vitest";
import { MEDITERRANEAN_BOUNDS, mercBbox } from "./mapControls";
import { regionalSatelliteUrl, satelliteRegionBounds } from "./satelliteView";

describe("Mediterranean satellite archive", () => {
  it("clips full-disk products and preserves narrower native coverage", () => {
    expect(satelliteRegionBounds([[-80, -80], [80, 80]])).toEqual(MEDITERRANEAN_BOUNDS);
    expect(satelliteRegionBounds([[35, 0], [50, 20]])).toEqual([[35, 0], [46.5, 20]]);
    expect(satelliteRegionBounds([[55, 0], [65, 20]])).toBeNull();
  });

  it("uses a stable regional request shared by display and archive in both map renderers", () => {
    const bounds = satelliteRegionBounds([[-80, -80], [80, 80]])!;
    const request = () => regionalSatelliteUrl("https://view.eumetsat.int/geoserver/test/ows", "rgb", "image/png", bounds, "2026-11-18T12:00:00Z", true);
    const q = new URL(request()).searchParams;
    expect(q.get("bbox")).toBe(mercBbox(MEDITERRANEAN_BOUNDS));
    expect(q.get("width")).toBe("2048");
    expect(Number(q.get("height"))).toBeLessThan(1100);
    expect(q.get("format")).toBe("image/png");
    expect(q.get("time")).toBe("2026-11-18T12:00:00.000Z");
    const mobile = new URL(regionalSatelliteUrl("https://view.eumetsat.int/ows", "rgb", "image/png", bounds, "2026-11-18T12:00:00Z", false));
    expect(mobile.searchParams.get("width")).toBe("1280");
  });
});
