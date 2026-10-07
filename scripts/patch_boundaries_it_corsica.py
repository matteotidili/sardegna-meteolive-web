#!/usr/bin/env python3
from pathlib import Path

p=Path("index.html")
s=p.read_text(encoding="utf-8")

old="""async function loadBoundaries(){
  if(boundariesLoaded||boundariesLoading)return;
  boundariesLoading=true;
  try{
    const r=await fetch('https://raw.githubusercontent.com/guglielmo/geojson-italy/main/geojson/limits_IT_provinces.geojson',{cache:'force-cache'});
    if(!r.ok)throw new Error('confini '+r.status);
    const g=await r.json();
    const features=(g.features||[]).filter(f=>{
      const p=f.properties||{};
      return Number(p.reg_istat_code_num)===20||String(p.reg_istat_code||'').replace(/^0+/,'')==='20'||String(p.reg_name||'').toLowerCase()==='sardegna'
    });
    if(!features.length)throw new Error('Sardegna non trovata');
    const sardinia={type:'FeatureCollection',features};
    L.geoJSON(sardinia,{pane:'satbounds',interactive:false,style:boundaryStyleHalo}).addTo(boundariesLayer);
    L.geoJSON(sardinia,{pane:'satbounds',interactive:false,style:boundaryStyleLine}).addTo(boundariesLayer);
    boundariesLoaded=true
  }catch(e){
    try{
      const r=await fetch('data/sardegna.geojson',{cache:'force-cache'});
      const g=await r.json();
      L.geoJSON(g,{pane:'satbounds',interactive:false,style:boundaryStyleHalo}).addTo(boundariesLayer);
      L.geoJSON(g,{pane:'satbounds',interactive:false,style:boundaryStyleLine}).addTo(boundariesLayer);
      boundariesLoaded=true
    }catch(_){}
  }finally{
    boundariesLoading=false;
    syncBoundaries()
  }
}"""

new="""async function loadBoundaries(){
  if(boundariesLoaded||boundariesLoading)return;
  boundariesLoading=true;
  boundariesLayer.clearLayers();
  const addBoundaryGeoJson=g=>{
    L.geoJSON(g,{pane:'satbounds',interactive:false,style:boundaryStyleHalo}).addTo(boundariesLayer);
    L.geoJSON(g,{pane:'satbounds',interactive:false,style:boundaryStyleLine}).addTo(boundariesLayer)
  };
  try{
    const [itRes,frRes]=await Promise.all([
      fetch('https://raw.githubusercontent.com/guglielmo/geojson-italy/main/geojson/limits_IT_regions.geojson',{cache:'force-cache'}),
      fetch('https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/regions-version-simplifiee.geojson',{cache:'force-cache'})
    ]);
    if(!itRes.ok)throw new Error('confini Italia '+itRes.status);
    const italy=await itRes.json();
    addBoundaryGeoJson(italy);

    if(frRes.ok){
      const france=await frRes.json();
      const corsicaFeatures=(france.features||[]).filter(f=>{
        const p=f.properties||{};
        return Object.values(p).some(v=>String(v??'').toLowerCase().includes('corse'))
      });
      if(corsicaFeatures.length){
        addBoundaryGeoJson({type:'FeatureCollection',features:corsicaFeatures})
      }
    }
    boundariesLoaded=true
  }catch(e){
    console.warn('Confini Italia/Corsica',e);
    try{
      const r=await fetch('data/sardegna.geojson',{cache:'force-cache'});
      if(!r.ok)throw new Error('fallback confini '+r.status);
      addBoundaryGeoJson(await r.json());
      boundariesLoaded=true
    }catch(_){}
  }finally{
    boundariesLoading=false;
    syncBoundaries()
  }
}"""

if old not in s:
    raise SystemExit("blocco loadBoundaries non trovato")
s=s.replace(old,new,1)

# Linee leggermente più leggibili sull'infrarosso senza diventare invasive.
s=s.replace(
"function boundaryStyleHalo(){return {pane:'satbounds',color:'#06111c',weight:3.4,opacity:.72,fill:false,interactive:false}}",
"function boundaryStyleHalo(){return {pane:'satbounds',color:'#06111c',weight:3.6,opacity:.74,fill:false,interactive:false}}",
1)
s=s.replace(
"function boundaryStyleLine(){return {pane:'satbounds',color:'#f4f8fb',weight:1.25,opacity:.9,fill:false,interactive:false}}",
"function boundaryStyleLine(){return {pane:'satbounds',color:'#f7fbff',weight:1.3,opacity:.94,fill:false,interactive:false}}",
1)

if "limits_IT_regions.geojson" not in s or "regions-version-simplifiee.geojson" not in s:
    raise SystemExit("nuove sorgenti confini mancanti")
if "limits_IT_provinces.geojson" in s[s.index("const boundariesBtn="):s.index("const FRP_DATA=")]:
    raise SystemExit("vecchia sorgente provinciale ancora attiva")

p.write_text(s,encoding="utf-8")
print("Confini Italia e Corsica integrati")
