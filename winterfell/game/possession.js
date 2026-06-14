// possession.js — direct control of a single soldier (the Gates-of-Hell hook,
// and a true first-/third-person perspective). [F] possesses the selected man:
// WASD moves, mouse aims (pointer lock), LMB fires, [F]/[Esc] hands back to AI.
import * as THREE from '../engine/three.js';
import { BOUNDS, FIELD_HALF_X, heightAt } from '../world/field.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Possession {
  constructor(camera, rig, force, combat, dom) {
    this.camera = camera; this.rig = rig; this.force = force; this.combat = combat; this.dom = dom;
    this.active = false; this.avatar = null;
    this.keys = new Set();
    this.yaw = 0; this.pitch = 0; this.firing = false; this._cd = 0;
    this._look = new THREE.Vector3();

    const doc = dom.ownerDocument;
    doc.addEventListener('keydown', e => {
      if (!this.active) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') { this.exit(); return; }
      this.keys.add(k);
    });
    doc.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    dom.addEventListener('mousemove', e => {
      if (!this.active || !doc.pointerLockElement) return;
      this.yaw -= e.movementX * 0.0026;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0026, -0.55, 0.45);
    });
    dom.addEventListener('mousedown', e => { if (this.active && e.button === 0) this.firing = true; });
    doc.addEventListener('mouseup', e => { if (e.button === 0) this.firing = false; });
  }

  enter(soldier) {
    if (!soldier || !soldier.alive) return;
    this.active = true; this.avatar = soldier; soldier.possessed = true;
    this.yaw = soldier.heading; this.pitch = 0; this._cd = 0;
    if (this.combat?.state) this.combat.state.possession = soldier.squad?.label || 'RIFLEMAN';
    this.rig.setEnabled(false);
    try { const p = this.dom.requestPointerLock && this.dom.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch {}
  }

  exit() {
    if (this.avatar) this.avatar.possessed = false;
    this.active = false; this.avatar = null; this.firing = false; this.keys.clear();
    if (this.combat?.state) this.combat.state.possession = null;
    this.rig.setEnabled(true);
    const doc = this.dom.ownerDocument;
    if (doc.pointerLockElement) doc.exitPointerLock();
  }

  toggle(soldier) { this.active ? this.exit() : this.enter(soldier); }

  update(dt) {
    if (!this.active) return;
    const a = this.avatar;
    if (!a || !a.alive) { this.exit(); return; }

    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);   // forward
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);    // right

    let mf = 0, ms = 0;
    if (this.keys.has('w')) mf += 1;
    if (this.keys.has('s')) mf -= 1;
    if (this.keys.has('d')) ms += 1;
    if (this.keys.has('a')) ms -= 1;
    const spd = (this.keys.has('shift') ? 12 : 7.5) * dt;
    a.pos.x += (fx * mf + rx * ms) * spd;
    a.pos.z += (fz * mf + rz * ms) * spd;
    a.pos.x = clamp(a.pos.x, -FIELD_HALF_X + 3, FIELD_HALF_X - 3);
    a.pos.z = clamp(a.pos.z, BOUNDS.minZ, BOUNDS.maxZ);
    a.heading = this.yaw;
    a.elevation += (heightAt(a.pos.x, a.pos.z) - a.elevation) * Math.min(1, dt * 14);
    a.pos.y = a.elevation;

    // over-the-shoulder camera
    const headY = a.pos.y + 3.2;
    this.camera.position.set(a.pos.x - fx * 7, headY + 2.4, a.pos.z - fz * 7);
    this._look.set(a.pos.x + fx * 14, headY + this.pitch * 16, a.pos.z + fz * 14);
    this.camera.lookAt(this._look);

    // fire
    this._cd -= dt;
    if (this.firing && this._cd <= 0) { this._cd = 0.13; this.combat.playerShot(a, this.yaw); }
  }
}
