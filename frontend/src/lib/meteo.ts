import type { Freshness, Station } from "@/lib/types";

export type ParamKey =
  | "temp" | "tmin" | "tmax" | "rh" | "wind_kmh" | "gust_kmh"
  | "rain_rate" | "rain_today" | "rain_48h" | "pressure_hpa";

interface RampStop { max: number; color: string; label: string }

export interface ParamDef {
  key: ParamKey;
  label: string;
  short: string;
  unit: string;
  decimals: number;
  ramp: RampStop[];
  dayBound: boolean; // daily extreme / accumulation: valid only for the current local day
  rain: boolean; // includes rain-only gauges (CEDOC)
}

// Colori continui per temperatura, Tmin e Tmax: gli stessi nodi
// alimentano sia i marker sia il gradiente della legenda.
export const TEMP_GRADIENT = [
  { value: -10, color: "#1D4ED8" },
  { value: 0, color: "#3B82F6" },
  { value: 8, color: "#06B6D4" },
  { value: 15, color: "#10B981" },
  { value: 22, color: "#84CC16" },
  { value: 28, color: "#EAB308" },
  { value: 35, color: "#F97316" },
  { value: 42, color: "#EF4444" },
] as const;
const TEMP: RampStop[] = TEMP_GRADIENT.map(({ value, color }) => ({ max: value, color, label: String(value) }));
const RAIN: RampStop[] = [
  { max: 0.2, color: "#64748B", label: "<0,2" },
  { max: 5, color: "#38BDF8", label: "0,2–5" },
  { max: 20, color: "#2563EB", label: "5–20" },
  { max: 50, color: "#7C3AED", label: "20–50" },
  { max: Infinity, color: "#DB2777", label: ">50" },
];
const RATE: RampStop[] = [
  { max: 0.1, color: "#64748B", label: "0" },
  { max: 2, color: "#38BDF8", label: "<2" },
  { max: 10, color: "#2563EB", label: "2–10" },
  { max: 30, color: "#7C3AED", label: "10–30" },
  { max: Infinity, color: "#DB2777", label: ">30" },
];
const WIND: RampStop[] = [
  { max: 15, color: "#059669", label: "<15" },
  { max: 35, color: "#0284C7", label: "15–35" },
  { max: 60, color: "#D97706", label: "35–60" },
  { max: 90, color: "#DC2626", label: "60–90" },
  { max: Infinity, color: "#9333EA", label: ">90" },
];
const RH: RampStop[] = [
  { max: 30, color: "#D97706", label: "<30" },
  { max: 50, color: "#CA8A04", label: "30–50" },
  { max: 70, color: "#16A34A", label: "50–70" },
  { max: 85, color: "#0891B2", label: "70–85" },
  { max: Infinity, color: "#2563EB", label: ">85" },
];
const PRESS: RampStop[] = [
  { max: 1000, color: "#7C3AED", label: "<1000" },
  { max: 1010, color: "#2563EB", label: "1000–1010" },
  { max: 1020, color: "#0891B2", label: "1010–1020" },
  { max: 1030, color: "#CA8A04", label: "1020–1030" },
  { max: Infinity, color: "#EA580C", label: ">1030" },
];

export const PARAMS: ParamDef[] = [
  { key: "temp", label: "Temperatura", short: "T", unit: "°C", decimals: 1, ramp: TEMP, dayBound: false, rain: false },
  { key: "tmin", label: "T minima", short: "Tmin", unit: "°C", decimals: 1, ramp: TEMP, dayBound: true, rain: false },
  { key: "tmax", label: "T massima", short: "Tmax", unit: "°C", decimals: 1, ramp: TEMP, dayBound: true, rain: false },
  { key: "rh", label: "Umidità", short: "UR", unit: "%", decimals: 0, ramp: RH, dayBound: false, rain: false },
  { key: "wind_kmh", label: "Vento", short: "Vento", unit: "km/h", decimals: 0, ramp: WIND, dayBound: false, rain: false },
  { key: "gust_kmh", label: "Raffiche", short: "Raff.", unit: "km/h", decimals: 0, ramp: WIND, dayBound: false, rain: false },
  { key: "rain_rate", label: "Intensità pioggia", short: "mm/h", unit: "mm/h", decimals: 1, ramp: RATE, dayBound: false, rain: true },
  { key: "rain_today", label: "Pioggia oggi", short: "Oggi", unit: "mm", decimals: 1, ramp: RAIN, dayBound: true, rain: true },
  { key: "rain_48h", label: "Pioggia 48 h", short: "48h", unit: "mm", decimals: 1, ramp: RAIN, dayBound: false, rain: true },
  { key: "pressure_hpa", label: "Pressione", short: "hPa", unit: "hPa", decimals: 1, ramp: PRESS, dayBound: false, rain: false },
];

export const PARAM_BY_KEY = Object.fromEntries(PARAMS.map((p) => [p.key, p])) as Record<ParamKey, ParamDef>;

export const NETWORK_META: Record<string, { label: string; short: string; color: string }> = {
  "dpcn-sardegna": { label: "MeteoHub / DPCN", short: "DPCN", color: "#38BDF8" },
  "aeronautica-militare": { label: "Aeronautica Militare", short: "AM", color: "#FBBF24" },
  ecowitt: { label: "Ecowitt", short: "ECO", color: "#4ADE80" },
  meteonetwork: { label: "MeteoNetwork", short: "MNW", color: "#F472B6" },
  cedoc: { label: "CEDOC Pluviometri", short: "CEDOC", color: "#A78BFA" },
};

export function colorFor(p: ParamDef, v: number): string {
  if (p.key === "temp" || p.key === "tmin" || p.key === "tmax") {
    // Interpolazione lineare RGB: il colore non salta più fra soglie discrete.
    const stops = TEMP_GRADIENT;
    if (v <= stops[0].value) return stops[0].color;
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1], b = stops[i];
      if (v <= b.value) {
        const t = (v - a.value) / (b.value - a.value);
        const ca = [1, 3, 5].map((k) => parseInt(a.color.slice(k, k + 2), 16));
        const cb = [1, 3, 5].map((k) => parseInt(b.color.slice(k, k + 2), 16));
        return "#" + ca.map((x, j) => Math.round(x + (cb[j] - x) * t).toString(16).padStart(2, "0")).join("");
      }
    }
    return stops[stops.length - 1].color;
  }
  return (p.ramp.find((stop) => v <= stop.max) ?? p.ramp[p.ramp.length - 1]).color;
}

export function valueOf(s: Station, p: ParamDef): number | null {
  const v = s[p.key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Effective freshness for a parameter: a daily value from a past day is always historic. */
export function freshnessFor(s: Station, p: ParamDef): Freshness {
  if (p.dayBound && !s.is_today && s.freshness !== "unavailable") return "historic";
  return s.freshness;
}

export function fmtValue(v: number, p: ParamDef): string {
  return v.toLocaleString("it-IT", { minimumFractionDigits: p.decimals, maximumFractionDigits: p.decimals });
}

const ROME_FMT = new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
});
const ROME_DAY = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "2-digit", month: "2-digit" });
const ROME_HM = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "n.d.";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "n.d." : ROME_FMT.format(d).replace(",", "");
}
export function fmtDayTime(iso: string): string {
  const d = new Date(iso);
  return `${ROME_DAY.format(d)} ${ROME_HM.format(d)}`;
}
export function fmtDay(day: string | null): string {
  if (!day) return "n.d.";
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

export function fmtAge(min: number | null): string {
  if (min == null) return "n.d.";
  if (min < 1) return "ora";
  if (min < 60) return `${Math.round(min)} min fa`;
  if (min < 48 * 60) return `${(min / 60).toFixed(min < 600 ? 1 : 0).replace(".", ",")} h fa`;
  return `${Math.round(min / 1440)} g fa`;
}

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  fresh: "Recente",
  stale: "In ritardo",
  historic: "Storico – non attuale",
  unavailable: "Non disponibile",
};

export const FRESHNESS_CLASS: Record<Freshness, string> = {
  fresh: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  stale: "text-amber-300 bg-amber-500/10 border-amber-500/30",
  historic: "text-slate-300 bg-slate-500/10 border-slate-500/40 border-dashed",
  unavailable: "text-red-300 bg-red-500/10 border-red-500/30",
};

export function slug(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function windDirLabel(deg: number | null): string {
  if (deg == null) return "";
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
  return dirs[Math.round(deg / 22.5) % 16];
}

export const AROME_PRECIP_KEY = "precip_1h";
// Fallback per vecchi manifest AROME: stessa palette esatta dei PNG
// prodotti da scripts/update_arome_hd.py (PALETTE, da 0.1 a 80 mm).
export const AROME_PRECIP_STOPS: [number, [number, number, number]][] = [
  [0.1, [30, 190, 245]], [0.5, [31, 130, 245]], [1, [0, 190, 210]],
  [2, [0, 185, 100]], [5, [240, 220, 25]], [10, [252, 148, 35]],
  [20, [240, 49, 43]], [40, [178, 25, 166]], [80, [255, 110, 244]],
];
export const AROME_NOTES: Record<string, string> = {
  [AROME_PRECIP_KEY]: "Precipitazione totale prevista nell'ora precedente (accumulo orario da differenziazione GRIB2).",
  tmaxrun: "Estremo dei valori orari dall'inizio della corsa, non la massima continua.",
  tminrun: "Estremo dei valori orari dall'inizio della corsa, non la minima continua.",
  windchill: "Wind chill valido solo per T ≤ 10 °C e vento > 4,8 km/h; altre celle trasparenti.",
  humidex: "Humidex visualizzato per T ≥ 20 °C e humidex ≥ 25.",
  td2m: "Punto di rugiada calcolato con formula di Magnus.",
  gust10: "Stima vettoriale dalle componenti massime nell'ora: i picchi U/V potrebbero non essere simultanei.",
  gustmaxrun: "Massimo progressivo delle raffiche orarie stimate; non misura osservata.",
  sim_refl: "Riflettività SIMULATA dal modello, NON radar osservato.",
  sim_ir: "Temperatura di brillanza IR SIMULATA, NON immagine satellitare osservata.",
  precip_phase: "Categoria diagnostica pioggia/neve/graupel, NON classificazione di severità.",
  rain_acc: "Cumulata dall'inizio della corsa, non accumulo della sola ora selezionata.",
  snow_acc: "Neve cumulata in equivalente in acqua, NON spessore al suolo.",
  graupel_acc: "Graupel cumulato in equivalente in acqua dall'inizio della corsa.",
  frozen_acc: "Neve + graupel cumulati in equivalente in acqua.",
  cape: "CAPE_INS diagnostica del modello.",
};
export const PHASE_LABELS: Record<string, string> = { "1": "Pioggia", "2": "Neve", "3": "Graupel", "4": "Mista" };
