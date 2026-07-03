// floors.js — the collapsed structure, one floor at a time. Every floor is a
// hull room with its own broken gravity, filled with real rigid bodies:
// crate stacks, girder ramps, drum piles — ammunition for the tether. Clearing
// the strays opens the floor hatch; you descend by falling through it.
import * as THREE from './engine/three.js';

export const GRAVITIES = [
  { name: 'STANDARD SPIN', g: { x: 0, y: -9.81, z: 0 }, tint: 0x2a3442 },
  { name: 'LOW SPIN', g: { x: 0, y: -3.2, z: 0 }, tint: 0x24303e },
  { name: 'HEAVY SPIN', g: { x: 0, y: -17, z: 0 }, tint: 0x322a2a },
  { name: 'LISTING 12°', g: { x: 2.4, y: -9.3, z: 0 }, tint: 0x2c3038 },
  { name: 'SPIN DECAY', g: { x: 0, y: -6, z: 0 }, tint: 0x28323a, pulse: true },
];

const ROOM = 34, WALL_H = 9;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createFloors(scene, phys) {
  const mats = {
    hull: new THREE.MeshStandardMaterial({ color: 0x2c3644, roughness: 0.85, metalness: 0.3 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x232c38, roughness: 0.9, metalness: 0.25 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x7a6234, roughness: 0.8 }),
    crate2: new THREE.MeshStandardMaterial({ color: 0x4e6070, roughness: 0.75, metalness: 0.4 }),
    drum: new THREE.MeshStandardMaterial({ color: 0x7a3a2a, roughness: 0.6, metalness: 0.5 }),
    girder: new THREE.MeshStandardMaterial({ color: 0x5a646e, roughness: 0.55, metalness: 0.7 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xff9a4a }),
    hatch: new THREE.MeshBasicMaterial({ color: 0x3aff8a }),
  };

  let staticMeshes = [];      // non-physics dressing to clean per floor
  let hatch = null, hatchOpen = false;
  let beacon = null;
  let strip = [];

  function clearFloor() {
    phys.clearDynamic();
    for (const m of staticMeshes) scene.remove(m);
    staticMeshes = [];
    hatch = null; hatchOpen = false; beacon = null; strip = [];
  }

  // one floor: sealed room + contents. Returns spawn points + hatch info.
  function build(depth, rnd = mulberry(1000 + depth * 77)) {
    clearFloor();
    const G = GRAVITIES[Math.min(depth, 99) % GRAVITIES.length];
    phys.setGravity({ ...G.g });

    // shell: floor, ceiling, four walls (fixed bodies with meshes)
    phys.box(0, -0.5, 0, ROOM + 8, 1, ROOM + 8, { fixed: true, mat: mats.floor, kind: 'permanent_floor' });
    phys.box(0, WALL_H + 0.5, 0, ROOM + 8, 1, ROOM + 8, { fixed: true, mat: mats.hull, kind: 'permanent_floor' });
    for (const [x, z, sx, sz] of [
      [0, -ROOM / 2 - 2, ROOM + 8, 1.2], [0, ROOM / 2 + 2, ROOM + 8, 1.2],
      [-ROOM / 2 - 2, 0, 1.2, ROOM + 8], [ROOM / 2 + 2, 0, 1.2, ROOM + 8],
    ]) phys.box(x, WALL_H / 2, z, sx, WALL_H, sz, { fixed: true, mat: mats.hull, kind: 'permanent_floor' });

    // emergency light strips — the room's pulse
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(6, 0.14, 0.14), mats.glow.clone());
      s.position.set((i % 2 ? -1 : 1) * ROOM / 3, WALL_H - 0.6, (i < 2 ? -1 : 1) * (ROOM / 2 + 1.2));
      scene.add(s); staticMeshes.push(s); strip.push(s);
      const l = new THREE.PointLight(0xff9a4a, 5, 18, 1.8);
      l.position.copy(s.position).y -= 1;
      scene.add(l); staticMeshes.push(l);
    }
    const coolLight = new THREE.PointLight(0x8ab4d8, 16, 44, 1.4);
    coolLight.position.set(0, WALL_H - 1, 0);
    scene.add(coolLight); staticMeshes.push(coolLight);

    // ---- contents: mass to weaponize ----
    const spawnPts = [];
    const stacks = 3 + (rnd() * 3 | 0);
    for (let s = 0; s < stacks; s++) {
      const cx = (rnd() - 0.5) * (ROOM - 10), cz = (rnd() - 0.5) * (ROOM - 10);
      const w = 2 + (rnd() * 2 | 0), h = 2 + (rnd() * 3 | 0);
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        const sz = 1 + rnd() * 0.5;
        phys.box(cx + xx * 1.3 - w * 0.6, 0.7 + yy * 1.35, cz + (rnd() - 0.5) * 0.2,
          sz, sz, sz, { mat: rnd() < 0.5 ? mats.crate : mats.crate2, density: 0.8 });
      }
      spawnPts.push({ x: cx, z: cz });
    }
    // drums (heavy, satisfying) + a girder or two (long levers)
    for (let i = 0; i < 4 + (rnd() * 3 | 0); i++) {
      const rec = phys.ball((rnd() - 0.5) * (ROOM - 8), 1.2, (rnd() - 0.5) * (ROOM - 8), 0.55 + rnd() * 0.25, { mat: mats.drum, density: 3 });
      rec.mesh.scale.y = 1.35;
    }
    for (let i = 0; i < 2; i++) {
      phys.box((rnd() - 0.5) * (ROOM - 12), 2.4 + i, (rnd() - 0.5) * (ROOM - 12), 6.5, 0.4, 0.7, { mat: mats.girder, density: 2.2 });
    }

    // the hatch: sealed until the floor is clear
    const hx = (rnd() - 0.5) * (ROOM - 14), hz = (rnd() - 0.5) * (ROOM - 14);
    hatch = { x: hx, z: hz, r: 2.2 };
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.7, 24), new THREE.MeshBasicMaterial({ color: 0xff5040, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(hx, 0.03, hz);
    scene.add(ring); staticMeshes.push(ring);
    hatch.ring = ring;

    // a beacon on some floors — the recordings that keep you descending
    if (depth % 2 === 1) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.2, 8),
        new THREE.MeshStandardMaterial({ color: 0x3a4a3a, emissive: 0x2aff8a, emissiveIntensity: 0.6 }));
      const bx = (rnd() - 0.5) * (ROOM - 12), bz = (rnd() - 0.5) * (ROOM - 12);
      b.position.set(bx, 0.6, bz);
      scene.add(b); staticMeshes.push(b);
      beacon = { x: bx, z: bz, mesh: b, used: false };
    }

    return { gravity: G, spawnPts, hatch, beacon };
  }

  function openHatch() {
    if (!hatch || hatchOpen) return;
    hatchOpen = true;
    hatch.ring.material.color.setHex(0x3aff8a);
  }

  function update(dt, t, pulseGravity) {
    for (const s of strip) s.material.color.setHSL(0.07, 1, 0.4 + 0.25 * Math.sin(t * 2.4 + s.position.x));
    if (pulseGravity) phys.setGravity({ x: 0, y: -6 + Math.sin(t * 0.7) * 5.2, z: 0 });
  }

  return {
    build, openHatch, update, clearFloor,
    get hatch() { return hatch; }, get hatchOpen() { return hatchOpen; },
    get beacon() { return beacon; },
  };
}
