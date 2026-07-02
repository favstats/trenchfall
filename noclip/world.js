// world.js — five levels, stacked vertically in one scene, each with its own
// wrongness. The architecture misbehaves on purpose: pillar forests, ceiling
// voids trailing dead wires, tilted walls, doorframes to nowhere, clocks that
// disagree, an EXIT sign that lies. And there is STUFF — chairs, static-filled
// TVs, a phone that rings, balloons, drowned mannequins, almond water.
// One AABB list per zone doubles as collision; six pooled lights follow you.
import * as THREE from './engine/three.js';
import * as P from './props.js';

const CELL = 6, GRID = 16;
export const ZONE_Y = [0, -30, -60, -90, -120];
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

// shared maze generator with guaranteed reachability (flood fill + door punch)
function mazeSegs(rnd, open = 0.62, doorway = 0.18) {
  const hWall = Array.from({ length: GRID + 1 }, () => new Array(GRID).fill(true));
  const vWall = Array.from({ length: GRID }, () => new Array(GRID + 1).fill(true));
  for (let z = 1; z < GRID; z++) for (let x = 0; x < GRID; x++) if (rnd() < open) hWall[z][x] = false;
  for (let z = 0; z < GRID; z++) for (let x = 1; x < GRID; x++) if (rnd() < open) vWall[z][x] = false;
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
      if (z > 0 && reach[z - 1][x]) hWall[z][x] = false;
      else if (x > 0 && reach[z][x - 1]) vWall[z][x] = false;
      else continue;
      reach[z][x] = true; changed = true;
    }
  }
  const half = (GRID * CELL) / 2;
  const cx0 = (i) => -half + i * CELL;
  const segs = [];
  for (let z = 0; z <= GRID; z++) for (let x = 0; x < GRID; x++) {
    const border = z === 0 || z === GRID;
    if (!border && !hWall[z][x]) continue;
    if (!border && rnd() < doorway) continue;
    segs.push({ x: cx0(x) + CELL / 2, z: cx0(z), sx: CELL, sz: 0.3 });
  }
  for (let x = 0; x <= GRID; x++) for (let z = 0; z < GRID; z++) {
    const border = x === 0 || x === GRID;
    if (!border && !vWall[z][x]) continue;
    if (!border && rnd() < doorway) continue;
    segs.push({ x: cx0(x), z: cx0(z) + CELL / 2, sx: 0.3, sz: CELL });
  }
  return { segs, cx0, half };
}

function instanceWalls(g, segs, mat, aabbs, y0, rnd, weird = false) {
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, segs.length);
  const o = new THREE.Object3D();
  segs.forEach((s, i) => {
    // weirdness: some walls tilt, some fall short of the ceiling
    const tilt = weird && rnd() < 0.07 ? (rnd() - 0.5) * 0.12 : 0;
    const h = weird && rnd() < 0.05 ? WALL_H * 0.72 : WALL_H;
    o.position.set(s.x, y0 + h / 2, s.z);
    o.rotation.set(0, 0, tilt);
    o.scale.set(Math.max(s.sx, 0.3), h, Math.max(s.sz, 0.3));
    o.updateMatrix();
    walls.setMatrixAt(i, o.matrix);
    aabbs.push({ x1: s.x - s.sx / 2 - 0.15, z1: s.z - s.sz / 2 - 0.15, x2: s.x + s.sx / 2 + 0.15, z2: s.z + s.sz / 2 + 0.15 });
  });
  g.add(walls);
}

function addProp(g, zone, mesh, x, z, ry = 0, collide = 0) {
  mesh.position.set(x, zone.y, z);
  mesh.rotation.y = ry;
  g.add(mesh);
  if (mesh.userData.update) zone.props.push(mesh);
  if (collide > 0) zone.aabbs.push({ x1: x - collide, z1: z - collide, x2: x + collide, z2: z + collide });
  return mesh;
}

function graffiti(g, text, x, y, z, ry, opts = {}) {
  const t = P.textPlane(text, opts.w || 2.2, opts.h || 0.6, { color: opts.color || 'rgba(40,30,16,0.75)', font: opts.font || 'cursive', size: opts.size || 48 });
  t.position.set(x, y, z);
  t.rotation.y = ry;
  g.add(t);
}

// ---------------------------------------------------------------- level 0 --
function buildYellowRooms(scene, tex, rnd) {
  const g = new THREE.Group();
  const y0 = ZONE_Y[0];
  const zone = {
    name: 'THE YELLOW ROOMS', sub: 'level 0 · it hums', surface: 'carpet',
    y: y0, aabbs: [], fixtures: [], props: [], pickups: [],
    ambient: { sky: 0xa89448, gnd: 0x6a5c2a, i: 1.25, fog: 0x9a8840, fogD: 0.04, lightColor: 0xffe9a0 },
    hum: 1, dark: false,
  };
  const { segs, cx0, half } = mazeSegs(rnd);
  zone.spawn = { x: cx0(1) + CELL / 2, z: cx0(1) + CELL / 2 };
  zone.bounds = { x1: -half + 0.6, z1: -half + 0.6, x2: half - 0.6, z2: half - 0.6 };

  const floorMat = new THREE.MeshLambertMaterial({ map: tex.carpet });
  tex.carpet.repeat.set(GRID * 2, GRID * 2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(GRID * CELL, GRID * CELL), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = y0;
  const ceilMat = new THREE.MeshLambertMaterial({ map: tex.ceiling });
  tex.ceiling.repeat.set(GRID * 1.5, GRID * 1.5);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(GRID * CELL, GRID * CELL), ceilMat);
  ceil.rotation.x = Math.PI / 2; ceil.position.y = y0 + WALL_H;
  g.add(floor, ceil);

  const wallMat = new THREE.MeshLambertMaterial({ map: tex.wallpaper });
  tex.wallpaper.repeat.set(3, 1.5);
  instanceWalls(g, segs, wallMat, zone.aabbs, y0, rnd, true);

  // fluorescents
  const panelGeo = new THREE.PlaneGeometry(2.2, 1.1);
  const panelMat = new THREE.MeshBasicMaterial({ color: 0xfff6cf });
  for (let z = 0; z < GRID; z += 2) for (let x = 0; x < GRID; x += 2) {
    const px = cx0(x) + CELL, pz = cx0(z) + CELL;
    const p = new THREE.Mesh(panelGeo, panelMat);
    p.rotation.x = Math.PI / 2;
    p.position.set(px, y0 + WALL_H - 0.02, pz);
    g.add(p);
    zone.fixtures.push({ x: px, y: y0 + WALL_H - 0.5, z: pz, color: 0xfff2b8, base: 20, phase: rnd() * 100 });
  }

  // ---- ARCHITECTURAL WRONGNESS ----
  // pillar forests: cells where columns grow like teeth
  const colMat = new THREE.MeshLambertMaterial({ map: tex.wallpaper });
  for (let i = 0; i < 6; i++) {
    const cxx = cx0(2 + ((rnd() * (GRID - 4)) | 0)) + CELL / 2;
    const czz = cx0(2 + ((rnd() * (GRID - 4)) | 0)) + CELL / 2;
    for (let k = 0; k < 5; k++) {
      const px = cxx + (rnd() - 0.5) * 4.4, pz = czz + (rnd() - 0.5) * 4.4;
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.5, WALL_H, 0.5), colMat);
      col.position.set(px, y0 + WALL_H / 2, pz);
      col.rotation.y = rnd() * 0.4;
      g.add(col);
      zone.aabbs.push({ x1: px - 0.4, z1: pz - 0.4, x2: px + 0.4, z2: pz + 0.4 });
    }
  }
  // ceiling voids: black mouths overhead trailing dead wires
  for (let i = 0; i < 5; i++) {
    const vx = cx0(1 + ((rnd() * (GRID - 2)) | 0)) + CELL / 2;
    const vz = cx0(1 + ((rnd() * (GRID - 2)) | 0)) + CELL / 2;
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    mouth.rotation.x = Math.PI / 2; mouth.position.set(vx, y0 + WALL_H - 0.01, vz);
    g.add(mouth);
    for (let w = 0; w < 3; w++) {
      const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.8 + rnd() * 1.2, 4),
        new THREE.MeshBasicMaterial({ color: 0x0c0c0c }));
      wire.position.set(vx + (rnd() - 0.5) * 2, y0 + WALL_H - 0.5 - rnd() * 0.5, vz + (rnd() - 0.5) * 2);
      wire.rotation.z = (rnd() - 0.5) * 0.3;
      g.add(wire);
    }
  }
  // freestanding doorframes; clocks that disagree; the EXIT sign that lies
  for (let i = 0; i < 4; i++) {
    addProp(g, zone, P.doorFrame(), cx0(2 + ((rnd() * (GRID - 4)) | 0)) + CELL / 2, cx0(2 + ((rnd() * (GRID - 4)) | 0)) + CELL / 2, rnd() * Math.PI);
  }
  for (let i = 0; i < 5; i++) {
    const s = segs[(rnd() * segs.length) | 0];
    const clock = P.wallClock((rnd() * 12) | 0, (rnd() * 60) | 0);
    const horiz = s.sx > s.sz;
    clock.position.set(s.x + (horiz ? 0 : 0.2), y0 + 2.1, s.z + (horiz ? 0.2 : 0));
    clock.rotation.y = horiz ? 0 : Math.PI / 2;
    g.add(clock);
  }
  const exitLie = P.textPlane('EXIT →', 1.2, 0.4, { bg: '#123a12', color: '#6aff8a', font: 'monospace', size: 60 });
  exitLie.position.set(cx0(5), y0 + 2.5, cx0(3) + 0.21);
  g.add(exitLie);

  // ---- STUFF ----
  for (let i = 0; i < 10; i++) {
    addProp(g, zone, P.officeChair(), cx0(1 + ((rnd() * (GRID - 2)) | 0)) + CELL / 2 + (rnd() - 0.5) * 3, cx0(1 + ((rnd() * (GRID - 2)) | 0)) + CELL / 2 + (rnd() - 0.5) * 3, rnd() * Math.PI * 2);
  }
  for (let i = 0; i < 4; i++) {
    addProp(g, zone, P.fileCabinet(rnd() < 0.5), cx0(1 + ((rnd() * (GRID - 2)) | 0)) + CELL / 2, cx0(1 + ((rnd() * (GRID - 2)) | 0)) + CELL / 2, rnd() * Math.PI, 0.5);
  }
  for (let i = 0; i < 7; i++) {
    addProp(g, zone, P.papers(6), cx0(1 + ((rnd() * (GRID - 2)) | 0)) + CELL / 2, cx0(1 + ((rnd() * (GRID - 2)) | 0)) + CELL / 2);
  }
  addProp(g, zone, P.wetFloorSign(), cx0(4) + 2, cx0(7) + 2, 0.6);

  // the desk with the phone — it will ring
  const deskX = cx0(9) + CELL / 2, deskZ = cx0(5) + CELL / 2;
  addProp(g, zone, P.desk(), deskX, deskZ, 0.2, 0.9);
  const phone = P.rotaryPhone();
  phone.position.set(deskX + 0.3, y0 + 0.77, deskZ);
  g.add(phone);
  zone.phone = { x: deskX, z: deskZ };

  // a bank of CRTs, all static
  const tvX = cx0(12) + CELL / 2, tvZ = cx0(10) + CELL / 2;
  for (let i = 0; i < 3; i++) {
    const tv = P.crtTV();
    addProp(g, zone, tv, tvX - 0.7 + i * 0.7, tvZ, Math.PI + (rnd() - 0.5) * 0.4, 0);
  }
  zone.aabbs.push({ x1: tvX - 1.2, z1: tvZ - 0.5, x2: tvX + 1.2, z2: tvZ + 0.5 });

  graffiti(g, 'the hum lies', cx0(3) + CELL / 2, y0 + 1.7, cx0(6) + 0.21, 0);
  graffiti(g, 'M.E.G. WAS HERE', cx0(11), y0 + 1.4, cx0(2) + CELL / 2, Math.PI / 2, { font: 'monospace', color: 'rgba(60,20,14,0.8)' });
  graffiti(g, 'it counts your steps', cx0(7) + CELL / 2, y0 + 0.9, cx0(12) - 0.21, Math.PI);

  // almond water — the only thing down here that helps
  for (const [ax, az] of [[cx0(13) + 2, cx0(4) + 2], [cx0(3) + 1, cx0(13) + 3]]) {
    const b = P.almondWater();
    addProp(g, zone, b, ax, az);
    zone.pickups.push({ x: ax, z: az, g: b, taken: false });
  }

  // the way down
  zone.exit = { x: cx0(GRID - 2) + CELL / 2, z: cx0(GRID - 2) + CELL / 2, r: 2.2 };
  const hole = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  hole.rotation.x = -Math.PI / 2; hole.position.set(zone.exit.x, y0 + 0.02, zone.exit.z);
  const rim = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.6, 24), new THREE.MeshBasicMaterial({ color: 0x3a3320 }));
  rim.rotation.x = -Math.PI / 2; rim.position.set(zone.exit.x, y0 + 0.03, zone.exit.z);
  g.add(hole, rim);
  graffiti(g, '↓ down is out', zone.exit.x, y0 + 1.3, zone.exit.z - 3.2, 0, { color: 'rgba(90,30,20,0.8)' });

  scene.add(g);
  return zone;
}

// ---------------------------------------------------------------- level 1 --
function buildFunRooms(scene, tex, rnd) {
  const g = new THREE.Group();
  const y0 = ZONE_Y[1];
  const zone = {
    name: 'LEVEL FUN =)', sub: 'the party never stopped', surface: 'carpet',
    y: y0, aabbs: [], fixtures: [], props: [], pickups: [], balloons: [],
    ambient: { sky: 0xc8ab92, gnd: 0x7a6252, i: 1.18, fog: 0xab9280, fogD: 0.04, lightColor: 0xffd9c0 },
    hum: 0.6, dark: false,
  };
  const { segs, cx0, half } = mazeSegs(rnd, 0.72, 0.24);   // more open — party halls
  zone.spawn = { x: cx0(1) + CELL / 2, z: cx0(1) + CELL / 2 };
  zone.bounds = { x1: -half + 0.6, z1: -half + 0.6, x2: half - 0.6, z2: half - 0.6 };

  tex.crayon.repeat.set(3, 1.5);
  const wallMat = new THREE.MeshLambertMaterial({ map: tex.crayon });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(GRID * CELL, GRID * CELL),
    new THREE.MeshLambertMaterial({ color: 0x8a7565 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = y0;
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(GRID * CELL, GRID * CELL),
    new THREE.MeshLambertMaterial({ color: 0xb8ab98 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = y0 + WALL_H;
  g.add(floor, ceil);
  instanceWalls(g, segs, wallMat, zone.aabbs, y0, rnd, true);

  // confetti: hundreds of tiny bright squares ground into the carpet
  const confN = 900;
  const confGeo = new THREE.BufferGeometry();
  const confPos = new Float32Array(confN * 3);
  const confCol = new Float32Array(confN * 3);
  const palette = [[0.8, 0.3, 0.3], [0.3, 0.5, 0.8], [0.85, 0.8, 0.3], [0.35, 0.75, 0.42], [0.7, 0.35, 0.8]];
  for (let i = 0; i < confN; i++) {
    confPos[i * 3] = (rnd() - 0.5) * GRID * CELL;
    confPos[i * 3 + 1] = y0 + 0.02;
    confPos[i * 3 + 2] = (rnd() - 0.5) * GRID * CELL;
    const c = palette[(rnd() * palette.length) | 0];
    confCol[i * 3] = c[0]; confCol[i * 3 + 1] = c[1]; confCol[i * 3 + 2] = c[2];
  }
  confGeo.setAttribute('position', new THREE.BufferAttribute(confPos, 3));
  confGeo.setAttribute('color', new THREE.BufferAttribute(confCol, 3));
  const confetti = new THREE.Points(confGeo, new THREE.PointsMaterial({ size: 0.06, vertexColors: true }));
  g.add(confetti);

  // fixtures: warm party lights
  for (let z = 0; z < GRID; z += 2) for (let x = 0; x < GRID; x += 2) {
    const px = cx0(x) + CELL, pz = cx0(z) + CELL;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ color: 0xffe2c8 }));
    p.rotation.x = Math.PI / 2; p.position.set(px, y0 + WALL_H - 0.02, pz);
    g.add(p);
    zone.fixtures.push({ x: px, y: y0 + WALL_H - 0.5, z: pz, color: 0xffc9a0, base: 16, phase: rnd() * 100 });
  }

  // balloons drift at the ceiling; bunting sags between cells; tables wait
  const balloonCols = [0xc84b4b, 0x4b7ec8, 0xd8c22e, 0x4bc86a, 0xb04bc8];
  for (let i = 0; i < 22; i++) {
    const b = P.balloon(balloonCols[i % balloonCols.length]);
    const bx = cx0(1 + ((rnd() * (GRID - 2)) | 0)) + CELL / 2 + (rnd() - 0.5) * 3;
    const bz = cx0(1 + ((rnd() * (GRID - 2)) | 0)) + CELL / 2 + (rnd() - 0.5) * 3;
    b.position.set(bx, y0 + WALL_H - 0.5 - rnd() * 0.4, bz);
    g.add(b);
    zone.props.push(b);
    zone.balloons.push(b);
  }
  for (let i = 0; i < 8; i++) {
    const s = segs[(rnd() * segs.length) | 0];
    g.add(P.bunting(s.x - 2.4, s.z + 0.3, s.x + 2.4, s.z + 0.3, y0 + WALL_H - 0.15));
  }
  for (let i = 0; i < 4; i++) {
    const tx = cx0(2 + ((rnd() * (GRID - 4)) | 0)) + CELL / 2;
    const tz = cx0(2 + ((rnd() * (GRID - 4)) | 0)) + CELL / 2;
    addProp(g, zone, P.partyTable(), tx, tz, rnd() * Math.PI, 1.1);
    for (let k = 0; k < 2; k++) {
      const gb = P.giftBox(balloonCols[(rnd() * 5) | 0]);
      gb.position.set(tx + (rnd() - 0.5) * 1.4, y0 + 0.75, tz + (rnd() - 0.5) * 0.4);
      g.add(gb);
    }
  }

  graffiti(g, 'JOIN US =)', cx0(6) + CELL / 2, y0 + 1.8, cx0(4) + 0.21, 0, { color: 'rgba(140,40,30,0.85)', size: 56 });
  graffiti(g, 'the cake is old', cx0(10), y0 + 1.2, cx0(9) + CELL / 2, Math.PI / 2, { color: 'rgba(60,40,90,0.8)' });
  graffiti(g, 'HAPPY BIRTHDAY', cx0(3) + CELL / 2, y0 + 2.3, cx0(11) - 0.21, Math.PI, { color: 'rgba(150,60,40,0.8)', size: 44 });

  const b = P.almondWater();
  const ax = cx0(12) + 2, az = cx0(12) + 2;
  addProp(g, zone, b, ax, az);
  zone.pickups.push({ x: ax, z: az, g: b, taken: false });

  zone.exit = { x: cx0(GRID - 2) + CELL / 2, z: cx0(1) + CELL / 2, r: 2.2 };
  const hole = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  hole.rotation.x = -Math.PI / 2; hole.position.set(zone.exit.x, y0 + 0.02, zone.exit.z);
  g.add(hole);
  graffiti(g, 'leaving so soon? =(', zone.exit.x, y0 + 1.4, zone.exit.z + 3.1, Math.PI, { color: 'rgba(140,40,30,0.85)' });

  scene.add(g);
  return zone;
}

// ---------------------------------------------------------------- level 2 --
function buildGarage(scene, tex, rnd) {
  const g = new THREE.Group();
  const y0 = ZONE_Y[2];
  const W = 110, D = 84, H = 3.3;
  const zone = {
    name: 'THE GARAGE', sub: 'level 2 · keep to the light', surface: 'concrete',
    y: y0, aabbs: [], fixtures: [], props: [], pickups: [],
    spawn: { x: -W / 2 + 8, z: -D / 2 + 8 },
    bounds: { x1: -W / 2 + 1, z1: -D / 2 + 1, x2: W / 2 - 1, z2: D / 2 - 1 },
    ambient: { sky: 0x3c342a, gnd: 0x121216, i: 0.52, fog: 0x0e0c0a, fogD: 0.038, lightColor: 0xff9a3c },
    hum: 0.4, dark: true,
  };

  tex.concrete.repeat.set(18, 14);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: tex.concrete }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = y0;
  const ceilP = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ color: 0x3c3c40 }));
  ceilP.rotation.x = Math.PI / 2; ceilP.position.y = y0 + H;
  g.add(floor, ceilP);

  const wallMat = new THREE.MeshLambertMaterial({ map: tex.concreteWall });
  tex.concreteWall.repeat.set(8, 1);
  for (const [x, z, sx, sz] of [[0, -D / 2, W, 0.4], [0, D / 2, W, 0.4], [-W / 2, 0, 0.4, D], [W / 2, 0, 0.4, D]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, H, sz), wallMat);
    m.position.set(x, y0 + H / 2, z);
    g.add(m);
    zone.aabbs.push({ x1: x - sx / 2 - 0.2, z1: z - sz / 2 - 0.2, x2: x + sx / 2 + 0.2, z2: z + sz / 2 + 0.2 });
  }
  const colGeo = new THREE.BoxGeometry(0.9, H, 0.9);
  const cols = [];
  for (let x = -W / 2 + 10; x <= W / 2 - 10; x += 10) for (let z = -D / 2 + 9; z <= D / 2 - 9; z += 12) cols.push([x, z]);
  const colMesh = new THREE.InstancedMesh(colGeo, wallMat, cols.length);
  const o = new THREE.Object3D();
  cols.forEach(([x, z], i) => {
    o.position.set(x, y0 + H / 2, z); o.scale.set(1, 1, 1); o.rotation.set(0, 0, 0); o.updateMatrix();
    colMesh.setMatrixAt(i, o.matrix);
    zone.aabbs.push({ x1: x - 0.65, z1: z - 0.65, x2: x + 0.65, z2: z + 0.65 });
  });
  g.add(colMesh);

  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xb0a878 });
  for (let x = -W / 2 + 6; x <= W / 2 - 6; x += 4) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 5), stripeMat);
    s.rotation.x = -Math.PI / 2; s.position.set(x, y0 + 0.01, -D / 2 + 8);
    const s2 = s.clone(); s2.position.z = D / 2 - 8;
    g.add(s, s2);
  }
  const pudMat = new THREE.MeshPhongMaterial({ color: 0x0a0a0c, shininess: 220, specular: 0xffa050, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 16; i++) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(1.2 + rnd() * 2.4, 20), pudMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set((rnd() - 0.5) * (W - 16), y0 + 0.015, (rnd() - 0.5) * (D - 14));
    p.scale.x = 1 + rnd();
    g.add(p);
  }
  const pipeMat = new THREE.MeshLambertMaterial({ color: 0x4a4a50 });
  for (let i = 0; i < 5; i++) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12 + rnd() * 0.1, 0.12, W - 6, 8), pipeMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, y0 + H - 0.25 - rnd() * 0.3, -D / 2 + 6 + i * (D / 5.2));
    g.add(pipe);
  }

  // the dead fleet: cars that have been parked for decades
  for (const [cx, cz, ry, col] of [
    [-30, -18, 0.05, 0x37424c], [-18, -18, -0.04, 0x4c3a37], [18, 6, 0.02, 0x3a4c37],
    [30, 22, 3.2, 0x44444a], [-8, 22, 0.03, 0x4c4437], [12, -26, -3.1, 0x37424c],
  ]) {
    addProp(g, zone, P.deadCar(col), cx, cz, ry, 2.2);
  }
  for (let i = 0; i < 5; i++) addProp(g, zone, P.trafficCone(), (rnd() - 0.5) * (W - 20), (rnd() - 0.5) * (D - 16), 0);

  for (let x = -W / 2 + 10; x <= W / 2 - 8; x += 13) for (let z = -D / 2 + 8; z <= D / 2 - 8; z += 12) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.3), new THREE.MeshBasicMaterial({ color: 0xffb35c }));
    f.position.set(x, y0 + H - 0.1, z);
    g.add(f);
    zone.fixtures.push({ x, y: y0 + H - 0.6, z, color: 0xff9a3c, base: 18, phase: rnd() * 100 });
  }

  graffiti(g, 'YOUR CAR IS STILL HERE', -W / 2 + 0.41, y0 + 1.6, -8, Math.PI / 2, { color: 'rgba(200,170,120,0.5)', font: 'monospace', size: 40, w: 5, h: 0.8 });
  graffiti(g, 'B4 →', 20, y0 + 2.4, -D / 2 + 0.41, 0, { color: 'rgba(200,180,140,0.55)', font: 'monospace', size: 90, w: 2.4, h: 1 });

  const b = P.almondWater();
  addProp(g, zone, b, -2, 2);
  zone.pickups.push({ x: -2, z: 2, g: b, taken: false });

  zone.exit = { x: W / 2 - 3, z: D / 2 - 6, r: 2.4 };
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.6), new THREE.MeshBasicMaterial({ color: 0x061206 }));
  door.position.set(zone.exit.x + 2.2, y0 + 1.3, zone.exit.z); door.rotation.y = -Math.PI / 2;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.4), new THREE.MeshBasicMaterial({ color: 0x49ff6a }));
  sign.position.set(zone.exit.x + 2.15, y0 + 2.75, zone.exit.z); sign.rotation.y = -Math.PI / 2;
  g.add(door, sign);
  zone.fixtures.push({ x: zone.exit.x, y: y0 + 2.4, z: zone.exit.z, color: 0x49ff6a, base: 6, phase: 0 });

  scene.add(g);
  return zone;
}

// ---------------------------------------------------------------- level 3 --
function buildPoolrooms(scene, tex, rnd) {
  const g = new THREE.Group();
  const y0 = ZONE_Y[3];
  const W = 88, D = 66, H = 5.2;
  const zone = {
    name: 'THE POOLROOMS', sub: 'level 37 · the water is warm', surface: 'tile',
    y: y0, aabbs: [], fixtures: [], props: [], pickups: [],
    spawn: { x: -W / 2 + 7, z: D / 2 - 7 },
    bounds: { x1: -W / 2 + 1, z1: -D / 2 + 1, x2: W / 2 - 1, z2: D / 2 - 1 },
    ambient: { sky: 0xcfe4ea, gnd: 0x7c979e, i: 1.0, fog: 0xd7e9ee, fogD: 0.03, lightColor: 0xf0faff },
    hum: 0.15, dark: false,
  };

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
    zone.aabbs.push({ x1: x - sx / 2 - 0.2, z1: z - sz / 2 - 0.2, x2: x + sx / 2 + 0.2, z2: z + sz / 2 + 0.2 });
  }
  for (const [x, z, sx, sz] of [
    [-W / 4, -D / 6, 0.6, D * 0.42], [W / 5, D / 5, W * 0.4, 0.6],
    [W / 3.2, -D / 4, 0.6, D * 0.3], [-W / 6, D / 3, W * 0.3, 0.6],
  ]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, H, sz), wallMat);
    m.position.set(x, y0 + H / 2, z);
    g.add(m);
    zone.aabbs.push({ x1: x - sx / 2 - 0.2, z1: z - sz / 2 - 0.2, x2: x + sx / 2 + 0.2, z2: z + sz / 2 + 0.2 });
  }

  const waterUniforms = { uTime: { value: 0 } };
  const waterMat = new THREE.ShaderMaterial({
    uniforms: waterUniforms, transparent: true,
    vertexShader: `uniform float uTime; varying vec2 vUv; varying float vW;
      void main() { vUv = uv; vec3 p = position;
        vW = sin(p.x * 1.4 + uTime * 1.1) * sin(p.y * 1.7 - uTime * 0.9);
        p.z += vW * 0.045;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vW;
      void main() {
        float sparkle = pow(max(0.0, sin(vUv.x * 60.0 + uTime * 2.0) * sin(vUv.y * 52.0 - uTime * 1.7)), 6.0);
        vec3 c = mix(vec3(0.32, 0.62, 0.66), vec3(0.55, 0.85, 0.88), 0.5 + vW * 0.5);
        gl_FragColor = vec4(c + sparkle * 0.5, 0.62); }`,
  });
  const pools = [[-W / 4 + 12, 8, 20, 14], [W / 4, -D / 5, 24, 12], [-W / 3, -D / 4, 14, 10]];
  for (const [px, pz, pw, pd] of pools) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd, 24, 24), waterMat);
    w.rotation.x = -Math.PI / 2;
    w.position.set(px, y0 + 0.1, pz);
    g.add(w);
  }
  const caus = [];
  tex.caustics.repeat.set(3, 3);
  for (const [px, pz, pw, pd] of pools) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(pw + 10, pd + 10),
      new THREE.MeshBasicMaterial({ map: tex.caustics, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
    c.rotation.x = -Math.PI / 2;
    c.position.set(px, y0 + 0.03, pz);
    g.add(c); caus.push(c);
  }

  const shaftMat = new THREE.MeshBasicMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (const [sx, sz] of [[-W / 4 + 12, 8], [W / 4, -D / 5], [-W / 3, D / 4], [W / 3.4, D / 3.6], [4, -4]]) {
    const well = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), new THREE.MeshBasicMaterial({ color: 0xf4fbff }));
    well.rotation.x = Math.PI / 2; well.position.set(sx, y0 + H - 0.02, sz);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.1, H, 16, 1, true), shaftMat);
    shaft.position.set(sx, y0 + H / 2, sz);
    g.add(well, shaft);
    zone.fixtures.push({ x: sx, y: y0 + H - 0.8, z: sz, color: 0xf0faff, base: 26, phase: Math.random() * 100 });
  }

  // STUFF: ladders, a drifting swim ring, freestanding doorframes on dry tile,
  // and the mannequin standing waist-deep — its head finds the lens
  const lad = P.poolLadder(); lad.position.set(-W / 4 + 12 - 8, y0, 8); g.add(lad);
  const lad2 = P.poolLadder(); lad2.position.set(W / 4 + 10, y0, -D / 5); g.add(lad2);
  const ring = P.swimRing();
  ring.userData.baseY = y0 + 0.16;
  ring.position.set(W / 4 - 4, y0 + 0.16, -D / 5 + 2);
  g.add(ring); zone.props.push(ring);
  for (let i = 0; i < 2; i++) {
    addProp(g, zone, P.doorFrame(0xdfe4e6), (rnd() - 0.5) * (W - 30), (rnd() - 0.5) * (D - 24), rnd() * Math.PI);
  }
  const man = P.mannequin();
  man.position.set(-W / 4 + 14, y0 - 0.5, 10);       // waist-deep in the first pool
  g.add(man);
  zone.mannequin = man;

  const noDiving = P.textPlane('NO DIVING', 2.6, 0.5, { bg: '#e8eef0', color: '#a33', font: 'monospace', size: 52 });
  noDiving.position.set(-W / 4 + 12, y0 + 2.4, 8 - 14 / 2 - 5.2);
  g.add(noDiving);
  graffiti(g, 'the water remembers you', -W / 6, y0 + 1.5, D / 3 - 0.31, Math.PI, { color: 'rgba(80,110,120,0.7)' });

  const b = P.almondWater();
  addProp(g, zone, b, W / 3, D / 4);
  zone.pickups.push({ x: W / 3, z: D / 4, g: b, taken: false });

  // the way down now leads to the RED HALL, not out
  zone.exit = { x: W / 2 - 5, z: -D / 2 + 6, r: 2.2 };
  const hole = new THREE.Mesh(new THREE.CircleGeometry(2.0, 24), new THREE.MeshBasicMaterial({ color: 0x0a0202 }));
  hole.rotation.x = -Math.PI / 2; hole.position.set(zone.exit.x, y0 + 0.02, zone.exit.z);
  g.add(hole);
  graffiti(g, 'almost. one more.', zone.exit.x - 3, y0 + 1.6, zone.exit.z + 2.6, Math.PI, { color: 'rgba(120,60,50,0.75)' });

  zone._water = waterUniforms; zone._caus = caus;
  scene.add(g);
  return zone;
}

// ---------------------------------------------------------------- level 4 --
function buildRedHall(scene, tex, rnd) {
  const g = new THREE.Group();
  const y0 = ZONE_Y[4];
  const LEN = 96, WID = 4.2, H = 2.7;
  const zone = {
    name: 'THE RED HALL', sub: 'level ! · RUN', surface: 'concrete',
    y: y0, aabbs: [], fixtures: [], props: [], pickups: [], chase: true,
    spawn: { x: -LEN / 2 + 3, z: 0 },
    bounds: { x1: -LEN / 2 + 0.8, z1: -WID / 2 + 0.6, x2: LEN / 2 - 0.8, z2: WID / 2 - 0.6 },
    ambient: { sky: 0x4a1610, gnd: 0x160604, i: 0.62, fog: 0x1c0806, fogD: 0.05, lightColor: 0xff5040 },
    hum: 0.2, dark: false,
  };

  tex.redwall.repeat.set(24, 1);
  const wallMat = new THREE.MeshLambertMaterial({ map: tex.redwall });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(LEN, WID), new THREE.MeshLambertMaterial({ color: 0x2c1210 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = y0;
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(LEN, WID), wallMat.clone());
  ceil.rotation.x = Math.PI / 2; ceil.position.y = y0 + H;
  g.add(floor, ceil);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(LEN, H, 0.4), wallMat);
    w.position.set(0, y0 + H / 2, s * WID / 2);
    g.add(w);
  }
  // strip lights every 8m — they will die behind you
  zone.stripLights = [];
  for (let x = -LEN / 2 + 4; x < LEN / 2; x += 8) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.2), new THREE.MeshBasicMaterial({ color: 0xff8a76 }));
    bar.position.set(x, y0 + H - 0.08, 0);
    g.add(bar);
    const fx = { x, y: y0 + H - 0.5, z: 0, color: 0xff5040, base: 12, phase: rnd() * 100, mesh: bar, dead: false };
    zone.fixtures.push(fx);
    zone.stripLights.push(fx);
  }
  // RUN, painted over and over, bigger each time
  for (let i = 0; i < 5; i++) {
    graffiti(g, 'RUN', -LEN / 2 + 12 + i * 17, y0 + 1.5, WID / 2 - 0.21 - 0.01 * i, Math.PI,
      { color: 'rgba(255,220,200,0.8)', size: 60 + i * 24, w: 2 + i * 0.8, h: 1 + i * 0.3 });
  }
  // pipes + valve wheels for texture
  const pipeMat = new THREE.MeshLambertMaterial({ color: 0x3a1a16 });
  for (const s of [-1, 1]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, LEN - 4, 8), pipeMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, y0 + H - 0.35, s * (WID / 2 - 0.35));
    g.add(pipe);
  }

  // the final door: white light in a red world
  zone.exit = { x: LEN / 2 - 2.2, z: 0, r: 1.8 };
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.4), new THREE.MeshBasicMaterial({ color: 0xfff4e0 }));
  door.position.set(LEN / 2 - 0.5, y0 + 1.2, 0); door.rotation.y = -Math.PI / 2;
  g.add(door);
  zone.fixtures.push({ x: zone.exit.x, y: y0 + 2, z: 0, color: 0xfff4e0, base: 20, phase: 0 });

  scene.add(g);
  return zone;
}

// ------------------------------------------------------------------ world --
export function buildWorld(scene, tex) {
  const rnd = mulberry(1998);
  const zones = [
    buildYellowRooms(scene, tex, rnd),
    buildFunRooms(scene, tex, rnd),
    buildGarage(scene, tex, rnd),
    buildPoolrooms(scene, tex, rnd),
    buildRedHall(scene, tex, rnd),
  ];

  const lights = [];
  for (let i = 0; i < 6; i++) {
    const L = new THREE.PointLight(0xffffff, 0, 26, 1.8);
    scene.add(L); lights.push(L);
  }
  const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 0.6);
  scene.add(hemi);
  scene.fog = new THREE.FogExp2(0x9a8840, 0.05);

  let flickerTimer = 0, flickering = -1;
  let blackout = 0;

  function setZoneMood(z) {
    const a = z.ambient;
    hemi.color.setHex(a.sky); hemi.groundColor.setHex(a.gnd); hemi.intensity = a.i;
    scene.fog.color.setHex(a.fog); scene.fog.density = a.fogD;
    scene.background = new THREE.Color(a.fog);
  }

  function doBlackout(secs = 3) { blackout = secs; }

  function update(dt, playerPos, zi, t) {
    const z = zones[zi];
    blackout = Math.max(0, blackout - dt);
    const near = z.fixtures
      .filter(f => !f.dead)
      .map(f => ({ f, d: (f.x - playerPos.x) ** 2 + (f.z - playerPos.z) ** 2 }))
      .sort((a, b) => a.d - b.d)
      .slice(0, lights.length);
    flickerTimer -= dt;
    if (flickerTimer <= 0) { flickerTimer = 1.5 + Math.random() * 4; flickering = (Math.random() * near.length) | 0; }
    near.forEach(({ f }, i) => {
      const L = lights[i];
      L.position.set(f.x, f.y, f.z);
      L.color.setHex(f.color);
      let k = blackout > 0 ? 0 : 1;
      if (i === flickering && flickerTimer > 0.9) k *= 0.35 + Math.abs(Math.sin(t * 43 + f.phase)) * 0.65;
      L.intensity = f.base * k;
    });
    for (let i = near.length; i < lights.length; i++) lights[i].intensity = 0;
    hemi.intensity = blackout > 0 ? z.ambient.i * 0.12 : z.ambient.i;

    // animated props (TV static, balloons, almond water, swim ring)
    for (const p of z.props) p.userData.update && p.userData.update(dt, t);

    // poolrooms motion: water, caustics, and the head that follows
    const pr = zones[3];
    pr._water.uTime.value = t;
    for (const c of pr._caus) c.material.map.offset.set(Math.sin(t * 0.11) * 0.2, t * 0.014);
    if (zi === 3 && pr.mannequin) {
      const head = pr.mannequin.userData.head;
      const lp = new THREE.Vector3(playerPos.x, pr.y + 1.6, playerPos.z);
      const cur = new THREE.Vector3();
      head.getWorldPosition(cur);
      const want = Math.atan2(lp.x - cur.x, lp.z - cur.z) - pr.mannequin.rotation.y;
      head.rotation.y += (want - head.rotation.y) * Math.min(1, dt * 0.4); // slow. deliberate.
    }

    return flickering >= 0 && flickerTimer > 0.9 && near[flickering] &&
      ((near[flickering].f.x - playerPos.x) ** 2 + (near[flickering].f.z - playerPos.z) ** 2) < 130;
  }

  return { zones, update, setZoneMood, doBlackout };
}
