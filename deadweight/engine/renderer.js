// renderer.js — dead station light: cold hull ambience, hot emergency strips,
// bloom so sparks and thruster glow carry. One shadow light that follows.
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
  renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05080c);
  scene.fog = new THREE.Fog(0x05080c, 34, 130);

  const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 300);

  const key = new THREE.DirectionalLight(0xbcd4f0, 2.4);
  key.position.set(8, 18, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(1536, 1536);
  const S = key.shadow.camera;
  S.near = 1; S.far = 80; S.left = -30; S.right = 30; S.top = 30; S.bottom = -30;
  key.shadow.bias = -0.0005;
  scene.add(key, key.target);
  scene.add(new THREE.HemisphereLight(0x6a86a8, 0x1c242e, 1.0));

  let composer = null;
  try {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.6, 0.6));
    composer.addPass(new OutputPass());
  } catch (e) { console.warn('[DW] post unavailable', e); composer = null; }

  function setSize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer && composer.setSize(window.innerWidth, window.innerHeight);
  }

  function render() {
    key.target.position.set(camera.position.x, 0, camera.position.z);
    key.position.set(camera.position.x + 8, camera.position.y + 16, camera.position.z + 6);
    if (composer) {
      try { composer.render(); return; }
      catch (e) { console.warn('[DW] post failed', e); composer = null; }
    }
    renderer.render(scene, camera);
  }

  return { renderer, scene, camera, setSize, render };
}
