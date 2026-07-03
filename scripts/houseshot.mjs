/* photograph the cottage: find it via devSpots, hover the lens over it.
   Usage: node scripts/houseshot.mjs (server on 5180) */
import {chromium} from 'playwright';
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:640,height:360}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5180/',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForSelector('#startBtn',{timeout:60000});
await page.waitForTimeout(3000);
await page.$eval('#wandBtn',el=>el.click());
await page.waitForTimeout(6000);
const spot=await page.evaluate(()=>{
  for(const id of['hud','announce','vignette'])
    {const el=document.getElementById(id);if(el)el.style.display='none';}
  const r=(window.devSpots().ruins||[]).find(r2=>r2.kind==='cottage');
  if(!r)return null;
  window.devFly(r.x-6,r.z-16,7,r.x,r.z);
  return r;
});
console.log('cottage:',JSON.stringify(spot));
await page.waitForTimeout(3500);
await page.screenshot({path:'/tmp/tf-house.png',timeout:120000});
await page.evaluate(s=>{window.devFly(s.x+14,s.z+10,5,s.x,s.z);},spot);
await page.waitForTimeout(3000);
await page.screenshot({path:'/tmp/tf-house-2.png',timeout:120000});
await page.evaluate(()=>window.devFlyOff());
console.log('errors:',errors.filter(e=>!e.includes('pointer lock')).slice(0,4));
await browser.close();
