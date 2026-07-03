// DEADWEIGHT — physics smoke slice. Before the game is built on Rapier, this
// boot proves the load-bearing risk: engine loads from CDN, WASM inits, a
// tower of crates collapses under gravity, three.js mirrors every body.
// window.DW.test.settled() reports when the pile stops moving.
import * as THREE from './engine/three.js';
import RAPIER_NS from 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.14.0/+esm';

const canvas = document.getElementById('gl');
window.DW = { ready: false, stats: {}, test: {} };

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e14);
scene.fog = new THREE.Fog(0x0a0e14, 20, 90);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(10, 7, 14);
camera.lookAt(0, 2, 0);
const sun = new THREE.DirectionalLight(0xcfe0ff, 2.2);
sun.position.set(6, 12, 4);
scene.add(sun, new THREE.HemisphereLight(0x8aa4c8, 0x1c2430, 0.7));

const RAPIER = RAPIER_NS;
await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

// floor
world.createCollider(RAPIER.ColliderDesc.cuboid(30, 0.5, 30).setTranslation(0, -0.5, 0));
const floorM = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 60), new THREE.MeshLambertMaterial({ color: 0x1c242e }));
floorM.position.y = -0.5;
scene.add(floorM);

// a tower of crates, ready to fall
const bodies = [];
const crateGeo = new THREE.BoxGeometry(1, 1, 1);
for (let y = 0; y < 8; y++) for (let x = 0; x < 3; x++) {
  const rb = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(x - 1 + (Math.random() - 0.5) * 0.08, 0.6 + y * 1.05, (Math.random() - 0.5) * 0.08));
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5).setDensity(1), rb);
  const m = new THREE.Mesh(crateGeo, new THREE.MeshLambertMaterial({ color: [0x8a6a3c, 0x6a7a8a, 0x7a5a4a][(x + y) % 3] }));
  scene.add(m);
  bodies.push({ rb, m });
}
// the wrecking ball that proves momentum matters
const ballRb = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(-14, 3, 0).setLinvel(18, 2, 0));
world.createCollider(RAPIER.ColliderDesc.ball(0.9).setDensity(6), ballRb);
const ballM = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 14), new THREE.MeshStandardMaterial({ color: 0x9aa4b0, metalness: 0.7, roughness: 0.35 }));
scene.add(ballM);
bodies.push({ rb: ballRb, m: ballM });

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  world.timestep = Math.max(1 / 240, dt);
  world.step();
  let maxV = 0;
  for (const b of bodies) {
    const p = b.rb.translation(), q = b.rb.rotation(), v = b.rb.linvel();
    b.m.position.set(p.x, p.y, p.z);
    b.m.quaternion.set(q.x, q.y, q.z, q.w);
    maxV = Math.max(maxV, Math.hypot(v.x, v.y, v.z));
  }
  window.DW.stats = { bodies: bodies.length, maxV: +maxV.toFixed(2) };
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.DW.test.settled = () => window.DW.stats.maxV < 0.15;
window.DW.ready = true;
console.log('[DW] rapier up —', bodies.length, 'bodies live');
