// player.js — the camera IS the camcorder. First person: pointer-lock look,
// WASD, a sprint that costs breath, handheld sway and head-bob baked into the
// lens, and circle-vs-AABB sliding collision against the zone's wall list.
import * as THREE from './engine/three.js';
import { sfxStep } from './engine/audio.js';

const EYE = 1.62, RADIUS = 0.34;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Player {
  constructor(camera, dom) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 0, 0);   // feet, zone-local ground at pos.y
    this.yaw = 0; this.pitch = 0;
    this.vel = new THREE.Vector3();
    this.keys = new Set();
    this.stamina = 1;
    this.bobT = 0; this.stepAcc = 0;
    this.surface = 'carpet';
    this.enabled = false;
    this.lookLock = 0;                        // >0: the tape looks where IT wants
    this.lookTarget = new THREE.Vector3();

    // the camcorder's own weak lamp — you are never in true black
    this.lamp = new THREE.PointLight(0xd9cfae, 2.6, 10, 2);
    camera.add(this.lamp);
    this.lamp.position.set(0, 0, -0.2);

    const doc = dom.ownerDocument;
    doc.addEventListener('keydown', e => { this.keys.add(e.key.toLowerCase()); });
    doc.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    dom.addEventListener('mousemove', e => {
      if (!this.enabled || !doc.pointerLockElement || this.lookLock > 0) return;
      this.yaw -= e.movementX * 0.0023;
      this.pitch = clamp(this.pitch - e.movementY * 0.0023, -1.35, 1.35);
    });
    dom.addEventListener('mousedown', () => {
      if (this.enabled && !doc.pointerLockElement) this.requestLock(dom);
    });
    this.dom = dom;
  }

  requestLock(dom = this.dom) {
    try { const p = dom.requestPointerLock && dom.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch {}
  }

  place(x, y, z, yaw = 0) {
    this.pos.set(x, y, z);
    this.yaw = yaw; this.pitch = 0;
    this.vel.set(0, 0, 0);
  }

  // slide against every wall box near us — the world is endless, no bounds
  _collide(aabbs) {
    const p = this.pos;
    for (const b of aabbs) {
      const nx = clamp(p.x, b.x1, b.x2), nz = clamp(p.z, b.z1, b.z2);
      const dx = p.x - nx, dz = p.z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= RADIUS * RADIUS || d2 === 0) continue;
      const d = Math.sqrt(d2);
      p.x = nx + (dx / d) * RADIUS;
      p.z = nz + (dz / d) * RADIUS;
    }
  }

  update(dt, world) {
    const zone = { aabbs: world.collidersNear(this.pos.x, this.pos.z), surface: world.biomeAtPos(this.pos.x, this.pos.z).surface };
    if (this.lookLock > 0) this.lookLock -= dt;

    let mf = 0, mr = 0;
    if (this.enabled) {
      if (this.keys.has('w')) mf += 1;
      if (this.keys.has('s')) mf -= 1;
      if (this.keys.has('d')) mr += 1;
      if (this.keys.has('a')) mr -= 1;
    }
    const wantSprint = this.enabled && this.keys.has('shift') && mf > 0;
    const sprinting = wantSprint && this.stamina > 0.05;
    this.stamina = clamp(this.stamina + (sprinting ? -0.22 : 0.14) * dt, 0, 1);
    const speed = (sprinting ? 5.6 : 3.0) * (this.speedScale || 1);

    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const mv = Math.hypot(mf, mr) || 1;
    const tx = (fx * mf + rx * mr) / mv * speed;
    const tz = (fz * mf + rz * mr) / mv * speed;
    const k = 1 - Math.exp(-10 * dt);
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.z += (tz - this.vel.z) * k;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this._collide(zone.aabbs);

    // vertical: ramps ease you down, pits you FALL into
    const fy = world.floorAt(this.pos.x, this.pos.z);
    if (fy < this.pos.y - 0.05) {
      this._fallV = (this._fallV || 0) + 22 * dt;
      this.pos.y = Math.max(fy, this.pos.y - this._fallV * dt);
      if (this.pos.y === fy && this._fallV > 5) sfxStep(zone.surface);
      if (this.pos.y === fy) this._fallV = 0;
    } else {
      this.pos.y += (fy - this.pos.y) * Math.min(1, dt * 12);
      this._fallV = 0;
    }

    // footsteps + head-bob keyed to actual movement
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.moving = sp > 0.4;
    if (this.moving) {
      this.bobT += dt * (sprinting ? 11 : 7.4);
      this.stepAcc += sp * dt;
      if (this.stepAcc > (sprinting ? 2.3 : 1.9)) { this.stepAcc = 0; sfxStep(zone.surface); }
    } else this.bobT += dt * 1.2;

    // camera = camcorder: bob + handheld micro-sway
    const bob = Math.sin(this.bobT * 2) * (this.moving ? 0.05 : 0.008);
    const sway = Math.sin(this.bobT * 0.9 + 1.7) * (this.moving ? 0.022 : 0.006);
    this.camera.position.set(
      this.pos.x + rx * sway,
      this.pos.y + EYE + bob,
      this.pos.z + rz * sway,
    );
    if (this.lookLock > 0) {
      // the tape drags the lens toward the thing it wants you to see
      const d = this.lookTarget.clone().sub(this.camera.position);
      const wy = Math.atan2(-d.x, -d.z);
      const wp = Math.atan2(d.y, Math.hypot(d.x, d.z));
      const lk = 1 - Math.exp(-6 * dt);
      this.yaw += (wy - this.yaw) * lk;
      this.pitch += (wp - this.pitch) * lk;
    }
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);
    this.camera.rotateZ(Math.sin(this.bobT * 1.1) * 0.006);
    this.sprinting = sprinting;
  }

  forceLookAt(x, y, z, secs = 1.2) {
    this.lookTarget.set(x, y, z);
    this.lookLock = secs;
  }
}
