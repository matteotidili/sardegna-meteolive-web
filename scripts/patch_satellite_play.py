#!/usr/bin/env python3
from pathlib import Path

p=Path("index.html")
s=p.read_text(encoding="utf-8")

old_state="""let satMetOn=false,satHrfiOn=false,satFrames=[],satIndex=18,satTimer=null,satLatestTime=null;
let satPreloadPromise=null,satPreloadedImages=[],satViewGeneration=0,satSwapGeneration=0,satSliderTimer=null,satViewportTimer=null;"""
new_state="""let satMetOn=false,satHrfiOn=false,satFrames=[],satIndex=18,satTimer=null,satLatestTime=null,satAnimationRunning=false;
let satPreloadPromise=null,satPreloadedImages=[],satViewGeneration=0,satSwapGeneration=0,satSliderTimer=null,satViewportTimer=null;"""
if old_state not in s: raise SystemExit("state anchor missing")
s=s.replace(old_state,new_state,1)

old_load="""async function loadSatImageEntry(i,generation,bounds){
  const d=satFrames[i],url=satImageUrl(d,0,bounds),img=new Image();
  img.crossOrigin='anonymous';
  const ok=await new Promise(resolve=>{
    img.onload=()=>resolve(true);img.onerror=()=>resolve(false);img.src=url
  });
  if(ok){try{await img.decode()}catch(e){}}
  if(generation!==satViewGeneration)return null;
  const entry={url,img,ready:ok};
  satPreloadedImages[i]=entry;
  return entry
}"""
new_load="""async function loadSatImageEntry(i,generation,bounds){
  const existing=satPreloadedImages[i];
  if(existing?.ready)return existing;
  if(existing?.promise)return existing.promise;
  const d=satFrames[i],url=satImageUrl(d,0,bounds),img=new Image();
  img.crossOrigin='anonymous';
  const entry={url,img,ready:false,promise:null};
  entry.promise=new Promise(resolve=>{
    img.onload=async()=>{
      try{await img.decode()}catch(e){}
      if(generation===satViewGeneration)entry.ready=true;
      entry.promise=null;resolve(entry)
    };
    img.onerror=()=>{entry.promise=null;resolve(entry)};
    img.src=url
  });
  satPreloadedImages[i]=entry;
  return entry.promise
}"""
if old_load not in s: raise SystemExit("loadSatImageEntry anchor missing")
s=s.replace(old_load,new_load,1)

old_stop="""function stopSatAnimation(){
  if(satTimer){clearTimeout(satTimer);satTimer=null}
  satPlay.textContent='▶';satPlay.classList.remove('active');satPlay.title='Riproduci'
}"""
new_stop="""function stopSatAnimation(){
  satAnimationRunning=false;
  if(satTimer){clearTimeout(satTimer);satTimer=null}
  satPlay.textContent='▶';satPlay.classList.remove('active');satPlay.title='Riproduci'
}"""
if old_stop not in s: raise SystemExit("stop anchor missing")
s=s.replace(old_stop,new_stop,1)

old_start="""async function startSatAnimation(){
  if(!satFrames.length||satHrfiOn)return;
  stopSatAnimation();
  satPlay.textContent='…';satPlay.classList.add('active');satPlay.title='Precaricamento animazione';
  await preloadSatFrames();
  if(!satMetOn||satHrfiOn)return stopSatAnimation();
  satPlay.textContent='Ⅱ';satPlay.title='Pausa';
  if(satIndex>=satFrames.length-1)satIndex=-1;
  const advance=()=>{
    if(!satMetOn||satHrfiOn){stopSatAnimation();return}
    const next=satIndex>=satFrames.length-1?0:satIndex+1;
    showSatFrame(next);
    satTimer=setTimeout(advance,620)
  };
  advance()
}"""
new_start="""async function startSatAnimation(){
  if(!satFrames.length||satHrfiOn||satAnimationRunning)return;
  stopSatAnimation();
  satAnimationRunning=true;
  satPlay.textContent='…';satPlay.classList.add('active');satPlay.title='Preparazione animazione';

  const generation=satViewGeneration,bounds=satViewBounds||currentSatBounds();
  satViewBounds=bounds;
  const first=satIndex>=satFrames.length-1?0:satIndex+1;
  const warm=[first,(first+1)%satFrames.length,(first+2)%satFrames.length];
  await Promise.all(warm.map(i=>loadSatImageEntry(i,generation,bounds)));

  if(!satAnimationRunning||!satMetOn||satHrfiOn||generation!==satViewGeneration){
    stopSatAnimation();return
  }

  preloadSatFrames();
  satPlay.textContent='Ⅱ';satPlay.title='Pausa';

  const advance=async()=>{
    if(!satAnimationRunning||!satMetOn||satHrfiOn){stopSatAnimation();return}
    const next=satIndex>=satFrames.length-1?0:satIndex+1;
    const entry=await loadSatImageEntry(next,generation,bounds);
    if(!satAnimationRunning||generation!==satViewGeneration){stopSatAnimation();return}
    if(entry?.ready){
      showSatFrame(next);
      satTimer=setTimeout(advance,560)
    }else{
      satTimer=setTimeout(advance,220)
    }
  };
  advance()
}"""
if old_start not in s: raise SystemExit("start anchor missing")
s=s.replace(old_start,new_start,1)

old_click="satPlay.onclick=()=>satTimer?stopSatAnimation():startSatAnimation();"
new_click="satPlay.onclick=()=>satAnimationRunning?stopSatAnimation():startSatAnimation();"
if old_click not in s: raise SystemExit("play click anchor missing")
s=s.replace(old_click,new_click,1)

# Quando si muove la mappa, stopSatAnimation gestisce lo stato.
if "satAnimationRunning=true" not in s: raise SystemExit("animation state not inserted")
if "warm.map(i=>loadSatImageEntry" not in s: raise SystemExit("warm buffer missing")

p.write_text(s,encoding="utf-8")
print("Patch play satellite progressivo applicata")
