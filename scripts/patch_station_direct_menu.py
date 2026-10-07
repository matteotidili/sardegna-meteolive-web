#!/usr/bin/env python3
from pathlib import Path

p=Path("index.html")
s=p.read_text(encoding="utf-8")

# CSS per la voce diretta Rete stazioni.
anchor=".control-guide{margin:0 0 8px;padding:9px 10px;border:1px solid #dbe5ea;border-radius:9px;background:#f5f8fa;color:#587080;font-size:9px;line-height:1.4}"
insert=anchor+"""
.direct-layer-toggle{margin:0 0 4px!important;min-height:42px!important;border:1px solid #22394d!important;border-radius:12px!important;background:#0d1b29!important;color:#d8e6f2!important;padding:9px 10px!important;font-size:9px!important;font-weight:950!important;letter-spacing:.09em!important;text-transform:uppercase!important}
.direct-layer-toggle:hover{background:#112536!important}
.direct-layer-toggle.active{background:#102b39!important;border-color:#2a5367!important;color:#fff!important}
.direct-layer-toggle>span{font-size:8px;font-weight:900;letter-spacing:.04em}
.direct-layer-counter{margin:0 7px 8px!important;padding:0 2px;color:#7890a4}
"""
if anchor not in s:
    raise SystemExit("control-guide CSS non trovato")
s=s.replace(anchor,insert,1)

# Inserisce Rete stazioni come controllo diretto subito sotto la guida.
old_guide='''    <div class="control-guide">Apri una sezione e attiva solo i layer che ti servono. Le informazioni di dettaglio compaiono direttamente sulla mappa.</div>

    <div class="accordion-item" data-acc-item="precip">'''
new_guide='''    <div class="control-guide">Apri una sezione e attiva solo i layer che ti servono. Le informazioni di dettaglio compaiono direttamente sulla mappa.</div>

    <button class="btn direct-layer-toggle active" id="stationsBtn">Rete stazioni <span>ON</span></button>
    <div id="counter" class="counter direct-layer-counter">Caricamento dati…</div>

    <div class="accordion-item" data-acc-item="precip">'''
if old_guide not in s:
    raise SystemExit("punto inserimento Layer meteo non trovato")
s=s.replace(old_guide,new_guide,1)

# Rimuove il controllo duplicato da Mappa e visualizzazione.
old_base='''        <div class="control-section-label">Elementi sulla mappa</div>
        <button class="btn active" id="stationsBtn">Rete stazioni <span>ON</span></button>
        <div id="counter" class="counter">Caricamento dati…</div>
        <button class="btn active" id="boundariesBtn">Confini amministrativi <span>ON</span></button>'''
new_base='''        <div class="control-section-label">Elementi sulla mappa</div>
        <button class="btn active" id="boundariesBtn">Confini amministrativi <span>ON</span></button>'''
if old_base not in s:
    raise SystemExit("controllo stazioni duplicato non trovato")
s=s.replace(old_base,new_base,1)

if s.count('id="stationsBtn"') != 1:
    raise SystemExit("stationsBtn duplicato o mancante")
if s.count('id="counter"') != 1:
    raise SystemExit("counter duplicato o mancante")
if "direct-layer-toggle" not in s:
    raise SystemExit("stile diretto mancante")

p.write_text(s,encoding="utf-8")
print("Rete stazioni spostata come controllo diretto")
