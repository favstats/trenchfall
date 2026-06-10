import {chromium} from 'playwright';
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:640,height:360}});
page.on('console',m=>console.log('[console]',m.type(),m.text()));
page.on('pageerror',e=>console.log('[pageerror]',e.message,'\n',(e.stack||'').split('\n').slice(0,4).join('\n')));
await page.goto('http://127.0.0.1:5179/',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForSelector('#startBtn',{timeout:60000});
await page.waitForTimeout(3000);
await page.$eval('#wandBtn',el=>el.click());
await page.waitForTimeout(3000);
const st=await page.evaluate(()=>{
  const s=document.getElementById('start');
  return {menuShown:s.classList.contains('show')};
});
console.log(st);
await browser.close();
