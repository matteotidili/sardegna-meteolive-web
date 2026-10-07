#!/usr/bin/env python3
from pathlib import Path
import re

p=Path("index.html")
s=p.read_text(encoding="utf-8")

def sub(pattern,repl,label,flags=re.S):
    global s
    s2,n=re.subn(pattern,repl,s,count=1,flags=flags)
    if n!=1:
        raise SystemExit(f"{label}: match {n}")
    s=s2

sub(
 r"function showSatFrame\(i,quality='preview'\)\{.*?\n\}\nfunction scheduleSatHd",
 """function showSatFrame(i){
  if(!satFrames.length)return;
  satIndex=Math.max(0,Math.min(satFrames.length-1,i));satRange.value=String(satIndex);
  const d=satFrames[satIndex];
  satTime.textContent=satLabel(d);
  if(satHrfiOn){updateSatHrfiFrame(d);return}
  upgradeSatFrame(satIndex)
}
function scheduleSatHd""",
 "showSatFrame"
)

s=s.replace("if(!satFrames.length||!satMetOn||satTimer)return;","if(!satFrames.length||!satMetOn)return;",1)

old="""      maxZoom:18,
      tileSize:256,
      detectRetina:true,
      updateWhenZooming:false,
      updateWhenIdle:true,
      keepBuffer:3,"""
new="""      maxZoom:18,
      tileSize:512,
      detectRetina:true,
      updateWhenZooming:false,
      updateWhenIdle:false,
      keepBuffer:4,"""
if old not in s: raise SystemExit("tile settings: anchor missing")
s=s.replace(old,new,1)

sub(
 r"async function startSatAnimation\(\)\{.*?\n\}\nasync function loadSatTimeline",
 """async function startSatAnimation(){
  if(!satFrames.length)return;
  if(satIndex>=satFrames.length-1)showSatFrame(0);
  satTimer=setInterval(()=>showSatFrame(satIndex>=satFrames.length-1?0:satIndex+1),1200);
  satPlay.textContent='Ⅱ';satPlay.classList.add('active');satPlay.title='Pausa'
}
async function loadSatTimeline""",
 "startSatAnimation"
)

s=s.replace(
 "if(forceLatest||wasLatest){showSatFrame(satFrames.length-1,'preview');upgradeSatFrame(satFrames.length-1)}",
 "if(forceLatest||wasLatest)showSatFrame(satFrames.length-1)",
 1
)
s=s.replace("      preloadSatFrames()\n","",1)
s=s.replace(
 "showSatFrame(satFrames.length-1,'preview');upgradeSatFrame(satFrames.length-1);",
 "showSatFrame(satFrames.length-1);",
 1
)

sub(
 r"function refreshSatViewport\(\)\{.*?window\.addEventListener\('resize',\(\)=>\{if\(satMetOn\)setTimeout\(refreshSatViewport,120\)\}\);",
 """function refreshSatViewport(){
  // Il WMS tiled richiede automaticamente le tile alla risoluzione della viewport.
}""",
 "refreshSatViewport"
)

old_on="""    satViewGeneration++;
    satViewBounds=currentSatBounds();
    satPreloadedImages=[];
    satPreloadPromise=null;
    satTimeline.classList.add('on');loadSatTimeline(true)"""
if old_on not in s: raise SystemExit("setSatMet: anchor missing")
s=s.replace(old_on,"    satTimeline.classList.add('on');loadSatTimeline(true)",1)

sub(
 r"document\.getElementById\('satPrev'\)\.onclick=.*?satRange\.onchange=.*?;",
 """document.getElementById('satPrev').onclick=()=>{stopSatAnimation();showSatFrame(satIndex-1)};
document.getElementById('satNext').onclick=()=>{stopSatAnimation();showSatFrame(satIndex+1)};
satPlay.onclick=()=>satTimer?stopSatAnimation():startSatAnimation();
satRange.oninput=()=>{stopSatAnimation();showSatFrame(Number(satRange.value))};
satRange.onchange=()=>showSatFrame(Number(satRange.value));""",
 "sat controls",
 flags=re.S
)

s=s.replace(" · caricamento alta risoluzione…<br>© EUMETSAT"," · caricamento WMS nativo…<br>© EUMETSAT")
s=s.replace(" · alta risoluzione<br>© EUMETSAT"," · WMS nativo<br>© EUMETSAT")

# Verifiche
assert "const d=satFrames[satIndex],width=640;" not in s
assert "showSatFrame(Number(satRange.value),'preview')" not in s
assert "tileSize:512" in s

p.write_text(s,encoding="utf-8")
print("Patch satellite HD applicata")
