// Everything that attaches to an R15 character (docs/R15.md, section "Attachments, hair, accessories, held props").
//  * head gear (hair, procedural hats, glasses, Roblox hair meshes, Roblox accessories, GLB hats) lives in `ch.fitSpace`: a child of `ch.headSpace` scaled per axis
//    so that the R6 head (what all hair / hat data was authored for) maps exactly onto the R15 head mesh. Anything R6-authored put in there sits as it sat on R6.
//  * torso accessories (neck / front / back / shoulder / waist slots) hang from the real R15 attachments (NeckAttachment, BodyBackAttachment...).
//  * held props: grip frames of the real Right/LeftGripAttachment and a carry pose with real elbows (carryHands15).
import * as THREE from 'three';
import { buildHeadgear, HEAD_R, HEAD_H } from './wear/headgear.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (x) => Math.max(0, Math.min(1, x)),
  smooth = (k) => {
    k = clamp01(k);
    return k * k * (3 - 2 * k);
  };

// ---------- head fit ----------
// Per-axis scale + centre that map the R6 head box (2*HEAD_R x HEAD_H x 2*HEAD_R, centred) onto the bounding box of the R15 Head mesh, in headSpace coordinates.
// Recomputed by refitHead(ch) (call it if the head mesh / part is rescaled after build, e.g. by the face phase).
export function refitHead(ch) {
  const m = ch.parts.Head,
    hs = ch.headSpace,
    f = ch.fitSpace;
  if (!m?.geometry || !f) return;
  m.updateMatrix();
  hs.updateMatrix();
  const g = m.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox.clone().applyMatrix4(hs.matrix.clone().invert().multiply(m.matrix)),
    s = b.getSize(V()),
    c = b.getCenter(V());
  f.scale.set(s.x / (2 * HEAD_R), s.y / HEAD_H, s.z / (2 * HEAD_R));
  f.position.copy(c);
  f.updateMatrix();
}
// Called once by buildR15: creates ch.fitSpace and builds hair / hat / glasses of the spec into it (ch.hair = hair roots, for layers.js).
export function attachGear(ch, spec) {
  const f = new THREE.Group();
  f.name = 'fitSpace';
  ch.headSpace.add(f);
  ch.fitSpace = f;
  refitHead(ch);
  ch.hair = buildHeadgear(f, spec);
}

// ---------- torso accessories ----------
// Wearable data (config/wearables.json) is stored relative to the centre of the R6 part, engine frame, with the R6 attachment already applied.
// On R15 the accessory goes to the R15 attachment of its slot: group at the attachment, data origin moved back by the R6 attachment point.
// R6 attachment points (engine frame, front = +Z) of the torso / head, and the R15 attachment each slot uses (override per item with `att` in wearables.json).
export const SLOT_ATT = {
  hat: 'Hat',
  hair: 'Hair',
  face: 'FaceFront',
  neck: 'Neck',
  front: 'BodyFront',
  back: 'BodyBack',
  waist: 'WaistCenter',
  shoulderL: 'LeftCollar',
  shoulderR: 'RightCollar',
};
const R6_ATT = {
  Neck: [0, 1, 0],
  BodyFront: [0, 0, 0.5],
  BodyBack: [0, 0, -0.5],
  LeftCollar: [1, 1, 0],
  RightCollar: [-1, 1, 0],
  WaistCenter: [0, -1, 0],
};
export function slotSpace15(ch, slot, att) {
  att = att || SLOT_ATT[slot];
  const k = '_slot_' + att;
  if (ch[k]) return ch[k];
  const node = ch.attach[att];
  if (!node) return (ch[k] = ch.fitSpace || ch.headSpace);
  const g = new THREE.Group();
  g.name = 'slot_' + att;
  g.position.set(...(R6_ATT[att] || [0, 0, 0]).map((v) => -v));
  node.add(g);
  return (ch[k] = g);
}

// ---------- held props ----------
// Grip frame in world space: pos = RightGripAttachment / LeftGripAttachment (end of the hand), dir = +Z of the attachment = down the fingers (docs/R15.md).
const _m = new THREE.Matrix4();
export function gripFrame15(ch, arm) {
  // arm = ch.armL / ch.armR (legacy aliases: armL is the character's RIGHT arm) or a joint name
  const sh = typeof arm === 'string' ? ch.joints[arm] : arm,
    g = sh.userData.hand;
  g.updateWorldMatrix(true, false);
  _m.extractRotation(g.matrixWorld);
  return { pos: g.getWorldPosition(V()), dir: V(0, 0, 1).applyMatrix4(_m).normalize() };
}
// Carry pose: an arm that hangs or swings is blended to a carry pose (forearm forward, real elbow); raised / pointing arms keep their animation.
// Writes shoulder + elbow rotations (call after applyPose; it is reset by the next applyPose). `sx` = -1 for ch.armL (character right, at -X), +1 for ch.armR.
// open: 0 = tight, extra inward roll for two-handed carries so the hands close on the sides of a box.
export function carryArm15(ch, arm, two, inward = 0.3) {
  const sx = arm === ch.armL ? -1 : 1,
    sh = arm,
    el = ch.joints[arm.name.replace('Shoulder', 'Elbow')],
    r = sh.rotation;
  const down = -V(0, -1, 0).applyEuler(r).y,
    k = smooth((down - 0.35) / 0.35);
  if (!k) return false; // 1 = hanging straight down
  const tx = two ? -0.4 : -0.3,
    tz = two ? -sx * inward : sx * 0.1,
    te = two ? -0.8 : -1.0;
  r.set(r.x + (tx - r.x) * k, r.y * (1 - k), r.z + (tz - r.z) * k);
  el.rotation.set(el.rotation.x + (te - el.rotation.x) * k, el.rotation.y * (1 - k), el.rotation.z * (1 - k));
  return true;
}
// Everything the hold code needs: carry pose on the arm(s), then the tip (hand end) and arm direction in world space.
// Reusable by the links / IK code: it only touches shoulder + elbow rotations.
export function carryHands15(ch, two, left, inward) {
  if (two) {
    carryArm15(ch, ch.armL, true, inward);
    carryArm15(ch, ch.armR, true, inward);
  } else carryArm15(ch, left ? ch.armL : ch.armR, false);
  ch.root.updateMatrixWorld(true);
  if (two) {
    const L = gripFrame15(ch, ch.armL),
      R = gripFrame15(ch, ch.armR);
    return { tip: L.pos.add(R.pos).multiplyScalar(0.5), dir: L.dir.add(R.dir).normalize() };
  }
  const g = gripFrame15(ch, left ? ch.armL : ch.armR);
  return { tip: g.pos, dir: g.dir };
}
