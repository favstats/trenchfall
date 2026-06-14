// lightshafts.js — the floodlights bite the dark. A soft additive volumetric cone hangs
// in the air under each floodlight, catching snow and smoke like a real beam at night.
// Dynamic: reconciles against the live buildables so beams appear on lights you build
// and wink out when one is destroyed. Cheap — one cone per floodlight, additive.
import * as THREE from '../engine/three.js';

function shaftTexture() {
  // bright at the lamp (top), fading to nothing at the ground — sells the falloff
  const c = document.createElement('canvas'); c.width = 8; c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0.0, 'rgba(255,244,210,0.9)');
  grd.addColorStop(0.35, 'rgba(255,238,196,0.32)');
  grd.addColorStop(1.0, 'rgba(255,236,190,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 8, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const LAMP_Y = 6.2;     // floodlight head height
const BASE_R = 8.5;     // beam footprint on the ground

export function createLightShafts(scene, field) {
  const tex = shaftTexture();
  // apex at +y (the lamp), base at -y (the ground) — ConeGeometry's default orientation
  const geo = new THREE.ConeGeometry(BASE_R, LAMP_Y, 20, 1, true);
  const shafts = new Map(); // buildable -> { mesh, phase }
  let acc = 0;

  function reconcile() {
    const lights = (field.allBuildables?.() || []).filter(b => b.alive && b.kind === 'floodlight');
    const seen = new Set();
    for (const b of lights) {
      seen.add(b);
      if (shafts.has(b)) continue;
      const mat = new THREE.MeshBasicMaterial({
        map: tex, color: 0xfff0c8, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true, opacity: 0.16,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(b.x, LAMP_Y / 2 + 0.2, b.z);
      mesh.renderOrder = 2;
      mesh.frustumCulled = true;
      scene.add(mesh);
      shafts.set(b, { mesh, phase: Math.random() * 6.28 });
    }
    // retire beams whose lamp is gone
    for (const [b, s] of shafts) {
      if (!seen.has(b)) { scene.remove(s.mesh); s.mesh.material.dispose(); shafts.delete(b); }
    }
  }

  function update(dt, t) {
    acc += dt;
    if (acc > 0.6) { reconcile(); acc = 0; }       // pick up newly-built / destroyed lights
    for (const s of shafts.values()) {             // gentle per-beam flicker
      s.phase += dt * 6;
      s.mesh.material.opacity = 0.155 + Math.sin(s.phase) * 0.028 + Math.sin(s.phase * 2.3) * 0.014;
    }
  }
  return { update };
}
