const { chromium }=require('playwright-core');
(async()=>{
 const executablePath=process.env.CHROME_PATH||'/usr/bin/google-chrome';
 const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1365,height:900},ignoreHTTPSErrors:false});
 const errors=[],failed=[],logs=[];
 page.on('pageerror',e=>errors.push('PAGEERROR '+e.message+' '+e.stack?.slice(0,400)));
 page.on('console',m=>{if(m.type()==='error')logs.push(m.text().slice(0,280))});
 page.on('requestfailed',r=>{if(failed.length<30)failed.push(r.url().slice(0,130)+' '+r.failure()?.errorText)});
 const url='https://matteotidili.github.io/sardegna-meteolive-web/?test='+Date.now();
 try{const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});console.log('NAV',response?.status());}
 catch(e){console.log('NAV ERROR',e.message)}
 await page.waitForTimeout(3200);
 // All controls are in the second sidebar tab (hidden until explicitly opened).
 await page.locator('#controlsTab').click({timeout:10000});
 await page.waitForTimeout(250);
 console.log('INIT',JSON.stringify(await page.evaluate(()=>({
  map:!!document.querySelector('#map .leaflet-container'),
  leaflet:typeof window.L,
  panels:document.querySelectorAll('[data-acc-item]').length,
  status:document.querySelector('#status')?.textContent,
  subregions:document.querySelector('#subregionsBtn')?.textContent,
  controls:document.querySelectorAll('#radarBtn,#lightningBtn,#satMetBtn,#frpBtn,#meteoalarmBtn').length,
  leafletImgs:document.querySelectorAll('.leaflet-tile-loaded').length,
  ready:document.readyState
 }))));
 const tests=[
  ['base','boundariesBtn'],
  ['base','subregionsBtn'],
  ['precip','radarBtn'],
  ['forecast','aromeBtn'],
  ['precip','operaBtn'],
  ['satellite','satMetBtn'],
  ['satellite','satIr105Btn'],
  ['fires','frpBtn'],
  ['lightning','lightningBtn'],
  ['alerts','meteoalarmBtn']
 ];
 for(const [accordion,id] of tests){
  try{
   const head=page.locator('[data-acc="'+accordion+'"]');
   if((await head.getAttribute('aria-expanded'))!=='true')await head.click({timeout:5000});
   const button=page.locator('#'+id);
   const before=(await button.innerText()).replace(/\s+/g,' ').slice(0,90);
   if(await button.isDisabled()){console.log('TEST '+id+' DISABLED '+before);continue}
   await button.click({timeout:7000});
   await page.waitForTimeout(id==='aromeBtn'?4300:850);
   if(id==='aromeBtn'){
    const ar=await page.evaluate(()=>{
     const img=Array.from(document.querySelectorAll('.leaflet-weather-pane img')).find(x=>x.src.includes('data/arome/precip_h'));
     return {overlayOn:!!img,imageWidth:img?.naturalWidth,imageHeight:img?.naturalHeight,
       sliderMax:document.getElementById('aromeRange')?.max,
       forecastStamp:document.getElementById('aromeInfoStatus')?.textContent,
       mapMinZoom:typeof map!=='undefined'?map.getMinZoom():null,
       forecastMenuActive:document.getElementById('accAromeState')?.textContent,
       modelVisible:document.getElementById('aromeTimeline')?.classList.contains('on')};
    });
    console.log('AROME',JSON.stringify(ar));
    if(!ar.overlayOn||ar.imageWidth<250||!ar.modelVisible||Number(ar.sliderMax)<8||ar.mapMinZoom!==3||ar.forecastMenuActive!=='ATTIVO')process.exitCode=1;
   }
   const after=(await button.innerText()).replace(/\s+/g,' ').slice(0,90);
   const css=await button.evaluate(el=>({active:el.classList.contains('active'),display:getComputedStyle(el).display,visibility:getComputedStyle(el).visibility}));
   const status=await page.locator('#status').innerText();
   console.log('TEST '+id+' '+JSON.stringify({before,after,css,status:status.slice(0,140),newPageErrors:errors.slice(-2)}));
   if(after.includes('ON'))await button.click({timeout:5000}).catch(()=>{});
  }catch(e){console.log('TEST '+id+' ERROR '+e.message.slice(0,300))}
 }
 console.log('PAGEERRORS',JSON.stringify(errors.slice(0,30)));
 console.log('CONSOLEERRORS',JSON.stringify(logs.slice(0,20)));
 console.log('REQUESTFAILED',JSON.stringify(failed.slice(0,25)));
 // Verifica responsiva: il layer AROME deve essere disponibile su mobile senza menu invasivi.
 const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const mobileErrors=[];
 mobile.on('pageerror',e=>mobileErrors.push(e.message));
 try{
  await mobile.goto('https://matteotidili.github.io/sardegna-meteolive-web/?mobile-arome='+Date.now(),{waitUntil:'domcontentloaded',timeout:45000});
  await mobile.waitForTimeout(2100);
  // GitHub Pages può pubblicare dopo l'avvio del test: attendi il codice corrente.
  for(let retry=0;retry<4;retry++){
   const fresh=await mobile.evaluate(()=>!!document.querySelector('[data-acc="forecast"]'));
   if(fresh)break;
   console.log('MOBILE WAIT DEPLOY '+retry);
   await mobile.waitForTimeout(12000);
   await mobile.reload({waitUntil:'domcontentloaded',timeout:35000});
  }
  await mobile.locator('#mobileMenu').click({timeout:10000});
  await mobile.locator('#controlsTab').click({timeout:10000});
  const forecast=mobile.locator('[data-acc="forecast"]');
  if((await forecast.getAttribute('aria-expanded'))!=='true')await forecast.click({timeout:5000});
  await mobile.locator('#aromeBtn').click({timeout:10000});
  await mobile.waitForTimeout(3600);
  const state=await mobile.evaluate(()=>{
   const img=Array.from(document.querySelectorAll('.leaflet-weather-pane img')).find(x=>x.src.includes('precip_h'));
   return {menuClosed:!document.querySelector('.panel.left').classList.contains('open'),
     viewportWidth:window.innerWidth,
     codeFresh:!!document.querySelector('[data-acc="forecast"]'),
     imageWidth:img?.naturalWidth||0,forecastInfo:document.getElementById('aromeInfoStatus').textContent,
     timelineVisible:document.getElementById('aromeTimeline').classList.contains('on')};
  });
  console.log('MOBILE AROME',JSON.stringify({state,mobileErrors}));
  if(!state.menuClosed||state.imageWidth<250||!state.timelineVisible||mobileErrors.length)process.exitCode=1;
 }catch(e){console.log('MOBILE ERROR',e.message.slice(0,600));process.exitCode=1}
 await mobile.close();
 await browser.close();
})().catch(e=>{console.log('FATAL',e.stack);process.exitCode=1});
