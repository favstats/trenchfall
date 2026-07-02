// sonar.js — the game's central idea: sound is sight. One shared uniform block
// carries the last 4 ping wavefronts + the lamp cone + the sub's wake into
// every shader in the world. A ping is a sphere of light expanding at the
// speed of (game) sound, painting whatever it touches, then dying away.
import * as THREE from './engine/three.js';
import { sfxPing } from './engine/audio.js';

export const WAVE_SPEED = 60;   // m/s — slow enough to watch it climb the walls
export const PING_LIFE = 7.0;   // seconds a wavefront keeps painting

// GLSL shared by every material in HADAL. world-position in, light out.
export const SONAR_GLSL = /* glsl */`
  uniform float uTime;
  uniform vec4  uPings[4];      // xyz = origin, w = emit time (<0 = unused)
  uniform vec3  uLampPos;
  uniform vec3  uLampDir;
  uniform float uLampOn;
  uniform vec3  uSubPos;
  uniform float uSubSpeed;
  uniform vec4  uFlares[3];     // xyz = position, w = intensity (0 = unused)

  float flareGlow(vec3 p) {
    float g = 0.0;
    for (int i = 0; i < 3; i++) {
      if (uFlares[i].w <= 0.0) continue;
      float d2 = dot(p - uFlares[i].xyz, p - uFlares[i].xyz);
      g += uFlares[i].w * 30.0 / (1.0 + d2 * 0.03);
    }
    return g;
  }

  float sonarGlow(vec3 p) {
    float g = 0.0;
    for (int i = 0; i < 4; i++) {
      float t = uTime - uPings[i].w;
      if (uPings[i].w < 0.0 || t < 0.0 || t > ${PING_LIFE.toFixed(1)}) continue;
      float r = t * ${WAVE_SPEED.toFixed(1)};
      float d = distance(p, uPings[i].xyz);
      float band = exp(-pow((d - r) / 8.0, 2.0)) * 1.4; // the wavefront itself
      // the afterglow is your MAP: pinged rock stays faintly lit while the
      // echo dies, long enough to steer by — this is the game's memory
      float after = exp(-(r - d) * 0.03) * step(d, r) * 0.34;
      g += (band + after) * exp(-t * 0.42);
    }
    return g;
  }

  float lampGlow(vec3 p) {
    vec3 v = p - uLampPos;
    float d = length(v);
    float cone = smoothstep(0.845, 0.97, dot(v / max(d, 0.001), uLampDir));
    return uLampOn * cone * 46.0 / (1.0 + d * d * 0.014);
  }

  // bioluminescent wake — the water itself remembers you passing through it
  float wakeGlow(vec3 p) {
    float d2 = dot(p - uSubPos, p - uSubPos);
    return uSubSpeed * 0.09 / (1.0 + d2 * 0.06);
  }
`;

export function createSonar(scene) {
  const uniforms = {
    uTime: { value: 0 },
    uPings: { value: [new THREE.Vector4(0, 0, 0, -1), new THREE.Vector4(0, 0, 0, -1), new THREE.Vector4(0, 0, 0, -1), new THREE.Vector4(0, 0, 0, -1)] },
    uLampPos: { value: new THREE.Vector3() },
    uLampDir: { value: new THREE.Vector3(0, 0, -1) },
    uLampOn: { value: 0 },
    uSubPos: { value: new THREE.Vector3() },
    uSubSpeed: { value: 0 },
    uFlares: { value: [new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)] },
  };
  let head = 0;

  // the visible wavefront: a huge transparent sphere shell that expands with
  // the ping so the player sees their own voice travelling
  const rings = [];
  const ringGeo = new THREE.SphereGeometry(1, 48, 32);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(ringGeo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uA: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uA; varying vec3 vP;
        void main(){
          float shimmer = 0.75 + 0.25 * sin(vP.x * 40.0) * sin(vP.y * 34.0 + vP.z * 27.0);
          gl_FragColor = vec4(vec3(0.45, 0.85, 1.0) * uA * 0.15 * shimmer, 1.0);
        }`,
    }));
    m.visible = false; m.frustumCulled = false;
    scene.add(m); rings.push({ mesh: m, t0: -1 });
  }

  function ping(x, y, z) {
    uniforms.uPings.value[head].set(x, y, z, uniforms.uTime.value);
    const r = rings[head];
    r.mesh.position.set(x, y, z);
    r.t0 = uniforms.uTime.value;
    r.mesh.visible = true;
    head = (head + 1) % 4;
    sfxPing();
  }

  function update(dt) {
    uniforms.uTime.value += dt;
    const now = uniforms.uTime.value;
    for (const r of rings) {
      if (r.t0 < 0) continue;
      const t = now - r.t0;
      if (t > PING_LIFE) { r.t0 = -1; r.mesh.visible = false; continue; }
      const rad = Math.max(0.1, t * WAVE_SPEED);
      r.mesh.scale.setScalar(rad);
      r.mesh.material.uniforms.uA.value = Math.exp(-t * 0.9);
    }
  }

  return { uniforms, ping, update };
}
