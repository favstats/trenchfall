// breath.js — the living still breathe. Faint puffs of warm breath fog from the soldiers
// on the freezing line, rising and fading. A small pooled instanced billboard set, emitted
// at random manned positions — cheap, and it tells the living from the dead at a glance.
import * as THREE from '../engine/three.js';

function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.5, 'rgba(228,238,250,0.4)');
  grd.addColorStop(1, 'rgba(228,238,250,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(16, 16, 16, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createBreath(scene, force) {
  const N = 90;
  const mat = new THREE.MeshBasicMaterial({
    map: puffTexture(), transparent: true, depthWrite: false, fog: true,
    blending: THREE.AdditiveBlending, opacity: 1,
  });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, N);
  mesh.frustumCulled = false; mesh.count = N;
  const col = new THREE.Color();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < N; i++) mesh.setMatrixAt(i, hidden);
  scene.add(mesh);

  const puffs = Array.from({ length: N }, () => ({ t: 1e9, life: 1, x: 0, y: 0, z: 0, vy: 0, dx: 0, dz: 0 }));
  let head = 0, emit = 0;
  const o = new THREE.Object3D();

  function spawn() {
    const sol = force?.soldiers; if (!sol || !sol.length) return;
    const s = sol[(Math.random() * sol.length) | 0];
    if (!s || !s.alive) return;
    const p = s.pos || s.g?.position; if (!p) return;
    const fwd = s.heading ?? 0;             // breath drifts out the way they face
    const k = puffs[head]; head = (head + 1) % N;
    k.t = 0; k.life = 1.0 + Math.random() * 0.7;
    k.x = p.x - Math.sin(fwd) * 0.4; k.y = (s.elevation ?? p.y) + 3.2; k.z = p.z - Math.cos(fwd) * 0.4;
    k.vy = 0.6 + Math.random() * 0.4;
    k.dx = -Math.sin(fwd) * 0.7 + (Math.random() - 0.5) * 0.3;
    k.dz = -Math.cos(fwd) * 0.7 + (Math.random() - 0.5) * 0.3;
  }

  function update(dt, camera) {
    const n = force?.soldiers?.length || 0;
    emit += dt;
    const rate = Math.min(0.05 + n * 0.004, 0.4);   // more men on the line → more breath
    while (emit >= rate) { emit -= rate; spawn(); }

    for (let i = 0; i < N; i++) {
      const k = puffs[i];
      if (k.t >= k.life) { continue; }
      k.t += dt;
      const f = k.t / k.life;
      if (f >= 1) { mesh.setMatrixAt(i, hidden); continue; }
      k.x += k.dx * dt; k.y += k.vy * dt; k.z += k.dz * dt;
      o.position.set(k.x, k.y, k.z);
      if (camera) o.quaternion.copy(camera.quaternion);
      o.scale.setScalar(0.5 + f * 1.3);              // expands as it dissipates
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      const a = Math.sin(f * Math.PI) * 0.32;        // fade in then out (additive → color carries alpha)
      col.setRGB(a, a, a * 1.04);
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  return { update, mesh };
}
