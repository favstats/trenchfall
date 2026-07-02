// leviathan.js — the thing that listens. A 150-metre chain of vertebral lights
// that lives below you and homes on sound. You never see its body — only its
// running lights, and its full silhouette for one moment when your own sonar
// wavefront breaks across it. Chain kinematics: the head steers, every segment
// follows the one before it at fixed spacing.
import * as THREE from '../engine/three.js';
import { SONAR_GLSL } from '../sonar.js';
import { axisAt, BOTTOM_Y } from './trench.js';
import { sfxRoar } from '../engine/audio.js';

const SEGS = 46;
const SPACING = 3.3;            // ~150m nose to tail

export class Leviathan {
  constructor(scene, sonarUniforms) {
    this.state = 'DEEP';        // DEEP | LURK | APPROACH | STRIKE | FLEE
    this.head = new THREE.Vector3(0, -700, 0);
    this.vel = new THREE.Vector3();
    this.segs = [];
    for (let i = 0; i < SEGS; i++) this.segs.push(new THREE.Vector3(0, -700 - i * SPACING, 0));
    this.target = new THREE.Vector3();
    this.orbitA = 0;
    this.stateT = 0;
    this.speed = 8;
    this.onStrike = null;       // main wires damage in
    this.onEatFlare = null;
    this.uRage = { value: 0 };

    const pos = new Float32Array((SEGS + 2) * 3);   // spine + two eyes
    const size = new Float32Array(SEGS + 2);
    const ph = new Float32Array(SEGS + 2);
    const eye = new Float32Array(SEGS + 2);
    for (let i = 0; i < SEGS; i++) { size[i] = 4.6 - (i / SEGS) * 3.6; ph[i] = i * 0.6; }
    size[SEGS] = size[SEGS + 1] = 2.4; ph[SEGS] = 0; ph[SEGS + 1] = 3;
    eye[SEGS] = eye[SEGS + 1] = 1;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.geo.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    this.geo.setAttribute('aEye', new THREE.BufferAttribute(eye, 1));
    this.pos = pos;

    const mat = new THREE.ShaderMaterial({
      uniforms: { ...sonarUniforms, uRage: this.uRage },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float aSize; attribute float aPhase; attribute float aEye;
        uniform float uTime;
        varying vec3 vW; varying float vDist; varying float vPulse; varying float vEye;
        void main() {
          vW = position;
          vEye = aEye;
          vPulse = 0.5 + 0.5 * sin(uTime * 0.7 + aPhase);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDist = -mv.z;
          gl_PointSize = clamp(aSize * 210.0 / vDist, 1.5, 26.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        ${SONAR_GLSL}
        uniform float uRage;
        varying vec3 vW; varying float vDist; varying float vPulse; varying float vEye;
        void main() {
          float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5));
          // its own lights: faint, patient, wrong. Sonar betrays the whole spine.
          float self = 0.10 + vPulse * 0.10 + vEye * 0.5;
          float b = self + sonarGlow(vW) * 3.0 + lampGlow(vW) * 0.8 + flareGlow(vW) * 0.4;
          vec3 calm = mix(vec3(0.5, 0.9, 0.75), vec3(0.9, 1.0, 0.95), vEye);
          vec3 rage = vec3(1.0, 0.28, 0.18);
          gl_FragColor = vec4(mix(calm, rage, uRage) * b * exp(-vDist * 0.0028), a);
        }`,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this._tmp = new THREE.Vector3();
  }

  distTo(p) { return this.head.distanceTo(p); }

  // a ping while it hunts is a gift: a perfect fix on you
  hearPing() { if (this.state === 'APPROACH' || this.state === 'LURK') this.speed += 7; }

  update(dt, ctx) {
    // ctx: { sub: Vector3, depth, attention (0-100), flares: [...], nearVent }
    const { sub, attention } = ctx;
    this.stateT += dt;

    // pick the loudest lure: an active flare within earshot beats the sub
    let lure = null;
    for (const f of ctx.flares) {
      if (!f.active || f.eaten) continue;
      this._tmp.set(f.x, f.y, f.z);
      if (this.head.distanceTo(this._tmp) < 260) { lure = f; break; }
    }

    const d = this.distTo(sub);
    switch (this.state) {
      case 'DEEP': {
        // waits below 500m of depth; rises into play once you're truly down
        this.target.set(sub.x, Math.min(sub.y - 260, -640), sub.z);
        this.speed = 7;
        if (ctx.depth > 640) this._go('LURK');
        break;
      }
      case 'LURK': {
        // circles the shaft two hundred metres below, listening
        this.orbitA += dt * 0.14;
        const a = axisAt(sub.y - 190);
        this.target.set(a.x + Math.cos(this.orbitA) * 34, sub.y - 190, a.z + Math.sin(this.orbitA) * 34);
        this.speed = 9;
        if (lure) { this.target.set(lure.x, lure.y, lure.z); this.speed = 18; }
        if (attention > 55) this._go('APPROACH');
        break;
      }
      case 'APPROACH': {
        if (lure) { this.target.set(lure.x, lure.y, lure.z); this.speed = 22; }
        else { this.target.copy(sub); this.speed = Math.min(this.speed + dt * 3, 17); }
        if (!lure && attention > 82 && d < 95) { this._go('STRIKE'); sfxRoar(); }
        if (attention < 30 && !lure) this._go('LURK');
        break;
      }
      case 'STRIKE': {
        this.target.copy(sub);
        this.speed = 36;
        if (d < 7) {
          this.onStrike && this.onStrike();
          this._go('FLEE');
        }
        if (this.stateT > 9) this._go('APPROACH'); // missed — resets the run-up
        break;
      }
      case 'FLEE': {
        const a = axisAt(sub.y - 320);
        this.target.set(a.x, Math.max(sub.y - 320, BOTTOM_Y + 60), a.z);
        this.speed = 26;
        if (this.stateT > 11) this._go('LURK');
        break;
      }
    }

    // flare consumption — it takes the bait, loudly
    if (lure && this.head.distanceTo(this._tmp.set(lure.x, lure.y, lure.z)) < 9) {
      lure.eaten = true;
      this.onEatFlare && this.onEatFlare();
      this._go('FLEE');
    }

    this.uRage.value += ((this.state === 'STRIKE' ? 1 : 0) - this.uRage.value) * Math.min(1, dt * 4);

    // head steering with undulation; body follows the chain
    this._tmp.copy(this.target).sub(this.head);
    const dist = this._tmp.length() || 0.001;
    this._tmp.divideScalar(dist);
    const steer = Math.min(1, dt * (this.state === 'STRIKE' ? 2.6 : 1.1));
    this.vel.lerp(this._tmp.multiplyScalar(this.speed), steer);
    this.head.addScaledVector(this.vel, dt);
    const t = performance.now() * 0.001;
    this.head.x += Math.sin(t * 1.7) * dt * 6;      // the swim, not a bullet path
    this.head.z += Math.cos(t * 1.4) * dt * 6;

    // chain follow
    let prev = this.head;
    for (let i = 0; i < SEGS; i++) {
      const s = this.segs[i];
      const dx = prev.x - s.x, dy = prev.y - s.y, dz = prev.z - s.z;
      const l = Math.hypot(dx, dy, dz) || 0.001;
      const pull = (l - SPACING) / l;
      s.x += dx * pull; s.y += dy * pull; s.z += dz * pull;
      // lateral undulation travels down the body
      s.x += Math.sin(t * 2.2 - i * 0.42) * 0.06 * (1 + i * 0.04);
      this.pos[i * 3] = s.x; this.pos[i * 3 + 1] = s.y; this.pos[i * 3 + 2] = s.z;
      prev = s;
    }
    // eyes ride just ahead of the first segment, split across the head
    const hx = this.vel.x / (this.vel.length() || 1), hz = this.vel.z / (this.vel.length() || 1);
    this.pos[SEGS * 3] = this.head.x + hx * 2 - hz * 1.6;
    this.pos[SEGS * 3 + 1] = this.head.y + 1.2;
    this.pos[SEGS * 3 + 2] = this.head.z + hz * 2 + hx * 1.6;
    this.pos[(SEGS + 1) * 3] = this.head.x + hx * 2 + hz * 1.6;
    this.pos[(SEGS + 1) * 3 + 1] = this.head.y + 1.2;
    this.pos[(SEGS + 1) * 3 + 2] = this.head.z + hz * 2 - hx * 1.6;
    this.geo.attributes.position.needsUpdate = true;
  }

  _go(s) { this.state = s; this.stateT = 0; }
}
