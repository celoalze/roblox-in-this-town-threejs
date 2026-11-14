// Data-driven particle effects on three.quarks (MIT). An effect is a JSON file, assets/vfx/fx/<name>.json, used in a story as
// `"fx": "<name>:actor@word"` or long form {"type": "<name>", "pos": [x,y,z], "at": ..., "scale": 1, "seed": 3, "color": "#...", ...options}.
// The renderer draws any time t in any order, so the simulation is made deterministic here: a fixed 1/60 step, Math.random swapped
// for a seeded generator while stepping, and a rewind (rebuild + replay from 0) when an earlier time is asked for. Sub-frame times
// of motion blur just reuse the current state (particles are not blurred between sub-frames, only the frame as a whole).
//
// Units: every length, speed and gravity in the JSON is in metres (at scale 1). The effect scale multiplies all of them.
//
// Effect JSON (every key optional except emitters):
// { "emitters": [{
//     "shape": "point" | {"type": "cone|sphere|circle|donut|hemisphere|rectangle|point", "radius": 1, "angle": 25, "arc": 360, "thickness": 1, "width": 1, "height": 1},
//     "at": [x, y, z]          offset of this emitter from the effect anchor (scaled),
//     "rot": [x, y, z]         emitter rotation in degrees. Circle and rectangle shapes lie in the XY plane and cone axes point along +Z,
//                              so rot [-90, 0, 0] lays a ring flat on the ground (radial speed) or points a cone straight up,
//     "move": [x, y, z] + "moveTime": s   the emitter travels from "at" by this vector, decelerating (a rocket whose trail stays behind; world particles),
//     "start": 0.4             the emitter sleeps until this effect time ("delay" only shifts bursts), "prewarm": true (looping emitters start in steady state: fog, snow),
//     "tile": [0, 3] (random start frame of a "tiles" flipbook),
//     "life": 1.2 | [0.8, 1.6],  "speed": [8, 14] | 3,  "size": [1, 2] | 1,  "rotation": [0, 360] (degrees),
//     "color": "#ffd27a" | ["#ffd27a", "#ff5a00"] (random between),  "alpha": 1,
//     "rate": 60 (per second), "burst": [[time, count], ...], "duration": 1.5, "looping": false, "delay": 0.3 (shifts the bursts),
//     "world": true (particles stay where emitted),
//     "texture": "soft|spark|ring|smoke|star|streak|puff|crack|crackglow|shaft|beamfall|glow|plus|confetti|drop|flame|shard|bolt" or an image path
//                (Kenney sprites: use the path assets/vfx/textures/kenney/<name>.png, the engine loads the white+luminance-alpha copy from textures/kenney_a/, good for both blends),
//     "blend": "add" | "normal",
//     "mode": "billboard" | "stretch" (streaks along velocity, "stretchScale") | "flat" (lies on the ground, a decal) |
//             "mesh" (instanced 3D chunks: "geometry": "icosa|cone|spike|plane|slab|shaft|beam" (beam = 3 crossed soft 6x40 m quads, pair with texture "beamfall"), "unlit": true = MeshBasic, "emissive": "#hex",
//             "emissiveIntensity": 0.5, "castShadow": true),
//     "collide": true | bounce (bounces off the ground plane y = 0),
//     "countable": true (burst counts and rate scale with the `count` option),
//     "tint": "glow" (colour comes from the `glow` option; the emitter is skipped when no glow is given),
//     "tiles": [4, 4] (flipbook), "order": 0 (draw order), "stretchScale": 6,
//     "over": { "size": [[0, 0.2], [0.3, 1], [1, 0]]  (multiplier by life 0..1),
//               "color": [["#fff", 0, 1], ["#ff7a00", 0.5, 0.8], ["#000", 1, 0]] ([colour, t, alpha]),
//               "speed": [[0, 1], [1, 0.2]]  (multiplier),  "rotate": [-90, 90] (deg/s),  "gravity": [0, -9, 0],  "drag": 2 (speed damping),
//               "noise": [freq, strength],  "force": [x, y, z],  "frame": [[0, 0], [1, 15]] (flipbook frame by life),
//               "orbit": 90 | [60, 120] (deg/s around the emitter's Y axis, "orbitAxis": [0, 0, 1] for another; use with "world": false) } }],
//   "scale": 1 (default scale of this effect),
//   "duration": 3 (effect length, used by lint and the light),
//   "radius": 30 (reference radius in metres; the `radius` option rescales the whole effect by option / this value),
//   "count": 44 (reference count; the `count` option rescales every countable emitter by option / this value),
//   "light": ["#ff8a30", intensity, radius] (optional flickering point light) }
//
// Options a story can pass (all optional): scale, radius (see above), count (see above), dur (effect length in seconds: rescales the
// emitter durations and lives), loop (every emitter loops), color (replaces every emitter colour), glow (colour of tint:"glow" emitters),
// seed, pos / at (placement, handled by props.js).
import * as THREE from 'three';
import { BatchedRenderer, ParticleSystem, RenderMode } from 'three.quarks';
import {
  ConeEmitter,
  SphereEmitter,
  CircleEmitter,
  DonutEmitter,
  HemisphereEmitter,
  RectangleEmitter,
  PointEmitter,
  ConstantValue,
  IntervalValue,
  ConstantColor,
  ColorRange,
  Vector4,
  Vector3,
  SizeOverLife,
  ColorOverLife,
  OrbitOverLife,
  FrameOverLife,
  ApplyForce,
  ApplyCollision,
  RotationOverLife,
  SpeedOverLife,
  LimitSpeedOverLife,
  TurbulenceField,
  PiecewiseBezier,
  Bezier,
  Gradient,
  EmitterMode,
} from 'quarks.core';

const SPECS = {};
const STEP = 1 / 60,
  MAX_STEPS = 60 * 30,
  TEX = {},
  GEO = {},
  TAU = Math.PI * 2;
export function registerQuarks(map) {
  Object.assign(SPECS, map || {});
  for (const sp of Object.values(SPECS)) for (const e of sp.emitters || []) if (e.texture) tex(e.texture);
} // textures start loading now
export const isQuarks = (type) => !!SPECS[type];

// ---- seeded Math.random during a step (quarks.core draws all its randomness from it); also the seeded generator for procedural art
function seeded(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

// ---- ground: particles below y = 0 bounce off the floor (ApplyCollision resolver)
const GROUND = {
  resolve(p, n) {
    if (p.y >= 0) return false;
    p.y = 0;
    n.set(0, 1, 0);
    return true;
  },
};

// ---- procedural sprite textures (a path in "texture" loads an image instead)
function canvasTex(W, H, draw) {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  draw(cv.getContext('2d'), W, H);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// billowy puff: overlapping noisy lobes with a ragged soft edge, lit from above (white top, cool grey underside; the sprite colour multiplies it)
function drawPuff(g, w) {
  const r = seeded(31),
    c = w / 2;
  const lobes = [];
  for (let i = 0; i < 16; i++) {
    const a = r() * TAU,
      d = r() ** 0.8 * w * 0.27;
    lobes.push([c + Math.cos(a) * d, c + Math.sin(a) * d * 0.9, w * (0.1 + r() * 0.13)]);
  }
  lobes.sort((p, q) => q[1] - p[1]);
  lobes.forEach(([x, y, rad]) => {
    const q = g.createRadialGradient(x - rad * 0.15, y - rad * 0.25, rad * 0.1, x, y, rad);
    q.addColorStop(0, 'rgba(255,255,255,1)');
    q.addColorStop(0.6, 'rgba(232,232,236,1)');
    q.addColorStop(0.85, 'rgba(165,165,175,.95)');
    q.addColorStop(1, 'rgba(130,130,142,0)');
    g.fillStyle = q;
    g.beginPath();
    g.arc(x, y, rad, 0, TAU);
    g.fill();
  });
  g.globalCompositeOperation = 'destination-in';
  const m = g.createRadialGradient(c, c, w * 0.2, c, c, w * 0.5);
  m.addColorStop(0, '#fff');
  m.addColorStop(0.8, 'rgba(255,255,255,.9)');
  m.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = m;
  g.fillRect(0, 0, w, w);
  g.globalCompositeOperation = 'source-atop';
  const l = g.createLinearGradient(0, 0, 0, w);
  l.addColorStop(0, 'rgba(255,255,255,.25)');
  l.addColorStop(0.5, 'rgba(150,150,165,.1)');
  l.addColorStop(1, 'rgba(60,60,76,.55)');
  g.fillStyle = l;
  g.fillRect(0, 0, w, w);
  g.globalCompositeOperation = 'source-over';
}
// jagged cracks with secondary and tertiary branches (dark strokes on transparent; the glow pass is white and blurred)
function drawCrack(g, W, glowPass) {
  const c = W / 2,
    rr = seeded(13),
    k = W / 1024;
  g.lineCap = g.lineJoin = 'round';
  if (glowPass) g.filter = 'blur(' + 6 * k + 'px)';
  const branch = (px, py, ang, len, wd, depth) => {
    let X = px,
      Y = py,
      a = ang,
      L = 0;
    const br = [];
    g.beginPath();
    g.moveTo(X, Y);
    while (L < len) {
      const st = (20 + rr() * 28) * k;
      a += (rr() - 0.5) * (depth ? 1.1 : 0.9);
      X += Math.cos(a) * st;
      Y += Math.sin(a) * st;
      L += st;
      g.lineTo(X, Y);
      if (depth < 3 && rr() < (depth ? 0.3 : 0.5))
        br.push([X, Y, a + (rr() < 0.5 ? -1 : 1) * (0.45 + rr() * 0.7), len * (0.28 + rr() * 0.3) - L * 0.15]);
    }
    g.lineWidth = wd;
    g.stroke();
    br.forEach((b) => b[3] > 30 * k && branch(b[0], b[1], b[2], b[3], wd * 0.62, depth + 1));
  };
  const n = 11 + ((rr() * 4) | 0);
  for (let i = 0; i < n; i++) {
    g.strokeStyle = glowPass ? '#fff' : '#0b0908';
    branch(c, c, (i / n) * TAU + rr() * 0.5, c * (0.55 + rr() * 0.4), (glowPass ? 9 : 28) * k * (0.75 + rr() * 0.5), 0);
  }
  if (!glowPass) {
    const q = g.createRadialGradient(c, c, 0, c, c, c * 0.2);
    q.addColorStop(0, 'rgba(8,6,5,.95)');
    q.addColorStop(1, 'rgba(8,6,5,0)');
    g.fillStyle = q;
    g.fillRect(0, 0, W, W);
  }
}
function tex(name) {
  if (TEX[name]) return TEX[name];
  let t;
  if (/[./]/.test(name)) {
    const src = name.replace('textures/kenney/', 'textures/kenney_a/');
    t = new THREE.TextureLoader().load(src.startsWith('/') ? src : '/' + src);
    t.colorSpace = THREE.SRGBColorSpace;
    return (TEX[name] = t);
  }
  if (name === 'puff') return (TEX[name] = canvasTex(256, 256, drawPuff));
  if (name === 'crack' || name === 'crackglow')
    return (TEX[name] = canvasTex(512, 512, (g, w) => drawCrack(g, w, name === 'crackglow')));
  if (name === 'beamfall')
    return (TEX[name] = canvasTex(64, 256, (g, w, h) => {
      for (let x = 0; x < w; x++) {
        const u = ((x + 0.5) / w) * 2 - 1;
        g.fillStyle = 'rgba(255,255,255,' + Math.exp(-u * u * 3.2) * (1 - Math.abs(u) ** 6) + ')';
        g.fillRect(x, 0, 1, h);
      }
      g.globalCompositeOperation = 'destination-in';
      const l = g.createLinearGradient(0, 0, 0, h);
      l.addColorStop(0, 'rgba(255,255,255,0)');
      l.addColorStop(0.35, 'rgba(255,255,255,.7)');
      l.addColorStop(0.9, 'rgba(255,255,255,1)');
      l.addColorStop(1, 'rgba(255,255,255,.85)');
      g.fillStyle = l;
      g.fillRect(0, 0, w, h);
    })); // soft-edged light shaft: gaussian across, fading toward the top (use with geometry "beam")
  if (name === 'shaft')
    return (TEX[name] = canvasTex(8, 256, (g, w, h) => {
      const l = g.createLinearGradient(0, 0, 0, h);
      l.addColorStop(0, 'rgba(255,255,255,0)');
      l.addColorStop(0.45, 'rgba(255,255,255,1)');
      l.addColorStop(1, 'rgba(255,255,255,.7)');
      g.fillStyle = l;
      g.fillRect(0, 0, w, h);
    }));
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d'),
    R = 64;
  let sd = 3;
  const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const radial = (r0, stops) => {
    const gr = g.createRadialGradient(R, R, r0, R, R, R);
    for (const [o, c] of stops) gr.addColorStop(o, c);
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  };
  const glowStroke = (w, c, blur) => {
    g.shadowColor = c;
    g.shadowBlur = blur;
    g.lineWidth = w;
    g.strokeStyle = c;
    g.lineJoin = g.lineCap = 'round';
  };
  if (name === 'plus') {
    g.fillStyle = '#fff';
    g.shadowColor = '#fff';
    g.shadowBlur = 8;
    for (const [x, y, w, h] of [
      [44, 14, 40, 100],
      [14, 44, 100, 40],
    ]) {
      g.beginPath();
      g.roundRect(x, y, w, h, 12);
      g.fill();
    }
  } else if (name === 'confetti') {
    g.fillStyle = '#fff';
    g.beginPath();
    g.roundRect(30, 14, 68, 100, 6);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,.12)';
    g.fillRect(30, 14, 68, 18);
  } else if (name === 'drop') {
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(64, 6);
    g.bezierCurveTo(64, 40, 100, 62, 100, 86);
    g.arc(64, 86, 36, 0, Math.PI);
    g.bezierCurveTo(28, 62, 64, 40, 64, 6);
    g.fill();
  } else if (name === 'flame') {
    const gr = g.createLinearGradient(0, 120, 0, 4);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.55, 'rgba(255,255,255,.85)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(64, 2);
    g.bezierCurveTo(70, 40, 110, 60, 100, 92);
    g.bezierCurveTo(95, 124, 33, 124, 28, 92);
    g.bezierCurveTo(22, 64, 56, 44, 64, 2);
    g.fill();
  } else if (name === 'shard') {
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(64, 4);
    g.lineTo(96, 70);
    g.lineTo(64, 124);
    g.lineTo(32, 70);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(0,0,0,.18)';
    g.beginPath();
    g.moveTo(64, 4);
    g.lineTo(96, 70);
    g.lineTo(64, 124);
    g.closePath();
    g.fill();
  } else if (name === 'bolt') {
    const pts = [[70, 4]];
    let x = 70,
      y = 4;
    while (y < 118) {
      y += 14 + rnd() * 14;
      x = 64 + (rnd() - 0.5) * 56;
      pts.push([x, Math.min(y, 124)]);
    } // blue halo + white core (colour it with white)
    for (const [w, c, b] of [
      [12, 'rgba(70,150,255,.9)', 14],
      [5, '#ffffff', 6],
    ]) {
      glowStroke(w, c, b);
      g.beginPath();
      pts.forEach(([a, d], i) => (i ? g.lineTo(a, d) : g.moveTo(a, d)));
      g.stroke();
    }
  } else if (name === 'glow') {
    radial(0, [
      [0, 'rgba(255,255,255,1)'],
      [0.25, 'rgba(255,255,255,.75)'],
      [0.55, 'rgba(255,255,255,.22)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
  } else if (name === 'spark') {
    radial(0, [
      [0, 'rgba(255,255,255,1)'],
      [0.18, 'rgba(255,255,255,.9)'],
      [0.5, 'rgba(255,255,255,.18)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
  } else if (name === 'ring') {
    radial(0, [
      [0, 'rgba(255,255,255,0)'],
      [0.62, 'rgba(255,255,255,0)'],
      [0.78, 'rgba(255,255,255,1)'],
      [0.9, 'rgba(255,255,255,.35)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
  } else if (name === 'star') {
    g.translate(R, R);
    g.fillStyle = '#fff';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4,
        r = i % 2 ? 14 : 62;
      g.lineTo(Math.cos(a - Math.PI / 2) * r, Math.sin(a - Math.PI / 2) * r);
    }
    g.closePath();
    g.fill();
  } else if (name === 'streak') {
    const gr = g.createLinearGradient(0, 0, 128, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.7, 'rgba(255,255,255,.9)');
    gr.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(64, 64, 62, 9, 0, 0, 7);
    g.fill();
  } else if (name === 'smoke') {
    for (let i = 0; i < 14; i++) {
      const a = rnd() * 6.283,
        d = rnd() * 26,
        x = R + Math.cos(a) * d,
        y = R + Math.sin(a) * d,
        r = 20 + rnd() * 20,
        gr = g.createRadialGradient(x, y - r * 0.2, 0, x, y, r);
      gr.addColorStop(0, 'rgba(255,255,255,.85)');
      gr.addColorStop(0.7, 'rgba(200,200,200,.55)');
      gr.addColorStop(1, 'rgba(150,150,150,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, 7);
      g.fill();
    }
  } else
    radial(0, [
      [0, 'rgba(255,255,255,1)'],
      [0.35, 'rgba(255,255,255,.6)'],
      [1, 'rgba(255,255,255,0)'],
    ]); // soft
  t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return (TEX[name] = t);
}

// ---- 3D chunks for render mode "mesh" (dimensions in metres at size 1)
function geometry(name) {
  if (GEO[name]) return GEO[name];
  let g;
  if (name === 'icosa') {
    g = new THREE.IcosahedronGeometry(0.5, 0);
    const r = seeded(9),
      pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++)
      pa.setXYZ(i, pa.getX(i) * (0.8 + r() * 0.5), pa.getY(i) * (0.8 + r() * 0.5), pa.getZ(i) * (0.8 + r() * 0.5));
    g.computeVertexNormals();
  } else if (name === 'cone') {
    g = new THREE.ConeGeometry(0.5, 1, 5, 1);
    g.translate(0, 0.5, 0);
  } // base on the anchor, 1 m tall
  else if (name === 'spike') {
    g = new THREE.ConeGeometry(0.2, 1, 5, 1);
    g.translate(0, 0.5, 0);
  } // thin ice spike, 1 m tall, base on the anchor
  else if (name === 'plane') g = new THREE.PlaneGeometry(1.1, 0.7);
  else if (name === 'slab') g = new THREE.BoxGeometry(1.6, 0.4, 1.2);
  else if (name === 'shaft') {
    g = new THREE.CylinderGeometry(3, 3, 40, 24, 1, true);
    g.translate(0, 20, 0);
  } // open tube, 3 m radius, 40 m tall, base on the anchor
  else if (name === 'beam') {
    const P = [],
      U = [],
      I = [];
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3,
        c = Math.cos(a) * 3,
        z = Math.sin(a) * 3,
        o = k * 4;
      P.push(-c, 0, -z, c, 0, z, c, 40, z, -c, 40, -z);
      U.push(0, 0, 1, 0, 1, 1, 0, 1);
      I.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I);
  } // 3 crossed 6x40 m quads (use texture "beamfall"): a soft light shaft seen from any side
  else g = new THREE.BoxGeometry(1, 1, 1);
  return (GEO[name] = g);
}

// ---- JSON -> quarks objects
const col = (c) => {
  const k = new THREE.Color(c);
  return new Vector4(k.r, k.g, k.b, 1);
};
const val = (v, d = 1) =>
  v == null ? new ConstantValue(d) : Array.isArray(v) ? new IntervalValue(v[0], v[1]) : new ConstantValue(v);
const scaled = (v, d, m) => (v == null ? d : Array.isArray(v) ? v.map((x) => x * m) : v * m);
const lifeVal = (v, d, k) =>
  v == null
    ? new ConstantValue(d * k)
    : Array.isArray(v)
      ? new IntervalValue(v[0] * k, v[1] * k)
      : new ConstantValue(v * k);
const colorGen = (c, a = 1) => {
  const A = Array.isArray(c) ? c : [c ?? '#ffffff'];
  const x = col(A[0]),
    y = col(A[1] ?? A[0]);
  x.w = y.w = a;
  return A.length > 1 ? new ColorRange(x, y) : new ConstantColor(x);
};
function curve(keys, mul = 1) {
  // [[t, v], ...] -> piecewise linear PiecewiseBezier over life 0..1
  const k = keys.map(([t, v]) => [t, v * mul]),
    segs = [];
  for (let i = 0; i < k.length - 1; i++) {
    const [t0, v0] = k[i],
      [t1, v1] = k[i + 1];
    segs.push([new Bezier(v0, v0 + (v1 - v0) / 3, v0 + (2 * (v1 - v0)) / 3, v1), t0]);
  }
  return new PiecewiseBezier(segs);
}
function shapeOf(s, scale) {
  const o = typeof s === 'string' ? { type: s } : s || { type: 'point' },
    T = o.type || 'point',
    common = {
      radius: (o.radius ?? 1) * scale,
      arc: ((o.arc ?? 360) * Math.PI) / 180,
      thickness: o.thickness ?? 1,
      mode: EmitterMode.Random,
      spread: o.spread ?? 0,
      speed: val(o.speed ?? 0, 0),
    };
  if (T === 'cone') return new ConeEmitter({ ...common, angle: ((o.angle ?? 25) * Math.PI) / 180 });
  if (T === 'sphere') return new SphereEmitter(common);
  if (T === 'circle') return new CircleEmitter(common);
  if (T === 'donut') return new DonutEmitter({ ...common, donutRadius: (o.tube ?? 0.3) * scale });
  if (T === 'hemisphere') return new HemisphereEmitter(common);
  if (T === 'rectangle')
    return new RectangleEmitter({
      width: (o.width ?? 1) * scale,
      height: (o.height ?? 1) * scale,
      thickness: o.thickness ?? 1,
      mode: EmitterMode.Random,
      spread: o.spread ?? 0,
      speed: val(o.speed ?? 0, 0),
    });
  return new PointEmitter();
}
function behaviors(e, S) {
  const over = e.over || {},
    b = [];
  if (over.size) b.push(new SizeOverLife(curve(over.size)));
  if (over.color) {
    const c = over.color;
    b.push(
      new ColorOverLife(
        new Gradient(
          c.map(([cc, t]) => {
            const k = new THREE.Color(cc);
            return [new Vector3(k.r, k.g, k.b), t];
          }),
          c.map(([, t, a]) => [a ?? 1, t]),
        ),
      ),
    );
  }
  if (over.speed) b.push(new SpeedOverLife(curve(over.speed)));
  if (over.frame) b.push(new FrameOverLife(curve(over.frame)));
  if (over.orbit != null)
    b.push(
      new OrbitOverLife(
        val(Array.isArray(over.orbit) ? over.orbit.map((d) => (d * Math.PI) / 180) : (over.orbit * Math.PI) / 180),
        new Vector3(...(over.orbitAxis || [0, 1, 0])),
      ),
    );
  if (over.rotate) b.push(new RotationOverLife(val(over.rotate.map((d) => (d * Math.PI) / 180))));
  if (over.gravity)
    b.push(
      new ApplyForce(
        new Vector3(...over.gravity).normalize(),
        new ConstantValue(new Vector3(...over.gravity).length() * S),
      ),
    );
  if (over.force)
    b.push(
      new ApplyForce(
        new Vector3(...over.force).normalize(),
        new ConstantValue(new Vector3(...over.force).length() * S),
      ),
    );
  if (over.drag) b.push(new LimitSpeedOverLife(new ConstantValue(0), over.drag > 1 ? 1 : over.drag)); // 0 target speed, damped by `drag`
  if (over.noise)
    b.push(
      new TurbulenceField(
        new Vector3(1, 1, 1).multiplyScalar(over.noise[0] || 1),
        2,
        new Vector3(1, 1, 1).multiplyScalar((over.noise[1] || 1) * S),
        new Vector3(1, 1, 1),
      ),
    );
  if (e.collide) b.push(new ApplyCollision(GROUND, typeof e.collide === 'number' ? e.collide : 0.35)); // bounce off y = 0
  return b;
}
function build(spec, o, S, cf) {
  const root = new THREE.Group(),
    br = new BatchedRenderer();
  root.add(br);
  const systems = [];
  const dur = spec.duration ?? 2,
    tk = o.dur ? o.dur / dur : 1; // `dur` option: rescale lengths and lives
  (spec.emitters || []).forEach((e, i) => {
    if (e.tint === 'glow' && !o.glow) return; // glow-only emitters need the `glow` option
    const mesh = e.mode === 'mesh',
      stretch = e.mode === 'stretch',
      flat = e.mode === 'flat',
      add = e.blend !== 'normal',
      alpha = e.alpha ?? 1;
    const cc = e.tint === 'glow' ? o.glow : (o.color ?? e.color),
      k = e.countable ? cf : 1;
    let mat;
    if (mesh && !e.unlit && e.texture == null)
      mat = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        flatShading: true,
        roughness: 0.9,
        side: THREE.DoubleSide,
        transparent: alpha < 1,
        opacity: alpha,
        emissive: e.emissive ?? '#000000',
        emissiveIntensity: e.emissiveIntensity ?? 0,
      });
    else
      mat = new THREE.MeshBasicMaterial({
        map: tex(e.texture || 'soft'),
        transparent: true,
        depthWrite: false,
        blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
        side: THREE.DoubleSide,
        fog: false,
        toneMapped: false,
        opacity: alpha,
      });
    const sz = e.size ?? 1,
      size = Array.isArray(sz) ? new IntervalValue(sz[0] * S, sz[1] * S) : new ConstantValue(sz * S);
    const renderMode = mesh
      ? RenderMode.Mesh
      : stretch
        ? RenderMode.StretchedBillBoard
        : flat
          ? RenderMode.HorizontalBillBoard
          : RenderMode.BillBoard;
    const ps = new ParticleSystem({
      duration: (e.duration ?? dur) * tk,
      looping: !!(o.loop || e.looping),
      prewarm: !!(e.prewarm && (o.loop || e.looping)),
      autoDestroy: false,
      shape: shapeOf(e.shape, S),
      startLife: lifeVal(e.life, 1, tk),
      startSpeed: val(scaled(e.speed, 0, S), 0),
      startRotation: val(e.rotation ? e.rotation.map((d) => (d * Math.PI) / 180) : 0, 0),
      startSize: size,
      startColor: colorGen(cc, alpha),
      startLength: val(e.stretchScale ?? 6, 6),
      emissionOverTime: val((e.rate ?? 0) * k, 0),
      emissionBursts: (e.burst || []).map(([time, count]) => ({
        time: time * tk + (e.delay || 0),
        count: new ConstantValue(Math.max(1, Math.round(count * k))),
        probability: 1,
        cycle: 1,
        interval: 0.01,
      })),
      worldSpace: e.world !== false,
      material: mat,
      renderMode,
      instancingGeometry: mesh ? geometry(e.geometry || 'icosa') : undefined,
      renderOrder: e.order ?? i,
      uTileCount: e.tiles?.[0] || 1,
      vTileCount: e.tiles?.[1] || 1,
      behaviors: behaviors(e, S),
      startTileIndex: e.tile ? new IntervalValue(e.tile[0], e.tile[1] + 0.999) : new ConstantValue(0),
      speedFactor: stretch ? (e.stretchScale ?? 6) * 0.06 : 0,
    });
    ps.emitter.layers.set(0);
    if (e.at) ps.emitter.position.fromArray(e.at).multiplyScalar(S);
    if (e.rot) ps.emitter.rotation.set(...e.rot.map((d) => (d * Math.PI) / 180));
    if (e.start) ps.paused = true;
    root.add(ps.emitter);
    br.addSystem(ps);
    systems.push({ ps, e, S, castShadow: !!e.castShadow });
  });
  root.userData.noAO = true;
  root.traverse((x) => {
    x.userData.noAO = true;
    x.frustumCulled = false;
  });
  return { root, br, systems, castShadow: systems.some((s) => s.castShadow) };
}

export function makeQuarks(type, o = {}) {
  const spec = SPECS[type],
    seed = o.seed ?? 11,
    anchor = new THREE.Group();
  let cur = null,
    simT = 0,
    light = null;
  const S = (spec.scale ?? 1) * (o.scale ?? 1) * (o.radius && spec.radius ? o.radius / spec.radius : 1),
    cf = o.count && spec.count ? o.count / spec.count : 1;
  const reset = () => {
    if (cur) {
      anchor.remove(cur.root);
      cur.root.traverse((x) => {
        x.geometry?.dispose?.();
      });
    }
    const rnd = seeded(seed + (o.salt || 0)),
      rnd0 = Math.random;
    Math.random = rnd;
    try {
      cur = build(spec, o, S, cf);
    } finally {
      Math.random = rnd0;
    } // build too: TurbulenceField seeds its noise from Math.random
    anchor.add(cur.root);
    simT = 0;
    cur.rnd = rnd;
    if (spec.light) {
      light = light || new THREE.PointLight(spec.light[0], 0, (spec.light[2] ?? 30) * S);
      anchor.add(light);
    }
  };
  const step = () => {
    for (const { ps, e, S } of cur.systems) {
      if (e.start) ps.paused = simT < e.start - 1e-6;
      if (e.move) {
        const k = Math.min(1, Math.max(0, (simT - (e.start || 0)) / (e.moveTime || 1))),
          q = 1 - (1 - k) * (1 - k),
          a = e.at || [0, 0, 0];
        ps.emitter.position.set((a[0] + e.move[0] * q) * S, (a[1] + e.move[1] * q) * S, (a[2] + e.move[2] * q) * S);
        ps.emitter.updateWorldMatrix(true, false);
      }
    }
    const rnd0 = Math.random;
    Math.random = cur.rnd;
    try {
      cur.br.update(STEP);
    } finally {
      Math.random = rnd0;
    }
    simT += STEP;
  };
  reset();
  return {
    obj: anchor,
    update(t) {
      if (t < simT - 0.05) reset(); // an earlier time than the simulation has reached (new segment / preview still): replay from 0
      let n = 0;
      while (simT < t - 1e-6 && n++ < MAX_STEPS) step();
      if (cur.castShadow)
        cur.br.traverse((x) => {
          if (x.isMesh) x.castShadow = true;
        });
      if (light) {
        const L = spec.light,
          life = (o.dur ?? spec.duration) || 2,
          k = Math.max(0, 1 - t / life);
        light.intensity = (L[1] ?? 20) * k * (0.85 + 0.15 * Math.sin(t * 40));
      }
    },
  };
}
