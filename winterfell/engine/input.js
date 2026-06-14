// input.js — tactical RTS camera rig + ground/object picking. No gameplay logic.
import * as THREE from './three.js';

// Angled RTS camera: orbits a focus point on the ground. WASD / edge-scroll pan,
// wheel zoom, Q/E or middle-drag rotate. Clamped to the battlefield bounds.
export function makeCameraRig(camera, dom, bounds) {
  const focus = new THREE.Vector3(0, 4, -8); // looking out over the field
  let dist = 125, yaw = 0;
  const pitch = 1.0; // radians from horizontal (~57°), steep tactical angle
  const keys = new Set();
  let edge = { x: 0, z: 0 };
  let dragRotate = false, lastX = 0;
  let enabled = true;

  const onKey = (e, down) => {
    const k = e.key.toLowerCase();
    if ('wasdqe'.includes(k)) { down ? keys.add(k) : keys.delete(k); }
  };
  dom.ownerDocument.addEventListener('keydown', e => onKey(e, true));
  dom.ownerDocument.addEventListener('keyup', e => onKey(e, false));

  dom.addEventListener('wheel', e => {
    dist = THREE.MathUtils.clamp(dist + Math.sign(e.deltaY) * 8, 38, 200);
    e.preventDefault();
  }, { passive: false });

  dom.addEventListener('mousedown', e => { if (e.button === 1) { dragRotate = true; lastX = e.clientX; e.preventDefault(); } });
  dom.ownerDocument.addEventListener('mouseup', e => { if (e.button === 1) dragRotate = false; });
  dom.addEventListener('mousemove', e => {
    if (dragRotate) { yaw -= (e.clientX - lastX) * 0.005; lastX = e.clientX; }
    // edge scroll
    const w = dom.clientWidth, h = dom.clientHeight, M = 24;
    edge.x = e.clientX < M ? -1 : e.clientX > w - M ? 1 : 0;
    edge.z = e.clientY < M ? -1 : e.clientY > h - M ? 1 : 0;
  });
  dom.addEventListener('mouseleave', () => { edge.x = edge.z = 0; });

  function update(dt) {
    if (!enabled) return;
    const panSpeed = dist * 0.9 * dt;
    let mx = 0, mz = 0;
    if (keys.has('w')) mz -= 1; if (keys.has('s')) mz += 1;
    if (keys.has('a')) mx -= 1; if (keys.has('d')) mx += 1;
    if (keys.has('q')) yaw += dt * 1.2;
    if (keys.has('e')) yaw -= dt * 1.2;
    mx += edge.x; mz += edge.z;
    // pan relative to yaw (so "up" is always away from camera)
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    focus.x += (mx * cos - mz * sin) * panSpeed;
    focus.z += (mx * sin + mz * cos) * panSpeed;
    focus.x = THREE.MathUtils.clamp(focus.x, bounds.minX, bounds.maxX);
    focus.z = THREE.MathUtils.clamp(focus.z, bounds.minZ, bounds.maxZ);

    const horiz = dist * Math.cos(pitch), height = dist * Math.sin(pitch);
    camera.position.set(
      focus.x + Math.sin(yaw) * horiz,
      height,
      focus.z + Math.cos(yaw) * horiz,
    );
    camera.lookAt(focus);
  }

  return {
    update, focus,
    get yaw() { return yaw; },
    setEnabled(v) { enabled = v; },
    frame(x, z, d) { focus.set(x, 4, z); if (d) dist = d; },
  };
}

// Ground-plane (y=0) and object picking from screen coords.
export function makePicker(camera, dom) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();

  function setNdc(clientX, clientY) {
    const r = dom.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  return {
    ground(clientX, clientY) {
      setNdc(clientX, clientY);
      return ray.ray.intersectPlane(plane, hit) ? hit.clone() : null;
    },
    objects(clientX, clientY, list) {
      setNdc(clientX, clientY);
      return ray.intersectObjects(list, true);
    },
    ray,
  };
}
