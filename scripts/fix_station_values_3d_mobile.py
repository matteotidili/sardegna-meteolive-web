#!/usr/bin/env python3
from pathlib import Path
p=Path("index.html")
s=p.read_text(encoding="utf-8")

old_css=""".station3d-mobile-marker{
  display:grid;place-items:center;box-sizing:border-box;
  width:30px;height:30px;border-radius:50%;
  border:2px solid #fff;box-shadow:0 1px 5px #0009;
  color:#07111d;font:900 9px/1 Inter,system-ui,Arial;
  text-align:center;cursor:pointer;user-select:none;-webkit-user-select:none;
  transform:translateZ(0)
}
.station3d-mobile-marker:active{transform:scale(.94)}"""
new_css=""".station3d-mobile-marker{
  display:grid;place-items:center;box-sizing:border-box;
  width:34px;height:34px;border-radius:50%;
  border:2px solid #fff;box-shadow:0 1px 6px #000b;
  text-align:center;cursor:pointer;user-select:none;-webkit-user-select:none;
  transform:translateZ(0)
}
.station3d-mobile-value{
  display:block;min-width:100%;
  color:#fff;
  font:950 11px/1 Inter,system-ui,Arial;
  letter-spacing:-.02em;
  text-align:center;
  text-shadow:
    -1px -1px 0 #000,
     1px -1px 0 #000,
    -1px  1px 0 #000,
     1px  1px 0 #000,
     0 1px 2px #000;
  pointer-events:none
}
.station3d-mobile-marker:active{transform:scale(.94)}"""
if old_css not in s:
    raise SystemExit("CSS marker mobile non trovato")
s=s.replace(old_css,new_css,1)

old_js="""    const s=item.s,el=document.createElement('div');
    el.className='station3d-mobile-marker';
    el.style.background=col(s[cur],P[cur].st);
    el.textContent=fmtMarker(s[cur],cur);
    el.title=(s.name||'Stazione')+' · '+P[cur].n+' '+fmt(s[cur],cur,s);"""
new_js="""    const s=item.s,el=document.createElement('div');
    el.className='station3d-mobile-marker';
    el.style.background=col(s[cur],P[cur].st);
    const valueEl=document.createElement('span');
    valueEl.className='station3d-mobile-value';
    valueEl.textContent=fmtMarker(s[cur],cur);
    el.appendChild(valueEl);
    el.title=(s.name||'Stazione')+' · '+P[cur].n+' '+fmt(s[cur],cur,s);"""
if old_js not in s:
    raise SystemExit("renderer marker mobile non trovato")
s=s.replace(old_js,new_js,1)

for required in ("station3d-mobile-value","font:950 11px","valueEl.textContent=fmtMarker"):
    if required not in s:
        raise SystemExit(f"manca {required}")

p.write_text(s,encoding="utf-8")
print("Valori stazioni 3D mobile resi leggibili")
# rerun corrected workflow
# rerun after JS extraction fix
