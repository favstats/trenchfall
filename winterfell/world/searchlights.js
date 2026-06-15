// searchlights.js — the perimeter sweeps the dark. Long additive beams from the tower
// tops scan back and forth across the killing ground, with a bright lamp at the source
// and a lit ellipse tracking where the beam meets the snow. Visual-only (no real lights),
// a handful of cones — cheap, and it reads as a held, electrified line.
import * as THREE from '../engine/three.js';
import { WALL_Z, WALL_H } from '../world/field.js';

export function createSearchlights(scene) {
  const L = 78, R = 9;
  // cone: apex at the fixture origin, opening out toward -z (north, over the field)
  const beamGeo = new THREE.ConeGeometry(R, L, 18, 1, true);
  beamGeo.translate(0, -L / 2, 0);
  beamGeo.rotateX(Math.PI / 2);            // apex at origin, base out at z = -L

  const lampGeo = new THREE.SphereGeometry(0.5, 10, 8);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff4d6, fog: false });
  const poolGeo = new THREE.CircleGeometry(1, 24);
  const poolMat = new THREE.MeshBasicMaterial({
    color: 0xffe9b0, transparent: true, opacity: 0.16, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: true,
  });

  const lights = [];
  // gatehouse flanks + mid-wall towers, each sweeping its own arc out of phase
  const spots = [
    { x: -15, y: WALL_H + 7.5, range: 0.5, speed: 0.32, phase: 0 },
    { x: 15, y: WALL_H + 7.5, range: 0.5, speed: 0.29, phase: 2.1 },
    { x: -78, y: WALL_H + 9, range: 0.62, speed: 0.24, phase: 4.0 },
    { x: 78, y: WALL_H + 9, range: 0.62, speed: 0.27, phase: 1.2 },
  ];
  for (const s of spots) {
    const fixture = new THREE.Group();
    fixture.position.set(s.x, s.y, WALL_Z - 1);
    fixture.rotation.x = -0.28;            // shallow cant — the beam rakes across the air, not the snow
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
      map: null, color: 0xfff0cc, transparent: true, opacity: 0.17, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true,
    }));
    fixture.add(beam);
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    fixture.add(lamp);                     // sits at the apex
    scene.add(fixture);

    const pool = new THREE.Mesh(poolGeo, poolMat.clone());
    pool.rotation.x = -Math.PI / 2;
    pool.scale.set(7, 12, 1);
    scene.add(pool);

    lights.push({ fixture, beam, pool, ...s });
  }

  let t = 0;
  function update(dt) {
    t += dt;
    for (const l of lights) {
      const yaw = Math.sin(t * l.speed + l.phase) * l.range;
      l.fixture.rotation.y = yaw;
      l.beam.material.opacity = 0.15 + 0.04 * Math.sin(t * 2 + l.phase); // flicker
      // ground pool tracks where the canted, swept beam lands (approx projection)
      const reach = (l.y) / Math.tan(0.28) + 24;
      l.pool.position.set(l.x - Math.sin(yaw) * reach, 0.12, WALL_Z - Math.cos(yaw) * reach);
    }
  }
  return { update, group: lights };
}
