/* structural report on every character/weapon GLB via model-viewer.html
   Usage: node scripts/glb-report.mjs [model ...] (server on 5180) */
import {chromium} from 'playwright';
const models=process.argv.slice(2).length?process.argv.slice(2)
  :['zombies_pack','Soldier','scar','sniper','assault'];
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:320,height:200}});
for(const m of models){
  await page.goto(`http://127.0.0.1:5180/model-viewer.html?m=assets/models/${m}.glb`,
    {waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.__loaded===true,{timeout:90000}).catch(()=>{});
  const r=await page.evaluate(()=>({size:window.__size&&window.__size.map(v=>+v.toFixed(2)),
    ...(window.__report||{})}));
  console.log('=== '+m+' ===');
  console.log(' size:',JSON.stringify(r.size),'meshes:',r.meshes);
  console.log(' anims:',JSON.stringify(r.anims));
  console.log(' skinned:',JSON.stringify((r.skinned||[]).slice(0,14)));
  console.log(' tops:',JSON.stringify((r.tops||[]).slice(0,14)));
}
await browser.close();
