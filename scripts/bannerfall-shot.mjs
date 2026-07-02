// bannerfall-shot.mjs — headless QA for BANNERFALL. Boots, starts the first
// field, wades the captain into the enemy line, swings until things come
// apart, checks orders + dismemberment counters, resolves the battle, buys
// troops, and starts field 2. Zero console errors or it fails.
//
//   node scripts/bannerfall-shot.mjs [tag]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const TAG = process.argv[2] || 'qa';
const PORT = process.env.BF_PORT || 5189;

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
    try { up = (await fetch(`${base}/bannerfall.html`)).ok; } catch {}
    if (!up) await sleep(500);
  }
  if (!up) throw new Error('vite dev server did not come up');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto(`${base}/bannerfall.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.BF && window.BF.ready === true, { timeout: 60000 })
    .catch(() => errs.push('timeout: window.BF.ready never became true'));
  await sleep(1500);
  await page.screenshot({ path: `dist/shots/bannerfall-${TAG}-menu.png` });

  // sandbox map → ride to a warband → take the field
  await page.evaluate(() => window.BF.test.start());
  await sleep(800);
  await page.screenshot({ path: `dist/shots/bannerfall-${TAG}-map.png` });
  await page.evaluate(() => window.BF.test.fight());
  await sleep(2500);
  const s0 = await page.evaluate(() => window.BF.stats);
  console.log('[BF] field:', JSON.stringify(s0));
  if (s0.phase !== 'battle') errs.push(`expected battle phase, got ${s0.phase}`);
  if (s0.allies < 10 || s0.enemies < 10) errs.push(`armies too small (${s0.allies} v ${s0.enemies})`);
  await page.screenshot({ path: `dist/shots/bannerfall-${TAG}-field.png` });

  // wade in: step to the nearest foe and swing until the counters move
  await page.evaluate(() => window.BF.test.order('charge'));
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => { window.BF.test.melee(); window.BF.test.slayArc(60); });
    await sleep(350);
  }
  const g1 = await page.evaluate(() => window.BF.test.gore());
  console.log('[BF] gore:', JSON.stringify(g1));
  if (g1.kills < 3) errs.push(`expected kills from swinging, got ${g1.kills}`);
  if (g1.dismembered < 1) errs.push(`expected dismemberment, got ${g1.dismembered}`);
  await sleep(600);
  await page.screenshot({ path: `dist/shots/bannerfall-${TAG}-gore.png` });

  // orders + mount
  await page.evaluate(() => window.BF.test.order('hold'));
  const ord = await page.evaluate(() => window.BF.stats.order);
  if (ord !== 'hold') errs.push(`order did not take (${ord})`);
  const mounted = await page.evaluate(() => window.BF.test.mount());
  if (!mounted) errs.push('could not mount the horse');

  // resolve the field
  await page.evaluate(() => window.BF.test.killEnemies());
  await page.waitForFunction(() => window.BF.stats.phase === 'end', { timeout: 15000 })
    .catch(() => errs.push('battle did not resolve to end screen'));
  const s2 = await page.evaluate(() => window.BF.stats);
  console.log('[BF] end:', JSON.stringify(s2));
  if (s2.gold <= 0) errs.push(`no gold paid out (${s2.gold})`);
  await page.screenshot({ path: `dist/shots/bannerfall-${TAG}-victory.png` });

  // buy troops, march on to field 2
  const foot = await page.evaluate(() => window.BF.test.buy('foot'));
  if (foot < 20) errs.push(`buying footmen did not grow the roster (${foot})`);
  await page.evaluate(() => window.BF.test.next());
  await sleep(600);
  await page.evaluate(() => window.BF.test.fight());
  await sleep(2000);
  const s3 = await page.evaluate(() => window.BF.stats);
  console.log('[BF] field2:', JSON.stringify(s3));
  if (s3.phase !== 'battle') errs.push(`second sandbox battle did not start (phase=${s3.phase})`);
  await page.screenshot({ path: `dist/shots/bannerfall-${TAG}-field2.png` });

  await browser.close();
  if (errs.length) {
    failed = true;
    console.error(`\n[BF] ${errs.length} ERROR(S):`);
    for (const e of errs) console.error('  - ' + e);
  } else {
    console.log('[BF] boot + battle + gore + orders + horse + victory + shop + field2 clean ✓');
  }
} catch (e) {
  failed = true;
  console.error('[BF] FATAL:', e);
} finally {
  vite.kill('SIGTERM');
  await sleep(300);
  process.exit(failed ? 1 : 0);
}
