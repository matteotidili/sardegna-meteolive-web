#!/usr/bin/env python3
from pathlib import Path

p=Path("index.html")
s=p.read_text(encoding="utf-8")

# ---------- CSS ----------
css_anchor=".direct-layer-counter{margin:0 7px 8px!important;padding:0 2px;color:#7890a4}"
css_add=css_anchor+r"""
.hydro-popup{min-width:265px;max-width:330px;color:#132331;font:12px/1.35 Inter,system-ui,Arial}
.hydro-popup-title{font-size:14px;font-weight:900;color:#071722;margin-bottom:2px}
.hydro-popup-meta{font-size:10px;color:#617483;margin-bottom:8px}
.hydro-popup-current{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:5px 0}
.hydro-popup-value{font-size:23px;font-weight:950;letter-spacing:-.03em;color:#071722}
.hydro-popup-stage{padding:4px 7px;border-radius:999px;font-size:9px;font-weight:950;letter-spacing:.04em;color:#071722;background:#dbe7ed;white-space:nowrap}
.hydro-popup-row{display:flex;justify-content:space-between;gap:12px;padding:2px 0;font-size:10px;color:#405461}
.hydro-popup-thresholds{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin:7px 0 5px}
.hydro-threshold{border-radius:7px;padding:5px 4px;text-align:center;font-size:9px;font-weight:850;border:1px solid #d8e1e6;background:#f4f7f9}
.hydro-chart{margin-top:7px;border-top:1px solid #dbe3e8;padding-top:7px}
.hydro-chart-title{font-size:9px;font-weight:900;letter-spacing:.04em;color:#526775;margin-bottom:4px}
.hydro-chart svg{display:block;width:100%;height:auto}
.hydro-popup-note{margin-top:5px;font-size:8px;line-height:1.3;color:#6f808b}
.hydro-scale{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px;font-size:8px}
.hydro-scale span{display:inline-flex;align-items:center;gap:4px}
.hydro-swatch{width:10px;height:10px;border-radius:50%;border:1px solid #fff;box-shadow:0 0 0 1px #0002}
.hydro-swatch.normal{background:#31a8d8}.hydro-swatch.s1{background:#f1d54b}.hydro-swatch.s2{background:#f28c35}.hydro-swatch.s3{background:#dc3d3d}.hydro-swatch.stale{background:#7e8b94}
"""
if css_anchor not in s:
    raise SystemExit("CSS anchor non trovato")
s=s.replace(css_anchor,css_add,1)

# ---------- UI ----------
ui_anchor="""    <button class="btn direct-layer-toggle active" id="stationsBtn">Rete stazioni <span>ON</span></button>
    <div id="counter" class="counter direct-layer-counter">Caricamento dati…</div>
"""
ui_new=ui_anchor+"""
    <button class="btn direct-layer-toggle" id="hydroBtn">Idrometri ARPAS <span>OFF</span></button>
    <div id="hydroCounter" class="counter direct-layer-counter">Rete fiduciaria · soft real time</div>
"""
if ui_anchor not in s:
    raise SystemExit("UI rete stazioni non trovata")
s=s.replace(ui_anchor,ui_new,1)

# ---------- State ----------
state_anchor="let frpOn=false,frpData=null,frpLoading=false,frpAttributionOn=false;"
state_new=state_anchor+r"""
let hydroOn=false,hydroLoading=false,hydroFeatures=[],hydroAttributionOn=false,hydroLastLoad=0;
const HYDRO_RT='https://services6.arcgis.com/VdOe78ROZ6pyB2c8/arcgis/rest/services/idrometri_real_time_vista/FeatureServer/1';
const HYDRO_HIST='https://services6.arcgis.com/VdOe78ROZ6pyB2c8/arcgis/rest/services/ds_accumula_view_read_only/FeatureServer/9';
const HYDRO_ATTR='Idrometri © ARPAS · rete fiduciaria di Protezione Civile';
const hydroLayer=L.layerGroup();
"""
if state_anchor not in s:
    raise SystemExit("state anchor non trovato")
s=s.replace(state_anchor,state_new,1)

# ---------- Pane ----------
pane_anchor="map.createPane('alerts');map.getPane('alerts').style.zIndex=390;"
pane_new=pane_anchor+"\nmap.createPane('hydro');map.getPane('hydro').style.zIndex=415;"
if pane_anchor not in s:
    raise SystemExit("pane alerts non trovato")
s=s.replace(pane_anchor,pane_new,1)

# ---------- 3D raise order ----------
raise_old="for(const id of ['stations-3d-points','stations-3d-labels','lightning-3d-points']){"
raise_new="for(const id of ['hydro-3d-points','stations-3d-points','stations-3d-labels','lightning-3d-points']){"
if raise_old not in s:
    raise SystemExit("raise3dOperationalLayers non trovato")
s=s.replace(raise_old,raise_new,1)

# ---------- 3D layer ----------
lightning_anchor="""  if(!map3d.getSource('lightning-3d')){
    map3d.addSource('lightning-3d',{type:'geojson',data:fc()});
    map3d.addLayer({
      id:'lightning-3d-points',type:'circle',source:'lightning-3d',
      paint:{
        'circle-radius':['get','radius'],
        'circle-color':['get','color'],
        'circle-stroke-color':['get','stroke'],
        'circle-stroke-width':['get','weight'],
        'circle-opacity':.95
      }
    })
  }
  update3dStations();
  update3dLightning();
  sync3dPrecipLayers()
}"""
hydro_3d=r"""  if(!map3d.getSource('lightning-3d')){
    map3d.addSource('lightning-3d',{type:'geojson',data:fc()});
    map3d.addLayer({
      id:'lightning-3d-points',type:'circle',source:'lightning-3d',
      paint:{
        'circle-radius':['get','radius'],
        'circle-color':['get','color'],
        'circle-stroke-color':['get','stroke'],
        'circle-stroke-width':['get','weight'],
        'circle-opacity':.95
      }
    })
  }
  if(!map3d.getSource('hydro-3d')){
    map3d.addSource('hydro-3d',{type:'geojson',data:fc()});
    map3d.addLayer({
      id:'hydro-3d-points',type:'circle',source:'hydro-3d',
      paint:{
        'circle-radius':['get','radius'],
        'circle-color':['get','color'],
        'circle-stroke-color':'#ffffff',
        'circle-stroke-width':1.8,
        'circle-opacity':.96
      }
    });
    map3d.on('click','hydro-3d-points',e=>{
      const f=e.features&&e.features[0];if(!f)return;
      const p={...f.properties};
      for(const k of ['value','trend','s1','s2','s3','time'])if(p[k]!==null&&p[k]!==undefined)p[k]=Number(p[k]);
      showHydroPopup3d(p,f.geometry.coordinates)
    });
    map3d.on('mouseenter','hydro-3d-points',()=>{map3d.getCanvas().style.cursor='pointer'});
    map3d.on('mouseleave','hydro-3d-points',()=>{map3d.getCanvas().style.cursor=''})
  }
  update3dStations();
  update3dLightning();
  update3dHydro();
  sync3dPrecipLayers()
}"""
if lightning_anchor not in s:
    raise SystemExit("ensure3dDataLayers footer non trovato")
s=s.replace(lightning_anchor,hydro_3d,1)

# ---------- Main hydrology functions inserted before legend() ----------
legend_anchor="function legend(){"
hydro_logic=r"""function hydroNum(v){const n=Number(v);return Number.isFinite(n)?n:null}
function hydroStale(p){
  const t=hydroNum(p?.time);
  return !t||Date.now()-t>2*60*60*1000
}
function hydroStage(p){
  const v=hydroNum(p?.value),s1=hydroNum(p?.s1),s2=hydroNum(p?.s2),s3=hydroNum(p?.s3);
  if(v===null)return -1;
  if(hydroStale(p))return -2;
  if(s3!==null&&v>=s3)return 3;
  if(s2!==null&&v>=s2)return 2;
  if(s1!==null&&v>=s1)return 1;
  return 0
}
function hydroColor(p){
  return ({'-2':'#7e8b94','-1':'#7e8b94','0':'#31a8d8','1':'#f1d54b','2':'#f28c35','3':'#dc3d3d'})[String(hydroStage(p))]||'#7e8b94'
}
function hydroStageLabel(p){
  const st=hydroStage(p);
  if(st===-2)return 'DATO RITARDATO';
  if(st===-1)return 'DATO N/D';
  if(st===3)return '≥ S3';
  if(st===2)return 'S2–S3';
  if(st===1)return 'S1–S2';
  return '< S1'
}
function hydroRadius(p){
  const st=hydroStage(p);
  return st>=3?10:st===2?9:st===1?8:7
}
function hydroTimeLabel(ms){
  const d=new Date(Number(ms));
  if(!Number.isFinite(d.getTime()))return '—';
  return d.toLocaleString('it-IT',{timeZone:'Europe/Rome',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})
}
function hydroLevel(v){
  const n=hydroNum(v);return n===null?'—':n.toLocaleString('it-IT',{minimumFractionDigits:3,maximumFractionDigits:3})+' m'
}
function hydroTrendText(v){
  const n=hydroNum(v);if(n===null)return '—';
  const cm=n*100,arrow=cm>.05?'↑':cm<-.05?'↓':'→';
  const sign=cm>0?'+':'';
  return arrow+' '+sign+cm.toLocaleString('it-IT',{minimumFractionDigits:1,maximumFractionDigits:1})+' cm/h'
}
function hydroThreshold(v,label){
  const n=hydroNum(v);
  return '<div class="hydro-threshold"><b>'+label+'</b><br>'+(n===null?'—':n.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})+' m')+'</div>'
}
function hydroEscape(v){
  return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
}
function hydroGraph(rows,p){
  const data=(rows||[]).map(r=>r.attributes||r).filter(r=>Number.isFinite(Number(r.time))&&Number.isFinite(Number(r.value))).sort((a,b)=>Number(a.time)-Number(b.time));
  if(data.length<2)return '<div class="hydro-chart"><div class="hydro-chart-title">IDROGRAMMA · dati insufficienti</div></div>';
  const W=310,H=145,L=31,R=30,T=8,B=24;
  const vals=data.map(r=>Number(r.value));
  const thresholds=[['S1',hydroNum(p.s1),'#c8aa18'],['S2',hydroNum(p.s2),'#d76c18'],['S3',hydroNum(p.s3),'#c42c2c']].filter(x=>x[1]!==null);
  const all=vals.concat(thresholds.map(x=>x[1]));
  let ymin=Math.min(...all),ymax=Math.max(...all);
  if(ymax-ymin<.2){ymin-=.1;ymax+=.1}
  const pad=(ymax-ymin)*.08;ymin-=pad;ymax+=pad;
  const t0=Number(data[0].time),t1=Number(data.at(-1).time);
  const x=t=>L+(Number(t)-t0)/Math.max(1,t1-t0)*(W-L-R);
  const y=v=>T+(ymax-Number(v))/Math.max(.001,ymax-ymin)*(H-T-B);
  const pts=data.map(r=>x(r.time).toFixed(1)+','+y(r.value).toFixed(1)).join(' ');
  const thresholdSvg=thresholds.map(([name,v,color])=>'<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y(v).toFixed(1)+'" y2="'+y(v).toFixed(1)+'" stroke="'+color+'" stroke-width="1" stroke-dasharray="4 3"/><text x="'+(W-R+3)+'" y="'+(y(v)+3).toFixed(1)+'" font-size="8" fill="'+color+'">'+name+'</text>').join('');
  const start=hydroTimeLabel(t0),end=hydroTimeLabel(t1);
  return '<div class="hydro-chart"><div class="hydro-chart-title">IDROGRAMMA · ultime 24 h circa</div>'+
    '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Andamento del livello idrometrico">'+
    '<rect x="'+L+'" y="'+T+'" width="'+(W-L-R)+'" height="'+(H-T-B)+'" fill="#f7fafb" stroke="#dce5ea"/>'+
    thresholdSvg+
    '<polyline points="'+pts+'" fill="none" stroke="#087ca6" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>'+
    '<circle cx="'+x(t1).toFixed(1)+'" cy="'+y(vals.at(-1)).toFixed(1)+'" r="3.2" fill="'+hydroColor(p)+'" stroke="#fff" stroke-width="1.2"/>'+
    '<text x="2" y="'+(T+7)+'" font-size="8" fill="#647784">'+ymax.toFixed(2)+'</text>'+
    '<text x="2" y="'+(H-B)+'" font-size="8" fill="#647784">'+ymin.toFixed(2)+'</text>'+
    '<text x="'+L+'" y="'+(H-7)+'" font-size="8" fill="#647784">'+hydroEscape(start)+'</text>'+
    '<text x="'+(W-R)+'" y="'+(H-7)+'" text-anchor="end" font-size="8" fill="#647784">'+hydroEscape(end)+'</text>'+
    '</svg></div>'
}
function hydroPopupHtml(p,chartHtml=''){
  const name=p.cae_nome||p.altra_denominazione||p.cod_srv||'Idrometro ARPAS';
  const meta=[p.cod_srv,p.localita].filter(Boolean).map(hydroEscape).join(' · ');
  return '<div class="hydro-popup">'+
    '<div class="hydro-popup-title">'+hydroEscape(name)+'</div>'+
    '<div class="hydro-popup-meta">'+meta+'</div>'+
    '<div class="hydro-popup-current"><div class="hydro-popup-value">'+hydroLevel(p.value)+'</div>'+
    '<div class="hydro-popup-stage" style="background:'+hydroColor(p)+'">'+hydroStageLabel(p)+'</div></div>'+
    '<div class="hydro-popup-row"><span>Trend orario</span><b>'+hydroTrendText(p.trend)+'</b></div>'+
    '<div class="hydro-popup-row"><span>Ultimo rilevamento</span><b>'+hydroTimeLabel(p.time)+'</b></div>'+
    '<div class="hydro-popup-thresholds">'+hydroThreshold(p.s1,'S1')+hydroThreshold(p.s2,'S2')+hydroThreshold(p.s3,'S3')+'</div>'+
    chartHtml+
    '<div class="hydro-popup-note">Fonte ARPAS · rete fiduciaria di Protezione Civile. Campionamento 15 min; pubblicazione mediamente con circa 30 min di latenza.</div>'+
    '</div>'
}
async function loadHydroHistory(code){
  const safe=String(code||'').replace(/'/g,"''");
  const q=new URLSearchParams({
    where:"cod_srv='"+safe+"'",
    outFields:'time,value,trend,s1,s2,s3',
    returnGeometry:'false',
    orderByFields:'time DESC',
    resultRecordCount:'96',
    f:'json'
  });
  const r=await fetch(HYDRO_HIST+'/query?'+q.toString(),{cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw new Error('ARPAS storico '+r.status);
  const d=await r.json();
  if(d.error)throw new Error(d.error.message||'ARPAS storico');
  return d.features||[]
}
function showHydroPopup(p,latlng){
  const popup=L.popup({maxWidth:360,closeButton:true})
    .setLatLng(latlng)
    .setContent(hydroPopupHtml(p,'<div class="hydro-chart"><div class="hydro-chart-title">IDROGRAMMA · caricamento…</div></div>'))
    .openOn(map);
  loadHydroHistory(p.cod_srv).then(rows=>{
    if(map._popup===popup)popup.setContent(hydroPopupHtml(p,hydroGraph(rows,p)))
  }).catch(()=>{
    if(map._popup===popup)popup.setContent(hydroPopupHtml(p,'<div class="hydro-chart"><div class="hydro-chart-title">IDROGRAMMA · temporaneamente non disponibile</div></div>'))
  })
}
function showHydroPopup3d(p,lnglat){
  if(!map3d)return;
  const popup=new maplibregl.Popup({closeButton:true,offset:14,maxWidth:'360px'})
    .setLngLat(lnglat)
    .setHTML(hydroPopupHtml(p,'<div class="hydro-chart"><div class="hydro-chart-title">IDROGRAMMA · caricamento…</div></div>'))
    .addTo(map3d);
  loadHydroHistory(p.cod_srv).then(rows=>popup.setHTML(hydroPopupHtml(p,hydroGraph(rows,p)))).catch(()=>popup.setHTML(hydroPopupHtml(p,'<div class="hydro-chart"><div class="hydro-chart-title">IDROGRAMMA · temporaneamente non disponibile</div></div>')))
}
function hydroLegendHtml(){
  if(!hydroOn)return '';
  return '<div class="map-legend-row"><div class="map-legend-title">IDROMETRI ARPAS · LIVELLO / SOGLIE</div>'+
    '<div class="hydro-scale"><span><i class="hydro-swatch normal"></i>&lt; S1</span><span><i class="hydro-swatch s1"></i>S1–S2</span><span><i class="hydro-swatch s2"></i>S2–S3</span><span><i class="hydro-swatch s3"></i>≥ S3</span><span><i class="hydro-swatch stale"></i>dato ritardato</span></div>'+
    '<div class="map-legend-note">Click sull’idrometro: livello, trend, soglie e idrogramma.</div></div>'
}
function updateHydroCounter(){
  const el=document.getElementById('hydroCounter');if(!el)return;
  if(hydroLoading){el.textContent='Aggiornamento idrometri…';return}
  if(!hydroFeatures.length){el.textContent=hydroOn?'Dati ARPAS non disponibili':'Rete fiduciaria · soft real time';return}
  const times=hydroFeatures.map(f=>hydroNum(f.properties?.time)).filter(v=>v!==null);
  const latest=times.length?Math.max(...times):null;
  const high=hydroFeatures.filter(f=>hydroStage(f.properties)>=1).length;
  el.textContent=hydroFeatures.length+' sezioni · '+(latest?hydroTimeLabel(latest):'—')+(high?' · '+high+' ≥ S1':'')
}
function renderHydroLayer(){
  hydroLayer.clearLayers();
  if(hydroOn){
    for(const f of hydroFeatures){
      const p=f.properties||{},coords=f.geometry?.coordinates;
      if(!Array.isArray(coords)||coords.length<2)continue;
      const lat=Number(coords[1]),lon=Number(coords[0]);
      if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
      const m=L.circleMarker([lat,lon],{
        pane:'hydro',radius:hydroRadius(p),color:'#ffffff',weight:1.8,opacity:1,
        fillColor:hydroColor(p),fillOpacity:.95
      });
      const name=p.cae_nome||p.altra_denominazione||p.cod_srv||'Idrometro';
      m.bindTooltip('<b>'+hydroEscape(name)+'</b><br>'+hydroLevel(p.value)+' · '+hydroTrendText(p.trend),{direction:'top',opacity:.96});
      m.on('click',()=>showHydroPopup(p,L.latLng(lat,lon)));
      m.addTo(hydroLayer)
    }
    if(!map.hasLayer(hydroLayer))hydroLayer.addTo(map)
  }else if(map.hasLayer(hydroLayer))map.removeLayer(hydroLayer);
  update3dHydro();
  updateHydroCounter();
  legend()
}
async function loadHydroData(force=false){
  if(hydroLoading)return;
  if(!force&&hydroFeatures.length&&Date.now()-hydroLastLoad<4*60*1000){renderHydroLayer();return}
  hydroLoading=true;updateHydroCounter();
  try{
    const q=new URLSearchParams({
      where:'1=1',
      outFields:'cod_srv,altra_denominazione,cae_nome,tipomisura,localita,time,value,trend,zero,s1,s2,s3,nota_m_slm,note',
      returnGeometry:'true',
      outSR:'4326',
      f:'geojson'
    });
    const r=await fetch(HYDRO_RT+'/query?'+q.toString(),{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw new Error('ARPAS '+r.status);
    const d=await r.json();
    if(d.error)throw new Error(d.error.message||'ARPAS');
    hydroFeatures=Array.isArray(d.features)?d.features:[];
    hydroLastLoad=Date.now()
  }catch(e){
    console.warn('Idrometri ARPAS',e)
  }finally{
    hydroLoading=false;renderHydroLayer()
  }
}
function update3dHydro(){
  if(!map3d||!map3d.isStyleLoaded()||!map3d.getSource('hydro-3d'))return;
  const features=hydroOn?hydroFeatures.map(f=>{
    const p=f.properties||{},coords=f.geometry?.coordinates;
    if(!Array.isArray(coords)||coords.length<2)return null;
    return {
      type:'Feature',
      geometry:{type:'Point',coordinates:[Number(coords[0]),Number(coords[1])]},
      properties:{
        ...p,
        color:hydroColor(p),
        radius:hydroRadius(p)+1
      }
    }
  }).filter(Boolean):[];
  map3d.getSource('hydro-3d').setData(fc(features));
  raise3dOperationalLayers()
}
function setHydroState(on){
  hydroOn=!!on;
  const btn=document.getElementById('hydroBtn');
  btn.classList.toggle('active',hydroOn);
  btn.lastElementChild.textContent=hydroOn?'ON':'OFF';
  if(hydroOn){
    if(!hydroAttributionOn&&map.attributionControl){map.attributionControl.addAttribution(HYDRO_ATTR);hydroAttributionOn=true}
    loadHydroData(true)
  }else{
    if(map.hasLayer(hydroLayer))map.removeLayer(hydroLayer);
    if(hydroAttributionOn&&map.attributionControl){map.attributionControl.removeAttribution(HYDRO_ATTR);hydroAttributionOn=false}
    update3dHydro();updateHydroCounter();legend()
  }
}
document.getElementById('hydroBtn').onclick=()=>setHydroState(!hydroOn);

function legend(){"""
if legend_anchor not in s:
    raise SystemExit("legend anchor non trovato")
s=s.replace(legend_anchor,hydro_logic,1)

# ---------- Add hydro legend ----------
old_html="const html=radarLegendHtml()+operaLegendHtml()+cumLegendHtml()+frpLegendHtml()+meteoalarmLegendHtml()+lightningLegendHtml();"
new_html="const html=radarLegendHtml()+operaLegendHtml()+cumLegendHtml()+hydroLegendHtml()+frpLegendHtml()+meteoalarmLegendHtml()+lightningLegendHtml();"
if old_html not in s:
    raise SystemExit("legend html concat non trovato")
s=s.replace(old_html,new_html,1)

# ---------- Update 3D status after station update to mention hydrology if active ----------
old_status="if(status)status.textContent='Vista 3D · '+features.length+' stazioni · '+P[cur].n+' · precipitazioni e fulmini compatibili'"
new_status="if(status)status.textContent='Vista 3D · '+features.length+' stazioni · '+P[cur].n+(hydroOn?' · idrometri ARPAS':'')+' · precipitazioni e fulmini compatibili'"
if old_status in s:
    s=s.replace(old_status,new_status,1)

# ---------- Polling ----------
poll_anchor="""setInterval(()=>{
  if(radarOn&&!radarTimer&&radarIndex===radarFrames.length-1)loadRadarTimeline();
  if(operaOn&&!operaTimer&&operaIndex===operaFrames.length-1)loadOperaTimeline(false);
  if(cumActive)setCumState(cumActive)
},5*60*1000);"""
poll_new=poll_anchor+"""
setInterval(()=>{if(hydroOn&&!document.hidden)loadHydroData(true)},5*60*1000);
"""
if poll_anchor not in s:
    raise SystemExit("poll anchor non trovato")
s=s.replace(poll_anchor,poll_new,1)

# Visibility refresh.
vis_anchor="document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadObservations()});"
vis_new="document.addEventListener('visibilitychange',()=>{if(!document.hidden){loadObservations();if(hydroOn)loadHydroData(true)}});"
if vis_anchor not in s:
    raise SystemExit("visibility anchor non trovato")
s=s.replace(vis_anchor,vis_new,1)

for required in (
    'id="hydroBtn"',
    "const HYDRO_RT=",
    "function hydroGraph(",
    "function loadHydroHistory(",
    "function update3dHydro(",
    "hydroLegendHtml()",
    "map.createPane('hydro')"
):
    if required not in s:
        raise SystemExit(f"Integrazione idrometri incompleta: {required}")

p.write_text(s,encoding="utf-8")
print("Idrometri ARPAS integrati in 2D e 3D con soglie, trend e idrogramma")
