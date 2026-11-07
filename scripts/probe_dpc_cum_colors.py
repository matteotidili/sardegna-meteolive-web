#!/usr/bin/env python3
"""One-off probe: inspect color statistics of Radar-DPC SRT/CUM WebP tiles."""
import collections, datetime, io, json, math, urllib.request, urllib.error
from PIL import Image

URL="https://radar-api.protezionecivile.it/findLastProductByType?type={key}&lang=it"
BASE="https://s3-prod-dpc-radar-webp-cache.s3.eu-south-1.amazonaws.com"

def get(url):
    req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0",
        "Origin":"https://radar.protezionecivile.it","Referer":"https://radar.protezionecivile.it/",
        "Accept":"*/*"})
    with urllib.request.urlopen(req,timeout=25) as response:return response.read()

def tilexy(lat,lon,z):
    return (int((lon+180)/360*(2**z)), int((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*(2**z)))

for key in ["SRT1","CUM3","CUM6","CUM12","CUM24","VMI"]:
    try:
        api=json.loads(get(URL.format(key=key)))
        lst=api.get("lastProducts") or []
        if not lst:print(key,"no latest",str(api)[:100]);continue
        ts=int(lst[0]["time"])
        day=datetime.datetime.fromtimestamp(ts/1000,datetime.timezone.utc)
        print("KEY",key,"stamp",day.isoformat())
        for z in [6,7]:
            for lat,lon in [(40.02,9.02),(39.25,9.10),(40.9,9.5),(40.52,8.52)]:
                x,y=tilexy(lat,lon,z)
                name=key.lower() if key!="SRT1" else "srt1"
                url=f"{BASE}/{key}/{day:%Y/%m/%d/%H%M}/{z}/{x}/{y}/{name}.webp"
                try:
                    data=get(url)
                    img=Image.open(io.BytesIO(data)).convert("RGBA")
                    pixels=list(img.getdata())
                    counts=collections.Counter(pixels)
                    non=[p for p in pixels if p[3]>0 and max(p[:3])>9]
                    if not non:print("  tile empty",z,x,y);continue
                    red=[p for p in non if p[0]>p[1]*3 and p[0]>p[2]*3]
                    grey=[p for p in non if max(p[:3])-min(p[:3])<10]
                    low=[p for p in non if max(p[:3])<65]
                    avg=[round(sum(p[i] for p in non)/len(non),1) for i in range(4)]
                    print("  TILE",z,x,y,"bytes",len(data),"mode",img.mode,"nonzero",len(non),
                          "redpct",round(len(red)/len(non),3),"greypct",round(len(grey)/len(non),3),
                          "darkpct",round(len(low)/len(non),3),"avg",avg,"top",counts.most_common(10))
                    break
                except urllib.error.HTTPError as exc:
                    print("  tile not available",z,x,y,exc.code)
                except Exception as exc:
                    print("  tile error",z,x,y,type(exc).__name__,str(exc)[:120])
    except Exception as exc:
        print("KEY ERROR",key,type(exc).__name__,str(exc)[:150])
