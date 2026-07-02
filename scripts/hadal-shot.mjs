// hadal-shot.mjs — headless boot + behavioral + screenshot QA for HADAL.
// Spawns vite, loads hadal.html, waits for window.HD.ready, asserts zero
// console/page errors, drives a dive (start → ping → warp → flare → leviathan),
// writes screenshots, exits nonzero on any error.
//
//   node scripts/hadal-shot.mjs [tag]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const TAG = process.argv[2] || 'qa';
const PORT = process.env.HD_PORT || 5187;

mkdirSync('dist/shots', { recursive: true });

const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js',
  '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
vite.stderr.on('data', d => process.stderr.write(`[vite] ${d}`));

let failed = false;
try {
  const base = `http://127.0.0.1:${PORT}`;
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try { up = (await fetch(`${base}/hadal.html`)).ok; } catch {}
    if (!up) await sleep(500);
  }
  if (!up) throw new Error('vite dev server did not come up');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto(`${base}/hadal.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.HD && window.HD.ready === true, { timeout: 60000 })
    .catch(() => errs.push('timeout: window.HD.ready never became true'));
  await sleep(1500);
  await page.screenshot({ path: `dist/shots/hadal-${TAG}-intro.png` });

  // start the dive, thrust down, ping — capture the wavefront painting the walls
  await page.evaluate(() => {
    window.HD.test.start();
    window.HD.test.steer(0, 0.55);       // nose down
    window.HD.test.thrust(1);
  });
  await sleep(2500);
  await page.evaluate(() => { window.HD.test.steer(0, 0); window.HD.test.thrust(0); window.HD.test.ping(); });
  await sleep(700); // wavefront ~40m out — mid-paint across the walls
  const s1 = await page.evaluate(() => window.HD.stats);
  console.log('[HD] after ping:', JSON.stringify(s1));
  await page.screenshot({ path: `dist/shots/hadal-${TAG}-ping.png` });

  // warp deep, provoke the leviathan, drop a flare and swim off it like a
  // player would, ping mid-flight so the wavefront is painting the walls
  await page.evaluate(() => {
    window.HD.test.warp(1500);
    window.HD.test.attention(95);
    window.HD.test.flare();
    window.HD.test.steer(0.1, 0.2);
    window.HD.test.thrust(1);
  });
  await sleep(2600);
  await page.evaluate(() => { window.HD.test.thrust(0); window.HD.test.steer(0, 0); window.HD.test.ping(); });
  await sleep(900);
  const s2 = await page.evaluate(() => ({ stats: window.HD.stats, lev: window.HD.test.levInfo(), logs: window.HD.test.logs() }));
  console.log('[HD] deep:', JSON.stringify(s2));
  await page.screenshot({ path: `dist/shots/hadal-${TAG}-deep.png` });
  if (!['APPROACH', 'STRIKE', 'LURK', 'FLEE'].includes(s2.lev.state)) errs.push(`leviathan never engaged (state=${s2.lev.state})`);
  if (s2.logs.found < 1) errs.push('no story logs recovered after warping to 1500m');

  // the ending: warp to just above the floor, sink the last metres, touchdown
  await page.evaluate(() => window.HD.test.warp(3190));
  await sleep(4000);
  const s3 = await page.evaluate(() => window.HD.stats);
  console.log('[HD] floor:', JSON.stringify(s3));
  if (s3.phase !== 'won') errs.push(`expected phase won at the floor, got ${s3.phase}`);
  await page.screenshot({ path: `dist/shots/hadal-${TAG}-end.png` });

  await browser.close();
  if (errs.length) {
    failed = true;
    console.error(`\n[HD] ${errs.length} ERROR(S):`);
    for (const e of errs) console.error('  - ' + e);
  } else {
    console.log('[HD] boot + dive + story + leviathan + ending all clean ✓');
  }
} catch (e) {
  failed = true;
  console.error('[HD] FATAL:', e);
} finally {
  vite.kill('SIGTERM');
  await sleep(300);
  process.exit(failed ? 1 : 0);
}
