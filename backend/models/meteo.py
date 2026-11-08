from typing import Literal, Optional

from pydantic import BaseModel

Freshness = Literal["fresh", "stale", "historic", "unavailable"]
SourceStatus = Literal["ok", "degraded", "unavailable"]


class Station(BaseModel):
    id: str
    name: str
    network: str
    lat: float
    lon: float
    elev: Optional[float] = None
    elev_source: Optional[str] = None  # "rete" when supplied by the original network
    temp: Optional[float] = None
    tmin: Optional[float] = None
    tmax: Optional[float] = None
    tmax_provisional: Optional[bool] = None
    tmin_provisional: Optional[bool] = None
    rh: Optional[float] = None
    wind_kmh: Optional[float] = None
    wind_dir: Optional[float] = None
    gust_kmh: Optional[float] = None
    rain_rate: Optional[float] = None
    rain_today: Optional[float] = None
    rain_48h: Optional[float] = None
    rain_48h_source: Optional[str] = None
    pressure_hpa: Optional[float] = None
    last: Optional[str] = None  # real observation time (UTC ISO)
    obs_day: Optional[str] = None  # local Europe/Rome day of `last`
    is_today: bool = False
    age_min: Optional[float] = None
    freshness: Freshness = "unavailable"
    rain_only: bool = False  # rain gauges (CEDOC): never thermometric stations
    observation_type: Optional[str] = None
    raw_message: Optional[str] = None
    source_url: Optional[str] = None


class NetworkStatus(BaseModel):
    key: str
    label: str
    source: str
    status: SourceStatus
    generated_at: Optional[str] = None
    checked_at: Optional[str] = None
    latest_obs: Optional[str] = None
    station_count: int = 0
    fresh_count: int = 0
    stale_count: int = 0
    historic_count: int = 0
    using_last_valid: bool = False
    warning: Optional[str] = None


class StationsResponse(BaseModel):
    server_time: str
    local_day: str
    stations: list[Station]
    networks: list[NetworkStatus]


class AlertWarning(BaseModel):
    id: str
    status: str
    level: int
    level_name: str
    event: str
    type_name: Optional[str] = None
    area_desc: str
    onset: Optional[str] = None
    expires: Optional[str] = None
    severity: Optional[str] = None
    certainty: Optional[str] = None
    cap_url: Optional[str] = None
    geometry: Optional[dict] = None


class AlertsResponse(BaseModel):
    source: str
    feed_updated: Optional[str] = None
    generated_at: Optional[str] = None
    active_count: int
    upcoming_count: int
    max_level: int
    warnings: list[AlertWarning]
    available: bool = True


class AromeParameter(BaseModel):
    key: str
    label: str
    unit: str
    group: str
    scale: str
    stops: list[list] = []
    phase_colors: Optional[dict[str, list[int]]] = None


class AromeFrame(BaseModel):
    lead_hours: int
    valid_time: str
    precip_url: str
    max_mm: Optional[float] = None


class AromeResponse(BaseModel):
    model: str
    producer: str
    license: Optional[str] = None
    run_time: str
    generated_at: Optional[str] = None
    run_age_hours: float
    horizon_hours: int
    bounds: list[list[float]]
    domain_note: Optional[str] = None
    product_url_template: str  # absolute, with {parameter} and {lead}
    parameters: list[AromeParameter]
    frames: list[AromeFrame]
    complete: bool


class RadarFrames(BaseModel):
    product: str
    latest_time: str
    step_minutes: int
    frames: list[str]


class FireDetection(BaseModel):
    lat: float
    lon: float
    frp_mw: Optional[float] = None
    confidence: Optional[str] = None
    time: Optional[str] = None


class FrpResponse(BaseModel):
    source: str
    product: str
    generated_at: Optional[str] = None
    window_minutes: Optional[int] = None
    latest_detection: Optional[str] = None
    detections: list[FireDetection]


class Rain48Response(BaseModel):
    generated_at: Optional[str] = None
    description: Optional[str] = None
    coverage_note: Optional[str] = None
    station_count: int
    operational: bool
