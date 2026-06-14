// horde.js — the army of the dead. A pool of live, simulated undead (instanced,
// shambling, color-varied) advancing on the wall, backed by a far impostor crowd
// that reads as a vast tide on the horizon. CPU-driven via a spatial grid; the
// update() / agent-buffer interface is shaped so a WebGPU-compute updater can be
// dropped in later without touching consumers.
import * as THREE from '../engine/three.js';
import { HORDE_CAP } from '../game/state.js';
import { WALL_Z, NORTH_Z, FIELD_HALF_X, GATE_W, WALL_T, WALL_H, heightAt } from '../world/field.js';

const NORTH_FACE = WALL_Z - WALL_T / 2;  // z of the wall's north face (where the dead pile)
const FAR_CROWD_FRONT_Z = NORTH_Z + 8;
const FAR_CROWD_BACK_Z = NORTH_Z - 92;

// hunched, reaching undead silhouette merged into a single geometry (origin at feet)
function buildUndeadGeometry() {
  const parts = [];
  const add = (w, h, d, x, y, z, rx = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    parts.push(g);
  };
  add(0.3, 1.1, 0.34, -0.2, 0.55, 0);          // leg L
  add(0.3, 1.1, 0.34, 0.2, 0.55, 0);           // leg R
  add(0.78, 0.95, 0.46, 0, 1.5, -0.15, 0.4);   // hunched torso
  add(0.42, 0.42, 0.42, 0, 2.0, -0.45);        // head (lolling forward)
  add(0.22, 0.95, 0.27, -0.5, 1.55, -0.35, 1.3); // arm L reaching
  add(0.22, 0.95, 0.27, 0.5, 1.55, -0.35, 1.3);  // arm R reaching

  // manual merge (avoids pulling a second three via the addon util)
  let vTotal = 0, iTotal = 0;
  for (const g of parts) { vTotal += g.attributes.position.count; iTotal += g.index.count; }
  const pos = new Float32Array(vTotal * 3), nor = new Float32Array(vTotal * 3), uv = new Float32Array(vTotal * 2);
  const idx = new Uint16Array(iTotal);
  let vo = 0, io = 0;
  for (const g of parts) {
    const p = g.attributes.position.array, n = g.attributes.normal.array, ix = g.index.array;
    const u = g.attributes.uv?.array;
    pos.set(p, vo * 3); nor.set(n, vo * 3);
    if (u) uv.set(u, vo * 2);
    for (let k = 0; k < ix.length; k++) idx[io + k] = ix[k] + vo;
    vo += g.attributes.position.count; io += ix.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

function silhouetteTexture() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 48;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 32, 48);
  g.fillStyle = '#111923';
  // crude hunched figure
  g.beginPath(); g.ellipse(16, 12, 5, 6, 0, 0, 7); g.fill();    // head/shoulders
  g.fillRect(10, 14, 12, 20);                                    // torso
  g.fillRect(9, 30, 5, 16); g.fillRect(18, 30, 5, 16);          // legs
  g.fillRect(4, 16, 5, 12); g.fillRect(23, 16, 5, 12);         // arms
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  return t;
}

export class Horde {
  constructor(scene, state, field) {
    this.scene = scene;
    this.state = state;
    this.field = field;
    this.cap = HORDE_CAP[state.fidelity] || 1500;
    this.agents = [];
    this._o = new THREE.Object3D();
    this._c = new THREE.Color();

    // ----- live (simulated) undead -----
    const geo = buildUndeadGeometry();
    this._geo = geo;
    const mat = new THREE.MeshStandardMaterial({
      color: 0xd6e0de,
      roughness: 0.96,
      metalness: 0,
      emissive: 0x101821,
      emissiveIntensity: 0.06,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.cap);
    this.mesh.castShadow = true;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);

    // ----- corpses: the slain remain and heap up -----
    this._corpseCap = Math.min(this.cap * 2, 7000);
    const corpseMat = new THREE.MeshStandardMaterial({ color: 0x222a2b, roughness: 1, metalness: 0 });
    this.corpses = new THREE.InstancedMesh(geo, corpseMat, this._corpseCap);
    this.corpses.castShadow = true; this.corpses.receiveShadow = true;
    this.corpses.count = 0;
    this.corpses.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    this._corpseHead = 0; this._corpseN = 0;
    scene.add(this.corpses);

    // ----- 2D heap heightmap: bodies pile wherever the dead crowd or fall -----
    this.HCELL = 4;
    this._zMin = NORTH_Z - 20; this._zMax = WALL_Z + 30;
    this.HW = Math.ceil((FIELD_HALF_X * 2) / this.HCELL) + 2;
    this.HD = Math.ceil((this._zMax - this._zMin) / this.HCELL) + 2;
    this.heap = new Float32Array(this.HW * this.HD);
    this._bury = [];

    // ----- far impostor crowd (the bulk of the tide) -----
    const imp = Math.min(this.cap * 3, 9000);
    const planeMat = new THREE.MeshBasicMaterial({
      map: silhouetteTexture(), transparent: true, alphaTest: 0.5,
      color: 0x263648, opacity: 0.42, fog: true, depthWrite: false,
    });
    this.far = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.4, 3.6), planeMat, imp);
    this.far.count = imp;
    this.far.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._farData = [];
    const fo = new THREE.Object3D();
    for (let i = 0; i < imp; i++) {
      const x = (Math.random() * 2 - 1) * (FIELD_HALF_X + 40);
      const z = FAR_CROWD_BACK_Z + Math.random() * (FAR_CROWD_FRONT_Z - FAR_CROWD_BACK_Z);
      const s = 0.62 + Math.random() * 0.5;
      this._farData.push({ x, z, spd: 0.35 + Math.random() * 0.45, ph: Math.random() * 6.28, s });
      fo.position.set(x, 1.8, z);
      fo.scale.setScalar(s);
      fo.updateMatrix();
      this.far.setMatrixAt(i, fo.matrix);
    }
    this.far.instanceMatrix.needsUpdate = true;
    scene.add(this.far);
  }

  get count() { return this.agents.length; }
  get corpseCount() { return this._corpseN; }

  _heapIdx(x, z) {
    const hx = THREE.MathUtils.clamp(Math.floor((x + FIELD_HALF_X) / this.HCELL), 0, this.HW - 1);
    const hz = THREE.MathUtils.clamp(Math.floor((z - this._zMin) / this.HCELL), 0, this.HD - 1);
    return hz * this.HW + hx;
  }
  heapAt(x, z) { return this.heap[this._heapIdx(x, z)]; }
  _addHeap(x, z, amt) { const i = this._heapIdx(x, z); this.heap[i] = Math.min(this.heap[i] + amt, WALL_H + 5); }

  // how wide a stretch of the wall the heap has overtopped (pressure indicator)
  wallCrest() {
    let c = 0;
    for (let x = -FIELD_HALF_X; x <= FIELD_HALF_X; x += this.HCELL) {
      if (this.heapAt(x, NORTH_FACE - 1) >= WALL_H - 1.2) c++;
    }
    return c;
  }

  // dead that have poured over the wall and are loose in the courtyard
  breachers() {
    let c = 0;
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      if (a.over && !a.dead && a.z > WALL_Z + 6) c++;
    }
    return c;
  }

  // reanimate a fallen body at a position (your dead turning against you)
  spawnAt(x, z) {
    if (this.agents.length >= this.cap) return;
    const a = { x, z, hp: 2, ph: Math.random() * 6.28, spd: 2.4 + Math.random() * 1.2, state: 'walk' };
    const idx = this.agents.length; this.agents.push(a);
    this._c.setHSL(0.57, 0.18, 0.25); // the risen wear a colder, bloodier hue
    this.mesh.setColorAt(idx, this._c); this.mesh.instanceColor.needsUpdate = true;
    this.mesh.count = this.agents.length;
  }

  _addCorpse(x, z, y) {
    const i = this._corpseHead;
    this._corpseHead = (this._corpseHead + 1) % this._corpseCap;
    this._corpseN = Math.min(this._corpseN + 1, this._corpseCap);
    const o = this._o;
    o.position.set(x, y + 0.12, z);
    o.rotation.set(-Math.PI / 2 + (Math.random() - 0.5) * 0.5, Math.random() * 6.28, (Math.random() - 0.5) * 0.6);
    o.scale.setScalar(1);
    o.updateMatrix();
    this.corpses.setMatrixAt(i, o.matrix);
    this.corpses.count = this._corpseN;
    this.corpses.instanceMatrix.needsUpdate = true;
  }

  // begin a stumbling death — the body falls (animated), heap grows, then it
  // bakes into the static corpse pool once it has finished toppling
  kill(idx) {
    const a = this.agents[idx];
    if (a.dead) return;
    a.dead = true; a.dieT = 0;
    a.fallY0 = a.y != null ? a.y : heightAt(a.x, a.z);
    a.fallRoll = (Math.random() - 0.5) * 1.5;
    this._addHeap(a.x, a.z, 0.06); // the falling body adds to the heap, wherever it is
  }

  spawnWave(n, zMin = NORTH_Z + 10, zMax = NORTH_Z + 50) {
    const room = this.cap - this.agents.length;
    n = Math.min(n, room);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() * 2 - 1) * (FIELD_HALF_X - 4);
      const z = zMin + Math.random() * (zMax - zMin);
      const a = { x, z, hp: 2, ph: Math.random() * 6.28, spd: 2.6 + Math.random() * 1.4, state: 'walk' };
      const idx = this.agents.length;
      this.agents.push(a);
      this._c.setHSL(0.56 + Math.random() * 0.05, 0.10 + Math.random() * 0.12, 0.24 + Math.random() * 0.10);
      this.mesh.setColorAt(idx, this._c);
    }
    this.mesh.instanceColor.needsUpdate = true;
    this.mesh.count = this.agents.length;
  }

  // swap-remove an agent and keep instance buffers compact
  removeAt(i) {
    const last = this.agents.length - 1;
    if (i !== last) {
      this.agents[i] = this.agents[last];
      this.mesh.getColorAt(last, this._c);
      this.mesh.setColorAt(i, this._c);
    }
    this.agents.pop();
    this.mesh.count = this.agents.length;
    this.mesh.instanceColor.needsUpdate = true;
  }

  nearestTo(x, z, maxD = 1e9) {
    let best = -1, bd = maxD * maxD;
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      if (a.dead) continue;
      const d = (a.x - x) ** 2 + (a.z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  update(dt) {
    const A = this.agents;
    const n = A.length;
    const o = this._o;

    // spatial grid over the LIVING — drives separation AND per-cell stack level
    const CELL = 2.6;
    const grid = new Map();
    const key = (cx, cz) => cx * 73856093 ^ cz * 19349663;
    for (let i = 0; i < n; i++) {
      const a = A[i];
      if (a.dead) continue;
      const k = key(Math.floor(a.x / CELL), Math.floor(a.z / CELL));
      let cell = grid.get(k); if (!cell) { cell = []; grid.set(k, cell); }
      a.cellLevel = cell.length;   // arrivals already in this cell -> stack height
      cell.push(i);
    }

    for (let i = 0; i < n; i++) {
      const a = A[i];

      // ---- dying: stumble and topple over, then bake into the corpse pool ----
      if (a.dead) {
        a.dieT += dt;
        const t = Math.min(a.dieT / 0.7, 1);
        const e = t * t * (3 - 2 * t);
        const groundY = heightAt(a.x, a.z) + this.heapAt(a.x, a.z);
        const y = (a.fallY0 - groundY) * (1 - e) + groundY + 0.12;
        o.position.set(a.x, y, a.z);
        o.rotation.set(-Math.PI / 2 * e, a.faceY || 0, a.fallRoll * e); // tip forward + roll
        o.scale.setScalar(a.scl || 1.1);
        o.updateMatrix();
        this.mesh.setMatrixAt(i, o.matrix);
        if (t >= 1) this._bury.push(a);
        continue;
      }

      // ---- WORLD WAR Z living pyramid: once the heap crests the wall here,
      // the dead clamber over the top and pour down into the courtyard ----
      if (!a.over && a.z >= NORTH_FACE - 1.4 && this.heapAt(a.x, a.z) >= WALL_H - 2.0) a.over = true;
      if (a.over) {
        const ddx = a.x * 0.992 - a.x, ddz = (WALL_Z + 46) - a.z;
        const dd = Math.hypot(ddx, ddz) || 1;
        a.x += (ddx / dd) * a.spd * 0.95 * dt;
        a.z += (ddz / dd) * a.spd * 0.95 * dt;
        a.ph += dt * 6;
        const y = heightAt(a.x, a.z) + Math.abs(Math.sin(a.ph)) * 0.1; // ride the rampart down
        a.y = y; a.faceY = Math.atan2(-ddx, -ddz);
        o.position.set(a.x, y, a.z);
        o.rotation.set(0.18, a.faceY, 0);
        o.scale.setScalar(a.scl || 1.1);
        o.updateMatrix();
        this.mesh.setMatrixAt(i, o.matrix);
        continue;
      }

      // advance south to the wall's north face; funnel toward the gate near it
      let tx = a.x;
      if (a.z > WALL_Z - 30) tx = a.x * 0.985;
      const tz = NORTH_FACE - 0.6;
      const dx = tx - a.x, dz = tz - a.z;
      const d = Math.hypot(dx, dz) || 1;
      const mvx = dx / d, mvz = dz / d;

      // separation (gentle — lets them pack tight enough to stack)
      let sx = 0, sz = 0;
      const cx = Math.floor(a.x / CELL), cz = Math.floor(a.z / CELL);
      for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) {
        const cell = grid.get(key(cx + gx, cz + gz));
        if (!cell) continue;
        for (const j of cell) {
          if (j === i) continue;
          const b = A[j];
          const ddx = a.x - b.x, ddz = a.z - b.z;
          const dd = ddx * ddx + ddz * ddz;
          if (dd > 0 && dd < CELL * CELL) { const inv = 1 / Math.sqrt(dd); sx += ddx * inv; sz += ddz * inv; }
        }
      }
      const pressure = this.field.buildPressure?.(a.x, a.z, dt);
      if (pressure?.damage) {
        a.hp -= pressure.damage;
        if (a.hp <= 0) { this.kill(i); continue; }
      }

      const arrived = a.z >= NORTH_FACE - 1.2;
      const spd = arrived ? 0 : a.spd * (pressure?.speedMul ?? 1);
      a.x += (mvx + sx * 0.45) * spd * dt;
      a.z += (mvz + sz * 0.45) * spd * dt;
      a.x = THREE.MathUtils.clamp(a.x, -FIELD_HALF_X, FIELD_HALF_X);

      a.ph += dt * (4 + a.spd);
      const bob = Math.abs(Math.sin(a.ph)) * 0.12;
      const sway = Math.sin(a.ph * 0.5) * 0.08;

      // GENERAL stacking: rest on the heap and clamber over whoever shares the cell
      const level = Math.min(a.cellLevel, 22);
      const base = heightAt(a.x, a.z) + this.heapAt(a.x, a.z);
      const y = base + level * 0.5 + bob * 0.5;
      a.y = y;
      a.faceY = Math.atan2(-mvx, -mvz) + sway;
      a.scl = 1.05 + (a.spd - 2.6) * 0.05;

      // a packed crowd's weight builds the heap — jams grow into pyramids
      if (arrived) this._addHeap(a.x, a.z, 0.0009 + 0.0011 * level);

      o.position.set(a.x, y, a.z);
      o.rotation.set(level > 2 ? -0.4 : 0, a.faceY, sway * 0.6); // those climbing lean in
      o.scale.setScalar(a.scl);
      o.updateMatrix();
      this.mesh.setMatrixAt(i, o.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    // bury bodies that finished falling into the static corpse pool
    if (this._bury.length) {
      for (const a of this._bury) {
        const idx = A.indexOf(a);
        if (idx >= 0) {
          this._addCorpse(a.x, a.z, heightAt(a.x, a.z) + this.heapAt(a.x, a.z));
          this.removeAt(idx);
        }
      }
      this._bury.length = 0;
    }

    // Far impostor crowd: keep it as a distant treeline mass only. If these
    // cutouts reach the playable field they read like advancing black blocks.
    const F = this._farData;
    for (let i = 0; i < F.length; i++) {
      const f = F[i];
      f.z += f.spd * dt;
      if (f.z > FAR_CROWD_FRONT_Z) {
        f.z = FAR_CROWD_BACK_Z - Math.random() * 24;
        f.x = (Math.random() * 2 - 1) * (FIELD_HALF_X + 40);
      }
      o.position.set(f.x, 1.8 + Math.sin(f.ph + performance.now() * 0.001) * 0.05, f.z);
      o.rotation.set(0, 0, 0);
      o.scale.setScalar(f.s);
      o.updateMatrix();
      this.far.setMatrixAt(i, o.matrix);
    }
    this.far.instanceMatrix.needsUpdate = true;
  }
}
