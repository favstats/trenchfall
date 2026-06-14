# The Long Night — Slice 1: The First Assault

**Date:** 2026-06-14
**Status:** Approved (design), ready for implementation plan
**Working title:** THE LONG NIGHT (game) · *The First Assault* (this slice)

## Premise

Inspired by — not a copy of — the tactical-briefing video *"1000 Modern Troops vs 100,000
Undead — Tactical Analysis of Winterfell."* You command a small modern British force
holding the field before Winterfell's outer wall as the first wave of the dead breaks
against you. A handful of men with rifles, machine guns and fire support against a tide
that does not stop, does not fear, and grows every time one of your own falls.

The target feel is **Gates of Hell / Men of War**: an angled real-time-tactical view,
direct command of squads, and the ability to drop into a single soldier and fight by hand.
The target look is **as close to modern/"UE5-ish" as a browser allows**: three.js on the
**WebGPU** renderer with a full post stack. Not literally Unreal — that is honest — but
"this is running in a tab?" territory.

## Goals for Slice 1

A single, complete, replayable engagement that proves the **engine** and the **feel**
end to end:

1. It looks genuinely modern (PBR, shadows, ambient occlusion, bloom, tone-mapped + graded).
2. It shows a horde that *reads* as overwhelming (tens of thousands apparent).
3. It plays like a tactical RTS: select, order, and possess units.
4. It has a real win/lose loop with tension (reanimation of the fallen).

Everything else in the larger game is explicitly out of this slice.

## Non-goals (later slices)

- Trench / obstacle placement phase before the battle.
- Multiple escalating phases across a night.
- The Night King decapitation objective and the wider Winterfell interior.
- The animated "PowerPoint briefing" framing between phases.
- GPU-compute crowd simulation (architecture leaves room; slice 1 uses CPU-driven
  instancing + a far-field impostor crowd — see Horde below).

## Tech & structure

- **Isolated from the existing games.** The current trenchfall/kestrel games load
  three@0.160 from a CDN importmap. This game gets its **own page + its own importmap**
  pinned to **three@0.180.0** (WebGPU build), so nothing existing is touched and there is
  no `node_modules` upgrade.
- **Entry:** `winterfell.html` — a thin shell (canvas + HUD DOM + importmap) that loads
  `winterfell/main.js`.
- **Code lives in `winterfell/`** as focused ES modules (not one giant file):
  - `main.js` — boot, game loop, wiring.
  - `engine/renderer.js` — WebGPU renderer + WebGL2 fallback, post stack, fidelity dial.
  - `engine/input.js` — mouse/keyboard, drag-box, picking.
  - `world/field.js` — terrain, the wall, props, lighting, sky.
  - `units/squads.js` — British units, selection, orders, formation, AI.
  - `units/soldier.js` — single-soldier model, animation, weapon, direct-control.
  - `horde/horde.js` — instanced undead, LOD tiers, advance/flock, spawning, reanimation.
  - `combat/combat.js` — firing, ballistics/hit resolution, suppression, casualties.
  - `ui/hud.js` — selection panel, orders, call-ins, wave/objective readout.
  - `game/state.js` — scenario config, win/lose, timers, fidelity setting.
- **Renderer:** `three/webgpu` `WebGPURenderer`. On `navigator.gpu` absence, fall back to
  WebGL2 with a reduced horde cap and lighter post.
- **Importmap (confirmed against the CDN):**
  ```json
  {"imports":{
    "three":"https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.webgpu.js",
    "three/webgpu":"https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.webgpu.js",
    "three/tsl":"https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.tsl.js",
    "three/addons/":"https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/"}}
  ```
- Served by the existing vite dev server (`npm run dev`) like the other `.html` pages.

## The horde (the signature engineering problem)

100,000 individually-animated skeletons is not renderable anywhere. We fake the *read* of a
vast tide with three LOD tiers, switched by distance from camera:

- **Near** — fully animated, lit, instanced undead meshes (the ones you actually fight).
- **Mid** — cheap instanced low-poly figures, simple shamble animation in the vertex stage.
- **Far** — an **impostor / billboard crowd** (camera-facing textured quads, instanced and
  jittered) reading as a seething mass on the horizon.

Slice 1 drives positions **on the CPU** with a spatial grid (cap on High ~3–4k live agents)
plus the far-field impostor field for the "tens of thousands" silhouette. The module
interface (`horde.update(dt)`, position/state buffers) is written so a later slice can swap
the CPU updater for a **WebGPU compute** updater without touching consumers.

**Behaviour:** the dead advance toward the wall as a pressure field, clump toward the
nearest living, and pile at obstacles. Mindless, relentless, no ranged attack — they kill
in melee at the line.

## Controls (Gates-of-Hell feel)

- **Camera:** angled tactical view. Edge-scroll + WASD pan, wheel zoom, Q/E (or MMB-drag)
  rotate. Clamped to the battlefield.
- **Selection:** left-click a unit; left-drag a selection box for many; double-click selects
  all of a type. Shift adds.
- **Orders (right-click context):** move, attack-move, hold position, hold fire / open fire,
  fall back. Issued to the current selection.
- **Direct control — `F`:** possess the selected soldier. Camera pulls to an over-shoulder
  follow; WASD moves, mouse aims, LMB fires, R reloads. `F` again or `Esc` releases back to AI.
- **Call-ins (limited charges):** one **mortar/artillery** strike (click a target zone) and
  one **reserve squad** drop. Cooldown/one-shot for the slice.

## Combat model

- British units: 3–4 **rifle squads** (4–6 men each) + one **MG team**. Each soldier has
  ammo, a reload cycle, a weapon with range/accuracy/RoF, and a simple aim/fire state machine.
- **Suppression:** sustained nearby misses degrade enemy accuracy/speed (mostly relevant
  later vs. living; for the dead it mostly just thins them).
- **Hit resolution:** hitscan with falloff + spread (cheap, reliable). Visible tracers,
  muzzle flash, impact puffs, blood, ragdoll-lite topple on death.
- **Reanimation (core mechanic):** a British soldier killed in melee drops, and after a few
  seconds **rises as an undead** and joins the horde. Losing men compounds — the central
  dread of the Winterfell scenario.

## Win / lose

- **Win:** survive the wave — a timer of sustained assault, or breaking the horde below a
  threshold, whichever the scenario sets.
- **Lose:** the dead breach the wall line (reach the gate) **or** all British squads are
  destroyed.
- Post-battle readout: held/overrun, time survived, confirmed kills, men lost (and how many
  rose against you).

## Fidelity dial

A **Low / Medium / High** setting (auto-picked from a quick capability probe, user-overridable)
controls: horde cap, shadow-map resolution, AO on/off, bloom quality, impostor density, and
WebGPU-vs-WebGL path. Guarantees the showcase on capable hardware and a running game elsewhere.

## Architecture principles

Each module has one purpose and a narrow interface: `renderer` knows nothing about units;
`horde` exposes update + buffers, not internals; `combat` operates on unit/horde handles, not
their meshes. This keeps files small enough to reason about and lets later slices extend
without rewrites.

## Risks & mitigations

- **WebGPU/TSL API churn** (r180) — keep to stable renderer + standard materials; isolate any
  TSL/node-material use behind small helpers; WebGL2 fallback always available.
- **Horde performance** — strict LOD + instancing + spatial grid; the fidelity dial is the
  release valve; far field is impostors, never real agents.
- **Building partly blind** — verify each milestone boots headless via a playwright shot
  script (mirrors the repo's existing `*-shot.mjs` QA harness) before moving on.

## Definition of done (Slice 1)

`npm run dev` → open `winterfell.html` → an angled view of Winterfell's wall and field; a
horde advances; you select and order British squads, possess one with `F` and fire by hand,
call in a mortar; men die and rise; the engagement resolves to a held/overrun screen. Runs
on WebGPU with a clean WebGL2 fallback, and boots clean in the headless QA shot.
