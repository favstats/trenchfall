/* weapon photography: every gun, three views, lights up. Usage: dev server on :5180, then node scripts/gunshots.mjs */
import {chromium} from 'playwright';
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:640,height:360}});
const errors=[];
page.on('pageerror',e=>errors.push(e.stack||e.message));
await page.goto('http://127.0.0.1:5180/',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForSelector('#startBtn',{state:'attached',timeout:60000});
await page.waitForTimeout(3000);
await page.$eval('#wandBtn',el=>el.click());
await page.waitForTimeout(5000);
await page.evaluate(()=>{
  for(const id of['hud','announce','vignette'])
    {const el=document.getElementById(id);if(el)el.style.display='none';}
  window.PLAYER.hp=Infinity;
  window.PLAYER.owned=window.WEAPONS.map(()=>true);
  if(window.SCENE)window.SCENE.traverse(o=>{ // studio lights
    if(o.isHemisphereLight||o.isDirectionalLight)o.intensity*=2.4;});
});
const VIEWS=[['wield',{x:0,y:0}],['side',{x:0,y:1.05}],['top',{x:.95,y:.35}]];
for(let i=0;i<8;i++){
  await page.evaluate(w=>{window.selectWeapon(w);},i);
  await page.waitForTimeout(900);
  for(const[vn,rot]of VIEWS){
    await page.evaluate(([w,r])=>{const g=window.GUNS[w];g.rotation.x=r.x;g.rotation.y=r.y;},[i,rot]);
    await page.waitForTimeout(350);
    await page.screenshot({path:`/tmp/tf-gun-${i}-${vn}.png`,timeout:120000}).catch(()=>console.log('gun shot failed',i,vn));
  }
  await page.evaluate(w=>{window.GUNS[w].rotation.set(0,0,0);},i);
}
console.log('errors:',errors.slice(0,8));
await browser.close();
