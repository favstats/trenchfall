import { chromium } from 'playwright';
import { setTimeout as sleep } from 'node:timers/promises';
try {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto('http://localhost:5173/winterfell.html?gl=1&demo=breach', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.WF?.ready === true, { timeout: 30000 }).catch(()=>{});
  await sleep(5000);
  await p.screenshot({ path: 'dist/shots/winterfell-mm.png', timeout: 60000, animations: 'disabled' });
  console.log('shot done');
  await b.close();
} catch(e){ console.error('FATAL',e); } finally { process.exit(0); }
