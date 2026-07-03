// hud.js — operator glass: integrity, depth, gravity readout, tether state,
// boon picks, the rig debrief screen where VESTA talks, and the endings.
export function createHUD(root, hooks = {}) {
  root.innerHTML = `
    <div id="bootTag">DEADWEIGHT · SALVAGE RIG VESTA-9</div>
    <div id="topline"><span id="depthRead">DECK 01</span><span id="gravRead">STANDARD SPIN</span><span id="strayRead"></span></div>
    <div id="hpWrap"><label>INTEGRITY</label><div id="hpBar"><i></i></div></div>
    <div id="crosshair"><i></i></div>
    <div id="grabTip"></div>
    <div id="boonRow"></div>
    <div id="hint"><b>WASD</b> move · <b>SPACE</b> jump · <b>RMB</b> tether grab/drop · <b>LMB</b> fire / hurl · <b>E</b> beacon · mass is ammo</div>
    <div id="hurtFx"></div>
    <div id="beaconLine"></div>

    <div id="rig"><div class="rig-card">
      <div class="rig-head" id="rigHead">VESTA-9 · MEDICAL PRINTER</div>
      <div class="rig-title" id="rigTitle">DEADWEIGHT</div>
      <div class="rig-vesta" id="rigText"></div>
      <div id="boonPick"></div>
      <button id="descendBtn">DESCEND</button>
      <div class="rig-count" id="rigCount"></div>
    </div></div>

    <div id="endscreen"><div class="rig-card">
      <div class="rig-head" id="endHead"></div>
      <div class="rig-title" id="endTitle"></div>
      <div class="rig-vesta" id="endText"></div>
      <button id="againBtn">⟲ AGAIN</button>
    </div></div>
  `;
  const $ = s => root.querySelector(s);
  const el = {
    hp: $('#hpBar > i'), depth: $('#depthRead'), grav: $('#gravRead'), stray: $('#strayRead'),
    cross: $('#crosshair'), grabTip: $('#grabTip'), boonRow: $('#boonRow'),
    hurt: $('#hurtFx'), beaconLine: $('#beaconLine'),
    rig: $('#rig'), rigText: $('#rigText'), rigCount: $('#rigCount'), rigTitle: $('#rigTitle'),
    boonPick: $('#boonPick'), descend: $('#descendBtn'),
    end: $('#endscreen'), endHead: $('#endHead'), endTitle: $('#endTitle'), endText: $('#endText'),
  };
  el.descend.onclick = () => { hooks.onDescend && hooks.onDescend(); };
  $('#againBtn').onclick = () => location.reload();

  let typing = null, beaconT = 0, hurtT = 0;
  function vesta(text) {
    typing = { text, i: 0 };
    el.rigText.textContent = '';
  }
  function showRig(deaths, debrief, boonChoices) {
    el.rig.classList.add('show');
    el.rigTitle.textContent = deaths === 0 ? 'DEADWEIGHT' : 'REPRINT ' + String(deaths).padStart(4, '0');
    el.rigCount.textContent = deaths > 3 ? `print count: ${4000 + deaths}` : '';
    vesta(debrief);
    el.boonPick.innerHTML = boonChoices.map((b, i) =>
      `<button class="boon" data-i="${i}"><b>${b.name}</b><span>${b.desc}</span></button>`).join('');
    el.boonPick.querySelectorAll('.boon').forEach(btn => {
      btn.onclick = () => {
        el.boonPick.querySelectorAll('.boon').forEach(x => x.classList.remove('on'));
        btn.classList.add('on');
        hooks.onBoon && hooks.onBoon(+btn.dataset.i);
      };
    });
  }
  function hideRig() { el.rig.classList.remove('show'); }
  function beacon(line) { el.beaconLine.textContent = line; el.beaconLine.classList.add('show'); beaconT = 7; }
  function hurt() { hurtT = 0.6; }
  function showEnd(kind) {
    const map = {
      close: ['EVACUATION LOG · FINAL ENTRY', 'RECOVERED', 'You sit down at the engine deck console and type the truth: 312 aboard, 311 in the boats, one recovered — forty years late, but recovered. VESTA is quiet for a long time. Then every light in the station comes on at once, just briefly. Like a station saying thank you. Like a station finally allowed to sleep.'],
      stay: ['EVACUATION LOG · ENTRY 14,661', 'STILL DESCENDING', 'You leave the console blank and take the long lift back up to the rig. Some jobs are not finished because finishing them is the only thing worse than the work. VESTA prints you a coffee. Neither of you mentions the manifest. The beacons are waiting. Descend when ready, operator.'],
      dead: ['REPRINT QUEUE', 'SIGNAL LOST', 'Integrity zero. But the printer is already warming up, and VESTA is already rehearsing what not to tell you. See you in a few minutes, operator.'],
    };
    const [h, t, x] = map[kind];
    el.endHead.textContent = h; el.endTitle.textContent = t; el.endText.textContent = x;
    el.end.classList.add('show');
  }

  function update(S, dt) {
    el.hp.style.width = `${Math.max(0, S.hp)}%`;
    el.hp.className = S.hp > 50 ? '' : S.hp > 25 ? 'mid' : 'low';
    el.depth.textContent = `DECK ${String(S.depth).padStart(2, '0')}`;
    el.grav.textContent = S.grav;
    el.stray.textContent = S.strays > 0 ? `⬢ ${S.strays} STRAYS` : (S.hatchOpen ? '▼ HATCH OPEN — DROP' : '');
    el.stray.className = S.strays > 0 ? 'hot' : 'ok';
    el.cross.className = S.held ? 'held' : S.grabbable ? 'can' : '';
    el.grabTip.textContent = S.held ? 'LMB HURL · RMB RELEASE' : S.grabbable ? 'RMB TETHER' : '';
    el.boonRow.textContent = S.boons.join(' · ');
    if (typing && typing.i < typing.text.length) {
      typing.i = Math.min(typing.text.length, typing.i + dt * 42);
      el.rigText.textContent = typing.text.slice(0, Math.floor(typing.i)) + '▌';
    } else if (typing) el.rigText.textContent = typing.text;
    if (beaconT > 0) { beaconT -= dt; if (beaconT <= 0) el.beaconLine.classList.remove('show'); }
    if (hurtT > 0) { hurtT -= dt; el.hurt.style.opacity = Math.max(0, hurtT * 1.5).toFixed(2); }
  }

  return { update, showRig, hideRig, beacon, hurt, showEnd };
}
