// hud.js — instrument panel. Depth is the hero number; hull, battery and
// flares are the budget; PRESENCE is the fear gauge. Zone cards mark the
// crossings. Intro and end screens book-end the dive.
export function createHUD(root, hooks = {}) {
  root.innerHTML = `
    <div id="bootTag">HADAL · DESCENT</div>

    <div id="depthPanel" class="panel">
      <label>DEPTH</label>
      <div id="depthNum">150<small>m</small></div>
      <div id="depthRate">▼ 0.0 m/s</div>
    </div>

    <div id="status" class="panel">
      <div class="bar-row"><label>HULL</label><div class="track"><i id="hullBar"></i></div></div>
      <div class="bar-row"><label>CELL</label><div class="track"><i id="cellBar"></i></div></div>
      <div class="bar-row"><label>FLARES</label><div id="flarePips"></div></div>
    </div>

    <div id="presence" class="panel">
      <label>PRESENCE</label>
      <div id="presTrack"><i id="presBar"></i></div>
      <div id="presWord">STILL</div>
    </div>

    <div id="pingUI"><svg viewBox="0 0 40 40"><circle id="pingArc" cx="20" cy="20" r="16"/></svg><span>SONAR</span></div>

    <div id="zoneCard"><div class="zc-title" id="zcTitle"></div><div class="zc-sub" id="zcSub"></div></div>
    <div id="radioLog"><div class="rl-head"><span class="rl-dot"></span><span id="rlId"></span><span id="rlMeta"></span></div><div id="rlText"></div></div>
    <div id="ventTag">◈ VENT FIELD — CELLS RECHARGING</div>
    <div id="hurt"></div>
    <div id="hint">move mouse steer · <b>W</b> thrust · <b>SHIFT</b> burst · <b>S</b> hold · <b>SPACE/CLICK</b> ping · <b>F</b> lamp · <b>E</b> flare</div>

    <div id="intro"><div class="card">
      <div class="h-title">HADAL</div>
      <div class="h-tag">the trench remembers light</div>
      <div class="h-body">
        Six months ago, VELA-1 went down this trench and never came back up.<br>
        The pilot was your sister. Meridian Salvage wrote her off. You stole the other sub.<br><br>
        Her log buoys are still transmitting, one per depth band. Follow them down.<br>
        Your sonar is the only sight you have — and every ping is a voice in the dark.<br>
        Something very old and very long lives down there. <b>It listens.</b>
      </div>
      <div class="h-keys">
        <span><i>MOUSE</i> steer</span><span><i>W · SHIFT</i> thrust · burst</span>
        <span><i>SPACE</i> ping</span><span><i>F</i> lamp</span><span><i>E</i> drop flare</span>
      </div>
      <button id="diveBtn">FLOOD THE TANKS</button>
    </div></div>

    <div id="endscreen"><div class="card">
      <div class="h-title" id="endTitle"></div>
      <div class="h-tag" id="endSub"></div>
      <div class="end-stats" id="endStats"></div>
      <button id="againBtn">DIVE AGAIN</button>
    </div></div>
  `;

  const $ = s => root.querySelector(s);
  const el = {
    depth: $('#depthNum'), rate: $('#depthRate'),
    hull: $('#hullBar'), cell: $('#cellBar'), pips: $('#flarePips'),
    presBar: $('#presBar'), presWord: $('#presWord'), presence: $('#presence'),
    pingArc: $('#pingArc'), pingUI: $('#pingUI'),
    zone: $('#zoneCard'), zcTitle: $('#zcTitle'), zcSub: $('#zcSub'),
    radio: $('#radioLog'), rlId: $('#rlId'), rlMeta: $('#rlMeta'), rlText: $('#rlText'),
    vent: $('#ventTag'), hurt: $('#hurt'),
    intro: $('#intro'), end: $('#endscreen'),
    endTitle: $('#endTitle'), endSub: $('#endSub'), endStats: $('#endStats'),
  };
  $('#diveBtn').onclick = () => { el.intro.classList.add('gone'); hooks.onStart && hooks.onStart(); };
  $('#againBtn').onclick = () => location.reload();

  const ARC = 2 * Math.PI * 16;
  el.pingArc.style.strokeDasharray = `${ARC}`;

  let zoneT = 0, hurtT = 0;
  function zone(title, sub) {
    el.zcTitle.textContent = title;
    el.zcSub.textContent = sub;
    el.zone.classList.add('show');
    zoneT = 3.6;
  }
  function hurt() { hurtT = 0.5; }

  // ---- recovered transmissions: teletype, one at a time, queued ----
  const rq = [];
  let rl = null; // { text, i, hold }
  function log(id, meta, text) { rq.push({ id, meta, text }); }
  function stepRadio(dt) {
    if (!rl) {
      const next = rq.shift();
      if (!next) { el.radio.classList.remove('show'); return; }
      rl = { ...next, i: 0, hold: 4.5 };
      el.rlId.textContent = `◉ ${next.id} RECOVERED`;
      el.rlMeta.textContent = next.meta;
      el.rlText.textContent = '';
      el.radio.classList.add('show');
    }
    if (rl.i < rl.text.length) {
      rl.i = Math.min(rl.text.length, rl.i + dt * 34);          // teletype rate
      el.rlText.textContent = rl.text.slice(0, Math.floor(rl.i)) + (Math.floor(rl.i) < rl.text.length ? '▌' : '');
    } else {
      rl.hold -= dt;
      if (rl.hold <= 0) { rl = null; if (!rq.length) el.radio.classList.remove('show'); }
    }
  }

  const WORDS = [[0.18, 'STILL', ''], [0.45, 'LISTENING', ''], [0.72, 'AWARE', 'warn'], [0.92, 'HUNTING', 'bad'], [2, 'STRIKE', 'bad']];

  function update(S, dt) {
    el.depth.innerHTML = `${Math.max(0, Math.round(S.depth))}<small>m</small>`;
    el.rate.textContent = `${S.rate >= 0 ? '▼' : '▲'} ${Math.abs(S.rate).toFixed(1)} m/s`;
    el.hull.style.width = `${Math.max(0, S.hull)}%`;
    el.hull.className = S.hull > 55 ? '' : S.hull > 25 ? 'mid' : 'low';
    el.cell.style.width = `${Math.max(0, S.battery)}%`;
    el.cell.className = S.battery > 30 ? 'cell' : 'cell low';
    el.pips.innerHTML = '◆'.repeat(S.flares) + '<em>' + '◇'.repeat(Math.max(0, 6 - S.flares)) + '</em>';

    const p = Math.max(0, Math.min(1, S.presence));
    el.presBar.style.height = `${p * 100}%`;
    const w = WORDS.find(w => p <= w[0]) || WORDS[4];
    el.presWord.textContent = w[1];
    el.presence.className = `panel ${w[2]}`;
    el.presence.classList.toggle('pulse', p > 0.72);

    const cd = Math.max(0, Math.min(1, S.pingCd));
    el.pingArc.style.strokeDashoffset = `${ARC * cd}`;
    el.pingUI.classList.toggle('ready', cd <= 0);

    if (zoneT > 0) { zoneT -= dt; if (zoneT <= 0) el.zone.classList.remove('show'); }
    if (hurtT > 0) { hurtT -= dt; el.hurt.style.opacity = Math.max(0, hurtT * 1.6).toFixed(2); }
    el.vent.classList.toggle('show', !!S.nearVent);
    stepRadio(dt);
  }

  function showEnd(S, won) {
    el.endTitle.textContent = won ? 'TOUCHDOWN' : 'HULL LOST';
    el.endTitle.className = `h-title ${won ? 'win' : 'lose'}`;
    el.endSub.textContent = won
      ? (S.logs >= S.logsTotal
        ? 'VELA-1 sits in the garden, lamp lit. she was right. you found every word she left you'
        : 'the garden takes your light, and gives it back — VELA-1 rests here')
      : `the trench keeps what it is given · ${Math.round(S.depth)}m`;
    el.endStats.innerHTML = `
      <div><span>${Math.round(S.maxDepth)}m</span>deepest</div>
      <div><span>${Math.floor(S.time / 60)}:${String(Math.floor(S.time % 60)).padStart(2, '0')}</span>in the water</div>
      <div><span>${S.logs}/${S.logsTotal}</span>logs found</div>
      <div><span>${S.pings}</span>pings</div>
      <div><span>${S.strikes}</span>strikes survived</div>`;
    el.end.classList.add('show');
  }

  return { update, zone, hurt, showEnd, log };
}
