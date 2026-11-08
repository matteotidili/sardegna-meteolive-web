#!/usr/bin/env python3
"""Raccoglie le osservazioni realtime MeteoNetwork (API v3, token STANDARD) per un elenco di stazioni.

- Credenziali SOLO da secret GitHub: MNW_EMAIL + MNW_PASSWORD (oppure MNW_TOKEN). Mai nel sito.
- Elenco stazioni: config/meteonetwork_stations.json -> {"stations": ["codice1", "codice2", ...]}
  (i codici si leggono sulla LiveMap MeteoNetwork, scheda stazione).
- Politiche MeteoNetwork rispettate: 1 thread, <= 1 richiesta/s, data-realtime/{code} max 5/min
  -> pausa REQUEST_GAP_S fra le richieste; User-Agent identificabile.
- Output: data/meteonetwork.json, stesso schema di data/ecowitt.json (station_id, name, lat, lon, elev,
  temp, tmin, tmax, rh, wind_kmh, wind_dir, gust_kmh, rain_today, rain_rate, pressure_hpa, last, available).
- `last` = observation_time_utc REALE della stazione; nessun valore inventato, fuori range -> null.
- Licenza dati CC-BY 4.0: attribuzione "MeteoNetwork" con link, scritta nel file.
"""
import datetime as dt
import json
import math
import os
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config" / "meteonetwork_stations.json"
OUT = ROOT / "data" / "meteonetwork.json"
API = "https://api.meteonetwork.it/v3"
UA = "SardegnaMeteoLive/1.0 (+https://matteotidili.github.io/sardegna-meteolive-web/; data collector)"
REQUEST_GAP_S = 12.5          # data-realtime/{code}: throttling 5 richieste/minuto
MAX_STATIONS = 60             # 60 x 12.5 s = 12.5 min < intervallo di 15 min
TIMEOUT_S = 25
UTC = dt.timezone.utc


def fnum(v, lo, hi):
    if v is None or isinstance(v, bool) or v == "":
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return round(f, 1) if math.isfinite(f) and lo <= f <= hi else None


def parse_utc(v):
    if not v:
        return None
    s = str(v).strip().replace(" ", "T")
    try:
        d = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=UTC)


def normalize(rec, now):
    """Record MeteoNetwork -> record stazione stile ecowitt.json, o None se inutilizzabile."""
    lat, lon = fnum(rec.get("latitude"), 30, 50), fnum(rec.get("longitude"), 0, 25)
    last = parse_utc(rec.get("observation_time_utc"))
    code = str(rec.get("station_code") or "").strip()
    if lat is None or lon is None or last is None or not code or last > now + dt.timedelta(minutes=10):
        return None
    temp = fnum(rec.get("temperature"), -40, 55)
    rh = fnum(rec.get("rh"), 0, 100)
    wind = fnum(rec.get("wind_speed"), 0, 300)
    wdir = fnum(rec.get("wind_direction_degree"), 0, 360)
    gust = fnum(rec.get("wind_gust"), 0, 400)
    rain = fnum(rec.get("daily_rain"), 0, 1000)
    rate = fnum(rec.get("rain_rate"), 0, 500)
    press = fnum(rec.get("smlp"), 850, 1090)
    if all(v is None for v in (temp, rh, wind, rain, rate)):
        return None
    place = str(rec.get("place") or rec.get("name") or code).strip()
    return {
        "station_id": code,
        "name": place,
        "network": "meteonetwork",
        "lat": lat, "lon": lon,
        "elev": fnum(rec.get("altitude"), -10, 2000),
        "temp": temp,
        "tmin": fnum(rec.get("current_tmin"), -40, 55),
        "tmax": fnum(rec.get("current_tmax"), -40, 55),
        "rh": rh, "wind_kmh": wind, "wind_dir": wdir, "gust_kmh": gust,
        "rain_today": rain, "rain_rate": rate, "pressure_hpa": press,
        "last": last.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "stale_min": round((now - last).total_seconds() / 60, 1),
        "available": {"temp": temp is not None, "rh": rh is not None, "wind": wind is not None,
                      "wind_dir": wdir is not None, "gust": gust is not None, "rain": rain is not None or rate is not None},
        "area": rec.get("area"),
        "source_url": "https://www.meteonetwork.it/rete/livemap/",
    }


def http(method, url, token=None, form=None):
    headers = {"User-Agent": UA, "Accept": "application/json"}
    body = None
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if form is not None:
        boundary = uuid.uuid4().hex
        parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n' for k, v in form.items()]
        body = ("".join(parts) + f"--{boundary}--\r\n").encode()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
        raw = r.read()
        return r.status, (json.loads(raw) if raw else None)


def get_token():
    tok = os.environ.get("MNW_TOKEN", "").strip()
    if tok:
        return tok
    email, pwd = os.environ.get("MNW_EMAIL", "").strip(), os.environ.get("MNW_PASSWORD", "")
    if not email or not pwd:
        raise SystemExit("meteonetwork: secret MNW_EMAIL/MNW_PASSWORD (o MNW_TOKEN) mancanti")
    _, d = http("POST", f"{API}/login", form={"email": email, "password": pwd})
    tok = (d or {}).get("access_token")
    if not tok:
        raise SystemExit("meteonetwork: login senza token")
    return tok


def load_codes(path=CONFIG):
    try:
        d = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    seen, out = set(), []
    for c in d.get("stations", []):
        c = str(c).strip()
        if c and c not in seen and len(c) <= 40 and all(ch.isalnum() or ch in "-_" for ch in c):
            seen.add(c)
            out.append(c)
    return out[:MAX_STATIONS]


def write_atomic(doc, out=OUT):
    out.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(out.parent), suffix=".json")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, out)


def main(fetch=None, sleep=time.sleep, now=None, codes=None, out=OUT):
    codes = load_codes() if codes is None else codes
    if not codes:
        print("meteonetwork: nessuna stazione in config/meteonetwork_stations.json, nulla da fare")
        return False
    if fetch is None:
        token = get_token()
        sleep(1.1)

        def fetch(code):
            st, d = http("GET", f"{API}/data-realtime/{urllib.parse.quote(code)}", token=token)
            return [] if st == 204 or not d else (d if isinstance(d, list) else [d])

    stations, errors = [], 0
    for i, code in enumerate(codes):
        if i:
            sleep(REQUEST_GAP_S)
        try:
            recs = fetch(code)
        except (urllib.error.URLError, TimeoutError, ValueError) as e:
            errors += 1
            print(f"meteonetwork: {code} errore {getattr(e, 'code', '')} {type(e).__name__}")
            if getattr(e, "code", None) in (401, 403, 429):
                break  # credenziali o throttling: fermarsi subito, non insistere
            continue
        t = now or dt.datetime.now(UTC)
        rows = [r for r in (normalize(x, t) for x in recs if isinstance(x, dict)) if r]
        if rows:
            stations.append(max(rows, key=lambda r: r["last"]))
    if not stations:
        print("meteonetwork: nessuna osservazione valida, file precedente mantenuto")
        return False
    t = now or dt.datetime.now(UTC)
    doc = {
        "generated_at": t.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "local_day": t.astimezone(dt.timezone(dt.timedelta(hours=1))).date().isoformat(),
        "source": "MeteoNetwork API v3 · rete amatoriale",
        "license": "CC-BY 4.0 · © MeteoNetwork (https://www.meteonetwork.it)",
        "status": "ok" if not errors else "degraded",
        "station_count": len(stations),
        "requested": len(codes),
        "errors": errors,
        "stations": stations,
    }
    write_atomic(doc, out)
    print(f"meteonetwork: {len(stations)}/{len(codes)} stazioni, errori {errors}")
    return True


if __name__ == "__main__":
    sys.exit(0 if main() is not None else 1)
