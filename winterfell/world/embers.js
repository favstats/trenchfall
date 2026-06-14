// embers.js — the battlefield smoulders. Warm motes of ash and ember drift UP out of
// the killing ground (where braziers burn and the dead are put to the torch), flicker,
// and die out. Additive glow, anchored to the field in front of the wall — a warm
// counterpoint to the cold falling snow. One cheap JS pass per frame.
import * as THREE from '../engine/three.js';
import { WALL_Z, NORTH_Z, FIELD_HALF_X } from '../world/field.js';

function emberTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0.0, 'rgba(255,236,196,1)');
  grd.addColorStop(0.35, 'rgba(255,150,60,0.85)');
  grd.addColorStop(1.0, 'rgba(255,90,30,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(16, 16, 16, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// embers live over the killing ground, fading out well before the back of the field
const Z0 = WALL_Z - 96, Z1 = WALL_Z + 6;
const X_HALF = FIELD_HALF_X + 6;
const TOP = 34;

export function createEmbers(scene) {
  const N = 900;
  const pos = new Float32Array(N * 3);
  const rise = new Float32Array(N);
  const phase = new Float32Array(N);
  const reseat = (i, low) => {
    pos[i * 3] = (Math.random() * 2 - 1) * X_HALF;
    pos[i * 3 + 1] = low ? Math.random() * 3 : Math.random() * TOP;
    pos[i * 3 + 2] = Z0 + Math.random() * (Z1 - Z0);
    rise[i] = 1.6 + Math.random() * 3.2;
    phase[i] = Math.random() * 6.28;
  };
  for (let i = 0; i < N; i++) reseat(i, false);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.7, map: emberTexture(), color: 0xff9a4a,
    transparent: true, depthWrite: false, fog: true, sizeAttenuation: true,
    opacity: 0.62, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 3;
  scene.add(points);

  let t = 0;
  function update(dt) {
    t += dt;
    const a = geo.attributes.position.array;
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      phase[i] += dt * (2 + rise[i]);
      a[i3] += Math.sin(phase[i]) * 0.4 * dt + 0.25 * dt;   // lazy sideways waft
      a[i3 + 1] += rise[i] * dt;                            // rise
      a[i3 + 2] += Math.cos(phase[i] * 0.7) * 0.3 * dt;
      if (a[i3 + 1] > TOP) reseat(i, true);                 // burnt out — respawn low
    }
    geo.attributes.position.needsUpdate = true;
    // collective flicker so the bed of embers breathes
    mat.opacity = 0.5 + Math.sin(t * 3.1) * 0.07 + Math.sin(t * 7.7) * 0.04;
  }
  return { update, points };
}
