// player.js — the operator. Rapier kinematic character controller for crisp
// FPS movement under any gravity, a momentum rifle, and the star of the show:
// the KINETIC TETHER. Grab anything dynamic, carry it humming in front of the
// lens, swing it by looking, hurl it with stored momentum. Mass is ammo.
import * as THREE from './engine/three.js';
import { RAPIER } from './physics.js';
import { sfxRifle, sfxGrab, sfxThrow, sfxHurt, setTether } from './engine/audio.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const EYE = 1.55;

export class Player {
  constructor(phys, camera, dom, scene) {
    this.phys = phys; this.camera = camera; this.scene = scene;
    this.rb = phys.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 3, 10));
    this.col = phys.world.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.4), this.rb);
    this.ctrl = phys.world.createCharacterController(0.06);
    this.ctrl.enableAutostep(0.5, 0.2, true);
    this.ctrl.enableSnapToGround(0.4);

    this.pos = new THREE.Vector3(0, 3, 10);
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.hp = 100; this.maxHp = 100;
    this.alive = true;
    this.enabled = false;
    this.keys = new Set();
    this.grounded = false;
    this.held = null;              // physics rec being carried
    this.rifleCd = 0;
    this.hurtCd = 0;
    this.boons = {};               // momentum, grip, feather, siphon, overcharge
    this.onHurt = null; this.onShotKill = null;

    // rifle viewmodel + tracer
    const rifle = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.7), new THREE.MeshStandardMaterial({ color: 0x3a424c, metalness: 0.6, roughness: 0.4 }));
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.5), new THREE.MeshBasicMaterial({ color: 0x6ad1ff }));
    glow.position.y = 0.05;
    rifle.add(body, glow);
    rifle.position.set(0.32, -0.26, -0.55);
    camera.add(rifle);
    this.rifleModel = rifle;
    this.tracer = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 1),
      new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(this.tracer);
    this._tracerT = 0;

    // tether beam
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 1, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x7affc8, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beam.visible = false;
    scene.add(this.beam);

    const doc = dom.ownerDocument;
    doc.addEventListener('keydown', e => this.keys.add(e.key.toLowerCase()));
    doc.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    dom.addEventListener('mousemove', e => {
      if (!this.enabled || !doc.pointerLockElement) return;
      this.yaw -= e.movementX * 0.0023;
      this.pitch = clamp(this.pitch - e.movementY * 0.0023, -1.45, 1.45);
    });
    dom.addEventListener('mousedown', e => {
      if (!this.enabled) { return; }
      if (!doc.pointerLockElement) { this.requestLock(dom); return; }
      if (e.button === 0) this.held ? this.throwHeld() : this.fire();
      if (e.button === 2) this.held ? this.dropHeld() : this.grab();
    });
    dom.addEventListener('contextmenu', e => e.preventDefault());
    this.dom = dom;
    this._fwd = new THREE.Vector3(); this._v3 = new THREE.Vector3();
  }

  requestLock(dom = this.dom) {
    try { const p = dom.requestPointerLock && dom.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch {}
  }

  place(x, y, z) {
    this.pos.set(x, y, z);
    this.rb.setNextKinematicTranslation({ x, y, z });
    this.vel.set(0, 0, 0);
    this.dropHeld();
  }

  forward() {
    const cp = Math.cos(this.pitch);
    return this._fwd.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  fire() {
    if (this.rifleCd > 0 || !this.alive) return;
    this.rifleCd = 0.16;
    sfxRifle();
    const dir = this.forward().clone();
    const origin = this.camera.position.clone().addScaledVector(dir, 0.6);
    const hit = this.phys.raycast(origin, dir, 80, this.rb);
    const impulse = (this.boons.momentum ? 40 : 18);
    const end = hit ? hit.point : origin.clone().addScaledVector(dir, 80);
    // tracer
    this.tracer.position.lerpVectors(origin, end, 0.5);
    this.tracer.scale.z = origin.distanceTo(end);
    this.tracer.lookAt(end);
    this.tracer.material.opacity = 0.9;
    this._tracerT = 0.07;
    this.rifleModel.position.z = -0.45;   // recoil kick
    if (hit && hit.rec && !hit.rec.rb.isFixed()) {
      hit.rec.rb.applyImpulseAtPoint(
        { x: dir.x * impulse, y: dir.y * impulse, z: dir.z * impulse },
        { x: hit.point.x, y: hit.point.y, z: hit.point.z }, true);
      if (hit.rec.kind === 'enemy') {
        hit.rec.hp -= this.boons.momentum ? 22 : 14;
        this.onShotHit && this.onShotHit(hit.rec, hit.point);
      }
    }
  }

  grab() {
    const dir = this.forward();
    const origin = this.camera.position.clone().addScaledVector(dir, 0.6);
    const hit = this.phys.raycast(origin, dir, this.boons.grip ? 40 : 26, this.rb);
    if (!hit || !hit.rec || hit.rec.rb.isFixed()) return;
    const maxMass = this.boons.grip ? 40 : 16;
    if (hit.rec.mass > maxMass) return;
    this.held = hit.rec;
    this.held.rb.setGravityScale(0, true);
    sfxGrab();
  }

  dropHeld() {
    if (!this.held) return;
    this.held.rb.setGravityScale(1, true);
    this.held = null;
    setTether(0);
  }

  throwHeld() {
    if (!this.held) return;
    const rec = this.held;
    this.dropHeld();
    const dir = this.forward();
    const power = (this.boons.grip ? 34 : 26) / Math.max(1, Math.sqrt(rec.mass / 6));
    rec.rb.setLinvel({ x: dir.x * power, y: dir.y * power + 1.5, z: dir.z * power }, true);
    rec.thrownAt = performance.now();
    if (this.boons.overcharge) rec.overcharged = true;
    sfxThrow();
  }

  takeHit(dmg, dir) {
    if (!this.alive || this.hurtCd > 0) return;
    this.hurtCd = 0.5;
    this.hp -= dmg;
    sfxHurt();
    if (dir) { this.vel.x += dir.x * 5; this.vel.z += dir.z * 5; }
    this.onHurt && this.onHurt();
    if (this.hp <= 0) { this.alive = false; this.dropHeld(); }
  }

  update(dt) {
    this.rifleCd = Math.max(0, this.rifleCd - dt);
    this.hurtCd = Math.max(0, this.hurtCd - dt);
    this._tracerT -= dt;
    if (this._tracerT <= 0) this.tracer.material.opacity *= 0.7;
    this.rifleModel.position.z += (-0.55 - this.rifleModel.position.z) * Math.min(1, dt * 10);

    // movement under the room's gravity
    const g = this.phys.world.gravity;
    const gScale = this.boons.feather ? 0.5 : 1;
    let mf = 0, mr = 0;
    if (this.enabled && this.alive) {
      if (this.keys.has('w')) mf += 1;
      if (this.keys.has('s')) mf -= 1;
      if (this.keys.has('d')) mr += 1;
      if (this.keys.has('a')) mr -= 1;
    }
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw); // NOTE: verified right-hand for this yaw convention
    const speed = this.keys.has('shift') ? 8.4 : 5.4;
    const mv = Math.hypot(mf, mr) || 1;
    const k = 1 - Math.exp(-12 * dt);
    this.vel.x += ((fx * mf + rx * mr) / mv * speed - this.vel.x) * k;
    this.vel.z += ((fz * mf + rz * mr) / mv * speed - this.vel.z) * k;
    this.vel.x += g.x * gScale * dt; this.vel.z += g.z * gScale * dt;
    this.vel.y += g.y * gScale * dt;
    if (this.grounded && this.keys.has(' ') && this.enabled && this.alive) {
      this.vel.y = Math.sqrt(Math.abs(g.y)) * (this.boons.feather ? 3.4 : 2.6);
    }

    const move = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    this.ctrl.computeColliderMovement(this.col, move);
    const cm = this.ctrl.computedMovement();
    const cur = this.rb.translation();
    this.rb.setNextKinematicTranslation({ x: cur.x + cm.x, y: cur.y + cm.y, z: cur.z + cm.z });
    this.pos.set(cur.x + cm.x, cur.y + cm.y, cur.z + cm.z);
    this.grounded = this.ctrl.computedGrounded();
    if (this.grounded && this.vel.y < 0) this.vel.y = -0.5;

    // camera
    this.camera.position.set(this.pos.x, this.pos.y + EYE - 0.55, this.pos.z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);

    // ---- the tether: carry the mass at a hold point, hum under load ----
    if (this.held) {
      const dir = this.forward();
      const holdDist = 2.6 + Math.min(2, this.held.mass * 0.08);
      const target = this._v3.set(
        this.camera.position.x + dir.x * holdDist,
        this.camera.position.y + dir.y * holdDist,
        this.camera.position.z + dir.z * holdDist);
      const p = this.held.rb.translation();
      const K = this.boons.grip ? 14 : 9;
      this.held.rb.setLinvel({ x: (target.x - p.x) * K, y: (target.y - p.y) * K, z: (target.z - p.z) * K }, true);
      this.held.rb.setAngvel({ x: 0, y: 0.6, z: 0 }, true);
      setTether(Math.min(1, this.held.mass / 20));
      // beam visual — anchored at the rifle muzzle so it angles across the
      // view (seen end-on from the lens it read as a wall of light)
      this.beam.visible = true;
      const muzzle = this._v3.set(0.32, -0.3, -0.9).applyQuaternion(this.camera.quaternion).add(this.camera.position);
      const px = p.x, py = p.y, pz = p.z;
      this.beam.position.set((muzzle.x + px) / 2, (muzzle.y + py) / 2, (muzzle.z + pz) / 2);
      this.beam.scale.y = Math.max(0.3, muzzle.distanceTo(new THREE.Vector3(px, py, pz)));
      this.beam.lookAt(px, py, pz);
      this.beam.rotateX(Math.PI / 2);
      if (this.camera.position.distanceTo(new THREE.Vector3(p.x, p.y, p.z)) > 14) this.dropHeld();
    } else {
      this.beam.visible = false;
      setTether(0);
    }
  }
}
