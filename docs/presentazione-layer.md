# Presentazione dei layer e mappe stimate

## Inventario del frontend React

| Gruppo | Comandi e prodotti | Tipo, unità e orario |
| --- | --- | --- |
| Radar e piogge osservate | Echi radar sull’Italia (DPC VMI), intensità di pioggia in Europa (OPERA), pioggia accumulata da radar DPC a 1, 3, 6, 12 e 24 ore | Il VMI mostra l’intensità degli echi con scala qualitativa. L’intensità di pioggia è in mm/h e gli accumuli in mm. L’archivio puntuale usa il prodotto quantitativo all’orario mostrato. |
| Stazioni e osservazioni | Temperatura, minima e massima in °C, umidità in %, vento e raffiche in km/h, intensità di pioggia in mm/h, cumulate di oggi e di 48 ore in mm, pressione in hPa | Misure con ora e anzianità dell’osservazione. Le minime, le massime e la cumulata di oggi fanno riferimento al giorno locale. |
| Mappa stimata dalle stazioni | Temperatura attuale, minima e massima, intensità di pioggia, cumulata di oggi e a 48 ore, vento e raffiche | Analisi derivata IDW² nelle stesse unità delle misure. La legenda mostra la scala continua, le stazioni usate e l’ora dell’ultimo dato. |
| Immagini satellitari | Nubi ad alta definizione (HRV), masse d’aria e fronti (Airmass), temporali individuati dal satellite (RDT), nubi e superficie terrestre (GeoColour), tipo e quota delle nubi (Cloud Type), temperatura delle nubi (IR 10,5 μm), acqua e ghiaccio nelle nubi (Cloud Phase), neve, nebbia e nubi basse (Day Snow Fog), intensità di pioggia stimata (H40B), fulmini rilevati dal satellite (LI AFA) | Immagini e prodotti derivati, datati al fotogramma. Le composizioni RGB e le aree dei lampi si leggono come immagini qualitative. H40B stima un’intensità in mm/h. Le fonti e i nomi tecnici restano nelle attribuzioni. |
| Previsioni meteo | Previsione AROME-France HD e animazione del vento previsto a 10 m | Il titolo separa la previsione dall’osservazione. La timeline indica la validità in ora locale. L’emissione della corsa resta in dettaglio. |
| Mare e boe | Stazioni del livello del mare e boe delle onde ISPRA, previsioni di onde e livello del mare (WW3 MEDITA e SHYFEM) | Le boe mostrano misure di temperatura dell’acqua (°C), livello (m), altezza significativa e massima delle onde (m), periodo medio e di picco (s), direzione delle onde e della corrente (°), velocità della corrente (m/s) e i parametri meteo disponibili. Il modello mostra altezza significativa (m), periodo medio (s) e livello (m) al rispettivo orario di previsione. Le frecce WW3 indicano la direzione. |
| Vento vicino al suolo | Vento stimato per l’ora attuale, vento misurato dalle stazioni | Campo di previsione Open-Meteo a 10 m e misure puntuali delle stazioni, in km/h con direzione. |
| Altri dati | Webcam Panoramicams, livelli di fiumi e corsi d’acqua ARPAS, fulmini rilevati da terra, allerte MeteoAlarm, confini amministrativi, comunali e subregioni storiche | Webcam con collegamento al live, livelli in m rispetto allo zero locale, fulmini con anzianità, allerte con periodo di validità, contorni di riferimento senza unità meteorologica. |

Le basi disponibili sono operativa scura, immagini satellitari del terreno, chiara, stradale e rilievo. La vista 3D dipende da WebGL. Il prodotto quantitativo SRI alimenta le interrogazioni radar. Il feed incendi FRP è presente nel codice sorgente e non esposto come comando nella vista React.

## Parametri del modello atmosferico

| Fenomeno | Parametri pubblicati e titoli |
| --- | --- |
| Temperatura e umidità | Temperatura a 2 metri, massima e minima dall’inizio della previsione, percepita con vento freddo e punto di rugiada (°C), indice di disagio per caldo umido, umidità relativa (%) |
| Vento | Vento medio a 10 metri, raffiche e raffica massima dall’inizio della previsione (km/h), direzione di provenienza (°) |
| Atmosfera e instabilità | Pressione al suolo (hPa), energia disponibile per i temporali (J/kg), echi radar simulati (dBZ indicativi) |
| Nuvole | Copertura di nubi basse, medie e alte (%), temperatura vista all’infrarosso simulata (°C) |
| Precipitazioni | Precipitazioni totali nell’ora, pioggia nell’ora, pioggia e precipitazioni totali dall’inizio della previsione (mm), neve e neve tonda nell’ora o cumulate dall’inizio della previsione, cumulata combinata (tutte in mm equivalenti d’acqua), tipo prevalente (categorie) |

La mappa stimata usa il multipoligono del confine regionale ISTAT (codice 20), edizione 1 gennaio 2026, estratto senza semplificazione aggiuntiva dalla copia WGS84 di geojson-italy. Il file include 183 poligoni. Dati ISTAT tramite geojson-italy, licenza [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). La geometria viene applicata dopo il calcolo del campo e prima della composizione sul basemap. La sfumatura grafica usa il colore dei campioni con supporto sufficiente e conserva il metodo, le scale, le unità e le osservazioni originali. I valori sui marker seguono la misura rappresentata quando la mappa stimata è attiva. [Confini ISTAT](https://www.istat.it/notizia/confini-delle-unita-amministrative-a-fini-statistici/) · [File sorgente, geojson-italy](https://github.com/guglielmo/geojson-italy/blob/ba3347df3a53352891109f8198c597a0273684c0/geojson/limits_IT_regions.geojson)

La suite controlla attivazione, titolo e orario dei dieci prodotti satellitari con cataloghi e immagini di prova, comandi degli altri gruppi, ritaglio a campione, isole minori, pan, zoom, resize, cambio basemap e assenza della maschera. Le conversioni scientifiche dei feed restano invariate. Le composizioni senza legenda cromatica del fornitore sono accompagnate da una descrizione qualitativa. Le firme cromatiche specialistiche di tutte le composizioni e le combinazioni di tutti i layer con ogni basemap e dispositivo richiedono verifiche ulteriori.
