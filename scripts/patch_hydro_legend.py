#!/usr/bin/env python3
from pathlib import Path

p=Path("index.html")
s=p.read_text(encoding="utf-8")

old_css=""".hydro-scale{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px;font-size:8px}
.hydro-scale span{display:inline-flex;align-items:center;gap:4px}
.hydro-swatch{width:10px;height:10px;border-radius:50%;border:1px solid #fff;box-shadow:0 0 0 1px #0002}"""
new_css=""".hydro-scale{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:6px;font-size:8px}
.hydro-scale span{display:grid;grid-template-columns:12px minmax(0,1fr);grid-template-rows:auto auto;align-items:center;column-gap:5px;row-gap:1px;padding:5px 6px;border:1px solid #dbe5ea;border-radius:7px;background:#f7fafb}
.hydro-scale span:last-child{grid-column:1/-1}
.hydro-scale span .hydro-swatch{grid-row:1/3}
.hydro-scale span b{font-size:8.5px;line-height:1.15;color:#263d49}
.hydro-scale span small{font-size:7.5px;line-height:1.15;color:#6f808b}
.hydro-swatch{width:10px;height:10px;border-radius:50%;border:1px solid #fff;box-shadow:0 0 0 1px #0002}
@media(max-width:800px){.hydro-scale{grid-template-columns:1fr}}"""
if old_css not in s:
    raise SystemExit("CSS hydro-scale non trovato")
s=s.replace(old_css,new_css,1)

old_stage="""function hydroStageLabel(p){
  const st=hydroStage(p);
  if(st===-2)return 'DATO RITARDATO';
  if(st===-1)return 'DATO N/D';
  if(st===3)return '≥ S3';
  if(st===2)return 'S2–S3';
  if(st===1)return 'S1–S2';
  return '&lt; S1'
}"""
new_stage="""function hydroStageLabel(p){
  const st=hydroStage(p);
  if(st===-2)return 'DATO RITARDATO';
  if(st===-1)return 'DATO N/D';
  if(st===3)return 'SOGLIA 3 SUPERATA · S3';
  if(st===2)return 'SOGLIA 2 SUPERATA · S2';
  if(st===1)return 'SOGLIA 1 SUPERATA · S1';
  return 'NESSUNA SOGLIA SUPERATA'
}"""
if old_stage not in s:
    raise SystemExit("hydroStageLabel non trovato")
s=s.replace(old_stage,new_stage,1)

old_legend="""function hydroLegendHtml(){
  if(!hydroOn)return '';
  return '<div class="map-legend-row"><div class="map-legend-title">IDROMETRI ARPAS · LIVELLO / SOGLIE</div>'+
    '<div class="hydro-scale"><span><i class="hydro-swatch normal"></i>&lt; S1</span><span><i class="hydro-swatch s1"></i>S1–S2</span><span><i class="hydro-swatch s2"></i>S2–S3</span><span><i class="hydro-swatch s3"></i>≥ S3</span><span><i class="hydro-swatch stale"></i>dato ritardato</span></div>'+
    '<div class="map-legend-note">Click sull’idrometro: livello, trend, soglie e idrogramma.</div></div>'
}"""
new_legend="""function hydroLegendHtml(){
  if(!hydroOn)return '';
  return '<div class="map-legend-row"><div class="map-legend-title">IDROMETRI ARPAS · STATO DEL LIVELLO</div>'+
    '<div class="hydro-scale">'+
      '<span><i class="hydro-swatch normal"></i><b>Nessuna soglia superata</b><small>livello inferiore a S1</small></span>'+
      '<span><i class="hydro-swatch s1"></i><b>Superata soglia 1</b><small>livello tra S1 e S2</small></span>'+
      '<span><i class="hydro-swatch s2"></i><b>Superata soglia 2</b><small>livello tra S2 e S3</small></span>'+
      '<span><i class="hydro-swatch s3"></i><b>Superata soglia 3</b><small>livello uguale o superiore a S3</small></span>'+
      '<span><i class="hydro-swatch stale"></i><b>Dato ritardato</b><small>misura non sufficientemente aggiornata</small></span>'+
    '</div>'+
    '<div class="map-legend-note"><b>S1, S2 e S3</b> sono soglie specifiche della singola sezione idrometrica e non corrispondono ai livelli di allerta territoriale. Tocca/clicca un idrometro per livello, trend, soglie e idrogramma.</div></div>'
}"""
if old_legend not in s:
    raise SystemExit("hydroLegendHtml non trovato")
s=s.replace(old_legend,new_legend,1)

for required in (
    "Nessuna soglia superata",
    "Superata soglia 1",
    "Superata soglia 2",
    "Superata soglia 3",
    "non corrispondono ai livelli di allerta territoriale",
    "SOGLIA 3 SUPERATA · S3"
):
    if required not in s:
        raise SystemExit(f"manca {required}")

p.write_text(s,encoding="utf-8")
print("Legenda idrometri resa descrittiva")
