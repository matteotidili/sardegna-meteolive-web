/** Public MeteoHub marine map services. No account, extraction or NetCDF download. */
export type MarineModel = "ww3" | "shyfem";
export type MarineParameter = "hs" | "t01" | "wl";
export type MarineForcing = "ECMWF" | "ICON" | "BOLAM";
export interface MarineCatalog {
  model: MarineModel;
  run_time: string;
  frames: string[];
  bounds: [number, number][];
  forcing?: MarineForcing;
  availableForcings: MarineForcing[];
  attribution: string;
  sourceUrl: string;
}
export interface MarineLayer { name: string; frames: string[]; bounds: [number, number][] }
export interface MarineScaleEntry { value: number; label: string; color: string; opacity: number }

const MAPS = "https://maps.mistralportal.it";
const WMS = `${MAPS}/wms`;
const SOURCE = "https://meteohub.agenziaitaliameteo.it/app/maps/marine";
const FORCINGS: MarineForcing[] = ["ECMWF", "ICON", "BOLAM"];
const HOUR = 3_600_000;
const TIMEOUT = 20_000;
const LAYERS = { hs: "ww3_hs-hs", t01: "ww3_t01-t01", wl: "SHYFEM-ICON-wl" };
const marineName = (name: string) => /^(ww3_(hs-hs|t01-t01)|SHYFEM-(ECMWF|ICON|BOLAM)-wl)$/.test(name);
const localName = (name: string) => name.split(":").at(-1)!;
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Compact status dates and zone-less service timestamps are UTC, never local time. */
export function marineRunTime(value: unknown): string {
  const text = String(value ?? "").trim();
  let normalized = text;
  if (/^\d{8}(\d{2})?$/.test(text)) {
    normalized = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T${text.slice(8, 10) || "00"}:00:00Z`;
  } else {
    normalized = text.replace(/ UTC$/, "Z").replace(" ", "T");
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) normalized += "T00:00:00Z";
    else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(normalized)) normalized += "Z";
  }
  const parts = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i);
  if (!parts || +parts[2] < 1 || +parts[2] > 12 || +parts[3] < 1
      || +parts[3] > new Date(Date.UTC(+parts[1], +parts[2], 0)).getUTCDate()
      || +parts[4] > 23 || +parts[5] > 59 || +(parts[6] ?? 0) > 59) throw new Error("Orario del modello marino non valido");
  const stamp = Date.parse(normalized);
  if (!Number.isFinite(stamp)) throw new Error("Orario del modello marino non valido");
  const iso = new Date(stamp).toISOString().replace(/\.000Z$/, "Z");
  if (/^\d{8}(\d{2})?$/.test(text) && iso !== normalized) throw new Error("Corsa del modello marino non valida");
  return iso;
}

async function readPublic(url: string, kind: "json" | "xml", signal?: AbortSignal, cache: RequestCache = "no-store"): Promise<unknown> {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Richiesta annullata", "AbortError");
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("Servizio marino non risponde", "TimeoutError")), TIMEOUT);
  try {
    const response = await fetch(url, { signal: controller.signal, mode: "cors", credentials: "omit", cache });
    if (!response.ok) throw new Error(`Servizio marino HTTP ${response.status}`);
    const data = kind === "xml" ? await response.text() : await response.json();
    if (controller.signal.aborted) throw controller.signal.reason;
    return data;
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

interface XmlNode { name: string; attrs: Record<string, string>; text: string; children: XmlNode[] }
const unescapeXml = (text: string) => text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, code: string) => {
  if (code[0] === "#") return String.fromCodePoint(code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10));
  return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[code.toLowerCase()] ?? match;
});

/** Small XML tree reader for public capabilities/SLD metadata; no DOM or external entities. */
function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: "document", attrs: {}, text: "", children: [] };
  const stack = [root];
  const tokens = xml.match(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\/?[^>]+>|[^<]+/g) ?? [];
  for (const token of tokens) {
    if (token.startsWith("<![CDATA[")) { stack.at(-1)!.text += token.slice(9, -3); continue; }
    if (token.startsWith("<!") || token.startsWith("<?")) continue;
    if (token.startsWith("</")) {
      if (stack.length === 1 || stack.at(-1)!.name !== localName(token.slice(2, -1).trim())) throw new Error("Metadati marini XML non validi");
      stack.pop();
    } else if (token.startsWith("<")) {
      const match = token.match(/^<([^\s/>]+)/);
      if (!match) throw new Error("Metadati marini XML non validi");
      const node: XmlNode = { name: localName(match[1]), attrs: {}, text: "", children: [] };
      for (const attr of token.matchAll(/([^\s=<>]+)\s*=\s*(["'])([\s\S]*?)\2/g)) node.attrs[attr[1].toLowerCase()] = unescapeXml(attr[3]);
      stack.at(-1)!.children.push(node);
      if (!token.endsWith("/>")) stack.push(node);
    } else stack.at(-1)!.text += unescapeXml(token);
  }
  if (stack.length !== 1) throw new Error("Metadati marini XML incompleti");
  return root;
}

const child = (node: XmlNode, name: string) => node.children.find((item) => item.name === name);
function descendants(node: XmlNode, name: string): XmlNode[] {
  return node.children.flatMap((item) => [...(item.name === name ? [item] : []), ...descendants(item, name)]);
}
function checkedBounds(south: number, west: number, north: number, east: number): [number, number][] {
  if (![south, west, north, east].every(Number.isFinite) || south >= north || west >= east || south < -90 || north > 90 || west < -180 || east > 180) {
    throw new Error("Dominio del modello marino non valido");
  }
  return [[south, west], [north, east]];
}
const mercatorX = (lon: number) => 6378137 * lon * Math.PI / 180;
const mercatorY = (lat: number) => 6378137 * Math.log(Math.tan(Math.PI / 4 + Math.max(-85.051129, Math.min(85.051129, lat)) * Math.PI / 360));

function layerBounds(node: XmlNode, version: string): [number, number][] | undefined {
  const geographic = child(node, "EX_GeographicBoundingBox");
  if (geographic) return checkedBounds(Number(child(geographic, "southBoundLatitude")?.text), Number(child(geographic, "westBoundLongitude")?.text),
    Number(child(geographic, "northBoundLatitude")?.text), Number(child(geographic, "eastBoundLongitude")?.text));
  const latLon = child(node, "LatLonBoundingBox");
  if (latLon) return checkedBounds(+latLon.attrs.miny, +latLon.attrs.minx, +latLon.attrs.maxy, +latLon.attrs.maxx);
  const boxes = node.children.filter((item) => item.name === "BoundingBox");
  const box = boxes.find((item) => (item.attrs.crs ?? item.attrs.srs) === "CRS:84")
    ?? boxes.find((item) => (item.attrs.crs ?? item.attrs.srs) === "EPSG:4326");
  if (!box) return undefined;
  const a = box.attrs;
  return (a.crs ?? a.srs) === "EPSG:4326" && version.startsWith("1.3")
    ? checkedBounds(+a.minx, +a.miny, +a.maxx, +a.maxy)
    : checkedBounds(+a.miny, +a.minx, +a.maxy, +a.maxx);
}

function timeValues(value: string): string[] {
  const times = new Set<string>();
  for (const item of value.split(",").map((part) => part.trim()).filter(Boolean)) {
    if (!item.includes("/")) { times.add(marineRunTime(item)); continue; }
    const [first, last, period] = item.split("/");
    const duration = period?.match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
    const step = duration ? ((+(duration[1] ?? 0) * 24 + +(duration[2] ?? 0)) * 3600 + +(duration[3] ?? 0) * 60 + +(duration[4] ?? 0)) * 1000 : 0;
    const start = Date.parse(marineRunTime(first)), end = Date.parse(marineRunTime(last));
    if (step <= 0 || end < start || (end - start) / step > 5000) throw new Error("Intervallo temporale marino non valido");
    for (let stamp = start; stamp <= end; stamp += step) times.add(marineRunTime(new Date(stamp).toISOString()));
  }
  return [...times].sort((a, b) => Date.parse(a) - Date.parse(b));
}

/** Read namespaces, inherited time extents and geographic bounds from either WMS version. */
export function parseMarineCapabilities(xml: string): Map<string, MarineLayer> {
  const root = parseXml(xml);
  const version = root.children[0]?.attrs.version ?? "1.3.0";
  const layers = new Map<string, MarineLayer>();
  const visit = (node: XmlNode, inheritedTime = "", inheritedBounds?: [number, number][]) => {
    let time = inheritedTime, bounds = inheritedBounds;
    if (node.name === "Layer") {
      time = node.children.find((item) => ["Dimension", "Extent"].includes(item.name) && item.attrs.name?.toLowerCase() === "time" && item.text.trim())?.text.trim() ?? time;
      bounds = layerBounds(node, version) ?? bounds;
      const name = child(node, "Name")?.text.trim() ?? "";
      const key = localName(name);
      if (marineName(key) && bounds && time) layers.set(key, { name, frames: timeValues(time), bounds });
    }
    node.children.forEach((item) => visit(item, time, bounds));
  };
  visit(root);
  return layers;
}

function wmsUrl(request: string): URL {
  const url = new URL(WMS);
  url.searchParams.set("service", "WMS");
  url.searchParams.set("version", request === "GetCapabilities" ? "1.3.0" : "1.1.1");
  url.searchParams.set("request", request);
  return url;
}

export async function getMarineCatalog(model: MarineModel, forcing: MarineForcing = "ECMWF", signal?: AbortSignal): Promise<MarineCatalog> {
  if (model !== "ww3" && model !== "shyfem") throw new Error("Modello marino non disponibile");
  const statusUrl = `${MAPS}${model === "ww3" ? "/api/ww3/status" : "/api/marine/shyfem/status"}`;
  const [rawStatus, xml] = await Promise.all([readPublic(statusUrl, "json", signal), readPublic(wmsUrl("GetCapabilities").href, "xml", signal)]);
  const status = object(rawStatus), ingestion = object(status.ingestion);
  const layers = parseMarineCapabilities(String(xml));
  if (model === "ww3") {
    const run = marineRunTime(ingestion.lastRun ?? status.reftime);
    const first = Date.parse(run) + HOUR, last = Date.parse(run) + 72 * HOUR;
    const hs = layers.get(LAYERS.hs), period = layers.get(LAYERS.t01);
    if (!hs || !period) throw new Error("Campi WW3 non disponibili nel servizio mappe");
    if (hs.bounds.flat().some((value, i) => Math.abs(value - period.bounds.flat()[i]) > 0.0001)) throw new Error("Domini WW3 non coerenti");
    const common = new Set(period.frames);
    const frames = hs.frames.filter((time) => common.has(time) && Date.parse(time) >= first && Date.parse(time) <= last);
    if (!frames.length || Date.parse(frames.at(-1)!) !== last) throw new Error("Mappe WW3 non ancora coerenti con l’ultima corsa");
    return { model, run_time: run, frames, bounds: hs.bounds, availableForcings: [],
      attribution: "Agenzia ItaliaMeteo · Arpae Emilia-Romagna · CINECA · CC BY 4.0", sourceUrl: SOURCE };
  }
  const advertised = Array.isArray(ingestion.availableForcings) ? ingestion.availableForcings : [];
  const statusForcings = object(ingestion.forcings);
  const available = FORCINGS.flatMap((key) => {
    if (!advertised.includes(key)) return [];
    const layer = layers.get(`SHYFEM-${key}-wl`);
    if (!layer) return [];
    try {
      const run = marineRunTime(object(statusForcings[key]).lastRun);
      // Each SHYFEM layer describes its published run from H0, unlike WW3's rolling archive.
      if (layer.frames[0] !== run || layer.frames.length < 2) return [];
      return [{ forcing: key, run, layer }];
    } catch { return []; }
  });
  const selected = available.find((entry) => entry.forcing === forcing) ?? available[0];
  if (!selected) throw new Error("Nessuna forzante SHYFEM aggiornata disponibile");
  return { model, run_time: selected.run, frames: selected.layer.frames.filter((time) => Date.parse(time) >= Date.parse(selected.run)),
    bounds: selected.layer.bounds, forcing: selected.forcing, availableForcings: available.map((entry) => entry.forcing),
    attribution: "PNRR MER · Agenzia ItaliaMeteo · CINECA · CC BY 4.0", sourceUrl: SOURCE };
}

export function marineImageUrl(catalog: MarineCatalog, parameter: MarineParameter, time: string, width = 1200): string {
  if ((catalog.model === "ww3" && parameter === "wl") || (catalog.model === "shyfem" && parameter !== "wl")) throw new Error("Variabile non disponibile per questo modello marino");
  const valid = marineRunTime(time);
  if (!catalog.frames.includes(valid)) throw new Error("Scadenza marina non disponibile");
  if (!Number.isFinite(width)) throw new Error("Dimensione della mappa marina non valida");
  const [[south, west], [north, east]] = checkedBounds(catalog.bounds[0][0], catalog.bounds[0][1], catalog.bounds[1][0], catalog.bounds[1][1]);
  const size = Math.max(256, Math.min(2048, Math.round(width)));
  const bbox = [mercatorX(west), mercatorY(south), mercatorX(east), mercatorY(north)];
  const height = Math.max(1, Math.min(2048, Math.round(size * (bbox[3] - bbox[1]) / (bbox[2] - bbox[0]))));
  const layer = parameter === "wl" ? `SHYFEM-${catalog.forcing ?? "ICON"}-wl` : LAYERS[parameter];
  const url = wmsUrl("GetMap");
  const params = { layers: `meteohub:${layer}`, styles: "", format: "image/png", transparent: "true", srs: "EPSG:3857",
    bbox: bbox.join(","), width: String(size), height: String(height), time: valid, run: marineRunTime(catalog.run_time) };
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.href;
}

export function marineLegendUrl(parameter: MarineParameter): string {
  const url = wmsUrl("GetLegendGraphic");
  Object.entries({ layer: `meteohub:${LAYERS[parameter]}`, format: "image/png", width: "24", height: "240",
    legend_options: "forceLabels:on;fontName:Arial;fontSize:11" }).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.href;
}

export function marineVectorZoom(zoom: number): number {
  return Math.max(5, Math.min(7, Math.floor(Number.isFinite(zoom) ? zoom : 5)));
}

export async function getMarineVectors(time: string, zoom: number, signal?: AbortSignal, runTime?: string): Promise<GeoJSON.FeatureCollection> {
  const date = new Date(marineRunTime(time)), pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${pad(date.getUTCDate())}-${pad(date.getUTCMonth() + 1)}-${date.getUTCFullYear()}-${pad(date.getUTCHours())}-${pad(date.getUTCMinutes())}`;
  const url = new URL(`${MAPS}/api/ww3/vectors/${marineVectorZoom(zoom)}/${stamp}.geojson`);
  if (runTime) url.searchParams.set("run", marineRunTime(runTime));
  const data = object(await readPublic(url.href, "json", signal, "default"));
  if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) throw new Error("Vettori delle onde non validi");
  return data as unknown as GeoJSON.FeatureCollection;
}

export async function getMarineScale(parameter: MarineParameter, signal?: AbortSignal): Promise<MarineScaleEntry[]> {
  const url = wmsUrl("GetStyles");
  url.searchParams.set("layers", `meteohub:${LAYERS[parameter]}`);
  const root = parseXml(String(await readPublic(url.href, "xml", signal)));
  const colorMap = descendants(root, "ColorMap")[0];
  const entries = colorMap?.children.filter((node) => node.name === "ColorMapEntry").flatMap(({ attrs }) => {
    const value = Number(attrs.quantity), opacity = Number(attrs.opacity ?? 1);
    return Number.isFinite(value) && attrs.color && Number.isFinite(opacity) && opacity >= 0 && opacity <= 1
      ? [{ value, label: attrs.label?.trim() || String(value), color: attrs.color, opacity }] : [];
  }) ?? [];
  if (!entries.length) throw new Error("Scala ufficiale del modello marino non disponibile");
  return entries;
}
