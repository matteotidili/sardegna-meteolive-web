#!/usr/bin/env python3
"""Sondaggio non distruttivo del servizio vento Open-Meteo usato dal frontend."""
import json,urllib.parse,urllib.request,urllib.error,time

ENDPOINT="https://api.open-meteo.com/v1/forecast"

def one(name,lats,lons,model=None):
    args=dict(
       latitude=",".join(map(str,lats)),
       longitude=",".join(map(str,lons)),
       current="wind_speed_10m,wind_direction_10m",
       wind_speed_unit="ms",timezone="GMT")
    if model:args["models"]=model
    url=ENDPOINT+"?"+urllib.parse.urlencode(args)
    req=urllib.request.Request(url,headers={"User-Agent":"sardegna-meteolive-web-wind-check/1.0"})
    try:
      started=time.monotonic()
      with urllib.request.urlopen(req,timeout=45) as resp:
        body=resp.read()
        data=json.loads(body)
        rows=data if isinstance(data,list) else [data]
        ok=sum(1 for r in rows if r.get("current",{}).get("wind_speed_10m") is not None)
        print(name,"HTTP",resp.status,"URL length",len(url),"requested",len(lats),"returned",len(rows),"valid",ok,"duration",round(time.monotonic()-started,1),"seconds")
        print(name,"first time",rows[0].get("current",{}).get("time"))
    except urllib.error.HTTPError as e:
      print(name,"HTTP",e.code,"URL length",len(url),"detail",e.read(300).decode("utf8","replace"))
    except Exception as e:
      print(name,"ERROR",type(e).__name__,str(e)[:400])

one("one-point-ICON", [40],[9],"italia_meteo_arpae_icon_2i")
one("one-point-global",[40],[9])
# Il frontend usa CHUNK=370, 4 richieste parallele fra MED e SARD.
lats=[];lons=[]
for y in range(17):
 for x in range(43):
  lats.append(round(46-y,3))
  lons.append(round(-6+x,3))
one("original-370-mediterranean",lats[:370],lons[:370])
