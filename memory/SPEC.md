# Sardegna MeteoLive v2 (React, static-capable)

Operational meteorological map for Sardinia, Italian UI. Read-only: no auth, no accounts, no seeded DB data.
All data is REAL, read DIRECTLY BY THE BROWSER (src/lib/clientData.ts) so the app runs as a static site on GitHub Pages:
- public data repo `matteotidili/sardegna-meteolive-data` (raw.githubusercontent, cache-busted per minute, last-good copy kept)
- Radar-DPC API + S3 WebP tiles, EUMETSAT WMS (MTG), Blitzortung/LightningMaps websocket, Mapterhorn DEM (3D).
The FastAPI backend (backend/routers/*.py) mirrors the same logic under /api but the frontend no longer depends on it
(only fallback: /api/radar/{product} if the direct DPC call fails).

## Rules (clientData.ts)
- Stations: dpcn-sardegna (stations.json), aeronautica-militare (am.json), ecowitt (ecowitt.json),
  cedoc (cedoc.json → cedoc_last_valid.json fallback, using_last_valid=true, status degraded).
- Freshness from each station's own `last`: fresh/stale/historic/unavailable (THRESHOLDS per network).
  Daily params (tmin/tmax/rain_today) from a past local day (Europe/Rome) are historic; CEDOC = rain_only.
- Alerts: MeteoAlarm IT019 (Sardegna) only, level ≥ 2, not expired.
- AROME: forecast.json catalogue (51 leads, 21 params); rasters lat/lon warped to Mercator client-side (lib/mercator.ts).
- Wind streamlines: wind_vectors/hNN.bin (int16 LE U/V, 0.1°), shown only if same run_time as the AROME field, synced to lead; 2D only.
- Station vs model: nearest lead to the observation time (±90 min); T2m/RH/gust by colour-ramp inversion (approx, marked ≈), wind from U/V.
- Satellites: EUMETSAT WMS frames probed for real availability (truecolour, ir105, cloudphase, snowfog, preciprate, li).
- Lightning: live websocket, strokes kept 60 min, coloured by age.

## UI (src/pages/Home.tsx)
Leaflet 2D + MapLibre 3D (toggle `map-mode-toggle`), parameter chips, solid rounded value badges ALWAYS shown at every zoom
(no dots, no dashed borders; stale/historic only slightly muted; z-order selected > fresh > stale > historic),
station list (search/sort/network filters), station card + model comparison, layers panel, timeline (advances only when the frame is loaded),
health dialog (CEDOC status shown ONLY there — user asked not to show it on the home screen), localStorage state.

## Deploy to the original link
`.github/workflows/deploy-pages.yml` builds frontend/ (vite base "./") and publishes it to GitHub Pages; the original
monolithic site is copied in `classic/` and published at /classic/. Requires repo Settings → Pages → Source = GitHub Actions.

## Known deviations
No 3D wind streamlines; WU / WeatherLink intentionally not integrated.

## Added (iteration 3)
- OPERA (anim "radar-OPERA"): RadarEU NIMBUS rain-rate tiles `tiles.radareu.cz/tiles/nimbus/rate/<YYYYMMDDTHHMM>/{z}/{x}/{y}.png`,
  15-min step, 12 frames probed for existence (getOpera), same TimelinePlayer as DPC, 2D + 3D.
- Elevation: network value wins ("rete"); else `data/station_elevations.json` (DTM 10 m Regione Sardegna → "dtm10", SRTM → "srtm30");
  else Mapterhorn terrarium DEM z12 sampled in browser (labelled "stima DEM Mapterhorn"). Always labelled terrain ≠ sensor.
- 24 h chart (StationHistoryChart): `data/station_history_24h.json` (station_history_v1: [epoch_min, temp10, rain10]) produced by
  `data-repo-patch/` (script + test + workflow to copy into sardegna-meteolive-data). Until published: rain only, from
  `rain_history.json` (DPCN daily counters), with explicit note. A 404 for station_history_24h.json is EXPECTED until the patch is applied.

## Administrative boundaries (iteration 4)
- Toggle "Confini amministrativi" (layer-toggle-boundaries, persisted key `boundaries`, default ON) in LayerPanel.
- Same sources as the original static app (src/lib/boundaries.ts): geojson-italy limits_IT_regions + france-geojson Corsica; fallback repo data/sardegna.geojson. White 1.3px line over dark 3.6px halo; 2D pane "bounds" (z 370) and 3D line layers bounds-halo/bounds-line.
- The Esri "World_Boundaries_and_Places" overlay on the satellite basemap was removed (as in the original, satellite has no label overlay).

## Subregions + municipal boundaries (iteration 5)
- "Subregioni storiche" toggle (layer-toggle-subregions, key `subregions`, default OFF): 35 polygons from repo data/subregioni-storiche.geojson (GeoNue/Nordai credit shown under toggle), dashed cyan lines + name labels from zoom 7.8 (2D divIcon .subregions-label, 3D HTML markers), popup "non è un limite amministrativo".
- "Confini comunali" toggle (layer-toggle-municipalities, key `municipalities`, default ON): 377 Sardinian municipalities from geojson-italy limits_R_20_municipalities, thin grey lines, loaded lazily and shown only from Leaflet zoom 9 (3D minzoom 8).
