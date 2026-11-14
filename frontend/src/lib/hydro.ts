import { useQuery } from "@tanstack/react-query";

/**
 * Idrometri ARPAS della rete fiduciaria: sorgente ArcGIS già usata dalla
 * versione Classic. I livelli sono riferiti allo zero idrometrico locale.
 * Le soglie S1-S3 sono specifiche della sezione, NON livelli di allerta comunali.
 */
export const HYDRO_RT = "https://services6.arcgis.com/VdOe78ROZ6pyB2c8/arcgis/rest/services/idrometri_real_time_vista/FeatureServer/1";
export const HYDRO_HIST = "https://services6.arcgis.com/VdOe78ROZ6pyB2c8/arcgis/rest/services/ds_accumula_view_read_only/FeatureServer/9";
export const HYDRO_DASHBOARD = "https://arpas.maps.arcgis.com/apps/dashboards/0a1dc031c476445493f758af2e2f848a";

export interface HydroStation {
  id: string;
  name: string;
  locality: string;
  lon: number;
  lat: number;
  value: number | null;
  trend: number | null;
  time: number | null;
  s1: number | null;
  s2: number | null;
  s3: number | null;
}

export const hydroNumber = (value: unknown): number | null => {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function hydroTime(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = hydroNumber(value);
  const time = n == null ? Date.parse(String(value)) : (n < 1e11 ? n * 1000 : n);
  return Number.isFinite(time) ? time : null;
}

export function hydroThresholds(s: HydroStation): [number, number, number] | null {
  const { s1, s2, s3 } = s;
  if (s1 === null || s2 === null || s3 === null || s1 <= 0 || s2 <= s1 || s3 <= s2) return null;
  return [s1, s2, s3];
}

export function hydroStage(s: HydroStation, now = Date.now()): number {
  if (s.value === null) return -1;
  if (s.time === null || s.time > now + 10 * 60_000 || now - s.time > 2 * 60 * 60_000) return -2;
  const t = hydroThresholds(s);
  if (!t) return -3;
  if (s.value > t[2]) return 3;
  if (s.value > t[1]) return 2;
  if (s.value > t[0]) return 1;
  return 0;
}

export function hydroColor(s: HydroStation): string {
  return ({ "-3": "#8aa0ad", "-2": "#7e8b94", "-1": "#7e8b94", "0": "#31a8d8",
    "1": "#f1d54b", "2": "#f28c35", "3": "#dc3d3d" } as Record<string, string>)[String(hydroStage(s))] ?? "#7e8b94";
}

export function hydroStageText(s: HydroStation): string {
  const labels: Record<string, string> = {
    "-3": "Soglie non disponibili", "-2": "Misura non recente", "-1": "Livello non disponibile",
    "0": "Nessuna soglia superata", "1": "S1 superata", "2": "S2 superata", "3": "S3 superata",
  };
  return labels[String(hydroStage(s))] ?? "Non disponibile";
}
export function hydroFmtTime(time: number | null): string {
  if (time === null) return "n.d.";
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(time));
}
export const hydroFmtLevel = (v: number | null): string => v === null ? "n.d." :
  v.toLocaleString("it-IT", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " m";
export const hydroFmtTrend = (v: number | null): string => v === null ? "n.d." :
  `${v > 0.0005 ? "↑ " : v < -0.0005 ? "↓ " : "→ "}${v > 0 ? "+" : ""}${(v * 100).toLocaleString("it-IT", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} cm/h`;
export const hydroEsc = (v: unknown): string => String(v ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

interface HydroFeature {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
}
export function parseHydrometers(payload: { features?: HydroFeature[]; error?: { message?: string } }): HydroStation[] {
  if (payload.error) throw new Error(payload.error.message || "Errore ArcGIS ARPAS");
  if (!Array.isArray(payload.features)) throw new Error("Risposta ARPAS priva di elenco delle sezioni");
  const stations: HydroStation[] = [];
  const seen = new Set<string>();
  for (const feature of payload.features) {
    const a = feature.properties ?? {}, coords = feature.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const lon = hydroNumber(coords[0]), lat = hydroNumber(coords[1]);
    if (lat === null || lon === null || lat < 38.5 || lat > 41.6 || lon < 7.4 || lon > 10.5) continue;
    const id = String(a.cod_srv ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    stations.push({
      id, name: String(a.cae_nome || a.altra_denominazione || id),
      locality: String(a.localita || ""), lon, lat,
      value: hydroNumber(a.value), trend: hydroNumber(a.trend), time: hydroTime(a.time),
      s1: hydroNumber(a.s1), s2: hydroNumber(a.s2), s3: hydroNumber(a.s3),
    });
  }
  if (!stations.length) throw new Error("Nessuna sezione idrometrica valida nella risposta ARPAS");
  return stations;
}
export async function fetchHydrometers(): Promise<HydroStation[]> {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "cod_srv,altra_denominazione,cae_nome,tipomisura,localita,time,value,trend,zero,s1,s2,s3,nota_m_slm,note",
    returnGeometry: "true", outSR: "4326", f: "geojson",
  });
  const r = await fetch(`${HYDRO_RT}/query?${params}`, { cache: "no-store", signal: AbortSignal.timeout(18_000) });
  if (!r.ok) throw new Error(`ARPAS HTTP ${r.status}`);
  return parseHydrometers(await r.json() as { features?: HydroFeature[]; error?: { message?: string } });
}
export function useHydrometers(enabled: boolean) {
  return useQuery({
    queryKey: ["hydrometers-arpas"], queryFn: fetchHydrometers, enabled,
    staleTime: 3 * 60_000, refetchInterval: 4 * 60_000,
    refetchOnWindowFocus: "always", refetchOnReconnect: "always", retry: 1,
  });
}

export interface HydroReading { time: number; value: number }
export async function fetchHydroHistory(id: string): Promise<HydroReading[]> {
  const params = new URLSearchParams({
    where: `cod_srv='${id.replace(/'/g, "''")}'`, outFields: "time,value",
    returnGeometry: "false", orderByFields: "time DESC", resultRecordCount: "96", f: "json",
  });
  const r = await fetch(`${HYDRO_HIST}/query?${params}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`Storico ARPAS HTTP ${r.status}`);
  const payload = await r.json() as { features?: { attributes?: { time?: unknown; value?: unknown } }[]; error?: { message?: string } };
  if (payload.error) throw new Error(payload.error.message || "Storico ARPAS non disponibile");
  return (payload.features ?? []).flatMap((f) => {
    const time = hydroTime(f.attributes?.time), value = hydroNumber(f.attributes?.value);
    return time == null || value == null ? [] : [{ time, value }];
  }).sort((a, b) => a.time - b.time);
}

function hydroGraph(rows: HydroReading[], s: HydroStation): string {
  if (rows.length < 2) return '<p style="font-size:11px">Idrogramma non disponibile.</p>';
  const W = 316, H = 154, left = 34, right = 28, top = 10, bottom = 24;
  const thresholds = hydroThresholds(s);
  const markers = thresholds ? thresholds.map((v, i) => ({ v, name: `S${i + 1}`, c: ["#d6b126", "#e18b36", "#e44b54"][i] })) : [];
  const values = [...rows.map((x) => x.value), ...markers.map((x) => x.v)];
  let low = Math.min(...values), high = Math.max(...values);
  if (high - low < 0.2) { low -= 0.1; high += 0.1; }
  const margin = (high - low) * 0.08; low -= margin; high += margin;
  const t0 = rows[0].time, t1 = rows[rows.length - 1].time;
  const xp = (t: number) => left + (t - t0) / Math.max(1, t1 - t0) * (W - left - right);
  const yp = (v: number) => top + (high - v) / Math.max(0.001, high - low) * (H - top - bottom);
  const points = rows.map((r) => `${xp(r.time).toFixed(1)},${yp(r.value).toFixed(1)}`).join(" ");
  const thresholdLines = markers.map((m) =>
    `<line x1="${left}" x2="${W - right}" y1="${yp(m.v)}" y2="${yp(m.v)}" stroke="${m.c}" stroke-dasharray="4 3"/><text x="${W - right + 2}" y="${yp(m.v) - 3}" fill="${m.c}" font-size="8">${m.name}</text>`).join("");
  return `<div style="margin-top:10px"><strong style="font-size:11px">IDROGRAMMA · ULTIME 24 H CIRCA</strong>
    <svg viewBox="0 0 ${W} ${H}" style="display:block;width:100%;margin-top:5px" role="img" aria-label="Andamento livello idrometrico">
      <rect x="${left}" y="${top}" width="${W-left-right}" height="${H-top-bottom}" fill="#f2f6f9" stroke="#dce5ea"/>
      ${thresholdLines}
      <polyline points="${points}" fill="none" stroke="#087ca6" stroke-width="2" stroke-linejoin="round"/>
      <text x="0" y="16" fill="#526775" font-size="9">${high.toFixed(2)}</text>
      <text x="0" y="${H-bottom}" fill="#526775" font-size="9">${low.toFixed(2)}</text>
      <text x="${left}" y="${H-7}" fill="#526775" font-size="8">${hydroFmtTime(t0)}</text>
      <text x="${W-right}" y="${H-7}" text-anchor="end" fill="#526775" font-size="8">${hydroFmtTime(t1)}</text>
    </svg></div>`;
}

export function hydroPopupHtml(s: HydroStation, history: HydroReading[] | null = null, historyError = false): string {
  const thresholds = hydroThresholds(s);
  const cell = (n: number, label: string) => `<div style="flex:1;padding:6px;border-radius:6px;background:#eaf0f4;text-align:center;font-size:10px"><b>${label}</b><br>${n.toLocaleString("it-IT",{minimumFractionDigits:2,maximumFractionDigits:2})} m</div>`;
  return `<div data-testid="hydro-popup" style="min-width:245px;max-width:330px;color:#132331;font:12px/1.35 sans-serif">
    <b style="font-size:15px">${hydroEsc(s.name)}</b><div style="color:#60788a;font-size:11px">${hydroEsc(s.id)} · ${hydroEsc(s.locality)}</div>
    <div style="display:flex;align-items:center;gap:8px;margin-top:9px">
      <b style="font-size:23px">${hydroFmtLevel(s.value)}</b>
      <span style="padding:4px 6px;border-radius:5px;background:${hydroColor(s)};color:#10212d;font-size:10px;font-weight:bold">${hydroEsc(hydroStageText(s))}</span>
    </div>
    <div style="margin-top:7px">Trend orario: <b>${hydroFmtTrend(s.trend)}</b></div>
    <div>Osservazione: <b>${hydroFmtTime(s.time)}</b></div>
    <div style="display:flex;gap:5px;margin-top:9px">${thresholds ? thresholds.map((v,i)=>cell(v,`S${i+1}`)).join("") : '<span style="font-size:11px">Soglie non disponibili o non valide</span>'}</div>
    ${history ? hydroGraph(history,s) : historyError ? '<p>Idrogramma temporaneamente non disponibile.</p>' : '<p style="font-size:11px">Caricamento idrogramma…</p>'}
    <p style="font-size:10px;color:#637585">Livello riferito allo zero idrometrico locale. Soglie specifiche della sezione, non livelli di allerta territoriale. Dato automatico da verificare sul servizio ufficiale ARPAS.</p>
    <a href="${HYDRO_DASHBOARD}" target="_blank" rel="noopener noreferrer">Apri monitoraggio ufficiale ARPAS</a>
  </div>`;
}
