#!/usr/bin/env python3
from pathlib import Path
p=Path("index.html")
s=p.read_text(encoding="utf-8")

# Mobile 2D badge readability.
css_anchor=".badge{position:relative;box-sizing:border-box;width:30px;height:30px;padding:0;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#111827;font-weight:900;font-size:8.5px;line-height:1;border:2px solid #fff;box-shadow:0 1px 4px #0009,0 0 0 1px #0002;white-space:nowrap;text-shadow:0 1px 1px #ffffff66}.badge.suspect{opacity:.62}"
css_new=css_anchor+"""
@media(max-width:800px){
  .badge{
    font-size:11.5px;
    font-weight:950;
    color:#fff;
    border-width:2px;
    box-shadow:0 1px 6px #000b,0 0 0 1px #0004;
    text-shadow:
      -1px -1px 0 #000,
       1px -1px 0 #000,
      -1px  1px 0 #000,
       1px  1px 0 #000,
       0 1px 2px #000;
  }
}
"""
if css_anchor not in s:
    raise SystemExit("badge CSS non trovato")
s=s.replace(css_anchor,css_new,1)

old_metrics="""  if(mobile){
    if(z<=7)return {d:26,sx:29,sy:29};
    if(z===8)return {d:27,sx:30,sy:30};
    if(z===9)return {d:28,sx:30,sy:30};
    return {d:29,sx:31,sy:31}
  }"""
new_metrics="""  if(mobile){
    if(z<=7)return {d:34,sx:38,sy:38};
    if(z===8)return {d:35,sx:39,sy:39};
    if(z===9)return {d:36,sx:40,sy:40};
    return {d:37,sx:41,sy:41}
  }"""
if old_metrics not in s:
    raise SystemExit("markerMetrics mobile non trovato")
s=s.replace(old_metrics,new_metrics,1)

# Slightly larger 3D mobile markers too.
s=s.replace("width:34px;height:34px;border-radius:50%;","width:38px;height:38px;border-radius:50%;",1)
s=s.replace("font:950 11px/1 Inter,system-ui,Arial;","font:950 12px/1 Inter,system-ui,Arial;",1)

for required in (
  "font-size:11.5px",
  "if(z<=7)return {d:34,sx:38,sy:38}",
  "width:38px;height:38px",
  "font:950 12px/1"
):
    if required not in s:
        raise SystemExit(f"manca {required}")

p.write_text(s,encoding="utf-8")
print("Badge stazioni mobile ingranditi e resi leggibili")
