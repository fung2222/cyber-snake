// Camera rig: the single source of truth for every camera pose the game can use.
// main.js drives the live camera with these functions; world.js uses cameraEnvelope() to keep the city skyline out of
// every camera-to-arena sight line (structural occlusion fix, 2026-10-06); tests/occlusion.py raycasts the same poses.
import * as THREE from 'three';

export const FIT_MAX = 2.3;                       // portrait phones push the camera back by up to 2.3x
export const fitFor = (aspect) => (aspect < 1.25 ? Math.min(FIT_MAX, 1.25 / aspect) : 1);
export const SHAKE = { x: 0.7, y: 0.6, z: 0.3 };  // max |offset| of the trauma shake at trauma = 1 (see shakeOffset)
export const ORBIT_Y = [8, 11];                   // attract / game-over orbit height range (9.5 ± 1.5)
export const HEAD_MAX = 9.5;                      // |x|,|z| of the outermost cell centres (GRID 20)

// Attract / game-over orbit around the arena.
export function orbitPose(t, fit, aspect, shiftTitle, pos, look) {
  const a = t * 0.07 + 0.6;
  const R = 22 * Math.min(fit, 1.5);
  pos.set(Math.sin(a) * R, 9.5 + Math.sin(t * 0.21) * 1.5, Math.cos(a) * R);
  look.set(0, 1.0, 0);
  if (aspect > 1.2 && shiftTitle) { // shift composition so the title has room on the left
    look.x += Math.cos(a) * -5.5; look.z += -Math.sin(a) * -5.5;
  }
}

// Fixed high "top" camera (C key / camera button).
export function topPose(fit, pos, look) {
  pos.set(0, 25 * fit, 15 * fit);
  look.set(0, 0, 1.5);
}

// Chase camera: follows the head (world position) and leans into the travel direction (unit vector).
export function followPose(head, dirVec, fit, pos, look) {
  const tx = head.x * 0.55 + dirVec.x * 1.4, tz = head.z * 0.5 + dirVec.z * 1.4;
  const sway = THREE.MathUtils.clamp(-head.x * 0.02, -0.22, 0.22);
  const dist = 12 * fit, height = 11.5 * fit;
  pos.set(tx + Math.sin(sway) * dist, height, tz + Math.cos(sway) * dist + 1.5);
  look.set(tx, 0, tz);
}

// Screen shake offset (trauma^2 already applied by the caller as `tr`).
export function shakeOffset(t, tr, out) {
  return out.set((Math.sin(t * 61.3) + Math.sin(t * 97.1)) * 0.35 * tr, (Math.sin(t * 73.7) + Math.sin(t * 51.9)) * 0.3 * tr, Math.sin(t * 89.3) * 0.3 * tr);
}

// Sampled envelope of every camera position: all modes, every aspect (fit 1 … FIT_MAX), head anywhere, any heading.
// Shake is not sampled here; consumers inflate obstacles by SHAKE instead.
export function cameraEnvelope({ fits = 6, heads = 5, dirs = 8, orbitAngles = 96, orbitRadii = 4 } = {}) {
  const out = [], pos = new THREE.Vector3(), look = new THREE.Vector3(), head = new THREE.Vector3(), dv = new THREE.Vector3();
  const fitList = [];
  for (let i = 0; i < fits; i++) fitList.push(1 + (FIT_MAX - 1) * i / (fits - 1));
  for (const fit of fitList) {
    topPose(fit, pos, look); out.push({ mode: 'top', p: pos.clone() });
    for (let ix = 0; ix < heads; ix++) for (let iz = 0; iz < heads; iz++) for (let d = 0; d < dirs; d++) {
      head.set(-HEAD_MAX + 2 * HEAD_MAX * ix / (heads - 1), 0, -HEAD_MAX + 2 * HEAD_MAX * iz / (heads - 1));
      const yaw = d * Math.PI * 2 / dirs; dv.set(Math.sin(yaw), 0, Math.cos(yaw));
      followPose(head, dv, fit, pos, look); out.push({ mode: 'follow', p: pos.clone() });
    }
  }
  for (let r = 0; r < orbitRadii; r++) {
    const R = 22 + (33 - 22) * r / (orbitRadii - 1);
    for (let k = 0; k < orbitAngles; k++) {
      const a = k * Math.PI * 2 / orbitAngles;
      for (const y of ORBIT_Y) out.push({ mode: 'orbit', p: new THREE.Vector3(Math.sin(a) * R, y, Math.cos(a) * R) });
    }
  }
  return out;
}
