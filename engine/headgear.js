// Head gear for the R15 head-fit space (engine/r15_attach.js): procedural hair, hats, glasses / beard / mustache, and the Roblox hair libraries.
// Authored in a head-centre space with HEAD_R / HEAD_H proportions (the "head box" every hairstyle and hat is fitted to; R15 maps it onto the R15 head with fitSpace).
// Was part of engine/rig.js.
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { rimify, fabric, plastic, gold, shade, rbox, mesh } from './materials.js';

export const HEAD_R = 0.64, HEAD_H = 1.24;
const BEV = 0.3, FACE_SPAN = 1.55;
export const headRadius = (y) => { const a = Math.abs(y), k = HEAD_H / 2 - BEV; return a <= k ? HEAD_R : HEAD_R - BEV + Math.sqrt(Math.max(0, BEV * BEV - (a - k) ** 2)); };

// ---------- Roblox hair library (assets/roblox/hair.obj exported from Studio by studio/export_hair.luau) ----------
// slot i head centre at Roblox (i*4, 1000, 0), Roblox front = -Z  ->  ours: head-centre space, front = +Z
const HAIR = {};
export async function loadHairLib() {
  try {
    const cfg = await (await fetch('/config/roblox_hair.json')).json();
    const mtl = await new MTLLoader().setPath('/assets/roblox/').loadAsync('hair.mtl'); mtl.preload();
    const obj = await new OBJLoader().setMaterials(mtl).setPath('/assets/roblox/').loadAsync('hair.obj');
    obj.traverse(o => { if (!o.isMesh) return; const id = cfg.hair.find(i => o.name.startsWith('Hair' + i)); if (id == null) return;
      const k = cfg.hair.indexOf(id); const g = o.geometry.clone(); g.translate(-k * 4, -1000, 0); g.rotateY(Math.PI); g.computeVertexNormals();
      const src = Array.isArray(o.material) ? o.material[0] : o.material; const map = src.map || null; if (map) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8; }
      HAIR[id] = { g, map }; });
  } catch (e) { console.warn('hair lib not loaded', e); }
}
// Named styles (config/roblox_hair.json "styles", files in assets/roblox/hair, built by pipeline/roblox_hair.py): loaded only when a
// character uses them. Greyscale texture x hairColor = any style in any colour.
const STYLE = {}; let STYLE_CFG = null;
export async function preloadHair(names) {
  STYLE_CFG = STYLE_CFG || (await (await fetch('/config/roblox_hair.json')).json()).styles || {};
  await Promise.all([...new Set(names)].filter(n => STYLE_CFG[n] && !STYLE[n]).map(async n => { try {
    const d = await (await fetch(`/assets/roblox/hair/${n}.json`)).json(); const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2)); g.setIndex(d.i); g.computeVertexNormals();
    const map = await new THREE.TextureLoader().loadAsync(`/assets/roblox/hair/${n}.png`); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8; map.flipY = true;
    STYLE[n] = { g, map, gray: STYLE_CFG[n].gray !== false }; } catch (e) { console.warn('hair style ' + n, e.message); } }));
}
export const hairStyles = () => Object.keys(STYLE_CFG || {});
function rbxHair(head, spec) {
  const id = String(spec.hair).replace('rbx:', ''); const st = STYLE[id];
  if (st) { const m = new THREE.MeshStandardMaterial({ map: st.map, color: st.gray ? (spec.hairColor || '#7a4a21') : (spec.hairTint || '#ffffff'), roughness: .6, alphaTest: .5, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(st.g, rimify(m)); mesh.castShadow = mesh.receiveShadow = true; mesh.scale.setScalar(spec.hairScale || 1); head.add(mesh); return true; }
  const h = HAIR[id]; if (!h) return false;
  const m = new THREE.MeshStandardMaterial({ map: h.map, color: spec.hairTint || '#ffffff', roughness: .55, alphaTest: .5, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(h.g, rimify(m)); mesh.castShadow = mesh.receiveShadow = true; mesh.scale.setScalar(spec.hairScale || 1.05); head.add(mesh); return true;
}

// ---------- hair ----------
function strand(parent, mat, pts, r0, r1 = .12, scale = .095) { // tapered tube along a curve; pts in head-centre space
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))); const seg = 18, rad = 8;
  const fr = curve.computeFrenetFrames(seg, false); const pos = [], idx = [];
  for (let i = 0; i <= seg; i++) { const t = i / seg, P = curve.getPointAt(t), R = scale * (r0 * (1 - t) ** 1.35 + r1 * t);
    for (let k = 0; k <= rad; k++) { const a = k / rad * Math.PI * 2; const n = fr.normals[i].clone().multiplyScalar(Math.cos(a) * R).add(fr.binormals[i].clone().multiplyScalar(Math.sin(a) * R)); pos.push(P.x + n.x, P.y + n.y, P.z + n.z); } }
  for (let i = 0; i < seg; i++) for (let k = 0; k < rad; k++) { const a = i * (rad + 1) + k, b = a + rad + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const tip = curve.getPointAt(1); const ti = pos.length / 3; pos.push(tip.x, tip.y, tip.z); for (let k = 0; k < rad; k++) idx.push(seg * (rad + 1) + k, ti, seg * (rad + 1) + k + 1);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return mesh(g, mat, 0, 0, 0, parent);
}
// Blender (x, y=back, z=up, head centre cz) -> ours (x, y=up rel. head centre, z=front)
const B = (x, y, z) => [x, z - 4.62, -y];
function hairCap(parent, mat, cut = .12, slope = .3, vol = 1) {
  const g = new THREE.SphereGeometry(1, 48, 24); const p = g.attributes.position; const R = HEAD_R;
  for (let i = 0; i < p.count; i++) { let x = p.getX(i) * (R + .13), y = p.getY(i) * .66 * vol + .2, z = p.getZ(i) * (R + .14) - .02; const lim = cut + slope * z; if (y < lim) { const k = Math.min(1, (lim - y) * 3); x *= 1 + .04 * k; z *= 1 + .04 * k; y = lim; } p.setXYZ(i, x, y, z); }
  g.computeVertexNormals(); return mesh(g, mat, 0, 0, 0, parent);
}
const VOL = { messy: 1, short: .72, swept: .82, long: .92, under: .7, spiky: .9, ponytail: .85, bun: .85, pigtails: .88, bob: .9 };
function buildHair(head, spec) {
  let style = spec.hair || 'short'; if (style === 'swoop') style = 'swept'; if (style === 'none' || style === 'bald') return;
  const m = plastic(spec.hairColor || '#3b2416', .38); const R = HEAD_R, cz = 4.62; let sd = 3; const j = (a) => ((sd = (sd * 16807) % 2147483647) / 2147483647 - .5) * 2 * a; const s = spec.fringe || 1;
  if (spec.hat && !['crown', 'halo', 'headphones', 'horns', 'bow'].includes(spec.hat) && style !== 'long') style = 'under';
  if (style === 'afro') { const a = mesh(new THREE.SphereGeometry(.95, 24, 16), m, 0, .3, -.12, head); a.scale.set(1.05, .9, 1); return; }
  if (style === 'buzz') { hairCap(head, m, .12, .42, 1); return; }
  hairCap(head, m, style === 'under' ? .55 : style === 'long' ? -.05 : .1);
  const top = cz + .2 + .62 * (VOL[style] || .8);
  const st = (pts, r0, r1) => strand(head, m, pts.map(p => B(...p)), r0, r1);
  const sides = (zEnd = .02, r = 1.5, ys = [-.35, -.05, .25]) => { for (const sx of [-1, 1]) for (const y of ys) st([[sx * (R - .05), y, cz + .42], [sx * (R + .09), y + .06, cz + .22], [sx * (R + .07), y + .1 + j(.04), cz + zEnd + j(.05)]], r, .1); };
  const back = (zEnd = -.15, r = 1.8, xs = [-.42, -.14, .14, .42], yo = .12) => { for (const x of xs) st([[x, R - .1, top - .2], [x * 1.1, R + yo, cz + .2], [x * 1.1 + j(.05), R + yo - .04, cz + zEnd + j(.05)]], r, .2); };
  if (style === 'messy') {
    for (const x of [-.46, -.2, .06, .3, .52]) st([[x * .7, .05, top + .02], [x + s * .05 + j(.04), -.5, top - .02 + j(.04)], [x + s * .15 + j(.05), -.75, cz + .5 + j(.05)], [x + s * .3 + j(.06), -.72, cz + .3 + j(.06)]], 2.5 + j(.3), .05);
    for (const [x, y] of [[-.35, -.05], [0, -.15], [.32, 0], [-.15, .3], [.2, .32]]) st([[x + j(.05), y, top - .15], [x * 1.2 + j(.08), y + .15, top + .1 + j(.05)], [x * 1.4 + j(.1), y + .4 + j(.08), top + .22 + j(.08)]], 2.3 + j(.3), .05);
    sides(); back();
  } else if (style === 'short') {
    for (const x of [-.42, -.21, 0, .21, .42]) st([[x * .8, -.1, top - .09], [x + s * .06, -.55, top - .02], [x + s * .1 + j(.03), -.72, cz + .56 + j(.03)]], .8, .1);
    sides(.18, 1.1); back(0, 1.4, undefined, .06);
  } else if (style === 'under') { sides(.18, 1.1, [-.25, .05, .3]); back(0, 1.4, undefined, .06); }
  else if (style === 'swept') {
    for (const x of [.45, .25, .05, -.15, -.35]) st([[.3 * s, -.05, top + .02], [x * s, -.45, top + .02], [(x - .25) * s, -.72, cz + .6 + j(.02)], [(x - .42) * s, -.72, cz + .45 + j(.03)]], 2.1, .15);
    for (const x of [-.3, 0, .3]) st([[x, -.1, top - .05], [x * 1.1, .25, top + .06], [x * 1.15, .6, top - .15]], 2.2, .4);
    sides(.15, 1.2); back(-.05, 1.1, undefined, .05);
  } else if (style === 'spiky') {
    for (const x of [-.45, -.15, .15, .45]) st([[x * .6, 0, top - .1], [x + s * .1, -.45, top + .05], [x * 1.2 + s * .25, -.85, cz + .55]], 2.6, .02);
    for (const [x, y] of [[-.3, -.1], [.25, -.05], [0, .2], [-.35, .35], [.35, .35], [0, .55]]) st([[x * .5, y * .5, top - .25], [x, y, top + .15], [x * 1.9, y * 1.6 + .1, top + .55 + j(.1)]], 2.8, .02);
    sides(.1, 1.4); back(-.1, 2, undefined, .14);
  } else { // long / ponytail / bun / pigtails / bob share the curtain fringe
    for (const sx of [-1, 1]) [.08, .28, .48].forEach((x, k) => st([[sx * .04, -.2, top + .03], [sx * x, -.62, top - .1], [sx * (x + .12), -.72, cz + .4 - .08 * k]], 1.9, .2));
    if (style === 'long') { for (const sx of [-1, 1]) [-.25, .05].forEach((y, k) => st([[sx * (R - .05), y, cz + .45], [sx * (R + .1), y - .05, cz - .2], [sx * (.72 + .12 * k), -.45 - .05 * k, 4.12], [sx * (.72 + .12 * k), -.62, 3.75], [sx * (.7 + .12 * k), -.6, 3.35]], 1.9, .5)); back(-1.2, 2.2, [-.45, -.15, .15, .45], .2); }
    if (style === 'bob') { sides(-.25, 1.9, [-.3, 0, .3]); back(-.3, 2.2, [-.45, -.15, .15, .45], .14); }
    if (style === 'ponytail') { sides(.1, 1.2); st([[0, R - .05, top - .15], [0, R + .35, top - .25], [0, R + .5, cz - .3], [0, R + .35, cz - .9]], 2.6, .6); }
    if (style === 'bun') { sides(.1, 1.2); mesh(new THREE.SphereGeometry(.34, 16, 12), m, 0, top - 4.62 + .1, -.45, head); }
    if (style === 'pigtails') { sides(.1, 1.2); for (const sx of [-1, 1]) st([[sx * (R - .05), .1, cz + .35], [sx * (R + .3), .15, cz + .2], [sx * (R + .4), .1, cz - .4], [sx * (R + .3), .05, cz - .8]], 2.4, .7); }
  }
}

// ---------- hats ----------
function buildHat(head, spec) {
  const k = spec.hat; if (!k) return; const R = HEAD_R, top = HEAD_H / 2, col = spec.hatColor;
  if (k === 'cap') { const m = fabric(col || '#d92b2b'); const d = mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, top - .12, -.02, head); d.scale.set(R + .09, .5, R + .11); const b = mesh(new THREE.CylinderGeometry(.52, .52, .07, 40, 1, false, -Math.PI / 2, Math.PI), m, 0, top - .17, R - .1, head); b.scale.set(1.05, 1, 1.1); b.rotation.x = -.12; }
  else if (k === 'police') { const navy = fabric(col || '#1c2b5e'); mesh(new THREE.CylinderGeometry(R + .11, R + .05, .3, 48), navy, 0, top + .28, -.02, head); mesh(new THREE.CylinderGeometry(R + .09, R + .07, .09, 48), plastic('#0b0b0f', .2), 0, top + .08, -.02, head); const b = mesh(new THREE.CylinderGeometry(.66, .66, .05, 40, 1, false, -Math.PI / 2, Math.PI), plastic('#0b0b0f', .2), 0, top + .02, .3, head); b.scale.set(1, 1, .62); mesh(new THREE.OctahedronGeometry(.1), gold(), 0, top + .26, R + .1, head); }
  else if (k === 'crown') { const ring = mesh(new THREE.CylinderGeometry(R + .1, R + .05, .3, 48, 1, true), gold(), 0, top + .14, 0, head); ring.material.side = THREE.DoubleSide; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const x = Math.sin(a) * (R + .1), z = Math.cos(a) * (R + .1); const sp = mesh(new THREE.ConeGeometry(.14, .34, 4), gold(), x, top + .45, z, head); sp.scale.z = .45; sp.rotation.y = a; mesh(new THREE.SphereGeometry(.055, 10, 8), gold(), x, top + .63, z, head); mesh(new THREE.SphereGeometry(.065, 10, 8), new THREE.MeshPhysicalMaterial({ color: i % 2 ? '#1a5cf2' : '#e60d1f', roughness: .1, clearcoat: 1 }), x * 1.04, top + .14, z * 1.04, head); } }
  else if (k === 'beanie') { const m = fabric(col || '#2c6fd6'); const d = mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, top - .25, 0, head); d.scale.set(R + .1, .78, R + .1); mesh(new THREE.CylinderGeometry(R + .12, R + .12, .22, 40), fabric(shade(col || '#2c6fd6', .8)), 0, top - .22, 0, head); mesh(new THREE.SphereGeometry(.16, 12, 10), fabric('#ffffff'), 0, top + .55, 0, head); }
  else if (k === 'tophat') { const m = plastic(col || '#151515', .5); mesh(new THREE.CylinderGeometry(.95, .95, .06, 32), m, 0, top + .02, 0, head); mesh(new THREE.CylinderGeometry(.58, .6, 1.05, 32), m, 0, top + .56, 0, head); mesh(new THREE.CylinderGeometry(.61, .61, .16, 32), fabric('#b3122a'), 0, top + .14, 0, head); }
  else if (k === 'hardhat') { const m = plastic(col || '#ffc61a', .35); const d = mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, top - .15, 0, head); d.scale.set(R + .12, .62, R + .12); const b = mesh(new THREE.CylinderGeometry(R + .3, R + .3, .05, 32), m, 0, top - .14, .06, head); }
  else if (k === 'headphones') { const b = mesh(new THREE.TorusGeometry(R + .12, .07, 8, 32, Math.PI), plastic('#1b1b1f'), 0, 0, 0, head); b.rotation.z = 0; for (const sx of [-1, 1]) mesh(new THREE.CylinderGeometry(.26, .26, .2, 20), plastic(col || '#ff3d6e'), sx * (R + .12), 0, 0, head).rotation.z = Math.PI / 2; }
  else if (k === 'halo') { const h = mesh(new THREE.TorusGeometry(.5, .07, 8, 32), new THREE.MeshStandardMaterial({ color: '#fff3a0', emissive: '#ffd84a', emissiveIntensity: 2 }), 0, top + .55, 0, head); h.rotation.x = Math.PI / 2; h.castShadow = false; }
  else if (k === 'horns') for (const sx of [-1, 1]) { const h = mesh(new THREE.ConeGeometry(.14, .5, 12), plastic('#d01f2a'), sx * .38, top + .15, .1, head); h.rotation.z = -sx * .4; }
  else if (k === 'bow') { const m = plastic(col || '#ff4f9a', .4); for (const sx of [-1, 1]) { const w = mesh(new THREE.ConeGeometry(.22, .4, 4), m, sx * .22, top + .1, -.15, head); w.rotation.z = sx * Math.PI / 2; } mesh(new THREE.SphereGeometry(.1, 10, 8), m, 0, top + .1, -.15, head); }
}

function buildExtras(head, spec) {
  const ex = [].concat(spec.extras || []); if (spec.glasses === 'glasses') ex.push('glasses'); if (spec.glasses === 'shades') ex.push('shades');
  const onFace = (u, v, out) => { const x = (u - .5) * FACE_SPAN, y = (v - .5) * FACE_SPAN; return [x, y, Math.sqrt(Math.max(.01, headRadius(y) ** 2 - x * x)) + out]; };
  for (const e of ex) {
    if (e === 'glasses') { const m = plastic('#111114', .25); for (const sx of [-1, 1]) { const [x, y, z] = onFace(.5 + sx * .117, .6, .05); mesh(new THREE.TorusGeometry(.135, .022, 8, 32), m, x, y, z, head); } const [x, y, z] = onFace(.5, .61, .08); mesh(rbox(.12, .03, .03, .01), m, x, y, z, head); }
    if (e === 'shades') { const m = plastic('#0d0d10', .1); for (const sx of [-1, 1]) { const [x, y, z] = onFace(.5 + sx * .12, .6, .04); const l = mesh(rbox(.3, .17, .04, .04), m, x, y, z, head); l.rotation.y = sx * -.3; } const [x, y, z] = onFace(.5, .64, .06); mesh(rbox(.5, .04, .03, .01), m, x, y, z, head); }
    if (e === 'mustache') { const m = plastic(spec.beardColor || shade(spec.hairColor || '#3b2416', .8), .5); for (const sx of [-1, 1]) strand(head, m, [onFace(.5 + sx * .025, .5, .05), onFace(.5 + sx * .085, .5, .06), onFace(.5 + sx * .16, .465, .05), onFace(.5 + sx * .22, .415, .02)], .9, .12, .06); }
    if (e === 'beard') { const m = plastic(spec.beardColor || '#f2f2f2', .6); const b = mesh(new THREE.SphereGeometry(.55, 24, 16, 0, Math.PI * 2, Math.PI * .45, Math.PI * .55), m, 0, -.22, .12, head); b.scale.set(1.12, 1.05, 1); }
  }
}

// Hair + procedural hat + glasses/extras of a spec, built into `hc` (a head-centre space with the HEAD_R / HEAD_H proportions). Returns the hair roots.
export function buildHeadgear(hc, spec) {
  const n0 = hc.children.length; if (!(spec.hair && /^(rbx:[a-z0-9]+|\d+)$/.test(String(spec.hair)) && rbxHair(hc, spec))) buildHair(hc, spec); const hair = hc.children.slice(n0); buildHat(hc, spec); buildExtras(hc, spec); return hair;
}
