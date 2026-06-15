// aurora.js — the lights of the far north. Additive curtains of green-teal hang and
// drift in the northern sky above the field, undulating slowly. A handful of big
// billboards on the sky dome — effectively free, pure atmosphere for the Long Night.
import * as THREE from '../engine/three.js';

function curtainTexture(hue) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  // vertical wispy rays, brightest low-mid, fading to nothing at the top and bottom
  for (let x = 0; x < 256; x++) {
    const ray = Math.pow(Math.max(0, Math.sin(x * 0.08 + Math.sin(x * 0.021) * 3) ), 2.2)
              * (0.5 + 0.5 * Math.sin(x * 0.013 + 1.7));
    if (ray < 0.02) continue;
    for (let y = 0; y < 256; y++) {
      const v = y / 256;
      const vert = Math.max(0, Math.sin(v * Math.PI * 0.92 + 0.12)) * (1 - v * 0.35);
      const a = ray * vert;
      if (a < 0.01) continue;
      const top = v; // greener low, tealer/violet high
      const r = Math.round((0.20 + top * 0.35) * 255);
      const gg = Math.round((0.95 - top * 0.3) * 255);
      const b = Math.round((0.55 + top * 0.45) * 255);
      g.fillStyle = `rgba(${r},${gg},${b},${(a * 0.9).toFixed(3)})`;
      g.fillRect(x, 255 - y, 1, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createAurora(scene) {
  const group = new THREE.Group();
  const bands = [];
  // a few overlapping curtains at different depth/scale for parallax and depth
  const specs = [
    { w: 760, h: 200, y: 104, z: -370, x: -60, rep: 3.0, drift: 0.006, op: 0.5 },
    { w: 640, h: 176, y: 92,  z: -340, x: 80, rep: 2.4, drift: -0.009, op: 0.42 },
    { w: 520, h: 150, y: 124, z: -400, x: -10, rep: 3.4, drift: 0.013, op: 0.34 },
  ];
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i];
    const tex = curtainTexture(i);
    tex.repeat.set(s.rep, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, opacity: s.op,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), mat);
    m.position.set(s.x, s.y, s.z);
    m.renderOrder = -1; // behind everything, it's sky
    m.frustumCulled = false;
    group.add(m);
    bands.push({ m, tex, drift: s.drift, baseOp: s.op, phase: Math.random() * 6.28 });
  }
  scene.add(group);

  let t = 0;
  function update(dt) {
    t += dt;
    for (const b of bands) {
      b.tex.offset.x = (b.tex.offset.x + b.drift * dt) % 1;     // slow horizontal drift
      b.phase += dt * 0.4;
      b.m.material.opacity = b.baseOp * (0.7 + 0.3 * Math.sin(b.phase)); // breathing glow
    }
  }
  return { update, group };
}
