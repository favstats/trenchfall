import { chromium } from 'playwright';
import { setTimeout as sleep } from 'node:timers/promises';
try {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs=[]; p.on('pageerror',e=>errs.push(''+e));
  await p.goto('http://localhost:5173/winterfell.html?gl=1&pitch=0.24', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.WF?.ready === true, { timeout: 30000 }).catch(()=>{});
  const c = await p.evaluate(() => { const s = window.WF.test.squads()[0].c; window.WF.test.frame(s[0], s[1], 14); return s; });
  console.log('squad at', JSON.stringify(c));
  await sleep(4000);
  await p.screenshot({ path: 'dist/shots/winterfell-breath.png', timeout: 45000 });
  console.log('shot done; ERRS:', errs.length?errs.join('|'):'(none)');
  await b.close();
} catch(e){ console.error('FATAL',e); } finally { process.exit(0); }
