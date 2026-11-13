// TS mirrors of backend/models/meteo.py — keep in sync by hand.
export type Freshness = "fresh" | "stale" | "historic" | "unavailable";
export type SourceStatus = "ok" | "degraded" | "unavailable";

export interface Station {
  id: string;
  name: string;
  network: string;
  lat: number;
  lon: number;
  elev: number | null;
  elev_source: string | null;
  temp: number | null;
  tmin: number | null;
  tmax: number | null;
  tmax_provisional: boolean | null;
  tmin_provisional: boolean | null;
  rh: number | null;
  wind_kmh: number | null;
  wind_dir: number | null;
  gust_kmh: number | null;
  rain_rate: number | null;
  rain_today: number | null;
  rain_48h: number | null;
  rain_48h_source: string | null;
  pressure_hpa: number | null;
  last: string | null;
  obs_day: string | null;
  is_today: boolean;
  age_min: number | null;
  freshness: Freshness;
  rain_only: boolean;
  observation_type: string | null;
  raw_message: string | null;
  source_url: string | null;
}

export interface NetworkStatus {
  key: string;
  label: string;
  source: string;
  status: SourceStatus;
  generated_at: string | null;
  checked_at: string | null;
  latest_obs: string | null;
  station_count: number;
  fresh_count: number;
  stale_count: number;
  historic_count: number;
  using_last_valid: boolean;
  warning: string | null;
}

export interface StationsResponse {
  server_time: string;
  local_day: string;
  stations: Station[];
  networks: NetworkStatus[];
}

export interface AlertWarning {
  id: string;
  status: string;
  level: number;
  level_name: string;
  event: string;
  type_name: string | null;
  area_desc: string;
  onset: string | null;
  expires: string | null;
  severity: string | null;
  certainty: string | null;
  cap_url: string | null;
  geometry: GeoJSON.Geometry | null;
}

export interface AlertsResponse {
  source: string;
  feed_updated: string | null;
  generated_at: string | null;
  active_count: number;
  upcoming_count: number;
  max_level: number;
  warnings: AlertWarning[];
  available: boolean;
}

export type RGB = [number, number, number];

export interface AromeParameter {
  key: string;
  label: string;
  unit: string;
  group: string;
  scale: string;
  stops: [number, RGB][];
  phase_colors: Record<string, RGB> | null;
}

export interface AromeFrame {
  lead_hours: number;
  valid_time: string;
  precip_url: string;
  max_mm: number | null;
}

export interface AromeResponse {
  model: string;
  producer: string;
  license: string | null;
  run_time: string;
  generated_at: string | null;
  run_age_hours: number;
  horizon_hours: number;
  bounds: [number, number][];
  domain_note: string | null;
  product_url_template: string;
  parameters: AromeParameter[];
  /** Colori e soglie esatti usati dal renderer PNG della precipitazione oraria. */
  hourly_precip_stops?: [number, RGB][];
  frames: AromeFrame[];
  complete: boolean;
}

export interface RadarFrames {
  product: string;
  latest_time: string;
  step_minutes: number;
  frames: string[];
}

export interface FireDetection {
  lat: number;
  lon: number;
  frp_mw: number | null;
  confidence: string | null;
  time: string | null;
}

export interface FrpResponse {
  source: string;
  product: string;
  generated_at: string | null;
  window_minutes: number | null;
  latest_detection: string | null;
  detections: FireDetection[];
}

export interface Rain48Response {
  generated_at: string | null;
  description: string | null;
  coverage_note: string | null;
  station_count: number;
  operational: boolean;
}

// backend/models/products.py
export interface WindFrame { lead_hours: number; valid_time: string; url: string }
export interface WindGrid {
  west: number; east: number; north: number; south: number; step_degrees: number;
  width: number; height: number; encoding: string; missing: number;
}
export interface WindMeta { run_time: string; grid: WindGrid; frames: WindFrame[] }

export interface PointValue {
  key: string; label: string; unit: string; value: number | null; direction_deg: number | null; method: string;
}
export interface ModelPoint {
  run_time: string; lead_hours: number; valid_time: string; offset_min: number; values: PointValue[]; note: string;
}

export interface SatelliteFrames {
  product: string; label: string; layer: string; attribution: string; format: string; step_minutes: number;
  wms_url: string; bounds: [number, number][]; frames: string[]; latest: string | null; daytime_only: boolean;
}

export interface Stroke { lat: number; lon: number; time: number }
