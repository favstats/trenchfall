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

const canvas = document.getElementById('gl');
const hudRoot = document.getElementById('hud');

window.WF = { ready: false, backend: null, fidelity: null, test: {} };

const params = new URLSearchParams(location.search);
const forced = params.get('fidelity');
const forceWebGL = params.get('gl') === '1';
const R = await createRenderer(canvas, forced || undefined, forceWebGL);
const { scene, camera } = R;

const state = new GameState(R.fidelity);
const field = buildField(scene);
const rig = makeCameraRig(camera, canvas, field.bounds);
const picker = makePicker(camera, canvas);
const force = new Force(scene, state);
const horde = new Horde(scene, state, field);
// the dead muster at the back, by the godswood, and march south on the wall
horde.spawnWave(Math.floor(horde.cap * 0.55), NORTH_Z + 10, NORTH_Z + 115);
const combat = new Combat(scene, force, horde, state);
const possession = new Possession(camera, rig, force, combat, canvas);
let lastKillSupply = 0;

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
  addSupply(dt * state.supplyRate);
  if (state.kills > lastKillSupply) {
    addSupply((state.kills - lastKillSupply) * 0.22);
    lastKillSupply = state.kills;
  }
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
  state.buildMode = null;
  return true;
}

function callReserve() {
  if (!spendSupply('recruit')) return;
  state.recruits++;
  const side = state.recruits % 2 ? -1 : 1;
  force.addSquad(`GARRISON ${state.recruits}`, 'rifle', side * 14, WALL_Z + 40, 6); // muster at the gate
}

function repairGate() {
  if ((field.gateHealth?.() ?? 1) >= 0.995) return;
  if (!spendSupply('repair')) return;
  field.repairGate?.(105);
}
let spawnAcc = 0;
let surgeAt = 28;

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
  onBuildBarricade: () => setBuildMode('barricade'),
  onBuildSpikes: () => setBuildMode('spikes'),
  onRepair: repairGate,
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
    if (p) placeSelectedWork(p.x, p.z);
    down = null; dragging = false;
    return;
  }
  if (e.button === 0) { down = { x: e.clientX, y: e.clientY }; dragging = false; }
});

canvas.addEventListener('mousemove', e => {
  if (down && !dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_MIN) dragging = true;
  if (dragging) hud.showDragBox(down.x, down.y, e.clientX, e.clientY);
});

window.addEventListener('mouseup', e => {
  if (possession.active) { down = null; dragging = false; hud.hideDragBox(); return; }
  if (e.button === 2) { // right-click order — lands on wall/embankment/ground
    const hits = picker.objects(e.clientX, e.clientY, field.placementTargets);
    const p = hits.length ? hits[0].point : picker.ground(e.clientX, e.clientY);
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
    if (hits.length) force.selectSquadByObject(hits[0].object, e.shiftKey);
    else if (!e.shiftKey) force.clearSelection();
  }
  down = null; dragging = false;
});

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'f') {
    if (possession.active) possession.exit();
    else { const m = force.selected().flatMap(s => s.alive)[0]; if (m) possession.enter(m); }
    return;
  }
  if (possession.active) return; // direct-control owns the keyboard
  if (k === 'v') fireMortarCallIn();
  else if (k === 'c') callReserve();
  else if (k === 'b') setBuildMode('barricade');
  else if (k === 'n') setBuildMode('spikes');
  else if (k === 'r') repairGate();
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
    // keep the tide topped up — the dead never stop coming
    spawnAcc += dt;
    const pressure = 1 + state.time / state.waveDuration;
    if (spawnAcc > Math.max(0.16, 0.42 - pressure * 0.08) && horde.count < horde.cap) {
      horde.spawnWave(Math.floor(22 + pressure * 18));
      spawnAcc = 0;
    }
    if (state.time >= surgeAt) {
      horde.spawnWave(Math.floor(160 + pressure * 90), NORTH_Z - 8, NORTH_Z + 70);
      surgeAt += 26;
    }
    horde.update(dt);
    combat.update(dt);
    // ---- win / lose ----
    if (state.menRemaining <= 0 || horde.wallCrest() >= 7) { state.phase = 'lost'; hud.showEnd(); }
    else if (state.time >= state.waveDuration) { state.phase = 'won'; hud.showEnd(); }
  }
  if (field.update) field.update(dt, camera);
  rig.update(dt);
  possession.update(dt);
  state.possession = possession.active ? (possession.avatar?.squad?.label ?? 'DIRECT') : null;
  hud.update(force);
  window.WF.stats = {
    cam: camera.position.toArray().map(n => +n.toFixed(1)),
    men: state.menRemaining, kills: state.kills,
    lost: state.menLost, risen: state.menRisen,
    horde: horde.count, corpses: horde.corpseCount, crest: horde.wallCrest(),
    phase: state.phase,
    selected: force.selected().map(s => s.label),
    supply: Math.floor(state.supply), gate: +state.gateHp.toFixed(2), works: state.works,
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
  build: (kind = 'barricade', x = 0, z = WALL_Z - 28) => field.placeBuildable(kind, x, z),
  repair: () => field.repairGate?.(105),
  supply: (n = 100) => addSupply(n),
};

if (params.get('end')) { state.phase = params.get('end'); state.kills = 842; state.menLost = 7; state.menRisen = 4; hud.showEnd(); }
if (params.get('wave')) state.waveDuration = parseFloat(params.get('wave'));
if (params.get('pitch')) rig.setPitch(parseFloat(params.get('pitch')));
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
