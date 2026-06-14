// renderer.js — WebGPU renderer (auto WebGL2 fallback), lighting, post stack,
// fidelity dial. Knows nothing about units, horde, or gameplay.
import * as THREE from './three.js';

const FIDELITY = {
  low:    { shadow: 1024, pixelRatio: 1,   bloom: false, exposure: 1.05 },
  medium: { shadow: 2048, pixelRatio: 1.5, bloom: true,  exposure: 1.0  },
  high:   { shadow: 4096, pixelRatio: 2,   bloom: true,  exposure: 1.0  },
};

function probeFidelity(hasGPU) {
  if (!hasGPU) return 'low';
  const dpr = (typeof devicePixelRatio === 'number') ? devicePixelRatio : 1;
  // crude: assume a capable GPU machine; high unless clearly a low-dpr/old setup
  return dpr >= 1.5 ? 'high' : 'medium';
}

export async function createRenderer(canvas, forcedFidelity, forceWebGL) {
  const hasGPU = !!(navigator.gpu) && !forceWebGL;
  const renderer = new THREE.WebGPURenderer({
    canvas, antialias: true, forceWebGL: !hasGPU,
  });
  await renderer.init();

  const backend = renderer.backend && renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2';
  let fidelity = forcedFidelity || probeFidelity(backend === 'webgpu');
  let fq = FIDELITY[fidelity];

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, fq.pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = fq.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // ----- scene & atmosphere -----
  const scene = new THREE.Scene();
  const NIGHT = new THREE.Color(0x0a121d);
  scene.background = NIGHT;
  scene.fog = new THREE.Fog(NIGHT, 90, 520);

  const hemi = new THREE.HemisphereLight(0x9fb8d6, 0x0a0f15, 0.7);
  scene.add(hemi);

  // cold moonlight from the north-west
  const sun = new THREE.DirectionalLight(0xc8d8ff, 1.35);
  sun.position.set(-60, 90, -50);
  sun.castShadow = true;
  sun.shadow.mapSize.set(fq.shadow, fq.shadow);
  const s = sun.shadow.camera;
  s.near = 1; s.far = 400;
  s.left = -200; s.right = 200; s.top = 200; s.bottom = -200;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  // ----- camera -----
  const camera = new THREE.PerspectiveCamera(
    50, window.innerWidth / window.innerHeight, 0.5, 1400);
  camera.position.set(0, 60, 90);
  camera.lookAt(0, 0, -20);

  function setSize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  async function render() {
    await renderer.renderAsync(scene, camera);
  }

  return { renderer, scene, camera, sun, render, setSize, backend, fidelity };
}
