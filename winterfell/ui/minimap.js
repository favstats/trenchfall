// minimap.js — the tactical overview every RTS needs. A top-down canvas radar of the
// whole field: the wall + gate, your works and soldiers, the tide of dead, and the
// camera's view footprint. Click (or drag) it to fling the camera across the map.
import { WALL_Z, NORTH_Z, FIELD_HALF_X, GATE_W } from '../world/field.js';

// world extents the radar covers (north/enemy at the top, courtyard at the bottom)
const X0 = -FIELD_HALF_X - 12, X1 = FIELD_HALF_X + 12;
const Z0 = NORTH_Z - 8, Z1 = WALL_Z + 78;
const SPAN_X = X1 - X0, SPAN_Z = Z1 - Z0;

export function createMinimap(parent, refs) {
  const wrap = document.createElement('div');
  wrap.id = 'minimap';
  wrap.className = 'panel';
  wrap.innerHTML = `<div class="mm-title">TACTICAL MAP</div><canvas width="384" height="384"></canvas>`;
  parent.appendChild(wrap);
  const cv = wrap.querySelector('canvas');
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;

  const toMapX = wx => ((wx - X0) / SPAN_X) * W;
  const toMapY = wz => ((wz - Z0) / SPAN_Z) * H;
  const toWorld = (mx, my) => ({ x: X0 + (mx / W) * SPAN_X, z: Z0 + (my / H) * SPAN_Z });

  // click / drag to recentre the camera
  function jump(ev) {
    const r = cv.getBoundingClientRect();
    const mx = ((ev.clientX - r.left) / r.width) * W;
    const my = ((ev.clientY - r.top) / r.height) * H;
    const w = toWorld(mx, my);
    refs.rig?.frame?.(w.x, w.z);
  }
  let dragging = false;
  cv.addEventListener('pointerdown', e => { dragging = true; jump(e); e.preventDefault(); });
  cv.addEventListener('pointermove', e => { if (dragging) jump(e); });
  window.addEventListener('pointerup', () => { dragging = false; });

  const FILL = {
    nest: '#7fe3ff', tower: '#7fe3ff', bunker: '#7fe3ff',
    barracks: '#ffd27a', depot: '#ffd27a', lab: '#c9a0ff',
    floodlight: '#fff0b0', brazier: '#ff9a52', ammo: '#a8e0a0',
  };

  let acc = 0;
  function draw() {
    const { field, force, horde, camera } = refs;
    // backdrop: kill-zone (north) darker, courtyard (south of wall) a touch warmer
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#0a1119'; g.fillRect(0, 0, W, H);
    const wy = toMapY(WALL_Z);
    g.fillStyle = 'rgba(28,42,30,0.5)'; g.fillRect(0, wy, W, H - wy);     // courtyard band
    g.fillStyle = 'rgba(40,20,22,0.35)'; g.fillRect(0, 0, W, wy);         // killing ground

    // the wall, with the gate gap
    g.strokeStyle = '#aebccb'; g.lineWidth = 3;
    g.beginPath();
    g.moveTo(toMapX(-FIELD_HALF_X), wy); g.lineTo(toMapX(-GATE_W / 2), wy);
    g.moveTo(toMapX(GATE_W / 2), wy); g.lineTo(toMapX(FIELD_HALF_X), wy);
    g.stroke();
    g.strokeStyle = '#ffcf8a'; g.lineWidth = 2;                          // the gate
    g.beginPath(); g.moveTo(toMapX(-GATE_W / 2), wy); g.lineTo(toMapX(GATE_W / 2), wy); g.stroke();

    // works / buildings
    const works = field?.allBuildables?.() || [];
    for (const b of works) {
      if (!b.alive) continue;
      g.fillStyle = FILL[b.kind] || '#9fb4c8';
      const s = (b.kind === 'barracks' || b.kind === 'lab' || b.kind === 'depot' || b.kind === 'bunker') ? 5 : 3.4;
      g.fillRect(toMapX(b.x) - s / 2, toMapY(b.z) - s / 2, s, s);
    }

    // the dead — sampled so the radar stays cheap with a 9000-strong horde
    const dead = horde?.agents || [];
    const step = Math.max(1, Math.ceil(dead.length / 520));
    g.fillStyle = '#e2483c';
    for (let i = 0; i < dead.length; i += step) {
      const a = dead[i];
      if (a.dead) continue;
      g.fillRect(toMapX(a.x) - 1, toMapY(a.z) - 1, 2.2, 2.2);
    }

    // your soldiers
    const sol = force?.soldiers || [];
    g.fillStyle = '#6cc4ff';
    for (const s of sol) {
      if (!s.alive) continue;
      const p = s.pos || s.g?.position; if (!p) continue;
      g.fillRect(toMapX(p.x) - 1.4, toMapY(p.z) - 1.4, 2.8, 2.8);
    }

    // camera view footprint: cast the camera's forward to the ground plane
    if (camera) {
      const cp = camera.position;
      const dx = -Math.sin(cameraYaw(camera)), dz = -Math.cos(cameraYaw(camera));
      // approximate ground focus straight from camera height + pitch-free heading
      const fx = cp.x + dx * 40, fz = cp.z + dz * 40;
      g.strokeStyle = 'rgba(230,245,255,0.9)'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(toMapX(fx), toMapY(fz), 6, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(230,245,255,0.32)';
      g.beginPath();
      g.moveTo(toMapX(cp.x), toMapY(cp.z));
      g.lineTo(toMapX(fx), toMapY(fz));
      g.stroke();
    }
  }

  function cameraYaw(camera) {
    // derive heading from the camera's world forward (XZ only)
    const e = camera.matrixWorld.elements;
    return Math.atan2(-e[8], -e[10]);
  }

  function update(dt = 0.016) {
    acc += dt;
    if (acc < 0.06) return; // ~16 Hz is plenty for a radar
    acc = 0;
    draw();
  }

  return { update, el: wrap };
}
