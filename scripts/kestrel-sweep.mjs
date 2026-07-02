/* multi-seed sweep: hunt the new surreal rooms, torch shadows, and the zoo */
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

const wanted = new Set(['orrery', 'hands', 'antigrav']);
const seen = new Set();
for (const seed of [7, 99, 4242, 31337, 555]) {
  await page.goto(`http://127.0.0.1:5183/kestrel.html?seed=${seed}&d=2`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6500);
  const rooms = await page.evaluate(() => { KQA.lock(); KQA.god(); return KQA.rooms(); });
  console.log(`seed ${seed}:`, rooms.map(r => r.kind).join(','));
  for (const kind of wanted) {
    if (seen.has(kind)) continue;
    const r = rooms.find(r2 => r2.kind === kind);
    if (!r) continue;
    seen.add(kind);
    await page.evaluate(r2 => KQA.tp(r2.x, r2.z + 3.2, 0, .06), r);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `/tmp/ks-${kind}.png` });
  }
  if (seen.size === wanted.size) break;
}
console.log('captured:', [...seen].join(',') || 'none');

// torch shadows in a dark room
await page.goto('http://127.0.0.1:5183/kestrel.html?seed=12345', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6500);
const rooms = await page.evaluate(() => { KQA.lock(); KQA.god(); KQA.torch(); return KQA.rooms(); });
const darkR = rooms.find(r => r.kind === 'dark') || rooms[2];
const ent = await page.evaluate(r => {
  const e = KQA.ents().find(e2 => !e2.fr);
  if (e) KQA.tp(e.x + 3.5, e.z + 3.5, Math.atan2(3.5, 3.5), 0);
  else KQA.tp(r.x, r.z + 3.5, 0, 0);
  return e;
}, darkR);
await page.waitForTimeout(700);
await page.screenshot({ path: '/tmp/ks-torch.png' });
console.log('torch shot near:', JSON.stringify(ent));

// the zoo: every silhouette lined up (they stand at start.z - 2, facing +z)
await page.evaluate(() => { KQA.torch(); KQA.zoo(); KQA.friendZoo && KQA.friendZoo(); });
await page.waitForTimeout(1500);
const zr = rooms.find(r => r.kind === 'start');
await page.evaluate(r => KQA.tp(r.x, r.z + 3.0, 0, .05), zr);
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/ks-zoo.png' });

console.log('errors:', errs.filter(e => !/pointer\s*lock/i.test(e)).join('\n') || 'none');
await browser.close();
