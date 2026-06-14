// renderer.js — WebGPU renderer (auto WebGL2 fallback), lighting, post stack,
// fidelity dial. Knows nothing about units, horde, or gameplay.
import * as THREE from './three.js';
import {
  pass, uniform, uv, vec2, vec3, vec4, float,
  mix, clamp, pow, dot, fract, sin, smoothstep, luminance, Fn,
} from './tsl.js';
import { bloom } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/tsl/display/BloomNode.js';
import { season } from '../game/season.js';

const FIDELITY = {
  // exposure pulled back slightly vs. before — the cinematic grade lifts shadows
  // and protects highlights, so we no longer need to over-expose to stay readable
  low:    { shadow: 1024, pixelRatio: 1,    bloom: false, exposure: 1.34 },
  medium: { shadow: 1792, pixelRatio: 1.2,  bloom: false, exposure: 1.38 },
  high:   { shadow: 2560, pixelRatio: 1.4,  bloom: true,  exposure: 1.42 },
};

function probeFidelity(hasGPU) {
  if (!hasGPU) return 'low';
  // dpr is a screen property, NOT a GPU-power signal — a retina laptop with weak
  // integrated graphics would land on 'high' and crawl. Gate on cores/memory instead.
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (cores >= 12 && mem >= 8) return 'high';
  if (cores >= 8) return 'medium';
  return 'low';
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

  // god-rays: soft light shafts fanning down from the moon over the battlefield
  const sc = document.createElement('canvas'); sc.width = 16; sc.height = 256;
  const sg = sc.getContext('2d');
  const grd = sg.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, 'rgba(198,220,255,.55)'); grd.addColorStop(0.45, 'rgba(160,194,255,.16)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  sg.fillStyle = grd; sg.fillRect(0, 0, 16, 256);
  const shaftTex = new THREE.CanvasTexture(sc); shaftTex.colorSpace = THREE.SRGBColorSpace;
  const shafts = new THREE.Group();
  shafts.position.set(-170, 150, -258);
  shafts.rotation.x = -0.22; // lean the beams toward the field
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 320),
      new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, opacity: 0.16 + (i % 2) * 0.05, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }),
    );
    m.position.y = -150; m.rotation.z = (i - 3) * 0.11;
    shafts.add(m);
  }
  shafts.frustumCulled = false;
  scene.add(shafts);
}

export async function createRenderer(canvas, forcedFidelity, forceWebGL) {
  const hasGPU = !!(navigator.gpu) && !forceWebGL;
  const renderer = new THREE.WebGPURenderer({
    canvas, antialias: false, forceWebGL: !hasGPU, // MSAA off — the grade/grain hide the edges, FPS matters more
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

  const hemi = new THREE.HemisphereLight(S.hemiSky, S.hemiGnd, S.hemiI * 2.0); // brighter night
  scene.add(hemi);

  // moonlight from the north-west — tinted by the season
  const sun = new THREE.DirectionalLight(S.sun, S.sunI * 1.35);
  sun.position.set(-95, 125, -115);
  sun.castShadow = true;
  sun.shadow.mapSize.set(fq.shadow, fq.shadow);
  const s = sun.shadow.camera;
  s.near = 1; s.far = 560;
  s.left = -230; s.right = 230; s.top = 230; s.bottom = -230;
  sun.shadow.bias = -0.00018;
  sun.shadow.normalBias = 0.02;
  if ('radius' in sun.shadow) sun.shadow.radius = 3; // softer contact edges (PCF)
  scene.add(sun);
  scene.add(sun.target);

  const rim = new THREE.DirectionalLight(0x6f96d0, 1.5);
  rim.position.set(120, 72, 95);
  scene.add(rim);

  // strong fill from the camera side (south) so structures read toward the viewer
  const coldFill = new THREE.DirectionalLight(0x9cc0ff, 1.05);
  coldFill.position.set(0, 60, 180);
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

  // ----- cinematic post stack -----
  // bloom (only bright sources glow) -> filmic night grade (teal-shadow / warm-
  // highlight tone, S-curve, saturation, vignette, animated grain). Progressive
  // enhancement: any TSL/post failure drops to a plain direct render so a shader
  // problem can never blank the playable field.
  const grainTime = uniform(0); // bumped each frame to animate the grain
  let post = null;
  // the grade (tone, vignette, grain) is cheap and always applied for a uniform
  // cinematic look; bloom is layered in only when the fidelity dial allows it.
  try {
    post = new THREE.PostProcessing(renderer);
    const scenePass = pass(scene, camera);
    let lit = scenePass;
    if (fq.bloom) {
      // tighter threshold + softer strength: braziers, muzzle flashes, floodlights
      // and the moon bloom; the snow field and walls stay crisp.
      lit = scenePass.add(bloom(scenePass, 0.62, 0.5, 0.62));
    }
    post.outputNode = nightGrade(lit, grainTime);
  } catch (e) { console.warn('[WF] post unavailable — direct render', e); post = null; }

  async function render() {
    grainTime.value = (performance.now ? performance.now() : Date.now()) * 0.001;
    if (post) {
      try { await post.renderAsync(); return; }
      catch (e) { console.warn('[WF] post render failed — falling back', e); post = null; }
    }
    await renderer.renderAsync(scene, camera);
  }

  return { renderer, scene, camera, sun, render, setSize, backend, fidelity };
}

// filmic night grade as a TSL node: shadow/highlight split-tone, a gentle
// contrast S-curve, mild saturation lift, vignette and very low animated grain.
// Built defensively — the whole thing is wrapped at the call site in try/guard.
function nightGrade(input, t) {
  return Fn(() => {
    const src = input.rgb;
    let c = clamp(src, 0.0, 4.0);

    // split-tone: push cool teal/blue into the shadows, warm the highlights so
    // the night reads moody rather than a flat grey. blend by luminance.
    const lum = luminance(c);
    const shadowTint = vec3(0.78, 0.96, 1.18); // cool blue shadows
    const highTint   = vec3(1.10, 1.01, 0.86); // warm highlights
    const tint = mix(shadowTint, highTint, smoothstep(0.04, 0.62, lum));
    c = c.mul(tint);

    // lift / gamma / gain — lift the deep shadows a touch so detail survives,
    // pull a soft contrast S-curve through the mids, keep highlights from clipping
    c = c.add(vec3(0.012, 0.016, 0.026)); // lift (slightly blue)
    c = pow(c.max(vec3(0.0)), vec3(0.94)); // gamma: open mids
    // S-curve contrast around 0.5
    const x = clamp(c, 0.0, 1.0);
    const scurve = x.mul(x).mul(x.mul(-2.0).add(3.0)); // smoothstep(0,1,x)
    c = mix(c, scurve, float(0.34));

    // saturation: gentle boost, computed against perceptual luma
    const g = luminance(c);
    c = mix(vec3(g), c, float(1.16));

    // vignette — subtle darkened corners
    const p = uv().sub(vec2(0.5, 0.5));
    const vig = smoothstep(0.92, 0.32, dot(p, p).mul(2.0));
    c = c.mul(mix(float(0.82), float(1.0), vig));

    // film grain — very low amplitude animated noise so flat darks don't band
    const seed = dot(uv().mul(vec2(640.0, 360.0)), vec2(12.9898, 78.233)).add(t.mul(57.0));
    const grain = fract(sin(seed).mul(43758.5453)).sub(0.5);
    c = c.add(grain.mul(0.022));

    return vec4(c.max(vec3(0.0)), input.a);
  })();
}
