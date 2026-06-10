/* night/day biome shots: node scripts/nightshot.mjs <biome> <wanderT> <outfile> */
import {chromium} from 'playwright';
const [biome,wt,out]=[process.argv[2]??'white',+(process.argv[3]??75),process.argv[4]??'/tmp/tf-night.png'];
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:640,height:360}});
page.on('pageerror',e=>{if(!e.message.includes('pointer lock'))console.log('ERR',e.message);});
await page.goto('http://127.0.0.1:5180/',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForSelector('#startBtn',{timeout:60000});
await page.waitForTimeout(3000);
await page.$eval('#wandBtn',el=>el.click());
await page.waitForTimeout(5000);
await page.evaluate(([b,t])=>{
  for(const id of['hud','announce','vignette'])
    {const el=document.getElementById(id);if(el)el.style.display='none';}
  window.devWorld(b);window.WANDER.t=t;
},[biome,wt]);
await page.waitForTimeout(6000);
await page.evaluate(t=>{window.WANDER.t=t;},wt); // hold the clock against drift
await page.waitForTimeout(1500);
await page.screenshot({path:out,timeout:120000});
console.log('shot',out);
await browser.close();
