// weirwood.js — the heart tree of Winterfell's godswood. A pale bone-white bole with
// blood-red foliage and a carved, faintly weeping face, standing in the courtyard behind
// the wall. One landmark tree — cheap, and the most iconic thing on the field.
import * as THREE from '../engine/three.js';
import { WALL_Z } from '../world/field.js';

export function createWeirwood(scene, x = -50, z = WALL_Z + 34) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  const bark = new THREE.MeshStandardMaterial({ color: 0xe7e8e2, roughness: 0.9, metalness: 0 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x8c1c1c, roughness: 1, metalness: 0, emissive: 0x300707, emissiveIntensity: 0.55 });

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.15, 9, 8), bark);
  trunk.position.y = 4.5; trunk.rotation.z = 0.05; trunk.castShadow = true; g.add(trunk);
  for (let i = 0; i < 5; i++) {                 // root flare at the base
    const a = i / 5 * Math.PI * 2;
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.42, 2.4, 5), bark);
    r.position.set(Math.cos(a) * 0.8, 0.5, Math.sin(a) * 0.8);
    r.rotation.set(Math.PI / 2 - 0.55, a, 0); g.add(r);
  }

  const up = new THREE.Vector3(0, 1, 0);
  const canopy = new THREE.Group();
  const ends = [[0, 11.5, 0]]; // crown cluster at the treetop (a position, not a direction)
  for (const [bx, by, bz] of [[-1, 0.7, 0.3], [1, 0.8, -0.2], [-0.4, 0.9, -0.7], [0.5, 0.85, 0.6]]) {
    const dir = new THREE.Vector3(bx, by, bz).normalize();
    const len = 3.6 + Math.random() * 1.4;
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.34, len, 6), bark);
    br.position.set(dir.x * len * 0.45, 8.4 + dir.y * len * 0.45, dir.z * len * 0.45);
    br.quaternion.setFromUnitVectors(up, dir);
    br.castShadow = true; g.add(br);
    ends.push([dir.x * len, 8.6 + dir.y * len, dir.z * len]);
  }
  for (const [ex, ey, ez] of ends) {            // blood-red foliage clusters
    for (let i = 0; i < 3; i++) {
      const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6 + Math.random() * 0.8, 0), leaf);
      blob.position.set(ex + (Math.random() - 0.5) * 2, (ey + 2.4) + (Math.random() - 0.5) * 1.5, ez + (Math.random() - 0.5) * 2);
      blob.castShadow = true; canopy.add(blob);
    }
  }
  g.add(canopy);

  // the carved face, looking out over the courtyard (+z), eyes weeping faint red
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x9a1010, fog: false });
  const carved = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 1 });
  for (const ex of [-0.34, 0.34]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), eyeMat);
    eye.scale.set(1, 0.72, 0.5); eye.position.set(ex, 5.5, 1.02); g.add(eye);
    const tear = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.0, 0.05), eyeMat);
    tear.position.set(ex, 5.0, 1.04); g.add(tear);
  }
  const brow = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.18), carved); brow.position.set(0, 5.85, 1.0); brow.rotation.z = 0.05; g.add(brow);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.13, 0.2), carved); mouth.position.set(0, 4.75, 1.04); mouth.rotation.z = 0.08; g.add(mouth);

  scene.add(g);
  let t = 0;
  function update(dt) { t += dt; canopy.rotation.z = Math.sin(t * 0.5) * 0.022; canopy.position.x = Math.sin(t * 0.4) * 0.14; } // gentle sway
  return { update, group: g };
}
