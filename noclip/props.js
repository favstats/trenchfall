// props.js — the STUFF. Liminal space is scarier furnished: everything here is
// crude box-and-cylinder work that the VHS pass sells as real. Builders return
// groups; big ones also push AABBs so you collide with what you see.
import * as THREE from './engine/three.js';

const M = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

export function textPlane(text, w, h, opts = {}) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = Math.max(64, Math.round(256 * h / w));
  const g = c.getContext('2d');
  if (opts.bg) { g.fillStyle = opts.bg; g.fillRect(0, 0, c.width, c.height); }
  g.fillStyle = opts.color || 'rgba(20,16,10,0.85)';
  g.font = `${opts.weight || 'bold'} ${opts.size || 54}px ${opts.font || 'sans-serif'}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (opts.rotate) { g.translate(c.width / 2, c.height / 2); g.rotate(opts.rotate); g.translate(-c.width / 2, -c.height / 2); }
  g.fillText(text, c.width / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  return m;
}

// ---- office ----
export function officeChair() {
  const g = new THREE.Group();
  const dark = M(0x2c2c30);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), dark); seat.position.y = 0.5;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.55, 0.07), dark); back.position.set(0, 0.85, -0.24);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), M(0x515158)); post.position.y = 0.25;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 5), M(0x515158)); base.position.y = 0.03;
  g.add(seat, back, post, base);
  return g;
}

export function fileCabinet(toppled = false) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.4, 0.6), M(0x6b6f66));
  body.position.y = 0.7;
  for (let i = 0; i < 4; i++) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.03), M(0x3c3f38));
    h.position.set(0, 0.25 + i * 0.33, 0.31);
    g.add(h);
  }
  g.add(body);
  if (toppled) { g.rotation.z = Math.PI / 2 - 0.06; g.position.y = 0.28; }
  return g;
}

export function desk() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.75), M(0x7a6a4a));
  top.position.y = 0.74;
  g.add(top);
  for (const [x, z] of [[-0.68, -0.3], [0.68, -0.3], [-0.68, 0.3], [0.68, 0.3]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.74, 0.06), M(0x4c4232));
    leg.position.set(x, 0.37, z);
    g.add(leg);
  }
  return g;
}

// CRT with a LIVE static screen — the canvas re-noises itself on update()
export function crtTV() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.55), M(0x35322c));
  body.position.y = 0.25;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.36),
    new THREE.MeshBasicMaterial({ map: tex }));
  screen.position.set(0, 0.27, 0.281);
  g.add(body, screen);
  let acc = 0, on = true;
  g.userData.update = (dt) => {
    acc += dt;
    if (acc < 0.09) return;
    acc = 0;
    const d = ctx.createImageData(64, 64);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = on ? (Math.random() * 235) | 0 : 8;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
    }
    ctx.putImageData(d, 0, 0);
    tex.needsUpdate = true;
  };
  g.userData.setOn = (v) => { on = v; };
  return g;
}

export function rotaryPhone() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.24), M(0x8a1f1a));
  base.position.y = 0.05;
  const hs = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.26, 8), M(0x701713));
  hs.rotation.z = Math.PI / 2; hs.position.y = 0.14;
  g.add(base, hs);
  return g;
}

export function wetFloorSign() {
  const g = new THREE.Group();
  const mat = M(0xd8c22e);
  const a = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.62, 0.02), mat);
  a.rotation.x = 0.22; a.position.y = 0.3;
  const b = a.clone(); b.rotation.x = -0.22;
  g.add(a, b);
  const label = textPlane('!', 0.16, 0.3, { color: '#3a2f08', size: 150 });
  label.position.set(0, 0.32, 0.08); label.rotation.x = -0.22;
  g.add(label);
  return g;
}

export function papers(n = 8) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xd8d4c2, side: THREE.DoubleSide });
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.29), mat);
    p.rotation.set(-Math.PI / 2 + (Math.random() - 0.5) * 0.08, 0, Math.random() * Math.PI);
    p.position.set((Math.random() - 0.5) * 2.2, 0.012 + Math.random() * 0.01, (Math.random() - 0.5) * 2.2);
    g.add(p);
  }
  return g;
}

export function almondWater() {
  const g = new THREE.Group();
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.3, 10),
    new THREE.MeshLambertMaterial({ color: 0xe8e2d0, emissive: 0x4a4636 }));
  bottle.position.y = 0.15;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 8), M(0x9a3f2a));
  cap.position.y = 0.32;
  g.add(bottle, cap);
  g.userData.update = (dt, t) => { g.rotation.y = t * 0.8; }; // it wants to be found
  return g;
}

export function doorFrame(color = 0x5a4632) {
  const g = new THREE.Group();
  const mat = M(color);
  const l = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.1, 0.12), mat); l.position.set(-0.5, 1.05, 0);
  const r = l.clone(); r.position.x = 0.5;
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.12, 0.12), mat); top.position.y = 2.12;
  g.add(l, r, top);
  return g;
}

export function wallClock(hh = 3, mm = 41) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#e8e2d0'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#2c2620'; g.lineWidth = 5; g.stroke();
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    g.beginPath(); g.moveTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50);
    g.lineTo(64 + Math.sin(a) * 56, 64 - Math.cos(a) * 56); g.lineWidth = 3; g.stroke();
  }
  const ha = (hh % 12) / 12 * Math.PI * 2, ma = mm / 60 * Math.PI * 2;
  g.lineWidth = 6; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.sin(ha) * 30, 64 - Math.cos(ha) * 30); g.stroke();
  g.lineWidth = 4; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.sin(ma) * 46, 64 - Math.cos(ma) * 46); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.CircleGeometry(0.28, 24),
    new THREE.MeshBasicMaterial({ map: t }));
}

// ---- party ----
export function balloon(color) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10),
    new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35 }));
  b.scale.y = 1.18;
  const s = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.4, 3), M(0x888888));
  s.position.y = -0.85;
  g.add(b, s);
  g.userData.update = (dt, t, seed = 0) => { g.position.y += Math.sin(t * 0.7 + seed) * dt * 0.03; };
  return g;
}

export function bunting(x1, z1, x2, z2, y) {
  const g = new THREE.Group();
  const colors = [0xc84b4b, 0x4b7ec8, 0xd8c22e, 0x4bc86a, 0xb04bc8];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const sag = Math.sin(t * Math.PI) * 0.5;
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 3),
      new THREE.MeshLambertMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide }));
    f.position.set(x1 + (x2 - x1) * t, y - sag - 0.16, z1 + (z2 - z1) * t);
    f.rotation.x = Math.PI;
    g.add(f);
  }
  return g;
}

export function giftBox(color) {
  const g = new THREE.Group();
  const s = 0.3 + Math.random() * 0.3;
  const box = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.8, s), M(color));
  box.position.y = s * 0.4;
  const ribbon = new THREE.Mesh(new THREE.BoxGeometry(s * 0.14, s * 0.82, s * 1.02), M(0xe8e2d0));
  ribbon.position.y = s * 0.4;
  g.add(box, ribbon);
  return g;
}

export function partyTable() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.8), M(0xd8d4c8));
  top.position.y = 0.72;
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.5, 0.84), M(0xc8cee0));
  cloth.position.y = 0.5;
  g.add(top, cloth);
  return g;
}

// ---- garage ----
export function deadCar(color = 0x37424c) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.85, 1.8), M(color));
  body.position.y = 0.65;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.65, 1.7), M(color));
  cab.position.set(-0.2, 1.35, 0);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.4, 1.72), M(0x11181f));
  glass.position.set(-0.2, 1.4, 0);
  g.add(body, cab, glass);
  const wheelG = new THREE.CylinderGeometry(0.36, 0.36, 0.25, 12);
  for (const [x, z] of [[-1.4, 0.95], [1.4, 0.95], [-1.4, -0.95], [1.4, -0.95]]) {
    const w = new THREE.Mesh(wheelG, M(0x151517));
    w.rotation.x = Math.PI / 2; w.position.set(x, 0.36, z);
    g.add(w);
  }
  return g;
}

export function trafficCone() {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 10), M(0xc85a2a, { emissive: 0x3a1607 }));
  c.position.y = 0.27;
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.4), M(0xb04e24));
  b.position.y = 0.02;
  g.add(c, b);
  return g;
}

// ---- pool ----
export function poolLadder() {
  const g = new THREE.Group();
  const mat = M(0xc8d2d8, { emissive: 0x222a2e });
  for (const x of [-0.25, 0.25]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.4, 8), mat);
    rail.position.set(x, 0.7, 0);
    g.add(rail);
  }
  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), mat);
    step.rotation.z = Math.PI / 2; step.position.y = 0.25 + i * 0.4;
    g.add(step);
  }
  return g;
}

export function swimRing(color = 0xc84b4b) {
  const r = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.16, 10, 20),
    new THREE.MeshLambertMaterial({ color }));
  r.rotation.x = -Math.PI / 2;
  r.userData.update = (dt, t, seed = 0) => {
    r.position.y = r.userData.baseY + Math.sin(t * 0.9 + seed) * 0.04;
    r.rotation.z = t * 0.05;
  };
  return r;
}

// the mannequin: white, featureless, standing in the water. its head follows.
export function mannequin() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xe6e2da });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.85, 10), mat);
  torso.position.y = 1.05;
  const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.4, 10), mat);
  hips.position.y = 0.5;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), mat);
  head.position.y = 1.66;
  head.scale.y = 1.25;
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.7, 8), mat);
    arm.position.set(s * 0.3, 1.12, 0);
    arm.rotation.z = s * 0.12;
    g.add(arm);
  }
  g.add(torso, hips, head);
  g.userData.head = head;
  return g;
}
