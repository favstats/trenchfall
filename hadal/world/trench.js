// trench.js — the trench is one analytic function. wallR(y,θ) defines the rock
// at every depth and bearing; the same math places the streamed point-cloud
// walls AND resolves collisions, so what you hit is exactly what the sonar
// showed you. The shaft snakes and pinches on the way down; there is a floor,
// and something grows on it.
import * as THREE from '../engine/three.js';
import { SONAR_GLSL } from '../sonar.js';

export const BOTTOM_Y = -3050;           // world y of the seabed (start ≈ 0)
export const START_DEPTH = 150;          // displayed metres at y = 0
export const depthOf = (y) => START_DEPTH - y;

// the shaft's centreline meanders — descent is navigation, not an elevator
export function axisAt(y) {
  return {
    x: 34 * Math.sin(y * 0.0042) + 14 * Math.sin(y * 0.011 + 2.4),
    z: 34 * Math.sin(y * 0.0031 + 1.7) + 12 * Math.sin(y * 0.009),
  };
}

export function wallRAt(y, th) {
  const pinch = 1 + 0.3 * Math.sin(y * 0.006 + 1);      // choke points
  let r = 58 * pinch
    + 16 * Math.sin(3 * th + y * 0.014)
    + 9 * Math.sin(7 * th - y * 0.03 + 2.1)
    + 5 * Math.sin(2 * th + y * 0.005 + 5);
  return Math.min(110, Math.max(16, r));
}

// hydrothermal vents — warm sanctuaries bolted to the wall at known depths
export const VENTS = [-620, -1350, -2100, -2650].map((y, i) => {
  const th = 1.1 + i * 1.9;
  const a = axisAt(y), r = wallRAt(y, th) - 7;
  return { x: a.x + Math.cos(th) * r, y, z: a.z + Math.sin(th) * r, th };
});

const WALL_N = 42000;
const SEABED_N = 7000;
const GARDEN_N = 1400;

function wallShader(uniforms, extra = '') {
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aSize;
      attribute float aTone;
      varying vec3 vW; varying float vDist; varying float vTone;
      void main() {
        vW = position; vTone = aTone;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDist = -mv.z;
        gl_PointSize = clamp(aSize * 190.0 / vDist, 1.0, 9.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${SONAR_GLSL}
      uniform float uAmbient;
      varying vec3 vW; varying float vDist; varying float vTone;
      void main() {
        float a = smoothstep(0.5, 0.12, length(gl_PointCoord - 0.5));
        float son = sonarGlow(vW);
        float lam = lampGlow(vW);
        float wak = wakeGlow(vW);
        vec3 c = son * vec3(0.36, 0.85, 1.0)          // echoes paint cold cyan
               + lam * vec3(1.0, 0.9, 0.72)           // the lamp is warm and honest
               + wak * vec3(0.2, 0.65, 0.6)
               + flareGlow(vW) * vec3(0.55, 1.0, 0.7) // dropped flares hold their ground
               + uAmbient * vec3(0.10, 0.22, 0.34);   // the last daylight, near the top
        c *= (0.65 + vTone * 0.5) * exp(-vDist * 0.0035);
        ${extra}
        gl_FragColor = vec4(c, a);
      }`,
  });
}

export function buildTrench(scene, sonarUniforms) {
  const uniforms = { ...sonarUniforms, uAmbient: { value: 0.9 } };

  // ---- streamed wall cloud: a window of rock around the sub, recycled ----
  const pos = new Float32Array(WALL_N * 3);
  const size = new Float32Array(WALL_N);
  const tone = new Float32Array(WALL_N);
  function placeWallPoint(i, yMin, yMax) {
    const y = yMin + Math.random() * (yMax - yMin);
    const th = Math.random() * Math.PI * 2;
    const depthIn = Math.random() < 0.8 ? Math.random() * 4 : Math.random() * 14; // crust + deep rock
    const r = wallRAt(y, th) - depthIn;
    const a = axisAt(y);
    pos[i * 3] = a.x + Math.cos(th) * r;
    pos[i * 3 + 1] = y + (Math.random() - 0.5) * 1.5;
    pos[i * 3 + 2] = a.z + Math.sin(th) * r;
    size[i] = 0.7 + Math.random() * 1.3;
    tone[i] = Math.random();
  }
  for (let i = 0; i < WALL_N; i++) placeWallPoint(i, -520, 220);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aTone', new THREE.BufferAttribute(tone, 1));
  const walls = new THREE.Points(geo, wallShader(uniforms));
  walls.frustumCulled = false;
  scene.add(walls);

  // ---- seabed: a floor of silt under the last metres of the drop ----
  const bpos = new Float32Array(SEABED_N * 3);
  const bsize = new Float32Array(SEABED_N);
  const btone = new Float32Array(SEABED_N);
  const ba = axisAt(BOTTOM_Y);
  for (let i = 0; i < SEABED_N; i++) {
    const th = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random()) * (wallRAt(BOTTOM_Y, th) - 2);
    bpos[i * 3] = ba.x + Math.cos(th) * rr;
    bpos[i * 3 + 1] = BOTTOM_Y + Math.random() * 2.4 + Math.sin(rr * 0.4) * 1.2;
    bpos[i * 3 + 2] = ba.z + Math.sin(th) * rr;
    bsize[i] = 0.7 + Math.random() * 1.2;
    btone[i] = Math.random();
  }
  const bgeo = new THREE.BufferGeometry();
  bgeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
  bgeo.setAttribute('aSize', new THREE.BufferAttribute(bsize, 1));
  bgeo.setAttribute('aTone', new THREE.BufferAttribute(btone, 1));
  const seabed = new THREE.Points(bgeo, wallShader(uniforms));
  seabed.frustumCulled = false;
  scene.add(seabed);

  // ---- the garden: what lives at the bottom. Self-lit — the only thing in
  // the trench that makes its own steady light. Visible far above: a promise.
  const gpos = new Float32Array(GARDEN_N * 3);
  const gsize = new Float32Array(GARDEN_N);
  const gphase = new Float32Array(GARDEN_N);
  for (let i = 0; i < GARDEN_N; i++) {
    const th = Math.random() * Math.PI * 2;
    const rr = Math.pow(Math.random(), 1.6) * 34;
    gpos[i * 3] = ba.x + Math.cos(th) * rr;
    gpos[i * 3 + 1] = BOTTOM_Y + 1.5 + Math.random() * (9 - rr * 0.2);
    gpos[i * 3 + 2] = ba.z + Math.sin(th) * rr;
    gsize[i] = 0.9 + Math.random() * 2.1;
    gphase[i] = Math.random() * Math.PI * 2;
  }
  const ggeo = new THREE.BufferGeometry();
  ggeo.setAttribute('position', new THREE.BufferAttribute(gpos, 3));
  ggeo.setAttribute('aSize', new THREE.BufferAttribute(gsize, 1));
  ggeo.setAttribute('aPhase', new THREE.BufferAttribute(gphase, 1));
  const garden = new THREE.Points(ggeo, new THREE.ShaderMaterial({
    uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aSize; attribute float aPhase;
      uniform float uTime;
      varying float vGlow; varying float vDist;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDist = -mv.z;
        vGlow = 0.55 + 0.45 * sin(uTime * 0.9 + aPhase);
        gl_PointSize = clamp(aSize * 230.0 / vDist, 1.0, 12.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vGlow; varying float vDist;
      void main() {
        float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5));
        vec3 c = vec3(0.85, 1.0, 0.92) * vGlow * exp(-vDist * 0.0022);
        gl_FragColor = vec4(c * 0.8, a);
      }`,
  }));
  garden.frustumCulled = false;
  scene.add(garden);

  // ---- streaming: recycle wall points that fall too far behind the sub ----
  let scanFrom = 0;
  function update(dt, subY) {
    uniforms.uAmbient.value = 0.9 * Math.max(0, 1 - depthOf(subY) / 900); // daylight dies by ~900m
    const CHUNK = 3000; // stagger the recycle scan across frames
    let moved = false;
    const yTop = subY + 240, yLo = Math.max(subY - 520, BOTTOM_Y - 4), yHi = subY - 260;
    for (let n = 0; n < CHUNK; n++) {
      const i = (scanFrom + n) % WALL_N;
      if (pos[i * 3 + 1] > yTop && yHi > yLo) { placeWallPoint(i, yLo, yHi); moved = true; }
    }
    scanFrom = (scanFrom + CHUNK) % WALL_N;
    if (moved) geo.attributes.position.needsUpdate = geo.attributes.aSize.needsUpdate = geo.attributes.aTone.needsUpdate = true;
  }

  // ---- collision against the same analytic wall ----
  function collide(p, vel, margin = 3.4) {
    const a = axisAt(p.y);
    const dx = p.x - a.x, dz = p.z - a.z;
    const rad = Math.hypot(dx, dz) || 0.001;
    const th = Math.atan2(dz, dx);
    const wr = wallRAt(p.y, th) - margin;
    if (rad <= wr) return null;
    const nx = -dx / rad, nz = -dz / rad;         // inward normal
    const vRad = vel.x * -nx + vel.z * -nz;       // outward radial speed
    p.x = a.x + (dx / rad) * wr;
    p.z = a.z + (dz / rad) * wr;
    if (vRad > 0) { vel.x += nx * vRad * 1.6; vel.z += nz * vRad * 1.6; } // bounce in
    return { speed: vRad };
  }

  return { update, collide, garden: { x: ba.x, z: ba.z } };
}
