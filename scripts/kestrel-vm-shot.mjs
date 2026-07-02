import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto('http://127.0.0.1:5183/kestrel.html?seed=12345', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(12000); // let the gun GLBs land
await page.evaluate(() => { KQA.lock(); KQA.god(); KQA.give(); });
for (const [slot, name] of [[1, 'smg-scar'], [3, 'dmr-sniper']]) {
  await page.evaluate(s => KQA.select(s), slot);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `/tmp/k-vm-${name}.png` });
}
console.log('errors:', errs.length ? errs.join('\n') : 'none');
await browser.close();
