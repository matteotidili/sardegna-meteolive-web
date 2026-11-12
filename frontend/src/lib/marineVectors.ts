/** GeoJSON positions are [longitude, latitude], ordered from tail to head. */
export type MarineArrow = { tail: [number, number]; head: [number, number] };

type Point = { x: number; y: number };
type ProjectedArrow = { body: [Point, Point]; head: [Point, Point, Point] };

const MAX_ARROWS = 600;

function finitePosition(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length >= 2
    && Number.isFinite(value[0]) && Number.isFinite(value[1]);
}

function finitePoint(value: Point): boolean {
  return !!value && Number.isFinite(value.x) && Number.isFinite(value.y);
}

function visibleMarineArrow(
  feature: GeoJSON.Feature,
  bounds?: [number, number, number, number],
): { arrow: MarineArrow; center: [number, number] } | null {
  const geometry = feature?.geometry;
  if (geometry?.type !== "LineString" || !Array.isArray(geometry.coordinates) || geometry.coordinates.length !== 2) return null;
  const [anchor, originalHead] = geometry.coordinates;
  if (!finitePosition(anchor)) return null;
  let tail: [number, number], head: [number, number], center: [number, number];
  if (feature.properties != null && Object.prototype.hasOwnProperty.call(feature.properties, "direction")) {
    const direction: unknown = feature.properties.direction;
    if (typeof direction !== "number" || !Number.isFinite(direction) || direction < 0 || direction > 360) return null;
    const cosine = Math.cos(anchor[1] * Math.PI / 180);
    if (Math.abs(cosine) < 1e-6) return null;
    const angle = (direction % 360) * Math.PI / 180;
    const dLon = Math.sin(angle) * 0.05 / cosine, dLat = Math.cos(angle) * 0.05;
    center = [anchor[0], anchor[1]];
    tail = [anchor[0] - dLon, anchor[1] - dLat];
    head = [anchor[0] + dLon, anchor[1] + dLat];
  } else {
    if (!finitePosition(originalHead)) return null;
    tail = [anchor[0], anchor[1]];
    head = [originalHead[0], originalHead[1]];
    center = [tail[0] + (head[0] - tail[0]) / 2, tail[1] + (head[1] - tail[1]) / 2];
  }
  if (!finitePosition(tail) || !finitePosition(head) || !finitePosition(center)
    || (tail[0] === head[0] && tail[1] === head[1])) return null;
  if (bounds && (center[0] < bounds[0] || center[0] > bounds[2] || center[1] < bounds[1] || center[1] > bounds[3])) return null;
  return { arrow: { tail, head }, center };
}

function uniformSample(arrows: MarineArrow[], limit: number): MarineArrow[] {
  if (arrows.length <= limit) return arrows;
  if (limit === 1) return [arrows[Math.floor((arrows.length - 1) / 2)]];
  return Array.from({ length: limit }, (_, index) => arrows[Math.round(index * (arrows.length - 1) / (limit - 1))]);
}

/** Filter the visible midpoint before sampling; never reverse the source direction. */
export function decimateMarineVectors(
  data: GeoJSON.FeatureCollection | null,
  max = MAX_ARROWS,
  bounds?: [number, number, number, number],
): MarineArrow[] {
  const limit = Number.isFinite(max) ? Math.min(MAX_ARROWS, Math.max(0, Math.floor(max))) : 0;
  if (!limit || data?.type !== "FeatureCollection" || !Array.isArray(data.features)) return [];
  if (bounds && (!bounds.every(Number.isFinite) || bounds[1] > bounds[3])) return [];

  const valid: MarineArrow[] = [];
  for (const feature of data.features) {
    const entry = visibleMarineArrow(feature, bounds);
    if (entry) valid.push(entry.arrow);
  }
  return uniformSample(valid, limit);
}

/** One visible arrow per CSS-pixel bucket, followed by a uniform global cap. */
export function declutterMarineVectors(
  data: GeoJSON.FeatureCollection | null,
  bounds: [number, number, number, number],
  project: (center: [number, number]) => Point | null,
  spacing = 28,
  max = MAX_ARROWS,
): MarineArrow[] {
  const limit = Number.isFinite(max) ? Math.min(MAX_ARROWS, Math.max(0, Math.floor(max))) : 0;
  if (!limit || data?.type !== "FeatureCollection" || !Array.isArray(data.features)
    || !bounds.every(Number.isFinite) || bounds[1] > bounds[3]
    || !Number.isFinite(spacing) || spacing <= 0) return [];
  const occupied = new Set<string>();
  const visible: MarineArrow[] = [];
  for (const feature of data.features) {
    const entry = visibleMarineArrow(feature, bounds);
    if (!entry) continue;
    try {
      const point = project(entry.center);
      if (!point || !finitePoint(point)) continue;
      const key = `${Math.floor(point.x / spacing)}:${Math.floor(point.y / spacing)}`;
      if (occupied.has(key)) continue;
      occupied.add(key);
      visible.push(entry.arrow);
    } catch {
      // A clipped or invalid feature must not occupy a visible screen bucket.
    }
  }
  return uniformSample(visible, limit);
}

/** Clamp in screen pixels around the original midpoint, preserving tail → head. */
export function projectMarineArrow(tail: Point, head: Point): ProjectedArrow | null {
  if (!finitePoint(tail) || !finitePoint(head)) return null;
  const dx = head.x - tail.x, dy = head.y - tail.y;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance === 0) return null;
  const ux = dx / distance, uy = dy / distance;
  const length = Math.max(6, Math.min(26, distance));
  const center = { x: tail.x + dx / 2, y: tail.y + dy / 2 };
  if (!finitePoint(center)) return null;
  const a = { x: center.x - ux * length / 2, y: center.y - uy * length / 2 };
  const b = { x: center.x + ux * length / 2, y: center.y + uy * length / 2 };
  const wingLength = Math.min(6, Math.max(3, length * 0.35));
  const wingWidth = wingLength * 0.55;
  return {
    body: [a, b],
    head: [
      { x: b.x - ux * wingLength - uy * wingWidth, y: b.y - uy * wingLength + ux * wingWidth },
      b,
      { x: b.x - ux * wingLength + uy * wingWidth, y: b.y - uy * wingLength - ux * wingWidth },
    ],
  };
}

/** MapLibre geometry with the same pixel-sized body and arrowhead as the canvas. */
export function marineArrowFeatures(
  arrows: MarineArrow[],
  project: (position: [number, number]) => Point,
  unproject: (point: Point) => [number, number],
): GeoJSON.FeatureCollection<GeoJSON.MultiLineString> {
  const features: GeoJSON.Feature<GeoJSON.MultiLineString>[] = [];
  for (const arrow of arrows) {
    if (!finitePosition(arrow.tail) || !finitePosition(arrow.head)) continue;
    try {
      const shape = projectMarineArrow(project(arrow.tail), project(arrow.head));
      if (!shape) continue;
      const coordinates = [shape.body, shape.head].map((line) => line.map((point) => unproject(point)));
      if (!coordinates.every((line) => line.every(finitePosition))) continue;
      features.push({ type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates } });
    } catch {
      // One out-of-domain projection must not hide the remaining valid arrows.
    }
  }
  return { type: "FeatureCollection", features };
}
