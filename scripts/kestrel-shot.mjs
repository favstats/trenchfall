import { chromium } from 'playwright';
const port = process.env.TF_PORT || 5183;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(`http://127.0.0.1:${port}/kestrel.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(7000); // let attract mode drift a bit
await page.screenshot({ path: '/tmp/kestrel-1.png', timeout: 120000 });
await page.waitForTimeout(9000);
await page.screenshot({ path: '/tmp/kestrel-2.png', timeout: 120000 });
console.log('errors:', errs.length ? errs.join('\n') : 'none');
await browser.close();
