/* ally portrait: a rifleman with work in front of him — is the rifle shouldered?
   Usage: node scripts/allyshot.mjs (server on 5180) */
import {chromium} from 'playwright';
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:640,height:360}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5180/',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForSelector('#startBtn',{timeout:60000});
await page.waitForTimeout(3000);
await page.$eval('#wandBtn',el=>el.click());
await page.waitForTimeout(6000);
await page.evaluate(()=>{
  for(const id of['hud','announce','vignette'])
    {const el=document.getElementById(id);if(el)el.style.display='none';}
  const P=window.PLAYER;
  while(window.ALLIES.length<2)if(!window.spawnAlly(P.x+2.5,P.z+3))break;
  const m=window.CAMERA.matrixWorld.elements;      // third column = camera forward
  const fx=-m[8],fz=-m[10],rx=m[0],rz=m[2];        // forward and right, on the ground plane
  let i=0;
  for(const a of window.ALLIES){a.hp=a.maxhp;a.duty='hold';
    a.post={x:P.x+fx*5+rx*(i-0.5)*2.4,z:P.z+fz*5+rz*(i-0.5)*2.4};i++;
    a.x=a.post.x;a.z=a.post.z;a.wanderT=0;}
  window.devSpawn(4,P.x+fx*20,P.z+fz*20,2);        // work, 15m past the line — the rifles should come up
});
await page.waitForTimeout(7000);
await page.evaluate(()=>{for(const al of window.ALLIES){al.x=al.post.x;al.z=al.post.z;}});
await page.waitForTimeout(1200);
await page.screenshot({path:'/tmp/tf-ally-aim.png',timeout:120000});
console.log('aimK:',await page.evaluate(()=>window.ALLIES.map(a=>+(a._aimK||0).toFixed(2))));
console.log('errors:',errors.filter(e=>!e.includes('pointer lock')).slice(0,5));
await browser.close();
