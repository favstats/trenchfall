// combat.js — the battle. Two lines of part-built men advance, pick the
// nearest living enemy, wind up, and cut. Archers loft real arrows. Kill-blows
// feed the gore system: parts fly by damage and angle, armor halves the odds.
// Break 70% of a side and the rest rout for the treeline.
import * as THREE from './engine/three.js';
import { Soldier } from './soldier.js';
import { heightAt } from './world.js';
import { sfxClang, sfxFlesh, sfxSever, sfxDeath, sfxArrow, setRoar } from './engine/audio.js';

const ARROW_N = 60;

export class Battle {
  constructor(scene, world, gore) {
    this.scene = scene; this.world = world; this.gore = gore;
    this.allies = []; this.enemies = [];
    this.kills = 0; this.dismembered = 0; this.losses = 0;
    this.order = 'advance';
    this.result = null;
    this._dir = new THREE.Vector3();

    // arrow pool
    this.arrows = [];
    const aGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.7, 4);
    aGeo.rotateX(Math.PI / 2);
    const aMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2c });
    for (let i = 0; i < ARROW_N; i++) {
      const m = new THREE.Mesh(aGeo, aMat);
      m.visible = false;
      scene.add(m);
      this.arrows.push({ m, vel: new THREE.Vector3(), life: 0, from: null });
    }
    this._aHead = 0;
  }

  spawn(side, counts) {
    const list = side === 'blue' ? this.allies : this.enemies;
    const zBase = side === 'blue' ? 42 : -42;
    let col = 0;
    const put = (type, n) => {
      for (let i = 0; i < n; i++) {
        const row = (col / 14) | 0;
        const x = ((col % 14) - 6.5) * 2.4 + (Math.random() - 0.5);
        const z = zBase + (side === 'blue' ? 1 : -1) * (row * 2.6 + (type === 'archer' ? 8 : 0));
        const s = new Soldier(this.scene, x, z, side, type);
        s.faceTo(x, 0);
        s.anchor = { x, z };
        list.push(s);
        col++;
      }
    };
    put('foot', counts.foot || 0);
    put('knight', counts.knight || 0);
    put('archer', counts.archer || 0);
  }

  clear() {
    for (const s of [...this.allies, ...this.enemies]) s.dispose();
    this.allies = []; this.enemies = [];
    this.kills = 0; this.dismembered = 0; this.losses = 0;
    this.result = null; this.order = 'advance';
  }

  aliveOf(list) { return list.filter(s => s.alive && s.order !== 'rout'); }

  // ---- the gore verdict on a kill ----
  _slaughter(s, dmg, dir, byPlayer) {
    s.kill();
    sfxDeath();
    this.world.puffDust(s.pos.x, s.pos.y + 0.3, s.pos.z, true);
    this.gore.blood(s.pos.x, s.pos.y + 1.4, s.pos.z, dir, 16, 1);
    this.gore.stain(s.pos.x, s.pos.z, 1.2);
    let armor = s.type === 'knight' ? 0.5 : 1;
    let parts = [];
    const roll = Math.random() / armor;
    if (dmg >= 50 && roll > 0.35) parts = ['torso', Math.random() < 0.5 ? 'head' : 'armR'];  // overkill
    else if (roll > 1.05) parts = [];
    else if (roll > 0.75) parts = ['head'];
    else if (roll > 0.45) parts = [Math.random() < 0.5 ? 'armR' : 'armL'];
    else if (roll > 0.28) parts = [Math.random() < 0.5 ? 'legL' : 'legR'];
    for (const part of parts) {
      const info = s.severPart(part);
      if (info) {
        this.gore.sever(info, dir);
        this.dismembered++;
        sfxSever();
      }
    }
    if (parts.length && byPlayer) this.gore.splashLens(parts.includes('torso') ? 1.6 : 1);
    return parts;
  }

  // player swings and hooves call this: hurt everything hostile in the arc
  damageArc(x, z, facing, range, arc, dmg, byPlayer = true) {
    let hits = 0, killed = 0, severed = 0;
    for (const s of this.enemies) {
      if (!s.alive) continue;
      const dx = s.pos.x - x, dz = s.pos.z - z;
      const d = Math.hypot(dx, dz);
      if (d > range) continue;
      const ang = Math.atan2(dx, dz);
      let dd = Math.abs(ang - facing);
      if (dd > Math.PI) dd = Math.PI * 2 - dd;
      if (dd > arc) continue;
      hits++;
      s.hp -= dmg * (0.85 + Math.random() * 0.4);
      this._dir.set(dx / (d || 1), 0, dz / (d || 1));
      this.gore.blood(s.pos.x, s.pos.y + 1.3, s.pos.z, this._dir, 8, 0.8);
      if (s.hp <= 0) {
        const parts = this._slaughter(s, dmg, this._dir, byPlayer);
        killed++; severed += parts.length;
        this.kills++;
      } else sfxFlesh();
    }
    return { hits, killed, severed };
  }

  _fireArrow(s, target) {
    const a = this.arrows[this._aHead]; this._aHead = (this._aHead + 1) % ARROW_N;
    a.m.visible = true;
    a.m.position.set(s.pos.x, s.pos.y + 1.7, s.pos.z);
    const dx = target.x - s.pos.x, dz = target.z - s.pos.z;
    const d = Math.hypot(dx, dz), t = d / 24;
    a.vel.set(dx / t / 1, (target.y - s.pos.y - 1.7) / t + 4.9 * t, dz / t);
    a.life = t + 1.5;
    a.from = s.faction;
    sfxArrow();
  }

  update(dt, player) {
    const both = [this.allies, this.enemies];
    // rout check
    for (const list of both) {
      const alive = list.filter(s => s.alive);
      if (list.length >= 10 && alive.length > 0 && alive.length < list.length * 0.3) {
        for (const s of alive) if (s.order !== 'rout' && Math.random() < dt * 1.5) s.order = 'rout';
      }
    }

    for (let li = 0; li < 2; li++) {
      const list = both[li], foes = both[1 - li];
      const isAlly = li === 0;
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        s.update(dt);
        if (!s.alive) continue;

        if (s.order === 'rout') {
          s.moving = true;
          const dirZ = isAlly ? 1 : -1;
          s.heading = Math.atan2(0, dirZ);
          s.pos.z += dirZ * s.speed * 1.2 * dt;
          if (Math.abs(s.pos.z) > 115) { s.alive = false; s.g.visible = false; }
          continue;
        }

        // target: nearest living foe (staggered), the player counts for enemies
        if ((i + ((performance.now() / 100) | 0)) % 6 === 0 || !s.target || !s.target.alive) {
          let best = null, bd = 1e9;
          for (const f of foes) {
            if (!f.alive) continue;
            const d2 = (f.pos.x - s.pos.x) ** 2 + (f.pos.z - s.pos.z) ** 2;
            if (d2 < bd) { bd = d2; best = f; }
          }
          if (!isAlly && player && player.alive) {
            const pd2 = (player.pos.x - s.pos.x) ** 2 + (player.pos.z - s.pos.z) ** 2;
            if (pd2 < bd) { best = player; bd = pd2; }
          }
          s.target = best;
        }
        const t = s.target;
        if (!t) { s.moving = false; continue; }
        const dx = t.pos.x - s.pos.x, dz = t.pos.z - s.pos.z;
        const d = Math.hypot(dx, dz);

        // orders (allies only)
        let mayAdvance = true;
        if (isAlly && this.order === 'hold') mayAdvance = d < 7;
        let gx = t.pos.x, gz = t.pos.z;
        if (isAlly && this.order === 'follow' && player) {
          if (d > 9) { gx = player.pos.x + Math.sin(i) * 5; gz = player.pos.z + Math.cos(i * 1.7) * 5; }
        }

        if (s.type === 'archer') {
          s.moving = false;
          s.faceTo(t.pos.x, t.pos.z);
          s.atkCd = (s.atkCd || Math.random() * 2) - dt;
          if (s.atkCd <= 0 && d < 70 && d > 6) {
            s.atkCd = 2.6 + Math.random() * 1.4;
            this._fireArrow(s, { x: t.pos.x + (Math.random() - 0.5) * 3, y: heightAt(t.pos.x, t.pos.z), z: t.pos.z + (Math.random() - 0.5) * 3 });
          }
          if (d < 5) { // too close — scramble back
            s.moving = true;
            s.pos.x -= (dx / d) * s.speed * dt; s.pos.z -= (dz / d) * s.speed * dt;
          }
          continue;
        }

        if (d > s.range && mayAdvance) {
          s.moving = true;
          const mx = gx - s.pos.x, mz = gz - s.pos.z, md = Math.hypot(mx, mz) || 1;
          s.faceTo(gx, gz);
          s.pos.x += (mx / md) * s.speed * dt;
          s.pos.z += (mz / md) * s.speed * dt;
          if (Math.random() < dt * 1.2) this.world.puffDust(s.pos.x, s.pos.y, s.pos.z);
        } else {
          s.moving = false;
          s.faceTo(t.pos.x, t.pos.z);
          if (d <= s.range + 0.6) {
            if (s.windup <= 0 && s.atkT <= 0 && !s._swinging) {
              s._swinging = true;
              s.beginSwing(0.42 + Math.random() * 0.2);
            } else if (s._swinging && s.windup <= 0) {
              s._swinging = false;
              s.releaseSwing();
              // the blow lands
              if (t === player) {
                player.takeHit(s.dmg, { x: dx / (d || 1), z: dz / (d || 1) }, s);
              } else {
                t.hp -= s.dmg * (0.8 + Math.random() * 0.5);
                this._dir.set(dx / (d || 1), 0, dz / (d || 1));
                if (t.hp <= 0) {
                  this._slaughter(t, s.dmg, this._dir, false);
                  if (isAlly) this.kills++; else this.losses++;
                } else if (Math.random() < 0.35) sfxClang(); else sfxFlesh();
              }
            }
          }
        }
      }
    }

    // arrows fly, arc, land
    for (const a of this.arrows) {
      if (a.life <= 0) continue;
      a.life -= dt;
      a.vel.y -= 9.8 * dt;
      a.m.position.addScaledVector(a.vel, dt);
      a.m.lookAt(a.m.position.x + a.vel.x, a.m.position.y + a.vel.y, a.m.position.z + a.vel.z);
      const gy = heightAt(a.m.position.x, a.m.position.z);
      // strike a body?
      const foes = a.from === 'blue' ? this.enemies : this.allies;
      for (const s of foes) {
        if (!s.alive) continue;
        const d2 = (s.pos.x - a.m.position.x) ** 2 + (s.pos.z - a.m.position.z) ** 2;
        if (d2 < 0.5 && a.m.position.y < s.pos.y + 2.2) {
          s.hp -= 26;
          this._dir.set(a.vel.x, 0, a.vel.z).normalize();
          this.gore.blood(s.pos.x, a.m.position.y, s.pos.z, this._dir, 6, 0.7);
          if (s.hp <= 0) {
            this._slaughter(s, 26, this._dir, false);
            if (a.from === 'blue') this.kills++; else this.losses++;
          } else sfxFlesh();
          a.life = 0; a.m.visible = false;
          break;
        }
      }
      if (a.life > 0 && player && player.alive && a.from === 'red') {
        const d2 = (player.pos.x - a.m.position.x) ** 2 + (player.pos.z - a.m.position.z) ** 2;
        if (d2 < 0.45 && a.m.position.y < player.pos.y + 2.2) {
          player.takeHit(16, { x: a.vel.x * 0.1, z: a.vel.z * 0.1 }, null);
          a.life = 0; a.m.visible = false;
        }
      }
      if (a.m.position.y <= gy + 0.05) { a.vel.set(0, 0, 0); a.life = Math.min(a.life, 4); }
      if (a.life <= 0) a.m.visible = false;
    }

    // the roar of it rises and falls with the living
    const fighting = Math.min(this.aliveOf(this.allies).length, this.aliveOf(this.enemies).length);
    setRoar(Math.min(1, fighting / 22));

    // result
    if (!this.result) {
      const eLeft = this.enemies.filter(s => s.alive && s.order !== 'rout').length;
      const aLeft = this.allies.filter(s => s.alive && s.order !== 'rout').length;
      if (this.enemies.length && eLeft === 0) this.result = 'win';
      else if (this.allies.length && aLeft === 0 && player && !player.alive) this.result = 'lose';
    }
  }
}
