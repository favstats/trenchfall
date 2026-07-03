import { chromium } from 'playwright';
import { setTimeout as sleep } from 'node:timers/promises';
try {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto('http://localhost:5173/winterfell.html?gl=1', { waitUntil: 'domcontentloaded' });
  // poll opacity until it goes non-zero (catch the title window during/after boot)
  let best = 0, shot = false;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    const o = await p.evaluate(()=>{const t=document.getElementById('titleCard'); return t?parseFloat(getComputedStyle(t).opacity):-1;}).catch(()=>-1);
    if (o > best) best = o;
    if (o > 0.6 && !shot) { await p.screenshot({ path: 'dist/shots/winterfell-title.png', timeout: 30000 }); shot = true; break; }
  }
  console.log('best opacity seen:', best, 'shot:', shot);
  await b.close();
} catch(e){ console.error('FATAL',e); } finally { process.exit(0); }
