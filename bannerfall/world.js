// world.js — the field. Rolling vertex-colored terrain, twenty thousand blades
// of instanced wind-blown grass, a sunset dome with a burning sun, ring of
// dark hills, cloth banners over each camp, and pooled dust for hooves and
// boots. heightAt() is shared by everything that stands on the ground.
import * as THREE from './engine/three.js';

const SIZE = 460, SEG = 96;

function fbm(x, z) {
  return Math.sin(x * 0.021) * Math.cos(z * 0.017) * 2.6
    + Math.sin(x * 0.052 + 1.7) * Math.cos(z * 0.043 + 0.6) * 1.1
    + Math.sin(x * 0.11 + 4.2) * 0.35;
}
export function heightAt(x, z) {
  const d = Math.hypot(x, z);
  const flat = Math.max(0, 1 - Math.max(0, d - 55) / 130); // battle bowl stays gentle
  return fbm(x, z) * (1 - flat * 0.72);
}

// wind sway injected into any built-in material — instancing keeps working
function windify(mat, amp = 1) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windTime;
    sh.vertexShader = `uniform float uTime;\n` + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float wA = ${amp.toFixed(2)} * transformed.y;
       vec4 wPos = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
       transformed.x += sin(uTime * 1.7 + wPos.x * 0.15 + wPos.z * 0.09) * 0.12 * wA;
       transformed.z += cos(uTime * 1.3 + wPos.z * 0.13) * 0.08 * wA;`);
  };
  return mat;
}
const windTime = { value: 0 };

function radialTex(stops, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [p, col] of stops) grd.addColorStop(p, col);
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWorld(scene) {
  // ---- terrain: vertex-colored, worn bare where the armies meet ----
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(0x7a8a3e), dry = new THREE.Color(0xa89a52),
    dirt = new THREE.Color(0x8a6f4a), worn = new THREE.Color(0x7d6242);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = heightAt(x, z);
    pos.setY(i, y);
    const n = Math.sin(x * 0.3) * Math.cos(z * 0.27) * 0.5 + 0.5;
    c.lerpColors(grass, dry, n * 0.8);
    const center = Math.max(0, 1 - Math.hypot(x, z) / 46);
    if (center > 0) c.lerp(worn, center * 0.75);            // trampled middle
    if (y > 2.2) c.lerp(dirt, Math.min(1, (y - 2.2) * 0.4));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- grass: tapered instanced blades, tinted per tuft, all swaying ----
  const bladeGeo = new THREE.PlaneGeometry(0.22, 1.0, 1, 3);
  bladeGeo.translate(0, 0.5, 0);
  {
    const p = bladeGeo.attributes.position;           // taper to a tip, slight lean
    for (let i = 0; i < p.count; i++) {
      const k = p.getY(i);                            // 0..1 up the blade
      p.setX(i, p.getX(i) * (1 - k * 0.85));
      p.setZ(i, k * k * 0.22);
    }
  }
  const g2 = bladeGeo.clone(); g2.rotateY(Math.PI / 2);
  const g3 = bladeGeo.clone(); g3.rotateY(-Math.PI / 3);
  const tuftGeo = mergeGeos([bladeGeo, g2, g3]);
  const grassMat = windify(new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), 1);
  const G_N = 9000;
  const tufts = new THREE.InstancedMesh(tuftGeo, grassMat, G_N);
  const o = new THREE.Object3D();
  const gc = new THREE.Color();
  for (let i = 0; i < G_N; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 20 + Math.pow(Math.random(), 0.6) * 200;      // sparse in the arena, thick outside
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    o.position.set(x, heightAt(x, z), z);
    o.rotation.y = Math.random() * Math.PI;
    const s = 0.8 + Math.random() * 1.0;
    o.scale.set(s, s * (0.7 + Math.random() * 0.7), s);
    o.updateMatrix();
    tufts.setMatrixAt(i, o.matrix);
    gc.setHSL(0.19 + Math.random() * 0.05, 0.42 + Math.random() * 0.2, 0.3 + Math.random() * 0.14);
    tufts.setColorAt(i, gc);
  }
  tufts.frustumCulled = false;
  scene.add(tufts);

  // ---- trees on the field's edge — the treeline the routed run for ----
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3320 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x5a6a2e });
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 95 + Math.random() * 110;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = 5 + Math.random() * 5;
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.4, h * 0.45, 6), trunkMat);
    trunk.position.y = h * 0.22;
    t.add(trunk);
    for (let k = 0; k < 3; k++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(h * (0.34 - k * 0.07), h * 0.42, 7), leafMat);
      c.position.y = h * (0.4 + k * 0.22);
      c.castShadow = true;
      t.add(c);
    }
    t.position.set(x, heightAt(x, z), z);
    t.rotation.y = Math.random() * Math.PI;
    scene.add(t);
  }

  // ---- sky dome + the low sun + clouds + hill ring ----
  const skyC = document.createElement('canvas'); skyC.width = 64; skyC.height = 256;
  const sg = skyC.getContext('2d');
  const grd = sg.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#4a6a9a'); grd.addColorStop(0.45, '#b98a5e');
  grd.addColorStop(0.72, '#e8a45a'); grd.addColorStop(1, '#f4c884');
  sg.fillStyle = grd; sg.fillRect(0, 0, 64, 256);
  const skyT = new THREE.CanvasTexture(skyC); skyT.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 18),
    new THREE.MeshBasicMaterial({ map: skyT, side: THREE.BackSide, fog: false, depthWrite: false }));
  scene.add(sky);
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(34, 40),
    new THREE.MeshBasicMaterial({ color: 0xffe8b8, fog: false }));
  sunDisc.position.set(-560, 120, 190); sunDisc.lookAt(0, 60, 0);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshBasicMaterial({
    map: radialTex([[0, 'rgba(255,220,160,.9)'], [0.3, 'rgba(255,180,100,.35)'], [1, 'rgba(0,0,0,0)']]),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.position.copy(sunDisc.position); halo.lookAt(0, 60, 0);
  scene.add(sunDisc, halo);
  const cloudT = radialTex([[0, 'rgba(255,235,210,.85)'], [0.5, 'rgba(240,200,170,.4)'], [1, 'rgba(0,0,0,0)']]);
  for (let i = 0; i < 16; i++) {
    const cl = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudT, transparent: true, opacity: 0.5, fog: false, depthWrite: false }));
    const a = Math.random() * Math.PI * 2, r = 320 + Math.random() * 260;
    cl.position.set(Math.cos(a) * r, 90 + Math.random() * 110, Math.sin(a) * r);
    cl.scale.set(120 + Math.random() * 160, 34 + Math.random() * 30, 1);
    scene.add(cl);
  }
  const hillMat = new THREE.MeshLambertMaterial({ color: 0x5a5240 });
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + Math.random() * 0.2;
    const r = 300 + Math.random() * 80;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(60 + Math.random() * 70, 30 + Math.random() * 42, 7), hillMat);
    hill.position.set(Math.cos(a) * r, -4, Math.sin(a) * r);
    scene.add(hill);
  }

  // ---- banners over each camp ----
  const banners = [];
  function addBanner(x, z, color) {
    const gB = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 7, 8), new THREE.MeshLambertMaterial({ color: 0x4a3826 }));
    pole.position.y = 3.5;
    const clothGeo = new THREE.PlaneGeometry(2.4, 3.4, 6, 8);
    clothGeo.translate(1.2, -1.7, 0);
    const cloth = new THREE.Mesh(clothGeo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
    cloth.position.y = 6.9;
    cloth.castShadow = true;
    gB.add(pole, cloth);
    const y = heightAt(x, z);
    gB.position.set(x, y, z);
    scene.add(gB);
    banners.push({ cloth, phase: Math.random() * 9 });
    return gB;
  }
  addBanner(-6, 62, 0x2e4a7a); addBanner(6, 62, 0x2e4a7a);     // yours: blue
  addBanner(-6, -62, 0x8a2420); addBanner(6, -62, 0x8a2420);   // theirs: red

  // ---- dust pool: hooves, boots, and falling bodies kick it up ----
  const DUST_N = 140;
  const dustT = radialTex([[0, 'rgba(200,170,120,.5)'], [0.6, 'rgba(170,140,100,.2)'], [1, 'rgba(0,0,0,0)']], 64);
  const dust = [];
  for (let i = 0; i < DUST_N; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustT, transparent: true, opacity: 0, depthWrite: false }));
    s.visible = false;
    scene.add(s);
    dust.push({ s, life: 0, max: 1, vy: 0, sz: 1 });
  }
  let dHead = 0;
  function puffDust(x, y, z, big = false) {
    const d = dust[dHead]; dHead = (dHead + 1) % DUST_N;
    d.life = d.max = big ? 1.1 : 0.7;
    d.vy = 0.8 + Math.random();
    d.sz = big ? 2.6 : 1.3;
    d.s.position.set(x + (Math.random() - 0.5), y + 0.3, z + (Math.random() - 0.5));
    d.s.visible = true;
  }

  function update(dt, t) {
    windTime.value = t;
    for (const b of banners) {
      const p = b.cloth.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        p.setZ(i, Math.sin(t * 2.2 + x * 1.5 + b.phase) * 0.14 * x + Math.sin(t * 3.4 + x * 2.6) * 0.05 * x);
      }
      p.needsUpdate = true;
    }
    for (const d of dust) {
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) { d.s.visible = false; continue; }
      d.s.position.y += d.vy * dt;
      const k = d.life / d.max;
      d.s.material.opacity = k * 0.5;
      d.s.scale.setScalar(d.sz * (1.6 - k * 0.8));
    }
  }

  return { update, puffDust, heightAt };
}

// minimal geometry merge (avoids pulling BufferGeometryUtils off the CDN)
function mergeGeos(geos) {
  let vCount = 0, iCount = 0;
  for (const g of geos) { vCount += g.attributes.position.count; iCount += g.index.count; }
  const posA = new Float32Array(vCount * 3), uvA = new Float32Array(vCount * 2), nA = new Float32Array(vCount * 3);
  const idx = new Uint16Array(iCount);
  let vo = 0, io = 0;
  for (const g of geos) {
    posA.set(g.attributes.position.array, vo * 3);
    uvA.set(g.attributes.uv.array, vo * 2);
    nA.set(g.attributes.normal.array, vo * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count; io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(posA, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uvA, 2));
  out.setAttribute('normal', new THREE.BufferAttribute(nA, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
