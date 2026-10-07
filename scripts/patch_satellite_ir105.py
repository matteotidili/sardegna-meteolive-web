#!/usr/bin/env python3
from pathlib import Path

p=Path("index.html")
s=p.read_text(encoding="utf-8")

# 1) UI Satellite: True Colour + IR10.5
old_ui='''        <button class="btn" id="satMetBtn">Satellite True Colour <span>OFF</span></button>
        <div class="layer-note" id="satMetInfo">MTG FCI True Colour RGB · alta risoluzione · EUMETSAT</div>
        <button class="btn" id="satHrfiBtn">FCI HRFI · 0,5 km <span>OFF</span></button>
        <div class="layer-note" id="satHrfiInfo">FCI VIS 0,6 µm · alta risoluzione · ultimo frame</div>'''
new_ui='''        <button class="btn" id="satMetBtn">Satellite True Colour <span>OFF</span></button>
        <div class="layer-note" id="satMetInfo">MTG FCI True Colour RGB · 1 km · EUMETSAT</div>
        <button class="btn" id="satIr105Btn">Satellite IR10.5 HRFI <span>OFF</span></button>
        <div class="layer-note" id="satIr105Info">FCI HRFI IR10.5 µm · 1 km · giorno/notte · EUMETSAT</div>'''
if old_ui not in s:
    raise SystemExit("UI satellite non trovata")
s=s.replace(old_ui,new_ui,1)

# 2) Blocco configurazione satellite
a=s.index("const SAT_WMS=")
b=s.index("const RADAR_API=",a)
new_top=r"""const SAT_WMS='https://view.eumetsat.int/geoserver/wms';
const SAT_PRODUCTS={
  truecolour:{
    layer:'mtg_fd:rgb_truecolour',
    label:'MTG True Colour RGB',
    attribution:'© EUMETSAT · MTG FCI True Colour RGB'
  },
  ir105:{
    layer:'mtg_fd:ir105_hrfi',
    label:'FCI HRFI IR10.5 µm',
    attribution:'© EUMETSAT · MTG FCI HRFI IR10.5 µm'
  }
};
let satProduct='truecolour';
let satMetLayer=null,satPendingLayer=null,satViewBounds=null,satActiveUrl='';
let satMetOn=false,satFrames=[],satIndex=18,satTimer=null,satLatestTime=null,satAnimationRunning=false;
let satPreloadPromise=null,satPreloadedImages=[],satViewGeneration=0,satSwapGeneration=0,satSliderTimer=null,satViewportTimer=null;

function activeSatProduct(){return SAT_PRODUCTS[satProduct]||SAT_PRODUCTS.truecolour}
function currentSatBounds(){return map.getBounds().pad(.08)}
function satRenderWidth(){
  const size=map.getSize(),dpr=Math.min(window.devicePixelRatio||1,1.6),mobile=MOBILE_MAP();
  const min=mobile?900:1200,max=mobile?1500:2200;
  return Math.max(min,Math.min(max,Math.round(size.x*dpr*1.15)))
}
function satImageUrl(time,width=0,bounds=satViewBounds||currentSatBounds()){
  const product=activeSatProduct();
  const sw=L.CRS.EPSG3857.project(bounds.getSouthWest()),ne=L.CRS.EPSG3857.project(bounds.getNorthEast());
  let w=width||satRenderWidth();
  let h=Math.max(64,Math.round(w*Math.abs(ne.y-sw.y)/Math.max(1,Math.abs(ne.x-sw.x))));
  const maxH=MOBILE_MAP()?2400:2200;
  if(h>maxH){w=Math.max(64,Math.round(w*maxH/h));h=maxH}
  const q=new URLSearchParams({
    service:'WMS',request:'GetMap',version:'1.1.1',
    layers:product.layer,styles:'',format:'image/png',
    transparent:'true',srs:'EPSG:3857',
    bbox:[sw.x,sw.y,ne.x,ne.y].join(','),
    width:String(w),height:String(h),time:new Date(time).toISOString()
  });
  return SAT_WMS+'?'+q.toString()
}
function satProbeUrl(time){
  const product=activeSatProduct();
  const q=new URLSearchParams({
    service:'WMS',request:'GetMap',version:'1.1.1',
    layers:product.layer,styles:'',format:'image/png',transparent:'true',
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
s=s[:a]+new_top+s[b:]

# 3) Motore satellite generico per entrambi i prodotti.
c=s.index("const satMetBtn=")
d=s.index("const stationsBtn=",c)
new_sat=r"""const satMetBtn=document.getElementById('satMetBtn'),satMetInfo=document.getElementById('satMetInfo');
const satIr105Btn=document.getElementById('satIr105Btn'),satIr105Info=document.getElementById('satIr105Info');
const satTimeline=document.getElementById('satTimeline'),satRange=document.getElementById('satRange'),satTime=document.getElementById('satTime'),satPlay=document.getElementById('satPlay');
function syncTimelineStack(){layoutTimelineStack();legend()}
function satLabel(d){return d.toLocaleString('it-IT',{timeZone:'Europe/Rome',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).replace(',',' ·')}
function satInfoEl(){return satProduct==='ir105'?satIr105Info:satMetInfo}
function satProductLabel(){return activeSatProduct().label}
function updateSatProductUi(){
  const tc=satMetOn&&satProduct==='truecolour',ir=satMetOn&&satProduct==='ir105';
  satMetBtn.classList.toggle('active',tc);satMetBtn.lastElementChild.textContent=tc?'ON':'OFF';
  satIr105Btn.classList.toggle('active',ir);satIr105Btn.lastElementChild.textContent=ir?'ON':'OFF';
  satMetInfo.classList.toggle('on',tc);
  satIr105Info.classList.toggle('on',ir)
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
  if(!satMetOn)return;
  const info=satInfoEl(),product=activeSatProduct();
  if(url===satActiveUrl&&satMetLayer&&map.hasLayer(satMetLayer)){
    info.innerHTML=satProductLabel()+' · '+satLabel(d)+' · alta risoluzione<br>© EUMETSAT';
    return
  }
  cancelSatPending();
  const generation=++satSwapGeneration;
  const next=L.imageOverlay(url,bounds,{
    pane:'satmet',opacity:0,interactive:false,attribution:product.attribution
  });
  satPendingLayer=next;
  let settled=false;
  const finish=()=>{
    if(settled)return;settled=true;
    if(generation!==satSwapGeneration||!satMetOn||satPendingLayer!==next){
      if(map.hasLayer(next))map.removeLayer(next);
      return
    }
    const old=satMetLayer;
    satMetLayer=next;satPendingLayer=null;satActiveUrl=url;
    const el=next.getElement();
    if(el)el.style.transition='opacity 90ms linear';
    next.setOpacity(.96);
    if(old&&old!==next&&map.hasLayer(old))setTimeout(()=>{if(map.hasLayer(old))map.removeLayer(old)},95);
    info.innerHTML=satProductLabel()+' · '+satLabel(d)+' · alta risoluzione<br>© EUMETSAT'
  };
  next.once('load',finish);
  next.addTo(map);
  setTimeout(()=>{
    if(settled||generation!==satSwapGeneration)return;
    settled=true;
    if(map.hasLayer(next))map.removeLayer(next);
    if(satPendingLayer===next)satPendingLayer=null;
    info.innerHTML=satProductLabel()+' · '+satLabel(d)+' · caricamento lento<br>© EUMETSAT'
  },15000)
}
function showSatFrame(i){
  if(!satFrames.length||!satMetOn)return;
  satIndex=Math.max(0,Math.min(satFrames.length-1,Number(i)));satRange.value=String(satIndex);
  const d=satFrames[satIndex],info=satInfoEl();
  satTime.textContent=satLabel(d);
  if(!satViewBounds)satViewBounds=currentSatBounds();
  const cached=satPreloadedImages[satIndex];
  const url=cached?.ready?cached.url:satImageUrl(d,0,satViewBounds);
  info.innerHTML=satProductLabel()+' · '+satLabel(d)+' · caricamento…<br>© EUMETSAT';
  swapSatImage(url,satViewBounds,d)
}
async function loadSatImageEntry(i,generation,bounds){
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
}
async function preloadSatFrames(force=false){
  if(!satFrames.length||!satMetOn)return;
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
        satInfoEl().innerHTML=satProductLabel()+' · precaricamento '+done+'/'+total+' · alta risoluzione<br>© EUMETSAT'
      }
    }
  };
  satPreloadPromise=Promise.all(Array.from({length:MOBILE_MAP()?2:3},()=>worker()))
    .finally(()=>{if(generation===satViewGeneration)satPreloadPromise=null});
  return satPreloadPromise
}
function stopSatAnimation(){
  satAnimationRunning=false;
  if(satTimer){clearTimeout(satTimer);satTimer=null}
  satPlay.textContent='▶';satPlay.classList.remove('active');satPlay.title='Riproduci'
}
async function startSatAnimation(){
  if(!satFrames.length||satAnimationRunning)return;
  stopSatAnimation();
  satAnimationRunning=true;
  satPlay.textContent='…';satPlay.classList.add('active');satPlay.title='Preparazione animazione';

  const generation=satViewGeneration,bounds=satViewBounds||currentSatBounds();
  satViewBounds=bounds;
  const first=satIndex>=satFrames.length-1?0:satIndex+1;
  const warm=[first,(first+1)%satFrames.length,(first+2)%satFrames.length];
  await Promise.all(warm.map(i=>loadSatImageEntry(i,generation,bounds)));

  if(!satAnimationRunning||!satMetOn||generation!==satViewGeneration){
    stopSatAnimation();return
  }

  preloadSatFrames();
  satPlay.textContent='Ⅱ';satPlay.title='Pausa';

  const advance=async()=>{
    if(!satAnimationRunning||!satMetOn){stopSatAnimation();return}
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
}
async function loadSatTimeline(forceLatest=true){
  satInfoEl().innerHTML=satProductLabel()+' · ricerca ultimo frame EUMETSAT…<br>© EUMETSAT';
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
  }catch(e){
    satInfoEl().innerHTML=satProductLabel()+' · aggiornamento non disponibile<br>© EUMETSAT'
  }
}
function refreshSatViewport(){
  if(!satMetOn||!satFrames.length)return;
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
    updateSatProductUi();
    loadSatTimeline(true)
  }else{
    stopSatAnimation();
    if(satSliderTimer){clearTimeout(satSliderTimer);satSliderTimer=null}
    if(satViewportTimer){clearTimeout(satViewportTimer);satViewportTimer=null}
    cancelSatPending();
    if(satMetLayer&&map.hasLayer(satMetLayer))map.removeLayer(satMetLayer);
    satMetLayer=null;satActiveUrl='';
    satTimeline.classList.remove('on');
    updateSatProductUi()
  }
  syncTimelineStack();
  syncBoundaries();
  syncAccordionStates()
}
async function activateSatProduct(name){
  if(!SAT_PRODUCTS[name])return;
  if(satMetOn&&satProduct===name){setSatMet(false);return}
  stopSatAnimation();
  satProduct=name;satLatestTime=null;
  cancelSatPending();
  if(satMetLayer&&map.hasLayer(satMetLayer))map.removeLayer(satMetLayer);
  satMetLayer=null;satActiveUrl='';
  satViewBounds=currentSatBounds();
  clearSatFrameCache();
  satMetOn=true;
  satTimeline.classList.add('on');
  updateSatProductUi();
  syncTimelineStack();syncBoundaries();syncAccordionStates();
  await loadSatTimeline(true)
}
satMetBtn.onclick=()=>activateSatProduct('truecolour');
satIr105Btn.onclick=()=>activateSatProduct('ir105');
document.getElementById('satPrev').onclick=()=>{stopSatAnimation();showSatFrame(satIndex-1)};
document.getElementById('satNext').onclick=()=>{stopSatAnimation();showSatFrame(satIndex+1)};
satPlay.onclick=()=>satAnimationRunning?stopSatAnimation():startSatAnimation();
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
setInterval(()=>{if(satMetOn&&!satAnimationRunning&&satIndex===satFrames.length-1)loadSatTimeline(false)},5*60*1000);
"""
s=s[:c]+new_sat+s[d:]

# 4) stato accordion: basta satMetOn.
s=s.replace(
  "setAccState('accSatelliteState',(satMetOn||satHrfiOn)?'ON':'OFF',satMetOn||satHrfiOn);",
  "setAccState('accSatelliteState',satMetOn?'ON':'OFF',satMetOn);"
)

# Verifiche.
for forbidden in ("satHrfiBtn","satHrfiInfo","satHrfiLayer","mtg_fd:vis06_hrfi"):
    if forbidden in s:
        raise SystemExit(f"Residuo VIS0.6: {forbidden}")
for required in ("mtg_fd:ir105_hrfi","satIr105Btn","SAT_PRODUCTS","activateSatProduct('ir105')"):
    if required not in s:
        raise SystemExit(f"Integrazione IR10.5 incompleta: {required}")

p.write_text(s,encoding="utf-8")
print("IR10.5 HRFI integrato nel motore satellite")
