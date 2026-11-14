// Data-driven skeleton: loads a rig definition (assets/models/rigs/<name>/rig.json + one geometry json per part) and builds the Object3D hierarchy.
// Only R15 exists now; add another definition by registering it in SKELETONS (same json shape, see docs/R15.md).
//
// Conventions
//  * The json is in the Roblox frame (+Y up, character front = -Z, character right = +X). Everything is converted ONCE here to the engine frame
//    (front = +Z) by the half turn about Y   D = diag(-1, 1, -1):   p' = (-x, y, -z),   q' = (-qx, qy, -qz, qw).   A half turn is a proper rotation,
//    so triangle winding and handedness are unchanged. Engine side: the character's right hand is at -X (like the legacy rig's `armL`).
//  * Motor6D semantics: child = parent * C0 * rot * C1^-1.  Here   pivot(joint) = Object3D child of the parent part node at C0.p;  pivot.quaternion = rot
//    (the joint rotation, relative to the rest pose, expressed in the PARENT PART frame: zero = rest pose, same handedness as the legacy rig, so
//    rotation.x < 0 swings an arm forward);  child part node = child of the pivot, quaternion restQ = C0.q * C1.q^-1, position -restQ * C1.p.
//  * Each part node sits at the part's origin (its mesh is centred there), so `parts[name].node` is the right parent for anything that
//    follows that part, and `attach[name]` Object3Ds sit at the Attachment CFrames of the rig.
import * as THREE from 'three';

export const SKELETONS = { r15: { url: '/assets/models/rigs/r15/', rig: null, geo: {} } };

const Q = (q) => new THREE.Quaternion(-q[0], q[1], -q[2], q[3]); // roblox quaternion -> engine
const P = (p) => new THREE.Vector3(-p[0], p[1], -p[2]); // roblox position -> engine

export async function loadSkeleton(name = 'r15') {
  const S = SKELETONS[name];
  if (!S) throw new Error('unknown skeleton ' + name);
  if (S.rig) return S;
  const rig = await (await fetch(S.url + 'rig.json')).json();
  await Promise.all(
    rig.parts
      .filter((p) => p.mesh)
      .map(async (p) => {
        const d = await (await fetch(S.url + p.mesh)).json(),
          g = new THREE.BufferGeometry(),
          n = d.p.length / 3,
          pos = new Float32Array(n * 3),
          nor = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          pos[i * 3] = -d.p[i * 3];
          pos[i * 3 + 1] = d.p[i * 3 + 1];
          pos[i * 3 + 2] = -d.p[i * 3 + 2];
          nor[i * 3] = -d.n[i * 3];
          nor[i * 3 + 1] = d.n[i * 3 + 1];
          nor[i * 3 + 2] = -d.n[i * 3 + 2];
        }
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
        g.setIndex(d.i);
        g.computeBoundingBox();
        g.computeBoundingSphere();
        S.geo[p.name] = g;
      }),
  );
  S.rig = rig;
  S.byName = Object.fromEntries(rig.parts.map((p) => [p.name, p]));
  S.jointByName = Object.fromEntries(rig.joints.map((j) => [j.name, j]));
  return S;
}
export function getSkeleton(name = 'r15') {
  const S = SKELETONS[name];
  if (!S || !S.rig) throw new Error(`skeleton "${name}" not loaded (await loadSkeleton)`);
  return S;
}

// Builds one instance. makeMaterial(partName) -> THREE.Material (one per part, the caller decides sharing); parts without a mesh (HumanoidRootPart) get no Mesh.
// Returns { hrp, parts: {name: {node, mesh}}, joints: {name: pivot}, attach: {name: Object3D}, rest: {height, soleY, hipY, rootHeight} }.
// `hrp` is positioned so the soles are at y = 0 when it is added to a group sitting on the floor.
export function buildSkeleton(name, makeMaterial) {
  const S = getSkeleton(name),
    rig = S.rig,
    parts = {},
    joints = {},
    attach = {};
  for (const p of rig.parts) {
    const node = new THREE.Object3D();
    node.name = p.name;
    let mesh = null;
    if (p.mesh) {
      mesh = new THREE.Mesh(S.geo[p.name], makeMaterial(p.name));
      mesh.name = p.name + 'Mesh';
      mesh.castShadow = mesh.receiveShadow = true;
      node.add(mesh);
    }
    parts[p.name] = { node, mesh, size: p.size };
    for (const [an, c] of Object.entries(rig.attachments[p.name] || {})) {
      if (an.endsWith('RigAttachment')) continue; // joint anchors: they ARE the joint pivots
      const o = new THREE.Object3D();
      o.name = an;
      o.position.copy(P(c.p));
      o.quaternion.copy(Q(c.q));
      node.add(o);
      attach[an] = o;
      if (an.endsWith('Attachment')) attach[an.slice(0, -10)] = o; // RightGripAttachment and RightGrip are the same Object3D
    }
  }
  for (const j of rig.joints) {
    const pivot = new THREE.Object3D();
    pivot.name = j.name;
    pivot.position.copy(P(j.c0.p));
    parts[j.parent].node.add(pivot);
    joints[j.name] = pivot;
    const c1q = Q(j.c1.q),
      restQ = Q(j.c0.q).multiply(c1q.clone().invert()),
      c = parts[j.child].node;
    c.quaternion.copy(restQ);
    c.position.copy(P(j.c1.p).applyQuaternion(restQ).negate());
    pivot.add(c);
  }
  const hrp = parts[rig.order[0]].node;
  hrp.position.y = -rig.soleY; // soles on the floor
  return {
    hrp,
    parts,
    joints,
    attach,
    rest: { height: rig.height, soleY: rig.soleY, hipY: rig.hipHeight, rootHeight: -rig.soleY },
  };
}

// joint rotation [x, y, z] radians, three.js Euler 'XYZ', relative to the rest pose (zero = rest).
export function setJoint(sk, name, r) {
  const j = sk.joints[name];
  if (j) j.rotation.set(r[0], r[1], r[2]);
}
