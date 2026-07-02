/* the man on the road must join under the name he gave.
   Usage: TF_PORT=5181 node scripts/survivor-test.mjs */
import {chromium} from 'playwright';
const errors=[];
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:320,height:180}});
page.on('pageerror',e=>errors.push('pageerror: '+e.message));
await page.goto('http://127.0.0.1:'+(process.env.TF_PORT||'5181')+'/',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForSelector('#startBtn',{timeout:60000});
await page.waitForTimeout(3000);
await page.$eval('#startBtn',el=>el.click());
await page.waitForTimeout(9000); // muster roll, then the road

const opened=await page.evaluate(()=>{
  for(let i=0;i<400;i++){
    const pe=window.pickRoadEvent();
    if(pe&&pe.ev&&pe.ev.id==='survivor'){window.openEvent(pe,true);return true;}
    if(pe&&pe.ev)delete window.CAMP.usedEv[pe.ev.id]; // put the card back in the deck
  }
  return false;
});
console.log('survivor event opened:',opened);
if(!opened){errors.push('COULD NOT DEAL SURVIVOR EVENT');}
else{
  await page.waitForTimeout(1500);
  const told=await page.evaluate(()=>{
    const q=document.querySelector('#dlg .q');
    const m=q&&q.textContent.match(/his name is ([A-Za-z]+)\./);
    return m?m[1]:null;
  });
  console.log('stated name:',told);
  const before=await page.evaluate(()=>window.CAMP.comps.length);
  await page.$eval('#dlgC .choice',el=>el.click()); // take him aboard
  await page.waitForTimeout(1200);
  const joined=await page.evaluate(()=>{
    const c=window.CAMP.comps[window.CAMP.comps.length-1];
    return {n:window.CAMP.comps.length,name:c&&c.name};
  });
  console.log('joined:',JSON.stringify(joined),'(comps before:',before+')');
  if(!told||joined.n!==before+1||!joined.name||!joined.name.startsWith(told+' '))
    errors.push('NAME MISMATCH: told "'+told+'" got "'+(joined&&joined.name)+'"');
}
const real=errors.filter(e=>!e.includes('pointer lock'));
console.log('ERRORS:',real.length?real.slice(0,10):'none');
await browser.close();
process.exit(real.length?1:0);
