// Links: bind one actor (the "child") to another's body (the "carrier") for a time window, with matching poses on both.
//   actor: link {to, mode, at, until, side}   shorthand "kid link:dad:shoulder@lunged until@fell"     + reach {target, arm, at, until} ("reach:door")
// Everything is a closed-form function of time like the rest of world.js. Hooks (world.js):
//   resolveLinks(s, lt, X)  right after actorAt: child _st.pos/yaw/rootQ/p + carrier arm pose (positions are final before look-at / camera)
//   finishLinks(s, lt, X)   after applyPose: arm IK (armToward) so hands meet bodies; also the `reach` key
//   linkRoot(ch, st)        replaces `root.rotation.y = yaw` (tilted children: cradle, drag)
// Units: "torso frame" = carrier hip frame (origin at the hips, +y up to the shoulders at 1.5-2, +z front, +x = the engine's armR side), in
// carrier-scale units. s = +1 means the engine's right side (armR, +x), -1 the left. r = child scale / carrier scale.
import * as THREE from 'three';
import { pose, blendPose, applyPose } from './character.js';
import { REST } from './r15.js';
import { getSkeleton } from './skeleton.js';
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (x) => Math.max(0, Math.min(1, x)), smooth = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a)), PI = Math.PI;
export const LINK_MODES = ['shoulder', 'piggyback', 'carry', 'hold_hands', 'hug', 'drag', 'lean_on', 'grab_arm'];
const FADE = .3; // seconds to blend into / out of a link

// ---- rig helpers ----
export const headY = (ch) => ch.rest ? ch.rest.headCentreY : 4.6; // head centre above the floor (unscaled): R15 4.87; creature models (no R15 rest data) keep their nominal 4.6 framing
const hipOf = (ch) => ch.rest.hipY;
let WY = null; // waist pivot above the hip joint (R15)
const waistDY = () => WY ?? (WY = (() => { try { const S = getSkeleton('r15'); return REST.rootHeight + S.byName.LowerTorso.cf.p[1] + S.jointByName.Waist.c0.p[1] - REST.hipY; } catch (e) { return .4; } })());
const SH15 = () => REST.shoulderY, ARM15 = 1.71; // R15 shoulder height; straight arm, shoulder pivot -> hand centre

// ---- reusable IK ----
// Real two-bone IK (shoulder-elbow-hand / hip-knee-ankle) with the skeleton's own segment lengths, no squash. The shoulder / hip gets a full
// rotation, the elbow / knee one hinge angle. The bend points towards o.hint (parent-part frame; default: elbow down / out / back, knee forward).
// Out of reach: the limb straightens (arms may stretch up to lim[1] more, o.stretch === false disables). k = blend with the pose the joint already has.
const _b = V(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const LIMB = { arm: { Right: ['RightShoulder', 'RightUpperArm', 'RightElbow', 'RightLowerArm', 'RightWrist', 'RightHand'], Left: ['LeftShoulder', 'LeftUpperArm', 'LeftElbow', 'LeftLowerArm', 'LeftWrist', 'LeftHand'] },
  leg: { Right: ['RightHip', 'RightUpperLeg', 'RightKnee', 'RightLowerLeg', 'RightAnkle', 'RightFoot'], Left: ['LeftHip', 'LeftUpperLeg', 'LeftKnee', 'LeftLowerLeg', 'LeftAnkle', 'LeftFoot'] } };
const TIP = { wrist: 0, hand: .132, grip: .29 }; // distance beyond the wrist along the forearm
function limbOf(ch, kind, side) { // side: legacy 'L' | 'R' (L = ch.armL = Roblox Right limb)
  const key = kind + side; ch._ikl = ch._ikl || {}; if (ch._ikl[key]) return ch._ikl[key];
  const [sj, un, ej, ln, wj] = LIMB[kind][side === 'L' ? 'Right' : 'Left'], J = ch.joints, N = ch.partNodes;
  return ch._ikl[key] = { sj: J[sj], ej: J[ej], aj: J[wj], l1: N[un].position.clone().add(J[ej].position).length(), l2: N[ln].position.clone().add(J[wj].position).length() };
}
function solve2(ch, kind, side, target, k, o = {}) {
  const L = limbOf(ch, kind, side), arm = kind === 'arm', sp = L.sj, par = sp.parent; if (k <= 0) return null;
  par.updateWorldMatrix(true, false);
  const tip = arm ? (TIP[o.tip ?? 'hand'] ?? .132) : (o.tipLen ?? 0), l1 = L.l1, l2 = L.l2 + tip, S = sp.position;
  const d = par.worldToLocal(_b.copy(target)).sub(S), D = d.length(); if (D < 1e-4) return null; const u = d.clone().multiplyScalar(1 / D);
  const lim = o.lim ?? [.6, 1.3], reach = l1 + l2, st = o.stretch === false || !arm ? 1 : Math.min(Math.max(1, D / (reach * .995)), lim[1]);
  const Dc = Math.max(.75, Math.min(D, reach * st * .995)), side0 = Math.sign(S.x) || 1;
  let hint = o.hint ? V(...o.hint) : o.hintW ? o.hintW.clone().transformDirection(_m.copy(par.matrixWorld).invert()) : arm ? V(side0 * .55, -1, -.8) : V(side0 * .15, 0, 1);
  hint.addScaledVector(u, -hint.dot(u)); if (hint.lengthSq() < 1e-4) hint = V(0, 0, 1).addScaledVector(u, -u.z); hint.normalize();
  const a = (l1 * l1 - l2 * l2 + Dc * Dc) / (2 * Dc), h = Math.sqrt(Math.max(0, l1 * l1 - a * a)), E = S.clone().addScaledVector(u, a).addScaledVector(hint, h);
  const uy = S.clone().sub(E).normalize(), f = S.clone().addScaledVector(u, Dc).sub(E); let w = f.addScaledVector(uy, -f.dot(uy)); if (w.lengthSq() < 1e-6) w = hint.clone().negate(); w.normalize();
  const uz = arm ? w : w.clone().negate(), ux = uy.clone().cross(uz).normalize(); _m.makeBasis(ux, uy, uz); const q = new THREE.Quaternion().setFromRotationMatrix(_m);
  const beta = Math.acos(Math.max(-1, Math.min(1, (Dc * Dc - l1 * l1 - l2 * l2) / (2 * l1 * l2))));
  sp.quaternion.slerp(q, k); L.ej.rotation.set(L.ej.rotation.x + ((arm ? -beta : beta) - L.ej.rotation.x) * k, L.ej.rotation.y * (1 - k), L.ej.rotation.z * (1 - k));
  if (st > 1) { sp.scale.y = 1 + (st - 1) * k; ch._armS = true; }
  if (o.flat && !arm) { // keep the sole level with the body
    L.aj.parent.updateWorldMatrix(true, false); const pq = L.aj.parent.getWorldQuaternion(new THREE.Quaternion()), loc = pq.invert().multiply(ch.root.getWorldQuaternion(new THREE.Quaternion()));
    _e.setFromQuaternion(loc, 'XYZ'); L.aj.rotation.set(Math.max(-.9, Math.min(.9, _e.x)), Math.max(-.5, Math.min(.5, _e.y)), Math.max(-.5, Math.min(.5, _e.z)));
  }
  return { l1, l2, D, Dc, beta };
}
// Point the arm at a world point so the hand lands there: 2-bone IK (o.tip 'hand'|'wrist'|'grip', o.hint / o.hintW = elbow direction, lim = stretch limits).
export function armToward(ch, side, target, k = 1, lim = [.6, 1.3], o = {}) { ch.root.updateMatrixWorld(true); return solve2(ch, 'arm', side, target, k, { lim, ...o }); }
// Leg equivalent: the ankle goes to the world point, the knee bends towards o.hint (default forward), o.flat keeps the sole level.
export function footTo(ch, side, target, k = 1, o = {}) { ch.root.updateMatrixWorld(true); return solve2(ch, 'leg', side, target, k, o); }
const shoulderW = (ch, side) => { ch.root.updateMatrixWorld(true); return (side === 'L' ? ch.armL : ch.armR).getWorldPosition(V()); };
// two hand targets for two arms: the assignment with the shorter total distance
function armPair(ch, t1, t2, k, lim, o) {
  const L = shoulderW(ch, 'L'), R = shoulderW(ch, 'R'), a = L.distanceTo(t1) + R.distanceTo(t2), b = L.distanceTo(t2) + R.distanceTo(t1);
  if (a <= b) { armToward(ch, 'L', t1, k, lim, o); armToward(ch, 'R', t2, k, lim, o); } else { armToward(ch, 'L', t2, k, lim, o); armToward(ch, 'R', t1, k, lim, o); }
}
// joint overrides {RobloxJoint: [x,y,z]} laid over the pose; authored for the engine +x side (Roblox "Left" limbs), mirrored for s < 0
const mirJ = (j) => { const o = {}; for (const n in j) { const m = n.startsWith('Left') ? 'Right' + n.slice(4) : n.startsWith('Right') ? 'Left' + n.slice(5) : n; o[m] = [j[n][0], -j[n][1], -j[n][2]]; } return o; };
function overlay(ch, jo, k) { if (!jo || k <= 0) return; for (const n in jo) { const j = ch.joints[n]; if (!j) continue; _q.setFromEuler(_e.set(jo[n][0], jo[n][1], jo[n][2], 'XYZ')); j.quaternion.slerp(_q, k); } }
const fl = (a) => [a[0], -a[1], -a[2]];
const mirrorP = (p) => ({ ...p, la: fl(p.ra), ra: fl(p.la), ll: fl(p.rl), rl: fl(p.ll), hd: fl(p.hd), ts: fl(p.ts) });
const copyP = (p) => { const o = {}; for (const k in p) o[k] = Array.isArray(p[k]) ? [...p[k]] : p[k]; return o; };
const tp = (ch, x, y, z) => ch.joints.Waist.localToWorld(V(x, y - waistDY(), z)); // hip-frame point (origin at the hips, +y up, +z front) -> world (scale, lean, twist included)
const gp = (st, sc, x, y, z) => { const c = Math.cos(st.yaw), s = Math.sin(st.yaw); return V(st.pos.x + (x * c + z * s) * sc, st.pos.y + y * sc, st.pos.z + (-x * s + z * c) * sc); }; // carrier root-local -> world
const nearC = (s) => s > 0 ? 'R' : 'L', nearK = (s) => s > 0 ? 'L' : 'R'; // side-by-side: the child stands on the carrier's s side, so its near arm is the opposite one

// ---- mode table ----
// kind 'torso': child hip placed at a point of the carrier's torso (rot = Euler YXZ in the torso frame), child pose from childPose.
// kind 'ground': child stands on the floor at an offset (off = [x, z] in carrier units, dyaw) and keeps the carrier's stride (childPose 'copy' + tweak).
// arms: which carrier arms take the carrierPose layer ('near' | 'both' | 'none'); ik(c) -> [[who, side | 'pair', target, target2 | null, ikOptions], ...] overrides them to meet bodies.
// Anchors come from the R15 skeleton (shoulders 1.85 above the hips, 1.94 wide, 1.71 arm reach to the hand centre); arms / legs by 2-bone IK.
// ov(who, s, r) = joint overrides (engine +x side) laid over the pose.
const jw = (ch, n) => ch.joints[n].getWorldPosition(V());
const MODES = {
  shoulder: { kind: 'torso', arms: 'near', carrierPose: 'carrying_shoulder', childPose: 'carried_shoulder',
    place: ({ s }) => ({ anchor: [s * 1.05, 2.3, .0], pc: [0, -.45, 0], rot: [0, 0, s * .12] }),
    ik: (c) => [['K', nearK(c.s), tp(c.C, 0, 3.3, .1), null, { tip: 'hand' }], ['C', nearC(c.s), jw(c.K, c.s > 0 ? 'LeftKnee' : 'RightKnee'), null, { hint: [c.s * .5, -1, -.4] }]] }, // child holds the carrier's head, carrier holds the child's leg
  piggyback: { kind: 'torso', arms: 'both', carrierPose: 'carrying_back', childPose: 'carried_back',
    place: ({ r }) => ({ anchor: [0, .85, -(.5 + .5 * r + .1)], pc: [0, 0, 0], rot: [.3, 0, 0] }),
    ik: (c) => [['K', 'pair', tp(c.C, -.8, 2.1, .1), tp(c.C, .8, 2.1, .1), { hint: [0, -1, -.3] }], ['C', 'pair', tp(c.K, -.9, -.25, .45), tp(c.K, .9, -.25, .45), null]] },
  carry: { kind: 'torso', arms: 'both', carrierPose: 'carrying_cradle', childPose: 'cradled',
    place: ({ s }) => ({ anchor: [0, 1.4, 1.15], pc: [0, 1.6, 0], rot: [-PI / 2, s * PI / 2, 0] }),
    ik: (c) => { const y = Math.max(.5, 1.4 - .5 * c.r - .2); return [['C', nearC(c.s), tp(c.C, c.s * 1.0, y, 1.15), null, { hint: [c.s * .6, -1, .1] }], ['C', nearK(c.s), tp(c.C, -c.s * 1.0, y + .05, 1.1), null, { hint: [-c.s * .6, -1, .1] }], ['K', nearC(c.s), tp(c.C, 0, 2.05, .5), null, { hint: [0, 0, -1] }]]; } },
  drag: { kind: 'torso', arms: 'near', carrierPose: 'carrying_drag', childPose: 'dragged',
    place: ({ s }) => ({ anchor: [s * 1.3, .6, -.85], pc: [0, 2.1, 0], rot: [-.95, PI, 0] }),
    ik: (c) => [['C', nearC(c.s), c.K.attach.Neck.getWorldPosition(V()), null, { hint: [c.s * .4, -1, -.3] }]] },
  hold_hands: { kind: 'ground', arms: 'none', carrierPose: null, childPose: 'copy',
    place: ({ s, r }) => { const L = .92 * ARM15 * (1 + r), dy = SH15() * (1 - r), h = Math.sqrt(Math.max(.16, L * L - dy * dy)), f = 1 / (1 + r); return { off: [s * (.972 * (1 + r) + h), 0], dyaw: 0, M: [s * (.972 + h * f), SH15() - dy * f, 0] }; },
    ik: (c) => { const x = c.pl.M[0], a = c.s * .17, mk = (dx) => gp(c.Cs, c.sc, x + dx, c.pl.M[1], c.pl.M[2]); return [['C', nearC(c.s), mk(-a), null, { hint: [c.s * .5, -1, -.2] }], ['K', nearK(c.s), mk(a), null, { hint: [-c.s * .5, -1, -.2] }]]; } },
  hug: { kind: 'ground', arms: 'both', carrierPose: 'hugging', childPose: 'hugging',
    place: ({ r }) => ({ off: [0, .55 + .5 * r + .1], dyaw: PI }),
    ik: (c) => { const yb = Math.max(.35, SH15() * c.r - REST.hipY - .4), yk = SH15() - REST.hipY - .3; // kid's hands at its own chest height on the carrier's back; carrier's hands on the kid's shoulder blades
      return [['K', 'pair', tp(c.C, -.95, yb, -.3), tp(c.C, .95, yb, -.3), { hint: [0, -.7, 1] }], ['C', 'pair', tp(c.K, -.8, yk, -.5), tp(c.K, .8, yk, -.5), { hint: [0, -.7, 1] }]]; } },
  lean_on: { kind: 'ground', arms: 'none', carrierPose: null, childPose: 'copy',
    place: ({ s, r }) => ({ off: [s * (.972 + .972 * r + .75), 0], dyaw: 0 }),
    tweak: (p, s, who) => { p.hd[2] += (who === 'K' ? .38 : -.2) * s; p.ts[2] += (who === 'K' ? .08 : -.03) * s; },
    ik: (c) => [['C', nearC(c.s), tp(c.K, -c.s * .55, 1.75, -.45), null, { hint: [c.s * .3, -1, 1] }]] },
  grab_arm: { kind: 'ground', arms: 'none', carrierPose: null, childPose: 'copy',
    place: ({ s, r }) => { const L = .9 * ARM15 * (1 + r), dy = SH15() * (1 - r), h = Math.sqrt(Math.max(.16, L * L - dy * dy)), f = .9 * ARM15 / L; return { off: [s * .972 * (1 - r), -h], dyaw: 0, M: [s * .972, SH15() - dy * f, -h * f] }; },
    tweak: (p, s, who) => { if (who === 'K') { p.lean -= .25; p.hd[0] -= .15; } },
    ik: (c) => { const M = gp(c.Cs, c.sc, ...c.pl.M); return [['C', nearC(c.s), M, null, { hint: [c.s * .3, -1, .2] }], ['K', nearC(c.s), M, null, { hint: [c.s * .3, -1, .2] }]]; } }, // both hands on the same wrist point: the grabbed arm is pulled out
};

// ---- link list of a scene (windows resolved once) ----
function linksOf(s, X) {
  if (s._links) return s._links;
  const L = [], byId = new Map(s._actors.map(A => [A.a.id, A]));
  for (const A of s._actors) {
    const l = A.a.link; if (!l || A.ch.creature) continue; const C = byId.get(l.to), M = MODES[l.mode]; if (!C || !M || C === A || C.ch.creature) continue;
    L.push({ A, C, M, mode: l.mode, s: l.side === 'L' || l.side === 'l' || l.side === -1 ? -1 : 1, t0: l.at != null ? X.resolveAt(l.at, s) : 0, fadeIn: l.at != null, t1: l.until != null ? X.resolveAt(l.until, s) : 1e9 });
  }
  const depth = (lk, n = 0) => { const up = L.find(x => x.A === lk.C); return up && n < 8 ? depth(up, n + 1) + 1 : 0; }; L.forEach(lk => { lk.d = depth(lk); }); L.sort((a, b) => a.d - b.d);
  const R = []; for (const A of s._actors) { const r = A.a.reach; if (r && !A.ch.creature) R.push({ A, r, arm: String(r.arm || 'R').toUpperCase() === 'L' ? 'L' : 'R', t0: r.at != null ? X.resolveAt(r.at, s) : 0, fadeIn: r.at != null, t1: r.until != null ? X.resolveAt(r.until, s) : 1e9 }); }
  return s._links = { L, R };
}
const weight = (w, lt) => (w.fadeIn ? smooth((lt - w.t0) / FADE) : lt >= w.t0 ? 1 : 0) * (lt < w.t1 ? 1 : 1 - smooth((lt - w.t1) / FADE));
const place = (ch, st) => { linkRoot(ch, st); ch.root.position.copy(st.pos); };
export function linkRoot(ch, st) { if (st.rootQ) ch.root.quaternion.copy(st.rootQ); else ch.root.rotation.set(0, st.yaw, 0); }

export function resolveLinks(s, lt, X) {
  resetIK(s);
  const { L } = linksOf(s, X); if (!L.length) return;
  for (const lk of L) {
    const { A, C, M, s: sd } = lk, k = weight(lk, lt); if (k <= 0) continue;
    const cs = C._st, ks = A._st, tl = Math.max(0, lt - lk.t0), r = (A.ch.spec.scale || 1) / (C.ch.spec.scale || 1), sc = C.ch.spec.scale || 1;
    cs.link = ks.link = lk; const P0 = copyP(cs.p), own = { pos: ks.pos.clone(), yaw: ks.yaw, p: ks.p };
    const pl = lk.pl = M.place({ s: sd, r });
    // carrier: arms of the carrying pose layered over its own legs / walk
    if (M.carrierPose && M.arms !== 'none') { let ap = pose(M.carrierPose, tl, C.ph); if (sd < 0) ap = mirrorP(ap); const mask = M.arms === 'both' ? ['la', 'ra'] : [nearC(sd) === 'R' ? 'ra' : 'la'];
      const q = cs.p = copyP(cs.p); for (const j of mask) q[j] = q[j].map((v, i) => v + (ap[j][i] - v) * k); if (M.arms === 'both') q.hd = q.hd.map((v, i) => v + (ap.hd[i] - v) * k); }
    if (M.tweak) { const c2 = copyP(cs.p); M.tweak(c2, sd, 'C'); cs.p = blendPose(cs.p, c2, k); }
    place(C.ch, cs); applyPose(C.ch, cs.p); overlay(C.ch, ovOf(M, 'C', sd, r), k); C.ch.root.updateMatrixWorld(true);
    let pos, yaw, q = null, p;
    if (M.kind === 'torso') {
      const qt = C.ch.torso.getWorldQuaternion(new THREE.Quaternion()), rel = new THREE.Quaternion().setFromEuler(new THREE.Euler(pl.rot[0], pl.rot[1], pl.rot[2], 'YXZ')); q = qt.multiply(rel);
      const anchor = tp(C.ch, ...pl.anchor), kc = A.ch.spec.scale || 1; pos = anchor.sub(V(pl.pc[0], hipOf(A.ch) + pl.pc[1], pl.pc[2]).multiplyScalar(kc).applyQuaternion(q));
      const e = new THREE.Euler().setFromQuaternion(q, 'YXZ'); yaw = e.y;
      let cp = pose(M.childPose, tl, A.ph); if (sd < 0) cp = mirrorP(cp); p = cp; p.y = 0; p.lean = 0; p.sq = 1;
    } else {
      const off = pl.off; pos = gp(cs, sc, off[0], 0, off[1]); pos.y = cs.pos.y; yaw = cs.yaw + pl.dyaw;
      if (M.childPose === 'copy') { p = copyP(P0); if (M.tweak) M.tweak(p, sd, 'K'); }
      else { let cp = pose(M.childPose, tl, A.ph); if (sd < 0) cp = mirrorP(cp); p = cp; }
    }
    // blend in / out with the child's own staging
    ks.pos = own.pos.clone().lerp(pos, k); A._pos = ks.pos; ks.p = blendPose(own.p, p, k);
    if (M.kind === 'torso' && k > 0) { const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, own.yaw, 0)); ks.rootQ = q0.slerp(q, k); ks.yaw = new THREE.Euler().setFromQuaternion(ks.rootQ, 'YXZ').y; }
    else ks.yaw = own.yaw + wrapA(yaw - own.yaw) * k;
    place(A.ch, ks); applyPose(A.ch, ks.p); overlay(A.ch, ovOf(M, 'K', sd, r), k); A.ch.root.updateMatrixWorld(true);
    if (M.kind === 'torso') ks.head = A.ch.headSpace.getWorldPosition(V()); // camera targets the real head, wherever the body is tilted to
  }
}

const ovOf = (M, who, s, r) => { const o = M.ov?.(who, s, r); return o && s < 0 ? mirJ(o) : o; };
function reachTarget(s, t) {
  if (Array.isArray(t)) return V(t[0], t[1], t[2]);
  const A = s._actors.find(x => x.a.id === t); if (A) return tp(A.ch, 0, 1.3, .3);
  const P = s._props.find(x => x.p.id === t || x.p.type === t); if (P && P.o) { P.o.updateMatrixWorld(true); return new THREE.Box3().setFromObject(P.o).getCenter(V()); }
  return null;
}
export function resetIK(s) { for (const A of s._actors) if (A.ch._armS) { A.ch.armL.scale.y = A.ch.armR.scale.y = 1; A.ch._armS = false; } }
export function finishLinks(s, lt, X) {
  resetIK(s);
  const { L, R } = linksOf(s, X); if (!L.length && !R.length) return;
  for (const lk of L) {
    const k = weight(lk, lt); if (k <= 0 || !lk.pl) continue; const { A, C, M, s: sd } = lk;
    C.ch.root.updateMatrixWorld(true); A.ch.root.updateMatrixWorld(true);
    const c = { C: C.ch, K: A.ch, s: sd, Cs: C._st, Ks: A._st, sc: C.ch.spec.scale || 1, pl: lk.pl, r: (A.ch.spec.scale || 1) / (C.ch.spec.scale || 1) };
    overlay(C.ch, ovOf(M, 'C', sd, c.r), k); overlay(A.ch, ovOf(M, 'K', sd, c.r), k);
    for (const [who, side, t1, t2, o] of M.ik(c)) { const ch = who === 'C' ? C.ch : A.ch; if (side === 'pair') armPair(ch, t1, t2, k, undefined, o); else armToward(ch, side, t1, k, undefined, o); }
  }
  for (const rc of R) {
    const k = weight(rc, lt); if (k <= 0) continue; const T = reachTarget(s, rc.r.target); if (T) { rc.A.ch.root.updateMatrixWorld(true); armToward(rc.A.ch, rc.arm, T, k, [.7, 1.4], { hint: [rc.arm === 'R' ? .4 : -.4, -1, -.3] }); }
  }
}
