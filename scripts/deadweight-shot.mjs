// deadweight-shot.mjs — physics smoke: rapier loads, crates fall, ball wrecks.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
mkdirSync('dist/shots', { recursive: true });
const PORT = 5191;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'ignore', 'pipe'] });
let failed = false;
try {
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { try { up = (await fetch(`http://127.0.0.1:${PORT}/deadweight.html`)).ok; } catch {} if (!up) await sleep(500); }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/deadweight.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.DW && window.DW.ready === true, { timeout: 60000 })
    .catch(() => errs.push('timeout: rapier never initialized'));
  await sleep(1200);
  await page.screenshot({ path: 'dist/shots/deadweight-impact.png' });
  await sleep(4500);
  const s = await page.evaluate(() => ({ ...window.DW.stats, settled: window.DW.test.settled() }));
  console.log('[DW]', JSON.stringify(s));
  if (!s.bodies || s.bodies < 20) errs.push('bodies missing');
  await page.screenshot({ path: 'dist/shots/deadweight-settled.png' });
  await browser.close();
  if (errs.length) { failed = true; for (const e of errs) console.error('  - ' + e); }
  else console.log('[DW] rapier physics live ✓');
} catch (e) { failed = true; console.error('[DW] FATAL:', e); }
finally { vite.kill('SIGTERM'); await sleep(300); process.exit(failed ? 1 : 0); }
