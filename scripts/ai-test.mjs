/* AI navigation test: an ally must round an 18m wall of colliders to reach the player.
   Needs the dev server on 5179. Usage: node scripts/ai-test.mjs */
import {chromium} from 'playwright';
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:320,height:180}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('framenavigated',()=>console.log('NOTE: page navigated'));
async function retry(fn,n=4){let last;
  for(let i=0;i<n;i++){try{return await fn();}catch(e){last=e;console.log('retry:',e.message.split('\n')[0]);await page.waitForTimeout(3000);}}
  throw last;}
await page.goto('http://127.0.0.1:5181/',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForTimeout(6000);   // let vite's dep-optimizer reload settle
await retry(()=>page.waitForSelector('#startBtn',{timeout:30000}));
await page.waitForTimeout(2000);
await retry(()=>page.$eval('#wandBtn',el=>el.click()));
await page.waitForTimeout(4000);
await retry(()=>page.evaluate(()=>{window.__aiR=null;window.devAITest().then(r=>window.__aiR=r);}));
let r=null;
for(let i=0;i<240&&!r;i++){
  await page.waitForTimeout(1000);
  try{r=await page.evaluate(()=>window.__aiR);}catch(e){console.log('poll failed:',e.message.split('\n')[0]);}
}
console.log('AI nav test:',JSON.stringify(r));
console.log('errors:',errors.filter(e=>!e.includes('pointer lock')).slice(0,5));
await browser.close();
process.exit(r&&r.ok?0:1);
