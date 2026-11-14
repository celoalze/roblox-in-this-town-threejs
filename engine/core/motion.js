// engine/core/motion.js
// Closed-form actor motion, facing, easing, and pose resolution at time t.
// Must not touch rendering or postprocessing state.

import { state } from './state.js';
import { V, D2R, smooth, clamp01, backOut, wrapA } from './math.js';
import { pose, blendPose, blendPoseLag, baseAnim } from '../characters/character.js';
import { headY } from '../characters/links.js';

export { wrapA, backOut } from './math.js';

// ---- resolve "at" values: seconds | "50%" | "w:word" | "w:word#2"
export function resolveAt(v, s) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (v.endsWith('%')) return (parseFloat(v) / 100) * s.dur;
  if (v.startsWith('w:')) {
    let [word, n] = v.slice(2).toLowerCase().split('#');
    n = +(n || 1);
    let c = 0;
    for (const w of s.words || []) {
      if (w.w.toLowerCase().replace(/[^a-z0-9']/g, '') === word.replace(/[^a-z0-9']/g, '') && ++c === n)
        return w.s - s.start;
    }
    return 0;
  }
  return parseFloat(v) || 0;
}

// per-character phase (0..2pi) from the id: characters never idle / blink in lockstep, whatever the id length
export function idPhase(id) {
  let h = 7;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 9973;
  return (h / 9973) * Math.PI * 2;
}

export function facingTo(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

// ---- MOTION ---- everything is a closed-form function of time (no per-frame state): frames render in any order / in parallel.
export const BL = 0.28,
  TY = 0.34,
  LOCO = { walk: 7, run: 15 }; // pose crossfade s, body turn s, nominal speed each cycle was authored for
export const LAG = 0.07,
  ANTIC = new Set(['jump', 'cheer', 'shocked', 'bounce', 'dance', 'dab', 'point']),
  NOLOOK = new Set([
    'walk',
    'run',
    'cry',
    'facepalm',
    'dab',
    'phone',
    'sitsad',
    'tired',
    'lie',
    'fall',
    'bow',
    'glide',
    'swim',
    'sneak',
    'think',
    'dance',
    'laugh',
    'scared',
    'nod',
    'headshake',
  ]);

// Eased travel: accelerate, cruise, brake, arriving exactly at mdur. d = distance covered, f = speed 0..1, acc = -1..1 (lean).
export function motion(ac, tl) {
  const T = ac.mdur,
    D = ac.p0.distanceTo(ac.p1),
    ta = Math.min(0.28, T * 0.3),
    td = Math.min(0.34, T * 0.35),
    vp = D / (T - (ta + td) / 2);
  if (tl <= 0) return { d: 0, f: 0, acc: 0, D };
  if (tl >= T) return { d: D, f: 0, acc: 0, D };
  if (tl < ta) return { d: (vp * tl * tl) / (2 * ta), f: tl / ta, acc: Math.sin((Math.PI * tl) / ta), D };
  if (tl > T - td) {
    const r = T - tl;
    return { d: D - (vp * r * r) / (2 * td), f: r / td, acc: -Math.sin((Math.PI * r) / td), D };
  }
  return { d: vp * (tl - ta / 2), f: 1, acc: 0, D };
}

// Pose of one action at scene time lt (also valid past its end, so the next action can crossfade out of it while it keeps moving).
export function actPose(ac, lt, ph) {
  const tl = lt - ac.t;
  if (!ac.p1) return pose(ac.anim, tl, ph);
  const ta = tl - ac.mdur,
    after = ac.after || 'idle',
    nom = LOCO[baseAnim(ac.anim)];
  let p;
  if (nom) {
    // stride phase follows the distance covered (feet do not slide); amplitude follows the speed
    const m = motion(ac, tl);
    p = pose('idle', ta, ph);
    if (m.f > 0) {
      p = blendPose(p, pose(ac.anim, m.d / nom, ph), smooth(m.f));
      const g = baseAnim(ac.anim) === 'run' ? 1 : 0.5;
      p.lean += m.acc * 0.14 * g;
      p.hd[0] -= m.acc * 0.12 * g;
      p.la[0] += m.acc * 0.22 * g;
      p.ra[0] += m.acc * 0.22 * g;
    } // head and arms drag behind the acceleration
    if (ta > 0 && ta < 1) {
      const g = baseAnim(ac.anim) === 'run' ? 1 : 0.45,
        w = Math.exp(-ta * 6.5) * Math.sin(ta * 12) * g;
      p.lean -= w * 0.13;
      p.hd[0] += w * 0.16;
      p.la[0] -= w * 0.3;
      p.ra[0] -= w * 0.3;
    } // follow-through: the stop rocks back and settles
  } else p = pose(ac.anim, tl, ph);
  if (ta > 0 && !(nom && after === 'idle')) {
    const q = pose(after, ta, ph);
    p = ta < BL ? blendPose(p, q, backOut(ta / BL)) : q;
  }
  return p;
}

export function yawFor(A, i, settled, pos, s) {
  // where action i wants the body to face (while travelling / once settled)
  const acts = A.acts,
    ac = acts[i];
  if (ac.p1 && !settled) return facingTo(ac.p0, ac.p1);
  const face = ac.face ?? A.faceDeg;
  if (typeof face === 'string' && state.chars[face]) {
    const o = s._actors.find((x) => x.a.id === face);
    return o ? facingTo(pos, o._pos || o.acts[0].p0) : 0;
  }
  if (face === 'camera') return Math.atan2(state.camera.position.x - pos.x, state.camera.position.z - pos.z);
  if (typeof face === 'number') return face * D2R;
  for (let j = i; j >= 0; j--) {
    if (typeof acts[j].face === 'number') return acts[j].face * D2R;
    if (acts[j].p1) return facingTo(acts[j].p0, acts[j].p1);
  } // inherit
  return 0;
}

export function actorAt(A, lt, s) {
  const acts = A.acts,
    ph = A.ph;
  let i = 0;
  while (i + 1 < acts.length && acts[i + 1].t <= lt) i++;
  const ac = acts[i],
    tl = lt - ac.t;
  let pos = ac.p0.clone(),
    moving = false,
    air = 0,
    lm = null;
  if (ac.p1) {
    const k = clamp01(tl / ac.mdur);
    moving = k < 1;
    if (LOCO[baseAnim(ac.anim)] && !ac.arc) {
      const m = (lm = motion(ac, tl));
      pos.lerpVectors(ac.p0, ac.p1, m.D > 1e-4 ? m.d / m.D : 1);
    } else {
      pos.lerpVectors(ac.p0, ac.p1, k);
      if (baseAnim(ac.anim) === 'jump' || ac.arc) {
        pos.y += Math.sin(k * Math.PI) * (ac.arc || 3);
        air = Math.sin(k * Math.PI * 2) ** 2;
      }
    }
  }
  const settled = !ac.p1 || !moving,
    anim = ac.p1 && settled ? ac.after || 'idle' : ac.anim;
  // facing: the body turns over TY seconds instead of snapping, and the head gets there first
  const ts = ac.p1 && settled ? ac.t + ac.mdur : ac.t;
  let yaw = yawFor(A, i, settled, pos, s),
    headTurn = 0;
  const prev = ac.p1 && settled ? [i, false, pos] : i > 0 ? [i - 1, true, acts[i - 1].p1 || acts[i - 1].p0] : null;
  if (prev && lt - ts < TY) {
    const y0 = yawFor(A, prev[0], prev[1], prev[2], s),
      D = wrapA(yaw - y0),
      k = (lt - ts) / TY;
    if (Math.abs(D) > 0.02) {
      const eb = smooth(k),
        eh = 1 - (1 - clamp01(k * 2.2)) ** 3;
      yaw = y0 + D * eb;
      headTurn = Math.max(-0.8, Math.min(0.8, D * (eh - eb)));
    }
  }
  // pose: crossfade out of the previous action (still running), settling with a slight overshoot
  let p = actPose(ac, lt, ph);
  if (i > 0 && tl < BL + LAG) {
    const q = actPose(acts[i - 1], lt, ph);
    p = blendPoseLag(q, p, (key) =>
      backOut((tl + (key === 'hd' ? -LAG : key === 'la' || key === 'ra' ? -LAG * 0.35 : LAG * 0.4)) / BL),
    ); // overlap: body first, arms, head last
    if (ANTIC.has(baseAnim(ac.anim)) && tl < 0.14) p.sq *= 1 - 0.08 * Math.sin((Math.PI * tl) / 0.14);
  } // anticipation: a quick crouch before the big move
  if (ac.p1 && settled && (ac.arc || baseAnim(ac.anim) === 'jump')) {
    const ta = tl - ac.mdur;
    p.sq *= 1 - 0.15 * Math.exp(-ta * 8) * Math.sin(ta * 16);
  } // landing squash, then settle
  p.hd[1] += headTurn;
  p.ts[1] += headTurn * 0.25;
  p.sq *= 1 + 0.1 * air; // stretch on the way up and down of a leap
  return {
    pos,
    yaw,
    p,
    expr: ac.expr,
    anim,
    tl: ac.p1 && settled ? tl - ac.mdur : tl,
    d: lm ? lm.d : ac.p1 ? ac.p0.distanceTo(pos) : 0,
    f: lm ? lm.f : moving ? 1 : 0,
    xt: i > 0 && acts[i - 1].expr !== ac.expr ? tl : 9,
  }; // xt = seconds since the expression changed
}

export const LK = { resolveAt: (v, s) => resolveAt(v, s) };

export function headPos(id, s, lt) {
  const A = s._actors.find((x) => x.a.id === id);
  if (!A) return V(0, 4.87, 0);
  const st = A._st || actorAt(A, lt, s);
  if (st.head) return st.head.clone();
  const sc = A.ch.spec.scale || 1;
  return st.pos.clone().add(V(0, (headY(A.ch) + (st.p.y || 0)) * sc, 0));
}
