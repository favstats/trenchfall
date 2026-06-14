// renderer.js — WebGPU renderer (auto WebGL2 fallback), lighting, post stack,
// fidelity dial. Knows nothing about units, horde, or gameplay.
import * as THREE from './three.js';
import { pass } from './tsl.js';
import { bloom } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/tsl/display/BloomNode.js';
import { season } from '../game/season.js';

const FIDELITY = {
  low:    { shadow: 1024, pixelRatio: 1,    bloom: false, exposure: 1.12 },
  medium: { shadow: 2048, pixelRatio: 1.45, bloom: true,  exposure: 1.18 },
  high:   { shadow: 4096, pixelRatio: 1.75, bloom: true,  exposure: 1.22 },
};

function probeFidelity(hasGPU) {
  if (!hasGPU) return 'low';
  const dpr = (typeof devicePixelRatio === 'number') ? devicePixelRatio : 1;
  // crude: assume a capable GPU machine; high unless clearly a low-dpr/old setup
  return dpr >= 1.5 ? 'high' : 'medium';
}

function createSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, c.height);
  sky.addColorStop(0.00, '#020812');
  sky.addColorStop(0.34, '#071529');
  sky.addColorStop(0.62, '#10223a');
  sky.addColorStop(1.00, '#18273a');
  g.fillStyle = sky;
  g.fillRect(0, 0, c.width, c.height);

  const haze = g.createRadialGradient(280, 120, 20, 280, 120, 420);
  haze.addColorStop(0.00, 'rgba(150,190,255,.34)');
  haze.addColorStop(0.26, 'rgba(98,132,190,.16)');
  haze.addColorStop(1.00, 'rgba(10,16,30,0)');
  g.fillStyle = haze;
  g.fillRect(0, 0, c.width, c.height);

  let seed = 84;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 520; i++) {
    const x = rnd() * c.width, y = rnd() * c.height * 0.58;
    const a = 0.15 + rnd() * 0.55, r = rnd() < 0.08 ? 1.2 : 0.65;
    g.fillStyle = `rgba(215,230,255,${a})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  for (let i = 0; i < 9; i++) {
    const y = 165 + i * 19 + rnd() * 9;
    const cloud = g.createLinearGradient(0, y - 20, 0, y + 36);
    cloud.addColorStop(0, 'rgba(80,110,150,0)');
    cloud.addColorStop(0.48, `rgba(120,150,190,${0.035 + rnd() * 0.055})`);
    cloud.addColorStop(1, 'rgba(30,45,70,0)');
    g.fillStyle = cloud;
    g.beginPath();
    g.ellipse(520 + (rnd() - 0.5) * 480, y, 480 + rnd() * 260, 28 + rnd() * 18, (rnd() - 0.5) * 0.04, 0, Math.PI * 2);
    g.fill();
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function createRadialTexture(size, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  for (const [p, col] of stops) grad.addColorStop(p, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function addSky(scene) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(650, 48, 24),
    new THREE.MeshBasicMaterial({
      map: createSkyTexture(),
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  sky.frustumCulled = false;
  scene.add(sky);

  const halo = createRadialTexture(512, [
    [0.00, 'rgba(230,242,255,.55)'],
    [0.22, 'rgba(150,188,255,.26)'],
    [0.55, 'rgba(68,100,165,.10)'],
    [1.00, 'rgba(0,0,0,0)'],
  ]);
  const moonGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(88, 88),
    new THREE.MeshBasicMaterial({
      map: halo,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  );
  moonGlow.position.set(-170, 145, -265);
  scene.add(moonGlow);

  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(13, 64),
    new THREE.MeshBasicMaterial({ color: 0xdbeaff, fog: false }),
  );
  moon.position.set(-170, 145, -264);
  scene.add(moon);
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
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // ----- scene & atmosphere -----
  const S = season();
  const scene = new THREE.Scene();
  const NIGHT = new THREE.Color(S.fog);
  scene.background = new THREE.Color(S.bg);
  scene.fog = new THREE.Fog(NIGHT, 42, 390);
  addSky(scene);

  const hemi = new THREE.HemisphereLight(S.hemiSky, S.hemiGnd, S.hemiI);
  scene.add(hemi);

  // moonlight from the north-west — tinted by the season
  const sun = new THREE.DirectionalLight(S.sun, S.sunI);
  sun.position.set(-95, 125, -115);
  sun.castShadow = true;
  sun.shadow.mapSize.set(fq.shadow, fq.shadow);
  const s = sun.shadow.camera;
  s.near = 1; s.far = 560;
  s.left = -230; s.right = 230; s.top = 230; s.bottom = -230;
  sun.shadow.bias = -0.00022;
  sun.shadow.normalBias = 0.018;
  scene.add(sun);
  scene.add(sun.target);

  const rim = new THREE.DirectionalLight(0x5f88c8, 0.72);
  rim.position.set(120, 72, 95);
  scene.add(rim);

  const coldFill = new THREE.DirectionalLight(0x8ab5ff, 0.24);
  coldFill.position.set(0, 55, 160);
  scene.add(coldFill);

  // ----- camera -----
  const camera = new THREE.PerspectiveCamera(
    45, window.innerWidth / window.innerHeight, 0.5, 1400);
  camera.position.set(0, 78, 96);
  camera.lookAt(0, 0, -20);

  function setSize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // bloom post-process so tracers, muzzle flashes, explosions, fire & the moon
  // glow (progressive enhancement — falls back to direct render on any failure)
  let post = null;
  if (fq.bloom) {
    try {
      post = new THREE.PostProcessing(renderer);
      const scenePass = pass(scene, camera);
      const bloomPass = bloom(scenePass, 0.5, 0.45, 0.2); // gentler — only bright sources glow
      post.outputNode = scenePass.add(bloomPass);
    } catch (e) { console.warn('[WF] bloom unavailable — direct render', e); post = null; }
  }

  async function render() {
    if (post) {
      try { await post.renderAsync(); return; }
      catch (e) { console.warn('[WF] bloom render failed — falling back', e); post = null; }
    }
    await renderer.renderAsync(scene, camera);
  }

  return { renderer, scene, camera, sun, render, setSize, backend, fidelity };
}
