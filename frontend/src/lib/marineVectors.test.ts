import { describe, expect, it } from "vitest";
import { decimateMarineVectors, declutterMarineVectors, marineArrowFeatures, projectMarineArrow, type MarineArrow } from "./marineVectors";

function line(tail: GeoJSON.Position, head: GeoJSON.Position): GeoJSON.Feature<GeoJSON.LineString> {
  return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [tail, head] } };
}

function collection(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features };
}

function many(count: number): GeoJSON.FeatureCollection {
  return collection(Array.from({ length: count }, (_, index) => line([index / 10000, 40], [index / 10000, 40.01])));
}

describe("marine GeoJSON arrows", () => {
  it("keeps the supplied tail-to-head direction and does not mutate the source", () => {
    const source = collection([line([9, 40], [8.5, 39.5])]);
    const arrows = decimateMarineVectors(source);
    expect(arrows).toEqual([{ tail: [9, 40], head: [8.5, 39.5] }]);
    arrows[0].tail[0] = 99;
    expect((source.features[0].geometry as GeoJSON.LineString).coordinates[0]).toEqual([9, 40]);
  });

  it("samples the full valid field uniformly and caps output at 600", () => {
    const source = many(2000);
    const arrows = decimateMarineVectors(source);
    expect(arrows).toHaveLength(600);
    expect(arrows[0].tail).toEqual([0, 40]);
    expect(arrows.at(-1)?.tail).toEqual([1999 / 10000, 40]);
    const indices = arrows.map((arrow) => Math.round(arrow.tail[0] * 10000));
    const gaps = indices.slice(1).map((index, i) => index - indices[i]);
    expect(Math.min(...gaps)).toBe(3);
    expect(Math.max(...gaps)).toBe(4);
    expect(decimateMarineVectors(source, 5000)).toHaveLength(600);
  });

  it("honours smaller budgets, including a single central sample", () => {
    const source = many(101);
    expect(decimateMarineVectors(source, 3).map((arrow) => arrow.tail[0])).toEqual([0, 0.005, 0.01]);
    expect(decimateMarineVectors(source, 1)[0].tail[0]).toBe(0.005);
    for (const limit of [0, -1, NaN, Infinity]) expect(decimateMarineVectors(source, limit)).toEqual([]);
  });

  it("samples 600 visible arrows even when more than 600 outside arrows precede them", () => {
    const outside = Array.from({ length: 1200 }, (_, index) => line([30 + index / 10000, 40], [30 + index / 10000, 40.01]));
    const inside = Array.from({ length: 1200 }, (_, index) => line([8 + index / 10000, 39], [8 + index / 10000, 39.01]));
    const arrows = decimateMarineVectors(collection([...outside, ...inside]), 600, [8, 38, 10, 42]);
    expect(arrows).toHaveLength(600);
    expect(arrows[0].tail).toEqual([8, 39]);
    expect(arrows.at(-1)?.tail).toEqual([8 + 1199 / 10000, 39]);
    expect(arrows.every((arrow) => arrow.tail[0] >= 8 && arrow.head[0] <= 10)).toBe(true);
  });

  it("filters geographic midpoints with inclusive viewport edges", () => {
    const source = collection([
      line([7, 40], [8.1, 40]),
      line([7.5, 40], [8.5, 40]),
      line([9.5, 40], [10.5, 40]),
      line([9, 42], [9, 44]),
    ]);
    expect(decimateMarineVectors(source, 600, [8, 39, 10, 41])).toEqual([
      { tail: [7.5, 40], head: [8.5, 40] },
      { tail: [9.5, 40], head: [10.5, 40] },
    ]);
    expect(decimateMarineVectors(source, 600, [8, 39, NaN, 41])).toEqual([]);
  });

  it("rejects missing geometry, nonfinite coordinates and degenerate arrows before sampling", () => {
    const source = collection([
      { type: "Feature", properties: {}, geometry: null } as unknown as GeoJSON.Feature,
      { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [9, 40] } },
      line([NaN, 40], [9, 40]), line([9, 40], [9, Infinity]), line([9, 40], [9, 40]),
      line([9], [9, 40]), line(["9" as unknown as number, 40], [9, 41]),
      line([1, 40], [2, 40]), line([3, 40], [4, 40]), line([5, 40], [6, 40]),
    ]);
    expect(decimateMarineVectors(source, 2)).toEqual([
      { tail: [1, 40], head: [2, 40] }, { tail: [5, 40], head: [6, 40] },
    ]);
    expect(decimateMarineVectors(null)).toEqual([]);
    expect(decimateMarineVectors({ type: "FeatureCollection", features: null } as unknown as GeoJSON.FeatureCollection)).toEqual([]);
  });
});

describe("screen-space marine arrow density", () => {
  it("keeps one arrow per pixel bucket in a dense field", () => {
    const source = collection(Array.from({ length: 2000 }, (_, index) => {
      const x = (index % 40) / 10, y = Math.floor(index / 40) / 10;
      return line([x, y], [x + 0.001, y]);
    }));
    const arrows = declutterMarineVectors(source, [-1, -1, 10, 10], ([lon, lat]) => ({ x: lon * 10, y: lat * 10 }));
    expect(arrows).toHaveLength(4);
    expect(arrows[0]).toEqual({ tail: [0, 0], head: [0.001, 0] });
  });

  it("does not let features outside the geographic viewport consume screen buckets", () => {
    const outside = Array.from({ length: 1200 }, (_, index) => line([30 + index / 10000, 40], [30 + index / 10000, 40.01]));
    const inside = line([9, 40], [8.9, 40]);
    let projections = 0;
    const arrows = declutterMarineVectors(collection([...outside, inside]), [8, 38, 10, 42], () => {
      projections++;
      return { x: 10, y: 10 };
    });
    expect(projections).toBe(1);
    expect(arrows).toEqual([{ tail: [9, 40], head: [8.9, 40] }]);
  });

  it("caps after bucketing so late sparse regions survive a dense leading region", () => {
    const dense = Array.from({ length: 1200 }, () => line([0, 1], [0, 1.001]));
    const sparse = Array.from({ length: 800 }, (_, index) => line([(index + 1) / 1000, 1], [(index + 1) / 1000, 1.001]));
    const arrows = declutterMarineVectors(collection([...dense, ...sparse]), [-1, 0, 2, 2], ([lon, lat]) => ({ x: lon * 30000, y: lat * 100 }));
    expect(arrows).toHaveLength(600);
    expect(arrows[0]).toEqual({ tail: [0, 1], head: [0, 1.001] });
    expect(arrows.at(-1)).toEqual({ tail: [0.8, 1], head: [0.8, 1.001] });
  });

  it("skips clipped, throwing and nonfinite projections without reserving their buckets", () => {
    const source = collection(Array.from({ length: 4 }, (_, index) => line([index, 1], [index + 0.1, 1])));
    const arrows = declutterMarineVectors(source, [-1, 0, 5, 2], ([lon]) => {
      if (lon < 0.5) return null;
      if (lon < 1.5) throw new Error("outside projection");
      if (lon < 2.5) return { x: NaN, y: 0 };
      return { x: 0, y: 0 };
    });
    expect(arrows).toEqual([{ tail: [3, 1], head: [3.1, 1] }]);
  });
});

describe("authoritative marine direction metadata", () => {
  const mercator = ([lon, lat]: [number, number]) => ({
    x: lon * Math.PI / 180,
    y: -Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)),
  });
  const heading = (arrow: MarineArrow) => {
    const tail = mercator(arrow.tail), head = mercator(arrow.head);
    return (Math.atan2(head.x - tail.x, tail.y - head.y) * 180 / Math.PI + 360) % 360;
  };

  it("uses direction at the first coordinate, preserving the source anchor and Mercator bearing", () => {
    const feature = line([18.4842, 30.8144], [18.1708, 31.204]);
    feature.properties = { direction: 321.1867 };
    const source = collection([feature]);
    const [arrow] = decimateMarineVectors(source);
    expect(heading(arrow)).toBeCloseTo(321.1867, 2);
    expect((arrow.tail[0] + arrow.head[0]) / 2).toBeCloseTo(18.4842, 12);
    expect((arrow.tail[1] + arrow.head[1]) / 2).toBeCloseTo(30.8144, 12);
    expect(feature.geometry.coordinates[0]).toEqual([18.4842, 30.8144]);
    let projectedCenter: [number, number] | null = null;
    expect(declutterMarineVectors(source, [18.48, 30.81, 18.49, 30.82], (center) => {
      projectedCenter = center;
      return { x: 0, y: 0 };
    })).toHaveLength(1);
    expect(projectedCenter).toEqual([18.4842, 30.8144]);
  });

  it("draws directions 0 and 90 north and east even if the original line is degenerate", () => {
    for (const direction of [0, 90, 360]) {
      const feature = line([9, 40], [9, 40]);
      feature.properties = { direction };
      const [arrow] = decimateMarineVectors(collection([feature]));
      expect(arrow).toBeDefined();
      expect(heading(arrow)).toBeCloseTo(direction % 360, 2);
      if (direction % 360 === 0) expect(arrow.head[1]).toBeGreaterThan(arrow.tail[1]);
      else expect(arrow.head[0]).toBeGreaterThan(arrow.tail[0]);
    }
  });

  it("rejects a present invalid direction instead of falling back to the original line", () => {
    for (const direction of ["90", null, undefined, NaN, Infinity, -1, 361]) {
      const feature = line([9, 40], [10, 41]);
      feature.properties = { direction };
      expect(decimateMarineVectors(collection([feature]))).toEqual([]);
      expect(declutterMarineVectors(collection([feature]), [8, 39, 11, 42], () => ({ x: 0, y: 0 }))).toEqual([]);
    }
  });
});

describe("pixel-sized marine arrows", () => {
  it("clamps small and large arrows around their original centres", () => {
    const short = projectMarineArrow({ x: 10, y: 20 }, { x: 11, y: 20 })!;
    expect(short.body).toEqual([{ x: 7.5, y: 20 }, { x: 13.5, y: 20 }]);
    const long = projectMarineArrow({ x: 0, y: 20 }, { x: 100, y: 20 })!;
    expect(long.body).toEqual([{ x: 37, y: 20 }, { x: 63, y: 20 }]);
    expect(long.head[1]).toEqual(long.body[1]);
    expect(long.head[0].x).toBeLessThan(long.head[1].x);
    expect(long.head[2].x).toBeLessThan(long.head[1].x);
  });

  it("preserves diagonal direction, original centre and a length already within the limits", () => {
    const tail = { x: 17, y: 23 }, head = { x: 5, y: 7 };
    const shape = projectMarineArrow(tail, head)!;
    expect(shape.body).toEqual([tail, head]);
    expect((shape.body[0].x + shape.body[1].x) / 2).toBe(11);
    expect((shape.body[0].y + shape.body[1].y) / 2).toBe(15);
    expect(shape.head[1]).toEqual(head);
    for (const wing of [shape.head[0], shape.head[2]]) {
      expect((wing.x - head.x) * (head.x - tail.x) + (wing.y - head.y) * (head.y - tail.y)).toBeLessThan(0);
    }
  });

  it("retains northward screen orientation when enlarging a tiny arrow", () => {
    const shape = projectMarineArrow({ x: 20, y: 30 }, { x: 23, y: 26 })!;
    const [tail, head] = shape.body;
    expect(head.x - tail.x).toBeCloseTo(3.6);
    expect(head.y - tail.y).toBeCloseTo(-4.8);
    expect((tail.x + head.x) / 2).toBeCloseTo(21.5);
    expect((tail.y + head.y) / 2).toBeCloseTo(28);
  });

  it("rejects degenerate or invalid projections", () => {
    expect(projectMarineArrow({ x: 1, y: 1 }, { x: 1, y: 1 })).toBeNull();
    expect(projectMarineArrow({ x: NaN, y: 1 }, { x: 2, y: 3 })).toBeNull();
    expect(projectMarineArrow({ x: 1, y: 1 }, { x: Infinity, y: 3 })).toBeNull();
    expect(projectMarineArrow({ x: -1e308, y: 1 }, { x: 1e308, y: 3 })).toBeNull();
  });
});

describe("MapLibre marine arrow geometry", () => {
  const project = ([lon, lat]: [number, number]) => ({ x: lon * 10 + 100, y: 100 - lat * 10 });
  const unproject = ({ x, y }: { x: number; y: number }): [number, number] => [(x - 100) / 10, (100 - y) / 10];

  it("creates one multiline feature per valid arrow, including the forward arrowhead", () => {
    const arrows: MarineArrow[] = [{ tail: [0, 0], head: [1, 0] }, { tail: [2, 2], head: [2, 3] }];
    const data = marineArrowFeatures(arrows, project, unproject);
    expect(data.features).toHaveLength(2);
    expect(data.features[0].geometry.type).toBe("MultiLineString");
    expect(data.features[0].geometry.coordinates[0]).toEqual([[0, 0], [1, 0]]);
    expect(data.features[0].geometry.coordinates[1]).toHaveLength(3);
    expect(data.features[0].geometry.coordinates[1][1]).toEqual([1, 0]);
    expect(data.features[1].geometry.coordinates[1][1]).toEqual([2, 3]);
  });

  it("unprojects the clamped pixel geometry and skips invalid projection results", () => {
    const data = marineArrowFeatures([{ tail: [0, 0], head: [0.1, 0] }], project, unproject);
    expect(data.features[0].geometry.coordinates[0][0][0]).toBeCloseTo(-0.25);
    expect(data.features[0].geometry.coordinates[0][1][0]).toBeCloseTo(0.35);
    expect(marineArrowFeatures([{ tail: [0, 0], head: [1, 0] }], () => ({ x: NaN, y: 0 }), unproject).features).toEqual([]);
    expect(marineArrowFeatures([{ tail: [0, 0], head: [1, 0] }], project, () => [Infinity, 0]).features).toEqual([]);
    expect(marineArrowFeatures([{ tail: [0, 0], head: [1, 0] }], () => { throw new Error("outside projection"); }, unproject).features).toEqual([]);
  });
});
