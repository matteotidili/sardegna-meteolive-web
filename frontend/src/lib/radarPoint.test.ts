import { describe, expect, it } from "vitest";
import { marshallPalmer, numericCell, radarCell, type RadarNumericManifest } from "./radarPoint";

const grid: RadarNumericManifest = {
  schema_version: 1,
  generated_at: "2026-11-14T15:00:00Z",
  source: "Radar-DPC",
  source_url: "https://radar.protezionecivile.it",
  license: "CC BY-SA 4.0",
  crs_proj4: "+proj=tmerc +lat_0=42 +lon_0=12.5 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs",
  grid: { x0_m: -485000, y0_m: 49000, pixel_m: 1000, width: 371, height: 494 },
  encoding: { format: "PNG-RG16", nodata_code: 0, scale: 10, bias: 1000 },
  frames: { SRI: [], VMI: [] },
};

describe("Radar-DPC: campionamento georeferenziato", () => {
  it("proietta Elmas nella cella GeoTIFF DPC corretta senza attribuire pixel vicini", () => {
    // Ground truth indipendente: rasterio / pyproj WGS84 -> TM lat0=42 lon0=12.5.
    expect(radarCell({ lon: 9.0667, lat: 39.25 }, grid)).toEqual([348, 188]);
    expect(radarCell({ lon: 8.55, lat: 40.72 }, grid)).toEqual([183, 151]);
    expect(radarCell({ lon: 9.49, lat: 40.92 }, grid)).toEqual([164, 231]);
    expect(radarCell({ lon: 2, lat: 50 }, grid)).toBeNull();
  });

  it("distingue 0 mm/h reale da NoData, preserva anche riflettività negativa", () => {
    expect(numericCell(0, 0, 10, 1000)).toBeNull();
    expect(numericCell(17, 39, 10, 1000)).toBe(0);  // 10001 = 39*256 + 17
    expect(numericCell(122, 39, 10, 1000)).toBeCloseTo(10.5);
    expect(numericCell(223, 38, 10, 1000)).toBeCloseTo(-5.4);
  });

  it("converte soltanto riflettività numerica VMI con Marshall-Palmer", () => {
    expect(marshallPalmer(30)).toBeCloseTo(Math.pow(5, 1/1.6), 5);
    expect(marshallPalmer(40)).toBeCloseTo(Math.pow(50, 1/1.6), 5);
  });
});
