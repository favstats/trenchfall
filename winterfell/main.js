// THE LONG NIGHT — The First Assault. Boot, game loop, module wiring.
import * as THREE from './engine/three.js';
import { createRenderer } from './engine/renderer.js';
import { buildField } from './world/field.js';
import { makeCameraRig, makePicker } from './engine/input.js';
import { GameState } from './game/state.js';
import { Force } from './units/squads.js';
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
// first ranks already across the field (front already in range), tide builds from behind
horde.spawnWave(Math.floor(horde.cap * 0.6), NORTH_Z + 20, WALL_Z - 22);
const combat = new Combat(scene, force, horde, state);
let spawnAcc = 0;
const hud = createHUD(hudRoot, state, {
  onMortar: () => console.log('[WF] mortar (M5)'),
  onReserve: () => console.log('[WF] reserve (M5)'),
});

// ---------------- input: selection + orders ----------------
let down = null;       // {x,y} on left press
let dragging = false;
const DRAG_MIN = 6;

canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('mousedown', e => {
  if (e.button === 0) { down = { x: e.clientX, y: e.clientY }; dragging = false; }
});

canvas.addEventListener('mousemove', e => {
  if (down && !dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_MIN) dragging = true;
  if (dragging) hud.showDragBox(down.x, down.y, e.clientX, e.clientY);
});

window.addEventListener('mouseup', e => {
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
    force.update(dt);
    // keep the tide topped up — the dead never stop coming
    spawnAcc += dt;
    if (spawnAcc > 0.35 && horde.count < horde.cap) { horde.spawnWave(30); spawnAcc = 0; }
    horde.update(dt);
    combat.update(dt);
  }
  if (field.update) field.update(dt, camera);
  rig.update(dt);
  hud.update(force);
  window.WF.stats = {
    cam: camera.position.toArray().map(n => +n.toFixed(1)),
    men: state.menRemaining, kills: state.kills,
    horde: horde.count,
    selected: force.selected().map(s => s.label),
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
};

if (params.get('pitch')) rig.setPitch(parseFloat(params.get('pitch')));
if (params.get('look') === 'wall') rig.frame(-70, 40, 34);
if (params.get('look') === 'climb') rig.frame(-28, 42, 40);
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
