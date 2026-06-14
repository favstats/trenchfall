// soldier.js — one British infantryman: a cheap articulated low-poly figure with
// idle / move / aim / fire / dead states and simple gait animation. Geometry and
// materials are shared across all soldiers. Group origin sits at the feet (y=0).
import * as THREE from '../engine/three.js';

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
  const geo = {
    hips:  new THREE.BoxGeometry(1.0, 0.5, 0.6),
    torso: new THREE.BoxGeometry(1.05, 1.0, 0.62),
    leg:   new THREE.BoxGeometry(0.4, 1.0, 0.48),
    arm:   new THREE.BoxGeometry(0.3, 0.95, 0.36),
    head:  new THREE.BoxGeometry(0.5, 0.5, 0.5),
    helmet:new THREE.SphereGeometry(0.38, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    rifle: new THREE.BoxGeometry(0.14, 0.16, 1.7),
  };
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

    const hips = new THREE.Mesh(geo.hips, mat.kit); hips.position.y = 1.05;
    const torso = new THREE.Mesh(geo.torso, mat.uniform); torso.position.y = 1.85;
    const head = new THREE.Mesh(geo.head, mat.skin); head.position.y = 2.55;
    const helm = new THREE.Mesh(geo.helmet, mat.helmet); helm.position.y = 2.78;

    const legL = new THREE.Mesh(geo.leg, mat.uniform); legL.position.set(-0.25, 1.05, 0);
    const legR = new THREE.Mesh(geo.leg, mat.uniform); legR.position.set(0.25, 1.05, 0);
    const armL = new THREE.Mesh(geo.arm, mat.uniform); armL.position.set(-0.62, 2.25, 0.1);
    const armR = new THREE.Mesh(geo.arm, mat.uniform); armR.position.set(0.62, 2.25, 0.1);

    // rifle, held forward (group faces -z = toward the enemy by default)
    const rifle = new THREE.Mesh(geo.rifle, mat.gun);
    rifle.position.set(0.35, 2.0, -0.7);

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
    this.target = new THREE.Vector2(x, z);
    this.heading = 0;        // yaw (radians), 0 = facing -z
    this.state = 'idle';     // idle | move | aim | dead
    this.alive = true;
    this.hp = 3;
    this.speed = 7.5;
    this.phase = Math.random() * Math.PI * 2; // gait offset
    this.reload = 0;         // seconds until next shot (combat fills this)
    this.deadT = 0;          // time since death (for reanimation)
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
      // topple: rotate flat and sink slightly
      this.deadT += dt;
      const k = Math.min(this.deadT / 0.5, 1);
      this.g.rotation.x = -Math.PI / 2 * k * 0.92;
      this.g.position.y = -0.2 * k;
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
  }

  dispose() { this.scene.remove(this.g); }
}
