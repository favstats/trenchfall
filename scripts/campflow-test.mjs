/* campaign flow: prologue fall -> roll out -> drive -> camp night sequence ->
   next leg -> final siege -> victory screen. Real user paths where possible,
   dev accelerators where the clock is the only obstacle.
   Usage: TF_PORT=5181 node scripts/campflow-test.mjs */
import {chromium} from 'playwright';
const errors=[];
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:320,height:180}});
page.on('pageerror',e=>errors.push('pageerror: '+e.message));
page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
const state=()=>page.evaluate(()=>({mode:window.CAMP.mode,leg:window.CAMP.leg,
  crates:window.CAMP.crates,souls:window.CAMP.comps.filter(c=>c.alive).length,
  hp:Math.round(window.PLAYER.hp)}));

await page.goto('http://127.0.0.1:'+(process.env.TF_PORT||'5181')+'/',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForSelector('#startBtn',{timeout:60000});
await page.waitForTimeout(3000);
await page.$eval('#startBtn',el=>el.click());
for(let i=0;i<30;i++){ // the muster roll reads every name before the fall begins
  await page.waitForTimeout(2000);
  const m=await page.evaluate(()=>window.CAMP.mode);
  if(m==='fall')break;
}
console.log('after start:',JSON.stringify(await state()));

// 1. prologue: let the loaders finish instantly, walk to the lead truck, say roll
await page.evaluate(()=>{window.CAMP.holdT=85;window.ZOMBIES.length=0;});
await page.waitForTimeout(2500);
await page.evaluate(()=>{const t=window.leadTruck();window.PLAYER.x=t.x+1.5;window.PLAYER.z=t.mesh.position.z+1.5;});
await page.waitForTimeout(600);
await page.keyboard.press('e');
await page.waitForTimeout(1500);
const dlgUp=await page.$eval('#dlg',el=>el.classList.contains('on')).catch(()=>false);
console.log('driver dialog up:',dlgUp);
if(!dlgUp)errors.push('DRIVER TALK NEVER OPENED');
else await page.$eval('#dlgC .choice',el=>el.click()); // Roll out. Now.
await page.waitForTimeout(2500);
let s=await state();
console.log('after roll out:',JSON.stringify(s));
if(s.mode!=='drive'&&s.mode!=='event')errors.push('ROLL OUT DID NOT REACH DRIVE: '+s.mode); // an event card right out of the gate is legal road life
if(s.mode==='event'){ // answer the card so the column can move
  await page.waitForTimeout(2500);
  await page.evaluate(()=>{const c=document.querySelector('#dlgC .choice');if(c)c.click();});
  await page.waitForTimeout(2000);
}

// 2. a leg ends: arrive at camp, click through the night (bury/report/shop/route)
for(let leg=0;leg<2;leg++){
  await page.evaluate(()=>window.arriveCamp());
  await page.waitForTimeout(1500);
  for(let i=0;i<14;i++){
    const info=await page.evaluate(()=>{
      const camp=document.getElementById('camp');
      if(!camp.classList.contains('show'))return {open:false,mode:window.CAMP.mode};
      const t=document.getElementById('campTitle').textContent;
      const ch=document.querySelectorAll('#campChoices .choice');
      if(ch.length)ch[ch.length-1].click(); // last choice = usually "move on"
      return {open:true,title:t,choices:ch.length};
    });
    console.log('  camp step:',JSON.stringify(info));
    if(!info.open)break;
    await page.waitForTimeout(1200);
  }
  s=await state();
  console.log('after camp night '+(leg+1)+':',JSON.stringify(s));
  if(s.mode==='camp')errors.push('STUCK IN CAMP SEQUENCE at leg '+s.leg);
  if(s.mode==='route'){ // pick a road on the map
    const picked=await page.evaluate(()=>{
      const b=document.querySelectorAll('#nodeBtns .nodeBtn');
      if(!b.length)return 0;b[0].click();return b.length;
    });
    await page.waitForTimeout(2500);
    s=await state();
    console.log('route picked ('+picked+' options) ->',JSON.stringify(s));
    if(s.mode!=='drive'&&s.mode!=='siege')errors.push('ROUTE PICK DID NOT BEGIN LEG: '+s.mode);
  }
  await page.waitForTimeout(2000);
}

// 3. the last mile: jump to the eve of the siege, take the final route
await page.evaluate(()=>{window.CAMP.leg=window.CAMP.legCount-1;window.arriveCamp();});
await page.waitForTimeout(1500);
for(let i=0;i<14;i++){
  const open=await page.evaluate(()=>{
    const camp=document.getElementById('camp');
    if(!camp.classList.contains('show'))return false;
    const ch=document.querySelectorAll('#campChoices .choice');
    if(ch.length)ch[ch.length-1].click();
    return true;
  });
  if(!open)break;
  await page.waitForTimeout(1200);
}
await page.evaluate(()=>{const b=document.querySelectorAll('#nodeBtns .nodeBtn');if(b.length)b[0].click();});
await page.waitForTimeout(3000);
s=await state();
console.log('final leg state:',JSON.stringify(s));
if(s.mode!=='siege')errors.push('FINAL LEG DID NOT REACH SIEGE: '+JSON.stringify(s));
await page.waitForTimeout(15000); // hold the line a moment: siege update must not throw
s=await state();
console.log('siege holding:',JSON.stringify(s));

// 4. the end of the road
await page.evaluate(()=>window.winCampaign());
await page.waitForTimeout(4000);
const end=await page.evaluate(()=>({over:document.getElementById('gameover').classList.contains('show'),
  title:(document.querySelector('#gameover h1')||{}).textContent||null,state:window.G.state}));
console.log('victory screen:',JSON.stringify(end));
if(!end.over)errors.push('NO VICTORY SCREEN: '+JSON.stringify(end));

const real=errors.filter(e=>!e.includes('pointer lock'));
console.log('ERRORS:',real.length?real.slice(0,15):'none');
await browser.close();
process.exit(real.length?1:0);
