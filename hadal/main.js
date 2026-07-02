// HADAL — the trench remembers light. Boot, game loop, module wiring.
// Sound is sight; light is a debt; the bottom is a promise.
import { createRenderer } from './engine/renderer.js';
import { createSonar } from './sonar.js';
import { buildTrench, BOTTOM_Y, depthOf, VENTS, axisAt } from './world/trench.js';
import { createLife } from './world/life.js';
import { Leviathan } from './world/leviathan.js';
import { createGodRays, createShoal } from './world/showpieces.js';
import { createStory } from './story.js';
import { Sub } from './sub.js';
import { createHUD } from './ui/hud.js';
import {
  initAudio, sfxCreak, sfxChime, sfxFlare, sfxThump, sfxImplode, sfxWin,
  setBoost, setDepthRumble,
} from './engine/audio.js';

const canvas = document.getElementById('gl');
const hudRoot = document.getElementById('hud');
window.HD = { ready: false, stats: {}, test: {} };

const R = createRenderer(canvas);
const sonar = createSonar(R.scene);
const trench = buildTrench(R.scene, sonar.uniforms);
const life = createLife(R.scene, sonar.uniforms);
const lev = new Leviathan(R.scene, sonar.uniforms);
const godRays = createGodRays(R.scene);
const shoal = createShoal(R.scene, sonar.uniforms);
const sub = new Sub(R.scene, R.camera, sonar.uniforms);
initAudio();

// ---------------- game state ----------------
const G = {
  phase: 'intro',            // intro | dive | won | lost
  time: 0,
  hull: 100, battery: 100, flares: 6,
  attention: 0,              // how loud you have been
  pingCd: 0, pings: 0, strikes: 0,
  maxDepth: depthOf(0),
  nearVent: false, wasNearVent: false,
  heartT: 0,
};

const ZONES = [
  { d: 380, t: 'MIDNIGHT', s: 'no sun has ever been here' },
  { d: 1200, t: 'ABYSSAL', s: 'the pressure sings against the hull' },
  { d: 2300, t: 'HADAL', s: 'the trench remembers light' },
  { d: 3050, t: 'THE FLOOR', s: 'something down here is glowing' },
];
let nextZone = 0;

function startDive() {
  if (G.phase !== 'intro') return;
  G.phase = 'dive';
  sub.brake = false;           // the intro holds her on the drogue; cut it loose
  hud.zone('TWILIGHT', 'the last of the light — dive');
}
const hud = createHUD(hudRoot, { onStart: startDive });
const story = createStory(R.scene, hud);

// ---------------- actions ----------------
function doPing() {
  if (G.phase !== 'dive' || G.pingCd > 0) return;
  G.pingCd = 1.4;
  G.pings++;
  G.battery = Math.max(0, G.battery - 1.2);
  G.attention = Math.min(100, G.attention + 16);
  sonar.ping(sub.pos.x, sub.pos.y, sub.pos.z);
  lev.hearPing();
}

function doFlare() {
  if (G.phase !== 'dive' || G.flares <= 0) return;
  const f = life.dropFlare(
    sub.pos.x - sub.aim.x * 4,
    sub.pos.y - sub.aim.y * 4 - 1.5,
    sub.pos.z - sub.aim.z * 4);
  if (!f) return;
  G.flares--;
  G.attention = Math.min(100, G.attention + 6); // the fizz carries
  sfxFlare();
}

lev.onStrike = () => {
  G.hull -= 26;
  G.strikes++;
  G.attention = 25;
  sub.addShake(1.3);
  hud.hurt();
};
lev.onEatFlare = () => { G.attention = Math.max(0, G.attention - 30); sfxChime(); };

// ---------------- input ----------------
window.addEventListener('mousemove', e => {
  const nx = (e.clientX / window.innerWidth) * 2 - 1;
  const ny = (e.clientY / window.innerHeight) * 2 - 1;
  const dead = (v) => Math.abs(v) < 0.08 ? 0 : (v - Math.sign(v) * 0.08) / 0.92;
  sub.steer.x = dead(Math.max(-1, Math.min(1, nx)));
  sub.steer.y = dead(Math.max(-1, Math.min(1, ny)));
});
canvas.addEventListener('mousedown', e => { if (e.button === 0) doPing(); });
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'w') sub.thrust = 1;
  if (k === 's') sub.brake = true;
  if (k === 'shift') sub.boost = true;
  if (k === ' ') { doPing(); e.preventDefault(); }
  if (k === 'f') sub.lampOn = !sub.lampOn;
  if (k === 'e') doFlare();
  if (k === 'r' && (G.phase === 'won' || G.phase === 'lost')) location.reload();
});
window.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (k === 'w') sub.thrust = 0;
  if (k === 's') sub.brake = false;
  if (k === 'shift') sub.boost = false;
});
window.addEventListener('resize', R.setSize);

// ---------------- endings ----------------
function endWon() { G.phase = 'won'; sfxWin(); hud.showEnd(statsFor(), true); }
function endLost() { G.phase = 'lost'; sfxImplode(); sub.addShake(1.6); hud.showEnd(statsFor(), false); }
function statsFor() {
  return {
    depth: depthOf(sub.pos.y), maxDepth: G.maxDepth, time: G.time,
    pings: G.pings, strikes: G.strikes, logs: story.found, logsTotal: story.total,
  };
}

// ---------------- loop ----------------
let last = performance.now();
let creakT = 0;

function frame(now) {
  const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
  last = now;
  const depth = depthOf(sub.pos.y);
  const playing = G.phase === 'dive';

  if (G.phase === 'intro') { sub.brake = true; sub.thrust = 0; } // drift gently behind the card

  if (playing) {
    G.time += dt;
    G.maxDepth = Math.max(G.maxDepth, depth);

    // ---- zone crossings ----
    if (nextZone < ZONES.length && depth >= ZONES[nextZone].d) {
      hud.zone(ZONES[nextZone].t, ZONES[nextZone].s);
      sfxChime();
      nextZone++;
    }

    // ---- power budget ----
    const boosting = sub.boost && sub.thrust > 0 && G.battery > 0;
    if (G.battery <= 0) { sub.lampOn = false; sub.boost = false; }
    G.battery = Math.min(100, G.battery
      + dt * (0.45 - (sub.lampOn ? 0.7 : 0) - (boosting ? 4 : 0)));
    setBoost(boosting);

    // ---- noise: how interesting you are ----
    G.attention = Math.max(0, Math.min(100, G.attention
      + dt * ((sub.thrust > 0 ? 2.2 : 0) + (boosting ? 7 : 0) + (sub.lampOn ? 0.8 : 0)
      - (G.nearVent ? 12 : 4.2))));

    // ---- vents: warm, loud with minerals, safe ----
    G.nearVent = VENTS.some(v =>
      Math.abs(v.y - sub.pos.y) < 30 && Math.hypot(v.x - sub.pos.x, v.z - sub.pos.z) < 26);
    if (G.nearVent) {
      G.battery = Math.min(100, G.battery + dt * 9);
      G.hull = Math.min(100, G.hull + dt * 2);
      if (!G.wasNearVent) sfxChime();
    }
    G.wasNearVent = G.nearVent;

    // ---- collisions with the wall you maybe didn't ping ----
    const hit = trench.collide(sub.pos, sub.vel);
    if (hit && hit.speed > 4.5) {
      G.hull -= (hit.speed - 4.5) * 2.6;
      G.attention = Math.min(100, G.attention + hit.speed * 1.4);
      sub.addShake(0.25 + hit.speed * 0.04);
      hud.hurt();
      sfxCreak();
    } else if (hit && creakT <= 0) { creakT = 0.7; sfxCreak(); }
    creakT -= dt;

    // ---- the leviathan ----
    lev.update(dt, { sub: sub.pos, depth, attention: G.attention, flares: life.flares, nearVent: G.nearVent });

    // ---- heartbeat when it is close and interested ----
    const presence = presenceOf();
    if (presence > 0.72) {
      G.heartT -= dt;
      if (G.heartT <= 0) { G.heartT = Math.max(0.45, 1.05 - presence * 0.5); sfxThump(); }
    }

    // ---- endings ----
    if (sub.pos.y <= BOTTOM_Y + 5) {
      if (-sub.vel.y > 10) { G.hull -= 20; sub.vel.y *= -0.3; sub.addShake(0.8); hud.hurt(); sfxCreak(); }
      if (G.hull > 0) endWon();
    }
    if (G.hull <= 0) endLost();

    G.pingCd = Math.max(0, G.pingCd - dt);
  }

  // ---- flare lights feed the shared shader block ----
  const fl = sonar.uniforms.uFlares.value;
  let fi = 0;
  for (const f of life.flares) {
    if (fi >= 3) break;
    if (f.active && !f.eaten) { fl[fi++].set(f.x, f.y, f.z, Math.min(1, f.life / 4)); }
  }
  for (; fi < 3; fi++) fl[fi].w = 0;

  // ---- world always breathes, even on the end screens ----
  sonar.update(dt);
  sub.update(dt);
  trench.update(dt, sub.pos.y);
  life.update(dt, sub.pos);
  godRays.update(dt, depth);
  shoal.update(dt, { sub: sub.pos, levHead: lev.head, pings: sonar.uniforms.uPings.value, time: sonar.uniforms.uTime.value });
  story.update(dt, sub.pos, depth, playing);
  if (!playing && G.phase !== 'intro') lev.update(dt, { sub: sub.pos, depth, attention: 0, flares: life.flares, nearVent: false });
  if (G.phase === 'intro') lev.update(dt, { sub: sub.pos, depth: 0, attention: 0, flares: life.flares, nearVent: false });
  R.setDepthK(depth / 1600);
  setDepthRumble(Math.min(1, depth / 2800));

  hud.update({
    depth, rate: -sub.vel.y, hull: G.hull, battery: G.battery, flares: G.flares,
    presence: presenceOf(), pingCd: G.pingCd / 1.4, nearVent: G.nearVent,
  }, dt);

  window.HD.stats = {
    phase: G.phase, depth: Math.round(depth), rate: +(-sub.vel.y).toFixed(1),
    hull: Math.round(G.hull), battery: Math.round(G.battery),
    attention: Math.round(G.attention), presence: +presenceOf().toFixed(2),
    lev: { state: lev.state, dist: Math.round(lev.distTo(sub.pos)) },
    flares: G.flares, pings: G.pings, strikes: G.strikes,
    logs: story.found,
    pos: [Math.round(sub.pos.x), Math.round(sub.pos.y), Math.round(sub.pos.z)],
  };

  R.render();
  requestAnimationFrame(frame);
}

function presenceOf() {
  if (lev.state === 'STRIKE') return 1;
  const prox = Math.max(0, 1 - lev.distTo(sub.pos) / 300);
  return Math.max(G.attention / 100 * 0.66, prox * (lev.state === 'APPROACH' ? 1 : 0.8));
}

requestAnimationFrame(frame);

// ---------------- QA / debug surface ----------------
window.HD.test = {
  start: () => { document.getElementById('intro')?.classList.add('gone'); startDive(); },
  ping: () => { G.pingCd = 0; doPing(); },
  flare: () => doFlare(),
  lamp: (v) => { sub.lampOn = v ?? !sub.lampOn; },
  thrust: (v = 1) => { sub.thrust = v; },
  steer: (x = 0, y = 0) => { sub.steer.x = x; sub.steer.y = y; },
  warp: (d = 1000) => { const y = 150 - d, a = axisAt(y); sub.pos.set(a.x, y, a.z); sub.vel.set(0, -2, 0); return depthOf(sub.pos.y); },
  attention: (n = 90) => { G.attention = n; },
  battery: (n = 100) => { G.battery = n; },
  damage: (n = 20) => { G.hull -= n; hud.hurt(); },
  win: () => endWon(),
  lose: () => endLost(),
  levInfo: () => ({ state: lev.state, dist: Math.round(lev.distTo(sub.pos)), head: lev.head.toArray().map(v => Math.round(v)) }),
  logs: () => ({ found: story.found, total: story.total }),
};

requestAnimationFrame(() => {
  window.HD.ready = true;
  console.log(`[HD] ready — depth=${Math.round(depthOf(sub.pos.y))}m hull=${G.hull}`);
});
