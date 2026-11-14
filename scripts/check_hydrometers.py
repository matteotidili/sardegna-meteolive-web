#!/usr/bin/env python3
"""Sonda ArcGIS ARPAS senza dati di accesso, per verificare livello e geometrie."""
import json
from datetime import datetime, timezone
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE="https://services6.arcgis.com/VdOe78ROZ6pyB2c8/arcgis/rest/services/idrometri_real_time_vista/FeatureServer/1/query"
ARGS={
    "where":"1=1","outFields":"cod_srv,altra_denominazione,cae_nome,localita,time,value,trend,s1,s2,s3",
    "returnGeometry":"true","outSR":"4326","f":"geojson"
}
request=Request(BASE+"?"+urlencode(ARGS),headers={"User-Agent":"SardegnaMeteoLive/1.0"})
with urlopen(request,timeout=25) as r:
    doc=json.load(r)
    print("HTTP",r.status,"Content type",r.headers.get("Content-Type",""))
if "error" in doc: raise RuntimeError(str(doc["error"])[:350])
rows=doc.get("features",[])
valid=[f for f in rows if f.get("geometry",{}).get("type")=="Point" and
    len(f.get("geometry",{}).get("coordinates",[]))>=2 and f.get("properties",{}).get("cod_srv")]
newest=max((float(t) for f in valid if (t:=f["properties"].get("time")) is not None),default=0)
print("Sezioni ARPAS:",len(rows),"georeferenziate e con codice:",len(valid))
print("Ultima osservazione:",datetime.fromtimestamp(newest/1000,timezone.utc).isoformat() if newest>1e11 else newest)
print("Campi restituiti:",sorted(valid[0]["properties"]) if valid else [])
if len(valid)<25: raise RuntimeError("Dataset ARPAS vuoto o incompleto: meno di 25 sezioni valide")
