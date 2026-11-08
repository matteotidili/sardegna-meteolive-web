from typing import Optional

from pydantic import BaseModel


class WindFrame(BaseModel):
    lead_hours: int
    valid_time: str
    url: str


class WindGrid(BaseModel):
    west: float
    east: float
    north: float
    south: float
    step_degrees: float
    width: int
    height: int
    encoding: str
    missing: int


class WindMeta(BaseModel):
    run_time: str
    grid: WindGrid
    frames: list[WindFrame]


class PointValue(BaseModel):
    key: str
    label: str
    unit: str
    value: Optional[float] = None
    direction_deg: Optional[float] = None
    method: str  # "vettori U/V" | "scala cromatica"


class ModelPoint(BaseModel):
    run_time: str
    lead_hours: int
    valid_time: str
    offset_min: float  # model valid time minus requested time
    values: list[PointValue]
    note: str


class SatelliteFrames(BaseModel):
    product: str
    label: str
    layer: str
    attribution: str
    format: str
    step_minutes: int
    wms_url: str
    bounds: list[list[float]]
    frames: list[str]
    latest: Optional[str] = None
    daytime_only: bool = False
