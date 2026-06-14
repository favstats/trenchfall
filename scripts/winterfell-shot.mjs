// winterfell-shot.mjs — headless boot + screenshot QA for THE LONG NIGHT.
// Spawns the vite dev server, loads winterfell.html, waits for window.WF.ready,
// asserts zero console/page errors, writes a screenshot, exits nonzero on error.
//
//   node scripts/winterfell-shot.mjs [milestoneTag] [fidelity]
//   e.g. node scripts/winterfell-shot.mjs m0
//
// Headless Chromium usually lacks WebGPU, so this validates the WebGL2 fallback
// path and overall JS health — exactly what we need between milestones.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const TAG = process.argv[2] || 'm0';
const FIDELITY = process.argv[3] || '';
const PORT = process.env.WF_PORT || 5184;
const SETTLE = Number(process.env.WF_SETTLE || 4000);

mkdirSync('dist/shots', { recursive: true });

function startVite() {
  const proc = spawn(process.execPath, ['node_modules/vite/bin/vite.js',
    '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout.on('data', () => {});
  proc.stderr.on('data', d => process.stderr.write(`[vite] ${d}`));
  return proc;
}

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return true; } catch {}
    await sleep(500);
  }
  return false;
}

const vite = startVite();
let failed = false;
try {
  const base = `http://127.0.0.1:${PORT}`;
  if (!await waitForServer(`${base}/winterfell.html`)) {
    throw new Error('vite dev server did not come up');
  }

  const browser = await chromium.launch({
    args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'],
  });

  const extra = new URLSearchParams();
  if (FIDELITY) extra.set('fidelity', FIDELITY);
  if (process.env.WF_QUERY) for (const [k, v] of new URLSearchParams(process.env.WF_QUERY)) extra.set(k, v);

  // One boot per backend. Headless WebGPU can't be screenshotted (swapchain
  // readback fails under software rendering), so we capture the WebGL2 pass —
  // visually representative of the fallback path real users without WebGPU get.
  async function boot({ gl, capture }) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

    const q = new URLSearchParams(extra);
    if (gl) q.set('gl', '1');
    const qs = q.toString();
    await page.goto(`${base}/winterfell.html${qs ? `?${qs}` : ''}`,
      { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.WF && window.WF.ready === true, { timeout: 45000 })
      .catch(() => errs.push('timeout: window.WF.ready never became true'));
    await sleep(SETTLE);

    const info = await page.evaluate(() => ({
      backend: window.WF?.backend, fidelity: window.WF?.fidelity, stats: window.WF?.stats || null,
    }));
    console.log(`[WF] ${gl ? 'webgl2' : 'webgpu'} info:`, JSON.stringify(info));

    if (capture) {
      // exercise selection so rings/HUD show in the capture, then report squads
      const sq = await page.evaluate(() => {
        try { window.WF?.test?.selectAll?.(); } catch {}
        return window.WF?.test?.squads ? window.WF.test.squads() : null;
      });
      if (sq) console.log('[WF] squads:', JSON.stringify(sq));
      await sleep(400);
      const shot = `dist/shots/winterfell-${TAG}.png`;
      await page.screenshot({ path: shot, timeout: 60000 });
      console.log('[WF] screenshot:', shot);
    }
    await page.close();
    return errs;
  }

  const errs = [
    ...await boot({ gl: false, capture: false }), // WebGPU: error-check only
    ...await boot({ gl: true, capture: true }),    // WebGL2: error-check + screenshot
  ];

  await browser.close();

  if (errs.length) {
    failed = true;
    console.error(`\n[WF] ${errs.length} ERROR(S):`);
    for (const e of errs) console.error('  - ' + e);
  } else {
    console.log('[WF] both backends boot clean ✓');
  }
} catch (e) {
  failed = true;
  console.error('[WF] FATAL:', e);
} finally {
  vite.kill('SIGTERM');
  await sleep(300);
  process.exit(failed ? 1 : 0);
}
