# Sardegna MeteoLive v2 (FastAPI + React rebuild)

Operational meteorological map for Sardinia. Read-only: no auth, no user accounts, no seeded DB data.
All data is REAL and read live from the public repo `matteotidili/sardegna-meteolive-data` (raw.githubusercontent, main branch),
plus Radar-DPC API/S3 tiles. Backend caches each upstream file 60 s (alerts/arome/frp 5 min) and keeps the last-good copy on failure.

## Endpoints (backend/routers/meteo.py, all under /api)
- GET /api/stations → {server_time, local_day, stations[], networks[]}. Networks: dpcn-sardegna (stations.json), aeronautica-militare (am.json),
  ecowitt (ecowitt.json), cedoc (cedoc.json, falls back to cedoc_last_valid.json with using_last_valid=true, status degraded).
  Freshness per station from its own `last` (observation time): fresh/stale/historic/unavailable (thresholds per network in THRESHOLDS).
  `is_today` = obs local day (Europe/Rome) == today; daily params (tmin/tmax/rain_today) from past days are shown as historic.
  CEDOC = rain_only (temperature fields forced null).
- GET /api/alerts → MeteoAlarm warnings for Sardinia only (emma_id IT019), level>=2, not expired; active/upcoming.
- GET /api/arome → AROME HD run metadata, 51 frames, 21 parameters, absolute product URL template.
- GET /api/radar/{VMI|SRI} → last 3 h frame times (5 min). 404 for other products, 503 if DPC API down.
- GET /api/frp, GET /api/rain48 (rain48 currently non operational: 0 stations upstream).

## Frontend (src/pages/Home.tsx)
Full-screen Leaflet 2D map; parameter chips; station badges colored by value, decluttered per zoom (overlaps → dots);
fresh/stale(dashed amber)/historic(hatched grey) styles; station list (search, asc/desc sort, network filters);
station card (network, value, unit, obs time Europe/Rome, freshness, elevation + source);
layers: radar DPC VMI/SRI (canvas red-channel decoding ported from original), AROME (lat/lon raster re-projected to Mercator client-side),
MeteoAlarm polygons, FRP; timeline with play 1×/2×/3× advancing only when frame fully loaded; health dialog; localStorage state.
Polling: stations 60 s + refetch on focus/reconnect.

## Known deviations from original spec
No 3D MapLibre mode, no EUMETSAT satellite, no lightning, no OPERA, no AROME wind streamlines, no DTM elevation estimate.
WU / WeatherLink intentionally not integrated (suspended). Collectors (GitHub Actions) unchanged — this app only reads their output.
