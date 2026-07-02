// soldier.js — one fighting man, built from detachable parts on purpose: the
// gore system pulls limbs OFF these rigs, so every part pivots at its joint
// and can be hidden and replaced by a stump. Types: foot (sword+shield),
// archer (bow), knight (two-hander, heavier). Plus the horse.
import * as THREE from './engine/three.js';
import { heightAt } from './world.js';

export const FACTION = {
  blue: { tunic: 0x2e4a7a, trim: 0x1c2f4e, skin: 0xc59a76 },
  red:  { tunic: 0x8a2420, trim: 0x571512, skin: 0xb8906e },
};
const STEEL = 0x9aa2ac, DARKSTEEL = 0x4c5258, WOOD = 0x6a4a2c, BONE = 0x5a0d0d;

let GEO = null;
function geos() {
  if (GEO) return GEO;
  GEO = {
    torso: new THREE.CylinderGeometry(0.34, 0.28, 0.78, 8),
    hips: new THREE.CylinderGeometry(0.3, 0.26, 0.34, 8),
    head: new THREE.SphereGeometry(0.185, 10, 8),
    helm: new THREE.SphereGeometry(0.24, 10, 7, 0, Math.PI * 2, 0, Math.PI / 1.7),
    leg: new THREE.CylinderGeometry(0.13, 0.09, 0.78, 6),
    arm: new THREE.CylinderGeometry(0.1, 0.075, 0.66, 6),
    sword: swordGeo(1.05),
    great: swordGeo(1.5),
    shield: new THREE.CylinderGeometry(0.34, 0.34, 0.06, 12),
    bow: new THREE.TorusGeometry(0.5, 0.03, 6, 12, Math.PI),
    stump: new THREE.SphereGeometry(0.11, 6, 5),
  };
  GEO.torso.scale(1.15, 1, 0.7);
  GEO.hips.scale(1.1, 1, 0.72);
  GEO.leg.translate(0, -0.39, 0);
  GEO.arm.translate(0, -0.33, 0);
  return GEO;
}
function swordGeo(len) {
  const g = new THREE.BoxGeometry(0.06, len, 0.015);
  g.translate(0, len / 2 + 0.12, 0);
  return g;
}

export class Soldier {
  constructor(scene, x, z, faction, type = 'foot') {
    const G = geos();
    const F = FACTION[faction];
    this.faction = faction; this.type = type;
    // no two men alike: tunic shade, skin tone, height and helm all vary
    const tc = new THREE.Color(F.tunic).offsetHSL((Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.1);
    const sc = new THREE.Color(F.skin).offsetHSL(0, 0, (Math.random() - 0.5) * 0.16);
    const tunic = new THREE.MeshLambertMaterial({ color: tc });
    const trim = new THREE.MeshLambertMaterial({ color: F.trim });
    const skin = new THREE.MeshLambertMaterial({ color: sc });
    const steel = new THREE.MeshLambertMaterial({ color: type === 'knight' ? STEEL : DARKSTEEL });
    this.mats = { tunic, trim, skin, steel };

    const g = new THREE.Group();
    g.position.set(x, heightAt(x, z), z);
    this.parts = {};
    const add = (name, geo, mat, px, py, pz) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.castShadow = true;
      g.add(m);
      this.parts[name] = m;
      return m;
    };
    add('hips', G.hips, trim, 0, 0.95, 0);
    add('torso', G.torso, type === 'knight' ? steel : tunic, 0, 1.5, 0);
    add('head', G.head, skin, 0, 2.06, 0);
    // headgear lottery: kettle helm, bare hair, or hood — breaks up the line
    const hv = Math.random();
    if (type === 'knight' || hv < 0.5) add('helm', G.helm, steel, 0, 2.12, 0);
    else if (hv < 0.8) add('helm', G.helm, new THREE.MeshLambertMaterial({ color: [0x3a2a18, 0x1c1410, 0x6a5638, 0x8a7248][(Math.random() * 4) | 0] }), 0, 2.13, 0); // hair
    else add('helm', G.helm, trim, 0, 2.13, 0); // cloth hood
    g.scale.setScalar(0.92 + Math.random() * 0.16);         // height variance
    add('legL', G.leg, trim, -0.16, 0.85, 0);
    add('legR', G.leg, trim, 0.16, 0.85, 0);
    const armMat = type === 'knight' ? steel : tunic;
    add('armL', G.arm, armMat, -0.44, 1.78, 0);
    add('armR', G.arm, armMat, 0.44, 1.78, 0);
    if (type === 'archer') {
      const bow = new THREE.Mesh(G.bow, new THREE.MeshLambertMaterial({ color: WOOD }));
      bow.rotation.z = Math.PI / 2;
      bow.position.set(0, -0.55, -0.1);
      this.parts.armL.add(bow);
      this.weapon = bow;
    } else {
      const sw = new THREE.Mesh(type === 'knight' ? G.great : G.sword, new THREE.MeshLambertMaterial({ color: 0xc8ccd4 }));
      sw.position.set(0, -0.6, 0);
      sw.rotation.x = Math.PI;             // blade down at rest
      this.parts.armR.add(sw);
      this.weapon = sw;
      if (type === 'foot') {
        const sh = new THREE.Mesh(G.shield, trim);
        sh.rotation.z = Math.PI / 2;
        sh.position.set(0, -0.5, 0.12);
        this.parts.armL.add(sh);
      }
    }

    scene.add(g);
    this.scene = scene;
    this.g = g;
    this.pos = g.position;
    this.heading = 0;
    this.alive = true;
    this.hp = type === 'knight' ? 120 : 70;
    this.speed = type === 'knight' ? 3.4 : 4.2;
    this.dmg = type === 'knight' ? 30 : 18;
    this.range = type === 'archer' ? 60 : 2.6;
    this.phase = Math.random() * 9;
    this.atkT = 0; this.windup = 0; this.deadT = -1;
    this.fallDir = 1;
    this.order = 'advance';       // advance | hold | follow (player side)
    this.severed = new Set();
    this.target = null;
  }

  faceTo(x, z) { this.heading = Math.atan2(x - this.pos.x, z - this.pos.z); }

  // gore hook: hide a part, cap the joint with bone-dark stump, return its
  // world transform so the chunk can take over mid-air
  severPart(name) {
    const p = this.parts[name];
    if (!p || this.severed.has(name)) return null;
    this.severed.add(name);
    p.visible = false;
    if (name === 'head') { this.parts.helm.visible = false; this.severed.add('helm'); }
    const stump = new THREE.Mesh(geos().stump, new THREE.MeshLambertMaterial({ color: BONE }));
    stump.position.copy(p.position);
    if (name === 'head') stump.position.y -= 0.08;
    stump.scale.setScalar(name === 'torso' ? 1.8 : 1);
    this.g.add(stump);
    const wp = new THREE.Vector3();
    p.getWorldPosition(wp);
    return { worldPos: wp, type: this.type, faction: this.faction, part: name };
  }

  kill() {
    if (!this.alive) return;
    this.alive = false;
    this.deadT = 0;
    this.fallDir = Math.random() < 0.5 ? 1 : -1;
    this.fallAxis = Math.random() * Math.PI * 2;
  }

  update(dt) {
    const p = this.parts;
    if (!this.alive) {
      if (this.deadT < 0.6) {
        this.deadT += dt;
        const k = Math.min(1, this.deadT / 0.55);
        const e = 1 - (1 - k) * (1 - k);
        this.g.rotation.set(0, this.heading, 0);
        this.g.rotateX(this.fallDir * e * Math.PI / 2 * 0.96);
        this.g.position.y = heightAt(this.pos.x, this.pos.z) + 0.15 - e * 0.05;
      }
      return;
    }
    this.g.position.y = heightAt(this.pos.x, this.pos.z);
    this.g.rotation.set(0, this.heading, 0);

    if (this.moving) {
      this.phase += dt * 8.5;
      const s = Math.sin(this.phase) * 0.55;
      p.legL.rotation.x = s; p.legR.rotation.x = -s;
      if (!this.severed.has('armL')) p.armL.rotation.x = -s * 0.5;
    } else {
      p.legL.rotation.x *= 0.8; p.legR.rotation.x *= 0.8;
    }

    // attack: windup raises the blade, release chops through
    if (this.windup > 0) {
      this.windup -= dt;
      const k = Math.max(0, this.windup / this.windupMax);
      if (!this.severed.has('armR')) p.armR.rotation.x = -2.4 * (1 - k * 0.4);
    } else if (this.atkT > 0) {
      this.atkT -= dt;
      const k = this.atkT / 0.22;
      if (!this.severed.has('armR')) p.armR.rotation.x = -2.4 + (1 - k) * 3.4;
    } else if (!this.severed.has('armR')) {
      p.armR.rotation.x *= 0.85;
    }
  }

  beginSwing(windup = 0.42) { this.windup = this.windupMax = windup; }
  releaseSwing() { this.atkT = 0.22; }

  dispose() { this.scene.remove(this.g); }
}

// ------------------------------------------------------------------ horse --
export class Horse {
  constructor(scene, x, z) {
    const body = new THREE.MeshLambertMaterial({ color: 0x4a3423 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2e2015 });
    const g = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 1.7, 10), body);
    barrel.rotation.x = Math.PI / 2; barrel.position.y = 1.25;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.8, 8), body);
    neck.position.set(0, 1.75, 0.85); neck.rotation.x = -0.6;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.62), dark);
    head.position.set(0, 2.08, 1.25);
    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.7), dark);
    mane.position.set(0, 1.95, 0.8); mane.rotation.x = -0.5;
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.8, 6), dark);
    tail.position.set(0, 1.15, -1.0); tail.rotation.x = 0.6;
    const saddle = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.48, 0.22, 10), new THREE.MeshLambertMaterial({ color: 0x6a3a1c }));
    saddle.rotation.x = Math.PI / 2; saddle.position.y = 1.62;
    saddle.scale.z = 0.5;
    g.add(barrel, neck, head, mane, tail, saddle);
    this.legs = [];
    for (const [lx, lz] of [[-0.26, 0.6], [0.26, 0.6], [-0.26, -0.6], [0.26, -0.6]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.06, 1.1, 6), dark);
      leg.geometry === undefined;
      leg.position.set(lx, 0.72, lz);
      g.add(leg);
      this.legs.push(leg);
    }
    for (const m of g.children) m.castShadow = true;
    g.position.set(x, heightAt(x, z), z);
    scene.add(g);
    this.g = g; this.pos = g.position;
    this.heading = 0; this.speed = 0; this.phase = 0;
  }

  update(dt) {
    this.g.position.y = heightAt(this.pos.x, this.pos.z);
    this.g.rotation.set(0, this.heading, 0);
    this.phase += dt * (2 + this.speed * 1.4);
    this.legs.forEach((l, i) => {
      l.rotation.x = Math.sin(this.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? 0.6 : 0)) * Math.min(0.7, this.speed * 0.09);
    });
  }
}
