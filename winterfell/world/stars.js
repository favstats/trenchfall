// stars.js — the cold stars of the Long Night. A field of pinpoints scattered across the
// upper sky dome with a gentle collective twinkle, and the occasional shooting star streaking
// over. Points (constant pixel size) + one reused streak — effectively free, behind everything.
import * as THREE from '../engine/three.js';

function starTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(8, 8, 0, 8, 8, 8);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.5, 'rgba(220,232,255,0.5)'); grd.addColorStop(1, 'rgba(220,232,255,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(8, 8, 8, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createStars(scene) {
  const N = 460, R = 430;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * Math.PI * 2;
    let dx = Math.cos(u), dz = Math.sin(u), dy = 0.28 + Math.random() * 1.1; // upper dome
    const len = Math.hypot(dx, dy, dz);
    pos[i * 3] = dx / len * R; pos[i * 3 + 1] = dy / len * R + 20; pos[i * 3 + 2] = dz / len * R;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const tex = starTexture();
  const mat = new THREE.PointsMaterial({
    size: 2.4, map: tex, transparent: true, depthWrite: false, depthTest: false,
    sizeAttenuation: false, fog: false, opacity: 0.9, color: 0xdfe8ff, blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(geo, mat);
  stars.frustumCulled = false; stars.renderOrder = -2; // sky, behind the aurora
  scene.add(stars);

  // one reused shooting-star streak
  const streak = new THREE.Mesh(new THREE.PlaneGeometry(10, 0.5), new THREE.MeshBasicMaterial({
    map: tex, color: 0xffffff, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0,
  }));
  streak.frustumCulled = false; streak.renderOrder = -1; scene.add(streak);
  let shoot = { t: 0, life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  let timer = 8 + Math.random() * 16;

  let t = 0;
  function update(dt, camera) {
    t += dt;
    mat.opacity = 0.82 + 0.12 * Math.sin(t * 1.3) + 0.06 * Math.sin(t * 3.7); // collective twinkle

    timer -= dt;
    if (timer <= 0 && shoot.life <= 0) {
      timer = 14 + Math.random() * 26;
      shoot.t = 0; shoot.life = 1.0 + Math.random() * 0.6;
      const a = Math.random() * Math.PI * 2;
      shoot.x = Math.cos(a) * 280; shoot.z = Math.sin(a) * 280; shoot.y = 150 + Math.random() * 90;
      const d = Math.random() * Math.PI * 2;
      shoot.vx = Math.cos(d) * 320; shoot.vz = Math.sin(d) * 320; shoot.vy = -40 - Math.random() * 60;
    }
    if (shoot.life > 0) {
      shoot.t += dt;
      const f = shoot.t / shoot.life;
      if (f >= 1) { shoot.life = 0; streak.material.opacity = 0; }
      else {
        shoot.x += shoot.vx * dt; shoot.y += shoot.vy * dt; shoot.z += shoot.vz * dt;
        streak.position.set(shoot.x, shoot.y, shoot.z);
        if (camera) streak.quaternion.copy(camera.quaternion);
        streak.rotation.z = Math.atan2(shoot.vy, Math.hypot(shoot.vx, shoot.vz)); // lie along travel
        streak.material.opacity = Math.sin(f * Math.PI) * 0.9;
      }
    }
  }
  return { update, stars };
}
