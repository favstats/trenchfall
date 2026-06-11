import {chromium} from 'playwright';
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:640,height:360}});
const errors=[];
page.on('pageerror',e=>errors.push((e.stack||e.message).slice(0,200)));
await page.goto('http://127.0.0.1:5180/',{waitUntil:'domcontentloaded',timeout:90000});
for(let a=0;a<25;a++){
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
  const P=window.PLAYER;P.hp=Infinity;
  for(let i=0;i<6;i++){const z=window.spawnZombie('walker');
    if(!z)continue;const a=i/6*Math.PI*2;
    z.x=P.x+Math.sin(a)*4;z.z=P.z+Math.cos(a)*4;z.rise=0;}
  if(window.SCENE)window.SCENE.traverse(o=>{
    if(o.isHemisphereLight||o.isDirectionalLight)o.intensity*=2.2;});
});
await page.waitForTimeout(2500); // let rigs get assigned
await page.evaluate(()=>{ // pepper every near zombie with non-lethal hits
  for(const z of window.ZOMBIES){
    if(!z.alive||z._skin==null)continue;
    for(let k=0;k<5;k++){
      const hy=window.heightAt(z.x,z.z)+ .7+Math.random()*.8;
      window.damageZombie(z,.5,{x:z.x+(Math.random()-.5)*.2,y:hy,z:z.z+(Math.random()-.5)*.2});
    }
  }
});
for(let s=0;s<3;s++){
  await page.evaluate(()=>{window.PLAYER.hp=Infinity;});
  await page.waitForTimeout(1300);
  await page.screenshot({path:`/tmp/tf-wound-${s}.png`,timeout:120000}).catch(()=>console.log('shot failed',s));
}
console.log('errors:',errors.slice(0,5));
await browser.close();
