// noclip-shot.mjs — headless boot + behavioral + screenshot QA for NOCLIP.
// Boots, walks the yellow rooms, descends to the garage, spawns the Grin and
// looks at it, descends to the poolrooms, wins at the red door. Asserts zero
// console errors and the full phase arc; writes screenshots per zone.
//
//   node scripts/noclip-shot.mjs [tag]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const TAG = process.argv[2] || 'qa';
const PORT = process.env.NC_PORT || 5188;

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
    try { up = (await fetch(`${base}/noclip.html`)).ok; } catch {}
    if (!up) await sleep(500);
  }
  if (!up) throw new Error('vite dev server did not come up');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto(`${base}/noclip.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.NC && window.NC.ready === true, { timeout: 60000 })
    .catch(() => errs.push('timeout: window.NC.ready never became true'));
  await sleep(1200);
  await page.screenshot({ path: `dist/shots/noclip-${TAG}-intro.png` });

  // yellow rooms: walk forward, look around
  await page.evaluate(() => { window.NC.test.start(); window.NC.test.look(-0.7, 0.02); window.NC.test.move(1); });
  await sleep(2600);
  await page.evaluate(() => window.NC.test.move(0));
  await sleep(400);
  const s0 = await page.evaluate(() => window.NC.stats);
  console.log('[NC] yellow:', JSON.stringify(s0));
  if (s0.walked < 3) errs.push('player did not move in the yellow rooms');
  await page.screenshot({ path: `dist/shots/noclip-${TAG}-yellow.png` });

  // descend to the garage, spawn the Grin ahead and look at it
  await page.evaluate(() => { window.NC.test.descend(); });
  await sleep(1200);
  await page.evaluate(() => {
    window.NC.test.look(-2.2, 0);                 // face into the column field
    window.NC.test.entityAt(-38.5, -28);          // midpoint between fixtures = dark
  });
  await sleep(1500);
  const s1 = await page.evaluate(() => window.NC.stats);
  console.log('[NC] garage:', JSON.stringify(s1));
  if (s1.zone !== 1) errs.push(`expected zone 1, got ${s1.zone}`);
  if (s1.entity !== 'STALK') errs.push(`entity did not stalk (state=${s1.entity})`);
  await page.screenshot({ path: `dist/shots/noclip-${TAG}-garage.png` });

  // a touch costs tape integrity
  await page.evaluate(() => window.NC.test.touch());
  await sleep(600);
  const s2 = await page.evaluate(() => window.NC.stats);
  if (s2.tape !== 2) errs.push(`tape integrity should be 2 after touch, got ${s2.tape}`);
  await page.screenshot({ path: `dist/shots/noclip-${TAG}-skip.png` });

  // poolrooms: descend, look across the water, then walk out the red door
  await page.evaluate(() => { window.NC.test.descend(); window.NC.test.look(-2.2, -0.04); });
  await sleep(1500);
  const s3 = await page.evaluate(() => window.NC.stats);
  console.log('[NC] pool:', JSON.stringify(s3));
  if (s3.zone !== 2) errs.push(`expected zone 2, got ${s3.zone}`);
  await page.screenshot({ path: `dist/shots/noclip-${TAG}-pool.png` });

  await page.evaluate(() => window.NC.test.exit());
  await sleep(900);
  const s4 = await page.evaluate(() => window.NC.stats);
  console.log('[NC] end:', JSON.stringify(s4));
  if (s4.phase !== 'won') errs.push(`expected phase won at the red door, got ${s4.phase}`);
  await page.screenshot({ path: `dist/shots/noclip-${TAG}-end.png` });

  await browser.close();
  if (errs.length) {
    failed = true;
    console.error(`\n[NC] ${errs.length} ERROR(S):`);
    for (const e of errs) console.error('  - ' + e);
  } else {
    console.log('[NC] boot + walk + descend + entity + skip + ending all clean ✓');
  }
} catch (e) {
  failed = true;
  console.error('[NC] FATAL:', e);
} finally {
  vite.kill('SIGTERM');
  await sleep(300);
  process.exit(failed ? 1 : 0);
}
