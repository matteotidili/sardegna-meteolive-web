#!/usr/bin/env python3
from pathlib import Path

p=Path("index.html")
s=p.read_text(encoding="utf-8")

# UI: aggiunge i due nuovi prodotti nella sezione Satellite.
old_ui='''        <button class="btn" id="satCloudPhaseBtn">Satellite Cloud Phase RGB <span>OFF</span></button>
        <div class="layer-note" id="satCloudPhaseInfo">MTG FCI Cloud Phase RGB · microfisica delle nubi · diurno · EUMETSAT</div>'''
new_ui='''        <button class="btn" id="satCloudPhaseBtn">Satellite Cloud Phase RGB <span>OFF</span></button>
        <div class="layer-note" id="satCloudPhaseInfo">MTG FCI Cloud Phase RGB · microfisica delle nubi · diurno · EUMETSAT</div>
        <button class="btn" id="satSnowFogBtn">Satellite Day Snow Fog RGB <span>OFF</span></button>
        <div class="layer-note" id="satSnowFogInfo">MTG Day Snow Fog RGB · neve, nebbia e nubi basse · diurno · EUMETSAT</div>
        <button class="btn" id="satPrecipRateBtn">Satellite Precipitation Rate <span>OFF</span></button>
        <div class="layer-note" id="satPrecipRateInfo">H40B · rain rate al suolo · blended FCI IR / LEO MW · EUMETSAT H SAF</div>'''
if old_ui not in s:
    raise SystemExit("UI Cloud Phase non trovata")
s=s.replace(old_ui,new_ui,1)

# Configurazione prodotti.
old_cfg="""  cloudphase:{
    layer:'mtg_fd:rgb_cloudphase',
    label:'MTG Cloud Phase RGB',
    attribution:'© EUMETSAT · MTG FCI Cloud Phase RGB'
  }
};"""
new_cfg="""  cloudphase:{
    layer:'mtg_fd:rgb_cloudphase',
    label:'MTG Cloud Phase RGB',
    attribution:'© EUMETSAT · MTG FCI Cloud Phase RGB'
  },
  snowfog:{
    layer:'mtg_fd:rgb_snow',
    label:'MTG Day Snow Fog RGB',
    attribution:'© EUMETSAT · MTG Day Snow Fog RGB'
  },
  preciprate:{
    layer:'mtg_fd:h40b',
    label:'MTG Precipitation Rate H40B',
    attribution:'© EUMETSAT / H SAF · H40B Precipitation Rate'
  }
};"""
if old_cfg not in s:
    raise SystemExit("SAT_PRODUCTS cloudphase non trovato")
s=s.replace(old_cfg,new_cfg,1)

# Riferimenti DOM.
old_dom="""const satCloudPhaseBtn=document.getElementById('satCloudPhaseBtn'),satCloudPhaseInfo=document.getElementById('satCloudPhaseInfo');"""
new_dom="""const satCloudPhaseBtn=document.getElementById('satCloudPhaseBtn'),satCloudPhaseInfo=document.getElementById('satCloudPhaseInfo');
const satSnowFogBtn=document.getElementById('satSnowFogBtn'),satSnowFogInfo=document.getElementById('satSnowFogInfo');
const satPrecipRateBtn=document.getElementById('satPrecipRateBtn'),satPrecipRateInfo=document.getElementById('satPrecipRateInfo');"""
if old_dom not in s:
    raise SystemExit("DOM Cloud Phase non trovato")
s=s.replace(old_dom,new_dom,1)

# Elemento informativo del prodotto attivo.
old_info="function satInfoEl(){return satProduct==='ir105'?satIr105Info:(satProduct==='cloudphase'?satCloudPhaseInfo:satMetInfo)}"
new_info="""function satInfoEl(){
  if(satProduct==='ir105')return satIr105Info;
  if(satProduct==='cloudphase')return satCloudPhaseInfo;
  if(satProduct==='snowfog')return satSnowFogInfo;
  if(satProduct==='preciprate')return satPrecipRateInfo;
  return satMetInfo
}"""
if old_info not in s:
    raise SystemExit("satInfoEl non trovato")
s=s.replace(old_info,new_info,1)

# Stato UI dei cinque prodotti.
old_state="""function updateSatProductUi(){
  const tc=satMetOn&&satProduct==='truecolour',ir=satMetOn&&satProduct==='ir105',cp=satMetOn&&satProduct==='cloudphase';
  satMetBtn.classList.toggle('active',tc);satMetBtn.lastElementChild.textContent=tc?'ON':'OFF';
  satIr105Btn.classList.toggle('active',ir);satIr105Btn.lastElementChild.textContent=ir?'ON':'OFF';
  satCloudPhaseBtn.classList.toggle('active',cp);satCloudPhaseBtn.lastElementChild.textContent=cp?'ON':'OFF';
  satMetInfo.classList.toggle('on',tc);
  satIr105Info.classList.toggle('on',ir);
  satCloudPhaseInfo.classList.toggle('on',cp)
}"""
new_state="""function updateSatProductUi(){
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
}"""
if old_state not in s:
    raise SystemExit("updateSatProductUi non trovato")
s=s.replace(old_state,new_state,1)

# Click handler.
old_clicks="""satMetBtn.onclick=()=>activateSatProduct('truecolour');
satIr105Btn.onclick=()=>activateSatProduct('ir105');
satCloudPhaseBtn.onclick=()=>activateSatProduct('cloudphase');"""
new_clicks="""satMetBtn.onclick=()=>activateSatProduct('truecolour');
satIr105Btn.onclick=()=>activateSatProduct('ir105');
satCloudPhaseBtn.onclick=()=>activateSatProduct('cloudphase');
satSnowFogBtn.onclick=()=>activateSatProduct('snowfog');
satPrecipRateBtn.onclick=()=>activateSatProduct('preciprate');"""
if old_clicks not in s:
    raise SystemExit("handler prodotti satellite non trovato")
s=s.replace(old_clicks,new_clicks,1)

for required in ("mtg_fd:rgb_snow","mtg_fd:h40b","satSnowFogBtn","satPrecipRateBtn","activateSatProduct('snowfog')","activateSatProduct('preciprate')"):
    if required not in s:
        raise SystemExit(f"Integrazione incompleta: {required}")

p.write_text(s,encoding="utf-8")
print("Day Snow Fog RGB e H40B integrati")
