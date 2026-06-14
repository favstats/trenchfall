// field.js — the battlefield before Winterfell's wall. Terrain, the outer wall
// and gate, godswood treeline, defensive stakes. Pure scene geometry; knows
// nothing about units or the horde.
//
// Orientation: the WALL runs along X at z = WALL_Z (near the camera, south).
// Defenders hold just behind it. The FIELD opens north (toward -z); the dead
// pour from the far treeline (NORTH_Z) and advance south onto the wall.
import * as THREE from '../engine/three.js';

export const WALL_Z = 30;      // z of the wall line (breach line)
export const NORTH_Z = -185;   // where the horde spawns / treeline sits
export const FIELD_HALF_X = 150;

export const BOUNDS = {
  minX: -FIELD_HALF_X, maxX: FIELD_HALF_X,
  minZ: NORTH_Z + 10, maxZ: 70,
};

function noiseTexture(size = 256, base = '#e8eef6', spec = 0.10) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  const img = g.getImageData(0, 0, size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 255 * spec;
    d[i] += n; d[i + 1] += n; d[i + 2] += n * 1.2;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildField(scene) {
  const group = new THREE.Group();

  // ----- snow ground -----
  const snowTex = noiseTexture(256, '#e9eff7', 0.10);
  snowTex.repeat.set(40, 40);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900, 1, 1),
    new THREE.MeshStandardMaterial({ map: snowTex, color: 0xdfe7f1, roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // a darker churned/bloodied strip just north of the wall (the killing ground)
  const kill = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * FIELD_HALF_X, 70),
    new THREE.MeshStandardMaterial({ color: 0xb9c2cf, roughness: 1 }),
  );
  kill.rotation.x = -Math.PI / 2;
  kill.position.set(0, 0.02, WALL_Z - 45);
  kill.receiveShadow = true;
  group.add(kill);

  // ----- the outer wall -----
  const stone = new THREE.MeshStandardMaterial({
    map: noiseTexture(128, '#6b7077', 0.16), color: 0x7c828b, roughness: 0.92, metalness: 0,
  });
  const WALL_H = 7, WALL_T = 3.4, GATE_W = 16;
  const wall = new THREE.Group();

  // two spans flanking a central gate
  for (const side of [-1, 1]) {
    const spanLen = FIELD_HALF_X - GATE_W / 2;
    const span = new THREE.Mesh(new THREE.BoxGeometry(spanLen, WALL_H, WALL_T), stone);
    span.position.set(side * (GATE_W / 2 + spanLen / 2), WALL_H / 2, WALL_Z);
    span.castShadow = span.receiveShadow = true;
    wall.add(span);
  }

  // crenellations (merlons) along the top, instanced
  const merlonGeo = new THREE.BoxGeometry(2.2, 1.6, WALL_T + 0.2);
  const merlonCount = 2 * Math.floor(FIELD_HALF_X / 4);
  const merlons = new THREE.InstancedMesh(merlonGeo, stone, merlonCount);
  merlons.castShadow = true;
  const m = new THREE.Object3D();
  let mi = 0;
  for (let x = -FIELD_HALF_X + 2; x <= FIELD_HALF_X - 2 && mi < merlonCount; x += 4) {
    if (Math.abs(x) < GATE_W / 2 + 1) continue; // gap for the gate
    m.position.set(x, WALL_H + 0.8, WALL_Z);
    m.updateMatrix();
    merlons.setMatrixAt(mi++, m.matrix);
  }
  merlons.count = mi;
  wall.add(merlons);

  // gate towers
  const towerGeo = new THREE.BoxGeometry(7, WALL_H + 5, 7);
  for (const side of [-1, 1]) {
    const tower = new THREE.Mesh(towerGeo, stone);
    tower.position.set(side * (GATE_W / 2 + 3), (WALL_H + 5) / 2, WALL_Z);
    tower.castShadow = tower.receiveShadow = true;
    wall.add(tower);
  }
  // the gate itself (dark ironbound timber, closed)
  const gate = new THREE.Mesh(
    new THREE.BoxGeometry(GATE_W - 1, WALL_H, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x2c2620, roughness: 0.8, metalness: 0.2 }),
  );
  gate.position.set(0, WALL_H / 2, WALL_Z + 0.4);
  gate.castShadow = gate.receiveShadow = true;
  wall.add(gate);

  group.add(wall);

  // ----- defensive stakes / dragonglass markers in the killing ground -----
  const stakeGeo = new THREE.ConeGeometry(0.35, 3, 5);
  const stakeMat = new THREE.MeshStandardMaterial({ color: 0x3a2c20, roughness: 0.9 });
  const STAKES = 160;
  const stakes = new THREE.InstancedMesh(stakeGeo, stakeMat, STAKES);
  stakes.castShadow = true;
  const o = new THREE.Object3D();
  for (let i = 0; i < STAKES; i++) {
    const x = (Math.random() * 2 - 1) * FIELD_HALF_X;
    const z = WALL_Z - 8 - Math.random() * 55;
    o.position.set(x, 1.4, z);
    o.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * Math.PI, Math.PI - 0.5 - Math.random() * 0.4);
    o.updateMatrix();
    stakes.setMatrixAt(i, o.matrix);
  }
  group.add(stakes);

  // ----- godswood treeline on the far northern horizon -----
  const treeGeo = new THREE.ConeGeometry(5, 22, 6);
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x10161b, roughness: 1 });
  const TREES = 90;
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, TREES);
  trees.castShadow = false;
  const t = new THREE.Object3D();
  for (let i = 0; i < TREES; i++) {
    const x = (Math.random() * 2 - 1) * (FIELD_HALF_X + 80);
    const z = NORTH_Z - Math.random() * 60;
    const s = 0.7 + Math.random() * 0.9;
    t.position.set(x, 11 * s, z);
    t.scale.set(s, s, s);
    t.updateMatrix();
    trees.setMatrixAt(i, t.matrix);
  }
  group.add(trees);

  scene.add(group);

  return { group, wall, gate, wallZ: WALL_Z, bounds: BOUNDS };
}
