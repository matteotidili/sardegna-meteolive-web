import { describe, expect, it } from "vitest";
import { marineViewportBounds } from "./marineViewport";

const domain: [number, number][] = [[30, -7.1], [45.8, 36.2]];

describe("marine raster viewport", () => {
  it("retains the full sea domain when fitting the Mediterranean", () => {
    expect(marineViewportBounds(domain, [49, 42, 27, -10])).toEqual(domain);
  });
  it("requests detail around Sardinia, including a margin for rounded map coordinates", () => {
    const result = marineViewportBounds(domain, [42, 11, 38, 7]);
    expect(result).toEqual([[37.85, 6.85], [42.15, 11.15]]);
    expect(domain).toEqual([[30, -7.1], [45.8, 36.2]]);
    expect((result[1][1] - result[0][1]) / (domain[1][1] - domain[0][1])).toBeLessThan(0.11);
  });
  it("clips at model edges and handles close zooms whose rounded bounds coincide", () => {
    expect(marineViewportBounds(domain, [46, 38, 44, 34])).toEqual([[43.85, 33.85], [45.8, 36.2]]);
    expect(marineViewportBounds(domain, [40, 9, 40, 9])).toEqual([[39.85, 8.85], [40.15, 9.15]]);
  });
  it("avoids invalid or empty WMS boxes outside the model", () => {
    for (const viewport of [null, [60, 20, 55, 10], [40, -170, 38, 170], [NaN, 10, 30, 0]] as ([number, number, number, number] | null)[]) {
      expect(marineViewportBounds(domain, viewport)).toEqual(domain);
    }
  });
});
