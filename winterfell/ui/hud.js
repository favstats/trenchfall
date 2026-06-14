// hud.js — DOM overlay: objective banner, force/selection readout, tallies,
// call-in buttons, end screen, and the drag-select box. Reads GameState + Force.
export function createHUD(root, state, hooks = {}) {
  root.innerHTML = `
    <div id="bootTag">THE LONG NIGHT · HOLD THE WALL</div>
    <div id="objective" class="panel">
      <div class="obj-title">THE FIRST ASSAULT</div>
      <div class="obj-sub" id="objSub">hold the wall · survive the night</div>
      <div class="obj-timer" id="objTimer">2:30</div>
    </div>
    <div id="tally" class="panel">
      <div><span id="tKills">0</span><label>DEAD FELLED</label></div>
      <div><span id="tMen">0</span><label>MEN STANDING</label></div>
      <div><span id="tRisen">0</span><label>ROSE AGAINST YOU</label></div>
    </div>
    <div id="economy" class="panel">
      <div class="econ-top"><label>SUPPLY</label><span id="tSupply">0</span></div>
      <div class="gate-read"><label>GATE</label><div class="gate-track"><i id="gateBar"></i></div></div>
      <div class="works-read"><label>WORKS</label><span id="tWorks">0</span></div>
    </div>
    <div id="selPanel" class="panel"><div class="sel-empty">no unit selected</div></div>
    <div id="callins">
      <button class="callin" id="ciMortar" data-k="V">MORTAR<small>×1</small></button>
      <button class="callin" id="ciReserve" data-k="C">MUSTER<small>65</small></button>
      <button class="callin" id="ciRepair" data-k="R">REPAIR<small>45</small></button>
      <button class="callin" id="ciBarricade" data-k="B">BARRICADE<small>35</small></button>
      <button class="callin" id="ciSpikes" data-k="N">SPIKES<small>26</small></button>
    </div>
    <div id="possessionTag"></div>
    <div id="crosshair"></div>
    <div id="hint">LMB select/build · RMB move · B/N works · R repair · C muster · F direct · H hold · Z hold-fire</div>
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
    mortar: $('#ciMortar'), reserve: $('#ciReserve'), repair: $('#ciRepair'),
    barricade: $('#ciBarricade'), spikes: $('#ciSpikes'),
    possession: $('#possessionTag'), crosshair: $('#crosshair'),
    end: $('#endscreen'), endTitle: $('#endTitle'), endSub: $('#endSub'),
    endStats: $('#endStats'), endAgain: $('#endAgain'),
  };

  el.mortar.onclick = () => hooks.onMortar && hooks.onMortar();
  el.reserve.onclick = () => hooks.onReserve && hooks.onReserve();
  el.repair.onclick = () => hooks.onRepair && hooks.onRepair();
  el.barricade.onclick = () => hooks.onBuildBarricade && hooks.onBuildBarricade();
  el.spikes.onclick = () => hooks.onBuildSpikes && hooks.onBuildSpikes();
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
    el.repair.classList.toggle('spent', (state.supply ?? 0) < state.costs.repair || state.gateHp >= 0.995);
    el.barricade.classList.toggle('spent', (state.supply ?? 0) < state.costs.barricade);
    el.spikes.classList.toggle('spent', (state.supply ?? 0) < state.costs.spikes);
    el.barricade.classList.toggle('active', state.buildMode === 'barricade');
    el.spikes.classList.toggle('active', state.buildMode === 'spikes');
    el.repair.querySelector('small').textContent = state.costs.repair;
    el.barricade.querySelector('small').textContent = state.costs.barricade;
    el.spikes.querySelector('small').textContent = state.costs.spikes;
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
    el.endTitle.textContent = state.held ? 'THE WALL HELD' : 'WINTERFELL IS OVERRUN';
    el.endTitle.className = state.held ? 'win' : 'lose';
    el.endSub.textContent = state.held
      ? 'the first assault is broken — dawn is a long way off'
      : 'the dead pour through the breach';
    el.endStats.innerHTML = `
      <div><span>${state.kills}</span>dead felled</div>
      <div><span>${state.menLost}</span>men lost</div>
      <div><span>${state.menRisen}</span>rose against you</div>
      <div><span>${Math.floor(state.time)}s</span>held the line</div>`;
    el.end.classList.add('show');
  }

  return { update, showDragBox, hideDragBox, showEnd };
}
