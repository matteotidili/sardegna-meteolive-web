#!/usr/bin/env python3
from pathlib import Path

p=Path("index.html")
s=p.read_text(encoding="utf-8")

anchor="function fc(features=[]){return {type:'FeatureCollection',features}}\nfunction ensure3dDataLayers(){"
if anchor not in s:
    raise SystemExit("anchor 3D non trovato")

helpers=r"""function fc(features=[]){return {type:'FeatureCollection',features}}

const DPC3D_Z=6;
const DPC3D_BBOX={west:4,south:34,east:21,north:49};
const dpc3dMosaicCache=new Map();
let dpc3dRequestSeq=0,dpc3dSyncTimer=null;

function tileXFromLon(lon,z){return Math.floor((lon+180)/360*(2**z))}
function tileYFromLat(lat,z){
  const r=lat*Math.PI/180,n=2**z;
  return Math.floor((1-Math.asinh(Math.tan(r))/Math.PI)/2*n)
}
function lonFromTileX(x,z){return x/(2**z)*360-180}
function latFromTileY(y,z){
  const n=Math.PI-2*Math.PI*y/(2**z);
  return 180/Math.PI*Math.atan(Math.sinh(n))
}
function dpc3dGrid(){
  const z=DPC3D_Z;
  const x0=tileXFromLon(DPC3D_BBOX.west,z),x1=tileXFromLon(DPC3D_BBOX.east,z);
  const y0=tileYFromLat(DPC3D_BBOX.north,z),y1=tileYFromLat(DPC3D_BBOX.south,z);
  const west=lonFromTileX(x0,z),east=lonFromTileX(x1+1,z);
  const north=latFromTileY(y0,z),south=latFromTileY(y1+1,z);
  return {
    z,x0,x1,y0,y1,
    cols:x1-x0+1,rows:y1-y0+1,
    coordinates:[[west,north],[east,north],[east,south],[west,south]]
  }
}
const DPC3D_GRID=dpc3dGrid();

function loadRasterImage(url){
  return new Promise(resolve=>{
    const img=new Image();
    img.crossOrigin='anonymous';
    img.onload=()=>resolve(img);
    img.onerror=()=>resolve(null);
    img.src=url
  })
}
async function colorizeDpcTile3d(productKey,time,z,x,y){
  const p=DPC_PRODUCTS[productKey];
  if(!p)return null;
  const img=await loadRasterImage(dpcTileUrl(productKey,time,z,x,y));
  if(!img)return null;
  const canvas=document.createElement('canvas');
  canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  try{
    ctx.drawImage(img,0,0,256,256);
    const data=ctx.getImageData(0,0,256,256),px=data.data;
    for(let i=0;i<px.length;i+=4){
      if(px[i+3]<2){px[i+3]=0;continue}
      const value=p.min+(px[i]/255)*(p.max-p.min),col=dpcColor(productKey,value);
      px[i]=col[0];px[i+1]=col[1];px[i+2]=col[2];px[i+3]=Math.min(px[i+3],col[3])
    }
    ctx.putImageData(data,0,0);
    return canvas
  }catch(e){
    return null
  }
}
async function buildDpc3dMosaic(productKey,time){
  if(!productKey||!time)return null;
  const stamp=new Date(time).getTime();
  const key=productKey+'|'+stamp;
  if(dpc3dMosaicCache.has(key))return dpc3dMosaicCache.get(key);

  const promise=(async()=>{
    const g=DPC3D_GRID;
    const canvas=document.createElement('canvas');
    canvas.width=g.cols*256;canvas.height=g.rows*256;
    const ctx=canvas.getContext('2d');
    ctx.imageSmoothingEnabled=false;

    const jobs=[];
    for(let y=g.y0;y<=g.y1;y++){
      for(let x=g.x0;x<=g.x1;x++){
        jobs.push((async()=>{
          const tile=await colorizeDpcTile3d(productKey,time,g.z,x,y);
          if(tile)ctx.drawImage(tile,(x-g.x0)*256,(y-g.y0)*256)
        })())
      }
    }
    await Promise.all(jobs);
    return canvas
  })();

  dpc3dMosaicCache.set(key,promise);
  while(dpc3dMosaicCache.size>7){
    const first=dpc3dMosaicCache.keys().next().value;
    dpc3dMosaicCache.delete(first)
  }
  return promise
}
function first3dSymbolLayer(){
  const layers=map3d?.getStyle()?.layers||[];
  return (layers.find(l=>l.type==='symbol')||{}).id
}
function hide3dPrecipLayer(id){
  if(map3d?.getLayer(id))map3d.setLayoutProperty(id,'visibility','none')
}
function ensure3dDpcLayer(){
  if(!map3d||!map3d.isStyleLoaded())return false;
  if(!map3d.getSource('dpc-precip-3d')){
    const tiny='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL8WQAAAABJRU5ErkJggg==';
    map3d.addSource('dpc-precip-3d',{
      type:'image',
      url:tiny,
      coordinates:DPC3D_GRID.coordinates
    });
  }
  if(!map3d.getLayer('dpc-precip-3d-layer')){
    map3d.addLayer({
      id:'dpc-precip-3d-layer',
      type:'raster',
      source:'dpc-precip-3d',
      paint:{
        'raster-opacity':.92,
        'raster-fade-duration':0,
        'raster-resampling':'nearest'
      },
      layout:{visibility:'none'}
    },first3dSymbolLayer())
  }
  return true
}
async function update3dDpcLayer(productKey,time,opacity=.92){
  if(!mode3d||!map3d||!map3d.isStyleLoaded()||!productKey||!time)return;
  if(!ensure3dDpcLayer())return;
  const seq=++dpc3dRequestSeq;
  const canvas=await buildDpc3dMosaic(productKey,time);
  if(seq!==dpc3dRequestSeq||!mode3d||!canvas)return;
  const source=map3d.getSource('dpc-precip-3d');
  if(!source)return;
  try{
    source.updateImage({image:canvas,coordinates:DPC3D_GRID.coordinates});
    map3d.setPaintProperty('dpc-precip-3d-layer','raster-opacity',opacity);
    map3d.setLayoutProperty('dpc-precip-3d-layer','visibility','visible')
  }catch(e){console.warn('DPC radar 3D',e)}
}
function ensure3dOperaLayer(time){
  if(!map3d||!map3d.isStyleLoaded()||!time)return false;
  const tiles=[operaFrameUrl(time)];
  if(!map3d.getSource('opera-radar-3d')){
    map3d.addSource('opera-radar-3d',{
      type:'raster',tiles,tileSize:256,minzoom:0,maxzoom:7,
      attribution:'EUMETNET OPERA NIMBUS · CC BY 4.0'
    })
  }else{
    const source=map3d.getSource('opera-radar-3d');
    if(source?.setTiles)source.setTiles(tiles)
  }
  if(!map3d.getLayer('opera-radar-3d-layer')){
    map3d.addLayer({
      id:'opera-radar-3d-layer',type:'raster',source:'opera-radar-3d',
      paint:{'raster-opacity':.72,'raster-fade-duration':0},
      layout:{visibility:'none'}
    },first3dSymbolLayer())
  }
  return true
}
function sync3dPrecipLayers(){
  if(!mode3d||!map3d||!map3d.isStyleLoaded())return;
  dpc3dRequestSeq++;
  hide3dPrecipLayer('dpc-precip-3d-layer');
  hide3dPrecipLayer('opera-radar-3d-layer');

  if(operaOn&&operaFrames[operaIndex]){
    if(ensure3dOperaLayer(operaFrames[operaIndex])){
      map3d.setLayoutProperty('opera-radar-3d-layer','visibility','visible')
    }
    return
  }
  if(radarOn&&radarFrames[radarIndex]){
    update3dDpcLayer('SRI',radarFrames[radarIndex],.92);
    return
  }
  if(cumActive&&cumLayer?._productKey&&cumLayer?._frame){
    update3dDpcLayer(cumLayer._productKey,cumLayer._frame,.88)
  }
}
function schedule3dPrecipSync(delay=70){
  if(!mode3d)return;
  if(dpc3dSyncTimer)clearTimeout(dpc3dSyncTimer);
  dpc3dSyncTimer=setTimeout(()=>{dpc3dSyncTimer=null;sync3dPrecipLayers()},delay)
}
function ensure3dDataLayers(){"""

s=s.replace(anchor,helpers,1)

# Add precipitation sync at end of ensure3dDataLayers.
old_end="""  update3dStations();
  update3dLightning()
}"""
new_end="""  update3dStations();
  update3dLightning();
  sync3dPrecipLayers()
}"""
if old_end not in s:
    raise SystemExit("fine ensure3dDataLayers non trovata")
s=s.replace(old_end,new_end,1)

# Update status wording.
s=s.replace(
"status.textContent='Vista 3D · OpenFreeMap + Mapterhorn · stazioni e fulmini LIVE compatibili'",
"status.textContent='Vista 3D · OpenFreeMap + Mapterhorn · stazioni, fulmini e precipitazioni compatibili'",
1
)

# Synchronize DPC frame.
old_radar_frame="""  radarLayer.setProductFrame('SRI',d);
  radarTime.textContent=radarLabel(d)
}"""
new_radar_frame="""  radarLayer.setProductFrame('SRI',d);
  radarTime.textContent=radarLabel(d);
  schedule3dPrecipSync(60)
}"""
if old_radar_frame not in s:
    raise SystemExit("setRadarFrame non trovato")
s=s.replace(old_radar_frame,new_radar_frame,1)

# Sync DPC on/off.
old_radar_state="""  radarInfo.classList.toggle('on',on);
  syncTimelineStack();
  syncAccordionStates()
}"""
new_radar_state="""  radarInfo.classList.toggle('on',on);
  schedule3dPrecipSync(30);
  syncTimelineStack();
  syncAccordionStates()
}"""
if old_radar_state not in s:
    raise SystemExit("setRadarState footer non trovato")
s=s.replace(old_radar_state,new_radar_state,1)

# Synchronize OPERA frame.
old_opera_frame="""  operaMeta.innerHTML='OPERA NIMBUS · '+operaLabel(d)+
    '<br>EUMETNET CC BY 4.0 · rain rate · mm/h'
}"""
new_opera_frame="""  operaMeta.innerHTML='OPERA NIMBUS · '+operaLabel(d)+
    '<br>EUMETNET CC BY 4.0 · rain rate · mm/h';
  schedule3dPrecipSync(20)
}"""
if old_opera_frame not in s:
    raise SystemExit("setOperaFrame footer non trovato")
s=s.replace(old_opera_frame,new_opera_frame,1)

# Sync OPERA on/off.
old_opera_state="""  operaInfo.classList.toggle('on',on);
  syncTimelineStack();
  syncAccordionStates()
}"""
new_opera_state="""  operaInfo.classList.toggle('on',on);
  schedule3dPrecipSync(20);
  syncTimelineStack();
  syncAccordionStates()
}"""
if old_opera_state not in s:
    raise SystemExit("setOperaState footer non trovato")
s=s.replace(old_opera_state,new_opera_state,1)

# Sync cumulative DPC.
old_cum_footer="""  document.querySelectorAll('[data-cum]').forEach(b=>b.classList.toggle('active',(code||'off')===b.dataset.cum));
  legend();
  syncAccordionStates()
}"""
new_cum_footer="""  document.querySelectorAll('[data-cum]').forEach(b=>b.classList.toggle('active',(code||'off')===b.dataset.cum));
  schedule3dPrecipSync(40);
  legend();
  syncAccordionStates()
}"""
if old_cum_footer not in s:
    raise SystemExit("setCumState footer non trovato")
s=s.replace(old_cum_footer,new_cum_footer,1)

# On entry to 3D, sync as soon as style is ready.
old_enter="""  if(m.isStyleLoaded())ensure3dDataLayers();
  const status=document.getElementById('status');"""
new_enter="""  if(m.isStyleLoaded())ensure3dDataLayers();
  schedule3dPrecipSync(80);
  const status=document.getElementById('status');"""
if old_enter not in s:
    raise SystemExit("enter3d sync point non trovato")
s=s.replace(old_enter,new_enter,1)

# Checks.
for required in (
    "const DPC3D_Z=6",
    "function buildDpc3dMosaic",
    "function ensure3dOperaLayer",
    "function sync3dPrecipLayers",
    "source.updateImage({image:canvas",
    "schedule3dPrecipSync(60)",
    "schedule3dPrecipSync(20)"
):
    if required not in s:
        raise SystemExit(f"manca {required}")

p.write_text(s,encoding="utf-8")
print("Radar DPC, OPERA e cumulate compatibili con la vista 3D")
