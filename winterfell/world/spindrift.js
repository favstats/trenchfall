// spindrift.js — the wind drives snow across the ground. Low, fast, flat sheets of
// blown powder skating over the killing ground (distinct from the vertical falling snow
// and the soft hanging mist), catching the floodlights and searchlights as they race
// past. Camera-following so it's always underfoot; a few dozen quads — cheap.
import * as THREE from '../engine/three.js';
import { season } from '../game/season.js';

function driftTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const g = c.getContext('2d');
  // a soft elongated streak, brightest mid, tapering to nothing at both ends
  const grd = g.createLinearGradient(0, 0, 128, 0);
  grd.addColorStop(0.0, 'rgba(230,240,255,0)');
  grd.addColorStop(0.5, 'rgba(230,240,255,0.7)');
  grd.addColorStop(1.0, 'rgba(230,240,255,0)');
  g.fillStyle = grd;
  for (let i = 0; i < 4; i++) { const y = 4 + i * 8; g.fillRect(0, y, 128, 3 + Math.random() * 3); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const HALF = 150, Y0 = 0.4, Y1 = 3.0;

export function createSpindrift(scene) {
  if (!season().snow) return { update() {} };   // only when there's snow to blow
  const N = 30;
  const mat = new THREE.MeshBasicMaterial({
    map: driftTexture(), transparent: true, depthWrite: false, fog: true,
    opacity: 0.16, color: 0xdfeaff, side: THREE.DoubleSide,
  });
  const geo = new THREE.PlaneGeometry(38, 5);
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.frustumCulled = false; mesh.renderOrder = 2;
  scene.add(mesh);

  const sheets = [];
  for (let i = 0; i < N; i++) {
    sheets.push({
      x: (Math.random() * 2 - 1) * HALF, y: Y0 + Math.random() * (Y1 - Y0), z: (Math.random() * 2 - 1) * HALF,
      spd: 12 + Math.random() * 16, yaw: 0.1 + Math.random() * 0.25, s: 0.7 + Math.random() * 0.9,
      ph: Math.random() * 6.28,
    });
  }
  const o = new THREE.Object3D();
  let wind = 0;
  function update(dt, camera) {
    if (!camera) return;
    const cx = camera.position.x, cz = camera.position.z;
    wind += dt * 0.4;
    const dirx = Math.cos(0.5 + Math.sin(wind) * 0.2), dirz = Math.sin(0.5 + Math.sin(wind) * 0.2);
    for (let i = 0; i < N; i++) {
      const s = sheets[i];
      s.x += dirx * s.spd * dt; s.z += dirz * s.spd * dt;
      s.ph += dt * 3;
      let dx = s.x - cx, dz = s.z - cz;          // wrap within the camera window
      if (dx > HALF) s.x -= HALF * 2; else if (dx < -HALF) s.x += HALF * 2;
      if (dz > HALF) s.z -= HALF * 2; else if (dz < -HALF) s.z += HALF * 2;
      o.position.set(s.x, s.y + Math.sin(s.ph) * 0.2, s.z);
      o.rotation.set(-Math.PI / 2 + 0.12, Math.atan2(dirx, dirz), 0); // flat-ish, aligned to the wind
      o.scale.set(s.s, s.s, 1);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { update, mesh };
}
