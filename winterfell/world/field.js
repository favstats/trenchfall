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

export function heightAt(x, z) {
  const onSpan = Math.abs(x) <= FIELD_HALF_X && Math.abs(x) >= GATE_W / 2 + 0.5;
  if (onSpan && z >= WALL_Z - WALL_T / 2 && z <= Z_TOP) return WALL_H;
  if (onSpan && z > Z_TOP && z <= Z_BOT) {
    const k = (z - Z_TOP) / RAMP_D;
    return lerp(WALL_H, terrainHeight(x, z), k);
  }
  return terrainHeight(x, z);
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
      d[i] = lerp(176, 78, mud);
      d[i + 1] = lerp(190, 86, mud);
      d[i + 2] = lerp(207, 96, mud);
      d[i + 3] = clamp(mud * 230, 0, 220);
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
  const ground0 = terrainHeight(x0, Z_BOT);
  const ground1 = terrainHeight(x1, Z_BOT);
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

function addTerrain(group, placementTargets) {
  const geo = new THREE.PlaneGeometry(900, 900, 176, 176);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = -pos.getY(i);
    pos.setZ(i, terrainHeight(x, z));
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

function addWall(group, torches, placementTargets) {
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
    map: makeSnowTexture(),
    color: 0xc8d3df,
    roughness: 1,
    metalness: 0,
  });
  rampMat.map.repeat.set(9, 2);

  const wall = new THREE.Group();
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
  const plankGeo = new THREE.BoxGeometry(0.5, WALL_H + 0.9, 1.38);
  const planks = new THREE.InstancedMesh(plankGeo, gateMat, 18);
  for (let i = 0; i < 18; i++) {
    o.position.set(-GATE_W / 2 + 1 + i * ((GATE_W - 2) / 17), (WALL_H + 0.9) / 2, WALL_Z + 0.82);
    o.rotation.set(0, 0, 0);
    o.updateMatrix();
    planks.setMatrixAt(i, o.matrix);
  }
  gate.add(planks);
  for (const y of [3.15, 6.7]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(GATE_W - 2.2, 0.42, 1.48), iron);
    band.position.set(0, y, WALL_Z + 1.52);
    gate.add(band);
  }
  for (const x of [-3.2, 3.2]) {
    const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.42, WALL_H - 1, 1.55), iron);
    hinge.position.set(x, WALL_H / 2, WALL_Z + 1.55);
    gate.add(hinge);
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

  return { wall, gate };
}

function addTorches(wall, torches) {
  const flameTex = makeRadialTexture(128, [
    [0.00, 'rgba(255,255,220,1)'],
    [0.18, 'rgba(255,194,86,.88)'],
    [0.45, 'rgba(255,76,26,.46)'],
    [1.00, 'rgba(0,0,0,0)'],
  ]);
  const flameGeo = new THREE.PlaneGeometry(3.7, 5.2);
  const bowlGeo = new THREE.CylinderGeometry(0.7, 0.48, 0.55, 8);
  const bowlMat = new THREE.MeshStandardMaterial({ color: 0x151311, roughness: 0.5, metalness: 0.75 });
  const xs = [-132, -96, -60, -24, 24, 60, 96, 132];
  for (const x of xs) {
    const torch = new THREE.Group();
    torch.position.set(x, WALL_H + 2.7, WALL_Z + 2.55);
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
    const light = new THREE.PointLight(0xff9d46, 8.5, 42, 1.9);
    light.position.set(0, 1.6, 1.2);
    torch.add(light);
    torch.userData.phase = rnd() * Math.PI * 2;
    torches.push({ torch, flame, light, base: 8.5 + rnd() * 1.8 });
    wall.add(torch);
  }
}

function addDefenses(group) {
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
    stakes.setMatrixAt(i, o.matrix);
  }
  for (let i = 0; i < 95; i++) {
    const x = -FIELD_HALF_X + rnd() * FIELD_HALF_X * 2;
    const z = WALL_Z - 16 - rnd() * 72;
    o.position.set(x, terrainHeight(x, z) + 0.8, z);
    o.rotation.set((rnd() - 0.5) * 0.32, rnd() * Math.PI, (rnd() - 0.5) * 0.22);
    const s = 0.75 + rnd() * 0.75;
    o.scale.set(s, s, s);
    o.updateMatrix();
    shards.setMatrixAt(i, o.matrix);
  }
  stakes.castShadow = true;
  shards.castShadow = true;
  group.add(stakes, shards);
}

function addRocks(group) {
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x5b626b, roughness: 0.96, metalness: 0 });
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const rocks = new THREE.InstancedMesh(geo, rockMat, 82);
  const o = new THREE.Object3D();
  for (let i = 0; i < 82; i++) {
    const x = (rnd() * 2 - 1) * (FIELD_HALF_X + 28);
    const z = NORTH_Z + 15 + rnd() * 205;
    const s = 0.45 + rnd() * 2.4;
    o.position.set(x, terrainHeight(x, z) + s * 0.25, z);
    o.rotation.set(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
    o.scale.set(s * (0.8 + rnd() * 1.6), s * (0.32 + rnd() * 0.5), s * (0.7 + rnd() * 1.4));
    o.updateMatrix();
    rocks.setMatrixAt(i, o.matrix);
  }
  rocks.castShadow = rocks.receiveShadow = true;
  group.add(rocks);
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
  const v = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    p[i * 3] = (rnd() * 2 - 1) * (FIELD_HALF_X + 80);
    p[i * 3 + 1] = 5 + rnd() * 128;
    p[i * 3 + 2] = NORTH_Z - 40 + rnd() * 300;
    v[i] = 2.4 + rnd() * 5.2;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
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

export function buildField(scene) {
  const group = new THREE.Group();
  const torches = [];
  const mists = [];
  const placementTargets = [];
  const terrain = addTerrain(group, placementTargets);
  const { wall, gate } = addWall(group, torches, placementTargets);
  addDefenses(group);
  addRocks(group);
  addTreeline(group);
  addMist(group, mists);
  const snow = addSnow(group);

  scene.add(group);

  let time = 0;
  function update(dt) {
    time += dt;
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

  return { group, terrain, wall, gate, wallZ: WALL_Z, bounds: BOUNDS, placementTargets, heightAt, update };
}
