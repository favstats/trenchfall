// world.js — the three levels, stacked vertically in one scene and built from
// the painted textures: the endless YELLOW ROOMS (level 0), the sodium dark of
// the GARAGE (level 1), and the blinding POOLROOMS (level 2). One analytic
// AABB list per zone doubles as collision. A pool of six real point lights
// follows the player from fixture to fixture — the world only spends light
// where you are, so every room you're in is lit and everything else recedes.
import * as THREE from './engine/three.js';

const CELL = 6, GRID = 16;                 // yellow rooms: 96m x 96m of office
export const ZONE_Y = [0, -30, -60];
const WALL_H = 3.0;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- level 0 --
function buildYellowRooms(scene, tex, rnd) {
  const g = new THREE.Group();
  const y0 = ZONE_Y[0];
  const half = (GRID * CELL) / 2;
  const aabbs = [];

  // floor / ceiling
  const floorMat = new THREE.MeshLambertMaterial({ map: tex.carpet });
  tex.carpet.repeat.set(GRID * 2, GRID * 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(GRID * CELL, GRID * CELL), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = y0;
  const ceilMat = new THREE.MeshLambertMaterial({ map: tex.ceiling });
  tex.ceiling.repeat.set(GRID * 1.5, GRID * 1.5);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(GRID * CELL, GRID * CELL), ceilMat);
  ceil.rotation.x = Math.PI / 2; ceil.position.y = y0 + WALL_H;
  g.add(floor, ceil);

  // interior walls: knock cells together at random, then guarantee that every
  // cell can reach the spawn by punching doors toward reached neighbours
  const hWall = Array.from({ length: GRID + 1 }, () => new Array(GRID).fill(true));  // between (x,z-1)-(x,z)
  const vWall = Array.from({ length: GRID }, () => new Array(GRID + 1).fill(true));  // between (x-1,z)-(x,z)
  for (let z = 1; z < GRID; z++) for (let x = 0; x < GRID; x++) if (rnd() < 0.62) hWall[z][x] = false;
  for (let z = 0; z < GRID; z++) for (let x = 1; x < GRID; x++) if (rnd() < 0.62) vWall[z][x] = false;
  // flood fill from spawn cell
  const reach = Array.from({ length: GRID }, () => new Array(GRID).fill(false));
  const stack = [[1, 1]]; reach[1][1] = true;
  while (stack.length) {
    const [cx, cz] = stack.pop();
    if (cz > 0 && !hWall[cz][cx] && !reach[cz - 1][cx]) { reach[cz - 1][cx] = true; stack.push([cx, cz - 1]); }
    if (cz < GRID - 1 && !hWall[cz + 1][cx] && !reach[cz + 1][cx]) { reach[cz + 1][cx] = true; stack.push([cx, cz + 1]); }
    if (cx > 0 && !vWall[cz][cx] && !reach[cz][cx - 1]) { reach[cz][cx - 1] = true; stack.push([cx - 1, cz]); }
    if (cx < GRID - 1 && !vWall[cz][cx + 1] && !reach[cz][cx + 1]) { reach[cz][cx + 1] = true; stack.push([cx + 1, cz]); }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) {
      if (reach[z][x]) continue;
      if (z > 0 && reach[z - 1][x]) { hWall[z][x] = false; }
      else if (x > 0 && reach[z][x - 1]) { vWall[z][x] = false; }
      else continue;
      reach[z][x] = true; changed = true;
    }
  }

  // gather wall segments (skip a few for doorway gaps even where walls stand)
  const segs = [];
  const cx0 = (i) => -half + i * CELL;
  for (let z = 0; z <= GRID; z++) for (let x = 0; x < GRID; x++) {
    const border = z === 0 || z === GRID;
    if (!border && !hWall[z][x]) continue;
    if (!border && rnd() < 0.18) continue;                       // random doorway
    segs.push({ x: cx0(x) + CELL / 2, z: cx0(z), sx: CELL, sz: 0.3 });
  }
  for (let x = 0; x <= GRID; x++) for (let z = 0; z < GRID; z++) {
    const border = x === 0 || x === GRID;
    if (!border && !vWall[z][x]) continue;
    if (!border && rnd() < 0.18) continue;
    segs.push({ x: cx0(x), z: cx0(z) + CELL / 2, sx: 0.3, sz: CELL });
  }

  const wallMat = new THREE.MeshLambertMaterial({ map: tex.wallpaper });
  tex.wallpaper.repeat.set(3, 1.5);
  const wallGeo = new THREE.BoxGeometry(1, 1, 1);
  const walls = new THREE.InstancedMesh(wallGeo, wallMat, segs.length);
  const o = new THREE.Object3D();
  segs.forEach((s, i) => {
    o.position.set(s.x, y0 + WALL_H / 2, s.z);
    o.scale.set(Math.max(s.sx, 0.3), WALL_H, Math.max(s.sz, 0.3));
    o.updateMatrix();
    walls.setMatrixAt(i, o.matrix);
    aabbs.push({ x1: s.x - s.sx / 2 - 0.15, z1: s.z - s.sz / 2 - 0.15, x2: s.x + s.sx / 2 + 0.15, z2: s.z + s.sz / 2 + 0.15 });
  });
  g.add(walls);

  // fluorescent panels — the grid of sick light
  const fixtures = [];
  const panelGeo = new THREE.PlaneGeometry(2.2, 1.1);
  const panelMat = new THREE.MeshBasicMaterial({ color: 0xfff6cf });
  for (let z = 0; z < GRID; z += 2) for (let x = 0; x < GRID; x += 2) {
    const px = cx0(x) + CELL, pz = cx0(z) + CELL;
    const p = new THREE.Mesh(panelGeo, panelMat);
    p.rotation.x = Math.PI / 2;
    p.position.set(px, y0 + WALL_H - 0.02, pz);
    g.add(p);
    fixtures.push({ x: px, y: y0 + WALL_H - 0.5, z: pz, color: 0xfff2b8, base: 20, phase: rnd() * 100 });
  }

  // the way down: a ragged dark pit in the far corner, hazard-striped
  const exit = { x: cx0(GRID - 2) + CELL / 2, z: cx0(GRID - 2) + CELL / 2, r: 2.2 };
  const hole = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  hole.rotation.x = -Math.PI / 2; hole.position.set(exit.x, y0 + 0.02, exit.z);
  const rim = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.6, 24),
    new THREE.MeshBasicMaterial({ color: 0x3a3320 }));
  rim.rotation.x = -Math.PI / 2; rim.position.set(exit.x, y0 + 0.03, exit.z);
  g.add(hole, rim);

  scene.add(g);
  return {
    name: 'THE YELLOW ROOMS', sub: 'level 0 · it hums', surface: 'carpet',
    y: y0, spawn: { x: cx0(1) + CELL / 2, z: cx0(1) + CELL / 2 },
    bounds: { x1: -half + 0.6, z1: -half + 0.6, x2: half - 0.6, z2: half - 0.6 },
    aabbs, fixtures, exit,
    // the iconic look is BRIGHT: flat, even, sick-yellow, nowhere to hide
    ambient: { sky: 0xa89448, gnd: 0x6a5c2a, i: 1.25, fog: 0x9a8840, fogD: 0.04, lightColor: 0xffe9a0 },
    hum: 1, dark: false,
  };
}

// ---------------------------------------------------------------- level 1 --
function buildGarage(scene, tex, rnd) {
  const g = new THREE.Group();
  const y0 = ZONE_Y[1];
  const W = 110, D = 84, H = 3.3;
  const aabbs = [];

  tex.concrete.repeat.set(18, 14);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: tex.concrete }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = y0;
  const ceilM = new THREE.MeshLambertMaterial({ color: 0x3c3c40 });
  const ceilP = new THREE.Mesh(new THREE.PlaneGeometry(W, D), ceilM);
  ceilP.rotation.x = Math.PI / 2; ceilP.position.y = y0 + H;
  g.add(floor, ceilP);

  // perimeter
  const wallMat = new THREE.MeshLambertMaterial({ map: tex.concreteWall });
  tex.concreteWall.repeat.set(8, 1);
  for (const [x, z, sx, sz] of [[0, -D / 2, W, 0.4], [0, D / 2, W, 0.4], [-W / 2, 0, 0.4, D], [W / 2, 0, 0.4, D]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, H, sz), wallMat);
    m.position.set(x, y0 + H / 2, z);
    g.add(m);
    aabbs.push({ x1: x - sx / 2 - 0.2, z1: z - sz / 2 - 0.2, x2: x + sx / 2 + 0.2, z2: z + sz / 2 + 0.2 });
  }

  // column grid + beams + parking stripes
  const colGeo = new THREE.BoxGeometry(0.9, H, 0.9);
  const cols = [];
  for (let x = -W / 2 + 10; x <= W / 2 - 10; x += 10) for (let z = -D / 2 + 9; z <= D / 2 - 9; z += 12) cols.push([x, z]);
  const colMesh = new THREE.InstancedMesh(colGeo, wallMat, cols.length);
  const o = new THREE.Object3D();
  cols.forEach(([x, z], i) => {
    o.position.set(x, y0 + H / 2, z); o.scale.set(1, 1, 1); o.updateMatrix();
    colMesh.setMatrixAt(i, o.matrix);
    aabbs.push({ x1: x - 0.65, z1: z - 0.65, x2: x + 0.65, z2: z + 0.65 });
  });
  g.add(colMesh);

  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xb0a878 });
  for (let x = -W / 2 + 6; x <= W / 2 - 6; x += 4) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 5), stripeMat);
    s.rotation.x = -Math.PI / 2; s.position.set(x, y0 + 0.01, -D / 2 + 8);
    const s2 = s.clone(); s2.position.z = D / 2 - 8;
    g.add(s, s2);
  }

  // puddles: near-black gloss that catches the sodium lights
  const pudMat = new THREE.MeshPhongMaterial({ color: 0x0a0a0c, shininess: 220, specular: 0xffa050, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 16; i++) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(1.2 + rnd() * 2.4, 20), pudMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set((rnd() - 0.5) * (W - 16), y0 + 0.015, (rnd() - 0.5) * (D - 14));
    p.scale.x = 1 + rnd();
    g.add(p);
  }

  // pipes along the ceiling
  const pipeMat = new THREE.MeshLambertMaterial({ color: 0x4a4a50 });
  for (let i = 0; i < 5; i++) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12 + rnd() * 0.1, 0.12, W - 6, 8), pipeMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, y0 + H - 0.25 - rnd() * 0.3, -D / 2 + 6 + i * (D / 5.2));
    g.add(pipe);
  }

  // sparse sodium fixtures — pools of orange with long dark between
  const fixtures = [];
  const fixGeo = new THREE.BoxGeometry(1.4, 0.12, 0.3);
  const fixMat = new THREE.MeshBasicMaterial({ color: 0xffb35c });
  for (let x = -W / 2 + 10; x <= W / 2 - 8; x += 13) for (let z = -D / 2 + 8; z <= D / 2 - 8; z += 12) {
    const f = new THREE.Mesh(fixGeo, fixMat);
    f.position.set(x, y0 + H - 0.1, z);
    g.add(f);
    fixtures.push({ x, y: y0 + H - 0.6, z, color: 0xff9a3c, base: 18, phase: rnd() * 100 });
  }

  // EXIT: a glowing stair door in the far wall
  const exit = { x: W / 2 - 3, z: D / 2 - 6, r: 2.4 };
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.6), new THREE.MeshBasicMaterial({ color: 0x061206 }));
  door.position.set(exit.x + 2.2, y0 + 1.3, exit.z); door.rotation.y = -Math.PI / 2;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.4), new THREE.MeshBasicMaterial({ color: 0x49ff6a }));
  sign.position.set(exit.x + 2.15, y0 + 2.75, exit.z); sign.rotation.y = -Math.PI / 2;
  g.add(door, sign);
  fixtures.push({ x: exit.x, y: y0 + 2.4, z: exit.z, color: 0x49ff6a, base: 6, phase: 0 });

  scene.add(g);
  return {
    name: 'THE GARAGE', sub: 'level 1 · keep to the light', surface: 'concrete',
    y: y0, spawn: { x: -W / 2 + 8, z: -D / 2 + 8 },
    bounds: { x1: -W / 2 + 1, z1: -D / 2 + 1, x2: W / 2 - 1, z2: D / 2 - 1 },
    aabbs, fixtures, exit,
    ambient: { sky: 0x3c342a, gnd: 0x121216, i: 0.52, fog: 0x0e0c0a, fogD: 0.038, lightColor: 0xff9a3c },
    hum: 0.4, dark: true,
  };
}

// ---------------------------------------------------------------- level 2 --
function buildPoolrooms(scene, tex, rnd) {
  const g = new THREE.Group();
  const y0 = ZONE_Y[2];
  const W = 88, D = 66, H = 5.2;
  const aabbs = [];

  tex.tile.repeat.set(22, 17);
  const tileMat = new THREE.MeshLambertMaterial({ map: tex.tile });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), tileMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = y0;
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), tileMat.clone());
  ceil.rotation.x = Math.PI / 2; ceil.position.y = y0 + H;
  g.add(floor, ceil);

  const wallMat = tileMat.clone();
  for (const [x, z, sx, sz] of [[0, -D / 2, W, 0.5], [0, D / 2, W, 0.5], [-W / 2, 0, 0.5, D], [W / 2, 0, 0.5, D]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, H, sz), wallMat);
    m.position.set(x, y0 + H / 2, z);
    g.add(m);
    aabbs.push({ x1: x - sx / 2 - 0.2, z1: z - sz / 2 - 0.2, x2: x + sx / 2 + 0.2, z2: z + sz / 2 + 0.2 });
  }
  // internal dividers with wide arch gaps — chambers, not corridors
  for (const [x, z, sx, sz] of [
    [-W / 4, -D / 6, 0.6, D * 0.42], [W / 5, D / 5, W * 0.4, 0.6],
    [W / 3.2, -D / 4, 0.6, D * 0.3], [-W / 6, D / 3, W * 0.3, 0.6],
  ]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, H, sz), wallMat);
    m.position.set(x, y0 + H / 2, z);
    g.add(m);
    aabbs.push({ x1: x - sx / 2 - 0.2, z1: z - sz / 2 - 0.2, x2: x + sx / 2 + 0.2, z2: z + sz / 2 + 0.2 });
  }

  // water: sunken pools with an animated shader surface
  const waterUniforms = { uTime: { value: 0 } };
  const waterMat = new THREE.ShaderMaterial({
    uniforms: waterUniforms, transparent: true,
    vertexShader: /* glsl */`
      uniform float uTime;
      varying vec2 vUv; varying float vW;
      void main() {
        vUv = uv;
        vec3 p = position;
        vW = sin(p.x * 1.4 + uTime * 1.1) * sin(p.y * 1.7 - uTime * 0.9);
        p.z += vW * 0.045;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      varying vec2 vUv; varying float vW;
      void main() {
        float sparkle = pow(max(0.0, sin(vUv.x * 60.0 + uTime * 2.0) * sin(vUv.y * 52.0 - uTime * 1.7)), 6.0);
        vec3 c = mix(vec3(0.32, 0.62, 0.66), vec3(0.55, 0.85, 0.88), 0.5 + vW * 0.5);
        gl_FragColor = vec4(c + sparkle * 0.5, 0.62);
      }`,
  });
  const pools = [[-W / 4 + 12, 8, 20, 14], [W / 4, -D / 5, 24, 12], [-W / 3, -D / 4, 14, 10]];
  const pudRims = [];
  for (const [px, pz, pw, pd] of pools) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd, 24, 24), waterMat);
    w.rotation.x = -Math.PI / 2;
    w.position.set(px, y0 + 0.1, pz);
    g.add(w);
    pudRims.push([px, pz, pw, pd]);
  }

  // caustic light webs crawling the floor by the pools
  const caus = [];
  tex.caustics.repeat.set(3, 3);
  for (const [px, pz, pw, pd] of pudRims) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(pw + 10, pd + 10),
      new THREE.MeshBasicMaterial({ map: tex.caustics, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
    c.rotation.x = -Math.PI / 2;
    c.position.set(px, y0 + 0.03, pz);
    g.add(c); caus.push(c);
  }

  // skylight wells: bright panels + volumetric shafts of noon that never moves
  const fixtures = [];
  const shaftMat = new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (const [sx, sz] of [[-W / 4 + 12, 8], [W / 4, -D / 5], [-W / 3, D / 4], [W / 3.4, D / 3.6], [4, -4]]) {
    const well = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), new THREE.MeshBasicMaterial({ color: 0xf4fbff }));
    well.rotation.x = Math.PI / 2; well.position.set(sx, y0 + H - 0.02, sz);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.1, H, 16, 1, true), shaftMat);
    shaft.position.set(sx, y0 + H / 2, sz);
    g.add(well, shaft);
    fixtures.push({ x: sx, y: y0 + H - 0.8, z: sz, color: 0xf0faff, base: 26, phase: Math.random() * 100 });
  }

  // the way out: a red door, unmistakable, far corner
  const exit = { x: W / 2 - 5, z: -D / 2 + 6, r: 2.2 };
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.8), new THREE.MeshBasicMaterial({ color: 0x8a1612 }));
  door.position.set(exit.x + 2.5, y0 + 1.4, exit.z); door.rotation.y = -Math.PI / 2;
  const frame = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 3.2), new THREE.MeshBasicMaterial({ color: 0xf3f3f0 }));
  frame.position.set(exit.x + 2.52, y0 + 1.5, exit.z); frame.rotation.y = -Math.PI / 2;
  g.add(frame, door);
  fixtures.push({ x: exit.x, y: y0 + 2.6, z: exit.z, color: 0xff6a5c, base: 8, phase: 0 });

  scene.add(g);
  return {
    name: 'THE POOLROOMS', sub: 'level 37 · the water is warm', surface: 'tile',
    y: y0, spawn: { x: -W / 2 + 7, z: D / 2 - 7 },
    bounds: { x1: -W / 2 + 1, z1: -D / 2 + 1, x2: W / 2 - 1, z2: D / 2 - 1 },
    aabbs, fixtures, exit,
    ambient: { sky: 0xcfe4ea, gnd: 0x7c979e, i: 1.0, fog: 0xd7e9ee, fogD: 0.03, lightColor: 0xf0faff },
    hum: 0.15, dark: false,
    _water: waterUniforms, _caus: caus,
  };
}

// ------------------------------------------------------------------ world --
export function buildWorld(scene, tex) {
  const rnd = mulberry(1998);
  const zones = [buildYellowRooms(scene, tex, rnd), buildGarage(scene, tex, rnd), buildPoolrooms(scene, tex, rnd)];

  // the travelling light pool: six real lights that jump to the fixtures
  // nearest the player — infinite rooms, finite watts
  const lights = [];
  for (let i = 0; i < 6; i++) {
    const L = new THREE.PointLight(0xffffff, 0, 26, 1.8);
    scene.add(L); lights.push(L);
  }
  const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0.6);
  scene.add(hemi);
  scene.fog = new THREE.FogExp2(0x9a8840, 0.05);

  let flickerTimer = 0, flickering = -1;

  function setZoneMood(z) {
    const a = z.ambient;
    hemi.color.setHex(a.sky); hemi.groundColor.setHex(a.gnd); hemi.intensity = a.i;
    scene.fog.color.setHex(a.fog); scene.fog.density = a.fogD;
    scene.background = new THREE.Color(a.fog);
  }

  function update(dt, playerPos, zi, t) {
    const z = zones[zi];
    // nearest fixtures get the wattage
    const near = z.fixtures
      .map(f => ({ f, d: (f.x - playerPos.x) ** 2 + (f.z - playerPos.z) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, lights.length);
    flickerTimer -= dt;
    if (flickerTimer <= 0) { flickerTimer = 1.5 + Math.random() * 4; flickering = (Math.random() * near.length) | 0; }
    near.forEach(({ f }, i) => {
      const L = lights[i];
      L.position.set(f.x, f.y, f.z);
      L.color.setHex(f.color);
      let k = 1;
      if (i === flickering && flickerTimer > 0.9) k = 0.35 + Math.abs(Math.sin(t * 43 + f.phase)) * 0.65;
      L.intensity = f.base * k;
    });
    for (let i = near.length; i < lights.length; i++) lights[i].intensity = 0;

    // poolrooms: water + crawling caustics
    const pr = zones[2];
    pr._water.uTime.value = t;
    for (const c of pr._caus) { c.material.map.offset.set(Math.sin(t * 0.11) * 0.2, t * 0.014); }
    return flickering >= 0 && flickerTimer > 0.9 && near[flickering] &&
      ((near[flickering].f.x - playerPos.x) ** 2 + (near[flickering].f.z - playerPos.z) ** 2) < 130;
  }

  return { zones, update, setZoneMood };
}
