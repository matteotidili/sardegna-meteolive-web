import { describe, expect, it } from "vitest";
import { MEDITERRANEAN_BOUNDS, mercBbox } from "./mapControls";
import { regionalSatelliteUrl, satelliteRegionBounds, satelliteMinZoom } from "./satelliteView";

describe("Mediterranean satellite archive", () => {
  it("keeps wide and portrait viewports within coverage at the minimum zoom", () => {
    const [[south, west], [north, east]] = MEDITERRANEAN_BOUNDS;
    const y = (lat: number) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI);
    for (const [width, height] of [[1920, 1080], [390, 844], [2560, 720]]) {
      const z = satelliteMinZoom(MEDITERRANEAN_BOUNDS, width, height);
      const scale = 256 * 2 ** z;
      expect(scale * (east - west) / 360).toBeGreaterThan(width);
      expect(scale * (y(north) - y(south))).toBeGreaterThan(height);
      expect(satelliteMinZoom(MEDITERRANEAN_BOUNDS, width, height, 512)).toBe(z - 1);
    }
  });
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
