// audio.js — all synthesized, nothing sampled. The Backrooms are 90% sound:
// the 60-cycle fluorescent hum with its sick harmonics, footsteps swallowed by
// damp carpet, a drone that is in the room with you, and the wet plink of the
// poolrooms. Unlocks on first gesture.
let ctx = null, master = null, echo = null;
let humGain = null, humOsc = [], droneGain = null, droneOscs = [], toneGain = null, toneFilter = null;

function ensure() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);

  echo = ctx.createDelay(1.0); echo.delayTime.value = 0.31;
  const fb = ctx.createGain(); fb.gain.value = 0.3;
  const wet = ctx.createGain(); wet.gain.value = 0.3;
  echo.connect(fb); fb.connect(echo); echo.connect(wet); wet.connect(master);

  // fluorescent hum: 60Hz + 120 + 180, slightly detuned, quietly wrong
  humGain = ctx.createGain(); humGain.gain.value = 0.0; humGain.connect(master);
  for (const [f, v] of [[60, 0.5], [120, 0.34], [179.7, 0.13], [240.4, 0.06]]) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.value = v;
    o.connect(g); g.connect(humGain); o.start();
    humOsc.push(o);
  }

  // room tone: looping filtered noise — the sound of nothing at all
  const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { last = (last + (Math.random() * 2 - 1) * 0.05) * 0.98; d[i] = last * 4; }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  toneFilter = ctx.createBiquadFilter(); toneFilter.type = 'lowpass'; toneFilter.frequency.value = 240;
  toneGain = ctx.createGain(); toneGain.gain.value = 0.16;
  src.connect(toneFilter); toneFilter.connect(toneGain); toneGain.connect(master);
  src.start();

  // the entity: three barely-detuned low sines — beats you feel in the chest
  droneGain = ctx.createGain(); droneGain.gain.value = 0; droneGain.connect(master);
  for (const f of [48, 48.7, 96.4]) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.value = 0.32;
    o.connect(g); g.connect(droneGain); o.start();
    droneOscs.push(o);
  }
  return true;
}

export function initAudio() {
  const unlock = () => { if (ensure() && ctx.state === 'suspended') ctx.resume(); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

function noiseBurst(dur, vol, freq, q = 1, type = 'bandpass') {
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

// footsteps by surface — carpet swallows, concrete slaps, tile rings
export function sfxStep(surface) {
  if (surface === 'carpet') noiseBurst(0.09, 0.16, 300 + Math.random() * 120, 0.8, 'lowpass');
  else if (surface === 'concrete') { noiseBurst(0.07, 0.14, 900 + Math.random() * 300, 1.4); blip('sine', 70, 45, 0.06, 0.05, false); }
  else { noiseBurst(0.07, 0.11, 1400 + Math.random() * 500, 2.2); blip('sine', 220, 140, 0.05, 0.02); } // tile
}
export function sfxDrip() { blip('sine', 900 + Math.random() * 700, 300, 0.18, 0.05); }
export function sfxStinger() { for (const f of [1244, 1180, 622]) blip('sawtooth', f, f * 0.5, 0.7, 0.05); noiseBurst(0.5, 0.2, 2400, 3); }
export function sfxSkip() { noiseBurst(0.7, 0.5, 3000, 0.4, 'highpass'); blip('square', 400, 30, 0.5, 0.12); }
export function sfxDescend() { blip('sine', 200, 40, 2.2, 0.14); noiseBurst(1.4, 0.2, 200, 0.6, 'lowpass'); }
export function sfxEnd(won) {
  if (won) { for (const [f, d] of [[523, 0], [659, 0.3], [784, 0.6]]) setTimeout(() => blip('sine', f, f, 2.0, 0.07), d * 1000); }
  else noiseBurst(2.5, 0.5, 1200, 0.3, 'highpass');
}

// continuous levels, driven each frame
export function setHum(k) { if (humGain) humGain.gain.setTargetAtTime(0.05 * k, ctx.currentTime, 0.3); }
export function setDrone(k) { if (droneGain) droneGain.gain.setTargetAtTime(0.22 * k, ctx.currentTime, 0.5); }
export function setRoomTone(freq, vol) {
  if (!toneFilter) return;
  toneFilter.frequency.setTargetAtTime(freq, ctx.currentTime, 0.8);
  toneGain.gain.setTargetAtTime(vol, ctx.currentTime, 0.8);
}
// fluorescent flicker buzz — call when a light stutters near the player
export function sfxBuzz() { noiseBurst(0.12, 0.05, 2800, 6); }
