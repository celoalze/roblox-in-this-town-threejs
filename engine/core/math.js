// engine/core/math.js
// Small pure math helpers and constants used across the engine.
// Must not import anything from core.

import * as THREE from 'three';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const D2R = Math.PI / 180;
export const smooth = (k) => k * k * (3 - 2 * k);
export const clamp01 = (k) => Math.max(0, Math.min(1, k));
export const easeOut = (x) => 1 - (1 - x) ** 3;
export const backOut = (k) => {
  k = clamp01(k) - 1;
  return 1 + 2.3 * k * k * k + 1.3 * k * k;
}; // ease-out with a small overshoot
export const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Light-space axes (the sun direction never changes)
export const SUN_OFF = new THREE.Vector3(30, 60, 25);
export const LZ = SUN_OFF.clone().normalize();
export const LX = new THREE.Vector3(0, 1, 0).cross(LZ).normalize();
export const LY = LZ.clone().cross(LX);
