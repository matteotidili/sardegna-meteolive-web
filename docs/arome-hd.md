# AROME-France HD 0,01° · Previsioni piogge Mediterraneo occidentale fino a H+51

## Fonte e disponibilità
- **Produttore**: Météo-France.
- **Sorgente ufficiale**: [Paquets AROME – Résolution 0,01°](https://www.data.gouv.fr/datasets/paquets-arome-resolution-0-01deg/), file GRIB2 del pacchetto `SP2` in object storage pubblico.
- **Dominio**: EURW1S100 (latitudini 37,5–55,4°N, longitudini 12°W–16°E), che include la Sardegna.
- **Risoluzione**: griglia pubblicata 0,01° (circa 1 km meridiano, 0,85 km in longitudine alla latitudine della Sardegna); è un prodotto numerico, non un'osservazione radar.
- **Licenza**: Licence Ouverte / Open Licence v2.0, attribuzione Météo-France.

## Elaborazione scientifica
Lo script `matteotidili/sardegna-meteolive-data/scripts/update_arome_hd.py` utilizza i valori autentici GRIB2, senza fare interpolazioni arbitrarie:

1. Seleziona l'ultima corsa disponibile con le scadenze H+1 e **H+51** pubblicate, senza presentare una sequenza incompleta come completa.
2. Per ciascuna scadenza oraria scarica il pacchetto GRIB2 `SP2` e decodifica i tre campi `tirf` (pioggia), `tsnowp` (neve) e `tgrp` (graupel).
3. Verifica livello, geometria, codifica, intervallo di accumulo e unità `kg m**-2`.
4. **I valori SP2 sono cumulati da H+0**: per ottenere il totale previsto nell'ora tra H+(n–1) e H+n, somma le tre componenti e sottrae l'accumulo all'ora precedente.
5. Produce **51 PNG RGBA georeferenziati** per il Mediterraneo occidentale e l'Atlantico prospiciente, senza cartografia incorporata, con extent derivato dai centri griglia e metadati completi. Il ritaglio pubblicato è **12°W–16°E, 37,5°N–47,5°N**: non simula aree a sud di 37,5°N né a est di 16°E.
6. La griglia geografica AROME è rettangolare, ma il dominio meteorologico valido ha impronta trapezoidale; le celle senza dato restano **trasparenti**, senza interpolazioni o estensioni artificiali.

L'acqua equivalente della precipitazione totale nell'ora si esprime in **mm/ora di intervallo** (mm accumulati in 1 h), evitando di spacciare il valore cumulato dalla corsa per intensità istantanea.

## Aggiornamenti e disponibilità
- Workflow: `sardegna-meteolive-data/.github/workflows/update-arome-hd.yml`, controllo una volta all'ora. Le nuove corse AROME HD sono pubblicate ogni 3 h, ma con ritardi talora superiori a 3–4 h.
- Le immagini e i metadati non vengono modificati se la corsa è invariata.
- I file generati sono `data/arome/precip_h01.png` … `precip_h51.png` e `data/arome/forecast.json`.
- Il sito scarica JSON al momento dell'attivazione e controlla nuove corse ogni 12 min mentre il layer è attivo.
- Vengono indicati sia l'orario iniziale della corsa sia quello di validità del frame in fuso Europe/Rome e un avviso quando la corsa ha più di 8 h.

## Interfaccia
**Layer meteo → Previsione piogge → AROME HD · Precipitazione oraria** (inizialmente OFF e separato dal menu dei radar).

Nella **vista 2D**, il layer usa un vero PNG raster georeferenziato Leaflet, con trasparenza per i valori inferiori a 0,1 mm nell'ora, legenda dedicata e timeline interattiva con **51 scadenze orarie**. All'attivazione iniziale viene inquadrato l'intero dominio pubblicato, con i comandi **Intero dominio** e **Centra Sardegna**. In prima apertura viene selezionata l'ora di validità più vicina nel futuro. La riproduzione fa scorrere le scadenze.

Il layer AROME è **mutuamente esclusivo con radar DPC, radar OPERA ed accumulati radar**, per impedire che previsioni e osservazioni vengano sovrapposte senza distinzione. Se l'utente è in 3D e attiva il modello, la webapp passa alla vista satellitare 2D per garantire il corretto georiferimento.

## Avvertenze
Una simulazione AROME a griglia fine non permette di conoscere con certezza posizione, intensità e tempistica dei singoli rovesci o temporali: sono previsioni deterministiche. Per l'attività di monitoraggio attuale, confrontare con radar osservativo e rete pluviometrica. L'intero Mediterraneo non è incluso nel modello AROME HD; il bordo meridionale raggiunge soltanto 37,5°N.

Se mancano i GRIB completi, il collector non pubblica una corsa parziale e non inventa scadenze; il sito segnala gli eventuali errori e la non attualità del run.
