// bloodfield.js — the snow remembers. Where the dead fall, dark blood soaks the ground;
// over a long night the killing field in front of the wall turns crimson where the
// slaughter concentrates. A bounded ring-buffer of flat decals — fed one stain per few
// deaths, overwriting the oldest, so it stays cheap while the field stays bloody.
import * as THREE from '../engine/three.js';
import { heightAt } from '../world/field.js';

function bloodTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const cx = 64, cy = 64;
  for (let i = 0; i < 7; i++) {                 // ragged overlapping lobes
    const a = Math.random() * 6.28, d = Math.random() * 26;
    const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d, rr = 20 + Math.random() * 26;
    const grd = g.createRadialGradient(px, py, 1, px, py, rr);
    grd.addColorStop(0, 'rgba(58,4,6,0.92)');
    grd.addColorStop(0.6, 'rgba(80,8,10,0.5)');
    grd.addColorStop(1, 'rgba(80,8,10,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(px, py, rr, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 40; i++) {                // flung spatter
    const a = Math.random() * 6.28, d = 26 + Math.random() * 34;
    g.fillStyle = `rgba(${60 + (Math.random() * 30) | 0},6,8,${0.3 + Math.random() * 0.5})`;
    g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1 + Math.random() * 3, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createBloodField(scene) {
  const N = 520;
  const mat = new THREE.MeshBasicMaterial({
    map: bloodTexture(), transparent: true, depthWrite: false, fog: true,
    opacity: 0.85, color: 0x9a1414, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, N);
  mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 1;
  scene.add(mesh);

  const o = new THREE.Object3D();
  let head = 0, n = 0, tick = 0;
  function stain(x, z) {
    if (++tick % 3 !== 0) return;               // ~1 mark per 3 deaths — density without spam
    const i = head; head = (head + 1) % N; n = Math.min(n + 1, N);
    const s = 2.4 + Math.random() * 2.8;
    o.position.set(x + (Math.random() - 0.5) * 1.6, heightAt(x, z) + 0.07, z + (Math.random() - 0.5) * 1.6);
    o.rotation.set(-Math.PI / 2, 0, Math.random() * 6.28);
    o.scale.set(s * (0.8 + Math.random() * 0.5), s * (0.8 + Math.random() * 0.5), 1);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { stain, mesh };
}
