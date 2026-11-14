// Native R15 animation: keyframed joint rotations, quaternion blending, layers, legacy bridge. See docs/R15.md section 10.
// Entry (config/anims_r15*.json): {rig:'r15', loop, held, hip, keys:[{t, joints:{LeftElbow:[x,y,z],...}, y, lean, sq, bz, ease}]}  (joints omitted = rest, Euler XYZ radians)
// A "native pose" n = {joints, y, lean, sq, bz, lh, b}; b = snapshot of the legacy fields the pose was created with (character.js pose() adds n to the legacy pose):
// the engine tweaks legacy fields after pose() (acceleration lean, head drag...), applyN adds those differences (p - b) onto the native joints.
import { legacyToR15, R15_JOINTS } from './r15.js';

const PI = Math.PI,
  ID = [0, 0, 0, 1];
export const ARM_JOINTS = ['LeftShoulder', 'LeftElbow', 'LeftWrist', 'RightShoulder', 'RightElbow', 'RightWrist']; // layer groups: arms (+ head added) come from the upper anim, the rest from the base
export const eulerToQ = (x, y, z) => {
  const sx = Math.sin(x / 2),
    cx = Math.cos(x / 2),
    sy = Math.sin(y / 2),
    cy = Math.cos(y / 2),
    sz = Math.sin(z / 2),
    cz = Math.cos(z / 2); // Qx*Qy*Qz (three.js 'XYZ')
  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz,
  ];
};
export function qToEuler(q) {
  const [x, y, z, w] = q,
    m13 = 2 * (x * z + y * w),
    ey = Math.asin(Math.max(-1, Math.min(1, m13)));
  return Math.abs(m13) < 0.9999999
    ? [
        Math.atan2(-2 * (y * z - x * w), 1 - 2 * (x * x + y * y)),
        ey,
        Math.atan2(-2 * (x * y - z * w), 1 - 2 * (y * y + z * z)),
      ]
    : [Math.atan2(2 * (y * z + x * w), 1 - 2 * (x * x + z * z)), ey, 0];
}
export function slerp(a, b, k) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3],
    s = 1;
  if (d < 0) {
    s = -1;
    d = -d;
  }
  let u, v;
  if (d > 0.9995) {
    u = 1 - k;
    v = k * s;
  } else {
    const th = Math.acos(d),
      sn = Math.sin(th);
    u = Math.sin((1 - k) * th) / sn;
    v = (Math.sin(k * th) / sn) * s;
  }
  const q = [u * a[0] + v * b[0], u * a[1] + v * b[1], u * a[2] + v * b[2], u * a[3] + v * b[3]],
    n = Math.hypot(...q) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}
const lerp = (a, b, k) => a + (b - a) * k;
const isId = (e) => Math.abs(e[0]) + Math.abs(e[1]) + Math.abs(e[2]) < 1e-6;
const blendJ = (ea, eb, k) => {
  const A = ea || [0, 0, 0],
    B = eb || [0, 0, 0];
  if (isId(A) && isId(B)) return null;
  return qToEuler(slerp(eulerToQ(...A), eulerToQ(...B), k));
};

// ---- sampler: D = {keys:[{t, q:{joint: quat}, y, lean, sq, bz, ease}], loop, hip, J:[joint names]}, ease(name) = easing fn ----
export function prepNative(o) {
  const keys = [...o.keys]
    .sort((a, b) => a.t - b.t)
    .map((k) => ({ ...k, q: Object.fromEntries(Object.entries(k.joints || {}).map(([j, e]) => [j, eulerToQ(...e)])) }));
  return { ...o, keys, J: [...new Set(keys.flatMap((k) => Object.keys(k.q)))] };
}
export function sampleNative(D, t, ease) {
  const K = D.keys,
    tt = D.loop ? ((t % D.loop) + D.loop) % D.loop : t;
  let i = 0;
  while (i + 1 < K.length && K[i + 1].t <= tt) i++;
  const a = K[i],
    b = K[Math.min(K.length - 1, i + 1)],
    k = b === a || tt <= a.t ? 0 : ease(b.ease)(Math.min(1, (tt - a.t) / (b.t - a.t))),
    joints = {};
  for (const j of D.J) {
    const qa = a.q[j],
      qb = b.q[j];
    if (!qa && !qb) continue;
    const q = slerp(qa || ID, qb || ID, k),
      e = qToEuler(q);
    if (!isId(e)) joints[j] = e;
  }
  const n = { joints, lh: D.hip ? 1 : 0 };
  for (const [f, d] of [
    ['y', 0],
    ['lean', 0],
    ['sq', 1],
    ['bz', 0],
  ])
    n[f] = lerp(a[f] ?? d, b[f] ?? d, k);
  return n;
}

// ---- legacy bridge ----
export const snapLegacy = (p) => ({
  la: [...p.la],
  ra: [...p.ra],
  ll: [...p.ll],
  rl: [...p.rl],
  hd: [...p.hd],
  ts: [...p.ts],
  y: p.y,
  lean: p.lean,
  sq: p.sq,
  bz: p.bz || 0,
});
// native pose of any legacy pose (adapter), b = snapshot of that legacy pose
export function natOf(p) {
  if (p.n) return p.n;
  const n = legacyToR15(p);
  n.b = snapLegacy(p);
  return n;
}
// approximate legacy keys of a native key (R6 / links / crowds fallback when an entry has no legacy twin): upper limb takes 40 % of the elbow, leg 25 % of the knee
export function toLegacyKey(k) {
  const J = k.joints || {},
    g = (n) => J[n] || [0, 0, 0],
    add = (a, b, s) => [a[0] + b[0] * s, a[1], a[2]];
  const o = {
    t: k.t,
    la: add(g('RightShoulder'), g('RightElbow'), 0.4),
    ra: add(g('LeftShoulder'), g('LeftElbow'), 0.4),
    ll: add(g('RightHip'), g('RightKnee'), 0.25),
    rl: add(g('LeftHip'), g('LeftKnee'), 0.25),
    hd: [g('Neck')[0] + g('Waist')[0], g('Neck')[1] + g('Waist')[1], g('Neck')[2] + g('Waist')[2]],
    ts: [...g('Waist')],
    y: k.y || 0,
    lean: (k.lean || 0) + g('Root')[0],
  };
  if (k.sq != null) o.sq = k.sq;
  if (k.bz) o.bz = k.bz;
  if (k.ease) o.ease = k.ease;
  return o;
}

// ---- blending (crossfades, overlapping action) ----
const jointKey = (j) =>
  j === 'Neck'
    ? 'hd'
    : j === 'Waist'
      ? 'ts'
      : /^Right(Shoulder|Elbow|Wrist)/.test(j)
        ? 'la'
        : /^Left(Shoulder|Elbow|Wrist)/.test(j)
          ? 'ra'
          : /^Right/.test(j)
            ? 'll'
            : /^Left/.test(j)
              ? 'rl'
              : 'lean';
export function blendN(a, b, kf) {
  // kf: number or (legacyKey) => progress
  const f = typeof kf === 'function' ? kf : () => kf,
    o = { joints: {}, lh: f('lean') >= 0.5 ? b.lh : a.lh, b: {} };
  for (const j of new Set([...Object.keys(a.joints), ...Object.keys(b.joints)])) {
    const e = blendJ(a.joints[j], b.joints[j], f(jointKey(j)));
    if (e) o.joints[j] = e;
  }
  for (const s of ['y', 'lean', 'sq', 'bz'])
    o[s] = lerp(a[s] || (s === 'sq' ? 1 : 0), b[s] || (s === 'sq' ? 1 : 0), f(s));
  const A = a.b,
    B = b.b;
  if (A && B) {
    for (const key in A)
      o.b[key] = Array.isArray(A[key])
        ? A[key].map((v, i) => lerp(v, B[key][i], f(key)))
        : lerp(A[key], B[key], f(key));
  }
  return o;
}
// layer: base native n0 keeps legs/root/waist, upper n1 gives the arms, its Neck is added to the base Neck
export function layerN(n0, n1) {
  const o = { ...n0, joints: { ...n0.joints } };
  for (const j of ARM_JOINTS) {
    if (n1.joints[j]) o.joints[j] = n1.joints[j];
    else delete o.joints[j];
  }
  const h0 = n0.joints.Neck,
    h1 = n1.joints.Neck;
  if (h0 || h1) o.joints.Neck = h1 ? (h0 ? [h0[0] + h1[0], h0[1] + h1[1], h0[2] + h1[2]] : h1) : h0;
  return o;
}

// ---- final pose: native joints + differences the engine applied to the legacy fields since the native pose was made ----
export function nativeToPose(p) {
  const n = p.n,
    b = n.b,
    o = { joints: n.joints, y: n.y, lean: n.lean, sq: n.sq, bz: n.bz, lh: n.lh };
  if (!b) return o;
  const J = { ...n.joints };
  o.joints = J;
  const dj = (j, cur, old, s = 1) => {
    const dx = (cur[0] - old[0]) * s,
      dy = (cur[1] - old[1]) * s,
      dz = (cur[2] - old[2]) * s;
    if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) < 1e-6) return;
    const e = J[j] || [0, 0, 0];
    J[j] = [e[0] + dx, e[1] + dy, e[2] + dz];
  };
  dj('RightShoulder', p.la, b.la);
  dj('LeftShoulder', p.ra, b.ra);
  dj('RightHip', p.ll, b.ll);
  dj('LeftHip', p.rl, b.rl);
  dj('Waist', p.ts, b.ts);
  dj('Neck', p.hd, b.hd);
  dj('Neck', p.ts, b.ts, -1); // the neck cancels the waist twist like the adapter does
  o.y += (p.y || 0) - b.y;
  o.lean += (p.lean || 0) - b.lean;
  o.bz += (p.bz || 0) - b.bz;
  o.sq *= (p.sq == null ? 1 : p.sq) / (b.sq || 1);
  return o;
}
