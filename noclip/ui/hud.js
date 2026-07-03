// hud.js — the viewfinder, extraction edition. Battery is life, tapes are
// greed, the odometer is your score, and the shop between runs is why you
// press PLAY again. Still all burned into a 1998 camcorder.
export function createHUD(root, hooks = {}) {
  root.innerHTML = `
    <div id="bootTag">NOCLIP · RECOVERED FOOTAGE</div>
    <div id="vf">
      <div class="vf-corner tl"></div><div class="vf-corner tr"></div>
      <div class="vf-corner bl"></div><div class="vf-corner br"></div>
      <div id="recRow"><span id="recDot"></span>REC</div>
      <div id="tapeTag">∞ · SP</div>
      <div id="stamp"><span id="stampDate">APR 21 1998</span><br><span id="stampTime">02:47:13 AM</span></div>
      <div id="battRow"><span id="battBody"><i id="battFill"></i></span><span id="battLabel">BATT</span></div>
      <div id="odo"><span id="odoNum">0</span>m FROM THE FALL</div>
      <div id="tapeCount">▣ <span id="tapesNum">0</span> <em id="multTag"></em></div>
    </div>
    <div id="zoneCard"><div id="zcName"></div><div id="zcSub"></div></div>
    <div id="whisper"></div>
    <div id="elevPrompt">◈ ELEVATOR — <b>E</b> TO BANK YOUR TAPES AND ASCEND</div>
    <div id="hint"><b>WASD</b> move · <b>SHIFT</b> run — it hears · <b>F</b> lamp · light feeds the battery · dark eats it</div>

    <div id="intro"><div class="tape-label">
      <div class="tl-head">PROPERTY OF ███████ COUNTY SHERIFF — EVIDENCE</div>
      <div class="tl-title">NOCLIP</div>
      <div class="tl-sub">RECOVERED FOOTAGE · THE ROOMS DO NOT END</div>
      <div class="tl-body">
        The rooms go on forever, and they change as you walk — no doors, no
        seams. The office becomes a cathedral becomes a drowned hall becomes a
        suburb that should not be indoors.<br><br>
        Your battery is your life. Light feeds it. The dark eats it.<br>
        Tapes are worth nothing until an elevator banks them. Elevators are rare.<br>
        <b>How far from the fall can you get?</b>
      </div>
      <div id="metaRow"></div>
      <div id="shopRow"></div>
      <button id="playBtn">▶ PLAY TAPE</button>
    </div></div>

    <div id="endscreen"><div class="tape-label">
      <div class="tl-head" id="endHead"></div>
      <div class="tl-title" id="endTitle"></div>
      <div class="tl-sub" id="endSub"></div>
      <div class="end-stats" id="endStats"></div>
      <div id="metaRow2"></div>
      <div id="shopRow2"></div>
      <button id="againBtn">⏪ AGAIN</button>
    </div></div>
  `;

  const $ = s => root.querySelector(s);
  const el = {
    rec: $('#recDot'), stampTime: $('#stampTime'),
    battFill: $('#battFill'), odo: $('#odoNum'), tapes: $('#tapesNum'), mult: $('#multTag'),
    zone: $('#zoneCard'), zcName: $('#zcName'), zcSub: $('#zcSub'),
    whisper: $('#whisper'), elev: $('#elevPrompt'),
    intro: $('#intro'), end: $('#endscreen'),
    endHead: $('#endHead'), endTitle: $('#endTitle'), endSub: $('#endSub'), endStats: $('#endStats'),
  };
  $('#playBtn').onclick = () => { el.intro.classList.add('gone'); hooks.onStart && hooks.onStart(); };
  $('#againBtn').onclick = () => location.reload();

  // meta + shop rendered into both the intro and the end screen
  function renderMeta() {
    const M = hooks.meta, U = hooks.upgrades;
    const metaHtml = `<span class="m-banked">▣ ${M.banked} banked</span><span class="m-best">best: ${M.best}m</span>`;
    const shopHtml = U.map((u, i) => {
      const L = M.upgrades[u.key] || 0;
      const maxed = L >= u.costs.length;
      return `<button class="upg ${maxed ? 'maxed' : (M.banked >= u.costs[L] ? '' : 'cant')}" data-i="${i}">
        <b>${u.name} ${'▮'.repeat(L)}${'▯'.repeat(u.costs.length - L)}</b>
        <span>${u.desc}</span><em>${maxed ? 'MAX' : '▣ ' + u.costs[L]}</em></button>`;
    }).join('');
    for (const [mr, sr] of [['#metaRow', '#shopRow'], ['#metaRow2', '#shopRow2']]) {
      const m = $(mr), s = $(sr);
      if (!m) continue;
      m.innerHTML = metaHtml;
      s.innerHTML = shopHtml;
      s.querySelectorAll('.upg').forEach(b => {
        b.onclick = () => { if (hooks.onBuy && hooks.onBuy(+b.dataset.i)) renderMeta(); };
      });
    }
  }
  renderMeta();

  let clock = 2 * 3600 + 47 * 60 + 13;
  let zoneT = 0, whisperT = 0;

  function zone(name, sub) {
    el.zcName.textContent = name;
    el.zcSub.textContent = sub;
    el.zone.classList.add('show');
    zoneT = 4.2;
  }
  function whisper(text, secs = 3) {
    el.whisper.textContent = text;
    el.whisper.classList.add('show');
    whisperT = secs;
  }

  function update(S, dt) {
    clock += dt;
    const h = Math.floor(clock / 3600) % 24, m = Math.floor(clock / 60) % 60, s = Math.floor(clock) % 60;
    el.stampTime.textContent =
      `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
    el.battFill.style.width = `${Math.max(0, S.battery)}%`;
    el.battFill.className = S.battery > 30 ? '' : 'low';
    el.odo.textContent = S.dist;
    el.tapes.textContent = S.tapes;
    el.mult.textContent = S.mult > 1 ? `×${S.mult.toFixed(1)}` : '';
    el.rec.classList.toggle('near', S.danger > 0.45);
    el.elev.classList.toggle('show', !!S.nearElevator);
    if (zoneT > 0) { zoneT -= dt; if (zoneT <= 0) el.zone.classList.remove('show'); }
    if (whisperT > 0) { whisperT -= dt; if (whisperT <= 0) el.whisper.classList.remove('show'); }
  }

  function showEnd(S) {
    const banked = S.kind === 'bank';
    el.endHead.textContent = banked ? 'EVIDENCE INTAKE — TAPES RECEIVED' : 'EVIDENCE REVIEW — BATTERY DEAD';
    el.endTitle.textContent = banked ? 'ASCENDED' : 'TAPE ENDS';
    el.endTitle.className = `tl-title ${banked ? 'win' : 'lose'}`;
    el.endSub.textContent = banked
      ? `the elevator takes a long time. nobody asks where you have been. ${S.earned} tapes banked at ×${S.mult.toFixed(1)}.`
      : `the last frames show carpet. ${S.earned} of ${S.tapes} tapes survived the dark.`;
    el.endStats.innerHTML = `
      <div><span>${S.dist}m</span>from the fall</div>
      <div><span>${S.tapes}</span>tapes carried</div>
      <div><span>+${S.earned}</span>banked</div>
      <div><span>${S.best}m</span>personal best</div>
      <div><span>${S.skips}</span>tape skips</div>`;
    renderMeta();
    el.end.classList.add('show');
  }

  return { update, zone, whisper, showEnd, renderMeta };
}
