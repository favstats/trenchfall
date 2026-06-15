import { chromium } from 'playwright';
import { setTimeout as sleep } from 'node:timers/promises';
try {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs=[]; p.on('pageerror',e=>errs.push(''+e));
  await p.goto('http://localhost:5173/winterfell.html?gl=1&pitch=0.12', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.WF?.ready === true, { timeout: 30000 }).catch(()=>{});
  await p.evaluate(() => { window.WF.test.frame(-120, 60, 120); }); // turn toward the moon (NW sky)
  await sleep(3500);
  await p.screenshot({ path: 'dist/shots/winterfell-moon.png', timeout: 50000 });
  console.log('shot done; ERRS:', errs.length?errs.join('|'):'(none)');
  await b.close();
} catch(e){ console.error('FATAL',e); } finally { process.exit(0); }
