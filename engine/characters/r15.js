// Roblox R15 character on top of engine/characters/skeleton.js. See docs/R15.md (the contract for everything that builds on this file).
//   buildR15(spec)      -> character object (facade: root, body, joints, parts, attach, head, headSpace, face, torso, armL.., spec, worn, skin)
//   applyPose15(ch, p)  -> p = { joints: {LeftElbow: [x,y,z], ...}, y, lean, sq, bz, lh }   (angles: radians, three.js Euler XYZ, relative to the rest pose)
//   legacyToR15(p, o)   -> converts a legacy 6-joint pose {la, ra, ll, rl, hd, ts, y, lean, sq, bz, lh} to an R15 pose (+ autoKnees)
//   R15_JOINTS, REST, restPose(), autoKnees()
import * as THREE from 'three';
import { RIM } from '../shared/materials.js';
import { loadSkeleton, getSkeleton, buildSkeleton } from './skeleton.js';
import { attachGear } from './r15_attach.js';
import { buildSkin } from './r15_skin.js';

// ---- data: loaded once, at import (top-level await). A failure disables characters. ----
let SK = null,
  R15ERR = null;
try {
  SK = await loadSkeleton('r15');
} catch (e) {
  R15ERR = e;
  console.warn('R15 rig data not loaded', e);
}
export const r15Ready = !!SK;

export const R15_JOINTS = [
  'Root',
  'Waist',
  'Neck',
  'LeftShoulder',
  'LeftElbow',
  'LeftWrist',
  'RightShoulder',
  'RightElbow',
  'RightWrist',
  'LeftHip',
  'LeftKnee',
  'LeftAnkle',
  'RightHip',
  'RightKnee',
  'RightAnkle',
];
export const R15_PARTS = [
  'HumanoidRootPart',
  'LowerTorso',
  'UpperTorso',
  'Head',
  'LeftUpperArm',
  'LeftLowerArm',
  'LeftHand',
  'RightUpperArm',
  'RightLowerArm',
  'RightHand',
  'LeftUpperLeg',
  'LeftLowerLeg',
  'LeftFoot',
  'RightUpperLeg',
  'RightLowerLeg',
  'RightFoot',
];

// REST: measurements of the rig in engine units (studs) -- hip height, leg bone lengths... all derived from rig.json, nothing hard coded.
export const REST = (() => {
  if (!SK) return {};
  const J = SK.jointByName,
    rig = SK.rig,
    hipY = rig.hipHeight;
  const thigh = J.LeftHip.c1.p[1] - J.LeftKnee.c0.p[1],
    shank = J.LeftKnee.c1.p[1] - J.LeftAnkle.c0.p[1];
  return {
    height: rig.height,
    hipY,
    rootHeight: -rig.soleY,
    thigh,
    shank,
    footH: hipY - thigh - shank,
    legLen: hipY,
    shoulderY: -rig.soleY + (SK.byName.UpperTorso.cf.p[1] + J.LeftShoulder.c0.p[1]),
    headCentreY: -rig.soleY + SK.byName.Head.cf.p[1],
  };
})();
export const restPose = () => ({ joints: {}, y: 0, lean: 0, sq: 1, bz: 0, lh: 0 }); // an empty joints dict = every joint at rest

// ---------- materials ----------
// Same rim-light hook as engine/shared/materials.js (the uniforms are the shared RIM object, so the look and the global toggles stay identical).
function rimCompile(sh) {
  sh.uniforms.uRimC = RIM.color;
  sh.uniforms.uRimK = RIM.k;
  sh.fragmentShader = sh.fragmentShader
    .replace(
      '#include <common>',
      `uniform vec3 uRimC; uniform float uRimK;
#include <common>`,
    )
    .replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
  { vec3 rn = normalize(vNormal); float rf = pow(1.0 - saturate(dot(rn, normalize(vViewPosition))), 3.0); totalEmissiveRadiance += uRimC * (diffuseColor.rgb * .6 + .4) * uRimK * rf * (.3 + .7 * saturate(rn.y * .5 + .5)); }`,
    );
}
export const rimify = (m) => {
  if (!m.userData.rim) {
    m.userData.rim = true;
    m.onBeforeCompile = rimCompile;
  }
  return m;
};
const shade = (hex, f) => '#' + new THREE.Color(hex).multiplyScalar(f).getHexString();
const skinMat = (c) =>
  rimify(new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.35 }));
const clothMat = (c) => rimify(new THREE.MeshStandardMaterial({ color: c, roughness: 0.82 }));
const shoeMat = (c) =>
  rimify(new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.35 }));

// Placeholder colouring (flat colours from the legacy spec keys) so a character reads like its preset. The clothes/skin phase replaces this:
// ch.mats[partName] is the material of that part (own instance per character), ch.setPartColor(part, '#hex') recolours one.
function partColors(spec) {
  const skin = spec.skin || '#f5c79a',
    shirt = typeof spec.shirt === 'string' && !spec.shirt.startsWith('rbx:') ? spec.shirt : '#3a8dde',
    pants = typeof spec.pants === 'string' && !spec.pants.startsWith('rbx:') ? spec.pants : '#22304f';
  const sleeves = spec.sleeves || 'long',
    bottom = spec.bottom || 'pants',
    arm = spec.jacket || shirt,
    shoes = spec.shoes || shade(pants, 0.45);
  const sk = {
    head: spec.skinHead || skin,
    torso: spec.skinTorso || skin,
    arms: spec.skinArms || skin,
    legs: spec.skinLegs || skin,
  };
  const c = {
    HumanoidRootPart: skin,
    Head: sk.head,
    UpperTorso: shirt,
    LowerTorso: pants,
    UpperArm: sleeves === 'none' ? sk.arms : arm,
    LowerArm: sleeves === 'long' ? arm : sk.arms,
    Hand: sk.arms,
    UpperLeg: bottom === 'skirt' ? sk.legs : pants,
    LowerLeg: bottom === 'pants' ? pants : sk.legs,
    Foot: shoes,
  };
  const out = {};
  for (const n of R15_PARTS) {
    const base = n.replace(/^(Left|Right)/, '');
    out[n] = c[n] ?? c[base] ?? skin;
  }
  return Object.assign(out, spec.partColors || {});
}
const isCloth = (n) => /Torso|Arm|Leg/.test(n) && n !== 'Head';

// ---------- face: a decal-like patch hugging the front of the head (planar uv like the legacy face, one atlas cell = FACE_SPAN) ----------
const FACE_SPAN = 1.55 * 0.93;
let faceGeo = null;
function faceGeometry() {
  if (faceGeo) return faceGeo;
  const headGeo = SK.geo.Head,
    hm = new THREE.Mesh(headGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })),
    rc = new THREE.Raycaster(),
    dir = new THREE.Vector3(0, 0, -1);
  const nx = 32,
    ny = 32,
    hw = 0.55,
    hh = 0.5,
    pos = [],
    uv = [],
    idx = [];
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) {
      const x = (-1 + (2 * i) / nx) * hw,
        y = (-1 + (2 * j) / ny) * hh;
      rc.set(new THREE.Vector3(x, y, 3), dir);
      const h = rc.intersectObject(hm)[0];
      pos.push(x, y, (h ? h.point.z : 0) + 0.006);
      uv.push(x / FACE_SPAN + 0.5, y / FACE_SPAN + 0.5);
    }
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i,
        b = a + 1,
        c = a + nx + 1,
        d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  faceGeo = new THREE.BufferGeometry();
  faceGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  faceGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  faceGeo.setIndex(idx);
  faceGeo.computeVertexNormals();
  return faceGeo;
}

// ---------- build ----------
export function buildR15(spec0 = {}) {
  if (!SK)
    throw new Error('R15 rig data missing: ' + (R15ERR?.message || 'assets/models/rigs/r15/rig.json not loaded'));
  const spec = spec0,
    colors = partColors(spec),
    mats = {};
  const sk = buildSkeleton(
    'r15',
    (n) =>
      (mats[n] =
        n === 'Head' || /Hand/.test(n)
          ? skinMat(colors[n])
          : n.endsWith('Foot')
            ? shoeMat(colors[n])
            : isCloth(n)
              ? clothMat(colors[n])
              : skinMat(colors[n])),
  );
  const root = new THREE.Group(),
    body = new THREE.Group();
  root.add(body);
  body.add(sk.hrp);
  const J = sk.joints,
    headNode = sk.parts.Head.node;
  const headSpace = new THREE.Group();
  headSpace.name = 'headSpace';
  headNode.add(headSpace); // centre of the head (the head mesh is centred on its part origin)
  const face = new THREE.Mesh(
    faceGeometry(),
    new THREE.MeshPhysicalMaterial({
      transparent: true,
      roughness: 0.45,
      clearcoat: 0.35,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  face.name = 'face';
  headSpace.add(face);
  root.scale.setScalar(spec.scale || 1);
  const ch = {
    rig: 'r15',
    root,
    body,
    hrp: sk.hrp,
    joints: J,
    parts: Object.fromEntries(Object.entries(sk.parts).map(([k, v]) => [k, v.mesh || v.node])),
    partNodes: Object.fromEntries(Object.entries(sk.parts).map(([k, v]) => [k, v.node])),
    attach: sk.attach,
    mats,
    face,
    headSpace,
    torso: sk.parts.UpperTorso.node,
    head: J.Neck,
    spec: spec0,
    worn: [],
    hair: [],
    skin: colors,
    // legacy aliases (pivots, NOT in body space: see docs/R15.md). Legacy `armL`/`legL` (screen left, x = -1) are the character's RIGHT limbs.
    armL: J.RightShoulder,
    armR: J.LeftShoulder,
    legL: J.RightHip,
    legR: J.LeftHip,
    rest: { ...REST },
    setPartColor(part, c) {
      const m = mats[part];
      if (m) m.color.set(c);
      colors[part] = c;
    },
  };
  J.RightShoulder.userData.hand = sk.attach.RightGrip;
  J.LeftShoulder.userData.hand = sk.attach.LeftGrip;
  buildSkin(ch, spec0); // skin / clothes / face fit (engine/characters/r15_skin.js)
  attachGear(ch, spec0); // hair / hats / glasses into ch.fitSpace (engine/characters/r15_attach.js)
  return ch;
}

// ---------- pose ----------
const ZERO = [0, 0, 0];
export function applyPose15(ch, p) {
  const jr = p.joints || {};
  for (const n of R15_JOINTS) {
    const r = jr[n] || ZERO;
    ch.joints[n].rotation.set(r[0], r[1], r[2]);
  }
  const hip = ch.rest.hipY,
    lh = p.lh ? hip : 0,
    lean = p.lean || 0,
    sq = p.sq == null ? 1 : p.sq; // lh: lean about the hips (body keeps the hip fixed); bz: forward / back offset
  ch.body.position.set(0, (p.y || 0) + lh * (1 - Math.cos(lean)), -lh * Math.sin(lean) + (p.bz || 0));
  ch.body.rotation.x = lean;
  const w = 1 / Math.sqrt(sq);
  ch.body.scale.set(w, sq, w);
}

// Two-bone leg in the sagittal plane (x rotation only: roll / yaw of the hip pass through untouched).
// th = hip pitch (negative = thigh forward), hipH = hip height above the floor (hipY + body offset). Returns {hip, knee, ankle} pitch angles.
// Rules: (1) a thigh swung well forward lets the shank hang down (sitting), (2) if the sole would go through the floor, a 2-bone IK keeps the foot
// where the straight leg had it and flexes the knee (the thigh swings forward a bit more), (3) the ankle counter-rotates so the sole stays flat when the knee works.
export function solveLeg(th, hipH, o = {}) {
  const { thigh: T, shank: S, footH } = REST,
    hang = o.hang === false ? 0 : Math.max(0, Math.min(1, (-th - 0.8) / 0.6)),
    phi0 = th * (1 - hang); // shank angle before the floor test
  const ay = hipH - T * Math.cos(th) - S * Math.cos(phi0),
    af = -T * Math.sin(th) - S * Math.sin(phi0); // ankle height / forward offset
  let hip = th,
    knee = Math.max(0, phi0 - th);
  if (ay < footH - 1e-4 && o.floor !== false) {
    const dy = hipH - footH,
      dist = Math.hypot(af, dy);
    if (dist < T + S - 1e-4 && dist > Math.abs(T - S) + 1e-4) {
      // reachable: law of cosines
      const cosK = (T * T + S * S - dist * dist) / (2 * T * S),
        cosA = (T * T + dist * dist - S * S) / (2 * T * dist),
        psi = Math.atan2(af, dy);
      hip = -(psi + Math.acos(Math.max(-1, Math.min(1, cosA))));
      knee = Math.PI - Math.acos(Math.max(-1, Math.min(1, cosK))); // knee forward of the hip-ankle line
    }
  }
  const ankle = knee > 0.02 ? Math.max(-0.9, Math.min(0.9, -(hip + knee))) : 0; // flat foot while the knee works; a straight leg keeps the foot rigid like the legacy block
  return { hip, knee, ankle };
}
// In place on an R15 pose: legs follow the rules of solveLeg for the pose's body height. Use after setting hips / y.
export function autoKnees(p, o = {}) {
  const jr = p.joints,
    hipH = REST.hipY + (p.y || 0);
  for (const s of ['Left', 'Right']) {
    const h = jr[s + 'Hip'] || (jr[s + 'Hip'] = [0, 0, 0]),
      r = solveLeg(h[0], hipH, o);
    h[0] = r.hip;
    const k = jr[s + 'Knee'] || (jr[s + 'Knee'] = [0, 0, 0]);
    k[0] += r.knee;
    const a = jr[s + 'Ankle'] || (jr[s + 'Ankle'] = [0, 0, 0]);
    a[0] += r.ankle;
  }
  return p;
}

// Legacy pose -> R15 pose. Legacy la / ra / ll / rl are the screen-left / screen-right limbs of the legacy rig = the character's RIGHT / LEFT limbs
// (verified: engine armL sits at x = -1, Roblox "Right Arm" at +X, the engine is the Roblox rig turned half a turn about Y).
// o: elbow (default .2: share of the forward shoulder swing that bends the elbow), knees (default true: autoKnees), tsShare (1: waist takes ts),
//    headComp (1: the neck cancels the waist twist so the head looks where the legacy head looked), ySquat (default hipY/2: scales downward y; legacy legs are 2 long)
export function legacyToR15(p, o = {}) {
  const el = o.elbow ?? 0.2,
    ts = (p.ts || ZERO).map((v) => v * (o.tsShare ?? 1)),
    hc = o.headComp ?? 1,
    hd = p.hd || ZERO,
    y = p.y || 0;
  const bend = (s) => [-(el * Math.max(0, Math.min(1.6, -s[0]))), 0, 0],
    add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const la = p.la || ZERO,
    ra = p.ra || ZERO,
    ll = p.ll || ZERO,
    rl = p.rl || ZERO;
  const out = {
    joints: {
      RightShoulder: [...la],
      LeftShoulder: [...ra],
      RightElbow: bend(la),
      LeftElbow: bend(ra),
      RightHip: [...ll],
      LeftHip: [...rl],
      Waist: ts,
      Neck: [hd[0] - ts[0] * hc, hd[1] - ts[1] * hc, hd[2] - ts[2] * hc],
    },
    y: y < 0 ? y * (o.ySquat ?? REST.hipY / 2) : y,
    lean: p.lean || 0,
    sq: p.sq == null ? 1 : p.sq,
    bz: p.bz || 0,
    lh: p.lh || 0,
  };
  if (o.knees !== false) autoKnees(out);
  return out;
}
