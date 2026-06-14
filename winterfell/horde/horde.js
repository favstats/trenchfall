// horde.js — the army of the dead. A pool of live, simulated undead (instanced,
// shambling, color-varied) advancing on the wall, backed by a far impostor crowd
// that reads as a vast tide on the horizon. CPU-driven via a spatial grid; the
// update() / agent-buffer interface is shaped so a WebGPU-compute updater can be
// dropped in later without touching consumers.
import * as THREE from '../engine/three.js';
import { HORDE_CAP } from '../game/state.js';
import { WALL_Z, NORTH_Z, FIELD_HALF_X, GATE_W, WALL_T, WALL_H, heightAt } from '../world/field.js';

const NORTH_FACE = WALL_Z - WALL_T / 2;  // z of the wall's north face (where the dead pile)

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
  g.fillStyle = '#0c0f0c';
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
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.cap);
    this.mesh.castShadow = true;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);

    // ----- corpses: the slain remain and heap up -----
    this._corpseCap = Math.min(this.cap * 2, 7000);
    const corpseMat = new THREE.MeshStandardMaterial({ color: 0x14160f, roughness: 1, metalness: 0 });
    this.corpses = new THREE.InstancedMesh(geo, corpseMat, this._corpseCap);
    this.corpses.castShadow = true; this.corpses.receiveShadow = true;
    this.corpses.count = 0;
    this.corpses.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    this._corpseHead = 0; this._corpseN = 0;
    scene.add(this.corpses);

    // ----- stacking heightmap along the wall (bodies pile against it) -----
    this.BUCKET = 3;
    this.PB = Math.ceil((FIELD_HALF_X * 2) / this.BUCKET) + 2;
    this.pile = new Float32Array(this.PB);

    // ----- far impostor crowd (the bulk of the tide) -----
    const imp = Math.min(this.cap * 3, 9000);
    const planeMat = new THREE.MeshBasicMaterial({
      map: silhouetteTexture(), transparent: true, alphaTest: 0.5,
      color: 0x10140f, fog: true, depthWrite: false,
    });
    this.far = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.4, 3.6), planeMat, imp);
    this.far.count = imp;
    this.far.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._farData = [];
    const fo = new THREE.Object3D();
    for (let i = 0; i < imp; i++) {
      const x = (Math.random() * 2 - 1) * (FIELD_HALF_X + 40);
      const z = NORTH_Z + 30 - Math.random() * 90; // band at/behind the treeline
      this._farData.push({ x, z, spd: 1.2 + Math.random() * 1.0, ph: Math.random() * 6.28 });
      fo.position.set(x, 1.8, z); fo.updateMatrix();
      this.far.setMatrixAt(i, fo.matrix);
    }
    this.far.instanceMatrix.needsUpdate = true;
    scene.add(this.far);
  }

  get count() { return this.agents.length; }
  get corpseCount() { return this._corpseN; }

  _bucket(x) { return THREE.MathUtils.clamp(Math.floor((x + FIELD_HALF_X) / this.BUCKET), 0, this.PB - 1); }
  pileAt(x) { return this.pile[this._bucket(x)]; }
  _addPile(x, amt) {
    const b = this._bucket(x);
    this.pile[b] = Math.min(this.pile[b] + amt, WALL_H + 4);
    if (b > 0) this.pile[b - 1] = Math.min(this.pile[b - 1] + amt * 0.45, WALL_H + 4);
    if (b < this.PB - 1) this.pile[b + 1] = Math.min(this.pile[b + 1] + amt * 0.45, WALL_H + 4);
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

  // a kill: leave a body, grow the heap if near the wall, then free the agent slot
  kill(idx) {
    const a = this.agents[idx];
    this._addCorpse(a.x, a.z, heightAt(a.x, a.z));
    if (a.z > NORTH_FACE - 16) this._addPile(a.x, 0.07);
    this.removeAt(idx);
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
      this._c.setHSL(0.28, 0.12 + Math.random() * 0.12, 0.06 + Math.random() * 0.07);
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
      const d = (a.x - x) ** 2 + (a.z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  update(dt) {
    const A = this.agents, n = A.length;
    const o = this._o;

    // spatial grid for separation
    const CELL = 2.6;
    const grid = new Map();
    const key = (cx, cz) => cx * 73856093 ^ cz * 19349663;
    for (let i = 0; i < n; i++) {
      const a = A[i];
      const k = key(Math.floor(a.x / CELL), Math.floor(a.z / CELL));
      (grid.get(k) || grid.set(k, []).get(k)).push(i);
    }

    const used = new Int16Array(this.PB); // per-bucket stack counter (the living pile)
    for (let i = 0; i < n; i++) {
      const a = A[i];
      // advance south to the wall's north face; funnel toward the gate near it
      let tx = a.x;
      if (a.z > WALL_Z - 30) tx = a.x * 0.985;
      const tz = NORTH_FACE - 0.6;
      let dx = tx - a.x, dz = tz - a.z;
      const d = Math.hypot(dx, dz) || 1;
      let mvx = (dx / d), mvz = (dz / d);

      // separation
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
      const arrived = a.z >= NORTH_FACE - 1.2;
      const spd = arrived ? 0 : a.spd;
      a.x += (mvx * 1.0 + sx * 0.5) * spd * dt;
      a.z += (mvz * 1.0 + sz * 0.5) * spd * dt;
      a.x = THREE.MathUtils.clamp(a.x, -FIELD_HALF_X, FIELD_HALF_X);

      // shamble pose: bob + sway + face travel direction
      a.ph += dt * (4 + a.spd);
      const bob = Math.abs(Math.sin(a.ph)) * 0.12;
      const sway = Math.sin(a.ph * 0.5) * 0.08;

      let y = heightAt(a.x, a.z) + bob;
      if (arrived) {
        // clamber up the corpse-heap and over those already pressed to the wall
        const b = this._bucket(a.x);
        const level = used[b]++;
        y = heightAt(a.x, a.z) + this.pile[b] + Math.min(level, 18) * 0.55 + bob * 0.5;
      }
      o.position.set(a.x, y, a.z);
      o.rotation.set(arrived ? -0.5 : 0, Math.atan2(-mvx, -mvz) + sway, sway * 0.6);
      o.scale.setScalar(1.05 + (a.spd - 2.6) * 0.05);
      o.updateMatrix();
      this.mesh.setMatrixAt(i, o.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    // far impostor crowd: slow advance, recycle north (cheap, no per-frame billboard)
    const F = this._farData;
    for (let i = 0; i < F.length; i++) {
      const f = F[i];
      f.z += f.spd * dt;
      if (f.z > WALL_Z - 20) { f.z = NORTH_Z - 40 - Math.random() * 30; f.x = (Math.random() * 2 - 1) * (FIELD_HALF_X + 40); }
      o.position.set(f.x, 1.8 + Math.sin(f.ph + performance.now() * 0.001) * 0.05, f.z);
      o.rotation.set(0, 0, 0);
      o.scale.set(1, 1, 1);
      o.updateMatrix();
      this.far.setMatrixAt(i, o.matrix);
    }
    this.far.instanceMatrix.needsUpdate = true;
  }
}
