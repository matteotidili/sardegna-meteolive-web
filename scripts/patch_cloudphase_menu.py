#!/usr/bin/env python3
from pathlib import Path

p=Path("index.html")
s=p.read_text(encoding="utf-8")

# Nasconde lo stato ON/OFF nelle sole intestazioni accordion.
old_css=".acc-state{flex:0 0 auto;max-width:92px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:3px 6px;border:1px solid #2d4a60;border-radius:999px;background:#091521;color:#9fb5c8;font-size:8px;font-weight:850;letter-spacing:.04em;text-transform:none}"
new_css=".acc-state{display:none!important}"
if old_css not in s:
    raise SystemExit("CSS acc-state non trovato")
s=s.replace(old_css,new_css,1)

# Aggiunge il pulsante Cloud Phase.
old_ui='''        <button class="btn" id="satIr105Btn">Satellite IR10.5 HRFI <span>OFF</span></button>
        <div class="layer-note" id="satIr105Info">FCI HRFI IR10.5 µm · 1 km · giorno/notte · EUMETSAT</div>'''
new_ui='''        <button class="btn" id="satIr105Btn">Satellite IR10.5 HRFI <span>OFF</span></button>
        <div class="layer-note" id="satIr105Info">FCI HRFI IR10.5 µm · 1 km · giorno/notte · EUMETSAT</div>
        <button class="btn" id="satCloudPhaseBtn">Satellite Cloud Phase RGB <span>OFF</span></button>
        <div class="layer-note" id="satCloudPhaseInfo">MTG FCI Cloud Phase RGB · microfisica delle nubi · diurno · EUMETSAT</div>'''
if old_ui not in s:
    raise SystemExit("UI IR10.5 non trovata")
s=s.replace(old_ui,new_ui,1)

# Aggiunge il prodotto alla configurazione.
old_cfg="""  ir105:{
    layer:'mtg_fd:ir105_hrfi',
    label:'FCI HRFI IR10.5 µm',
    attribution:'© EUMETSAT · MTG FCI HRFI IR10.5 µm'
  }
};"""
new_cfg="""  ir105:{
    layer:'mtg_fd:ir105_hrfi',
    label:'FCI HRFI IR10.5 µm',
    attribution:'© EUMETSAT · MTG FCI HRFI IR10.5 µm'
  },
  cloudphase:{
    layer:'mtg_fd:rgb_cloudphase',
    label:'MTG Cloud Phase RGB',
    attribution:'© EUMETSAT · MTG FCI Cloud Phase RGB'
  }
};"""
if old_cfg not in s:
    raise SystemExit("config SAT_PRODUCTS non trovata")
s=s.replace(old_cfg,new_cfg,1)

# Riferimenti DOM.
old_dom="""const satMetBtn=document.getElementById('satMetBtn'),satMetInfo=document.getElementById('satMetInfo');
const satIr105Btn=document.getElementById('satIr105Btn'),satIr105Info=document.getElementById('satIr105Info');"""
new_dom="""const satMetBtn=document.getElementById('satMetBtn'),satMetInfo=document.getElementById('satMetInfo');
const satIr105Btn=document.getElementById('satIr105Btn'),satIr105Info=document.getElementById('satIr105Info');
const satCloudPhaseBtn=document.getElementById('satCloudPhaseBtn'),satCloudPhaseInfo=document.getElementById('satCloudPhaseInfo');"""
if old_dom not in s:
    raise SystemExit("DOM satellite non trovato")
s=s.replace(old_dom,new_dom,1)

# Info attiva per prodotto.
old_info="function satInfoEl(){return satProduct==='ir105'?satIr105Info:satMetInfo}"
new_info="function satInfoEl(){return satProduct==='ir105'?satIr105Info:(satProduct==='cloudphase'?satCloudPhaseInfo:satMetInfo)}"
if old_info not in s:
    raise SystemExit("satInfoEl non trovato")
s=s.replace(old_info,new_info,1)

# Stato UI tre prodotti.
old_state="""function updateSatProductUi(){
  const tc=satMetOn&&satProduct==='truecolour',ir=satMetOn&&satProduct==='ir105';
  satMetBtn.classList.toggle('active',tc);satMetBtn.lastElementChild.textContent=tc?'ON':'OFF';
  satIr105Btn.classList.toggle('active',ir);satIr105Btn.lastElementChild.textContent=ir?'ON':'OFF';
  satMetInfo.classList.toggle('on',tc);
  satIr105Info.classList.toggle('on',ir)
}"""
new_state="""function updateSatProductUi(){
  const tc=satMetOn&&satProduct==='truecolour',ir=satMetOn&&satProduct==='ir105',cp=satMetOn&&satProduct==='cloudphase';
  satMetBtn.classList.toggle('active',tc);satMetBtn.lastElementChild.textContent=tc?'ON':'OFF';
  satIr105Btn.classList.toggle('active',ir);satIr105Btn.lastElementChild.textContent=ir?'ON':'OFF';
  satCloudPhaseBtn.classList.toggle('active',cp);satCloudPhaseBtn.lastElementChild.textContent=cp?'ON':'OFF';
  satMetInfo.classList.toggle('on',tc);
  satIr105Info.classList.toggle('on',ir);
  satCloudPhaseInfo.classList.toggle('on',cp)
}"""
if old_state not in s:
    raise SystemExit("updateSatProductUi non trovato")
s=s.replace(old_state,new_state,1)

# Click handler.
old_clicks="""satMetBtn.onclick=()=>activateSatProduct('truecolour');
satIr105Btn.onclick=()=>activateSatProduct('ir105');"""
new_clicks="""satMetBtn.onclick=()=>activateSatProduct('truecolour');
satIr105Btn.onclick=()=>activateSatProduct('ir105');
satCloudPhaseBtn.onclick=()=>activateSatProduct('cloudphase');"""
if old_clicks not in s:
    raise SystemExit("handler satellite non trovato")
s=s.replace(old_clicks,new_clicks,1)

for required in ("mtg_fd:rgb_cloudphase","satCloudPhaseBtn","activateSatProduct('cloudphase')",".acc-state{display:none!important}"):
    if required not in s:
        raise SystemExit(f"manca {required}")

p.write_text(s,encoding="utf-8")
print("Cloud Phase RGB integrato e stato accordion nascosto")
