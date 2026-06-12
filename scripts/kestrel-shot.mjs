import { chromium } from 'playwright';
const port = process.env.TF_PORT || 5183;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(`http://127.0.0.1:${port}/kestrel.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: '/tmp/kestrel-1.png', timeout: 120000 });

// drive the QA hook: corridor with rifle fired at a wall
await page.evaluate(() => {
  KQA.lock();
  KQA.tp(0, -2, 0.3, 0);
  KQA.fire();
});
await page.waitForTimeout(150);
await page.screenshot({ path: '/tmp/kestrel-2-fire.png', timeout: 120000 });
await page.waitForTimeout(1200);

// lounge
await page.evaluate(() => KQA.tp(-3.2, -22.5, Math.PI / 2 + 0.3, 0));
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/kestrel-3-lounge.png', timeout: 120000 });

// cargo with shotgun
await page.evaluate(() => { KQA.select(2); KQA.tp(3.2, -36.5, -Math.PI / 2 + 0.4, 0); });
await page.waitForTimeout(400);
await page.evaluate(() => KQA.fire());
await page.waitForTimeout(120);
await page.screenshot({ path: '/tmp/kestrel-4-cargo.png', timeout: 120000 });

// engine room with the dragon
await page.evaluate(() => { KQA.select(5); KQA.tp(0, -46.2, 0, 0); });
await page.waitForTimeout(400);
await page.evaluate(() => KQA.fire());
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/kestrel-5-engine.png', timeout: 120000 });

// bazooka + viewmodel check down the corridor
await page.evaluate(() => { KQA.select(7); KQA.tp(0, -4, 0, 0); });
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/kestrel-6-bazooka.png', timeout: 120000 });

const filtered = errs.filter(e => !/pointer\s*lock|PointerLock/i.test(e));
console.log('errors:', filtered.length ? filtered.join('\n') : 'none');
await browser.close();
