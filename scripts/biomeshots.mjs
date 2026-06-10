/* screenshots every named biome via window.devWorld. Usage: node scripts/biomeshots.mjs */
import {chromium} from 'playwright';
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:640,height:360}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5180/',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForSelector('#startBtn',{timeout:60000});
await page.waitForTimeout(3000);
await page.$eval('#wandBtn',el=>el.click());
await page.waitForTimeout(5000);
await page.evaluate(()=>{ // clean lens for the postcard run
  for(const id of['hud','announce','vignette'])
    {const el=document.getElementById(id);if(el)el.style.display='none';}
});
for(const b of process.argv.slice(2).length?process.argv.slice(2):['white','steppe','hardpan','teeth','ashfall','mire','shore']){
  const got=await page.evaluate(n=>{if(window.WANDER)window.WANDER.t=2;return window.devWorld?window.devWorld(n):'NO devWorld';},b);
  console.log('devWorld →',got);
  await page.waitForTimeout(4500);
  await page.screenshot({path:`/tmp/tf-biome-${b}.png`,timeout:120000}).catch(()=>console.log('shot failed',b));
}
console.log('errors:',errors.filter(e=>!e.includes('pointer lock')).slice(0,8));
await browser.close();
