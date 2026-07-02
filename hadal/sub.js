// sub.js — the one-man submersible. In water this dark you mostly see her
// lights: the warm viewport, a blinking beacon, twin lamp beams. The hull is a
// silhouette. Flight-style control: the cursor steers, W thrusts along the
// nose, she is always a little heavier than the water wants her to be.
import * as THREE from './engine/three.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function glowTex(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [p, col] of stops) grd.addColorStop(p, col);
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Sub {
  constructor(scene, camera, sonarUniforms) {
    this.camera = camera;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3(0, -2, 0);
    this.yaw = 0; this.pitch = -0.25; this.roll = 0;
    this.aim = new THREE.Vector3(0, 0, -1);
    this.thrust = 0; this.boost = false; this.brake = false;
    this.lampOn = true;
    this.steer = { x: 0, y: 0 };      // cursor offset, set by main
    this.sonarU = sonarUniforms;

    // ---- hull: silhouette + lights ----
    const g = new THREE.Group();
    const hullMat = new THREE.MeshBasicMaterial({ color: 0x111c22 });
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(1.05, 2.4, 6, 12), hullMat);
    hull.rotation.x = Math.PI / 2;
    const sail = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.8, 10), hullMat);
    sail.position.set(0, 1.1, 0.2);
    const prop = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.14, 8, 18), new THREE.MeshBasicMaterial({ color: 0x0a1216 }));
    prop.position.z = 2.2;
    g.add(hull, sail, prop);

    // warm viewport — the human light in all this black
    const port = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex([[0, 'rgba(255,214,150,1)'], [0.4, 'rgba(255,170,90,.6)'], [1, 'rgba(0,0,0,0)']]),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9,
    }));
    port.position.set(0, 0.15, -1.9); port.scale.setScalar(1.15); port.material.opacity = 0.7;
    // red beacon, blinking on top
    this.beacon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex([[0, 'rgba(255,90,70,1)'], [1, 'rgba(0,0,0,0)']]),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.beacon.position.set(0, 1.8, 0.2); this.beacon.scale.setScalar(1.4);
    g.add(port, this.beacon);

    // twin lamp beams — long additive cones, apex at the nose
    this.beams = [];
    // kept faint: the camera sits behind the sub looking straight down these
    // cones, so their alpha stacks along the view axis — 0.05 reads as a
    // whiteout balloon under bloom, 0.022 reads as light in the water
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffe9c4, transparent: true, opacity: 0.022,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    for (const sx of [-0.9, 0.9]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(5.5, 52, 20, 1, true), beamMat);
      cone.rotation.x = Math.PI / 2;               // point down -z
      cone.position.set(sx, 0, -26 - 1.4);
      const holder = new THREE.Group();
      holder.add(cone);
      g.add(holder);
      this.beams.push(holder);
    }

    scene.add(g);
    this.g = g;

    // ---- prop-wash bubbles ----
    const BN = 240;
    this.bubbles = { i: 0, pos: new Float32Array(BN * 3), life: new Float32Array(BN), n: BN };
    this.bubbles.pos.fill(1e5);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(this.bubbles.pos, 3));
    this.bubblePts = new THREE.Points(bg, new THREE.PointsMaterial({
      color: 0xbfe6ef, size: 0.5, transparent: true, opacity: 0.5, depthWrite: false,
    }));
    this.bubblePts.frustumCulled = false;
    scene.add(this.bubblePts);

    // camera state
    this.camPos = new THREE.Vector3(0, 4, 18);
    this.camLook = new THREE.Vector3();
    this._camWant = new THREE.Vector3();
    this._camLookWant = new THREE.Vector3();
    this.fovK = 62;
    this.shake = 0;
  }

  addShake(n) { this.shake = Math.min(1.6, this.shake + n); }

  update(dt) {
    // ---- steering: cursor x = turn rate, cursor y = absolute pitch ----
    this.yaw -= this.steer.x * 1.9 * dt;
    const pitchT = clamp(-this.steer.y * 1.5, -1.25, 1.25);
    this.pitch += (pitchT - this.pitch) * Math.min(1, dt * 5);
    this.roll += (-this.steer.x * 0.5 - this.roll) * Math.min(1, dt * 4);

    const cp = Math.cos(this.pitch);
    this.aim.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);

    // ---- physics: ballast-heavy, thrust along the nose ----
    const acc = this.boost ? 30 : 15;
    if (this.thrust > 0) this.vel.addScaledVector(this.aim, acc * this.thrust * dt);
    this.vel.y -= 2.6 * dt;                              // she wants to sink
    const drag = this.brake ? 2.4 : 0.55;
    this.vel.multiplyScalar(Math.exp(-drag * dt));
    const sp = this.vel.length();
    const maxSp = this.boost ? 27 : 17;
    if (sp > maxSp) this.vel.multiplyScalar(maxSp / sp);
    this.pos.addScaledVector(this.vel, dt);

    // ---- pose ----
    this.g.position.copy(this.pos);
    this.g.rotation.set(0, 0, 0);
    this.g.rotateY(this.yaw);
    this.g.rotateX(-this.pitch);
    this.g.rotateZ(this.roll);
    this.beacon.material.opacity = (Math.sin(performance.now() * 0.006) > 0.6) ? 0.95 : 0.06;
    for (const b of this.beams) b.visible = this.lampOn;

    // ---- feed the shared shader block ----
    const U = this.sonarU;
    U.uSubPos.value.copy(this.pos);
    U.uSubSpeed.value = sp;
    U.uLampPos.value.copy(this.pos).addScaledVector(this.aim, 1.6);
    U.uLampDir.value.copy(this.aim);
    U.uLampOn.value += ((this.lampOn ? 1 : 0) - U.uLampOn.value) * Math.min(1, dt * 8);

    // ---- bubbles off the prop while thrusting ----
    if (this.thrust > 0 && Math.random() < dt * 40) {
      const B = this.bubbles, i = B.i; B.i = (B.i + 1) % B.n;
      B.pos[i * 3] = this.pos.x - this.aim.x * 2.4 + (Math.random() - 0.5) * 0.6;
      B.pos[i * 3 + 1] = this.pos.y - this.aim.y * 2.4;
      B.pos[i * 3 + 2] = this.pos.z - this.aim.z * 2.4 + (Math.random() - 0.5) * 0.6;
      B.life[i] = 1.6;
    }
    const B = this.bubbles;
    for (let i = 0; i < B.n; i++) {
      if (B.life[i] <= 0) continue;
      B.life[i] -= dt;
      B.pos[i * 3 + 1] += dt * 3.2;                      // bubbles rise
      if (B.life[i] <= 0) B.pos[i * 3 + 1] = 1e5;
    }
    this.bubblePts.geometry.attributes.position.needsUpdate = true;

    // ---- chase camera: trails the nose, damped like the water it is in ----
    const back = 13 + sp * 0.35;
    this._camWant.copy(this.pos).addScaledVector(this.aim, -back);
    this._camWant.y += 3.4;
    this.camPos.lerp(this._camWant, 1 - Math.exp(-5.5 * dt));
    this._camLookWant.copy(this.pos).addScaledVector(this.aim, 9);
    this.camLook.lerp(this._camLookWant, 1 - Math.exp(-7 * dt));
    if (this.shake > 0.002) {
      this.camPos.x += (Math.random() * 2 - 1) * this.shake * 0.5;
      this.camPos.y += (Math.random() * 2 - 1) * this.shake * 0.3;
      this.shake *= Math.exp(-6 * dt);
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    const fovT = this.boost ? 72 : 62;
    this.fovK += (fovT - (this.fovK || 62)) * Math.min(1, dt * 4);
    this.camera.fov = this.fovK; this.camera.updateProjectionMatrix();
  }
}
