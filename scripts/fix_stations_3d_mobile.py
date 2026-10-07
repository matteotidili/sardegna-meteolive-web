#!/usr/bin/env python3
from pathlib import Path

p=Path("index.html")
s=p.read_text(encoding="utf-8")

# CSS mobile markers.
css_anchor="#map3d.on{display:block}#map.map-hidden{display:none}"
css_new=css_anchor+"""
.station3d-mobile-marker{
  display:grid;place-items:center;box-sizing:border-box;
  width:30px;height:30px;border-radius:50%;
  border:2px solid #fff;box-shadow:0 1px 5px #0009;
  color:#07111d;font:900 9px/1 Inter,system-ui,Arial;
  text-align:center;cursor:pointer;user-select:none;-webkit-user-select:none;
  transform:translateZ(0)
}
.station3d-mobile-marker:active{transform:scale(.94)}
"""
if css_anchor not in s:
    raise SystemExit("CSS anchor map3d non trovato")
s=s.replace(css_anchor,css_new,1)

# State.
state_anchor="let map3d=null,mode3d=false,statusBefore3d='';"
state_new=state_anchor+"""
let station3dMobileMarkers=[];
let station3dMobileRefreshTimer=null;
"""
if state_anchor not in s:
    raise SystemExit("state map3d non trovato")
s=s.replace(state_anchor,state_new,1)

# Insert mobile marker renderer before ensure3dDataLayers.
anchor="function ensure3dDataLayers(){"
helper=r"""function clearMobile3dStationMarkers(){
  station3dMobileMarkers.forEach(m=>{try{m.remove()}catch(e){}});
  station3dMobileMarkers=[]
}
function mobile3dStationCandidates(){
  if(!map3d||!mode3d||!stationsOn)return [];
  const bounds=map3d.getBounds();
  const candidates=stations.filter(baseVisible).filter(s=>
    Number.isFinite(Number(s.lat))&&Number.isFinite(Number(s.lon))&&
    bounds.contains([Number(s.lon),Number(s.lat)])
  ).map(s=>{
    const p=map3d.project([Number(s.lon),Number(s.lat)]);
    return {s,p,pri:priority(s),stable:stationKey(s)}
  }).sort((a,b)=>
    Number(b.stable===focusedStationKey)-Number(a.stable===focusedStationKey)||
    a.pri-b.pri||a.stable.localeCompare(b.stable,'it')
  );

  const spacing=34,grid=new Map(),accepted=[];
  for(const item of candidates){
    const gx=Math.floor(item.p.x/spacing),gy=Math.floor(item.p.y/spacing);
    let collide=false;
    for(let ix=gx-1;ix<=gx+1&&!collide;ix++){
      for(let iy=gy-1;iy<=gy+1&&!collide;iy++){
        const bucket=grid.get(ix+','+iy);
        if(!bucket)continue;
        for(const keep of bucket){
          if(Math.abs(item.p.x-keep.p.x)<spacing&&Math.abs(item.p.y-keep.p.y)<spacing){
            collide=true;break
          }
        }
      }
    }
    if(collide)continue;
    accepted.push(item);
    const key=gx+','+gy;
    if(!grid.has(key))grid.set(key,[]);
    grid.get(key).push(item)
  }
  return accepted
}
function renderMobile3dStations(){
  clearMobile3dStationMarkers();
  if(!MOBILE_MAP()||!map3d||!mode3d||!map3d.isStyleLoaded()||!stationsOn)return;

  const selected=mobile3dStationCandidates();
  for(const item of selected){
    const s=item.s,el=document.createElement('div');
    el.className='station3d-mobile-marker';
    el.style.background=col(s[cur],P[cur].st);
    el.textContent=fmtMarker(s[cur],cur);
    el.title=(s.name||'Stazione')+' · '+P[cur].n+' '+fmt(s[cur],cur,s);
    el.setAttribute('aria-label',el.title);
    el.addEventListener('click',e=>{
      e.stopPropagation();
      focusedStationKey=stationKey(s);
      new maplibregl.Popup({closeButton:false,offset:18})
        .setLngLat([Number(s.lon),Number(s.lat)])
        .setHTML('<b>'+String(s.name||'Stazione')+'</b><br>'+P[cur].n+': '+fmt(s[cur],cur,s)+
          '<br><span style="opacity:.75">'+
          (s.network==='wunderground'?'Weather Underground':s.network==='aeronautica-militare'?'Aeronautica Militare':'DPCN Sardegna')+
          '</span>')
        .addTo(map3d)
    });
    const marker=new maplibregl.Marker({element:el,anchor:'center'})
      .setLngLat([Number(s.lon),Number(s.lat)])
      .addTo(map3d);
    station3dMobileMarkers.push(marker)
  }

  const status=document.getElementById('status');
  if(status)status.textContent='Vista 3D · '+selected.length+' stazioni visibili · '+P[cur].n+' · '+stations.filter(baseVisible).length+' con dato'
}
function scheduleMobile3dStations(delay=60){
  if(station3dMobileRefreshTimer)clearTimeout(station3dMobileRefreshTimer);
  station3dMobileRefreshTimer=setTimeout(()=>{
    station3dMobileRefreshTimer=null;
    renderMobile3dStations()
  },delay)
}
function ensure3dDataLayers(){"""
if anchor not in s:
    raise SystemExit("ensure3dDataLayers anchor non trovato")
s=s.replace(anchor,helper,1)

# In update3dStations, keep MapLibre for desktop but hide style layers on mobile and render DOM markers.
old_update="""  map3d.getSource('stations-3d').setData(fc(features));
  raise3dOperationalLayers();
  if(mode3d){
    const status=document.getElementById('status');
    if(status)status.textContent='Vista 3D · '+features.length+' stazioni · '+P[cur].n+' · precipitazioni e fulmini compatibili'
  }
}"""
new_update="""  map3d.getSource('stations-3d').setData(fc(features));
  if(map3d.getLayer('stations-3d-points'))map3d.setLayoutProperty('stations-3d-points','visibility',MOBILE_MAP()?'none':'visible');
  if(map3d.getLayer('stations-3d-labels'))map3d.setLayoutProperty('stations-3d-labels','visibility',MOBILE_MAP()?'none':'visible');
  raise3dOperationalLayers();
  if(MOBILE_MAP())scheduleMobile3dStations(20);
  else clearMobile3dStationMarkers();
  if(mode3d&&!MOBILE_MAP()){
    const status=document.getElementById('status');
    if(status)status.textContent='Vista 3D · '+features.length+' stazioni · '+P[cur].n+' · precipitazioni e fulmini compatibili'
  }
}"""
if old_update not in s:
    raise SystemExit("update3dStations footer non trovato")
s=s.replace(old_update,new_update,1)

# Add map3d mobile refresh listeners once after map creation control.
control_anchor="map3d.addControl(new maplibregl.NavigationControl({visualizePitch:true}),'bottom-right');"
control_new=control_anchor+"""
  map3d.on('moveend',()=>{if(mode3d&&MOBILE_MAP())scheduleMobile3dStations(40)});
  map3d.on('zoomend',()=>{if(mode3d&&MOBILE_MAP())scheduleMobile3dStations(40)});
"""
if control_anchor not in s:
    raise SystemExit("map3d control anchor non trovato")
s=s.replace(control_anchor,control_new,1)

# Ensure entry and leave.
enter_anchor="""  setTimeout(()=>{if(mode3d&&map3d?.isStyleLoaded())ensure3dDataLayers()},900);
  schedule3dPrecipSync(80);"""
enter_new="""  setTimeout(()=>{if(mode3d&&map3d?.isStyleLoaded())ensure3dDataLayers()},900);
  setTimeout(()=>{if(mode3d&&MOBILE_MAP())renderMobile3dStations()},1050);
  schedule3dPrecipSync(80);"""
if enter_anchor not in s:
    raise SystemExit("enter anchor non trovato")
s=s.replace(enter_anchor,enter_new,1)

leave_anchor="""  mode3d=false;
  map3dEl.classList.remove('on');"""
leave_new="""  mode3d=false;
  clearMobile3dStationMarkers();
  map3dEl.classList.remove('on');"""
if leave_anchor not in s:
    raise SystemExit("leave anchor non trovato")
s=s.replace(leave_anchor,leave_new,1)

# Resize refresh.
old_resize="window.addEventListener('resize',()=>{syncMapExtent();if(map3d)map3d.resize();if(window.innerWidth>800)leftPanel.classList.remove('open');syncMobileButtons();layoutTimelineStack()});"
new_resize="window.addEventListener('resize',()=>{syncMapExtent();if(map3d){map3d.resize();if(mode3d)scheduleMobile3dStations(120)}if(window.innerWidth>800)leftPanel.classList.remove('open');syncMobileButtons();layoutTimelineStack()});"
if old_resize not in s:
    raise SystemExit("resize listener non trovato")
s=s.replace(old_resize,new_resize,1)

for required in (
  "station3d-mobile-marker",
  "function renderMobile3dStations",
  "new maplibregl.Marker",
  "MOBILE_MAP()?'none':'visible'",
  "stazioni visibili"
):
    if required not in s:
        raise SystemExit(f"manca {required}")

p.write_text(s,encoding="utf-8")
print("Fallback DOM mobile per stazioni 3D applicato")
