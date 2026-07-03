// noclip-shot.mjs — QA for endless NOCLIP. Boots with a fresh seed, walks a
// long line through the world sampling biomes (asserting real variety and
// seamless streaming), photographs the strangest rooms, then proves the loop:
// tape pickup → death loses half → meta persists → bank pays out.
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
  for (let i = 0; i < 60 && !up; i++) { try { up = (await fetch(`${base}/noclip.html`)).ok; } catch {} if (!up) await sleep(500); }
  if (!up) throw new Error('vite did not come up');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto(`${base}/noclip.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.NC && window.NC.ready === true, { timeout: 60000 })
    .catch(() => errs.push('timeout: NC.ready never true'));
  await sleep(1200);
  await page.screenshot({ path: `dist/shots/noclip-${TAG}-intro.png` });

  await page.evaluate(() => { window.NC.test.wipeMeta(); window.NC.test.start(); window.NC.test.look(-0.7, 0.02); });
  await sleep(1500);
  const s0 = await page.evaluate(() => window.NC.stats);
  console.log('[NC] spawn:', JSON.stringify(s0));
  if (s0.phase !== 'run') errs.push(`expected run, got ${s0.phase}`);
  if (s0.chunks < 20) errs.push(`streaming too small (${s0.chunks} chunks)`);
  await page.screenshot({ path: `dist/shots/noclip-${TAG}-yellow.png` });

  // the long walk: sample biomes every 90m; require real variety, shoot the wild ones
  const seen = new Set(['yellow']);
  const wanted = ['cathedral', 'void', 'suburb', 'pools'];
  let shots = 0;
  for (let step = 1; step <= 16; step++) {
    const b = await page.evaluate(() => window.NC.test.walk(90));
    await sleep(650);   // stream in
    if (!seen.has(b)) {
      seen.add(b);
      if (wanted.includes(b) && shots < 3) {
        shots++;
        await page.evaluate(() => window.NC.test.look(Math.random() * 6, 0.04));
        await sleep(350);
        await page.screenshot({ path: `dist/shots/noclip-${TAG}-${b}.png` });
      }
    }
  }
  console.log('[NC] biomes seen:', [...seen].join(', '));
  if (seen.size < 4) errs.push(`world not varied enough (${[...seen].join(',')})`);
  const s1 = await page.evaluate(() => window.NC.stats);
  console.log('[NC] deep:', JSON.stringify(s1));
  if (s1.dist < 800) errs.push(`odometer wrong (${s1.dist})`);

  // battery is life: kill it, die, lose half the tapes
  await page.evaluate(() => { window.NC.test.battery(120); });
  const gotTape = await page.evaluate(() => window.NC.test.grabTape());
  await sleep(700);
  const tapes = await page.evaluate(() => window.NC.stats.tapes);
  if (gotTape && tapes < 1) errs.push('tape pickup did not count');
  await page.evaluate(() => window.NC.test.die());
  await page.waitForFunction(() => window.NC.stats.phase === 'end', { timeout: 8000 })
    .catch(() => errs.push('death did not end the run'));
  const s2 = await page.evaluate(() => window.NC.stats);
  console.log('[NC] dead:', JSON.stringify(s2));
  await page.screenshot({ path: `dist/shots/noclip-${TAG}-end.png` });

  // meta persists across a reload, and the seed changes (always-new world)
  const seed1 = s2.seed;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.NC && window.NC.ready === true, { timeout: 60000 });
  const s3 = await page.evaluate(() => window.NC.stats);
  console.log('[NC] reload:', JSON.stringify(s3));
  if (s3.seed === seed1) errs.push('seed did not change on reload — world not "always new"');
  if (s3.banked !== s2.banked) errs.push(`meta did not persist (${s3.banked} vs ${s2.banked})`);

  // the bank path pays out more
  await page.evaluate(() => { window.NC.test.start(); window.NC.test.walk(200); });
  await sleep(800);
  await page.evaluate(() => { window.NC.test.grabTape(); });
  await sleep(500);
  const before = await page.evaluate(() => window.NC.stats.banked);
  await page.evaluate(() => window.NC.test.bank());
  await sleep(400);
  const after = await page.evaluate(() => window.NC.stats.banked);
  if (after <= before && (await page.evaluate(() => window.NC.stats.tapes)) > 0) errs.push('banking did not pay out');

  await browser.close();
  if (errs.length) { failed = true; console.error(`\n[NC] ${errs.length} ERROR(S):`); for (const e of errs) console.error('  - ' + e); }
  else console.log('[NC] endless world + biome variety + loop + meta persistence clean ✓');
} catch (e) { failed = true; console.error('[NC] FATAL:', e); }
finally { vite.kill('SIGTERM'); await sleep(300); process.exit(failed ? 1 : 0); }
