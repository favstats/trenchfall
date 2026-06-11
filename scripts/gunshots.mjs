/* weapon photography: every gun, three views, lights up. Usage: dev server on :5180, then node scripts/gunshots.mjs */
import {chromium} from 'playwright';
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:640,height:360}});
const errors=[];
page.on('pageerror',e=>errors.push(e.stack||e.message));
await page.goto('http://127.0.0.1:5180/',{waitUntil:'domcontentloaded',timeout:60000});
for(let a=0;a<25;a++){ // selector polling starves under load; evaluate gets through
  await page.waitForTimeout(2000);
  const ok=await page.evaluate(()=>{
    if(window.WANDER&&window.WANDER.on)return true;
    const b=document.getElementById('wandBtn');if(b)b.click();
    return !!(window.WANDER&&window.WANDER.on);}).catch(()=>false);
  if(ok)break;
}
await page.waitForTimeout(5000);
await page.evaluate(()=>{
  for(const id of['hud','announce','vignette'])
    {const el=document.getElementById(id);if(el)el.style.display='none';}
  window.PLAYER.hp=Infinity;
  window.PLAYER.owned=window.WEAPONS.map(()=>true);
  if(window.SCENE)window.SCENE.traverse(o=>{ // studio lights
    if(o.isHemisphereLight||o.isDirectionalLight)o.intensity*=2.4;});
});
const VIEWS=[['wield',{x:.1,y:.4}],['side',{x:.05,y:1.3}],['top',{x:1.0,y:.5}]];
for(let i=0;i<8;i++){
  await page.evaluate(w=>{window.selectWeapon(w);},i);
  await page.waitForTimeout(900);
  for(const[vn,rot]of VIEWS){
    await page.evaluate(([w,r])=>{const g=window.GUNS[w]; // pull it up into the light, like a showroom
      g.rotation.x=r.x;g.rotation.y=r.y;
      g.position.set(-.22,.16,.12);g.scale.setScalar(1.45);},[i,rot]);
    await page.waitForTimeout(350);
    await page.screenshot({path:`/tmp/tf-gun-${i}-${vn}.png`,timeout:120000}).catch(()=>console.log('gun shot failed',i,vn));
  }
  await page.evaluate(w=>{const g=window.GUNS[w];g.rotation.set(0,0,0);g.position.set(0,0,0);g.scale.setScalar(1);},i);
}
console.log('errors:',errors.slice(0,8));
await browser.close();
