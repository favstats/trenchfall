// warglow.js — something burns in the north. A low, warm, flickering glow on the far
// horizon beyond the treeline — the dead-lands the horde pours out of, lit by distant
// fires — set against the cold aurora above for a warm/cold contrast. A couple of wide
// additive planes that pulse and drift. Effectively free, pure world-building.
import * as THREE from '../engine/three.js';
import { NORTH_Z } from '../world/field.js';

function glowTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  // bright along the bottom (the horizon line of fire), fading up to nothing
  const grd = g.createLinearGradient(0, 128, 0, 0);
  grd.addColorStop(0.0, 'rgba(255,150,70,0.9)');
  grd.addColorStop(0.25, 'rgba(220,80,40,0.5)');
  grd.addColorStop(0.6, 'rgba(150,40,30,0.18)');
  grd.addColorStop(1.0, 'rgba(80,20,30,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 128);
  // a few brighter blooms along the horizon (separate fires)
  for (let i = 0; i < 6; i++) {
    const x = 20 + Math.random() * 216, r = 18 + Math.random() * 40;
    const b = g.createRadialGradient(x, 122, 1, x, 122, r);
    b.addColorStop(0, 'rgba(255,180,90,0.5)'); b.addColorStop(1, 'rgba(255,180,90,0)');
    g.fillStyle = b; g.beginPath(); g.arc(x, 122, r, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createWarGlow(scene) {
  const tex = glowTexture();
  const bands = [];
  const specs = [
    { w: 620, h: 70, y: 30, z: NORTH_Z - 30, x: -40, op: 0.4, sp: 0.5 },
    { w: 520, h: 56, y: 24, z: NORTH_Z - 16, x: 90, op: 0.32, sp: 0.8 },
  ];
  for (const s of specs) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, fog: false, opacity: s.op, color: 0xff8038,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), mat);
    m.position.set(s.x, s.y, s.z);
    m.renderOrder = -1; // sky/horizon, behind the field
    m.frustumCulled = false;
    scene.add(m);
    bands.push({ m, baseOp: s.op, sp: s.sp, phase: Math.random() * 6.28 });
  }

  let t = 0;
  function update(dt) {
    t += dt;
    for (const b of bands) {
      b.phase += dt * b.sp;
      // slow swell + a faster fire-flicker
      b.m.material.opacity = b.baseOp * (0.7 + 0.22 * Math.sin(b.phase) + 0.1 * Math.sin(t * 6 + b.phase * 3));
    }
  }
  return { update };
}
