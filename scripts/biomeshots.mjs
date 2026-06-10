/* screenshots every named biome via window.devWorld. Usage: node scripts/biomeshots.mjs */
import {chromium} from 'playwright';
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:640,height:360}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5179/',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForSelector('#startBtn',{timeout:60000});
await page.waitForTimeout(3000);
await page.$eval('#wandBtn',el=>el.click());
await page.waitForTimeout(5000);
for(const b of process.argv.slice(2).length?process.argv.slice(2):['white','steppe','hardpan','teeth','ashfall','mire','shore']){
  await page.evaluate(n=>window.devWorld(n),b);
  await page.waitForTimeout(4500);
  await page.screenshot({path:`/tmp/tf-biome-${b}.png`,timeout:120000}).catch(()=>console.log('shot failed',b));
  console.log('shot',b);
}
console.log('errors:',errors.filter(e=>!e.includes('pointer lock')).slice(0,8));
await browser.close();
