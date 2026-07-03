// deadweight-shot.mjs — full-game QA for DEADWEIGHT. Boots to the rig, takes a
// boon, descends, shoots a stray, tether-throws a crate INTO a stray (the core
// loop), clears the deck, drops the hatch, dies on deck 2 and confirms VESTA's
// debrief advances. Zero console errors or it fails.
//
//   node scripts/deadweight-shot.mjs [tag]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const TAG = process.argv[2] || 'qa';
const PORT = process.env.DW_PORT || 5191;
mkdirSync('dist/shots', { recursive: true });
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js',
  '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
vite.stderr.on('data', d => process.stderr.write(`[vite] ${d}`));

let failed = false;
try {
  const base = `http://127.0.0.1:${PORT}`;
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { try { up = (await fetch(`${base}/deadweight.html`)).ok; } catch {} if (!up) await sleep(500); }
  if (!up) throw new Error('vite did not come up');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto(`${base}/deadweight.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.DW && window.DW.ready === true, { timeout: 90000 })
    .catch(() => errs.push('timeout: DW.ready never true'));
  await sleep(1200);
  await page.screenshot({ path: `dist/shots/deadweight-${TAG}-rig.png` });

  // descend to deck 1
  await page.evaluate(() => window.DW.test.descend());
  await sleep(1500);
  const s0 = await page.evaluate(() => window.DW.stats);
  console.log('[DW] deck1:', JSON.stringify(s0));
  if (s0.phase !== 'dive') errs.push(`expected dive, got ${s0.phase}`);
  if (s0.strays < 3) errs.push(`expected strays, got ${s0.strays}`);
  if (s0.bodies < 20) errs.push(`floor feels empty (${s0.bodies} bodies)`);
  if (!s0.boons.length) errs.push('boon was not applied');
  await page.screenshot({ path: `dist/shots/deadweight-${TAG}-deck.png` });

  // the core loop: rifle a stray, then tether-throw a crate into one
  await page.evaluate(() => {
    const e = window.DW.test.strayInfo()[0];
    const p = window.DW.stats.pos;
    window.DW.test.look(Math.atan2(-(e.x - p[0]), -(e.z - p[2])), 0);
    window.DW.test.fire();
  });
  await sleep(400);
  const grabbed = await page.evaluate(() => window.DW.test.grabNearest());
  if (!grabbed) errs.push('tether found nothing to grab');
  await sleep(600);
  await page.screenshot({ path: `dist/shots/deadweight-${TAG}-tether.png` });
  const threw = await page.evaluate(() => window.DW.test.throwAtNearestStray());
  if (!threw) errs.push('could not throw at stray');
  await sleep(1500);
  const s1 = await page.evaluate(() => window.DW.stats);
  console.log('[DW] after throw:', JSON.stringify(s1));

  // clear the deck, hatch opens, drop through
  await page.evaluate(() => window.DW.test.slayAll());
  await sleep(400);
  const s2 = await page.evaluate(() => window.DW.stats);
  if (!s2.hatchOpen) errs.push('hatch did not open after clearing strays');
  if (s2.kills < 3) errs.push(`kills not counted (${s2.kills})`);
  await page.evaluate(() => window.DW.test.hatch());
  await page.waitForFunction(() => window.DW.stats.depth === 2, { timeout: 12000 })
    .catch(() => errs.push('did not descend to deck 2'));
  const s3 = await page.evaluate(() => window.DW.stats);
  console.log('[DW] deck2:', JSON.stringify(s3));
  await page.screenshot({ path: `dist/shots/deadweight-${TAG}-deck2.png` });

  // die: the plot advances
  await page.evaluate(() => window.DW.test.die());
  await page.waitForFunction(() => window.DW.stats.phase === 'rig', { timeout: 12000 })
    .catch(() => errs.push('death did not return to the rig'));
  const s4 = await page.evaluate(() => window.DW.stats);
  console.log('[DW] reprint:', JSON.stringify(s4));
  if (s4.deaths !== 1) errs.push(`deaths should be 1, got ${s4.deaths}`);
  await sleep(2500);
  await page.screenshot({ path: `dist/shots/deadweight-${TAG}-reprint.png` });

  await browser.close();
  if (errs.length) { failed = true; console.error(`\n[DW] ${errs.length} ERROR(S):`); for (const e of errs) console.error('  - ' + e); }
  else console.log('[DW] rig + descend + rifle + tether-throw + hatch + death-loop clean ✓');
} catch (e) { failed = true; console.error('[DW] FATAL:', e); }
finally { vite.kill('SIGTERM'); await sleep(300); process.exit(failed ? 1 : 0); }
