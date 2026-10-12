/* AROME HD: animazione vettoriale del vento a 10 m (U/V, m s-1).
 * Ogni fotogramma segue le linee di corrente del campo alla singola scadenza;
 * la velocità dell'animazione NON rappresenta un tempo reale di trasporto.
 * I dati sono sottocampionati a 0,1° dall'AROME originale a 0,01°.
 */
(function(){
"use strict";
class AROMEWindFlow{
  constructor(map){
    this.map=map;
    this.pane=map.createPane("aromeFlow");
    this.pane.style.zIndex="370"; // sopra il raster AROME, sotto allerta e stazioni
    this.pane.style.pointerEvents="none";
    this.canvas=L.DomUtil.create("canvas","arome-flow-canvas",this.pane);
    Object.assign(this.canvas.style,{position:"absolute",pointerEvents:"none",opacity:".92"});
    this.ctx=this.canvas.getContext("2d",{alpha:true});
    this.data=null;
    this.enabled=false;
    this.animId=0;
    this.lastTick=0;
    this.particles=[];
    this.width=0;this.height=0;
    this.dpr=1;
    this._resize=()=>this.resize();
    this._pause=()=>this.stop();
    this._resume=()=>{this.resize();this.start()};
    map.on("resize moveend zoomend",this._resize);
    map.on("movestart zoomstart",this._pause);
    map.on("moveend zoomend",this._resume);
    this._visibility=()=>{if(document.hidden)this.stop();else this.start()};
    document.addEventListener("visibilitychange",this._visibility);
    this.resize()
  }
  resize(){
    const size=this.map.getSize(),w=Math.max(1,Math.round(size.x)),h=Math.max(1,Math.round(size.y));
    L.DomUtil.setPosition(this.canvas,this.map.containerPointToLayerPoint([0,0]));
    if(w===this.width&&h===this.height)return;
    this.width=w;this.height=h;
    this.dpr=Math.min(window.devicePixelRatio||1,2);
    this.canvas.width=Math.round(w*this.dpr);
    this.canvas.height=Math.round(h*this.dpr);
    this.canvas.style.width=w+"px";
    this.canvas.style.height=h+"px";
    this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    this.particles=[];
  }
  setData(buffer,grid){
    if(!(buffer instanceof ArrayBuffer)||
       grid?.width!==281||grid?.height!==101||
       grid.encoding!=="interleaved_signed_int16_little_endian"||
       buffer.byteLength!==grid.width*grid.height*4){
      throw new Error("Griglia vettoriale AROME non valida")
    }
    // La DataView esplicita l'endianness, anche su architetture non little-endian.
    const view=new DataView(buffer),vector=new Float32Array(grid.width*grid.height*2);
    for(let k=0;k<vector.length;k++){
      const val=view.getInt16(k*2,true);
      vector[k]=val===-32768?NaN:val*.01
    }
    this.data=vector;
    this.particles=[];
    this.resize();
    this.ctx.clearRect(0,0,this.width,this.height);
    this.stop();
    this.start()
  }
  clearData(){
    this.stop();
    this.data=null;
    this.particles=[];
    this.ctx.clearRect(0,0,this.width,this.height)
  }
  setEnabled(on){
    this.enabled=Boolean(on);
    if(!this.enabled){
      this.stop();
      this.canvas.style.display="none";
      this.ctx.clearRect(0,0,this.width,this.height)
    }else{
      this.canvas.style.display="";
      this.start()
    }
  }
  sample(lon,lat){
    if(!this.data||lon< -12||lon>16||lat<37.5||lat>47.5)return null;
    const gx=(lon+12)*10,gy=(47.5-lat)*10;
    const x=Math.min(279,Math.floor(gx)),y=Math.min(99,Math.floor(gy));
    const tx=Math.min(1,Math.max(0,gx-x)),ty=Math.min(1,Math.max(0,gy-y));
    const width=281,vec=this.data;
    const corners=[(y*width+x)*2,(y*width+x+1)*2,((y+1)*width+x)*2,((y+1)*width+x+1)*2];
    if(corners.some(i=>!Number.isFinite(vec[i])||!Number.isFinite(vec[i+1])))return null;
    const w=[(1-tx)*(1-ty),tx*(1-ty),(1-tx)*ty,tx*ty];
    let u=0,v=0;
    for(let n=0;n<4;n++){u+=vec[corners[n]]*w[n];v+=vec[corners[n]+1]*w[n]}
    return [u,v]
  }
  spawn(){
    const bounds=this.map.getBounds();
    const west=Math.max(-12,bounds.getWest()),east=Math.min(16,bounds.getEast());
    const south=Math.max(37.5,bounds.getSouth()),north=Math.min(47.5,bounds.getNorth());
    if(east<=west||north<=south)return null;
    for(let n=0;n<20;n++){
      const lon=west+Math.random()*(east-west),lat=south+Math.random()*(north-south);
      const uv=this.sample(lon,lat);
      if(uv&&Math.hypot(...uv)>0.5)return {lon,lat,age:0,life:42+Math.random()*68}
    }
    return null
  }
  start(){
    if(!this.enabled||!this.data||document.hidden||this.animId)return;
    this.resize();
    this.lastTick=0;
    this.animId=requestAnimationFrame(time=>this.draw(time))
  }
  stop(){
    if(this.animId)cancelAnimationFrame(this.animId);
    this.animId=0;
    this.lastTick=0
  }
  draw(time){
    this.animId=0;
    if(!this.enabled||!this.data||document.hidden)return;
    this.animId=requestAnimationFrame(t=>this.draw(t));
    if(this.lastTick&&time-this.lastTick<32)return;
    this.lastTick=time;
    const ctx=this.ctx;
    ctx.globalCompositeOperation="destination-in";
    ctx.fillStyle="rgba(0,0,0,0.915)";
    ctx.fillRect(0,0,this.width,this.height);
    ctx.globalCompositeOperation="source-over";
    ctx.lineWidth=1.25;
    ctx.lineCap="round";
    ctx.strokeStyle="rgba(247,252,255,.8)";
    ctx.shadowColor="rgba(0,16,27,.8)";
    ctx.shadowBlur=1.6;
    const target=window.innerWidth<=800?130:330;
    if(this.particles.length>target)this.particles.length=target;
    while(this.particles.length<target){
      const p=this.spawn();
      if(!p)break;
      this.particles.push(p)
    }
    let drawn=0;
    for(let n=0;n<this.particles.length;n++){
      const p=this.particles[n],uv=this.sample(p.lon,p.lat);
      if(!uv||Math.hypot(...uv)<.5||p.age>=p.life){
        this.particles[n]=this.spawn();
        continue
      }
      const point=this.map.latLngToContainerPoint([p.lat,p.lon]);
      // I valori U/V (m/s) forniscono la direzione; un passo temporale
      // illustrativo viene limitato a 3 px per fotogramma sul display.
      const seconds=500;
      let dLat=uv[1]*seconds/111320;
      let dLon=uv[0]*seconds/(111320*Math.max(.2,Math.cos(p.lat*Math.PI/180)));
      const endPoint=this.map.latLngToContainerPoint([p.lat+dLat,p.lon+dLon]);
      const distance=Math.hypot(endPoint.x-point.x,endPoint.y-point.y);
      const factor=Math.min(1,3.2/Math.max(.01,distance));
      dLat*=factor;
      dLon*=factor;
      const lon=p.lon+dLon,lat=p.lat+dLat;
      const next=this.map.latLngToContainerPoint([lat,lon]);
      if(point.x>=-4&&point.x<=this.width+4&&point.y>=-4&&point.y<=this.height+4){
        ctx.beginPath();
        ctx.moveTo(point.x,point.y);
        ctx.lineTo(next.x,next.y);
        ctx.stroke();
        drawn++
      }
      p.lon=lon;p.lat=lat;p.age+=1;
      if(lon< -12||lon>16||lat<37.5||lat>47.5)this.particles[n]=this.spawn()
    }
    ctx.shadowBlur=0;
  }
  destroy(){
    this.setEnabled(false);
    this.map.off("resize moveend zoomend",this._resize);
    this.map.off("movestart zoomstart",this._pause);
    this.map.off("moveend zoomend",this._resume);
    document.removeEventListener("visibilitychange",this._visibility);
    this.canvas.remove()
  }
}
window.AROMEWindFlow=AROMEWindFlow
})();
