#!/usr/bin/env python3
from pathlib import Path
p=Path("index.html")
s=p.read_text(encoding="utf-8")

old=r"""function hydroHasThresholds(p){
  return hydroNum(p?.s1)!==null||hydroNum(p?.s2)!==null||hydroNum(p?.s3)!==null
}
function hydroStale(p){
  const t=hydroNum(p?.time);
  return !t||Date.now()-t>2*60*60*1000
}
function hydroStage(p){
  const v=hydroNum(p?.value),s1=hydroNum(p?.s1),s2=hydroNum(p?.s2),s3=hydroNum(p?.s3);
  if(v===null)return -1;
  if(hydroStale(p))return -2;
  if(!hydroHasThresholds(p))return -3;
  if(s3!==null&&v>=s3)return 3;
  if(s2!==null&&v>=s2)return 2;
  if(s1!==null&&v>=s1)return 1;
  return 0
}"""
new=r"""function hydroValidThresholds(p){
  const s1=hydroNum(p?.s1),s2=hydroNum(p?.s2),s3=hydroNum(p?.s3);
  // Tutte e tre le soglie sono necessarie per una classificazione cromatica affidabile.
  // Valori nulli, non positivi, convenzionali o soglie non ordinate non sono validi.
  if(s1===null||s2===null||s3===null||s1<=0||s2<=s1||s3<=s2)return null;
  return {s1,s2,s3}
}
function hydroHasThresholds(p){return !!hydroValidThresholds(p)}
function hydroTimestamp(p){
  const value=p?.time;
  if(value===null||value===undefined||value==='')return null;
  let t=Number(value);
  if(!Number.isFinite(t))t=Date.parse(String(value));
  if(!Number.isFinite(t))return null;
  if(t<1e11)t*=1000; // gestisce eventuali timestamp Unix in secondi
  return t
}
function hydroStale(p){
  const t=hydroTimestamp(p),now=Date.now();
  return t===null||t>now+10*60*1000||now-t>2*60*60*1000
}
function hydroStage(p){
  const v=hydroNum(p?.value);
  if(v===null)return -1;
  if(hydroStale(p))return -2;
  const thresholds=hydroValidThresholds(p);
  if(!thresholds)return -3;
  // Superamento stretto: l'uguaglianza con una soglia non attiva il livello successivo.
  if(v>thresholds.s3)return 3;
  if(v>thresholds.s2)return 2;
  if(v>thresholds.s1)return 1;
  return 0
}"""
if s.count(old)!=1:raise SystemExit("blocco classificazione idrometrica non trovato")
s=s.replace(old,new,1)

old=r"""function hydroTimeLabel(ms){
  const d=new Date(Number(ms));
  if(!Number.isFinite(d.getTime()))return '—';"""
new=r"""function hydroTimeLabel(ms){
  const d=new Date(hydroTimestamp({time:ms})??NaN);
  if(!Number.isFinite(d.getTime()))return '—';"""
if s.count(old)!=1:raise SystemExit("hydroTimeLabel non trovato")
s=s.replace(old,new,1)

old=r"""  const thresholds=[['S1',hydroNum(p.s1),'#c8aa18'],['S2',hydroNum(p.s2),'#d76c18'],['S3',hydroNum(p.s3),'#c42c2c']].filter(x=>x[1]!==null);"""
new=r"""  const valid=hydroValidThresholds(p);
  const thresholds=valid?[['S1',valid.s1,'#c8aa18'],['S2',valid.s2,'#d76c18'],['S3',valid.s3,'#c42c2c']]:[];"""
if s.count(old)!=1:raise SystemExit("soglie idrogramma non trovate")
s=s.replace(old,new,1)

old=r"""    '<div class="hydro-popup-thresholds">'+hydroThreshold(p.s1,'S1')+hydroThreshold(p.s2,'S2')+hydroThreshold(p.s3,'S3')+'</div>'+"""
new=r"""    '<div class="hydro-popup-thresholds">'+(hydroHasThresholds(p)?hydroThreshold(p.s1,'S1')+hydroThreshold(p.s2,'S2')+hydroThreshold(p.s3,'S3'):'<div class="hydro-threshold">SOGLIE NON VALIDATE</div>')+'</div>'+"""
if s.count(old)!=1:raise SystemExit("soglie popup non trovate")
s=s.replace(old,new,1)

old=r"""    '<div class="hydro-popup-note">Fonte ARPAS · rete fiduciaria di Protezione Civile. Campionamento 15 min; pubblicazione mediamente con circa 30 min di latenza.</div>'+"""
new=r"""    '<div class="hydro-popup-note">Fonte ARPAS · rete fiduciaria di Protezione Civile. Livello riferito allo zero idrometrico della sezione. Campionamento 15 min; pubblicazione con latenza variabile. I superamenti vanno verificati sul CFD ufficiale.</div>'+"""
if s.count(old)!=1:raise SystemExit("nota popup non trovata")
s=s.replace(old,new,1)

old=r"""    '<div class="map-legend-note"><b>S1, S2 e S3</b> sono soglie specifiche della singola sezione idrometrica e non corrispondono ai livelli di allerta territoriale. Tocca/clicca un idrometro per livello, trend, soglie e idrogramma.</div></div>'"""
new=r"""    '<div class="map-legend-note"><b>S1, S2 e S3</b> sono soglie della singola sezione e non allerta territoriale. Rosso solo con misura recente e superamento effettivo di S3; soglie mancanti o incoerenti non generano allarmi. Verificare sempre le criticità sul CFD ufficiale.</div></div>'"""
if s.count(old)!=1:raise SystemExit("nota legenda non trovata")
s=s.replace(old,new,1)

old=r"""  const times=hydroFeatures.map(f=>hydroNum(f.properties?.time)).filter(v=>v!==null);
  const latest=times.length?Math.max(...times):null;
  const high=hydroFeatures.filter(f=>hydroStage(f.properties)>=1).length;
  const withThresholds=hydroFeatures.filter(f=>hydroHasThresholds(f.properties)).length;
  el.textContent=hydroFeatures.length+' sezioni · '+withThresholds+' con soglie · '+(latest?hydroTimeLabel(latest):'—')+(high?' · '+high+' ≥ S1':'')"""
new=r"""  const times=hydroFeatures.map(f=>hydroTimestamp(f.properties)).filter(v=>v!==null);
  const latest=times.length?Math.max(...times):null;
  const high=hydroFeatures.filter(f=>hydroStage(f.properties)>=1).length;
  const red=hydroFeatures.filter(f=>hydroStage(f.properties)===3).length;
  const withThresholds=hydroFeatures.filter(f=>hydroHasThresholds(f.properties)).length;
  el.textContent=hydroFeatures.length+' sezioni · '+withThresholds+' con soglie verificate · ultimo '+(latest?hydroTimeLabel(latest):'—')+
    ' · '+high+' sopra S1 · '+red+' sopra S3'"""
if s.count(old)!=1:raise SystemExit("counter idrometri non trovato")
s=s.replace(old,new,1)

for required in (
  "function hydroValidThresholds(p)",
  "if(v>thresholds.s3)return 3",
  "function hydroTimestamp(p)",
  "sopra S1 · ",
  "SOGLIE NON VALIDATE",
):
  if required not in s:raise SystemExit("post-check missing "+required)

p.write_text(s,encoding="utf-8")
print("Validazione soglie ARPAS rigorosa e contatori verificabili inseriti")
