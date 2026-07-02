// BANNERFALL — the field remembers. Boot, campaign flow, horn orders, and the
// captain himself. Three fields between you and the Warlord of the Red March.
import { createRenderer } from './engine/renderer.js';
import { buildWorld } from './world.js';
import { createGore } from './gore.js';
import { Battle } from './combat.js';
import { Player } from './player.js';
import { createHUD } from './ui/hud.js';
import { createWorldMap } from './ui/worldmap.js';
import { initAudio, sfxHorn, sfxWin, sfxLose } from './engine/audio.js';

const canvas = document.getElementById('gl');
const hudRoot = document.getElementById('hud');
window.BF = { ready: false, stats: {}, test: {} };

const R = createRenderer(canvas);
const world = buildWorld(R.scene);
const gore = createGore(R.scene, hudRoot);
const battle = new Battle(R.scene, world, gore);
initAudio();

const FIELDS = [
  { name: 'THE FORD AT ASHEN CREEK', enemy: { foot: 20, archer: 6, knight: 0 } },
  { name: 'THE BURNING MARCH', enemy: { foot: 24, archer: 8, knight: 5 } },
  { name: "THE WARLORD'S FIELD", enemy: { foot: 28, archer: 10, knight: 10 } },
];
const COST = { foot: 40, archer: 50, knight: 70 };
const PACK = { foot: 4, archer: 3, knight: 2 };

const G = {
  phase: 'menu',            // menu | battle | end
  battle: 0,
  roster: { foot: 16, archer: 6, knight: 3 },
  gold: 0,
  playerKills: 0,
  alliesMax: 1, enemiesMax: 1,
  won: false, campaignDone: false,
};

const hud = createHUD(hudRoot, {
  onStart: () => { G.phase = 'map'; map.show(true); },
  onNext: () => {
    if (G.campaignDone) { location.reload(); return; }
    G.phase = 'map'; map.show(true);
  },
  onBuy: (kind) => {
    if (G.gold < COST[kind]) return;
    G.gold -= COST[kind];
    G.roster[kind] += PACK[kind];
    hud.setGold(G.gold);
    hud.feed(`+${PACK[kind]} ${kind === 'foot' ? 'footmen' : kind + 's'} sworn in`);
  },
});

// the sandbox: roam, recruit, pick your fights, march on the keep when ready
const map = createWorldMap(hudRoot, {
  onBattle: (band) => {
    G.currentBand = band;
    const n = band.strength;
    fieldBattle({ foot: Math.ceil(n * 0.6), archer: Math.ceil(n * 0.2), knight: Math.floor(n * 0.2) }, `WARBAND OF ${n} SWORDS`, false);
  },
  onVillage: (v) => {
    hud.feed(`${v.name}: the muster is open`);
    G.won = true; G.currentBand = null;
    G.phase = 'end'; map.show(false);
    hud.showEnd({ battle: '—', kills: battle.kills, playerKills: G.playerKills, dismembered: battle.dismembered, losses: battle.losses, gold: G.gold }, true, false);
  },
  onKeep: (k) => {
    G.currentBand = 'keep';
    fieldBattle({ foot: 26, archer: 10, knight: 12 }, "THE WARLORD'S KEEP", true);
  },
});

function fieldBattle(comp, name, isKeep) {
  map.show(false);
  G.isKeep = isKeep;
  G.phase = 'battle';
  G.playerKills = 0;
  battle.clear();
  battle.spawn('blue', G.roster);
  battle.spawn('red', comp);
  G.alliesMax = battle.allies.length;
  G.enemiesMax = battle.enemies.length;
  player.alive = true; player.hp = player.maxHp;
  player.rig.g.visible = true;
  player.rig.g.rotation.set(0, 0, 0);
  player.place(0, 56, Math.PI);
  player.enabled = true;
  hud.battleCard(name, `${G.alliesMax + 1} banners against ${G.enemiesMax}`);
  sfxHorn(true);
  player.requestLock();
}

const player = new Player(R.scene, R.camera, canvas, battle, gore);
player.onHurt = () => hud.hurt();
player.onKill = (r) => { G.playerKills += r.killed; hud.feedKill(r.severed > 0 ? ['head'] : []); };

function startBattle(n) {
  G.battle = Math.min(n, FIELDS.length - 1);
  G.phase = 'battle';
  G.playerKills = 0;
  battle.clear();
  battle.spawn('blue', G.roster);
  battle.spawn('red', FIELDS[G.battle].enemy);
  G.alliesMax = battle.allies.length;
  G.enemiesMax = battle.enemies.length;
  player.alive = true; player.hp = player.maxHp;
  player.rig.g.visible = true;
  player.rig.g.rotation.set(0, 0, 0);
  player.place(0, 56, Math.PI);
  player.enabled = true;
  const e = FIELDS[G.battle].enemy;
  hud.battleCard(FIELDS[G.battle].name, `${G.alliesMax + 1} banners against ${e.foot + e.archer + e.knight}`);
  sfxHorn(true);
}

function endBattle(won) {
  G.phase = 'end';
  G.won = won;
  G.campaignDone = won && G.isKeep;
  if (won && G.currentBand && G.currentBand !== 'keep') G.currentBand.alive = false;
  player.enabled = false;
  document.pointerLockElement && document.exitPointerLock();
  if (won) { G.gold += battle.kills * 3 + 120; sfxWin(); } else sfxLose();
  hud.showEnd({
    battle: G.battle + 1, kills: battle.kills, playerKills: G.playerKills,
    dismembered: battle.dismembered, losses: battle.losses, gold: G.gold,
  }, won, G.campaignDone);
}

function setOrder(o) {
  battle.order = o;
  sfxHorn(o === 'charge');
  hud.feed(o === 'charge' ? 'the horn sounds — CHARGE' : o === 'hold' ? 'the line holds' : 'the band rallies to you');
}

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (G.phase !== 'battle') return;
  if (k === 'f1') { setOrder('charge'); e.preventDefault(); }
  if (k === 'f2') { setOrder('hold'); e.preventDefault(); }
  if (k === 'f3') { setOrder('follow'); e.preventDefault(); }
  if (k === 'e') player.mounted ? player.dismount() : player.mount();
  if (k === 'x') player.whistle();
});
window.addEventListener('resize', R.setSize);

// ---------------- loop ----------------
let last = performance.now();
let t = 0;

function frame(now) {
  const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
  last = now;
  t += dt;

  world.update(dt, t);
  gore.update(dt);

  if (G.phase === 'battle') {
    battle.update(dt, player);
    player.update(dt);
    if (battle.result === 'win') endBattle(true);
    else if (battle.result === 'lose' || (!player.alive && battle.aliveOf(battle.allies).length === 0)) endBattle(false);
  } else if (G.phase === 'menu' || G.phase === 'map') {
    // slow orbit over the field behind the map / menu
    const a = t * 0.06;
    R.camera.position.set(Math.sin(a) * 70, 26, Math.cos(a) * 70);
    R.camera.lookAt(0, 2, 0);
    if (G.phase === 'map') {
      const army = G.roster.foot + G.roster.archer + G.roster.knight;
      map.update(dt, G.gold, army);
    }
  } else {
    player.update(dt);
    battle.update(dt, player);
  }

  const aAlive = battle.allies.filter(s => s.alive && s.order !== 'rout').length;
  const eAlive = battle.enemies.filter(s => s.alive && s.order !== 'rout').length;
  hud.update({
    hp: player.hp, allies: aAlive, enemies: eAlive,
    alliesMax: G.alliesMax, enemiesMax: G.enemiesMax, order: battle.order,
  }, dt);

  window.BF.stats = {
    phase: G.phase, battle: G.battle + 1, field: FIELDS[G.battle].name,
    hp: Math.round(player.hp), alive: player.alive, mounted: player.mounted,
    allies: aAlive, enemies: eAlive,
    kills: battle.kills, playerKills: G.playerKills, dismembered: battle.dismembered,
    losses: battle.losses, gold: G.gold, order: battle.order,
    pos: [Math.round(player.pos.x), Math.round(player.pos.z)],
  };

  R.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------- QA / debug surface ----------------
window.BF.test = {
  start: () => { document.getElementById('menu')?.classList.add('gone'); if (G.phase === 'menu') { G.phase = 'map'; map.show(true); } },
  fight: () => { const b = map.state.bands.find(b => b.alive); if (b) map.state.you.x = b.x, map.state.you.y = b.y, map.update(0.01, G.gold, 1); return G.phase; },
  next: () => { document.querySelector('#endscreen')?.classList.remove('show'); G.phase = 'map'; map.show(true); },
  look: (yaw = Math.PI) => { player.yaw = yaw; },
  teleport: (x, z) => player.place(x, z, player.yaw),
  attack: () => player.attack(),
  slayArc: (dmg = 60) => battle.damageArc(player.pos.x, player.pos.z, player.yaw, 6, Math.PI, dmg, true),
  // step into the enemy line: teleport to arm's reach of the nearest living foe
  melee: () => {
    let best = null, bd = 1e9;
    for (const s of battle.enemies) {
      if (!s.alive) continue;
      const d2 = (s.pos.x - player.pos.x) ** 2 + (s.pos.z - player.pos.z) ** 2;
      if (d2 < bd) { bd = d2; best = s; }
    }
    if (!best) return null;
    player.place(best.pos.x, best.pos.z + 2, Math.PI);
    return [Math.round(best.pos.x), Math.round(best.pos.z)];
  },
  mount: () => { player.whistle(); player.mount(); return player.mounted; },
  order: (o) => setOrder(o),
  killEnemies: () => { for (const s of battle.enemies) if (s.alive) { s.hp = 0; battle.damageArc(s.pos.x, s.pos.z, 0, 1, Math.PI, 200, false); } return battle.enemies.filter(s => s.alive).length; },
  buy: (k) => { G.gold += 999; hud.setGold(G.gold); document.querySelector(`[data-buy="${k}"]`)?.click(); return G.roster[k]; },
  gore: () => ({ kills: battle.kills, dismembered: battle.dismembered }),
  win: () => endBattle(true),
  lose: () => endBattle(false),
};

requestAnimationFrame(() => {
  window.BF.ready = true;
  console.log(`[BF] ready — roster ${JSON.stringify(G.roster)}`);
});
