// player.js — the sellsword. Third person over the shoulder, pointer-lock
// look, three-swing combo with an arcing steel trail, held block that turns
// blades, and a horse that answers a whistle. Speed is damage: a couched pass
// at full gallop reaps everything in reach.
import * as THREE from './engine/three.js';
import { Soldier, Horse } from './soldier.js';
import { heightAt } from './world.js';
import { sfxSwing, sfxClang, sfxHit, sfxGallop } from './engine/audio.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Player {
  constructor(scene, camera, dom, battle, gore) {
    this.scene = scene; this.camera = camera; this.battle = battle; this.gore = gore;
    this.rig = new Soldier(scene, 0, 55, 'blue', 'knight');
    this.rig.parts.helm.material = new THREE.MeshLambertMaterial({ color: 0xb8bec8 });
    const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.1), new THREE.MeshLambertMaterial({ color: 0x24365a, side: THREE.DoubleSide }));
    cape.position.set(0, 1.6, 0.32);
    this.rig.g.add(cape);
    this.pos = this.rig.pos;
    this.horse = new Horse(scene, 4, 58);
    this.mounted = false;

    this.alive = true;
    this.hp = 100; this.maxHp = 100;
    this.yaw = Math.PI; this.pitch = -0.12;
    this.vel = new THREE.Vector3();
    this.keys = new Set();
    this.blocking = false;
    this.swingT = 0; this.combo = 0; this.swingCd = 0;
    this.hurtCd = 0;
    this.kills = 0;
    this.enabled = false;
    this.onHurt = null; this.onKill = null;

    // swing trail: an arc sector that flashes with each cut
    this.trail = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 2.3, 24, 1, 0, Math.PI * 0.9),
      new THREE.MeshBasicMaterial({ color: 0xfff2d8, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    scene.add(this.trail);

    const doc = dom.ownerDocument;
    doc.addEventListener('keydown', e => this.keys.add(e.key.toLowerCase()));
    doc.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    dom.addEventListener('mousemove', e => {
      if (!this.enabled || !doc.pointerLockElement) return;
      this.yaw -= e.movementX * 0.0024;
      this.pitch = clamp(this.pitch - e.movementY * 0.0022, -0.9, 0.55);
    });
    dom.addEventListener('mousedown', e => {
      if (!this.enabled) return;
      if (!doc.pointerLockElement) { this.requestLock(dom); return; }
      if (e.button === 0) this.attack();
      if (e.button === 2) this.blocking = true;
    });
    doc.addEventListener('mouseup', e => { if (e.button === 2) this.blocking = false; });
    dom.addEventListener('contextmenu', e => e.preventDefault());
    this.dom = dom;
    this._camPos = new THREE.Vector3(0, 4, 62);
    this._look = new THREE.Vector3();
  }

  requestLock(dom = this.dom) {
    try { const p = dom.requestPointerLock && dom.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch {}
  }

  place(x, z, yaw = Math.PI) {
    this.pos.set(x, heightAt(x, z), z);
    this.yaw = yaw;
    this.horse.pos.set(x + 3, heightAt(x + 3, z + 2), z + 2);
    this.vel.set(0, 0, 0);
  }

  attack() {
    if (!this.alive || this.swingCd > 0 || this.blocking) return;
    this.swingCd = 0.55;
    this.swingT = 0.2;
    this.combo = (this.combo + 1) % 3;
    this.rig.beginSwing(0.12);
    setTimeout(() => this.rig.releaseSwing(), 110);
    sfxSwing();
    // the cut lands mid-swing
    setTimeout(() => {
      if (!this.alive) return;
      const dmg = this.mounted ? 44 : (this.combo === 0 ? 52 : 34); // 3rd hit heavy
      const r = this.battle.damageArc(this.pos.x, this.pos.z, this.yaw, this.mounted ? 3.6 : 3.0, 1.15, dmg, true);
      if (r.killed) { this.kills += r.killed; this.onKill && this.onKill(r); }
      if (r.hits && !r.killed) sfxHit();
    }, 130);
  }

  takeHit(dmg, dir, from) {
    if (!this.alive || this.hurtCd > 0) return;
    // a held block turns anything from the front
    if (this.blocking && from) {
      const ang = Math.atan2(from.pos.x - this.pos.x, from.pos.z - this.pos.z);
      let dd = Math.abs(ang - this.yaw);
      if (dd > Math.PI) dd = Math.PI * 2 - dd;
      if (dd < 1.2) { sfxClang(); this.hurtCd = 0.25; return; }
    }
    this.hurtCd = 0.4;
    this.hp -= dmg * (this.mounted ? 0.7 : 1);
    sfxHit();
    this.gore.blood(this.pos.x, this.pos.y + 1.5, this.pos.z, dir, 8, 0.7);
    this.onHurt && this.onHurt(this.hp);
    this.vel.x += dir.x * 3; this.vel.z += dir.z * 3;
    if (this.hp <= 0) { this.alive = false; this.rig.kill(); if (this.mounted) this.dismount(); }
  }

  mount() {
    const d = Math.hypot(this.horse.pos.x - this.pos.x, this.horse.pos.z - this.pos.z);
    if (d < 4) { this.mounted = true; }
  }
  dismount() { this.mounted = false; this.pos.x += 1.2; }
  whistle() { // the horse comes to you
    this.horse.pos.set(this.pos.x + 2.5, this.horse.pos.y, this.pos.z + 1);
  }

  update(dt) {
    this.swingCd = Math.max(0, this.swingCd - dt);
    this.hurtCd = Math.max(0, this.hurtCd - dt);
    if (this.alive) this.hp = Math.min(this.maxHp, this.hp + dt * 1.2);

    let mf = 0, mr = 0;
    if (this.enabled && this.alive) {
      if (this.keys.has('w')) mf += 1;
      if (this.keys.has('s')) mf -= 1;
      if (this.keys.has('d')) mr += 1;
      if (this.keys.has('a')) mr -= 1;
    }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);

    if (this.mounted) {
      // the horse: W builds gallop, steering leans wide at speed
      this._gallop = clamp((this._gallop || 0) + (mf > 0 ? dt * 5 : -dt * 7), 0, 13);
      const sp = this._gallop;
      this.yaw -= mr * dt * (1.6 - sp * 0.07);
      this.pos.x += fx * sp * dt; this.pos.z += fz * sp * dt;
      this.horse.pos.copy(this.pos);
      this.horse.heading = this.yaw;
      this.horse.speed = sp;
      this.rig.pos.copy(this.pos);
      this.rig.g.position.y = heightAt(this.pos.x, this.pos.z) + 1.35; // in the saddle
      this.rig.heading = this.yaw;
      this.rig.moving = false;
      if (sp > 6) {
        if ((this._hoofT = (this._hoofT || 0) - dt) <= 0) { this._hoofT = 0.28; sfxGallop(); }
        // trample: full gallop is a weapon
        const r = this.battle.damageArc(this.pos.x + fx * 1.4, this.pos.z + fz * 1.4, this.yaw, 1.7, 1.3, sp * 4.5, true);
        if (r.killed) { this.kills += r.killed; this.onKill && this.onKill(r); }
      }
    } else {
      const speed = (this.keys.has('shift') ? 7.6 : 4.6) * (this.blocking ? 0.5 : 1);
      const mv = Math.hypot(mf, mr) || 1;
      const k = 1 - Math.exp(-10 * dt);
      this.vel.x += ((fx * mf + rx * mr) / mv * speed - this.vel.x) * k;
      this.vel.z += ((fz * mf + rz * mr) / mv * speed - this.vel.z) * k;
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      this.rig.moving = Math.hypot(this.vel.x, this.vel.z) > 0.5;
      this.rig.heading = this.yaw;
      this.horse.speed *= 0.9;
    }
    this.pos.x = clamp(this.pos.x, -140, 140);
    this.pos.z = clamp(this.pos.z, -140, 140);
    this.rig.update(dt);
    this.horse.update(dt);

    // swing trail flash
    if (this.swingT > 0) {
      this.swingT -= dt;
      const k = Math.max(0, this.swingT / 0.2);
      this.trail.position.set(this.pos.x, this.pos.y + 1.35, this.pos.z);
      this.trail.rotation.set(this.combo === 0 ? -Math.PI / 2.4 : -Math.PI / 2 + 0.3, this.yaw + Math.PI, (1 - k) * 2.4 * (this.combo % 2 ? 1 : -1));
      this.trail.material.opacity = k * 0.5;
    } else this.trail.material.opacity = 0;

    // camera: over the right shoulder, higher in the saddle
    const h = this.mounted ? 3.4 : 2.2;
    const back = this.mounted ? 7.5 : 5.2;
    const cp = Math.cos(this.pitch);
    const want = this._look.set(
      this.pos.x - fx * back * cp + rx * 0.9,
      this.pos.y + h - Math.sin(this.pitch) * back,
      this.pos.z - fz * back * cp + rz * 0.9,
    );
    this._camPos.lerp(want, 1 - Math.exp(-14 * dt));
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this.pos.x + fx * 6, this.pos.y + 1.7 + Math.sin(this.pitch) * 6, this.pos.z + fz * 6);
  }
}
