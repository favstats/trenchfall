// combat.js — resolves fire and melee between the British force and the horde.
// Soldiers acquire the nearest agent in range and fire on their weapon's RoF
// (hitscan); the dead that reach the wall claw the defenders down. Owns its own
// pooled FX (tracers, muzzle flash, blood) so the visuals stay local to combat.
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
class FX {
  constructor(scene) {
    this._o = new THREE.Object3D();

    // tracers: thin emissive boxes stretched along the shot
    this.tracers = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.08, 0.08, 1),
      new THREE.MeshBasicMaterial({ color: 0xffd98a, fog: false, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
      300);
    this.tracers.count = 300; this.tracers.frustumCulled = false;
    this._tracer = []; for (let i = 0; i < 300; i++) this._tracer.push({ life: 0 });
    scene.add(this.tracers);

    // muzzle flashes: additive billboards
    const flashTex = radial(64, [[0, 'rgba(255,247,210,1)'], [0.3, 'rgba(255,180,70,.8)'], [1, 'rgba(0,0,0,0)']]);
    this.flashes = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(2.4, 2.4),
      new THREE.MeshBasicMaterial({ map: flashTex, fog: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      150);
    this.flashes.count = 150; this.flashes.frustumCulled = false;
    this._flash = []; for (let i = 0; i < 150; i++) this._flash.push({ life: 0 });
    scene.add(this.flashes);

    // blood: dark-red points with gravity
    const N = 600;
    const geo = new THREE.BufferGeometry();
    this._bpos = new Float32Array(N * 3).fill(-9999);
    this._bvel = new Float32Array(N * 3);
    this._blife = new Float32Array(N);
    geo.setAttribute('position', new THREE.BufferAttribute(this._bpos, 3));
    this.blood = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x7a0c12, size: 0.5, transparent: true, opacity: 0.92, depthWrite: false, fog: true,
    }));
    this.blood.frustumCulled = false; this._bn = N; this._bhead = 0;
    scene.add(this.blood);

    this._hideAll();
  }

  _hideAll() {
    const o = this._o; o.position.set(0, -9999, 0); o.scale.set(0.001, 0.001, 0.001); o.updateMatrix();
    for (let i = 0; i < this._tracer.length; i++) this.tracers.setMatrixAt(i, o.matrix);
    for (let i = 0; i < this._flash.length; i++) this.flashes.setMatrixAt(i, o.matrix);
    this.tracers.instanceMatrix.needsUpdate = true;
    this.flashes.instanceMatrix.needsUpdate = true;
  }

  shot(from, to) {
    // tracer
    let ti = this._tracer.findIndex(t => t.life <= 0);
    if (ti < 0) ti = 0;
    const t = this._tracer[ti]; t.life = 0.06;
    const o = this._o;
    o.position.copy(from).lerp(to, 0.5);
    o.lookAt(to);
    o.scale.set(1, 1, from.distanceTo(to));
    o.updateMatrix();
    this.tracers.setMatrixAt(ti, o.matrix);
    this.tracers.instanceMatrix.needsUpdate = true;
    // muzzle flash
    let fi = this._flash.findIndex(f => f.life <= 0);
    if (fi < 0) fi = 0;
    const f = this._flash[fi]; f.life = 0.05;
    o.position.copy(from); o.scale.set(1, 1, 1); o.quaternion.set(0, 0, 0, 1); o.updateMatrix();
    this.flashes.setMatrixAt(fi, o.matrix);
    this.flashes.instanceMatrix.needsUpdate = true;
  }

  burst(p) {
    for (let k = 0; k < 6; k++) {
      const i = this._bhead; this._bhead = (this._bhead + 1) % this._bn;
      this._bpos[i * 3] = p.x; this._bpos[i * 3 + 1] = p.y + 1.2; this._bpos[i * 3 + 2] = p.z;
      this._bvel[i * 3] = (Math.random() - 0.5) * 4;
      this._bvel[i * 3 + 1] = 2 + Math.random() * 4;
      this._bvel[i * 3 + 2] = (Math.random() - 0.5) * 4;
      this._blife[i] = 0.5 + Math.random() * 0.3;
    }
  }

  update(dt) {
    const o = this._o;
    let tu = false, fu = false;
    for (let i = 0; i < this._tracer.length; i++) {
      const t = this._tracer[i];
      if (t.life > 0) { t.life -= dt; if (t.life <= 0) { o.position.set(0, -9999, 0); o.scale.set(0.001, 0.001, 0.001); o.quaternion.set(0, 0, 0, 1); o.updateMatrix(); this.tracers.setMatrixAt(i, o.matrix); tu = true; } }
    }
    for (let i = 0; i < this._flash.length; i++) {
      const f = this._flash[i];
      if (f.life > 0) { f.life -= dt; if (f.life <= 0) { o.position.set(0, -9999, 0); o.scale.set(0.001, 0.001, 0.001); o.updateMatrix(); this.flashes.setMatrixAt(i, o.matrix); fu = true; } }
    }
    if (tu) this.tracers.instanceMatrix.needsUpdate = true;
    if (fu) this.flashes.instanceMatrix.needsUpdate = true;

    const P = this._bpos, V = this._bvel, L = this._blife;
    for (let i = 0; i < this._bn; i++) {
      if (L[i] > 0) {
        L[i] -= dt;
        P[i * 3] += V[i * 3] * dt;
        P[i * 3 + 1] += V[i * 3 + 1] * dt; V[i * 3 + 1] -= 11 * dt;
        P[i * 3 + 2] += V[i * 3 + 2] * dt;
        if (L[i] <= 0) P[i * 3 + 1] = -9999;
      }
    }
    this.blood.geometry.attributes.position.needsUpdate = true;
  }
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
      fx.shot(this._from, this._to);
      const lit = horde.field.targetVulnerabilityAt?.(a.x, a.z);
      a.hp -= (isTower ? 4 : 3) * (lit?.damageMul ?? 1);
      if (a.hp <= 0) { fx.burst(this._to); horde.kill(idx); state.kills++; }
      if (!isTower) { // the burst sprays — neighbours in the beaten zone get chewed up
        for (let s = 0; s < 2; s++) {
          const j = horde.nearestTo(a.x + (Math.random() - 0.5) * 7, a.z - 1, 9);
          if (j < 0 || j === idx) continue;
          const b = horde.agents[j];
          this._to.set(b.x, horde.field.heightAt(b.x, b.z) + 1.2, b.z);
          fx.shot(this._from, this._to);
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
      return;
    }
    const a = horde.agents[best];
    fx.shot(from, this._to.set(a.x, horde.field.heightAt(a.x, a.z) + 1.2, a.z));
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
