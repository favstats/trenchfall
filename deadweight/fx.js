// fx.js — pooled sparks and overcharge blasts. Physics does the heavy
// spectacle; this is the garnish that makes impacts feel electric.
import * as THREE from './engine/three.js';

const SPARK_N = 900;

export function createFx(scene, phys) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(SPARK_N * 3).fill(-999);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xffc46a, size: 0.09, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  pts.frustumCulled = false;
  scene.add(pts);
  const vel = new Float32Array(SPARK_N * 3), life = new Float32Array(SPARK_N);
  let head = 0;

  function sparks(x, y, z, n = 10) {
    for (let k = 0; k < n; k++) {
      const i = head; head = (head + 1) % SPARK_N;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      vel[i * 3] = (Math.random() - 0.5) * 10;
      vel[i * 3 + 1] = Math.random() * 7;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 10;
      life[i] = 0.3 + Math.random() * 0.5;
    }
  }

  const boomLight = new THREE.PointLight(0xffa04a, 0, 24, 1.6);
  scene.add(boomLight);
  let boomT = 0;

  function boom(x, y, z) {
    sparks(x, y, z, 60);
    boomLight.position.set(x, y, z);
    boomT = 0.3;
    // radial shove on every dynamic body near the blast
    for (const b of phys.bodies) {
      if (b.rb.isFixed()) continue;
      const p = b.rb.translation();
      const dx = p.x - x, dy = p.y - y, dz = p.z - z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 9 || d < 0.01) continue;
      const f = 90 * (1 - d / 9) / d;
      b.rb.applyImpulse({ x: dx * f, y: dy * f + 20 * (1 - d / 9), z: dz * f }, true);
    }
  }

  function update(dt) {
    for (let i = 0; i < SPARK_N; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt; vel[i * 3 + 1] -= 16 * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (life[i] <= 0) pos[i * 3 + 1] = -999;
    }
    geo.attributes.position.needsUpdate = true;
    boomT = Math.max(0, boomT - dt);
    boomLight.intensity = boomT > 0 ? 60 * (boomT / 0.3) : 0;
  }

  return { sparks, boom, update };
}
