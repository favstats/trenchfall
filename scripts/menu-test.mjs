// quick diagnostic: does clicking the build menu do anything?
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 5188;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
vite.stderr.on('data', d => process.stderr.write(`[vite] ${d}`));

async function waitServer(url) { for (let i = 0; i < 60; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch {} await sleep(500); } return false; }

try {
  const base = `http://127.0.0.1:${PORT}`;
  await waitServer(`${base}/winterfell.html`);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  page.on('pageerror', e => logs.push('PAGEERR: ' + e));
  page.on('console', m => { if (m.type() === 'error') logs.push('CONSOLEERR: ' + m.text()); });
  await page.goto(`${base}/winterfell.html?gl=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.WF && window.WF.ready === true, { timeout: 30000 }).catch(() => logs.push('not-ready'));
  await sleep(3000);

  // inspect the build button + what's on top of it (elementFromPoint)
  const probe = await page.evaluate(() => {
    const btn = document.querySelector('[data-act="build:barracks"]');
    if (!btn) return { found: false };
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    const cs = getComputedStyle(btn);
    const cmd = document.querySelector('#command');
    const cmdcs = cmd && getComputedStyle(cmd);
    return {
      found: true, rect: { x: r.left | 0, y: r.top | 0, w: r.width | 0, h: r.height | 0 },
      btnPointerEvents: cs.pointerEvents, btnClass: btn.className,
      cmdPointerEvents: cmdcs && cmdcs.pointerEvents, cmdZ: cmdcs && cmdcs.zIndex,
      topEl: top ? `${top.tagName}.${top.className} [act=${top.closest?.('[data-act]')?.dataset.act || ''}]` : null,
      topIsButtonOrChild: !!(top && (top === btn || btn.contains(top))),
    };
  });
  console.log('PROBE:', JSON.stringify(probe, null, 2));

  // A) FORCE click (bypass actionability/stability checks) — tests real event path
  const before = await page.evaluate(() => document.querySelector('[data-act="build:barracks"]').className);
  await page.click('[data-act="build:barracks"]', { timeout: 4000, force: true }).catch(e => logs.push('FORCECLICKFAIL: ' + e.message));
  await sleep(500);
  const afterForce = await page.evaluate(() => document.querySelector('[data-act="build:barracks"]').className);
  console.log('FORCE click — CLASS before:', JSON.stringify(before), '| after:', JSON.stringify(afterForce));

  // B) real mouse down+up at the button center (what a user does)
  await page.evaluate(() => { const b = document.querySelector('[data-act="build:depot"]'); const r = b.getBoundingClientRect(); window.__c = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const c = await page.evaluate(() => window.__c);
  await page.mouse.move(c.x, c.y); await page.mouse.down(); await sleep(30); await page.mouse.up();
  await sleep(500);
  const afterReal = await page.evaluate(() => document.querySelector('[data-act="build:depot"]').className);
  console.log('REAL mouse down/up on DEPOT — class after:', JSON.stringify(afterReal));

  // C) does a CSS transition make it unstable? report transition + transform
  const anim = await page.evaluate(() => { const b = document.querySelector('[data-act="build:barracks"]'); const cs = getComputedStyle(b); return { transition: cs.transition, transform: cs.transform }; });
  console.log('STYLE:', JSON.stringify(anim));

  console.log('LOGS:', logs.length ? logs.join('\n  ') : '(none)');
  await browser.close();
} catch (e) { console.error('FATAL', e); } finally { vite.kill('SIGTERM'); await sleep(300); process.exit(0); }
