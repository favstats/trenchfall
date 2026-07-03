// world.js — the backrooms, carved right. The world is conceptually SOLID and
// space is CUT OUT of it: rooms of different shapes, heights and floor levels,
// joined by narrow hallways, ramps, pits and crawlspaces. You are always
// inside something. Biome changes happen mid-corridor — you turn a corner and
// the carpet is tile and the hum is gone. Nothing announces itself.
// Film-sourced wrongness: doorways halfway up walls, raked floors, furniture
// the room is digesting, a cardboard man, a Christmas tree with visitors.
import * as THREE from './engine/three.js';
import * as P from './props.js';

export const CELL = 1.5, GRID = 16, CHUNK = CELL * GRID;   // 24m chunks, 1.5m cells
const LOAD_R = 2, KEEP_R = 3;

// ---------------------------------------------------------------- noise ----
let SEED = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
export function setSeed(s) { SEED = s >>> 0; }
export function getSeed() { return SEED; }

function hash2(x, y) {
  let h = SEED ^ (x * 374761393) ^ (y * 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function rngFor(cx, cz) {
  let a = (SEED ^ (cx * 73856093) ^ (cz * 19349663)) >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// ---------------------------------------------------------------- biomes ---
export const BIOMES = [
  { key: 'yellow', surface: 'carpet', mood: { sky: 0xa89448, gnd: 0x6a5c2a, i: 1.25, fog: 0x9a8840, fogD: 0.05 }, hum: 1, dark: false },
  { key: 'pillars', surface: 'carpet', mood: { sky: 0x9a8a44, gnd: 0x5a4e24, i: 1.05, fog: 0x8a7838, fogD: 0.06 }, hum: 0.8, dark: false },
  { key: 'hotel', surface: 'carpet', mood: { sky: 0x7a4038, gnd: 0x30100e, i: 0.85, fog: 0x401a16, fogD: 0.055 }, hum: 0.4, dark: false },
  { key: 'fun', surface: 'carpet', mood: { sky: 0xc8ab92, gnd: 0x7a6252, i: 1.18, fog: 0xab9280, fogD: 0.05 }, hum: 0.6, dark: false },
  { key: 'garage', surface: 'concrete', mood: { sky: 0x3c342a, gnd: 0x121216, i: 0.52, fog: 0x0e0c0a, fogD: 0.042 }, hum: 0.4, dark: true },
  { key: 'pools', surface: 'tile', mood: { sky: 0xcfe4ea, gnd: 0x7c979e, i: 1.0, fog: 0xd7e9ee, fogD: 0.038 }, hum: 0.15, dark: false },
  { key: 'theater', surface: 'carpet', mood: { sky: 0x2a1c22, gnd: 0x0e080c, i: 0.5, fog: 0x140a10, fogD: 0.05 }, hum: 0.25, dark: true },
  { key: 'cathedral', surface: 'carpet', mood: { sky: 0x8a7a40, gnd: 0x4a4020, i: 0.9, fog: 0x6a5c30, fogD: 0.032 }, hum: 1.2, dark: false },
  { key: 'archive', surface: 'carpet', mood: { sky: 0x6a5838, gnd: 0x2c2416, i: 0.8, fog: 0x4a3c24, fogD: 0.055 }, hum: 0.5, dark: false },
  { key: 'suburb', surface: 'carpet', mood: { sky: 0xb8a468, gnd: 0x6a5c34, i: 1.1, fog: 0xa08c50, fogD: 0.03 }, hum: 0.5, dark: false, open: true },
  { key: 'court', surface: 'tile', mood: { sky: 0x9a9488, gnd: 0x4a4640, i: 0.95, fog: 0x6a655c, fogD: 0.045 }, hum: 0.7, dark: false },
  { key: 'redveins', surface: 'concrete', mood: { sky: 0x4a1610, gnd: 0x160604, i: 0.62, fog: 0x1c0806, fogD: 0.06 }, hum: 0.2, dark: true },
  { key: 'garden', surface: 'carpet', mood: { sky: 0x8ab0c8, gnd: 0x3a5a3a, i: 1.15, fog: 0x9ac0d0, fogD: 0.035 }, hum: 0.3, dark: false },
  { key: 'void', surface: 'concrete', mood: { sky: 0x14161c, gnd: 0x060608, i: 0.3, fog: 0x08090c, fogD: 0.022 }, hum: 0.1, dark: true, open: true },
  { key: 'white', surface: 'tile', mood: { sky: 0xe8ecf0, gnd: 0xc8ccd0, i: 1.4, fog: 0xe8ecf0, fogD: 0.08 }, hum: 0.05, dark: false },
  { key: 'lightsout', surface: 'concrete', mood: { sky: 0x030304, gnd: 0x000000, i: 0.06, fog: 0x010102, fogD: 0.1 }, hum: 0, dark: true },
  { key: 'ocean', surface: 'tile', mood: { sky: 0x1a2430, gnd: 0x0a1016, i: 0.5, fog: 0x141c26, fogD: 0.04 }, hum: 0.1, dark: true, open: true },
];

export function biomeAt(cx, cz) {
  const d = Math.hypot(cx, cz);
  if (d < 2.2) return BIOMES[0];
  const wx = cx + (vnoise(cx * 0.11 + 40, cz * 0.11) - 0.5) * 6;
  const wz = cz + (vnoise(cx * 0.11, cz * 0.11 + 80) - 0.5) * 6;
  const n = vnoise(wx * 0.16, wz * 0.16);
  const unlocked = Math.min(BIOMES.length, 2 + Math.floor(d / 2));
  let ix = Math.floor(n * unlocked) % unlocked;
  if (vnoise(cx * 0.07 + 200, cz * 0.07) < 0.32) ix = 0;   // yellow is the connective tissue
  return BIOMES[ix];
}

// ---------------------------------------------------------------- world ----
export function buildWorld(scene, tex) {
  tex.wallpaper.repeat.set(2, 1); tex.carpet.repeat.set(4, 4); tex.ceiling.repeat.set(3, 3);
  tex.concrete.repeat.set(4, 4); tex.concreteWall.repeat.set(2, 1); tex.tile.repeat.set(4, 3);
  tex.crayon.repeat.set(2, 1); tex.redwall.repeat.set(3, 1); tex.caustics.repeat.set(2, 2);
  tex.checker.repeat.set(4, 4); tex.skyceil.repeat.set(2, 2); tex.books.repeat.set(2, 1.5);
  tex.hotelpaper.repeat.set(2, 1); tex.hotelcarpet.repeat.set(4, 4);
  const lam = (map) => new THREE.MeshLambertMaterial({ map });
  const col = (c) => new THREE.MeshLambertMaterial({ color: c });
  const M = {
    wall: lam(tex.wallpaper), carpet: lam(tex.carpet), ceiling: lam(tex.ceiling),
    concrete: lam(tex.concrete), cwall: lam(tex.concreteWall), tile: lam(tex.tile),
    crayon: lam(tex.crayon), red: lam(tex.redwall), checker: lam(tex.checker),
    skyceil: lam(tex.skyceil), books: lam(tex.books), hpaper: lam(tex.hotelpaper), hcarpet: lam(tex.hotelcarpet),
    panel: new THREE.MeshBasicMaterial({ color: 0xfff6cf }),
    sodium: new THREE.MeshBasicMaterial({ color: 0xffb35c }),
    dark: col(0x3c3c40), black: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    hedge: col(0x3a5a30), turf: col(0x4a6a3a), whiteM: col(0xe8ecf0),
    seat: col(0x6a1c1a), screenM: new THREE.MeshBasicMaterial({ color: 0xdfe8f0 }),
    doorM: col(0x3a2018), brass: new THREE.MeshBasicMaterial({ color: 0xc8a850 }),
    falseWin: new THREE.MeshBasicMaterial({ color: 0xf4f8ff }),
    oceanFloor: col(0x18242c), darkWall: col(0x141416),
    siding: col(0xb8a888), roof: col(0x5a4636), windowM: new THREE.MeshBasicMaterial({ color: 0xffe9b0 }),
    scaffold: col(0x38404a), fence: col(0xd8d2c0),
    tapeGlow: new THREE.MeshBasicMaterial({ color: 0x8adfff }),
    cutout: col(0x1c1a18),
    tree: col(0x2a4a26),
    reality: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  };
  M.wall2 = M.wall.clone(); M.wall2.color.setHex(0xc8ba8a);
  M.ceiling2 = M.ceiling.clone(); M.ceiling2.color.setHex(0xb0a890);
  const G = { box: new THREE.BoxGeometry(1, 1, 1), tape: new THREE.BoxGeometry(0.36, 0.06, 0.22) };
  const water = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, transparent: true,
    vertexShader: `uniform float uTime; varying vec2 vUv; varying float vW;
      void main(){ vUv=uv; vec3 p=position;
        vW=sin(p.x*1.3+uTime*1.1)*sin(p.y*1.6-uTime*0.9); p.z+=vW*0.05;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vW;
      void main(){ float s=pow(max(0.0,sin(vUv.x*50.0+uTime*2.0)*sin(vUv.y*44.0-uTime*1.6)),6.0);
        vec3 c=mix(vec3(0.32,0.62,0.66),vec3(0.55,0.85,0.88),0.5+vW*0.5);
        gl_FragColor=vec4(c+s*0.5,0.62); }`,
  });

  // per-biome carve style
  const STYLES = {
    yellow:    { wall: () => M.wall, floor: M.carpet, ceil: [M.ceiling, M.ceiling, M.ceiling2], h: [2.4, 4.2], corrH: [2.1, 2.5], light: 0xfff2b8, base: 20 },
    pillars:   { wall: () => M.wall2, floor: M.carpet, ceil: [M.ceiling2], h: [2.6, 3.4], corrH: [2.2, 2.4], light: 0xfff2b8, base: 18, pillars: 0.6 },
    hotel:     { wall: () => M.hpaper, floor: M.hcarpet, ceil: [M.dark], h: [2.5, 3.1], corrH: [2.3, 2.5], light: 0xffc890, base: 12, doors: true, corridorish: true },
    fun:       { wall: () => M.crayon, floor: M.carpet, ceil: [M.ceiling, M.ceiling2], h: [2.5, 4.4], corrH: [2.2, 2.6], light: 0xffc9a0, base: 16, party: true },
    garage:    { wall: () => M.cwall, floor: M.concrete, ceil: [M.dark], h: [2.8, 3.4], corrH: [2.4, 2.8], light: 0xff9a3c, base: 16, lightP: 0.45, cars: true, lightMat: 'sodium' },
    pools:     { wall: () => M.tile, floor: M.tile, ceil: [M.tile], h: [3.4, 5.4], corrH: [2.6, 3.2], light: 0xf0faff, base: 24, sunken: 0.45, wet: true },
    theater:   { wall: () => M.dark, floor: M.hcarpet, ceil: [M.dark], h: [4.5, 6.5], corrH: [2.2, 2.4], light: 0xdfe8f0, base: 10, lightP: 0.5, seats: true },
    cathedral: { wall: () => M.wall, floor: M.carpet, ceil: [M.ceiling], h: [8, 16], corrH: [2.2, 2.6], light: 0xfff2b8, base: 22, shaft: 0.2 },
    archive:   { wall: () => M.books, floor: M.carpet, ceil: [M.dark], h: [3.4, 5.5], corrH: [2.1, 2.3], light: 0xffe9c0, base: 14, shelves: true },
    court:     { wall: () => M.tile, floor: M.checker, ceil: [M.dark, M.ceiling2], h: [3.2, 4.6], corrH: [2.4, 2.8], light: 0xfff0d8, base: 18, tables: true },
    redveins:  { wall: () => M.red, floor: M.concrete, ceil: [M.red], h: [2.2, 2.7], corrH: [2.1, 2.3], light: 0xff8a76, base: 12, corridorish: true, run: true },
    garden:    { wall: () => M.hedge, floor: M.turf, ceil: [M.skyceil], h: [4.5, 7], corrH: [2.4, 3], light: 0xf0f6ff, base: 22, trees: true },
    white:     { wall: () => M.whiteM, floor: M.whiteM, ceil: [M.whiteM], h: [2.8, 3.6], corrH: [2.4, 2.8], light: 0xffffff, base: 20, lightP: 0.5, empty: true },
    lightsout: { wall: () => M.darkWall, floor: M.darkWall, ceil: [M.darkWall], h: [2.3, 2.8], corrH: [2.1, 2.3], light: 0xff9a3c, base: 5, lightP: 0.08, tapesX: 2 },
  };

  const chunks = new Map();
  const lights = [];
  for (let i = 0; i < 6; i++) { const L = new THREE.PointLight(0xffffff, 0, 26, 1.8); scene.add(L); lights.push(L); }
  const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1);
  scene.add(hemi);
  scene.fog = new THREE.FogExp2(0x9a8840, 0.05);
  scene.background = new THREE.Color(0x9a8840);

  // ======================= THE CARVE ENGINE =================================
  // cells: null = solid. open = { f: floorY, h: ceilY, corr: bool }
  function carveChunk(cx, cz, rnd, style) {
    const cells = Array.from({ length: GRID }, () => new Array(GRID).fill(null));
    const rooms = [];
    const open = (i, j, f, h, corr) => {
      if (i < 0 || j < 0 || i >= GRID || j >= GRID) return;
      if (!cells[i][j]) cells[i][j] = { f, h, corr };
    };

    // rooms: varied shapes, heights, floor levels; some raked, some sunken pits
    const nRooms = style.corridorish ? 2 : 2 + (rnd() * 3 | 0);
    for (let r = 0; r < nRooms; r++) {
      const w = 3 + (rnd() * (style.corridorish ? 4 : 7) | 0);
      const d = 3 + (rnd() * (style.corridorish ? 4 : 6) | 0);
      const x0 = 1 + (rnd() * (GRID - w - 2) | 0), z0 = 1 + (rnd() * (GRID - d - 2) | 0);
      const roll = rnd();
      const shaft = roll < (style.shaft ?? 0.05);
      const sunken = !shaft && roll < (style.sunken ?? 0.05) + (style.shaft ?? 0.05) + 0.07;
      const raked = !shaft && !sunken && rnd() < 0.1;
      const h = shaft ? 9 : style.h[0] + rnd() * (style.h[1] - style.h[0]);
      const f0 = sunken ? -1.8 : 0;
      const rakeDir = rnd() < 0.5 ? 1 : 0, rakeAmt = raked ? 0.9 + rnd() * 0.7 : 0;
      for (let i = x0; i < x0 + w; i++) for (let j = z0; j < z0 + d; j++) {
        // cut corners on some rooms — rooms stop being rectangles
        if (rnd() < 0.0 || ((i === x0 || i === x0 + w - 1) && (j === z0 || j === z0 + d - 1) && rnd() < 0.35)) continue;
        const t = rakeDir ? (i - x0) / Math.max(1, w - 1) : (j - z0) / Math.max(1, d - 1);
        open(i, j, f0 + (raked ? -rakeAmt * t : 0), h, false);
      }
      rooms.push({ x0, z0, w, d, h, f: f0, shaft, sunken, raked, cx: x0 + w / 2, cz: z0 + d / 2 });
      // sunken rooms get one ramp strip back up
      if (sunken) {
        const side = rnd() < 0.5;
        for (let k = 0; k < 4; k++) {
          const i = side ? x0 + k : x0 + (w >> 1);
          const j = side ? z0 + (d >> 1) : z0 + k;
          if (cells[i]?.[j]) cells[i][j].f = -1.8 + (k + 1) * 0.45;
        }
      }
    }

    // edge mouths — hash-shared with neighbours so hallways line up exactly
    const mouths = [];
    const mouthAt = (edge) => {
      let hsh;
      if (edge === 'w') hsh = hash2(cx * 5, cz * 5 + 1);
      if (edge === 'e') hsh = hash2((cx + 1) * 5, cz * 5 + 1);
      if (edge === 'n') hsh = hash2(cx * 5 + 2, cz * 5 + 3);
      if (edge === 's') hsh = hash2(cx * 5 + 2, (cz + 1) * 5 + 3);
      return 2 + Math.floor(hsh * (GRID - 4));
    };
    for (const e of ['w', 'e', 'n', 's']) mouths.push({ e, p: mouthAt(e) });

    // corridors: from each mouth, L-path to the nearest room centre; then daisy
    // chain the rooms. Narrow (1-2 cells), LOW ceiling — compression then release.
    const corrH = style.corrH[0] + rnd() * (style.corrH[1] - style.corrH[0]);
    function corridor(i0, j0, i1, j1) {
      const wide = rnd() < 0.3 ? 1 : 0;
      let i = i0, j = j0;
      const path = [[i, j]];
      while (i !== i1) { i += Math.sign(i1 - i); path.push([i, j]); }
      while (j !== j1) { j += Math.sign(j1 - j); path.push([i, j]); }
      for (const [pi, pj] of path) {
        open(pi, pj, 0, corrH, true);
        if (wide) open(pi + 1, pj, 0, corrH, true);
      }
    }
    for (const m of mouths) {
      const start = m.e === 'w' ? [0, m.p] : m.e === 'e' ? [GRID - 1, m.p] : m.e === 'n' ? [m.p, 0] : [m.p, GRID - 1];
      let best = rooms[0], bd = 1e9;
      for (const r of rooms) {
        const d2 = (r.cx - start[0]) ** 2 + (r.cz - start[1]) ** 2;
        if (d2 < bd) { bd = d2; best = r; }
      }
      corridor(start[0], start[1], best.cx | 0, best.cz | 0);
    }
    for (let r = 0; r + 1 < rooms.length; r++) {
      corridor(rooms[r].cx | 0, rooms[r].cz | 0, rooms[r + 1].cx | 0, rooms[r + 1].cz | 0);
    }
    return { cells, rooms };
  }

  // greedy horizontal run merge over a predicate
  function runs(cells, fit) {
    const out = [];
    for (let j = 0; j < GRID; j++) {
      let i = 0;
      while (i < GRID) {
        if (!fit(i, j)) { i++; continue; }
        let k = i;
        while (k + 1 < GRID && fit(k + 1, j) && sameKey(cells, i, j, k + 1, j)) k++;
        out.push({ i, j, len: k - i + 1 });
        i = k + 1;
      }
    }
    return out;
  }
  function sameKey(cells, i0, j0, i1, j1) {
    const a = cells[i0][j0], b = cells[i1][j1];
    if (!a || !b) return !a === !b;
    return Math.abs(a.f - b.f) < 0.01 && Math.abs(a.h - b.h) < 0.01;
  }

  function buildGeometry(c, cells, style, ox, oz, rnd) {
    const g = c.group;
    const wallMat = style.wall();
    // floors + ceilings from merged runs
    for (const r of runs(cells, (i, j) => !!cells[i][j])) {
      const cell = cells[r.i][r.j];
      const x = ox + (r.i + r.len / 2) * CELL, z = oz + (r.j + 0.5) * CELL;
      const fl = new THREE.Mesh(G.box, style.floor);
      fl.position.set(x, cell.f - 0.05, z);
      fl.scale.set(r.len * CELL, 0.1, CELL);
      g.add(fl);
      const cm = cell.h >= 8.5 ? M.black : style.ceil[(hash2(r.i + ox, r.j + oz) * style.ceil.length) | 0];
      const cl = new THREE.Mesh(G.box, cm);
      cl.position.set(x, cell.h + 0.05, z);
      cl.scale.set(r.len * CELL, 0.1, CELL);
      g.add(cl);
      if (style.wet && cell.f < -1 && rnd() < 0.9) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(r.len * CELL, CELL, 4, 2), water);
        w.rotation.x = -Math.PI / 2;
        w.position.set(x, cell.f + 0.5, z);
        g.add(w);
      }
    }
    // walls where open meets solid (per-direction merged), ledges where floor jumps
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
      const cell = cells[i][j];
      if (!cell) continue;
      for (const [dx, dz] of dirs) {
        const ni = i + dx, nj = j + dz;
        const nb = (ni < 0 || nj < 0 || ni >= GRID || nj >= GRID) ? undefined : cells[ni][nj];
        const wx = ox + (i + 0.5 + dx * 0.5) * CELL, wz = oz + (j + 0.5 + dz * 0.5) * CELL;
        if (nb === null) {                              // solid face
          const wm = new THREE.Mesh(G.box, wallMat);
          wm.position.set(wx, (cell.f + cell.h) / 2, wz);
          wm.scale.set(dx ? 0.12 : CELL, cell.h - cell.f, dz ? 0.12 : CELL);
          g.add(wm);
        } else if (nb && nb.f - cell.f > 0.55) {        // a ledge climbing away
          const wm = new THREE.Mesh(G.box, wallMat);
          wm.position.set(wx, (cell.f + nb.f) / 2, wz);
          wm.scale.set(dx ? 0.12 : CELL, nb.f - cell.f, dz ? 0.12 : CELL);
          g.add(wm);
        } else if (nb && cell.h - nb.h > 0.4) {         // soffit where ceiling drops
          const wm = new THREE.Mesh(G.box, wallMat);
          wm.position.set(wx, (nb.h + cell.h) / 2, wz);
          wm.scale.set(dx ? 0.12 : CELL, cell.h - nb.h, dz ? 0.12 : CELL);
          g.add(wm);
        }
      }
    }
    // collision: merged solid runs + ledge lips
    for (const r of runs(cells, (i, j) => !cells[i][j])) {
      c.aabbs.push({
        x1: ox + r.i * CELL - 0.05, z1: oz + r.j * CELL - 0.05,
        x2: ox + (r.i + r.len) * CELL + 0.05, z2: oz + (r.j + 1) * CELL + 0.05,
      });
    }
    for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
      const cell = cells[i][j];
      if (!cell) continue;
      for (const [dx, dz] of dirs) {
        const nb = cells[i + dx]?.[j + dz];
        if (nb && nb.f - cell.f > 0.55) {
          const wx = ox + (i + 0.5 + dx * 0.49) * CELL, wz = oz + (j + 0.5 + dz * 0.49) * CELL;
          c.aabbs.push({ x1: wx - (dx ? 0.08 : CELL / 2), z1: wz - (dz ? 0.08 : CELL / 2), x2: wx + (dx ? 0.08 : CELL / 2), z2: wz + (dz ? 0.08 : CELL / 2) });
        }
      }
    }
  }

  // ---- dressing: light, junk, film anomalies, lore, the way out -----------
  function dress(c, cells, rooms, style, ox, oz, rnd, depth) {
    const g = c.group;
    const inRoom = (r) => [ox + (r.x0 + 0.8 + rnd() * (r.w - 1.6)) * CELL, oz + (r.z0 + 0.8 + rnd() * (r.d - 1.6)) * CELL];
    const floorAtCell = (x, z) => {
      const i = Math.floor((x - ox) / CELL), j = Math.floor((z - oz) / CELL);
      return cells[i]?.[j]?.f ?? 0;
    };
    for (const r of rooms) {
      const [lx, lz] = [ox + (r.x0 + r.w / 2) * CELL, oz + (r.z0 + r.d / 2) * CELL];
      if (rnd() < (style.lightP ?? 0.8) && !r.shaft) {
        const pm = new THREE.Mesh(G.box, style.lightMat === 'sodium' ? M.sodium : M.panel);
        pm.position.set(lx, r.h - 0.06, lz);
        pm.scale.set(2, 0.08, 1);
        g.add(pm);
        c.fixtures.push({ x: lx, y: r.h - 0.5, z: lz, color: style.light, base: style.base, phase: rnd() * 100 });
      } else if (r.shaft) {
        c.fixtures.push({ x: lx, y: 6, z: lz, color: style.light, base: 10, phase: rnd() * 100 });
      }

      // style dressing
      if (style.pillars && rnd() < 0.8) {
        for (let k = 0; k < 4 + rnd() * 4; k++) {
          const [px, pz] = inRoom(r);
          const pm = new THREE.Mesh(G.box, style.wall());
          pm.position.set(px, floorAtCell(px, pz) + r.h / 2, pz);
          pm.scale.set(0.5, r.h, 0.5);
          pm.rotation.y = rnd() * 0.6;
          g.add(pm);
          c.aabbs.push({ x1: px - 0.4, z1: pz - 0.4, x2: px + 0.4, z2: pz + 0.4 });
        }
      }
      if (style.seats && r.w >= 5 && rnd() < 0.8) {
        for (let row = 0; row < r.d - 2; row += 2) {
          for (let s = 0; s < r.w - 2; s++) {
            if (s === ((r.w - 2) >> 1)) continue;                // centre aisle
            const x = ox + (r.x0 + 1 + s) * CELL, z = oz + (r.z0 + 1 + row) * CELL;
            const seat = new THREE.Mesh(G.box, M.seat);
            seat.position.set(x, floorAtCell(x, z) + 0.4, z);
            seat.scale.set(1.1, 0.8, 0.9);
            g.add(seat);
          }
          c.aabbs.push({ x1: ox + (r.x0 + 1) * CELL - 0.4, z1: oz + (r.z0 + 1 + row) * CELL - 0.4, x2: ox + (r.x0 + 1 + ((r.w - 2) >> 1)) * CELL - 0.6, z2: oz + (r.z0 + 1 + row) * CELL + 0.4 });
          c.aabbs.push({ x1: ox + (r.x0 + 2 + ((r.w - 2) >> 1)) * CELL - 0.2, z1: oz + (r.z0 + 1 + row) * CELL - 0.4, x2: ox + (r.x0 + r.w - 1) * CELL + 0.2, z2: oz + (r.z0 + 1 + row) * CELL + 0.4 });
        }
        const scr = new THREE.Mesh(G.box, M.screenM);
        scr.position.set(lx, 2.4, oz + (r.z0 + r.d - 0.6) * CELL);
        scr.scale.set(r.w * CELL * 0.7, 2.6, 0.12);
        g.add(scr);
      }
      if (style.shelves && rnd() < 0.85) {
        for (let k = 0; k < 2 + rnd() * 2; k++) {
          const sx = ox + (r.x0 + 1 + k * 2.2) * CELL;
          if (sx > ox + (r.x0 + r.w - 1.4) * CELL) break;
          const sm = new THREE.Mesh(G.box, M.books);
          sm.position.set(sx, r.h / 2 - 0.2, lz);
          sm.scale.set(0.6, r.h - 0.4, Math.max(1.4, (r.d - 2) * CELL * 0.8));
          sm.rotation.z = rnd() < 0.12 ? (rnd() - 0.5) * 0.12 : 0;
          g.add(sm);
          c.aabbs.push({ x1: sx - 0.45, z1: lz - (r.d - 2) * CELL * 0.4, x2: sx + 0.45, z2: lz + (r.d - 2) * CELL * 0.4 });
        }
      }
      if (style.tables && rnd() < 0.7) {
        for (let k = 0; k < 1 + rnd() * 3; k++) {
          const [px, pz] = inRoom(r);
          const t = P.partyTable();
          t.position.set(px, floorAtCell(px, pz), pz);
          t.rotation.y = rnd() * 6.3;
          g.add(t);
        }
      }
      if (style.party && rnd() < 0.7) {
        for (let k = 0; k < 3; k++) {
          const [px, pz] = inRoom(r);
          const b = P.balloon([0xc84b4b, 0x4b7ec8, 0xd8c22e, 0x4bc86a][k % 4]);
          b.position.set(px, r.h - 0.5, pz);
          g.add(b); c.anim.push(b);
        }
      }
      if (style.trees && rnd() < 0.5) {
        const [px, pz] = inRoom(r);
        const trunk = new THREE.Mesh(G.box, M.roof);
        trunk.position.set(px, 1.2, pz); trunk.scale.set(0.3, 2.4, 0.3);
        const ball = new THREE.Mesh(G.box, M.tree);
        ball.position.set(px, 2.9, pz); ball.scale.set(1.7, 1.7, 1.7); ball.rotation.y = 0.6;
        g.add(trunk, ball);
        c.aabbs.push({ x1: px - 0.35, z1: pz - 0.35, x2: px + 0.35, z2: pz + 0.35 });
      }
      if (style.cars && rnd() < 0.4 && r.w >= 5) {
        const [px, pz] = inRoom(r);
        const car = P.deadCar(rnd() < 0.5 ? 0x37424c : 0x4c3a37);
        car.position.set(px, floorAtCell(px, pz), pz);
        car.rotation.y = rnd() * 6.3;
        g.add(car);
        c.aabbs.push({ x1: px - 2.1, z1: pz - 1.6, x2: px + 2.1, z2: pz + 1.6 });
      }
      if (style.doors) { // hotel: numbered doors along the room walls
        for (let k = 0; k < 2 + rnd() * 3; k++) {
          const dx = ox + (r.x0 + 0.6 + rnd() * (r.w - 1.2)) * CELL;
          const dz = oz + (r.z0 + (rnd() < 0.5 ? 0.12 : r.d - 0.12)) * CELL;
          const door = new THREE.Mesh(G.box, M.doorM);
          door.position.set(dx, 1.05, dz); door.scale.set(0.95, 2.1, 0.1);
          const knob = new THREE.Mesh(G.box, M.brass);
          knob.position.set(dx + 0.3, 1.0, dz + 0.08); knob.scale.setScalar(0.07);
          g.add(door, knob);
        }
      }

      // ---- film anomalies: everywhere, unannounced ----
      const a = rnd();
      if (!style.empty && r.w >= 4) {
        if (a < 0.05) { // a doorway halfway up the wall
          const door = new THREE.Mesh(G.box, M.doorM);
          door.position.set(ox + (r.x0 + 0.6 + rnd() * (r.w - 1.2)) * CELL, 2 + rnd() * 1.4, oz + (r.z0 + 0.12) * CELL);
          door.scale.set(0.95, 2.1, 0.1);
          g.add(door);
        } else if (a < 0.1) { // the cardboard man, facing somewhere
          const [px, pz] = inRoom(r);
          const cut = new THREE.Group();
          const bodyC = new THREE.Mesh(G.box, M.cutout);
          bodyC.position.y = 0.85; bodyC.scale.set(0.55, 1.7, 0.045);
          const headC = new THREE.Mesh(G.box, M.cutout);
          headC.position.y = 1.9; headC.scale.set(0.3, 0.36, 0.045);
          cut.add(bodyC, headC);
          cut.position.set(px, floorAtCell(px, pz), pz);
          cut.rotation.y = rnd() * 6.3;
          g.add(cut);
        } else if (a < 0.135) { // the christmas room (Still Life waits by it)
          const [px, pz] = inRoom(r);
          const treeM = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 8), M.tree);
          treeM.position.set(px, floorAtCell(px, pz) + 1.1, pz);
          g.add(treeM);
          for (let k = 0; k < 3; k++) {
            const tl = new THREE.PointLight([0xff4a4a, 0x4aff6a, 0xffd24a][k], 2, 5, 2);
            tl.position.set(px + Math.sin(k * 2.1) * 0.5, floorAtCell(px, pz) + 0.8 + k * 0.5, pz + Math.cos(k * 2.1) * 0.5);
            g.add(tl);
          }
          const man = P.mannequin();
          man.position.set(px + 1.6, floorAtCell(px, pz), pz + 0.8);
          man.lookAt(px, 1, pz);
          g.add(man); c.mannequins.push(man);
        } else if (a < 0.32) {
          const [px, pz] = inRoom(r);
          mkConsumed(g, rnd, px, pz);
        } else if (a < 0.42) { // junk: chairs, cabinets, papers, cones
          for (let k = 0; k < 2 + rnd() * 3; k++) {
            const [px, pz] = inRoom(r);
            const pick = rnd();
            const prop = pick < 0.3 ? P.officeChair() : pick < 0.5 ? P.fileCabinet(rnd() < 0.5) : pick < 0.75 ? P.papers(5) : P.trafficCone();
            prop.position.set(px, floorAtCell(px, pz), pz);
            prop.rotation.y = rnd() * 6.3;
            g.add(prop);
          }
        } else if (a < 0.47 && style.floor === M.carpet) { // false window glow
          const wx = ox + (r.x0 + 0.5 + rnd() * (r.w - 1)) * CELL;
          const win = new THREE.Mesh(G.box, M.falseWin);
          win.position.set(wx, 1.6, oz + (r.z0 + 0.14) * CELL);
          win.scale.set(1.2, 1.4, 0.06);
          g.add(win);
          c.fixtures.push({ x: wx, y: 1.8, z: win.position.z + 0.5, color: 0xf4f8ff, base: 6, phase: 0 });
        }
      }
    }

    // pickups + lore + the impossible exit
    const d = Math.hypot(ox / CHUNK, oz / CHUNK);
    const pickRoom = () => rooms[(rnd() * rooms.length) | 0];
    const tapeN = (rnd() < 0.26 ? 1 : 0) * (style.tapesX || 1);
    for (let k = 0; k < tapeN; k++) {
      const r = pickRoom(); const [px, pz] = inRoom(r);
      const t = new THREE.Mesh(G.tape, M.tapeGlow);
      t.position.set(px, floorAtCell(px, pz) + 0.5, pz);
      g.add(t);
      const halo = new THREE.PointLight(0x6ad1ff, 2.5, 5, 2);
      halo.position.set(px, floorAtCell(px, pz) + 1, pz);
      g.add(halo);
      c.items.push({ kind: 'tape', x: px, z: pz, mesh: t, halo, taken: false });
    }
    if (rnd() < 0.1) {
      const r = pickRoom(); const [px, pz] = inRoom(r);
      const b = P.almondWater(); b.position.set(px, floorAtCell(px, pz), pz); g.add(b); c.anim.push(b);
      c.items.push({ kind: 'water', x: px, z: pz, mesh: b, taken: false });
    }
    if (rnd() < 0.09) { // a note — the only voice this place has
      const r = pickRoom(); const [px, pz] = inRoom(r);
      const n = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.36), new THREE.MeshLambertMaterial({ color: 0xd8d4c2 }));
      n.rotation.x = -Math.PI / 2; n.rotation.z = rnd() * 6.3;
      n.position.set(px, floorAtCell(px, pz) + 0.03, pz);
      g.add(n);
      c.items.push({ kind: 'note', x: px, z: pz, mesh: n, taken: false });
    }
    if (d > 3 && rnd() < 0.03) {
      const r = pickRoom(); const [px, pz] = inRoom(r);
      const h = 2.6;
      const door = new THREE.Mesh(G.box, new THREE.MeshBasicMaterial({ color: 0x9fe8c8 }));
      door.position.set(px, floorAtCell(px, pz) + h / 2, pz);
      door.scale.set(1.6, h, 0.2);
      g.add(door);
      const l = new THREE.PointLight(0x6affb0, 6, 9, 1.8);
      l.position.set(px, floorAtCell(px, pz) + h, pz);
      g.add(l);
      c.items.push({ kind: 'elevator', x: px, z: pz, mesh: door });
    }
    if (d > 10 && rnd() < 0.006) { // the way out. a crack of ordinary daylight.
      const r = pickRoom(); const [px, pz] = inRoom(r);
      const crack = new THREE.Mesh(G.box, M.reality);
      crack.position.set(px, floorAtCell(px, pz) + 1.1, pz);
      crack.scale.set(0.16, 2.2, 0.05);
      crack.rotation.y = rnd() * 3;
      g.add(crack);
      const l = new THREE.PointLight(0xffffff, 14, 14, 1.6);
      l.position.set(px, floorAtCell(px, pz) + 1.4, pz);
      g.add(l);
      c.items.push({ kind: 'reality', x: px, z: pz, mesh: crack });
    }
    if (rnd() < 0.12) {
      const r = pickRoom(); const [px, pz] = inRoom(r);
      const gr = P.textPlane(['NO', 'it counts your steps', 'the hum lies', 'M.E.G. WAS HERE', 'don’t trust the doors', 'deeper', 'the exit moves', 'stop reading walls'][(rnd() * 8) | 0],
        1.8, 0.55, { color: 'rgba(60,30,16,0.7)', font: 'cursive', size: 44 });
      gr.position.set(px, 1.4 + rnd(), pz);
      gr.rotation.y = rnd() * 6.3;
      g.add(gr);
    }
  }

  function mkConsumed(g, rnd, x, z) {
    const pick = rnd();
    const prop = pick < 0.35 ? P.desk() : pick < 0.65 ? P.officeChair() : P.fileCabinet(false);
    const mode = rnd();
    if (mode < 0.45) { prop.position.set(x, -0.45 - rnd() * 0.4, z); prop.rotation.z = (rnd() - 0.5) * 0.5; }
    else if (mode < 0.8) { prop.position.set(x, 1.4 + rnd(), z); prop.rotation.x = -0.9 - rnd(); }
    else { prop.position.set(x, 2.4 + rnd() * 0.4, z); prop.rotation.x = Math.PI; }
    g.add(prop);
  }

  // ---- open "wound" biomes: vastness as contrast, still door-connected -----
  function buildOpen(c, style, key, ox, oz, rnd, cx, cz) {
    const g = c.group;
    // open floor + the same edge mouths so hallways from neighbours connect
    if (key === 'ocean') {
      const fl = new THREE.Mesh(G.box, M.oceanFloor);
      fl.position.set(ox + CHUNK / 2, -0.35, oz + CHUNK / 2);
      fl.scale.set(CHUNK, 0.1, CHUNK);
      g.add(fl);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK, CHUNK, 12, 12), water);
      w.rotation.x = -Math.PI / 2;
      w.position.set(ox + CHUNK / 2, -0.12, oz + CHUNK / 2);
      g.add(w);
      if (rnd() < 0.14) {
        const rx = ox + 6 + rnd() * 12, rz = oz + 6 + rnd() * 12;
        for (const [wx, wz, sx, sz] of [[rx - 2.5, rz, 0.3, 5], [rx + 2.5, rz, 0.3, 5], [rx, rz - 2.5, 5, 0.3]]) {
          const wm = new THREE.Mesh(G.box, M.wall);
          wm.position.set(wx, 1.2, wz); wm.scale.set(sx, 3, sz);
          g.add(wm);
          c.aabbs.push({ x1: wx - sx / 2, z1: wz - sz / 2, x2: wx + sx / 2, z2: wz + sz / 2 });
        }
        c.fixtures.push({ x: rx, y: 2.4, z: rz, color: 0xfff2b8, base: 18, phase: 0 });
      }
    } else if (key === 'void') {
      const fl = new THREE.Mesh(G.box, M.concrete);
      fl.position.set(ox + CHUNK / 2, -0.05, oz + CHUNK / 2);
      fl.scale.set(CHUNK, 0.1, CHUNK);
      g.add(fl);
      if (rnd() < 0.5) {
        const sx = ox + 4 + rnd() * 16, sz = oz + 4 + rnd() * 16, sh = 10 + rnd() * 20;
        for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
          const leg = new THREE.Mesh(G.box, M.scaffold);
          leg.position.set(sx + dx, sh / 2, sz + dz); leg.scale.set(0.16, sh, 0.16);
          g.add(leg);
        }
        c.aabbs.push({ x1: sx - 1.6, z1: sz - 1.6, x2: sx + 1.6, z2: sz + 1.6 });
      }
      if (rnd() < 0.35) c.fixtures.push({ x: ox + 3 + rnd() * 18, y: 2.4, z: oz + 3 + rnd() * 18, color: 0xcfe0ff, base: 15, phase: rnd() * 100 });
    } else { // suburb
      const fl = new THREE.Mesh(G.box, M.carpet);
      fl.position.set(ox + CHUNK / 2, -0.05, oz + CHUNK / 2);
      fl.scale.set(CHUNK, 0.1, CHUNK);
      g.add(fl);
      const cl = new THREE.Mesh(G.box, M.ceiling);
      cl.position.set(ox + CHUNK / 2, 8.5, oz + CHUNK / 2);
      cl.scale.set(CHUNK, 0.1, CHUNK);
      g.add(cl);
      c.fixtures.push({ x: ox + 12, y: 8, z: oz + 12, color: 0xffe9b0, base: 26, phase: 0 });
      if (rnd() < 0.7) {
        const hx = ox + 7 + rnd() * 9, hz = oz + 7 + rnd() * 9;
        const hw = 6 + rnd() * 2.5, hd = 5 + rnd() * 2, hh = 3.2 + rnd();
        const hm = new THREE.Mesh(G.box, M.siding);
        hm.position.set(hx, hh / 2, hz); hm.scale.set(hw, hh, hd);
        g.add(hm);
        c.aabbs.push({ x1: hx - hw / 2, z1: hz - hd / 2, x2: hx + hw / 2, z2: hz + hd / 2 });
        const roof = new THREE.Mesh(G.box, M.roof);
        roof.position.set(hx, hh + 0.9, hz); roof.scale.set(hw * 1.06, 1.8, hd * 1.06); roof.rotation.z = Math.PI / 4;
        g.add(roof);
        for (const sxx of [-1, 1]) {
          const win = new THREE.Mesh(G.box, M.windowM);
          win.position.set(hx + sxx * hw * 0.28, 1.5, hz + hd / 2 + 0.05); win.scale.set(0.9, 1.1, 0.06);
          g.add(win);
        }
        const wl = new THREE.PointLight(0xffe9b0, 4, 9, 2);
        wl.position.set(hx, 2, hz + hd / 2 + 0.8);
        g.add(wl);
      }
      if (rnd() < 0.5) {
        const fz = oz + 3 + rnd() * 18;
        for (let i = 0; i < 8; i++) {
          const p = new THREE.Mesh(G.box, M.fence);
          p.position.set(ox + 2 + i * 1.1, 0.55, fz); p.scale.set(0.12, 1.1, 0.06);
          g.add(p);
        }
      }
    }
  }

  // ---- chunk lifecycle ------------------------------------------------------
  function buildChunk(cx, cz) {
    const key = `${cx},${cz}`;
    if (chunks.has(key)) return;
    const rnd = rngFor(cx, cz);
    const biome = biomeAt(cx, cz);
    const g = new THREE.Group();
    const c = { group: g, aabbs: [], fixtures: [], items: [], anim: [], mannequins: [], biome, cells: null };
    const ox = cx * CHUNK, oz = cz * CHUNK;
    if (biome.open) {
      buildOpen(c, null, biome.key, ox, oz, rnd, cx, cz);
    } else {
      const style = STYLES[biome.key] || STYLES.yellow;
      const { cells, rooms } = carveChunk(cx, cz, rnd, style);
      // spawn chunk: guarantee the landing room
      if (cx === 0 && cz === 0) {
        for (let i = 5; i <= 11; i++) for (let j = 5; j <= 11; j++) cells[i][j] = { f: 0, h: 3, corr: false };
        rooms.push({ x0: 5, z0: 5, w: 7, d: 7, h: 3, f: 0, cx: 8, cz: 8 });
      }
      c.cells = cells;
      buildGeometry(c, cells, style, ox, oz, rnd);
      dress(c, cells, rooms, style, ox, oz, rnd, Math.hypot(cx, cz));
    }
    scene.add(g);
    chunks.set(key, c);
  }

  function disposeChunk(key) {
    const c = chunks.get(key);
    if (!c) return;
    scene.remove(c.group);
    c.group.traverse(o => {
      if (o.geometry && o.geometry !== G.box && o.geometry !== G.tape) o.geometry.dispose?.();
    });
    chunks.delete(key);
  }

  function chunkOf(x, z) { return [Math.floor(x / CHUNK), Math.floor(z / CHUNK)]; }
  function stream(px, pz) {
    const [cx, cz] = chunkOf(px, pz);
    for (let i = -LOAD_R; i <= LOAD_R; i++) for (let j = -LOAD_R; j <= LOAD_R; j++) buildChunk(cx + i, cz + j);
    for (const key of [...chunks.keys()]) {
      const [kx, kz] = key.split(',').map(Number);
      if (Math.abs(kx - cx) > KEEP_R || Math.abs(kz - cz) > KEEP_R) disposeChunk(key);
    }
  }

  function near(px, pz, r = 1) {
    const [cx, cz] = chunkOf(px, pz);
    const out = [];
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const c = chunks.get(`${cx + i},${cz + j}`);
      if (c) out.push(c);
    }
    return out;
  }
  function collidersNear(px, pz) {
    const out = [];
    for (const c of near(px, pz)) for (const a of c.aabbs) {
      if (Math.abs((a.x1 + a.x2) / 2 - px) < 14 && Math.abs((a.z1 + a.z2) / 2 - pz) < 14) out.push(a);
    }
    return out;
  }
  function floorAt(x, z) {
    const [cx, cz] = chunkOf(x, z);
    const c = chunks.get(`${cx},${cz}`);
    if (!c) return 0;
    if (!c.cells) return c.biome.key === 'ocean' ? -0.25 : 0;
    const i = Math.floor((x - cx * CHUNK) / CELL), j = Math.floor((z - cz * CHUNK) / CELL);
    return c.cells[i]?.[j]?.f ?? 0;
  }
  function litAt(x, z) {
    for (const c of near(x, z)) for (const f of c.fixtures) {
      if (f.dead) continue;
      if ((f.x - x) ** 2 + (f.z - z) ** 2 < 6.5 * 6.5) return true;
    }
    return false;
  }
  function biomeAtPos(x, z) { const [cx, cz] = chunkOf(x, z); return biomeAt(cx, cz); }
  function itemsNear(px, pz) {
    const out = [];
    for (const c of near(px, pz, 1)) for (const it of c.items) if (!it.taken) out.push(it);
    return out;
  }

  const moodCur = { sky: new THREE.Color(0xa89448), gnd: new THREE.Color(0x6a5c2a), fog: new THREE.Color(0x9a8840), i: 1.25, fogD: 0.05 };
  let flickerTimer = 0, flickering = -1, blackout = 0;
  function doBlackout(s = 2.5) { blackout = s; }

  function update(dt, playerPos, t) {
    stream(playerPos.x, playerPos.z);
    blackout = Math.max(0, blackout - dt);
    water.uniforms.uTime.value = t;

    const b = biomeAtPos(playerPos.x, playerPos.z);
    const k = Math.min(1, dt * 0.7);
    moodCur.sky.lerp(new THREE.Color(b.mood.sky), k);
    moodCur.gnd.lerp(new THREE.Color(b.mood.gnd), k);
    moodCur.fog.lerp(new THREE.Color(b.mood.fog), k);
    moodCur.i += (b.mood.i - moodCur.i) * k;
    moodCur.fogD += (b.mood.fogD - moodCur.fogD) * k;
    hemi.color.copy(moodCur.sky); hemi.groundColor.copy(moodCur.gnd);
    hemi.intensity = blackout > 0 ? moodCur.i * 0.1 : moodCur.i;
    scene.fog.color.copy(moodCur.fog); scene.fog.density = moodCur.fogD;
    scene.background.copy(moodCur.fog);

    const fixtures = [];
    for (const c of near(playerPos.x, playerPos.z)) for (const f of c.fixtures) if (!f.dead) fixtures.push(f);
    fixtures.sort((a, bb) => ((a.x - playerPos.x) ** 2 + (a.z - playerPos.z) ** 2) - ((bb.x - playerPos.x) ** 2 + (bb.z - playerPos.z) ** 2));
    flickerTimer -= dt;
    if (flickerTimer <= 0) { flickerTimer = 1.5 + Math.random() * 4; flickering = (Math.random() * 6) | 0; }
    for (let i = 0; i < lights.length; i++) {
      const L = lights[i], f = fixtures[i];
      if (!f) { L.intensity = 0; continue; }
      L.position.set(f.x, f.y, f.z);
      L.color.setHex(f.color);
      let kk = blackout > 0 ? 0 : 1;
      if (i === flickering && flickerTimer > 0.9) kk *= 0.35 + Math.abs(Math.sin(t * 43 + f.phase)) * 0.65;
      L.intensity = f.base * kk;
    }

    for (const c of near(playerPos.x, playerPos.z)) {
      for (const a of c.anim) a.userData.update && a.userData.update(dt, t);
      for (const m of c.mannequins) {
        const head = m.userData.head;
        const want = Math.atan2(playerPos.x - m.position.x, playerPos.z - m.position.z) - m.rotation.y;
        head.rotation.y += (want - head.rotation.y) * Math.min(1, dt * 0.4);
      }
      for (const it of c.items) if (it.kind === 'tape' && !it.taken) it.mesh.rotation.y = t * 1.4;
    }
    return b;
  }

  return { update, collidersNear, litAt, biomeAtPos, itemsNear, doBlackout, chunkOf, floorAt, get chunkCount() { return chunks.size; } };
}
