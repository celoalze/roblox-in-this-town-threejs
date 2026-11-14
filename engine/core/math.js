// engine/core/math.js
// Small pure math helpers and constants used across the engine.
// Must not import anything from core.

import * as THREE from 'three';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const D2R = Math.PI / 180;
export const smooth = (k) => k * k * (3 - 2 * k);
export const clamp01 = (k) => Math.max(0, Math.min(1, k));
export const easeOut = (x) => 1 - (1 - x) ** 3;
export const snap = (k) => {
  const x = Math.max(0, Math.min(1, k));
  const inv = 1 - x;
  return 1 - inv * inv * inv * inv;
};
export const backOut = (k) => {
  k = clamp01(k) - 1;
  return 1 + 2.3 * k * k * k + 1.3 * k * k;
}; // ease-out with a small overshoot
export const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Deterministic Improved Perlin Noise (Ken Perlin 2002), matching Roblox math.noise
const PERM_BASE = [
  151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,
  8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,
  35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,
  134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,
  55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,
  18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,
  250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,
  189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,
  172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,
  228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,
  107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,
  138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180
];
const PERM = new Uint8Array(512);
for (let i = 0; i < 256; i++) PERM[i] = PERM[i + 256] = PERM_BASE[i];

const fadeP = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const gradP = (hash, x, y, z) => {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
};

export function perlinNoise(x, y = 0, z = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const X = xi & 255, Y = yi & 255, Z = zi & 255;
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = fadeP(xf), v = fadeP(yf), w = fadeP(zf);
  const A = PERM[X] + Y, AA = PERM[A] + Z, AB = PERM[A + 1] + Z;
  const B = PERM[X + 1] + Y, BA = PERM[B] + Z, BB = PERM[B + 1] + Z;
  return (
    (1 - w) * (
      (1 - v) * ((1 - u) * gradP(PERM[AA], xf, yf, zf) + u * gradP(PERM[BA], xf - 1, yf, zf)) +
      v * ((1 - u) * gradP(PERM[AB], xf, yf - 1, zf) + u * gradP(PERM[BB], xf - 1, yf - 1, zf))
    ) +
    w * (
      (1 - v) * ((1 - u) * gradP(PERM[AA + 1], xf, yf, zf - 1) + u * gradP(PERM[BA + 1], xf - 1, yf, zf - 1)) +
      v * ((1 - u) * gradP(PERM[AB + 1], xf, yf - 1, zf - 1) + u * gradP(PERM[BB + 1], xf - 1, yf - 1, zf - 1))
    )
  );
}

// XD Studio Util.noise helper: math.noise(t, (seed or 0) * 1.618 + 0.5, 3.7)
export const uNoise = (t, seed = 0) => perlinNoise(t, seed * 1.618 + 0.5, 3.7);

// Light-space axes (the sun direction never changes)
export const SUN_OFF = new THREE.Vector3(30, 60, 25);
export const LZ = SUN_OFF.clone().normalize();
export const LX = new THREE.Vector3(0, 1, 0).cross(LZ).normalize();
export const LY = LZ.clone().cross(LX);
