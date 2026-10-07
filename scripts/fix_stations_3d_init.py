#!/usr/bin/env python3
from pathlib import Path

p=Path("index.html")
s=p.read_text(encoding="utf-8")

old="""  map3d.on('load',()=>{
    try{
      if(!map3d.getSource('terrain-3d')){
        map3d.addSource('terrain-3d',{type:'raster-dem',url:'https://tiles.mapterhorn.com/tilejson.json'});
        map3d.addSource('hillshade-3d',{type:'raster-dem',url:'https://tiles.mapterhorn.com/tilejson.json'});
        map3d.setTerrain({source:'terrain-3d',exaggeration:1.08});
      }
      const layers=map3d.getStyle().layers||[];
      const firstSymbol=(layers.find(l=>l.type==='symbol')||{}).id;
      if(!map3d.getLayer('terrain-hillshade')){
        map3d.addLayer({
          id:'terrain-hillshade',type:'hillshade',source:'hillshade-3d',
          paint:{
            'hillshade-exaggeration':.45,
            'hillshade-shadow-color':'#26323a',
            'hillshade-highlight-color':'#f4f0e8',
            'hillshade-accent-color':'#596b72'
          }
        },firstSymbol)
      }
      let buildingSource='openmaptiles';
      if(!map3d.getSource(buildingSource)){
        buildingSource='openfreemap-3d';
        map3d.addSource(buildingSource,{url:'https://tiles.openfreemap.org/planet',type:'vector'})
      }
      if(!map3d.getLayer('3d-buildings')){
        map3d.addLayer({
          id:'3d-buildings',source:buildingSource,'source-layer':'building',type:'fill-extrusion',minzoom:15,
          filter:['!=',['get','hide_3d'],true],
          paint:{
            'fill-extrusion-color':'#d8d8d8',
            'fill-extrusion-height':['interpolate',['linear'],['zoom'],15,0,16,['coalesce',['get','render_height'],0]],
            'fill-extrusion-base':['coalesce',['get','render_min_height'],0],
            'fill-extrusion-opacity':.72
          }
        },firstSymbol)
      }
      ensure3dDataLayers()
    }catch(e){console.warn('3D init',e)}
  });"""

new="""  map3d.on('load',()=>{
    try{
      if(!map3d.getSource('terrain-3d')){
        map3d.addSource('terrain-3d',{type:'raster-dem',url:'https://tiles.mapterhorn.com/tilejson.json'});
        map3d.addSource('hillshade-3d',{type:'raster-dem',url:'https://tiles.mapterhorn.com/tilejson.json'});
        map3d.setTerrain({source:'terrain-3d',exaggeration:1.08});
      }
      const layers=map3d.getStyle().layers||[];
      const firstSymbol=(layers.find(l=>l.type==='symbol')||{}).id;
      if(!map3d.getLayer('terrain-hillshade')){
        map3d.addLayer({
          id:'terrain-hillshade',type:'hillshade',source:'hillshade-3d',
          paint:{
            'hillshade-exaggeration':.45,
            'hillshade-shadow-color':'#26323a',
            'hillshade-highlight-color':'#f4f0e8',
            'hillshade-accent-color':'#596b72'
          }
        },firstSymbol)
      }
      let buildingSource='openmaptiles';
      if(!map3d.getSource(buildingSource)){
        buildingSource='openfreemap-3d';
        map3d.addSource(buildingSource,{url:'https://tiles.openfreemap.org/planet',type:'vector'})
      }
      if(!map3d.getLayer('3d-buildings')){
        map3d.addLayer({
          id:'3d-buildings',source:buildingSource,'source-layer':'building',type:'fill-extrusion',minzoom:15,
          filter:['!=',['get','hide_3d'],true],
          paint:{
            'fill-extrusion-color':'#d8d8d8',
            'fill-extrusion-height':['interpolate',['linear'],['zoom'],15,0,16,['coalesce',['get','render_height'],0]],
            'fill-extrusion-base':['coalesce',['get','render_min_height'],0],
            'fill-extrusion-opacity':.72
          }
        },firstSymbol)
      }
    }catch(e){console.warn('3D terrain/buildings init',e)}

    // Gli overlay operativi non devono dipendere dal successo di terreno/edifici.
    try{ensure3dDataLayers()}catch(e){console.warn('3D data layers init',e)}

    // Secondo tentativo a stile completamente assestato.
    map3d.once('idle',()=>{
      try{ensure3dDataLayers()}catch(e){console.warn('3D data layers idle',e)}
    })
  });"""

if old not in s:
    raise SystemExit("blocco map3d load non trovato")
s=s.replace(old,new,1)

old_enter="""  if(m.isStyleLoaded())ensure3dDataLayers();
  schedule3dPrecipSync(80);
  const status=document.getElementById('status');"""
new_enter="""  if(m.isStyleLoaded())ensure3dDataLayers();
  setTimeout(()=>{if(mode3d&&map3d?.isStyleLoaded())ensure3dDataLayers()},250);
  setTimeout(()=>{if(mode3d&&map3d?.isStyleLoaded())ensure3dDataLayers()},900);
  schedule3dPrecipSync(80);
  const status=document.getElementById('status');"""
if old_enter not in s:
    raise SystemExit("enter3d non trovato")
s=s.replace(old_enter,new_enter,1)

# Add a deterministic visible-count diagnostic to the 3D status after update.
old_update="""  map3d.getSource('stations-3d').setData(fc(features));
  raise3dOperationalLayers()
}"""
new_update="""  map3d.getSource('stations-3d').setData(fc(features));
  raise3dOperationalLayers();
  if(mode3d){
    const status=document.getElementById('status');
    if(status)status.textContent='Vista 3D · '+features.length+' stazioni · '+P[cur].n+' · precipitazioni e fulmini compatibili'
  }
}"""
if old_update not in s:
    raise SystemExit("update3dStations footer non trovato")
s=s.replace(old_update,new_update,1)

for required in (
  "3D data layers init",
  "map3d.once('idle'",
  "setTimeout(()=>{if(mode3d&&map3d?.isStyleLoaded())ensure3dDataLayers()},250)",
  "features.length+' stazioni ·"
):
    if required not in s:
        raise SystemExit(f"manca {required}")

p.write_text(s,encoding="utf-8")
print("Inizializzazione stazioni 3D resa indipendente e ridondante")
