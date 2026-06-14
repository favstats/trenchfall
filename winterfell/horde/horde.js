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

// ---- procedural-noise helpers, ported from trenchfall src/main.js (self-contained) ----
const TAU = Math.PI * 2;
const HSALT = 0;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
function hash(ix, iz) { let n = ix * 374761393 + iz * 668265263 + HSALT | 0; n = (n ^ (n >> 13)) * 1274126177; return ((n ^ (n >> 16)) >>> 0) / 4294967295; }
function smoothNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash(ix, iz), hash(ix + 1, iz), sx), lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), sx), sz);
}
function fbm2(x, y, oct = 4) {
  let v = 0, a = .5, fx = x, fy = y;
  for (let o = 0; o < oct; o++) { v += a * smoothNoise(fx, fy); fx = fx * 2.07 + 13.1; fy = fy * 2.07 + 7.7; a *= .5; }
  return v;
}

// the flesh has shrunk onto the bone: no clean tubes anywhere
function witherGeo(geo, amt) {
  const p = geo.attributes.position, nr = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const k = (hash(Math.round(p.getX(i) * 913 + p.getY(i) * 389), Math.round(p.getZ(i) * 571)) - .5) * amt;
    p.setXYZ(i, p.getX(i) + nr.getX(i) * k, p.getY(i) + nr.getY(i) * k, p.getZ(i) + nr.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

// merge raw geometries with no color baking (for sub-assemblies like the skull/hand)
function mergeRaw(geos) {
  let vTotal = 0, iTotal = 0;
  for (const g of geos) { vTotal += g.attributes.position.count; iTotal += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(vTotal * 3), nor = new Float32Array(vTotal * 3), uv = new Float32Array(vTotal * 2);
  const idx = new Uint16Array(iTotal);
  let vo = 0, io = 0;
  for (const g of geos) {
    const p = g.attributes.position.array, n = g.attributes.normal.array, u = g.attributes.uv?.array;
    pos.set(p, vo * 3); nor.set(n, vo * 3); if (u) uv.set(u, vo * 2);
    const cnt = g.attributes.position.count;
    if (g.index) { const ix = g.index.array; for (let k = 0; k < ix.length; k++) idx[io + k] = ix[k] + vo; io += ix.length; }
    else { for (let k = 0; k < cnt; k++) idx[io + k] = k + vo; io += cnt; }
    vo += cnt;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

// merge {geo,tint,shade} parts, baking per-vertex color = shade(pos)*tint (cloth vs
// flesh distinction lives in the tint, so one material/texture serves the whole body)
function mergeParts(parts) {
  let vTotal = 0, iTotal = 0;
  for (const part of parts) { vTotal += part.geo.attributes.position.count; iTotal += part.geo.index ? part.geo.index.count : part.geo.attributes.position.count; }
  const pos = new Float32Array(vTotal * 3), nor = new Float32Array(vTotal * 3), uv = new Float32Array(vTotal * 2), col = new Float32Array(vTotal * 3);
  const idx = new Uint16Array(iTotal);
  let vo = 0, io = 0;
  for (const part of parts) {
    const g = part.geo, px = g.attributes.position;
    const p = px.array, n = g.attributes.normal.array, u = g.attributes.uv?.array;
    pos.set(p, vo * 3); nor.set(n, vo * 3); if (u) uv.set(u, vo * 2);
    const tint = part.tint, shade = part.shade;
    for (let v = 0; v < px.count; v++) {
      const s = shade(px.getX(v), px.getY(v), px.getZ(v));
      col[(vo + v) * 3] = s * tint.r; col[(vo + v) * 3 + 1] = s * tint.g; col[(vo + v) * 3 + 2] = s * tint.b;
    }
    if (g.index) { const ix = g.index.array; for (let k = 0; k < ix.length; k++) idx[io + k] = ix[k] + vo; io += ix.length; }
    else { for (let k = 0; k < px.count; k++) idx[io + k] = k + vo; io += px.count; }
    vo += px.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

// trenchfall's necrotic shambler baked into ONE static merged geometry: lathed gaunt
// torso (hunched), lolling skull, two arms reaching forward, mid-stride legs, agape jaw.
// origin at the feet, faces -z (toward the wall), ~2 units tall to match the old scale.
function buildUndeadGeometry() {
  const parts = [];   // each: { geo, tint:Color, shade:fn }
  const flesh = new THREE.Color(0xb6c4c2);    // cold dead skin (instance tint multiplies this)
  const coat = new THREE.Color(0x515c66);     // rotted field coat — baked darker into the body
  const push = (geo, tint, shade) => { parts.push({ geo, tint, shade: shade || (() => 1) }); };
  const blob = (r, sx, sy, sz) => { const g = new THREE.SphereGeometry(r, 7, 5); g.scale(sx, sy, sz); return g; };
  const limb = (rTop, rBot, len) => { const g = new THREE.CylinderGeometry(rTop, rBot, len, 5); g.rotateX(Math.PI / 2); g.translate(0, 0, len / 2); return g; };

  // ---- torso: a lathed gaunt profile, hunched forward over the legs ----
  {
    const pts = [[.075, 1.56], [.15, 1.5], [.255, 1.44], [.265, 1.35], [.235, 1.2], [.2, 1.03], [.215, .9], [.225, .82], [.195, .7], [.1, .62], [.01, .6]]
      .map(p => new THREE.Vector2(p[0], p[1]));
    const torso = new THREE.LatheGeometry(pts, 9);
    torso.scale(1.04, 1, .68);          // oval chest, not a column
    torso.rotateX(0.16);                 // hunch the trunk forward
    torso.translate(0, 0.04, -0.05);
    witherGeo(torso, .02);
    push(torso, coat, (x, y) => clamp(.6 + (y - .6) * .42, .55, 1)); // hem dragged through mud
  }
  { const d = blob(.07, 1, 1.05, .9); d.translate(-.26, 1.33, .12); push(d, coat, () => .85); } // deltoid L
  { const d = blob(.07, 1, 1.05, .9); d.translate(.26, 1.33, .12); push(d, coat, () => .85); }  // deltoid R

  // ---- skull: gaunt cranium, brow, cheekbones, nose, neck; lolling forward ----
  {
    const h = [];
    h.push(blob(.17, .94, 1.2, 1.04));                              // cranium
    { const b = blob(.05, 1.9, .45, .7); b.translate(0, .05, .07); h.push(b); }    // brow ridge
    { const c = blob(.035, 1.1, .6, .8); c.translate(-.1, -.06, .07); h.push(c); } // cheek L
    { const c = blob(.035, 1.1, .6, .8); c.translate(.1, -.06, .07); h.push(c); }  // cheek R
    { const nz = blob(.022, .7, 1.2, .9); nz.translate(0, -.03, .16); h.push(nz); }// nose
    { const nk = new THREE.CylinderGeometry(.07, .095, .22, 6); nk.translate(0, -.18, -.02); h.push(nk); }
    const skull = mergeRaw(h);
    skull.scale(.92, .92, .92);
    skull.rotateX(0.4);                  // lolls forward off the bent neck
    skull.translate(0, 1.62, -0.02);
    witherGeo(skull, .015);
    push(skull, flesh, (x, y) => clamp(.95 + (y - 1.5) * .3, .8, 1.04)); // dark at jaw, pale at crown
  }
  // ---- agape jaw ----
  {
    const j = new THREE.SphereGeometry(.085, 7, 4); j.scale(1, .55, 1.2); j.rotateX(.85);
    j.scale(.92, .92, .92); j.translate(0, 1.49, .13);
    push(j, flesh, () => .72);
  }

  // ---- arms: reaching/grasping forward, with a crude claw hand ----
  for (const side of [-1, 1]) {
    const up = limb(.06, .052, .3);     // shoulder->elbow, swung down & forward
    up.rotateX(-1.15); up.rotateZ(side * .2);
    up.translate(side * .26, 1.36, .06);
    witherGeo(up, .016);
    push(up, flesh, (x, y, z) => clamp(.9 - z * .25, .55, 1));

    const lo = limb(.05, .04, .28);     // elbow->wrist
    lo.rotateX(-1.5);
    lo.translate(side * .28, 1.04, .42);
    witherGeo(lo, .013);
    push(lo, flesh, (x, y, z) => clamp(.92 - z * .4, .55, 1));

    const hand = [];                     // flat mitt + splayed fingers + thumb
    { const m = new THREE.SphereGeometry(.05, 6, 4); m.scale(1, .55, 1.45); hand.push(m); }
    for (let f = -1; f < 2; f++) { const fg = new THREE.CylinderGeometry(.014, .009, .15, 4); fg.rotateX(Math.PI / 2 - .35); fg.translate(f * .034, -.04, .12); hand.push(fg); }
    { const th = new THREE.CylinderGeometry(.013, .01, .09, 4); th.rotateX(Math.PI / 2 - .7); th.rotateY(side * .7); th.translate(side * .05, -.02, .04); hand.push(th); }
    const claw = mergeRaw(hand);
    claw.rotateX(-1.5);
    claw.translate(side * .28, .82, .72);
    push(claw, flesh, () => .72);        // grave dirt on the hands
  }

  // ---- legs: mid-stride stance, one forward one trailing ----
  for (const [side, stride] of [[-1, .18], [1, -.18]]) {
    const thigh = new THREE.CylinderGeometry(.082, .064, .44, 6);
    thigh.rotateX(stride * 1.1);
    thigh.translate(side * .14, .82, stride * .9);
    witherGeo(thigh, .018);
    push(thigh, coat, (x, y) => clamp(1 + (y - .8) * .4, .6, 1.05));

    const shin = new THREE.CylinderGeometry(.054, .046, .42, 6);
    shin.rotateX(-stride * .6);
    shin.translate(side * .14 + stride * .06, .38, stride * 1.7);
    witherGeo(shin, .018);
    push(shin, flesh, (x, y) => clamp(.8 + y * .9, .42, .9)); // mud to the knee

    const foot = new THREE.SphereGeometry(.07, 6, 4); foot.scale(.9, .5, 1.65);
    foot.translate(side * .14 + stride * .06, .05, stride * 1.7 + .1);
    push(foot, flesh, () => .5);
  }

  const geo = mergeParts(parts);
  geo.scale(1.06, 1.06, 1.06);          // ~1.85 -> ~2.0 tall, matching the old silhouette's scale
  return geo;
}

// mottled necrotic skin, ported from trenchfall's fleshTex — the geometry stays smooth,
// the skin carries the rot: vein web, bruising, gangrene, raw meat, weeping lesions
function undeadSkinTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'), img = g.createImageData(512, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const i = (y * 512 + x) * 4;
    const X = x * .5, Y = y * .5;                          // feature scale at double res
    let v = 205 + fbm2(X * .045, Y * .045, 4) * 70 - 35;
    const vein = Math.abs(fbm2(X * .025 + 60, Y * .025 + 19, 3) - .5);
    v -= Math.pow(Math.max(0, 1 - vein * 7), 2) * 55;      // dark vein web
    v += (hash(x * 7, y * 5) - .5) * 16;                   // pore-fine grain
    v -= Math.max(0, Math.sin(Y * 1.1 + fbm2(X * .03, Y * .012, 2) * 7) - .62) * 26; // sinew striations
    let r = v, gn = v * .96, b = v * .9;
    const br = fbm2(X * .02 + 140, Y * .02 + 77, 3);
    if (br > .6) { const k = Math.min(1, (br - .6) * 2.6); r -= k * 40; gn -= k * 14; b += k * 6; }  // livid bruising
    if (br < .4) { const k = Math.min(1, (.4 - br) * 2.6); r -= k * 30; gn += k * 2; b -= k * 22; }  // gangrene
    const raw = fbm2(X * .06 + 31, Y * .06 + 200, 3);
    if (raw > .7) { const k = Math.min(1, (raw - .7) * 3.4); r += k * 26; gn -= k * 34; b -= k * 38; } // raw meat
    if (hash(x * 11, y * 17) < .014) { r *= .34; gn *= .18; b *= .16; }  // weeping lesions
    img.data[i] = r; img.data[i + 1] = gn; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
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
      color: 0xf4f6f5,              // near-white: baked vertex colors + instance tints carry the hue
      map: undeadTex,
      bumpMap: undeadTex,
      bumpScale: 0.45,
      vertexColors: true,
      roughness: 1.05,
      metalness: 0,
      emissive: 0x122333,
      emissiveIntensity: 0.1,
      side: THREE.FrontSide,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.cap);
    this.mesh.castShadow = false; // up to 9000 instanced shadow-casters was the #1 perf sink
    this.mesh.count = 0;
    this.mesh.frustumCulled = false; // instances span the field; origin-based culling would hide them
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);

    // ----- corpses: the slain remain and heap up -----
    this._corpseCap = Math.min(Math.ceil(this.cap * 1.4), 3600); // static, but still drawn every frame
    const corpseMat = new THREE.MeshStandardMaterial({
      color: 0x8a9296,             // greyer/colder than the living, baked colors still read
      map: undeadTex,
      bumpMap: undeadTex,
      bumpScale: 0.35,
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      side: THREE.FrontSide,
    });
    this.corpses = new THREE.InstancedMesh(geo, corpseMat, this._corpseCap);
    this.corpses.castShadow = false; this.corpses.receiveShadow = false;
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
    const imp = Math.min(this.cap * 2, 5200); // cheap billboards, but transparency overdraws — keep modest
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

      // GENERAL stacking: front ranks stand ON the ground; only dense cells climb a
      // little over piled bodies — modest lift, low cap, so nobody hovers in a column
      const level = Math.min(a.cellLevel, 5);
      const base = heightAt(a.x, a.z) + this.heapAt(a.x, a.z); // heightAt already includes the raised corpse hill
      const y = base + level * 0.26 + bob * 0.5;
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
