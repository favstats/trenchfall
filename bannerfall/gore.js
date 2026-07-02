// gore.js — the reason we're here. Severed parts become physics chunks that
// tumble, bounce and settle; stumps fountain for a second; blood soaks into
// the ground as persistent decals; close kills splash the lens. All pooled.
import * as THREE from './engine/three.js';
import { heightAt } from './world.js';
import { FACTION } from './soldier.js';

const CHUNK_N = 48, SPRAY_N = 1600, FOUNT_N = 10, DECAL_N = 240;

function chunkMesh(part, faction, type) {
  const F = FACTION[faction];
  const g = new THREE.Group();
  const steel = new THREE.MeshLambertMaterial({ color: type === 'knight' ? 0x9aa2ac : 0x4c5258 });
  const tunic = new THREE.MeshLambertMaterial({ color: F.tunic });
  const skin = new THREE.MeshLambertMaterial({ color: F.skin });
  const meat = new THREE.MeshLambertMaterial({ color: 0x6a0d0d });
  let m;
  if (part === 'head') {
    m = new THREE.Mesh(new THREE.SphereGeometry(0.185, 10, 8), skin);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 7, 0, Math.PI * 2, 0, Math.PI / 1.7), steel);
    helm.position.y = 0.06;
    g.add(helm);
  } else if (part === 'armL' || part === 'armR') {
    m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.075, 0.66, 6), type === 'knight' ? steel : tunic);
  } else if (part === 'legL' || part === 'legR') {
    m = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.78, 6), tunic);
  } else { // torso gib
    m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.5, 7), meat);
  }
  const cap = new THREE.Mesh(new THREE.SphereGeometry(part === 'head' ? 0.1 : 0.09, 6, 5), meat);
  cap.position.y = part === 'head' ? -0.15 : 0.32;
  g.add(m, cap);
  m.castShadow = true;
  return g;
}

export function createGore(scene, hudRoot) {
  // ---- chunks ----
  const chunks = [];
  for (let i = 0; i < CHUNK_N; i++) chunks.push({ g: null, life: 0, vel: new THREE.Vector3(), ang: new THREE.Vector3() });
  let cHead = 0;
  function sever(info, hitDir) {
    const c = chunks[cHead]; cHead = (cHead + 1) % CHUNK_N;
    if (c.g) scene.remove(c.g);
    c.g = chunkMesh(info.part, info.faction, info.type);
    c.g.position.copy(info.worldPos);
    scene.add(c.g);
    c.life = 30;                                       // parts stay on the field
    const up = 3.2 + Math.random() * 3.4;
    c.vel.set(hitDir.x * (3 + Math.random() * 4) + (Math.random() - 0.5) * 2, up, hitDir.z * (3 + Math.random() * 4) + (Math.random() - 0.5) * 2);
    c.ang.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 14);
    fountain(info.worldPos.x, info.worldPos.y, info.worldPos.z);
  }

  // ---- blood spray points ----
  const sprayGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(SPRAY_N * 3).fill(-999);
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({
    color: 0x7a0f0f, size: 0.14, transparent: true, opacity: 0.95, depthWrite: false,
  }));
  spray.frustumCulled = false;
  scene.add(spray);
  const sVel = new Float32Array(SPRAY_N * 3), sLife = new Float32Array(SPRAY_N);
  let sHead = 0;
  function blood(x, y, z, dir, n = 14, power = 1) {
    for (let k = 0; k < n; k++) {
      const i = sHead; sHead = (sHead + 1) % SPRAY_N;
      sPos[i * 3] = x; sPos[i * 3 + 1] = y; sPos[i * 3 + 2] = z;
      sVel[i * 3] = (dir.x * 3 + (Math.random() - 0.5) * 4) * power;
      sVel[i * 3 + 1] = (1.5 + Math.random() * 4) * power;
      sVel[i * 3 + 2] = (dir.z * 3 + (Math.random() - 0.5) * 4) * power;
      sLife[i] = 0.5 + Math.random() * 0.6;
    }
  }

  // ---- stump fountains: brief arterial arcs ----
  const founts = [];
  for (let i = 0; i < FOUNT_N; i++) founts.push({ x: 0, y: 0, z: 0, life: 0 });
  let fHead = 0;
  function fountain(x, y, z) {
    const f = founts[fHead]; fHead = (fHead + 1) % FOUNT_N;
    f.x = x; f.y = y; f.z = z; f.life = 0.9;
  }

  // ---- decals: the field keeps the stains ----
  const decalGeo = new THREE.CircleGeometry(1, 14);
  const decalMat = new THREE.MeshBasicMaterial({ color: 0x4a0a0a, transparent: true, opacity: 0.55, depthWrite: false });
  const decals = new THREE.InstancedMesh(decalGeo, decalMat, DECAL_N);
  const dO = new THREE.Object3D();
  dO.position.set(0, -999, 0); dO.updateMatrix();
  for (let i = 0; i < DECAL_N; i++) decals.setMatrixAt(i, dO.matrix);
  decals.frustumCulled = false;
  scene.add(decals);
  let dHead = 0;
  function stain(x, z, size = 1) {
    dO.position.set(x, heightAt(x, z) + 0.03 + dHead * 0.00004, z);
    dO.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI);
    dO.scale.setScalar(0.5 + Math.random() * 0.8 * size + size * 0.4);
    dO.updateMatrix();
    decals.setMatrixAt(dHead, dO.matrix);
    decals.instanceMatrix.needsUpdate = true;
    dHead = (dHead + 1) % DECAL_N;
  }

  // ---- lens splatter: DOM blobs that drip and fade ----
  const lens = document.createElement('div');
  lens.id = 'lensBlood';
  hudRoot.appendChild(lens);
  function splashLens(k = 1) {
    for (let i = 0; i < 3 + k * 3; i++) {
      const b = document.createElement('i');
      const sz = 18 + Math.random() * 70 * k;
      b.style.cssText = `left:${8 + Math.random() * 84}%;top:${Math.random() * 80}%;width:${sz}px;height:${sz * (1 + Math.random())}px;`;
      lens.appendChild(b);
      setTimeout(() => b.remove(), 1400);
    }
  }

  function update(dt) {
    for (const c of chunks) {
      if (c.life <= 0 || !c.g) continue;
      c.life -= dt;
      if (c.life <= 0) { scene.remove(c.g); c.g = null; continue; }
      if (c.vel.lengthSq() > 0.001) {
        c.vel.y -= 14 * dt;
        c.g.position.addScaledVector(c.vel, dt);
        c.g.rotation.x += c.ang.x * dt; c.g.rotation.y += c.ang.y * dt; c.g.rotation.z += c.ang.z * dt;
        const gy = heightAt(c.g.position.x, c.g.position.z) + 0.12;
        if (c.g.position.y < gy) {
          c.g.position.y = gy;
          if (Math.abs(c.vel.y) > 2) {
            c.vel.y *= -0.38; c.vel.x *= 0.6; c.vel.z *= 0.6;
            c.ang.multiplyScalar(0.5);
            stain(c.g.position.x, c.g.position.z, 0.5);
          } else { c.vel.set(0, 0, 0); c.ang.set(0, 0, 0); stain(c.g.position.x, c.g.position.z, 0.7); }
        }
      }
    }
    for (let i = 0; i < SPRAY_N; i++) {
      if (sLife[i] <= 0) continue;
      sLife[i] -= dt;
      sPos[i * 3] += sVel[i * 3] * dt;
      sPos[i * 3 + 1] += sVel[i * 3 + 1] * dt; sVel[i * 3 + 1] -= 13 * dt;
      sPos[i * 3 + 2] += sVel[i * 3 + 2] * dt;
      const gy = heightAt(sPos[i * 3], sPos[i * 3 + 2]);
      if (sPos[i * 3 + 1] < gy) {
        if (Math.random() < 0.1) stain(sPos[i * 3], sPos[i * 3 + 2], 0.35);
        sLife[i] = 0; sPos[i * 3 + 1] = -999;
      }
      if (sLife[i] <= 0) sPos[i * 3 + 1] = -999;
    }
    sprayGeo.attributes.position.needsUpdate = true;
    for (const f of founts) {
      if (f.life <= 0) continue;
      f.life -= dt;
      blood(f.x, f.y, f.z, { x: 0, z: 0 }, 3, 0.8);   // pulse of arcs each frame
    }
  }

  return { sever, blood, stain, splashLens, update };
}
