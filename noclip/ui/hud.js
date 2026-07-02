// hud.js — the viewfinder. Everything the player sees through is a 1998
// camcorder: REC dot, burned-in timestamp, battery (your breath), tape
// integrity ticks, zone titles typed like tape annotations. Intro and end
// screens are the tape label and the moment the tape stops.
export function createHUD(root, hooks = {}) {
  root.innerHTML = `
    <div id="bootTag">NOCLIP · RECOVERED FOOTAGE</div>

    <div id="vf">
      <div class="vf-corner tl"></div><div class="vf-corner tr"></div>
      <div class="vf-corner bl"></div><div class="vf-corner br"></div>
      <div id="recRow"><span id="recDot"></span>REC</div>
      <div id="tapeTag">TAPE #4 · SP</div>
      <div id="stamp"><span id="stampDate">APR 21 1998</span><br><span id="stampTime">02:47:13 AM</span></div>
      <div id="battRow"><span id="battBody"><i id="battFill"></i></span><span id="battLabel">BATT</span></div>
      <div id="integrity"></div>
    </div>

    <div id="zoneCard"><div id="zcName"></div><div id="zcSub"></div></div>
    <div id="whisper"></div>
    <div id="hint"><b>CLICK</b> to look · <b>WASD</b> move · <b>SHIFT</b> run — it hears running · light is safe</div>

    <div id="intro"><div class="tape-label">
      <div class="tl-head">PROPERTY OF ███████ COUNTY SHERIFF — EVIDENCE</div>
      <div class="tl-title">NOCLIP</div>
      <div class="tl-sub">RECOVERED FOOTAGE · TAPE #4 OF 4</div>
      <div class="tl-body">
        On April 21, 1998, a surveyor fell through the floor of an office building
        that had no basement. The camcorder kept running.<br><br>
        The footage shows three places that do not exist, and one thing that does.<br>
        Descend. Keep to the light. <b>Do not let the tape stop.</b>
      </div>
      <div class="tl-keys"><span><i>WASD</i> move</span><span><i>SHIFT</i> run</span><span><i>MOUSE</i> look</span><span><i>F</i> camcorder lamp</span></div>
      <button id="playBtn">▶ PLAY TAPE</button>
    </div></div>

    <div id="endscreen"><div class="tape-label">
      <div class="tl-head" id="endHead"></div>
      <div class="tl-title" id="endTitle"></div>
      <div class="tl-sub" id="endSub"></div>
      <div class="end-stats" id="endStats"></div>
      <button id="againBtn">⏪ REWIND</button>
    </div></div>
  `;

  const $ = s => root.querySelector(s);
  const el = {
    vf: $('#vf'), rec: $('#recDot'), stampTime: $('#stampTime'),
    battFill: $('#battFill'), integrity: $('#integrity'),
    zone: $('#zoneCard'), zcName: $('#zcName'), zcSub: $('#zcSub'),
    whisper: $('#whisper'),
    intro: $('#intro'), end: $('#endscreen'),
    endHead: $('#endHead'), endTitle: $('#endTitle'), endSub: $('#endSub'), endStats: $('#endStats'),
    hint: $('#hint'),
  };
  $('#playBtn').onclick = () => { el.intro.classList.add('gone'); hooks.onStart && hooks.onStart(); };
  $('#againBtn').onclick = () => location.reload();

  let clock = 2 * 3600 + 47 * 60 + 13;     // 02:47:13 AM, burned in
  let zoneT = 0, whisperT = 0;

  function zone(name, sub) {
    el.zcName.textContent = name;
    el.zcSub.textContent = sub;
    el.zone.classList.add('show');
    zoneT = 4.2;
  }

  function whisper(text, secs = 3) {        // small found-footage annotations
    el.whisper.textContent = text;
    el.whisper.classList.add('show');
    whisperT = secs;
  }

  function update(S, dt) {
    clock += dt;
    const h = Math.floor(clock / 3600) % 24, m = Math.floor(clock / 60) % 60, s = Math.floor(clock) % 60;
    el.stampTime.textContent =
      `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
    el.battFill.style.width = `${Math.round(S.stamina * 100)}%`;
    el.battFill.className = S.stamina > 0.3 ? '' : 'low';
    el.integrity.innerHTML = '▮'.repeat(S.tape) + '<em>' + '▯'.repeat(Math.max(0, 3 - S.tape)) + '</em>';
    el.rec.classList.toggle('near', S.danger > 0.45);
    if (zoneT > 0) { zoneT -= dt; if (zoneT <= 0) el.zone.classList.remove('show'); }
    if (whisperT > 0) { whisperT -= dt; if (whisperT <= 0) el.whisper.classList.remove('show'); }
  }

  function showEnd(S, won) {
    el.endHead.textContent = won ? 'EVIDENCE REVIEW — FINAL SEGMENT' : 'EVIDENCE REVIEW — TAPE DAMAGED';
    el.endTitle.textContent = won ? 'TAPE ENDS' : 'SIGNAL LOST';
    el.endTitle.className = `tl-title ${won ? 'win' : 'lose'}`;
    el.endSub.textContent = won
      ? 'the footage ends at a red door. no further tapes were recovered. the surveyor was never found — but the camera was returned.'
      : 'the remainder of the tape is unrecoverable. the last intact frame shows teeth.';
    el.endStats.innerHTML = `
      <div><span>${Math.floor(S.time / 60)}:${String(Math.floor(S.time % 60)).padStart(2, '0')}</span>footage</div>
      <div><span>${S.zonesSeen}/3</span>levels</div>
      <div><span>${Math.round(S.walked)}m</span>walked</div>
      <div><span>${S.encounters}</span>sightings</div>`;
    el.end.classList.add('show');
  }

  return { update, zone, whisper, showEnd };
}
