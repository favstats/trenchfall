// NOCLIP — recovered footage, tape #4. Boot, descent director, entity beats.
// Three levels down, one grin, one rule: do not let the tape stop.
import { createRenderer } from './engine/renderer.js';
import { makeTextures } from './textures.js';
import { buildWorld } from './world.js';
import { Player } from './player.js';
import { Entity } from './entity.js';
import { createHUD } from './ui/hud.js';
import {
  initAudio, setHum, setRoomTone, sfxDrip, sfxSkip, sfxDescend, sfxEnd, sfxBuzz,
} from './engine/audio.js';

const canvas = document.getElementById('gl');
const hudRoot = document.getElementById('hud');
window.NC = { ready: false, stats: {}, test: {} };

const R = createRenderer(canvas);
const tex = makeTextures();
const world = buildWorld(R.scene, tex);
const player = new Player(R.camera, canvas);
const entity = new Entity(R.scene);
R.scene.add(R.camera);                     // the camcorder lamp rides the lens
initAudio();

// ---------------- game state ----------------
const G = {
  phase: 'intro',            // intro | play | won | lost
  zone: 0,
  time: 0, zoneTime: 0,
  tape: 3,                   // integrity — each touch costs one
  walked: 0, encounters: 0, zonesSeen: 1,
  entityCd: 12,              // seconds before it may appear in a dark stretch
  dripT: 3,
  danger: 0,
};

const hud = createHUD(hudRoot, { onStart: start });

function zone() { return world.zones[G.zone]; }

function start() {
  if (G.phase !== 'intro') return;
  G.phase = 'play';
  player.enabled = true;
  player.requestLock();
  hud.zone(zone().name, zone().sub);
  hud.whisper('tape begins mid-fall. there is no hole above him.', 5);
}

const Z = world.zones[0];
player.place(Z.spawn.x, Z.y, Z.spawn.z, Math.PI * 0.25);
world.setZoneMood(Z);

// is this spot inside a working light's pool? (the entity's one hard rule)
function litAt(x, z) {
  for (const f of zone().fixtures) {
    const d2 = (f.x - x) ** 2 + (f.z - z) ** 2;
    if (d2 < 6.5 * 6.5) return true;
  }
  return false;
}

function descend() {
  G.zone++;
  G.zonesSeen++;
  G.zoneTime = 0;
  G.entityCd = G.zone === 1 ? 9 : 26;
  entity.despawn();
  const z = zone();
  player.place(z.spawn.x, z.y, z.spawn.z, Math.PI * 0.25);
  world.setZoneMood(z);
  R.tapeSkip(0.7);           // the fall reads as tape damage
  sfxDescend();
  hud.zone(z.name, z.sub);
  if (G.zone === 1) hud.whisper('the light pools are safe. the dark between them is not.', 5.5);
  if (G.zone === 2) hud.whisper('he stopped filming the water after the first minute.', 5);
}

entity.onTouch = () => {
  G.tape--;
  R.tapeSkip(1);
  sfxSkip();
  G.entityCd = 16 + Math.random() * 10;
  if (G.tape <= 0) { G.phase = 'lost'; sfxEnd(false); hud.showEnd(statsFor(), false); }
};

function statsFor() {
  return { time: G.time, zonesSeen: G.zonesSeen, walked: G.walked, encounters: G.encounters };
}

// spawn it in the dark, off-lens, at stalking distance
function trySpawnEntity() {
  const z = zone();
  for (let tries = 0; tries < 14; tries++) {
    const a = player.yaw + Math.PI + (Math.random() - 0.5) * 2.4; // behind-ish
    const d = 16 + Math.random() * 10;
    const x = player.pos.x + Math.sin(a) * d;
    const zz = player.pos.z + Math.cos(a) * d;
    if (x < z.bounds.x1 || x > z.bounds.x2 || zz < z.bounds.z1 || zz > z.bounds.z2) continue;
    if (litAt(x, zz)) continue;
    entity.spawn(x, z.y, zz);
    return true;
  }
  return false;
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

    // ---- descent + exit triggers ----
    if (Math.hypot(player.pos.x - z.exit.x, player.pos.z - z.exit.z) < z.exit.r) {
      if (G.zone < 2) descend();
      else { G.phase = 'won'; sfxEnd(true); hud.showEnd(statsFor(), true); }
    }

    // ---- entity direction: it lives in the dark stretches ----
    const zoneAllows = G.zone === 1 || (G.zone === 0 && G.zoneTime > 70);
    if (entity.state === 'DORMANT' && zoneAllows) {
      G.entityCd -= dt * (player.sprinting ? 2.2 : 1);
      if (G.entityCd <= 0 && !litAt(player.pos.x, player.pos.z)) {
        if (trySpawnEntity()) G.entityCd = 999;   // reset on despawn/touch
      }
    }
    const res = entity.update(dt, {
      player: player.pos, camera: R.camera, litAt, sprinting: player.sprinting,
    });
    if (res.observed && !firstSighting) {
      firstSighting = true;
      G.encounters++;
      hud.whisper('it holds still while the lens is on it. it is already closer than it was.', 6);
      player.forceLookAt(entity.pos.x, z.y + 1.55, entity.pos.z, 0.9); // the tape looks
    } else if (res.observed && entity.seenOnce && !entity._counted) {
      entity._counted = true; G.encounters++;
    }
    if (entity.state === 'DORMANT') { entity._counted = false; G.entityCd = Math.min(G.entityCd, 14 + Math.random() * 12); }
    G.danger = res.dist === Infinity ? 0 : Math.max(0, 1 - res.dist / 24);

    // ---- ambience ----
    setHum(z.hum * (litAt(player.pos.x, player.pos.z) ? 1 : 0.4));
    if (G.zone === 0) setRoomTone(240, 0.15);
    else if (G.zone === 1) setRoomTone(130, 0.2);
    else setRoomTone(520, 0.1);
    G.dripT -= dt;
    if (G.dripT <= 0 && G.zone >= 1) { G.dripT = 2 + Math.random() * 7; sfxDrip(); }
  } else if (G.phase === 'intro') {
    // slow idle pan behind the tape label
    player.yaw += dt * 0.05;
    player.update(0, z);
  } else {
    player.update(dt, z);    // end screens: the tape keeps rolling behind
  }

  const buzzed = world.update(dt, player.pos, G.zone, G.time + G.zoneTime);
  if (buzzed && Math.random() < dt * 2) sfxBuzz();

  hud.update({ stamina: player.stamina, tape: G.tape, danger: G.danger }, dt);

  window.NC.stats = {
    phase: G.phase, zone: G.zone, zoneName: z.name,
    tape: G.tape, time: +G.time.toFixed(1), walked: Math.round(G.walked),
    entity: entity.state, entityDist: entity.state === 'STALK' ? Math.round(Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z)) : -1,
    encounters: G.encounters,
    pos: [Math.round(player.pos.x), Math.round(player.pos.z)],
    lit: litAt(player.pos.x, player.pos.z),
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
  descend: () => { if (G.zone < 2) descend(); return G.zone; },
  exit: () => { const e = zone().exit; player.place(e.x, zone().y, e.z, player.yaw); },
  spawnEntity: () => { entity.spawn(player.pos.x - Math.sin(player.yaw) * -14, zone().y, player.pos.z - Math.cos(player.yaw) * -14); return entity.state; },
  entityAt: (x, zz) => { entity.spawn(x, zone().y, zz); },
  touch: () => entity.onTouch && entity.onTouch(),
  lamp: (v) => { player.lamp.visible = v ?? !player.lamp.visible; },
  win: () => { G.phase = 'won'; hud.showEnd(statsFor(), true); },
  lose: () => { G.phase = 'lost'; hud.showEnd(statsFor(), false); },
};

requestAnimationFrame(() => {
  window.NC.ready = true;
  console.log(`[NC] ready — zone=${zone().name}`);
});
