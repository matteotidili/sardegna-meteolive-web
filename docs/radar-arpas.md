# Radar ARPAS Monte Rasu — DPSRI

## Sorgente ufficiale
- Immagini [ARPAS, Dipartimento Meteoclimatico](https://www.sar.sardegna.it/servizi/meteo/imgradar_it.asp?prod=4).
- Prodotto **DPSRI (Dual Polarization Surface Rainfall Intensity)**, a 1.000 m dal suolo; intensità stimata in **mm/h**; portata mostrata **200 km**.
- Archivio originale delle ultime **36 scansioni**, normalmente a passi di 10 minuti.

## Implementazione
Il progetto `sardegna-meteolive-data` usa:
- `scripts/update_arpas_radar.py`, che legge l'HTML ufficiale e ne estrae esclusivamente i link agli originali PNG;
- `.github/workflows/update-arpas-radar.yml`, in esecuzione ogni 10 minuti (salvo ritardi GitHub Actions);
- `data/arpas_radar.json`, metadati con URL e timestamp delle scansioni disponibili.

Le immagini **non vengono scaricate, copiate né modificate** dal collector; il browser le richiede direttamente dal dominio ARPAS.

Nel sito il comando **Precipitazioni → Radar ARPAS · Monte Rasu** (OFF all'avvio) apre un visualizzatore cartografico interno con scanner, slider di 36 frame, play/pausa, comandi avanti/indietro e aggiornamento dati ogni 10 minuti mentre è aperto. In mobile, il menu laterale si chiude all'apertura del visualizzatore.

**Non rappresenta un overlay georeferenziato** di Leaflet/MapLibre: le immagini PNG pubbliche incorporano base geografica, linee di latitudine/longitudine e legenda. Una sovrapposizione arbitraria sulla nostra mappa sarebbe cartograficamente errata senza la proiezione/raster originale e i suoi riferimenti di georettifica. La fonte ufficiale è sempre cliccabile dal visualizzatore.

## Caveat ARPAS
ARPAS avverte che il nuovo radar di Monte Rasu è ancora in fase di test e messa a punto; i dati potrebbero contenere errori di calibrazione o non essere pubblicati continuativamente, e le immagini sono da considerare illustrative. L'interfaccia mostra l'orario UTC convertito automaticamente in ora italiana, segnala ultimo dato oltre 35 minuti e gli errori di caricamento, senza presentare tali frame come dati validati per uso operativo.

La frequenza di raccolta dei metadati non garantisce nuovi dati radar ogni 10 minuti. L'eventuale blocco delle immagini da parte del dominio ARPAS si risolve consultando il collegamento alla sorgente; non vengono usati proxy per aggirarne eventuali restrizioni.
