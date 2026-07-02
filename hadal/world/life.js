// life.js — everything alive in the water column, drawn as almost nothing:
// one shared point cloud of bioluminescence (jellies, lure-fish, siphonophore
// chains), marine snow for the sense of falling, hydrothermal vent columns,
// and the flares you drop to buy your way out of trouble.
import * as THREE from '../engine/three.js';
import { SONAR_GLSL } from '../sonar.js';
import { VENTS } from './trench.js';

const BIO_N = 720;
const SNOW_N = 2400;
const VENT_PTS = 420; // per vent

// ---------- shared bioluminescence cloud ----------
export function createLife(scene, sonarUniforms) {
  const uniforms = { ...sonarUniforms };

  const pos = new Float32Array(BIO_N * 3);
  const size = new Float32Array(BIO_N);
  const hue = new Float32Array(BIO_N);   // 0 = cold cyan … 1 = warm lure
  const phase = new Float32Array(BIO_N);
  const rate = new Float32Array(BIO_N);  // pulse speed — jellies slow, lures blink
  function placeBio(i, cx, cy, cz, spread = 300) {
    // siphonophores: short chains of points sharing a drift line
    const chain = Math.random() < 0.18 ? 2 + ((Math.random() * 4) | 0) : 1;
    for (let k = 0; k < chain && i + k < BIO_N; k++) {
      const j = i + k;
      pos[j * 3] = cx + (Math.random() - 0.5) * spread + k * 0.9;
      pos[j * 3 + 1] = cy + (Math.random() - 0.5) * spread - k * 0.5;
      pos[j * 3 + 2] = cz + (Math.random() - 0.5) * spread + k * 0.4;
      const lure = Math.random() < 0.16;
      size[j] = lure ? 0.8 + Math.random() * 0.8 : 1.6 + Math.random() * 2.6;
      hue[j] = lure ? 0.85 + Math.random() * 0.15 : Math.random() * 0.35;
      phase[j] = Math.random() * Math.PI * 2;
      rate[j] = lure ? 4.5 + Math.random() * 4 : 0.5 + Math.random() * 0.9;
    }
    return chain;
  }
  for (let i = 0; i < BIO_N;) i += placeBio(i, 0, -80, 0, 420);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aHue', new THREE.BufferAttribute(hue, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aRate', new THREE.BufferAttribute(rate, 1));
  const bio = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aSize; attribute float aHue; attribute float aPhase; attribute float aRate;
      uniform float uTime;
      varying float vHue; varying float vPulse; varying vec3 vW; varying float vDist;
      void main() {
        vW = position; vHue = aHue;
        vec3 p = position;
        p.x += sin(uTime * 0.22 + aPhase) * 2.2;        // the slow drift of things
        p.y += sin(uTime * 0.16 + aPhase * 1.7) * 1.6;  // that never touch bottom
        vPulse = pow(0.5 + 0.5 * sin(uTime * aRate + aPhase), 3.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vDist = -mv.z;
        gl_PointSize = clamp(aSize * (0.4 + vPulse) * 210.0 / vDist, 1.0, 14.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${SONAR_GLSL}
      varying float vHue; varying float vPulse; varying vec3 vW; varying float vDist;
      void main() {
        float a = smoothstep(0.5, 0.08, length(gl_PointCoord - 0.5));
        vec3 cold = vec3(0.3, 0.9, 1.0), warm = vec3(1.0, 0.75, 0.4);
        vec3 col = mix(cold, warm, vHue);
        // a passing wavefront startles them into flaring — the trench answers
        float startle = sonarGlow(vW) * 2.4;
        float b = vPulse * 0.55 + startle + lampGlow(vW) * 0.4 + wakeGlow(vW) * 0.8;
        gl_FragColor = vec4(col * b * exp(-vDist * 0.003), a);
      }`,
  }));
  bio.frustumCulled = false;
  scene.add(bio);

  // ---------- marine snow — still water you fall past ----------
  const spos = new Float32Array(SNOW_N * 3);
  for (let i = 0; i < SNOW_N; i++) {
    spos[i * 3] = (Math.random() - 0.5) * 260;
    spos[i * 3 + 1] = -130 + Math.random() * 260;
    spos[i * 3 + 2] = (Math.random() - 0.5) * 260;
  }
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3));
  const snow = new THREE.Points(sgeo, new THREE.PointsMaterial({
    color: 0x9fb6c8, size: 0.55, sizeAttenuation: true,
    transparent: true, opacity: 0.34, depthWrite: false,
  }));
  snow.frustumCulled = false;
  scene.add(snow);

  // ---------- hydrothermal vents — pillars of warm rising light ----------
  const vN = VENTS.length * VENT_PTS;
  const vpos = new Float32Array(vN * 3);
  const vseed = new Float32Array(vN);
  VENTS.forEach((v, vi) => {
    for (let k = 0; k < VENT_PTS; k++) {
      const i = vi * VENT_PTS + k;
      const r = Math.random() * 3.2;
      const th = Math.random() * Math.PI * 2;
      vpos[i * 3] = v.x + Math.cos(th) * r;
      vpos[i * 3 + 1] = v.y;                    // column height animated in-shader
      vpos[i * 3 + 2] = v.z + Math.sin(th) * r;
      vseed[i] = Math.random();
    }
  });
  const vgeo = new THREE.BufferGeometry();
  vgeo.setAttribute('position', new THREE.BufferAttribute(vpos, 3));
  vgeo.setAttribute('aSeed', new THREE.BufferAttribute(vseed, 1));
  const vents = new THREE.Points(vgeo, new THREE.ShaderMaterial({
    uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aSeed;
      uniform float uTime;
      varying float vK; varying float vDist;
      void main() {
        float h = mod(uTime * (3.5 + aSeed * 4.0) + aSeed * 40.0, 40.0); // rise & recycle
        vK = 1.0 - h / 40.0;
        vec3 p = position + vec3(sin(uTime * 0.8 + aSeed * 50.0) * (1.0 + h * 0.12), h, cos(uTime * 0.7 + aSeed * 60.0) * (1.0 + h * 0.12));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vDist = -mv.z;
        gl_PointSize = clamp((1.4 + aSeed) * 170.0 / vDist, 1.0, 8.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vK; varying float vDist;
      void main() {
        float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5));
        vec3 c = mix(vec3(1.0, 0.42, 0.12), vec3(1.0, 0.85, 0.5), vK);
        gl_FragColor = vec4(c * vK * 0.9 * exp(-vDist * 0.003), a);
      }`,
  }));
  vents.frustumCulled = false;
  scene.add(vents);

  // ---------- flares: dropped decoys that burn green-white ----------
  const FLARE_N = 6;
  const flares = [];
  const flareTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(170,255,200,.85)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  for (let i = 0; i < FLARE_N; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flareTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
    }));
    sp.visible = false; scene.add(sp);
    flares.push({ sp, active: false, life: 0, max: 22, x: 0, y: 0, z: 0, vy: 0, eaten: false });
  }
  function dropFlare(x, y, z) {
    const f = flares.find(f => !f.active);
    if (!f) return null;
    Object.assign(f, { active: true, eaten: false, life: f.max, x, y, z, vy: -1.2 });
    f.sp.visible = true;
    return f;
  }

  function update(dt, sub) {
    // recycle bio + snow around the sub so the water is never empty
    let bu = false;
    for (let i = 0; i < BIO_N; i++) {
      const dy = pos[i * 3 + 1] - sub.y;
      if (Math.abs(dy) > 340 || Math.abs(pos[i * 3] - sub.x) > 340) { placeBio(i, sub.x, sub.y - 120, sub.z, 300); bu = true; }
    }
    if (bu) geo.attributes.position.needsUpdate = true;
    let su = false;
    for (let i = 0; i < SNOW_N; i++) {
      if (Math.abs(spos[i * 3 + 1] - sub.y) > 140 || Math.abs(spos[i * 3] - sub.x) > 140 || Math.abs(spos[i * 3 + 2] - sub.z) > 140) {
        spos[i * 3] = sub.x + (Math.random() - 0.5) * 260;
        spos[i * 3 + 1] = sub.y + (Math.random() < 0.7 ? -1 : 1) * Math.random() * 130;
        spos[i * 3 + 2] = sub.z + (Math.random() - 0.5) * 260;
        su = true;
      }
    }
    if (su) sgeo.attributes.position.needsUpdate = true;

    // flares sink gently and gutter out
    for (const f of flares) {
      if (!f.active) continue;
      f.life -= dt;
      f.vy = Math.max(f.vy - dt * 0.4, -2.2);
      f.y += f.vy * dt;
      if (f.life <= 0 || f.eaten) { f.active = false; f.sp.visible = false; continue; }
      const gutter = Math.min(1, f.life / 4) * (0.8 + 0.2 * Math.sin(performance.now() * 0.02 + f.x));
      f.sp.position.set(f.x, f.y, f.z);
      f.sp.scale.setScalar(3.6 + gutter * 2.2);   // bright, not blinding — its real
      f.sp.material.opacity = 0.7 * gutter;       // light lives in flareGlow on the walls
    }
  }

  return { update, dropFlare, flares };
}
