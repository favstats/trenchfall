/* start-screen layout check at desktop size. Usage: node scripts/menushot.mjs (server on 5180) */
import {chromium} from 'playwright';
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1600,height:900}});
await page.goto('http://127.0.0.1:5180/',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForSelector('#startBtn',{timeout:60000});
await page.waitForTimeout(6000);
await page.screenshot({path:'/tmp/tf-menu-wide.png',timeout:120000});
console.log('shot /tmp/tf-menu-wide.png');
await browser.close();
