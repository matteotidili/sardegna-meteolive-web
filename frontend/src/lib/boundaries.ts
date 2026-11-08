// Vector boundary layers. Sources match the original static app; each file is fetched once, lazily.
const GJ_ITALY = "https://raw.githubusercontent.com/guglielmo/geojson-italy/main/geojson";
const IT_URL = `${GJ_ITALY}/limits_IT_regions.geojson`;
const FR_URL = "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/regions-version-simplifiee.geojson";
const WEB_DATA = "https://raw.githubusercontent.com/matteotidili/sardegna-meteolive-web/main/data";
const FALLBACK_URL = `${WEB_DATA}/sardegna.geojson`;
const SUBREGIONS_URL = `${WEB_DATA}/subregioni-storiche.geojson`;
const MUNICIPALITIES_URL = `${GJ_ITALY}/limits_R_20_municipalities.geojson`; // Sardegna, ISTAT region 20

export const BOUNDARY_HALO = { color: "#06111c", weight: 3.6, opacity: 0.74 };
export const BOUNDARY_LINE = { color: "#f7fbff", weight: 1.3, opacity: 0.94 };
export const SUBREGION_LINE = { color: "#28d1d9", weight: 2.2, opacity: 0.92 };
export const MUNICIPAL_LINE = { color: "#cbd5e1", weight: 0.8, opacity: 0.7 };
/** Leaflet zoom levels (3D uses zoom - 1). */
export const SUBREGION_LABEL_MIN_ZOOM = 7.8;
export const MUNICIPAL_MIN_ZOOM = 9;
export const SUBREGIONS_CREDIT = { text: "GeoNue · Nordai Srl", url: "https://geonue.com/le-regioni-storiche-della-sardegna/" };

type FC = GeoJSON.FeatureCollection;

async function getJson(url: string): Promise<FC> {
  const r = await fetch(url, { cache: "force-cache" });
  if (!r.ok) throw new Error(`confini ${r.status}`);
  return r.json();
}

async function loadAdmin(): Promise<FC> {
  try {
    const [italy, france] = await Promise.all([getJson(IT_URL), getJson(FR_URL).catch(() => null)]);
    const corsica = (france?.features ?? []).filter((f) =>
      Object.values(f.properties ?? {}).some((v) => String(v ?? "").toLowerCase().includes("corse")));
    return { type: "FeatureCollection", features: [...italy.features, ...corsica] };
  } catch (e) {
    console.warn("Confini Italia/Corsica", e);
    return getJson(FALLBACK_URL);
  }
}

async function loadSubregionsRaw(): Promise<FC> {
  const d = await getJson(SUBREGIONS_URL);
  const features = d.features
    .filter((f) => f.geometry && /Polygon/.test(f.geometry.type))
    .map((f) => {
      const p = (f.properties ?? {}) as Record<string, unknown>;
      return { ...f, properties: { ...p, nome: String(p.nome ?? p.name ?? "Subregione storica").trim() } };
    });
  return { type: "FeatureCollection", features };
}

function once(fn: () => Promise<FC>): () => Promise<FC> {
  let p: Promise<FC> | null = null;
  return () => (p ??= fn().catch((e) => { p = null; throw e; }));
}

export const loadBoundaries = once(loadAdmin);
export const loadSubregions = once(loadSubregionsRaw);
export const loadMunicipalities = once(() => getJson(MUNICIPALITIES_URL));

/** Label anchor: centre of the feature's bounding box, as the original app did. */
export function bboxCenter(g: GeoJSON.Geometry): [number, number] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      const [x, y] = c as number[];
      if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y;
    } else if (Array.isArray(c)) c.forEach(walk);
  };
  if ("coordinates" in g) walk(g.coordinates);
  return Number.isFinite(w) ? [(s + n) / 2, (w + e) / 2] : null;
}

/** Point features for 3D symbol labels. */
export function labelPoints(fc: FC): FC {
  return {
    type: "FeatureCollection",
    features: fc.features.flatMap((f) => {
      const c = f.geometry ? bboxCenter(f.geometry) : null;
      return c ? [{ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [c[1], c[0]] }, properties: f.properties }] : [];
    }),
  };
}
