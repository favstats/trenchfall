/* combat soak test: boots a mode, spawns the dead, exercises weapons/weather/
   explosions/death via dev hooks, watches for pageerrors and NaN corruption.
   Usage: TF_PORT=5181 node scripts/soak-test.mjs [camp|bast|wand] */
import {chromium} from 'playwright';
const mode=process.argv[2]||'wand';
const errors=[];
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:320,height:180}});
page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
page.on('pageerror',e=>errors.push('pageerror: '+e.message));

await page.goto('http://127.0.0.1:'+(process.env.TF_PORT||'5181')+'/',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForSelector('#startBtn',{timeout:60000});
await page.waitForTimeout(3000);
const btn={camp:'#startBtn',bast:'#bastBtn',wand:'#wandBtn'}[mode];
await page.$eval(btn,el=>el.click());
await page.waitForTimeout(3000);
for(let i=0;i<3;i++){
  const ch=await page.$('.ov.show .choice, #dlg.on .choice');
  if(ch){await ch.click().catch(()=>{});await page.waitForTimeout(800);}
}
await page.waitForTimeout(4000);

// each step runs in-page; thrown errors are captured with their label
const step=async(label,fn)=>{
  const r=await page.evaluate(fn).catch(e=>'HARNESS: '+e.message.split('\n')[0]);
  if(typeof r==='string'&&r.startsWith('ERR'))errors.push(label+' -> '+r);
  console.log(label+':',JSON.stringify(r).slice(0,140));
};

await step('spawn horde',()=>{try{return window.devSpawn(14,window.PLAYER.x+9,window.PLAYER.z+9,7);}catch(e){return 'ERR '+e.message;}});
await page.waitForTimeout(6000);
await step('kill half',()=>{try{
  let k=0;for(const zb of window.ZOMBIES.slice()){if(k>=7)break;window.damageZombie(zb,9999,null,k%2===0);k++;}
  return 'killed '+k+' left '+window.ZOMBIES.length;
}catch(e){return 'ERR '+e.message;}});
await page.waitForTimeout(4000);
await step('grenade',()=>{try{window.G.nades=(window.G.nades||0)+3;window.throwGrenade();return 'ok';}catch(e){return 'ERR '+e.message;}});
await step('molotov',()=>{try{if(window.G.molotov!=null)window.G.molotov+=2;window.throwMolotov();return 'ok';}catch(e){return 'ERR '+e.message;}});
await step('flare',()=>{try{if(window.G.flares!=null)window.G.flares+=2;window.throwFlare();return 'ok';}catch(e){return 'ERR '+e.message;}});
await step('mine',()=>{try{if(window.G.mines!=null)window.G.mines+=2;window.placeMine();return 'ok';}catch(e){return 'ERR '+e.message;}});
await page.waitForTimeout(4000);
await step('explode near',()=>{try{window.explode(window.PLAYER.x+4,window.PLAYER.y,window.PLAYER.z+4,8,60,1.25);return 'ok';}catch(e){return 'ERR '+e.message;}});
await page.waitForTimeout(3000);
await step('weapon cycle',()=>{try{for(let i=0;i<8;i++)window.selectWeapon(i%4);return 'ok';}catch(e){return 'ERR '+e.message;}});
await step('weather cycle',()=>{try{window.setWeather(3);return 'ok';}catch(e){return 'ERR '+e.message;}});
await page.waitForTimeout(6000);
await step('nan sweep',()=>{try{
  const bad=[];const fin=v=>Number.isFinite(v);
  const p=window.PLAYER;if(!fin(p.x)||!fin(p.y)||!fin(p.z)||!fin(p.hp))bad.push('player');
  for(const zb of window.ZOMBIES)if(!fin(zb.x)||!fin(zb.z)||!fin(zb.hp)){bad.push('zombie');break;}
  for(const a of (window.ALLIES||[]))if(!fin(a.x)||!fin(a.z)){bad.push('ally');break;}
  return bad.length?'ERR NaN in: '+bad.join(','):'all finite, kills='+window.G.kills+' hp='+Math.round(p.hp);
}catch(e){return 'ERR '+e.message;}});
await step('player death',()=>{try{window.damagePlayer(99999,'soak');return 'alive='+window.PLAYER.alive;}catch(e){return 'ERR '+e.message;}});
await page.waitForTimeout(6000);
await step('post-death state',()=>{try{
  return {state:window.G.state,alive:window.PLAYER.alive,
    overlay:!!document.querySelector('.ov.show,#over.on,#dead.on')};
}catch(e){return 'ERR '+e.message;}});
await page.waitForTimeout(3000);
const real=errors.filter(e=>!e.includes('pointer lock'));
console.log('ERRORS('+mode+'):',real.length?real.slice(0,15):'none');
await browser.close();
process.exit(real.length?1:0);
