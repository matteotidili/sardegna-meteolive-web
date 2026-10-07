#!/usr/bin/env python3
from pathlib import Path
p=Path("index.html")
s=p.read_text(encoding="utf-8")

old="""function hydroNum(v){const n=Number(v);return Number.isFinite(n)?n:null}"""
new="""function hydroNum(v){
  if(v===null||v===undefined||v==='')return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null
}
function hydroHasThresholds(p){
  return hydroNum(p?.s1)!==null||hydroNum(p?.s2)!==null||hydroNum(p?.s3)!==null
}"""
if old not in s:
    raise SystemExit("hydroNum non trovato")
s=s.replace(old,new,1)

old_stage="""function hydroStage(p){
  const v=hydroNum(p?.value),s1=hydroNum(p?.s1),s2=hydroNum(p?.s2),s3=hydroNum(p?.s3);
  if(v===null)return -1;
  if(hydroStale(p))return -2;
  if(s3!==null&&v>=s3)return 3;
  if(s2!==null&&v>=s2)return 2;
  if(s1!==null&&v>=s1)return 1;
  return 0
}"""
new_stage="""function hydroStage(p){
  const v=hydroNum(p?.value),s1=hydroNum(p?.s1),s2=hydroNum(p?.s2),s3=hydroNum(p?.s3);
  if(v===null)return -1;
  if(hydroStale(p))return -2;
  if(!hydroHasThresholds(p))return -3;
  if(s3!==null&&v>=s3)return 3;
  if(s2!==null&&v>=s2)return 2;
  if(s1!==null&&v>=s1)return 1;
  return 0
}"""
if old_stage not in s:
    raise SystemExit("hydroStage non trovato")
s=s.replace(old_stage,new_stage,1)

old_color="""  return ({'-2':'#7e8b94','-1':'#7e8b94','0':'#31a8d8','1':'#f1d54b','2':'#f28c35','3':'#dc3d3d'})[String(hydroStage(p))]||'#7e8b94'"""
new_color="""  return ({'-3':'#8aa0ad','-2':'#7e8b94','-1':'#7e8b94','0':'#31a8d8','1':'#f1d54b','2':'#f28c35','3':'#dc3d3d'})[String(hydroStage(p))]||'#7e8b94'"""
if old_color not in s:
    raise SystemExit("hydroColor non trovato")
s=s.replace(old_color,new_color,1)

old_label="""  if(st===-2)return 'DATO RITARDATO';
  if(st===-1)return 'DATO N/D';
  if(st===3)return 'SOGLIA 3 SUPERATA · S3';"""
new_label="""  if(st===-3)return 'SOGLIE NON DISPONIBILI';
  if(st===-2)return 'DATO RITARDATO';
  if(st===-1)return 'DATO N/D';
  if(st===3)return 'SOGLIA 3 SUPERATA · S3';"""
if old_label not in s:
    raise SystemExit("hydroStageLabel non trovato")
s=s.replace(old_label,new_label,1)

old_radius="""  return st>=3?10:st===2?9:st===1?8:7"""
new_radius="""  return st>=3?10:st===2?9:st===1?8:7"""
# same, no change needed

old_legend="""      '<span><i class="hydro-swatch normal"></i><b>Nessuna soglia superata</b><small>livello inferiore a S1</small></span>'+
      '<span><i class="hydro-swatch s1"></i><b>Superata soglia 1</b><small>livello tra S1 e S2</small></span>'+
      '<span><i class="hydro-swatch s2"></i><b>Superata soglia 2</b><small>livello tra S2 e S3</small></span>'+
      '<span><i class="hydro-swatch s3"></i><b>Superata soglia 3</b><small>livello uguale o superiore a S3</small></span>'+
      '<span><i class="hydro-swatch stale"></i><b>Dato ritardato</b><small>misura non sufficientemente aggiornata</small></span>'+"""
new_legend="""      '<span><i class="hydro-swatch normal"></i><b>Regime ordinario</b><small>livello sotto la prima soglia S1</small></span>'+
      '<span><i class="hydro-swatch s1"></i><b>Prima soglia superata</b><small>livello tra S1 e S2</small></span>'+
      '<span><i class="hydro-swatch s2"></i><b>Seconda soglia superata</b><small>livello tra S2 e S3</small></span>'+
      '<span><i class="hydro-swatch s3"></i><b>Terza soglia superata</b><small>livello uguale o superiore a S3</small></span>'+
      '<span><i class="hydro-swatch nosoglia"></i><b>Soglie non disponibili</b><small>livello misurato, ma S1–S2–S3 non definite nella sorgente</small></span>'+
      '<span><i class="hydro-swatch stale"></i><b>Dato ritardato</b><small>misura non sufficientemente aggiornata</small></span>'+"""
if old_legend not in s:
    raise SystemExit("hydro legend rows non trovato")
s=s.replace(old_legend,new_legend,1)

old_css=".hydro-swatch.normal{background:#31a8d8}.hydro-swatch.s1{background:#f1d54b}.hydro-swatch.s2{background:#f28c35}.hydro-swatch.s3{background:#dc3d3d}.hydro-swatch.stale{background:#7e8b94}"
new_css=".hydro-swatch.normal{background:#31a8d8}.hydro-swatch.s1{background:#f1d54b}.hydro-swatch.s2{background:#f28c35}.hydro-swatch.s3{background:#dc3d3d}.hydro-swatch.nosoglia{background:#8aa0ad}.hydro-swatch.stale{background:#7e8b94}"
if old_css not in s:
    raise SystemExit("hydro swatch CSS non trovato")
s=s.replace(old_css,new_css,1)

# Counter: count actual threshold exceedances only; -3 is excluded.
old_counter="""  const high=hydroFeatures.filter(f=>hydroStage(f.properties)>=1).length;
  el.textContent=hydroFeatures.length+' sezioni · '+(latest?hydroTimeLabel(latest):'—')+(high?' · '+high+' ≥ S1':'')"""
new_counter="""  const high=hydroFeatures.filter(f=>hydroStage(f.properties)>=1).length;
  const withThresholds=hydroFeatures.filter(f=>hydroHasThresholds(f.properties)).length;
  el.textContent=hydroFeatures.length+' sezioni · '+withThresholds+' con soglie · '+(latest?hydroTimeLabel(latest):'—')+(high?' · '+high+' ≥ S1':'')"""
if old_counter not in s:
    raise SystemExit("hydro counter non trovato")
s=s.replace(old_counter,new_counter,1)

for required in ("if(v===null||v===undefined||v==='')return null","hydroHasThresholds","SOGLIE NON DISPONIBILI","hydro-swatch nosoglia","con soglie"):
    if required not in s:
        raise SystemExit(f"manca {required}")

p.write_text(s,encoding="utf-8")
print("Corretto falso superamento soglie idrometriche da valori null")
