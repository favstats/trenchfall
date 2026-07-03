// textures.js — every surface in NOCLIP is painted here on canvas at boot.
// No image assets: the mono-yellow wallpaper, the damp carpet, the stained
// ceiling grid, garage concrete and pool tile are all procedural, tiled and
// mip-mapped. Grime is what sells liminal space — nothing is clean.
import * as THREE from './engine/three.js';

function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function grime(g, w, h, n, alpha, tone = '0,0,0') {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = 6 + Math.random() * 60;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${tone},${alpha * (0.4 + Math.random() * 0.6)})`);
    gr.addColorStop(1, `rgba(${tone},0)`);
    g.fillStyle = gr;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
}

function speckle(g, w, h, n, col, a) {
  g.fillStyle = col; g.globalAlpha = a;
  for (let i = 0; i < n; i++) g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  g.globalAlpha = 1;
}

export function makeTextures() {
  // ---- the wallpaper: THE yellow, faint vertical stripe, grimed hem ----
  const wallpaper = canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#b7a049'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {                      // two-tone stripe
      g.fillStyle = x % 32 ? '#b39c45' : '#bda551';
      g.fillRect(x, 0, 16, h);
    }
    for (let x = 0; x < w; x += 4) {                        // fine weave
      g.fillStyle = `rgba(0,0,0,${0.02 + Math.random() * 0.025})`;
      g.fillRect(x, 0, 1, h);
    }
    speckle(g, w, h, 260, '#8f7c33', 0.35);
    grime(g, w, h, 26, 0.08);
    const hem = g.createLinearGradient(0, h * 0.72, 0, h); // damp rises from the carpet
    hem.addColorStop(0, 'rgba(70,55,18,0)');
    hem.addColorStop(1, 'rgba(70,55,18,0.4)');
    g.fillStyle = hem; g.fillRect(0, 0, w, h);
  });

  // ---- carpet: mottled, damp, slightly wrong ----
  const carpet = canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#7d6c33'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = Math.random();
      g.fillStyle = v < 0.5 ? '#71622c' : v < 0.85 ? '#877638' : '#93813d';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    grime(g, w, h, 34, 0.12);
    grime(g, w, h, 8, 0.1, '40,45,20');                    // old spills
  });

  // ---- ceiling: acoustic tile grid + water stains ----
  const ceiling = canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#cfc9b4'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 2400, '#a8a28c', 0.5);
    g.strokeStyle = '#8e8874'; g.lineWidth = 3;
    for (let x = 0; x <= w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 128) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    grime(g, w, h, 10, 0.16, '120,100,50');                // the classic stain
  });

  // ---- garage concrete: cold, cracked, tire-scuffed ----
  const concrete = canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#5c5c60'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 5200, '#525256', 0.6);
    speckle(g, w, h, 1800, '#6a6a6e', 0.5);
    g.strokeStyle = 'rgba(30,30,32,0.5)'; g.lineWidth = 1;
    for (let i = 0; i < 7; i++) {                           // cracks
      g.beginPath();
      let x = Math.random() * w, y = Math.random() * h;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); }
      g.stroke();
    }
    grime(g, w, h, 30, 0.2);
  });

  const concreteWall = canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#66666a'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 4200, '#5d5d61', 0.6);
    g.fillStyle = 'rgba(40,40,44,0.5)';
    g.fillRect(0, h * 0.44, w, 5);                          // form line
    grime(g, w, h, 22, 0.18);
  });

  // ---- poolrooms tile: small white squares, blue-grey grout ----
  const tile = canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#9fb2b8'; g.fillRect(0, 0, w, h);        // grout
    const s = 32, gap = 3;
    for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
      const v = 232 + Math.random() * 18;
      g.fillStyle = `rgb(${v},${v + 3},${v + 5})`;
      g.fillRect(x + gap / 2, y + gap / 2, s - gap, s - gap);
    }
    grime(g, w, h, 12, 0.05, '60,90,100');
  });

  // ---- caustics: additive light web projected on pool surfaces ----
  const caustics = canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2;
    for (let i = 0; i < 42; i++) {
      g.beginPath();
      const cx = Math.random() * w, cy = Math.random() * h, r = 14 + Math.random() * 30;
      for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.35) {
        const rr = r * (0.7 + Math.random() * 0.5);
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }
  });

  // ---- level fun: pastel party wall covered in crayon ----
  const crayon = canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#c9bfa4'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 900, '#bdb298', 0.5);
    const cols = ['#b04a3e', '#3e6ab0', '#b0a03e', '#4ab05e', '#8a4ab0'];
    for (let i = 0; i < 22; i++) {                          // crayon scribbles
      g.strokeStyle = cols[i % cols.length];
      g.globalAlpha = 0.5 + Math.random() * 0.4;
      g.lineWidth = 2 + Math.random() * 3;
      g.beginPath();
      let x = Math.random() * w, y = Math.random() * h;
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); }
      g.stroke();
    }
    g.globalAlpha = 1;
    // the smiles
    g.strokeStyle = '#8a3226'; g.lineWidth = 4;
    for (let i = 0; i < 4; i++) {
      const x = 30 + Math.random() * (w - 60), y = 30 + Math.random() * (h - 60);
      g.beginPath(); g.arc(x, y, 16, 0.2, Math.PI - 0.2); g.stroke();
      g.beginPath(); g.arc(x - 7, y - 8, 2.5, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(x + 7, y - 8, 2.5, 0, Math.PI * 2); g.stroke();
    }
    grime(g, w, h, 18, 0.1);
  });

  // ---- red hall: painted brick-red maintenance corridor ----
  const redwall = canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#6e1f18'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 3200, '#611b14', 0.7);
    speckle(g, w, h, 1200, '#7d2620', 0.6);
    g.fillStyle = 'rgba(20,6,4,0.5)';
    for (let y = 42; y < h; y += 42) g.fillRect(0, y, w, 3);  // panel lines
    grime(g, w, h, 26, 0.22);
  });

  // ---- food court: checkered vinyl ----
  const checker = canvas(256, 256, (g, w, h) => {
    const s = 32;
    for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
      const on = ((x + y) / s) % 2 === 0;
      const v = on ? 224 + Math.random() * 14 : 30 + Math.random() * 14;
      g.fillStyle = `rgb(${v},${v - (on ? 6 : 0)},${v - (on ? 14 : 4)})`;
      g.fillRect(x, y, s, s);
    }
    grime(g, w, h, 20, 0.12);
  });

  // ---- garden: a ceiling painted like a sky by someone who forgot skies ----
  const skyceil = canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#7aa8cc'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 20 + Math.random() * 34;
      const grd = g.createRadialGradient(x, y, 2, x, y, r);
      grd.addColorStop(0, 'rgba(240,244,248,0.9)');
      grd.addColorStop(1, 'rgba(240,244,248,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    grime(g, w, h, 8, 0.06, '60,80,100');
  });

  // ---- archive: shelves of book spines, tiled up the stacks ----
  const books = canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#3a2c1c'; g.fillRect(0, 0, w, h);
    const rows = 4, rh = h / rows;
    const cols = ['#6a3a2a', '#2a4a5a', '#5a5a2a', '#4a2a4a', '#7a6a4a', '#2a3a2a'];
    for (let r = 0; r < rows; r++) {
      let x = 0;
      while (x < w) {
        const bw = 8 + Math.random() * 14;
        const bh = rh * (0.62 + Math.random() * 0.28);
        g.fillStyle = cols[(Math.random() * cols.length) | 0];
        g.fillRect(x, (r + 1) * rh - bh - 3, bw - 1.5, bh);
        x += bw;
      }
      g.fillStyle = '#241a10'; g.fillRect(0, (r + 1) * rh - 3, w, 3);
    }
    grime(g, w, h, 12, 0.14);
  });

  // ---- hotel: maroon stripe wallpaper + red corridor carpet ----
  const hotelpaper = canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#5a2a28'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 22) { g.fillStyle = x % 44 ? '#63302c' : '#521f1e'; g.fillRect(x, 0, 11, h); }
    speckle(g, w, h, 300, '#401a18', 0.4);
    grime(g, w, h, 16, 0.14);
  });
  const hotelcarpet = canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#6a1f1c'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) {
      g.strokeStyle = 'rgba(200,160,90,0.35)'; g.lineWidth = 2;
      g.strokeRect(x + 6, y + 6, 20, 20);
    }
    speckle(g, w, h, 2000, '#5a1a16', 0.5);
    grime(g, w, h, 20, 0.16);
  });

  return { wallpaper, carpet, ceiling, concrete, concreteWall, tile, caustics, crayon, redwall, checker, skyceil, books, hotelpaper, hotelcarpet };
}
