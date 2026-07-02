# TIER 2: WebGPU + real-asset graphics rewrite

User-approved plan (2026-07-02). Goal: the most beautiful the browser allows —
three.js WebGPURenderer/TSL + scanned PBR assets. Winterfell (this repo) already
runs three@0.180 WebGPU, proving the stack works here.

## Research facts (verified 2026-07-02)

- Migration is `import * as THREE from 'three/webgpu'` + `new THREE.WebGPURenderer()`
  + **`await renderer.init()`** (forgetting the await = black screen, no error).
  WebGL2 auto-fallback covers browsers without WebGPU (~95% have it).
- **EffectComposer does NOT exist on WebGPURenderer.** Post = `PostProcessing` +
  TSL node passes. Native passes exist in r180: **GTAO, TRAA (temporal AA), SSGI**
  (`webgpu_postprocessing_ssgi` example), bloom, DOF.
- **All `ShaderMaterial`s and `onBeforeCompile` hooks must be rewritten in TSL**
  (JS-based shader nodes; compiles to WGSL + GLSL). Our custom list: sky dome,
  grade pass (aerial perspective etc.), grass wind, frostable snow/wet, deathlit rim,
  pond water, canopy shafts material, muzzle tracers (LineBasicMaterial ok).
- **CSM shadows on WebGPU**: use `CSMShadowNode` (WebGL-only `CSM` class won't work).
  Official example: `webgpu_shadowmap_csm`.
- **TSL has a built-in `triplanarTexture` node** — terrain splatting is first-class.
- **Poly Haven**: all CC0, public API at api.polyhaven.com for programmatic download
  (textures/models/HDRIs, pick resolution). Use 2K WebP/JPG for web.
- **ambientCG**: CC0 PBR textures, also has an API.
- **Megascans/Fab**: new Fab Standard License allows non-UE use for assets acquired
  on Fab; LEGACY Quixel assets remain UE-only. Prefer Poly Haven/ambientCG (CC0, zero
  ambiguity); Fab free-tier assets are an option where quality demands it.
- **Asset pipeline**: gltf-transform CLI → Draco mesh compression (50-80% smaller) +
  KTX2/Basis textures (stay compressed on GPU, ~10x VRAM saving). three needs
  DRACOLoader + KTX2Loader wired into GLTFLoader.
- **Foliage at scale**: InstancedMesh + BVH culling; octahedral impostors for far
  trees (three.js forum has working implementations); meshopt LODs mid-range.
- **Tier 3 reference price**: UE5 pixel streaming ≈ $0.50–1.00 per concurrent user
  per hour on managed platforms. Not pursued.

## Phases (each = commits + screenshot QA; game stays playable throughout)

### Phase A — version jump, still WebGL (de-risk in isolation)
1. Bump import map three@0.160 → 0.180 (keep WebGLRenderer + EffectComposer, both
   still exist in r180). Fix API breakages (check Migration Guide 160→180).
2. Run full harness suite (smoke x3, soak, saveload, campflow, bastnet, zombieshots).
3. Commit. THE GAME MUST BE FULLY GREEN BEFORE PHASE B.

### Phase B — renderer swap
1. `three/webgpu` import map entry; `WebGPURenderer`; async boot (`await init()`).
2. Delete EffectComposer stack; minimal `PostProcessing` with render+output.
3. Port custom shaders to TSL one at a time, procedural fallback first:
   sky dome → TSL nodes; grade/aerial pass → TSL post node; grass wind →
   `positionNode` offset; frostable/wet/deathlit → material color/roughness nodes.
4. Shadows → `CSMShadowNode` (3 cascades, whole-terrain crisp shadows).
5. Post stack: native GTAO → TRAA → bloom → custom grade → SSGI last (perf-gated).
6. QA harnesses must pass on BOTH backends (Chrome WebGPU + forced WebGL fallback
   — winterfell's dual-backend harness pattern is the template).

### Phase C — real assets (the beauty payload)
1. HDRI sky + IBL: Poly Haven dusk/golden HDRIs (2K), PMREM env; keep procedural
   sky dome for night/weather blend or swap by time-of-day.
2. Terrain: TSL triplanarTexture splat of 3-4 Poly Haven ground sets
   (mud/forest floor/rocky dirt/road gravel) blended by slope/height/moisture noise
   + existing vertex-paint as macro tint. 2K KTX2.
3. Trees: Poly Haven scanned tree GLBs (2-3 species), InstancedMesh + impostor
   billboards past 60m; kill the box trees.
4. Buildings/props: Sketchfab CC0 WW1 packs (verify per-asset license before
   download; "Low Poly WW1 Trenches" 40-model pack is a candidate) + more Poly
   Haven props; gltf-transform Draco+KTX2 everything into assets/models/.
5. Characters keep zombies_pack/Soldier; weapons keep sniper; re-audit scar.
6. LUT color grade to taste.

## Working rules
- Branch stays winterfell-first-assault (other session is active — tight commits).
- Screenshot-verify every step (biomeshots/zombieshots/allyshot/menushot on 5180).
- Perf gate: frameAvg tracking must stay ≤ current +20% on M-series; dynamic-res
  logic must keep working.
- QA harnesses are the regression net — run after every phase step.
