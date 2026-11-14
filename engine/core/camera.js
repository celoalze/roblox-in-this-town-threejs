// engine/core/camera.js
// Camera shot setups, cuts, positioning, framing, and occlusion avoidance.
// Must not perform frame rendering or mutate actor timelines.

import * as THREE from 'three';
import { state, motionOf } from './state.js';
import { V, D2R, smooth, clamp01, easeOut } from './math.js';
import { resolveAt, actorAt, headPos } from './motion.js';
import { headY } from '../characters/links.js';

// ---- CAMERA ----
export const SHOT = {
  extreme: [4.2, 4.45, 0.1],
  close: [7.4, 4.0, 0.3],
  medium: [11, 3.5, 0.6],
  full: [15, 3.2, 1.5],
  wide: [24, 3, 4],
  establishing: [48, 6, 14],
};
export const DOF = { extreme: 2, close: 1.6, medium: 0.7 }; // background blur per shot (0 = everything sharp); scene camera.dof overrides
export const LENS = { extreme: 34, close: 38, medium: 44, full: 48, wide: 54, establishing: 58 };

// ---- SHOTS: several camera set-ups inside one scene. The scene's own shot/camera is the first (from 0); s.shots = [{at, shot, camera, punch}]
// cut to the next ones at a word / second / percent of the line. Actors, props and fx keep running across the cuts.
export function shotsOf(s) {
  if (!s._shots) {
    const l = [
      { t: 0, shot: s.shot, camera: s.camera || {}, punch: s.punch },
      ...(s.shots || [])
        .map((x) => ({ t: resolveAt(x.at, s), shot: x.shot || s.shot, camera: x.camera || {}, punch: x.punch }))
        .filter((x) => x.t > 0.05 && x.t < s.dur - 0.05),
    ].sort((a, b) => a.t - b.t);
    l.forEach((v, i) => {
      v.i = i;
      v.dur = (l[i + 1]?.t ?? s.dur) - v.t;
      v._yaw = {};
    });
    s._shots = l;
  }
  return s._shots;
}

export function viewOf(s, lt) {
  const l = shotsOf(s);
  let v = l[0];
  for (const x of l) if (x.t <= lt + 1e-6) v = x;
  return v;
}

export function shotTimes() {
  return state.TL.scenes.map((s) => shotsOf(s).map((v) => [+(s.start + v.t).toFixed(3), +v.dur.toFixed(3)]));
}

export function cameraAt(s, lt, v = viewOf(s, lt)) {
  const c = v.camera;
  const shot = SHOT[v.shot || 'medium'] || SHOT.medium;
  const vl = lt - v.t,
    k = clamp01(vl / v.dur);
  let target = c.target || (s._actors[0] && s._actors[0].a.id);
  let look,
    base,
    yawBase = 0;
  const group = target === 'group' || target === 'both';
  if (Array.isArray(target)) look = V(target[0], target[1], target[2]);
  else if (group) {
    const ps = s._actors.map((A) => A._st.pos);
    look = ps.reduce((a, b) => a.add(b.clone()), V()).multiplyScalar(1 / Math.max(1, ps.length));
    look.y = shot[1] * (s._actors[0]?.ch.spec.scale || 1);
    const spread = Math.max(...ps.map((p) => p.distanceTo(look)));
    base = Math.max(shot[0], spread * 2.4 + 6);
  } else {
    const A = s._actors.find((x) => x.a.id === target);
    look = headPos(target, s, lt);
    look.y += (shot[1] - (A ? headY(A.ch) : 4.87)) * (A?.ch.spec.scale || 1) - (A?._st?.p.y || 0) * 0.6;
    /* the shot offset scales with the character: a 0.68 kid is framed at his own head */ if (A) {
      yawBase = v.i
        ? (v._yaw[target] ?? (v._yaw[target] = actorAt(A, v.t, s).yaw))
        : (A._yaw0 ?? (A._yaw0 = A._st.yaw));
    }
    const sc = A ? A.ch.spec.scale || 1 : 1;
  }
  let dist = (base || shot[0]) * (c.zoom || 1) * (s._actors.find((x) => x.a.id === target)?.ch.spec.scale || 1);
  // lens per shot: long for close-ups (flatter face, compressed background), wide for wides. The camera moves back / forward
  // so the subject keeps the size the shot table was tuned for at 50 deg.
  const fov0 =
      c.lens ||
      c.fov ||
      (c.pov
        ? 72
        : state.TL.style?.lens === false || v.shot === 'top' || v.shot === 'ots'
          ? 50
          : LENS[v.shot || 'medium'] || 50),
    lensK = Math.tan(25 * D2R) / Math.tan((fov0 / 2) * D2R);
  if (!c.fov) dist *= lensK;
  let fov = fov0;
  let ang = (c.angle ?? 18) * D2R + (c.absolute ? 0 : yawBase);
  let elev = c.height ?? shot[2];
  if (v.shot === 'top') {
    elev = 30;
    dist = 6;
  }
  if (v.shot === 'low') {
    elev = -2.6;
  }
  if (v.shot === 'high') {
    elev = dist * 0.9;
  }
  const mv = c.move || 'push';
  const e = state.TL.style?.camEase === 'smooth' ? smooth(k) : k + (smooth(k) - k) * 0.35; // mostly linear: the move is already running at the cut and still running at the next one (style.camEase 'smooth' = old start/stop in every scene)
  if (mv === 'push') dist *= 1.18 - 0.3 * e;
  else if (mv === 'pull') dist *= 0.85 + 0.35 * e;
  else if (mv === 'orbit') ang += (c.amount ?? 40) * D2R * (e - 0.5);
  else if (mv === 'pan') look.x += (c.amount ?? 4) * (e - 0.5);
  else if (mv === 'rise') elev += 6 * e;
  else if (mv === 'drift') {
    ang += 0.12 * (e - 0.5);
    dist *= 1.04 - 0.08 * e;
  } else if (mv === 'fly') {
    const f = 1 - easeOut(clamp01(vl / Math.min(v.dur, c.flyTime || 1.4)));
    dist *= 1 + (c.amount ?? 2.6) * f;
    elev += dist * 0.4 * f;
    ang += 0.8 * f;
  } // FPV swoop: starts far, high and to the side, lands on the framing
  else if (mv === 'track') {
    const A = s._actors.find((x) => x.a.id === target);
    if (A) ang = A._st.yaw + Math.PI + (c.angle || 0) * D2R;
    dist *= 1.05 - 0.1 * e;
  } // follows behind whoever it targets, turning with them
  if (c.crash) dist *= 1 + 1.7 * c.crash * (1 - easeOut(clamp01(vl / 0.3))); // crash zoom into the shot
  if (c.punch !== false && v.punch) {
    const pk = clamp01(vl / 0.18);
    dist *= 1 + 0.35 * (1 - smooth(pk));
  }
  let pos;
  if (v.shot === 'ots' && c.over) {
    const A = headPos(c.over, s, lt),
      B = headPos(target, s, lt);
    const d = B.clone().sub(A).setY(0).normalize();
    const right = V(d.z, 0, -d.x);
    pos = A.clone()
      .add(d.multiplyScalar(-4))
      .add(right.multiplyScalar(1.7))
      .add(V(0, 0.5, 0));
    look = B.clone().add(V(0, -0.2, 0));
  } else if (c.pov) {
    // through someone's eyes: at their face, looking at the target (or straight ahead, `tilt` deg down for hands / a held prop)
    const A = s._actors.find((x) => x.a.id === c.pov),
      yw = A ? A._st.yaw : 0,
      f = V(Math.sin(yw), 0, Math.cos(yw));
    pos = headPos(c.pov, s, lt).add(f.clone().multiplyScalar(0.75));
    if (target === c.pov || !target)
      look = pos
        .clone()
        .add(f.multiplyScalar(10))
        .add(V(0, -Math.tan((c.tilt || 0) * D2R) * 10, 0));
  } else if (c.path) {
    const cv =
      c._cv ||
      (c._cv = new THREE.CatmullRomCurve3(
        c.path.map((p) => V(p[0], p[1], p[2])),
        false,
        'centripetal',
      ));
    pos = cv.getPoint(c.ease === 'linear' ? k : smooth(k));
    if (c.lookPath) {
      const lc = c._lc || (c._lc = new THREE.CatmullRomCurve3(c.lookPath.map((p) => V(p[0], p[1], p[2]))));
      look = lc.getPoint(smooth(k));
    }
  } else {
    pos = V(look.x + Math.sin(ang) * dist, look.y + elev, look.z + Math.cos(ang) * dist);
    if (blockedByActor(pos, look, target, s)) {
      const off = ang - yawBase;
      const sg = Math.sign(off) || 1;
      for (const o of [-off, sg * 1, -sg * 1, sg * 1.35, -sg * 1.35, sg * 1.7, -sg * 1.7]) {
        const a2 = yawBase + o;
        const p2 = V(look.x + Math.sin(a2) * dist, look.y + elev, look.z + Math.cos(a2) * dist);
        if (!blockedByActor(p2, look, target, s)) {
          pos = p2;
          break;
        }
      }
    }
    if (c.occlude !== false) {
      const clear = (p) => {
        const d = p.clone().sub(look);
        const L = d.length();
        occRay(s);
        ray.set(look, d.normalize());
        ray.far = L;
        const h = ray.intersectObjects(state.occluders.get(s._set), false).find((h) => h.distance > 1.2);
        return !h || h.distance > L * 0.85;
      };
      if (!clear(pos) && (s.set === 'kit' || s.set === 'map')) {
        const base = ang;
        for (const o of [0.5, -0.5, 1, -1, 1.5, -1.5, 2.2, -2.2, 3.14]) {
          const a2 = base + o;
          const p2 = V(look.x + Math.sin(a2) * dist, look.y + elev, look.z + Math.cos(a2) * dist);
          if (clear(p2)) {
            pos = p2;
            break;
          }
        }
      }
      pos = unoccluded(pos, look, s);
    }
    state.camInfo = { target, want: dist, got: pos.distanceTo(look) };
    // a wall pushed the camera in: open the lens so the framing stays what the shot asked for (up to a point)
    if (!c.fov && state.camInfo.got < dist * 0.98)
      fov = Math.min(
        Math.max(64, fov0),
        (2 * Math.atan((Math.tan((fov0 / 2) * D2R) * dist) / state.camInfo.got)) / D2R,
      );
    state.camInfo.fit = ((state.camInfo.got / dist) * Math.tan((fov / 2) * D2R)) / Math.tan((fov0 / 2) * D2R);
  }
  if (v.shot === 'top') pos = V(look.x + 0.01, look.y + 26, look.z + 4);
  const sh = (c.shake || 0) + (s._shakeT != null && lt - s._shakeT < 0.4 ? (1 - (lt - s._shakeT) / 0.4) * 0.8 : 0);
  const nz = (x, k) =>
    Math.sin(x * 1.0 + k) * 0.5 + Math.sin(x * 2.37 + k * 1.7) * 0.3 + Math.sin(x * 5.13 + k * 2.9) * 0.2; // smooth pseudo-noise, -1..1
  if (sh) {
    const t = lt * 34;
    pos.x += nz(t, 0) * 0.16 * sh;
    pos.y += nz(t, 4) * 0.13 * sh;
    look.x += nz(t, 9) * 0.1 * sh;
    look.y += nz(t, 13) * 0.06 * sh;
  } // irregular, not a sine wobble
  if (mv !== 'static' && state.TL.style?.handheld !== false) {
    const d = pos.distanceTo(look) * 0.0035 * (state.TL.style?.handheld ?? 1),
      t = lt * 0.9 + s.start;
    look.x += nz(t, 1) * d;
    look.y += nz(t * 1.2, 6) * d * 0.7;
    pos.y += nz(t * 0.8, 11) * d * 0.5;
  } // operator breathing: the frame is never perfectly still
  {
    const wi =
      (c.whip || 0) * 1.45 * (1 - easeOut(clamp01(vl / 0.24))) -
      (c.whipOut || 0) * 1.45 * clamp01((vl - v.dur + 0.16) / 0.16) ** 2; // whip pan in / out of the shot: the motion blur does the rest
    if (wi)
      look = pos.clone().add(
        look
          .clone()
          .sub(pos)
          .applyAxisAngle(V(0, 1, 0), wi),
      );
  }
  const m = motionOf(s);
  if (m.drift && (!c.move || c.move === 'static')) {
    const driftT = lt * 0.45 + (s.start || 0);
    const dAmp = dist * 0.012 * m.intensity; // < 1.5% amplitude
    pos.x += nz(driftT * 0.8, 31) * dAmp;
    pos.y += nz(driftT * 0.7, 47) * dAmp * 0.6;
    pos.z += nz(driftT * 0.9, 59) * dAmp;
    look.x += nz(driftT * 0.6, 71) * 0.03 * m.intensity;
    look.y += nz(driftT * 0.5, 83) * 0.02 * m.intensity;
    fov *= 1 + nz(driftT * 0.5, 97) * 0.012 * m.intensity; // < 1.5% amplitude
  }
  state.camera.position.copy(pos);
  state.camera.fov = fov;
  state.camera.updateProjectionMatrix();
  state.camera.lookAt(look);
  state.camLook = look;
  if (c.roll) state.camera.rotateZ(c.roll * D2R);
}

export function blockedByActor(pos, look, target, s) {
  const dir = look.clone().sub(pos);
  const L = dir.length();
  dir.normalize();
  return s._actors.some((A) => {
    if (A.a.id === target || !A._st) return false;
    const c = A._st.pos.clone().add(V(0, 3, 0));
    const k = c.clone().sub(pos).dot(dir);
    if (k < 0.5 || k > L - 0.8) return false;
    const closest = pos.clone().add(dir.clone().multiplyScalar(k));
    return Math.hypot(closest.x - c.x, closest.z - c.z) < 1.4 && Math.abs(closest.y - c.y) < 2.8;
  });
}

const ray = new THREE.Raycaster();

// A kit / map is a whole town merged into a few huge meshes, and every camera ray used to walk all of its triangles (the
// render's real cost: ~50 ms a frame). The action stays near the origin, so keep one world-space copy of just the triangles
// within R of it, per placement, and cast against that. Front-facing and double-sided sources stay separate (same hits as before).
export function nearProxy(list, key, R = 85) {
  if (state.proxyCache.has(key)) return state.proxyCache.get(key);
  const out = [[], []],
    a = V(),
    b = V(),
    c = V(),
    m = new THREE.Matrix4();
  for (const o of list) {
    const pa = o.geometry.attributes.position,
      ix = o.geometry.index;
    if (!pa) continue;
    const arr = out[[].concat(o.material)[0]?.side === THREE.FrontSide ? 0 : 1],
      cnt = ix ? ix.count : pa.count;
    for (let k = 0, n = o.isInstancedMesh ? o.count : 1; k < n; k++) {
      if (o.isInstancedMesh) {
        o.getMatrixAt(k, m);
        m.premultiply(o.matrixWorld);
      } else m.copy(o.matrixWorld);
      for (let i = 0; i + 2 < cnt; i += 3) {
        a.fromBufferAttribute(pa, ix ? ix.getX(i) : i).applyMatrix4(m);
        b.fromBufferAttribute(pa, ix ? ix.getX(i + 1) : i + 1).applyMatrix4(m);
        c.fromBufferAttribute(pa, ix ? ix.getX(i + 2) : i + 2).applyMatrix4(m);
        if (
          Math.min(a.x, b.x, c.x) > R ||
          Math.max(a.x, b.x, c.x) < -R ||
          Math.min(a.z, b.z, c.z) > R ||
          Math.max(a.z, b.z, c.z) < -R ||
          Math.min(a.y, b.y, c.y) > R
        )
          continue;
        arr.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      }
    }
  }
  const res = out
    .map((arr, k) => {
      if (!arr.length) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      g.computeBoundingSphere();
      return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: k ? THREE.DoubleSide : THREE.FrontSide }));
    })
    .filter(Boolean);
  state.proxyCache.set(key, res);
  return res;
}

export function occRay(s) {
  if (!state.occluders.has(s._set)) unoccluded(V(0, 0, 1), V(), s);
}

export function unoccluded(pos, look, s) {
  if (!state.occluders.has(s._set)) {
    const list = [];
    s._set.traverse((o) => {
      let q = o,
        skip = false;
      while (q) {
        if (q.userData.noOcclude) skip = true;
        q = q.parent;
      }
      if (o.isMesh && !skip && o.geometry.type !== 'SphereGeometry' && !(o.material && o.material.transparent))
        list.push(o);
    });
    state.occluders.set(
      s._set,
      s.set === 'kit' || s.set === 'map' ? nearProxy(list, s.set + JSON.stringify(s.setOpts || {})) : list,
    );
  }
  const dir = pos.clone().sub(look);
  const L = dir.length();
  dir.normalize();
  ray.set(look, dir);
  ray.far = L;
  const hit = ray.intersectObjects(state.occluders.get(s._set), false).find((h) => h.distance > 1.2);
  if (hit && hit.distance < 4 && !s._interior) return pos; // small occluder right next to the subject: keep the shot
  return hit ? look.clone().add(dir.multiplyScalar(Math.max(1.5, hit.distance - 0.6))) : pos;
}
