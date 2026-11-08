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
