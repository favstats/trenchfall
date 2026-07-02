// audio.js — every sound in HADAL is synthesized live with WebAudio. No assets:
// the abyss hum is filtered noise, the sonar is a swept sine with a feedback
// echo, the leviathan is a detuned sawtooth choir. Unlocks on first gesture.
let ctx = null, master = null, echo = null;
let rumbleGain = null, boostOsc = null, boostGain = null;

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);

  // feedback delay — everything down here echoes off the trench walls
  echo = ctx.createDelay(1.2); echo.delayTime.value = 0.42;
  const fb = ctx.createGain(); fb.gain.value = 0.34;
  const wet = ctx.createGain(); wet.gain.value = 0.35;
  echo.connect(fb); fb.connect(echo); echo.connect(wet); wet.connect(master);

  // the abyss: looping brown-ish noise through a deep lowpass, always breathing
  const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { last = (last + (Math.random() * 2 - 1) * 0.04) * 0.985; d[i] = last * 6; }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 110; lp.Q.value = 0.6;
  rumbleGain = ctx.createGain(); rumbleGain.gain.value = 0.5;
  src.connect(lp); lp.connect(rumbleGain); rumbleGain.connect(master);
  src.start();

  // thruster boost — a hum that only opens up while boosting
  boostOsc = ctx.createOscillator(); boostOsc.type = 'triangle'; boostOsc.frequency.value = 46;
  boostGain = ctx.createGain(); boostGain.gain.value = 0;
  const bl = ctx.createBiquadFilter(); bl.type = 'lowpass'; bl.frequency.value = 260;
  boostOsc.connect(bl); bl.connect(boostGain); boostGain.connect(master);
  boostOsc.start();
  return true;
}

export function initAudio() {
  const unlock = () => { if (ensure() && ctx.state === 'suspended') ctx.resume(); };
  window.addEventListener('pointerdown', unlock, { once: false });
  window.addEventListener('keydown', unlock, { once: false });
}

function blip(type, f0, f1, dur, vol, toEcho = false, curve = 'exp') {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  else o.frequency.linearRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); if (toEcho) g.connect(echo);
  o.start(t); o.stop(t + dur + 0.05);
}

function noiseBurst(dur, vol, freq, q = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const len = Math.ceil(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ctx.createBufferSource(); s.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(master); g.connect(echo);
  s.start(t);
}

// the voice you spend: a falling pure tone that rings off into the delay line
export function sfxPing() { blip('sine', 1240, 320, 0.5, 0.34, true); }
// hull complains — pressure creak on impacts and at depth
export function sfxCreak() { noiseBurst(0.5, 0.32, 140 + Math.random() * 180, 2.5); blip('sine', 60, 34, 0.6, 0.16); }
export function sfxChime() { blip('sine', 620, 980, 0.35, 0.12, true, 'lin'); blip('sine', 930, 1470, 0.5, 0.08, true, 'lin'); }
export function sfxFlare() { noiseBurst(0.25, 0.16, 900, 1); blip('square', 220, 660, 0.2, 0.06); }
// the leviathan — three detuned saws sliding down together, felt as much as heard
export function sfxRoar() {
  if (!ctx) return;
  for (const det of [0, 7, -9]) blip('sawtooth', 90 + det, 30, 2.4, 0.16, true);
  noiseBurst(1.6, 0.3, 90, 0.8);
}
export function sfxThump() { blip('sine', 58, 40, 0.28, 0.3); } // your own heart
export function sfxImplode() { noiseBurst(2.2, 0.6, 220, 0.5); blip('sawtooth', 120, 20, 2.0, 0.3, true); }
export function sfxWin() { for (const [f, d] of [[392, 0], [523, 0.25], [659, 0.5], [784, 0.75]]) setTimeout(() => blip('sine', f, f, 1.6, 0.1, true, 'lin'), d * 1000); }

// a recovered transmission: squelch open, warbling static bed for the length
// of the message, squelch closed. The words are on the HUD; this is the ghost.
export function sfxRadio(dur = 4) {
  if (!ctx) return;
  const t = ctx.currentTime;
  blip('square', 1350, 900, 0.07, 0.05);                    // squelch open
  const len = Math.ceil(ctx.sampleRate * dur), buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const s = ctx.createBufferSource(); s.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1250; f.Q.value = 2.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0, t);
  g.gain.linearRampToValueAtTime(0.035, t + 0.1);
  // voice-like amplitude warble under the words
  for (let i = 0; i < dur * 6; i++) g.gain.linearRampToValueAtTime(0.012 + Math.random() * 0.035, t + 0.1 + i / 6);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); g.connect(echo);
  s.start(t); s.stop(t + dur + 0.1);
  setTimeout(() => blip('square', 900, 1350, 0.06, 0.045), dur * 1000); // squelch closed
}

// continuous levels, driven each frame
export function setBoost(on) { if (boostGain) boostGain.gain.setTargetAtTime(on ? 0.22 : 0, ctx.currentTime, 0.08); }
export function setDepthRumble(k) { if (rumbleGain) rumbleGain.gain.setTargetAtTime(0.35 + k * 0.5, ctx.currentTime, 0.4); }
