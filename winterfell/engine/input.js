// input.js — tactical RTS camera rig + ground/object picking. No gameplay logic.
import * as THREE from './three.js';

// Angled RTS camera: orbits a focus point on the ground. WASD / edge-scroll pan,
// wheel zoom, Q/E or middle-drag rotate. Clamped to the battlefield bounds.
export function makeCameraRig(camera, dom, bounds) {
  const focus = new THREE.Vector3(0, 3.2, -24); // orbit centre ~unit height (good close-ups)
  // every parameter is smooth-damped toward a target so pans glide, zooms ease
  // in, and rotates settle instead of snapping — the single biggest feel lever
  const focusT = focus.clone();
  let dist = 158, yaw = 0;
  let distT = dist, yawT = yaw;
  let pitch = 0.58; // radians from horizontal — adjustable (tilt the perspective)
  let pitchT = pitch;
  const PITCH_MIN = 0.14, PITCH_MAX = 1.32;
  // perspective presets cycled with [P]: tactical → top-down → cinematic ground
  const PRESETS = [
    { pitch: 0.58, dist: 158 }, // tactical
    { pitch: 1.22, dist: 150 }, // top-down command
    { pitch: 0.26, dist: 116 }, // cinematic, near the line
  ];
  let preset = 0;
  const keys = new Set();
  let edge = { x: 0, z: 0 };
  let dragRotate = false, lastX = 0, lastY = 0;
  let enabled = true;

  const onKey = (e, down) => {
    const k = e.key.toLowerCase();
    if ('wasdqe'.includes(k)) { down ? keys.add(k) : keys.delete(k); }
    if (down && k === 'p') cyclePerspective(); // tilt via P presets or middle-drag (no T/G — those build)
  };
  dom.ownerDocument.addEventListener('keydown', e => onKey(e, true));
  dom.ownerDocument.addEventListener('keyup', e => onKey(e, false));

  function cyclePerspective() {
    preset = (preset + 1) % PRESETS.length;
    pitchT = PRESETS[preset].pitch;
    distT = PRESETS[preset].dist;
  }

  dom.addEventListener('wheel', e => {
    // proportional step eases down for fine close-up control; min 6 = right down on the line
    distT = THREE.MathUtils.clamp(distT + Math.sign(e.deltaY) * Math.max(3, distT * 0.09), 6, 235);
    e.preventDefault();
  }, { passive: false });

  dom.addEventListener('mousedown', e => { if (e.button === 1) { dragRotate = true; lastX = e.clientX; lastY = e.clientY; e.preventDefault(); } });
  dom.ownerDocument.addEventListener('mouseup', e => { if (e.button === 1) dragRotate = false; });
  dom.addEventListener('mousemove', e => {
    if (dragRotate) {
      yawT -= (e.clientX - lastX) * 0.005; lastX = e.clientX;
      pitchT = THREE.MathUtils.clamp(pitchT + (e.clientY - lastY) * 0.004, PITCH_MIN, PITCH_MAX); lastY = e.clientY;
    }
    // edge scroll
    const w = dom.clientWidth, h = dom.clientHeight, M = 24;
    edge.x = e.clientX < M ? -1 : e.clientX > w - M ? 1 : 0;
    edge.z = e.clientY < M ? -1 : e.clientY > h - M ? 1 : 0;
  });
  dom.addEventListener('mouseleave', () => { edge.x = edge.z = 0; });

  function update(dt) {
    if (!enabled) return;
    const panSpeed = dist * 0.9 * dt;
    let mf = 0, mr = 0;                       // forward (W/S) and right (A/D)
    if (keys.has('w')) mf += 1; if (keys.has('s')) mf -= 1;
    if (keys.has('d')) mr += 1; if (keys.has('a')) mr -= 1;
    if (keys.has('q')) yawT += dt * 1.2;
    if (keys.has('e')) yawT -= dt * 1.2;
    mf += -edge.z; mr += edge.x;
    // pan on the ground in the direction the camera is actually looking — correct
    // at ANY yaw or pitch (forward = into the screen, right = screen-right)
    const fwx = -Math.sin(yaw), fwz = -Math.cos(yaw);
    const rgx = Math.cos(yaw), rgz = -Math.sin(yaw);
    focusT.x += (fwx * mf + rgx * mr) * panSpeed;
    focusT.z += (fwz * mf + rgz * mr) * panSpeed;
    focusT.x = THREE.MathUtils.clamp(focusT.x, bounds.minX, bounds.maxX);
    focusT.z = THREE.MathUtils.clamp(focusT.z, bounds.minZ, bounds.maxZ);

    // smooth-damp everything toward its target — pans glide to a stop, wheel
    // zooms ease, and rotates settle. Rates differ: pan tightest (stays under
    // the cursor), zoom/rotate a touch looser for the cinematic ease.
    const kPan = 1 - Math.exp(-11 * dt);
    const kZoom = 1 - Math.exp(-7.5 * dt);
    const kRot = 1 - Math.exp(-13 * dt);
    focus.x += (focusT.x - focus.x) * kPan;
    focus.z += (focusT.z - focus.z) * kPan;
    focus.y = focusT.y;
    dist += (distT - dist) * kZoom;
    yaw += (yawT - yaw) * kRot;
    pitch += (pitchT - pitch) * kRot;

    const horiz = dist * Math.cos(pitch), height = dist * Math.sin(pitch);
    camera.position.set(
      focus.x + Math.sin(yaw) * horiz,
      focus.y + height,           // orbit ABOVE the focus — was absolute, so zooming in
      focus.z + Math.cos(yaw) * horiz, // dropped the camera under the focus and tilted up
    );
    camera.lookAt(focus);
  }

  return {
    update, focus,
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    setEnabled(v) { enabled = v; },
    cyclePerspective,
    // setPitch/frame snap current AND target — QA screenshots and demo params
    // rely on landing instantly, not easing in over half a second
    setPitch(p) { pitch = pitchT = THREE.MathUtils.clamp(p, PITCH_MIN, PITCH_MAX); },
    frame(x, z, d) { focus.set(x, 3.2, z); focusT.copy(focus); if (d) dist = distT = d; },
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
