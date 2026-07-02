// renderer.js — golden hour. One low warm sun with long shadows, a cool sky
// fill, warm fog toward the horizon, ACES + bloom so steel and banners catch
// fire in the light. Progressive: composer failure -> direct render.
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
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8b06a);
  scene.fog = new THREE.Fog(0xe0a86a, 90, 420);

  const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.1, 900);
  camera.position.set(0, 3, 10);

  // the sun, low in the west — everything long-shadowed and amber
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.6);
  sun.position.set(-120, 55, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const S = sun.shadow.camera;
  S.near = 10; S.far = 400; S.left = -130; S.right = 130; S.top = 130; S.bottom = -130;
  sun.shadow.bias = -0.0006;
  scene.add(sun); scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xa8c4e0, 0x6a5838, 0.75);
  scene.add(hemi);

  let composer = null;
  try {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.32, 0.6, 0.82));
    composer.addPass(new OutputPass());
  } catch (e) { console.warn('[BF] post unavailable', e); composer = null; }

  function setSize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer && composer.setSize(window.innerWidth, window.innerHeight);
  }

  function render() {
    // the shadow window follows the camera so the whole line stays shadowed
    sun.target.position.set(camera.position.x, 0, camera.position.z);
    sun.position.set(camera.position.x - 120, 55, camera.position.z + 40);
    if (composer) {
      try { composer.render(); return; }
      catch (e) { console.warn('[BF] post failed', e); composer = null; }
    }
    renderer.render(scene, camera);
  }

  return { renderer, scene, camera, sun, setSize, render };
}
