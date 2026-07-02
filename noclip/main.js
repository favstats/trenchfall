// NOCLIP — recovered footage, tape #4. Boot, descent director, anomaly events,
// entity beats, the phone, the almond water, and the Red Hall run.
// Five levels down. Do not let the tape stop.
import { createRenderer } from './engine/renderer.js';
import { makeTextures } from './textures.js';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { Entity } from './entity.js';
import { createHUD } from './ui/hud.js';
import {
  initAudio, setHum, setRoomTone, sfxDrip, sfxSkip, sfxDescend, sfxEnd, sfxBuzz,
  sfxSlam, sfxPop, sfxSplash, sfxChirp, sfxPickup, sfxLaugh, startRing, stopRing, sfxStinger,
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

// ---------------- game state ----------------
const G = {
  phase: 'intro',            // intro | play | won | lost
  zone: 0,
  time: 0, zoneTime: 0,
  tape: 3,
  walked: 0, encounters: 0, zonesSeen: 1, water: 0,
  entityCd: 14,
  dripT: 3, eventT: 10,
  danger: 0,
  phoneDone: false, phoneRinging: false,
  chase: null,               // { lightsDead } while the Red Hall runs you down
};

const hud = createHUD(hudRoot, { onStart: start });

// the deeper the tape goes, the less the date holds together
const STAMPS = ['APR 21 1998', 'JUN ?? 1961', 'APR 21 19─8', 'A?R ██ 2038', '▓▓▓ ── ────'];
const WHISPERS = [
  'tape begins mid-fall. there is no hole above him.',
  'the balloons are new. nobody has been here in years.',
  'the light pools are safe. the dark between them is not.',
  'he stopped filming the water after the first minute.',
  'the last label just says RUN. so he did.',
];
const ENTITY_MODE = [null, 'party', 'grin', null, 'chaser']; // per zone

function zone() { return world.zones[G.zone]; }

function start() {
  if (G.phase !== 'intro') return;
  G.phase = 'play';
  player.enabled = true;
  player.requestLock();
  hud.zone(zone().name, zone().sub);
  hud.whisper(WHISPERS[0], 5);
}

const Z = world.zones[0];
player.place(Z.spawn.x, Z.y, Z.spawn.z, Math.PI * 0.25);
world.setZoneMood(Z);

function litAt(x, z) {
  for (const f of zone().fixtures) {
    if (f.dead) continue;
    const d2 = (f.x - x) ** 2 + (f.z - z) ** 2;
    if (d2 < 6.5 * 6.5) return true;
  }
  return false;
}

function descend() {
  G.zone++;
  G.zonesSeen++;
  G.zoneTime = 0;
  G.eventT = 8;
  G.entityCd = [999, 10, 9, 999, 999][G.zone] ?? 999;
  entity.despawn();
  stopRing(); G.phoneRinging = false;
  const z = zone();
  player.place(z.spawn.x, z.y, z.spawn.z, G.zone === 4 ? -Math.PI / 2 : Math.PI * 0.25);
  world.setZoneMood(z);
  R.tapeSkip(0.7);
  sfxDescend();
  hud.zone(z.name, z.sub);
  hud.setStamp(STAMPS[G.zone]);
  hud.whisper(WHISPERS[G.zone], 5.5);
  if (z.chase) beginChase();
}

// ---- the Red Hall: it is already behind you ----
function beginChase() {
  G.chase = { lightsDead: 0, started: false };
}
function updateChase(dt) {
  const z = zone();
  const c = G.chase;
  if (!c) return;
  if (!c.started && player.pos.x > z.bounds.x1 + 8) {
    c.started = true;
    entity.spawn(player.pos.x - 16, z.y, 0, 'chaser');
    sfxStinger();
    hud.whisper('RUN.', 2.5);
  }
  if (!c.started) return;
  // adrenaline: sprinting costs less down here — the game wants you to make it
  player.stamina = Math.min(1, player.stamina + dt * 0.1);
  // the strip lights die as it passes them
  for (const f of z.stripLights) {
    if (!f.dead && entity.state === 'STALK' && f.x < entity.pos.x + 2) {
      f.dead = true;
      f.mesh.material = f.mesh.material.clone();
      f.mesh.material.color.setHex(0x1a0806);
    }
  }
  // the chaser never despawns on its own; keep it on the corridor axis
  if (entity.state === 'STALK') entity.pos.z *= Math.max(0, 1 - dt * 2);
}

entity.onTouch = () => {
  G.tape--;
  R.tapeSkip(1);
  sfxSkip();
  if (G.tape <= 0) { G.phase = 'lost'; sfxEnd(false); hud.showEnd(statsFor(), false); return; }
  if (zone().chase) {
    // dragged back to the start of the hall; the lights come back on
    const z = zone();
    player.place(z.spawn.x, z.y, z.spawn.z, -Math.PI / 2);
    for (const f of z.stripLights) f.dead = false;
    beginChase();
  } else {
    G.entityCd = 16 + Math.random() * 10;
  }
};

function statsFor() {
  return { time: G.time, zonesSeen: G.zonesSeen, walked: G.walked, encounters: G.encounters, water: G.water };
}

function trySpawnEntity(mode) {
  const z = zone();
  for (let tries = 0; tries < 14; tries++) {
    const a = player.yaw + Math.PI + (Math.random() - 0.5) * 2.4;
    const d = 16 + Math.random() * 10;
    const x = player.pos.x + Math.sin(a) * d;
    const zz = player.pos.z + Math.cos(a) * d;
    if (x < z.bounds.x1 || x > z.bounds.x2 || zz < z.bounds.z1 || zz > z.bounds.z2) continue;
    if (litAt(x, zz)) continue;
    entity.spawn(x, z.y, zz, mode);
    return true;
  }
  return false;
}

// ---- anomaly events: the world misbehaving on a timer ----
const EVENTS = {
  0: [ // yellow rooms
    () => { world.doBlackout(2.6); hud.whisper('the lights agreed on something.', 3); },
    () => { sfxSlam(); },
    () => { setHum(0); setTimeout(() => setHum(zone().hum), 6000); hud.whisper('the hum stopped. something is listening instead.', 4); },
    () => { sfxSlam(); player.camera && (player.bobT += 2); },
  ],
  1: [ // level fun
    () => sfxLaugh(),
    () => { // a balloon gives up
      const b = zone().balloons?.find(b => b.visible);
      if (b) { b.visible = false; sfxPop(); }
    },
    () => { world.doBlackout(1.4); sfxLaugh(); },
  ],
  2: [ // garage
    () => sfxSlam(),
    () => sfxChirp(),
    () => { // a light dies for good
      const z = zone();
      const f = z.fixtures[(Math.random() * z.fixtures.length) | 0];
      if (f && !f.dead && ((f.x - player.pos.x) ** 2 + (f.z - player.pos.z) ** 2) > 200) { f.dead = true; sfxBuzz(); }
    },
  ],
  3: [ // poolrooms
    () => sfxSplash(),
    () => sfxLaugh(),
    () => { world.doBlackout(1.1); sfxSplash(); },
  ],
  4: [],
};

function runEvents(dt) {
  G.eventT -= dt;
  if (G.eventT > 0) return;
  G.eventT = 13 + Math.random() * 12;
  const pool = EVENTS[G.zone] || [];
  if (pool.length) pool[(Math.random() * pool.length) | 0]();
}

// ---- the phone (yellow rooms, once) ----
function updatePhone() {
  if (G.zone !== 0 || G.phoneDone) return;
  const p = zone().phone;
  if (!G.phoneRinging && G.zoneTime > 16) { G.phoneRinging = true; startRing(); }
  if (G.phoneRinging && Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < 2.4) {
    stopRing();
    G.phoneDone = true;
    hud.whisper('it stopped when he reached it. it never rang again.', 5);
  }
}

// ---- almond water ----
function updatePickups() {
  for (const pk of zone().pickups) {
    if (pk.taken) continue;
    if (Math.hypot(player.pos.x - pk.x, player.pos.z - pk.z) < 1.3) {
      pk.taken = true;
      pk.g.visible = false;
      G.water++;
      if (G.tape < 3) { G.tape++; hud.whisper('almond water. somehow he knew it would help the tape.', 4.5); }
      else hud.whisper('almond water. he drinks it anyway.', 3.5);
      sfxPickup();
    }
  }
}

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'f') player.lamp.visible = !player.lamp.visible;
  if (k === 'r' && (G.phase === 'won' || G.phase === 'lost')) location.reload();
});
window.addEventListener('resize', R.setSize);

// ---------------- loop ----------------
let last = performance.now();
let firstSighting = false;

function frame(now) {
  const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
  last = now;
  const playing = G.phase === 'play';
  const z = zone();

  if (playing) {
    G.time += dt; G.zoneTime += dt;
    const px = player.pos.x, pz = player.pos.z;
    player.update(dt, z);
    G.walked += Math.hypot(player.pos.x - px, player.pos.z - pz);

    // ---- descent + the final door ----
    if (Math.hypot(player.pos.x - z.exit.x, player.pos.z - z.exit.z) < z.exit.r) {
      if (G.zone < 4) descend();
      else { G.phase = 'won'; stopRing(); sfxEnd(true); hud.showEnd(statsFor(), true); }
    }

    // ---- entities ----
    const mode = ENTITY_MODE[G.zone];
    const zoneAllows = mode && !z.chase && (G.zone !== 0 || G.zoneTime > 70);
    if (entity.state === 'DORMANT' && zoneAllows) {
      G.entityCd -= dt * (player.sprinting ? 2.2 : 1);
      if (G.entityCd <= 0 && !litAt(player.pos.x, player.pos.z)) {
        if (trySpawnEntity(mode)) G.entityCd = 999;
      }
    }
    if (z.chase) updateChase(dt);
    const res = entity.update(dt, {
      player: player.pos, camera: R.camera, litAt, sprinting: player.sprinting,
    });
    if (res.observed && !firstSighting) {
      firstSighting = true;
      G.encounters++;
      hud.whisper('it holds still while the lens is on it. it is already closer than it was.', 6);
      player.forceLookAt(entity.pos.x, z.y + 1.55, entity.pos.z, 0.9);
    } else if (res.observed && entity.seenOnce && !entity._counted) {
      entity._counted = true; G.encounters++;
    }
    if (entity.state === 'DORMANT') {
      entity._counted = false;
      if (!z.chase) G.entityCd = Math.min(G.entityCd, 14 + Math.random() * 12);
    }
    G.danger = res.dist === Infinity ? 0 : Math.max(0, 1 - res.dist / 24);

    // ---- world events + interactions ----
    runEvents(dt);
    updatePhone();
    updatePickups();

    // ---- ambience ----
    setHum(z.hum * (litAt(player.pos.x, player.pos.z) ? 1 : 0.4));
    setRoomTone([240, 300, 130, 520, 110][G.zone], [0.15, 0.13, 0.2, 0.1, 0.22][G.zone]);
    G.dripT -= dt;
    if (G.dripT <= 0 && G.zone >= 2) { G.dripT = 2 + Math.random() * 7; sfxDrip(); }
  } else if (G.phase === 'intro') {
    player.yaw += dt * 0.05;
    player.update(0, z);
  } else {
    player.update(dt, z);
  }

  const buzzed = world.update(dt, player.pos, G.zone, G.time + G.zoneTime);
  if (buzzed && Math.random() < dt * 2) sfxBuzz();

  hud.update({ stamina: player.stamina, tape: G.tape, danger: G.danger }, dt);

  window.NC.stats = {
    phase: G.phase, zone: G.zone, zoneName: z.name,
    tape: G.tape, time: +G.time.toFixed(1), walked: Math.round(G.walked),
    entity: entity.state, entityMode: entity.mode,
    entityDist: entity.state === 'STALK' ? Math.round(Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z)) : -1,
    encounters: G.encounters, water: G.water,
    pos: [Math.round(player.pos.x), Math.round(player.pos.z)],
    lit: litAt(player.pos.x, player.pos.z),
    chase: !!(G.chase && G.chase.started),
  };

  R.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------- QA / debug surface ----------------
window.NC.test = {
  start: () => { document.getElementById('intro')?.classList.add('gone'); start(); },
  look: (yaw = 0, pitch = 0) => { player.yaw = yaw; player.pitch = pitch; },
  move: (f = 1) => { f > 0 ? player.keys.add('w') : player.keys.delete('w'); },
  sprint: (v = true) => { v ? player.keys.add('shift') : player.keys.delete('shift'); },
  teleport: (x, zz) => { player.place(x, zone().y, zz, player.yaw); },
  descend: () => { if (G.zone < 4) descend(); return G.zone; },
  exit: () => { const e = zone().exit; player.place(e.x, zone().y, e.z, player.yaw); },
  entityAt: (x, zz, mode = 'grin') => { entity.spawn(x, zone().y, zz, mode); },
  touch: () => entity.onTouch && entity.onTouch(),
  pickup: () => { const pk = zone().pickups.find(p => !p.taken); if (pk) { player.place(pk.x, zone().y, pk.z, player.yaw); } return !!pk; },
  event: (i = 0) => { (EVENTS[G.zone] || [])[i]?.(); },
  lamp: (v) => { player.lamp.visible = v ?? !player.lamp.visible; },
  win: () => { G.phase = 'won'; hud.showEnd(statsFor(), true); },
  lose: () => { G.phase = 'lost'; hud.showEnd(statsFor(), false); },
};

requestAnimationFrame(() => {
  window.NC.ready = true;
  console.log(`[NC] ready — zone=${zone().name}`);
});
