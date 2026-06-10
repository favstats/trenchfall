/* headless smoke test: boots the game, enters a mode, plays a few seconds,
   reports console/page errors. Usage: node scripts/smoke.mjs [camp|bast|wand]
   (needs `npm i --no-save playwright` + `npx playwright install chromium`) */
import {chromium} from 'playwright';

const errors=[];
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:640,height:360}});
page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
page.on('pageerror',e=>errors.push('pageerror: '+e.message));
const shot=p=>page.screenshot({path:p,timeout:120000}).catch(e=>console.log('shot failed:',p));

await page.goto('http://127.0.0.1:5179/',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForSelector('#startBtn',{timeout:60000});
await page.waitForTimeout(4000);
await shot('/tmp/tf-menu.png');

const gl=await page.evaluate(()=>{const c=document.getElementById('gl');return c&&c.width>0;});
console.log('canvas ok:',gl);

const mode=process.argv[2]||'bast';
const btn={camp:'#startBtn',bast:'#bastBtn',wand:'#wandBtn'}[mode];
await page.$eval(btn,el=>el.click());
await page.waitForTimeout(2000);
for(let i=0;i<3;i++){
  const ch=await page.$('.ov.show .choice, #dlg.on .choice');
  if(ch){await ch.click();await page.waitForTimeout(800);}
}
await page.waitForTimeout(8000);
await shot(`/tmp/tf-${mode}-1.png`);
// a few seconds of play: walk, aim, shoot
await page.mouse.move(320,180);
await page.keyboard.down('w');
await page.waitForTimeout(2500);
await page.keyboard.up('w');
await page.mouse.down();await page.waitForTimeout(400);await page.mouse.up();
await page.waitForTimeout(2500);
await shot(`/tmp/tf-${mode}-2.png`);
await page.waitForTimeout(1000);
console.log('errors:',errors.length?errors.slice(0,20):'none');
await browser.close();
