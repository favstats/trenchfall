/* storm wetness postcard: force the storm, let the ground soak, shoot it.
   Usage: node scripts/wet-shot.mjs (server on 5180) */
import {chromium} from 'playwright';
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:640,height:360}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5180/',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForSelector('#startBtn',{timeout:60000});
await page.waitForTimeout(3000);
await page.$eval('#wandBtn',el=>el.click());
await page.waitForTimeout(5000);
await page.evaluate(()=>{for(const id of['hud','announce','vignette'])
  {const el=document.getElementById(id);if(el)el.style.display='none';}});
await page.evaluate(()=>{if(window.WANDER)window.WANDER.t=2;
  const i=window.WXSTATE?3:3;window.setWeather(3);});
await page.waitForTimeout(25000); // the storm blends in, the ground drinks
console.log('wx:',await page.evaluate(()=>window.WXSTATE()));
await page.screenshot({path:'/tmp/tf-wet-storm.png',timeout:120000});
console.log('errors:',errors.filter(e=>!e.includes('pointer lock')).slice(0,5));
await browser.close();
