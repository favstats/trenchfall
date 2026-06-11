/* boots each bastion fort archetype, screenshots it from a high vantage.
   Needs the test server: TF_PORT (default 5181). Usage: node scripts/fort-test.mjs */
import {chromium} from 'playwright';
const PORT=process.env.TF_PORT||'5181';
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:640,height:360}});
const errors=[];
page.on('pageerror',e=>{if(!e.message.includes('pointer lock'))errors.push(e.message);});
for(const kind of['ridge','helm','tiers','twins']){
  await page.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForSelector('#startBtn',{timeout:60000});
  await page.waitForTimeout(2500);
  await page.evaluate(k=>{localStorage.removeItem('tlr_bastion_run');window.__fortKind=k;},kind);
  await page.$eval('#bastBtn',el=>el.click());
  await page.waitForTimeout(5000);
  await page.evaluate(()=>{ // hoist the lens over the wall, hide the HUD
    for(const id of['hud','announce','vignette'])
      {const el=document.getElementById(id);if(el)el.style.display='none';}
  });
  await page.screenshot({path:`/tmp/tf-fort-${kind}.png`,timeout:120000})
    .catch(()=>console.log('shot failed',kind));
  console.log('built',kind);
}
console.log('errors:',errors.slice(0,6));
await browser.close();
