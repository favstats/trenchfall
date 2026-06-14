// combat.js — resolves fire and melee between the British force and the horde.
// Soldiers acquire the nearest agent in range and fire on their weapon's RoF
// (hitscan); the dead that reach the wall claw the defenders down. Owns its own
// pooled FX (layered tracers, muzzle flash + light, impact sparks, blood) so the
// visuals stay local to combat. every pool is a bounded ring buffer — no per-shot
// allocation, so it holds up against the full horde.
import * as THREE from '../engine/three.js';
import { WALL_Z, GATE_W } from '../world/field.js';
import { sfxShot, sfxThud, sfxReload } from '../engine/audio.js';

const WEAPON = {
  rifle: { range: 130, cd: 0.72, dmg: 2, spread: 0.04, mag: 12, reload: 2.4 },
  mg:    { range: 155, cd: 0.11, dmg: 2, spread: 0.08, mag: 60, reload: 5.2 },
};
const MELEE_RANGE = 4.2;
const MELEE_CD = 1.1;

// ---- pooled FX -------------------------------------------------------------
// every effect lives in a fixed-size ring buffer; nothing is allocated in the
// hot path. tracers are layered (bright core + soft glow halo), muzzle flashes
// stack a flash quad + a smoke puff + a brief pooled point-light, and hits kick
// out additive sparks plus a darker gravity-fed blood spray.
const TRACER_N = 360;   // core/glow share this index space
const FLASH_N  = 200;
const PUFF_N   = 160;
const LIGHT_N  = 10;    // pooled muzzle lights — kept tiny for the WebGPU path
const SPARK_N  = 900;
const BLOOD_N  = 1100;
const HIDE_Y   = -9999;

class FX {
  constructor(scene) {
    this._o = new THREE.Object3D();

    // tracer core — a tight hot-white streak stretched along the shot
    this.tracers = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.07, 0.07, 1),
      new THREE.MeshBasicMaterial({ color: 0xfff0c0, fog: false, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
      TRACER_N);
    this.tracers.count = TRACER_N; this.tracers.frustumCulled = false;
    // tracer glow — a fatter, softer amber sheath around the same path
    this.glows = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.26, 0.26, 1),
      new THREE.MeshBasicMaterial({ color: 0xffae3a, fog: false, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false }),
      TRACER_N);
    this.glows.count = TRACER_N; this.glows.frustumCulled = false;
    this._tracer = []; for (let i = 0; i < TRACER_N; i++) this._tracer.push({ life: 0, max: 1 });
    this._thead = 0;
    scene.add(this.tracers); scene.add(this.glows);

    // muzzle flash — a hot star-burst billboard that scales out and snaps off
    const flashTex = radial(64, [[0, 'rgba(255,255,245,1)'], [0.18, 'rgba(255,236,170,.95)'], [0.45, 'rgba(255,150,46,.55)'], [1, 'rgba(0,0,0,0)']]);
    this.flashes = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: flashTex, fog: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      FLASH_N);
    this.flashes.count = FLASH_N; this.flashes.frustumCulled = false;
    this._flash = []; for (let i = 0; i < FLASH_N; i++) this._flash.push({ life: 0, max: 1, sz: 1, spin: 0 });
    this._fhead = 0;
    scene.add(this.flashes);

    // muzzle smoke — a small grey puff that drifts up and fades behind the flash
    const puffTex = radial(64, [[0, 'rgba(190,190,195,.7)'], [0.5, 'rgba(120,120,128,.35)'], [1, 'rgba(0,0,0,0)']]);
    this.puffs = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: puffTex, fog: true, transparent: true, blending: THREE.NormalBlending, depthWrite: false, opacity: 1 }),
      PUFF_N);
    this.puffs.count = PUFF_N; this.puffs.frustumCulled = false;
    this._puff = []; for (let i = 0; i < PUFF_N; i++) this._puff.push({ life: 0, max: 1, sz: 1 });
    this._phead = 0;
    scene.add(this.puffs);

    // pooled muzzle point-lights — a real one-frame pop of light at the barrel
    this._lights = [];
    for (let i = 0; i < LIGHT_N; i++) {
      const L = new THREE.PointLight(0xffd27a, 0, 16, 2);
      L.castShadow = false; L.visible = false;
      L._life = 0; L._max = 1; L._peak = 0;
      scene.add(L); this._lights.push(L);
    }
    this._lhead = 0;

    // impact sparks — bright additive points that arc off the hit and fade fast
    this.sparks = makePoints(SPARK_N, 0xffd070, 0.42, 0.95, false, THREE.AdditiveBlending);
    this._spos = this.sparks.geometry.attributes.position.array;
    this._svel = new Float32Array(SPARK_N * 3);
    this._slife = new Float32Array(SPARK_N);
    this._sn = SPARK_N; this._shead = 0;
    scene.add(this.sparks);

    // blood — darker, heavier, gravity-fed spray that reads against the snow
    this.blood = makePoints(BLOOD_N, 0x6a0a10, 0.62, 0.95, true, THREE.NormalBlending);
    this._bpos = this.blood.geometry.attributes.position.array;
    this._bvel = new Float32Array(BLOOD_N * 3);
    this._blife = new Float32Array(BLOOD_N);
    this._bn = BLOOD_N; this._bhead = 0;
    scene.add(this.blood);

    this._hideAll();
  }

  _hideAll() {
    const o = this._o; o.position.set(0, HIDE_Y, 0); o.scale.set(0.001, 0.001, 0.001); o.updateMatrix();
    for (let i = 0; i < TRACER_N; i++) { this.tracers.setMatrixAt(i, o.matrix); this.glows.setMatrixAt(i, o.matrix); }
    for (let i = 0; i < FLASH_N; i++) this.flashes.setMatrixAt(i, o.matrix);
    for (let i = 0; i < PUFF_N; i++) this.puffs.setMatrixAt(i, o.matrix);
    this.tracers.instanceMatrix.needsUpdate = true;
    this.glows.instanceMatrix.needsUpdate = true;
    this.flashes.instanceMatrix.needsUpdate = true;
    this.puffs.instanceMatrix.needsUpdate = true;
  }

  // a single shot: tracer streak from->to, plus a layered muzzle flash at `from`.
  // heavy=true for emplacement belts — fatter flash, brighter light, longer streak.
  shot(from, to, heavy) {
    const o = this._o;
    const dist = from.distanceTo(to) || 1;

    // ---- tracer (core + glow share the index, slightly different width) ----
    const ti = this._thead; this._thead = (this._thead + 1) % TRACER_N;
    const t = this._tracer[ti];
    t.life = heavy ? 0.085 : 0.06; t.max = t.life;
    // streak doesn't span the whole flight — a bright leading segment reads faster
    const len = Math.min(dist, (heavy ? 36 : 22) + Math.random() * 10);
    // place the streak's far end at the impact, body trailing back toward the gun
    const cx = to.x + (from.x - to.x) * (len / dist) * 0.5;
    const cy = to.y + (from.y - to.y) * (len / dist) * 0.5;
    const cz = to.z + (from.z - to.z) * (len / dist) * 0.5;
    o.position.set(cx, cy, cz);
    o.lookAt(to);
    const wob = 0.8 + Math.random() * 0.5;
    o.scale.set(wob, wob, len);
    o.updateMatrix();
    this.tracers.setMatrixAt(ti, o.matrix);
    const gw = wob * (heavy ? 1.5 : 1.2);
    o.scale.set(gw, gw, len);
    o.updateMatrix();
    this.glows.setMatrixAt(ti, o.matrix);
    this.tracers.instanceMatrix.needsUpdate = true;
    this.glows.instanceMatrix.needsUpdate = true;

    // ---- muzzle flash billboard ----
    const fi = this._fhead; this._fhead = (this._fhead + 1) % FLASH_N;
    const f = this._flash[fi];
    f.life = heavy ? 0.07 : 0.05; f.max = f.life;
    f.sz = (heavy ? 4.2 : 2.6) * (0.85 + Math.random() * 0.4);
    f.spin = Math.random() * Math.PI;
    o.position.copy(from); o.quaternion.set(0, 0, 0, 1); o.rotation.z = f.spin;
    o.scale.set(f.sz, f.sz, f.sz); o.updateMatrix();
    this.flashes.setMatrixAt(fi, o.matrix);
    this.flashes.instanceMatrix.needsUpdate = true;

    // ---- smoke puff just past the muzzle ----
    const pi = this._phead; this._phead = (this._phead + 1) % PUFF_N;
    const pf = this._puff[pi];
    pf.life = heavy ? 0.34 : 0.22; pf.max = pf.life;
    pf.sz = heavy ? 2.4 : 1.5;
    const fdx = (to.x - from.x) / dist, fdz = (to.z - from.z) / dist;
    o.position.set(from.x + fdx * 1.1, from.y + 0.15, from.z + fdz * 1.1);
    o.rotation.z = Math.random() * Math.PI;
    o.scale.set(pf.sz, pf.sz, pf.sz); o.updateMatrix();
    this.puffs.setMatrixAt(pi, o.matrix);
    this.puffs.instanceMatrix.needsUpdate = true;

    // ---- pooled point-light pop ----
    const li = this._lhead; this._lhead = (this._lhead + 1) % LIGHT_N;
    const L = this._lights[li];
    L.position.set(from.x, from.y, from.z);
    L._peak = heavy ? 9 : 5.5; L._life = heavy ? 0.07 : 0.05; L._max = L._life;
    L.intensity = L._peak; L.visible = true;
  }

  // hit feedback at the impact point: a fan of hot sparks + a dark blood spray
  burst(p) {
    // sparks: bright, fast, short-lived, light gravity
    for (let k = 0; k < 7; k++) {
      const i = this._shead; this._shead = (this._shead + 1) % this._sn;
      this._spos[i * 3] = p.x; this._spos[i * 3 + 1] = p.y; this._spos[i * 3 + 2] = p.z;
      const ang = Math.random() * Math.PI * 2, sp = 5 + Math.random() * 9;
      this._svel[i * 3] = Math.cos(ang) * sp;
      this._svel[i * 3 + 1] = 3 + Math.random() * 7;
      this._svel[i * 3 + 2] = Math.sin(ang) * sp;
      this._slife[i] = 0.12 + Math.random() * 0.18;
    }
    // blood: darker, slower, heavier, arcs and falls toward the snow
    for (let k = 0; k < 9; k++) {
      const i = this._bhead; this._bhead = (this._bhead + 1) % this._bn;
      this._bpos[i * 3] = p.x; this._bpos[i * 3 + 1] = p.y + 0.2; this._bpos[i * 3 + 2] = p.z;
      const ang = Math.random() * Math.PI * 2, sp = 1.5 + Math.random() * 4.5;
      this._bvel[i * 3] = Math.cos(ang) * sp;
      this._bvel[i * 3 + 1] = 2 + Math.random() * 5;
      this._bvel[i * 3 + 2] = Math.sin(ang) * sp;
      this._blife[i] = 0.55 + Math.random() * 0.5;
    }
  }

  update(dt) {
    const o = this._o;

    // tracers fade by life; cull the dead back to the hide pose
    let tu = false;
    for (let i = 0; i < TRACER_N; i++) {
      const t = this._tracer[i];
      if (t.life > 0) {
        t.life -= dt;
        if (t.life <= 0) {
          o.position.set(0, HIDE_Y, 0); o.scale.set(0.001, 0.001, 0.001); o.quaternion.set(0, 0, 0, 1); o.updateMatrix();
          this.tracers.setMatrixAt(i, o.matrix); this.glows.setMatrixAt(i, o.matrix); tu = true;
        }
      }
    }
    if (tu) { this.tracers.instanceMatrix.needsUpdate = true; this.glows.instanceMatrix.needsUpdate = true; }

    // muzzle flash: brief, then snap out
    let fu = false;
    for (let i = 0; i < FLASH_N; i++) {
      const f = this._flash[i];
      if (f.life > 0) {
        f.life -= dt;
        if (f.life <= 0) {
          o.position.set(0, HIDE_Y, 0); o.scale.set(0.001, 0.001, 0.001); o.rotation.z = 0; o.updateMatrix();
          this.flashes.setMatrixAt(i, o.matrix); fu = true;
        }
      }
    }
    if (fu) this.flashes.instanceMatrix.needsUpdate = true;

    // smoke puff: fades out behind the flash
    let pu = false;
    for (let i = 0; i < PUFF_N; i++) {
      const pf = this._puff[i];
      if (pf.life > 0) {
        pf.life -= dt;
        if (pf.life <= 0) {
          o.position.set(0, HIDE_Y, 0); o.scale.set(0.001, 0.001, 0.001); o.rotation.z = 0; o.updateMatrix();
          this.puffs.setMatrixAt(i, o.matrix); pu = true;
        }
      }
    }
    if (pu) this.puffs.instanceMatrix.needsUpdate = true;

    // pooled lights: decay the pop toward zero, then switch off
    for (let i = 0; i < LIGHT_N; i++) {
      const L = this._lights[i];
      if (L._life > 0) {
        L._life -= dt;
        const k = Math.max(0, L._life / L._max);
        L.intensity = L._peak * k * k;
        if (L._life <= 0) { L.intensity = 0; L.visible = false; }
      }
    }

    // sparks: fast points, light gravity, drag, hide when spent
    const SP = this._spos, SV = this._svel, SL = this._slife;
    for (let i = 0; i < this._sn; i++) {
      if (SL[i] > 0) {
        SL[i] -= dt;
        SP[i * 3] += SV[i * 3] * dt;
        SP[i * 3 + 1] += SV[i * 3 + 1] * dt; SV[i * 3 + 1] -= 16 * dt;
        SP[i * 3 + 2] += SV[i * 3 + 2] * dt;
        SV[i * 3] *= 0.9; SV[i * 3 + 2] *= 0.9;
        if (SL[i] <= 0) SP[i * 3 + 1] = HIDE_Y;
      }
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;

    // blood: heavier gravity, arcs, hides when spent
    const BP = this._bpos, BV = this._bvel, BL = this._blife;
    for (let i = 0; i < this._bn; i++) {
      if (BL[i] > 0) {
        BL[i] -= dt;
        BP[i * 3] += BV[i * 3] * dt;
        BP[i * 3 + 1] += BV[i * 3 + 1] * dt; BV[i * 3 + 1] -= 13 * dt;
        BP[i * 3 + 2] += BV[i * 3 + 2] * dt;
        if (BL[i] <= 0) BP[i * 3 + 1] = HIDE_Y;
      }
    }
    this.blood.geometry.attributes.position.needsUpdate = true;
  }
}

function makePoints(n, color, size, opacity, fog, blending) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3).fill(HIDE_Y);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    color, size, transparent: true, opacity, depthWrite: false, fog,
    blending: blending ?? THREE.NormalBlending,
  }));
  pts.frustumCulled = false;
  return pts;
}

function radial(size, stops) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const r = size / 2;
  const grd = g.createRadialGradient(r, r, 0, r, r, r);
  for (const [p, col] of stops) grd.addColorStop(p, col);
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---- combat ----------------------------------------------------------------
export class Combat {
  constructor(scene, force, horde, state) {
    this.force = force; this.horde = horde; this.state = state;
    this.fx = new FX(scene);
    this._from = new THREE.Vector3(); this._to = new THREE.Vector3();
  }

  update(dt) {
    const { force, horde, state, fx } = this;

    // ---- soldiers fire ----
    for (const m of force.soldiers) {
      if (!m.alive || m.possessed) continue;  // possessed soldier is player-driven
      if (m.squad.type === 'engineer') continue;
      m.reload -= dt;
      if (m.reload > 0) continue;
      m.reloading = false;
      const w = WEAPON[m.squad.type] || WEAPON.rifle;
      if (m.squad.holdFire) continue;
      const cover = horde.field.coverAt?.(m.pos.x, m.pos.z);
      const heap = horde.heapAt?.(m.pos.x, m.pos.z) || 0;
      const heapReload = heap > 1.5 ? 0.84 : 1; // a wall of the dead is cover too
      const idx = horde.nearestTo(m.pos.x, m.pos.z, w.range * (cover?.rangeMul ?? 1));
      if (idx < 0) continue;
      const a = horde.agents[idx];
      m.faceTo(a.x, a.z);
      if (m.mag === undefined) m.mag = w.mag;
      const fr = state.fireRate || 1; // CADENCE research speeds the whole line up
      if (--m.mag <= 0) {                       // empty — work the bolt / change the belt
        m.mag = w.mag; m.reload = w.reload * (cover?.reloadMul ?? 1) * fr; m.reloading = true;
      } else {
        m.reload = w.cd * (cover?.reloadMul ?? 1) * heapReload * fr * (0.85 + Math.random() * 0.3);
      }
      sfxShot();
      state.noise = Math.min(100, (state.noise || 0) + (m.squad.type === 'mg' ? 0.055 : 0.022));

      this._from.set(m.pos.x, m.pos.y + 2.4, m.pos.z);
      this._to.set(a.x + (Math.random() - 0.5) * 2, horde.field.heightAt(a.x, a.z) + 1.2, a.z);
      fx.shot(this._from, this._to);

      const lit = horde.field.targetVulnerabilityAt?.(a.x, a.z);
      a.hp -= w.dmg * (cover?.damageMul ?? 1) * (lit?.damageMul ?? 1) * (state.might || 1);
      if (a.hp <= 0) {
        fx.burst(this._to);
        horde.kill(idx);   // leaves a corpse + grows the heap
        state.kills++;
      }
    }

    // ---- the dead claw at the line ----
    for (let i = 0; i < horde.agents.length; i++) {
      const a = horde.agents[i];
      if (a.dead) continue;
      const atWall = a.z >= WALL_Z - 2;
      const m = this._nearestSoldier(a.x, a.z, MELEE_RANGE);
      if (!atWall && !m) continue;
      a.atk = (a.atk || 0) - dt;
      if (a.atk > 0) continue;
      if (atWall) {
        horde.field.damageEnvironment?.(a.x, horde.field.heightAt(a.x, a.z), a.z,
          { radius: 1.6, damage: 1.1, crater: 0, visible: false });
      }
      if (!m) continue;
      a.atk = MELEE_CD;
      const cover = horde.field.coverAt?.(m.pos.x, m.pos.z);
      let dmg = cover?.meleeMul ?? 1;
      const heap = horde.heapAt?.(m.pos.x, m.pos.z) || 0;
      if (heap > 1.5) dmg *= Math.max(0.4, 1 - heap * 0.12); // bodies shield the line
      if (a.giant) dmg *= 5;                                  // giants crush the line
      m.hp -= dmg;
      if (m.hp <= 0) { m.kill(); state.menLost++; }
    }

    // ---- the fallen rise — your own dead turn against you ----
    for (const m of force.soldiers) {
      if (!m.alive && !m.risen && m.deadT >= 4) {
        horde.spawnAt(m.pos.x, m.pos.z);
        m.risen = true; state.menRisen++;
      }
    }

    // ---- emplaced MG nests & watchtowers wreak havoc on the tide ----
    const emps = horde.field.emplacements?.() || [];
    for (const e of emps) {
      e._cd = (e._cd || 0) - dt;
      if (e._cd > 0) continue;
      const isTower = e.kind === 'tower';
      if (e._belt === undefined) e._belt = isTower ? 10 : 60;
      const idx = horde.nearestTo(e.x, e.z, isTower ? 185 : 155);
      if (idx < 0) { e._cd = 0.4; e._reloading = false; continue; }
      const a = horde.agents[idx];
      if (--e._belt <= 0) {                     // belt/clip empty — work the reload
        e._belt = isTower ? 10 : 60;
        e._cd = isTower ? 2.0 : 3.6;
        e._reloading = true;
        continue;
      }
      e._reloading = false;
      e._cd = isTower ? 0.42 : 0.07;            // the nest is a sustained brrrt
      if (e.muzzle && e.group) {
        this._from.copy(e.muzzle);
        e.group.localToWorld(this._from);
      } else {
        this._from.set(e.x, horde.field.heightAt(e.x, e.z) + (isTower ? 6.2 : 1.5), e.z);
      }
      this._to.set(a.x + (Math.random() - 0.5) * 1.6, horde.field.heightAt(a.x, a.z) + 1.2, a.z);
      fx.shot(this._from, this._to, true); // emplacement belt — heavier flash + stream
      state.noise = Math.min(100, (state.noise || 0) + (isTower ? 0.035 : 0.08));
      const lit = horde.field.targetVulnerabilityAt?.(a.x, a.z);
      a.hp -= (isTower ? 4 : 3) * (lit?.damageMul ?? 1);
      if (a.hp <= 0) { fx.burst(this._to); horde.kill(idx); state.kills++; }
      if (!isTower) { // the burst sprays — neighbours in the beaten zone get chewed up
        for (let s = 0; s < 2; s++) {
          const j = horde.nearestTo(a.x + (Math.random() - 0.5) * 7, a.z - 1, 9);
          if (j < 0 || j === idx) continue;
          const b = horde.agents[j];
          this._to.set(b.x, horde.field.heightAt(b.x, b.z) + 1.2, b.z);
          fx.shot(this._from, this._to, true); // beaten-zone spray stays heavy
          b.hp -= 3;
          if (b.hp <= 0) { fx.burst(this._to); horde.kill(j); state.kills++; }
        }
      }
    }

    fx.update(dt);
  }

  // a shot fired by the possessed soldier along its aim — nearest agent in a
  // forward cone takes the hit (tracer always drawn so it reads as firing)
  playerShot(avatar, yaw) {
    const { horde, fx, state } = this;
    if (avatar.reload > 0) return;            // still reloading
    const W = WEAPON.rifle;
    avatar.mag = (avatar.mag ?? W.mag) - 1;
    if (avatar.mag <= 0) { avatar.mag = W.mag; avatar.reload = W.reload; avatar.reloading = true; }
    else avatar.reloading = false;
    const fwx = -Math.sin(yaw), fwz = -Math.cos(yaw);
    const ox = avatar.pos.x, oz = avatar.pos.z, range = 150;
    let best = -1, bestT = 1e9;
    for (let i = 0; i < horde.agents.length; i++) {
      const a = horde.agents[i];
      if (a.dead) continue;
      const dx = a.x - ox, dz = a.z - oz;
      const t = dx * fwx + dz * fwz;            // distance along aim
      if (t < 2 || t > range) continue;
      const perp = Math.abs(dx * fwz - dz * fwx);
      if (perp > 2.5 + t * 0.05) continue;       // cone
      if (t < bestT) { bestT = t; best = i; }
    }
    const from = this._from.set(avatar.pos.x, avatar.pos.y + 2.4, avatar.pos.z);
    if (best < 0) {
      fx.shot(from, this._to.set(ox + fwx * range, avatar.pos.y + 2.2, oz + fwz * range));
      state.noise = Math.min(100, (state.noise || 0) + 0.03);
      return;
    }
    const a = horde.agents[best];
    fx.shot(from, this._to.set(a.x, horde.field.heightAt(a.x, a.z) + 1.2, a.z));
    state.noise = Math.min(100, (state.noise || 0) + 0.03);
    const lit = horde.field.targetVulnerabilityAt?.(a.x, a.z);
    a.hp -= 2 * (lit?.damageMul ?? 1) * (this.state.might || 1);
    if (a.hp <= 0) { fx.burst(this._to); horde.kill(best); state.kills++; }
  }

  _nearestSoldier(x, z, maxD) {
    let best = null, bd = maxD * maxD;
    for (const m of this.force.soldiers) {
      if (!m.alive) continue;
      const d = (m.pos.x - x) ** 2 + (m.pos.z - z) ** 2;
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }
}
