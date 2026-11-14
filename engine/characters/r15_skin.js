// R15 skin, clothes and face (docs/R15.md, section "Skin, clothes, face"). Called from buildR15 as buildSkin(ch, spec).
//  * colours per part from the R6 spec keys (skin skinHead skinTorso skinArms skinLegs shirt pants shoes jacket sleeves bottom hands partColors)
//  * classic Roblox 585x559 shirt / pants templates (spec shirt:"rbx:<name>", pants) projected onto the R15 parts by POSITION (see tplGeometry)
//  * short sleeves / shorts: a 1-D colour strip texture split at the right height; procedural details (collar, pocket, heart...) ported from the retired R6 builder
//  * face patch fit to the (slightly enlarged) head
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RIM } from '../shared/materials.js';
import { getSkeleton } from './skeleton.js';

// ---------- rim shader + materials (shared RIM uniforms from engine/shared/materials.js) ----------
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

let normalTex = null;
function fabricNormal() {
  if (normalTex) return normalTex;
  const N = 256,
    cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  const h = new Float32Array(N * N);
  let s = 9;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N * N; i++) h[i] = r();
  for (let k = 0; k < 2; k++)
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        h[i] = (h[i] + h[y * N + ((x + 1) % N)] + h[((y + 1) % N) * N + x]) / 3;
      }
  const im = g.createImageData(N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const dx = h[y * N + ((x + 1) % N)] - h[i],
        dy = h[((y + 1) % N) * N + x] - h[i];
      im.data[i * 4] = 128 + dx * 600;
      im.data[i * 4 + 1] = 128 + dy * 600;
      im.data[i * 4 + 2] = 255;
      im.data[i * 4 + 3] = 255;
    }
  g.putImageData(im, 0, 0);
  normalTex = new THREE.CanvasTexture(cv);
  normalTex.wrapS = normalTex.wrapT = THREE.RepeatWrapping;
  normalTex.repeat.set(3, 3);
  return normalTex;
}
const skinMat = (c) =>
  rimify(new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.35 }));
const clothMat = (c) =>
  rimify(
    new THREE.MeshStandardMaterial({
      color: c,
      roughness: 0.82,
      normalMap: fabricNormal(),
      normalScale: new THREE.Vector2(0.35, 0.35),
    }),
  );
const shoeMat = (c) =>
  rimify(new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.35 }));
const plastic = (c, rough = 0.42) =>
  rimify(new THREE.MeshPhysicalMaterial({ color: c, roughness: rough, clearcoat: 0.35, clearcoatRoughness: 0.35 }));
const goldMat = () =>
  rimify(
    new THREE.MeshStandardMaterial({
      color: '#ffc22e',
      metalness: 1,
      roughness: 0.25,
      emissive: '#3a2600',
      emissiveIntensity: 0.4,
    }),
  );

// ---------- classic template (585x559) regions [x, y, w, h] per face, the classic template tables (character faces +z, its RIGHT side is -x) ----------
// order: px nx py ny pz nz  (engine axes)
const T_TORSO = {
  px: [361, 74, 64, 128],
  nx: [165, 74, 64, 128],
  py: [231, 8, 128, 64],
  ny: [231, 204, 128, 64],
  pz: [231, 74, 128, 128],
  nz: [427, 74, 128, 128],
};
const T_RIGHT = {
  px: [19, 355, 64, 128],
  nx: [151, 355, 64, 128],
  py: [217, 289, 64, 64],
  ny: [217, 485, 64, 64],
  pz: [217, 355, 64, 128],
  nz: [85, 355, 64, 128],
};
const T_LEFT = {
  px: [374, 355, 64, 128],
  nx: [506, 355, 64, 128],
  py: [308, 289, 64, 64],
  ny: [308, 485, 64, 64],
  pz: [308, 355, 64, 128],
  nz: [440, 355, 64, 128],
};
const TW = 585,
  TH = 559;
const GROUP = {
  UpperTorso: 'torso',
  LowerTorso: 'torso',
  LeftUpperArm: 'armL',
  LeftLowerArm: 'armL',
  LeftHand: 'armL',
  RightUpperArm: 'armR',
  RightLowerArm: 'armR',
  RightHand: 'armR',
  LeftUpperLeg: 'legL',
  LeftLowerLeg: 'legL',
  LeftFoot: 'legL',
  RightUpperLeg: 'legR',
  RightLowerLeg: 'legR',
  RightFoot: 'legR',
};
const TPL = { torso: T_TORSO, armL: T_LEFT, armR: T_RIGHT, legL: T_LEFT, legR: T_RIGHT };

// Vertical extent (rest pose, engine frame, relative to HumanoidRootPart) of each template group + half width / depth.
let METRICS = null;
function metrics() {
  if (METRICS) return METRICS;
  const S = getSkeleton('r15'),
    cy = (n) => S.byName[n].cf.p[1],
    bb = (n) => S.geo[n].boundingBox;
  const top = (n) => cy(n) + bb(n).max.y,
    bot = (n) => cy(n) + bb(n).min.y,
    hipY = S.byName.LowerTorso.cf.p[1] + S.jointByName.LeftHip.c0.p[1];
  METRICS = {
    torso: { y0: top('UpperTorso'), y1: bot('LowerTorso'), hw: bb('LowerTorso').max.x, hd: 0.502, local: false },
    armL: { y0: top('LeftUpperArm'), y1: bot('LeftHand'), hw: 0.5, hd: 0.5, local: true },
    armR: { y0: top('RightUpperArm'), y1: bot('RightHand'), hw: 0.5, hd: 0.5, local: true },
    legL: { y0: hipY, y1: bot('LeftFoot'), hw: 0.5, hd: 0.5, local: true },
    legR: { y0: hipY, y1: bot('RightFoot'), hw: 0.5, hd: 0.5, local: true },
  };
  return METRICS;
}
const GEO = {};
// Non-indexed copy of a part with new uv. mode 'tpl': classic template, the face direction of each triangle (dominant axis of its normal) picks the region, the
// position inside the region comes from the vertex position (planar projection). mode 'strip': u = .5, v = height along the group (for 1-D colour strips).
function remapGeometry(part, mode) {
  const key = part + '|' + mode;
  if (GEO[key]) return GEO[key];
  const S = getSkeleton('r15'),
    g0 = S.geo[part],
    grp = GROUP[part],
    M = metrics()[grp],
    T = TPL[grp];
  const P = g0.attributes.position,
    N = g0.attributes.normal,
    idx = g0.index.array,
    nt = idx.length,
    pos = new Float32Array(nt * 3),
    nor = new Float32Array(nt * 3),
    uv = new Float32Array(nt * 2);
  const rest = S.byName[part].cf.p,
    ox = M.local ? 0 : -rest[0],
    oy = rest[1],
    oz = M.local ? 0 : -rest[2]; // engine frame: x' = -x, z' = -z
  const clamp = (v) => Math.max(0, Math.min(1, v)),
    v3 = new THREE.Vector3();
  for (let t = 0; t < nt; t += 3) {
    v3.set(0, 0, 0);
    for (let k = 0; k < 3; k++)
      ((v3.x += N.getX(idx[t + k])), (v3.y += N.getY(idx[t + k])), (v3.z += N.getZ(idx[t + k])));
    const ax = Math.abs(v3.x),
      ay = Math.abs(v3.y),
      az = Math.abs(v3.z),
      face =
        ax >= ay && ax >= az ? (v3.x > 0 ? 'px' : 'nx') : ay >= az ? (v3.y > 0 ? 'py' : 'ny') : v3.z > 0 ? 'pz' : 'nz';
    for (let k = 0; k < 3; k++) {
      const i = idx[t + k],
        o = t + k,
        x = P.getX(i) + ox,
        y = P.getY(i) + oy,
        z = P.getZ(i) + oz;
      pos[o * 3] = P.getX(i);
      pos[o * 3 + 1] = P.getY(i);
      pos[o * 3 + 2] = P.getZ(i);
      nor[o * 3] = N.getX(i);
      nor[o * 3 + 1] = N.getY(i);
      nor[o * 3 + 2] = N.getZ(i);
      if (mode === 'strip') {
        uv[o * 2] = 0.5;
        uv[o * 2 + 1] = 1 - clamp((M.y0 - y) / (M.y0 - M.y1));
        continue;
      }
      const ty = clamp((M.y0 - y) / (M.y0 - M.y1));
      let s,
        tt = ty;
      if (face === 'pz') s = (x + M.hw) / (2 * M.hw);
      else if (face === 'nz') s = (M.hw - x) / (2 * M.hw);
      else if (face === 'px') s = (M.hd - z) / (2 * M.hd);
      else if (face === 'nx') s = (z + M.hd) / (2 * M.hd);
      else if (face === 'py') {
        s = (x + M.hw) / (2 * M.hw);
        tt = (z + M.hd) / (2 * M.hd);
      } else {
        s = (x + M.hw) / (2 * M.hw);
        tt = (M.hd - z) / (2 * M.hd);
      }
      const [rx, ry, rw, rh] = T[face];
      uv[o * 2] = (rx + 0.5 + clamp(s) * (rw - 1)) / TW;
      uv[o * 2 + 1] = 1 - (ry + 0.5 + clamp(tt) * (rh - 1)) / TH;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return (GEO[key] = g);
}

// ---------- clothing images (own loader: the sheet repaints itself when the image arrives) ----------
const IMG = {};
function clothImage(kind, name, onload) {
  const k = kind + '_' + name,
    e = IMG[k] || (IMG[k] = { img: null, cbs: [] });
  if (e.img) return e.img;
  if (!e.loading) {
    e.loading = true;
    const i = new Image();
    i.onload = () => {
      e.img = i;
      e.cbs.forEach((f) => f());
    };
    i.onerror = () => console.warn('clothing ' + name + ' missing');
    i.src = `/assets/roblox/clothes/${k}.png`;
  }
  if (onload) e.cbs.push(onload);
  return null;
}
const isRbx = (v) => typeof v === 'string' && v.startsWith('rbx:');
function sheet(skin, layers) {
  // layers: [string colour | {kind,name}]  -> texture repainted when images load
  const cv = document.createElement('canvas');
  cv.width = TW;
  cv.height = TH;
  const g = cv.getContext('2d'),
    map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const paint = () => {
    g.fillStyle = skin;
    g.fillRect(0, 0, TW, TH);
    for (const l of layers) {
      if (typeof l === 'string') {
        g.fillStyle = l;
        g.fillRect(0, 0, TW, TH);
      } else {
        const im = clothImage(l.kind, l.name);
        if (im) g.drawImage(im, 0, 0, TW, TH);
      }
    }
    map.needsUpdate = true;
  };
  for (const l of layers) if (typeof l !== 'string') clothImage(l.kind, l.name, paint);
  paint();
  return map;
}
function stripTex(stops) {
  // [[from 0..1, colour], ...] top to bottom
  const cv = document.createElement('canvas');
  cv.width = 4;
  cv.height = 512;
  const g = cv.getContext('2d');
  stops.forEach(([a, c], i) => {
    const b = stops[i + 1] ? stops[i + 1][0] : 1;
    g.fillStyle = c;
    g.fillRect(0, Math.floor(a * 512), 4, Math.ceil((b - a) * 512) + 1);
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

// ---------- face ----------
export const HEAD_SCALE = 1.1; // the classic R15 head is 9% smaller than the R6 head; the whole Head node is scaled about the neck so hair / hats / glasses follow
const FACE_SPAN = 1.41;
let faceGeo = null;
function faceGeometry() {
  if (faceGeo) return faceGeo;
  const S = getSkeleton('r15'),
    hm = new THREE.Mesh(S.geo.Head, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })),
    rc = new THREE.Raycaster(),
    dir = new THREE.Vector3(0, 0, -1);
  const nx = 32,
    ny = 32,
    hw = 0.56,
    hh = 0.5,
    pos = [],
    uv = [],
    idx = [];
  hm.updateMatrixWorld(true);
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

// ---------- details (authored in classic torso space ty 0..2, mapped onto the R15 torso) ----------
const RB = {};
const rbox = (w, h, d, r = 0.08) =>
  RB[`${w}|${h}|${d}|${r}`] ||
  (RB[`${w}|${h}|${d}|${r}`] = new RoundedBoxGeometry(
    w,
    h,
    d,
    3,
    Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001),
  ));
const put = (geo, mat, x, y, z, parent) => {
  const m = new THREE.Mesh(geo, rimify(mat));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
};

function details(ch, spec, C) {
  const S = getSkeleton('r15'),
    up = ch.partNodes.UpperTorso,
    lo = ch.partNodes.LowerTorso,
    M = metrics().torso,
    k = (M.y0 - M.y1) / 2,
    upY = S.byName.UpperTorso.cf.p[1],
    loY = S.byName.LowerTorso.cf.p[1];
  const space = (node, cy) => {
    const g = new THREE.Group();
    g.position.y = M.y1 - cy;
    g.scale.set(0.972, k, 1);
    node.add(g);
    return g;
  }; // R6 torso coords (y 0..2) inside the node
  const U = space(up, upY),
    L = space(lo, loY),
    at = (ty) => (ty >= 0.38 ? U : L),
    FZ = 0.5;
  const D = new Set(spec.details || ['crewneck']);
  if (spec.tie) D.add('tie');
  if (spec.hood) D.add('hood');
  const top = C.shirtColor,
    mTop = clothMat(top),
    mTrim = clothMat(shade(top, 0.86)),
    mAcc = clothMat(spec.tie || spec.accent || '#f2f2f2');
  if (isRbx(spec.shirt)) return; // the template carries its own details
  if (D.has('crewneck') && !D.has('collar') && !D.has('hood'))
    put(rbox(0.9, 0.12, 0.06, 0.03), mTrim, 0, 1.93, FZ + 0.005, U);
  if (D.has('collar'))
    for (const sx of [-1, 1]) {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      sh.lineTo(sx * 0.42, 0.04);
      sh.lineTo(sx * 0.3, -0.3);
      sh.closePath();
      put(new THREE.ExtrudeGeometry(sh, { depth: 0.035, bevelEnabled: false }), mAcc, sx * 0.06, 1.97, FZ + 0.005, U);
    }
  if (D.has('buttons'))
    for (let i = 0; i < 3; i++)
      put(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12), mAcc, 0, 1.6 - 0.32 * i, FZ + 0.02, U).rotation.x =
        Math.PI / 2;
  if (D.has('tie')) {
    const tm = clothMat(spec.tie || '#c62828');
    put(rbox(0.16, 0.14, 0.06, 0.03), tm, 0, 1.86, FZ + 0.03, U);
    const sh = new THREE.Shape();
    [
      [-0.08, 0],
      [0.08, 0],
      [0.12, -0.9],
      [0, -1.05],
      [-0.12, -0.9],
    ].forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    put(new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false }), tm, 0, 1.8, FZ + 0.01, U);
  }
  if (D.has('badge')) {
    const sh = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = 0.16 * (i % 2 ? 0.45 : 1),
        a = (Math.PI * i) / 5,
        x = r * Math.sin(a),
        y = r * Math.cos(a);
      i ? sh.lineTo(x, y) : sh.moveTo(x, y);
    }
    put(new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false }), goldMat(), -0.5, 1.45, FZ, U);
  }
  if (D.has('belt')) {
    put(rbox(2.03, 0.16, 1.03, 0.03), plastic('#141416', 0.35), 0, 0.1, 0, at(0.1));
    put(rbox(0.24, 0.2, 0.05, 0.02), goldMat(), 0, 0.1, FZ + 0.03, at(0.1));
  }
  if (D.has('pocket')) put(rbox(0.5, 0.42, 0.06, 0.03), mTrim, 0.45, 1.45, FZ + 0.01, U);
  if (D.has('kangaroo')) put(rbox(1.2, 0.5, 0.06, 0.05), mTrim, 0, 0.5, FZ + 0.01, U);
  if (D.has('hood')) {
    put(rbox(1.5, 0.4, 0.45, 0.18), mTrim, 0, 1.95, -0.42, U);
    for (const sx of [-1, 1]) put(rbox(0.05, 0.5, 0.05, 0.02), clothMat('#f4f4f4'), sx * 0.18, 1.65, FZ + 0.03, U);
  }
  if (D.has('stripes')) for (const y of [1.35, 0.75]) put(rbox(2.02, 0.2, 1.02, 0.03), mAcc, 0, y, 0, U);
  if (D.has('heart') || D.has('star')) {
    const sh = new THREE.Shape();
    if (D.has('heart')) {
      for (let i = 0; i < 40; i++) {
        const t = (2 * Math.PI * i) / 40,
          x = 0.016 * 16 * Math.sin(t) ** 3,
          y = 0.016 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        i ? sh.lineTo(x, y) : sh.moveTo(x, y);
      }
    } else
      for (let i = 0; i < 10; i++) {
        const r = 0.3 * (i % 2 ? 0.45 : 1),
          a = (Math.PI * i) / 5;
        i ? sh.lineTo(r * Math.sin(a), r * Math.cos(a)) : sh.moveTo(0, r);
      }
    put(
      new THREE.ExtrudeGeometry(sh, { depth: 0.035, bevelEnabled: false }),
      clothMat(spec.emblem || '#ffd23f'),
      0,
      1.2,
      FZ,
      U,
    );
  }
  if (spec.jacket) {
    const mj = clothMat(spec.jacket);
    for (const sx of [-1, 1]) {
      put(rbox(0.72, 1.64, 1.06, 0.07), mj, sx * 0.66, 1.19, 0, U);
      put(rbox(0.72, 0.4, 1.06, 0.07), mj, sx * 0.66, 0.19, 0, L);
    }
  }
  if (spec.logo) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const g = cv.getContext('2d');
    g.fillStyle = spec.logoColor || '#fff';
    g.font = '62px "Lilita One"';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const w = String(spec.logo).split(' ');
    w.forEach((t, i) => g.fillText(t, 128, 128 + (i - (w.length - 1) / 2) * 64));
    const tx = new THREE.CanvasTexture(cv);
    tx.colorSpace = THREE.SRGBColorSpace;
    const p = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 1.4),
      new THREE.MeshStandardMaterial({ map: tx, transparent: true, roughness: 0.8 }),
    );
    p.position.set(0, 1.05, FZ + 0.006);
    U.add(p);
  }
  if (D.has('cuffs') && (spec.sleeves || 'long') === 'long')
    for (const n of ['LeftLowerArm', 'RightLowerArm'])
      put(rbox(1.04, 0.16, 1.04, 0.04), mTrim, 0, -0.46, 0, ch.partNodes[n]);
  if (spec.bottom === 'skirt') {
    const g = new THREE.CylinderGeometry(1.15, 1.35, 1, 4, 1);
    g.rotateY(Math.PI / 4);
    const sk = put(g, clothMat(C.pantsColor), 0, 1.52, 0, U);
    sk.scale.set(1.05, 0.97, 0.62);
    sk.position.y = 1.52 - 0.55;
  } else if (spec.bottom === 'shorts') put(rbox(2, 0.2, 1, 0.04), clothMat(C.pantsColor), 0, 0.06, 0, L);
}

// ---------- main ----------
export function buildSkin(ch, spec) {
  const skin = spec.skin || '#f5c79a',
    shirtR = isRbx(spec.shirt) ? spec.shirt.slice(4) : null,
    pantsR = isRbx(spec.pants) ? spec.pants.slice(4) : null;
  const shirt = shirtR ? '#3a8dde' : typeof spec.shirt === 'string' ? spec.shirt : '#3a8dde',
    pants = pantsR ? '#22304f' : typeof spec.pants === 'string' ? spec.pants : '#22304f';
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
  const showHands = sleeves !== 'long' || !!spec.hands; // R6: long sleeves cover the hands unless spec.hands
  const colors = {},
    mats = ch.mats,
    S = metrics();
  const sheets = {}; // group -> texture
  if (shirtR || pantsR) {
    const tl = [];
    if (pantsR) tl.push({ kind: 'p', name: pantsR });
    tl.push(shirtR ? { kind: 's', name: shirtR } : shirt);
    if (shirtR || pantsR)
      sheets.torso = sheet(
        sk.torso,
        shirtR ? [...(pantsR ? [{ kind: 'p', name: pantsR }] : []), { kind: 's', name: shirtR }] : tl,
      );
    if (shirtR) sheets.armL = sheets.armR = sheet(sk.arms, [{ kind: 's', name: shirtR }]);
    if (pantsR) sheets.legL = sheets.legR = sheet(sk.legs, [{ kind: 'p', name: pantsR }]);
  }
  const base = {
    UpperTorso: shirt,
    LowerTorso: bottom === 'skirt' ? pants : pants,
    UpperArm: sleeves === 'none' ? sk.arms : arm,
    LowerArm: sleeves === 'long' ? arm : sk.arms,
    Hand: showHands ? sk.arms : arm,
    UpperLeg: bottom === 'skirt' ? sk.legs : pants,
    LowerLeg: bottom === 'pants' ? pants : sk.legs,
    Foot: shoes,
    Head: sk.head,
  };
  const strips = {}; // part -> texture for split parts
  if (sleeves === 'short' && !sheets.armL)
    for (const s of ['Left', 'Right'])
      strips[s + 'UpperArm'] = stripTex([
        [0, arm],
        [0.38, sk.arms],
      ]);
  if (bottom === 'shorts' && !sheets.legL)
    for (const s of ['Left', 'Right'])
      strips[s + 'UpperLeg'] = stripTex([
        [0, pants],
        [0.42, sk.legs],
      ]);
  for (const n of Object.keys(ch.parts)) {
    const mesh = ch.parts[n];
    if (!mesh.isMesh) continue;
    const b = n.replace(/^(Left|Right)/, ''),
      grp = GROUP[n];
    let col = base[b] ?? sk.torso,
      mat,
      geo = null;
    if (n === 'Head') mat = skinMat(col);
    else if (sheets[grp]) {
      geo = remapGeometry(n, 'tpl');
      mat = rimify(new THREE.MeshStandardMaterial({ map: sheets[grp], roughness: 0.78 }));
      col = '#ffffff';
    } else if (strips[n]) {
      geo = remapGeometry(n, 'strip');
      mat = rimify(new THREE.MeshStandardMaterial({ map: strips[n], roughness: 0.82 }));
      col = '#ffffff';
    } else if (/Foot/.test(n)) mat = shoeMat(col);
    else if (
      (b === 'Hand' && showHands) ||
      (b === 'LowerLeg' && bottom !== 'pants') ||
      (b === 'UpperLeg' && bottom === 'skirt') ||
      (b === 'LowerArm' && sleeves !== 'long') ||
      (b === 'UpperArm' && sleeves === 'none')
    )
      mat = skinMat(col);
    else mat = clothMat(col);
    if (geo) mesh.geometry = geo;
    mesh.material.dispose?.();
    mesh.material = mat;
    mats[n] = mat;
    colors[n] = col;
    if (spec.partColors?.[n]) {
      mat.color.set(spec.partColors[n]);
      colors[n] = spec.partColors[n];
    }
  }
  colors.HumanoidRootPart = skin;
  Object.assign(ch.skin, colors);
  // head: scale the node about the neck pivot, fit the face patch
  const hn = ch.partNodes.Head;
  hn.scale.setScalar(HEAD_SCALE);
  hn.position.multiplyScalar(HEAD_SCALE);
  ch.face.geometry = faceGeometry();
  details(ch, spec, { shirtColor: shirt, pantsColor: pants });
}
