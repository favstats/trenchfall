/* save/load round-trip: play, trigger the mode's save, reload, resume, verify.
   Usage: TF_PORT=5181 node scripts/saveload-test.mjs [camp|bast|wand] */
import {chromium} from 'playwright';
const mode=process.argv[2]||'wand';
const errors=[];
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:320,height:180}});
page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
page.on('pageerror',e=>errors.push('pageerror: '+e.message));
await page.addInitScript(m=>{
  const key={camp:'tlr_save',bast:'tlr_bastion_run',wand:'tlr_wander'}[m];
  if(!localStorage.getItem('__sl_cleared')){localStorage.setItem('__sl_cleared','1');
    localStorage.removeItem(key);
    if(m==='bast')localStorage.setItem('tlr_bast_pace','relent');}
},mode);

const url='http://127.0.0.1:'+(process.env.TF_PORT||'5181')+'/';
await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForSelector('#startBtn',{timeout:60000});
await page.waitForTimeout(3000);
const btn={camp:'#startBtn',bast:'#bastBtn',wand:'#wandBtn'}[mode];
await page.$eval(btn,el=>el.click());
await page.waitForTimeout(6000);

let saved=null;
if(mode==='wand'){
  await page.evaluate(()=>{window.G.scrap=77;
    window.TERRAIN.geometry.computeBoundingBox();
    const half=window.TERRAIN.geometry.boundingBox.max.x; // custom BufferGeometry — no parameters
    window.PLAYER.x=half-4.5;window.PLAYER.z=0;});
  for(let i=0;i<24&&!saved;i++){
    await page.waitForTimeout(5000);
    saved=await page.evaluate(()=>{try{return JSON.parse(localStorage.getItem('tlr_wander'));}catch(e){return null;}});
  }
  console.log('saved:',saved?JSON.stringify({region:saved.region,scrap:saved.p&&saved.p.scrap}):'NONE');
  if(!saved||saved.region!==2||!saved.p||saved.p.scrap!==77)errors.push('SAVE MISMATCH: '+JSON.stringify(saved&&{region:saved.region,scrap:saved.p&&saved.p.scrap}));
}else if(mode==='bast'){
  for(let i=0;i<48&&!saved;i++){
    await page.waitForTimeout(5000);
    saved=await page.evaluate(()=>{try{return JSON.parse(localStorage.getItem('tlr_bastion_run'));}catch(e){return null;}});
  }
  console.log('saved:',saved?JSON.stringify({wave:saved.wave,fort:saved.fort}):'NONE');
  if(!saved||!(saved.wave>=1))errors.push('SAVE MISSING/EARLY: '+JSON.stringify(saved&&{wave:saved.wave}));
}else{ // camp saves on start
  saved=await page.evaluate(()=>{try{return JSON.parse(localStorage.getItem('tlr_save'));}catch(e){return null;}});
  console.log('saved:',saved?JSON.stringify({leg:saved.leg,act:saved.act}):'NONE');
  if(!saved||!saved.leg)errors.push('SAVE MISSING: '+JSON.stringify(saved));
}

// round trip: reload the page and resume from the menu
await page.reload({waitUntil:'domcontentloaded'});
await page.waitForSelector('#startBtn',{timeout:60000});
await page.waitForTimeout(3000);
const cont={camp:'#contBtn',bast:'#contB',wand:'#contW'}[mode];
const visible=await page.$eval(cont,el=>el.offsetParent!==null||getComputedStyle(el).display!=='none').catch(()=>false);
console.log('resume button visible:',visible);
if(!visible)errors.push('RESUME BUTTON HIDDEN: '+cont);
else{
  await page.$eval(cont,el=>el.click());
  await page.waitForTimeout(10000);
  const after=await page.evaluate(m2=>{
    const fin=v=>Number.isFinite(v);
    const base={state:window.G.state,pFinite:fin(window.PLAYER.x)&&fin(window.PLAYER.hp)};
    if(m2==='wand')return {...base,region:window.WANDER.region,scrap:window.G.scrap,on:window.WANDER.on};
    if(m2==='bast')return {...base,wave:window.BAST.wave,on:window.BAST.on};
    return {...base,leg:window.CAMP.leg,on:window.CAMP.on};
  },mode);
  console.log('after resume:',JSON.stringify(after));
  if(!after.on||!after.pFinite)errors.push('RESUME BROKEN: '+JSON.stringify(after));
  if(mode==='wand'&&(after.region!==2||after.scrap!==77))errors.push('WANDER STATE LOST: '+JSON.stringify(after));
  if(mode==='bast'&&saved&&after.wave!==saved.wave)errors.push('BASTION WAVE LOST: saved '+saved.wave+' got '+after.wave);
}
await page.evaluate(()=>localStorage.removeItem('__sl_cleared')).catch(()=>{});
const real=errors.filter(e=>!e.includes('pointer lock'));
console.log('ERRORS('+mode+'):',real.length?real.slice(0,15):'none');
await browser.close();
process.exit(real.length?1:0);
