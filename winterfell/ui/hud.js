// hud.js — DOM overlay. Readouts (objective, tallies, economy, research), the
// selection list, and a proper RTS COMMAND PANEL (bottom-center): construction
// tabs when nothing is selected, and a per-building command card (train units /
// research tech) when a building is selected — AoE/C&C style.
export function createHUD(root, state, hooks = {}) {
  root.innerHTML = `
    <div id="bootTag">THE LONG NIGHT · DIG IN</div>
    <div id="objective" class="panel">
      <div class="obj-title">DIG IN</div>
      <div class="obj-sub" id="objSub">hold the line · survive the night</div>
      <div class="obj-timer" id="objTimer">0:00</div>
    </div>
    <div id="tally" class="panel">
      <div><span id="tKills">0</span><label>DEAD FELLED</label></div>
      <div><span id="tMen">0</span><label>MEN STANDING</label></div>
      <div><span id="tRisen">0</span><label>ROSE AGAINST YOU</label></div>
    </div>
    <div id="economy" class="panel">
      <div class="econ-top"><label>SUPPLY</label><span id="tSupply">0</span><span id="tSupplyRate" class="rate">+0/s</span></div>
      <div class="econ-top"><label>RESEARCH</label><span id="rscPts">0</span><span id="rscRate" class="rate">+0/s</span></div>
      <div class="econ-top"><label>NOISE</label><span id="tNoise">0</span><span id="tThreat" class="rate">0%</span></div>
      <div class="gate-read"><label>GATE</label><div class="gate-track"><i id="gateBar"></i></div></div>
      <div class="works-read"><label>WORKS</label><span id="tWorks">0</span></div>
    </div>
    <div id="selPanel" class="panel"><div class="sel-empty">no unit selected</div></div>

    <div id="command" class="panel">
      <div id="cmdHead"><span id="cmdTitle">CONSTRUCTION</span><span id="cmdSub"></span></div>
      <div id="cmdTabs">
        <button class="cmd-tab" data-tab="base">BASE</button>
        <button class="cmd-tab" data-tab="defense">DEFENCE</button>
        <button class="cmd-tab" data-tab="support">SUPPORT</button>
      </div>
      <div id="cmdGrid"></div>
    </div>

    <div id="possessionTag"></div>
    <div id="crosshair"></div>
    <div id="hint">LMB select · drag box · RMB move/rally · click a building to command it · Esc cancel</div>
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
    supply: $('#tSupply'), supplyRate: $('#tSupplyRate'), rscPts: $('#rscPts'), rscRate: $('#rscRate'),
    noise: $('#tNoise'), threat: $('#tThreat'),
    gateBar: $('#gateBar'), works: $('#tWorks'),
    sel: $('#selPanel'), dragbox: $('#dragbox'),
    cmdTitle: $('#cmdTitle'), cmdSub: $('#cmdSub'), cmdTabs: $('#cmdTabs'), cmdGrid: $('#cmdGrid'),
    possession: $('#possessionTag'), crosshair: $('#crosshair'),
    end: $('#endscreen'), endTitle: $('#endTitle'), endSub: $('#endSub'),
    endStats: $('#endStats'), endAgain: $('#endAgain'),
  };

  // ---- catalog: what the construction tabs offer ----
  const ICON = {
    barracks: '⌂', depot: '▤', lab: '⌬', trench: '▭', wire: '╳', sandbag: '◷', nest: '⊙',
    tower: '♜', bunker: '⬢', pit: '✸', floodlight: '☀', ammo: '◰', brazier: '♨',
    mortar: '☄', reserve: '⚑', rifles: '†', mg: '⁂', engineer: '⚒',
  };
  const CATALOG = {
    base: [['BARRACKS', 'barracks'], ['DEPOT', 'depot'], ['LAB', 'lab']],
    defense: [['TRENCH', 'trench'], ['WIRE', 'wire'], ['SANDBAGS', 'sandbag'], ['MG NEST', 'nest'], ['TOWER', 'tower'], ['BUNKER', 'bunker'], ['SPIKE PIT', 'pit']],
    support: [['FLOODLIGHT', 'floodlight'], ['AMMO', 'ammo'], ['BRAZIER', 'brazier']],
  };
  const TIP = {
    barracks: 'Trains squads. Build in the courtyard.', depot: 'Boosts supply income.', lab: 'Generates research.',
    trench: 'Drag to dig. Cover + slows the dead.', wire: 'Drag to lay. Badly slows & bleeds.', sandbag: 'Drag to lay. Light cover.',
    nest: 'Crewed MG, sustained bursts.', tower: 'Long-range precision fire.', bunker: 'Heavy cover + crewed MG.',
    pit: 'Heavy damage to the dead.', floodlight: 'Lit enemies take more damage.', ammo: 'Boosts nearby fire.', brazier: 'Fire that burns the dead.',
    mortar: 'Barrage the densest mass.', reserve: 'Muster a fresh squad.', engineer: 'Repairs nearby damaged works and base buildings.',
  };
  let tab = 'base';

  el.cmdTabs.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]'); if (t) tab = t.dataset.tab;
  });
  el.cmdGrid.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const [type, val] = b.dataset.act.split(':');
    if (type === 'build') hooks.onBuild && hooks.onBuild(val);
    else if (type === 'call' && val === 'mortar') hooks.onMortar && hooks.onMortar();
    else if (type === 'call' && val === 'reserve') hooks.onReserve && hooks.onReserve();
    else if (type === 'prod') hooks.onProduce && hooks.onProduce(val);
    else if (type === 'rsc') hooks.onResearch && hooks.onResearch(+val);
  });
  el.endAgain.onclick = () => location.reload();

  const fmt = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const can = c => (state.supply ?? 0) >= c;
  const btn = (act, label, icon, cost, opts = {}) =>
    `<button class="cmd-btn ${opts.spent ? 'spent' : ''} ${opts.active ? 'active' : ''}" data-act="${act}" title="${opts.tip || ''}">
       <span class="cmd-ico">${icon || ''}</span><span class="cmd-lbl">${label}</span>${cost != null ? `<span class="cmd-cost">${cost}</span>` : ''}</button>`;

  function renderCommand() {
    const sb = state.selBuilding;
    if (sb) {
      const hpPct = Math.round(((sb.hp ?? 1) / Math.max(1, sb.maxHp ?? 1)) * 100);
      const status = sb.build ? `BUILD ${Math.round(sb.build.pct * 100)}%` : `HP ${hpPct}%`;
      el.cmdTabs.style.display = 'none';
      el.cmdTitle.textContent = sb.kind.toUpperCase();
      if (sb.kind === 'barracks') {
        el.cmdSub.textContent = sb.build
          ? status
          : `${sb.prod ? `TRAINING ${sb.prod.key.toUpperCase()}` : (sb.queue ? `${sb.queue} QUEUED` : 'RMB = rally' + (sb.hasRally ? ' ✓' : ''))} · ${status}`;
        el.cmdGrid.innerHTML =
          btn('prod:rifles', 'RIFLES', ICON.rifles, 40, { spent: !can(40), tip: 'Train a rifle squad' }) +
          btn('prod:mg', 'MG TEAM', ICON.mg, 60, { spent: !can(60), tip: 'Train a machine-gun team' }) +
          btn('prod:engineer', 'ENGINEERS', ICON.engineer, 55, { spent: !can(55), tip: TIP.engineer }) +
          (sb.prod ? `<div class="cmd-prog"><i style="width:${Math.round(sb.prod.pct * 100)}%"></i></div>` : '');
      } else if (sb.kind === 'lab') {
        el.cmdSub.textContent = `${Math.floor(state.research ?? 0)} RP · ${status}`;
        el.cmdGrid.innerHTML = (state.techs || []).map((t, i) => {
          const c = state.techCost ? state.techCost(t) : t.base;
          return btn('rsc:' + i, t.key, '✦', c, { spent: (state.research ?? 0) < c, tip: `Research ${t.key} (L${t.lvl})` })
            .replace('cmd-cost">' + c, `cmd-cost">L${t.lvl} · ${c}`);
        }).join('');
      } else {
        el.cmdSub.textContent = status;
        el.cmdGrid.innerHTML = `<div class="cmd-info">${TIP[sb.kind] || ''}</div>`;
      }
    } else {
      el.cmdTabs.style.display = 'flex';
      el.cmdTitle.textContent = 'CONSTRUCTION';
      el.cmdSub.textContent = tab.toUpperCase();
      for (const t of el.cmdTabs.children) t.classList.toggle('on', t.dataset.tab === tab);
      let html = CATALOG[tab].map(([label, kind]) => {
        const c = state.costs[kind] ?? 0;
        return btn('build:' + kind, label, ICON[kind], c, { spent: !can(c), active: state.buildMode === kind, tip: TIP[kind] });
      }).join('');
      if (tab === 'support') {
        html += btn('call:mortar', 'MORTAR', ICON.mortar, '×' + (state.charges.mortar ?? 0), { spent: (state.charges.mortar ?? 0) <= 0, tip: TIP.mortar });
        const rc = state.costs?.recruit ?? 0;
        html += btn('call:reserve', 'RESERVE', ICON.reserve, rc, { spent: !can(rc), tip: TIP.reserve });
      }
      el.cmdGrid.innerHTML = html;
    }
  }

  function update(force) {
    el.kills.textContent = state.kills;
    el.men.textContent = state.menRemaining;
    el.risen.textContent = state.menRisen;
    el.timer.textContent = fmt(state.time);
    el.supply.textContent = Math.floor(state.supply ?? 0);
    el.supplyRate.textContent = `+${(state.supplyRateNow ?? state.supplyRate ?? 0).toFixed(1)}/s`;
    el.rscPts.textContent = Math.floor(state.research ?? 0);
    el.rscRate.textContent = `+${(state.researchRate ?? 0).toFixed(1)}/s`;
    el.noise.textContent = Math.round(state.noise ?? 0);
    el.threat.textContent = `${Math.round((state.threat ?? 0) * 100)}%`;
    el.noise.classList.toggle('warn', (state.noise ?? 0) > 68);
    el.threat.classList.toggle('warn', (state.threat ?? 0) > 0.5);
    el.works.textContent = state.works ?? 0;
    el.gateBar.style.width = `${Math.max(0, Math.min(1, state.gateHp ?? 1)) * 100}%`;

    renderCommand();

    if (state.possession) {
      el.possession.textContent = `DIRECT · ${state.possession}   ${state.reloading ? 'RELOADING…' : 'AMMO ' + (state.ammo ?? '')}`;
    } else el.possession.textContent = '';
    el.possession.classList.toggle('show', !!state.possession);
    el.crosshair.classList.toggle('show', !!state.possession);

    const sel = force.selected();
    el.sel.style.display = state.selBuilding ? 'none' : '';
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
    el.endSub.textContent = state.held ? 'the line holds — dawn is still far off' : 'the dead overrun the works';
    el.endStats.innerHTML = `
      <div><span>${state.kills}</span>dead felled</div>
      <div><span>${state.menLost}</span>men lost</div>
      <div><span>${state.menRisen}</span>rose against you</div>
      <div><span>${Math.floor(state.time)}s</span>held the line</div>`;
    el.end.classList.add('show');
  }

  return { update, showDragBox, hideDragBox, showEnd };
}
