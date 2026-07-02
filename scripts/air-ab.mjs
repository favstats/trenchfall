/* A/B the depth-true air pass in the worst-case biome (dense jungle fog).
   Usage: node scripts/air-ab.mjs [biome]  (server on 5180) */
import {chromium} from 'playwright';
const biome=process.argv[2]||'green';
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
await page.evaluate(b=>{if(window.WANDER)window.WANDER.t=2;window.devWorld(b);},biome);
await page.waitForTimeout(4500);
await page.evaluate(()=>{window.GRADE.uniforms.aerialK.value=0;});
await page.waitForTimeout(1200);
await page.screenshot({path:`/tmp/tf-ab-${biome}-off.png`,timeout:120000});
await page.evaluate(()=>{window.GRADE.uniforms.aerialK.value=1;});
await page.waitForTimeout(1200);
await page.screenshot({path:`/tmp/tf-ab-${biome}-on.png`,timeout:120000});
console.log('errors:',errors.filter(e=>!e.includes('pointer lock')).slice(0,5));
await browser.close();
