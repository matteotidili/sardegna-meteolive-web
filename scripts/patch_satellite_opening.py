#!/usr/bin/env python3
from pathlib import Path

p=Path("index.html")
s=p.read_text(encoding="utf-8")

# Aggiunge un preriscaldamento leggero dei soli frame vicini.
anchor="""async function preloadSatFrames(force=false){
  if(!satFrames.length||!satMetOn)return;"""
insert="""async function preloadSatNeighbors(center=satIndex){
  if(!satFrames.length||!satMetOn)return;
  const generation=satViewGeneration,bounds=satViewBounds||currentSatBounds();
  satViewBounds=bounds;
  const offsets=MOBILE_MAP()?[-1]:[-1,-2,1];
  const targets=[...new Set(offsets.map(o=>center+o).filter(i=>i>=0&&i<satFrames.length))];
  for(const i of targets){
    if(!satPreloadedImages[i]?.ready&&!satPreloadedImages[i]?.promise){
      loadSatImageEntry(i,generation,bounds)
    }
  }
}
async function preloadSatFrames(force=false){
  if(!satFrames.length||!satMetOn)return;"""
if anchor not in s:
    raise SystemExit("preloadSatFrames anchor missing")
s=s.replace(anchor,insert,1)

old_timeline="""    if(!satLatestTime||newLatest.getTime()!==satLatestTime.getTime()){
      stopSatAnimation();
      buildSatFrames(newLatest);
      satViewBounds=currentSatBounds();
      clearSatFrameCache();
      if(forceLatest||wasLatest)showSatFrame(satFrames.length-1);
      preloadSatFrames()
    }else if(forceLatest&&satFrames.length){
      showSatFrame(satFrames.length-1);
      preloadSatFrames()
    }"""
new_timeline="""    if(!satLatestTime||newLatest.getTime()!==satLatestTime.getTime()){
      stopSatAnimation();
      buildSatFrames(newLatest);
      satViewBounds=currentSatBounds();
      clearSatFrameCache();
      if(forceLatest||wasLatest){
        showSatFrame(satFrames.length-1);
        setTimeout(()=>preloadSatNeighbors(satFrames.length-1),450)
      }
    }else if(forceLatest&&satFrames.length){
      showSatFrame(satFrames.length-1);
      setTimeout(()=>preloadSatNeighbors(satFrames.length-1),450)
    }"""
if old_timeline not in s:
    raise SystemExit("loadSatTimeline block missing")
s=s.replace(old_timeline,new_timeline,1)

old_refresh="""    satActiveUrl='';
    showSatFrame(satIndex);
    preloadSatFrames()
  },160)"""
new_refresh="""    satActiveUrl='';
    showSatFrame(satIndex);
    setTimeout(()=>preloadSatNeighbors(satIndex),450)
  },160)"""
if old_refresh not in s:
    raise SystemExit("refresh block missing")
s=s.replace(old_refresh,new_refresh,1)

# Quando l'utente sceglie manualmente un frame, prepara i vicini dopo il rendering.
old_slider="""  satSliderTimer=setTimeout(()=>{satSliderTimer=null;showSatFrame(idx)},90)
};"""
new_slider="""  satSliderTimer=setTimeout(()=>{
    satSliderTimer=null;
    showSatFrame(idx);
    setTimeout(()=>preloadSatNeighbors(idx),320)
  },90)
};"""
if old_slider not in s:
    raise SystemExit("slider block missing")
s=s.replace(old_slider,new_slider,1)

old_change="""  showSatFrame(Number(satRange.value))
};"""
new_change="""  const idx=Number(satRange.value);
  showSatFrame(idx);
  setTimeout(()=>preloadSatNeighbors(idx),320)
};"""
if old_change not in s:
    raise SystemExit("slider change block missing")
s=s.replace(old_change,new_change,1)

# Il Play continua invece a poter precaricare tutta la sequenza in background.
if "preloadSatFrames();" not in s:
    raise SystemExit("background preload for play missing")
if "function preloadSatNeighbors" not in s:
    raise SystemExit("neighbor preload missing")

p.write_text(s,encoding="utf-8")
print("Priorità caricamento satellite ottimizzata")
