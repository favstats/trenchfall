import { chromium } from 'playwright';
const port = process.env.TF_PORT || 5183;
const seed = process.env.KSEED || 12345;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(`http://127.0.0.1:${port}/kestrel.html?seed=${seed}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: '/tmp/k-1-title.png', timeout: 120000 });

const info = await page.evaluate(() => {
  KQA.lock(); KQA.god();
  return { rooms: KQA.rooms(), species: KQA.species(), ents: KQA.ents() };
});
console.log('SPECIES:', JSON.stringify(info.species, null, 1));
console.log('ROOMS:', info.rooms.map(r => r.kind).join(','));
console.log('ENTS:', info.ents.length);
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/k-2-start.png', timeout: 120000 });

// visit each weird room kind present
const weird = info.rooms.filter(r => ['garden', 'archive', 'chapel', 'static', 'pool', 'dark', 'engine', 'exit'].includes(r.kind)).slice(0, 4);
for (let i = 0; i < weird.length; i++) {
  await page.evaluate(r => KQA.tp(r.x, r.z + 3.5, 0, 0), weird[i]);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `/tmp/k-room-${i}-${weird[i].kind}.png`, timeout: 120000 });
}
// face the nearest entity
const e0 = info.ents.find(e => !e.fr);
if (e0) {
  await page.evaluate(e => {
    KQA.tp(e.x + 3, e.z + 3, Math.atan2(3, 3), 0);
    KQA.give();
  }, e0);
  await page.waitForTimeout(800);
  await page.evaluate(() => KQA.fire());
  await page.waitForTimeout(150);
  await page.screenshot({ path: '/tmp/k-4-entity.png', timeout: 120000 });
}
// map overlay
await page.evaluate(() => KQA.map());
await page.waitForTimeout(300);
await page.screenshot({ path: '/tmp/k-5-map.png', timeout: 120000 });

// descend to deck 3: palette + weird rooms check
for (let d = 0; d < 2; d++) {
  await page.evaluate(() => KQA.descend());
  await page.waitForTimeout(7000);
  await page.evaluate(() => { KQA.lock(); KQA.god(); });
}
const deep = await page.evaluate(() => ({ rooms: KQA.rooms(), species: KQA.species() }));
console.log('DECK3 ROOMS:', deep.rooms.map(r => r.kind).join(','));
console.log('DECK3 SPECIES:', deep.species.map(s => `${s.name}[${s.body}/${s.loco}/${s.quirk}/${s.attack}]`).join(' '));
const w3 = deep.rooms.find(r => ['garden','archive','chapel','static','pool'].includes(r.kind)) || deep.rooms[2];
await page.evaluate(r => KQA.tp(r.x, r.z + 3.5, 0, 0), w3);
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/k-6-deck3-' + w3.kind + '.png', timeout: 120000 });

const filtered = errs.filter(e => !/pointer\s*lock/i.test(e));
console.log('errors:', filtered.length ? filtered.join('\n') : 'none');
await browser.close();
