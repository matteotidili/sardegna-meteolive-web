type Position = [number, number];
export type SardiniaMask = Position[][][];

function validRing(ring: unknown): ring is Position[] {
  return Array.isArray(ring) && ring.length >= 4 && ring.every((p) =>
    Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])
      && p[0] >= 7.5 && p[0] <= 10 && p[1] >= 38.7 && p[1] <= 41.5)
    && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1];
}

let request: Promise<SardiniaMask> | undefined;
export function loadSardiniaMask() {
  request ??= fetch(`${import.meta.env.BASE_URL}geography/sardegna-istat-2026.geojson`, { signal: AbortSignal.timeout(12000) })
    .then(async (response) => {
      if (!response.ok) throw new Error("Confine regionale non disponibile");
      const feature = await response.json();
      const polygons = feature.geometry?.coordinates;
      if (feature.properties?.reg_istat_code !== "20" || feature.geometry?.type !== "MultiPolygon"
        || !Array.isArray(polygons) || !polygons.length
        || !polygons.every((p) => Array.isArray(p) && p.length && p.every(validRing))) {
        throw new Error("Confine regionale non valido");
      }
      return polygons as SardiniaMask;
    }).catch((error) => { request = undefined; throw error; });
  return request;
}

export function insideSardinia(mask: SardiniaMask, lat: number, lon: number) {
  return mask.some((polygon) => {
    let inside = false;
    for (const ring of polygon) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x, y] = ring[i], [px, py] = ring[j];
        if ((y > lat) !== (py > lat) && lon < (px - x) * (lat - y) / (py - y) + x) inside = !inside;
      }
    }
    return inside;
  });
}
