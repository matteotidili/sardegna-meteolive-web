# Subregioni storico-geografiche della Sardegna

**Stato: attivo.** Dataset vettoriale locale verificato e pubblicato in `data/subregioni-storiche.geojson`.

## Dati

- Origine: `regioni_storiciche.shp`, Esercitazione 3 del corso GIS GeoNue, documentato nella pagina [Il GIS opensource](https://geonue.com/gis-sistemi-informativi-territoriali-e-pianificazione-partecipata/).
- Fonte cartografica e condizioni: [Le regioni storiche della Sardegna — GeoNue](https://geonue.com/le-regioni-storiche-della-sardegna/).
- Il dataset contiene **35 poligoni con 35 denominazioni distinte**, convertiti automaticamente in coordinate geografiche EPSG:4326 e con geometrie semplificate, senza inventare confini.
- Il codice di acquisizione/normalizzazione è in `scripts/build_subregions.py`.
- Il workflow `.github/workflows/build-subregions.yml` permette di ricostruire il dato originale e controlla completezza, area geografica e presenza di Sulcis e Gallura prima di sovrascriverlo.
- I confini sono **indicativi e storico-geografici**, non amministrativi: la loro delimitazione può variare secondo criteri storici differenti.

## Licenza e obblighi della fonte

GeoNue indica la licenza **CC BY-SA** e prescrive l'attribuzione visibile:

> Realizzato da Nordai Srl sulla piattaforma GeoNue

accompagnata da un link a `https://geonue.com/le-regioni-storiche-della-sardegna/`, al sito e all'account social della piattaforma. La fonte richiede inoltre una comunicazione tempestiva della ripubblicazione all'indirizzo `info@geonue.com`, indicando il link della webapp; è un adempimento editoriale esterno che il repository non può effettuare automaticamente.

Il materiale didattico GeoNue presenta a propria volta condizioni CC BY 3.0 IT: conservare le attribuzioni della fonte ed evitare di dichiarare come proprie le geometrie originali.

## Visualizzazione nell'app

- Nella sezione **Mappa e visualizzazione → Subregioni storiche**, il pulsante viene abilitato al caricamento del file locale, ma il layer rimane **OFF** fino all'attivazione manuale. Anche i **Confini amministrativi** sono OFF all'avvio; entrambi rimangono nel loro stato durante il passaggio tra 2D e 3D.
- **2D**: poligoni con confine tratteggiato azzurro, nessun riempimento, popup per il nome e etichette a zoom opportuno. I layer meteo e le stazioni restano leggibili.
- **3D**: poligoni GeoJSON MapLibre, linea tratteggiata sovrapposta al rilievo ed etichette che evitano sovrapposizioni.
- La posizione del file locale assicura funzionamento indipendente dai vecchi endpoint GeoNue, che restituiscono 404.
- L'importazione manuale GeoJSON rimane disponibile come funzione di verifica o sostituzione locale. Non viene pubblicato automaticamente nulla importato da un singolo browser.

### Controlli

L'estrazione del workflow è conclusa correttamente con 35 denominazioni, inclusi Sulcis, Iglesiente, Trexenta, Marmilla, Ogliastra, Gallura, le Barbagie. Gli accenti originali sono stati ripristinati interpretando lo shapefile con codifica Latin-1, inclusa **Barbagia di Belvì**. Il caricamento visivo nei diversi browser richiede verifica sul sito online.
