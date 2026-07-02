// hud.js — DOM overlay. Readouts (objective, tallies, economy, research), the
// selection list, and a proper RTS COMMAND PANEL (bottom-center): construction
// tabs when nothing is selected, and a per-building command card (train units /
// research tech) when a building is selected — AoE/C&C style.
export function createHUD(root, state, hooks = {}) {
  root.innerHTML = `
    <div id="bootTag">THE LONG NIGHT · DIG IN</div>
    <div id="titleCard"><div class="tc-title">THE LONG NIGHT</div><div class="tc-sub">DIG IN · HOLD WINTERFELL AGAINST THE DEAD</div></div>
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
      <div id="cmdProg" class="cmd-prog" style="display:none"><i></i></div>
    </div>

    <div id="crisis"></div>
    <div id="surgeWarn">⚠ THE DEAD SURGE <span id="surgeIn"></span></div>
    <div id="pausedTag">II PAUSED — SPACE TO RESUME</div>
    <div id="helpOverlay"><div class="help-card">
      <div class="help-title">FIELD MANUAL</div>
      <div class="help-cols">
        <div><h4>COMMAND</h4>
          <div class="help-row"><i>LMB</i>select · drag = box</div>
          <div class="help-row"><i>RMB</i>move · rally</div>
          <div class="help-row"><i>⇧RMB</i>attack-move</div>
          <div class="help-row"><i>H</i>hold position</div>
          <div class="help-row"><i>X</i>fall back to the wall</div>
          <div class="help-row"><i>Z</i>toggle hold fire</div>
          <div class="help-row"><i>F</i>take direct control</div>
        </div>
        <div><h4>BUILD</h4>
          <div class="help-row"><i>T</i>trench · drag</div>
          <div class="help-row"><i>N</i>wire · drag</div>
          <div class="help-row"><i>B</i>sandbags · drag</div>
          <div class="help-row"><i>G / Y / Q</i>nest · tower · bunker</div>
          <div class="help-row"><i>M / L / O / E</i>pit · light · ammo · brazier</div>
          <div class="help-row"><i>K / J / U</i>barracks · depot · lab</div>
          <div class="help-row"><i>Esc</i>cancel placement</div>
        </div>
        <div><h4>SUPPORT & CAMERA</h4>
          <div class="help-row"><i>V</i>mortar strike</div>
          <div class="help-row"><i>C</i>muster reserves</div>
          <div class="help-row"><i>1–4</i>research techs</div>
          <div class="help-row"><i>WASD</i>pan · <i>Q/E</i> rotate</div>
          <div class="help-row"><i>MMB</i>drag = tilt · <i>P</i> presets</div>
          <div class="help-row"><i>Space</i>pause</div>
          <div class="help-row"><i>?</i>close this manual</div>
        </div>
      </div>
    </div></div>
    <div id="placeBanner"></div>
    <div id="possessionTag"></div>
    <div id="crosshair"></div>
    <div id="hint">LMB select · drag box · RMB move/rally · click a building to command it · Space pause · ? field manual</div>
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
    cmdProg: $('#cmdProg'), cmdProgFill: $('#cmdProg > i'), placeBanner: $('#placeBanner'), crisis: $('#crisis'), titleCard: $('#titleCard'),
    possession: $('#possessionTag'), crosshair: $('#crosshair'),
    surge: $('#surgeWarn'), surgeIn: $('#surgeIn'), paused: $('#pausedTag'), help: $('#helpOverlay'),
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
  // mirrors the keydown bindings in main.js — shown as corner badges, RTS-style
  const HOTKEY = {
    barracks: 'K', depot: 'J', lab: 'U', trench: 'T', wire: 'N', sandbag: 'B', nest: 'G',
    tower: 'Y', bunker: 'Q', pit: 'M', floodlight: 'L', ammo: 'O', brazier: 'E', mortar: 'V', reserve: 'C',
  };
  const DRAGGABLE = new Set(['trench', 'wire', 'sandbag']); // laid by dragging a line
  const COURTYARD = new Set(['barracks', 'depot', 'lab']);  // placed behind the wall
  const LABELS = {};
  for (const list of Object.values(CATALOG)) for (const [label, kind] of list) LABELS[kind] = label;
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
       ${opts.key ? `<span class="cmd-key">${opts.key}</span>` : ''}<span class="cmd-ico">${icon || ''}</span><span class="cmd-lbl">${label}</span>${cost != null ? `<span class="cmd-cost">${cost}</span>` : ''}</button>`;

  // The grid buttons must be DOM-STABLE: rewriting innerHTML every frame destroys
  // the button mid-interaction so the browser can't form a click (down+up on the
  // same node). So we build the html, diff it, and only rewrite when it changes.
  // Anything that animates per-frame (the production bar) lives outside the grid.
  let lastGridHtml = null, lastTabsShown = null;
  function setGrid(html) {
    if (html !== lastGridHtml) { el.cmdGrid.innerHTML = html; lastGridHtml = html; }
  }
  function showTabs(on) {
    if (on !== lastTabsShown) { el.cmdTabs.style.display = on ? 'flex' : 'none'; lastTabsShown = on; }
  }
  function progBar(pct) { // pct < 0 hides; this animates without rebuilding the grid
    if (pct < 0) { if (el.cmdProg.style.display !== 'none') el.cmdProg.style.display = 'none'; return; }
    if (el.cmdProg.style.display !== 'block') el.cmdProg.style.display = 'block';
    el.cmdProgFill.style.width = `${Math.round(pct * 100)}%`;
  }

  function renderCommand() {
    const sb = state.selBuilding;
    if (sb) {
      const hpPct = Math.round(((sb.hp ?? 1) / Math.max(1, sb.maxHp ?? 1)) * 100);
      const status = sb.build ? `BUILD ${Math.round(sb.build.pct * 100)}%` : `HP ${hpPct}%`;
      showTabs(false);
      el.cmdTitle.textContent = sb.kind.toUpperCase();
      if (sb.kind === 'barracks') {
        el.cmdSub.textContent = sb.build
          ? status
          : `${sb.prod ? `TRAINING ${sb.prod.key.toUpperCase()}` : (sb.queue ? `${sb.queue} QUEUED` : 'RMB = rally' + (sb.hasRally ? ' ✓' : ''))} · ${status}`;
        setGrid(
          btn('prod:rifles', 'RIFLES', ICON.rifles, 40, { spent: !can(40), tip: 'Train a rifle squad' }) +
          btn('prod:mg', 'MG TEAM', ICON.mg, 60, { spent: !can(60), tip: 'Train a machine-gun team' }) +
          btn('prod:engineer', 'ENGINEERS', ICON.engineer, 55, { spent: !can(55), tip: TIP.engineer }));
        progBar(sb.prod ? sb.prod.pct : -1);
      } else if (sb.kind === 'lab') {
        el.cmdSub.textContent = `${Math.floor(state.research ?? 0)} RP · ${status}`;
        setGrid((state.techs || []).map((t, i) => {
          const c = state.techCost ? state.techCost(t) : t.base;
          return btn('rsc:' + i, t.key, '✦', c, { spent: (state.research ?? 0) < c, tip: `Research ${t.key} (L${t.lvl})` })
            .replace('cmd-cost">' + c, `cmd-cost">L${t.lvl} · ${c}`);
        }).join(''));
        progBar(-1);
      } else {
        el.cmdSub.textContent = status;
        setGrid(`<div class="cmd-info">${TIP[sb.kind] || ''}</div>`);
        progBar(-1);
      }
    } else {
      showTabs(true);
      el.cmdTitle.textContent = 'CONSTRUCTION';
      el.cmdSub.textContent = tab.toUpperCase();
      for (const t of el.cmdTabs.children) t.classList.toggle('on', t.dataset.tab === tab);
      let html = CATALOG[tab].map(([label, kind]) => {
        const c = state.costs[kind] ?? 0;
        return btn('build:' + kind, label, ICON[kind], c, { spent: !can(c), active: state.buildMode === kind, tip: TIP[kind], key: HOTKEY[kind] });
      }).join('');
      if (tab === 'support') {
        html += btn('call:mortar', 'MORTAR', ICON.mortar, '×' + (state.charges.mortar ?? 0), { spent: (state.charges.mortar ?? 0) <= 0, tip: TIP.mortar, key: HOTKEY.mortar });
        const rc = state.costs?.recruit ?? 0;
        html += btn('call:reserve', 'RESERVE', ICON.reserve, rc, { spent: !can(rc), tip: TIP.reserve, key: HOTKEY.reserve });
      }
      setGrid(html);
      progBar(-1);
    }
  }

  // pulse a readout when its value changes — kills/losses register viscerally
  const bump = (e) => { e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); };
  let _pk = 0, _pm = -1, _pr = 0;
  let titleStart = null; // intro title fade, driven in JS (reliable across browsers)

  function update(force) {
    // cinematic intro title: fade in, hold, fade out over the first ~4.2s of play
    if (el.titleCard) {
      if (titleStart === null) titleStart = performance.now();
      const te = (performance.now() - titleStart) / 1000;
      if (te < 4.2) {
        const op = te < 0.5 ? te / 0.5 : te < 2.6 ? 1 : 1 - (te - 2.6) / 1.6;
        el.titleCard.style.opacity = Math.max(0, Math.min(1, op)).toFixed(3);
      } else if (el.titleCard.style.visibility !== 'hidden') {
        el.titleCard.style.opacity = '0'; el.titleCard.style.visibility = 'hidden';
      }
    }
    if (state.kills !== _pk) { _pk = state.kills; bump(el.kills); }
    if (state.menRemaining !== _pm) { _pm = state.menRemaining; bump(el.men); }
    if (state.menRisen !== _pr) { _pr = state.menRisen; bump(el.risen); }
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

    // pause chip + surge alarm — the horde telegraphs its rushes now
    el.paused.classList.toggle('show', !!state.paused);
    const si = state.surgeIn;
    const surging = state.phase === 'battle' && !state.paused && state.surgeArmed
      && si != null && si > 0 && si <= 6;
    if (surging) el.surgeIn.textContent = `IN ${Math.ceil(si)}`;
    el.surge.classList.toggle('show', surging);

    // crisis vignette — red edges pulse as the gate fails / the threat surges
    const danger = Math.min(1, (1 - (state.gateHp ?? 1)) * 0.95 + (state.threat ?? 0) * 0.45);
    el.crisis.style.opacity = danger > 0.02
      ? (danger * (0.72 + 0.28 * Math.sin(performance.now() * 0.006))).toFixed(3) : '0';

    // placement banner — armed build mode is obvious + tells you how to place it
    const bm = state.buildMode;
    if (bm && !state.possession) {
      const verb = DRAGGABLE.has(bm) ? 'drag along the ground to lay'
        : COURTYARD.has(bm) ? 'click in the courtyard to build'
        : 'click the ground to build';
      el.placeBanner.innerHTML = `▸ <b>${(LABELS[bm] || bm).toUpperCase()}</b> — ${verb} <span class="esc">· Esc to cancel</span>`;
      el.placeBanner.classList.add('show');
    } else el.placeBanner.classList.remove('show');

    if (state.possession) {
      el.possession.textContent = `DIRECT · ${state.possession}   ${state.reloading ? 'RELOADING…' : 'AMMO ' + (state.ammo ?? '')}`;
    } else el.possession.textContent = '';
    el.possession.classList.toggle('show', !!state.possession);
    el.crosshair.classList.toggle('show', !!state.possession);

    const sel = force.selected();
    el.sel.style.display = state.selBuilding ? 'none' : '';
    if (!sel.length) { el.sel.innerHTML = '<div class="sel-empty">no unit selected</div>'; return; }
    const squadHp = (s) => {
      let hp = 0, mx = 0;
      for (const m of s.members) { mx += m.maxHp ?? 3; if (m.alive) hp += Math.max(0, m.hp); }
      return mx ? Math.max(0, Math.min(1, hp / mx)) : 0;
    };
    el.sel.innerHTML = sel.map(s => {
      const hp = squadHp(s);
      const cls = hp > 0.55 ? 'ok' : hp > 0.25 ? 'mid' : 'low';
      return `
      <div class="sel-row ${s.type}">
        <b>${s.label}</b>
        <span class="sel-n">${s.count}<small>/${s.members.length}</small></span>
        <span class="sel-order ${s.holdFire ? 'hold' : ''}">${s.holdFire ? 'HOLD FIRE' : s.order}</span>
        <div class="sel-hp"><i class="${cls}" style="width:${Math.round(hp * 100)}%"></i></div>
      </div>`;
    }).join('');
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

  function toggleHelp() { el.help.classList.toggle('show'); }
  function hideHelp() { el.help.classList.remove('show'); }

  return { update, showDragBox, hideDragBox, showEnd, toggleHelp, hideHelp };
}
