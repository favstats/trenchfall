// field.js — the battlefield before Winterfell's wall. Terrain, the outer wall
// (with a walkable rampart + climbable earthwork behind it), gate, godswood
// treeline, defensive stakes. Pure scene geometry. Exposes heightAt() so units
// know how high to stand, and placementTargets for right-click positioning.
//
// Orientation: the WALL runs along X at z = WALL_Z (near the camera, south).
// Defenders hold on/behind it. The FIELD opens north (toward -z); the dead pour
// from the far treeline (NORTH_Z) and advance south onto the wall.
import * as THREE from '../engine/three.js';

export const WALL_Z = 30;       // z of the wall line (breach line)
export const NORTH_Z = -185;    // where the horde spawns / treeline sits
export const FIELD_HALF_X = 150;
export const WALL_H = 7;         // rampart walk height
export const WALL_T = 3.4;       // wall thickness
export const GATE_W = 16;        // gate gap width
export const RAMP_D = 16;        // depth of the climbable embankment behind the wall

const Z_TOP = WALL_Z + WALL_T / 2;   // back (south) edge of the wall top
const Z_BOT = Z_TOP + RAMP_D;        // foot of the embankment

export const BOUNDS = {
  minX: -FIELD_HALF_X, maxX: FIELD_HALF_X,
  minZ: NORTH_Z + 10, maxZ: 80,
};

// Standable height at a ground position: rampart top on the wall footprint,
// a linear slope down the embankment behind it, ground level elsewhere.
export function heightAt(x, z) {
  const onSpan = Math.abs(x) <= FIELD_HALF_X && Math.abs(x) >= GATE_W / 2 + 0.5;
  if (!onSpan) return 0;
  if (z >= WALL_Z - WALL_T / 2 && z <= Z_TOP) return WALL_H;     // on the rampart
  if (z > Z_TOP && z <= Z_BOT) return WALL_H * (1 - (z - Z_TOP) / RAMP_D); // embankment
  return 0;
}

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

// triangular-prism embankment spanning x0..x1 (slope face is walkable)
function makeRamp(x0, x1, mat) {
  const A0 = [x0, WALL_H, Z_TOP], B0 = [x0, 0, Z_BOT], C0 = [x0, 0, Z_TOP];
  const A1 = [x1, WALL_H, Z_TOP], B1 = [x1, 0, Z_BOT], C1 = [x1, 0, Z_TOP];
  const v = [...A0, ...B0, ...C0, ...A1, ...B1, ...C1]; // 0..5
  const idx = [
    0, 1, 4, 0, 4, 3,   // slope (walk surface)
    2, 0, 3, 2, 3, 5,   // back vertical (against the wall)
    2, 1, 4, 2, 4, 5,   // bottom
    0, 2, 1,            // left cap
    3, 4, 5,            // right cap
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function buildField(scene) {
  const group = new THREE.Group();
  const placementTargets = [];

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
  placementTargets.push(ground);

  // churned/bloodied killing strip north of the wall
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
  const earth = new THREE.MeshStandardMaterial({
    map: noiseTexture(128, '#aeb6c0', 0.14), color: 0xc2cad4, roughness: 1,
  });
  const wall = new THREE.Group();

  for (const side of [-1, 1]) {
    const spanLen = FIELD_HALF_X - GATE_W / 2;
    const cx = side * (GATE_W / 2 + spanLen / 2);
    const span = new THREE.Mesh(new THREE.BoxGeometry(spanLen, WALL_H, WALL_T), stone);
    span.position.set(cx, WALL_H / 2, WALL_Z);
    span.castShadow = span.receiveShadow = true;
    wall.add(span);
    placementTargets.push(span); // clicking the rampart top places units there

    // climbable embankment behind this span
    const x0 = side < 0 ? -FIELD_HALF_X : GATE_W / 2;
    const x1 = side < 0 ? -GATE_W / 2 : FIELD_HALF_X;
    const ramp = makeRamp(x0, x1, earth);
    wall.add(ramp);
    placementTargets.push(ramp);
  }

  // crenellations (merlons) along the top
  const merlonGeo = new THREE.BoxGeometry(2.2, 1.6, WALL_T + 0.2);
  const merlonCount = 2 * Math.floor(FIELD_HALF_X / 4);
  const merlons = new THREE.InstancedMesh(merlonGeo, stone, merlonCount);
  merlons.castShadow = true;
  const m = new THREE.Object3D();
  let mi = 0;
  for (let x = -FIELD_HALF_X + 2; x <= FIELD_HALF_X - 2 && mi < merlonCount; x += 4) {
    if (Math.abs(x) < GATE_W / 2 + 1) continue;
    m.position.set(x, WALL_H + 0.8, WALL_Z - WALL_T / 2 + 0.3); // along the north lip
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
  // the gate (closed ironbound timber)
  const gate = new THREE.Mesh(
    new THREE.BoxGeometry(GATE_W - 1, WALL_H, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x2c2620, roughness: 0.8, metalness: 0.2 }),
  );
  gate.position.set(0, WALL_H / 2, WALL_Z + 0.4);
  gate.castShadow = gate.receiveShadow = true;
  wall.add(gate);

  group.add(wall);

  // ----- defensive stakes in the killing ground -----
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

  // ----- godswood treeline horizon -----
  const treeGeo = new THREE.ConeGeometry(5, 22, 6);
  const treeMat = new THREE.MeshStandardMaterial({ color: 0x10161b, roughness: 1 });
  const TREES = 90;
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, TREES);
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

  return { group, wall, gate, wallZ: WALL_Z, bounds: BOUNDS, placementTargets, heightAt };
}
