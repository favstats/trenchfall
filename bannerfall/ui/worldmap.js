// worldmap.js — the sandbox: a parchment campaign map. Your banner rides where
// you point it; red warbands wander with their strength written under them;
// villages sell swords; the Warlord's keep waits until you think you're ready.
export function createWorldMap(root, hooks = {}) {
  const wrap = document.createElement('div');
  wrap.id = 'wmap';
  wrap.innerHTML = `<canvas width="1100" height="640"></canvas>
    <div id="wmTip">click to ride · reach a red band to give battle · villages recruit · the keep ends it</div>
    <div id="wmGold"></div>`;
  root.appendChild(wrap);
  const cv = wrap.querySelector('canvas'), g = cv.getContext('2d');
  const tipEl = wrap.querySelector('#wmTip'), goldEl = wrap.querySelector('#wmGold');

  const S = {
    you: { x: 190, y: 480, tx: 190, ty: 480 },
    villages: [
      { x: 170, y: 500, name: 'Ashford' }, { x: 420, y: 210, name: 'Greywell' },
      { x: 640, y: 470, name: 'Thornby' }, { x: 860, y: 300, name: 'Millcross' },
    ],
    bands: [],
    keep: { x: 950, y: 120, name: "WARLORD'S KEEP", strength: 48 },
    visible: false,
  };
  for (let i = 0; i < 6; i++) {
    S.bands.push({
      x: 300 + Math.random() * 620, y: 120 + Math.random() * 420,
      a: Math.random() * 6.28, strength: 12 + ((Math.random() * 40) | 0), alive: true,
    });
  }

  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect();
    S.you.tx = (e.clientX - r.left) * (cv.width / r.width);
    S.you.ty = (e.clientY - r.top) * (cv.height / r.height);
  });

  function draw() {
    g.fillStyle = '#2a1c0e'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#38260f';
    for (let i = 0; i < 40; i++) g.fillRect((i * 173) % cv.width, (i * 97) % cv.height, 60, 34);
    // roads
    g.strokeStyle = 'rgba(200,170,110,.25)'; g.lineWidth = 2; g.setLineDash([6, 8]);
    for (const v of S.villages) { g.beginPath(); g.moveTo(v.x, v.y); g.lineTo(S.keep.x, S.keep.y); g.stroke(); }
    g.setLineDash([]);
    const node = (x, y, col, r = 9) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 6.29); g.fill(); };
    const label = (x, y, t, col = '#d8c49a') => { g.fillStyle = col; g.font = '13px Cinzel, serif'; g.textAlign = 'center'; g.fillText(t, x, y); };
    for (const v of S.villages) { node(v.x, v.y, '#c8a860'); label(v.x, v.y + 24, v.name); }
    node(S.keep.x, S.keep.y, '#e04a38', 13); label(S.keep.x, S.keep.y + 28, S.keep.name, '#ff9a86');
    label(S.keep.x, S.keep.y - 20, `⚔ ${S.keep.strength}`, '#ff9a86');
    for (const b of S.bands) {
      if (!b.alive) continue;
      node(b.x, b.y, '#b03426');
      label(b.x, b.y + 22, `⚔ ${b.strength}`, '#e08878');
    }
    node(S.you.x, S.you.y, '#5a8ae0', 11);
    label(S.you.x, S.you.y - 18, 'YOUR BANNER', '#a8c4f0');
  }

  function update(dt, gold, army) {
    if (!S.visible) return;
    goldEl.textContent = `⚔ ${army} swords · ${gold} 🜚`;
    const dx = S.you.tx - S.you.x, dy = S.you.ty - S.you.y;
    const d = Math.hypot(dx, dy);
    if (d > 3) { S.you.x += dx / d * 90 * dt; S.you.y += dy / d * 90 * dt; }
    for (const b of S.bands) {
      if (!b.alive) continue;
      b.a += (Math.random() - 0.5) * dt * 2;
      b.x += Math.cos(b.a) * 22 * dt; b.y += Math.sin(b.a) * 22 * dt;
      b.x = Math.max(260, Math.min(1050, b.x)); b.y = Math.max(80, Math.min(590, b.y));
      if (Math.hypot(b.x - S.you.x, b.y - S.you.y) < 20) { hooks.onBattle && hooks.onBattle(b); return; }
    }
    for (const v of S.villages) {
      if (Math.hypot(v.x - S.you.x, v.y - S.you.y) < 18 && !v._in) { v._in = true; hooks.onVillage && hooks.onVillage(v); }
      else if (Math.hypot(v.x - S.you.x, v.y - S.you.y) >= 22) v._in = false;
    }
    if (Math.hypot(S.keep.x - S.you.x, S.keep.y - S.you.y) < 22) { hooks.onKeep && hooks.onKeep(S.keep); return; }
    draw();
  }

  function show(v) { S.visible = v; wrap.classList.toggle('show', v); if (v) draw(); }
  return { update, show, state: S };
}
