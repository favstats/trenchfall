import {chromium} from 'playwright';

const errors=[];
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720}});
page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
page.on('pageerror',e=>errors.push('pageerror: '+e.message));

await page.goto('http://127.0.0.1:5179/',{waitUntil:'load',timeout:60000});
await page.waitForSelector('#startBtn',{timeout:60000});await page.waitForTimeout(4000);
await page.screenshot({path:'/tmp/tf-menu.png'});

// detect WebGL actually rendering
const gl=await page.evaluate(()=>{const c=document.getElementById('gl');return c&&c.width>0;});
console.log('canvas ok:',gl);

const mode=process.argv[2]||'bast';
const btn={camp:'#startBtn',bast:'#bastBtn',wand:'#wandBtn'}[mode];
await page.click(btn);
await page.waitForTimeout(1500);
// dismiss any event/dialog overlays by clicking choices if present
for(let i=0;i<3;i++){
  const ch=await page.$('.ov.show .choice, #dlg.on .choice');
  if(ch){await ch.click();await page.waitForTimeout(800);}
}
await page.waitForTimeout(6000);
await page.screenshot({path:`/tmp/tf-${mode}-1.png`});
// simulate a bit of play: move + look + shoot
await page.mouse.move(640,360);
await page.keyboard.down('w');
await page.waitForSelector('#startBtn',{timeout:60000});await page.waitForTimeout(4000);
await page.keyboard.up('w');
await page.mouse.down();await page.waitForTimeout(400);await page.mouse.up();
await page.waitForTimeout(2000);
await page.screenshot({path:`/tmp/tf-${mode}-2.png`});
// fast-forward time in wander to see night
if(mode==='wand'){
  await page.evaluate(()=>{try{window.WANDER&&(window.WANDER.t=80)}catch(e){}});
  await page.waitForTimeout(3000);
  await page.screenshot({path:'/tmp/tf-wand-night.png'});
}
await page.waitForTimeout(1000);
console.log('errors:',errors.length?errors.slice(0,20):'none');
await browser.close();
