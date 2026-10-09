#!/usr/bin/env python3
"""Analizza solo metadata e html del radar ARPAS per valutarne l'integrazione."""
import re, requests, urllib.parse,html
origin="https://www.sar.sardegna.it/servizi/meteo/imgradar_it.asp?prod=4"
s=requests.Session()
for u in [origin,origin.replace("www.sar.","www1.sar."),origin.replace("www.sar.","")]:
 try:
  r=s.get(u,timeout=18,headers={"User-Agent":"Mozilla/5.0 (compatible; SardegnaMeteoLive radar source inspection)"})
  print("PAGE",u,"status",r.status_code,"url",r.url,"content_type",r.headers.get('content-type'),"bytes",len(r.content),flush=True)
  if r.status_code!=200:continue
  content=r.content.decode(r.apparent_encoding or "latin1","replace")
  print("HTMLSTART",repr(content[:1200]),flush=True)
  for line in content.splitlines():
   if re.search(r'\.png|\.gif|\.jpe?g|\.asp|\.js|\.swf|fetch|frame|radar|riflett|precipit|georif|portata|ora',line,re.I):
    cleaned=re.sub(r"\s+"," ",line).strip()
    if cleaned and len(cleaned)<2000:print("HIT",cleaned[:900],flush=True)
  for src in re.findall(r'(?:src|href)\s*=\s*["\']([^"\']+)["\']',content,re.I):
   if not re.search(r'\.(png|gif|jpe?g)(?:\?|$)|radar',src,re.I):continue
   full=urllib.parse.urljoin(r.url,html.unescape(src))
   try:
    resp=s.get(full,timeout=12,headers={"User-Agent":"Mozilla/5.0","Referer":r.url},stream=True)
    print("ASSET",full[:230],"status",resp.status_code,"ctype",resp.headers.get("Content-Type"),"length",resp.headers.get("Content-Length"),flush=True)
   except Exception as exc:print("ASSET_ERROR",full[:210],str(exc)[:180],flush=True)
  break
 except Exception as exc:print("ERR",str(exc)[:280],flush=True)
