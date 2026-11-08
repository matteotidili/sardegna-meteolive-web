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
  "dpcn-sardegna": [30, 180], "aeronautica-militare": [90, 240], ecowitt: [30, 180], cedoc: [90, 180],
};
const NETWORKS: [string, string, string][] = [
  ["dpcn-sardegna", "MeteoHub / DPCN", "data/stations.json"],
  ["aeronautica-militare", "Aeronautica Militare", "data/am.json"],
  ["ecowitt", "Ecowitt", "data/ecowitt.json"],
];

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
  const results = await Promise.all(NETWORKS.map(([, , path]) => getJson(path)));
  NETWORKS.forEach(([key, label], i) => {
    const { data, retained } = results[i];
    const p = (data ?? {}) as Json;
    const rows = ((p.stations as Json[]) ?? []).map((r) => normalize(r, key, now, today)).filter(Boolean) as Station[];
    stations.push(...rows);
    networks.push(status(key, label, (p.source as string) ?? label, rows, p, {
      using_last_valid: retained,
      warning: !data ? "Sorgente non raggiungibile: nessun dato disponibile." : retained ? "Aggiornamento non riuscito: mostrato l'ultimo dataset valido scaricato." : null,
    }));
  });
  // CEDOC: live file, otherwise last valid snapshot explicitly marked as such
  const live = ((await getJson("data/cedoc.json")).data ?? {}) as Json;
  let rows = ((live.stations as Json[]) ?? []).map((r) => normalize(r, "cedoc", now, today, true)).filter(Boolean) as Station[];
  let opts: Partial<NetworkStatus> = { warning: (live.warning as string) ?? null };
  let payload = live;
  if (!rows.length) {
    const lv = ((await getJson("data/cedoc_last_valid.json", 600)).data ?? {}) as Json;
    rows = ((lv.stations as Json[]) ?? []).map((r) => normalize(r, "cedoc", now, today, true)).filter(Boolean) as Station[];
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
async function forecastJson(): Promise<Json> {
  const { data } = await getJson<Json>("data/arome/forecast.json", 300);
  if (!data || !parse(data.run_time)) throw new Error("Catalogo AROME non disponibile");
  return data;
}

export async function getArome(): Promise<AromeResponse> {
  const d = await forecastJson();
  const run = parse(d.run_time)!;
  const frames: AromeFrame[] = ((d.frames as Json[]) ?? []).flatMap((f) => {
    const img = String(f.image ?? ""), vt = parse(f.valid_time);
    return /^data\/arome\/precip_h\d{2}\.png$/.test(img) && vt
      ? [{ lead_hours: Number(f.lead_hours), valid_time: iso(vt)!, precip_url: DATA_BASE + img, max_mm: num(f.max_mm) }] : [];
  });
  const horizon = Number(d.forecast_horizon_hours ?? 0);
  const parameters: AromeParameter[] = Object.entries((d.parameters ?? {}) as Record<string, Json>).map(([key, p]) => ({
    key, label: String(p.label ?? key), unit: String(p.unit ?? ""), group: String(p.group ?? ""), scale: String(p.scale ?? ""),
    stops: (p.stops as AromeParameter["stops"]) ?? [], phase_colors: (p.phase_colors as AromeParameter["phase_colors"]) ?? null,
  }));
  const tpl = DATA_BASE + String(d.product_path_template ?? "data/arome/products/{parameter}/h{lead:02d}.webp").replace("{lead:02d}", "{lead}");
  return {
    model: String(d.model ?? "AROME"), producer: String(d.producer ?? "Météo-France"), license: (d.license as string) ?? null,
    run_time: iso(run)!, generated_at: (d.generated_at as string) ?? null,
    run_age_hours: Math.round(((Date.now() - run.getTime()) / 3600000) * 10) / 10, horizon_hours: horizon,
    bounds: (d.bounds as [number, number][]) ?? [], domain_note: (d.domain_note as string) ?? null,
    product_url_template: tpl, parameters, frames, complete: horizon > 0 && frames.length === horizon,
  };
}

export async function getWindMeta(): Promise<WindMeta> {
  const { data } = await getJson<Json>("data/arome/wind_vectors.json", 300);
  if (!data?.grid || !data.run_time) throw new Error("Vettori vento AROME non disponibili");
  const g = data.grid as Json;
  return {
    run_time: iso(parse(data.run_time))!,
    grid: { west: +g.west!, east: +g.east!, north: +g.north!, south: +g.south!, step_degrees: +g.step_degrees!, width: +g.width!, height: +g.height!, encoding: String(g.encoding), missing: num(g.missing) ?? -32768 },
    frames: ((data.frames as Json[]) ?? []).filter((f) => String(f.file).endsWith(".bin"))
      .map((f) => ({ lead_hours: Number(f.lead_hours), valid_time: String(f.valid_time), url: DATA_BASE + String(f.file) })),
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
  const tpl = DATA_BASE + String(d.product_path_template ?? "data/arome/products/{parameter}/h{lead:02d}.webp");
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
