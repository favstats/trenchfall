// entity.js — the Grin. A smile and two eyes, hanging at head height in the
// dark on a body your camcorder never quite resolves. Weeping-angel inverted:
// it only closes the distance while you are NOT looking at it; your gaze pins
// it in place — but pinning it is how you learn how close it already is.
// Standing in working light despawns it. Touching you skips the tape.
import * as THREE from './engine/three.js';
import { setDrone, sfxStinger } from './engine/audio.js';

function grinTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  // eyes: too round, too far apart
  g.fillStyle = 'rgba(245,248,255,0.98)';
  g.beginPath(); g.ellipse(86, 92, 13, 17, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(172, 88, 13, 18, 0, 0, Math.PI * 2); g.fill();
  // the grin: a wide crescent of teeth
  g.beginPath();
  g.moveTo(52, 150);
  g.quadraticCurveTo(128, 226, 206, 146);
  g.quadraticCurveTo(130, 186, 52, 150);
  g.fill();
  // tooth gaps
  g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    const x = 66 + i * 16;
    g.beginPath(); g.moveTo(x, 148 + Math.sin(i) * 6); g.lineTo(x + 4, 178 - Math.abs(4 - i) * 3); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// behaviour presets — the same silhouette, three different rules, which is
// exactly what makes learning them matter:
//   grin: classic — moves only unobserved, light banishes it
//   party: Level Fun's host — never stops walking, observed or not; only light
//   chaser: the Red Hall — ignores your gaze AND the light; outrun it or lose
const MODES = {
  grin:   { freeze: true,  lit: true,  speed: 1.7, tint: 0xffffff },
  party:  { freeze: false, lit: true,  speed: 1.05, tint: 0xffd24a },
  chaser: { freeze: false, lit: false, speed: 4.5, tint: 0xff5040 },
};

export class Entity {
  constructor(scene) {
    this.state = 'DORMANT';        // DORMANT | STALK
    this.mode = 'grin';
    this.cfg = MODES.grin;
    this.pos = new THREE.Vector3();
    this.seenOnce = false;
    this.onTouch = null;

    this.face = new THREE.Sprite(new THREE.SpriteMaterial({
      map: grinTexture(), transparent: true, opacity: 0, depthWrite: false,
    }));
    this.face.scale.setScalar(0.62);
    // the body: a tall absence
    this.body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.5, 2.5, 8),
      new THREE.MeshBasicMaterial({ color: 0x020202, transparent: true, opacity: 0 }),
    );
    scene.add(this.face, this.body);
    this._tmp = new THREE.Vector3();
  }

  spawn(x, y, z, mode = 'grin') {
    this.state = 'STALK';
    this.mode = mode;
    this.cfg = MODES[mode] || MODES.grin;
    this.face.material.color.setHex(this.cfg.tint);
    this.pos.set(x, y, z);
    this.seenOnce = false;
  }

  despawn() {
    this.state = 'DORMANT';
    this.face.material.opacity = 0;
    this.body.material.opacity = 0;
    setDrone(0);
  }

  update(dt, ctx) {
    // ctx: { player (feet Vector3), camera, litAt(x,z)->bool, zoneY }
    if (this.state !== 'STALK') { setDrone(0); return { dist: Infinity, observed: false }; }
    const head = this._tmp.set(this.pos.x, this.pos.y + 1.55, this.pos.z);
    const cam = ctx.camera.position;
    const dx = this.pos.x - ctx.player.x, dz = this.pos.z - ctx.player.z;
    const dist = Math.hypot(dx, dz);

    // observed = inside the lens cone and reasonably near
    const toE = head.clone().sub(cam).normalize();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(ctx.camera.quaternion);
    const observed = toE.dot(fwd) > 0.78 && dist < 34;

    if (observed && !this.seenOnce) { this.seenOnce = true; sfxStinger(); }

    // movement rule depends on what this one is
    const mayMove = this.cfg.freeze ? !observed : true;
    if (mayMove && dist > 0.6) {
      const speed = this.cfg.speed
        + (ctx.sprinting && this.mode !== 'chaser' ? 1.6 : 0)
        + (this.mode === 'grin' ? Math.max(0, (18 - dist)) * 0.05 : 0);
      this.pos.x -= (dx / dist) * speed * dt;
      this.pos.z -= (dz / dist) * speed * dt;
    }

    // light is a wall to it (the chaser does not care)
    if (this.cfg.lit && ctx.litAt(this.pos.x, this.pos.z)) { this.despawn(); return { dist: Infinity, observed: false }; }

    // touch: the tape skips, it leaves
    if (dist < 1.1) {
      this.onTouch && this.onTouch();
      this.despawn();
      return { dist: Infinity, observed: false, touched: true };
    }

    // presentation: the face only truly reads when observed — that beat where
    // the camera finds it is the whole scare
    this.face.position.copy(head);
    this.body.position.set(this.pos.x, this.pos.y + 1.25, this.pos.z);
    const vis = Math.max(0, 1 - dist / 34);
    this.face.material.opacity += (((observed ? 0.95 : 0.4) * vis) - this.face.material.opacity) * Math.min(1, dt * 4);
    this.body.material.opacity += ((0.85 * vis) - this.body.material.opacity) * Math.min(1, dt * 3);
    setDrone(Math.min(1, Math.max(0, 1.15 - dist / 26)));

    return { dist, observed };
  }
}
