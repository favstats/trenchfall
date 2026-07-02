// renderer.js — forward WebGL + the tape. The VHS pass is the whole aesthetic:
// barrel distortion, chromatic bleed that worsens toward the edges, scanlines,
// animated grain, a wandering tracking tear, head-switching noise at the frame
// bottom, and a soft bloom underneath so the fluorescents smear like they do
// on a 1998 camcorder. Progressive: composer failure -> plain render.
import * as THREE from './three.js';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/postprocessing/OutputPass.js';

const VHSShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uSkip: { value: 0 },       // 0..1 — the tape damage burst on entity contact
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uSkip;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
      // barrel distortion — the cheap wide lens
      vec2 cc = vUv - 0.5;
      float r2 = dot(cc, cc);
      vec2 uv = vUv + cc * r2 * 0.16;

      // tracking tear: a band that wanders up the frame every few seconds
      float tearY = fract(uTime * 0.13);
      float tear = smoothstep(0.012, 0.0, abs(uv.y - tearY)) * (0.55 + 0.45 * sin(uTime * 31.0));
      uv.x += tear * 0.05 * (hash(vec2(uv.y * 100.0, floor(uTime * 24.0))) - 0.5) * 4.0;

      // tape skip (entity contact): the whole frame shears and jitters
      uv.x += uSkip * (hash(vec2(floor(uv.y * 40.0), floor(uTime * 60.0))) - 0.5) * 0.3;
      uv.y += uSkip * (hash(vec2(floor(uTime * 90.0), 7.0)) - 0.5) * 0.12;

      // chromatic bleed, worse off-centre
      float ca = 0.0016 + r2 * 0.012 + uSkip * 0.02;
      float rC = texture2D(tDiffuse, uv + vec2(ca, 0.0)).r;
      float gC = texture2D(tDiffuse, uv).g;
      float bC = texture2D(tDiffuse, uv - vec2(ca, 0.0)).b;
      vec3 c = vec3(rC, gC, bC);

      // VHS luma lift + slight desaturation, warm cast
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(c, vec3(l), 0.22);
      c = c * vec3(1.04, 1.0, 0.92) + vec3(0.035, 0.03, 0.02);

      // scanlines + grain
      c *= 0.92 + 0.08 * sin(uv.y * 720.0);
      c += (hash(uv * vec2(1280.0, 720.0) + fract(uTime) * 100.0) - 0.5) * 0.075;
      c += tear * 0.25;

      // head-switching noise at the very bottom of the frame
      if (uv.y < 0.015) c = vec3(hash(vec2(uv.x * 200.0, floor(uTime * 30.0)))) * 0.7;

      // vignette
      c *= 1.0 - r2 * 0.65;

      // hard white noise while the tape is skipping
      c = mix(c, vec3(hash(uv * 900.0 + uTime * 120.0)), uSkip * 0.55);

      gl_FragColor = vec4(c, 1.0);
    }`,
};

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.08, 320);

  let composer = null, vhs = null;
  try {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.7, 0.72));
    vhs = new ShaderPass(VHSShader);
    composer.addPass(vhs);
    composer.addPass(new OutputPass());
  } catch (e) { console.warn('[NC] post unavailable — direct render', e); composer = null; }

  let skip = 0;
  function tapeSkip(n = 1) { skip = Math.min(1, skip + n); }

  function setSize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer && composer.setSize(window.innerWidth, window.innerHeight);
  }

  function render(dt) {
    if (vhs) {
      vhs.uniforms.uTime.value += dt;
      skip = Math.max(0, skip - dt * 1.6);
      vhs.uniforms.uSkip.value = skip;
    }
    if (composer) {
      try { composer.render(); return; }
      catch (e) { console.warn('[NC] post render failed — falling back', e); composer = null; }
    }
    renderer.render(scene, camera);
  }

  return { renderer, scene, camera, setSize, render, tapeSkip };
}
