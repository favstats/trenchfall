// field.js - the battlefield before Winterfell's wall. Terrain, the outer wall
// and gate, godswood treeline, defensive works, weather, and cinematic dressing.
// Pure scene geometry; knows nothing about units or the horde.
//
// Orientation: the WALL runs along X at z = WALL_Z (near the camera, south).
// Defenders hold just behind it. The FIELD opens north (toward -z); the dead
// pour from the far treeline (NORTH_Z) and advance south onto the wall.
import * as THREE from '../engine/three.js';
import { season } from '../game/season.js';

export const WALL_Z = 30;
export const NORTH_Z = -185;
export const FIELD_HALF_X = 150;
export const WALL_H = 9.2;
export const WALL_T = 4.6;
export const GATE_W = 18;
export const RAMP_D = 6; // short steep scramble at the wall back (units climb via ladders)

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
const DIG_CELL = 1.5;
const DIG_X0 = -FIELD_HALF_X, DIG_Z0 = NORTH_Z;
const DIG_W = Math.ceil((FIELD_HALF_X * 2) / DIG_CELL) + 2;
const DIG_H = Math.ceil((WALL_Z + 8 - NORTH_Z) / DIG_CELL) + 2;

// bilinear sample of the dig grid — smooth so excavated walls shade cleanly
function digOffsetAt(x, z) {
  const e = activeEnv;
  if (!e || !e.dig) return 0;
  const fx = (x - DIG_X0) / DIG_CELL, fz = (z - DIG_Z0) / DIG_CELL;
  const x0 = Math.floor(fx), z0 = Math.floor(fz);
  if (x0 < 0 || z0 < 0 || x0 >= DIG_W - 1 || z0 >= DIG_H - 1) return 0;
  const tx = fx - x0, tz = fz - z0, g = e.dig, w = DIG_W;
  const a = g[z0 * w + x0], b = g[z0 * w + x0 + 1];
  const c = g[(z0 + 1) * w + x0], d = g[(z0 + 1) * w + x0 + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
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

// proper ashlar masonry — courses of mortared stone blocks with weathering, lichen,
// snow streaks and cracks, so the castle reads as real cold stone, not a grey box.
// per-block dims vary a little, and the same seed walk is reused by the bump map so
// the height channel lines up with the colour channel.
function masonryBlocks(size, cols, rows) {
  const rh = size / rows, blocks = [];
  for (let r = 0; r < rows; r++) {
    const y = r * rh, off = (r % 2) * 0.5;
    // each course has a few stones of irregular width so it isn't a perfect grid
    let x = -off * (size / cols);
    while (x < size + 4) {
      const w = (size / cols) * (0.7 + rnd() * 0.7);
      blocks.push({ x, y, w, h: rh, r });
      x += w;
    }
  }
  return { blocks, rh };
}

function makeMasonryTexture(size = 512, cols = 7, rows = 9) {
  const { blocks } = masonryBlocks(size, cols, rows);
  return makeCanvasTexture(size, (g) => {
    g.fillStyle = '#2c3138'; g.fillRect(0, 0, size, size);        // dark mortar
    // faint vertical damp/soot bleed down the whole face
    for (let i = 0; i < 7; i++) {
      const x = rnd() * size;
      g.fillStyle = `rgba(18,22,28,${0.05 + rnd() * 0.06})`;
      g.fillRect(x, 0, 6 + rnd() * 26, size);
    }
    for (const b of blocks) {
      const pad = 2 + rnd() * 1.6;
      const bx = b.x + pad, by = b.y + pad, bw = b.w - pad * 2, bh = b.h - pad * 2;
      if (bw < 2 || bh < 2) continue;
      // cool grey limestone, each stone a slightly different tint/warmth
      const v = 104 + (rnd() - 0.5) * 46;
      const warm = (rnd() - 0.5) * 10;
      g.fillStyle = `rgb(${clamp(v * 0.92 + warm, 0, 255) | 0},${clamp(v * 0.97, 0, 255) | 0},${clamp(v * 1.04 - warm, 0, 255) | 0})`;
      g.fillRect(bx, by, bw, bh);
      // chiselled bevel: light top-left, shadow bottom-right
      const grd = g.createLinearGradient(bx, by, bx + bw * 0.4, by + bh);
      grd.addColorStop(0, 'rgba(255,255,255,.14)'); grd.addColorStop(0.5, 'rgba(255,255,255,0)'); grd.addColorStop(1, 'rgba(0,0,0,.30)');
      g.fillStyle = grd; g.fillRect(bx, by, bw, bh);
      // mottled weathering blotches inside the stone
      for (let s = 0; s < 4; s++) {
        const dark = rnd() < 0.5;
        g.fillStyle = dark ? `rgba(20,18,16,${rnd() * 0.16})` : `rgba(150,158,168,${rnd() * 0.12})`;
        const ww = 2 + rnd() * (bw * 0.4), hh = 2 + rnd() * (bh * 0.4);
        g.fillRect(bx + rnd() * (bw - ww), by + rnd() * (bh - hh), ww, hh);
      }
      // occasional moss/lichen on the lower & shaded stones (greenish, low)
      if (b.r > rows * 0.45 && rnd() < 0.22) {
        g.fillStyle = `rgba(${60 + rnd() * 25 | 0},${78 + rnd() * 30 | 0},${48 + rnd() * 20 | 0},${0.18 + rnd() * 0.22})`;
        g.beginPath();
        g.ellipse(bx + rnd() * bw, by + bh * (0.6 + rnd() * 0.4), 3 + rnd() * 6, 2 + rnd() * 4, rnd() * 3, 0, Math.PI * 2);
        g.fill();
      }
      // hairline crack across a few stones
      if (rnd() < 0.12) {
        g.strokeStyle = 'rgba(12,14,18,.5)'; g.lineWidth = 0.8 + rnd();
        g.beginPath();
        let cx = bx + rnd() * bw, cy = by + rnd() * bh; g.moveTo(cx, cy);
        for (let k = 0; k < 4; k++) { cx += (rnd() - 0.5) * bw * 0.5; cy += (rnd() - 0.3) * bh * 0.5; g.lineTo(cx, cy); }
        g.stroke();
      }
      // snow caught on the top lip of the stone (horizontal ledge)
      if (rnd() < 0.5) {
        g.fillStyle = `rgba(226,234,244,${0.25 + rnd() * 0.3})`;
        g.fillRect(bx, by, bw, 1.2 + rnd() * 1.8);
      }
    }
  });
}

// grayscale height map keyed to the same block layout: deep mortar valleys, raised
// block faces, so light actually catches the courses at the tactical distance.
function makeMasonryBump(size = 512, cols = 7, rows = 9) {
  const { blocks } = masonryBlocks(size, cols, rows);
  return makeCanvasTexture(size, (g) => {
    g.fillStyle = '#1a1a1a'; g.fillRect(0, 0, size, size);        // recessed mortar
    for (const b of blocks) {
      const pad = 2 + rnd() * 1.6;
      const bx = b.x + pad, by = b.y + pad, bw = b.w - pad * 2, bh = b.h - pad * 2;
      if (bw < 2 || bh < 2) continue;
      const lvl = 150 + (rnd() - 0.5) * 40;                       // proud block face
      g.fillStyle = `rgb(${lvl | 0},${lvl | 0},${lvl | 0})`;
      g.fillRect(bx, by, bw, bh);
      // rounded-up centre so each stone bulges slightly
      const grd = g.createRadialGradient(bx + bw / 2, by + bh / 2, 1, bx + bw / 2, by + bh / 2, Math.max(bw, bh) * 0.7);
      grd.addColorStop(0, 'rgba(255,255,255,.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(bx, by, bw, bh);
      for (let s = 0; s < 3; s++) { // pitting
        g.fillStyle = `rgba(0,0,0,${0.2 + rnd() * 0.3})`;
        g.fillRect(bx + rnd() * bw, by + rnd() * bh, 1.4, 1.4);
      }
    }
  });
}

function stampMasonry() { const t = makeMasonryTexture(256, 5, 6); t.repeat.set(2, 1.4); return t; }

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

// An organic blood-and-char splatter that reads on snow OR grass: a charred core,
// a ragged crimson pool (not a smooth pink halo), and scattered spatter droplets.
function makeScorchTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const cx = 128, cy = 128;
  // ragged crimson pool — several overlapping lobes so the edge is irregular
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * 46;
    const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d;
    const rr = 40 + rnd() * 46;
    const grd = g.createRadialGradient(px, py, 1, px, py, rr);
    grd.addColorStop(0.0, 'rgba(74,9,9,0.95)');
    grd.addColorStop(0.55, 'rgba(96,14,12,0.6)');
    grd.addColorStop(1.0, 'rgba(96,14,12,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(px, py, rr, 0, Math.PI * 2); g.fill();
  }
  // charred, soaked-dark core
  const core = g.createRadialGradient(cx, cy, 1, cx, cy, 60);
  core.addColorStop(0.0, 'rgba(20,6,6,0.96)');
  core.addColorStop(0.5, 'rgba(34,8,7,0.7)');
  core.addColorStop(1.0, 'rgba(34,8,7,0)');
  g.fillStyle = core;
  g.beginPath(); g.arc(cx, cy, 60, 0, Math.PI * 2); g.fill();
  // flung spatter droplets around the rim
  for (let i = 0; i < 60; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 52 + rnd() * 72;
    const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d;
    const rr = 1.2 + rnd() * 4.5;
    g.fillStyle = `rgba(${80 + (rnd() * 30) | 0},${10 + (rnd() * 8) | 0},9,${0.35 + rnd() * 0.5})`;
    g.beginPath(); g.arc(px, py, rr, 0, Math.PI * 2); g.fill();
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
  const geo = new THREE.PlaneGeometry(900, 900, 384, 384);
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
    color: season().ground,
    roughness: 0.96,
    metalness: 0,
  }));
  terrain.rotation.x = -Math.PI / 2;
  terrain.receiveShadow = true;
  group.add(terrain);
  placementTargets.push(terrain);
  env.terrain = terrain;
  env.terrainGeo = geo;
  env.terrainSeg = 384;

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
  // colour map and a matched height map so courses catch raking light at night
  const stoneTex = makeMasonryTexture(512, 7, 9);
  stoneTex.repeat.set(14, 4);
  const stoneBump = makeMasonryBump(512, 7, 9);
  stoneBump.repeat.set(14, 4);
  // finer-grained mapping for the smaller pieces (parapet, base course, towers)
  const trimTex = makeMasonryTexture(384, 9, 5);
  const trimBump = makeMasonryBump(384, 9, 5);
  const stone = new THREE.MeshStandardMaterial({
    map: stoneTex,
    bumpMap: stoneBump,
    bumpScale: 0.7,
    color: 0x9aa2ac,
    roughness: 0.95,
    metalness: 0,
  });
  // base course / plinth — warmer, dirtier, weather-stained at the foot of the wall
  const baseStone = new THREE.MeshStandardMaterial({
    map: trimTex,
    bumpMap: trimBump,
    bumpScale: 0.7,
    color: 0x6f7682,
    roughness: 0.97,
    metalness: 0,
  });
  baseStone.map.repeat.set(16, 1.3); baseStone.bumpMap.repeat.set(16, 1.3);
  // coping / string-course bands — crisp dressed stone, lighter
  const copingMat = new THREE.MeshStandardMaterial({ color: 0xb3bac4, roughness: 0.88, metalness: 0, bumpMap: trimBump, bumpScale: 0.25 });
  const darkStone = new THREE.MeshStandardMaterial({
    color: 0x4b525c,
    roughness: 0.96,
    metalness: 0,
    bumpMap: stoneBump,
    bumpScale: 0.18,
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
  // reusable: a battered (sloped) base course, a string-course band, and a coped
  // parapet for one span of wall, so the wall reads as a layered stone curtain
  // instead of a single flat extrusion.
  const BASE_H = 2.4;        // tall plinth
  const PARAPET_H = 2.6;     // walkway lip the merlons stand on (above WALL_H)
  function dressSpan(cx, len) {
    // battered base: wider at the foot, approximated by two stacked boxes (cheap,
    // reads as a batter), tapering up to the wall face
    const plinthLo = new THREE.Mesh(new THREE.BoxGeometry(len, BASE_H * 0.6, WALL_T + 1.4), baseStone);
    plinthLo.position.set(cx, BASE_H * 0.3, WALL_Z);
    wall.add(plinthLo);
    const plinthHi = new THREE.Mesh(new THREE.BoxGeometry(len, BASE_H * 0.4, WALL_T + 0.7), baseStone);
    plinthHi.position.set(cx, BASE_H * 0.8, WALL_Z);
    wall.add(plinthHi);
    // string-course band at the top of the plinth — a thin proud lip
    const band = new THREE.Mesh(new THREE.BoxGeometry(len, 0.36, WALL_T + 0.95), copingMat);
    band.position.set(cx, BASE_H + 0.18, WALL_Z);
    wall.add(band);
    // continuous coped parapet sitting on the wall top: a solid plinth the merlons
    // grow from, with the walkway floor recessed behind (south) it
    const parWall = new THREE.Mesh(new THREE.BoxGeometry(len, PARAPET_H, WALL_T * 0.42), stone);
    parWall.position.set(cx, WALL_H + PARAPET_H / 2, WALL_Z - WALL_T / 2 + WALL_T * 0.21);
    wall.add(parWall);
    // dressed coping run capping the parapet (snow-dusted dressed stone)
    const coping = new THREE.Mesh(new THREE.BoxGeometry(len, 0.4, WALL_T * 0.5), copingMat);
    coping.position.set(cx, WALL_H + PARAPET_H + 0.2, WALL_Z - WALL_T / 2 + WALL_T * 0.24);
    wall.add(coping);
  }
  for (const side of [-1, 1]) {
    const span = new THREE.Mesh(new THREE.BoxGeometry(spanLen, WALL_H, WALL_T), stone);
    span.position.set(side * (GATE_W / 2 + spanLen / 2), WALL_H / 2, WALL_Z);
    wall.add(span);
    placementTargets.push(span);
    dressSpan(span.position.x, spanLen);

    // snow lying along the rampart walkway (behind the parapet)
    const walk = new THREE.Mesh(new THREE.BoxGeometry(spanLen, 0.14, WALL_T * 0.5), snowCap);
    walk.position.set(span.position.x, WALL_H + 0.07, WALL_Z + WALL_T * 0.22);
    wall.add(walk);
  }

  // ladders up the back (south) face instead of an earthwork ramp
  const ladderMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.9 });
  const railGeo = new THREE.BoxGeometry(0.16, WALL_H + 1.4, 0.16);
  const rungGeo = new THREE.BoxGeometry(1.5, 0.13, 0.13);
  for (let x = -FIELD_HALF_X + 14; x <= FIELD_HALF_X - 14; x += 22) {
    if (Math.abs(x) < GATE_W / 2 + 6) continue;
    const lad = new THREE.Group();
    for (const rx of [-0.7, 0.7]) {
      const rail = new THREE.Mesh(railGeo, ladderMat);
      rail.position.set(rx, (WALL_H + 1.4) / 2, 0);
      lad.add(rail);
    }
    for (let r = 0; r < 9; r++) {
      const rung = new THREE.Mesh(rungGeo, ladderMat);
      rung.position.set(0, 0.7 + r * (WALL_H / 9), 0);
      lad.add(rung);
    }
    lad.position.set(x, 0, WALL_Z + WALL_T / 2 + 0.5);
    lad.rotation.x = -0.16; // lean against the parapet
    lad.castShadow = true;
    wall.add(lad);
  }

  // corner bastions so the wall terminates in fortifications, not a raw cut edge
  for (const side of [-1, 1]) {
    const bastH = 21;
    const bastion = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 9.6, bastH, 14), stone);
    bastion.position.set(side * (FIELD_HALF_X + 2), bastH / 2, WALL_Z);
    wall.add(bastion);
    const bcrown = new THREE.Mesh(new THREE.CylinderGeometry(9.4, 8.8, 2.2, 14), darkStone);
    bcrown.position.set(bastion.position.x, bastH + 0.8, WALL_Z);
    wall.add(bcrown);
    const bcap = new THREE.Mesh(new THREE.CylinderGeometry(9.7, 9.2, 0.5, 14), snowCap);
    bcap.position.set(bastion.position.x, bastH + 2.1, WALL_Z);
    wall.add(bcap);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.0, 1.5), stone);
      m.position.set(bastion.position.x + Math.cos(a) * 8.4, bastH + 2.6, WALL_Z + Math.sin(a) * 8.4);
      m.rotation.y = -a;
      wall.add(m);
    }
    // the wall continues a little past the bastion so it reads as part of a longer line
    const stub = new THREE.Mesh(new THREE.BoxGeometry(40, WALL_H, WALL_T), stone);
    stub.position.set(side * (FIELD_HALF_X + 24), WALL_H / 2, WALL_Z);
    wall.add(stub);
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

  // crenellations: snow-capped dressed-stone merlons rising from the coped parapet
  const merlonMat = new THREE.MeshStandardMaterial({ map: trimTex, bumpMap: trimBump, bumpScale: 0.55, color: 0xa6adb7, roughness: 0.93 });
  // proper battlement teeth: WIDE along the wall, SHALLOW across it (so they read as
  // crenellations standing along the parapet, not coffins laid across it), and set on
  // the OUTER (enemy-facing, north) lip so a defender shelters behind them
  const MERLON_W = 3.2, MERLON_H = 2.1, MERLON_D = 1.55;
  const MERLON_Z = WALL_Z - WALL_T * 0.5 + MERLON_D * 0.5; // flush to the north face
  const COPING_TOP = WALL_H + PARAPET_H + 0.4;             // top of the parapet coping
  const merlonGeo = new THREE.BoxGeometry(MERLON_W, MERLON_H, MERLON_D);
  const merlonCapGeo = new THREE.BoxGeometry(MERLON_W + 0.14, 0.24, MERLON_D + 0.14);
  const merlons = new THREE.InstancedMesh(merlonGeo, merlonMat, 80);
  const merlonCaps = new THREE.InstancedMesh(merlonCapGeo, snowCap, 80);
  let mi = 0;
  const merlonY = COPING_TOP + MERLON_H / 2;       // base flush on the parapet coping
  const capY = COPING_TOP + MERLON_H + 0.1;        // snow cap flush on the tooth top
  // merlon + open crenel of roughly equal width — even battlement rhythm
  for (let x = -FIELD_HALF_X + 3; x <= FIELD_HALF_X - 3 && mi < 80; x += MERLON_W + 2.6) {
    if (Math.abs(x) < GATE_W / 2 + 2) continue;
    o.rotation.set(0, 0, 0);
    o.position.set(x, merlonY, MERLON_Z); o.updateMatrix();
    merlons.setMatrixAt(mi, o.matrix);
    o.position.set(x, capY, MERLON_Z); o.updateMatrix();
    merlonCaps.setMatrixAt(mi, o.matrix);
    env.breakables.push({ kind: 'merlon', mesh: merlons, index: mi, x, z: WALL_Z, hp: 42, alive: true });
    mi++;
  }
  merlons.count = merlonCaps.count = mi;
  merlons.castShadow = merlons.receiveShadow = true;
  merlonCaps.castShadow = true;
  wall.add(merlons, merlonCaps);

  // a reusable rounded drum tower with a crenellated crown and a snowy conical roof —
  // these read far better than bare cylinders at the tactical distance
  function drumTower(tx, tz, rTop, rBot, h, teeth, cone) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 16), stone);
    t.position.set(tx, h / 2, tz);
    wall.add(t);
    // a couple of string-courses banding the shaft so it isn't a smooth tube
    for (const fy of [h * 0.45, h * 0.82]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(rTop * 1.04 + (1 - fy / h) * (rBot - rTop), rTop * 1.04 + (1 - (fy + 0.4) / h) * (rBot - rTop), 0.34, 16), copingMat);
      ring.position.set(tx, fy, tz);
      wall.add(ring);
    }
    // corbelled crown the parapet sits on
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(rTop + 0.55, rTop, 1.1, 16), darkStone);
    crown.position.set(tx, h + 0.55, tz);
    wall.add(crown);
    const par = new THREE.Mesh(new THREE.CylinderGeometry(rTop + 0.45, rTop + 0.45, 1.4, 16), stone);
    par.position.set(tx, h + 1.75, tz);
    wall.add(par);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(rTop + 0.6, rTop + 0.5, 0.34, 16), snowCap);
    cap.position.set(tx, h + 2.45, tz);
    wall.add(cap);
    // ring of merlon teeth
    const tr = rTop + 0.1;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.7, 1.0), merlonMat);
      m.position.set(tx + Math.cos(a) * tr, h + 2.75, tz + Math.sin(a) * tr);
      m.rotation.y = -a;
      wall.add(m);
      const mc = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.2, 1.1), snowCap);
      mc.position.set(tx + Math.cos(a) * tr, h + 3.6, tz + Math.sin(a) * tr);
      mc.rotation.y = -a;
      wall.add(mc);
    }
    // optional snowy conical roof rising from inside the crown
    if (cone) {
      const roof = new THREE.Mesh(new THREE.ConeGeometry(rTop + 0.2, rTop * 1.5, 16), snowCap);
      roof.position.set(tx, h + 3.0 + rTop * 0.75, tz);
      wall.add(roof);
      const finial = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.1, 6), iron);
      finial.position.set(tx, h + 3.0 + rTop * 1.5 + 0.4, tz);
      wall.add(finial);
    }
    // a couple of glowing arrow-loops facing the field (north)
    for (const ly of [h * 0.5, h * 0.78]) {
      const loop = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 1.5, 0.08),
        new THREE.MeshBasicMaterial({ color: 0xffb155, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, fog: false }),
      );
      loop.position.set(tx, ly, tz - rTop - 0.05);
      wall.add(loop);
    }
  }

  // intermediate drum towers stepping along each span between the gatehouse and the
  // corner bastions — they break the flat run and give the wall a real cadence
  const towerH = 16.5;
  for (const side of [-1, 1]) {
    for (const dist of [34, 68, 104]) {
      const tx = side * (GATE_W / 2 + dist);
      if (Math.abs(tx) > FIELD_HALF_X - 6) continue;
      drumTower(tx, WALL_Z - 0.3, 4.3, 5.2, towerH + (dist > 90 ? 2 : 0), 9, dist > 90);
    }
  }

  // GATEHOUSE: two stout drum towers flank the gate, a machicolated lintel spans it,
  // a chamfered arch frames the opening, and a portcullis hangs in its slot.
  const GH_H = WALL_H + 9;                 // gatehouse towers stand proud of the curtain
  const ghX = GATE_W / 2 + 4.4;            // tower centres just outside the gate gap
  for (const side of [-1, 1]) {
    drumTower(side * ghX, WALL_Z - 0.3, 5.0, 5.9, GH_H, 10, false);
  }
  // the wall block bridging over the gate (the part above the opening) so the
  // gatehouse reads as a solid mass pierced by the gateway, not an open notch
  const lintelY = WALL_H - 0.6;
  const overGate = new THREE.Mesh(new THREE.BoxGeometry(GATE_W + 8.6, WALL_H + 1.6, WALL_T), stone);
  overGate.position.set(0, lintelY + (WALL_H + 1.6) / 2 + 1.2, WALL_Z);
  wall.add(overGate);
  // machicolations: corbelled box brackets jutting from the gatehouse face, with
  // murder-gaps between them, the classic overhang above a castle gate
  const machY = lintelY + 1.0;
  for (let x = -GATE_W / 2 - 3.4; x <= GATE_W / 2 + 3.4; x += 2.3) {
    const corbel = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.5, 1.6), darkStone);
    corbel.position.set(x, machY, WALL_Z - WALL_T / 2 - 0.55);
    wall.add(corbel);
  }
  // a continuous lip the machicolation brackets carry
  const machLip = new THREE.Mesh(new THREE.BoxGeometry(GATE_W + 8.4, 0.7, 1.0), copingMat);
  machLip.position.set(0, machY + 1.05, WALL_Z - WALL_T / 2 - 0.85);
  wall.add(machLip);
  // crenellated fighting top over the gatehouse, between the two towers
  for (let x = -GATE_W / 2 - 2.5; x <= GATE_W / 2 + 2.5; x += 3.0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.0, 1.4), merlonMat);
    m.position.set(x, lintelY + WALL_H + 2.5, WALL_Z - WALL_T / 2 + 0.7);
    wall.add(m);
    const mc = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.22, 1.5), snowCap);
    mc.position.set(x, lintelY + WALL_H + 3.6, WALL_Z - WALL_T / 2 + 0.7);
    wall.add(mc);
  }
  // chamfered voussoir arch around the opening, on the NORTH face (enemy side)
  const archGeo2 = new THREE.BoxGeometry(1.5, 1.15, 1.0);
  for (let i = 0; i <= 16; i++) {
    const t = Math.PI * (i / 16);
    const a = new THREE.Mesh(archGeo2, copingMat);
    a.position.set(Math.cos(t) * (GATE_W * 0.52), WALL_H - 1.6 + Math.sin(t) * (GATE_W * 0.5), WALL_Z - WALL_T / 2 - 0.35);
    a.rotation.z = Math.PI / 2 - t;
    wall.add(a);
  }
  // portcullis hint: a dark iron grid set in the gateway throat, lifted partway
  const pcBarV = new THREE.BoxGeometry(0.22, WALL_H + 1.2, 0.22);
  const pcBarH = new THREE.BoxGeometry(GATE_W - 1.6, 0.22, 0.22);
  for (let x = -GATE_W / 2 + 1.0; x <= GATE_W / 2 - 1.0; x += 1.9) {
    const b = new THREE.Mesh(pcBarV, iron);
    b.position.set(x, (WALL_H + 1.2) / 2 + 1.0, WALL_Z - WALL_T / 2 + 0.4);
    wall.add(b);
  }
  for (const y of [2.6, 6.2, 9.6]) {
    const b = new THREE.Mesh(pcBarH, iron);
    b.position.set(0, y, WALL_Z - WALL_T / 2 + 0.4);
    wall.add(b);
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
  wall.add(gate);

  const keep = new THREE.Group();
  const keepMat = new THREE.MeshStandardMaterial({ color: 0x4b535d, roughness: 0.94, metalness: 0.02, bumpMap: stoneBump, bumpScale: 0.09 });
  const keepZ = WALL_Z + 46; // set back in the courtyard so it doesn't bury the gate
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
  // tidy belts of angled stakes in staggered rows facing the enemy (not random litter)
  const rows = [WALL_Z - 13, WALL_Z - 29, WALL_Z - 47];
  const perRow = 22, span = FIELD_HALF_X * 2 - 18;
  const stakes = new THREE.InstancedMesh(stakeGeo, stakeMat, rows.length * perRow);
  const o = new THREE.Object3D();
  let si = 0;
  for (let r = 0; r < rows.length; r++) {
    const z = rows[r], stagger = (r % 2) * (span / perRow / 2);
    for (let c = 0; c < perRow; c++) {
      const x = -FIELD_HALF_X + 9 + stagger + c * (span / (perRow - 1));
      if (Math.abs(x) < GATE_W / 2 + 5 || Math.abs(x) > FIELD_HALF_X - 4) continue; // clear gate lane & flanks
      o.position.set(x, terrainHeight(x, z) + 1.3, z);
      o.rotation.set(-0.52 + (rnd() - 0.5) * 0.08, 0, 0); // uniform lean toward the dead
      o.scale.set(1, 1, 1);
      o.updateMatrix();
      env.breakables.push({ kind: 'stake', mesh: stakes, index: si, x, z, hp: 16 + rnd() * 8, alive: true });
      stakes.setMatrixAt(si++, o.matrix);
    }
  }
  stakes.count = si;
  // one neat line of dragonglass shards
  const shards = new THREE.InstancedMesh(shardGeo, shardMat, 28);
  let hi = 0;
  for (let c = 0; c < 28; c++) {
    const x = -FIELD_HALF_X + 14 + c * ((FIELD_HALF_X * 2 - 28) / 27);
    if (Math.abs(x) < GATE_W / 2 + 5) continue;
    const z = WALL_Z - 39 + (c % 2) * 2.4;
    o.position.set(x, groundHeight(x, z) + 0.8, z);
    o.rotation.set(0, 0, 0); o.scale.setScalar(0.85 + rnd() * 0.25);
    o.updateMatrix();
    env.breakables.push({ kind: 'shard', mesh: shards, index: hi, x, z, hp: 12, alive: true });
    shards.setMatrixAt(hi++, o.matrix);
  }
  shards.count = hi;
  stakes.castShadow = true;
  shards.castShadow = true;
  group.add(stakes, shards);
}

function addRocks(group, env) {
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x5b626b, roughness: 0.96, metalness: 0 });
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const rocks = new THREE.InstancedMesh(geo, rockMat, 30);
  const o = new THREE.Object3D();
  for (let i = 0; i < 30; i++) {
    // keep boulders out near the flanks/cliffs, not littering the battlefield centre
    const side = rnd() < 0.5 ? -1 : 1;
    const x = side * (FIELD_HALF_X * 0.66 + rnd() * 70);
    const z = NORTH_Z + 15 + rnd() * 205;
    const s = 0.6 + rnd() * 2.6;
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
    sand: new THREE.MeshStandardMaterial({ color: 0x9c8a64, roughness: 1, metalness: 0, map: makeGrainTexture('#8a7850', 'rgba(60,46,30,.4)', 0.5) }),
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
    bag: new THREE.SphereGeometry(0.5, 7, 5).scale(1.24, 0.46, 0.72), // bulging hessian pillow, not a brick
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

function markBuildDamage(item) {
  if (!item?.group || !item.maxHp) return;
  const hp = clamp(item.hp / item.maxHp, 0, 1);
  const wounded = hp < 0.66;
  const critical = hp < 0.32;
  if (item._damageTier === (critical ? 2 : wounded ? 1 : 0)) return;
  item._damageTier = critical ? 2 : wounded ? 1 : 0;
  item.group.traverse?.(m => {
    if (!m.isMesh || !m.material || m.material.isMeshBasicMaterial) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      if (!mat.color) continue;
      if (!mat.userData._baseColor) mat.userData._baseColor = mat.color.clone();
      mat.color.copy(mat.userData._baseColor);
      if (critical) mat.color.lerp(new THREE.Color(0x241711), 0.58);
      else if (wounded) mat.color.lerp(new THREE.Color(0x584137), 0.28);
    }
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
  // base structures — raised in the courtyard behind the wall
  barracks: { hp: 240, radius: 9, clearance: 13 },
  depot: { hp: 200, radius: 9, clearance: 12 },
  lab: { hp: 180, radius: 9, clearance: 12 },
};

const BASE_KINDS = new Set(['barracks', 'depot', 'lab']);

function canPlaceBuildable(env, kind, x, z, dense) {
  kind = normalizeBuildKind(kind);
  if (!env) return false;
  if (Math.abs(x) > FIELD_HALF_X - 8) return false;
  if (BASE_KINDS.has(kind)) {
    if (z < WALL_Z + 6 || z > WALL_Z + 62) return false;   // courtyard, behind the wall
  } else if (z < NORTH_Z + 18 || z > WALL_Z - 8) return false; // killing ground, in front
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
    lining.position.y = -2.55;            // dark earth at the deep dug floor
    g.add(lining);
    for (const zoff of [-2.85, 2.85]) {
      const berm = new THREE.Mesh(a.berm, zoff < 0 ? a.snow : a.earth);
      berm.position.set(0, 0.5, zoff);    // spoil heaped at the trench lip
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
    item.muzzle = new THREE.Vector3(0, 5.78, -2.45);
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
    item.muzzle = new THREE.Vector3(0, 1.35, -2.85);
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
  } else if (kind === 'barracks') {
    const wm = a._wallMat || (a._wallMat = new THREE.MeshStandardMaterial({ map: stampMasonry(), color: 0x8a929c, roughness: 0.92 }));
    const win = a._winMat || (a._winMat = new THREE.MeshBasicMaterial({ color: 0xffb24a, fog: false }));
    const base = new THREE.Mesh(new THREE.BoxGeometry(9, 2.2, 6), wm); base.position.y = 1.1; g.add(base);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(8.4, 1.8, 5.4), a.wood); upper.position.y = 3.1; g.add(upper);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 9, 3, 1, false, 0, Math.PI), a.darkWood || a.wood);
    roof.rotation.z = Math.PI / 2; roof.position.y = 4.5; g.add(roof);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(9.1, 0.3, 0.5), a.snow); ridge.position.y = 6.0; g.add(ridge);
    for (const wx of [-3, -1, 1, 3]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.0, 0.1), win); w.position.set(wx, 1.4, 3.02); g.add(w); }
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.0, 0.15), a.wood); door.position.set(0, 1.0, 3.05); g.add(door);
    const chim = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.4, 0.9), wm); chim.position.set(3.2, 5.4, -1.6); g.add(chim);
    const ember = new THREE.PointLight(0xff7a2a, 1.6, 16, 2); ember.position.set(3.2, 6.6, -1.6); g.add(ember);
    addSandbags(g, a, 7, 1, 3.7);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6, 5), a.iron); pole.position.set(-4.4, 3, -2.6); g.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), new THREE.MeshStandardMaterial({ color: 0x7e1f2c, roughness: 0.9, side: THREE.DoubleSide }));
    flag.position.set(-3.2, 5.2, -2.6); g.add(flag); env.spinners.push({ m: flag, wave: true, ph: rnd() * 6 });
  } else if (kind === 'depot') {
    const wm = a._wallMat || (a._wallMat = new THREE.MeshStandardMaterial({ map: stampMasonry(), color: 0x8a929c, roughness: 0.92 }));
    for (const sx of [-4, 4]) { const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.4, 0.8), wm); pillar.position.set(sx, 2.2, -2.4); g.add(pillar); const p2 = pillar.clone(); p2.position.z = 2.4; g.add(p2); }
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.5, 6.4), a.canvas); canopy.position.y = 4.4; g.add(canopy);
    for (let i = 0; i < 9; i++) { const cr = new THREE.Mesh(a.crate, i % 3 ? a.wood : a.iron); cr.position.set((i % 3 - 1) * 2.2, 0.45 + Math.floor(i / 3) * 0.9, (Math.floor(i / 3) - 1) * 1.9); cr.rotation.y = (rnd() - 0.5) * 0.2; g.add(cr); }
    for (const bx of [-3.4, -2.5, 3.0, 3.7]) { const d = new THREE.Mesh(a.barrel, a.iron); d.scale.set(0.34, 0.34, 0.34); d.position.set(bx, 0.95, 2.6); g.add(d); }
    const crane = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 7), a.iron); crane.position.set(0, 5.2, 0); g.add(crane);
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 4), a.iron); cable.position.set(0, 4, 3); g.add(cable);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5, 5), a.iron); pole.position.set(-4.6, 2.5, -2.8); g.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.2), new THREE.MeshStandardMaterial({ color: 0x3a5a82, roughness: 0.9, side: THREE.DoubleSide }));
    flag.position.set(-3.6, 4.4, -2.8); g.add(flag); env.spinners.push({ m: flag, wave: true, ph: rnd() * 6 });
  } else if (kind === 'lab') {
    const wm = a._wallMat || (a._wallMat = new THREE.MeshStandardMaterial({ map: stampMasonry(), color: 0x8a929c, roughness: 0.92 }));
    const win = a._winMat || (a._winMat = new THREE.MeshBasicMaterial({ color: 0xffb24a, fog: false }));
    const hall = new THREE.Mesh(new THREE.BoxGeometry(8, 3.4, 6.5), wm); hall.position.y = 1.7; g.add(hall);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.5, 7), a.darkWood || a.wood); roof.position.y = 3.6; g.add(roof);
    for (const wx of [-2.5, -0.8, 0.9, 2.6]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.1), win); w.position.set(wx, 1.8, 3.28); g.add(w); }
    // rotating radar dish on a mast
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 5.5, 6), a.iron); mast.position.set(2.4, 4.4, -1.5); g.add(mast);
    const dishPivot = new THREE.Group(); dishPivot.position.set(2.4, 7.0, -1.5); g.add(dishPivot);
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 0.3, 0.7, 16, 1, true), a.iron); dish.rotation.x = -1.0; dish.position.z = 0.6; dishPivot.add(dish);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff4a4a, fog: false })); tip.position.set(0, 1.1, 0); dishPivot.add(tip);
    env.spinners.push({ m: dishPivot, s: 0.7 });
    const glow = new THREE.PointLight(0x6fd0ff, 2.6, 24, 2.0); glow.position.set(-1.6, 2.8, 2); g.add(glow);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshBasicMaterial({ color: 0x9fe0ff, fog: false })); lamp.position.copy(glow.position); g.add(lamp);
    const gen = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.2), a.iron); gen.position.set(-3, 0.6, 2.6); g.add(gen);
  }

  castBuildable(g);
  env.group.add(g);
  g.userData.item = item;          // for click-to-select
  env.buildables.push(item);
  // real excavation: carve the terrain so the trench is dug into the ground
  if (kind === 'trench') { digCarve(x, z, 2.8, 5.6); spawnDebris(env, x, z, 2.2, 2, false); }
  else if (kind === 'pit') { digCarve(x, z, 2.2, 4.4); spawnDebris(env, x, z, 2.2, 2, false); }
  else if (!opts.dense) {
    // construction: structures rise from the ground with a puff of dust
    g.scale.set(1, 0.04, 1);
    item.build = { t: 0, dur: kind === 'barracks' || kind === 'lab' || kind === 'bunker' ? 1.6 : 1.1 };
    env.constructing.push(item);
    spawnDebris(env, x, z, 3.2, 7, false);
  }
  return item;
}

function destroyBuildable(env, item) {
  if (!item.alive) return;
  item.alive = false;
  item.group.visible = false;
  spawnDebris(env, item.x, item.z, item.kind === 'trench' ? 5.5 : 3.5, item.kind === 'trench' ? 12 : 7, false);
  placeGroundScar(env, item.x, item.z, item.kind === 'trench' ? 4.2 : 3.0);
}

function repairNearest(x, z, radius = 14, amount = 6) {
  const env = activeEnv;
  if (!env) return null;
  let best = null, bd = radius * radius;
  for (const item of env.buildables) {
    if (!item.alive || item.hp >= item.maxHp) continue;
    const d = (item.x - x) ** 2 + (item.z - z) ** 2;
    if (d < bd) { bd = d; best = item; }
  }
  if (!best) return null;
  best.hp = Math.min(best.maxHp, best.hp + amount);
  markBuildDamage(best);
  return best;
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
    markBuildDamage(item);
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

// Helm's Deep flanks — sheer cliffs hem the gorge so the wall butts into rock
// at both ends (the dead can only come down the throat between them)
function addCliffs(group) {
  // a dense, two-deep, snow-capped mountain range hems each flank — tall and
  // overlapping so there are no gaps to see through, instanced for performance
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x1d232b, roughness: 1, metalness: 0, flatShading: true });
  const snowMat = new THREE.MeshStandardMaterial({ color: season().capWhite ? 0xe9f1fb : season().cap, roughness: 1, flatShading: true });
  const rockGeo = new THREE.ConeGeometry(1, 1, 7);
  const snowGeo = new THREE.ConeGeometry(0.52, 0.4, 7);
  const inst = [];
  const z0 = NORTH_Z - 110, z1 = WALL_Z + 110;
  for (const side of [-1, 1]) {
    for (let row = 0; row < 2; row++) {
      const baseX = side * (FIELD_HALF_X + 14 + row * 36);
      for (let z = z0; z <= z1; z += 11) {
        const h = (row ? 104 : 72) + rnd() * 44;
        const r = 26 + rnd() * 17;
        inst.push({ x: baseX + (rnd() - 0.5) * 12, z: z + (rnd() - 0.5) * 7, h, r, ry: rnd() * Math.PI });
      }
    }
  }
  const rock = new THREE.InstancedMesh(rockGeo, rockMat, inst.length);
  const snow = new THREE.InstancedMesh(snowGeo, snowMat, inst.length);
  rock.castShadow = true; rock.receiveShadow = true;
  const o = new THREE.Object3D();
  inst.forEach((c, i) => {
    o.rotation.set(0, c.ry, 0); o.scale.set(c.r, c.h, c.r);
    o.position.set(c.x, c.h / 2 - 18, c.z); o.updateMatrix(); rock.setMatrixAt(i, o.matrix);
    o.position.set(c.x, c.h / 2 - 18 + c.h * 0.32, c.z); o.updateMatrix(); snow.setMatrixAt(i, o.matrix);
  });
  group.add(rock, snow);
}

function addTreeline(group) {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x090d10, roughness: 1 });
  const treeMat = new THREE.MeshStandardMaterial({ color: season().tree, roughness: 1 });
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

// upright camera-facing fog banks rolling low over the field — volumetric depth
function addGroundFog(group) {
  const tex = makeRadialTexture(256, [
    [0.0, 'rgba(208,224,244,.45)'], [0.45, 'rgba(150,172,200,.2)'], [1.0, 'rgba(0,0,0,0)'],
  ]);
  const tint = new THREE.Color(season().fog).lerp(new THREE.Color(0xffffff), 0.68);
  const list = [];
  const geo = new THREE.PlaneGeometry(1, 1);
  for (let i = 0; i < 22; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false, color: tint });
    const m = new THREE.Mesh(geo, mat);
    m.position.set((rnd() * 2 - 1) * (FIELD_HALF_X + 8), 3 + rnd() * 4, NORTH_Z + 24 + rnd() * 205);
    m.scale.set(48 + rnd() * 54, 22 + rnd() * 18, 1);
    m.renderOrder = 3;
    m.userData = { base: 0.09 + rnd() * 0.13, speed: 1.1 + rnd() * 2.6, ph: rnd() * 6.28 };
    list.push(m); group.add(m);
  }
  return list;
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

function refreshTerrain(env, x, z, radius, full = false) {
  if (!env.terrainGeo) return;
  const geo = env.terrainGeo;
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const SEG = env.terrainSeg || 176, step = 900 / SEG, cols = SEG + 1;
  const inWall = (vx, vz) => vz > WALL_Z - WALL_T * 0.5 && vz < Z_BOT + 4 && Math.abs(vx) > GATE_W / 2;

  if (full) { // whole-mesh path (used by craters): cheap enough occasionally
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i), vz = -pos.getY(i);
      if (inWall(vx, vz)) continue;
      pos.setZ(i, groundHeight(vx, vz));
    }
    pos.needsUpdate = true; geo.computeVertexNormals(); return;
  }

  // local window — cost is independent of total terrain resolution
  const c0 = Math.max(0, Math.floor((x - radius + 450) / step));
  const c1 = Math.min(SEG, Math.ceil((x + radius + 450) / step));
  const r0 = Math.max(0, Math.floor((z - radius + 450) / step));
  const r1 = Math.min(SEG, Math.ceil((z + radius + 450) / step));
  const e = step;
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const i = r * cols + c, vx = pos.getX(i), vz = -pos.getY(i);
    if (inWall(vx, vz)) continue;
    pos.setZ(i, groundHeight(vx, vz));
    // heightfield normal from the gradient of groundHeight (local, no global recompute)
    const gx = (groundHeight(vx + e, vz) - groundHeight(vx - e, vz)) / (2 * e);
    const gz = (groundHeight(vx, vz + e) - groundHeight(vx, vz - e)) / (2 * e);
    const inv = 1 / Math.hypot(gx, 1, gz);
    nor.setXYZ(i, -gx * inv, inv, gz * inv);
  }
  pos.needsUpdate = true; nor.needsUpdate = true;
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
      const innerR = radius * 0.5;
      if (d < radius) {                       // flat floor + steep walls (crisp ditch)
        const dig = d <= innerR ? -depth : -depth * (1 - (d - innerR) / (radius - innerR));
        if (dig < env.dig[i]) env.dig[i] = dig;
      } else if (d < radius + 1.8) {          // spoil berm heaped at the lip
        const berm = depth * 0.22 * (1 - (d - radius) / 1.8);
        if (env.dig[i] >= 0 && berm > env.dig[i]) env.dig[i] = berm;
      }
    }
  }
  refreshTerrain(env, x, z, radius + 2.5);
}

// Raise a solid earth+gore mound into the terrain where the slain pile up. Bodies
// then lie ON this continuous surface instead of floating over bare ground, so the
// Leichenberg reads as a real hill with no holes. Writes a rounded positive bump
// into the dig grid (same field that heightAt samples) and bakes it locally.
const MOUND_CAP = 7.2;       // tall enough to read as a hill, short of overtopping
export function raiseMound(x, z, amt = 0.05, radius = 4.6) {
  const env = activeEnv;
  if (!env || !env.dig) return;
  const cx = (x - DIG_X0) / DIG_CELL, cz = (z - DIG_Z0) / DIG_CELL;
  const cr = Math.ceil(radius / DIG_CELL) + 1;
  for (let gz = Math.floor(cz - cr); gz <= cz + cr; gz++) {
    for (let gx = Math.floor(cx - cr); gx <= cx + cr; gx++) {
      if (gx < 0 || gz < 0 || gx >= DIG_W || gz >= DIG_H) continue;
      const wx = DIG_X0 + gx * DIG_CELL, wz = DIG_Z0 + gz * DIG_CELL;
      const d = Math.hypot(wx - x, wz - z);
      if (d > radius) continue;
      const i = gz * DIG_W + gx;
      const w = 0.5 + 0.5 * Math.cos((d / radius) * Math.PI); // smooth rounded cap
      env.dig[i] = Math.min(env.dig[i] + amt * w, MOUND_CAP);
    }
  }
  // throttle the mesh bake — clustered kills self-heal on the next nearby corpse,
  // so we never pay a terrain refresh on every single death during a burst
  env._moundTick = (env._moundTick || 0) + 1;
  if (env._moundTick % 3 === 0) refreshTerrain(env, x, z, radius + 1.5);
}

// a visible explosion: expanding fireball + rising smoke + flash light + debris
function explodeFx(x, y, z, scale = 1) {
  const env = activeEnv;
  if (!env) return;
  if (!env._fireTex) {
    env._fireTex = makeRadialTexture(128, [
      [0.0, 'rgba(255,250,210,1)'], [0.28, 'rgba(255,160,46,.95)'],
      [0.62, 'rgba(150,46,12,.5)'], [1.0, 'rgba(0,0,0,0)'],
    ]);
    env._smokeTex = makeRadialTexture(128, [
      [0.0, 'rgba(46,42,38,.9)'], [0.55, 'rgba(30,28,25,.45)'], [1.0, 'rgba(0,0,0,0)'],
    ]);
  }
  const fire = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 12),
    new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  fire.position.set(x, y + 1.6 * scale, z);
  env.group.add(fire);
  const smoke = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: env._smokeTex, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
  smoke.position.set(x, y + 2.4 * scale, z);
  env.group.add(smoke);
  const light = new THREE.PointLight(0xffa040, 26 * scale, 70 * scale, 2);
  light.position.set(x, y + 4 * scale, z);
  env.group.add(light);
  env.lights.push({ light, t: 0.45 });
  // hot white-out core that flashes and dies fast — the initial punch
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xfff6dc, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  core.position.copy(fire.position);
  env.group.add(core);
  // ground shockwave ring expanding outward
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 1, 40),
    new THREE.MeshBasicMaterial({ color: 0xffd49a, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, y + 0.3, z);
  env.group.add(ring);
  spawnDebris(env, x, z, 4.2 * scale, 22, true);
  env.blasts.push({ fire, core, smoke, ring, t: 0, life: 0.6 + 0.25 * scale, scale });
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
  // tighter, slightly oval pool — no more 20m pink smear
  const s = radius * 1.1;
  m.scale.set(s * (0.9 + rnd() * 0.2), s * (0.9 + rnd() * 0.2), 1);
  m.material.opacity = 0.6;
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
    constructing: [],
    spinners: [],
    terrainDirty: false,
    blasts: [],
  };
  activeEnv = env;
  const terrain = addTerrain(group, placementTargets, env);
  const { wall, gate } = addWall(group, torches, placementTargets, env);
  addDefenses(group, env);
  addRocks(group, env);
  addCliffs(group);
  addDestructionPools(group, env);
  addTreeline(group);
  addMist(group, mists);
  const groundFog = addGroundFog(group);
  const snow = null; // snowfall is handled by the camera-following weather.js now —
  // running this field-wide field too was double the snow (and double the overdraw)

  scene.add(group);

  let time = 0;
  function update(dt, camera) {
    time += dt;
    if (env.terrainDirty) { env.terrainGeo.computeVertexNormals(); env.terrainDirty = false; }

    // construction: raise structures from the ground with a small settle
    for (let i = env.constructing.length - 1; i >= 0; i--) {
      const it = env.constructing[i];
      it.build.t += dt;
      const k = Math.min(it.build.t / it.build.dur, 1);
      const e = 1 - Math.pow(1 - k, 3);
      it.group.scale.y = 0.04 + 0.96 * e;
      it.group.scale.x = it.group.scale.z = 0.9 + 0.1 * e;
      if (k >= 1) {
        it.group.scale.set(1, 1, 1);
        it.build = null;
        env.constructing.splice(i, 1);
      }
    }
    // animated building parts — sweeping radar dishes, fluttering banners
    for (const sp of env.spinners) {
      if (sp.wave) sp.m.rotation.z = Math.sin(time * 2.4 + sp.ph) * 0.12;
      else sp.m.rotation.y += dt * (sp.s || 0.6);
    }

    // explosions: fireball expands & fades, smoke billows up and drifts
    for (let i = env.blasts.length - 1; i >= 0; i--) {
      const b = env.blasts[i];
      b.t += dt;
      const k = b.t / b.life;
      if (k >= 1) {
        env.group.remove(b.fire); env.group.remove(b.smoke);
        if (b.core) { env.group.remove(b.core); b.core.geometry.dispose(); b.core.material.dispose(); }
        if (b.ring) { env.group.remove(b.ring); b.ring.geometry.dispose(); b.ring.material.dispose(); }
        b.fire.geometry.dispose(); b.fire.material.dispose(); b.smoke.material.dispose();
        env.blasts.splice(i, 1);
        continue;
      }
      b.fire.scale.setScalar((2.5 + k * 9) * b.scale);
      b.fire.material.opacity = Math.max(0, 1 - k * 1.6);
      if (b.core) { b.core.scale.setScalar((1.6 + k * 5) * b.scale); b.core.material.opacity = Math.max(0, 1 - k * 3.2); }
      if (b.ring) { const rk = Math.min(1, k * 1.4); b.ring.scale.setScalar((3 + rk * 24) * b.scale); b.ring.material.opacity = Math.max(0, 0.9 * (1 - rk)); }
      b.smoke.scale.setScalar((4 + k * 12) * b.scale);
      b.smoke.material.opacity = 0.85 * (1 - k);
      b.smoke.position.y += dt * 5;
      if (camera) b.smoke.quaternion.copy(camera.quaternion);
    }

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

    // upright fog banks: drift across, billboard to camera, breathe
    for (const m of groundFog) {
      m.position.x += m.userData.speed * dt;
      if (m.position.x > FIELD_HALF_X + 70) m.position.x = -FIELD_HALF_X - 70;
      if (camera) m.quaternion.copy(camera.quaternion);
      m.material.opacity = m.userData.base * (0.7 + Math.sin(time * 0.4 + m.userData.ph) * 0.3);
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

    if (snow) {
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
  }

  return {
    group, terrain, wall, gate,
    wallZ: WALL_Z, bounds: BOUNDS, placementTargets,
    heightAt,
    blast: blastEnvironment,
    damageEnvironment: blastEnvironment,
    explodeFx,
    placeBuildable,
    canPlaceBuildable: (kind, x, z) => canPlaceBuildable(env, kind, x, z),
    buildPressure,
    coverAt,
    targetVulnerabilityAt,
    repairNearest,
    emplacements: () => (activeEnv ? activeEnv.buildables.filter(b => b.alive && (b.kind === 'nest' || b.kind === 'tower' || b.kind === 'bunker')) : []),
    allBuildables: () => (activeEnv ? activeEnv.buildables.filter(b => b.alive) : []),
    baseBuildings: () => (activeEnv ? activeEnv.buildables.filter(b => b.alive && (b.kind === 'barracks' || b.kind === 'depot' || b.kind === 'lab')) : []),
    buildingGroups: () => (activeEnv ? activeEnv.buildables.filter(b => b.alive && b.group).map(b => b.group) : []),
    repairGate,
    gateHealth,
    works: () => env.buildables.filter(b => b.alive).length,
    update,
  };
}
