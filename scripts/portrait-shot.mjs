import { chromium } from 'playwright';
const port = process.env.TF_PORT || 5183;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto(`http://127.0.0.1:${port}/kestrel.html?seed=4242`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(8000); // world + rig pack
const archs = ['zombie', 'stalker', 'widow', 'centipede', 'marionette', 'brute', 'shrike',
  'lampkeeper', 'barterer', 'gifter', 'warden'];
for (const arch of archs) {
  const name = await page.evaluate(a => {
    KQA.lock(); KQA.god();
    const n = KQA.portrait(a);
    const r = KQA.rooms()[0];
    const dist = a === 'stalker' ? 3.25 : a === 'widow' || a === 'centipede' ? 3.15
      : a === 'brute' || a === 'zombie' || a === 'shrike' || a === 'warden' ? 2.75 : 2.55;
    const pitch = a === 'stalker' || a === 'zombie' || a === 'shrike' || a === 'warden' ? .1 : -.02;
    KQA.tp(r.x + .9, r.z - 1.0 + dist, .3, pitch);
    return n;
  }, arch);
  console.log(arch, '->', name);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `/tmp/kp-${arch}.png` });
}
console.log('errors:', errs.filter(e => !/pointer/i.test(e)).join('\n') || 'none');
await browser.close();
