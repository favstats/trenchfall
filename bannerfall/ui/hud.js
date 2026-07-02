// hud.js — captain's eye view: your blood, both armies' strength, the horn
// orders, a kill feed that names the manner of death, and the campaign
// screens between fields.
export function createHUD(root, hooks = {}) {
  root.innerHTML = `
    <div id="bootTag">BANNERFALL · SELLSWORD</div>
    <div id="hpWrap"><div id="hpBar"><i></i></div><span id="hpNum">100</span></div>
    <div id="armies">
      <div class="army blue"><label>YOUR BANNER</label><div class="atrack"><i id="aBar"></i></div><span id="aNum"></span></div>
      <div class="army red"><label>THE FOE</label><div class="atrack"><i id="eBar"></i></div><span id="eNum"></span></div>
    </div>
    <div id="orders">
      <span class="ord" id="ordCharge"><i>F1</i> CHARGE</span>
      <span class="ord" id="ordHold"><i>F2</i> HOLD</span>
      <span class="ord" id="ordFollow"><i>F3</i> TO ME</span>
    </div>
    <div id="killfeed"></div>
    <div id="crosshair"></div>
    <div id="hint"><b>WASD</b> move · <b>LMB</b> cut · <b>RMB</b> block · <b>SHIFT</b> run · <b>E</b> mount · <b>X</b> whistle horse · <b>F1–F3</b> orders</div>
    <div id="battleCard"><div id="bcName"></div><div id="bcOdds"></div></div>
    <div id="hurtFx"></div>

    <div id="menu"><div class="scroll">
      <div class="m-head">A CHRONICLE OF THE MARCHES</div>
      <div class="m-title">BANNERFALL</div>
      <div class="m-sub">the field remembers</div>
      <div class="m-body">
        You are a sellsword captain with a blue banner and a bad reputation.<br>
        Three fields stand between your warband and the Warlord of the Red March.<br>
        Fight in the line. Ride them down. Send the pieces home.
      </div>
      <button id="startBtn">TAKE THE FIELD</button>
    </div></div>

    <div id="endscreen"><div class="scroll">
      <div class="m-head" id="endHead"></div>
      <div class="m-title" id="endTitle"></div>
      <div class="m-sub" id="endSub"></div>
      <div class="end-stats" id="endStats"></div>
      <div id="shop">
        <div class="shop-title">SPEND YOUR SILVER <span id="goldNum"></span>🜚</div>
        <div class="shop-row">
          <button class="buy" data-buy="foot">+4 FOOTMEN · 40</button>
          <button class="buy" data-buy="archer">+3 ARCHERS · 50</button>
          <button class="buy" data-buy="knight">+2 KNIGHTS · 70</button>
        </div>
      </div>
      <button id="nextBtn"></button>
    </div></div>
  `;

  const $ = s => root.querySelector(s);
  const el = {
    hp: $('#hpBar > i'), hpNum: $('#hpNum'),
    aBar: $('#aBar'), eBar: $('#eBar'), aNum: $('#aNum'), eNum: $('#eNum'),
    feed: $('#killfeed'), card: $('#battleCard'), bcName: $('#bcName'), bcOdds: $('#bcOdds'),
    hurt: $('#hurtFx'), menu: $('#menu'), end: $('#endscreen'),
    endHead: $('#endHead'), endTitle: $('#endTitle'), endSub: $('#endSub'), endStats: $('#endStats'),
    gold: $('#goldNum'), shop: $('#shop'), next: $('#nextBtn'),
    ords: { charge: $('#ordCharge'), hold: $('#ordHold'), follow: $('#ordFollow') },
  };
  $('#startBtn').onclick = () => { el.menu.classList.add('gone'); hooks.onStart && hooks.onStart(); };
  el.next.onclick = () => { el.end.classList.remove('show'); hooks.onNext && hooks.onNext(); };
  root.querySelectorAll('.buy').forEach(b => {
    b.onclick = () => hooks.onBuy && hooks.onBuy(b.dataset.buy);
  });

  let cardT = 0, hurtT = 0;

  function battleCard(name, odds) {
    el.bcName.textContent = name;
    el.bcOdds.textContent = odds;
    el.card.classList.add('show');
    cardT = 4;
  }

  const VERBS = { head: 'beheaded', armR: 'disarmed, permanently', armL: 'disarmed, permanently', legL: 'cut down at the knee', legR: 'cut down at the knee', torso: 'cut in half' };
  function feed(text) {
    const d = document.createElement('div');
    d.textContent = text;
    el.feed.prepend(d);
    while (el.feed.children.length > 5) el.feed.lastChild.remove();
    setTimeout(() => { d.classList.add('fade'); setTimeout(() => d.remove(), 900); }, 3200);
  }
  const NAMES = ['a levy spearman', 'a red footman', 'a march reaver', 'a red knight', 'a bannerman', 'an oathless sword'];
  function feedKill(severedParts) {
    const name = NAMES[(Math.random() * NAMES.length) | 0];
    const verb = severedParts && severedParts.length ? (VERBS[severedParts[0]] || 'slain') : 'slain';
    feed(`${name} — ${verb}`);
  }

  function hurt() { hurtT = 0.6; }

  function update(S, dt) {
    el.hp.style.width = `${Math.max(0, S.hp)}%`;
    el.hp.className = S.hp > 50 ? '' : S.hp > 25 ? 'mid' : 'low';
    el.hpNum.textContent = Math.max(0, Math.round(S.hp));
    el.aBar.style.width = `${(S.allies / Math.max(1, S.alliesMax)) * 100}%`;
    el.eBar.style.width = `${(S.enemies / Math.max(1, S.enemiesMax)) * 100}%`;
    el.aNum.textContent = S.allies;
    el.eNum.textContent = S.enemies;
    for (const [k, e] of Object.entries(el.ords)) e.classList.toggle('on', S.order === k || (k === 'charge' && S.order === 'advance'));
    if (cardT > 0) { cardT -= dt; if (cardT <= 0) el.card.classList.remove('show'); }
    if (hurtT > 0) { hurtT -= dt; el.hurt.style.opacity = Math.max(0, hurtT * 1.4).toFixed(2); }
  }

  function showEnd(S, won, campaignDone) {
    el.endHead.textContent = won ? `FIELD ${S.battle} — TAKEN` : 'THE BANNER FALLS';
    el.endTitle.textContent = campaignDone ? 'WARLORD NO MORE' : won ? 'VICTORY' : 'DEFEAT';
    el.endTitle.className = `m-title ${won ? 'win' : 'lose'}`;
    el.endSub.textContent = campaignDone
      ? 'the red march is yours. the chroniclers will clean this up considerably.'
      : won ? 'the field is yours. the crows are already landing.' : 'they will sing nothing about today.';
    el.endStats.innerHTML = `
      <div><span>${S.kills}</span>felled by your band</div>
      <div><span>${S.playerKills}</span>by your own hand</div>
      <div><span>${S.dismembered}</span>sent home in pieces</div>
      <div><span>${S.losses}</span>your dead</div>`;
    el.gold.textContent = S.gold;
    el.shop.style.display = won && !campaignDone ? '' : 'none';
    el.next.textContent = campaignDone ? '⚔ ANOTHER CAMPAIGN' : won ? '⚔ MARCH ON' : '⚔ RETAKE THE FIELD';
    el.end.classList.add('show');
  }
  function setGold(g) { el.gold.textContent = g; }

  return { update, battleCard, feed, feedKill, hurt, showEnd, setGold };
}
