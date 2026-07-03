// physics.js — the Rapier world plus the mesh↔body registry. Everything solid
// in DEADWEIGHT lives here: spawn helpers, per-floor gravity, the impact
// listener (decel heuristic — no event queue needed), and full cleanup
// between floors so runs never leak bodies.
import * as THREE from './engine/three.js';
import RAPIER from 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.14.0/+esm';

export { RAPIER };

export async function createPhysics(scene) {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const bodies = [];          // { rb, mesh, kind, hp?, prevV, mass }
  let onImpact = null;

  function track(rb, mesh, kind = 'debris', extra = {}) {
    mesh && scene.add(mesh);
    const rec = { rb, mesh, kind, prevV: 0, mass: rb.mass ? rb.mass() : 1, ...extra };
    bodies.push(rec);
    return rec;
  }

  function box(x, y, z, sx, sy, sz, opts = {}) {
    const rb = world.createRigidBody(
      (opts.fixed ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic())
        .setTranslation(x, y, z));
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setDensity(opts.density ?? 1).setFriction(0.8), rb);
    let mesh = null;
    if (!opts.noMesh) {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), opts.mat);
      mesh.castShadow = mesh.receiveShadow = !opts.fixed;
      mesh.position.set(x, y, z);
    }
    return track(rb, mesh, opts.kind ?? (opts.fixed ? 'static' : 'debris'), opts.extra);
  }

  function ball(x, y, z, r, opts = {}) {
    const rb = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z));
    world.createCollider(RAPIER.ColliderDesc.ball(r).setDensity(opts.density ?? 2).setFriction(0.7), rb);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), opts.mat);
    mesh.castShadow = true;
    mesh.position.set(x, y, z);
    return track(rb, mesh, opts.kind ?? 'debris', opts.extra);
  }

  function remove(rec) {
    const i = bodies.indexOf(rec);
    if (i >= 0) bodies.splice(i, 1);
    rec.mesh && scene.remove(rec.mesh);
    try { world.removeRigidBody(rec.rb); } catch {}
  }

  function clearDynamic() {
    for (const rec of [...bodies]) if (rec.kind !== 'permanent') remove(rec);
  }

  function setGravity(v) { world.gravity = v; }

  // raycast from a THREE ray: returns { rec|null, point, dist } — hits any collider
  const _rc = { origin: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: 0 } };
  function raycast(origin, dir, maxDist = 60, ignoreRb = null) {
    _rc.origin.x = origin.x; _rc.origin.y = origin.y; _rc.origin.z = origin.z;
    _rc.dir.x = dir.x; _rc.dir.y = dir.y; _rc.dir.z = dir.z;
    const ray = new RAPIER.Ray(_rc.origin, _rc.dir);
    const hit = world.castRay(ray, maxDist, true, undefined, undefined, undefined, ignoreRb);
    if (!hit) return null;
    const p = ray.pointAt(hit.timeOfImpact);
    const rb = hit.collider.parent();
    const rec = bodies.find(b => b.rb === rb) || null;
    return { rec, rb, point: new THREE.Vector3(p.x, p.y, p.z), dist: hit.timeOfImpact };
  }

  function step(dt) {
    world.timestep = Math.min(Math.max(dt, 1 / 240), 1 / 30);
    world.step();
    for (const b of bodies) {
      if (b.rb.isFixed()) continue;
      const p = b.rb.translation(), q = b.rb.rotation(), v = b.rb.linvel();
      if (b.mesh) {
        b.mesh.position.set(p.x, p.y, p.z);
        b.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      }
      const speed = Math.hypot(v.x, v.y, v.z);
      const decel = b.prevV - speed;
      if (decel > 7 && b.prevV > 8 && onImpact) onImpact(b, decel, p);
      b.prevV = speed;
      if (p.y < -80) { b.rb.setTranslation({ x: p.x, y: 20, z: p.z }, true); b.rb.setLinvel({ x: 0, y: 0, z: 0 }, true); }
    }
  }

  return {
    world, bodies, box, ball, track, remove, clearDynamic, setGravity, raycast, step,
    set onImpact(fn) { onImpact = fn; },
  };
}
