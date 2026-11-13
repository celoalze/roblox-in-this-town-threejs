// Head layers, Roblox style: head (0) < hair (1) < worn accessory (2). An outer layer never has an inner one poking through it.
// How: every worn accessory gets a COVER MAP = for each direction from the head centre, how far its inner surface is (nothing
// there = not covered). Hair vertices that reach past that surface are pulled in to sit just under it, exactly like a hat
// pressing hair down; hair in directions the accessory does not cover (below the rim, through a visor, around a headband)
// is left alone. No cutting, no per-item tuning: any hair works with any accessory, a headphone band only dents the hair
// under the band, a full helm hides everything but what hangs out below it.
import * as THREE from 'three';
import { HEAD_R, HEAD_H } from './headgear.js';

const W = 144, H = 72, GAP = .035; // direction grid (2.5 deg cells), clearance under the accessory
const bin = (x, y, z, r) => { const u = (Math.atan2(x, z) / (2 * Math.PI) + .5) * W, v = Math.acos(Math.max(-1, Math.min(1, y / r))) / Math.PI * H; return [Math.min(W - 1, Math.max(0, u | 0)), Math.min(H - 1, Math.max(0, v | 0))]; };
const up = (o, root) => { const m = new THREE.Matrix4(); for (let q = o; q && q !== root; q = q.parent) { q.updateMatrix(); m.premultiply(q.matrix); } return m; }; // o-local -> root-local

// obj: the worn object, a child (at any depth) of `space`, the head-centre group. Returns Float32Array(W*H) of radii (Infinity = open).
export function coverMap(obj, space) {
  const map = new Float32Array(W * H).fill(Infinity), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3();
  obj.traverse(o => { if (!o.isMesh || o.userData.noCover) return; const M = up(o, space), g = o.geometry, pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      a.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(M); b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(M); c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(M);
      const cell = Math.max(.02, Math.min(a.length(), b.length(), c.length()) * (Math.PI / H)), k = Math.min(40, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / cell * 1.5) + 1); // enough samples to leave no empty cell inside the triangle
      for (let s = 0; s <= k; s++) for (let t = 0; t <= k - s; t++) { const u = s / k, v = t / k; p.set(a.x + (b.x - a.x) * u + (c.x - a.x) * v, a.y + (b.y - a.y) * u + (c.y - a.y) * v, a.z + (b.z - a.z) * u + (c.z - a.z) * v);
        const r = p.length(); if (r < 1e-4) continue; const [x, y] = bin(p.x, p.y, p.z, r), j = y * W + x; if (r < map[j]) map[j] = r; } } });
  // thin parts (chin straps, inner harness, wires) are not a layer: they would press the hair into the head and leave it bald
  // where nothing really covers it. Morphological opening: keep only what is at least ~10 deg wide in every direction.
  const R = 2, near = (m, x, y, all) => { for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; const f = m[yy * W + (x + dx + W) % W]; if (all ? !f : f) return !all; } return all; };
  const solid = new Uint8Array(W * H), core = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) solid[i] = map[i] < Infinity ? 1 : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) core[y * W + x] = near(solid, x, y, true) ? 1 : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (solid[y * W + x] && !near(core, x, y, false)) map[y * W + x] = Infinity;
  return map;
}
export const mergeCovers = (maps) => { const m = new Float32Array(W * H).fill(Infinity); for (const q of maps) for (let i = 0; i < m.length; i++) if (q[i] < m[i]) m[i] = q[i]; m.solid = maps.some(q => q.solid); return m; };
const scalpAt = (x, y, z, r) => Math.min(HEAD_R / Math.max(Math.hypot(x, z) / r, 1e-3), HEAD_H / 2 / Math.max(Math.abs(y) / r, 1e-3)); // head surface in a direction
// The outer layer makes room for the inner ones (what Roblox layered clothing does): a SHELL (helmet, hood, cap) is scaled up
// until its inside clears the head plus a thin layer of hair everywhere. A hat with a solid base (wizard hat, top hat) just
// sits on the head: `solid`, hair under its base is hidden instead. Returns the scale to apply about the head centre.
export function fitCover(map) {
  let n = 0, inside = 0, f = 1; const CLEAR = .07, need = [];
  for (let y = 0; y < H / 2; y++) for (let x = 0; x < W; x++) { const c = map[y * W + x]; if (c === Infinity) continue; const th = (y + .5) / H * Math.PI, ph = ((x + .5) / W - .5) * 2 * Math.PI, s = scalpAt(Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph), 1);
    n++; if (c < s - .02) inside++; need.push((s + CLEAR) / c); }
  map.solid = n > 0 && inside / n > .45; if (map.solid || !n) return 1; need.sort((a, b) => a - b); f = Math.min(1.25, Math.max(1, need[Math.floor(need.length * .88)]));
  // ^ most of the shell clears the head; inner pads / harness (the few tightest cells) do not drive the size
  if (f > 1.001) for (let i = 0; i < map.length; i++) map[i] *= f; return f;
}

// Put a character's hair under `cover` (null = free hair again). `key` names the cover (accessory types worn), so each
// (hair mesh, cover) pair is deformed once and then just swapped in: timed hats (`+crown@word`) cost nothing per frame.
export function layerHair(ch, key, cover) {
  if (ch._cover === key) return; ch._cover = key; const space = ch.fitSpace || ch.headSpace;
  for (const root of ch.hair || []) root.traverse(o => { if (!o.isMesh) return; const U = o.userData; U.g0 = U.g0 || o.geometry; if (!cover) { o.geometry = U.g0; return; }
    U.gc = U.gc || {}; if (!U.gc[key]) { const M = up(o, space), I = M.clone().invert(), g = U.g0.clone(), pos = g.attributes.position, p = new THREE.Vector3(); let moved = 0;
      for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i).applyMatrix4(M); const r = p.length(); if (r < 1e-4) continue; const [x, y] = bin(p.x, p.y, p.z, r);
        let lim = Infinity; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; const q = cover[yy * W + (x + dx + W) % W]; if (q < lim) lim = q; } // a little past the rim too: no fringe of hair right at the edge
        if (lim === Infinity) continue; const scalp = scalpAt(p.x, p.y, p.z, r);
        const to = cover.solid ? Math.max(.05, lim - GAP) : Math.max(lim - GAP, scalp + .02); // pressed flat, never INTO the head: under a tight band or harness the hair stays as a thin layer on the scalp instead of vanishing
        if (r > to) { p.multiplyScalar(to / r).applyMatrix4(I); pos.setXYZ(i, p.x, p.y, p.z); moved++; } }
      if (moved) { pos.needsUpdate = true; g.computeVertexNormals(); U.gc[key] = g; } else { g.dispose(); U.gc[key] = U.g0; } }
    o.geometry = U.gc[key]; });
}
