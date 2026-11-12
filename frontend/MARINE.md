# Previsioni marine

La sezione usa i servizi pubblici della mappa MeteoHub e funziona sul sito statico GitHub Pages. Non richiede account, chiavi, richieste di estrazione o notifiche email.

- Cataloghi: `https://maps.mistralportal.it/api/ww3/status`, `/api/marine/shyfem/status` e WMS `GetCapabilities` su `/wms`.
- Raster: WMS 1.1.1 `GetMap` in EPSG:3857. I limiti geografici vengono letti dal catalogo; la vista d'insieme copre l'intero Mediterraneo. Avvicinandosi alla Sardegna il riquadro richiesto segue la vista, con un margine: il dettaglio non dipende dall'ingrandimento di un'unica immagine dell'intero bacino.
- Legende: soglie e colori originali da `GetStyles`, senza interpolare le classi. L'ultima soglia WW3 di chiusura (300) viene indicata come classe oltre la soglia precedente.
- Frecce WW3: `/api/ww3/vectors/{zoom}/{DD-MM-YYYY-HH-mm}.geojson`. Si mantiene la convenzione di direzione del portale, con densità limitata sullo schermo.

WW3 mostra l'intersezione delle scadenze di altezza e periodo, da H+1 a H+72 della corsa dichiarata dal servizio. SHYFEM usa la corsa della singola forzante e mostra soltanto le configurazioni effettivamente pubblicate. Il servizio WMS espone una finestra temporale mobile: il parametro aggiuntivo `run` distingue le cache del browser, non seleziona un archivio immutabile lato fornitore.

Le richieste sono attive solo quando necessarie, hanno timeout e cancellazione. I GeoJSON densi escono subito dalla cache delle query quando cambia fotogramma; i renderer riusano un canvas 2D o una sola sorgente GeoJSON 3D. I raster mantengono una sola immagine visibile e un caricamento sostitutivo cancellabile; viene anticipata al massimo una scadenza.

Attribuzioni: WW3 — Agenzia ItaliaMeteo e Arpae Emilia-Romagna; SHYFEM — PNRR Marine Ecosystem Restoration (MER). Visualizzazione MeteoHub — Agenzia ItaliaMeteo e CINECA. Licenza CC BY 4.0, riportata anche nell'interfaccia.

Fonti: [MeteoHub Marine](https://meteohub.agenziaitaliameteo.it/app/maps/marine), [licenze](https://meteohub.agenziaitaliameteo.it/app/license), [WW3 MEDITA](https://www.agenziaitaliameteo.it/mare/previsioni-mare/ww3-medita/).

Verifica locale: `DISABLE_VISUAL_EDITS=true DISABLE_EMERGENT_OVERLAY=true npm exec -- vitest run` e `npm run build` dalla directory `frontend`.
