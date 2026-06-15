// flares.js — the perimeter lights the dark. Every so often a signal flare arcs up off
// the wall, ignites at apex, and drifts down under its chute — a bright coloured glow +
// point light raking the killing ground, swaying as it falls, then guttering out near the
// snow. Two pooled flares, one light each, idle most of the time — dramatic and cheap.
import * as THREE from '../engine/three.js';
import { WALL_Z, WALL_H, FIELD_HALF_X } from '../world/field.js';

function flareTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,240,200,0.95)');
  grd.addColorStop(0.6, 'rgba(255,150,90,0.5)');
  grd.addColorStop(1, 'rgba(255,120,80,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(32, 32, 32, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const COLORS = [0xff5a3a, 0xffc23a, 0xff5a3a]; // red and amber signal flares

export function createFlares(scene) {
  const tex = flareTexture();
  const flares = [];
  for (let i = 0; i < 2; i++) {
    const sprite = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0,
    }));
    sprite.frustumCulled = false; scene.add(sprite);
    const light = new THREE.PointLight(0xff6a3a, 0, 90, 1.6); light.castShadow = false; scene.add(light);
    flares.push({ sprite, light, active: false, t: 0, life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ignite: 0, ph: 0 });
  }

  let timer = 6 + Math.random() * 10;
  function launch() {
    const f = flares.find(q => !q.active); if (!f) return;
    f.active = true; f.t = 0; f.life = 7.5 + Math.random() * 2.5; f.ignite = 1.0 + Math.random() * 0.3;
    f.x = (Math.random() * 2 - 1) * (FIELD_HALF_X - 30);
    f.y = WALL_H + 2; f.z = WALL_Z - 2;
    f.vx = (Math.random() - 0.5) * 6; f.vy = 17 + Math.random() * 4; f.vz = -7 - Math.random() * 5; // up + out over the field
    f.ph = Math.random() * 6.28;
    const c = COLORS[(Math.random() * COLORS.length) | 0];
    f.sprite.material.color.setHex(c); f.light.color.setHex(c);
  }

  function update(dt, camera) {
    timer -= dt;
    if (timer <= 0) { launch(); timer = 20 + Math.random() * 26; }
    for (const f of flares) {
      if (!f.active) continue;
      f.t += dt; f.ph += dt * 9;
      if (f.t < f.ignite) {                 // ballistic ascent, still dark
        f.vy -= 16 * dt;
        f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
        continue;
      }
      // ignited: chute deployed — slow swaying descent
      f.vy += (-1.4 - f.vy) * Math.min(1, dt * 2);     // ease to slow fall
      f.vx += (Math.sin(f.ph * 0.5) * 1.2 - f.vx) * dt; // sway
      f.vz *= (1 - dt * 0.8);
      f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
      const u = (f.t - f.ignite) / (f.life - f.ignite); // 0..1 burn progress
      let bright = u < 0.12 ? u / 0.12 : u > 0.8 ? Math.max(0, 1 - (u - 0.8) / 0.2) : 1;
      bright *= 0.85 + 0.15 * Math.sin(f.ph);            // sputter
      f.sprite.position.set(f.x, f.y, f.z);
      if (camera) f.sprite.quaternion.copy(camera.quaternion);
      f.sprite.scale.setScalar(1 + bright * 0.5);
      f.sprite.material.opacity = bright;
      f.light.position.set(f.x, f.y, f.z);
      f.light.intensity = bright * 7;
      if (f.t >= f.life || f.y < 0.6) { f.active = false; f.sprite.material.opacity = 0; f.light.intensity = 0; }
    }
  }
  return { update, flares };
}
