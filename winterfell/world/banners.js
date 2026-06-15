// banners.js — war banners snapping along the wall. A line of tattered heraldic flags
// on poles above the battlements, each a small cloth mesh rippling on a travelling wind
// wave. A few dozen verts animated per frame — free, and it makes the wall feel held.
import * as THREE from '../engine/three.js';
import { WALL_Z, WALL_H, GATE_W, FIELD_HALF_X } from '../world/field.js';

function bannerTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 48;
  const g = c.getContext('2d');
  g.fillStyle = '#3a4048'; g.fillRect(0, 0, 64, 48);             // weathered grey field (Stark)
  g.fillStyle = '#2a2f35'; g.fillRect(0, 0, 64, 6); g.fillRect(0, 42, 64, 6); // darker bands top/bottom
  g.fillStyle = '#cdd6df';                                        // pale running device in the centre
  g.beginPath(); g.ellipse(30, 24, 13, 8, -0.2, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#3a4048';
  g.beginPath(); g.ellipse(30, 24, 9, 5, -0.2, 0, Math.PI * 2); g.fill(); // hollow it so it reads as a sigil
  // grime + fray
  for (let i = 0; i < 80; i++) { g.fillStyle = `rgba(20,24,28,${Math.random() * 0.18})`; g.fillRect(Math.random() * 64, Math.random() * 48, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createBanners(scene) {
  const tex = bannerTexture();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.9 });
  const clothMat = new THREE.MeshStandardMaterial({
    map: tex, color: 0x9a3030, roughness: 0.92, metalness: 0, side: THREE.DoubleSide,
  });
  const poleGeo = new THREE.CylinderGeometry(0.14, 0.16, 10, 6);
  const finialGeo = new THREE.SphereGeometry(0.26, 8, 6);

  const W = 3.6, Hh = 2.5; // flag size (big wide war banner)
  const flags = [];
  const group = new THREE.Group();
  for (let x = -FIELD_HALF_X + 16; x <= FIELD_HALF_X - 16; x += 26) {
    if (Math.abs(x) < GATE_W / 2 + 8) continue;       // no parapet over the gate
    const poleTopY = WALL_H + 9;
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, WALL_H + 4.5, WALL_Z - 0.6);
    pole.castShadow = true;
    group.add(pole);
    const finial = new THREE.Mesh(finialGeo, poleMat);
    finial.position.set(x, poleTopY + 0.3, WALL_Z - 0.6);
    group.add(finial);

    const geo = new THREE.PlaneGeometry(W, Hh, 10, 5);
    geo.translate(W / 2, -Hh / 2, 0);                  // hang from the pole's top-left
    const flag = new THREE.Mesh(geo, clothMat);
    flag.position.set(x, poleTopY - 0.1, WALL_Z - 0.6);
    flag.castShadow = false;
    group.add(flag);
    // cache base positions for the wave
    const base = geo.attributes.position.array.slice();
    flags.push({ geo, base, phase: Math.random() * 6.28 });
  }
  scene.add(group);

  let t = 0;
  function update(dt) {
    t += dt;
    const gust = 0.8 + 0.35 * Math.sin(t * 0.7);       // wind swells and eases
    for (const f of flags) {
      const p = f.geo.attributes.position, b = f.base;
      for (let i = 0; i < p.count; i++) {
        const x = b[i * 3];                             // distance from the pole (0..W)
        const k = x / W;                                // free edge ripples most
        const wav = Math.sin(x * 3.2 - t * 7 + f.phase) * 0.34 * k * gust
                  + Math.sin(b[i * 3 + 1] * 4 - t * 5) * 0.08 * k;
        p.setZ(i, b[i * 3 + 2] + wav);
        p.setX(i, x - 0.12 * k * k * gust);             // slight pull taut along the wind
      }
      p.needsUpdate = true;
      f.geo.computeVertexNormals();
    }
  }
  return { update, group };
}
