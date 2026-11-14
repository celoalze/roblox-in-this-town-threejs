// Character facade: Roblox R15 rig (engine/characters/r15.js) + face state + procedural poses (legacy 6-joint dict -> legacyToR15).
import { faceTexture, faceTexture2, loadFaceAtlas } from './face/face.js';
import { RIM } from '../shared/materials.js';
import { loadHairLib, preloadHair, hairStyles } from './wear/headgear.js';
import { FACE2 } from './face/face2.js';
import { buildR15, applyPose15, legacyToR15 } from './r15.js';
import { prepNative, sampleNative, snapLegacy, natOf, toLegacyKey, blendN, layerN, nativeToPose } from './anim15.js'; // native R15 animation (docs/R15.md section 10)
export { RIM, preloadHair, hairStyles };
export async function loadAtlas(url) {
  await loadHairLib();
  await loadFaceAtlas(url);
} // hair library (rbx:<id> hair) + face atlas

export function buildCharacter(spec = {}) {
  const ch = buildR15(spec);
  ch.expr = spec.expr || 'happy';
  setFace(ch, ch.expr, 0, false);
  return ch;
}
export function setFace(ch, expr, mouth, blink, o) {
  // o = face v2 options (engine/characters/face/face2.js faceOptions); without it: the original atlas path
  if (o || FACE2[expr]) {
    const k = `${expr}|${mouth}|${blink}|${JSON.stringify(o || {})}`;
    if (ch._fk === k) return;
    ch._fk = k;
    ch.face.material.map = faceTexture2(expr, mouth, blink, o || {}, { lashes: ch.spec.lashes, blush: ch.spec.blush });
    ch.face.material.needsUpdate = true;
    return;
  }
  const open = mouth >= 0.5,
    k = `${expr}|${open}|${blink}`;
  if (ch._fk === k) return;
  ch._fk = k;
  ch.face.material.map = faceTexture(expr, open, blink, { lashes: ch.spec.lashes, blush: ch.spec.blush });
  ch.face.material.needsUpdate = true;
}

// ---------- POSES ----------
// Returns joint rotations for an anim at local time t (seconds since anim start).
const S = Math.sin,
  PI = Math.PI;
const spr = (t, w = 13, d = 9) => (t <= 0 ? 0 : 1 - Math.exp(-d * t) * Math.cos(w * t)); // 0 -> 1 with a small overshoot, then settles
const ease = (k) => {
  k = Math.max(0, Math.min(1, k));
  return k * k * (3 - 2 * k);
};
const LEG = 2; // hip -> sole
const HELD = new Set([
  'wave',
  'point',
  'facepalm',
  'think',
  'sit',
  'sitfloor',
  'sitsad',
  'dab',
  'hug',
  'hold',
  'phone',
  'bow',
  'knock',
  'shrug',
  'shocked',
]); // poses that would otherwise freeze
// Data-driven anims (config/anims.json): {name: {loop: seconds|0, held: bool, keys: [{t, la, ra, ll, rl, hd, ts, y, lean, sq, ease}]}}.
// Joints a key leaves out rest at 0 (sq at 1). ease of a key = how the pose ARRIVES at it: smooth (default) linear back spring.
const DATA = {};
const J = ['la', 'ra', 'll', 'rl', 'hd', 'ts'];
// Native R15 entries (rig:'r15', keys with `joints`) are stored in NATIVE[x]; pose() then adds p.n (native pose) next to the legacy fields.
// The legacy-format twin DATA[x] (same name, 6-joint keys) is kept when it exists; otherwise it is derived from the native keys (toLegacyKey).
const NATIVE = {};
export function registerAnims(o) {
  for (const k in o) {
    if (k[0] === '_') continue;
    const e = o[k];
    if (e.rig === 'r15') {
      const base = k;
      NATIVE[base] = prepNative(e);
      if (e.held) HELD.add(base);
      if (!DATA[base] || DATA[base].derived)
        DATA[base] = {
          loop: e.loop,
          hip: e.hip,
          derived: true,
          keys: e.keys.map(toLegacyKey).sort((a, b) => a.t - b.t),
        };
      continue;
    }
    DATA[k] = { ...e, keys: [...e.keys].sort((a, b) => a.t - b.t) };
    if (e.held) HELD.add(k);
  }
}
export const animNames = () => Object.keys(DATA);
const EASE = {
  linear: (k) => k,
  smooth: ease,
  back: (k) => {
    k -= 1;
    return 1 + 2.3 * k * k * k + 1.3 * k * k;
  },
  spring: (k) => spr(k * 0.6, 13, 9),
};
function sample(D, t, p) {
  const K = D.keys,
    tt = D.loop ? ((t % D.loop) + D.loop) % D.loop : t;
  let i = 0;
  while (i + 1 < K.length && K[i + 1].t <= tt) i++;
  const a = K[i],
    b = K[Math.min(K.length - 1, i + 1)],
    k = b === a || tt <= a.t ? 0 : (EASE[b.ease] || ease)(Math.min(1, (tt - a.t) / (b.t - a.t)));
  for (const j of J)
    for (let n = 0; n < 3; n++) {
      const u = a[j]?.[n] || 0,
        v = b[j]?.[n] || 0;
      p[j][n] = u + (v - u) * k;
    }
  p.lh = D.hip ? 1 : 0; // hip: lean (and bz) pivot at the hips like a Roblox torso, not at the feet
  for (const [j, d] of [
    ['y', 0],
    ['lean', 0],
    ['sq', 1],
    ['bz', 0],
  ]) {
    const u = a[j] ?? d,
      v = b[j] ?? d;
    p[j] = u + (v - u) * k;
  }
}
export const baseAnim = (a) => (a || 'idle').split('+')[0];
export function pose(anim, t, ph = 0) {
  if (anim && anim.includes('+')) {
    // layers: "walk+wave" = legs/torso/travel of the first, arms and head gesture of the second
    const [b, ...up] = anim.split('+');
    const p = pose(b, t, ph);
    let nl = p.n;
    for (const u of up) {
      const o = pose(u, t, ph);
      if (nl || o.n) nl = layerN(natOf({ ...p, n: nl }), natOf(o));
      p.la = o.la;
      p.ra = o.ra;
      p.hd = p.hd.map((v, i) => v + o.hd[i]);
    }
    if (nl) {
      nl.b = snapLegacy(p);
      p.n = nl;
    }
    return p;
  }
  const p = {
    la: [0, 0, 0],
    ra: [0, 0, 0],
    ll: [0, 0, 0],
    rl: [0, 0, 0],
    hd: [0, 0, 0],
    ts: [0, 0, 0],
    y: 0,
    lean: 0,
    sq: 1,
  }; // sq = squash (<1) / stretch (>1) of the whole body, feet planted
  const br = S(t * 2.2 + ph) * 0.04;
  if (DATA[anim]) sample(DATA[anim], t, p);
  else
    switch (anim) {
      case 'walk': {
        const w = S(t * 8);
        p.la[0] = w * 0.75;
        p.ra[0] = -w * 0.75;
        p.la[2] = -0.06;
        p.ra[2] = 0.06;
        p.ll[0] = -w * 0.75;
        p.rl[0] = w * 0.75;
        p.y = -LEG * (1 - Math.cos(w * 0.75)) * 0.7;
        p.ts[1] = w * 0.08;
        p.hd[1] = -w * 0.06;
        p.hd[0] = S(t * 16) * 0.025;
        p.lean = 0.04;
        break;
      }
      case 'run': {
        const w = S(t * 14);
        p.sq = 1 + 0.04 * Math.cos(t * 28);
        p.la[0] = w * 1.25 - 0.2;
        p.ra[0] = -w * 1.25 - 0.2;
        p.la[2] = -0.12;
        p.ra[2] = 0.12;
        p.ll[0] = -w * 1.1;
        p.rl[0] = w * 1.1;
        p.y = -LEG * (1 - Math.cos(w * 1.1)) * 0.35;
        p.lean = 0.22;
        p.ts[1] = w * 0.12;
        p.hd[0] = -0.1;
        break;
      }
      case 'talk': {
        const g1 = Math.max(0, S(t * 2.6 + ph)),
          g2 = Math.max(0, S(t * 2.6 + ph + PI));
        p.ra[0] = -0.25 - g1 * 0.7;
        p.ra[2] = 0.12 + g1 * 0.15;
        p.la[0] = -0.15 - g2 * 0.5;
        p.la[2] = -0.1 - g2 * 0.12;
        p.hd[0] = S(t * 5.3) * 0.05;
        p.hd[1] = S(t * 1.7 + ph) * 0.12;
        p.hd[2] = S(t * 1.1) * 0.04;
        p.ts[1] = S(t * 1.3) * 0.05;
        p.y = br * 0.3;
        break;
      }
      case 'wave': {
        p.ra[2] = 2.6 + S(t * 10) * 0.35;
        p.hd[2] = -0.08;
        break;
      }
      case 'point': {
        p.ra[0] = -1.55;
        p.ra[2] = 0.05;
        p.hd[0] = -0.05;
        break;
      }
      case 'cheer': {
        const j = Math.abs(S(t * 7));
        p.la[2] = -2.7 + S(t * 14) * 0.2;
        p.ra[2] = 2.7 - S(t * 14) * 0.2;
        p.y = j * 1.2;
        p.ll[0] = -j * 0.3;
        p.rl[0] = -j * 0.3;
        p.sq = 1 - 0.07 * Math.cos(t * 14);
        break;
      }
      case 'jump': {
        const j = Math.max(0, S(t * 5));
        p.y = j * 2.2;
        p.la[2] = -1.2 * j;
        p.ra[2] = 1.2 * j;
        p.ll[0] = -0.5 * j;
        p.rl[0] = 0.3 * j;
        p.sq = 1 + 0.12 * Math.cos(t * 5);
        break;
      }
      case 'shocked': {
        const k = spr(t, 16, 9);
        p.sq = 1 + 0.14 * Math.exp(-t * 8) * S(t * 16);
        p.la[2] = -2.4 * k;
        p.ra[2] = 2.4 * k;
        p.la[0] = -0.4 * k;
        p.ra[0] = -0.4 * k;
        p.lean = -0.12 * k;
        p.y = S(Math.min(t * 8, PI)) * 0.5;
        break;
      }
      case 'scared': {
        const sh = S(t * 40) * 0.05;
        p.la[0] = -1.8;
        p.ra[0] = -1.8;
        p.la[2] = 0.5;
        p.ra[2] = -0.5;
        p.lean = -0.15;
        p.hd[1] = sh;
        p.ts[1] = sh;
        break;
      }
      case 'cry': {
        p.la[0] = -2.3;
        p.ra[0] = -2.3;
        p.la[2] = 0.55;
        p.ra[2] = -0.55;
        p.hd[0] = 0.25 + S(t * 9) * 0.05;
        p.y = S(t * 9) * 0.05;
        break;
      }
      case 'facepalm': {
        p.ra[0] = -2.5;
        p.ra[2] = -0.45;
        p.hd[0] = 0.3;
        break;
      }
      case 'think': {
        p.ra[0] = -2.2;
        p.ra[2] = -0.5;
        p.la[0] = -0.9;
        p.la[2] = 0.7;
        p.hd[2] = 0.12;
        p.hd[0] = -0.1;
        break;
      }
      case 'shrug': {
        const k = spr(t, 12, 8);
        p.la[2] = -0.9 * k;
        p.ra[2] = 0.9 * k;
        p.la[0] = -0.6 * k;
        p.ra[0] = -0.6 * k;
        p.hd[2] = 0.15 * k;
        p.y = 0.1 * k;
        break;
      }
      case 'angry': {
        p.la[2] = 0.35;
        p.ra[2] = -0.35;
        p.la[0] = 0.2 + S(t * 12) * 0.1;
        p.ra[0] = 0.2 - S(t * 12) * 0.1;
        p.lean = 0.1;
        p.hd[0] = 0.1;
        p.y = Math.abs(S(t * 12)) * 0.15;
        break;
      }
      case 'sit': {
        p.ll[0] = -PI / 2;
        p.rl[0] = -PI / 2;
        p.y = 0.2;
        p.la[0] = -0.4;
        p.ra[0] = -0.4;
        break;
      }
      case 'sitfloor': {
        p.ll[0] = -PI / 2;
        p.rl[0] = -PI / 2;
        p.y = -1.85;
        p.la[0] = -0.3;
        p.ra[0] = -0.3;
        break;
      }
      case 'sitsad': {
        p.ll[0] = -PI / 2;
        p.rl[0] = -PI / 2;
        p.y = 0.2;
        p.la[0] = -0.9;
        p.ra[0] = -0.9;
        p.hd[0] = 0.4;
        break;
      }
      case 'lie': {
        p.lean = -PI / 2;
        p.y = 0.55;
        p.la[2] = -0.1;
        p.ra[2] = 0.1;
        break;
      }
      case 'fall': {
        /* topples faster and faster, then bounces */ const k = Math.min(1, t / 0.4) ** 2,
          tb = Math.max(0, t - 0.4),
          bn = Math.exp(-tb * 7);
        p.lean = (-PI / 2) * k;
        p.y = 0.55 * k + (tb > 0 ? Math.abs(S(tb * 13)) * bn * 0.4 : 0);
        p.sq = tb > 0 ? 1 - 0.12 * bn * Math.cos(tb * 13) : 1;
        p.la[2] = -1.5 * k;
        p.ra[2] = 1.5 * k;
        break;
      }
      case 'dance': {
        const b = S(t * 8);
        p.la[2] = -1.2 - b * 0.6;
        p.ra[2] = 1.2 - b * 0.6;
        p.ts[1] = b * 0.3;
        p.hd[2] = b * 0.15;
        p.y = Math.abs(b) * 0.3;
        p.ll[0] = b * 0.4;
        p.rl[0] = -b * 0.4;
        break;
      }
      case 'dab': {
        p.ra[2] = 2.3;
        p.ra[0] = -0.4;
        p.la[0] = -1.4;
        p.la[2] = -1.1;
        p.hd[0] = 0.5;
        p.hd[1] = -0.5;
        break;
      }
      case 'laugh': {
        const b = S(t * 17);
        p.lean = -0.12;
        p.hd[0] = -0.28 + b * 0.07;
        p.y = Math.abs(b) * 0.09;
        p.la[0] = -0.65 + b * 0.12;
        p.ra[0] = -0.65 - b * 0.12;
        p.la[2] = 0.3;
        p.ra[2] = -0.3;
        p.ts[1] = S(t * 4) * 0.08;
        break;
      }
      case 'hug': {
        p.la[0] = -1.5;
        p.ra[0] = -1.5;
        p.la[2] = -0.5;
        p.ra[2] = 0.5;
        break;
      }
      case 'hold': {
        p.ra[0] = -1.1;
        p.la[0] = -1.1;
        p.ra[2] = 0.15;
        p.la[2] = -0.15;
        break;
      }
      case 'phone': {
        p.ra[0] = -1.3;
        p.ra[2] = 0.2;
        p.hd[0] = 0.3;
        break;
      }
      case 'sneak': {
        const w = S(t * 4);
        p.ll[0] = -w * 0.5;
        p.rl[0] = w * 0.5;
        p.la[0] = -1;
        p.ra[0] = -1;
        p.lean = 0.3;
        p.y = -0.3;
        break;
      }
      case 'tired': {
        p.lean = 0.15;
        p.hd[0] = 0.45;
        p.la[0] = 0.1;
        p.ra[0] = 0.1;
        p.y = S(t * 1.5) * 0.05;
        break;
      }
      case 'bow': {
        const k = ease(t * 2.4);
        p.lean = 0.7 * k;
        p.la[0] = 0.2;
        p.ra[0] = 0.2;
        break;
      }
      case 'knock': {
        p.ra[0] = -1.6 + Math.abs(S(t * 10)) * 0.4;
        break;
      }
      case 'clap': {
        const c = Math.abs(S(t * 12));
        p.la[0] = -1.4;
        p.ra[0] = -1.4;
        p.la[1] = 0.3 + c * 0.5;
        p.ra[1] = -0.3 - c * 0.5;
        p.la[2] = -0.2;
        p.ra[2] = 0.2;
        break;
      }
      case 'surf': {
        const w = S(t * 2.4);
        p.ll[0] = -0.15;
        p.rl[0] = 0.25;
        p.ll[2] = -0.12;
        p.rl[2] = 0.12;
        p.la[2] = -1.25 + w * 0.18;
        p.ra[2] = 1.25 - w * 0.18;
        p.la[0] = -0.2;
        p.ra[0] = 0.2;
        p.lean = 0.1 + w * 0.05;
        p.ts[1] = 0.35;
        p.hd[1] = -0.3;
        p.y = -0.25 + w * 0.05;
        break;
      } // side-on balance, arms out
      case 'bounce': {
        const u = (t * 2.6) % 1,
          h = 4 * u * (1 - u);
        const sq = u < 0.12 ? 1 - 0.16 * (1 - u / 0.12) : u > 0.88 ? 1 - 0.16 * ((u - 0.88) / 0.12) : 1 + 0.1 * h;
        p.y = h * 3.2;
        p.sq = sq;
        p.la[2] = -(0.4 + 2 * h);
        p.ra[2] = 0.4 + 2 * h;
        p.ll[0] = -0.5 * h;
        p.rl[0] = 0.3 * h;
        p.hd[0] = -0.1 * h;
        break;
      } // trampoline hops
      case 'glide': {
        p.lean = -1.25;
        p.y = 2.6 + S(t * 1.8) * 0.25;
        p.la[0] = 2.6;
        p.ra[0] = 2.6;
        p.la[2] = -0.25;
        p.ra[2] = 0.25;
        p.ll[0] = 0.15 + S(t * 3) * 0.08;
        p.rl[0] = 0.05 - S(t * 3) * 0.08;
        p.hd[0] = 1.0;
        break;
      } // superman flight, head up
      case 'umbrella': {
        p.ra[2] = 2.95;
        p.ra[0] = 0;
        p.la[2] = -0.7;
        p.la[0] = -0.15;
        p.ll[0] = 0.25 + S(t * 2) * 0.08;
        p.rl[0] = -0.1 + S(t * 2 + 1) * 0.08;
        p.ts[2] = S(t * 1.6) * 0.06;
        p.hd[2] = S(t * 1.6 + 1) * 0.06;
        p.y = 1 + S(t * 1.6) * 0.2;
        break;
      } // dangling under a raised umbrella
      case 'swim': {
        const w = S(t * 4.5),
          v = S(t * 4.5 + 1.6);
        p.lean = -0.2;
        p.la[2] = -1.1 - w * 0.8;
        p.ra[2] = 1.1 + w * 0.8;
        p.la[0] = -1 + v * 0.4;
        p.ra[0] = -1 + v * 0.4;
        p.ll[0] = w * 0.5;
        p.rl[0] = -w * 0.5;
        p.y = -0.9 + Math.abs(w) * 0.3;
        p.hd[0] = -0.25;
        p.ts[1] = w * 0.12;
        break;
      } // wading breaststroke
      case 'float': {
        p.y = 1 + S(t * 2) * 0.3;
        p.la[2] = -0.4;
        p.ra[2] = 0.4;
        p.ll[0] = 0.2;
        p.rl[0] = -0.1;
        break;
      }
      default: {
        const sw = S(t * 0.9 + ph);
        p.la[2] = -0.06 + br;
        p.ra[2] = 0.06 - br;
        p.la[0] = sw * 0.04;
        p.ra[0] = -sw * 0.04;
        p.y = br * 0.4;
        p.ts[2] = sw * 0.02;
        p.hd[1] = S(t * 0.55 + ph * 2) * 0.18;
        p.hd[0] = S(t * 0.8 + ph) * 0.03;
        p.hd[2] = -sw * 0.03;
      } // idle: breathing, weight shift, glances
    }
  if (NATIVE[anim]) {
    const n = sampleNative(NATIVE[anim], t, (e) => EASE[e] || ease);
    n.b = snapLegacy(p);
    p.n = n;
  } // native R15 twin (snapshot before the breathing below, so it is applied to R15 too)
  if (HELD.has(anim)) {
    p.sq *= 1 + S(t * 2.2 + ph) * 0.008;
    p.hd[1] += S(t * 0.7 + ph) * 0.05;
    p.hd[0] += S(t * 1.1 + ph * 2) * 0.02;
    p.ts[2] += S(t * 0.9 + ph) * 0.012;
  } // breathing + small glances
  return p;
}
const lerp = (a, b, k) => a + (b - a) * k;
const hasN = (a, b) => a.n || b.n;
export function blendPose(a, b, k) {
  const o = {};
  for (const key in a) {
    if (key === 'n') continue;
    o[key] = Array.isArray(a[key]) ? a[key].map((v, i) => lerp(v, b[key][i], k)) : lerp(a[key], b[key], k);
  }
  if (hasN(a, b)) o.n = blendN(natOf(a), natOf(b), k);
  return o;
}
// Overlapping action: kf(key) gives each joint its own progress, so the body leads, the arms follow and the head arrives last.
export function blendPoseLag(a, b, kf) {
  const o = {};
  for (const key in a) {
    if (key === 'n') continue;
    const k = kf(key);
    o[key] = Array.isArray(a[key]) ? a[key].map((v, i) => lerp(v, b[key][i], k)) : lerp(a[key], b[key], k);
  }
  if (hasN(a, b)) o.n = blendN(natOf(a), natOf(b), kf);
  return o;
}
export function applyPose(ch, p) {
  return applyPose15(ch, p.joints ? p : p.n ? nativeToPose(p) : legacyToR15(p)); // legacy 6-joint poses go through the adapter (docs/R15.md)
}
