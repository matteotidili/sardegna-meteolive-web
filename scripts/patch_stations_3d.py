#!/usr/bin/env python3
from pathlib import Path

p=Path("index.html")
s=p.read_text(encoding="utf-8")

old="""    map3d.addLayer({
      id:'stations-3d-points',type:'circle',source:'stations-3d',
      paint:{
        'circle-radius':['interpolate',['linear'],['zoom'],6,5.5,10,7,14,9],
        'circle-color':['get','color'],
        'circle-stroke-color':'#07111d','circle-stroke-width':1.4,'circle-opacity':.96
      }
    });
    map3d.addLayer({
      id:'stations-3d-labels',type:'symbol',source:'stations-3d',minzoom:7,
      layout:{
        'text-field':['get','label'],'text-size':10,'text-offset':[0,-1.25],
        'text-anchor':'bottom','text-allow-overlap':false,'text-ignore-placement':false
      },
      paint:{'text-color':'#061018','text-halo-color':'rgba(255,255,255,.9)','text-halo-width':1.2}
    });"""
new="""    map3d.addLayer({
      id:'stations-3d-points',type:'circle',source:'stations-3d',
      paint:{
        'circle-radius':['interpolate',['linear'],['zoom'],6,6.5,10,8.5,14,11],
        'circle-color':['get','color'],
        'circle-stroke-color':'#ffffff',
        'circle-stroke-width':['interpolate',['linear'],['zoom'],6,1.6,10,2.1,14,2.6],
        'circle-opacity':.98,
        'circle-stroke-opacity':.96
      }
    });
    map3d.addLayer({
      id:'stations-3d-labels',type:'symbol',source:'stations-3d',minzoom:6.3,
      layout:{
        'text-field':['get','label3d'],
        'text-size':['interpolate',['linear'],['zoom'],6.3,9,9,10.5,13,12],
        'text-offset':[0,-1.45],
        'text-anchor':'bottom',
        'text-line-height':1.05,
        'text-allow-overlap':false,
        'text-ignore-placement':false
      },
      paint:{
        'text-color':'#07111d',
        'text-halo-color':'rgba(255,255,255,.96)',
        'text-halo-width':1.8,
        'text-halo-blur':.2
      }
    });"""
if old not in s:
    raise SystemExit("blocco stazioni 3D non trovato")
s=s.replace(old,new,1)

old_props="""      name:s.name||'Stazione',
      net:s.network==='wunderground'?'Weather Underground':s.network==='aeronautica-militare'?'Aeronautica Militare':'DPCN Sardegna',
      param:P[cur].n,label:fmt(s[cur],cur,s),color:col(s[cur],P[cur].st)"""
new_props="""      name:s.name||'Stazione',
      net:s.network==='wunderground'?'Weather Underground':s.network==='aeronautica-militare'?'Aeronautica Militare':'DPCN Sardegna',
      param:P[cur].n,
      label:fmt(s[cur],cur,s),
      label3d:(s.name||'Stazione')+'\n'+fmt(s[cur],cur,s),
      color:col(s[cur],P[cur].st)"""
if old_props not in s:
    raise SystemExit("properties stazioni 3D non trovate")
s=s.replace(old_props,new_props,1)

anchor="""function hide3dPrecipLayer(id){
  if(map3d?.getLayer(id))map3d.setLayoutProperty(id,'visibility','none')
}"""
insert=anchor+"""
function raise3dOperationalLayers(){
  if(!map3d||!map3d.isStyleLoaded())return;
  for(const id of ['stations-3d-points','stations-3d-labels','lightning-3d-points']){
    if(map3d.getLayer(id)){
      try{map3d.moveLayer(id)}catch(e){}
    }
  }
}"""
if anchor not in s:
    raise SystemExit("anchor raise overlays non trovato")
s=s.replace(anchor,insert,1)

# Ensure overlays are raised after precip sync paths.
old_sync="""  if(operaOn&&operaFrames[operaIndex]){
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
}"""
new_sync="""  if(operaOn&&operaFrames[operaIndex]){
    if(ensure3dOperaLayer(operaFrames[operaIndex])){
      map3d.setLayoutProperty('opera-radar-3d-layer','visibility','visible')
    }
    raise3dOperationalLayers();
    return
  }
  if(radarOn&&radarFrames[radarIndex]){
    update3dDpcLayer('SRI',radarFrames[radarIndex],.92);
    raise3dOperationalLayers();
    return
  }
  if(cumActive&&cumLayer?._productKey&&cumLayer?._frame){
    update3dDpcLayer(cumLayer._productKey,cumLayer._frame,.88)
  }
  raise3dOperationalLayers()
}"""
if old_sync not in s:
    raise SystemExit("sync3dPrecipLayers non trovato")
s=s.replace(old_sync,new_sync,1)

# Raise after station data refresh too.
old_update="""  map3d.getSource('stations-3d').setData(fc(features))
}"""
new_update="""  map3d.getSource('stations-3d').setData(fc(features));
  raise3dOperationalLayers()
}"""
if old_update not in s:
    raise SystemExit("update3dStations finale non trovato")
s=s.replace(old_update,new_update,1)

for required in ("label3d:","function raise3dOperationalLayers","circle-stroke-color':'#ffffff'","minzoom:6.3"):
    if required not in s:
        raise SystemExit(f"manca {required}")

p.write_text(s,encoding="utf-8")
print("Rete stazioni 3D resa più evidente e portata sopra radar/cumulate")
