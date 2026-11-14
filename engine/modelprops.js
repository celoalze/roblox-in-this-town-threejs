// Model props: any GLB under assets/models/** named in config/model_props.json is a prop (`+shield`, `"sofa 3,-2"`), no engine code.
// A model wins over the procedural prop of the same name. Loaded only when a story uses it.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
let CFG = null;
const LIB = {};
const loader = new GLTFLoader();
export async function preloadModelProps(types) {
  CFG = CFG || (await (await fetch('/config/model_props.json')).json().catch(() => ({})));
  await Promise.all(
    [...new Set(types)]
      .filter((t) => CFG[t]?.model && !LIB[t])
      .map(async (t) => {
        try {
          LIB[t] = (await loader.loadAsync(`/assets/models/${CFG[t].model}.glb`)).scene;
        } catch (e) {
          console.warn('model prop ' + t, e.message);
        }
      }),
  );
}
export const isModelProp = (t) => !!LIB[t];
export const wearOf = (t) => (LIB[t] && CFG[t].wear) || null;
// Worn on the head: sized by its width, parented to the head (pivot = neck), so it follows every nod and turn.
export function makeWornProp(type) {
  const c = CFG[type].wear,
    m = LIB[type].clone(true),
    g = new THREE.Group(),
    b = new THREE.Box3().setFromObject(m),
    s = b.getSize(new THREE.Vector3()),
    ctr = b.getCenter(new THREE.Vector3());
  const k = c.w / Math.max(s.x, 0.001);
  m.scale.setScalar(k);
  m.position.set(-ctr.x * k, -b.min.y * k, -ctr.z * k);
  if (c.yaw) m.rotation.y = (c.yaw * Math.PI) / 180;
  g.add(m);
  g.position.y = c.y; // parent = the head-centre group
  m.traverse((x) => {
    if (x.isMesh) {
      x.castShadow = true;
      x.receiveShadow = true;
    }
  });
  return g;
}
export function makeModelProp(type, o = {}) {
  const c = CFG[type],
    m = LIB[type].clone(true),
    g = new THREE.Group(),
    b = new THREE.Box3().setFromObject(m),
    s = b.getSize(new THREE.Vector3());
  const k = (c.height || 1.5) / (c.hold ? Math.max(s.x, s.y, s.z) : s.y || 1);
  m.scale.setScalar(k);
  const ctr = b.getCenter(new THREE.Vector3());
  m.position.set(-ctr.x * k, -b.min.y * k, -ctr.z * k);
  g.add(m); // origin: centre of the footprint, on the ground
  m.traverse((x) => {
    if (x.isMesh) {
      x.castShadow = true;
      x.receiveShadow = true;
      if (o.color) {
        x.material = x.material.clone();
        x.material.color.set(o.color);
      }
    }
  });
  if (o.scale) g.scale.setScalar(o.scale);
  return g;
}

// Scatter: many instances of one GLB (instanced). {"type":"scatter","model":"palm_tree","n":40,"area":[x0,z0,x1,z1],"height":[7,11],"avoid":[[x,z,r]],"seed":3,"rows":[[x,z],...]}
// `area` = random rect; `at:[[x,z],...]` = explicit positions; height = target height range in units (1 m = 4 units); y = base height.
export function makeScatter(o = {}) {
  const c = CFG[o.model],
    g = new THREE.Group();
  if (!c || !LIB[o.model]) return g;
  const src = LIB[o.model];
  src.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(src),
    ctr = b.getCenter(new THREE.Vector3()),
    h0 = b.getSize(new THREE.Vector3()).y || 1;
  const hr = o.height || [c.height || 4, c.height || 4];
  let sd = o.seed || 7;
  const R = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const pts = [];
  if (o.at) for (const p of o.at) pts.push([p[0], p[1], 1]);
  else {
    const a = o.area || [-20, -20, 20, 20];
    for (let i = 0, t = 0; i < (o.n || 20) && t < 5000; t++) {
      const x = a[0] + R() * (a[2] - a[0]),
        z = a[1] + R() * (a[3] - a[1]);
      if ((o.avoid || []).some(([ax, az, ar]) => Math.hypot(x - ax, z - az) < ar)) continue;
      pts.push([x, z, 1]);
      i++;
    }
  }
  const inst = pts.map(([x, z]) => ({ x, z, s: (hr[0] + R() * (hr[1] - hr[0])) / h0, ry: R() * 6.283 }));
  const M = new THREE.Matrix4(),
    Q = new THREE.Quaternion(),
    S = new THREE.Vector3(),
    P = new THREE.Vector3(),
    L = new THREE.Matrix4(),
    E = new THREE.Euler();
  src.traverse((m) => {
    if (!m.isMesh) return;
    const im = new THREE.InstancedMesh(m.geometry, m.material, inst.length);
    im.castShadow = im.receiveShadow = true;
    im.frustumCulled = false;
    inst.forEach((it, i) => {
      Q.setFromEuler(E.set(0, it.ry, 0));
      M.compose(P.set(it.x, o.y || 0, it.z), Q, S.setScalar(it.s));
      L.makeTranslation(-ctr.x, -b.min.y, -ctr.z);
      im.setMatrixAt(i, M.multiply(L).multiply(m.matrixWorld));
    });
    g.add(im);
  });
  return g;
}
