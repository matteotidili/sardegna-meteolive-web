#!/usr/bin/env python3
# trigger-run
from pathlib import Path

p = Path("index.html")
s = p.read_text(encoding="utf-8")

top_start = s.index("const SAT_WMS=")
top_end = s.index("const RADAR_API=", top_start)
low_start = s.index("const satMetBtn=")
low_end = s.index("const stationsBtn=", low_start)

new_top = r"""const SAT_WMS='https://view.eumetsat.int/geoserver/wms';
const SAT_LAYER='mtg_fd:rgb_truecolour';
let satMetLayer=null,satPendingLayer=null,satHrfiLayer=null,satViewBounds=null,satActiveUrl='';
let satMetOn=false,satHrfiOn=false,satFrames=[],satIndex=18,satTimer=null,satLatestTime=null;
let satPreloadPromise=null,satPreloadedImages=[],satViewGeneration=0,satSwapGeneration=0,satSliderTimer=null,satViewportTimer=null;

function currentSatBounds(){return map.getBounds().pad(.08)}
function satRenderWidth(){
  const size=map.getSize(),dpr=Math.min(window.devicePixelRatio||1,1.6),mobile=MOBILE_MAP();
  const min=mobile?900:1200,max=mobile?1500:2200;
  return Math.max(min,Math.min(max,Math.round(size.x*dpr*1.15)))
}
function satImageUrl(time,width=0,bounds=satViewBounds||currentSatBounds()){
  const sw=L.CRS.EPSG3857.project(bounds.getSouthWest()),ne=L.CRS.EPSG3857.project(bounds.getNorthEast());
  let w=width||satRenderWidth();
  let h=Math.max(64,Math.round(w*Math.abs(ne.y-sw.y)/Math.max(1,Math.abs(ne.x-sw.x))));
  const maxH=MOBILE_MAP()?2400:2200;
  if(h>maxH){w=Math.max(64,Math.round(w*maxH/h));h=maxH}
  const q=new URLSearchParams({
    service:'WMS',request:'GetMap',version:'1.1.1',
    layers:SAT_LAYER,styles:'',format:'image/png',
    transparent:'true',srs:'EPSG:3857',
    bbox:[sw.x,sw.y,ne.x,ne.y].join(','),
    width:String(w),height:String(h),time:new Date(time).toISOString()
  });
  return SAT_WMS+'?'+q.toString()
}
function satProbeUrl(time){
  const q=new URLSearchParams({
    service:'WMS',request:'GetMap',version:'1.1.1',
    layers:SAT_LAYER,styles:'',format:'image/png',transparent:'true',
    srs:'EPSG:4326',bbox:'7.2,38.2,10.8,41.8',width:'64',height:'64',
    time:new Date(time).toISOString()
  });
  return SAT_WMS+'?'+q.toString()
}
async function satFrameAvailable(d){
  try{
    const r=await fetch(satProbeUrl(d)+'&_probe='+Date.now(),{cache:'no-store'});
    if(!r.ok)return false;
    const ct=(r.headers.get('content-type')||'').toLowerCase();
    if(!ct.includes('image'))return false;
    const blob=await r.blob();
    return blob.size>1000
  }catch(e){return false}
}
async function findLatestSatTime(){
  const step=10*60000,start=Math.floor(Date.now()/step)*step;
  const candidates=Array.from({length:10},(_,i)=>new Date(start-i*step));
  const checks=await Promise.all(candidates.map(d=>satFrameAvailable(d)));
  const i=checks.findIndex(Boolean);
  if(i>=0)return candidates[i];
  return new Date(Math.floor((Date.now()-40*60000)/step)*step)
}
"""

new_lower = r"""const satMetBtn=document.getElementById('satMetBtn'),satMetInfo=document.getElementById('satMetInfo');
const satHrfiBtn=document.getElementById('satHrfiBtn'),satHrfiInfo=document.getElementById('satHrfiInfo');
const satTimeline=document.getElementById('satTimeline'),satRange=document.getElementById('satRange'),satTime=document.getElementById('satTime'),satPlay=document.getElementById('satPlay');
function syncTimelineStack(){layoutTimelineStack();legend()}
function satLabel(d){return d.toLocaleString('it-IT',{timeZone:'Europe/Rome',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).replace(',',' ·')}

function updateSatHrfiFrame(time){
  if(!satHrfiOn)return;
  const fallback=new Date(Math.floor(Date.now()/(10*60000))*10*60000);
  const d=time?new Date(time):fallback;
  if(!satHrfiLayer){
    satHrfiLayer=L.tileLayer.wms(SAT_WMS,{
      pane:'satmet',layers:'mtg_fd:vis06_hrfi',styles:'',format:'image/png',transparent:true,
      version:'1.1.1',time:d.toISOString(),opacity:.9,maxZoom:18,tileSize:256,detectRetina:true,
      updateWhenZooming:false,updateWhenIdle:true,keepBuffer:3,
      attribution:'© EUMETSAT · FCI HRFI VIS 0,6 µm · 500 m'
    })
  }else{
    satHrfiLayer.setParams({time:d.toISOString()},false);satHrfiLayer.redraw();satHrfiLayer.setOpacity(.9)
  }
  if(!map.hasLayer(satHrfiLayer))satHrfiLayer.addTo(map);
  satHrfiInfo.innerHTML='FCI HRFI VIS 0,6 µm · 500 m · '+satLabel(d)+'<br>© EUMETSAT'
}
function removeSatHrfiLayer(){
  if(satHrfiLayer&&map.hasLayer(satHrfiLayer))map.removeLayer(satHrfiLayer);
  satHrfiInfo.innerHTML='FCI VIS 0,6 µm · alta risoluzione · ultimo frame'
}
function buildSatFrames(latest){
  const end=new Date(latest),frames=[];
  for(let i=18;i>=0;i--)frames.push(new Date(end.getTime()-i*10*60000));
  satFrames=frames;satRange.max=String(frames.length-1);satIndex=frames.length-1;satRange.value=String(satIndex);satLatestTime=end
}
function clearSatFrameCache(){
  satViewGeneration++;
  satPreloadedImages=[];
  satPreloadPromise=null
}
function cancelSatPending(){
  satSwapGeneration++;
  if(satPendingLayer&&map.hasLayer(satPendingLayer))map.removeLayer(satPendingLayer);
  satPendingLayer=null
}
function swapSatImage(url,bounds,d){
  if(!satMetOn||satHrfiOn)return;
  if(url===satActiveUrl&&satMetLayer&&map.hasLayer(satMetLayer)){
    satMetInfo.innerHTML='MTG True Colour RGB · '+satLabel(d)+' · alta risoluzione<br>© EUMETSAT';
    return
  }
  cancelSatPending();
  const generation=++satSwapGeneration;
  const next=L.imageOverlay(url,bounds,{
    pane:'satmet',opacity:0,interactive:false,attribution:'© EUMETSAT · MTG FCI True Colour RGB'
  });
  satPendingLayer=next;
  let settled=false;
  const finish=()=>{
    if(settled)return;settled=true;
    if(generation!==satSwapGeneration||!satMetOn||satHrfiOn||satPendingLayer!==next){
      if(map.hasLayer(next))map.removeLayer(next);
      return
    }
    const old=satMetLayer;
    satMetLayer=next;satPendingLayer=null;satActiveUrl=url;
    const el=next.getElement();
    if(el)el.style.transition='opacity 90ms linear';
    next.setOpacity(.96);
    if(old&&old!==next&&map.hasLayer(old))setTimeout(()=>{if(map.hasLayer(old))map.removeLayer(old)},95);
    satMetInfo.innerHTML='MTG True Colour RGB · '+satLabel(d)+' · alta risoluzione<br>© EUMETSAT'
  };
  next.once('load',finish);
  next.addTo(map);
  setTimeout(()=>{
    if(settled)return;
    if(generation!==satSwapGeneration)return;
    settled=true;
    if(map.hasLayer(next))map.removeLayer(next);
    if(satPendingLayer===next)satPendingLayer=null;
    satMetInfo.innerHTML='MTG True Colour RGB · '+satLabel(d)+' · caricamento lento<br>© EUMETSAT'
  },15000)
}
function showSatFrame(i){
  if(!satFrames.length||!satMetOn)return;
  satIndex=Math.max(0,Math.min(satFrames.length-1,Number(i)));satRange.value=String(satIndex);
  const d=satFrames[satIndex];
  satTime.textContent=satLabel(d);
  if(satHrfiOn){updateSatHrfiFrame(d);return}
  if(!satViewBounds)satViewBounds=currentSatBounds();
  const cached=satPreloadedImages[satIndex];
  const url=cached?.ready?cached.url:satImageUrl(d,0,satViewBounds);
  satMetInfo.innerHTML='MTG True Colour RGB · '+satLabel(d)+' · caricamento…<br>© EUMETSAT';
  swapSatImage(url,satViewBounds,d)
}
async function loadSatImageEntry(i,generation,bounds){
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
}
async function preloadSatFrames(force=false){
  if(!satFrames.length||!satMetOn||satHrfiOn)return;
  if(satPreloadPromise&&!force)return satPreloadPromise;
  const generation=satViewGeneration,bounds=satViewBounds||currentSatBounds();
  satViewBounds=bounds;
  const queue=satFrames.map((d,i)=>i).filter(i=>!satPreloadedImages[i]?.ready);
  let done=satFrames.length-queue.length;
  const total=satFrames.length;
  const worker=async()=>{
    while(queue.length&&generation===satViewGeneration){
      const i=queue.shift();
      await loadSatImageEntry(i,generation,bounds);
      done++;
      if(!satTimer&&satMetOn&&generation===satViewGeneration){
        satMetInfo.innerHTML='MTG True Colour RGB · precaricamento '+done+'/'+total+' · alta risoluzione<br>© EUMETSAT'
      }
    }
  };
  satPreloadPromise=Promise.all(Array.from({length:MOBILE_MAP()?2:3},()=>worker()))
    .finally(()=>{if(generation===satViewGeneration)satPreloadPromise=null});
  return satPreloadPromise
}
function stopSatAnimation(){
  if(satTimer){clearTimeout(satTimer);satTimer=null}
  satPlay.textContent='▶';satPlay.classList.remove('active');satPlay.title='Riproduci'
}
async function startSatAnimation(){
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
}
async function loadSatTimeline(forceLatest=true){
  satMetInfo.innerHTML='MTG True Colour RGB · ricerca ultimo frame EUMETSAT…<br>© EUMETSAT';
  try{
    const wasLatest=!satFrames.length||satIndex===satFrames.length-1;
    const newLatest=await findLatestSatTime();
    if(!satLatestTime||newLatest.getTime()!==satLatestTime.getTime()){
      stopSatAnimation();
      buildSatFrames(newLatest);
      satViewBounds=currentSatBounds();
      clearSatFrameCache();
      if(forceLatest||wasLatest)showSatFrame(satFrames.length-1);
      preloadSatFrames()
    }else if(forceLatest&&satFrames.length){
      showSatFrame(satFrames.length-1);
      preloadSatFrames()
    }
    if(satHrfiOn)updateSatHrfiFrame(newLatest)
  }catch(e){
    satMetInfo.innerHTML='MTG True Colour RGB · aggiornamento non disponibile<br>© EUMETSAT'
  }
}
function refreshSatViewport(){
  if(!satMetOn||satHrfiOn||!satFrames.length)return;
  stopSatAnimation();
  if(satViewportTimer)clearTimeout(satViewportTimer);
  satViewportTimer=setTimeout(()=>{
    satViewportTimer=null;
    satViewBounds=currentSatBounds();
    clearSatFrameCache();
    satActiveUrl='';
    showSatFrame(satIndex);
    preloadSatFrames()
  },160)
}
map.on('moveend zoomend',refreshSatViewport);
window.addEventListener('resize',()=>{if(satMetOn)refreshSatViewport()});

function setSatMet(on){
  satMetOn=on;
  if(on){
    satViewBounds=currentSatBounds();
    clearSatFrameCache();
    satTimeline.classList.add('on');
    loadSatTimeline(true)
  }else{
    stopSatAnimation();
    if(satSliderTimer){clearTimeout(satSliderTimer);satSliderTimer=null}
    if(satViewportTimer){clearTimeout(satViewportTimer);satViewportTimer=null}
    cancelSatPending();
    if(satMetLayer&&map.hasLayer(satMetLayer))map.removeLayer(satMetLayer);
    satMetLayer=null;satActiveUrl='';
    satHrfiOn=false;removeSatHrfiLayer();satHrfiBtn.classList.remove('active');satHrfiBtn.lastElementChild.textContent='OFF';satHrfiInfo.classList.remove('on');
    satTimeline.classList.remove('on')
  }
  syncTimelineStack();
  syncBoundaries();
  satMetBtn.classList.toggle('active',on);
  satMetBtn.lastElementChild.textContent=on?'ON':'OFF';
  satMetInfo.classList.toggle('on',on);
  syncAccordionStates()
}
satMetBtn.onclick=()=>setSatMet(!satMetOn);
satHrfiBtn.onclick=()=>{
  satHrfiOn=!satHrfiOn;
  stopSatAnimation();
  if(satHrfiOn){
    if(!satMetOn)setSatMet(true);
    cancelSatPending();
    if(satMetLayer&&map.hasLayer(satMetLayer))map.removeLayer(satMetLayer);
    satMetLayer=null;satActiveUrl='';
    updateSatHrfiFrame(satFrames[satIndex]||satLatestTime)
  }else{
    removeSatHrfiLayer();
    if(satMetOn&&satFrames.length){
      satViewBounds=currentSatBounds();
      clearSatFrameCache();
      showSatFrame(satIndex);
      preloadSatFrames()
    }
  }
  satHrfiBtn.classList.toggle('active',satHrfiOn);
  satHrfiBtn.lastElementChild.textContent=satHrfiOn?'ON':'OFF';
  satHrfiInfo.classList.toggle('on',satHrfiOn);
  syncAccordionStates()
};
document.getElementById('satPrev').onclick=()=>{stopSatAnimation();showSatFrame(satIndex-1)};
document.getElementById('satNext').onclick=()=>{stopSatAnimation();showSatFrame(satIndex+1)};
satPlay.onclick=()=>satTimer?stopSatAnimation():startSatAnimation();
satRange.oninput=()=>{
  stopSatAnimation();
  const idx=Math.max(0,Math.min(satFrames.length-1,Number(satRange.value)));
  satIndex=idx;
  if(satFrames[idx])satTime.textContent=satLabel(satFrames[idx]);
  if(satSliderTimer)clearTimeout(satSliderTimer);
  satSliderTimer=setTimeout(()=>{satSliderTimer=null;showSatFrame(idx)},90)
};
satRange.onchange=()=>{
  if(satSliderTimer){clearTimeout(satSliderTimer);satSliderTimer=null}
  showSatFrame(Number(satRange.value))
};
setInterval(()=>{if(satMetOn&&!satTimer&&satIndex===satFrames.length-1)loadSatTimeline(false)},5*60*1000);
"""

s = s[:top_start] + new_top + s[top_end:low_start] + new_lower + s[low_end:]

s = s.replace(
    '<div class="layer-note" id="satMetInfo">MTG FCI True Colour RGB · 1 km · EUMETSAT</div>',
    '<div class="layer-note" id="satMetInfo">MTG FCI True Colour RGB · alta risoluzione · EUMETSAT</div>'
)

for forbidden in ("satHdLayer", "function scheduleSatHd", "function upgradeSatFrame"):
    if forbidden in s:
        raise SystemExit(f"Residuo vecchio motore satellite: {forbidden}")
for required in ("function swapSatImage", "precaricamento ", "setTimeout(advance,620)", "L.imageOverlay"):
    if required not in s:
        raise SystemExit(f"Nuovo motore incompleto: {required}")

p.write_text(s, encoding="utf-8")
print("Motore satellite full-frame applicato")
