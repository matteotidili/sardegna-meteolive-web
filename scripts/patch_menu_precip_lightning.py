#!/usr/bin/env python3
from pathlib import Path

p=Path("index.html")
s=p.read_text(encoding="utf-8")

old='''    <div class="accordion-item" data-acc-item="precip">
      <button class="accordion-head" type="button" data-acc="precip" aria-expanded="false">
        <span class="acc-title">Precipitazioni e temporali</span><span class="acc-state" id="accPrecipState">OFF</span><span class="acc-chevron">⌄</span>
      </button>
      <div class="accordion-body"><div class="accordion-inner">
        <div class="control-section-label">Radar e pioggia</div>
        <button class="btn" id="radarBtn">Radar DPC <span>OFF</span></button>
        <div class="layer-note" id="radarInfo">SRI · intensità di precipitazione · Radar-DPC v2</div>
        <button class="btn" id="operaBtn">Radar Europa <span>OFF</span></button>
        <div class="layer-note" id="operaInfo"><div id="operaMeta">OPERA NIMBUS · rain rate · mm/h<br>EUMETNET CC BY 4.0 · tiles RadarEU</div></div>
        <button class="btn" id="cumBtn">Cumulate DPC <span>OFF</span></button>
        <div class="layer-note" id="cumInfo">Accumulo precipitazione
          <div class="cum-switch">
            <button class="cumopt" data-cum="off">OFF</button>
            <button class="cumopt" data-cum="cum1">CUM1h</button>
            <button class="cumopt" data-cum="cum3">CUM3h</button>
            <button class="cumopt" data-cum="cum6">CUM6h</button>
            <button class="cumopt" data-cum="cum12">CUM12h</button>
            <button class="cumopt" data-cum="cum24">CUM24h</button>
          </div>
          <div id="cumStamp" style="margin-top:7px"></div>
        </div>
        <div class="control-section-label">Attività elettrica</div>
        <button class="btn" id="lightningBtn">Fulmini <span>OFF</span></button>
        <div class="layer-note" id="lightningInfo">Blitzortung / LightningMaps · LIVE + storico 2 h<div id="lightningMeta" style="margin-top:5px">LIVE realtime · storico MTG LI a passi di 5 min</div></div>
      </div></div>
    </div>
'''
new='''    <div class="accordion-item" data-acc-item="precip">
      <button class="accordion-head" type="button" data-acc="precip" aria-expanded="false">
        <span class="acc-title">Precipitazioni</span><span class="acc-state" id="accPrecipState">OFF</span><span class="acc-chevron">⌄</span>
      </button>
      <div class="accordion-body"><div class="accordion-inner">
        <button class="btn" id="radarBtn">Radar DPC <span>OFF</span></button>
        <div class="layer-note" id="radarInfo">SRI · intensità di precipitazione · Radar-DPC v2</div>
        <button class="btn" id="operaBtn">Radar Europa <span>OFF</span></button>
        <div class="layer-note" id="operaInfo"><div id="operaMeta">OPERA NIMBUS · rain rate · mm/h<br>EUMETNET CC BY 4.0 · tiles RadarEU</div></div>
        <button class="btn" id="cumBtn">Cumulate DPC <span>OFF</span></button>
        <div class="layer-note" id="cumInfo">Accumulo precipitazione
          <div class="cum-switch">
            <button class="cumopt" data-cum="off">OFF</button>
            <button class="cumopt" data-cum="cum1">CUM1h</button>
            <button class="cumopt" data-cum="cum3">CUM3h</button>
            <button class="cumopt" data-cum="cum6">CUM6h</button>
            <button class="cumopt" data-cum="cum12">CUM12h</button>
            <button class="cumopt" data-cum="cum24">CUM24h</button>
          </div>
          <div id="cumStamp" style="margin-top:7px"></div>
        </div>
      </div></div>
    </div>

    <div class="accordion-item" data-acc-item="lightning">
      <button class="accordion-head" type="button" data-acc="lightning" aria-expanded="false">
        <span class="acc-title">Fulmini</span><span class="acc-state" id="accLightningState">OFF</span><span class="acc-chevron">⌄</span>
      </button>
      <div class="accordion-body"><div class="accordion-inner">
        <button class="btn" id="lightningBtn">Fulmini <span>OFF</span></button>
        <div class="layer-note" id="lightningInfo">Blitzortung / LightningMaps · LIVE + storico 2 h<div id="lightningMeta" style="margin-top:5px">LIVE realtime · storico MTG LI a passi di 5 min</div></div>
      </div></div>
    </div>
'''
if old not in s:
    raise SystemExit("blocco precipitazioni originale non trovato")
s=s.replace(old,new,1)

old_sync="""  const nowcastOn=radarOn||operaOn||!!cumActive||lightningOn;
  setAccState('accPrecipState',nowcastOn?'ATTIVO':'OFF',nowcastOn);
  setAccState('accSatelliteState',satMetOn?'ON':'OFF',satMetOn);"""
new_sync="""  const precipOn=radarOn||operaOn||!!cumActive;
  setAccState('accPrecipState',precipOn?'ATTIVO':'OFF',precipOn);
  setAccState('accLightningState',lightningOn?'ATTIVO':'OFF',lightningOn);
  setAccState('accSatelliteState',satMetOn?'ON':'OFF',satMetOn);"""
if old_sync not in s:
    raise SystemExit("sync accordion originale non trovato")
s=s.replace(old_sync,new_sync,1)

for required in ('data-acc-item="lightning"','<span class="acc-title">Precipitazioni</span>','id="accLightningState"'):
    if required not in s:
        raise SystemExit(f"manca {required}")

p.write_text(s,encoding="utf-8")
print("Menu Precipitazioni/Fulmini separato")
