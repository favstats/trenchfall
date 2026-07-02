// audio.js — all synthesized. Steel ringing on steel, the wet work underneath
// it, war horns, hooves, and wind over the grass. Unlocks on first gesture.
let ctx = null, master = null, echo = null, windGain = null, roarGain = null;

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
  echo = ctx.createDelay(0.6); echo.delayTime.value = 0.21;
  const fb = ctx.createGain(); fb.gain.value = 0.22;
  const wet = ctx.createGain(); wet.gain.value = 0.24;
  echo.connect(fb); fb.connect(echo); echo.connect(wet); wet.connect(master);

  const mkNoise = (lp, vol) => {
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + (Math.random() * 2 - 1) * 0.06) * 0.97; d[i] = last * 5; }
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const g = ctx.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(master); s.start();
    return g;
  };
  windGain = mkNoise(600, 0.1);      // wind over the field
  roarGain = mkNoise(280, 0.0);      // the battle roar, faded in while men fight
  return true;
}

export function initAudio() {
  const unlock = () => { if (ensure() && ctx.state === 'suspended') ctx.resume(); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

function blip(type, f0, f1, dur, vol, toEcho = true) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); if (toEcho) g.connect(echo);
  o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol, freq, q = 1, type = 'bandpass') {
  if (!ctx) return;
  const t = ctx.currentTime;
  const len = Math.ceil(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ctx.createBufferSource(); s.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(master); g.connect(echo);
  s.start(t);
}

export function sfxSwing() { noise(0.16, 0.12, 1400 + Math.random() * 600, 0.6, 'bandpass'); }
export function sfxClang() { // steel on steel — bright, ringing
  for (const f of [2800, 4100, 5300]) blip('sine', f * (0.95 + Math.random() * 0.1), f * 0.7, 0.35, 0.05);
  noise(0.08, 0.2, 3600, 3);
}
export function sfxFlesh() { noise(0.12, 0.3, 380, 1, 'lowpass'); blip('sine', 140, 70, 0.12, 0.14, false); }
export function sfxSever() { // the wet pop under the clang
  noise(0.2, 0.4, 900, 0.8);
  noise(0.3, 0.28, 300, 0.6, 'lowpass');
  blip('sine', 240, 50, 0.25, 0.16);
}
export function sfxDeath() { blip('sawtooth', 160 + Math.random() * 60, 60, 0.4, 0.045); }
export function sfxHorn(low = false) { // the order horn — two detuned saws swelling
  if (!ctx) return;
  const t = ctx.currentTime, base = low ? 98 : 147;
  for (const det of [0, 3]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = base + det;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.25);
    g.gain.setValueAtTime(0.09, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(f); f.connect(g); g.connect(master); g.connect(echo);
    o.start(t); o.stop(t + 1.7);
  }
}
export function sfxArrow() { noise(0.3, 0.05, 2400, 2); }
export function sfxGallop() { blip('sine', 85, 45, 0.09, 0.12, false); }
export function sfxHit() { noise(0.15, 0.3, 500, 0.8, 'lowpass'); blip('sine', 90, 40, 0.2, 0.2, false); }
export function sfxWin() { for (const [f, d] of [[392, 0], [494, 0.22], [587, 0.44], [784, 0.7]]) setTimeout(() => blip('sine', f, f, 1.4, 0.08), d * 1000); }
export function sfxLose() { for (const [f, d] of [[220, 0], [208, 0.4], [196, 0.8]]) setTimeout(() => blip('sawtooth', f, f * 0.9, 1.2, 0.06), d * 1000); }
export function setRoar(k) { if (roarGain) roarGain.gain.setTargetAtTime(0.16 * k, ctx.currentTime, 0.8); }
