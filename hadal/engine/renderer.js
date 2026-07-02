// renderer.js — plain WebGL renderer. HADAL has NO scene lights: every visible
// thing is a custom shader lit by the shared sonar/lamp uniforms. The renderer
// owns the canvas, camera, fog color ramp, resize — and the cinematic post
// stack: in a world made entirely of emissive points, bloom IS the lighting
// model; every ping wavefront, flare and vent halates like a long-exposure
// deep-sea photograph. Progressive: if the composer fails, direct render.
import * as THREE from './three.js';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/postprocessing/OutputPass.js';

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.3, 900);
  camera.position.set(0, 6, 26);

  // the last of the light dies on the way down: deep blue at the start of the
  // drop, true black by the abyssal zone. Fog matches so walls swallow cleanly.
  const topColor = new THREE.Color(0x04101c);
  const bottomColor = new THREE.Color(0x000103);
  const cur = new THREE.Color();
  scene.fog = new THREE.Fog(0x04101c, 40, 420);

  function setDepthK(k) { // 0 at the surface of the run, 1 by ~1600m
    cur.lerpColors(topColor, bottomColor, Math.min(1, k));
    renderer.setClearColor(cur);
    scene.fog.color.copy(cur);
    scene.fog.far = 420 - 150 * Math.min(1, k); // the dark closes in
  }
  setDepthK(0);

  // ---- post: render -> unreal bloom -> tonemap/sRGB output ----
  let composer = null;
  try {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 0.8, 0.5, 0.16);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  } catch (e) { console.warn('[HD] post unavailable — direct render', e); composer = null; }

  function setSize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer && composer.setSize(window.innerWidth, window.innerHeight);
  }

  function render() {
    if (composer) {
      try { composer.render(); return; }
      catch (e) { console.warn('[HD] post render failed — falling back', e); composer = null; }
    }
    renderer.render(scene, camera);
  }

  return { renderer, scene, camera, setSize, setDepthK, render };
}
