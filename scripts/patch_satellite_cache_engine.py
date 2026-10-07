#!/usr/bin/env python3
from pathlib import Path

p=Path("index.html")
s=p.read_text(encoding="utf-8")

top_start=s.index("const SAT_WMS=")
top_end=s.index("const RADAR_API=",top_start)
low_start=s.index("const satMetBtn=")
low_end=s.index("const stationsBtn=",low_start)

new_top=r"""const SAT_WMS='https://view.eumetsat.int/geoserver/wms';
const SAT_PRODUCTS={
  truecolour:{
    layer:'mtg_fd:rgb_truecolour',
    label:'MTG True Colour RGB',
    attribution:'© EUMETSAT · MTG FCI True Colour RGB',
    format:'image/jpeg'
  },
  ir105:{
    layer:'mtg_fd:ir105_hrfi',
    label:'FCI HRFI IR10.5 µm',
    attribution:'© EUMETSAT · MTG FCI HRFI IR10.5 µm',
    format:'image/jpeg'
  },
  cloudphase:{
    layer:'mtg_fd:rgb_cloudphase',
    label:'MTG Cloud Phase RGB',
    attribution:'© EUMETSAT · MTG FCI Cloud Phase RGB',
    format:'image/jpeg'
  },
  snowfog:{
    layer:'mtg_fd:rgb_snow',
    label:'MTG Day Snow Fog RGB',
    attribution:'© EUMETSAT · MTG Day Snow Fog RGB',
    format:'image/jpeg'
  },
  preciprate:{
    layer:'mtg_fd:h40b',
    label:'MTG Precipitation Rate H40B',
    attribution:'© EUMETSAT / H SAF · H40B Precipitation Rate',
    format:'image/png'
  }
};
const SAT_DOMAIN_BOUNDS=L.latLngBounds([[31.5,-6],[49,20]]);
const SAT_PREVIEW_WIDTH_DESKTOP=1400;
const SAT_PREVIEW_WIDTH_MOBILE=900;
const SAT_HIGH_WIDTH_DESKTOP=2600;
const SAT_HIGH_WIDTH_MOBILE=1800;

let satProduct='truecolour';
let satMetLayer=null,satPendingLayer=null,satActiveUrl='';
let satMetOn=false,satFrames=[],satIndex=18,satTimer=null,satLatestTime=null,satAnimationRunning=false;
let satPreviewCache=[],satHighCache=[],satPreviewPreloadPromise=null;
let satCacheGeneration=0,satSwapGeneration=0,satDisplayToken=0,satSliderTimer=null,satHighTimer=null;
const satLatestByProduct={};

function activeSatProduct(){return SAT_PRODUCTS[satProduct]||SAT_PRODUCTS.truecolour}
function satPreviewWidth(){return MOBILE_MAP()?SAT_PREVIEW_WIDTH_MOBILE:SAT_PREVIEW_WIDTH_DESKTOP}
function satHighWidth(){return MOBILE_MAP()?SAT_HIGH_WIDTH_MOBILE:SAT_HIGH_WIDTH_DESKTOP}
function satImageUrl(time,quality='preview'){
  const product=activeSatProduct(),bounds=SAT_DOMAIN_BOUNDS;
  const sw=L.CRS.EPSG3857.project(bounds.getSouthWest()),ne=L.CRS.EPSG3857.project(bounds.getNorthEast());
  let w=quality==='high'?satHighWidth():satPreviewWidth();
  let h=Math.max(64,Math.round(w*Math.abs(ne.y-sw.y)/Math.max(1,Math.abs(ne.x-sw.x))));
  const format=product.format||'image/jpeg';
  const q=new URLSearchParams({
    service:'WMS',request:'GetMap',version:'1.1.1',
    layers:product.layer,styles:'',format,
    transparent:format==='image/png'?'true':'false',
    srs:'EPSG:3857',
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
    srs:'EPSG:4326',bbox:'7.2,38.2,10.8,41.8',width:'48',height:'48',
    time:new Date(time).toISOString()
  });
  return SAT_WMS+'?'+q.toString()
}
async function satFrameAvailable(d){
  try{
    const r=await fetch(satProbeUrl(d),{cache:'force-cache'});
    if(!r.ok)return false;
    const ct=(r.headers.get('content-type')||'').toLowerCase();
    if(!ct.includes('image'))return false;
    const blob=await r.blob();
    return blob.size>500
  }catch(e){return false}
}
async function findLatestSatTime(force=false){
  const cached=satLatestByProduct[satProduct];
  if(!force&&cached&&Date.now()-cached.checked<180000)return new Date(cached.time);
  const step=10*60000,start=Math.floor(Date.now()/step)*step;
  const candidates=Array.from({length:8},(_,i)=>new Date(start-i*step));
  const checks=await Promise.all(candidates.map(d=>satFrameAvailable(d)));
  const i=checks.findIndex(Boolean);
  const latest=i>=0?candidates[i]:new Date(Math.floor((Date.now()-30*60000)/step)*step);
  satLatestByProduct[satProduct]={time:latest.getTime(),checked:Date.now()};
  return latest
}
"""

new_sat=r"""const satMetBtn=document.getElementById('satMetBtn'),satMetInfo=document.getElementById('satMetInfo');
const satIr105Btn=document.getElementById('satIr105Btn'),satIr105Info=document.getElementById('satIr105Info');
const satCloudPhaseBtn=document.getElementById('satCloudPhaseBtn'),satCloudPhaseInfo=document.getElementById('satCloudPhaseInfo');
const satSnowFogBtn=document.getElementById('satSnowFogBtn'),satSnowFogInfo=document.getElementById('satSnowFogInfo');
const satPrecipRateBtn=document.getElementById('satPrecipRateBtn'),satPrecipRateInfo=document.getElementById('satPrecipRateInfo');
const satTimeline=document.getElementById('satTimeline'),satRange=document.getElementById('satRange'),satTime=document.getElementById('satTime'),satPlay=document.getElementById('satPlay');

function syncTimelineStack(){layoutTimelineStack();legend()}
function satLabel(d){return d.toLocaleString('it-IT',{timeZone:'Europe/Rome',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).replace(',',' ·')}
function satInfoEl(){
  if(satProduct==='ir105')return satIr105Info;
  if(satProduct==='cloudphase')return satCloudPhaseInfo;
  if(satProduct==='snowfog')return satSnowFogInfo;
  if(satProduct==='preciprate')return satPrecipRateInfo;
  return satMetInfo
}
function satProductLabel(){return activeSatProduct().label}
function updateSatProductUi(){
  const tc=satMetOn&&satProduct==='truecolour',
        ir=satMetOn&&satProduct==='ir105',
        cp=satMetOn&&satProduct==='cloudphase',
        sf=satMetOn&&satProduct==='snowfog',
        pr=satMetOn&&satProduct==='preciprate';
  satMetBtn.classList.toggle('active',tc);satMetBtn.lastElementChild.textContent=tc?'ON':'OFF';
  satIr105Btn.classList.toggle('active',ir);satIr105Btn.lastElementChild.textContent=ir?'ON':'OFF';
  satCloudPhaseBtn.classList.toggle('active',cp);satCloudPhaseBtn.lastElementChild.textContent=cp?'ON':'OFF';
  satSnowFogBtn.classList.toggle('active',sf);satSnowFogBtn.lastElementChild.textContent=sf?'ON':'OFF';
  satPrecipRateBtn.classList.toggle('active',pr);satPrecipRateBtn.lastElementChild.textContent=pr?'ON':'OFF';
  satMetInfo.classList.toggle('on',tc);
  satIr105Info.classList.toggle('on',ir);
  satCloudPhaseInfo.classList.toggle('on',cp);
  satSnowFogInfo.classList.toggle('on',sf);
  satPrecipRateInfo.classList.toggle('on',pr)
}
function buildSatFrames(latest){
  const end=new Date(latest),frames=[];
  for(let i=18;i>=0;i--)frames.push(new Date(end.getTime()-i*10*60000));
  satFrames=frames;
  satRange.max=String(frames.length-1);
  satIndex=frames.length-1;
  satRange.value=String(satIndex);
  satLatestTime=end
}
function clearSatCaches(){
  satCacheGeneration++;
  satPreviewCache=[];
  satHighCache=[];
  satPreviewPreloadPromise=null;
  if(satHighTimer){clearTimeout(satHighTimer);satHighTimer=null}
}
function cancelSatPending(){
  satSwapGeneration++;
  if(satPendingLayer&&map.hasLayer(satPendingLayer))map.removeLayer(satPendingLayer);
  satPendingLayer=null
}
async function loadSatCacheEntry(i,quality='preview'){
  const cache=quality==='high'?satHighCache:satPreviewCache;
  const existing=cache[i];
  if(existing?.ready)return existing;
  if(existing?.promise)return existing.promise;
  if(!satFrames[i])return null;

  const generation=satCacheGeneration;
  const url=satImageUrl(satFrames[i],quality);
  const img=new Image();
  img.crossOrigin='anonymous';
  const entry={url,img,ready:false,promise:null,quality};
  entry.promise=new Promise(resolve=>{
    img.onload=async()=>{
      try{await img.decode()}catch(e){}
      if(generation===satCacheGeneration)entry.ready=true;
      entry.promise=null;
      resolve(entry)
    };
    img.onerror=()=>{entry.promise=null;resolve(entry)};
    img.src=url
  });
  cache[i]=entry;
  return entry.promise
}
function swapSatImage(entry,d,index){
  if(!satMetOn||!entry?.ready||index!==satIndex)return;
  const info=satInfoEl(),product=activeSatProduct(),url=entry.url;
  if(url===satActiveUrl&&satMetLayer&&map.hasLayer(satMetLayer))return;

  cancelSatPending();
  const generation=++satSwapGeneration;
  const next=L.imageOverlay(url,SAT_DOMAIN_BOUNDS,{
    pane:'satmet',opacity:0,interactive:false,attribution:product.attribution
  });
  satPendingLayer=next;
  let settled=false;
  const finish=()=>{
    if(settled)return;settled=true;
    if(generation!==satSwapGeneration||!satMetOn||satPendingLayer!==next||index!==satIndex){
      if(map.hasLayer(next))map.removeLayer(next);
      return
    }
    const old=satMetLayer;
    satMetLayer=next;satPendingLayer=null;satActiveUrl=url;
    const el=next.getElement();
    if(el)el.style.transition='opacity 70ms linear';
    next.setOpacity(.96);
    if(old&&old!==next&&map.hasLayer(old))setTimeout(()=>{if(map.hasLayer(old))map.removeLayer(old)},80);
    info.innerHTML=satProductLabel()+' · '+satLabel(d)+' · '+(entry.quality==='high'?'alta risoluzione':'animazione pronta')+'<br>© EUMETSAT'
  };
  next.once('load',finish);
  next.addTo(map);
  setTimeout(()=>{
    if(!settled&&generation===satSwapGeneration){
      finish()
    }
  },1200)
}
async function showSatFrame(i,{high=false}={}){
  if(!satFrames.length||!satMetOn)return false;
  const idx=Math.max(0,Math.min(satFrames.length-1,Number(i)));
  satIndex=idx;satRange.value=String(idx);
  const d=satFrames[idx],info=satInfoEl(),token=++satDisplayToken;
  satTime.textContent=satLabel(d);

  const quality=high?'high':'preview';
  let entry=(quality==='high'?satHighCache:satPreviewCache)[idx];
  if(!entry?.ready){
    info.innerHTML=satProductLabel()+' · '+satLabel(d)+' · caricamento '+(high?'HD':'frame')+'…<br>© EUMETSAT';
    entry=await loadSatCacheEntry(idx,quality)
  }
  if(token!==satDisplayToken||idx!==satIndex||!satMetOn)return false;
  if(entry?.ready){
    swapSatImage(entry,d,idx);
    return true
  }
  return false
}
function previewOrder(center){
  const out=[];
  for(let n=1;n<satFrames.length;n++){
    const back=center-n;
    if(back>=0)out.push(back)
  }
  for(let i=center+1;i<satFrames.length;i++)out.push(i);
  return out
}
async function preloadSatPreviewFrames(){
  if(!satFrames.length||!satMetOn)return;
  if(satPreviewPreloadPromise)return satPreviewPreloadPromise;
  const generation=satCacheGeneration,queue=previewOrder(satIndex).filter(i=>!satPreviewCache[i]?.ready);
  let done=satPreviewCache.filter(e=>e?.ready).length,total=satFrames.length;
  const worker=async()=>{
    while(queue.length&&generation===satCacheGeneration&&satMetOn){
      const i=queue.shift();
      await loadSatCacheEntry(i,'preview');
      done++;
      if(!satAnimationRunning&&generation===satCacheGeneration){
        satInfoEl().innerHTML=satProductLabel()+' · cache animazione '+Math.min(done,total)+'/'+total+'<br>© EUMETSAT'
      }
    }
  };
  satPreviewPreloadPromise=Promise.all(Array.from({length:MOBILE_MAP()?4:6},()=>worker()))
    .finally(()=>{if(generation===satCacheGeneration)satPreviewPreloadPromise=null});
  return satPreviewPreloadPromise
}
function scheduleSatHigh(index=satIndex,delay=320){
  if(satAnimationRunning||!satMetOn)return;
  if(satHighTimer)clearTimeout(satHighTimer);
  satHighTimer=setTimeout(async()=>{
    satHighTimer=null;
    const idx=index;
    if(idx!==satIndex||satAnimationRunning||!satMetOn)return;
    await showSatFrame(idx,{high:true})
  },delay)
}
function stopSatAnimation(){
  satAnimationRunning=false;
  if(satTimer){clearTimeout(satTimer);satTimer=null}
  satPlay.textContent='▶';satPlay.classList.remove('active');satPlay.title='Riproduci';
  if(satMetOn&&satFrames.length)scheduleSatHigh(satIndex,160)
}
async function startSatAnimation(){
  if(!satFrames.length||satAnimationRunning)return;
  if(satHighTimer){clearTimeout(satHighTimer);satHighTimer=null}
  satAnimationRunning=true;
  satPlay.textContent='…';satPlay.classList.add('active');satPlay.title='Preparazione animazione';

  const first=satIndex>=satFrames.length-1?0:satIndex+1;
  const warm=[first,(first+1)%satFrames.length,(first+2)%satFrames.length,(first+3)%satFrames.length];
  await Promise.all(warm.map(i=>loadSatCacheEntry(i,'preview')));
  if(!satAnimationRunning||!satMetOn)return stopSatAnimation();

  preloadSatPreviewFrames();
  satPlay.textContent='Ⅱ';satPlay.title='Pausa';

  const advance=async()=>{
    if(!satAnimationRunning||!satMetOn){stopSatAnimation();return}
    const next=satIndex>=satFrames.length-1?0:satIndex+1;
    const entry=await loadSatCacheEntry(next,'preview');
    if(!satAnimationRunning||!satMetOn)return;
    if(entry?.ready){
      satIndex=next;satRange.value=String(next);satTime.textContent=satLabel(satFrames[next]);
      ++satDisplayToken;
      swapSatImage(entry,satFrames[next],next);
      satTimer=setTimeout(advance,500)
    }else{
      satTimer=setTimeout(advance,150)
    }
  };
  advance()
}
async function loadSatTimeline(forceLatest=true){
  satInfoEl().innerHTML=satProductLabel()+' · ricerca ultimo frame EUMETSAT…<br>© EUMETSAT';
  try{
    const oldLatest=satLatestTime?.getTime()||0;
    const latest=await findLatestSatTime(false);
    const changed=!oldLatest||latest.getTime()!==oldLatest;
    if(changed){
      stopSatAnimation();
      buildSatFrames(latest);
      clearSatCaches();
    }
    if(forceLatest||changed){
      await showSatFrame(satFrames.length-1,{high:false});
      preloadSatPreviewFrames();
      scheduleSatHigh(satFrames.length-1,250)
    }
  }catch(e){
    satInfoEl().innerHTML=satProductLabel()+' · aggiornamento non disponibile<br>© EUMETSAT'
  }
}
function setSatMet(on){
  satMetOn=on;
  if(on){
    satTimeline.classList.add('on');
    updateSatProductUi();
    loadSatTimeline(true)
  }else{
    stopSatAnimation();
    if(satSliderTimer){clearTimeout(satSliderTimer);satSliderTimer=null}
    if(satHighTimer){clearTimeout(satHighTimer);satHighTimer=null}
    cancelSatPending();
    if(satMetLayer&&map.hasLayer(satMetLayer))map.removeLayer(satMetLayer);
    satMetLayer=null;satActiveUrl='';
    clearSatCaches();
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
  satProduct=name;
  satLatestTime=null;
  cancelSatPending();
  if(satMetLayer&&map.hasLayer(satMetLayer))map.removeLayer(satMetLayer);
  satMetLayer=null;satActiveUrl='';
  clearSatCaches();
  satMetOn=true;
  satTimeline.classList.add('on');
  updateSatProductUi();
  syncTimelineStack();syncBoundaries();syncAccordionStates();
  await loadSatTimeline(true)
}

satMetBtn.onclick=()=>activateSatProduct('truecolour');
satIr105Btn.onclick=()=>activateSatProduct('ir105');
satCloudPhaseBtn.onclick=()=>activateSatProduct('cloudphase');
satSnowFogBtn.onclick=()=>activateSatProduct('snowfog');
satPrecipRateBtn.onclick=()=>activateSatProduct('preciprate');

document.getElementById('satPrev').onclick=async()=>{
  stopSatAnimation();
  await showSatFrame(satIndex-1,{high:false});
  scheduleSatHigh(satIndex,220)
};
document.getElementById('satNext').onclick=async()=>{
  stopSatAnimation();
  await showSatFrame(satIndex+1,{high:false});
  scheduleSatHigh(satIndex,220)
};
satPlay.onclick=()=>satAnimationRunning?stopSatAnimation():startSatAnimation();

satRange.oninput=()=>{
  stopSatAnimation();
  const idx=Math.max(0,Math.min(satFrames.length-1,Number(satRange.value)));
  satIndex=idx;
  satTime.textContent=satFrames[idx]?satLabel(satFrames[idx]):'—';
  ++satDisplayToken;
  if(satHighTimer){clearTimeout(satHighTimer);satHighTimer=null}

  const ready=satPreviewCache[idx];
  if(ready?.ready){
    swapSatImage(ready,satFrames[idx],idx)
  }else{
    if(satSliderTimer)clearTimeout(satSliderTimer);
    satSliderTimer=setTimeout(async()=>{
      satSliderTimer=null;
      if(idx!==satIndex)return;
      const entry=await loadSatCacheEntry(idx,'preview');
      if(idx===satIndex&&entry?.ready)swapSatImage(entry,satFrames[idx],idx)
    },45)
  }
  scheduleSatHigh(idx,360)
};
satRange.onchange=async()=>{
  if(satSliderTimer){clearTimeout(satSliderTimer);satSliderTimer=null}
  const idx=Number(satRange.value);
  if(!satPreviewCache[idx]?.ready)await showSatFrame(idx,{high:false});
  scheduleSatHigh(idx,180)
};

setInterval(async()=>{
  if(!satMetOn||satAnimationRunning||satIndex!==satFrames.length-1)return;
  const latest=await findLatestSatTime(true);
  if(!satLatestTime||latest.getTime()!==satLatestTime.getTime())loadSatTimeline(true)
},5*60*1000);
"""

s=s[:top_start]+new_top+s[top_end:low_start]+new_sat+s[low_end:]

# Sanity checks: old viewport-bound engine must be gone.
for forbidden in ("currentSatBounds","satViewBounds","preloadSatNeighbors","refreshSatViewport"):
    if forbidden in s[top_start:low_end]:
        raise SystemExit(f"Residuo vecchio motore: {forbidden}")
for required in ("SAT_DOMAIN_BOUNDS","satPreviewCache","satHighCache","preloadSatPreviewFrames","scheduleSatHigh","SAT_PREVIEW_WIDTH_DESKTOP=1400"):
    if required not in s:
        raise SystemExit(f"Nuovo motore incompleto: {required}")

p.write_text(s,encoding="utf-8")
print("Motore satellite cache preview/HD applicato")
