// field.js - the battlefield before Winterfell's wall. Terrain, the outer wall
// and gate, godswood treeline, defensive works, weather, and cinematic dressing.
// Pure scene geometry; knows nothing about units or the horde.
//
// Orientation: the WALL runs along X at z = WALL_Z (near the camera, south).
// Defenders hold just behind it. The FIELD opens north (toward -z); the dead
// pour from the far treeline (NORTH_Z) and advance south onto the wall.
import * as THREE from '../engine/three.js';

export const WALL_Z = 30;
export const NORTH_Z = -185;
export const FIELD_HALF_X = 150;
export const WALL_H = 9.2;
export const WALL_T = 4.6;
export const GATE_W = 18;
export const RAMP_D = 18;

export const BOUNDS = {
  minX: -FIELD_HALF_X, maxX: FIELD_HALF_X,
  minZ: NORTH_Z + 10, maxZ: 84,
};

const Z_TOP = WALL_Z + WALL_T / 2;
const Z_BOT = Z_TOP + RAMP_D;
const MAX_DEFORMS = 96;
const deforms = [];
let activeEnv = null;

// ----- dig grid: real excavation that carves the terrain mesh + sinks units -----
const DIG_CELL = 2;
const DIG_X0 = -FIELD_HALF_X, DIG_Z0 = NORTH_Z;
const DIG_W = Math.ceil((FIELD_HALF_X * 2) / DIG_CELL) + 2;
const DIG_H = Math.ceil((WALL_Z + 8 - NORTH_Z) / DIG_CELL) + 2;

function digOffsetAt(x, z) {
  const e = activeEnv;
  if (!e || !e.dig) return 0;
  const hx = Math.round((x - DIG_X0) / DIG_CELL), hz = Math.round((z - DIG_Z0) / DIG_CELL);
  if (hx < 0 || hz < 0 || hx >= DIG_W || hz >= DIG_H) return 0;
  return e.dig[hz * DIG_W + hx];
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const rnd = seeded(0x51f7e11);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);

function hash2(ix, iz) {
  let x = (ix * 374761393 + iz * 668265263) ^ 0x5f3759df;
  x = (x ^ (x >> 13)) * 1274126177;
  return ((x ^ (x >> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
}

function fbm(x, z) {
  let amp = 0.55, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < 5; i++) {
    sum += (valueNoise(x * freq, z * freq) - 0.5) * amp;
    norm += amp;
    amp *= 0.52;
    freq *= 2.05;
  }
  return sum / norm;
}

function terrainHeight(x, z) {
  const broad = fbm(x * 0.012, z * 0.012) * 3.2;
  const crust = fbm(x * 0.045 + 20, z * 0.045 - 8) * 0.9;
  const windRows = Math.sin(x * 0.075 + z * 0.036) * 0.22;
  const wallDrift = Math.exp(-Math.pow((z - (WALL_Z - 8)) / 18, 2)) * (1.05 + Math.sin(x * 0.09) * 0.28);
  const killingLow = Math.exp(-Math.pow((z - (WALL_Z - 42)) / 25, 2)) * -0.72;
  const farRise = clamp((-z - 90) / 180, 0, 1) * 1.6;
  return broad + crust + windRows + wallDrift + killingLow + farRise - 0.25;
}

function deformOffsetAt(x, z) {
  let h = 0;
  for (const d of deforms) {
    const dist = Math.hypot(x - d.x, z - d.z);
    if (dist > d.r) continue;
    if (d.mode === 'ring') {
      if (dist < d.inner) continue;
      const t = (dist - d.inner) / Math.max(0.001, d.r - d.inner);
      h += d.delta * Math.sin(t * Math.PI);
    } else {
      h += d.delta * Math.cos((dist / d.r) * Math.PI / 2);
    }
  }
  return h;
}

function groundHeight(x, z) {
  return terrainHeight(x, z) + deformOffsetAt(x, z) + digOffsetAt(x, z);
}

export function heightAt(x, z) {
  const onSpan = Math.abs(x) <= FIELD_HALF_X && Math.abs(x) >= GATE_W / 2 + 0.5;
  if (onSpan && z >= WALL_Z - WALL_T / 2 && z <= Z_TOP) return WALL_H;
  if (onSpan && z > Z_TOP && z <= Z_BOT) {
    const k = (z - Z_TOP) / RAMP_D;
    return lerp(WALL_H, groundHeight(x, z), k);
  }
  return groundHeight(x, z);
}

function makeCanvasTexture(size, painter, srgb = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  painter(g, size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function makeSnowTexture() {
  return makeCanvasTexture(768, (g, size) => {
    const img = g.createImageData(size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const n = fbm(x * 0.018, y * 0.018) * 70 + (hash2(x, y) - 0.5) * 34;
        const wind = Math.sin((x + y * 0.42) * 0.045) * 4;
        const v = clamp(220 + n + wind, 150, 255);
        d[i] = v * 0.86;
        d[i + 1] = v * 0.92;
        d[i + 2] = v;
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = 'rgba(255,255,255,.055)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 42; i++) {
      const y = rnd() * size;
      g.beginPath();
      g.moveTo(-30, y);
      g.bezierCurveTo(size * 0.35, y - 18 + rnd() * 36, size * 0.65, y - 20 + rnd() * 40, size + 30, y + rnd() * 25);
      g.stroke();
    }
  });
}

function makeGrainTexture(base, accent, contrast = 0.24) {
  return makeCanvasTexture(512, (g, size) => {
    g.fillStyle = base;
    g.fillRect(0, 0, size, size);
    const img = g.getImageData(0, 0, size, size);
    const d = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const n = (fbm(x * 0.025, y * 0.025) + hash2(x, y) * 0.35) * 255 * contrast;
        d[i] = clamp(d[i] + n, 0, 255);
        d[i + 1] = clamp(d[i + 1] + n, 0, 255);
        d[i + 2] = clamp(d[i + 2] + n * 1.1, 0, 255);
      }
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = accent;
    for (let y = 0; y < size; y += 42) {
      g.globalAlpha = 0.20;
      g.lineWidth = 2 + rnd() * 2;
      g.beginPath();
      g.moveTo(0, y + rnd() * 16);
      g.lineTo(size, y + rnd() * 16);
      g.stroke();
    }
    for (let x = 0; x < size; x += 64) {
      g.globalAlpha = 0.16;
      g.lineWidth = 1 + rnd() * 2;
      g.beginPath();
      g.moveTo(x + rnd() * 16, 0);
      g.lineTo(x + rnd() * 16, size);
      g.stroke();
    }
    g.globalAlpha = 1;
  });
}

function makeKillTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const img = g.createImageData(512, 512), d = img.data;
  for (let y = 0; y < 512; y++) {
    const v = Math.abs(y / 512 - 0.5) * 2;
    for (let x = 0; x < 512; x++) {
      const i = (y * 512 + x) * 4;
      const n = fbm(x * 0.022, y * 0.035);
      const mud = clamp(1 - v * 1.45 + n * 0.7, 0, 1);
      const ux = x / 511, uy = y / 511;
      const edgeX = smooth(clamp(ux * 8, 0, 1)) * smooth(clamp((1 - ux) * 8, 0, 1));
      const edgeY = smooth(clamp(uy * 5, 0, 1)) * smooth(clamp((1 - uy) * 5, 0, 1));
      d[i] = lerp(176, 78, mud);
      d[i + 1] = lerp(190, 86, mud);
      d[i + 2] = lerp(207, 96, mud);
      d[i + 3] = clamp(mud * 230 * edgeX * edgeY, 0, 220);
    }
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = 'rgba(82,12,18,.30)';
  for (let i = 0; i < 38; i++) {
    g.beginPath();
    g.ellipse(rnd() * 512, 180 + rnd() * 160, 10 + rnd() * 38, 3 + rnd() * 16, rnd() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeRadialTexture(size, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  for (const [p, col] of stops) grad.addColorStop(p, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeScorchTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 2, 128, 128, 128);
  grd.addColorStop(0.00, 'rgba(18,13,10,.92)');
  grd.addColorStop(0.30, 'rgba(45,26,20,.58)');
  grd.addColorStop(0.58, 'rgba(85,26,24,.24)');
  grd.addColorStop(1.00, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(220,220,230,.12)';
  for (let i = 0; i < 24; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 38 + rnd() * 74;
    g.beginPath();
    g.moveTo(128 + Math.cos(a) * 16, 128 + Math.sin(a) * 16);
    g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeHorizonTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 320;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const mist = g.createLinearGradient(0, 0, 0, c.height);
  mist.addColorStop(0, 'rgba(30,48,78,0)');
  mist.addColorStop(0.52, 'rgba(62,82,112,.24)');
  mist.addColorStop(1, 'rgba(4,8,12,.88)');
  g.fillStyle = mist;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(6,12,18,.76)';
  g.beginPath();
  g.moveTo(0, 245);
  for (let x = 0; x <= c.width; x += 32) {
    const y = 170 + fbm(x * 0.012, 0) * 68 + Math.sin(x * 0.011) * 30;
    g.lineTo(x, y);
  }
  g.lineTo(c.width, c.height); g.lineTo(0, c.height); g.closePath(); g.fill();
  g.fillStyle = 'rgba(6,10,12,.95)';
  for (let i = 0; i < 105; i++) {
    const x = rnd() * c.width, h = 55 + rnd() * 120, w = 10 + rnd() * 28;
    g.beginPath();
    g.moveTo(x - w, 300);
    g.lineTo(x, 300 - h);
    g.lineTo(x + w, 300);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function cast(obj) {
  obj.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return obj;
}

function makeRamp(x0, x1, mat) {
  const ground0 = groundHeight(x0, Z_BOT);
  const ground1 = groundHeight(x1, Z_BOT);
  const A0 = [x0, WALL_H, Z_TOP], B0 = [x0, ground0, Z_BOT], C0 = [x0, ground0, Z_TOP];
  const A1 = [x1, WALL_H, Z_TOP], B1 = [x1, ground1, Z_BOT], C1 = [x1, ground1, Z_TOP];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([...A0, ...B0, ...C0, ...A1, ...B1, ...C1], 3));
  geo.setIndex([
    0, 1, 4, 0, 4, 3,
    2, 0, 3, 2, 3, 5,
    2, 1, 4, 2, 4, 5,
    0, 2, 1,
    3, 4, 5,
  ]);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function addTerrain(group, placementTargets, env) {
  const geo = new THREE.PlaneGeometry(900, 900, 176, 176);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = -pos.getY(i);
    pos.setZ(i, groundHeight(x, z));
  }
  geo.computeVertexNormals();

  const snowMap = makeSnowTexture();
  snowMap.repeat.set(8, 8);
  const bump = makeGrainTexture('#7e8792', 'rgba(255,255,255,.22)', 0.16);
  bump.repeat.set(20, 20);

  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: snowMap,
    bumpMap: bump,
    bumpScale: 0.18,
    color: 0xd8e4f1,
    roughness: 0.96,
    metalness: 0,
  }));
  terrain.rotation.x = -Math.PI / 2;
  terrain.receiveShadow = true;
  group.add(terrain);
  placementTargets.push(terrain);
  env.terrain = terrain;
  env.terrainGeo = geo;

  const kill = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD_HALF_X * 2, 92, 1, 1),
    new THREE.MeshStandardMaterial({
      map: makeKillTexture(),
      transparent: true,
      opacity: 0.94,
      roughness: 1,
      depthWrite: false,
    }),
  );
  kill.rotation.x = -Math.PI / 2;
  kill.position.set(0, 0.18, WALL_Z - 43);
  kill.receiveShadow = true;
  group.add(kill);

  return terrain;
}

function addWall(group, torches, placementTargets, env) {
  const stoneTex = makeGrainTexture('#59616b', 'rgba(210,225,240,.24)', 0.22);
  stoneTex.repeat.set(3.5, 1.2);
  const stoneBump = makeGrainTexture('#808080', 'rgba(255,255,255,.18)', 0.18);
  stoneBump.repeat.set(6, 2);
  const stone = new THREE.MeshStandardMaterial({
    map: stoneTex,
    bumpMap: stoneBump,
    bumpScale: 0.12,
    color: 0x7b8490,
    roughness: 0.93,
    metalness: 0,
  });
  const darkStone = new THREE.MeshStandardMaterial({
    color: 0x434a54,
    roughness: 0.95,
    metalness: 0,
    bumpMap: stoneBump,
    bumpScale: 0.1,
  });
  const snowCap = new THREE.MeshStandardMaterial({ color: 0xe6eef8, roughness: 1 });
  const gateMat = new THREE.MeshStandardMaterial({
    map: makeGrainTexture('#2a211b', 'rgba(240,205,150,.16)', 0.16),
    color: 0x342820,
    roughness: 0.82,
    metalness: 0.05,
  });
  const iron = new THREE.MeshStandardMaterial({ color: 0x111519, roughness: 0.55, metalness: 0.65 });
  const rampMat = new THREE.MeshStandardMaterial({
    color: 0xc8d3df,
    roughness: 1,
    metalness: 0,
  });

  const wall = new THREE.Group();
  const gateBreakables = [];
  const spanLen = FIELD_HALF_X - GATE_W / 2;
  for (const side of [-1, 1]) {
    const span = new THREE.Mesh(new THREE.BoxGeometry(spanLen, WALL_H, WALL_T), stone);
    span.position.set(side * (GATE_W / 2 + spanLen / 2), WALL_H / 2, WALL_Z);
    wall.add(span);
    placementTargets.push(span);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(spanLen, 0.42, WALL_T + 0.75), snowCap);
    cap.position.set(span.position.x, WALL_H + 0.18, WALL_Z - 0.15);
    wall.add(cap);

    const x0 = side < 0 ? -FIELD_HALF_X : GATE_W / 2;
    const x1 = side < 0 ? -GATE_W / 2 : FIELD_HALF_X;
    const ramp = makeRamp(x0, x1, rampMat);
    wall.add(ramp);
    placementTargets.push(ramp);
  }

  const buttressGeo = new THREE.BoxGeometry(1.65, WALL_H + 1.4, 6.8);
  const buttresses = new THREE.InstancedMesh(buttressGeo, darkStone, 34);
  const o = new THREE.Object3D();
  let bi = 0;
  for (let x = -FIELD_HALF_X + 8; x <= FIELD_HALF_X - 8; x += 13) {
    if (Math.abs(x) < GATE_W / 2 + 8) continue;
    o.position.set(x, (WALL_H + 1.4) / 2, WALL_Z - 2.6);
    o.rotation.y = (rnd() - 0.5) * 0.035;
    o.updateMatrix();
    buttresses.setMatrixAt(bi++, o.matrix);
  }
  buttresses.count = bi;
  buttresses.castShadow = buttresses.receiveShadow = true;
  wall.add(buttresses);

  const merlonGeo = new THREE.BoxGeometry(2.35, 2.1, WALL_T + 0.85);
  const merlons = new THREE.InstancedMesh(merlonGeo, stone, 80);
  let mi = 0;
  for (let x = -FIELD_HALF_X + 2.4; x <= FIELD_HALF_X - 2.4 && mi < 80; x += 4.15) {
    if (Math.abs(x) < GATE_W / 2 + 1.8) continue;
    o.position.set(x, WALL_H + 1.15, WALL_Z - 0.1);
    o.rotation.set(0, 0, 0);
    o.updateMatrix();
    env.breakables.push({ kind: 'merlon', mesh: merlons, index: mi, x, z: WALL_Z, hp: 42, alive: true });
    merlons.setMatrixAt(mi++, o.matrix);
  }
  merlons.count = mi;
  merlons.castShadow = merlons.receiveShadow = true;
  wall.add(merlons);

  const towerH = 17.8;
  for (const side of [-1, 1]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 6.6, towerH, 12), stone);
    tower.position.set(side * (GATE_W / 2 + 6.2), towerH / 2, WALL_Z - 0.15);
    wall.add(tower);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(6.55, 6.1, 2.0, 12), darkStone);
    crown.position.set(tower.position.x, towerH + 0.75, WALL_Z - 0.15);
    wall.add(crown);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(6.7, 6.25, 0.42, 12), snowCap);
    cap.position.set(tower.position.x, towerH + 1.95, WALL_Z - 0.15);
    wall.add(cap);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.65, 1.25), stone);
      m.position.set(tower.position.x + Math.cos(a) * 5.1, towerH + 2.3, WALL_Z - 0.15 + Math.sin(a) * 5.1);
      m.rotation.y = -a;
      wall.add(m);
    }
  }

  const gate = new THREE.Group();
  const door = new THREE.Mesh(new THREE.BoxGeometry(GATE_W - 1.2, WALL_H + 0.8, 1.25), gateMat);
  door.position.set(0, (WALL_H + 0.8) / 2, WALL_Z + 0.15);
  gate.add(door);
  gateBreakables.push(door);
  const plankGeo = new THREE.BoxGeometry(0.5, WALL_H + 0.9, 1.38);
  const planks = new THREE.InstancedMesh(plankGeo, gateMat, 18);
  for (let i = 0; i < 18; i++) {
    o.position.set(-GATE_W / 2 + 1 + i * ((GATE_W - 2) / 17), (WALL_H + 0.9) / 2, WALL_Z + 0.82);
    o.rotation.set(0, 0, 0);
    o.updateMatrix();
    planks.setMatrixAt(i, o.matrix);
  }
  gate.add(planks);
  gateBreakables.push(planks);
  for (const y of [3.15, 6.7]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(GATE_W - 2.2, 0.42, 1.48), iron);
    band.position.set(0, y, WALL_Z + 1.52);
    gate.add(band);
    gateBreakables.push(band);
  }
  for (const x of [-3.2, 3.2]) {
    const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.42, WALL_H - 1, 1.55), iron);
    hinge.position.set(x, WALL_H / 2, WALL_Z + 1.55);
    gate.add(hinge);
    gateBreakables.push(hinge);
  }
  const archGeo = new THREE.BoxGeometry(1.7, 1.25, 1.9);
  for (let i = 0; i < 15; i++) {
    const t = Math.PI * (i / 14);
    const a = new THREE.Mesh(archGeo, stone);
    a.position.set(Math.cos(t) * (GATE_W * 0.49), 4.0 + Math.sin(t) * 6.4, WALL_Z - 2.08);
    a.rotation.z = Math.PI / 2 - t;
    gate.add(a);
  }
  wall.add(gate);

  const keep = new THREE.Group();
  const keepMat = new THREE.MeshStandardMaterial({ color: 0x4b535d, roughness: 0.94, metalness: 0.02, bumpMap: stoneBump, bumpScale: 0.09 });
  const keepZ = WALL_Z + 2.2;
  const keepCore = new THREE.Mesh(new THREE.BoxGeometry(22, 25, 11), keepMat);
  keepCore.position.set(0, 12.5, keepZ);
  keep.add(keepCore);
  const keepTop = new THREE.Mesh(new THREE.BoxGeometry(25, 2.4, 13), darkStone);
  keepTop.position.set(0, 25.7, keepZ);
  keep.add(keepTop);
  const keepMerlonGeo = new THREE.BoxGeometry(1.25, 1.8, 1.25);
  for (const z of [keepZ - 5.8, keepZ + 5.8]) {
    for (let x = -10; x <= 10; x += 4) {
      const km = new THREE.Mesh(keepMerlonGeo, keepMat);
      km.position.set(x, 27.8, z);
      keep.add(km);
    }
  }
  for (const x of [-12.7, 12.7]) {
    for (let z = keepZ - 4; z <= keepZ + 4; z += 4) {
      const km = new THREE.Mesh(keepMerlonGeo, keepMat);
      km.position.set(x, 27.8, z);
      keep.add(km);
    }
  }
  for (const [x, z, h, r] of [[-23, WALL_Z + 0.5, 31, 4.4], [23, WALL_Z + 0.5, 31, 4.4], [-11, WALL_Z + 9, 23, 3.2], [11, WALL_Z + 9, 23, 3.2]]) {
    const kt = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.5, h, 10), keepMat);
    kt.position.set(x, h / 2, z);
    keep.add(kt);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(r + 0.9, 4.5, 10), snowCap);
    roof.position.set(x, h + 2.2, z);
    keep.add(roof);
  }
  for (let i = 0; i < 16; i++) {
    const slit = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 1.8, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xff9d42, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, fog: false }),
    );
    slit.position.set(-9.5 + (i % 8) * 2.72, 10 + Math.floor(i / 8) * 7, keepZ + 5.56);
    keep.add(slit);
  }
  wall.add(keep);

  addTorches(wall, torches);
  cast(wall);
  group.add(wall);
  env.gate = { parts: gateBreakables, hp: 360, maxHp: 360, broken: false };

  return { wall, gate };
}

function addTorches(wall, torches) {
  const flameTex = makeRadialTexture(128, [
    [0.00, 'rgba(255,255,220,1)'],
    [0.18, 'rgba(255,194,86,.88)'],
    [0.45, 'rgba(255,76,26,.46)'],
    [1.00, 'rgba(0,0,0,0)'],
  ]);
  const flameGeo = new THREE.PlaneGeometry(4.6, 6.8);
  const bowlGeo = new THREE.CylinderGeometry(0.7, 0.48, 0.55, 8);
  const bowlMat = new THREE.MeshStandardMaterial({ color: 0x151311, roughness: 0.5, metalness: 0.75 });
  const xs = [-132, -96, -60, -24, 24, 60, 96, 132];
  for (const x of xs) {
    const torch = new THREE.Group();
    torch.position.set(x, WALL_H + 3.55, WALL_Z + 3.25);
    const bowl = new THREE.Mesh(bowlGeo, bowlMat);
    bowl.position.y = -0.55;
    torch.add(bowl);
    const mat = new THREE.MeshBasicMaterial({
      map: flameTex,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const flame = new THREE.Mesh(flameGeo, mat);
    flame.position.y = 1.2;
    torch.add(flame);
    const light = new THREE.PointLight(0xff9d46, 10.5, 52, 1.85);
    light.position.set(0, 1.6, 1.2);
    torch.add(light);
    torch.userData.phase = rnd() * Math.PI * 2;
    torches.push({ torch, flame, light, base: 8.5 + rnd() * 1.8 });
    wall.add(torch);
  }
}

function addDefenses(group, env) {
  const stakeGeo = new THREE.ConeGeometry(0.34, 3.6, 5);
  const stakeMat = new THREE.MeshStandardMaterial({ color: 0x3a2b20, roughness: 0.93 });
  const shardGeo = new THREE.ConeGeometry(0.26, 2.3, 5);
  const shardMat = new THREE.MeshStandardMaterial({
    color: 0x132943,
    emissive: 0x07243f,
    emissiveIntensity: 0.55,
    roughness: 0.42,
    metalness: 0.08,
  });
  const stakes = new THREE.InstancedMesh(stakeGeo, stakeMat, 260);
  const shards = new THREE.InstancedMesh(shardGeo, shardMat, 95);
  const o = new THREE.Object3D();
  for (let i = 0; i < 260; i++) {
    const lane = Math.floor(i / 65);
    const x = -FIELD_HALF_X + rnd() * FIELD_HALF_X * 2 + Math.sin(i) * 5;
    const z = WALL_Z - 10 - lane * 13 - rnd() * 13;
    o.position.set(x, terrainHeight(x, z) + 1.3, z);
    o.rotation.set((rnd() - 0.5) * 0.9, rnd() * Math.PI, Math.PI - 0.45 - rnd() * 0.55);
    o.updateMatrix();
    env.breakables.push({ kind: 'stake', mesh: stakes, index: i, x, z, hp: 16 + rnd() * 10, alive: true });
    stakes.setMatrixAt(i, o.matrix);
  }
  for (let i = 0; i < 95; i++) {
    const x = -FIELD_HALF_X + rnd() * FIELD_HALF_X * 2;
    const z = WALL_Z - 16 - rnd() * 72;
    o.position.set(x, groundHeight(x, z) + 0.8, z);
    o.rotation.set((rnd() - 0.5) * 0.32, rnd() * Math.PI, (rnd() - 0.5) * 0.22);
    const s = 0.75 + rnd() * 0.75;
    o.scale.set(s, s, s);
    o.updateMatrix();
    env.breakables.push({ kind: 'shard', mesh: shards, index: i, x, z, hp: 12 + rnd() * 8, alive: true });
    shards.setMatrixAt(i, o.matrix);
  }
  stakes.castShadow = true;
  shards.castShadow = true;
  group.add(stakes, shards);
}

function addRocks(group, env) {
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x5b626b, roughness: 0.96, metalness: 0 });
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const rocks = new THREE.InstancedMesh(geo, rockMat, 82);
  const o = new THREE.Object3D();
  for (let i = 0; i < 82; i++) {
    const x = (rnd() * 2 - 1) * (FIELD_HALF_X + 28);
    const z = NORTH_Z + 15 + rnd() * 205;
    const s = 0.45 + rnd() * 2.4;
    o.position.set(x, groundHeight(x, z) + s * 0.25, z);
    o.rotation.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
    o.scale.set(s * (0.8 + rnd() * 1.6), s * (0.32 + rnd() * 0.5), s * (0.7 + rnd() * 1.4));
    o.updateMatrix();
    env.breakables.push({ kind: 'rock', mesh: rocks, index: i, x, z, hp: 55 + s * 18, alive: true });
    rocks.setMatrixAt(i, o.matrix);
  }
  rocks.castShadow = rocks.receiveShadow = true;
  group.add(rocks);
}

function addDestructionPools(group, env) {
  const scorchTex = makeScorchTexture();
  const groundMat = new THREE.MeshBasicMaterial({
    map: scorchTex,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: true,
  });
  const wallMat = new THREE.MeshBasicMaterial({
    map: scorchTex,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: true,
  });
  const plane = new THREE.PlaneGeometry(1, 1);
  for (let i = 0; i < 36; i++) {
    const m = new THREE.Mesh(plane, groundMat.clone());
    m.rotation.x = -Math.PI / 2;
    m.visible = false;
    m.renderOrder = 4;
    env.groundScars.push(m);
    group.add(m);
  }
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(plane, wallMat.clone());
    m.visible = false;
    m.renderOrder = 5;
    env.wallScars.push(m);
    group.add(m);
  }

  env.debrisMesh = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.55, 0),
    new THREE.MeshStandardMaterial({ color: 0x2e3339, roughness: 0.98, metalness: 0 }),
    520,
  );
  env.debrisMesh.castShadow = true;
  env.debrisMesh.receiveShadow = true;
  env.debrisMesh.count = 520;
  const o = new THREE.Object3D();
  o.position.set(0, -9999, 0);
  o.scale.setScalar(0.001);
  o.updateMatrix();
  for (let i = 0; i < env.debrisMesh.count; i++) env.debrisMesh.setMatrixAt(i, o.matrix);
  env.debrisMesh.instanceMatrix.needsUpdate = true;
  group.add(env.debrisMesh);
}

function buildAssets(env) {
  if (env.buildAssets) return env.buildAssets;
  env.buildAssets = {
    wood: new THREE.MeshStandardMaterial({
      color: 0x3a2a1f,
      roughness: 0.9,
      metalness: 0,
      map: makeGrainTexture('#2b1f17', 'rgba(245,205,150,.12)', 0.14),
    }),
    iron: new THREE.MeshStandardMaterial({ color: 0x14191d, roughness: 0.62, metalness: 0.48 }),
    snow: new THREE.MeshStandardMaterial({ color: 0xdbe7f3, roughness: 1, metalness: 0 }),
    earth: new THREE.MeshStandardMaterial({ color: 0x1b1712, roughness: 1, metalness: 0 }),
    sand: new THREE.MeshStandardMaterial({ color: 0x746a55, roughness: 0.98, metalness: 0 }),
    canvas: new THREE.MeshStandardMaterial({ color: 0x384333, roughness: 0.9, metalness: 0 }),
    glass: new THREE.MeshBasicMaterial({ color: 0xffd67a, transparent: true, opacity: 0.85, fog: false }),
    flame: new THREE.MeshBasicMaterial({
      map: makeRadialTexture(96, [
        [0.00, 'rgba(255,255,220,1)'],
        [0.22, 'rgba(255,174,65,.9)'],
        [0.58, 'rgba(255,57,18,.42)'],
        [1.00, 'rgba(0,0,0,0)'],
      ]),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
    log: new THREE.BoxGeometry(8.4, 0.52, 0.72),
    brace: new THREE.BoxGeometry(0.52, 3.2, 0.52),
    spike: new THREE.ConeGeometry(0.24, 3.4, 5),
    trench: new THREE.PlaneGeometry(12.4, 5.8),
    berm: new THREE.BoxGeometry(12.2, 0.5, 0.86),
    bag: new THREE.BoxGeometry(1.22, 0.38, 0.64),
    wire: new THREE.BoxGeometry(9.2, 0.055, 0.055),
    post: new THREE.CylinderGeometry(0.08, 0.11, 1.25, 5),
    crate: new THREE.BoxGeometry(1.25, 0.85, 1.1),
    plank: new THREE.BoxGeometry(0.34, 5.8, 0.34),
    deck: new THREE.BoxGeometry(4.8, 0.32, 4.8),
    barrel: new THREE.CylinderGeometry(0.13, 0.13, 3.4, 8),
    tripod: new THREE.CylinderGeometry(0.055, 0.07, 1.9, 5),
    lamp: new THREE.CylinderGeometry(0.34, 0.26, 0.42, 10),
    bowl: new THREE.CylinderGeometry(0.74, 0.5, 0.48, 10),
    flamePlane: new THREE.PlaneGeometry(2.7, 4.0),
    pit: new THREE.CylinderGeometry(3.1, 2.6, 0.45, 18),
    snowCap: new THREE.BoxGeometry(8.8, 0.18, 0.92),
  };
  return env.buildAssets;
}

function castBuildable(g) {
  g.traverse?.(m => {
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
  });
}

function normalizeBuildKind(kind) {
  if (kind === 'barricade') return 'sandbag';
  if (kind === 'spikes') return 'wire';
  if (kind === 'mg') return 'nest';
  if (kind === 'mine') return 'pit';
  if (kind === 'spotlight') return 'floodlight';
  if (kind === 'firepot') return 'brazier';
  return kind;
}

const BUILD_STATS = {
  trench: { hp: 230, radius: 8.0, clearance: 11 },
  wire: { hp: 72, radius: 6.2, clearance: 6 },
  sandbag: { hp: 118, radius: 6.8, clearance: 8 },
  nest: { hp: 185, radius: 8.4, clearance: 10 },
  tower: { hp: 130, radius: 9.2, clearance: 10 },
  pit: { hp: 64, radius: 5.9, clearance: 7 },
  floodlight: { hp: 92, radius: 18, clearance: 8 },
  ammo: { hp: 96, radius: 7.2, clearance: 7 },
  bunker: { hp: 260, radius: 8.8, clearance: 11 },
  brazier: { hp: 78, radius: 12.5, clearance: 7 },
};

function canPlaceBuildable(env, kind, x, z, dense) {
  kind = normalizeBuildKind(kind);
  if (!env) return false;
  if (Math.abs(x) > FIELD_HALF_X - 8) return false;
  if (z < NORTH_Z + 18 || z > WALL_Z - 8) return false;
  if (dense) return true; // drawn/dug lines lay segments shoulder to shoulder
  const clearance = BUILD_STATS[kind]?.clearance ?? 7;
  for (const b of env.buildables) {
    if (b.alive && Math.hypot(b.x - x, b.z - z) < clearance) return false;
  }
  return true;
}

function addSandbags(g, a, n, rows, zBase = 0, arc = false) {
  for (let row = 0; row < rows; row++) {
    for (let i = 0; i < n; i++) {
      const bag = new THREE.Mesh(a.bag, a.sand);
      if (arc) {
        const t = -Math.PI * 0.78 + (i / Math.max(1, n - 1)) * Math.PI * 1.56;
        const r = 3.25 + row * 0.46;
        bag.position.set(Math.cos(t) * r, 0.28 + row * 0.32, zBase + Math.sin(t) * r);
        bag.rotation.y = -t + Math.PI / 2 + (rnd() - 0.5) * 0.22;
      } else {
        bag.position.set((i - (n - 1) / 2) * 1.02, 0.26 + row * 0.38, zBase + (row % 2) * 0.32);
        bag.rotation.y = (rnd() - 0.5) * 0.32;
      }
      g.add(bag);
    }
  }
}

function placeBuildable(kind, x, z, opts = {}) {
  kind = normalizeBuildKind(kind);
  const env = activeEnv;
  if (!canPlaceBuildable(env, kind, x, z, opts.dense)) return null;
  const a = buildAssets(env);
  const g = new THREE.Group();
  g.position.set(x, groundHeight(x, z) + 0.08, z);
  g.rotation.y = opts.angle != null ? opts.angle : (rnd() - 0.5) * 0.5;
  const stats = BUILD_STATS[kind] ?? BUILD_STATS.sandbag;
  const item = {
    id: ++env.buildId,
    kind,
    group: g,
    x, z,
    alive: true,
    hp: stats.hp,
    maxHp: stats.hp,
    radius: stats.radius,
  };

  if (kind === 'trench') {
    // no floor plane — the terrain is really excavated below; just dress the lip
    const lining = new THREE.Mesh(a.trench, a.earth);
    lining.rotation.x = -Math.PI / 2;
    lining.position.y = -1.55;            // dark earth at the dug floor
    g.add(lining);
    for (const zoff of [-2.85, 2.85]) {
      const berm = new THREE.Mesh(a.berm, zoff < 0 ? a.snow : a.earth);
      berm.position.set(0, 0.42, zoff);   // spoil heaped at the trench lip
      berm.rotation.z = (rnd() - 0.5) * 0.04;
      g.add(berm);
    }
    for (let i = 0; i < 11; i++) {
      const bag = new THREE.Mesh(a.bag, a.sand);
      bag.position.set((i - 5) * 1.05, 0.65 + (i % 2) * 0.14, -3.04);
      bag.rotation.y = (rnd() - 0.5) * 0.25;
      g.add(bag);
    }
  } else if (kind === 'wire') {
    for (let r = 0; r < 3; r++) {
      const wire = new THREE.Mesh(a.wire, a.iron);
      wire.position.set(0, 0.75 + r * 0.32, (r - 1) * 0.7);
      wire.rotation.set((rnd() - 0.5) * 0.08, 0, (rnd() - 0.5) * 0.12);
      g.add(wire);
    }
    for (const sx of [-4.4, 0, 4.4]) {
      const post = new THREE.Mesh(a.post, a.wood);
      post.position.set(sx, 0.58, -0.1);
      post.rotation.z = (rnd() - 0.5) * 0.18;
      g.add(post);
    }
    for (let i = 0; i < 9; i++) {
      const spike = new THREE.Mesh(a.spike, i % 3 === 0 ? a.iron : a.wood);
      const ox = (i - 4) * 1.0;
      spike.position.set(ox, 0.82, (rnd() - 0.5) * 1.3);
      spike.rotation.set(0.58 + rnd() * 0.25, rnd() * Math.PI, (rnd() - 0.5) * 0.24);
      g.add(spike);
    }
  } else if (kind === 'sandbag') {
    addSandbags(g, a, 8, 3);
  } else if (kind === 'nest') {
    addSandbags(g, a, 12, 3, 0.25, true);
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.24, 14), a.earth);
    deck.position.y = 0.14;
    g.add(deck);
    const barrel = new THREE.Mesh(a.barrel, a.iron);
    barrel.position.set(0, 1.18, -1.7);
    barrel.rotation.x = Math.PI / 2;
    g.add(barrel);
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.42, 0.8), a.iron);
    receiver.position.set(0, 1.16, -0.35);
    g.add(receiver);
    for (const [px, pz, rz] of [[-0.55, 0.45, 0.45], [0.55, 0.45, -0.45], [0, -0.55, 0]]) {
      const leg = new THREE.Mesh(a.tripod, a.iron);
      leg.position.set(px, 0.58, pz);
      leg.rotation.z = rz;
      g.add(leg);
    }
    for (const [cx, cz] of [[-2.0, 1.7], [2.0, 1.55]]) {
      const crate = new THREE.Mesh(a.crate, a.wood);
      crate.position.set(cx, 0.46, cz);
      crate.rotation.y = (rnd() - 0.5) * 0.35;
      g.add(crate);
    }
    // a gunner hunched over the weapon — the nest is crewed and firing
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x4b5340, roughness: 0.85 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.82, 0.66), gunMat);
    torso.position.set(0, 0.98, 0.5); torso.rotation.x = -0.55; g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), a.iron);
    head.position.set(0, 1.46, 0.18); g.add(head);
    const loader = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.6), gunMat);
    loader.position.set(1.0, 0.7, 1.0); loader.rotation.y = -0.5; g.add(loader);
    item.muzzle = new THREE.Vector3(0, 1.2, -1.9); // local muzzle tip
  } else if (kind === 'tower') {
    for (const sx of [-1.8, 1.8]) for (const sz of [-1.8, 1.8]) {
      const leg = new THREE.Mesh(a.plank, a.wood);
      leg.position.set(sx, 2.65, sz);
      leg.rotation.z = sx * 0.035;
      leg.rotation.x = -sz * 0.035;
      g.add(leg);
    }
    const deck = new THREE.Mesh(a.deck, a.wood);
    deck.position.y = 5.25;
    g.add(deck);
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 5; i++) {
        const bag = new THREE.Mesh(a.bag, a.sand);
        bag.position.set((i - 2) * 0.88, 5.55 + row * 0.28, -2.1 + row * 0.28);
        bag.rotation.y = (rnd() - 0.5) * 0.2;
        g.add(bag);
      }
    }
    const ladder = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4.8, 0.16), a.wood);
    ladder.position.set(-2.58, 2.6, 0);
    ladder.rotation.z = -0.22;
    g.add(ladder);
    const lamp = new THREE.Mesh(a.lamp, a.glass);
    lamp.position.set(0, 5.72, -2.25);
    lamp.rotation.x = Math.PI / 2;
    g.add(lamp);
  } else if (kind === 'bunker') {
    const core = new THREE.Mesh(new THREE.BoxGeometry(5.8, 1.28, 4.0), a.earth);
    core.position.y = 0.72;
    g.add(core);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(6.7, 0.42, 4.65), a.wood);
    roof.position.y = 1.55;
    g.add(roof);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(6.9, 0.2, 4.85), a.snow);
    cap.position.y = 1.84;
    g.add(cap);
    for (let i = 0; i < 6; i++) {
      const log = new THREE.Mesh(a.log, a.wood);
      log.position.set(0, 1.12 + i * 0.13, -2.18);
      log.scale.x = 0.74;
      log.rotation.z = (rnd() - 0.5) * 0.025;
      g.add(log);
    }
    const slit = new THREE.Mesh(new THREE.BoxGeometry(4.15, 0.26, 0.08), a.iron);
    slit.position.set(0, 1.26, -2.45);
    g.add(slit);
    addSandbags(g, a, 7, 2, -2.72);
    for (const [cx, cz] of [[-2.7, 1.9], [2.65, 1.75]]) {
      const crate = new THREE.Mesh(a.crate, a.wood);
      crate.position.set(cx, 0.46, cz);
      crate.rotation.y = (rnd() - 0.5) * 0.35;
      g.add(crate);
    }
  } else if (kind === 'pit') {
    const pit = new THREE.Mesh(a.pit, a.earth);
    pit.position.y = 0.05;
    pit.scale.set(1, 0.22, 1);
    g.add(pit);
    for (let i = 0; i < 13; i++) {
      const spike = new THREE.Mesh(a.spike, i % 4 === 0 ? a.iron : a.wood);
      const ang = rnd() * Math.PI * 2;
      const rr = 0.3 + rnd() * 2.15;
      spike.position.set(Math.cos(ang) * rr, 0.5, Math.sin(ang) * rr);
      spike.rotation.set(0.25 + rnd() * 0.35, rnd() * Math.PI, (rnd() - 0.5) * 0.28);
      spike.scale.setScalar(0.82 + rnd() * 0.35);
      g.add(spike);
    }
    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.12, 6, 22), a.snow);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.2;
    g.add(rim);
  } else if (kind === 'floodlight') {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 4.2, 7), a.iron);
    mast.position.y = 2.1;
    g.add(mast);
    for (const sx of [-1.1, 1.1]) {
      const brace = new THREE.Mesh(a.brace, a.wood);
      brace.position.set(sx, 0.88, 0);
      brace.rotation.z = sx < 0 ? -0.75 : 0.75;
      brace.scale.set(0.65, 0.65, 0.65);
      g.add(brace);
    }
    const lamp = new THREE.Mesh(a.lamp, a.glass);
    lamp.position.set(0, 4.42, -0.32);
    lamp.rotation.x = Math.PI / 2;
    lamp.scale.set(1.5, 1.5, 1.1);
    g.add(lamp);
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(3.2, 18, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd78a, transparent: true, opacity: 0.09, depthWrite: false, fog: false }),
    );
    beam.position.set(0, 2.3, -8.2);
    beam.rotation.x = -Math.PI / 2;
    g.add(beam);
    const light = new THREE.PointLight(0xffcf8a, 5.5, 34, 1.7);
    light.position.set(0, 4.25, -0.7);
    g.add(light);
  } else if (kind === 'brazier') {
    for (const [sx, sz, rz, rx] of [[-0.62, 0.22, -0.55, 0.2], [0.62, 0.22, 0.55, 0.2], [0, -0.68, 0, -0.55]]) {
      const leg = new THREE.Mesh(a.tripod, a.iron);
      leg.position.set(sx, 0.72, sz);
      leg.rotation.z = rz;
      leg.rotation.x = rx;
      g.add(leg);
    }
    const bowl = new THREE.Mesh(a.bowl, a.iron);
    bowl.position.y = 1.32;
    g.add(bowl);
    for (const rot of [0, Math.PI / 2]) {
      const flame = new THREE.Mesh(a.flamePlane, a.flame.clone());
      flame.position.y = 2.55;
      flame.rotation.y = rot;
      g.add(flame);
    }
    const glow = new THREE.PointLight(0xff8a38, 4.2, 28, 2.0);
    glow.position.set(0, 2.25, 0);
    g.add(glow);
  } else if (kind === 'ammo') {
    for (let i = 0; i < 7; i++) {
      const crate = new THREE.Mesh(a.crate, i % 3 === 0 ? a.iron : a.wood);
      crate.position.set((i % 3 - 1) * 1.15, 0.42 + Math.floor(i / 3) * 0.62, (Math.floor(i / 3) - 0.7) * 1.0);
      crate.rotation.y = (rnd() - 0.5) * 0.35;
      g.add(crate);
    }
    const tarp = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.18, 2.9), a.canvas);
    tarp.position.set(0, 1.55, -0.15);
    tarp.rotation.z = (rnd() - 0.5) * 0.08;
    g.add(tarp);
    addSandbags(g, a, 5, 1, 1.72);
  }

  castBuildable(g);
  env.group.add(g);
  env.buildables.push(item);
  // real excavation: carve the terrain so the trench is dug into the ground
  if (kind === 'trench') { digCarve(x, z, 1.8, 5.4); spawnDebris(env, x, z, 2.4, 4, false); }
  else if (kind === 'pit') { digCarve(x, z, 1.4, 4.2); spawnDebris(env, x, z, 2.4, 4, false); }
  return item;
}

function destroyBuildable(env, item) {
  if (!item.alive) return;
  item.alive = false;
  item.group.visible = false;
  spawnDebris(env, item.x, item.z, item.kind === 'trench' ? 5.5 : 3.5, item.kind === 'trench' ? 12 : 7, false);
  placeGroundScar(env, item.x, item.z, item.kind === 'trench' ? 4.2 : 3.0);
}

function buildPressure(x, z, dt) {
  const env = activeEnv;
  if (!env) return null;
  let speedMul = 1;
  let damage = 0;
  for (const item of env.buildables) {
    if (!item.alive) continue;
    const d = Math.hypot(item.x - x, item.z - z);
    if (d > item.radius) continue;
    const k = 1 - d / item.radius;
    if (item.kind === 'wire') {
      speedMul = Math.min(speedMul, 0.38 + (1 - k) * 0.22);
      damage += dt * (1.6 + k * 4.4);
      item.hp -= dt * (1.2 + k * 2.8);
    } else if (item.kind === 'pit') {
      speedMul = Math.min(speedMul, 0.18 + (1 - k) * 0.24);
      damage += dt * (4.6 + k * 9.5);
      item.hp -= dt * (0.6 + k * 1.8);
    } else if (item.kind === 'trench') {
      speedMul = Math.min(speedMul, 0.22 + (1 - k) * 0.32);
      damage += dt * (0.25 + k * 0.9);
      item.hp -= dt * (0.7 + k * 2.4);
    } else if (item.kind === 'brazier') {
      speedMul = Math.min(speedMul, 0.58 + (1 - k) * 0.22);
      damage += dt * (2.2 + k * 6.5);
      item.hp -= dt * (0.75 + k * 1.8);
    } else if (item.kind === 'floodlight') {
      speedMul = Math.min(speedMul, 0.82);
      item.hp -= dt * (0.45 + k * 1.5);
    } else {
      speedMul = Math.min(speedMul, item.kind === 'tower' ? 0.36 + (1 - k) * 0.35 : 0.16 + (1 - k) * 0.36);
      item.hp -= dt * (item.kind === 'ammo' ? 7.0 + k * 16.0 : 4.8 + k * 13.0);
    }
    if (item.hp <= 0) destroyBuildable(env, item);
  }
  return speedMul < 1 || damage > 0 ? { speedMul, damage } : null;
}

function coverAt(x, z) {
  const env = activeEnv;
  if (!env) return null;
  let best = null;
  for (const item of env.buildables) {
    if (!item.alive || !['trench', 'sandbag', 'nest', 'tower', 'ammo', 'bunker'].includes(item.kind)) continue;
    const d = Math.hypot(item.x - x, item.z - z);
    if (d > item.radius) continue;
    const k = 1 - d / item.radius;
    let c;
    if (item.kind === 'trench') c = { kind: item.kind, k, reloadMul: 0.74, rangeMul: 1.12, meleeMul: 0.55, damageMul: 1.0 };
    else if (item.kind === 'sandbag') c = { kind: item.kind, k, reloadMul: 0.86, rangeMul: 1.05, meleeMul: 0.72, damageMul: 1.0 };
    else if (item.kind === 'nest') c = { kind: item.kind, k, reloadMul: 0.52, rangeMul: 1.18, meleeMul: 0.48, damageMul: 1.18 };
    else if (item.kind === 'tower') c = { kind: item.kind, k, reloadMul: 0.82, rangeMul: 1.38, meleeMul: 0.88, damageMul: 1.05 };
    else if (item.kind === 'bunker') c = { kind: item.kind, k, reloadMul: 0.56, rangeMul: 1.24, meleeMul: 0.36, damageMul: 1.12 };
    else c = { kind: item.kind, k, reloadMul: 0.62, rangeMul: 1.0, meleeMul: 0.84, damageMul: 1.08 };
    if (!best || c.k > best.k) best = c;
  }
  return best;
}

function targetVulnerabilityAt(x, z) {
  const env = activeEnv;
  if (!env) return null;
  let best = null;
  for (const item of env.buildables) {
    if (!item.alive || item.kind !== 'floodlight') continue;
    const d = Math.hypot(item.x - x, item.z - z);
    if (d > item.radius) continue;
    const k = 1 - d / item.radius;
    const v = { kind: item.kind, k, damageMul: 1.18 + k * 0.35 };
    if (!best || v.k > best.k) best = v;
  }
  return best;
}

function repairGate(amount = 90) {
  const env = activeEnv;
  if (!env?.gate) return 0;
  const before = env.gate.hp;
  env.gate.hp = clamp(Math.max(0, env.gate.hp) + amount, 0, env.gate.maxHp);
  if (env.gate.broken && env.gate.hp > env.gate.maxHp * 0.22) {
    env.gate.broken = false;
    for (const p of env.gate.parts) p.visible = true;
    placeWallScar(env, 0, WALL_Z, 6);
  }
  return env.gate.hp - before;
}

function gateHealth() {
  const env = activeEnv;
  if (!env?.gate) return 1;
  return clamp(env.gate.hp / env.gate.maxHp, 0, 1);
}

function addTreeline(group) {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x090d10, roughness: 1 });
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x0e171c, roughness: 1 });
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 8, 5);
  const pineGeo = new THREE.ConeGeometry(5.2, 21, 7);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, 120);
  const pines = new THREE.InstancedMesh(pineGeo, treeMat, 120);
  const o = new THREE.Object3D();
  for (let i = 0; i < 120; i++) {
    const x = (rnd() * 2 - 1) * (FIELD_HALF_X + 105);
    const z = NORTH_Z - 12 - rnd() * 82;
    const s = 0.75 + rnd() * 1.15;
    o.position.set(x, 4 * s, z);
    o.rotation.set(0, rnd() * Math.PI, 0);
    o.scale.set(s, s, s);
    o.updateMatrix();
    trunks.setMatrixAt(i, o.matrix);
    o.position.set(x, 13.5 * s, z);
    o.scale.set(s, s, s);
    o.updateMatrix();
    pines.setMatrixAt(i, o.matrix);
  }
  group.add(trunks, pines);

  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 175),
    new THREE.MeshBasicMaterial({
      map: makeHorizonTexture(),
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      fog: false,
    }),
  );
  backdrop.position.set(0, 66, NORTH_Z - 96);
  group.add(backdrop);
}

function addMist(group, mists) {
  const mistTex = makeRadialTexture(256, [
    [0.00, 'rgba(210,230,255,.34)'],
    [0.36, 'rgba(148,175,205,.18)'],
    [0.72, 'rgba(80,105,140,.07)'],
    [1.00, 'rgba(0,0,0,0)'],
  ]);
  const geo = new THREE.PlaneGeometry(1, 1);
  for (let i = 0; i < 34; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: mistTex,
      transparent: true,
      opacity: 0.10 + rnd() * 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const m = new THREE.Mesh(geo, mat);
    const x = (rnd() * 2 - 1) * (FIELD_HALF_X + 40);
    const z = NORTH_Z + 12 + rnd() * 190;
    m.position.set(x, 0.32 + rnd() * 1.4, z);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = rnd() * Math.PI;
    m.scale.set(42 + rnd() * 78, 20 + rnd() * 52, 1);
    m.renderOrder = 2;
    m.userData.speed = 0.04 + rnd() * 0.09;
    m.userData.base = mat.opacity;
    m.userData.phase = rnd() * Math.PI * 2;
    mists.push(m);
    group.add(m);
  }
}

function addSnow(group) {
  const COUNT = 1550;
  const geo = new THREE.BufferGeometry();
  const p = new Float32Array(COUNT * 3);
  const uv = new Float32Array(COUNT * 2);
  const v = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    p[i * 3] = (rnd() * 2 - 1) * (FIELD_HALF_X + 80);
    p[i * 3 + 1] = 5 + rnd() * 128;
    p[i * 3 + 2] = NORTH_Z - 40 + rnd() * 300;
    uv[i * 2] = 0.5;
    uv[i * 2 + 1] = 0.5;
    v[i] = 2.4 + rnd() * 5.2;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const flake = makeRadialTexture(64, [
    [0.00, 'rgba(255,255,255,.95)'],
    [0.26, 'rgba(225,240,255,.68)'],
    [1.00, 'rgba(0,0,0,0)'],
  ]);
  const mat = new THREE.PointsMaterial({
    size: 0.95,
    map: flake,
    transparent: true,
    opacity: 0.74,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    color: 0xcfe6ff,
    fog: false,
  });
  const snow = new THREE.Points(geo, mat);
  snow.frustumCulled = false;
  snow.userData.vel = v;
  group.add(snow);
  return snow;
}

function hideInstance(item) {
  const o = new THREE.Object3D();
  o.position.set(item.x, -9999, item.z);
  o.scale.setScalar(0.001);
  o.updateMatrix();
  item.mesh.setMatrixAt(item.index, o.matrix);
  item.mesh.instanceMatrix.needsUpdate = true;
  item.alive = false;
}

function refreshTerrain(env, x, z, radius, full = false, skipNormals = false) {
  if (!env.terrainGeo) return;
  const pos = env.terrainGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i), vz = -pos.getY(i);
    if (!full && Math.hypot(vx - x, vz - z) > radius) continue;
    if (vz > WALL_Z - WALL_T * 0.5 && vz < Z_BOT + 4 && Math.abs(vx) > GATE_W / 2) continue;
    pos.setZ(i, groundHeight(vx, vz));
  }
  pos.needsUpdate = true;
  if (skipNormals) env.terrainDirty = true;   // batch normals to one recompute/frame
  else env.terrainGeo.computeVertexNormals();
}

// carve a real trench bowl into the dig grid + terrain mesh (units sink in)
function digCarve(x, z, depth = 1.7, radius = 5.2) {
  const env = activeEnv;
  if (!env || !env.dig) return;
  const cx = (x - DIG_X0) / DIG_CELL, cz = (z - DIG_Z0) / DIG_CELL;
  const cr = Math.ceil(radius / DIG_CELL) + 1;
  for (let gz = Math.floor(cz - cr); gz <= cz + cr; gz++) {
    for (let gx = Math.floor(cx - cr); gx <= cx + cr; gx++) {
      if (gx < 0 || gz < 0 || gx >= DIG_W || gz >= DIG_H) continue;
      const wx = DIG_X0 + gx * DIG_CELL, wz = DIG_Z0 + gz * DIG_CELL;
      const d = Math.hypot(wx - x, wz - z);
      const i = gz * DIG_W + gx;
      if (d < radius) {                       // channel floor
        const dig = -depth * Math.cos((d / radius) * Math.PI / 2);
        if (dig < env.dig[i]) env.dig[i] = dig;
      } else if (d < radius + 2.4) {          // small spoil berm at the lip
        const berm = depth * 0.16 * (1 - (d - radius) / 2.4);
        if (env.dig[i] >= 0 && berm > env.dig[i]) env.dig[i] = berm;
      }
    }
  }
  refreshTerrain(env, x, z, radius + 3, false, true);
}

function deformTerrain(env, x, z, radius, depth) {
  if (!env.terrainGeo || depth <= 0) return;
  deforms.push({ x, z, r: radius, delta: -depth, mode: 'bowl' });
  deforms.push({ x, z, r: radius * 1.48, inner: radius * 0.74, delta: depth * 0.28, mode: 'ring' });
  const full = deforms.length > MAX_DEFORMS;
  while (deforms.length > MAX_DEFORMS) deforms.shift();
  refreshTerrain(env, x, z, radius * 1.55, full);
}

function placeGroundScar(env, x, z, radius) {
  const m = env.groundScars[env.groundScarHead++ % env.groundScars.length];
  m.visible = true;
  m.position.set(x, groundHeight(x, z) + 0.06, z);
  m.rotation.set(-Math.PI / 2, 0, rnd() * Math.PI);
  m.scale.set(radius * 2.05, radius * 2.05, 1);
  m.material.opacity = 0.74;
}

function placeWallScar(env, x, z, radius) {
  const m = env.wallScars[env.wallScarHead++ % env.wallScars.length];
  m.visible = true;
  m.position.set(
    clamp(x, -FIELD_HALF_X + 4, FIELD_HALF_X - 4),
    WALL_H * 0.62 + rnd() * 2.6,
    WALL_Z - WALL_T * 0.5 - 0.08,
  );
  m.rotation.set(0, 0, rnd() * Math.PI);
  m.scale.set(radius * 1.55, radius * 1.35, 1);
  m.material.opacity = 0.66;
  if (z > WALL_Z + 1) m.position.z = WALL_Z + WALL_T * 0.5 + 0.08;
}

function spawnDebris(env, x, z, radius, count, stone = false) {
  if (!env.debrisMesh) return;
  const o = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const d = radius * (0.15 + rnd() * 0.95);
    const px = x + Math.cos(a) * d;
    const pz = z + Math.sin(a) * d;
    const s = (stone ? 0.45 : 0.24) + rnd() * (stone ? 1.1 : 0.55);
    o.position.set(px, groundHeight(px, pz) + s * 0.18, pz);
    o.rotation.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
    o.scale.set(s * (0.7 + rnd() * 1.2), s * (0.35 + rnd() * 0.8), s * (0.7 + rnd() * 1.2));
    o.updateMatrix();
    env.debrisMesh.setMatrixAt(env.debrisHead++ % env.debrisMesh.count, o.matrix);
  }
  env.debrisMesh.instanceMatrix.needsUpdate = true;
}

function damageBreakables(env, x, z, radius, damage) {
  const dirty = new Set();
  for (const item of env.breakables) {
    if (!item.alive) continue;
    const d = Math.hypot(item.x - x, item.z - z);
    if (d > radius + (item.kind === 'merlon' ? 8 : 1.5)) continue;
    const hit = damage * (1 - Math.min(d / Math.max(radius, 0.001), 1)) + rnd() * 18;
    item.hp -= hit;
    if (item.hp > 0) continue;
    hideInstance(item);
    dirty.add(item.mesh);
    spawnDebris(env, item.x, item.z, item.kind === 'rock' ? 2.6 : 1.5, item.kind === 'rock' ? 5 : 3, item.kind !== 'stake');
  }
  for (const mesh of dirty) mesh.instanceMatrix.needsUpdate = true;
}

function breakGate(env) {
  if (!env.gate || env.gate.broken) return;
  env.gate.broken = true;
  env.gate.hp = 0;
  for (const p of env.gate.parts) p.visible = false;
  spawnDebris(env, 0, WALL_Z + 1, 11, 34, true);
  placeWallScar(env, 0, WALL_Z, 10);
}

function damageStructures(env, x, z, radius, damage, visible = true) {
  const nearWall = Math.abs(z - WALL_Z) < radius + 10;
  if (!nearWall) return;
  if (visible) placeWallScar(env, x, z, radius);
  if (Math.abs(x) < GATE_W / 2 + 7 && env.gate && !env.gate.broken) {
    env.gate.hp -= damage * 1.35;
    if (env.gate.hp <= 0) breakGate(env);
  }
  if (visible) spawnDebris(env, clamp(x, -FIELD_HALF_X, FIELD_HALF_X), WALL_Z, Math.min(radius, 9), Math.ceil(radius * 1.5), true);
}

function addBlastLight(env, x, y, z, radius) {
  const light = new THREE.PointLight(0xffa45a, 42 + radius * 10, radius * 6, 2);
  light.position.set(x, y + 2.8, z);
  env.group.add(light);
  env.lights.push({ light, t: 0.24 });
}

function blastEnvironment(x, y, z, opts = {}) {
  const env = activeEnv;
  if (!env) return;
  if (z === undefined) {
    z = y;
    y = groundHeight(x, z);
  }
  const radius = opts.radius ?? 8;
  const damage = opts.damage ?? 80;
  const crater = opts.crater ?? 1.15;
  if (opts.visible === false) {
    damageStructures(env, x, z, radius, damage, false);
    return;
  }
  if (crater > 0 && z < WALL_Z - WALL_T * 0.35) deformTerrain(env, x, z, radius * 0.46, crater);
  placeGroundScar(env, x, z, radius);
  spawnDebris(env, x, z, radius, Math.ceil(radius * 2.6), false);
  addBlastLight(env, x, y, z, radius);
  damageBreakables(env, x, z, radius, damage);
  damageStructures(env, x, z, radius, damage, true);
}

export function buildField(scene) {
  const group = new THREE.Group();
  const torches = [];
  const mists = [];
  const placementTargets = [];
  const env = {
    group,
    breakables: [],
    groundScars: [],
    wallScars: [],
    lights: [],
    groundScarHead: 0,
    wallScarHead: 0,
    debrisHead: 0,
    buildId: 0,
    buildables: [],
    dig: new Float32Array(DIG_W * DIG_H),
    terrainDirty: false,
  };
  activeEnv = env;
  const terrain = addTerrain(group, placementTargets, env);
  const { wall, gate } = addWall(group, torches, placementTargets, env);
  addDefenses(group, env);
  addRocks(group, env);
  addDestructionPools(group, env);
  addTreeline(group);
  addMist(group, mists);
  const snow = addSnow(group);

  scene.add(group);

  let time = 0;
  function update(dt) {
    time += dt;
    if (env.terrainDirty) { env.terrainGeo.computeVertexNormals(); env.terrainDirty = false; }
    for (const item of torches) {
      const f = 0.78 + Math.sin(time * 9.5 + item.torch.userData.phase) * 0.15 + Math.sin(time * 23 + item.torch.userData.phase) * 0.07;
      item.light.intensity = item.base * f;
      item.flame.material.opacity = 0.62 + f * 0.22;
      const s = 0.84 + f * 0.18;
      item.flame.scale.set(s * (0.92 + Math.sin(time * 17 + item.torch.userData.phase) * 0.04), s, 1);
    }

    for (const m of mists) {
      m.position.x += m.userData.speed * dt * 6;
      if (m.position.x > FIELD_HALF_X + 78) m.position.x = -FIELD_HALF_X - 78;
      m.rotation.z += dt * 0.008;
      m.material.opacity = m.userData.base * (0.72 + Math.sin(time * 0.5 + m.userData.phase) * 0.18);
    }

    for (let i = env.lights.length - 1; i >= 0; i--) {
      const b = env.lights[i];
      b.t -= dt;
      b.light.intensity *= Math.pow(0.02, dt / 0.24);
      if (b.t <= 0) {
        env.group.remove(b.light);
        b.light.dispose?.();
        env.lights.splice(i, 1);
      }
    }

    for (const m of env.groundScars) if (m.visible && m.material.opacity > 0.18) m.material.opacity -= dt * 0.012;
    for (const m of env.wallScars) if (m.visible && m.material.opacity > 0.14) m.material.opacity -= dt * 0.018;

    const pos = snow.geometry.attributes.position;
    const arr = pos.array, vel = snow.userData.vel;
    for (let i = 0; i < vel.length; i++) {
      const ix = i * 3;
      arr[ix] += Math.sin(time * 0.85 + i * 1.17) * dt * 0.55 - dt * 0.7;
      arr[ix + 1] -= vel[i] * dt;
      arr[ix + 2] += dt * 2.2;
      if (arr[ix + 1] < 0.4 || arr[ix + 2] > 95 || arr[ix] < -FIELD_HALF_X - 95) {
        arr[ix] = (rnd() * 2 - 1) * (FIELD_HALF_X + 85);
        arr[ix + 1] = 78 + rnd() * 70;
        arr[ix + 2] = NORTH_Z - 72 + rnd() * 58;
      }
    }
    pos.needsUpdate = true;
  }

  return {
    group, terrain, wall, gate,
    wallZ: WALL_Z, bounds: BOUNDS, placementTargets,
    heightAt,
    blast: blastEnvironment,
    damageEnvironment: blastEnvironment,
    placeBuildable,
    canPlaceBuildable: (kind, x, z) => canPlaceBuildable(env, kind, x, z),
    buildPressure,
    coverAt,
    targetVulnerabilityAt,
    emplacements: () => (activeEnv ? activeEnv.buildables.filter(b => b.alive && (b.kind === 'nest' || b.kind === 'tower' || b.kind === 'bunker')) : []),
    repairGate,
    gateHealth,
    works: () => env.buildables.filter(b => b.alive).length,
    update,
  };
}
