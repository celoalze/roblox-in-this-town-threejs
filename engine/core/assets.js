// engine/core/assets.js
// Map and kit asset loading, kit placement, cover maps, and scene asset prep.
// Must not manage per-frame camera or rendering loops.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { state } from './state.js';
import { V, D2R } from './math.js';
import { resolveAt } from './motion.js';
import { portalFor, envify } from './portals.js';
import { buildSet, INTERIOR, mat } from '../environments/sets.js';
import { makeProp, makeFX, GRIP } from '../props/props.js';
import { isModelProp, makeModelProp, wearOf, makeWornProp } from '../props/modelprops.js';
import { wearInfo, makeWear, partSpace } from '../characters/wear/wear.js';
import { coverMap, fitCover } from '../characters/wear/layers.js';
import { applyTreat } from '../environments/treatments.js';

export { envify } from './portals.js';

// Exported Roblox maps (glTF from Studio, units = studs, Roblox world coords). Merged per material for speed.
export async function loadMap(file) {
  if (state.MAPS[file]) return state.MAPS[file];
  const L = new GLTFLoader();
  const gltf = await L.loadAsync(`/assets/maps/${file}.glb`).catch(() => L.loadAsync(`/assets/maps/${file}.gltf`));
  gltf.scene.updateMatrixWorld(true);
  const buckets = new Map();
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    let m = o.material;
    const hasMap = !!m.map;
    let key = m.uuid;
    const ca = o.geometry.attributes.color;
    const alpha = ca && ca.itemSize === 4 ? ca.getW(0) : 1; // Roblox Transparency lives in vertex alpha
    if (alpha < 0.05 || o.name === 'delete me' || (m.transparent && !m.map)) return;
    if (alpha < 0.95) {
      key += '_t' + alpha.toFixed(1);
      m =
        state.MAPS['_mat' + key] ||
        (state.MAPS['_mat' + key] = Object.assign(m.clone(), { transparent: true, opacity: alpha, depthWrite: false }));
    }
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const a of Object.keys(g.attributes))
      if (a !== 'position' && a !== 'normal' && a !== 'color' && !(hasMap && a === 'uv')) g.deleteAttribute(a);
    if (!g.attributes.color) {
      const c = new Float32Array(g.attributes.position.count * 3).fill(1);
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    } else if (g.attributes.color.itemSize === 4) {
      const s4 = g.attributes.color,
        c = new Float32Array(s4.count * 3);
      for (let i = 0; i < s4.count; i++) {
        c[i * 3] = s4.getX(i);
        c[i * 3 + 1] = s4.getY(i);
        c[i * 3 + 2] = s4.getZ(i);
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (hasMap && !g.attributes.uv) return;
    (buckets.get(key) || buckets.set(key, { m, list: [] }).get(key)).list.push(g);
  });
  const grp = new THREE.Group();
  grp.userData.isMap = true;
  for (const { m, list } of buckets.values()) {
    const geo = mergeGeometries(list, false);
    if (!geo) continue;
    m.metalness = 0;
    m.vertexColors = true;
    if (!m.transparent) {
      m.transparent = false;
      m.opacity = 1;
    }
    m.roughness = Math.max(m.roughness ?? 0.8, 0.7);
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = mesh.receiveShadow = true;
    grp.add(mesh);
  }
  return (state.MAPS[file] = grp);
}

// Polyfork kits (assets/models/kits/<kit>/kit.mjs builds the composed place, metres) scaled to studs.
export const KS = 3.4;
export async function loadKit(id) {
  if (state.KITS[id]) return state.KITS[id];
  const base = `/assets/models/kits/${id}/`;
  const mod = await import(base + 'kit.mjs');
  const place = await mod.buildKit({ folder: base, people: 'none' });
  try {
    await place.surround();
  } catch (e) {}
  if (place.lamps) place.lamps.visible = false; // night light-pools: opacity 0 by day but still written to the AO depth/normal pass = black slabs on the ground
  place.group.traverse((o) => {
    if (o.isMesh && o.material && o.material.transparent && o.material.opacity === 0) o.visible = false;
  });
  place.group.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });
  if (!place.interior) {
    const gCol =
      place.groundColor ||
      (id.includes('farm') ? '#95aa5d' : id.includes('tokyo') || id.includes('japan') ? '#3f8a5e' : '#5a9a45');
    const gy = place.groundY ?? -0.05;
    const groundGeo = new THREE.PlaneGeometry(1000, 1000);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = mat(gCol, { roughness: 0.85 });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    const c = place.bounds?.getCenter(new THREE.Vector3()) || new THREE.Vector3();
    groundMesh.position.set(c.x, gy, c.z);
    groundMesh.receiveShadow = true;
    groundMesh.userData.noOcclude = true;
    groundMesh.userData.isGround = true;
    place.group.add(groundMesh);
  }
  if (id === 'modern-restaurant-cafe-01ea4c') {
    const ceilGeo = new THREE.BoxGeometry(28, 0.35, 22);
    const ceilMat = mat('#f0ece1', { roughness: 0.9, emissive: '#2d2824', emissiveIntensity: 0.15 });
    const ceil = new THREE.Mesh(ceilGeo, ceilMat);
    ceil.position.set(0, 3.2 + 0.175, -3);
    ceil.userData.noOcclude = true;
    ceil.castShadow = false;
    ceil.receiveShadow = true;
    place.group.add(ceil);
    const floorGeo = new THREE.BoxGeometry(36, 0.25, 26);
    const floorMat = mat('#7a8285', { roughness: 0.9 });
    const floorPad = new THREE.Mesh(floorGeo, floorMat);
    floorPad.position.set(2.5, -0.15, -3);
    floorPad.userData.noOcclude = true;
    floorPad.receiveShadow = true;
    place.group.add(floorPad);
  } else if (place.interior && place.bounds && !place.bounds.isEmpty()) {
    const sz = place.bounds.getSize(new THREE.Vector3());
    const c = place.bounds.getCenter(new THREE.Vector3());
    const ceilGeo = new THREE.BoxGeometry(sz.x + 4, 0.35, sz.z + 4);
    const ceilMat = mat('#f0ece1', { roughness: 0.9, emissive: '#2d2824', emissiveIntensity: 0.15 });
    const ceil = new THREE.Mesh(ceilGeo, ceilMat);
    ceil.position.set(c.x, place.bounds.max.y + 0.175, c.z);
    ceil.userData.noOcclude = true;
    ceil.castShadow = false;
    ceil.receiveShadow = true;
    place.group.add(ceil);
  }
  const inner = new THREE.Group();
  inner.scale.setScalar(KS);
  inner.add(place.group);
  const wrap = new THREE.Group();
  wrap.add(inner);
  wrap.userData.isMap = true;
  return (state.KITS[id] = { wrap, inner, place });
}

export function placeKit(K, s) {
  // setOpts: at [x,z] metres | near: part key (+index, dx, dz metres) ; yaw deg
  const o = s.setOpts || {};
  let [ax, az] = o.at || [0, 0];
  if (o.near) {
    const p = K.place.where(o.near)[o.index || 0];
    if (p) {
      ax = p.x;
      az = p.z;
    }
  }
  ax += o.dx || 0;
  az += o.dz || 0;
  if (o.open !== false && K.place.openSpot) {
    try {
      const q = K.place.openSpot({ near: new THREE.Vector3(ax, 0, az) });
      if (q && Math.hypot(q.x - ax, q.z - az) < 12) {
        ax = q.x;
        az = q.z;
      }
    } catch (e) {}
  }
  const gy = K.place.groundAt(ax, az) || 0;
  K.inner.position.set(-ax * KS, -gy * KS, -az * KS);
  K.wrap.rotation.y = (o.yaw || 0) * D2R;
  K.wrap.updateMatrixWorld(true);
  // stand on the real walkable surface (deck, ramp, floor), not the terrain under it
  mapRay.set(V(0, 10, 0), V(0, -1, 0));
  mapRay.far = 25;
  const h = mapRay.intersectObject(K.wrap, true).find((h) => !h.object.material?.transparent);
  mapRay.far = Infinity;
  if (h) {
    K.inner.position.y -= h.point.y;
    K.wrap.updateMatrixWorld(true);
  }
}

const mapRay = new THREE.Raycaster();
export function placeMap(g, s) {
  // move the map so the scene anchor (Roblox X,Z) sits at the origin, ground at y=0
  const [ax, az] = s.setOpts?.anchor || [0, 0];
  g.position.set(-ax, 0, -az);
  g.rotation.y = 0;
  g.updateMatrixWorld(true);
  mapRay.set(V(0, 2000, 0), V(0, -1, 0));
  const h = mapRay.intersectObject(g, true)[0];
  const gy = h ? -h.point.y : 0;
  const yw = (s.setOpts?.yaw || 0) * D2R;
  const off = V(-ax, gy, -az).applyAxisAngle(V(0, 1, 0), yw);
  g.position.copy(off);
  g.rotation.y = yw;
  g.updateMatrixWorld(true);
}

// exact = made for this head (Roblox hats): keep its size, and let it press hair right down to the scalp. Else (any GLB) it is fitted over head + hair.
export function cover(type, o, space, exact) {
  if (!state.COVERS[type]) {
    const m = coverMap(o, space);
    if (exact) {
      m.fit = 1;
      m.solid = true;
    } else m.fit = fitCover(m);
    state.COVERS[type] = m;
  }
  return state.COVERS[type];
}

export function clouds(seed, night) {
  const g = new THREE.Group();
  let s = seed;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const m = mat(night ? '#3a4470' : '#ffffff', {
    roughness: 1,
    emissive: night ? '#000' : '#ffffff',
    emissiveIntensity: night ? 0 : 0.35,
  });
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Group();
    const a = r() * Math.PI * 2,
      d = 140 + r() * 120;
    c.position.set(Math.cos(a) * d, 45 + r() * 35, Math.sin(a) * d);
    for (let k = 0; k < 4; k++) {
      const sp = new THREE.Mesh(new THREE.SphereGeometry(6 + r() * 5, 10, 8), m);
      sp.position.set((k - 1.5) * 7, r() * 3, r() * 4);
      c.add(sp);
    }
    g.add(c);
  }
  return g;
}

export function prepAssets(s) {
  s._ready = true;
  const setKey = `${s.set}|${s.time}|${s.seed || 7}|${JSON.stringify(s.setOpts || {})}|${JSON.stringify(s.treat || '')}`;
  if (s.set === 'kit') {
    const K = state.KITS[s.setOpts.kit];
    if (!K.wrap.parent) {
      K.wrap.visible = false;
      state.scene.add(K.wrap);
      state.sets['kit|' + s.setOpts.kit] = K.wrap;
    }
    s._set = K.wrap;
    s._interior = !!(K.place?.interior || s.setOpts?.interior);
    s._kit = K;
  } else if (s.set === 'map') {
    const f = s.setOpts?.file || 'brookhaven';
    const k = 'map|' + f;
    if (!state.sets[k]) {
      const g = state.MAPS[f];
      g.visible = false;
      state.scene.add(g);
      state.sets[k] = g;
    }
    s._set = state.sets[k];
    s._interior = false;
  } else if (!state.sets[setKey]) {
    const night = s.time === 'night' || s.time === 'spooky';
    const g = buildSet(s.set, { ...(s.setOpts || {}), night }, s.seed || 7);
    if (s.treat && s.treat !== 'none') applyTreat(g, s.treat);
    if (!INTERIOR.has(s.set) && s.set !== 'studio') {
      const cl = clouds((s.seed || 7) + 3, night);
      g.add(cl);
      g.userData.clouds = cl;
    }
    g.visible = false;
    state.scene.add(g);
    state.sets[setKey] = g;
  }
  if (s.set !== 'map' && s.set !== 'kit') {
    s._set = state.sets[setKey];
    s._interior = INTERIOR.has(s.set);
  }
  envify(s._set);
  // props
  s._props = (s.props || []).map((p) => {
    const rw = p.hand && state.chars[p.hand] && !state.chars[p.hand].creature ? wearInfo(p.type) : null; // Roblox accessory: sits where its attachment says
    if (rw) {
      const ch = state.chars[p.hand],
        o = makeWear(p.type),
        sp = partSpace(ch, rw.part, rw.slot, rw.att);
      o.visible = false;
      sp.add(o);
      envify(o);
      if (rw.part === 'head') cover(p.type, o, sp, true);
      return {
        p,
        o,
        worn: true,
        wearer: ch,
        head: rw.part === 'head',
        fit: 1,
        t0: resolveAt(p.from, s),
        t1: p.until != null ? resolveAt(p.until, s) : 1e9,
      };
    }
    const wearer =
      p.hand && p.wear !== false && wearOf(p.type) && state.chars[p.hand] && !state.chars[p.hand].creature
        ? state.chars[p.hand]
        : null;
    if (wearer) {
      const o = makeWornProp(p.type);
      o.visible = false;
      const hsp = partSpace(wearer, 'head');
      hsp.add(o);
      envify(o);
      const fit = cover(p.type, o, hsp, false).fit;
      o.position.multiplyScalar(fit);
      return {
        p,
        o,
        worn: true,
        wearer,
        head: true,
        fit,
        t0: resolveAt(p.from, s),
        t1: p.until != null ? resolveAt(p.until, s) : 1e9,
      };
    } // hats, helmets, crowns: on the head, not in the hand
    const held = !!p.hand,
      G = held ? GRIP[p.type] || {} : null;
    const o = (isModelProp(p.type) ? makeModelProp : makeProp)(p.type, held ? { ...p, scale: undefined } : p);
    o.visible = false;
    state.scene.add(o);
    envify(o);
    {
      const tr = p.treat ?? (p.type === 'scatter' ? s.treat : null);
      if (tr && tr !== 'none') applyTreat(o, tr);
    }
    const P = { p, o, t0: resolveAt(p.from, s), t1: p.until != null ? resolveAt(p.until, s) : 1e9 };
    if (p.openAt != null) o.userData.openT = resolveAt(p.openAt, s) - P.t0;
    if (p.closeAt != null) o.userData.closeT = resolveAt(p.closeAt, s) - P.t0;
    if (o.userData.portal && p.portal?.set) P.portal = portalFor(p.portal);
    if (held) {
      const b = new THREE.Box3().setFromObject(o);
      P.G = G;
      P.bc = b.getCenter(V());
      P.bh = b.getSize(V()).multiplyScalar(0.5);
      P.s0 = p.scale || G.hs || 1;
    } else {
      if (p.at) o.position.set(p.at[0], p.y || 0, p.at[1]);
      if (p.rot) o.rotation.y = p.rot * D2R;
    }
    return P;
  });
  // fx
  s._fx = (s.fx || []).map((f) => {
    if (typeof f === 'string') f = { type: f };
    const fx = makeFX(f.type, { ...(f.type === 'hearts' && !f.count ? { count: 14 } : {}), ...f });
    fx.obj.visible = false;
    state.scene.add(fx.obj);
    return { f, fx, t0: resolveAt(f.at, s), t1: f.until != null ? resolveAt(f.until, s) : 1e9 };
  });
}
