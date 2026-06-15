// soldier.js — one British infantryman: a cheap articulated low-poly figure with
// idle / move / aim / fire / dead states and simple gait animation. Geometry and
// materials are shared across all soldiers. Group origin sits at the feet (y=0).
import * as THREE from '../engine/three.js';
import { heightAt } from '../world/field.js';

let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const mat = {
    uniform: new THREE.MeshStandardMaterial({ color: 0x4d5440, roughness: 0.85 }),
    kit:     new THREE.MeshStandardMaterial({ color: 0x35392c, roughness: 0.8 }),
    helmet:  new THREE.MeshStandardMaterial({ color: 0x3a3f31, roughness: 0.7 }),
    skin:    new THREE.MeshStandardMaterial({ color: 0xc59a76, roughness: 0.7 }),
    gun:     new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.5, metalness: 0.4 }),
  };
  // rounded, tapered forms instead of boxes — same mesh count (no extra draw calls),
  // just less blocky so the troops read as well as the detailed dead
  const geo = {
    hips:  new THREE.CylinderGeometry(0.46, 0.4, 0.5, 8),
    torso: new THREE.CylinderGeometry(0.5, 0.42, 1.05, 8),   // chest down to a tapered waist
    leg:   new THREE.CylinderGeometry(0.2, 0.15, 1.0, 6),    // thigh tapering to the boot
    arm:   new THREE.CylinderGeometry(0.15, 0.11, 0.95, 6),
    head:  new THREE.SphereGeometry(0.27, 8, 6),
    helmet:new THREE.SphereGeometry(0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    rifle: new THREE.BoxGeometry(0.14, 0.16, 1.7),
  };
  geo.torso.scale(1.18, 1, 0.62);    // oval cross-section: a chest, not a column
  geo.hips.scale(1.1, 1, 0.64);
  // center leg/arm geo at top so we can pivot from the joint
  geo.leg.translate(0, -0.5, 0);
  geo.arm.translate(0, -0.475, 0);
  SHARED = { mat, geo };
  return SHARED;
}

const SCALE = 1.25; // bumped above realistic so units read from the tactical camera

export class Soldier {
  constructor(scene, x, z, squad) {
    const { mat, geo } = shared();
    const g = new THREE.Group();
    g.scale.setScalar(SCALE);
    g.position.set(x, 0, z);
    const uniformMat = squad.type === 'engineer'
      ? new THREE.MeshStandardMaterial({ color: 0x675a3f, roughness: 0.86 })
      : mat.uniform;
    const kitMat = squad.type === 'engineer'
      ? new THREE.MeshStandardMaterial({ color: 0x463c2c, roughness: 0.82 })
      : mat.kit;

    const hips = new THREE.Mesh(geo.hips, kitMat); hips.position.y = 1.05;
    const torso = new THREE.Mesh(geo.torso, uniformMat); torso.position.y = 1.85;
    const head = new THREE.Mesh(geo.head, mat.skin); head.position.y = 2.55;
    const helm = new THREE.Mesh(geo.helmet, mat.helmet); helm.position.y = 2.78;

    const legL = new THREE.Mesh(geo.leg, uniformMat); legL.position.set(-0.25, 1.05, 0);
    const legR = new THREE.Mesh(geo.leg, uniformMat); legR.position.set(0.25, 1.05, 0);
    const armL = new THREE.Mesh(geo.arm, uniformMat); armL.position.set(-0.62, 2.25, 0.1);
    const armR = new THREE.Mesh(geo.arm, uniformMat); armR.position.set(0.62, 2.25, 0.1);

    // rifle, held forward (group faces -z = toward the enemy by default)
    const rifle = new THREE.Mesh(geo.rifle, mat.gun);
    rifle.position.set(0.35, 2.0, -0.7);
    if (squad.type === 'engineer') {
      rifle.scale.z = 0.55;
      rifle.position.set(0.42, 1.74, -0.3);
      rifle.rotation.x = 1.1;
    }

    for (const m of [hips, torso, head, helm, legL, legR, armL, armR, rifle]) {
      m.castShadow = true;
      g.add(m);
    }

    // selection ring on the ground
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 0.95, 16),
      new THREE.MeshBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; ring.visible = false;
    g.add(ring);

    g.userData.squad = squad;
    scene.add(g);

    this.scene = scene;
    this.g = g;
    this.parts = { legL, legR, armL, armR, torso, rifle, ring };
    this.pos = g.position;
    this.elevation = heightAt(x, z);     // current standing height (climbs ramps)
    g.position.y = this.elevation;
    this.target = new THREE.Vector2(x, z);
    this.heading = 0;        // yaw (radians), 0 = facing -z
    this.state = 'idle';     // idle | move | aim | dead
    this.alive = true;
    this.hp = 3;
    this.speed = 7.5;
    this.phase = Math.random() * Math.PI * 2; // gait offset
    this.reload = 0;         // seconds until next shot (combat fills this)
    this.deadT = 0;          // time since death (for reanimation)
    this.risen = false;      // has this body risen as undead yet
    this.possessed = false;  // under direct player control
    this.squad = squad;
  }

  moveTo(x, z) { this.target.set(x, z); if (this.alive) this.state = 'move'; }
  faceTo(x, z) { this.heading = Math.atan2(-(x - this.pos.x), -(z - this.pos.z)); }

  kill() {
    if (!this.alive) return;
    this.alive = false;
    this.state = 'dead';
    this.deadT = 0;
    this.parts.ring.visible = false;
  }

  setSelected(v) { if (this.alive) this.parts.ring.visible = v; }

  update(dt) {
    const p = this.parts;
    if (!this.alive) {
      // topple: rotate flat and sink slightly (from wherever it fell)
      this.deadT += dt;
      const k = Math.min(this.deadT / 0.5, 1);
      this.g.rotation.x = -Math.PI / 2 * k * 0.92;
      this.g.position.y = this.elevation - 0.2 * k;
      return;
    }

    // under direct control: skip squad AI, just follow terrain + light gait
    if (this.possessed) {
      const h = heightAt(this.pos.x, this.pos.z);
      this.elevation += (h - this.elevation) * Math.min(1, dt * 12);
      this.g.position.y = this.elevation;
      this.g.rotation.y = this.heading;
      this.phase += dt * 9;
      const s = Math.sin(this.phase) * 0.4;
      this.parts.legL.rotation.x = s; this.parts.legR.rotation.x = -s;
      return;
    }

    // movement toward target
    const dx = this.target.x - this.pos.x, dz = this.target.y - this.pos.z;
    const d = Math.hypot(dx, dz);
    let moving = false;
    if (this.state === 'move' && d > 0.4) {
      const step = Math.min(this.speed * dt, d);
      this.pos.x += (dx / d) * step;
      this.pos.z += (dz / d) * step;
      this.heading = Math.atan2(-dx, -dz);
      moving = true;
    } else if (this.state === 'move') {
      this.state = 'idle';
    }

    // follow terrain (climb the embankment / stand on the rampart)
    const h = heightAt(this.pos.x, this.pos.z);
    this.elevation += (h - this.elevation) * Math.min(1, dt * 9);
    this.g.position.y = this.elevation;
    this.g.rotation.y = this.heading;

    // gait / pose
    if (moving) {
      this.phase += dt * 11;
      const s = Math.sin(this.phase) * 0.6;
      p.legL.rotation.x = s; p.legR.rotation.x = -s;
      p.armL.rotation.x = -s * 0.6; p.armR.rotation.x = s * 0.6;
      p.torso.position.y = 1.85 + Math.abs(Math.cos(this.phase)) * 0.04;
    } else {
      // ease legs back to stand
      p.legL.rotation.x *= 0.8; p.legR.rotation.x *= 0.8;
      p.armL.rotation.x *= 0.8; p.armR.rotation.x *= 0.8;
    }
    if (this.repairing) this.phase += dt * 7;
    // reload pose — drop the muzzle while working the action / changing mags
    if (this.repairing) {
      p.armL.rotation.x = 0.8 + Math.sin(this.phase * 3) * 0.18;
      p.armR.rotation.x = 0.95 + Math.sin(this.phase * 3 + 0.7) * 0.18;
      p.rifle.rotation.x = 1.1 + Math.sin(this.phase * 3) * 0.26;
    } else {
      p.rifle.rotation.x = (this.reloading && this.reload > 0.05) ? 0.7 : (this.squad.type === 'engineer' ? 1.1 : 0);
    }
  }

  dispose() { this.scene.remove(this.g); }
}
