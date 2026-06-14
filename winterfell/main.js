// THE LONG NIGHT — The First Assault. Boot, game loop, module wiring.
import * as THREE from './engine/three.js';
import { createRenderer } from './engine/renderer.js';
import { buildField } from './world/field.js';
import { makeCameraRig, makePicker } from './engine/input.js';

const canvas = document.getElementById('gl');

// expose a control/QA surface immediately so the shot harness can wait on it
window.WF = { ready: false, backend: null, fidelity: null, test: {} };

const params = new URLSearchParams(location.search);
const forced = params.get('fidelity'); // low|medium|high
const forceWebGL = params.get('gl') === '1';
const R = await createRenderer(canvas, forced || undefined, forceWebGL);
const { scene, camera } = R;

// ----- world -----
const field = buildField(scene);
const rig = makeCameraRig(camera, canvas, field.bounds);
const picker = makePicker(camera, canvas);

window.addEventListener('resize', R.setSize);

// ----- loop -----
let last = performance.now();
async function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  rig.update(dt);
  window.WF.stats = {
    cam: camera.position.toArray().map(n => +n.toFixed(1)),
    focus: rig.focus.toArray().map(n => +n.toFixed(1)),
  };
  await R.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// QA / debug surface
window.WF.test = {
  frame: (x, z, d) => rig.frame(x, z, d),
  ground: (x, y) => picker.ground(x, y),
};

requestAnimationFrame(() => {
  window.WF.ready = true;
  window.WF.backend = R.backend;
  window.WF.fidelity = R.fidelity;
  console.log(`[WF] ready — backend=${R.backend} fidelity=${R.fidelity}`);
});
