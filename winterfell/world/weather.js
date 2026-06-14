// weather.js — atmosphere in the air itself. A camera-following particle field so
// the space around the player is never empty: thick drifting snow on winter nights,
// a faint drift of ash/dust otherwise. Pure THREE, wraps an infinite window around
// the camera, costs one cheap JS pass per frame.
import * as THREE from '../engine/three.js';
import { season } from '../game/season.js';

function flakeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0.0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(16, 16, 16, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const HALF = 160;            // window half-extent in x/z, re-centred on the camera
const TOP = 96, BOT = -3;    // vertical span the flakes recycle through

export function createWeather(scene) {
  const s = season();
  const snow = !!s.snow;
  const N = snow ? 3200 : 1100; // fewer transparent sprites = less full-screen overdraw
  const pos = new Float32Array(N * 3);
  const fall = new Float32Array(N);   // per-flake descent speed
  const phase = new Float32Array(N);  // drift phase
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * HALF;
    pos[i * 3 + 1] = BOT + Math.random() * (TOP - BOT);
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * HALF;
    fall[i] = snow ? 3.0 + Math.random() * 3.4 : 0.5 + Math.random() * 0.9;
    phase[i] = Math.random() * 6.28;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: snow ? 1.35 : 0.7,
    map: flakeTexture(),
    color: snow ? 0xeaf2ff : 0xc2ad88,
    transparent: true, depthWrite: false, fog: true, sizeAttenuation: true,
    opacity: snow ? 0.92 : 0.5,
    blending: snow ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 3;
  scene.add(points);

  let wind = 0;
  function update(dt, camera) {
    if (!camera) return;
    const cx = camera.position.x, cz = camera.position.z;
    wind += dt * 0.32;
    const wx = Math.sin(wind) * (snow ? 1.0 : 0.4) + 0.5;     // gusting prevailing wind
    const wz = Math.cos(wind * 0.7) * (snow ? 0.6 : 0.3);
    const a = geo.attributes.position.array;
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      phase[i] += dt * 1.6;
      a[i3] += (wx + Math.sin(phase[i]) * 0.55) * dt;
      a[i3 + 1] -= fall[i] * dt;
      a[i3 + 2] += (wz + Math.cos(phase[i] * 0.8) * 0.45) * dt;
      if (a[i3 + 1] < BOT) a[i3 + 1] = TOP;                   // recycle to the top
      const dx = a[i3] - cx, dz = a[i3 + 2] - cz;             // keep the field on-camera
      if (dx > HALF) a[i3] -= HALF * 2; else if (dx < -HALF) a[i3] += HALF * 2;
      if (dz > HALF) a[i3 + 2] -= HALF * 2; else if (dz < -HALF) a[i3 + 2] += HALF * 2;
    }
    geo.attributes.position.needsUpdate = true;
  }
  return { update, points };
}
