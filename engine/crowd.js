// Crowds: one scene key (`"crowd": "flee 12 from:rex @roars"`) stages N background people with a shared behaviour.
// Closed-form in time like everything else. plan() = where each agent stands / walks (seeded: the same crowd keeps its
// places across the cuts of a location); at() = position, facing, pose and expression of agent i at scene time lt.
import * as THREE from 'three';
import { pose, blendPose } from './character.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), clamp01 = (k) => Math.max(0, Math.min(1, k)), smooth = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };
const face = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
// behaviours that move people; any other word is an anim everyone plays on the spot, facing the centre (cheer, dance, laugh, clap, bow...)
export const BEHAVIOURS = ['watch', 'walk', 'flee', 'panic', 'gather', 'queue'];
const EXPR = { watch: 'curious', walk: 'content', flee: 'scared', panic: 'panic', gather: 'curious', queue: 'bored', cheer: 'laugh', dance: 'grin', laugh: 'laugh', clap: 'happy', cry: 'cry', scared: 'scared', shocked: 'shocked', angry: 'angry', bow: 'content' };
const REACT = { flee: 'shocked', panic: 'shocked' }; // what the crowd shows in the instant before it starts moving

export function planCrowd(c, centre, seed, free) {
  let sd = 1 + (seed % 2147483646); const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647); const out = [];
  for (let i = 0; i < c.n; i++) {
    const e = { off: r() * 20, k: r(), ph: r() * 6.283, v: .85 + r() * .3 };
    if (c.do === 'walk') { e.dir = i % 2 ? 1 : -1; e.z = centre.z - 4.5 - (i % 4) * 2.6 - r() * 1.2; e.x0 = r() * 48; e.speed = 3.4 + r() * 2; }
    else if (c.do === 'queue') { e.spot = V(centre.x - 2.6 - i * 2.3, 0, centre.z + (r() - .5) * .5); e.yaw = Math.PI / 2; }
    else { // a loose arc behind the centre (the camera side, +z, stays open); a blocked spot (wall, furniture) moves outwards
      let spot = null; for (let tr = 0; tr < 14 && !spot; tr++) { const a = Math.PI * (.62 + .76 * ((i * .618 + tr * .37) % 1)), R = 5.5 + (i % 3) * 2.5 + r() * 1.4 + tr * 1.2, p = V(centre.x + Math.sin(a) * R, 0, centre.z + Math.cos(a) * R); if ((!free || free(p.x, p.z)) && !out.some(o => o.spot && o.spot.distanceTo(p) < 1.9)) spot = p; }
      if (!spot) continue; e.spot = spot; const away = spot.clone().sub(centre).setY(0).normalize();
      if (c.do === 'flee') e.goal = spot.clone().addScaledVector(away, 60);
      if (c.do === 'panic') { const a = r() * 6.283; e.goal = spot.clone().add(V(Math.sin(a) * 50, 0, -Math.abs(Math.cos(a)) * 50 - 8)); }
      if (c.do === 'gather') { e.from = spot.clone().addScaledVector(away, 26 + r() * 10); }
    }
    out.push(e);
  }
  return out;
}

// -> { pos, yaw, p (pose), expr } for agent e. c = crowd spec, centre = live position of what they react to, t0 = when the behaviour starts.
export function crowdAt(e, c, centre, lt, t, t0) {
  const tt = t + e.off, live = lt - t0 - e.k * .35; // everyone reacts a beat apart
  if (c.do === 'walk') { const W = 48, x = ((e.x0 + e.dir * e.speed * t) % W + W) % W - W / 2 + centre.x; return { pos: V(x, 0, e.z), yaw: e.dir > 0 ? Math.PI / 2 : -Math.PI / 2, p: pose('walk', e.speed * t / 7 + e.ph, e.ph), expr: c.expr || EXPR.walk }; }
  if (c.do === 'gather') { const D = e.from.distanceTo(e.spot), T = D / (6 * e.v), k = clamp01((lt + e.k * .6) / T), d = smooth(k) * D, pos = e.from.clone().lerp(e.spot, smooth(k)); const yaw = face(pos, centre);
    return { pos, yaw, p: k < 1 ? blendPose(pose('idle', tt, e.ph), pose('walk', d / 7, e.ph), smooth(Math.min(k, 1 - k) * 8)) : pose('idle', tt, e.ph), expr: c.expr || EXPR.gather }; }
  if (e.goal) { // flee / panic: stand watching, flinch, then run
    if (live <= 0) return { pos: e.spot.clone(), yaw: face(e.spot, centre), p: pose('idle', tt, e.ph), expr: 'curious' };
    const R = .32; if (live < R) return { pos: e.spot.clone(), yaw: face(e.spot, centre), p: blendPose(pose('idle', tt, e.ph), pose('shocked', live, e.ph), smooth(live / .1)), expr: REACT[c.do] };
    const tr = live - R, sp = 14 * e.v, d = sp * (tr - .18 * (1 - Math.exp(-tr / .18))), D = e.spot.distanceTo(e.goal), pos = e.spot.clone().lerp(e.goal, Math.min(1, d / D)); // accelerates into the run
    const y0 = face(e.spot, centre), y1 = face(e.spot, e.goal), dy = Math.atan2(Math.sin(y1 - y0), Math.cos(y1 - y0)), p = pose(c.do === 'panic' ? 'run+scared' : 'run', d / 15 + e.ph, e.ph); p.lean += .1;
    return { pos, yaw: y0 + dy * smooth(tr / .28), p, expr: c.expr || EXPR[c.do], gone: d >= D }; }
  // on the spot: watch, queue, or any anim (from t0; before it they just stand and watch)
  const an = c.do === 'watch' || c.do === 'queue' ? 'idle' : c.do; let p = pose('idle', tt, e.ph), on = an !== 'idle' && live > 0;
  if (on) p = blendPose(p, pose(an, live + e.ph * .2, e.ph), smooth(live / .25));
  const yaw = e.yaw ?? face(e.spot, centre); if (!on) p.hd[1] += Math.sin(tt * .5) * .12;
  return { pos: e.spot.clone(), yaw, p, expr: on || BEHAVIOURS.includes(c.do) ? (c.expr || EXPR[c.do] || 'happy') : 'curious' };
}
