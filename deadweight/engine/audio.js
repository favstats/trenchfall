// audio.js — all synthesized. Mass is the star: impact thuds scale with
// momentum, the tether hums under load, the rifle cracks, drones whine, and
// the station groans around all of it. VESTA speaks in soft data-blips.
let ctx = null, master = null, echo = null, tetherOsc = null, tetherGain = null, groanGain = null;

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
  echo = ctx.createDelay(0.7); echo.delayTime.value = 0.26;
  const fb = ctx.createGain(); fb.gain.value = 0.28;
  const wet = ctx.createGain(); wet.gain.value = 0.3;
  echo.connect(fb); fb.connect(echo); echo.connect(wet); wet.connect(master);

  // hull groan bed
  const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { last = (last + (Math.random() * 2 - 1) * 0.05) * 0.985; d[i] = last * 6; }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140;
  groanGain = ctx.createGain(); groanGain.gain.value = 0.14;
  src.connect(lp); lp.connect(groanGain); groanGain.connect(master); src.start();

  // tether hum — pitch rides the held mass
  tetherOsc = ctx.createOscillator(); tetherOsc.type = 'sawtooth'; tetherOsc.frequency.value = 70;
  const tf = ctx.createBiquadFilter(); tf.type = 'lowpass'; tf.frequency.value = 400;
  tetherGain = ctx.createGain(); tetherGain.gain.value = 0;
  tetherOsc.connect(tf); tf.connect(tetherGain); tetherGain.connect(master); tetherOsc.start();
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

export function sfxImpact(power) { // power ~ decel * mass, clamp to taste
  const k = Math.min(1, power / 60);
  noise(0.16 + k * 0.2, 0.1 + k * 0.4, 200 - k * 120, 0.7, 'lowpass');
  blip('sine', 90 - k * 40, 30, 0.2 + k * 0.2, 0.08 + k * 0.2, false);
}
export function sfxRifle() { noise(0.09, 0.35, 1800, 0.7); blip('square', 220, 60, 0.1, 0.12, false); }
export function sfxGrab() { blip('sine', 220, 540, 0.14, 0.1); }
export function sfxThrow() { noise(0.2, 0.2, 900, 0.8); blip('sawtooth', 300, 90, 0.24, 0.1); }
export function sfxDroneDie() { noise(0.4, 0.35, 700, 0.9); blip('sawtooth', 420, 40, 0.5, 0.14); blip('square', 900, 100, 0.3, 0.06); }
export function sfxHurt() { noise(0.2, 0.3, 400, 0.8, 'lowpass'); blip('sine', 120, 50, 0.3, 0.16, false); }
export function sfxHatch() { blip('sine', 80, 40, 0.9, 0.2); noise(0.7, 0.2, 300, 0.6, 'lowpass'); }
export function sfxBoon() { for (const [f, d] of [[520, 0], [660, 0.12], [880, 0.24]]) setTimeout(() => blip('sine', f, f, 0.5, 0.08), d * 1000); }
export function sfxDeath() { blip('sawtooth', 200, 24, 1.8, 0.2); noise(1.2, 0.3, 500, 0.5, 'lowpass'); }
export function sfxVesta() { for (let i = 0; i < 3; i++) setTimeout(() => blip('sine', 900 + Math.random() * 500, 700, 0.06, 0.04), i * 90); }
export function sfxBeacon() { blip('sine', 660, 660, 0.3, 0.09); setTimeout(() => blip('sine', 660, 660, 0.3, 0.07), 500); }
export function sfxWin() { for (const [f, d] of [[392, 0], [523, 0.25], [659, 0.5], [784, 0.8]]) setTimeout(() => blip('sine', f, f, 1.6, 0.08), d * 1000); }

export function setTether(load) { // 0 = free, 1 = heavy
  if (!tetherGain) return;
  tetherGain.gain.setTargetAtTime(load > 0 ? 0.05 + load * 0.06 : 0, ctx.currentTime, 0.06);
  tetherOsc.frequency.setTargetAtTime(60 + load * 90, ctx.currentTime, 0.08);
}
