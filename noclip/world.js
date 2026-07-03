// world.js — the backrooms, but actually endless. The world streams in 24m
// chunks around you, seeded fresh every load. Biomes are smooth noise REGIONS,
// not levels: you walk out of the yellow rooms and the ceiling just... leaves,
// and you are in the Cathedral. Nothing loads. Nothing warns you. Further from
// where you fell in, the architecture gets stranger — and following the film's
// lead, the rooms are eating things: desks half-swallowed by carpet, chairs
// fused into walls, a suburb misfiled inside an office dimension.
import * as THREE from './engine/three.js';
import * as P from './props.js';

export const CELL = 6, CHUNK_CELLS = 4, CHUNK = CELL * CHUNK_CELLS; // 24m
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
function vnoise(x, y) { // smooth value noise
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// ---------------------------------------------------------------- biomes ---
// order matters: index = how deep you must be before it can appear
export const BIOMES = [
  { key: 'yellow', name: 'THE YELLOW ROOMS', sub: 'it hums', surface: 'carpet',
    mood: { sky: 0xa89448, gnd: 0x6a5c2a, i: 1.25, fog: 0x9a8840, fogD: 0.045 }, hum: 1, dark: false },
  { key: 'pillars', name: 'THE PILLAR HALLS', sub: 'a forest that was filed wrong', surface: 'carpet',
    mood: { sky: 0x9a8a44, gnd: 0x5a4e24, i: 1.05, fog: 0x8a7838, fogD: 0.06 }, hum: 0.8, dark: false },
  { key: 'fun', name: 'LEVEL FUN =)', sub: 'the party never stopped', surface: 'carpet',
    mood: { sky: 0xc8ab92, gnd: 0x7a6252, i: 1.18, fog: 0xab9280, fogD: 0.045 }, hum: 0.6, dark: false },
  { key: 'garage', name: 'THE PARKING DECK', sub: 'your car is still here', surface: 'concrete',
    mood: { sky: 0x3c342a, gnd: 0x121216, i: 0.52, fog: 0x0e0c0a, fogD: 0.04 }, hum: 0.4, dark: true },
  { key: 'pools', name: 'THE POOL HALLS', sub: 'the water is warm', surface: 'tile',
    mood: { sky: 0xcfe4ea, gnd: 0x7c979e, i: 1.0, fog: 0xd7e9ee, fogD: 0.035 }, hum: 0.15, dark: false },
  { key: 'cathedral', name: 'THE CATHEDRAL', sub: 'the ceiling left', surface: 'carpet',
    mood: { sky: 0x8a7a40, gnd: 0x4a4020, i: 0.9, fog: 0x6a5c30, fogD: 0.03 }, hum: 1.2, dark: false },
  { key: 'suburb', name: 'THE SUBURB', sub: 'somebody filed a neighborhood in here', surface: 'carpet',
    mood: { sky: 0xb8a468, gnd: 0x6a5c34, i: 1.1, fog: 0xa08c50, fogD: 0.028 }, hum: 0.5, dark: false },
  { key: 'redveins', name: 'THE RED VEINS', sub: 'RUN', surface: 'concrete',
    mood: { sky: 0x4a1610, gnd: 0x160604, i: 0.62, fog: 0x1c0806, fogD: 0.055 }, hum: 0.2, dark: true },
  { key: 'void', name: 'THE COMPLEX', sub: 'do not let it see you stop moving', surface: 'concrete',
    mood: { sky: 0x14161c, gnd: 0x060608, i: 0.3, fog: 0x08090c, fogD: 0.022 }, hum: 0.1, dark: true },
];
const BIOME_IX = Object.fromEntries(BIOMES.map((b, i) => [b.key, i]));

export function biomeAt(cx, cz) {
  const d = Math.hypot(cx, cz);
  if (d < 2.2) return BIOMES[0];                       // you always fall into yellow
  // domain-warped region noise → coherent blobs with organic borders
  const wx = cx + (vnoise(cx * 0.11 + 40, cz * 0.11) - 0.5) * 6;
  const wz = cz + (vnoise(cx * 0.11, cz * 0.11 + 80) - 0.5) * 6;
  const n = vnoise(wx * 0.16, wz * 0.16);
  const unlocked = Math.min(BIOMES.length, 2 + Math.floor(d / 2.2)); // deeper = stranger
  let ix = Math.floor(n * unlocked) % unlocked;
  // yellow stays common as connective tissue
  if (vnoise(cx * 0.07 + 200, cz * 0.07) < 0.34) ix = 0;
  return BIOMES[ix];
}

// ---------------------------------------------------------------- world ----
export function buildWorld(scene, tex) {
  // shared materials/geometry (never disposed; chunks only own their groups)
  tex.wallpaper.repeat.set(3, 1.5); tex.carpet.repeat.set(8, 8); tex.ceiling.repeat.set(6, 6);
  tex.concrete.repeat.set(6, 6); tex.concreteWall.repeat.set(4, 1); tex.tile.repeat.set(9, 7);
  tex.crayon.repeat.set(3, 1.5); tex.redwall.repeat.set(6, 1); tex.caustics.repeat.set(2, 2);
  const M = {
    wall: new THREE.MeshLambertMaterial({ map: tex.wallpaper }),
    carpet: new THREE.MeshLambertMaterial({ map: tex.carpet }),
    ceiling: new THREE.MeshLambertMaterial({ map: tex.ceiling }),
    concrete: new THREE.MeshLambertMaterial({ map: tex.concrete }),
    cwall: new THREE.MeshLambertMaterial({ map: tex.concreteWall }),
    tile: new THREE.MeshLambertMaterial({ map: tex.tile }),
    crayon: new THREE.MeshLambertMaterial({ map: tex.crayon }),
    red: new THREE.MeshLambertMaterial({ map: tex.redwall }),
    panel: new THREE.MeshBasicMaterial({ color: 0xfff6cf }),
    sodium: new THREE.MeshBasicMaterial({ color: 0xffb35c }),
    dark: new THREE.MeshLambertMaterial({ color: 0x3c3c40 }),
    black: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    siding: new THREE.MeshLambertMaterial({ color: 0xb8a888 }),
    siding2: new THREE.MeshLambertMaterial({ color: 0x9aa8b0 }),
    roof: new THREE.MeshLambertMaterial({ color: 0x5a4636 }),
    window: new THREE.MeshBasicMaterial({ color: 0xffe9b0 }),
    scaffold: new THREE.MeshLambertMaterial({ color: 0x38404a }),
    tapeGlow: new THREE.MeshBasicMaterial({ color: 0x8adfff }),
    fence: new THREE.MeshLambertMaterial({ color: 0xd8d2c0 }),
  };
  const G = {
    box: new THREE.BoxGeometry(1, 1, 1),
    panel: new THREE.PlaneGeometry(2.2, 1.1),
    tape: new THREE.BoxGeometry(0.36, 0.06, 0.22),
  };
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

  const chunks = new Map();       // "cx,cz" -> { group, aabbs, fixtures, items, biome }
  const lights = [];
  for (let i = 0; i < 6; i++) { const L = new THREE.PointLight(0xffffff, 0, 26, 1.8); scene.add(L); lights.push(L); }
  const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1);
  scene.add(hemi);
  scene.fog = new THREE.FogExp2(0x9a8840, 0.045);
  scene.background = new THREE.Color(0x9a8840);

  // helpers used by every biome builder ------------------------------------
  function mkBox(g, c, x, y, z, sx, sy, sz, mat, collide = true, ry = 0, rz = 0) {
    const m = new THREE.Mesh(G.box, mat);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    m.rotation.y = ry; m.rotation.z = rz;
    g.add(m);
    if (collide) c.aabbs.push({ x1: x - sx / 2 - 0.12, z1: z - sz / 2 - 0.12, x2: x + sx / 2 + 0.12, z2: z + sz / 2 + 0.12 });
    return m;
  }
  function mkFloorCeil(g, ox, oz, floorMat, ceilMat, h) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK, CHUNK), floorMat);
    f.rotation.x = -Math.PI / 2; f.position.set(ox + CHUNK / 2, 0, oz + CHUNK / 2);
    g.add(f);
    if (ceilMat) {
      const cl = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK, CHUNK), ceilMat);
      cl.rotation.x = Math.PI / 2; cl.position.set(ox + CHUNK / 2, h, oz + CHUNK / 2);
      g.add(cl);
    }
  }
  function mkPanel(g, c, x, z, h, color = 0xfff2b8, base = 20, mat = M.panel) {
    const p = new THREE.Mesh(G.panel, mat);
    p.rotation.x = Math.PI / 2; p.position.set(x, h - 0.02, z);
    g.add(p);
    c.fixtures.push({ x, y: h - 0.5, z, color, base, phase: hash2(x | 0, z | 0) * 100 });
  }
  // pickups + anomalies ------------------------------------------------------
  function mkTape(g, c, x, z) {
    const t = new THREE.Mesh(G.tape, M.tapeGlow);
    t.position.set(x, 0.6, z);
    g.add(t);
    const halo = new THREE.PointLight(0x6ad1ff, 2.5, 5, 2);
    halo.position.set(x, 1, z); g.add(halo);
    c.items.push({ kind: 'tape', x, z, mesh: t, halo, taken: false });
  }
  function mkWater(g, c, x, z) {
    const b = P.almondWater(); b.position.set(x, 0, z); g.add(b);
    c.items.push({ kind: 'water', x, z, mesh: b, taken: false });
  }
  function mkElevator(g, c, x, z, biomeH) {
    const h = Math.min(biomeH, 3.4);
    mkBox(g, c, x, h / 2, z - 1.35, 3, h, 0.3, M.dark);
    mkBox(g, c, x - 1.35, h / 2, z, 0.3, h, 2.4, M.dark);
    mkBox(g, c, x + 1.35, h / 2, z, 0.3, h, 2.4, M.dark);
    const door = new THREE.Mesh(G.box, new THREE.MeshBasicMaterial({ color: 0x9fe8c8 }));
    door.position.set(x, h / 2, z - 1.15); door.scale.set(2.2, h - 0.6, 0.1);
    g.add(door);
    const l = new THREE.PointLight(0x6affb0, 8, 12, 1.6);
    l.position.set(x, h - 0.5, z); g.add(l);
    c.items.push({ kind: 'elevator', x, z, mesh: door });
    c.fixtures.push({ x, y: h - 0.5, z, color: 0x6affb0, base: 10, phase: 0 });
  }
  // the film's signature: the room is digesting the furniture
  function mkConsumed(g, c, rnd, x, z) {
    const pick = rnd();
    let prop;
    if (pick < 0.35) prop = P.desk();
    else if (pick < 0.65) prop = P.officeChair();
    else prop = P.fileCabinet(false);
    const mode = rnd();
    if (mode < 0.45) { prop.position.set(x, -0.45 - rnd() * 0.4, z); prop.rotation.z = (rnd() - 0.5) * 0.5; }        // sinking into the floor
    else if (mode < 0.8) { prop.position.set(x, 0, z); prop.rotation.x = -0.9 - rnd(); prop.position.y = 1.4 + rnd(); } // fused into the wall-height
    else { prop.position.set(x, 2.6 + rnd(), z); prop.rotation.x = Math.PI; }                                          // hanging from the ceiling
    g.add(prop);
  }

  // ---- per-biome chunk builders -------------------------------------------
  const BUILDERS = {
    yellow(g, c, rnd, ox, oz, cx, cz) {
      mkFloorCeil(g, ox, oz, M.carpet, M.ceiling, 3);
      // every chunk carves one open row + one open column — the lanes weave a
      // percolating network so the endless maze can never seal you in
      const laneI = (rnd() * CHUNK_CELLS) | 0, laneJ = (rnd() * CHUNK_CELLS) | 0;
      const plaza = cx === 0 && cz === 0;   // where you fall in stays open
      for (let i = 0; i < CHUNK_CELLS; i++) for (let j = 0; j < CHUNK_CELLS; j++) {
        if (plaza && i >= 1 && i <= 2 && j >= 1 && j <= 2) continue;
        const x = ox + i * CELL, z = oz + j * CELL;
        if (j !== laneJ && rnd() < 0.5) mkBox(g, c, x + CELL / 2, 1.5, z, CELL, 3, 0.3, M.wall, true, 0, rnd() < 0.06 ? (rnd() - 0.5) * 0.12 : 0);
        if (i !== laneI && rnd() < 0.5) mkBox(g, c, x, 1.5, z + CELL / 2, 0.3, 3, CELL, M.wall);
      }
      for (let i = 0; i < CHUNK_CELLS; i += 2) for (let j = 0; j < CHUNK_CELLS; j += 2) {
        mkPanel(g, c, ox + i * CELL + CELL / 2, oz + j * CELL + CELL / 2, 3);
      }
      if (rnd() < 0.3) mkConsumed(g, c, rnd, ox + 4 + rnd() * 16, oz + 4 + rnd() * 16);
      if (rnd() < 0.25) { const p = P.papers(6); p.position.set(ox + rnd() * 20, 0, oz + rnd() * 20); g.add(p); }
      if (rnd() < 0.12) { const cl = P.wallClock((rnd() * 12) | 0, (rnd() * 60) | 0); cl.position.set(ox + 6 + rnd() * 12, 2.1, oz + 0.35); g.add(cl); }
    },
    pillars(g, c, rnd, ox, oz) {
      mkFloorCeil(g, ox, oz, M.carpet, M.ceiling, 2.6);
      for (let i = 0; i < 14; i++) {
        const x = ox + 1.5 + rnd() * (CHUNK - 3), z = oz + 1.5 + rnd() * (CHUNK - 3);
        mkBox(g, c, x, 1.3, z, 0.55, 2.6, 0.55, M.wall, true, rnd() * 0.5);
      }
      mkPanel(g, c, ox + CHUNK / 2, oz + CHUNK / 2, 2.6);
      if (rnd() < 0.4) mkPanel(g, c, ox + 5, oz + 5, 2.6);
      if (rnd() < 0.35) mkConsumed(g, c, rnd, ox + rnd() * 20 + 2, oz + rnd() * 20 + 2);
    },
    fun(g, c, rnd, ox, oz) {
      mkFloorCeil(g, ox, oz, M.carpet, M.ceiling, 3);
      const laneJ = (rnd() * CHUNK_CELLS) | 0;
      for (let i = 0; i < CHUNK_CELLS; i++) for (let j = 0; j < CHUNK_CELLS; j++) {
        const x = ox + i * CELL, z = oz + j * CELL;
        if (j !== laneJ && rnd() < 0.4) mkBox(g, c, x + CELL / 2, 1.5, z, CELL, 3, 0.3, M.crayon);
        if (i !== laneJ && rnd() < 0.4) mkBox(g, c, x, 1.5, z + CELL / 2, 0.3, 3, CELL, M.crayon);
        if ((i + j) % 2 === 0) mkPanel(g, c, x + CELL / 2, z + CELL / 2, 3, 0xffc9a0, 16);
      }
      for (let i = 0; i < 4; i++) {
        const b = P.balloon([0xc84b4b, 0x4b7ec8, 0xd8c22e, 0x4bc86a][i % 4]);
        b.position.set(ox + 2 + rnd() * 20, 2.4 + rnd() * 0.4, oz + 2 + rnd() * 20);
        g.add(b); c.anim.push(b);
      }
      if (rnd() < 0.5) { const t = P.partyTable(); t.position.set(ox + 6 + rnd() * 10, 0, oz + 6 + rnd() * 10); g.add(t); }
    },
    garage(g, c, rnd, ox, oz) {
      mkFloorCeil(g, ox, oz, M.concrete, M.dark, 3.3);
      for (let i = 0; i < 4; i++) {
        const x = ox + 3 + (i % 2) * 12 + rnd() * 3, z = oz + 4 + ((i / 2) | 0) * 12 + rnd() * 3;
        mkBox(g, c, x, 1.65, z, 0.9, 3.3, 0.9, M.cwall);
      }
      if (rnd() < 0.5) mkPanel(g, c, ox + 5 + rnd() * 14, oz + 5 + rnd() * 14, 3.3, 0xff9a3c, 18, M.sodium);
      if (rnd() < 0.45) { const car = P.deadCar([0x37424c, 0x4c3a37][rnd() < 0.5 ? 0 : 1]); car.position.set(ox + 6 + rnd() * 12, 0, oz + 6 + rnd() * 12); car.rotation.y = rnd() * 6.28; g.add(car); c.aabbs.push({ x1: car.position.x - 2.2, z1: car.position.z - 2.2, x2: car.position.x + 2.2, z2: car.position.z + 2.2 }); }
      if (rnd() < 0.3) { const cone = P.trafficCone(); cone.position.set(ox + rnd() * 20 + 2, 0, oz + rnd() * 20 + 2); g.add(cone); }
    },
    pools(g, c, rnd, ox, oz) {
      mkFloorCeil(g, ox, oz, M.tile, M.tile, 5);
      // chamber walls with wide gaps
      if (rnd() < 0.6) mkBox(g, c, ox + CHUNK / 2, 2.5, oz + 2, CHUNK * 0.55, 5, 0.5, M.tile);
      if (rnd() < 0.6) mkBox(g, c, ox + 3, 2.5, oz + CHUNK / 2, 0.5, 5, CHUNK * 0.5, M.tile);
      // sunken pool
      if (rnd() < 0.65) {
        const px = ox + 6 + rnd() * 10, pz = oz + 6 + rnd() * 10, pw = 8 + rnd() * 6, pd = 6 + rnd() * 5;
        const w = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd, 12, 12), water);
        w.rotation.x = -Math.PI / 2; w.position.set(px, 0.12, pz);
        g.add(w);
        const caus = new THREE.Mesh(new THREE.PlaneGeometry(pw + 6, pd + 6),
          new THREE.MeshBasicMaterial({ map: tex.caustics, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
        caus.rotation.x = -Math.PI / 2; caus.position.set(px, 0.04, pz);
        g.add(caus); c.caustics.push(caus);
      }
      mkPanel(g, c, ox + CHUNK / 2, oz + CHUNK / 2, 5, 0xf0faff, 26);
      if (rnd() < 0.2) { const man = P.mannequin(); man.position.set(ox + 4 + rnd() * 16, 0, oz + 4 + rnd() * 16); g.add(man); c.mannequins.push(man); }
      if (rnd() < 0.25) { const l = P.poolLadder(); l.position.set(ox + 4 + rnd() * 16, 0, oz + 4 + rnd() * 16); g.add(l); }
    },
    cathedral(g, c, rnd, ox, oz) {
      const H = 22;
      mkFloorCeil(g, ox, oz, M.carpet, null, H);            // the ceiling is a rumor
      const cap = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK, CHUNK), M.black);
      cap.rotation.x = Math.PI / 2; cap.position.set(ox + CHUNK / 2, H, oz + CHUNK / 2);
      g.add(cap);
      const laneC = (rnd() * CHUNK_CELLS) | 0;
      for (let i = 0; i < CHUNK_CELLS; i++) for (let j = 0; j < CHUNK_CELLS; j++) {
        const x = ox + i * CELL, z = oz + j * CELL;
        if (j !== laneC && rnd() < 0.4) mkBox(g, c, x + CELL / 2, H / 2, z, CELL, H, 0.4, M.wall);
        if (i !== laneC && rnd() < 0.4) mkBox(g, c, x, H / 2, z + CELL / 2, 0.4, H, CELL, M.wall);
      }
      // fluorescents stacked up the walls — light climbing into nothing
      for (let k = 0; k < 3; k++) mkPanel(g, c, ox + 4 + rnd() * 16, oz + 4 + rnd() * 16, 3 + k * 6.5);
      // hanging wires from the dark
      for (let i = 0; i < 4; i++) {
        const w = new THREE.Mesh(G.box, M.black);
        w.position.set(ox + 2 + rnd() * 20, H - 3 - rnd() * 5, oz + 2 + rnd() * 20);
        w.scale.set(0.03, 6 + rnd() * 6, 0.03);
        g.add(w);
      }
      if (rnd() < 0.4) { const df = P.doorFrame(); df.position.set(ox + 4 + rnd() * 16, 0, oz + 4 + rnd() * 16); df.rotation.y = rnd() * 3; g.add(df); }
    },
    suburb(g, c, rnd, ox, oz) {
      const H = 9;
      mkFloorCeil(g, ox, oz, M.carpet, M.ceiling, H);
      mkPanel(g, c, ox + CHUNK / 2, oz + CHUNK / 2, H, 0xffe9b0, 26);
      // a house that should not be here
      if (rnd() < 0.7) {
        const hx = ox + 7 + rnd() * 9, hz = oz + 7 + rnd() * 9;
        const hw = 6 + rnd() * 2.5, hd = 5 + rnd() * 2, hh = 3.2 + rnd();
        const sid = rnd() < 0.5 ? M.siding : M.siding2;
        mkBox(g, c, hx, hh / 2, hz, hw, hh, hd, sid, true, rnd() * 0.3 - 0.15);
        const roof = new THREE.Mesh(G.box, M.roof);
        roof.position.set(hx, hh + 0.9, hz); roof.scale.set(hw * 1.06, 1.8, hd * 1.06);
        roof.rotation.z = Math.PI / 4;
        g.add(roof);
        for (const sx of [-1, 1]) {
          const win = new THREE.Mesh(G.box, M.window);
          win.position.set(hx + sx * hw * 0.28, 1.5, hz + hd / 2 + 0.05);
          win.scale.set(0.9, 1.1, 0.06);
          g.add(win);
          const wl = new THREE.PointLight(0xffe9b0, 3, 8, 2);
          wl.position.copy(win.position).z += 0.6;
          g.add(wl);
        }
      }
      // picket fence lines + a streetlamp under the office ceiling
      if (rnd() < 0.6) {
        const fz = oz + 3 + rnd() * 18;
        for (let i = 0; i < 8; i++) mkBox(g, c, ox + 2 + i * 1.1, 0.55, fz, 0.12, 1.1, 0.06, M.fence, false);
        mkBox(g, c, ox + 2 + 4, 0.85, fz, 9, 0.1, 0.05, M.fence, false);
      }
      if (rnd() < 0.5) {
        const lx = ox + 3 + rnd() * 18, lz = oz + 3 + rnd() * 18;
        mkBox(g, c, lx, 2.2, lz, 0.12, 4.4, 0.12, M.dark);
        mkPanel(g, c, lx, lz, 4.5, 0xffd9a0, 14);
      }
    },
    redveins(g, c, rnd, ox, oz) {
      mkFloorCeil(g, ox, oz, new THREE.MeshLambertMaterial({ color: 0x2c1210 }), M.red, 2.7);
      // corridors: dense walls with one guaranteed lane
      const lane = (rnd() * CHUNK_CELLS) | 0;
      for (let i = 0; i < CHUNK_CELLS; i++) for (let j = 0; j < CHUNK_CELLS; j++) {
        const x = ox + i * CELL, z = oz + j * CELL;
        if (j !== lane && rnd() < 0.7) mkBox(g, c, x + CELL / 2, 1.35, z, CELL, 2.7, 0.35, M.red);
        if (i !== lane && rnd() < 0.7) mkBox(g, c, x, 1.35, z + CELL / 2, 0.35, 2.7, CELL, M.red);
      }
      mkPanel(g, c, ox + CHUNK / 2, oz + CHUNK / 2, 2.7, 0xff5040, 12, new THREE.MeshBasicMaterial({ color: 0xff8a76 }));
      if (rnd() < 0.3) {
        const t = P.textPlane('RUN', 2.4, 1, { color: 'rgba(255,220,200,0.8)', size: 90 });
        t.position.set(ox + 4 + rnd() * 16, 1.5, oz + 0.4); g.add(t);
      }
    },
    void(g, c, rnd, ox, oz) {
      mkFloorCeil(g, ox, oz, M.concrete, null, 60);          // no ceiling. none.
      // scaffold towers in the dark distance
      if (rnd() < 0.55) {
        const sx = ox + 4 + rnd() * 16, sz = oz + 4 + rnd() * 16, sh = 10 + rnd() * 22;
        for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]])
          mkBox(g, c, sx + dx, sh / 2, sz + dz, 0.16, sh, 0.16, M.scaffold);
        for (let k = 1; k < sh / 3; k++) mkBox(g, c, sx, k * 3, sz, 3.2, 0.12, 3.2, M.scaffold, false);
      }
      // one work light, maybe — pools of light with a LOT of dark between
      if (rnd() < 0.4) {
        const lx = ox + 3 + rnd() * 18, lz = oz + 3 + rnd() * 18;
        mkBox(g, c, lx, 1.1, lz, 0.3, 2.2, 0.3, M.scaffold, false);
        c.fixtures.push({ x: lx, y: 2.4, z: lz, color: 0xcfe0ff, base: 16, phase: rnd() * 100 });
        const gl = new THREE.Mesh(G.box, new THREE.MeshBasicMaterial({ color: 0xcfe0ff }));
        gl.position.set(lx, 2.2, lz); gl.scale.set(0.5, 0.3, 0.3); g.add(gl);
      }
      if (rnd() < 0.2) mkBox(g, c, ox + rnd() * 20 + 2, 0.5, oz + rnd() * 20 + 2, 2 + rnd() * 3, 1, 1.5, M.cwall);
    },
  };

  // ---- chunk lifecycle ----------------------------------------------------
  function buildChunk(cx, cz) {
    const key = `${cx},${cz}`;
    if (chunks.has(key)) return;
    const rnd = rngFor(cx, cz);
    const biome = biomeAt(cx, cz);
    const g = new THREE.Group();
    const c = { group: g, aabbs: [], fixtures: [], items: [], anim: [], caustics: [], mannequins: [], biome };
    const ox = cx * CHUNK, oz = cz * CHUNK;
    BUILDERS[biome.key](g, c, rnd, ox, oz, cx, cz);
    // pickups & the rare way out (never in the first ring)
    const d = Math.hypot(cx, cz);
    if (rnd() < 0.24) mkTape(g, c, ox + 3 + rnd() * 18, oz + 3 + rnd() * 18);
    if (rnd() < 0.1) mkWater(g, c, ox + 3 + rnd() * 18, oz + 3 + rnd() * 18);
    if (d > 3 && rnd() < 0.035) mkElevator(g, c, ox + 8 + rnd() * 8, oz + 8 + rnd() * 8, biome.key === 'pools' ? 5 : 3);
    if (rnd() < 0.14) {
      const gr = P.textPlane(['NO', 'it counts your steps', 'the hum lies', 'M.E.G.', 'don’t trust the doors', 'deeper'][(rnd() * 6) | 0],
        2, 0.6, { color: 'rgba(60,30,16,0.75)', font: 'cursive', size: 44 });
      gr.position.set(ox + 4 + rnd() * 16, 1.4 + rnd(), oz + 4 + rnd() * 16);
      gr.rotation.y = rnd() * 6.28;
      g.add(gr);
    }
    scene.add(g);
    chunks.set(key, c);
  }

  function disposeChunk(key) {
    const c = chunks.get(key);
    if (!c) return;
    scene.remove(c.group);
    c.group.traverse(o => { if (o.geometry && !Object.values(G).includes(o.geometry)) o.geometry.dispose?.(); });
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

  // ---- queries the rest of the game asks ----------------------------------
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
    for (const c of near(px, pz)) for (const a of c.aabbs) out.push(a);
    return out;
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

  // ---- per-frame ------------------------------------------------------------
  const moodCur = { sky: new THREE.Color(0xa89448), gnd: new THREE.Color(0x6a5c2a), fog: new THREE.Color(0x9a8840), i: 1.25, fogD: 0.045 };
  let flickerTimer = 0, flickering = -1, blackout = 0;
  function doBlackout(s = 2.5) { blackout = s; }

  function update(dt, playerPos, t) {
    stream(playerPos.x, playerPos.z);
    blackout = Math.max(0, blackout - dt);
    water.uniforms.uTime.value = t;

    // seamless mood: lerp toward the local biome's palette as you walk
    const b = biomeAtPos(playerPos.x, playerPos.z);
    const k = Math.min(1, dt * 0.8);
    moodCur.sky.lerp(new THREE.Color(b.mood.sky), k);
    moodCur.gnd.lerp(new THREE.Color(b.mood.gnd), k);
    moodCur.fog.lerp(new THREE.Color(b.mood.fog), k);
    moodCur.i += (b.mood.i - moodCur.i) * k;
    moodCur.fogD += (b.mood.fogD - moodCur.fogD) * k;
    hemi.color.copy(moodCur.sky); hemi.groundColor.copy(moodCur.gnd);
    hemi.intensity = blackout > 0 ? moodCur.i * 0.1 : moodCur.i;
    scene.fog.color.copy(moodCur.fog); scene.fog.density = moodCur.fogD;
    scene.background.copy(moodCur.fog);

    // travelling light pool over nearby fixtures
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

    // animated props in nearby chunks
    for (const c of near(playerPos.x, playerPos.z)) {
      for (const a of c.anim) a.userData.update && a.userData.update(dt, t);
      for (const ca of c.caustics) ca.material.map && ca.material.map.offset.set(Math.sin(t * 0.11) * 0.2, t * 0.014);
      for (const m of c.mannequins) {
        const head = m.userData.head;
        const want = Math.atan2(playerPos.x - m.position.x, playerPos.z - m.position.z) - m.rotation.y;
        head.rotation.y += (want - head.rotation.y) * Math.min(1, dt * 0.4);
      }
      for (const it of c.items) if (it.kind === 'tape' && !it.taken) it.mesh.rotation.y = t * 1.4;
    }
    return b;
  }

  return { update, collidersNear, litAt, biomeAtPos, itemsNear, doBlackout, chunkOf, get chunkCount() { return chunks.size; } };
}
