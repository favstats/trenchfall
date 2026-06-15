import { chromium } from 'playwright';
import { setTimeout as sleep } from 'node:timers/promises';
try {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs=[]; p.on('pageerror',e=>errs.push(''+e));
  await p.goto('http://localhost:5173/winterfell.html?gl=1&pitch=0.26', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.WF?.ready === true, { timeout: 30000 }).catch(()=>{});
  await p.evaluate(() => window.WF.test.frame(0, -22, 34)); // stand in the killing ground
  await sleep(1500);
  await p.evaluate(() => { window.WF.test.blast(0, -22, 13); });
  await sleep(110);
  await p.screenshot({ path: 'dist/shots/winterfell-boom.png', timeout: 40000 });
  console.log('shot done; ERRS:', errs.length?errs.join('|'):'(none)');
  await b.close();
} catch(e){ console.error('FATAL',e); } finally { process.exit(0); }
