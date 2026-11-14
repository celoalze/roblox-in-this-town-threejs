// engine/core/living.js
// Held props, background NPC extras, crowd behaviors, and ambient motes.
// Must not mutate core camera or scene configuration directly.

import * as THREE from 'three';
import { state } from './state.js';
import { V, D2R, smooth, clamp01 } from './math.js';
import { resolveAt, facingTo } from './motion.js';
import { carryHands15 } from '../characters/r15_attach.js';
import { buildCharacter, setFace, pose, blendPose, applyPose, hairStyles } from '../characters/character.js';
import { planCrowd, crowdAt } from '../characters/crowd.js';
import { weatherOf } from '../environments/weather.js';

// ---- HELD PROPS ----
// A held prop never inherits the arm's rotation (that flipped trophies upside down when the arm was raised) and never
// starts at the hand pivot (that buried it in the forearm). Instead: the prop stays world-upright, turned with the actor,
// and its bounding box is pushed fully past the plane at the tip of the arm, so it cannot intersect the arm that holds it.
// An arm that hangs or swings is blended to a carry pose (forearm forward); raised/pointing arms keep their animation.
const _e = new THREE.Euler(),
  _q = new THREE.Quaternion(),
  _qi = new THREE.Quaternion(),
  UP = V(0, 1, 0);

export function holdProp(P, A, lt, pop) {
  const G = P.G,
    ch = A.ch,
    sc = ch.spec.scale || 1,
    two = !!G.two,
    left = !!P.p.left;
  let tip, dir;
  ({ tip, dir } = carryHands15(ch, two, left, G.inward)); // real elbows / grip attachments (engine/characters/r15_attach.js)
  const k = P.s0 * sc * pop;
  P.o.scale.setScalar(k);
  _e.set(G.tilt || 0, A._st.yaw + ((G.yaw || 0) + (P.p.rot || 0)) * D2R + (P.p.spin ? lt * P.p.spin : 0), 0, 'YXZ');
  _q.setFromEuler(_e);
  _qi.copy(_q).invert();
  const h = P.bh.clone().multiplyScalar(k),
    dl = dir.clone().applyQuaternion(_qi);
  const reach = Math.abs(dl.x) * h.x + Math.abs(dl.y) * h.y + Math.abs(dl.z) * h.z; // box support distance along the arm
  const c = tip.clone().addScaledVector(dir, reach - Math.min(0.1 * sc, reach * 0.3));
  // grip height: slide the prop up so the hand closes on its handle/lower part (only sideways to the arm: still clear of it)
  const lift = UP.clone().addScaledVector(dir, -dir.y);
  c.addScaledVector(lift, (1 - 2 * (G.grip ?? 0.5)) * h.y);
  P.o.quaternion.copy(_q);
  P.o.position.copy(c).sub(P.bc.clone().multiplyScalar(k).applyQuaternion(_q));
}

// ---- LIVING SET ---- (all closed-form in t, like the rest: no per-frame state)
// Clouds drift, trees rock, pollen / fireflies float near the camera, and optional background walkers ("extras") stroll
// around kit locations. Extras: style.extras = N (or scene.extras), outdoor kit scenes only, always behind the action.

export function shareMats(ch) {
  for (const [n, m] of Object.entries(ch.parts)) {
    const mm = m.material;
    if (!mm || mm.map || Array.isArray(mm)) continue;
    const key = [mm.type, mm.color.getHexString(), mm.roughness, mm.clearcoat].join('|');
    const o = state.NPCM.get(key);
    if (o) {
      m.material = o;
      mm.dispose();
      if (ch.mats[n]) ch.mats[n] = o;
    } else state.NPCM.set(key, mm);
  }
}

export const NPC_SKIP = new Set(['colorbraids', 'updo']); // too distinctive for background people

export function buildExtras(n) {
  let sd = 4242;
  const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647,
    pick = (a) => a[Math.floor(r() * a.length)];
  for (let i = 0; i < n; i++) {
    const ch = buildCharacter({
      skin: pick(['#f5c79a', '#eab892', '#c98d5e', '#8d5a3b', '#ffd9b3']),
      shirt: pick(['#e85d5d', '#4f8fe8', '#3ecf8e', '#f2b134', '#9b6bdf', '#f28cb1', '#f4f4f4', '#3b4a6b']),
      pants: pick(['#22304f', '#3a3a44', '#5b4636', '#2f5d8a', '#6b7280']),
      hair: (() => {
        const st = hairStyles().filter((n) => !NPC_SKIP.has(n));
        return st.length
          ? 'rbx:' + pick(st)
          : pick(['short', 'messy', 'swept', 'long', 'bob', 'ponytail', 'bun', 'spiky']);
      })(),
      hairColor: pick(['#3b2416', '#1a1a1a', '#7a4a21', '#d9b36b', '#a8432a', '#5a3a22', '#c98a4b', '#2b1d14']),
      sleeves: pick(['long', 'short']),
      details: pick([['crewneck'], ['hood', 'kangaroo'], ['collar', 'buttons'], ['stripes']]),
      scale: 0.9 + r() * 0.14,
    });
    shareMats(ch);
    ch.root.visible = false;
    state.scene.add(ch.root);
    state.extras.push(ch);
  }
}

export const CROWD_MAX = 24,
  crowdN = (s) => Math.min(CROWD_MAX, s.crowd?.n || 0);
export const extrasWanted = (s) =>
  s.set === 'kit' && !s._interior ? Math.max(0, Math.min(8, s.extras ?? state.TL.style?.extras ?? 0)) : 0;

export function planExtras(s) {
  // clear standing spots (and, where there is room, a straight clear stretch to walk) from the kit's own collision data
  const n = extrasWanted(s),
    key = s.setOpts.kit + JSON.stringify(s.setOpts) + n;
  if (state.extraPlans.has(key)) return state.extraPlans.get(key);
  const out = [],
    K = s._kit,
    P = K.place;
  let sd = 99;
  const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  try {
    const free = (x, z) =>
      x > P.bounds.min.x + 1 &&
      x < P.bounds.max.x - 1 &&
      z > P.bounds.min.z + 1 &&
      z < P.bounds.max.z - 1 &&
      !P.blocked(x, z, 0.6);
    for (let i = 0; i < n; i++)
      for (let k = 0; k < 60; k++) {
        const a = r() * 6.283,
          d = 16 + r() * 30,
          w = V(Math.sin(a) * d, 0, Math.cos(a) * d);
        if (w.z > 2) continue; // never between the camera side and the actors
        const p = K.inner.worldToLocal(w.clone());
        if (!free(p.x, p.z) || out.some((e) => Math.hypot(e.p.x - p.x, e.p.z - p.z) < 2)) continue;
        let q = null;
        for (let j = 0; j < 10 && !q; j++) {
          const b = r() * 6.283,
            L = 3 + r() * 6,
            c = V(p.x + Math.sin(b) * L, 0, p.z + Math.cos(b) * L),
            cw = K.inner.localToWorld(c.clone());
          let ok = cw.z < 1 && Math.hypot(cw.x, cw.z) > 14;
          for (let m = 0; ok && m <= 12; m++) ok = free(p.x + ((c.x - p.x) * m) / 12, p.z + ((c.z - p.z) * m) / 12);
          if (ok) q = c;
        }
        const at = (v) => K.inner.localToWorld(V(v.x, P.groundAt(v.x, v.z) || 0, v.z));
        out.push({ p, q, wp: at(p), wq: q && at(q), off: r() * 20, yaw: r() * 6.283 });
        break;
      }
  } catch (e) {
    console.warn('extras', e.message);
  }
  state.extraPlans.set(key, out);
  return out;
}

const local2 = (K, w) => K.inner.worldToLocal(w.clone());

export function updateExtras(s, t) {
  const plan = extrasWanted(s) ? planExtras(s) : [];
  state.extras.forEach((ch, i) => {
    const e = plan[i];
    ch.root.visible = !!e;
    if (!e) return;
    let pos,
      yaw = e.yaw,
      p = pose('idle', t + e.off, i);
    if (e.q) {
      const L = Math.hypot(e.q.x - e.p.x, e.q.z - e.p.z),
        T1 = L / 1.7,
        pause = 1.6,
        u = (t + e.off) % (2 * (T1 + pause)),
        back = u >= T1 + pause,
        v = back ? u - T1 - pause : u;
      const k = clamp01(v / T1),
        wa = back ? e.wq : e.wp,
        wb = back ? e.wp : e.wq,
        dir = facingTo(wa, wb);
      pos = wa.clone().lerp(wb, k);
      if (k < 1) {
        yaw = dir;
        p = blendPose(p, pose('walk', (k * wa.distanceTo(wb)) / 7, i), smooth(clamp01(Math.min(v, T1 - v) / 0.3)));
      } else yaw = dir + Math.PI * smooth(clamp01((v - T1 - 0.5) / 0.6));
    } // stands a moment, then turns round
    else pos = e.wp;
    ch.root.position.copy(pos);
    ch.root.rotation.y = yaw;
    applyPose(ch, p);
    setFace(ch, 'happy', 0, (t + i * 0.53) % 3.7 < 0.12);
  });
  // crowd: the scene's `crowd` behaviour, on the pool members the ambient walkers left free
  const c = s.crowd,
    n = crowdN(s);
  if (!n) return;
  const K = s.set === 'kit' ? s._kit : null,
    P = K?.place;
  const on = typeof c.on === 'string' ? s._actors.find((x) => x.a.id === c.on) : null,
    cen = (live) =>
      Array.isArray(c.on)
        ? V(c.on[0], 0, c.on[1])
        : on
          ? (live ? on._st.pos : on.acts[0].p0).clone().setY(0)
          : s._actors.length
            ? s._actors
                .reduce((a, A) => a.add(A.acts[0].p0), V())
                .multiplyScalar(1 / s._actors.length)
                .setY(0)
            : V();
  if (!s._crowd) {
    let h = 7;
    for (const ch of s.set + JSON.stringify(s.setOpts || {}) + (c.seed || ''))
      h = (h * 31 + ch.charCodeAt(0)) % 2147483000;
    const local = (x, z) => K.inner.worldToLocal(V(x, 0, z)),
      free = P
        ? (x, z) => {
            try {
              const q = local(x, z);
              return !P.blocked(q.x, q.z, 0.6);
            } catch (e) {
              return true;
            }
          }
        : (x, z) => !s._actors.some((A) => Math.hypot(A.acts[0].p0.x - x, A.acts[0].p0.z - z) < 2.2);
    s._crowd = planCrowd({ ...c, n }, cen(false), h, free);
    s._crowdT = c.at != null ? resolveAt(c.at, s) : 0;
  }
  const lt = t - s.start,
    C = cen(true);
  s._crowd.forEach((e, j) => {
    const ch = state.extras[plan.length + j];
    if (!ch) return;
    const st = crowdAt(e, c, C, lt, t, s._crowdT);
    ch.root.visible = !st.gone;
    if (st.gone) return;
    if (P) {
      try {
        const q = local2(K, st.pos);
        st.pos.y = K.inner.localToWorld(V(q.x, P.groundAt(q.x, q.z) || 0, q.z)).y;
      } catch (e) {}
    }
    ch.root.position.copy(st.pos);
    ch.root.rotation.y = st.yaw;
    applyPose(ch, st.p);
    setFace(ch, st.expr, 0, (t + j * 0.41 + e.off) % 3.3 < 0.11);
  });
}

export function updateLiving(s, t, focus) {
  const cl = s._set.userData.clouds;
  if (cl) cl.rotation.y = t * 0.006;
  if (!state.swayOf.has(s._set)) {
    const l = [];
    if (s.set !== 'kit' && s.set !== 'map')
      s._set.traverse((o) => {
        if (o.userData.sway) l.push(o);
      });
    state.swayOf.set(s._set, l);
  }
  const wind = /windy|storm|blizzard|sandstorm/.test(s.weather || '') ? 4 : 1;
  for (const o of state.swayOf.get(s._set)) {
    const ph = o.userData.sway;
    o.rotation.z = Math.sin(t * 1.3 + ph) * 0.016 * wind;
    o.rotation.x = Math.sin(t * 0.9 + ph * 1.7) * 0.011 * wind;
  }
  const dark = s.time === 'night' || s.time === 'spooky',
    on = state.TL.style?.motes !== false && !s._wxInt && !weatherOf(s);
  if (!state.motes) {
    const n = 70,
      cv = document.createElement('canvas');
    cv.width = cv.height = 32;
    const g = cv.getContext('2d'),
      q = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    q.addColorStop(0, '#fff');
    q.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = q;
    g.fillRect(0, 0, 32, 32);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    let sd = 77;
    const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    state.motes = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: new THREE.CanvasTexture(cv),
        size: 0.28,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    );
    state.motes.frustumCulled = false;
    state.motes.userData.R = Array.from({ length: n }, () => [r(), r(), r(), r()]);
    state.scene.add(state.motes);
  }
  state.motes.visible = on;
  if (!on) return;
  const m = state.motes.material;
  m.color.set(dark ? '#eaff8a' : '#ffffff');
  m.opacity = dark ? 0.9 : 0.4;
  m.size = dark ? 0.34 : 0.26;
  m.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
  const pa = state.motes.geometry.attributes.position,
    W0 = 44,
    wrap = (v, c) => ((((v - c) % W0) + W0) % W0) - W0 / 2 + c; // world-anchored field that tiles around the camera focus
  state.motes.userData.R.forEach(([a, b, c, d], i) =>
    pa.setXYZ(
      i,
      wrap(a * W0 + t * (0.5 + d * 0.5) + Math.sin(t * 0.7 + i) * 0.6, focus.x),
      1 + ((((b * 13 + t * 0.12 * (d - 0.3) + Math.sin(t * 0.5 + i * 2) * 0.5) % 13) + 13) % 13),
      wrap(c * W0 + Math.sin(t * 0.4 + i * 1.7) * 0.8, focus.z),
    ),
  );
  pa.needsUpdate = true;
}
