/* iteration harness: deep bastion wave soak (relentless pace), command net
   orders in bastion + wander, sandbox mode (never saves, arsenal, spawns).
   Usage: TF_PORT=5181 node scripts/bastnet-test.mjs */
import {chromium} from 'playwright';
const errors=[];
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:320,height:180}});
page.on('pageerror',e=>errors.push('pageerror: '+e.message));
page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
await page.addInitScript(()=>{localStorage.setItem('tlr_bast_pace','relent');
  localStorage.removeItem('tlr_bastion_run');});
const url='http://127.0.0.1:'+(process.env.TF_PORT||'5181')+'/';
const boot=async(btn)=>{
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('#startBtn',{timeout:60000});
  await page.waitForTimeout(3000);
  if(btn)await page.$eval(btn,el=>el.click());
  await page.waitForTimeout(5000);
};

/* A. bastion: hold the wall for several relentless waves */
await boot('#bastBtn');
let last={wave:0};
for(let i=0;i<40;i++){
  await page.waitForTimeout(5000);
  last=await page.evaluate(()=>{
    if(window.PLAYER.hp<400)window.PLAYER.hp=500; // the wall holds; we watch the machinery
    // headless sim runs ~0.2x real: burn the spawn budget and the relent clock
    if(window.BAST.wave>0){window.G.spawnLeft=0;window.G.bruteLeft=0;
      if(window.BAST._nextT>1.5)window.BAST._nextT=1.5;}
    const rq=document.querySelector('#dlg.on #dlgC .choice'); // requisition pallet: pick one, wall
    if(rq)rq.click();
    const fin=v=>Number.isFinite(v);
    let nan=false;
    for(const z of window.ZOMBIES)if(!fin(z.x)||!fin(z.z)||!fin(z.hp)){nan=true;break;}
    for(const a of window.ALLIES)if(!fin(a.x)||!fin(a.z)){nan=true;break;}
    return {wave:window.BAST.wave,z:window.ZOMBIES.length,crew:window.ALLIES.length,
      depot:Math.round(window.G.depotHp),kills:window.G.kills,nan};
  });
  if(last.nan)errors.push('NAN IN BASTION SOAK: '+JSON.stringify(last));
  if(last.wave>=6)break;
}
console.log('bastion soak:',JSON.stringify(last));
if(last.wave<6)errors.push('WAVES STALLED: reached '+last.wave+' (relent pace, clock forced)');
// command net on the wall: every order, then all-hands
for(const key of ['1','2','3','4','5']){
  await page.keyboard.press('c');await page.waitForTimeout(400);
  await page.keyboard.press(key);await page.waitForTimeout(600);
}
await page.keyboard.press('c');await page.waitForTimeout(300);
await page.keyboard.down('Shift');await page.keyboard.press('1');await page.keyboard.up('Shift');
await page.waitForTimeout(600);
const bastNet=await page.evaluate(()=>({duties:window.ALLIES.map(a=>a.duty||'post')}));
console.log('bastion net:',JSON.stringify(bastNet));
if(!bastNet.duties.every(d=>d==='post'))errors.push('ALL-HANDS POST ORDER IGNORED: '+JSON.stringify(bastNet));

/* B. wander: command net field orders change duties */
await boot('#wandBtn');
await page.evaluate(()=>{if(!window.ALLIES.length)window.spawnAlly(window.PLAYER.x+2,window.PLAYER.z+2);});
await page.waitForTimeout(1500);
await page.keyboard.press('c');await page.waitForTimeout(400);
const netUp=await page.evaluate(()=>{
  const el=[...document.querySelectorAll('div')].find(d=>d.textContent.startsWith('COMMAND NET'));
  return !!(el&&el.style.display!=='none');
});
if(!netUp)errors.push('COMMAND NET UI NEVER SHOWED (wander)');
await page.keyboard.press('2');await page.waitForTimeout(800); // hold where you stand
const hold=await page.evaluate(()=>window.ALLIES.map(a=>a.duty));
console.log('wander net after HOLD:',JSON.stringify({netUp,hold}));
if(!hold.includes('hold'))errors.push('HOLD ORDER DID NOT SET DUTY: '+JSON.stringify(hold));
await page.keyboard.press('c');await page.waitForTimeout(300);
await page.keyboard.press('1');await page.waitForTimeout(800); // back on me
const onme=await page.evaluate(()=>window.ALLIES.map(a=>a.duty));
if(onme.includes('hold'))errors.push('ON-ME DID NOT CLEAR HOLD: '+JSON.stringify(onme));

/* C. sandbox: the toolbox, arsenal on, never writes home */
await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForSelector('#startBtn',{timeout:60000});
await page.waitForTimeout(3000);
await page.evaluate(()=>{localStorage.setItem('tlr_sbox',JSON.stringify({god:1,ammo:1,arsenal:1,dead:3}));
  localStorage.removeItem('tlr_wander');});
await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForSelector('#startBtn',{timeout:60000});
await page.waitForTimeout(3000);
await page.$eval('#sboxBtn',el=>el.click());
await page.waitForTimeout(1000);
const setOut=await page.evaluate(()=>{ // the sandbox CARD button is also labeled CUSTOM GAME — find the panel by its START button
  const box=[...document.querySelectorAll('div')].find(d=>
    d.textContent.trim().startsWith('CUSTOM GAME')&&
    [...d.querySelectorAll('.mItem')].some(x=>x.textContent==='START'));
  const b=box&&[...box.querySelectorAll('.mItem')].find(d=>d.textContent==='START');
  if(b){b.click();return true;}return false;
});
if(!setOut)errors.push('CUSTOM GAME HAS NO START');
await page.waitForTimeout(8000);
const sbox=await page.evaluate(()=>({wander:window.WANDER.on,
  scrap:window.G.scrap,owned:window.PLAYER.owned.filter(Boolean).length,
  ghost:localStorage.getItem('tlr_wander')})); // SBOX isn't window-exported; scrap 999 is its fingerprint
console.log('sandbox:',JSON.stringify(sbox));
if(!sbox.wander||sbox.scrap!==999)errors.push('SANDBOX DID NOT START: '+JSON.stringify(sbox));
if(sbox.owned<5)errors.push('ARSENAL NOT GRANTED: owned='+sbox.owned);
await page.evaluate(()=>{window.devSpawn(10,window.PLAYER.x+8,window.PLAYER.z,6);});
await page.waitForTimeout(8000);
const sbox2=await page.evaluate(()=>({z:window.ZOMBIES.length,hp:Math.round(window.PLAYER.hp),
  ghost:localStorage.getItem('tlr_wander')}));
console.log('sandbox after horde:',JSON.stringify(sbox2));
if(sbox2.ghost)errors.push('SANDBOX WROTE A SAVE: '+String(sbox2.ghost).slice(0,60));

const real=errors.filter(e=>!e.includes('pointer lock'));
console.log('ERRORS:',real.length?real.slice(0,15):'none');
await browser.close();
process.exit(real.length?1:0);
