#!/usr/bin/env python3
"""Converti lo shapefile delle regioni storiche GeoNue in GeoJSON locale.

Fonte: https://geonue.com/gis-sistemi-informativi-territoriali-e-pianificazione-partecipata/
Riferimento: Esercitazione 3 (regioni_storiciche.shp).
Confini storico-geografici indicativi, non amministrativi.
"""
from __future__ import annotations

import io
import json
import os
import sys
import zipfile
from pathlib import Path

import requests
import shapefile
from pyproj import CRS, Transformer
from shapely.geometry import mapping, shape
from shapely.ops import transform

DEST = Path("data/subregioni-storiche.geojson")
URLS = (
    "https://www.dropbox.com/s/rkcghjrninxcchx/Esercitazione_3.zip?dl=1",
    "https://www.dropbox.com/scl/fi/2d9xxvmeeekt2ftvotvw9/Esercitazione_3.zip?rlkey=1kgax9kvymzn3z802irmx6m3m&dl=1",
)
IMPORTANT_NAMES = ("sulcis", "gallura", "marmilla", "ogliastra", "barbagia", "campidano", "gerrei", "trexenta")

def download_zip():
    override = os.environ.get("SOURCE_ZIP_URL")
    urls = (override,) if override else URLS
    for url in urls:
        try:
            response = requests.get(url, timeout=75, headers={"User-Agent": "SardegnaMeteoLive-GIS/1.0"})
            response.raise_for_status()
            content = response.content
            if not content.startswith(b"PK") or len(content) > 65_000_000:
                raise ValueError(f"non è uno ZIP valido ({len(content)} byte, {response.headers.get('Content-Type')})")
            with zipfile.ZipFile(io.BytesIO(content)) as z:
                print("ZIP acquisito:", len(content), "byte /", len(z.namelist()), "elementi")
            return content
        except Exception as exc:
            print("Sorgente non disponibile:", url.split("?")[0], exc, file=sys.stderr)
    raise RuntimeError("Nessun archivio ZIP sorgente scaricabile. Nessun confine pubblicato.")

def find_shapefile(archive: zipfile.ZipFile):
    candidates = {}
    for name in archive.namelist():
        suffix = Path(name).suffix.lower()
        if suffix in (".shp", ".shx", ".dbf", ".prj"):
            base = name[: -len(suffix)].lower()
            candidates.setdefault(base, {})[suffix] = name
    shapes = [(key,files) for key,files in candidates.items()
              if ".shp" in files and ".dbf" in files]
    shapes.sort(key=lambda t: (0 if "storic" in t[0] else 1, len(t[0])))
    for key, files in shapes:
        if "storic" in key and "region" in key:
            return key, files
    raise RuntimeError("Lo ZIP non contiene regioni_storiciche.shp/.dbf; "
                       "shapefile disponibili: " + ", ".join(k for k,_ in shapes[:25]))

def field_name(records, keys):
    available = list(records[0].keys())
    def score(name):
        vals = [str(row.get(name) or "").strip() for row in records]
        matches = sum(any(keyword in val.casefold() for keyword in IMPORTANT_NAMES) for val in vals)
        semantic = 10 if name.casefold() in ("nome", "name", "denominazione", "regione", "subregione", "nomereg", "nome_reg") else 0
        return (matches, semantic, len(set(vals)))
    names = [n for n in available if isinstance(records[0].get(n), str)]
    if not names:
        raise RuntimeError("Nessun campo testuale nello shapefile: " + ", ".join(available))
    winner = max(names, key=score)
    if score(winner)[0] < 3:
        raise RuntimeError("Non identificato un campo con nomi delle subregioni. Campi: " + ", ".join(available))
    return winner

def decimals(value):
    if isinstance(value, (list, tuple)):
        return [decimals(v) for v in value]
    if isinstance(value, (int, float)):
        return round(value, 5)
    return value

def convert(content: bytes):
    with zipfile.ZipFile(io.BytesIO(content)) as z:
        # Alcuni pacchetti contengono gli esercizi annidati in un altro ZIP.
        try:
            base, files = find_shapefile(z)
        except RuntimeError:
            nested = [n for n in z.namelist() if n.lower().endswith(".zip")]
            for name in nested:
                if z.getinfo(name).file_size > 90_000_000:
                    continue
                with zipfile.ZipFile(io.BytesIO(z.read(name))) as sub:
                    try:
                        find_shapefile(sub)
                    except RuntimeError:
                        continue
                return convert(z.read(name))
            raise
        print("Shapefile individuato:", base)
        def source(ext):
            name = files.get(ext)
            if not name:
                return None
            if z.getinfo(name).file_size > 90_000_000:
                raise RuntimeError("Elemento sorgente troppo grande: " + name)
            return io.BytesIO(z.read(name))
        # Lo shapefile GeoNue usa accenti in codifica occidentale legacy, non UTF-8.
        reader = shapefile.Reader(shp=source(".shp"), shx=source(".shx"), dbf=source(".dbf"), encoding="latin1")
        field_names = [field[0] for field in reader.fields[1:]]
        records = [dict(zip(field_names, tuple(item.record))) for item in reader.shapeRecords()]
        if not records:
            raise RuntimeError("Lo shapefile non contiene record")
        name_field = field_name(records, field_names)
        print("Campo denominazione:", name_field, "; feature:", len(records))
        projection = source(".prj")
        if projection is not None:
            crs = CRS.from_wkt(projection.read().decode("utf-8", "replace"))
            print("CRS sorgente:", crs.to_string())
        else:
            # Senza CRS non è sicuro inventare coordinate; fallimento esplicito.
            raise RuntimeError("Manca il file .prj: impossibile riproiettare accuratamente")
        transformer = Transformer.from_crs(crs, CRS.from_epsg(4326), always_xy=True)
        result = []
        for index, item in enumerate(reader.shapeRecords()):
            name = str(records[index].get(name_field) or "").strip()
            if not name:
                continue
            geom = transform(transformer.transform, shape(item.shape.__geo_interface__))
            if not geom.is_valid:
                geom = geom.buffer(0)
            if geom.is_empty or geom.geom_type not in ("Polygon", "MultiPolygon"):
                continue
            if not (7.7 <= geom.bounds[0] < geom.bounds[2] <= 10.2
                    and 38.5 <= geom.bounds[1] < geom.bounds[3] <= 41.6):
                raise RuntimeError(f"Geometria fuori Sardegna: {name} / {geom.bounds}")
            geom = geom.simplify(0.00016, preserve_topology=True)
            result.append({"type":"Feature","properties":{
                "nome":name,
                "limiti_indicativi":True,
                "fonte":"GeoNue/Nordai — Esercitazione 3, regioni_storiciche",
            },"geometry":{**mapping(geom),"coordinates":decimals(mapping(geom)["coordinates"])}})
        names={f["properties"]["nome"].casefold() for f in result}
        print("Poligoni validi:",len(result),"nomi unici:",len(names))
        if len(names)<12:
            raise RuntimeError(f"Dataset incompleto: solo {len(names)} nomi distinti")
        if not any("sulcis" in name for name in names):
            raise RuntimeError("Manca Sulcis: dataset forse non coerente")
        if not any("gallura" in name for name in names):
            raise RuntimeError("Manca Gallura: dataset forse non coerente")
        return {"type":"FeatureCollection","features":result}

def main():
    geojson = convert(download_zip())
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(geojson,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
    print("GeoJSON scritto:", DEST, DEST.stat().st_size, "byte")
    print("ATTRIBUZIONE: Realizzato da Nordai Srl sulla piattaforma GeoNue",
          "https://geonue.com/le-regioni-storiche-della-sardegna/ (CC BY-SA)")

if __name__=="__main__":
    main()
