// Head gear for the R15 head-fit space (engine/characters/r15_attach.js): procedural hair, hats, glasses / beard / mustache, and the Roblox hair libraries.
// Authored in a head-centre space with HEAD_R / HEAD_H proportions (the "head box" every hairstyle and hat is fitted to; R15 maps it onto the R15 head with fitSpace).
// Was part of engine/rig.js.
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { rimify, fabric, plastic, gold, shade, rbox, mesh } from '../../shared/materials.js';

export const HEAD_R = 0.64,
  HEAD_H = 1.24;
const BEV = 0.3,
  FACE_SPAN = 1.55;
export const headRadius = (y) => {
  const a = Math.abs(y),
    k = HEAD_H / 2 - BEV;
  return a <= k ? HEAD_R : HEAD_R - BEV + Math.sqrt(Math.max(0, BEV * BEV - (a - k) ** 2));
};

// ---------- Roblox hair library (assets/roblox/hair.obj exported from Studio by studio/export_hair.luau) ----------
// slot i head centre at Roblox (i*4, 1000, 0), Roblox front = -Z  ->  ours: head-centre space, front = +Z
const HAIR = {};
export async function loadHairLib() {
  try {
    const cfg = await (await fetch('/config/roblox_hair.json')).json();
    const mtl = await new MTLLoader().setPath('/assets/roblox/').loadAsync('hair.mtl');
    mtl.preload();
    const obj = await new OBJLoader().setMaterials(mtl).setPath('/assets/roblox/').loadAsync('hair.obj');
    obj.traverse((o) => {
      if (!o.isMesh) return;
      const id = cfg.hair.find((i) => o.name.startsWith('Hair' + i));
      if (id == null) return;
      const k = cfg.hair.indexOf(id);
      const g = o.geometry.clone();
      g.translate(-k * 4, -1000, 0);
      g.rotateY(Math.PI);
      g.computeVertexNormals();
      const src = Array.isArray(o.material) ? o.material[0] : o.material;
      const map = src.map || null;
      if (map) {
        map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = 8;
      }
      HAIR[id] = { g, map };
    });
  } catch (e) {
    console.warn('hair lib not loaded', e);
  }
}
// Named styles (config/roblox_hair.json "styles", files in assets/roblox/hair, built by pipeline/roblox_hair.py): loaded only when a
// character uses them. Greyscale texture x hairColor = any style in any colour.
const STYLE = {};
let STYLE_CFG = null;
export async function preloadHair(names) {
  STYLE_CFG = STYLE_CFG || (await (await fetch('/config/roblox_hair.json')).json()).styles || {};
  await Promise.all(
    [...new Set(names)]
      .filter((n) => STYLE_CFG[n] && !STYLE[n])
      .map(async (n) => {
        try {
          const d = await (await fetch(`/assets/roblox/hair/${n}.json`)).json();
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(d.p, 3));
          g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
          g.setIndex(d.i);
          g.computeVertexNormals();
          const map = await new THREE.TextureLoader().loadAsync(`/assets/roblox/hair/${n}.png`);
          map.colorSpace = THREE.SRGBColorSpace;
          map.anisotropy = 8;
          map.flipY = true;
          STYLE[n] = { g, map, gray: STYLE_CFG[n].gray !== false };
        } catch (e) {
          console.warn('hair style ' + n, e.message);
        }
      }),
  );
}
export const hairStyles = () => Object.keys(STYLE_CFG || {});
function rbxHair(head, spec) {
  const id = String(spec.hair).replace('rbx:', '');
  const st = STYLE[id];
  if (st) {
    const m = new THREE.MeshStandardMaterial({
      map: st.map,
      color: st.gray ? spec.hairColor || '#7a4a21' : spec.hairTint || '#ffffff',
      roughness: 0.6,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(st.g, rimify(m));
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.scale.setScalar(spec.hairScale || 1);
    head.add(mesh);
    return true;
  }
  const h = HAIR[id];
  if (!h) return false;
  const m = new THREE.MeshStandardMaterial({
    map: h.map,
    color: spec.hairTint || '#ffffff',
    roughness: 0.55,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(h.g, rimify(m));
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.scale.setScalar(spec.hairScale || 1.05);
  head.add(mesh);
  return true;
}

// ---------- hair ----------
function strand(parent, mat, pts, r0, r1 = 0.12, scale = 0.095) {
  // tapered tube along a curve; pts in head-centre space
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const seg = 18,
    rad = 8;
  const fr = curve.computeFrenetFrames(seg, false);
  const pos = [],
    idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg,
      P = curve.getPointAt(t),
      R = scale * (r0 * (1 - t) ** 1.35 + r1 * t);
    for (let k = 0; k <= rad; k++) {
      const a = (k / rad) * Math.PI * 2;
      const n = fr.normals[i]
        .clone()
        .multiplyScalar(Math.cos(a) * R)
        .add(fr.binormals[i].clone().multiplyScalar(Math.sin(a) * R));
      pos.push(P.x + n.x, P.y + n.y, P.z + n.z);
    }
  }
  for (let i = 0; i < seg; i++)
    for (let k = 0; k < rad; k++) {
      const a = i * (rad + 1) + k,
        b = a + rad + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const tip = curve.getPointAt(1);
  const ti = pos.length / 3;
  pos.push(tip.x, tip.y, tip.z);
  for (let k = 0; k < rad; k++) idx.push(seg * (rad + 1) + k, ti, seg * (rad + 1) + k + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return mesh(g, mat, 0, 0, 0, parent);
}
// Blender (x, y=back, z=up, head centre cz) -> ours (x, y=up rel. head centre, z=front)
const B = (x, y, z) => [x, z - 4.62, -y];
function hairCap(parent, mat, cut = 0.12, slope = 0.3, vol = 1) {
  const g = new THREE.SphereGeometry(1, 48, 24);
  const p = g.attributes.position;
  const R = HEAD_R;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) * (R + 0.13),
      y = p.getY(i) * 0.66 * vol + 0.2,
      z = p.getZ(i) * (R + 0.14) - 0.02;
    const lim = cut + slope * z;
    if (y < lim) {
      const k = Math.min(1, (lim - y) * 3);
      x *= 1 + 0.04 * k;
      z *= 1 + 0.04 * k;
      y = lim;
    }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return mesh(g, mat, 0, 0, 0, parent);
}
const VOL = {
  messy: 1,
  short: 0.72,
  swept: 0.82,
  long: 0.92,
  under: 0.7,
  spiky: 0.9,
  ponytail: 0.85,
  bun: 0.85,
  pigtails: 0.88,
  bob: 0.9,
};
function buildHair(head, spec) {
  let style = spec.hair || 'short';
  if (style === 'swoop') style = 'swept';
  if (style === 'none' || style === 'bald') return;
  const m = plastic(spec.hairColor || '#3b2416', 0.38);
  const R = HEAD_R,
    cz = 4.62;
  let sd = 3;
  const j = (a) => ((sd = (sd * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * a;
  const s = spec.fringe || 1;
  if (spec.hat && !['crown', 'halo', 'headphones', 'horns', 'bow'].includes(spec.hat) && style !== 'long')
    style = 'under';
  if (style === 'afro') {
    const a = mesh(new THREE.SphereGeometry(0.95, 24, 16), m, 0, 0.3, -0.12, head);
    a.scale.set(1.05, 0.9, 1);
    return;
  }
  if (style === 'buzz') {
    hairCap(head, m, 0.12, 0.42, 1);
    return;
  }
  hairCap(head, m, style === 'under' ? 0.55 : style === 'long' ? -0.05 : 0.1);
  const top = cz + 0.2 + 0.62 * (VOL[style] || 0.8);
  const st = (pts, r0, r1) =>
    strand(
      head,
      m,
      pts.map((p) => B(...p)),
      r0,
      r1,
    );
  const sides = (zEnd = 0.02, r = 1.5, ys = [-0.35, -0.05, 0.25]) => {
    for (const sx of [-1, 1])
      for (const y of ys)
        st(
          [
            [sx * (R - 0.05), y, cz + 0.42],
            [sx * (R + 0.09), y + 0.06, cz + 0.22],
            [sx * (R + 0.07), y + 0.1 + j(0.04), cz + zEnd + j(0.05)],
          ],
          r,
          0.1,
        );
  };
  const back = (zEnd = -0.15, r = 1.8, xs = [-0.42, -0.14, 0.14, 0.42], yo = 0.12) => {
    for (const x of xs)
      st(
        [
          [x, R - 0.1, top - 0.2],
          [x * 1.1, R + yo, cz + 0.2],
          [x * 1.1 + j(0.05), R + yo - 0.04, cz + zEnd + j(0.05)],
        ],
        r,
        0.2,
      );
  };
  if (style === 'messy') {
    for (const x of [-0.46, -0.2, 0.06, 0.3, 0.52])
      st(
        [
          [x * 0.7, 0.05, top + 0.02],
          [x + s * 0.05 + j(0.04), -0.5, top - 0.02 + j(0.04)],
          [x + s * 0.15 + j(0.05), -0.75, cz + 0.5 + j(0.05)],
          [x + s * 0.3 + j(0.06), -0.72, cz + 0.3 + j(0.06)],
        ],
        2.5 + j(0.3),
        0.05,
      );
    for (const [x, y] of [
      [-0.35, -0.05],
      [0, -0.15],
      [0.32, 0],
      [-0.15, 0.3],
      [0.2, 0.32],
    ])
      st(
        [
          [x + j(0.05), y, top - 0.15],
          [x * 1.2 + j(0.08), y + 0.15, top + 0.1 + j(0.05)],
          [x * 1.4 + j(0.1), y + 0.4 + j(0.08), top + 0.22 + j(0.08)],
        ],
        2.3 + j(0.3),
        0.05,
      );
    sides();
    back();
  } else if (style === 'short') {
    for (const x of [-0.42, -0.21, 0, 0.21, 0.42])
      st(
        [
          [x * 0.8, -0.1, top - 0.09],
          [x + s * 0.06, -0.55, top - 0.02],
          [x + s * 0.1 + j(0.03), -0.72, cz + 0.56 + j(0.03)],
        ],
        0.8,
        0.1,
      );
    sides(0.18, 1.1);
    back(0, 1.4, undefined, 0.06);
  } else if (style === 'under') {
    sides(0.18, 1.1, [-0.25, 0.05, 0.3]);
    back(0, 1.4, undefined, 0.06);
  } else if (style === 'swept') {
    for (const x of [0.45, 0.25, 0.05, -0.15, -0.35])
      st(
        [
          [0.3 * s, -0.05, top + 0.02],
          [x * s, -0.45, top + 0.02],
          [(x - 0.25) * s, -0.72, cz + 0.6 + j(0.02)],
          [(x - 0.42) * s, -0.72, cz + 0.45 + j(0.03)],
        ],
        2.1,
        0.15,
      );
    for (const x of [-0.3, 0, 0.3])
      st(
        [
          [x, -0.1, top - 0.05],
          [x * 1.1, 0.25, top + 0.06],
          [x * 1.15, 0.6, top - 0.15],
        ],
        2.2,
        0.4,
      );
    sides(0.15, 1.2);
    back(-0.05, 1.1, undefined, 0.05);
  } else if (style === 'spiky') {
    for (const x of [-0.45, -0.15, 0.15, 0.45])
      st(
        [
          [x * 0.6, 0, top - 0.1],
          [x + s * 0.1, -0.45, top + 0.05],
          [x * 1.2 + s * 0.25, -0.85, cz + 0.55],
        ],
        2.6,
        0.02,
      );
    for (const [x, y] of [
      [-0.3, -0.1],
      [0.25, -0.05],
      [0, 0.2],
      [-0.35, 0.35],
      [0.35, 0.35],
      [0, 0.55],
    ])
      st(
        [
          [x * 0.5, y * 0.5, top - 0.25],
          [x, y, top + 0.15],
          [x * 1.9, y * 1.6 + 0.1, top + 0.55 + j(0.1)],
        ],
        2.8,
        0.02,
      );
    sides(0.1, 1.4);
    back(-0.1, 2, undefined, 0.14);
  } else {
    // long / ponytail / bun / pigtails / bob share the curtain fringe
    for (const sx of [-1, 1])
      [0.08, 0.28, 0.48].forEach((x, k) =>
        st(
          [
            [sx * 0.04, -0.2, top + 0.03],
            [sx * x, -0.62, top - 0.1],
            [sx * (x + 0.12), -0.72, cz + 0.4 - 0.08 * k],
          ],
          1.9,
          0.2,
        ),
      );
    if (style === 'long') {
      for (const sx of [-1, 1])
        [-0.25, 0.05].forEach((y, k) =>
          st(
            [
              [sx * (R - 0.05), y, cz + 0.45],
              [sx * (R + 0.1), y - 0.05, cz - 0.2],
              [sx * (0.72 + 0.12 * k), -0.45 - 0.05 * k, 4.12],
              [sx * (0.72 + 0.12 * k), -0.62, 3.75],
              [sx * (0.7 + 0.12 * k), -0.6, 3.35],
            ],
            1.9,
            0.5,
          ),
        );
      back(-1.2, 2.2, [-0.45, -0.15, 0.15, 0.45], 0.2);
    }
    if (style === 'bob') {
      sides(-0.25, 1.9, [-0.3, 0, 0.3]);
      back(-0.3, 2.2, [-0.45, -0.15, 0.15, 0.45], 0.14);
    }
    if (style === 'ponytail') {
      sides(0.1, 1.2);
      st(
        [
          [0, R - 0.05, top - 0.15],
          [0, R + 0.35, top - 0.25],
          [0, R + 0.5, cz - 0.3],
          [0, R + 0.35, cz - 0.9],
        ],
        2.6,
        0.6,
      );
    }
    if (style === 'bun') {
      sides(0.1, 1.2);
      mesh(new THREE.SphereGeometry(0.34, 16, 12), m, 0, top - 4.62 + 0.1, -0.45, head);
    }
    if (style === 'pigtails') {
      sides(0.1, 1.2);
      for (const sx of [-1, 1])
        st(
          [
            [sx * (R - 0.05), 0.1, cz + 0.35],
            [sx * (R + 0.3), 0.15, cz + 0.2],
            [sx * (R + 0.4), 0.1, cz - 0.4],
            [sx * (R + 0.3), 0.05, cz - 0.8],
          ],
          2.4,
          0.7,
        );
    }
  }
}

// ---------- hats ----------
function buildHat(head, spec) {
  const k = spec.hat;
  if (!k) return;
  const R = HEAD_R,
    top = HEAD_H / 2,
    col = spec.hatColor;
  if (k === 'cap') {
    const m = fabric(col || '#d92b2b');
    const d = mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, top - 0.12, -0.02, head);
    d.scale.set(R + 0.09, 0.5, R + 0.11);
    const b = mesh(
      new THREE.CylinderGeometry(0.52, 0.52, 0.07, 40, 1, false, -Math.PI / 2, Math.PI),
      m,
      0,
      top - 0.17,
      R - 0.1,
      head,
    );
    b.scale.set(1.05, 1, 1.1);
    b.rotation.x = -0.12;
  } else if (k === 'police') {
    const navy = fabric(col || '#1c2b5e');
    mesh(new THREE.CylinderGeometry(R + 0.11, R + 0.05, 0.3, 48), navy, 0, top + 0.28, -0.02, head);
    mesh(new THREE.CylinderGeometry(R + 0.09, R + 0.07, 0.09, 48), plastic('#0b0b0f', 0.2), 0, top + 0.08, -0.02, head);
    const b = mesh(
      new THREE.CylinderGeometry(0.66, 0.66, 0.05, 40, 1, false, -Math.PI / 2, Math.PI),
      plastic('#0b0b0f', 0.2),
      0,
      top + 0.02,
      0.3,
      head,
    );
    b.scale.set(1, 1, 0.62);
    mesh(new THREE.OctahedronGeometry(0.1), gold(), 0, top + 0.26, R + 0.1, head);
  } else if (k === 'crown') {
    const ring = mesh(new THREE.CylinderGeometry(R + 0.1, R + 0.05, 0.3, 48, 1, true), gold(), 0, top + 0.14, 0, head);
    ring.material.side = THREE.DoubleSide;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = Math.sin(a) * (R + 0.1),
        z = Math.cos(a) * (R + 0.1);
      const sp = mesh(new THREE.ConeGeometry(0.14, 0.34, 4), gold(), x, top + 0.45, z, head);
      sp.scale.z = 0.45;
      sp.rotation.y = a;
      mesh(new THREE.SphereGeometry(0.055, 10, 8), gold(), x, top + 0.63, z, head);
      mesh(
        new THREE.SphereGeometry(0.065, 10, 8),
        new THREE.MeshPhysicalMaterial({ color: i % 2 ? '#1a5cf2' : '#e60d1f', roughness: 0.1, clearcoat: 1 }),
        x * 1.04,
        top + 0.14,
        z * 1.04,
        head,
      );
    }
  } else if (k === 'beanie') {
    const m = fabric(col || '#2c6fd6');
    const d = mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, top - 0.25, 0, head);
    d.scale.set(R + 0.1, 0.78, R + 0.1);
    mesh(
      new THREE.CylinderGeometry(R + 0.12, R + 0.12, 0.22, 40),
      fabric(shade(col || '#2c6fd6', 0.8)),
      0,
      top - 0.22,
      0,
      head,
    );
    mesh(new THREE.SphereGeometry(0.16, 12, 10), fabric('#ffffff'), 0, top + 0.55, 0, head);
  } else if (k === 'tophat') {
    const m = plastic(col || '#151515', 0.5);
    mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.06, 32), m, 0, top + 0.02, 0, head);
    mesh(new THREE.CylinderGeometry(0.58, 0.6, 1.05, 32), m, 0, top + 0.56, 0, head);
    mesh(new THREE.CylinderGeometry(0.61, 0.61, 0.16, 32), fabric('#b3122a'), 0, top + 0.14, 0, head);
  } else if (k === 'hardhat') {
    const m = plastic(col || '#ffc61a', 0.35);
    const d = mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, top - 0.15, 0, head);
    d.scale.set(R + 0.12, 0.62, R + 0.12);
    const b = mesh(new THREE.CylinderGeometry(R + 0.3, R + 0.3, 0.05, 32), m, 0, top - 0.14, 0.06, head);
  } else if (k === 'headphones') {
    const b = mesh(new THREE.TorusGeometry(R + 0.12, 0.07, 8, 32, Math.PI), plastic('#1b1b1f'), 0, 0, 0, head);
    b.rotation.z = 0;
    for (const sx of [-1, 1])
      mesh(
        new THREE.CylinderGeometry(0.26, 0.26, 0.2, 20),
        plastic(col || '#ff3d6e'),
        sx * (R + 0.12),
        0,
        0,
        head,
      ).rotation.z = Math.PI / 2;
  } else if (k === 'halo') {
    const h = mesh(
      new THREE.TorusGeometry(0.5, 0.07, 8, 32),
      new THREE.MeshStandardMaterial({ color: '#fff3a0', emissive: '#ffd84a', emissiveIntensity: 2 }),
      0,
      top + 0.55,
      0,
      head,
    );
    h.rotation.x = Math.PI / 2;
    h.castShadow = false;
  } else if (k === 'horns')
    for (const sx of [-1, 1]) {
      const h = mesh(new THREE.ConeGeometry(0.14, 0.5, 12), plastic('#d01f2a'), sx * 0.38, top + 0.15, 0.1, head);
      h.rotation.z = -sx * 0.4;
    }
  else if (k === 'bow') {
    const m = plastic(col || '#ff4f9a', 0.4);
    for (const sx of [-1, 1]) {
      const w = mesh(new THREE.ConeGeometry(0.22, 0.4, 4), m, sx * 0.22, top + 0.1, -0.15, head);
      w.rotation.z = (sx * Math.PI) / 2;
    }
    mesh(new THREE.SphereGeometry(0.1, 10, 8), m, 0, top + 0.1, -0.15, head);
  }
}

function buildExtras(head, spec) {
  const ex = [].concat(spec.extras || []);
  if (spec.glasses === 'glasses') ex.push('glasses');
  if (spec.glasses === 'shades') ex.push('shades');
  const onFace = (u, v, out) => {
    const x = (u - 0.5) * FACE_SPAN,
      y = (v - 0.5) * FACE_SPAN;
    return [x, y, Math.sqrt(Math.max(0.01, headRadius(y) ** 2 - x * x)) + out];
  };
  for (const e of ex) {
    if (e === 'glasses') {
      const m = plastic('#111114', 0.25);
      for (const sx of [-1, 1]) {
        const [x, y, z] = onFace(0.5 + sx * 0.117, 0.6, 0.05);
        mesh(new THREE.TorusGeometry(0.135, 0.022, 8, 32), m, x, y, z, head);
      }
      const [x, y, z] = onFace(0.5, 0.61, 0.08);
      mesh(rbox(0.12, 0.03, 0.03, 0.01), m, x, y, z, head);
    }
    if (e === 'shades') {
      const m = plastic('#0d0d10', 0.1);
      for (const sx of [-1, 1]) {
        const [x, y, z] = onFace(0.5 + sx * 0.12, 0.6, 0.04);
        const l = mesh(rbox(0.3, 0.17, 0.04, 0.04), m, x, y, z, head);
        l.rotation.y = sx * -0.3;
      }
      const [x, y, z] = onFace(0.5, 0.64, 0.06);
      mesh(rbox(0.5, 0.04, 0.03, 0.01), m, x, y, z, head);
    }
    if (e === 'mustache') {
      const m = plastic(spec.beardColor || shade(spec.hairColor || '#3b2416', 0.8), 0.5);
      for (const sx of [-1, 1])
        strand(
          head,
          m,
          [
            onFace(0.5 + sx * 0.025, 0.5, 0.05),
            onFace(0.5 + sx * 0.085, 0.5, 0.06),
            onFace(0.5 + sx * 0.16, 0.465, 0.05),
            onFace(0.5 + sx * 0.22, 0.415, 0.02),
          ],
          0.9,
          0.12,
          0.06,
        );
    }
    if (e === 'beard') {
      const m = plastic(spec.beardColor || '#f2f2f2', 0.6);
      const b = mesh(
        new THREE.SphereGeometry(0.55, 24, 16, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55),
        m,
        0,
        -0.22,
        0.12,
        head,
      );
      b.scale.set(1.12, 1.05, 1);
    }
  }
}

// Hair + procedural hat + glasses/extras of a spec, built into `hc` (a head-centre space with the HEAD_R / HEAD_H proportions). Returns the hair roots.
export function buildHeadgear(hc, spec) {
  const n0 = hc.children.length;
  if (!(spec.hair && /^(rbx:[a-z0-9]+|\d+)$/.test(String(spec.hair)) && rbxHair(hc, spec))) buildHair(hc, spec);
  const hair = hc.children.slice(n0);
  buildHat(hc, spec);
  buildExtras(hc, spec);
  return hair;
}
