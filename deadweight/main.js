// DEADWEIGHT — the station remembers you. Boot, run loop, the descent, and
// VESTA. Physics roguelite: mass is ammo, dying is the plot.
import * as THREE from './engine/three.js';
import { createRenderer } from './engine/renderer.js';
import { createPhysics } from './physics.js';
import { createFloors, GRAVITIES } from './floors.js';
import { createFx } from './fx.js';
import { Enemies } from './enemies.js';
import { Player } from './player.js';
import { createHUD } from './ui/hud.js';
import { debriefFor, beaconLine, truthKnown } from './story.js';
import { initAudio, sfxImpact, sfxHatch, sfxBoon, sfxDeath, sfxVesta, sfxBeacon, sfxWin } from './engine/audio.js';

const canvas = document.getElementById('gl');
const hudRoot = document.getElementById('hud');
window.DW = { ready: false, stats: {}, test: {} };

const R = createRenderer(canvas);
const phys = await createPhysics(R.scene);
const fx = createFx(R.scene, phys);
const floors = createFloors(R.scene, phys);
const enemies = new Enemies(phys, R.scene, fx);
const player = new Player(phys, R.camera, canvas, R.scene);
initAudio();

phys.onImpact = (b, decel, p) => {
  sfxImpact(decel * b.mass);
  if (decel * b.mass > 30) fx.sparks(p.x, p.y, p.z, 5);
};

const BOONS = [
  { key: 'momentum', name: 'MOMENTUM ROUNDS', desc: 'rifle impulse and damage doubled' },
  { key: 'grip', name: 'DEEP GRIP', desc: 'tether holds 2.5× the mass, longer reach, harder throws' },
  { key: 'feather', name: 'SPINWALKER', desc: 'half gravity on you; higher jumps under any spin' },
  { key: 'overcharge', name: 'OVERCHARGE', desc: 'thrown objects detonate on their first kill' },
  { key: 'siphon', name: 'SALVAGE SIPHON', desc: 'destroyed strays restore 12 integrity' },
];

const G = {
  phase: 'rig',              // rig | dive | end
  depth: 1, deaths: 0,
  beaconsHeard: 0,
  boonChoices: [], boonPicked: null,
  gravName: 'STANDARD SPIN', pulse: false,
  kills: 0,
};

const hud = createHUD(hudRoot, {
  onDescend: () => startFloor(),
  onBoon: (i) => { G.boonPicked = G.boonChoices[i]; },
});

function pickBoons() {
  const pool = BOONS.filter(b => !player.boons[b.key]);
  G.boonChoices = pool.sort(() => Math.random() - 0.5).slice(0, Math.min(3, pool.length));
  G.boonPicked = null;
}

function showRig() {
  G.phase = 'rig';
  player.enabled = false;
  document.pointerLockElement && document.exitPointerLock();
  pickBoons();
  sfxVesta();
  hud.showRig(G.deaths, debriefFor(G.deaths), G.boonChoices);
}

function startFloor() {
  if (G.boonPicked) { player.boons[G.boonPicked.key] = true; sfxBoon(); }
  hud.hideRig();
  G.phase = 'dive';
  enemies.clear();
  const info = floors.build(G.depth - 1);
  G.gravName = info.gravity.name;
  G.pulse = !!info.gravity.pulse;
  // strays scale with depth; a brute joins from deck 3
  const n = 2 + G.depth;
  for (let i = 0; i < n; i++) {
    const sp = info.spawnPts[i % info.spawnPts.length] || { x: 0, z: 0 };
    enemies.spawn(sp.x + (Math.random() - 0.5) * 4, sp.z + (Math.random() - 0.5) * 4, G.depth >= 3 && i === 0);
  }
  player.hp = player.maxHp;
  player.alive = true;
  player.place(0, 2.5, 13);
  player.yaw = 0; player.pitch = 0;
  player.enabled = true;
  player.requestLock();
}

function die() {
  if (G.phase !== 'dive') return;   // one death per body, even at 60fps
  G.phase = 'end';
  G.deaths++;
  sfxDeath();
  hud.showEnd('dead');
  setTimeout(() => {
    document.querySelector('#endscreen')?.classList.remove('show');
    G.depth = 1;
    showRig();
  }, 2600);
}

function reachEngineDeck() {
  G.phase = 'end';
  player.enabled = false;
  document.pointerLockElement && document.exitPointerLock();
  sfxWin();
  // the ending: with the truth known, closing the log is yours to choose.
  // Without it, VESTA quietly resets the beacons and the descent continues.
  if (truthKnown(G.deaths)) {
    hud.showEnd('close');
  } else {
    hud.beacon('The engine deck is sealed. VESTA: "Not yet, operator. The survivors first. Please."');
    G.depth = 1;
    setTimeout(showRig, 3500);
  }
}

enemies.onKill = () => {
  G.kills++;
  if (enemies.count() === 0) { floors.openHatch(); sfxHatch(); }
};
player.onHurt = () => hud.hurt();
player.onShotHit = (rec, p) => fx.sparks(p.x, p.y, p.z, 6);

window.addEventListener('keydown', e => {
  if (e.key.toLowerCase() !== 'e' || G.phase !== 'dive') return;
  const b = floors.beacon;
  if (b && !b.used && Math.hypot(b.x - player.pos.x, b.z - player.pos.z) < 3) {
    b.used = true;
    b.mesh.material.emissiveIntensity = 0.1;
    sfxBeacon();
    hud.beacon(beaconLine(G.beaconsHeard++));
  }
});
window.addEventListener('resize', R.setSize);

// ---------------- loop ----------------
let last = performance.now();
let t = 0;

function frame(now) {
  const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
  last = now;
  t += dt;

  if (G.phase === 'dive') {
    phys.step(dt);
    player.update(dt);
    enemies.update(dt, player);
    floors.update(dt, t, G.pulse);
    if (!player.alive) die();
    // through the open hatch: fall to the next deck
    if (floors.hatchOpen && floors.hatch) {
      const h = floors.hatch;
      if (Math.hypot(player.pos.x - h.x, player.pos.z - h.z) < h.r && player.pos.y < 1.6) {
        G.depth++;
        if (G.depth > 5) reachEngineDeck();
        else { sfxHatch(); startFloor(); }
      }
    }
  } else {
    phys.step(dt);
    floors.update(dt, t, false);
    // idle drift camera behind the rig screens
    R.camera.position.set(Math.sin(t * 0.1) * 16, 6, Math.cos(t * 0.1) * 16);
    R.camera.lookAt(0, 2, 0);
  }
  fx.update(dt);

  // crosshair affordance: is the lens on something grabbable?
  let grabbable = false;
  if (G.phase === 'dive' && !player.held) {
    const hit = phys.raycast(R.camera.position, player.forward(), player.boons.grip ? 40 : 26, player.rb);
    grabbable = !!(hit && hit.rec && !hit.rec.rb.isFixed() && hit.rec.mass <= (player.boons.grip ? 40 : 16));
  }

  hud.update({
    hp: player.hp, depth: G.depth, grav: G.gravName,
    strays: enemies.count(), hatchOpen: floors.hatchOpen,
    held: !!player.held, grabbable,
    boons: Object.keys(player.boons).map(k => BOONS.find(b => b.key === k)?.name || k),
  }, dt);

  window.DW.stats = {
    phase: G.phase, depth: G.depth, deaths: G.deaths, kills: G.kills,
    hp: Math.round(player.hp), strays: enemies.count(),
    hatchOpen: floors.hatchOpen, grav: G.gravName,
    bodies: phys.bodies.length, held: !!player.held,
    boons: Object.keys(player.boons), beacons: G.beaconsHeard,
    pos: [Math.round(player.pos.x), Math.round(player.pos.y), Math.round(player.pos.z)],
  };

  R.render();
  requestAnimationFrame(frame);
}

showRig();
requestAnimationFrame(frame);

// ---------------- QA / debug surface ----------------
window.DW.test = {
  descend: () => { document.querySelector('#boonPick .boon')?.click(); startFloor(); return G.depth; },
  look: (yaw = 0, pitch = 0) => { player.yaw = yaw; player.pitch = pitch; },
  move: (f = 1) => { f > 0 ? player.keys.add('w') : player.keys.delete('w'); },
  teleport: (x, z) => player.place(x, 2.5, z),
  fire: () => player.fire(),
  grabNearest: () => {
    let best = null, bd = 1e9;
    for (const b of phys.bodies) {
      if (b.rb.isFixed() || b.kind === 'enemy' || b.mass > 16) continue;
      const p = b.rb.translation();
      const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) return false;
    const p = best.rb.translation();
    player.held = best;
    best.rb.setGravityScale(0, true);
    return true;
  },
  throwHeld: () => { player.throwHeld(); return !player.held; },
  throwAtNearestStray: () => {
    const e = enemies.list[0];
    if (!e || !player.held) return false;
    const ep = e.rb.translation();
    const rec = player.held;
    player.dropHeld();
    const p = rec.rb.translation();
    const d = Math.hypot(ep.x - p.x, ep.y - p.y, ep.z - p.z) || 1;
    rec.rb.setLinvel({ x: (ep.x - p.x) / d * 30, y: (ep.y - p.y) / d * 30 + 1, z: (ep.z - p.z) / d * 30 }, true);
    rec.thrownAt = performance.now();
    return true;
  },
  slayAll: () => { for (const e of [...enemies.list]) enemies.kill(e, player); return enemies.count(); },
  hatch: () => { const h = floors.hatch; if (h) player.place(h.x, 1.2, h.z); },
  damage: (n = 40) => player.takeHit(n, null),
  die: () => { player.hp = 0; player.alive = false; },
  beacon: () => { const b = floors.beacon; if (b) { player.place(b.x + 1, 2, b.z); } return !!b; },
  strayInfo: () => enemies.list.map(e => { const p = e.rb.translation(); return { hp: Math.round(e.hp), x: Math.round(p.x), z: Math.round(p.z) }; }),
};

requestAnimationFrame(() => {
  window.DW.ready = true;
  console.log('[DW] ready — the printer is warm');
});
