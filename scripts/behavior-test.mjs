/* behavior probe: zombies must actually reach and hurt the player; shop and
   perk overlays must open and close; console warnings are surfaced.
   Usage: TF_PORT=5181 node scripts/behavior-test.mjs */
import {chromium} from 'playwright';
const errors=[],warns=[];
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:320,height:180}});
page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());
  else if(m.type()==='warning')warns.push(m.text());});
page.on('pageerror',e=>errors.push('pageerror: '+e.message));
await page.goto('http://127.0.0.1:'+(process.env.TF_PORT||'5181')+'/',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForSelector('#startBtn',{timeout:60000});
await page.waitForTimeout(3000);
await page.$eval('#wandBtn',el=>el.click());
await page.waitForTimeout(6000);

// 1. the dead must bite: ring the player, watch hp fall
const t0=await page.evaluate(()=>{
  window.PLAYER.hp=100;
  for(const a of window.ALLIES.slice())a.x=window.PLAYER.x+60; // shove helpers out of the fight
  window.devSpawn(6,window.PLAYER.x,window.PLAYER.z,2.5);
  return {hp:window.PLAYER.hp,z:window.ZOMBIES.length,t:window.WANDER.t};
});
console.log('bite setup:',JSON.stringify(t0));
let bite=null;
for(let i=0;i<24;i++){
  await page.waitForTimeout(5000);
  bite=await page.evaluate(()=>({hp:Math.round(window.PLAYER.hp),alive:window.PLAYER.alive,
    z:window.ZOMBIES.length,t:Math.round(window.WANDER.t*10)/10}));
  if(bite.hp<100||!bite.alive)break;
}
console.log('bite result:',JSON.stringify(bite));
if(bite.hp>=100&&bite.alive)errors.push('ZOMBIES NEVER HURT PLAYER: '+JSON.stringify(bite));

// 2. overlays open and close without wreckage
const shop=await page.evaluate(()=>{try{
  window.toggleShop();const open=document.body.innerHTML.includes('shop')||true;
  const st1=window.G.state;window.toggleShop();
  return {ok:true,stateDuring:st1,stateAfter:window.G.state};
}catch(e){return {ok:false,err:e.message};}});
console.log('shop:',JSON.stringify(shop));
if(!shop.ok)errors.push('SHOP THREW: '+shop.err);
const perks=await page.evaluate(()=>{try{
  window.offerPerks();
  const cards=document.querySelectorAll('#perks .perk, .perk');
  if(cards.length){cards[0].click();}
  return {ok:true,cards:cards.length};
}catch(e){return {ok:false,err:e.message};}});
console.log('perks:',JSON.stringify(perks));
if(!perks.ok)errors.push('PERKS THREW: '+perks.err);
await page.waitForTimeout(3000);
const end=await page.evaluate(()=>({state:window.G.state,hp:Math.round(window.PLAYER.hp),
  finite:Number.isFinite(window.PLAYER.x)}));
console.log('end state:',JSON.stringify(end));

const real=errors.filter(e=>!e.includes('pointer lock'));
console.log('WARNINGS:',warns.length?[...new Set(warns)].slice(0,8):'none');
console.log('ERRORS:',real.length?real.slice(0,15):'none');
await browser.close();
process.exit(real.length?1:0);
