"""Read-only meteorological endpoints over the published data repository.

Freshness is computed here from each station's own `last` timestamp
(observation time) against the server clock — never from file or fetch time.
"""

import re
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query

from lib.sources import DATA_BASE, RADAR_API, fetch_data, fetch_json
from models.meteo import (
    AlertsResponse, AlertWarning, AromeFrame, AromeParameter, AromeResponse,
    FireDetection, FrpResponse, NetworkStatus, RadarFrames, Rain48Response,
    Station, StationsResponse,
)

router = APIRouter()
ROME = ZoneInfo("Europe/Rome")

# minutes: (fresh_max, stale_max) — beyond stale_max the value is historic
THRESHOLDS = {
    "dpcn-sardegna": (30, 180),
    "aeronautica-militare": (90, 240),  # METAR/SYNOP hourly cadence
    "ecowitt": (30, 180),
    "cedoc": (90, 180),
}

NETWORKS = [
    ("dpcn-sardegna", "MeteoHub / DPCN", "data/stations.json"),
    ("aeronautica-militare", "Aeronautica Militare", "data/am.json"),
    ("ecowitt", "Ecowitt", "data/ecowitt.json"),
]


def _parse(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _num(v) -> float | None:
    try:
        if v is None or isinstance(v, bool):
            return None
        f = float(v)
        return f if f == f else None  # drop NaN
    except (TypeError, ValueError):
        return None


def _iso(dt: datetime | None) -> str | None:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if dt else None


def _freshness(network: str, last: datetime | None, now: datetime, has_value: bool):
    if not last or not has_value:
        return "unavailable", None
    age = max(0.0, (now - last).total_seconds() / 60)
    fresh_max, stale_max = THRESHOLDS.get(network, (60, 180))
    if age <= fresh_max:
        return "fresh", round(age, 1)
    if age <= stale_max:
        return "stale", round(age, 1)
    return "historic", round(age, 1)


def _normalize(raw: dict, network: str, now: datetime, today: str, rain_only=False) -> Station | None:
    lat, lon = _num(raw.get("lat")), _num(raw.get("lon"))
    if lat is None or lon is None:
        return None
    last = _parse(raw.get("last"))
    obs_day = last.astimezone(ROME).strftime("%Y-%m-%d") if last else None
    avail = raw.get("available") or {}

    def gated(field, key):  # respect the collector's availability flags
        if avail and avail.get(key) is False:
            return None
        return _num(raw.get(field))

    st = Station(
        id=f"{network}:{raw.get('station_id') or raw.get('icao') or raw.get('name')}",
        name=str(raw.get("name") or "Senza nome"),
        network=network,
        lat=lat, lon=lon,
        elev=_num(raw.get("elev")),
        temp=None if rain_only else gated("temp", "temp"),
        tmin=None if rain_only else gated("tmin", "temp"),
        tmax=None if rain_only else gated("tmax", "temp"),
        tmin_provisional=raw.get("tmin_provisional"),
        tmax_provisional=raw.get("tmax_provisional"),
        rh=None if rain_only else gated("rh", "rh"),
        wind_kmh=None if rain_only else gated("wind_kmh", "wind"),
        wind_dir=None if rain_only else gated("wind_dir", "wind_dir"),
        gust_kmh=None if rain_only else gated("gust_kmh", "gust"),
        rain_rate=gated("rain_rate", "rain"),
        rain_today=gated("rain_today", "rain"),
        rain_48h=_num(raw.get("rain_48h")),
        rain_48h_source=raw.get("rain_48h_source"),
        pressure_hpa=None if rain_only else _num(raw.get("pressure_hpa")),
        last=_iso(last),
        obs_day=obs_day,
        is_today=obs_day == today,
        rain_only=rain_only,
        observation_type=raw.get("observation_type"),
        raw_message=raw.get("raw_metar") or raw.get("raw_synop"),
        source_url=raw.get("source_url"),
    )
    if st.elev is not None:
        st.elev_source = "rete"
    has_value = any(v is not None for v in (st.temp, st.rh, st.wind_kmh, st.rain_rate, st.rain_today, st.tmin, st.tmax))
    st.freshness, st.age_min = _freshness(network, last, now, has_value)
    return st


def _status_for(key, label, source, stations, payload, now, *, status=None, using_last_valid=False, warning=None):
    lasts = [s.last for s in stations if s.last]
    counts = {k: sum(1 for s in stations if s.freshness == k) for k in ("fresh", "stale", "historic")}
    if status is None:
        if not stations:
            status = "unavailable"
        elif counts["fresh"] == 0:
            status = "degraded"
        else:
            status = "ok"
    return NetworkStatus(
        key=key, label=label, source=source, status=status,
        generated_at=payload.get("generated_at") if payload else None,
        checked_at=payload.get("checked_at") if payload else None,
        latest_obs=max(lasts) if lasts else None,
        station_count=len(stations),
        fresh_count=counts["fresh"], stale_count=counts["stale"], historic_count=counts["historic"],
        using_last_valid=using_last_valid, warning=warning,
    )


@router.get("/stations", response_model=StationsResponse)
async def get_stations():
    now = datetime.now(timezone.utc)
    today = now.astimezone(ROME).strftime("%Y-%m-%d")
    stations: list[Station] = []
    networks: list[NetworkStatus] = []

    for key, label, path in NETWORKS:
        got = await fetch_data(path)
        payload = got.data if got and isinstance(got.data, dict) else {}
        rows = [s for raw in payload.get("stations", []) if (s := _normalize(raw, key, now, today))]
        stations += rows
        warn = None
        if got is None:
            warn = "Sorgente non raggiungibile: nessun dato disponibile."
        elif got.retained:
            warn = "Aggiornamento non riuscito: mostrato l'ultimo dataset valido scaricato."
        networks.append(_status_for(key, label, payload.get("source", label), rows, payload, now,
                                    using_last_valid=bool(got and got.retained), warning=warn))

    # CEDOC: live file first, otherwise the last valid snapshot, explicitly marked as such
    live = await fetch_data("data/cedoc.json")
    live_p = live.data if live and isinstance(live.data, dict) else {}
    rows = [s for raw in live_p.get("stations", []) if (s := _normalize(raw, "cedoc", now, today, rain_only=True))]
    using_last_valid, payload, warning, status = False, live_p, live_p.get("warning"), None
    if not rows:
        lv = await fetch_data("data/cedoc_last_valid.json", ttl=600)
        lv_p = lv.data if lv and isinstance(lv.data, dict) else {}
        rows = [s for raw in lv_p.get("stations", []) if (s := _normalize(raw, "cedoc", now, today, rain_only=True))]
        if rows:
            using_last_valid, payload = True, {**lv_p, "checked_at": live_p.get("generated_at")}
            status = "degraded"
            warning = (live_p.get("warning") or "Portale CEDOC non disponibile.") + \
                f" Mostrato l'ultimo snapshot valido ({lv_p.get('local_day', 'data ignota')}), NON aggiornato."
    stations += rows
    networks.append(_status_for("cedoc", "CEDOC Pluviometri", live_p.get("source", "Sardegna CEDOC / ADIS"),
                                rows, payload, now, status=status, using_last_valid=using_last_valid, warning=warning))

    return StationsResponse(server_time=_iso(now), local_day=today, stations=stations, networks=networks)


def _is_sardinia(w: dict) -> bool:
    code = str(w.get("emma_id") or "").upper()
    area = str(w.get("area_desc") or "").lower()
    return code == "IT019" or bool(re.search(r"\bsardegna\b|\bsardinia\b", area))


@router.get("/alerts", response_model=AlertsResponse)
async def get_alerts():
    got = await fetch_data("data/meteoalarm.json", ttl=300)
    if not got or not isinstance(got.data, dict):
        return AlertsResponse(source="MeteoAlarm", active_count=0, upcoming_count=0, max_level=0,
                              warnings=[], available=False)
    d = got.data
    now = datetime.now(timezone.utc)
    regions = d.get("regions") or {}
    out: list[AlertWarning] = []
    for w in d.get("warnings", []):
        if not _is_sardinia(w):
            continue
        exp = _parse(w.get("expires"))
        level = int(_num(w.get("level")) or 0)
        if level < 2 or not exp or exp <= now:
            continue
        onset = _parse(w.get("onset") or w.get("effective"))
        status = "active" if onset and onset <= now else "upcoming"
        geom = w.get("geometry") or (regions.get(w.get("emma_id")) or {}).get("geometry")
        out.append(AlertWarning(
            id=str(w.get("id")), status=status, level=level, level_name=str(w.get("level_name") or ""),
            event=str(w.get("event") or ""), type_name=w.get("type_name"),
            area_desc=str(w.get("area_desc") or ""), onset=_iso(onset), expires=_iso(exp),
            severity=w.get("severity"), certainty=w.get("certainty"), cap_url=w.get("cap_url"), geometry=geom,
        ))
    out.sort(key=lambda a: (a.status != "active", -a.level, a.onset or ""))
    return AlertsResponse(
        source="MeteoAlarm / EUMETNET", feed_updated=d.get("feed_updated"), generated_at=d.get("generated_at"),
        active_count=sum(1 for a in out if a.status == "active"),
        upcoming_count=sum(1 for a in out if a.status == "upcoming"),
        max_level=max((a.level for a in out), default=0), warnings=out,
    )


@router.get("/arome", response_model=AromeResponse)
async def get_arome():
    got = await fetch_data("data/arome/forecast.json", ttl=300)
    if not got or not isinstance(got.data, dict):
        raise HTTPException(status_code=503, detail="Catalogo AROME non disponibile")
    d = got.data
    run = _parse(d.get("run_time"))
    if not run:
        raise HTTPException(status_code=503, detail="Corsa AROME senza run_time")
    frames = []
    for f in d.get("frames", []):
        img, vt = f.get("image", ""), _parse(f.get("valid_time"))
        if not re.fullmatch(r"data/arome/precip_h\d{2}\.png", img) or not vt:
            continue
        frames.append(AromeFrame(lead_hours=int(f["lead_hours"]), valid_time=_iso(vt),
                                 precip_url=DATA_BASE + img, max_mm=_num(f.get("max_mm"))))
    horizon = int(d.get("forecast_horizon_hours") or 0)
    params = [AromeParameter(key=k, label=p.get("label", k), unit=p.get("unit", ""), group=p.get("group", ""),
                             scale=p.get("scale", ""), stops=p.get("stops") or [], phase_colors=p.get("phase_colors"))
              for k, p in (d.get("parameters") or {}).items()]
    tpl = DATA_BASE + str(d.get("product_path_template", "data/arome/products/{parameter}/h{lead:02d}.webp"))
    tpl = tpl.replace("{lead:02d}", "{lead}")
    return AromeResponse(
        model=d.get("model", "AROME"), producer=d.get("producer", "Météo-France"), license=d.get("license"),
        run_time=_iso(run), generated_at=d.get("generated_at"),
        run_age_hours=round((datetime.now(timezone.utc) - run).total_seconds() / 3600, 1),
        horizon_hours=horizon, bounds=d.get("bounds") or [], domain_note=d.get("domain_note"),
        product_url_template=tpl, parameters=params, frames=frames,
        complete=horizon > 0 and len(frames) == horizon,
    )


@router.get("/radar/{product}", response_model=RadarFrames)
async def get_radar(product: str, hours: int = Query(3, ge=1, le=6)):
    product = product.upper()
    if product not in {"VMI", "SRI"}:
        raise HTTPException(status_code=404, detail="Prodotto radar non supportato")
    got = await fetch_json(f"{RADAR_API}/findLastProductByType?type={product}&lang=it", ttl=60)
    try:
        ms = int(got.data["lastProducts"][0]["time"])  # type: ignore[index, union-attr]
    except Exception:
        raise HTTPException(status_code=503, detail="Radar-DPC: ultimo prodotto non disponibile")
    latest = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    step = 5
    n = hours * 60 // step
    frames = [_iso(latest - timedelta(minutes=step * i)) for i in range(n, -1, -1)]
    return RadarFrames(product=product, latest_time=_iso(latest), step_minutes=step, frames=frames)


@router.get("/frp", response_model=FrpResponse)
async def get_frp():
    got = await fetch_data("data/frp.json", ttl=300)
    d = got.data if got and isinstance(got.data, dict) else {}
    dets = []
    for f in d.get("features", []):
        g, p = f.get("geometry") or {}, f.get("properties") or {}
        c = g.get("coordinates") or []
        if g.get("type") != "Point" or len(c) < 2:
            continue
        dets.append(FireDetection(
            lon=float(c[0]), lat=float(c[1]),
            frp_mw=_num(p.get("frp") or p.get("frp_mw") or p.get("FRP")),
            confidence=str(p.get("confidence")) if p.get("confidence") is not None else None,
            time=p.get("time") or p.get("datetime"),
        ))
    return FrpResponse(source=d.get("source", "EUMETSAT"), product=d.get("product", "MTG FCI FRP"),
                       generated_at=d.get("generated_at"), window_minutes=d.get("window_minutes"),
                       latest_detection=d.get("latest_detection"), detections=dets)


@router.get("/rain48", response_model=Rain48Response)
async def get_rain48():
    got = await fetch_data("data/rain_48h.json", ttl=300)
    d = got.data if got and isinstance(got.data, dict) else {}
    n = len(d.get("stations") or [])
    return Rain48Response(generated_at=d.get("generated_at"), description=d.get("description"),
                          coverage_note=d.get("coverage_note"), station_count=n, operational=n > 0)
