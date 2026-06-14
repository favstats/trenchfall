// hud.js — DOM overlay: objective banner, force/selection readout, tallies,
// call-in buttons, end screen, and the drag-select box. Reads GameState + Force.
export function createHUD(root, state, hooks = {}) {
  root.innerHTML = `
    <div id="bootTag">THE LONG NIGHT · DIG IN</div>
    <div id="objective" class="panel">
      <div class="obj-title">DIG IN</div>
      <div class="obj-sub" id="objSub">hold the trench line · survive the night</div>
      <div class="obj-timer" id="objTimer">2:30</div>
    </div>
    <div id="tally" class="panel">
      <div><span id="tKills">0</span><label>DEAD FELLED</label></div>
      <div><span id="tMen">0</span><label>MEN STANDING</label></div>
      <div><span id="tRisen">0</span><label>ROSE AGAINST YOU</label></div>
    </div>
    <div id="economy" class="panel">
      <div class="econ-top"><label>SUPPLY</label><span id="tSupply">0</span></div>
      <div class="gate-read"><label>LINE</label><div class="gate-track"><i id="gateBar"></i></div></div>
      <div class="works-read"><label>WORKS</label><span id="tWorks">0</span></div>
    </div>
    <div id="selPanel" class="panel"><div class="sel-empty">no unit selected</div></div>
    <div id="callins">
      <button class="callin" id="ciMortar" data-k="V">MORTAR<small>×1</small></button>
      <button class="callin" id="ciReserve" data-k="C">MUSTER<small>65</small></button>
      <button class="callin" id="ciTrench" data-k="T">TRENCH<small>42</small></button>
      <button class="callin" id="ciWire" data-k="N">WIRE<small>28</small></button>
      <button class="callin" id="ciSandbag" data-k="B">SANDBAGS<small>32</small></button>
      <button class="callin" id="ciNest" data-k="G">MG NEST<small>74</small></button>
      <button class="callin" id="ciTower" data-k="Y">TOWER<small>88</small></button>
      <button class="callin" id="ciPit" data-k="M">PIT<small>36</small></button>
      <button class="callin" id="ciFloodlight" data-k="L">LIGHT<small>58</small></button>
      <button class="callin" id="ciAmmo" data-k="O">AMMO<small>52</small></button>
      <button class="callin" id="ciBunker" data-k="Q">BUNKER<small>110</small></button>
      <button class="callin" id="ciBrazier" data-k="E">BRAZIER<small>46</small></button>
    </div>
    <div id="possessionTag"></div>
    <div id="crosshair"></div>
    <div id="hint">LMB select/build · RMB move · T trench · N wire · B bags · G nest · Y tower · M pit · L light · O ammo · Q bunker · E brazier</div>
    <div id="dragbox"></div>
    <div id="endscreen"><div class="end-card">
      <h1 id="endTitle">HELD</h1>
      <div id="endSub"></div>
      <div class="end-stats" id="endStats"></div>
      <button id="endAgain">STAND TO AGAIN</button>
    </div></div>
  `;

  const $ = id => root.querySelector(id);
  const el = {
    objSub: $('#objSub'), timer: $('#objTimer'),
    kills: $('#tKills'), men: $('#tMen'), risen: $('#tRisen'),
    supply: $('#tSupply'), gateBar: $('#gateBar'), works: $('#tWorks'),
    sel: $('#selPanel'), dragbox: $('#dragbox'),
    mortar: $('#ciMortar'), reserve: $('#ciReserve'),
    trench: $('#ciTrench'), wire: $('#ciWire'), sandbag: $('#ciSandbag'),
    nest: $('#ciNest'), tower: $('#ciTower'), pit: $('#ciPit'),
    floodlight: $('#ciFloodlight'), ammo: $('#ciAmmo'),
    bunker: $('#ciBunker'), brazier: $('#ciBrazier'),
    possession: $('#possessionTag'), crosshair: $('#crosshair'),
    end: $('#endscreen'), endTitle: $('#endTitle'), endSub: $('#endSub'),
    endStats: $('#endStats'), endAgain: $('#endAgain'),
  };

  el.mortar.onclick = () => hooks.onMortar && hooks.onMortar();
  el.reserve.onclick = () => hooks.onReserve && hooks.onReserve();
  el.trench.onclick = () => hooks.onBuildTrench && hooks.onBuildTrench();
  el.wire.onclick = () => hooks.onBuildWire && hooks.onBuildWire();
  el.sandbag.onclick = () => hooks.onBuildSandbag && hooks.onBuildSandbag();
  el.nest.onclick = () => hooks.onBuildNest && hooks.onBuildNest();
  el.tower.onclick = () => hooks.onBuildTower && hooks.onBuildTower();
  el.pit.onclick = () => hooks.onBuildPit && hooks.onBuildPit();
  el.floodlight.onclick = () => hooks.onBuildFloodlight && hooks.onBuildFloodlight();
  el.ammo.onclick = () => hooks.onBuildAmmo && hooks.onBuildAmmo();
  el.bunker.onclick = () => hooks.onBuildBunker && hooks.onBuildBunker();
  el.brazier.onclick = () => hooks.onBuildBrazier && hooks.onBuildBrazier();
  el.endAgain.onclick = () => location.reload();

  function fmt(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; }

  function update(force) {
    el.kills.textContent = state.kills;
    el.men.textContent = state.menRemaining;
    el.risen.textContent = state.menRisen;
    el.timer.textContent = fmt(state.timeLeft);
    el.supply.textContent = Math.floor(state.supply ?? 0);
    el.works.textContent = state.works ?? 0;
    el.gateBar.style.width = `${Math.max(0, Math.min(1, state.gateHp ?? 1)) * 100}%`;
    el.mortar.classList.toggle('spent', state.charges.mortar <= 0);
    el.mortar.querySelector('small').textContent = '×' + (state.charges.mortar ?? 0);
    if ('reserve' in state.charges) {
      el.reserve.classList.toggle('spent', state.charges.reserve <= 0);
      el.reserve.querySelector('small').textContent = '×' + state.charges.reserve;
    } else {
      // supply economy: reserve = recruit
      const cost = state.costs?.recruit ?? 0;
      el.reserve.classList.toggle('spent', (state.supply ?? 0) < cost);
      el.reserve.querySelector('small').textContent = cost ? `${cost}` : '';
    }
    el.trench.classList.toggle('spent', (state.supply ?? 0) < state.costs.trench);
    el.wire.classList.toggle('spent', (state.supply ?? 0) < state.costs.wire);
    el.sandbag.classList.toggle('spent', (state.supply ?? 0) < state.costs.sandbag);
    el.nest.classList.toggle('spent', (state.supply ?? 0) < state.costs.nest);
    el.tower.classList.toggle('spent', (state.supply ?? 0) < state.costs.tower);
    el.pit.classList.toggle('spent', (state.supply ?? 0) < state.costs.pit);
    el.floodlight.classList.toggle('spent', (state.supply ?? 0) < state.costs.floodlight);
    el.ammo.classList.toggle('spent', (state.supply ?? 0) < state.costs.ammo);
    el.bunker.classList.toggle('spent', (state.supply ?? 0) < state.costs.bunker);
    el.brazier.classList.toggle('spent', (state.supply ?? 0) < state.costs.brazier);
    el.trench.classList.toggle('active', state.buildMode === 'trench');
    el.wire.classList.toggle('active', state.buildMode === 'wire');
    el.sandbag.classList.toggle('active', state.buildMode === 'sandbag');
    el.nest.classList.toggle('active', state.buildMode === 'nest');
    el.tower.classList.toggle('active', state.buildMode === 'tower');
    el.pit.classList.toggle('active', state.buildMode === 'pit');
    el.floodlight.classList.toggle('active', state.buildMode === 'floodlight');
    el.ammo.classList.toggle('active', state.buildMode === 'ammo');
    el.bunker.classList.toggle('active', state.buildMode === 'bunker');
    el.brazier.classList.toggle('active', state.buildMode === 'brazier');
    el.trench.querySelector('small').textContent = state.costs.trench;
    el.wire.querySelector('small').textContent = state.costs.wire;
    el.sandbag.querySelector('small').textContent = state.costs.sandbag;
    el.nest.querySelector('small').textContent = state.costs.nest;
    el.tower.querySelector('small').textContent = state.costs.tower;
    el.pit.querySelector('small').textContent = state.costs.pit;
    el.floodlight.querySelector('small').textContent = state.costs.floodlight;
    el.ammo.querySelector('small').textContent = state.costs.ammo;
    el.bunker.querySelector('small').textContent = state.costs.bunker;
    el.brazier.querySelector('small').textContent = state.costs.brazier;
    el.possession.textContent = state.possession ? `DIRECT · ${state.possession}` : '';
    el.possession.classList.toggle('show', !!state.possession);
    el.crosshair.classList.toggle('show', !!state.possession);

    const sel = force.selected();
    if (!sel.length) { el.sel.innerHTML = '<div class="sel-empty">no unit selected</div>'; return; }
    el.sel.innerHTML = sel.map(s => `
      <div class="sel-row ${s.type}">
        <b>${s.label}</b>
        <span class="sel-n">${s.count}<small>/${s.members.length}</small></span>
        <span class="sel-order ${s.holdFire ? 'hold' : ''}">${s.holdFire ? 'HOLD FIRE' : s.order}</span>
      </div>`).join('');
  }

  function showDragBox(x0, y0, x1, y1) {
    const x = Math.min(x0, x1), y = Math.min(y0, y1);
    Object.assign(el.dragbox.style, {
      display: 'block', left: x + 'px', top: y + 'px',
      width: Math.abs(x1 - x0) + 'px', height: Math.abs(y1 - y0) + 'px',
    });
  }
  function hideDragBox() { el.dragbox.style.display = 'none'; }

  function showEnd() {
    el.endTitle.textContent = state.held ? 'THE LINE HELD' : 'THE WORKS ARE OVERRUN';
    el.endTitle.className = state.held ? 'win' : 'lose';
    el.endSub.textContent = state.held
      ? 'the line holds — dawn is still a long way off'
      : 'the dead overrun the works';
    el.endStats.innerHTML = `
      <div><span>${state.kills}</span>dead felled</div>
      <div><span>${state.menLost}</span>men lost</div>
      <div><span>${state.menRisen}</span>rose against you</div>
      <div><span>${Math.floor(state.time)}s</span>held the line</div>`;
    el.end.classList.add('show');
  }

  return { update, showDragBox, hideDragBox, showEnd };
}
