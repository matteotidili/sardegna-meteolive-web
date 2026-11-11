/*
 * Browser-side data layer — the app must also run as a STATIC site (GitHub Pages),
 * so every rule of the former FastAPI aggregator lives here:
 * freshness from each station's own observation time, CEDOC last-valid fallback,
 * Sardinia-only MeteoAlarm warnings, AROME catalogue, EUMETSAT frame probing,
 * station-vs-model point values. Upstream files are cache-busted per minute.
 */
import type {
  AlertWarning, AlertsResponse, AromeFrame, AromeParameter, AromeResponse, FireDetection, Freshness, FrpResponse,
  ModelPoint, NetworkStatus, PointValue, RadarFrames, Rain48Response, SatelliteFrames, Station, StationsResponse,
  WindGrid, WindMeta,
} from "@/lib/types";
import { decodeWind, sampleWind } from "@/lib/windFlow";

export const DATA_BASE = "https://raw.githubusercontent.com/matteotidili/sardegna-meteolive-data/main/";
const RADAR_API = "https://radar-api.protezionecivile.it";
const SAT_WMS = "https://view.eumetsat.int/geoserver/wms";

type Json = Record<string, unknown>;
const lastGood = new Map<string, unknown>();

async function getJson<T = Json>(path: string, bustSec = 60): Promise<{ data: T | null; retained: boolean }> {
  const url = (path.startsWith("http") ? path : DATA_BASE + path);
  const sep = url.includes("?") ? "&" : "?";
  try {
    const r = await fetch(`${url}${sep}t=${Math.floor(Date.now() / 1000 / bustSec)}`, { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    const d = (await r.json()) as T;
    lastGood.set(url, d);
    return { data: d, retained: false };
  } catch {
    const prev = lastGood.get(url) as T | undefined; // keep last valid copy, flagged as retained
    return { data: prev ?? null, retained: prev !== undefined };
  }
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || typeof v === "boolean" || v === "") return null;
  const f = Number(v);
  return Number.isFinite(f) ? f : null;
};
const parse = (ts: unknown): Date | null => {
  if (!ts) return null;
  const s = String(ts);
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};
const iso = (d: Date | null) => (d ? d.toISOString().replace(/\.\d{3}Z$/, "Z") : null);
const romeDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(d);

// ---------------------------------------------------------------- stations
const THRESHOLDS: Record<string, [number, number]> = {
  "dpcn-sardegna": [30, 180], "aeronautica-militare": [90, 240], ecowitt: [30, 180], meteonetwork: [30, 180], cedoc: [90, 180],
};
const NETWORKS: [string, string, string][] = [
  ["dpcn-sardegna", "MeteoHub / DPCN", "data/stations.json"],
  ["aeronautica-militare", "Aeronautica Militare", "data/am.json"],
  ["ecowitt", "Ecowitt", "data/ecowitt.json"],
  ["meteonetwork", "MeteoNetwork", "data/meteonetwork.json"],
];
/** Networks shown only once their collector has published at least one file (no red status before activation). */
const OPTIONAL_NETWORKS = new Set(["meteonetwork"]);

function normalize(raw: Json, network: string, now: Date, today: string, rainOnly = false): Station | null {
  const lat = num(raw.lat), lon = num(raw.lon);
  if (lat === null || lon === null) return null;
  const last = parse(raw.last);
  const obsDay = last ? romeDay(last) : null;
  const avail = (raw.available ?? {}) as Record<string, boolean>;
  const g = (field: string, key: string) => (rainOnly && !field.startsWith("rain") ? null : avail[key] === false ? null : num(raw[field]));
  const s: Station = {
    id: `${network}:${raw.station_id ?? raw.icao ?? raw.name}`,
    name: String(raw.name ?? "Senza nome"), network, lat, lon,
    elev: num(raw.elev), elev_source: num(raw.elev) !== null ? "rete" : null,
    temp: g("temp", "temp"), tmin: g("tmin", "temp"), tmax: g("tmax", "temp"),
    tmin_provisional: (raw.tmin_provisional as boolean) ?? null, tmax_provisional: (raw.tmax_provisional as boolean) ?? null,
    rh: g("rh", "rh"), wind_kmh: g("wind_kmh", "wind"), wind_dir: g("wind_dir", "wind_dir"), gust_kmh: g("gust_kmh", "gust"),
    rain_rate: g("rain_rate", "rain"), rain_today: g("rain_today", "rain"),
    rain_48h: num(raw.rain_48h), rain_48h_source: (raw.rain_48h_source as string) ?? null,
    pressure_hpa: rainOnly ? null : num(raw.pressure_hpa),
    last: iso(last), obs_day: obsDay, is_today: obsDay === today, age_min: null, freshness: "unavailable",
    rain_only: rainOnly, observation_type: (raw.observation_type as string) ?? null,
    raw_message: ((raw.raw_metar ?? raw.raw_synop) as string) ?? null, source_url: (raw.source_url as string) ?? null,
  };
  const hasValue = [s.temp, s.rh, s.wind_kmh, s.rain_rate, s.rain_today, s.tmin, s.tmax].some((v) => v !== null);
  if (last && hasValue) {
    const age = Math.max(0, (now.getTime() - last.getTime()) / 60000);
    const [fresh, stale] = THRESHOLDS[network] ?? [60, 180];
    s.age_min = Math.round(age * 10) / 10;
    s.freshness = (age <= fresh ? "fresh" : age <= stale ? "stale" : "historic") as Freshness;
  }
  return s;
}

function status(key: string, label: string, source: string, rows: Station[], p: Json, o: Partial<NetworkStatus> = {}): NetworkStatus {
  const c = (f: Freshness) => rows.filter((s) => s.freshness === f).length;
  const lasts = rows.map((s) => s.last).filter(Boolean) as string[];
  return {
    key, label, source,
    status: o.status ?? (!rows.length ? "unavailable" : c("fresh") === 0 ? "degraded" : "ok"),
    generated_at: (p.generated_at as string) ?? null, checked_at: (p.checked_at as string) ?? null,
    latest_obs: lasts.length ? lasts.sort().at(-1)! : null, station_count: rows.length,
    fresh_count: c("fresh"), stale_count: c("stale"), historic_count: c("historic"),
    using_last_valid: o.using_last_valid ?? false, warning: o.warning ?? null,
  };
}

export async function getStations(): Promise<StationsResponse> {
  const now = new Date(), today = romeDay(now);
  const stations: Station[] = [], networks: NetworkStatus[] = [];
  const [results, elev] = await Promise.all([Promise.all(NETWORKS.map(([, , path]) => getJson(path))), getElevations()]);
  const withDtm = (s: Station, raw: Json) => {
    if (s.elev !== null) return s; // network-declared elevation always wins
    const e = elev.get(`${s.network}|${raw.station_id ?? ""}`) ?? elev.get(`${s.network}|${raw.name ?? ""}`);
    if (e) { s.elev = e.elev; s.elev_source = e.source; }
    return s;
  };
  NETWORKS.forEach(([key, label], i) => {
    if (OPTIONAL_NETWORKS.has(key) && !results[i].data) return;
    const { data, retained } = results[i];
    const p = (data ?? {}) as Json;
    const rows = ((p.stations as Json[]) ?? []).flatMap((r) => { const s = normalize(r, key, now, today); return s ? [withDtm(s, r)] : []; });
    stations.push(...rows);
    networks.push(status(key, label, (p.source as string) ?? label, rows, p, {
      using_last_valid: retained,
      warning: !data ? "Sorgente non raggiungibile: nessun dato disponibile." : retained ? "Aggiornamento non riuscito: mostrato l'ultimo dataset valido scaricato." : null,
    }));
  });
  // CEDOC: live file, otherwise last valid snapshot explicitly marked as such
  const live = ((await getJson("data/cedoc.json")).data ?? {}) as Json;
  let rows = ((live.stations as Json[]) ?? []).flatMap((r) => { const s = normalize(r, "cedoc", now, today, true); return s ? [withDtm(s, r)] : []; });
  let opts: Partial<NetworkStatus> = { warning: (live.warning as string) ?? null };
  let payload = live;
  if (!rows.length) {
    const lv = ((await getJson("data/cedoc_last_valid.json", 600)).data ?? {}) as Json;
    rows = ((lv.stations as Json[]) ?? []).flatMap((r) => { const s = normalize(r, "cedoc", now, today, true); return s ? [withDtm(s, r)] : []; });
    if (rows.length) {
      payload = { ...lv, checked_at: live.generated_at };
      opts = { status: "degraded", using_last_valid: true,
        warning: `${(live.warning as string) ?? "Portale CEDOC non disponibile."} Mostrato l'ultimo snapshot valido (${lv.local_day ?? "data ignota"}), NON aggiornato.` };
    }
  }
  stations.push(...rows);
  networks.push(status("cedoc", "CEDOC Pluviometri", (live.source as string) ?? "Sardegna CEDOC / ADIS", rows, payload, opts));
  return { server_time: iso(now)!, local_day: today, stations, networks };
}

// ---------------------------------------------------------------- alerts
export async function getAlerts(): Promise<AlertsResponse> {
  const { data } = await getJson<Json>("data/meteoalarm.json", 300);
  if (!data) return { source: "MeteoAlarm", feed_updated: null, generated_at: null, active_count: 0, upcoming_count: 0, max_level: 0, warnings: [], available: false };
  const now = Date.now(), regions = (data.regions ?? {}) as Record<string, { geometry?: GeoJSON.Geometry }>;
  const out: AlertWarning[] = [];
  for (const w of (data.warnings as Json[]) ?? []) {
    const code = String(w.emma_id ?? "").toUpperCase(), area = String(w.area_desc ?? "");
    if (code !== "IT019" && !/\b(sardegna|sardinia)\b/i.test(area)) continue;
    const exp = parse(w.expires), level = num(w.level) ?? 0;
    if (level < 2 || !exp || exp.getTime() <= now) continue;
    const onset = parse(w.onset ?? w.effective);
    out.push({
      id: String(w.id), status: onset && onset.getTime() <= now ? "active" : "upcoming", level, level_name: String(w.level_name ?? ""),
      event: String(w.event ?? ""), type_name: (w.type_name as string) ?? null, area_desc: area, onset: iso(onset), expires: iso(exp),
      severity: (w.severity as string) ?? null, certainty: (w.certainty as string) ?? null, cap_url: (w.cap_url as string) ?? null,
      geometry: (w.geometry as GeoJSON.Geometry) ?? regions[code]?.geometry ?? null,
    });
  }
  out.sort((a, b) => Number(a.status !== "active") - Number(b.status !== "active") || b.level - a.level || (a.onset ?? "").localeCompare(b.onset ?? ""));
  return {
    source: "MeteoAlarm / EUMETNET", feed_updated: (data.feed_updated as string) ?? null, generated_at: (data.generated_at as string) ?? null,
    active_count: out.filter((a) => a.status === "active").length, upcoming_count: out.filter((a) => a.status === "upcoming").length,
    max_level: Math.max(0, ...out.map((a) => a.level)), warnings: out, available: true,
  };
}

// ---------------------------------------------------------------- AROME
// Published filenames are reused at each model run. A distinct URL per run is
// needed for browser, image-warp and React Query caches to reload the fields.
function aromeAsset(path: string, runTime: string): string {
  const url = DATA_BASE + path;
  return `${url}${url.includes("?") ? "&" : "?"}run=${encodeURIComponent(runTime)}`;
}

async function forecastJson(): Promise<Json> {
  const { data } = await getJson<Json>("data/arome/forecast.json", 300);
  if (!data || !parse(data.run_time)) throw new Error("Catalogo AROME non disponibile");
  return data;
}

export async function getArome(): Promise<AromeResponse> {
  const d = await forecastJson();
  const run = parse(d.run_time)!;
  const runTime = iso(run)!;
  const frames: AromeFrame[] = ((d.frames as Json[]) ?? []).flatMap((f) => {
    const img = String(f.image ?? ""), vt = parse(f.valid_time);
    return /^data\/arome\/precip_h\d{2}\.png$/.test(img) && vt
      ? [{ lead_hours: Number(f.lead_hours), valid_time: iso(vt)!, precip_url: aromeAsset(img, runTime), max_mm: num(f.max_mm) }] : [];
  });
  const horizon = Number(d.forecast_horizon_hours ?? 0);
  const parameters: AromeParameter[] = Object.entries((d.parameters ?? {}) as Record<string, Json>).map(([key, p]) => ({
    key, label: String(p.label ?? key), unit: String(p.unit ?? ""), group: String(p.group ?? ""), scale: String(p.scale ?? ""),
    stops: (p.stops as AromeParameter["stops"]) ?? [], phase_colors: (p.phase_colors as AromeParameter["phase_colors"]) ?? null,
  }));
  const tpl = aromeAsset(String(d.product_path_template ?? "data/arome/products/{parameter}/h{lead:02d}.webp"), runTime).replace("{lead:02d}", "{lead}");
  return {
    model: String(d.model ?? "AROME"), producer: String(d.producer ?? "Météo-France"), license: (d.license as string) ?? null,
    run_time: runTime, generated_at: (d.generated_at as string) ?? null,
    run_age_hours: Math.round(((Date.now() - run.getTime()) / 3600000) * 10) / 10, horizon_hours: horizon,
    bounds: (d.bounds as [number, number][]) ?? [], domain_note: (d.domain_note as string) ?? null,
    product_url_template: tpl, parameters, frames, complete: horizon > 0 && frames.length === horizon,
  };
}

export async function getWindMeta(): Promise<WindMeta> {
  const { data } = await getJson<Json>("data/arome/wind_vectors.json", 300);
  if (!data?.grid || !data.run_time) throw new Error("Vettori vento AROME non disponibili");
  const g = data.grid as Json;
  const runTime = iso(parse(data.run_time));
  if (!runTime) throw new Error("Corsa dei vettori vento AROME non valida");
  return {
    run_time: runTime,
    grid: { west: +g.west!, east: +g.east!, north: +g.north!, south: +g.south!, step_degrees: +g.step_degrees!, width: +g.width!, height: +g.height!, encoding: String(g.encoding), missing: num(g.missing) ?? -32768 },
    frames: ((data.frames as Json[]) ?? []).filter((f) => String(f.file).endsWith(".bin"))
      .map((f) => ({ lead_hours: Number(f.lead_hours), valid_time: String(f.valid_time), url: aromeAsset(String(f.file), runTime) })),
  };
}

// ---- station vs model (pixel colour inversion on the published WebP; wind from exact U/V vectors)
const pixelCache = new Map<string, Promise<ImageData | null>>();
function imageData(url: string): Promise<ImageData | null> {
  const hit = pixelCache.get(url);
  if (hit) return hit;
  const p = new Promise<ImageData | null>((res) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => {
      const c = document.createElement("canvas");
      c.width = im.naturalWidth; c.height = im.naturalHeight;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return res(null);
      ctx.drawImage(im, 0, 0);
      try { res(ctx.getImageData(0, 0, c.width, c.height)); } catch { res(null); }
    };
    im.onerror = () => res(null);
    im.src = url;
  });
  pixelCache.set(url, p);
  while (pixelCache.size > 6) pixelCache.delete(pixelCache.keys().next().value as string);
  return p;
}

function invert(rgb: number[], stops: [number, number[]][]): number | null {
  let bestD = Infinity, bestV: number | null = null;
  for (let j = 1; j < stops.length; j++) {
    const [v0, c0] = stops[j - 1], [v1, c1] = stops[j];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const d = (c0[0] + (c1[0] - c0[0]) * t - rgb[0]) ** 2 + (c0[1] + (c1[1] - c0[1]) * t - rgb[1]) ** 2 + (c0[2] + (c1[2] - c0[2]) * t - rgb[2]) ** 2;
      if (d < bestD) { bestD = d; bestV = v0 + (v1 - v0) * t; }
    }
  }
  return Math.sqrt(bestD) <= 14 ? bestV : null;
}

const POINT_PARAMS = ["t2m", "rh2m", "gust10"];
const windCache = new Map<string, Promise<ReturnType<typeof decodeWind> | null>>();

export async function getModelPoint(lat: number, lon: number, at: string): Promise<ModelPoint> {
  const d = await forecastJson();
  const target = parse(at) ?? new Date();
  const frames = ((d.frames as Json[]) ?? []).map((f) => ({ f, vt: parse(f.valid_time) })).filter((x) => x.vt) as { f: Json; vt: Date }[];
  if (!frames.length) throw new Error("Nessuna scadenza AROME");
  const best = frames.reduce((a, b) => (Math.abs(b.vt.getTime() - target.getTime()) < Math.abs(a.vt.getTime() - target.getTime()) ? b : a));
  const offset = (best.vt.getTime() - target.getTime()) / 60000;
  if (Math.abs(offset) > 90) throw new Error("Orario fuori dall'intervallo coperto dalla corsa AROME");
  const lead = Number(best.f.lead_hours), lead2 = String(lead).padStart(2, "0");
  const params = (d.parameters ?? {}) as Record<string, Json>;
  const [[s, w], [n, e]] = d.bounds as [number, number][];
  const tpl = aromeAsset(String(d.product_path_template ?? "data/arome/products/{parameter}/h{lead:02d}.webp"), iso(parse(d.run_time))!);
  const inDomain = lat >= s && lat <= n && lon >= w && lon <= e;

  const color = async (key: string): Promise<PointValue | null> => {
    const p = params[key];
    if (!p?.stops) return null;
    let value: number | null = null;
    if (inDomain) {
      const img = await imageData(tpl.replace("{parameter}", key).replace("{lead:02d}", lead2));
      if (img) {
        const x = Math.min(img.width - 1, Math.floor(((lon - w) / (e - w)) * img.width));
        const y = Math.min(img.height - 1, Math.floor(((n - lat) / (n - s)) * img.height));
        const k = (y * img.width + x) * 4;
        if (img.data[k + 3] > 0) value = invert([img.data[k], img.data[k + 1], img.data[k + 2]], p.stops as [number, number[]][]);
      }
    }
    return { key, label: String(p.label ?? key), unit: String(p.unit ?? ""), value: value === null ? null : Math.round(value * 10) / 10, direction_deg: null, method: "scala cromatica" };
  };
  const values = (await Promise.all(POINT_PARAMS.map(color))).filter(Boolean) as PointValue[];

  try {
    const wm = await getWindMeta();
    const wf = wm.run_time === iso(parse(d.run_time)) ? wm.frames.find((f) => f.lead_hours === lead) : undefined;
    if (wf) {
      if (!windCache.has(wf.url)) windCache.set(wf.url, fetch(wf.url).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? decodeWind(b, wm.grid as WindGrid) : null)).catch(() => null));
      const field = await windCache.get(wf.url)!;
      const uv = field ? sampleWind(field, lon, lat) : null;
      values.splice(1, 0, {
        key: "wind10", label: "Vento medio 10 m", unit: "km/h", method: "vettori U/V",
        value: uv ? Math.round(Math.hypot(uv[0], uv[1]) * 3.6 * 10) / 10 : null,
        direction_deg: uv ? Math.round(((Math.atan2(-uv[0], -uv[1]) * 180) / Math.PI + 360) % 360) : null,
      });
    }
  } catch { /* wind optional */ }

  return {
    run_time: iso(parse(d.run_time))!, lead_hours: lead, valid_time: iso(best.vt)!, offset_min: Math.round(offset * 10) / 10, values,
    note: "Valori AROME nel punto griglia più vicino; T, UR e raffica stimati invertendo la scala cromatica dei prodotti pubblicati; vento dai vettori U/V a 0,1°. Previsione, non osservazione.",
  };
}

// ---------------------------------------------------------------- radar / FRP / rain48
export async function getRadar(product: string): Promise<RadarFrames> {
  const r = await fetch(`${RADAR_API}/findLastProductByType?type=${product}&lang=it`, { cache: "no-store" });
  if (!r.ok) throw new Error("Radar-DPC non disponibile");
  const ms = Number(((await r.json()) as { lastProducts?: { time: number }[] }).lastProducts?.[0]?.time);
  if (!Number.isFinite(ms)) throw new Error("Radar-DPC: ultimo prodotto non disponibile");
  const frames = Array.from({ length: 37 }, (_, i) => iso(new Date(ms - (36 - i) * 5 * 60000))!);
  return { product, latest_time: iso(new Date(ms))!, step_minutes: 5, frames };
}

export async function getFrp(): Promise<FrpResponse> {
  const d = ((await getJson<Json>("data/frp.json", 300)).data ?? {}) as Json;
  const detections: FireDetection[] = ((d.features as Json[]) ?? []).flatMap((f) => {
    const g = (f.geometry ?? {}) as { type?: string; coordinates?: number[] }, p = (f.properties ?? {}) as Json;
    return g.type === "Point" && g.coordinates && g.coordinates.length >= 2
      ? [{ lon: g.coordinates[0], lat: g.coordinates[1], frp_mw: num(p.frp ?? p.frp_mw ?? p.FRP), confidence: p.confidence != null ? String(p.confidence) : null, time: (p.time ?? p.datetime ?? null) as string | null }] : [];
  });
  return { source: String(d.source ?? "EUMETSAT"), product: String(d.product ?? "MTG FCI FRP"), generated_at: (d.generated_at as string) ?? null,
    window_minutes: num(d.window_minutes), latest_detection: (d.latest_detection as string) ?? null, detections };
}

export async function getRain48(): Promise<Rain48Response> {
  const d = ((await getJson<Json>("data/rain_48h.json", 300)).data ?? {}) as Json;
  const n = ((d.stations as unknown[]) ?? []).length;
  return { generated_at: (d.generated_at as string) ?? null, description: (d.description as string) ?? null, coverage_note: (d.coverage_note as string) ?? null, station_count: n, operational: n > 0 };
}

// ---------------------------------------------------------------- terrain elevation estimates
// station_elevations.json (published by the data repo): ground elevation at the coordinates from the
// Regione Sardegna DTM 10 m (fallback SRTM 30 m) — terrain height, NOT the declared sensor elevation.
let elevPromise: Promise<Map<string, { elev: number; source: string }>> | null = null;
function getElevations() {
  if (!elevPromise) {
    elevPromise = getJson<Json>("data/station_elevations.json", 86400).then(({ data }) => {
      const m = new Map<string, { elev: number; source: string }>();
      for (const s of ((data?.stations as Json[]) ?? [])) {
        const e = num(s.elev);
        if (e === null) continue;
        const v = { elev: e, source: s.method === "regional_dtm_10m" ? "dtm10" : s.method === "srtm30m" ? "srtm30" : String(s.method ?? "stima") };
        if (s.station_id) m.set(`${s.network}|${s.station_id}`, v);
        if (s.name) m.set(`${s.network}|${s.name}`, v);
      }
      return m;
    }).catch(() => { elevPromise = null; return new Map(); });
  }
  return elevPromise;
}

/** Last-resort terrain estimate for stations absent from the published dataset: Mapterhorn terrarium DEM (z12). */
export async function getDemElevation(lat: number, lon: number): Promise<number | null> {
  const z = 12, size = 512, n = 2 ** z;
  const px = ((lon + 180) / 360) * n * size;
  const latR = (lat * Math.PI) / 180;
  const py = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n * size;
  const tx = Math.floor(px / size), ty = Math.floor(py / size);
  const r = await fetch(`https://tiles.mapterhorn.com/${z}/${tx}/${ty}.webp`);
  if (!r.ok) return null;
  const bmp = await createImageBitmap(await r.blob());
  const c = document.createElement("canvas");
  c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bmp, 0, 0);
  const [R, G, B, A] = ctx.getImageData(Math.floor(px - tx * size), Math.floor(py - ty * size), 1, 1).data;
  if (A === 0) return null;
  return Math.round(R * 256 + G + B / 256 - 32768);
}

// ---------------------------------------------------------------- station 24 h history
export interface HistoryPoint { t: number; temp: number | null; rain: number | null }
export interface StationHistory {
  points: HistoryPoint[]; // epoch ms, °C, daily rain counter mm
  tempSource: string | null; rainSource: string | null; generatedAt: string | null; tempPublished: boolean;
}

export async function getStationHistory(s: Station): Promise<StationHistory> {
  const key = s.id.replace(/^([^:]+):/, "$1|");
  const [hist, rain] = await Promise.all([getJson<Json>("data/station_history_24h.json", 300), getJson<Json>("data/rain_history.json", 300)]);
  const cut = Date.now() - 24 * 3600_000;
  const points = new Map<number, HistoryPoint>();
  const at = (t: number) => points.get(t) ?? points.set(t, { t, temp: null, rain: null }).get(t)!;
  // station_history_v1: [epoch_min, temp_tenths|null, rain_today_tenths|null] — real observation times
  const hs = (hist.data?.series as Record<string, (number | null)[][]> | undefined)?.[key] ?? [];
  for (const [m, t10, r10] of hs) {
    const t = Number(m) * 60000;
    if (t < cut) continue;
    if (t10 != null) at(t).temp = t10 / 10;
    if (r10 != null) at(t).rain = r10 / 10;
  }
  let rainSource: string | null = hs.some((p) => p[2] != null) ? "station_history_24h.json" : null;
  if (!rainSource) {
    // daily_counter_timeseries_v1 (rain 48 h chain): [epoch_min, rain_today_tenths]
    const rs = ((rain.data?.series ?? {}) as Record<string, number[][]>);
    const series = rs[key] ?? rs[`${s.network}|${s.name}`] ?? [];
    for (const [m, r10] of series) { const t = m * 60000; if (t >= cut) at(t).rain = r10 / 10; }
    if (series.length) rainSource = "rain_history.json";
  }
  return {
    points: [...points.values()].sort((a, b) => a.t - b.t),
    tempSource: hs.some((p) => p[1] != null) ? "station_history_24h.json" : null, rainSource,
    generatedAt: (hist.data?.generated_at as string) ?? (rain.data?.generated_at as string) ?? null,
    tempPublished: !!hist.data,
  };
}

// ---------------------------------------------------------------- EUMETNET OPERA (RadarEU NIMBUS rain-rate tiles)
export const OPERA_TILE_BASE = "https://tiles.radareu.cz/tiles/nimbus/rate/";
export const operaStamp = (iso: string) => {
  const x = new Date(iso), p = (n: number) => String(n).padStart(2, "0");
  return `${x.getUTCFullYear()}${p(x.getUTCMonth() + 1)}${p(x.getUTCDate())}T${p(x.getUTCHours())}${p(x.getUTCMinutes())}`;
};
const operaProbe = (d: Date) => new Promise<boolean>((res) => {
  const im = new Image();
  const t = window.setTimeout(() => res(false), 4000);
  im.onload = () => { clearTimeout(t); res(im.naturalWidth > 0); };
  im.onerror = () => { clearTimeout(t); res(false); };
  im.src = `${OPERA_TILE_BASE}${operaStamp(d.toISOString())}/0/0/0.png?probe=${Math.floor(Date.now() / 60000)}`;
});

export async function getOpera(): Promise<RadarFrames> {
  const step = 15 * 60000, start = Math.floor(Date.now() / step) * step;
  let latest: Date | null = null;
  for (let i = 0; i < 16 && !latest; i++) { const d = new Date(start - i * step); if (await operaProbe(d)) latest = d; }
  if (!latest) throw new Error("OPERA: nessun frame disponibile");
  const cands = Array.from({ length: 12 }, (_, i) => new Date(latest!.getTime() - (11 - i) * step));
  const ok = await Promise.all(cands.map((d, i) => (i === 11 ? true : operaProbe(d))));
  const frames = cands.filter((_, i) => ok[i]).map((d) => iso(d)!); // only frames that really exist
  return { product: "OPERA", latest_time: iso(latest)!, step_minutes: 15, frames };
}

// ---------------------------------------------------------------- EUMETSAT MTG
const SAT: Record<string, [string, string, string, string, number, boolean]> = {
  truecolour: ["mtg_fd:rgb_truecolour", "MTG FCI True Colour RGB", "© EUMETSAT · MTG FCI True Colour RGB", "image/jpeg", 10, true],
  ir105: ["mtg_fd:ir105_hrfi", "MTG FCI IR10.5 µm HRFI", "© EUMETSAT · MTG FCI HRFI IR10.5 µm", "image/jpeg", 10, false],
  cloudphase: ["mtg_fd:rgb_cloudphase", "MTG Cloud Phase RGB", "© EUMETSAT · MTG FCI Cloud Phase RGB", "image/jpeg", 10, true],
  snowfog: ["mtg_fd:rgb_snow", "MTG Day Snow Fog RGB", "© EUMETSAT · MTG Day Snow Fog RGB", "image/jpeg", 10, true],
  preciprate: ["mtg_fd:h40b", "H SAF H40B Precipitation Rate", "© EUMETSAT / H SAF · H40B", "image/png", 10, false],
  li: ["mtg_fd:li_afa", "MTG Lightning Imager (archivio)", "© EUMETSAT · MTG LI Accumulated Flash Area", "image/png", 5, false],
};

async function probe(layer: string, t: Date, li: boolean): Promise<boolean> {
  const q = new URLSearchParams({
    service: "WMS", request: "GetMap", version: "1.1.1", layers: layer, styles: "", format: "image/png", transparent: "true", srs: "EPSG:4326",
    bbox: li ? "-12,28,35,48" : "7.2,38.2,10.8,41.8", width: li ? "128" : "48", height: li ? "64" : "48", time: t.toISOString(),
  });
  try {
    const r = await fetch(`${SAT_WMS}?${q}`, { cache: "force-cache" });
    if (!r.ok || !(r.headers.get("content-type") ?? "").includes("image")) return false;
    return (await r.blob()).size > (li ? 1500 : 500);
  } catch { return false; }
}

export async function getSatellite(product: string): Promise<SatelliteFrames> {
  const def = SAT[product];
  if (!def) throw new Error("Prodotto satellitare non supportato");
  const [layer, label, attribution, format, step, day] = def;
  const n = product === "li" ? 24 : 19, ms = step * 60000;
  const base = Math.floor(Date.now() / ms) * ms;
  const cands = Array.from({ length: n + 6 }, (_, i) => new Date(base - i * ms));
  const ok = await Promise.all(cands.map((t) => probe(layer, t, product === "li")));
  const avail = cands.filter((_, i) => ok[i]);
  if (!avail.length) throw new Error("EUMETSAT: nessun frame disponibile");
  const latest = avail[0];
  const frames = avail.filter((t) => latest.getTime() - t.getTime() <= ms * (n - 1)).reverse().map((t) => iso(t)!);
  return { product, label, layer, attribution, format, step_minutes: step, wms_url: SAT_WMS, bounds: [[31.5, -6], [49, 20]], frames, latest: iso(latest), daytime_only: day };
}
