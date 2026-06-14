// horde.js — the army of the dead. A pool of live, simulated undead (instanced,
// shambling, color-varied) advancing on the wall, backed by a far impostor crowd
// that reads as a vast tide on the horizon. CPU-driven via a spatial grid; the
// update() / agent-buffer interface is shaped so a WebGPU-compute updater can be
// dropped in later without touching consumers.
import * as THREE from '../engine/three.js';
import { HORDE_CAP } from '../game/state.js';
import { WALL_Z, NORTH_Z, FIELD_HALF_X, GATE_W, WALL_T, WALL_H, heightAt, raiseMound } from '../world/field.js';

const NORTH_FACE = WALL_Z - WALL_T / 2;  // z of the wall's north face (where the dead pile)
const FAR_CROWD_FRONT_Z = NORTH_Z + 8;
const FAR_CROWD_BACK_Z = NORTH_Z - 92;

// hunched, reaching undead silhouette merged into a single geometry (origin at feet)
function buildUndeadGeometry() {
  const parts = [];
  const colors = [];
  const add = (g, x, y, z, rx = 0, ry = 0, rz = 0, color = 0x9fb5b5) => {
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    parts.push(g);
    colors.push(new THREE.Color(color));
  };

  const flesh = 0x9fb8b6, frost = 0xc7d9d8, bone = 0xb9b2a1, cloth = 0x17212b, rot = 0x391512;
  add(new THREE.CylinderGeometry(0.15, 0.2, 0.72, 7), -0.22, 0.82, 0.02, 0.1, 0, -0.08, flesh); // thigh L
  add(new THREE.CylinderGeometry(0.13, 0.17, 0.76, 7), -0.23, 0.32, -0.07, -0.12, 0, 0.1, flesh); // shin L
  add(new THREE.CylinderGeometry(0.15, 0.2, 0.72, 7), 0.23, 0.82, 0.02, -0.04, 0, 0.09, flesh);
  add(new THREE.CylinderGeometry(0.13, 0.17, 0.76, 7), 0.25, 0.32, 0.03, 0.1, 0, -0.08, flesh);
  add(new THREE.BoxGeometry(0.38, 0.1, 0.24), -0.23, 0.03, -0.23, 0, -0.18, 0, cloth);
  add(new THREE.BoxGeometry(0.38, 0.1, 0.24), 0.25, 0.03, -0.18, 0, 0.12, 0, cloth);

  add(new THREE.BoxGeometry(0.72, 0.28, 0.48), 0, 1.12, -0.02, 0.08, 0, 0, cloth); // torn waist
  add(new THREE.CylinderGeometry(0.3, 0.48, 1.0, 8).scale(1, 1, 0.76), 0, 1.56, -0.18, 0.42, 0, 0, flesh);
  add(new THREE.CylinderGeometry(0.055, 0.07, 0.92, 6), 0, 1.59, 0.16, 0.38, 0, 0, bone); // spine ridge
  for (let r = 0; r < 4; r++) {
    add(new THREE.BoxGeometry(0.72 - r * 0.08, 0.035, 0.045), 0, 1.78 - r * 0.13, -0.54 + r * 0.02, 0.42, 0, 0, bone);
  }
  add(new THREE.CylinderGeometry(0.045, 0.055, 0.96, 6), 0, 1.96, -0.22, 0, 0, Math.PI / 2, bone); // collarbone

  add(new THREE.SphereGeometry(0.29, 10, 7).scale(0.84, 1.08, 0.78), 0, 2.08, -0.48, -0.08, 0, 0, frost);
  add(new THREE.BoxGeometry(0.3, 0.13, 0.18), 0, 1.84, -0.6, -0.08, 0, 0, bone); // hanging jaw
  add(new THREE.SphereGeometry(0.035, 6, 4), -0.085, 2.1, -0.71, 0, 0, 0, 0x8fe5ff);
  add(new THREE.SphereGeometry(0.035, 6, 4), 0.085, 2.1, -0.71, 0, 0, 0, 0x8fe5ff);

  add(new THREE.CylinderGeometry(0.11, 0.15, 0.68, 7), -0.5, 1.7, -0.3, 1.05, 0, 0.44, flesh);
  add(new THREE.CylinderGeometry(0.085, 0.12, 0.72, 7), -0.62, 1.3, -0.68, 1.42, 0, 0.18, flesh);
  add(new THREE.CylinderGeometry(0.11, 0.15, 0.68, 7), 0.5, 1.7, -0.3, 1.05, 0, -0.44, flesh);
  add(new THREE.CylinderGeometry(0.085, 0.12, 0.72, 7), 0.62, 1.3, -0.68, 1.42, 0, -0.18, flesh);
  for (const side of [-1, 1]) for (let f = 0; f < 3; f++) {
    add(new THREE.ConeGeometry(0.025, 0.22, 5), side * (0.58 + f * 0.055), 0.96, -0.96 - f * 0.02, Math.PI / 2, 0, side * 0.18, bone);
  }

  for (const [x, z, a, len] of [[-0.25, -0.52, -0.16, 0.66], [0.04, -0.56, 0.04, 0.72], [0.28, -0.46, 0.18, 0.58]]) {
    add(new THREE.PlaneGeometry(0.18, len), x, 1.2, z, 0.22, 0, a, cloth);
  }
  add(new THREE.BoxGeometry(0.16, 0.11, 0.05), -0.3, 1.47, -0.58, 0.42, 0, 0, rot);
  add(new THREE.BoxGeometry(0.13, 0.1, 0.05), 0.34, 1.62, -0.56, 0.42, 0, 0, rot);

  // manual merge (avoids pulling a second three via the addon util)
  let vTotal = 0, iTotal = 0;
  for (const g of parts) { vTotal += g.attributes.position.count; iTotal += g.index.count; }
  const pos = new Float32Array(vTotal * 3), nor = new Float32Array(vTotal * 3), uv = new Float32Array(vTotal * 2), col = new Float32Array(vTotal * 3);
  const idx = new Uint16Array(iTotal);
  let vo = 0, io = 0;
  for (let gi = 0; gi < parts.length; gi++) {
    const g = parts[gi];
    const p = g.attributes.position.array, n = g.attributes.normal.array, ix = g.index.array;
    const u = g.attributes.uv?.array;
    pos.set(p, vo * 3); nor.set(n, vo * 3);
    if (u) uv.set(u, vo * 2);
    const c = colors[gi];
    for (let v = 0; v < g.attributes.position.count; v++) col.set([c.r, c.g, c.b], (vo + v) * 3);
    for (let k = 0; k < ix.length; k++) idx[io + k] = ix[k] + vo;
    vo += g.attributes.position.count; io += ix.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

function undeadSkinTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  let seed = 331;
  const rr = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const base = g.createLinearGradient(0, 0, 512, 512);
  base.addColorStop(0, '#9eb8b7');
  base.addColorStop(0.45, '#687d80');
  base.addColorStop(1, '#1c2930');
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const v = 95 + rr() * 80, a = 0.05 + rr() * 0.14;
    g.fillStyle = `rgba(${v},${v + 12},${v + 15},${a})`;
    g.fillRect((rr() * 512) | 0, (rr() * 512) | 0, 1 + (rr() * 2) | 0, 1 + (rr() * 2) | 0);
  }
  for (let i = 0; i < 42; i++) {
    const x = rr() * 512, y = rr() * 512, len = 38 + rr() * 95;
    g.strokeStyle = `rgba(${35 + rr() * 25},${75 + rr() * 45},${90 + rr() * 55},${0.22 + rr() * 0.24})`;
    g.lineWidth = 1 + rr() * 2.2;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 4; s++) g.quadraticCurveTo(x + (rr() - 0.5) * len, y + (rr() - 0.5) * len, x + (rr() - 0.5) * len, y + (rr() - 0.5) * len);
    g.stroke();
  }
  for (let i = 0; i < 28; i++) {
    const x = rr() * 512, y = rr() * 512, r = 9 + rr() * 32;
    const grad = g.createRadialGradient(x, y, 1, x, y, r);
    grad.addColorStop(0, 'rgba(83,12,14,.55)');
    grad.addColorStop(1, 'rgba(83,12,14,0)');
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 34; i++) {
    g.strokeStyle = `rgba(220,238,255,${0.25 + rr() * 0.35})`;
    g.lineWidth = 1 + rr() * 1.6;
    const y = rr() * 512;
    g.beginPath(); g.moveTo(rr() * 512, y); g.lineTo(rr() * 512, y + (rr() - 0.5) * 36); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function silhouetteTexture() {
  const c = document.createElement('canvas'); c.width = 96; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 96, 128);
  g.shadowColor = 'rgba(70,110,140,.32)';
  g.shadowBlur = 7;
  g.fillStyle = 'rgba(13,20,30,0.84)';
  g.beginPath();
  g.ellipse(48, 25, 9, 11, -0.2, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(34, 41);
  g.quadraticCurveTo(46, 29, 63, 40);
  g.lineTo(68, 88);
  g.quadraticCurveTo(51, 95, 30, 86);
  g.closePath();
  g.fill();
  for (const [x0, x1, foot] of [[41, 32, 27], [55, 64, 70]]) {
    g.beginPath();
    g.moveTo(x0, 84);
    g.lineTo(x1, 124);
    g.lineTo(foot, 126);
    g.lineTo(x0 - 3, 89);
    g.closePath();
    g.fill();
  }
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(48 + side * 14, 46);
    g.lineTo(48 + side * 37, 76);
    g.lineTo(48 + side * 31, 83);
    g.lineTo(48 + side * 9, 55);
    g.closePath();
    g.fill();
  }
  g.shadowBlur = 0;
  g.globalAlpha = 0.5;
  g.strokeStyle = '#4f6f83';
  g.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    g.beginPath(); g.moveTo(38 + i * 4, 44 + i * 7); g.lineTo(28 + i * 8, 52 + i * 5); g.stroke();
  }
  g.globalAlpha = 0.35;
  g.fillStyle = '#7fdfff';
  g.fillRect(43, 24, 3, 2); g.fillRect(51, 24, 3, 2);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
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
    const undeadTex = undeadSkinTexture();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xdce9e8,
      map: undeadTex,
      bumpMap: undeadTex,
      bumpScale: 0.055,
      vertexColors: true,
      roughness: 0.96,
      metalness: 0,
      emissive: 0x122333,
      emissiveIntensity: 0.1,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.cap);
    this.mesh.castShadow = true;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false; // instances span the field; origin-based culling would hide them
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);

    // ----- corpses: the slain remain and heap up -----
    this._corpseCap = Math.min(this.cap * 2, 7000);
    const corpseMat = new THREE.MeshStandardMaterial({
      color: 0x667073,
      map: undeadTex,
      bumpMap: undeadTex,
      bumpScale: 0.04,
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.corpses = new THREE.InstancedMesh(geo, corpseMat, this._corpseCap);
    this.corpses.castShadow = true; this.corpses.receiveShadow = true;
    this.corpses.count = 0;
    this.corpses.frustumCulled = false; // the corpse-hill must render from every angle
    this.corpses.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    this._corpseHead = 0; this._corpseN = 0;
    scene.add(this.corpses);

    // ----- 2D heap heightmap: bodies pile wherever the dead crowd or fall -----
    this.HCELL = 4;
    this._zMin = NORTH_Z - 20; this._zMax = WALL_Z + 30;
    this.HW = Math.ceil((FIELD_HALF_X * 2) / this.HCELL) + 2;
    this.HD = Math.ceil((this._zMax - this._zMin) / this.HCELL) + 2;
    this.heap = new Float32Array(this.HW * this.HD);
    this.cm = new Float32Array(this.HW * this.HD); // corpse-mound height (the Leichenberg)
    this._bury = [];

    // ----- far impostor crowd (the bulk of the tide) -----
    const imp = Math.min(this.cap * 3, 9000);
    const planeMat = new THREE.MeshBasicMaterial({
      map: silhouetteTexture(), transparent: true, alphaTest: 0.18,
      color: 0x34445a, opacity: 0.32, fog: true, depthWrite: false,
    });
    this.far = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.55, 3.35), planeMat, imp);
    this.far.count = imp;
    this.far.frustumCulled = false;
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
  get runnerCount() { return this.agents.reduce((n, a) => n + (!a.dead && a.runner ? 1 : 0), 0); }

  _heapIdx(x, z) {
    const hx = THREE.MathUtils.clamp(Math.floor((x + FIELD_HALF_X) / this.HCELL), 0, this.HW - 1);
    const hz = THREE.MathUtils.clamp(Math.floor((z - this._zMin) / this.HCELL), 0, this.HD - 1);
    return hz * this.HW + hx;
  }
  heapAt(x, z) { return this.heap[this._heapIdx(x, z)]; }
  _addHeap(x, z, amt) { const i = this._heapIdx(x, z); this.heap[i] = Math.min(this.heap[i] + amt, WALL_H + 2); }
  cmoundAt(x, z) { return this.cm[this._heapIdx(x, z)]; }
  _addCMound(x, z, amt) {
    const C = this.HCELL;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const w = 1 - Math.hypot(dx, dz) * 0.42;
      if (w > 0) { const i = this._heapIdx(x + dx * C, z + dz * C); this.cm[i] = Math.min(this.cm[i] + amt * w, 11); }
    }
  }
  // raise a rounded mound so the slain pile into real heaps (UEBS-style)
  _mound(x, z, amt) {
    const r = 2, C = this.HCELL;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const w = 1 - Math.hypot(dx, dz) / (r + 0.6);
      if (w > 0) this._addHeap(x + dx * C, z + dz * C, amt * w);
    }
  }

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
    const a = {
      x, z, hp: 2, ph: Math.random() * 6.28, spd: 2.4 + Math.random() * 1.2, state: 'walk',
      sx: 0.88 + Math.random() * 0.22, sy: 0.92 + Math.random() * 0.18, sz: 0.86 + Math.random() * 0.22,
    };
    const idx = this.agents.length; this.agents.push(a);
    this._c.setHSL(0.56 + Math.random() * 0.05, 0.15, 0.34 + Math.random() * 0.12); // the risen wear a colder, bloodier hue
    this.mesh.setColorAt(idx, this._c); this.mesh.instanceColor.needsUpdate = true;
    this.mesh.count = this.agents.length;
  }

  _addCorpse(x, z) {
    // each death first raises the solid earth mound, then the body lies ON it — so
    // the hill is a continuous surface (no see-through holes), bodies just clad it
    raiseMound(x, z, 0.055);
    const y = heightAt(x, z);
    const i = this._corpseHead;
    this._corpseHead = (this._corpseHead + 1) % this._corpseCap;
    this._corpseN = Math.min(this._corpseN + 1, this._corpseCap);
    const o = this._o;
    // tight jitter + overscaled bodies so they overlap and cover the ground densely
    o.position.set(x + (Math.random() - 0.5) * 0.9, y + 0.32, z + (Math.random() - 0.5) * 0.9);
    // jumbled, tangled bodies — lie at all angles, not flat tiles
    o.rotation.set(-Math.PI / 2 + (Math.random() - 0.5) * 1.6, Math.random() * 6.28, (Math.random() - 0.5) * 1.6);
    const cs = 1.12 + Math.random() * 0.34;
    o.scale.set(cs * (0.88 + Math.random() * 0.25), cs * (0.82 + Math.random() * 0.28), cs * (0.9 + Math.random() * 0.22));
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
    this._mound(a.x, a.z, 0.05); // bodies build the heap gradually (not instant mounds)
  }

  spawnWave(n, zMin = NORTH_Z + 10, zMax = NORTH_Z + 50, giantChance = 0.035, runnerChance = 0.12) {
    const room = this.cap - this.agents.length;
    n = Math.min(n, room);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() * 2 - 1) * (FIELD_HALF_X - 4);
      const z = zMin + Math.random() * (zMax - zMin);
      const giant = Math.random() < giantChance;
      const runner = !giant && Math.random() < runnerChance;
      const a = giant
        ? { x, z, giant: true, hp: 34, ph: Math.random() * 6.28, spd: 1.5 + Math.random() * 0.5, state: 'walk', sx: 1.05 + Math.random() * 0.12, sy: 1.12 + Math.random() * 0.16, sz: 1.02 + Math.random() * 0.14 }
        : runner
          ? { x, z, runner: true, hp: 3, ph: Math.random() * 6.28, spd: 6.2 + Math.random() * 1.8, state: 'run', sx: 0.66 + Math.random() * 0.16, sy: 1.06 + Math.random() * 0.22, sz: 0.68 + Math.random() * 0.18 }
        : { x, z, hp: 4, ph: Math.random() * 6.28, spd: 2.5 + Math.random() * 1.4, state: 'walk', sx: 0.82 + Math.random() * 0.34, sy: 0.92 + Math.random() * 0.28, sz: 0.82 + Math.random() * 0.3 }; // tougher rank-and-file
      const idx = this.agents.length;
      this.agents.push(a);
      if (giant) this._c.setHSL(0.01, 0.5, 0.12 + Math.random() * 0.04);            // huge, dark, blood-touched
      else if (runner) this._c.setHSL(0.58 + Math.random() * 0.04, 0.2 + Math.random() * 0.18, 0.5 + Math.random() * 0.12);
      else this._c.setHSL(0.52 + Math.random() * 0.08, 0.12 + Math.random() * 0.18, 0.36 + Math.random() * 0.16);
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

  update(dt, camera) {
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
        const ds = a.scl || 1.1;
        o.scale.set(ds * (a.sx || 1), ds * (a.sy || 1), ds * (a.sz || 1));
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
        const os = a.scl || 1.1;
        o.scale.set(os * (a.sx || 1), os * (a.sy || 1), os * (a.sz || 1));
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

      a.ph += dt * (a.runner ? 13 + a.spd * 0.55 : 4 + a.spd);
      const bob = Math.abs(Math.sin(a.ph)) * (a.runner ? 0.22 : 0.12);
      const sway = Math.sin(a.ph * (a.runner ? 0.72 : 0.5)) * (a.runner ? 0.18 : 0.08);

      // GENERAL stacking: rest on the heap and clamber over whoever shares the cell
      const level = Math.min(a.cellLevel, 11);   // gentler pile, not a spiky tower
      const base = heightAt(a.x, a.z) + this.heapAt(a.x, a.z); // heightAt already includes the raised corpse hill
      const y = base + level * 0.5 + bob * 0.5;
      a.y = y;
      a.faceY = Math.atan2(-mvx, -mvz) + sway;
      a.scl = a.giant ? 2.8 : a.runner ? 1.0 + (a.spd - 6.2) * 0.035 : 1.05 + (a.spd - 2.6) * 0.05; // giants tower over the tide

      // a packed crowd's weight builds the heap — jams grow into pyramids
      if (arrived) this._addHeap(a.x, a.z, 0.0004 + 0.0005 * level);

      o.position.set(a.x, y, a.z);
      o.rotation.set(a.runner ? -0.5 : level > 2 ? -0.4 : 0, a.faceY, sway * 0.6); // runners lunge; climbers lean in
      o.scale.set(a.scl * (a.sx || 1), a.scl * (a.sy || 1), a.scl * (a.sz || 1));
      o.updateMatrix();
      this.mesh.setMatrixAt(i, o.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    // bury bodies that finished falling into the static corpse pool
    if (this._bury.length) {
      for (const a of this._bury) {
        const idx = A.indexOf(a);
        if (idx >= 0) {
          this._addCorpse(a.x, a.z);
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
      o.rotation.set(0, camera ? Math.atan2(camera.position.x - f.x, camera.position.z - f.z) : 0, 0); // billboard to camera
      o.scale.setScalar(f.s);
      o.updateMatrix();
      this.far.setMatrixAt(i, o.matrix);
    }
    this.far.instanceMatrix.needsUpdate = true;
  }
}
