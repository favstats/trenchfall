// crows.js — carrion birds wheel over the slaughter. A flock of instanced billboard
// silhouettes circling the killing ground on lazy wandering orbits, wings flapping.
// ~40 camera-facing quads, matrices rebuilt per frame — cheap, and deeply on-theme.
import * as THREE from '../engine/three.js';
import { WALL_Z, FIELD_HALF_X } from '../world/field.js';

function crowTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 32;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 32);
  g.fillStyle = '#0a0d12';
  // body
  g.beginPath(); g.ellipse(32, 17, 4, 2.4, 0, 0, Math.PI * 2); g.fill();
  // two swept wings forming a shallow M
  g.beginPath();
  g.moveTo(32, 16);
  g.quadraticCurveTo(20, 6, 4, 14); g.quadraticCurveTo(20, 12, 31, 19);
  g.moveTo(32, 16);
  g.quadraticCurveTo(44, 6, 60, 14); g.quadraticCurveTo(44, 12, 33, 19);
  g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createCrows(scene) {
  const N = 40;
  const mat = new THREE.MeshBasicMaterial({
    map: crowTexture(), transparent: true, alphaTest: 0.25, depthWrite: false,
    color: 0x10141b, fog: true, opacity: 0.95, side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(3.0, 1.5), mat, N);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  scene.add(mesh);

  const birds = [];
  for (let i = 0; i < N; i++) {
    birds.push({
      cx: (Math.random() * 2 - 1) * (FIELD_HALF_X * 0.7),  // orbit centre over the field
      cz: WALL_Z - 30 - Math.random() * 70,
      r: 18 + Math.random() * 70,
      a: Math.random() * 6.28,
      spd: (0.12 + Math.random() * 0.22) * (Math.random() < 0.5 ? -1 : 1), // some wheel the other way
      y: 34 + Math.random() * 40,
      bob: Math.random() * 6.28,
      flap: Math.random() * 6.28,
      flapSpd: 7 + Math.random() * 5,
      scale: 0.7 + Math.random() * 0.7,
    });
  }

  const o = new THREE.Object3D();
  function update(dt, camera) {
    for (let i = 0; i < N; i++) {
      const b = birds[i];
      b.a += b.spd * dt;
      b.bob += dt * 0.6;
      b.flap += dt * b.flapSpd;
      const x = b.cx + Math.cos(b.a) * b.r;
      const z = b.cz + Math.sin(b.a) * b.r;
      const y = b.y + Math.sin(b.bob) * 3;
      o.position.set(x, y, z);
      if (camera) o.lookAt(camera.position);              // billboard toward the eye
      const flap = 0.55 + Math.abs(Math.sin(b.flap)) * 0.6; // wings beat: vertical squash/stretch
      o.scale.set(b.scale, b.scale * flap, b.scale);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { update, mesh };
}
