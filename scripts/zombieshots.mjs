/* close-up zombie QA: spawn a ring of the dead around the player and photograph the approach.
   Usage: dev server on :5180, then node scripts/zombieshots.mjs */
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
const biome=process.argv[2];
if(biome){
  await page.evaluate(n=>{if(window.WANDER)window.WANDER.t=2;window.devWorld&&window.devWorld(n);},biome);
  await page.waitForTimeout(4500);
}
await page.evaluate(()=>{
  for(const id of['hud','announce','vignette'])
    {const el=document.getElementById(id);if(el)el.style.display='none';}
  const P=window.PLAYER;
  const kinds=['walker','walker','walker','runner','crawler','walker','spitter','walker','brute','walker'];
  kinds.forEach((k,i)=>{
    const z=window.spawnZombie(k);
    if(!z)return;
    const a=i/kinds.length*Math.PI*2;
    z.x=P.x+Math.sin(a)*4.5;z.z=P.z+Math.cos(a)*4.5;z.rise=0;
  });
  P.hp=Infinity;
  if(window.SCENE)window.SCENE.traverse(o=>{ // studio lights for the QA stills
    if(o.isHemisphereLight||o.isDirectionalLight)o.intensity*=3.5;});
});
for(let s=0;s<4;s++){
  await page.evaluate(()=>{window.PLAYER.hp=Infinity;});
  await page.waitForTimeout(1700);
  await page.screenshot({path:`/tmp/tf-zomb-${s}.png`,timeout:120000}).catch(()=>console.log('shot failed',s));
}
await page.evaluate(()=>{ // the portrait lens: tight on the nearest face
  window.PLAYER.hp=Infinity;
  if(window.CAMERA){window.CAMERA.fov=26;window.CAMERA.updateProjectionMatrix();}
});
for(let s=0;s<2;s++){
  await page.waitForTimeout(1400);
  await page.screenshot({path:`/tmp/tf-zomb-zoom-${s}.png`,timeout:120000}).catch(()=>console.log('zoom shot failed',s));
}
console.log('errors:',errors.filter(e=>!e.includes('pointer lock')).slice(0,8));
await browser.close();
