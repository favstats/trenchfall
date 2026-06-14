// squads.js — the British force: squads of soldiers with selection, orders, and
// line-formation movement. Selection/box-select/order helpers live here so main
// only wires input events to them.
import * as THREE from '../engine/three.js';
import { Soldier } from './soldier.js';
import { WALL_Z, FIELD_HALF_X, WALL_T, RAMP_D } from '../world/field.js';

const SPACING = 2.6;

export class Squad {
  constructor(scene, label, type, x, z, n, state) {
    this.label = label;
    this.type = type;           // 'rifle' | 'mg'
    this.state = state;
    this.selected = false;
    this.holdFire = false;
    this.order = 'HOLD';        // HOLD | MOVE | ATTACK_MOVE | FALL_BACK
    this.anchor = new THREE.Vector2(x, z);
    this.facing = 1;            // +1 face north (-z) toward enemy
    this.members = [];
    for (let i = 0; i < n; i++) {
      const s = new Soldier(scene, x + this._slotX(i, n), z, this);
      s.heading = 0; // face -z (north)
      this.members.push(s);
    }
  }

  _slotX(i, n) { return (i - (n - 1) / 2) * SPACING; }

  get alive() { return this.members.filter(m => m.alive); }
  get count() { return this.alive.length; }
  get dead() { return this.count === 0; }

  centroid() {
    const a = this.alive; if (!a.length) return this.anchor.clone();
    let x = 0, z = 0; for (const m of a) { x += m.pos.x; z += m.pos.z; }
    return new THREE.Vector2(x / a.length, z / a.length);
  }

  setSelected(v) { this.selected = v; for (const m of this.members) m.setSelected(v); }

  giveOrder(type, x, z) {
    this.order = type;
    if (x !== undefined) this.anchor.set(x, z);
    const a = this.alive, n = a.length;
    a.forEach((m, i) => m.moveTo(this.anchor.x + this._slotX(i, n), this.anchor.y));
  }

  update(dt) { for (const m of this.members) m.update(dt); }
}

export class Force {
  constructor(scene, state) {
    this.scene = scene;
    this.state = state;
    this.squads = [];

    const onWall = WALL_Z;                          // standing on the rampart
    const behind = WALL_Z + WALL_T / 2 + RAMP_D + 7; // mustered behind the embankment
    // two rifle squads man the wall; one rifle squad + MG team wait below
    this.squads.push(new Squad(scene, '1 RIFLES', 'rifle', -70, onWall, 6, state));
    this.squads.push(new Squad(scene, '2 RIFLES', 'rifle', 70, onWall, 6, state));
    this.squads.push(new Squad(scene, '3 RIFLES', 'rifle', -28, behind, 6, state));
    this.squads.push(new Squad(scene, 'MG TEAM', 'mg', 22, behind, 3, state));

    this._recount();
  }

  get soldiers() { return this.squads.flatMap(s => s.members); }
  get pickables() { return this.soldiers.filter(m => m.alive).map(m => m.g); }

  _recount() { this.state.menRemaining = this.squads.reduce((a, s) => a + s.count, 0); }

  clearSelection() { for (const s of this.squads) s.setSelected(false); }

  selected() { return this.squads.filter(s => s.selected); }

  selectSquadByObject(obj, additive) {
    let node = obj; while (node && !node.userData.squad) node = node.parent;
    const sq = node && node.userData.squad;
    if (!sq) return false;
    if (!additive) this.clearSelection();
    sq.setSelected(true);
    return true;
  }

  // box select: any squad with a live member projecting inside the rect (NDC)
  boxSelect(camera, rectNdc, additive) {
    if (!additive) this.clearSelection();
    const v = new THREE.Vector3();
    for (const sq of this.squads) {
      const hit = sq.alive.some(m => {
        v.set(m.pos.x, 2, m.pos.z).project(camera);
        return v.x >= rectNdc.minX && v.x <= rectNdc.maxX &&
               v.y >= rectNdc.minY && v.y <= rectNdc.maxY;
      });
      if (hit) sq.setSelected(true);
    }
  }

  orderSelected(type, point) {
    const sel = this.selected();
    if (!sel.length) return;
    // spread multiple squads around the target so they don't stack
    sel.forEach((sq, i) => {
      const ox = point ? point.x + (i - (sel.length - 1) / 2) * (SPACING * 7) : undefined;
      const oz = point ? point.z : undefined;
      const cx = ox === undefined ? undefined : THREE.MathUtils.clamp(ox, -FIELD_HALF_X + 5, FIELD_HALF_X - 5);
      sq.giveOrder(type, cx, oz);
    });
  }

  holdFireSelected(v) { for (const sq of this.selected()) sq.holdFire = v; }

  update(dt) {
    for (const s of this.squads) s.update(dt);
    this._recount();
  }
}
