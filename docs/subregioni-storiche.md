# Layer «Subregioni storico-geografiche della Sardegna»

Stato: **base cartografica da acquisire/validare**. Non pubblicare confini tracciati per approssimazione o ricavati automaticamente da una sola immagine JPEG.

## Denominazioni di riferimento

Come nomenclatura iniziale utilizzare la tavola 3 dell'Assetto Storico-Culturale del Piano Paesaggistico Regionale (21/11/2005), che elenca 35 regioni storiche. I confini sono di carattere **indicativo** e non costituiscono limiti amministrativi vigenti. I nomi potranno essere normalizzati durante la validazione.

Costiere (16): Anglona, Baronie, Campidano di Cagliari, Campidano di Oristano, Caputera, Gallura, Iglesiente, Sulcis, Montiferru, Nurra, Ogliastra, Paese di Villanova, Planargia, Quirra, Romangia, Sarrabus.

Interne (19): Barbagia di Belvì, Barbagia di Ollolai, Barbagia di Seulo, Barigadu, Gerrei, Goceano, Mandrolisai, Marghine, Marmilla, Media valle del Tirso, Meilogu, Montacuto, Nuorese, Parteolla, Sarcidano, Trexenta, Usellus, Campidano, Sassarese.

Nota: altre classificazioni storico-geografiche possono differire quanto a denominazioni e delimitazioni (in particolare Barbagie, Logudoro, Sulcis/Iglesiente, Campidano e altre aree). La scelta di un *unico* quadro cartografico è necessaria per evitare sovrapposizioni e vuoti arbitrari.

## Sorgenti

1. Regione Autonoma della Sardegna, Piano Paesaggistico Regionale, Tav. 3, «Mosaico delle emergenze storico-culturali» (21/11/2005): https://www.regione.sardegna.it/documenti/1_46_20051209180827.pdf
2. Regione Autonoma della Sardegna, quadro metodologico sulle regioni storiche, con indicazione del criterio comunale e della natura indicativa dei limiti: https://www.regione.sardegna.it/documenti/1_274_20131029174249.pdf
3. GeoNue, «Le regioni storiche della Sardegna»: https://geonue.com/le-regioni-storiche-della-sardegna/ . Fonte alternativa vettoriale e mappa partecipata, con licenza CC BY-SA e obblighi aggiuntivi di attribuzione/comunicazione descritti nella pagina. Il link GeoJSON attualmente non è stato recuperato in modo verificabile.

La singola immagine del Sulcis https://it.wikipedia.org/wiki/File:SAR-Subregioni-Sulcis.jpg non costituisce una geometria utilizzabile e specifica chiaramente che alcuni confini sono controversi.

## Specifica tecnica del dataset

Destinazione prevista: `data/subregioni-storiche.geojson`, formato GeoJSON RFC 7946, coordinate WGS84 in ordine [longitudine, latitudine].

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": "sulcis",
      "properties": {
        "id": "sulcis",
        "nome": "Sulcis",
        "gruppo": "costiera",
        "fonte": "PPR 2005 / fonte vettoriale verificata",
        "limiti_indicativi": true
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": ["SOSTITUIRE_CON_COORDINATE_REALI"]
      }
    }
  ]
}
```

L'esempio è uno **schema illustrativo non valido come geometria**. Non copiare le coordinate fittizie in produzione. Accettare `Polygon` e `MultiPolygon`. Per ogni unità servono una geometria validata, denominazione, provenienza e licenza.

## UI prevista

Nella sezione «Mappa e visualizzazione» mantenere l'interruttore «Confini amministrativi» separato dal nuovo interruttore «Subregioni storico-geografiche».

* 2D: linee tratteggiate color ottanio con sottile alone chiaro, riempimento trasparente, etichetta del nome al centro visivo e popup su selezione.
* 3D: sorgente GeoJSON MapLibre, linee tratteggiate drappeggiate sul rilievo e nomi con collision detection. Evitare pannelli che oscurano il radar.
* Stato iniziale OFF; etichette preferibilmente visibili da zoom ≥ 7; mantenere distinzione dai confini ufficiali.
* Nota sempre disponibile «Confini storico-geografici indicativi, non amministrativi».
* Se i dati non sono disponibili, non mostrare confini, conteggi o etichette inventati. Consentire errore di caricamento comprensibile e lasciare inalterati i layer esistenti.

## Verifiche prima dell'attivazione

* Origine, licenza e corretta attribuzione dei dati.
* Copertura delle zone interessate e coerenza fra regioni limitrofe; geometrie valide, coordinate EPSG:4326.
* Accuratezza toponomastica e casi dibattuti; rimuovere eventuali sovrapposizioni spurie.
* Performance e leggibilità su smartphone e nel 3D inclinato, insieme a radar, stazioni, idrometri e MeteoAlarm.
