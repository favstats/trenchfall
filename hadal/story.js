// story.js — the reason you're down here. VELA-1 went into this trench six
// months ago; the pilot was your sister. Her log buoys still transmit, one per
// depth band — each recovered log is a chapter, and together they teach you
// the truth the mechanics already obey: the thing down here doesn't hunt
// flesh, it is drawn to light, and it has been alone a very long time.
import * as THREE from './engine/three.js';
import { axisAt, wallRAt, BOTTOM_Y } from './world/trench.js';
import { sfxRadio } from './engine/audio.js';

export const LOGS = [
  { d: 320, id: 'LOG 01', text: 'VELA-1, day one. Meridian says this survey is routine. The trench does not feel routine. It feels attended.' },
  { d: 700, id: 'LOG 02', text: 'Something answered my sonar today. Same shape as my ping, half a second late. Like an echo... learning.' },
  { d: 1050, id: 'LOG 03', text: 'I have stopped pinging. It comes when I ping. Brilliant, Maren — now you are navigating blind AND deaf.' },
  { d: 1420, id: 'LOG 04', text: 'Dropped ballast to climb. It circled below me the whole way. It is not attacking. It is herding.' },
  { d: 1800, id: 'LOG 05', text: 'New theory. It does not want the sub. It wants the LIGHT. It carries its own — old ones, dim, half dead. I think it has been alone down here for a very long time.' },
  { d: 2180, id: 'LOG 06', text: 'If you are hearing this, you followed me. Of course you did. Listen: lamp OFF when it is near. Give it flares. It is gentle with things that glow.' },
  { d: 2560, id: 'LOG 07', text: 'There is light below me. Not mine. A whole field of it, breathing. It is the most beautiful thing I have ever seen. I am going down.' },
  { d: 2930, id: 'LOG 08', text: 'Final buoy. My cell is dead, but the garden keeps my lamp lit. Tell Meridian I am not lost. Some things fall where they belong.' },
];

function glowTex(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (const [p, col] of stops) grd.addColorStop(p, col);
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createStory(scene, hud) {
  // ---- the buoys: amber pulses moored to the wall at each log depth ----
  const buoyTex = glowTex([[0, 'rgba(255,220,150,1)'], [0.3, 'rgba(255,170,60,.8)'], [1, 'rgba(0,0,0,0)']]);
  const buoys = LOGS.map((log, i) => {
    const y = 150 - log.d;                    // depth -> world y
    const th = 0.6 + i * 2.3;
    const a = axisAt(y), r = wallRAt(y, th) - 6;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: buoyTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sp.position.set(a.x + Math.cos(th) * r, y, a.z + Math.sin(th) * r);
    scene.add(sp);
    return { sp, log, played: false, i };
  });

  // ---- debris: her dropped ballast, a field of dead metal on the wall ----
  const DN = 260;
  const dpos = new Float32Array(DN * 3);
  {
    const y0 = 150 - 1420;
    for (let i = 0; i < DN; i++) {
      const y = y0 - Math.random() * 90;
      const th = 3.1 + (Math.random() - 0.5) * 1.2;
      const r = wallRAt(y, th) - Math.random() * 5;
      const a = axisAt(y);
      dpos[i * 3] = a.x + Math.cos(th) * r;
      dpos[i * 3 + 1] = y;
      dpos[i * 3 + 2] = a.z + Math.sin(th) * r;
    }
  }
  const dgeo = new THREE.BufferGeometry();
  dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  // debris reads only under your light — inert grey, no glow of its own
  const debris = new THREE.Points(dgeo, new THREE.PointsMaterial({
    color: 0x8a94a0, size: 1.1, transparent: true, opacity: 0.55, depthWrite: false,
  }));
  debris.frustumCulled = false;
  scene.add(debris);

  // ---- VELA-1: at rest in the garden, viewport still warm ----
  const ba = axisAt(BOTTOM_Y);
  const wreck = new THREE.Group();
  const hullMat = new THREE.MeshBasicMaterial({ color: 0x18242b });
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(1.05, 2.4, 6, 12), hullMat);
  hull.rotation.x = Math.PI / 2;
  const sail = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.8, 10), hullMat);
  sail.position.set(0, 1.1, 0.2);
  const port = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex([[0, 'rgba(255,214,150,1)'], [0.4, 'rgba(255,170,90,.6)'], [1, 'rgba(0,0,0,0)']]),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85,
  }));
  port.position.set(0, 0.15, -1.9); port.scale.setScalar(2.2);
  wreck.add(hull, sail, port);
  wreck.position.set(ba.x + 9, BOTTOM_Y + 1.6, ba.z - 6);
  wreck.rotation.set(0.12, 2.1, 0.18);       // settled, not crashed
  scene.add(wreck);

  let found = 0;
  function update(dt, subPos, depth, playing) {
    const t = performance.now() * 0.001;
    for (const b of buoys) {
      const k = b.played ? 0.35 : (Math.sin(t * 3.2 + b.i) > 0.4 ? 1 : 0.15); // strobe until heard
      b.sp.material.opacity = 0.85 * k;
      b.sp.scale.setScalar(2.4 + k * 1.6);
      if (!b.played && playing && depth >= b.log.d) {
        b.played = true; found++;
        sfxRadio(Math.min(9, 2 + b.log.text.length * 0.052));
        hud.log(b.log.id, `VELA-1 · ${b.log.d}m`, b.log.text);
      }
    }
  }

  return { update, get found() { return found; }, total: LOGS.length };
}
