import { chromium } from 'playwright';
import { setTimeout as sleep } from 'node:timers/promises';
try {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs=[]; p.on('pageerror',e=>errs.push(''+e));
  await p.goto('http://localhost:5173/winterfell.html?gl=1&pitch=0.28', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.WF?.ready === true, { timeout: 30000 }).catch(()=>{});
  const c = await p.evaluate(() => { const s = window.WF.test.squads(); const a = s[0].c; window.WF.test.frame(a[0], a[1], 16); return s.map(q=>q.c); });
  console.log('squads:', JSON.stringify(c));
  await sleep(3500);
  await p.screenshot({ path: 'dist/shots/winterfell-soldiers2.png', timeout: 50000 });
  console.log('shot done; ERRS:', errs.length?errs.join('|'):'(none)');
  await b.close();
} catch(e){ console.error('FATAL',e); } finally { process.exit(0); }
