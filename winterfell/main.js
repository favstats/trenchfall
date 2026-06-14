// THE LONG NIGHT — The First Assault. Boot, game loop, module wiring.
import * as THREE from './engine/three.js';
import { createRenderer } from './engine/renderer.js';

const canvas = document.getElementById('gl');

// expose a control/QA surface immediately so the shot harness can wait on it
window.WF = { ready: false, backend: null, fidelity: null, test: {} };

const params = new URLSearchParams(location.search);
const forced = params.get('fidelity'); // low|medium|high
const forceWebGL = params.get('gl') === '1';
const R = await createRenderer(canvas, forced || undefined, forceWebGL);
const { scene, camera } = R;

// ----- temporary M0 scene: lit ground + a few stand-in markers -----
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(800, 800),
  new THREE.MeshStandardMaterial({ color: 0xe6edf5, roughness: 1, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const markers = new THREE.Group();
const boxGeo = new THREE.BoxGeometry(3, 6, 3);
const blueMat = new THREE.MeshStandardMaterial({ color: 0x3b6ea5, roughness: 0.6 });
const redMat = new THREE.MeshStandardMaterial({ color: 0x8a2230, roughness: 0.7 });
for (let i = 0; i < 6; i++) {
  const b = new THREE.Mesh(boxGeo, i < 3 ? blueMat : redMat);
  b.position.set((i - 2.5) * 8, 3, i < 3 ? 30 : -40);
  b.castShadow = true; b.receiveShadow = true;
  markers.add(b);
}
scene.add(markers);

window.addEventListener('resize', R.setSize);

let last = performance.now();
async function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  markers.rotation.y += dt * 0.2; // tiny life so the frame is obviously live
  await R.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// flag ready after the first real frame has been submitted
requestAnimationFrame(() => {
  window.WF.ready = true;
  window.WF.backend = R.backend;
  window.WF.fidelity = R.fidelity;
  console.log(`[WF] ready — backend=${R.backend} fidelity=${R.fidelity}`);
});
