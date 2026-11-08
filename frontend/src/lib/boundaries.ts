// Administrative boundaries exactly as the original static app loaded them:
// Italian regions (geojson-italy) + Corsica (france-geojson), fallback to the repo's Sardinia outline.
const IT_URL = "https://raw.githubusercontent.com/guglielmo/geojson-italy/main/geojson/limits_IT_regions.geojson";
const FR_URL = "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/regions-version-simplifiee.geojson";
const FALLBACK_URL = "https://raw.githubusercontent.com/matteotidili/sardegna-meteolive-web/main/data/sardegna.geojson";

export const BOUNDARY_HALO = { color: "#06111c", weight: 3.6, opacity: 0.74 };
export const BOUNDARY_LINE = { color: "#f7fbff", weight: 1.3, opacity: 0.94 };

let cache: Promise<GeoJSON.FeatureCollection> | null = null;

async function getJson(url: string): Promise<GeoJSON.FeatureCollection> {
  const r = await fetch(url, { cache: "force-cache" });
  if (!r.ok) throw new Error(`confini ${r.status}`);
  return r.json();
}

async function load(): Promise<GeoJSON.FeatureCollection> {
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

export function loadBoundaries(): Promise<GeoJSON.FeatureCollection> {
  if (!cache) cache = load().catch((e) => { cache = null; throw e; });
  return cache;
}
