// enemies.js — STRAYS: feral salvage drones, and the whole point is that they
// are ordinary rigid bodies. Shoot them, sure — or tether one and throw it
// into its pack, drop a crate stack on them, let heavy spin do the work.
// Momentum kills them the same way it kills anything.
import * as THREE from './engine/three.js';
import { RAPIER } from './physics.js';
import { sfxDroneDie } from './engine/audio.js';

const DRONE_MAT = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, metalness: 0.65, roughness: 0.45 });
const EYE_MAT = new THREE.MeshBasicMaterial({ color: 0xff4a30 });
const BRUTE_MAT = new THREE.MeshStandardMaterial({ color: 0x4a3038, metalness: 0.7, roughness: 0.4 });

export class Enemies {
  constructor(phys, scene, gore) {
    this.phys = phys; this.scene = scene; this.gore = gore;
    this.list = [];
    this.onKill = null;
  }

  spawn(x, z, brute = false) {
    const r = brute ? 1.1 : 0.55;
    const rb = this.phys.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, 2.5, z).setAngularDamping(2).setLinearDamping(0.4));
    this.phys.world.createCollider(RAPIER.ColliderDesc.ball(r).setDensity(brute ? 4 : 1.6), rb);
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), brute ? BRUTE_MAT : DRONE_MAT);
    body.castShadow = true;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 0.28, 8, 6), EYE_MAT);
    eye.position.set(0, r * 0.2, -r * 0.85);
    const l = new THREE.PointLight(0xff4a30, 2, 6, 2);
    g.add(body, eye, l);
    const rec = this.phys.track(rb, g, 'enemy', {
      hp: brute ? 90 : 30, brute, atkCd: 0, eye,
    });
    this.list.push(rec);
    return rec;
  }

  count() { return this.list.length; }

  kill(rec, player) {
    const p = rec.rb.translation();
    sfxDroneDie();
    // burst into real scrap: 4 small dynamic chunks + sparks
    for (let i = 0; i < (rec.brute ? 7 : 4); i++) {
      const c = this.phys.box(p.x, p.y + 0.2, p.z, 0.25 + Math.random() * 0.2, 0.2, 0.25,
        { mat: DRONE_MAT, density: 1 });
      c.rb.setLinvel({ x: (Math.random() - 0.5) * 8, y: 3 + Math.random() * 5, z: (Math.random() - 0.5) * 8 }, true);
      c.rb.setAngvel({ x: Math.random() * 8, y: Math.random() * 8, z: Math.random() * 8 }, true);
    }
    this.gore && this.gore.sparks(p.x, p.y, p.z, rec.brute ? 26 : 14);
    if (player && player.boons.siphon) player.hp = Math.min(player.maxHp, player.hp + 12);
    this.phys.remove(rec);
    const i = this.list.indexOf(rec);
    if (i >= 0) this.list.splice(i, 1);
    this.onKill && this.onKill(rec);
  }

  update(dt, player) {
    for (const rec of [...this.list]) {
      if (rec.hp <= 0) { this.kill(rec, player); continue; }
      const p = rec.rb.translation();
      const dx = player.pos.x - p.x, dy = (player.pos.y + 1) - p.y, dz = player.pos.z - p.z;
      const d = Math.hypot(dx, dy, dz) || 1;

      // momentum check: anything fast (thrown, falling, shot crates) wrecks it
      const v = rec.rb.linvel();
      const relSpeed = Math.hypot(v.x, v.y, v.z);
      for (const b of this.phys.bodies) {
        if (b === rec || b.rb.isFixed() || b.kind === 'enemy') continue;
        const bp = b.rb.translation();
        const bd = Math.hypot(bp.x - p.x, bp.y - p.y, bp.z - p.z);
        if (bd > 1.6) continue;
        const bv = b.rb.linvel();
        const bs = Math.hypot(bv.x - v.x, bv.y - v.y, bv.z - v.z);
        const momentum = bs * b.mass;
        if (bs > 7 && momentum > 24) {
          rec.hp -= momentum * 0.9;
          this.gore && this.gore.sparks(p.x, p.y, p.z, 6);
          if (b.overcharged) { rec.hp = -1; b.overcharged = false; this.gore && this.gore.boom(bp.x, bp.y, bp.z); }
        }
      }
      // wall-slam: a thrown drone that stops hard dies of it
      if (rec.thrownAt && relSpeed < 2 && performance.now() - rec.thrownAt > 250) {
        if (rec.prevV > 9) rec.hp -= rec.prevV * 4;
        rec.thrownAt = 0;
      }

      // hunt: thrust toward the operator, hop-lunge in close
      if (!rec.heldByPlayer && player.alive) {
        const thrust = (rec.brute ? 26 : 14) * rec.mass * dt;
        rec.rb.applyImpulse({ x: (dx / d) * thrust, y: (dy / d) * thrust * 0.4 + rec.mass * 2.2 * dt, z: (dz / d) * thrust }, true);
        rec.atkCd -= dt;
        if (d < (rec.brute ? 2.4 : 1.5) && rec.atkCd <= 0) {
          rec.atkCd = 1.1;
          player.takeHit(rec.brute ? 22 : 10, { x: dx / d, z: dz / d });
        }
      }
      rec.eye.lookAt(player.pos.x, player.pos.y + 1.2, player.pos.z);
    }
  }

  clear() {
    for (const rec of [...this.list]) { this.phys.remove(rec); }
    this.list = [];
  }
}
