/* first-person arms mount tuner: mount the sniper rig, sweep offsets, shoot the
   real FP view for each candidate. Usage: node scripts/fparm-tune.mjs (server on 5180) */
import {chromium} from 'playwright';
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:640,height:360}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5180/',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForSelector('#startBtn',{timeout:60000});
await page.waitForTimeout(3000);
await page.$eval('#wandBtn',el=>el.click());
await page.waitForTimeout(6000);
await page.evaluate(()=>{
  for(const id of['hud','announce','vignette'])
    {const el=document.getElementById(id);if(el)el.style.display='none';}
  window.PLAYER.owned=window.PLAYER.owned.map(()=>true);
  window.selectWeapon(3); // the marksman: the arms come up
});
await page.waitForTimeout(1500);
const ready=await page.evaluate(()=>!!window.FPARM);
console.log('FPARM ready:',ready);
const cands=JSON.parse(process.argv[2]||'[]');
if(!cands.length)cands.push({}); // just shoot the default
let i=0;
for(const c of cands){
  await page.evaluate(cc=>{if(window.FPARM)for(const k in cc)window.FPARM.set(k,cc[k]);},c);
  await page.waitForTimeout(500);
  const path=`/tmp/tf-fparm-${i}.png`;
  await page.screenshot({path,timeout:120000});
  console.log(i,JSON.stringify(c),'->',path);
  i++;
}
console.log('errors:',errors.filter(e=>!e.includes('pointer lock')).slice(0,5));
await browser.close();
