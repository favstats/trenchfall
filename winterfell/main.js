// THE LONG NIGHT — The First Assault. Boot, game loop, module wiring.
import * as THREE from './engine/three.js';
import { createRenderer } from './engine/renderer.js';
import { buildField } from './world/field.js';
import { makeCameraRig, makePicker } from './engine/input.js';
import { GameState } from './game/state.js';
import { Force } from './units/squads.js';
import { Possession } from './game/possession.js';
import { Horde } from './horde/horde.js';
import { WALL_Z, NORTH_Z } from './world/field.js';
import { Combat } from './combat/combat.js';
import { createHUD } from './ui/hud.js';
import { initAudio, sfxBoom, sfxBuild } from './engine/audio.js';
import { setSeason, pickSeason } from './game/season.js';

const canvas = document.getElementById('gl');
const hudRoot = document.getElementById('hud');

window.WF = { ready: false, backend: null, fidelity: null, test: {} };

const params = new URLSearchParams(location.search);
const forced = params.get('fidelity');
const forceWebGL = params.get('gl') === '1';
setSeason(params.get('season') || pickSeason()); // not always winter
const R = await createRenderer(canvas, forced || undefined, forceWebGL);
const { scene, camera } = R;
initAudio(); // Howler SFX (unlocks on first click/key)

const state = new GameState(R.fidelity);
const field = buildField(scene);
const rig = makeCameraRig(camera, canvas, field.bounds);
const picker = makePicker(camera, canvas);
const force = new Force(scene, state);
const horde = new Horde(scene, state, field);
function seedFieldWorks() {
  for (const [kind, x, z] of [
    // a dug-in line already crewed and firing when the night begins
    ['nest', -42, WALL_Z - 13],
    ['nest', 42, WALL_Z - 13],
    ['nest', 0, WALL_Z - 22],
    ['tower', -82, WALL_Z - 11],
    ['tower', 82, WALL_Z - 11],
    ['trench', -64, WALL_Z - 20],
    ['trench', 64, WALL_Z - 20],
    ['trench', -18, WALL_Z - 15],
    ['trench', 20, WALL_Z - 15],
    ['ammo', 0, WALL_Z - 11],
    ['floodlight', -28, WALL_Z - 40],
    ['floodlight', 28, WALL_Z - 40],
    ['bunker', 0, WALL_Z - 33],
    ['wire', -55, WALL_Z - 50],
    ['wire', 55, WALL_Z - 50],
    ['brazier', -18, WALL_Z - 44],
    ['brazier', 18, WALL_Z - 44],
  ]) field.placeBuildable?.(kind, x, z);
}
seedFieldWorks();
// the dead muster at the back, by the godswood, and march south on the wall
// the dead first appear as distant specks at the godswood, far to the north,
// then march the long way in — a calm before the tide reaches the wall
horde.spawnWave(14, NORTH_Z - 16, NORTH_Z + 6); // only a few stragglers at first light
const combat = new Combat(scene, force, horde, state);
const possession = new Possession(camera, rig, force, combat, canvas);
let lastKillSupply = 0;

// ---------------- placement-preview ghost ----------------
const GHOST_SIZE = {
  trench: [12, 1.4, 5.6], wire: [9.4, 1.2, 2], sandbag: [7, 1.2, 3],
  nest: [5, 1.8, 5], tower: [4.2, 8, 4.2], pit: [6.4, 1, 6.4],
  floodlight: [1.6, 5, 1.6], ammo: [5, 2.2, 4], bunker: [6.2, 2.4, 4.6], brazier: [2.2, 3.2, 2.2],
  barracks: [8, 4, 6], depot: [6.6, 2, 4.6], lab: [7, 3, 6],
};
const EFFECT_RANGE = {
  nest: 155, tower: 185, bunker: 155,
  floodlight: 18, ammo: 7.2, brazier: 12.5,
  trench: 8, wire: 6.2, sandbag: 6.8, pit: 5.9,
};
const ghost = new THREE.Group();
const ghostRing = new THREE.Mesh(
  new THREE.RingGeometry(0.86, 1, 32),
  new THREE.MeshBasicMaterial({ color: 0x5ad17a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, fog: false }));
ghostRing.rotation.x = -Math.PI / 2; ghostRing.position.y = 0.15;
const ghostRange = new THREE.Mesh(
  new THREE.RingGeometry(0.995, 1, 72),
  new THREE.MeshBasicMaterial({ color: 0x8dd8ff, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: false }));
ghostRange.rotation.x = -Math.PI / 2; ghostRange.position.y = 0.18; ghostRange.visible = false;
const ghostBox = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ color: 0x5ad17a, transparent: true, opacity: 0.22, depthWrite: false, fog: false }));
ghost.add(ghostRange, ghostRing, ghostBox);
ghost.visible = false;
scene.add(ghost);
let lastMouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

// ---------------- selected-building feedback ----------------
const selFx = new THREE.Group();
const selRing = new THREE.Mesh(
  new THREE.RingGeometry(0.92, 1, 48),
  new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, fog: false }),
);
selRing.rotation.x = -Math.PI / 2;
const rangeRing = new THREE.Mesh(
  new THREE.RingGeometry(0.995, 1, 96),
  new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide, fog: false }),
);
rangeRing.rotation.x = -Math.PI / 2;
const hpBillboard = new THREE.Group();
const hpBack = new THREE.Mesh(
  new THREE.PlaneGeometry(3.4, 0.28),
  new THREE.MeshBasicMaterial({ color: 0x060a0f, transparent: true, opacity: 0.82, depthWrite: false, fog: false }),
);
const hpFill = new THREE.Mesh(
  new THREE.PlaneGeometry(3.2, 0.18),
  new THREE.MeshBasicMaterial({ color: 0x9fe0a8, transparent: true, opacity: 0.96, depthWrite: false, fog: false }),
);
hpFill.position.z = 0.01;
hpBillboard.add(hpBack, hpFill);
selFx.add(rangeRing, selRing, hpBillboard);
scene.add(selFx);
selFx.visible = false;

const rallyFx = new THREE.Group();
const rallyPole = new THREE.Mesh(
  new THREE.CylinderGeometry(0.055, 0.07, 3.4, 6),
  new THREE.MeshBasicMaterial({ color: 0xe6eef8, fog: false }),
);
rallyPole.position.y = 1.7;
const rallyFlag = new THREE.Mesh(
  new THREE.PlaneGeometry(1.8, 1.0),
  new THREE.MeshBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.86, side: THREE.DoubleSide, depthWrite: false, fog: false }),
);
rallyFlag.position.set(0.86, 2.75, 0);
rallyFx.add(rallyPole, rallyFlag);
const rallyLineGeo = new THREE.BufferGeometry();
rallyLineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
const rallyLine = new THREE.Line(
  rallyLineGeo,
  new THREE.LineBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.72, depthWrite: false, depthTest: false, fog: false }),
);
scene.add(rallyFx, rallyLine);
rallyFx.visible = rallyLine.visible = false;
rallyLine.frustumCulled = false;

function updateGhost() {
  if (!state.buildMode || possession.active) { ghost.visible = false; return; }
  const p = picker.ground(lastMouse.x, lastMouse.y);
  if (!p) { ghost.visible = false; return; }
  const dims = GHOST_SIZE[state.buildMode] || [4, 2, 4];
  const linear = LINEAR.has(state.buildMode);
  // linear works lay shoulder-to-shoulder (always placeable); point works need clearance
  const ok = linear ? true : (field.canPlaceBuildable ? field.canPlaceBuildable(state.buildMode, p.x, p.z) : true);
  const col = ok ? 0x5ad17a : 0xff5a4a;
  ghostRing.material.color.setHex(col); ghostBox.material.color.setHex(col);
  const r = Math.max(dims[0], dims[2]) * 0.5 + 0.6;
  ghostRing.scale.set(r, r, 1);
  const effect = EFFECT_RANGE[state.buildMode] || 0;
  ghostRange.visible = effect > r + 1.5;
  if (ghostRange.visible) {
    ghostRange.material.color.setHex(ok ? 0x8dd8ff : 0xff8a7a);
    ghostRange.scale.set(effect, effect, 1);
  }
  ghostBox.scale.set(dims[0], dims[1], dims[2]); ghostBox.position.y = dims[1] / 2;
  ghost.position.set(p.x, field.heightAt(p.x, p.z), p.z);
  ghost.visible = true;
}

function updateSelectionFeedback() {
  if (!selBuilding || !selBuilding.alive) {
    selFx.visible = false;
    rallyFx.visible = rallyLine.visible = false;
    return;
  }

  const ground = field.heightAt(selBuilding.x, selBuilding.z);
  const r = Math.max(2.8, (selBuilding.radius ?? 7) * 0.62);
  selRing.scale.set(r, r, 1);
  selRing.position.set(selBuilding.x, ground + 0.16, selBuilding.z);
  const effect = EFFECT_RANGE[selBuilding.kind] || 0;
  rangeRing.visible = effect > r + 1.5;
  if (rangeRing.visible) {
    rangeRing.scale.set(effect, effect, 1);
    rangeRing.position.set(selBuilding.x, ground + 0.19, selBuilding.z);
  }
  hpBillboard.position.set(selBuilding.x, ground + Math.max(3.2, r * 0.42 + 2.2), selBuilding.z);
  hpBillboard.quaternion.copy(camera.quaternion);
  const hp = Math.max(0, Math.min(1, (selBuilding.hp ?? 1) / (selBuilding.maxHp ?? 1)));
  hpFill.scale.x = hp;
  hpFill.position.x = -(1 - hp) * 1.6;
  hpFill.material.color.setHex(hp > 0.55 ? 0x9fe0a8 : hp > 0.25 ? 0xffd27a : 0xff725f);
  selFx.visible = true;

  if (selBuilding.rally) {
    const ry = field.heightAt(selBuilding.rally.x, selBuilding.rally.z);
    rallyFx.position.set(selBuilding.rally.x, ry + 0.12, selBuilding.rally.z);
    rallyFlag.rotation.y = Math.sin(state.time * 3.2) * 0.18;
    const pos = rallyLine.geometry.attributes.position;
    pos.setXYZ(0, selBuilding.x, ground + 1.1, selBuilding.z);
    pos.setXYZ(1, selBuilding.rally.x, ry + 1.1, selBuilding.rally.z);
    pos.needsUpdate = true;
    rallyLine.geometry.computeBoundingSphere();
    rallyFx.visible = rallyLine.visible = true;
  } else {
    rallyFx.visible = rallyLine.visible = false;
  }
}

function addSupply(n) {
  state.supply = Math.min(state.supplyMax, state.supply + n);
}

function spendSupply(kind) {
  const cost = state.costs[kind] ?? 0;
  if (state.supply < cost) return false;
  state.supply -= cost;
  return true;
}

function updateEconomy(dt) {
  // base structures behind the wall drive the economy
  let supplyRate = state.supplyRate, researchRate = 0;
  for (const b of (field.baseBuildings?.() || [])) {
    if (b.kind === 'depot') supplyRate += 2.4;
    else if (b.kind === 'lab') researchRate += 0.9;             // research comes from labs
    // barracks produce on demand via the selection panel (updateProduction), not passively
  }
  addSupply(dt * supplyRate);
  state.research = Math.max(0, (state.research || 0) + dt * researchRate);
  state.researchRate = researchRate;
  state.supplyRateNow = supplyRate;
  state.noise = Math.max(0, (state.noise || 0) - dt * 1.55);
  if (state.kills > lastKillSupply) { addSupply((state.kills - lastKillSupply) * 0.22); lastKillSupply = state.kills; } // kills give supply, not research
  state.gateHp = field.gateHealth?.() ?? 1;
  state.works = field.works?.() ?? 0;
}

function setBuildMode(kind) {
  state.buildMode = state.buildMode === kind ? null : kind;
}

function placeSelectedWork(x, z) {
  const kind = state.buildMode;
  if (!kind) return false;
  if (!field.canPlaceBuildable?.(kind, x, z)) return true;
  if (!spendSupply(kind)) return true;
  field.placeBuildable(kind, x, z);
  sfxBuild();
  return true; // stay in build mode — place several, Esc to exit
}

// ----- drag-to-dig: draw continuous trench / wire / sandbag lines -----
const LINEAR = new Set(['trench', 'wire', 'sandbag']);
let drawing = false, lastDraw = null;
const DRAW_STEP = 4.4;
const segCost = (kind) => Math.max(5, Math.ceil((state.costs[kind] ?? 30) * 0.3));

function drawSegment(px, pz, fx, fz) {
  const kind = state.buildMode;
  const dx = px - fx, dz = pz - fz;
  const ang = (dx || dz) ? Math.atan2(-dz, dx) : (lastDraw?.ang ?? 0); // orient along the drag
  if (state.supply < segCost(kind)) { drawing = false; return; }
  const item = field.placeBuildable(kind, px, pz, { angle: ang, dense: true });
  if (item) state.supply -= segCost(kind);
  lastDraw = { x: px, z: pz, ang };
}

function beginDraw(p) { drawing = true; lastDraw = null; drawSegment(p.x, p.z, p.x, p.z); }

function callReserve() {
  if (!spendSupply('recruit')) return;
  state.recruits++;
  const side = state.recruits % 2 ? -1 : 1;
  force.addSquad(`GARRISON ${state.recruits}`, 'rifle', side * 14, WALL_Z + 40, 6); // muster at the gate
}

function repairGate() {
  if (state.costs.repair == null) return;
  if ((field.gateHealth?.() ?? 1) >= 0.995) return;
  if (!spendSupply('repair')) return;
  field.repairGate?.(105);
}
let spawnAcc = 0;
let surgeAt = 28;
let reinforceAt = 16, reliefN = 0;   // endless British relief — more & stronger over time
state.might = 1;                      // global firepower doctrine, ramps with the night
function addNoise(n = 0) {
  state.noise = Math.max(0, Math.min(100, (state.noise || 0) + n));
  return state.noise;
}

// ---------------- RTS building selection + barracks unit production ----------
let selBuilding = null;
const spend = (n) => { if (state.supply < n) return false; state.supply -= n; return true; };
const UNIT_PROD = {
  rifles: { cost: 40, dur: 6, type: 'rifle', n: 6, label: 'RIFLES' },
  mg: { cost: 60, dur: 9, type: 'mg', n: 3, label: 'MG TEAM' },
  engineer: { cost: 55, dur: 7, type: 'engineer', n: 4, label: 'ENGINEERS' },
};
function queueUnit(key) {
  if (!selBuilding || selBuilding.kind !== 'barracks' || !UNIT_PROD[key]) return;
  if (!spend(UNIT_PROD[key].cost)) return;
  (selBuilding.queue || (selBuilding.queue = [])).push(key);
}
function updateProduction(dt) {
  for (const b of (field.baseBuildings?.() || [])) {
    if (b.kind !== 'barracks') continue;
    if (!b.prod && b.queue && b.queue.length) { const key = b.queue.shift(); b.prod = { key, t: 0, dur: UNIT_PROD[key].dur }; }
    if (b.prod) {
      b.prod.t += dt;
      if (b.prod.t >= b.prod.dur) {
        const u = UNIT_PROD[b.prod.key];
        const rx = b.rally ? b.rally.x : b.x, rz = b.rally ? b.rally.z : WALL_Z;
        force.addSquad(u.label, u.type, rx, rz, u.n);
        b.prod = null;
      }
    }
  }
}

function updateEngineers(dt) {
  let active = 0;
  for (const m of force.soldiers) {
    if (!m.alive || m.squad.type !== 'engineer') continue;
    m.repairing = false;
    const fixed = field.repairNearest?.(m.pos.x, m.pos.z, 13, dt * 9.5);
    if (!fixed) continue;
    active++;
    m.faceTo(fixed.x, fixed.z);
    m.repairing = true;
    m.state = 'idle';
  }
  state.engineersRepairing = active;
}

// ---------------- research (spend points from kills on permanent upgrades) ----
state.research = 0; state.mightBonus = 0; state.fireRate = 1; state.musterBonus = 0;
const TECHS = [
  { key: 'FIREPOWER', base: 8, lvl: 0, apply: () => { state.mightBonus += 0.4; } },
  { key: 'CADENCE',   base: 8, lvl: 0, apply: () => { state.fireRate *= 0.85; } },
  { key: 'LOGISTICS', base: 6, lvl: 0, apply: () => { state.supplyRate += 1.8; } },
  { key: 'MUSTER',    base: 7, lvl: 0, apply: () => { state.musterBonus += 1; } },
];
state.techs = TECHS;
const techCost = (t) => t.base * (t.lvl + 1);
function doResearch(i) {
  const t = TECHS[i]; if (!t) return;
  const c = techCost(t);
  if ((state.research || 0) < c) return;
  state.research -= c; t.lvl++; t.apply();
}
state.techCost = techCost;

function pickMortarTarget() {
  const A = horde.agents;
  if (!A.length) return { x: 0, z: WALL_Z - 45 };
  let best = A[0], bestScore = -1;
  const samples = Math.min(90, A.length);
  for (let s = 0; s < samples; s++) {
    const a = A[(s * 47) % A.length];
    if (a.dead) continue;
    let score = 0;
    for (let i = 0; i < A.length; i += 5) {
      const b = A[i];
      if (b.dead) continue;
      const d = (b.x - a.x) ** 2 + (b.z - a.z) ** 2;
      if (d < 18 ** 2) score++;
    }
    if (score > bestScore) { best = a; bestScore = score; }
  }
  return { x: best.x, z: best.z };
}

function detonate(x, z, radius = 11, damage = 130, crater = 1.35) {
  const y = field.heightAt(x, z);
  field.blast(x, y, z, { radius, damage, crater });
  field.explodeFx?.(x, y, z, radius / 10); // visible fireball + smoke + flash
  sfxBoom();
  addNoise(radius * 1.7);
  for (let i = horde.agents.length - 1; i >= 0; i--) {
    const a = horde.agents[i];
    if (a.dead) continue;
    const d = Math.hypot(a.x - x, a.z - z);
    if (d > radius) continue;
    a.hp -= damage * (1 - d / radius) + 25;
    if (a.hp <= 0) { horde.kill(i); state.kills++; }
  }
  for (const m of force.soldiers) {
    if (!m.alive) continue;
    const d = Math.hypot(m.pos.x - x, m.pos.z - z);
    if (d < radius * 0.62) {
      m.hp -= 3;
      if (m.hp <= 0) { m.kill(); state.menLost++; }
    }
  }
}

function fireMortarCallIn() {
  if (state.charges.mortar <= 0) return;
  state.charges.mortar--;
  const p = pickMortarTarget();
  setTimeout(() => detonate(p.x, p.z), 650);
}

const hud = createHUD(hudRoot, state, {
  onMortar: fireMortarCallIn,
  onReserve: callReserve,
  onBuildTrench: () => setBuildMode('trench'),
  onBuildWire: () => setBuildMode('wire'),
  onBuildSandbag: () => setBuildMode('sandbag'),
  onBuildNest: () => setBuildMode('nest'),
  onBuildTower: () => setBuildMode('tower'),
  onBuildPit: () => setBuildMode('pit'),
  onBuildFloodlight: () => setBuildMode('floodlight'),
  onBuildAmmo: () => setBuildMode('ammo'),
  onBuildBunker: () => setBuildMode('bunker'),
  onBuildBrazier: () => setBuildMode('brazier'),
  onBuild: (kind) => setBuildMode(kind),
  onProduce: (key) => queueUnit(key),
  onResearch: (i) => doResearch(i),
});

// ---------------- input: selection + orders ----------------
let down = null;       // {x,y} on left press
let dragging = false;
const DRAG_MIN = 6;

canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('mousedown', e => {
  if (possession.active) return;
  if (e.button === 0 && state.buildMode) {
    const p = picker.ground(e.clientX, e.clientY);
    if (p) {
      if (LINEAR.has(state.buildMode)) beginDraw(p);   // drag to dig a line
      else placeSelectedWork(p.x, p.z);                // single emplacement
    }
    down = null; dragging = false;
    return;
  }
  if (e.button === 0) { down = { x: e.clientX, y: e.clientY }; dragging = false; }
});

canvas.addEventListener('mousemove', e => {
  lastMouse.x = e.clientX; lastMouse.y = e.clientY;
  if (drawing) {
    const p = picker.ground(e.clientX, e.clientY);
    if (p && lastDraw && Math.hypot(p.x - lastDraw.x, p.z - lastDraw.z) >= DRAW_STEP) {
      drawSegment(p.x, p.z, lastDraw.x, lastDraw.z);
    }
    return;
  }
  if (down && !dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_MIN) dragging = true;
  if (dragging) hud.showDragBox(down.x, down.y, e.clientX, e.clientY);
});

window.addEventListener('mouseup', e => {
  if (drawing) { drawing = false; lastDraw = null; return; } // keep build mode — dig more lines
  if (possession.active) { down = null; dragging = false; hud.hideDragBox(); return; }
  if (e.button === 2) { // right-click
    const hits = picker.objects(e.clientX, e.clientY, field.placementTargets);
    const p = hits.length ? hits[0].point : picker.ground(e.clientX, e.clientY);
    if (p && selBuilding && selBuilding.kind === 'barracks') { selBuilding.rally = { x: p.x, z: p.z }; return; } // set rally point
    if (p) force.orderSelected(e.shiftKey ? 'ATTACK_MOVE' : 'MOVE', { x: p.x, z: p.z });
    return;
  }
  if (e.button !== 0 || !down) return;
  if (dragging) {
    hud.hideDragBox();
    const r = canvas.getBoundingClientRect();
    const toNdc = (cx, cy) => [((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1];
    const [ax, ay] = toNdc(down.x, down.y), [bx, by] = toNdc(e.clientX, e.clientY);
    force.boxSelect(camera, {
      minX: Math.min(ax, bx), maxX: Math.max(ax, bx),
      minY: Math.min(ay, by), maxY: Math.max(ay, by),
    }, e.shiftKey);
  } else {
    const hits = picker.objects(e.clientX, e.clientY, force.pickables);
    if (hits.length) { force.selectSquadByObject(hits[0].object, e.shiftKey); selBuilding = null; }
    else {
      // try selecting a placed building (RTS-style)
      const bh = picker.objects(e.clientX, e.clientY, field.buildingGroups?.() || []);
      let node = bh[0]?.object; while (node && !node.userData.item) node = node.parent;
      if (node) { selBuilding = node.userData.item; force.clearSelection(); }
      else if (!e.shiftKey) { force.clearSelection(); selBuilding = null; }
    }
  }
  down = null; dragging = false;
});

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'escape') { state.buildMode = null; drawing = false; }
  if (k === 'f') {
    if (possession.active) possession.exit();
    else { const m = force.selected().flatMap(s => s.alive)[0]; if (m) possession.enter(m); }
    return;
  }
  if (possession.active) return; // direct-control owns the keyboard
  if (k >= '1' && k <= '4') doResearch(+k - 1); // research techs
  if (k === 'v') fireMortarCallIn();
  else if (k === 'c') callReserve();
  else if (k === 't') setBuildMode('trench');
  else if (k === 'n') setBuildMode('wire');
  else if (k === 'b') setBuildMode('sandbag');
  else if (k === 'g') setBuildMode('nest');
  else if (k === 'y') setBuildMode('tower');
  else if (k === 'm') setBuildMode('pit');
  else if (k === 'l') setBuildMode('floodlight');
  else if (k === 'o') setBuildMode('ammo');
  else if (k === 'q') setBuildMode('bunker');
  else if (k === 'e') setBuildMode('brazier');
  else if (k === 'k') setBuildMode('barracks');
  else if (k === 'j') setBuildMode('depot');
  else if (k === 'u') setBuildMode('lab');
  if (k === 'h') force.orderSelected('HOLD');
  else if (k === 'x') force.orderSelected('FALL_BACK', { x: force.selected()[0]?.centroid().x ?? 0, z: field.wallZ + 9 });
  else if (k === 'z') {
    const sel = force.selected();
    const v = !(sel[0]?.holdFire);
    force.holdFireSelected(v);
  }
});

window.addEventListener('resize', R.setSize);

// ---------------- loop ----------------
let last = performance.now();
async function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (state.phase === 'battle') {
    state.time += dt;
    updateEconomy(dt);
    force.update(dt);
    // ---- gradual threat curve: the long night escalates, but noise can pull
    // extra dead into the kill zone before the scheduled surges arrive ----
    const ramp = Math.min(1, state.time / 540);
    const noiseK = Math.min(1, (state.noise || 0) / 100);
    state.threat = Math.max(ramp, noiseK * 0.72);
    const targetLive = Math.floor(18 + ramp * ramp * (horde.cap - 18) + noiseK * horde.cap * 0.18);
    spawnAcc += dt;
    if (spawnAcc > Math.max(0.18, 0.45 - noiseK * 0.18) && horde.count < targetLive) {
      horde.spawnWave(
        Math.min(targetLive - horde.count, Math.ceil(3 + ramp * 38 + noiseK * 26)),
        NORTH_Z - 16, NORTH_Z + 16,
        0.03 + noiseK * 0.025,
      );
      spawnAcc = 0;
    }
    if (state.time >= surgeAt) {                            // surges only once it's built up
      if (state.time > 75 || noiseK > 0.68) horde.spawnWave(
        Math.floor(30 + ramp * 240 + noiseK * 120),
        NORTH_Z - 16, NORTH_Z + 30,
        0.035 + noiseK * 0.025,
      );
      surgeAt += 30;
    }
    // ---- RELIEF: more and stronger soldiers march up to hold the wall ----
    state.might = 1 + state.time / 130 + (state.mightBonus || 0); // ramps + research
    if (state.time >= reinforceAt && force.soldiers.length < 150) {
      const tier = 1 + Math.floor(state.time / 38);      // doctrine tier climbs
      const type = (reliefN % 4 === 3) ? 'mg' : 'rifle';
      const sq = force.addSquad(`RELIEF ${++reliefN}`, type, (Math.random() * 2 - 1) * 104, WALL_Z, type === 'mg' ? 3 : 6);
      for (const m of sq.members) m.hp = 3 + tier;       // each wave of relief is hardier
      reinforceAt += Math.max(4, 17 - tier - (state.musterBonus || 0) * 2); // MUSTER research quickens relief
    }
    horde.update(dt, camera);
    combat.update(dt);
    updateProduction(dt);
    updateEngineers(dt);
    // expose selected-building info for the RTS panel
    state.selBuilding = selBuilding && selBuilding.alive ? {
      kind: selBuilding.kind, x: selBuilding.x,
      hp: selBuilding.hp, maxHp: selBuilding.maxHp,
      build: selBuilding.build ? { pct: Math.max(0, Math.min(selBuilding.build.t / selBuilding.build.dur, 1)) } : null,
      prod: selBuilding.prod ? { key: selBuilding.prod.key, pct: selBuilding.prod.t / selBuilding.prod.dur } : null,
      queue: (selBuilding.queue || []).length, hasRally: !!selBuilding.rally,
    } : null;
    if (selBuilding && !selBuilding.alive) selBuilding = null;
    // ---- win / lose ----
    // lose when the line is wiped or enough dead pour over and overrun the keep
    // endless: there is no winning the Long Night — only how long you hold
    if (state.menRemaining <= 0 || horde.breachers() >= 16 || horde.wallCrest() >= 34) { state.phase = 'lost'; hud.showEnd(); }
  }
  if (field.update) field.update(dt, camera);
  rig.update(dt);
  possession.update(dt);
  updateGhost();
  updateSelectionFeedback();
  state.possession = possession.active ? (possession.avatar?.squad?.label ?? 'DIRECT') : null;
  hud.update(force);
  window.WF.stats = {
    cam: camera.position.toArray().map(n => +n.toFixed(1)),
    men: state.menRemaining, kills: state.kills,
    lost: state.menLost, risen: state.menRisen,
    horde: horde.count, corpses: horde.corpseCount, crest: horde.wallCrest(),
    phase: state.phase,
    selected: force.selected().map(s => s.label),
    selBuilding: state.selBuilding?.kind || null,
    supply: Math.floor(state.supply), gate: +state.gateHp.toFixed(2), works: state.works,
    noise: Math.round(state.noise || 0), threat: +(state.threat || 0).toFixed(2),
    engineersRepairing: state.engineersRepairing || 0,
    possession: state.possession,
  };
  await R.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------- QA / debug surface ----------------
window.WF.test = {
  frame: (x, z, d) => rig.frame(x, z, d),
  selectAll: () => { force.clearSelection(); force.squads.forEach(s => s.setSelected(true)); },
  orderMove: (x, z) => force.orderSelected('MOVE', { x, z }),
  squads: () => force.squads.map(s => ({ label: s.label, count: s.count, order: s.order, c: s.centroid().toArray() })),
  killSome: (n = 3) => force.soldiers.slice(0, n).forEach(m => m.kill()),
  horde: () => horde.count,
  spawn: (n = 200) => horde.spawnWave(n),
  possess: () => { const m = force.soldiers.find(s => s.alive); if (m) { possession.enter(m); possession.keys.add('w'); possession.firing = true; } return !!m; },
  release: () => possession.exit(),
  reserve: () => callReserve(),
  heightAt: (x = 0, z = WALL_Z - 42) => field.heightAt(x, z),
  blast: (x = 0, z = WALL_Z - 42, r = 10) => detonate(x, z, r, 120, 1.25),
  build: (kind = 'trench', x = 0, z = WALL_Z - 28) => field.placeBuildable(kind, x, z),
  noise: (n = 50) => addNoise(n),
  damageWork: (kind = 'bunker', frac = 0.25) => {
    const b = (field.allBuildables?.() || []).find(item => item.alive && item.kind === kind);
    if (!b) return null;
    b.hp = Math.max(1, b.maxHp * frac);
    return { kind: b.kind, hp: b.hp, maxHp: b.maxHp, x: b.x, z: b.z };
  },
  workInfo: (kind = 'bunker') => {
    const b = (field.allBuildables?.() || []).find(item => item.alive && item.kind === kind);
    return b ? { kind: b.kind, hp: b.hp, maxHp: b.maxHp, x: b.x, z: b.z, alive: b.alive } : null;
  },
  engineerAt: (kind = 'bunker') => {
    const b = (field.allBuildables?.() || []).find(item => item.alive && item.kind === kind);
    if (!b) return false;
    force.addSquad('TEST ENGINEERS', 'engineer', b.x, b.z, 4);
    return true;
  },
  selectBuilding: (kind = 'barracks') => {
    selBuilding = (field.buildingGroups?.() || []).map(g => g.userData.item).find(b => b?.alive && b.kind === kind) || null;
    if (selBuilding) force.clearSelection();
    return !!selBuilding;
  },
  setRally: (x = 0, z = WALL_Z - 20) => { if (!selBuilding) return false; selBuilding.rally = { x, z }; return true; },
  repair: () => field.repairGate?.(105),
  supply: (n = 100) => addSupply(n),
  crest: () => { for (let x = -50; x <= 50; x += 2) for (let z = WALL_Z - 6; z <= WALL_Z + 2; z += 2) horde.heap[horde._heapIdx(x, z)] = 13; },
  breachers: () => horde.breachers(),
  digLine: (x1 = -45, z1 = WALL_Z - 20, x2 = 45, z2 = WALL_Z - 20, kind = 'trench') => {
    state.buildMode = kind; state.supply = 9999;
    beginDraw({ x: x1, z: z1 });
    const steps = 26;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
      if (Math.hypot(x - lastDraw.x, z - lastDraw.z) >= DRAW_STEP) drawSegment(x, z, lastDraw.x, lastDraw.z);
    }
    drawing = false; state.buildMode = null;
    return field.works();
  },
  dump: () => ({
    over: horde.agents.filter(a => a.over).length,
    atWall: horde.agents.filter(a => !a.dead && a.z >= 26).length,
    heapMaxAtWall: Math.max(0, ...[-40, -20, 0, 20, 40].map(x => horde.heapAt(x, WALL_Z - 2.3))),
    sampleNearWall: horde.agents.filter(a => !a.dead && a.z >= 26 && Math.abs(a.x) < 40).slice(0, 4)
      .map(a => ({ z: +a.z.toFixed(1), x: +a.x.toFixed(1), heap: +horde.heapAt(a.x, a.z).toFixed(1), over: !!a.over })),
  }),
};

if (params.get('end')) { state.phase = params.get('end'); state.kills = 842; state.menLost = 7; state.menRisen = 4; hud.showEnd(); }
if (params.get('build')) state.buildMode = params.get('build'); // QA: preview the ghost
if (params.get('wave')) state.waveDuration = parseFloat(params.get('wave'));
if (params.get('pitch')) rig.setPitch(parseFloat(params.get('pitch')));
if (params.get('demo') === 'dig') { window.WF.test.digLine(-55, WALL_Z - 18, 55, WALL_Z - 26); window.WF.test.digLine(-30, WALL_Z - 40, 40, WALL_Z - 40, 'wire'); rig.frame(0, WALL_Z - 36, 40); rig.setPitch(0.26); }
if (params.get('demo') === 'hill') {
  // bury a dense gaussian cluster of slain so the corpse-hill (Leichenberg) forms:
  // raiseMound lifts the terrain into a solid mound, bodies clad it (no holes)
  for (let i = 0; i < 1800; i++) {
    const g = () => (Math.random() + Math.random() + Math.random() - 1.5);
    horde._addCorpse(g() * 18, WALL_Z - 16 + g() * 12);
  }
  horde.spawnWave(400, WALL_Z - 26, WALL_Z - 6, 0.05); // living swarming the heap
  rig.frame(0, WALL_Z - 16, 78); rig.setPitch(0.62);
}
if (params.get('demo') === 'rts') {
  state.supply = 999;
  const b = field.placeBuildable('barracks', -10, WALL_Z + 24);
  selBuilding = b; queueUnit('rifles');
  rig.frame(-10, WALL_Z + 16, 40); rig.setPitch(0.55);
}
if (params.get('demo') === 'base') {
  field.placeBuildable('barracks', -28, WALL_Z + 24);
  field.placeBuildable('depot', 0, WALL_Z + 24);
  field.placeBuildable('lab', 30, WALL_Z + 24);
  rig.frame(0, WALL_Z + 22, 46); rig.setPitch(0.5);
}
if (params.get('demo') === 'breach') { horde.spawnWave(800, WALL_Z - 14, WALL_Z - 3); window.WF.test.crest(); rig.frame(0, 14, 66); }
if (params.get('look') === 'wall') rig.frame(-70, 40, 34);
if (params.get('look') === 'climb') rig.frame(-28, 42, 40);
if (params.get('demo') === 'possess') {
  const m = force.soldiers.find(s => s.alive);
  if (m) { possession.enter(m); possession.keys.add('w'); possession.firing = true; }
}
if (params.get('demo') === 'climb') {
  // send 3 RIFLES (mustered behind) up onto the rampart
  const sq = force.squads.find(s => s.label === '3 RIFLES');
  if (sq) { sq.setSelected(true); sq.giveOrder('MOVE', -28, field.wallZ); }
}

requestAnimationFrame(() => {
  window.WF.ready = true;
  window.WF.backend = R.backend;
  window.WF.fidelity = R.fidelity;
  console.log(`[WF] ready — backend=${R.backend} fidelity=${R.fidelity} men=${state.menRemaining}`);
});
