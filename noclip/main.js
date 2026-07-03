// NOCLIP — recovered footage, endless edition. Boot, the extraction loop, the
// entity director, and the meta between runs. The world streams forever; the
// tape battery is your life; light feeds it, dark eats it. Tapes you carry are
// worth nothing until an elevator banks them — walk past one and everything
// you hold rides on the next.
import { createRenderer } from './engine/renderer.js';
import { makeTextures } from './textures.js';
import { buildWorld, getSeed } from './world.js';
import { Player } from './player.js';
import { Entity } from './entity.js';
import { createHUD } from './ui/hud.js';
import {
  initAudio, setHum, setRoomTone, sfxDrip, sfxSkip, sfxEnd, sfxBuzz,
  sfxSlam, sfxPop, sfxSplash, sfxPickup, sfxLaugh, sfxDescend,
} from './engine/audio.js';

const canvas = document.getElementById('gl');
const hudRoot = document.getElementById('hud');
window.NC = { ready: false, stats: {}, test: {} };

const R = createRenderer(canvas);
const tex = makeTextures();
const world = buildWorld(R.scene, tex);
const player = new Player(R.camera, canvas);
const entity = new Entity(R.scene);
R.scene.add(R.camera);
initAudio();

// ---------------- meta (persists between runs) ----------------
const META_KEY = 'noclip-meta-v1';
function loadMeta() {
  try { return { banked: 0, upgrades: {}, best: 0, ...JSON.parse(localStorage.getItem(META_KEY) || '{}') }; }
  catch { return { banked: 0, upgrades: {}, best: 0 }; }
}
function saveMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(META)); } catch {} }
const META = loadMeta();
export const UPGRADES = [
  { key: 'cell', name: 'BIGGER CELL', desc: '+30 max battery / level', costs: [8, 20, 45], apply: (g, lvl) => { g.batteryMax = 100 + lvl * 30; } },
  { key: 'shoes', name: 'QUIET SHOES', desc: 'walk & run faster / level', costs: [10, 24, 50], apply: () => {} },
  { key: 'ward', name: 'HUM WARD', desc: 'it takes longer to notice you', costs: [12, 30, 60], apply: () => {} },
  { key: 'magnet', name: 'TAPE MAGNET', desc: 'pickups reach further', costs: [8, 18, 40], apply: () => {} },
];
const lvl = (k) => META.upgrades[k] || 0;

// ---------------- run state ----------------
const G = {
  phase: 'menu',           // menu | run | end
  battery: 100, batteryMax: 100,
  tapes: 0, dist: 0, time: 0,
  entityCd: 26, danger: 0, dripT: 4, eventT: 12,
  biome: null, lastBiomeKey: '',
  skips: 0,
};

const hud = createHUD(hudRoot, {
  onStart: startRun,
  onBuy: (i) => {
    const u = UPGRADES[i];
    const L = lvl(u.key);
    if (L >= u.costs.length || META.banked < u.costs[L]) return false;
    META.banked -= u.costs[L];
    META.upgrades[u.key] = L + 1;
    saveMeta();
    return true;
  },
  meta: META, upgrades: UPGRADES,
});

function startRun() {
  G.phase = 'run';
  G.battery = G.batteryMax = 100 + lvl('cell') * 30;
  G.tapes = 0; G.dist = 0; G.time = 0; G.skips = 0;
  G.entityCd = 30;
  player.place(12, 0, 12, Math.PI * 0.25);
  player.enabled = true;
  player.requestLock();
  hud.zone('THE YELLOW ROOMS', 'it hums · find the light · find the way down');
  hud.whisper(`tape #${(getSeed() % 900 + 100)} begins mid-fall. there is no hole above him.`, 5);
}

function endRun(kind) { // 'bank' | 'dead'
  G.phase = 'end';
  player.enabled = false;
  document.pointerLockElement && document.exitPointerLock();
  const mult = 1 + Math.floor(G.dist / 150) * 0.5;
  const earned = kind === 'bank' ? Math.round(G.tapes * mult) : Math.floor(G.tapes / 2);
  META.banked += earned;
  META.best = Math.max(META.best, Math.round(G.dist));
  saveMeta();
  sfxEnd(kind === 'bank');
  hud.showEnd({
    kind, tapes: G.tapes, earned, mult, dist: Math.round(G.dist),
    best: META.best, banked: META.banked, time: G.time, skips: G.skips,
  });
}

entity.onTouch = () => {
  G.battery -= 30;
  G.skips++;
  R.tapeSkip(1);
  sfxSkip();
  G.entityCd = 20 + Math.random() * 14 + lvl('ward') * 8;
};

// speed upgrades feed straight into the controller
const baseUpdate = player.update.bind(player);
player.update = (dt, w) => {
  const boost = 1 + lvl('shoes') * 0.12;
  player.speedScale = boost;
  baseUpdate(dt * 1, w);
};

// ---------------- entity director ----------------
const BIOME_ENTITY = { garage: 'grin', redveins: 'chaser', void: 'stilt', fun: 'party', pillars: 'grin', cathedral: 'grin' };
function trySpawnEntity(mode) {
  for (let tries = 0; tries < 14; tries++) {
    const a = player.yaw + Math.PI + (Math.random() - 0.5) * 2.4;
    const d = 17 + Math.random() * 10;
    const x = player.pos.x + Math.sin(a) * d;
    const z = player.pos.z + Math.cos(a) * d;
    if (world.litAt(x, z)) continue;
    entity.spawn(x, 0, z, mode);
    return true;
  }
  return false;
}

// ---------------- ambient events ----------------
function runEvents(dt) {
  G.eventT -= dt;
  if (G.eventT > 0) return;
  G.eventT = 14 + Math.random() * 14;
  const key = G.biome?.key;
  const pool = {
    yellow: [() => world.doBlackout(2.2), sfxSlam, () => { setHum(0); setTimeout(() => setHum(1), 5000); }],
    pillars: [sfxSlam, () => world.doBlackout(1.6)],
    fun: [sfxLaugh, sfxPop],
    garage: [sfxSlam, sfxBuzz],
    pools: [sfxSplash, sfxLaugh],
    cathedral: [sfxSlam, () => world.doBlackout(2.8)],
    suburb: [sfxLaugh, sfxSlam],
    redveins: [sfxBuzz],
    void: [sfxSlam],
  }[key] || [sfxSlam];
  pool[(Math.random() * pool.length) | 0]();
}

window.addEventListener('resize', R.setSize);
window.addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'f') player.lamp.visible = !player.lamp.visible;
  if (e.key.toLowerCase() === 'r' && G.phase === 'end') location.reload();
  if (e.key.toLowerCase() === 'e' && G.phase === 'run') {
    for (const it of world.itemsNear(player.pos.x, player.pos.z)) {
      if (it.kind === 'elevator' && Math.hypot(it.x - player.pos.x, it.z - player.pos.z) < 2.4) {
        sfxDescend();
        endRun('bank');
        return;
      }
    }
  }
});

// ---------------- loop ----------------
let last = performance.now();
let t = 0;

function frame(now) {
  const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
  last = now;
  t += dt;
  const playing = G.phase === 'run';

  player.update(dt, world);
  G.biome = world.update(dt, player.pos, t);

  if (playing) {
    G.time += dt;
    G.dist = Math.max(G.dist, Math.hypot(player.pos.x, player.pos.z));

    // biome cards as you cross regions — no doors, the world just changes
    if (G.biome.key !== G.lastBiomeKey) {
      G.lastBiomeKey = G.biome.key;
      hud.zone(G.biome.name, G.biome.sub);
      sfxDescend();
    }

    // ---- the battery is your life ----
    const lit = world.litAt(player.pos.x, player.pos.z);
    let drain = lit ? 0.55 : 1.5;
    if (player.sprinting) drain += 0.7;
    if (G.danger > 0.4) drain += 1.2;
    G.battery -= drain * dt;
    if (G.battery <= 0) { endRun('dead'); }

    // ---- pickups ----
    const reach = 1.5 + lvl('magnet') * 0.8;
    for (const it of world.itemsNear(player.pos.x, player.pos.z)) {
      const d = Math.hypot(it.x - player.pos.x, it.z - player.pos.z);
      if (it.kind === 'tape' && d < reach) {
        it.taken = true; it.mesh.visible = false; if (it.halo) it.halo.intensity = 0;
        G.tapes++; sfxPickup();
      } else if (it.kind === 'water' && d < reach) {
        it.taken = true; it.mesh.visible = false;
        G.battery = Math.min(G.batteryMax, G.battery + 35);
        sfxPickup();
        hud.whisper('almond water. the tape drinks first.', 3);
      }
    }

    // ---- entity director: deeper = bolder, biome picks the monster ----
    const mode = BIOME_ENTITY[G.biome.key];
    if (entity.state === 'DORMANT' && mode) {
      G.entityCd -= dt * (player.sprinting ? 2 : 1) * (1 + G.dist / 400);
      if (G.entityCd <= 0 && !world.litAt(player.pos.x, player.pos.z)) {
        if (trySpawnEntity(mode)) G.entityCd = 999;
      }
    }
    const res = entity.update(dt, {
      player: player.pos, camera: R.camera,
      litAt: (x, z) => world.litAt(x, z),
      sprinting: player.sprinting, playerMoving: player.moving,
    });
    if (entity.state === 'DORMANT') G.entityCd = Math.min(G.entityCd, 18 + Math.random() * 16 + lvl('ward') * 8);
    G.danger = res.dist === Infinity ? 0 : Math.max(0, 1 - res.dist / 24);

    runEvents(dt);
    setHum(G.biome.hum * (lit ? 1 : 0.4));
    setRoomTone({ yellow: 240, pillars: 220, fun: 300, garage: 130, pools: 520, cathedral: 180, suburb: 340, redveins: 110, void: 80 }[G.biome.key] || 240, 0.15);
    G.dripT -= dt;
    if (G.dripT <= 0 && (G.biome.key === 'pools' || G.biome.key === 'garage')) { G.dripT = 3 + Math.random() * 6; sfxDrip(); }
  } else if (G.phase === 'menu') {
    player.yaw += dt * 0.05;
  }

  // elevator prompt
  let nearElevator = false;
  if (playing) {
    for (const it of world.itemsNear(player.pos.x, player.pos.z)) {
      if (it.kind === 'elevator' && Math.hypot(it.x - player.pos.x, it.z - player.pos.z) < 2.6) { nearElevator = true; break; }
    }
  }

  hud.update({
    battery: G.battery / G.batteryMax * 100, tapes: G.tapes, dist: Math.round(G.dist),
    danger: G.danger, banked: META.banked, nearElevator,
    mult: 1 + Math.floor(G.dist / 150) * 0.5,
  }, dt);

  window.NC.stats = {
    phase: G.phase, biome: G.biome?.key, seed: getSeed(),
    battery: Math.round(G.battery), tapes: G.tapes, banked: META.banked,
    dist: Math.round(G.dist), best: META.best, chunks: world.chunkCount,
    entity: entity.state, entityMode: entity.mode,
    danger: +G.danger.toFixed(2), skips: G.skips,
    pos: [Math.round(player.pos.x), Math.round(player.pos.z)],
    lit: world.litAt(player.pos.x, player.pos.z),
  };

  R.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------- QA / debug surface ----------------
window.NC.test = {
  start: () => { document.getElementById('intro')?.classList.add('gone'); if (G.phase !== 'run') startRun(); },
  look: (yaw = 0, pitch = 0) => { player.yaw = yaw; player.pitch = pitch; },
  move: (f = 1) => { f > 0 ? player.keys.add('w') : player.keys.delete('w'); },
  teleport: (x, z) => { player.place(x, 0, z, player.yaw); },
  walk: (dist = 100) => { player.place(player.pos.x + dist, 0, player.pos.z, player.yaw); return world.biomeAtPos(player.pos.x, player.pos.z).key; },
  grabTape: () => {
    for (const it of world.itemsNear(player.pos.x, player.pos.z)) {
      if (it.kind === 'tape' && !it.taken) { player.place(it.x, 0, it.z, player.yaw); return true; }
    }
    return false;
  },
  findElevator: () => {
    for (const it of world.itemsNear(player.pos.x, player.pos.z)) {
      if (it.kind === 'elevator') { player.place(it.x, 0, it.z + 1, player.yaw); return true; }
    }
    return false;
  },
  bank: () => endRun('bank'),
  die: () => { G.battery = 0; },
  spawnEntity: (mode = 'grin') => { entity.spawn(player.pos.x - Math.sin(player.yaw) * -12, 0, player.pos.z - Math.cos(player.yaw) * -12, mode); return entity.state; },
  battery: (n) => { G.battery = n ?? G.batteryMax; },
  biome: () => world.biomeAtPos(player.pos.x, player.pos.z).key,
  wipeMeta: () => { localStorage.removeItem(META_KEY); },
};

requestAnimationFrame(() => {
  window.NC.ready = true;
  console.log(`[NC] ready — seed ${getSeed()} · the rooms are listening`);
});
