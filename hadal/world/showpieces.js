// showpieces.js — the two set-piece effects, written from scratch.
//
// 1. GOD RAYS: the dying surface light, rendered as a ring of camera-facing
//    volumetric shafts whose intensity is modulated by an animated interference
//    pattern (two scrolling sine fields = fake caustics). They only exist in
//    the first few hundred metres — losing them is how you FEEL the midnight
//    zone arrive.
// 2. THE SHOAL: a flock of ~320 fish on classic boids rules (separation /
//    alignment / cohesion) with two extra forces this game earns: they burst
//    away from your sonar wavefront as it passes through them, and they refuse
//    to go anywhere near the leviathan — a living early-warning system.
import * as THREE from '../engine/three.js';
import { SONAR_GLSL, WAVE_SPEED, PING_LIFE } from '../sonar.js';
import { axisAt } from './trench.js';

// ---------------------------------------------------------------- god rays --
export function createGodRays(scene) {
  const N = 14;
  const g = new THREE.Group();
  const uniforms = { uTime: { value: 0 }, uFade: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      varying vec2 vUv; varying float vSeed;
      attribute float aSeed;
      void main() { vUv = uv; vSeed = aSeed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uFade;
      varying vec2 vUv; varying float vSeed;
      void main() {
        // interference of two scrolling waves = the caustic shimmer
        float c = sin(vUv.x * 21.0 + uTime * 0.7 + vSeed * 40.0)
                * sin(vUv.x * 13.0 - uTime * 0.43 + vSeed * 17.0);
        c = 0.55 + 0.45 * c;
        float body = smoothstep(0.0, 0.28, vUv.x) * smoothstep(1.0, 0.72, vUv.x); // soft shaft edges
        float fall = pow(vUv.y, 1.7);                                             // dies with depth
        gl_FragColor = vec4(vec3(0.35, 0.62, 0.85) * c * body * fall * uFade * 0.14, 1.0);
      }`,
  });
  for (let i = 0; i < N; i++) {
    const w = 9 + Math.random() * 16;
    const geo = new THREE.PlaneGeometry(w, 320, 1, 1);
    const seed = new Float32Array(geo.attributes.position.count).fill(Math.random());
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const m = new THREE.Mesh(geo, mat);
    const th = (i / N) * Math.PI * 2;
    const r = 20 + Math.random() * 46;
    m.position.set(Math.cos(th) * r, 80, Math.sin(th) * r);
    m.rotation.y = th + Math.PI / 2 + (Math.random() - 0.5) * 0.5;
    m.rotation.z = (Math.random() - 0.5) * 0.14;   // slight slant, like real shafts
    g.add(m);
  }
  g.renderOrder = -1;
  scene.add(g);

  function update(dt, depth) {
    uniforms.uTime.value += dt;
    uniforms.uFade.value = Math.max(0, 1 - depth / 520); // gone by the midnight card
    g.visible = uniforms.uFade.value > 0.01;
  }
  return { update };
}

// ------------------------------------------------------------------ shoal --
const FISH_N = 320;
export function createShoal(scene, sonarUniforms) {
  const P = new Float32Array(FISH_N * 3);   // positions
  const V = new Float32Array(FISH_N * 3);   // velocities
  const phase = new Float32Array(FISH_N);
  for (let i = 0; i < FISH_N; i++) {
    P[i * 3] = (Math.random() - 0.5) * 90;
    P[i * 3 + 1] = -120 - Math.random() * 60;
    P[i * 3 + 2] = (Math.random() - 0.5) * 90;
    V[i * 3] = (Math.random() - 0.5) * 4;
    V[i * 3 + 2] = (Math.random() - 0.5) * 4;
    phase[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
    uniforms: sonarUniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aPhase;
      uniform float uTime;
      varying vec3 vW; varying float vDist; varying float vTw;
      void main() {
        vW = position;
        vTw = 0.6 + 0.4 * sin(uTime * 7.0 + aPhase);   // scale flicker = tail-beat
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDist = -mv.z;
        gl_PointSize = clamp(1.5 * vTw * 190.0 / vDist, 1.0, 6.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      ${SONAR_GLSL}
      varying vec3 vW; varying float vDist; varying float vTw;
      void main() {
        float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5));
        // silver bodies: mostly your light reflected, plus a whisper of their own
        float b = 0.06 * vTw + sonarGlow(vW) * 2.0 + lampGlow(vW) * 1.6 + flareGlow(vW) * 0.5 + wakeGlow(vW);
        gl_FragColor = vec4(vec3(0.75, 0.88, 0.92) * b * exp(-vDist * 0.003), a);
      }`,
  }));
  pts.frustumCulled = false;
  scene.add(pts);

  // boids on a spatial sample: each fish checks a rotating subset — O(n·k)
  const K = 12;
  let cursor = 0;
  const center = new THREE.Vector3(0, -140, 0);

  function update(dt, ctx) {
    // ctx: { sub: Vector3, levHead: Vector3, pings: Vector4[], time }
    // the shoal drifts down ahead of the diver — always something alive nearby
    center.y += ((ctx.sub.y - 90) - center.y) * Math.min(1, dt * 0.4);
    const ax = axisAt(center.y);
    center.x += (ax.x - center.x) * Math.min(1, dt * 0.5);
    center.z += (ax.z - center.z) * Math.min(1, dt * 0.5);

    for (let i = 0; i < FISH_N; i++) {
      const ix = i * 3;
      let sx = 0, sy = 0, sz = 0;               // separation
      let alx = 0, aly = 0, alz = 0;            // alignment
      let cx = 0, cy = 0, cz = 0, nb = 0;       // cohesion
      for (let k = 0; k < K; k++) {
        const j = ((cursor + i * K + k) % FISH_N) * 3;
        if (j === ix) continue;
        const dx = P[ix] - P[j], dy = P[ix + 1] - P[j + 1], dz = P[ix + 2] - P[j + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > 30 * 30) continue;
        nb++;
        cx += P[j]; cy += P[j + 1]; cz += P[j + 2];
        alx += V[j]; aly += V[j + 1]; alz += V[j + 2];
        if (d2 < 3.5 * 3.5 && d2 > 0.0001) { const w = 1 / d2; sx += dx * w; sy += dy * w; sz += dz * w; }
      }
      let ax_ = sx * 6 + alx * 0.06, ay_ = sy * 6 + aly * 0.06, az_ = sz * 6 + alz * 0.06;
      if (nb > 0) {
        ax_ += (cx / nb - P[ix]) * 0.35; ay_ += (cy / nb - P[ix + 1]) * 0.35; az_ += (cz / nb - P[ix + 2]) * 0.35;
      }
      // stay with the drifting school-centre
      ax_ += (center.x - P[ix]) * 0.12; ay_ += (center.y - P[ix + 1]) * 0.12; az_ += (center.z - P[ix + 2]) * 0.12;

      // fear #1: the sonar wavefront physically shoves them as it passes
      for (const pg of ctx.pings) {
        if (pg.w < 0) continue;
        const t = ctx.time - pg.w;
        if (t < 0 || t > PING_LIFE) continue;
        const r = t * WAVE_SPEED;
        const dx = P[ix] - pg.x, dy = P[ix + 1] - pg.y, dz = P[ix + 2] - pg.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
        const band = Math.exp(-((d - r) * (d - r)) / 60);
        if (band > 0.05) { const w = band * 42 / d; ax_ += dx * w; ay_ += dy * w; az_ += dz * w; }
      }
      // fear #2: nothing swims near the old one — watch where the fish won't go
      {
        const dx = P[ix] - ctx.levHead.x, dy = P[ix + 1] - ctx.levHead.y, dz = P[ix + 2] - ctx.levHead.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 80 * 80) { const w = 260 / (d2 + 20); ax_ += dx * w; ay_ += dy * w; az_ += dz * w; }
      }

      V[ix] += ax_ * dt; V[ix + 1] += ay_ * dt; V[ix + 2] += az_ * dt;
      const sp = Math.sqrt(V[ix] * V[ix] + V[ix + 1] * V[ix + 1] + V[ix + 2] * V[ix + 2]) || 0.001;
      const max = 14;
      if (sp > max) { V[ix] *= max / sp; V[ix + 1] *= max / sp; V[ix + 2] *= max / sp; }
      P[ix] += V[ix] * dt; P[ix + 1] += V[ix + 1] * dt; P[ix + 2] += V[ix + 2] * dt;
    }
    cursor = (cursor + 7) % FISH_N;
    geo.attributes.position.needsUpdate = true;
  }

  return { update };
}
