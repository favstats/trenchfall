// lightning.js — thundersnow. Every so often the northern sky cracks: a sharp, flickering
// flash from a single non-shadow light briefly floods the field and silhouettes the horde,
// then dies in a tenth of a second. Cheap (one light, idle most of the time), pure drama.
import * as THREE from '../engine/three.js';

export function createLightning(scene) {
  const flash = new THREE.DirectionalLight(0xcfe0ff, 0); // cold storm-light from the north sky
  flash.position.set(-70, 200, -160);
  flash.castShadow = false;
  scene.add(flash, flash.target);

  let timer = 7 + Math.random() * 14;  // first strike comes fairly soon
  let level = 0;                       // current flash envelope
  const seq = [];                      // queued sub-flashes of one strike (the flicker)
  let clock = 0;

  function strike() {
    seq.length = 0; clock = 0;
    const n = 1 + (Math.random() < 0.65 ? 1 : 0) + (Math.random() < 0.3 ? 1 : 0);
    let t = 0;
    for (let i = 0; i < n; i++) {
      seq.push({ at: t, peak: 1.5 + Math.random() * 1.8 });
      t += 0.05 + Math.random() * 0.13;
    }
  }

  function update(dt) {
    timer -= dt;
    if (timer <= 0) { strike(); timer = 15 + Math.random() * 34; }
    if (seq.length) {
      clock += dt;
      while (seq.length && clock >= seq[0].at) level = Math.max(level, seq.shift().peak);
    }
    level *= Math.exp(-15 * dt);        // sharp decay → a crack, not a glow
    flash.intensity = level;
  }
  return { update, light: flash };
}
