# Patch per `sardegna-meteolive-data` — storico 24 h delle stazioni

Serve al grafico "Ultime 24 ore" della scheda stazione (temperatura + pioggia).
Senza questa patch la webapp mostra solo la pioggia DPCN da `rain_history.json`
e segnala in chiaro che lo storico temperatura non è ancora pubblicato.

Copiare nel repository dati, mantenendo i percorsi:

- `scripts/update_station_history.py`
- `tests/test_station_history.py`
- `.github/workflows/update-station-history.yml`

Caratteristiche:
- nessuna nuova chiamata API e nessuna credenziale: legge solo `data/stations.json`, `data/am.json` e `data/ecowitt.json`;
- orario = `last`, cioè l'orario reale di osservazione; i campioni più vecchi di 95 min o nel futuro vengono scartati;
- valori mancanti = `null`, mai zero; nessuna interpolazione; conservazione per 26 h;
- workflow indipendente, ogni 15 min, con lock di concorrenza e push con retry/rebase come gli altri workflow.

Test locale: `python -m unittest tests/test_station_history.py`

## MeteoNetwork (rete amatoriale, accesso STANDARD gratuito)

File: `scripts/update_meteonetwork.py`, `tests/test_meteonetwork.py`, `config/meteonetwork_stations.json`,
`.github/workflows/update-meteonetwork.yml`. Output: `data/meteonetwork.json` (stesso schema di `ecowitt.json`).

1. Creare un account gratuito su myMeteoNetwork (https://my.meteonetwork.it).
2. Nel repository `sardegna-meteolive-data` → Settings → Secrets and variables → Actions → New repository secret:
   `MNW_EMAIL` e `MNW_PASSWORD` (credenziali myMeteoNetwork). Non vanno mai nel codice né nella webapp.
3. Inserire in `config/meteonetwork_stations.json` i codici stazione (dalla LiveMap, scheda della stazione), max 60.
4. Actions → "Aggiorna stazioni MeteoNetwork" → Run workflow per la prima prova; poi parte da solo ogni 15 minuti.

Regole: 1 thread, una richiesta ogni 12,5 s (limite 5/min di data-realtime), User-Agent identificabile, stop immediato
su 401/403/429. Orario `last` = observation_time_utc reale; valori fuori range → null; se nessuna osservazione valida
il file precedente resta invariato. Licenza CC-BY 4.0: la webapp mostra "© MeteoNetwork" con link su ogni stazione.
La webapp mostra la rete solo dopo la prima pubblicazione di `data/meteonetwork.json`.
