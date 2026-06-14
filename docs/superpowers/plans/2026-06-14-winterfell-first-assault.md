# The First Assault — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable Gates-of-Hell-style vertical slice — command modern British squads holding Winterfell's wall against an advancing undead horde, with direct-control, fire support, casualties that reanimate, and a win/lose resolution — rendered with three.js WebGPU.

**Architecture:** A standalone page (`winterfell.html`) with its own importmap pinned to three@0.180.0 (WebGPU build), isolated from the existing trenchfall/kestrel games. Code is split into focused ES modules under `winterfell/` (renderer, input, world, units, horde, combat, ui, state). The horde uses 3 LOD tiers (near animated / mid instanced / far impostor) driven by a CPU spatial-grid updater behind an interface that a later slice can swap for WebGPU compute.

**Tech Stack:** three.js 0.180 (`three/webgpu`, `three/tsl`, addons), WebGPU renderer with WebGL2 fallback, vite dev server, playwright headless QA shot.

**Verification model:** No pytest-style unit tests — this is a renderer. Each milestone is verified by `scripts/winterfell-shot.mjs` (playwright): boot the page on the vite dev server, wait for a `window.WF.ready` signal, assert zero uncaught/console errors, and write a screenshot to `dist/shots/`. Headless Chromium may lack WebGPU, so the page MUST boot on the WebGL2 fallback; the shot validates the fallback path and JS health. Commit after each milestone.

---

## File Structure

- Create: `winterfell.html` — shell: canvas, HUD DOM, importmap, loads `winterfell/main.js`.
- Create: `winterfell/main.js` — boot, RAF loop, module wiring, exposes `window.WF`.
- Create: `winterfell/engine/renderer.js` — WebGPU/WebGL2 renderer, post stack, fidelity dial, resize.
- Create: `winterfell/engine/input.js` — pointer/keyboard, drag-box, raycast picking, camera rig.
- Create: `winterfell/world/field.js` — terrain, outer wall + gate, props, sky, lights.
- Create: `winterfell/units/soldier.js` — one soldier: mesh, anim, weapon, aim/fire state.
- Create: `winterfell/units/squads.js` — squad container, selection, orders, formation, AI.
- Create: `winterfell/horde/horde.js` — instanced undead, LOD tiers, advance/flock, spawn, reanimate.
- Create: `winterfell/combat/combat.js` — firing, hit resolution, fx, suppression, melee at line.
- Create: `winterfell/ui/hud.js` — selection panel, orders, call-ins, wave/objective readout, end screen.
- Create: `winterfell/game/state.js` — scenario config, timers, win/lose, fidelity setting.
- Create: `winterfell/css/winterfell.css` — HUD + overlay styling.
- Create: `scripts/winterfell-shot.mjs` — playwright headless boot + screenshot QA.

---

## Milestone 0: Shell + renderer boots

**Files:** Create `winterfell.html`, `winterfell/main.js`, `winterfell/engine/renderer.js`, `winterfell/css/winterfell.css`, `scripts/winterfell-shot.mjs`.

- [ ] **Step 1: `winterfell.html`** — `<canvas id="gl">`, HUD root `<div id="hud">`, importmap (three@0.180.0 webgpu/tsl/addons as in the spec), `<script type="module" src="winterfell/main.js">`, link the css.
- [ ] **Step 2: `engine/renderer.js`** — export `createRenderer(canvas)`: probe `navigator.gpu`; build `WebGPURenderer` (or WebGL2 fallback), ACES tone mapping + exposure, sRGB output, shadow map on; a `PerspectiveCamera`; a `Scene` with hemi + directional (shadow-casting) light and a sky/fog; a post chain (bloom; AO/extra only on High). Return `{renderer, scene, camera, render(), setSize(), fidelity}`. Detect fidelity from a quick probe (gpu present + devicePixelRatio).
- [ ] **Step 3: `main.js`** — create renderer, add a temporary lit ground plane + a few boxes so there's something to see, start a RAF loop calling `render()`, handle resize, set `window.WF = { ready:false, ... }` and flip `ready=true` after first frame.
- [ ] **Step 4: `scripts/winterfell-shot.mjs`** — spawn `vite --host 127.0.0.1 --port 5184`, launch playwright chromium, goto `winterfell.html`, wait for `window.WF.ready`, collect `page.on('console'/'pageerror')`, screenshot to `dist/shots/winterfell-m0.png`, exit nonzero on any error.
- [ ] **Step 5: Run the shot.** `node scripts/winterfell-shot.mjs` → Expected: exits 0, "no errors", screenshot shows the lit ground + boxes (WebGL2 fallback in headless is fine).
- [ ] **Step 6: Commit.** `git add winterfell.html winterfell/ scripts/winterfell-shot.mjs && git commit -m "winterfell M0: WebGPU renderer shell boots clean"`

## Milestone 1: World + tactical camera

**Files:** Create `winterfell/world/field.js`, `winterfell/engine/input.js`. Modify `main.js`.

- [ ] **Step 1: `world/field.js`** — export `buildField(scene)`: snow ground (large plane, subtle noise normal/rough), Winterfell **outer wall** (long segmented stone wall with a central **gate**) along the north edge, scattered props (rocks, broken stakes, banners), graded snowy sky + fog, godswood treeline silhouette. Return handles `{wall, gate, gateLine (z), bounds}`.
- [ ] **Step 2: `engine/input.js`** — export `makeCameraRig(camera, dom, bounds)`: angled RTS view; WASD/edge-scroll pan, wheel zoom (clamped), Q/E or MMB-drag rotate, all clamped to `bounds`. Export `makePicker(camera, renderer)` for ground-plane raycast + object pick (used later).
- [ ] **Step 3: wire into `main.js`** — replace temp boxes with `buildField`, attach camera rig, update rig each frame.
- [ ] **Step 4: Run the shot** (`-m1`). Expected: exits 0; screenshot shows the wall/gate, snow field, sky.
- [ ] **Step 5: Commit.** `git commit -am "winterfell M1: Winterfell field, wall+gate, tactical camera"`

## Milestone 2: British squads — select & order

**Files:** Create `winterfell/units/soldier.js`, `winterfell/units/squads.js`, `winterfell/ui/hud.js`, `winterfell/game/state.js`. Modify `main.js`, `input.js`, `css`.

- [ ] **Step 1: `units/soldier.js`** — export `Soldier`: low-poly modern infantryman (instanced-friendly mesh or shared geometry), helmet+rifle silhouette, walk/idle/aim/fire/dead states, `update(dt)`, `moveTo(target)`, `pos`, `alive`. Keep it cheap; reuse one geometry/material set.
- [ ] **Step 2: `units/squads.js`** — export `createForce(scene, state)` spawning 3 rifle squads (5 men) + 1 MG team along the wall; `Squad` holds members, `selected`, formation spread, and an order: `MOVE|ATTACK_MOVE|HOLD|FALL_BACK`, `holdFire`. `update(dt)` steps members toward formation slots / orders.
- [ ] **Step 3: selection + orders in `input.js`/`main.js`** — left-click pick a squad, left-drag box selects squads whose units intersect, shift-add; right-click on ground = move/attack-move; hotkeys H (hold), Z (hold fire toggle), X (fall back).
- [ ] **Step 4: `ui/hud.js` + `game/state.js`** — state holds scenario config, fidelity, timers, counts. HUD shows selected squads, current order, men remaining, and a wave/objective banner. `game/state.js` exports `GameState`.
- [ ] **Step 5: Run the shot** (`-m2`) + add `window.WF.test` helpers (selectAll, orderMove) so the shot can drive a selection and confirm units move. Expected: exits 0; screenshot shows squads on the wall line.
- [ ] **Step 6: Commit.** `git commit -am "winterfell M2: British squads, selection, orders, HUD"`

## Milestone 3: The horde — instanced, LOD, advancing

**Files:** Create `winterfell/horde/horde.js`. Modify `main.js`, `state.js`.

- [ ] **Step 1: `horde/horde.js`** — export `Horde(scene, state, field)`. Three `InstancedMesh` tiers: near (animated, shaded), mid (low-poly), far (camera-facing impostor quads). A flat agent array `{x,z,vx,vz,state,tier}`; `spawnWave(n, fromZ)`; `update(dt)` advances agents toward the gate line as a pressure field + light separation via a spatial grid; assigns tier by camera distance and writes instance matrices; cap by fidelity (High ~3–4k live + far impostors). Expose `agents`, `count`, `nearestTo(x,z)`.
- [ ] **Step 2: spawn the first wave** from `main.js` at the field's south edge; horde advances on the wall.
- [ ] **Step 3: Run the shot** (`-m3`). Expected: exits 0; screenshot shows a mass of undead advancing across the field.
- [ ] **Step 4: Commit.** `git commit -am "winterfell M3: instanced LOD horde advancing on the wall"`

## Milestone 4: Combat — fire, casualties, melee

**Files:** Create `winterfell/combat/combat.js`. Modify `squads.js`, `soldier.js`, `horde.js`, `main.js`.

- [ ] **Step 1: `combat/combat.js`** — export `Combat(scene, force, horde, state)`. Each living soldier (unless holdFire) acquires nearest in-range agent, fires on its RoF: hitscan with spread+falloff → kill agent (topple anim + remove after delay), spawn tracer + muzzle flash + blood/impact fx (instanced/pooled). MG team = higher RoF, cone suppression that slows agents. Agents reaching the wall line do **melee**: damage nearest soldier; soldier with 0 hp → dead.
- [ ] **Step 2: wire `Combat.update(dt)`** into the loop after force/horde updates; counters (kills, men lost) into state/HUD.
- [ ] **Step 3: Run the shot** (`-m4`), drive a few seconds so tracers/kills happen. Expected: exits 0; screenshot shows muzzle flashes/tracers/bodies.
- [ ] **Step 4: Commit.** `git commit -am "winterfell M4: ballistic combat, casualties, melee at the line"`

## Milestone 5: Direct control + call-ins

**Files:** Modify `input.js`, `soldier.js`, `combat.js`, `ui/hud.js`, `main.js`.

- [ ] **Step 1: possession (`F`)** — `F` on a selected soldier enters direct control: camera to over-shoulder follow, WASD move that soldier, mouse aims, LMB fires through the same combat hit path, R reloads; `F`/`Esc` releases to AI. Suspend RTS camera while possessed.
- [ ] **Step 2: call-ins** — HUD buttons + keys: **mortar** (one charge: click a zone → delayed explosion killing agents in radius + fx) and **reserve squad** (one charge: spawn a fresh rifle squad at the gate). Track charges in state.
- [ ] **Step 3: Run the shot** (`-m5`), exercise possess + mortar via `window.WF.test`. Expected: exits 0.
- [ ] **Step 4: Commit.** `git commit -am "winterfell M5: direct-control possession + mortar/reserve call-ins"`

## Milestone 6: Reanimation + win/lose + end screen

**Files:** Modify `horde.js`, `squads.js`, `combat.js`, `game/state.js`, `ui/hud.js`, `main.js`.

- [ ] **Step 1: reanimation** — when a soldier dies, after `REANIM_DELAY` (~4s) spawn an undead agent at the body's position via `horde.spawnFromBody(x,z)`; HUD tallies "rose against you."
- [ ] **Step 2: win/lose** — lose if any agent crosses the gate line OR all squads destroyed; win if wave survived for `state.waveDuration` or horde count breaks below threshold. Show end overlay (HELD / OVERRUN + stats: time, kills, men lost, men risen).
- [ ] **Step 3: Run the shot** (`-m6`), force a quick win/lose via `window.WF.test` to confirm the overlay. Expected: exits 0; screenshot shows end overlay.
- [ ] **Step 4: Commit.** `git commit -am "winterfell M6: reanimation, win/lose, end screen"`

## Milestone 7: Fidelity dial, polish, final QA

**Files:** Modify `renderer.js`, `hud.js`, `state.js`, `README`/`PLAY.md`. Update `scripts/winterfell-shot.mjs`.

- [ ] **Step 1: fidelity dial** — Low/Med/High toggle in HUD (auto-probed default) adjusting horde cap, shadow res, AO/bloom, impostor density, pixel ratio; persists to localStorage.
- [ ] **Step 2: polish pass** — muzzle/blood pooling, death topple, camera feel, fog/grade, HUD readability; ensure WebGL2 fallback path is visually acceptable.
- [ ] **Step 3: doc** — add a "THE LONG NIGHT" entry to `PLAY.md`/`README.md` with controls + how to run.
- [ ] **Step 4: full QA shot** at all fidelity levels + assert no errors; capture final screenshot.
- [ ] **Step 5: Commit.** `git commit -am "winterfell M7: fidelity dial, polish, docs, final QA"`

---

## Self-review notes

- **Spec coverage:** renderer/WebGPU+fallback (M0), field/wall/camera (M1), squads/select/orders + Gates-of-Hell control later (M2,M5), horde LOD (M3), combat+suppression+reanimation (M4,M6), call-ins (M5), win/lose+readout (M6), fidelity dial (M7), QA harness (every M). All spec sections map to tasks.
- **Verification adaptation** is explicit and matches the repo's existing `*-shot.mjs` pattern rather than inventing pytest tests for a renderer.
- **Interface consistency:** `horde.spawnWave`/`spawnFromBody`/`nearestTo`, `createForce`, `Combat.update`, `makeCameraRig`/`makePicker`, `GameState` used consistently across tasks.
- **Risk:** headless WebGPU absence is handled by requiring the WebGL2 fallback to boot (M0 verification).
