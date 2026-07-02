// noclip-shot.mjs — headless boot + behavioral + screenshot QA for NOCLIP.
// Walks all five levels: yellow rooms → level fun → garage (entity + touch +
// almond water) → poolrooms → red hall chase → the white door. Asserts zero
// console errors and the full arc; writes a screenshot per level.
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

  // L0 yellow rooms: walk, look (wait on distance, not wall-clock — headless
  // frame time stretches sim time)
  await page.evaluate(() => { window.NC.test.start(); window.NC.test.look(-0.7, 0.02); window.NC.test.move(1); });
  await page.waitForFunction(() => window.NC.stats.walked >= 4, { timeout: 15000 })
    .catch(() => errs.push('player did not move in the yellow rooms'));
  await page.evaluate(() => window.NC.test.move(0));
  await sleep(400);
  const s0 = await page.evaluate(() => window.NC.stats);
  console.log('[NC] yellow:', JSON.stringify(s0));
  await page.screenshot({ path: `dist/shots/noclip-${TAG}-yellow.png` });

  // L1 level fun: look across the party
  await page.evaluate(() => { window.NC.test.descend(); window.NC.test.look(-0.9, 0.04); });
  await sleep(1400);
  const s1 = await page.evaluate(() => window.NC.stats);
  console.log('[NC] fun:', JSON.stringify(s1));
  if (s1.zone !== 1) errs.push(`expected zone 1, got ${s1.zone}`);
  await page.screenshot({ path: `dist/shots/noclip-${TAG}-fun.png` });

  // L2 garage: entity in a dark gap, then a touch (tape 3 -> 2), then water
  await page.evaluate(() => {
    window.NC.test.descend();
    window.NC.test.look(-2.2, 0);
    window.NC.test.entityAt(-38.5, -28, 'grin');
  });
  await sleep(1500);
  const s2 = await page.evaluate(() => window.NC.stats);
  console.log('[NC] garage:', JSON.stringify(s2));
  if (s2.zone !== 2) errs.push(`expected zone 2, got ${s2.zone}`);
  if (s2.entity !== 'STALK') errs.push(`entity did not stalk (state=${s2.entity})`);
  await page.screenshot({ path: `dist/shots/noclip-${TAG}-garage.png` });
  await page.evaluate(() => window.NC.test.touch());
  await sleep(500);
  let tape = await page.evaluate(() => window.NC.stats.tape);
  if (tape !== 2) errs.push(`tape should be 2 after touch, got ${tape}`);
  await page.evaluate(() => window.NC.test.pickup());
  await sleep(700);
  tape = await page.evaluate(() => window.NC.stats.tape);
  const water = await page.evaluate(() => window.NC.stats.water);
  if (tape !== 3 || water !== 1) errs.push(`almond water should restore tape (tape=${tape}, water=${water})`);

  // L3 poolrooms: the mannequin pool
  await page.evaluate(() => { window.NC.test.descend(); window.NC.test.look(2.2, -0.02); });
  await sleep(1400);
  const s3 = await page.evaluate(() => window.NC.stats);
  console.log('[NC] pool:', JSON.stringify(s3));
  if (s3.zone !== 3) errs.push(`expected zone 3, got ${s3.zone}`);
  await page.screenshot({ path: `dist/shots/noclip-${TAG}-pool.png` });

  // L4 red hall: cross the trigger, confirm the chase, outrun it. Headless
  // frame-time stretches sim time (dt clamp), so wait FOR the chase, not a
  // fixed wall-clock guess.
  await page.evaluate(() => { window.NC.test.descend(); window.NC.test.look(-Math.PI / 2, 0); window.NC.test.move(1); window.NC.test.sprint(true); });
  await page.waitForFunction(() => window.NC.stats.chase === true, { timeout: 20000 })
    .catch(() => errs.push('chase never started in the red hall'));
  const s4 = await page.evaluate(() => window.NC.stats);
  console.log('[NC] redhall:', JSON.stringify(s4));
  if (s4.zone !== 4) errs.push(`expected zone 4, got ${s4.zone}`);
  if (s4.chase && s4.entityMode !== 'chaser') errs.push(`expected chaser, got ${s4.entityMode}`);
  await page.evaluate(() => window.NC.test.look(Math.PI / 2, 0)); // glance back at it
  await sleep(300);
  await page.screenshot({ path: `dist/shots/noclip-${TAG}-redhall.png` });
  await page.evaluate(() => { window.NC.test.look(-Math.PI / 2, 0); window.NC.test.move(0); window.NC.test.sprint(false); });

  // the white door
  await page.evaluate(() => window.NC.test.exit());
  await sleep(900);
  const s5 = await page.evaluate(() => window.NC.stats);
  console.log('[NC] end:', JSON.stringify(s5));
  if (s5.phase !== 'won') errs.push(`expected phase won at the white door, got ${s5.phase}`);
  await page.screenshot({ path: `dist/shots/noclip-${TAG}-end.png` });

  await browser.close();
  if (errs.length) {
    failed = true;
    console.error(`\n[NC] ${errs.length} ERROR(S):`);
    for (const e of errs) console.error('  - ' + e);
  } else {
    console.log('[NC] all five levels + entity + water + chase + ending clean ✓');
  }
} catch (e) {
  failed = true;
  console.error('[NC] FATAL:', e);
} finally {
  vite.kill('SIGTERM');
  await sleep(300);
  process.exit(failed ? 1 : 0);
}
