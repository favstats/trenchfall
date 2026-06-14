// audio.js — battlefield SFX via Howler (free game-audio library, loaded as a
// global <script> in winterfell.html) playing the repo's CC0 sample packs
// (Kenney + a CC0 Mosin recording). Not hand-rolled Web Audio.
let Howl = null;
const pools = {};
const t = { shot: 0, thud: 0, reload: 0 };

function pool(files, vol) {
  return { howls: files.map(f => new Howl({ src: [f], volume: vol, preload: true })) };
}
function play(p, rateVary = 0, volJitter = 0) {
  if (!p || !p.howls.length) return;
  const h = p.howls[(Math.random() * p.howls.length) | 0];
  const id = h.play();
  if (rateVary) h.rate(1 - rateVary + Math.random() * rateVary * 2, id);
  if (volJitter) h.volume(h._volume * (1 - volJitter + Math.random() * volJitter * 2), id);
}

export function initAudio() {
  Howl = window.Howl;
  if (!Howl) { console.warn('[WF] Howler not loaded — running silent'); return false; }
  const K = 'audio/kenney/', G = 'audio/guns/';
  pools.shot = pool([G + 'mosin.m4a'], 0.12);
  pools.boom = pool([K + 'impact/impactMining_000.ogg', K + 'impact/impactMining_002.ogg', K + 'impact/impactMining_004.ogg'], 0.5);
  pools.thud = pool([K + 'impact/impactSoft_medium_000.ogg', K + 'impact/impactSoft_medium_001.ogg', K + 'impact/impactSoft_medium_002.ogg'], 0.22);
  pools.reload = pool([K + 'rpg/metalClick.ogg', K + 'rpg/beltHandle1.ogg', K + 'rpg/metalLatch.ogg'], 0.28);
  pools.build = pool([K + 'interface/confirmation_001.ogg', K + 'interface/click_002.ogg'], 0.3);
  if (window.Howler) window.Howler.volume(0.4); // overall quiet — battle ambience, not a wall of noise
  return true;
}

const now = () => performance.now();
// gunfire is throttled so a whole firing line reads as a distant crackle
export function sfxShot() { if (now() - t.shot > 90) { t.shot = now(); play(pools.shot, 0.12, 0.25); } }
export function sfxBoom() { play(pools.boom, 0.12); }
export function sfxThud() { if (now() - t.thud > 150) { t.thud = now(); play(pools.thud, 0.15); } }
export function sfxReload() { if (now() - t.reload > 180) { t.reload = now(); play(pools.reload, 0.1); } }
export function sfxBuild() { play(pools.build, 0.08); }
