"""AROME wind vectors, station-vs-model point values and EUMETSAT MTG frame discovery."""

import asyncio
import io
import math
import struct
import time
from collections import OrderedDict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query
from PIL import Image

from lib.sources import DATA_BASE, _http, fetch_data
from models.products import ModelPoint, PointValue, SatelliteFrames, WindFrame, WindGrid, WindMeta

router = APIRouter()


def _parse(ts):
    try:
        dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------- wind vectors
@router.get("/arome/wind", response_model=WindMeta)
async def wind_meta():
    got = await fetch_data("data/arome/wind_vectors.json", ttl=300)
    d = got.data if got and isinstance(got.data, dict) else None
    if not d or not d.get("grid") or not d.get("run_time"):
        raise HTTPException(status_code=503, detail="Vettori vento AROME non disponibili")
    g = d["grid"]
    frames = [WindFrame(lead_hours=int(f["lead_hours"]), valid_time=f["valid_time"], url=DATA_BASE + f["file"])
              for f in d.get("frames", []) if f.get("file", "").endswith(".bin")]
    return WindMeta(run_time=_iso(_parse(d["run_time"])), frames=frames, grid=WindGrid(
        west=g["west"], east=g["east"], north=g["north"], south=g["south"], step_degrees=g["step_degrees"],
        width=g["width"], height=g["height"], encoding=g["encoding"], missing=g.get("missing", -32768)))


# ---------------------------------------------------------------- binary / image caches
class _LRU(OrderedDict):
    def __init__(self, cap):
        super().__init__()
        self.cap = cap

    def put(self, k, v):
        self[k] = v
        self.move_to_end(k)
        while len(self) > self.cap:
            self.popitem(last=False)


_bins: _LRU = _LRU(6)
_imgs: _LRU = _LRU(6)


async def _get_bytes(url: str) -> bytes | None:
    try:
        r = await _http().get(url)
        r.raise_for_status()
        return r.content
    except Exception:
        return None


async def _wind_at(url: str, grid: WindGrid, lat: float, lon: float):
    buf = _bins.get(url)
    if buf is None:
        buf = await _get_bytes(url)
        if not buf or len(buf) != grid.width * grid.height * 4:
            return None
        _bins.put(url, buf)
    if not (grid.west <= lon <= grid.east and grid.south <= lat <= grid.north):
        return None
    gx = (lon - grid.west) / grid.step_degrees
    gy = (grid.north - lat) / grid.step_degrees
    x, y = min(grid.width - 2, int(gx)), min(grid.height - 2, int(gy))
    tx, ty = gx - x, gy - y
    u = v = 0.0
    for (cx, cy, w) in ((x, y, (1 - tx) * (1 - ty)), (x + 1, y, tx * (1 - ty)),
                        (x, y + 1, (1 - tx) * ty), (x + 1, y + 1, tx * ty)):
        cu, cv = struct.unpack_from("<hh", buf, (cy * grid.width + cx) * 4)
        if cu == grid.missing or cv == grid.missing:
            return None
        u += cu * 0.01 * w
        v += cv * 0.01 * w
    speed = math.hypot(u, v) * 3.6
    direction = (math.degrees(math.atan2(-u, -v)) + 360) % 360  # meteorological: where it blows FROM
    return speed, direction


def _invert(rgb, stops):
    """Nearest value on the piecewise-linear colour ramp; None if the colour is not on the ramp."""
    best_d, best_v = 1e9, None
    for (v0, c0), (v1, c1) in zip(stops, stops[1:]):
        for i in range(41):
            t = i / 40
            dd = sum((c0[k] + (c1[k] - c0[k]) * t - rgb[k]) ** 2 for k in range(3))
            if dd < best_d:
                best_d, best_v = dd, v0 + (v1 - v0) * t
    return best_v if best_d ** 0.5 <= 14 else None


async def _color_value(url: str, bounds, stops, lat: float, lon: float):
    im = _imgs.get(url)
    if im is None:
        raw = await _get_bytes(url)
        if not raw:
            return None
        im = await asyncio.to_thread(lambda: Image.open(io.BytesIO(raw)).convert("RGBA"))
        _imgs.put(url, im)
    (s, w), (n, e) = bounds
    if not (w <= lon <= e and s <= lat <= n):
        return None
    W, H = im.size
    x = min(W - 1, int((lon - w) / (e - w) * W))
    y = min(H - 1, int((n - lat) / (n - s) * H))
    r, g, b, a = im.getpixel((x, y))
    if a == 0:
        return None  # transparent cell = no model data
    return _invert((r, g, b), stops)


POINT_PARAMS = ["t2m", "rh2m", "gust10"]


@router.get("/arome/point", response_model=ModelPoint)
async def model_point(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180),
                      at: str | None = Query(None, description="ISO time; default now")):
    fc = await fetch_data("data/arome/forecast.json", ttl=300)
    d = fc.data if fc and isinstance(fc.data, dict) else None
    if not d:
        raise HTTPException(status_code=503, detail="Catalogo AROME non disponibile")
    target = _parse(at) if at else datetime.now(timezone.utc)
    if not target:
        raise HTTPException(status_code=422, detail="Parametro 'at' non valido")
    frames = [(f, _parse(f.get("valid_time"))) for f in d.get("frames", [])]
    frames = [(f, vt) for f, vt in frames if vt]
    if not frames:
        raise HTTPException(status_code=503, detail="Nessuna scadenza AROME")
    f, vt = min(frames, key=lambda x: abs((x[1] - target).total_seconds()))
    offset = (vt - target).total_seconds() / 60
    if abs(offset) > 90:
        raise HTTPException(status_code=404, detail="Orario fuori dall'intervallo coperto dalla corsa AROME")
    lead = int(f["lead_hours"])
    params = d.get("parameters") or {}
    tpl = DATA_BASE + str(d.get("product_path_template", "data/arome/products/{parameter}/h{lead:02d}.webp"))
    bounds = d.get("bounds")
    values: list[PointValue] = []

    async def color(key):
        p = params.get(key)
        if not p or not p.get("stops"):
            return None
        v = await _color_value(tpl.replace("{parameter}", key).replace("{lead:02d}", f"{lead:02d}"), bounds, p["stops"], lat, lon)
        return PointValue(key=key, label=p.get("label", key), unit=p.get("unit", ""),
                          value=None if v is None else round(v, 1), method="scala cromatica")

    results = await asyncio.gather(*(color(k) for k in POINT_PARAMS))
    values += [r for r in results if r]

    wind_meta_d = await fetch_data("data/arome/wind_vectors.json", ttl=300)
    wd = wind_meta_d.data if wind_meta_d and isinstance(wind_meta_d.data, dict) else None
    if wd and _parse(wd.get("run_time")) == _parse(d.get("run_time")):
        wf = next((x for x in wd.get("frames", []) if int(x["lead_hours"]) == lead), None)
        if wf:
            g = wd["grid"]
            grid = WindGrid(west=g["west"], east=g["east"], north=g["north"], south=g["south"],
                            step_degrees=g["step_degrees"], width=g["width"], height=g["height"],
                            encoding=g["encoding"], missing=g.get("missing", -32768))
            res = await _wind_at(DATA_BASE + wf["file"], grid, lat, lon)
            values.insert(1, PointValue(key="wind10", label="Vento medio 10 m", unit="km/h",
                                        value=round(res[0], 1) if res else None,
                                        direction_deg=round(res[1]) if res else None, method="vettori U/V"))
    return ModelPoint(
        run_time=_iso(_parse(d["run_time"])), lead_hours=lead, valid_time=_iso(vt), offset_min=round(offset, 1),
        values=values,
        note=("Valori AROME nel punto griglia più vicino. Temperatura, umidità e raffica sono stimati invertendo la "
              "scala cromatica dei prodotti WebP pubblicati (approssimazione); il vento deriva dai vettori U/V "
              "a 0,1°. Previsione, non osservazione."),
    )


# ---------------------------------------------------------------- EUMETSAT MTG
SAT_WMS = "https://view.eumetsat.int/geoserver/wms"
SAT_BOUNDS = [[31.5, -6.0], [49.0, 20.0]]
SAT_PRODUCTS = {
    "truecolour": ("mtg_fd:rgb_truecolour", "MTG FCI True Colour RGB", "© EUMETSAT · MTG FCI True Colour RGB", "image/jpeg", 10, True),
    "ir105": ("mtg_fd:ir105_hrfi", "MTG FCI IR10.5 µm HRFI", "© EUMETSAT · MTG FCI HRFI IR10.5 µm", "image/jpeg", 10, False),
    "cloudphase": ("mtg_fd:rgb_cloudphase", "MTG Cloud Phase RGB", "© EUMETSAT · MTG FCI Cloud Phase RGB", "image/jpeg", 10, True),
    "snowfog": ("mtg_fd:rgb_snow", "MTG Day Snow Fog RGB", "© EUMETSAT · MTG Day Snow Fog RGB", "image/jpeg", 10, True),
    "preciprate": ("mtg_fd:h40b", "H SAF H40B Precipitation Rate", "© EUMETSAT / H SAF · H40B", "image/png", 10, False),
    "li": ("mtg_fd:li_afa", "MTG Lightning Imager (archivio)", "© EUMETSAT · MTG LI Accumulated Flash Area", "image/png", 5, False),
}
_sat_cache: dict[str, tuple[float, SatelliteFrames]] = {}


async def _probe(layer: str, t: datetime, li: bool) -> bool:
    bbox, size, min_bytes = ("-12,28,35,48", (128, 64), 1500) if li else ("7.2,38.2,10.8,41.8", (48, 48), 500)
    params = {"service": "WMS", "request": "GetMap", "version": "1.1.1", "layers": layer, "styles": "",
              "format": "image/png", "transparent": "true", "srs": "EPSG:4326", "bbox": bbox,
              "width": str(size[0]), "height": str(size[1]), "time": t.strftime("%Y-%m-%dT%H:%M:%S.000Z")}
    try:
        r = await _http().get(SAT_WMS, params=params, timeout=25.0)
        return r.status_code == 200 and "image" in r.headers.get("content-type", "") and len(r.content) > min_bytes
    except Exception:
        return False


@router.get("/satellite/{product}", response_model=SatelliteFrames)
async def satellite_frames(product: str):
    if product not in SAT_PRODUCTS:
        raise HTTPException(status_code=404, detail="Prodotto satellitare non supportato")
    hit = _sat_cache.get(product)
    if hit and time.time() - hit[0] < 180:
        return hit[1]
    layer, label, attr, fmt, step, day = SAT_PRODUCTS[product]
    n = 24 if product == "li" else 19
    now = datetime.now(timezone.utc)
    base = now.replace(second=0, microsecond=0, minute=now.minute // step * step)
    candidates = [base - timedelta(minutes=step * i) for i in range(n + 6)]  # newest first, some slack for latency
    ok = await asyncio.gather(*(_probe(layer, t, product == "li") for t in candidates))
    available = [t for t, good in zip(candidates, ok) if good]
    if not available:
        raise HTTPException(status_code=503, detail="EUMETSAT: nessun frame disponibile")
    # only frames that actually exist, within the n-step window ending at the newest available one
    latest = available[0]
    window = [t for t in available if latest - t <= timedelta(minutes=step * (n - 1))]
    res = SatelliteFrames(product=product, label=label, layer=layer, attribution=attr, format=fmt, step_minutes=step,
                          wms_url=SAT_WMS, bounds=SAT_BOUNDS, frames=[_iso(t) for t in reversed(window)],
                          latest=_iso(latest), daytime_only=day)
    _sat_cache[product] = (time.time(), res)
    return res
