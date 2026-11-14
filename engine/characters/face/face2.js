// FACE v2: procedural face layers (eyes with gaze + pupils, independent brows, parametric mouth, tears, sweat, extras) + the logic that
// decides where the eyes look. Pure canvas drawing / maths (no three.js): engine/characters/face/face.js owns the atlas and the texture, this file owns the layers.
// Canvas = one 512x512 face cell (same coordinates as the atlas: eyes at x 197 / 315, y 205; mouth below y 250).
const BLK = '#0b0b0b',
  DARK = '#4a0b10',
  EX = [197, 315],
  EY = 205,
  TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- vocabulary ----------
export const BROW_STYLES = {
  raised: { l: { a: -0.05, h: 20, c: 0.6 }, r: { a: -0.05, h: 20, c: 0.6 } },
  angry: { l: { a: 0.55, h: -2, c: 0 }, r: { a: 0.55, h: -2, c: 0 } },
  worried: { l: { a: -0.5, h: 8, c: 0.15 }, r: { a: -0.5, h: 8, c: 0.15 } },
  flat: { l: { a: 0, h: 0, c: 0 }, r: { a: 0, h: 0, c: 0 } },
  one_raised_l: { l: { a: -0.12, h: 26, c: 0.8 }, r: { a: 0.1, h: -2, c: 0 } },
  one_raised_r: { l: { a: 0.1, h: -2, c: 0 }, r: { a: -0.12, h: 26, c: 0.8 } },
};
export const PUPIL_MUL = { tiny: 0.3, small: 0.5, normal: 1, big: 1.6 };
export const GAZE_WORDS = ['up', 'down', 'left', 'right', 'camera', 'cross', 'none'];
const GAZE_FIX = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], camera: [0, 0] }; // left / right = screen left / right when the face looks at the camera

// New expressions. EXPR-LIST: lint reads the names between the markers (lines "  name: {").
// eyes: k round|arc, rx ry pr (pupil radius) lid slant hl dull hearts up gaze; brows: style name; mouth: w o smile rt teeth(1 upper, 2 both) tongue grit asym cy;
// talk: mouth overrides while speaking; fixed: auto gaze off (eyes already say something); tears sweat blush lines: extras.
// EXPR-LIST BEGIN
export const FACE2 = {
  scream_open: {
    eyes: { k: 'round', rx: 44, ry: 48, pr: 6 },
    brows: 'raised',
    mouth: { w: 66, o: 150, rt: 34, teeth: 2, tongue: 1, cy: 282 },
    talk: { o: 112 },
    lines: 1,
  },
  grit: {
    eyes: { k: 'round', rx: 38, ry: 38, pr: 14, lid: 0.12, slant: 0.55 },
    brows: 'angry',
    mouth: { w: 78, o: 48, grit: 1, cy: 300 },
    talk: { o: 66 },
  },
  tears_joy: {
    eyes: { k: 'arc', up: 1 },
    brows: 'raised',
    mouth: { w: 76, o: 104, smile: 0.55, teeth: 1, tongue: 1, cy: 290 },
    talk: { o: 78 },
    tears: 1,
    blush: 1,
    fixed: 1,
  },
  bawling: {
    eyes: { k: 'arc', up: 1 },
    brows: 'worried',
    mouth: { w: 70, o: 122, smile: -0.5, rt: 10, tongue: 1, cy: 300 },
    talk: { o: 96 },
    tears: 1,
    fixed: 1,
  },
  terrified: {
    eyes: { k: 'round', rx: 45, ry: 49, pr: 5 },
    brows: 'worried',
    mouth: { w: 58, o: 84, rt: 18, teeth: 1, cy: 296 },
    talk: { o: 62 },
    sweat: 1,
    lines: 1,
  },
  side_eye: {
    eyes: { k: 'round', rx: 40, ry: 42, pr: 15, lid: 0.3, slant: 0.1, gaze: [0.95, 0.05] },
    brows: 'one_raised_l',
    mouth: { w: 44, o: 0, smile: -0.12, cy: 312 },
    fixed: 1,
  },
  dead_inside: {
    eyes: { k: 'round', rx: 44, ry: 46, pr: 23, lid: 0.32, hl: 0, dull: 1 },
    brows: { l: { a: 0.1, h: -8, c: 0 }, r: { a: 0.1, h: -8, c: 0 } },
    mouth: { w: 42, o: 0, cy: 318 },
    fixed: 1,
  },
  smirk: {
    eyes: { k: 'round', rx: 40, ry: 42, pr: 15, lid: 0.22, gaze: [0.35, 0.05] },
    brows: 'one_raised_r',
    mouth: { w: 54, o: 0, smile: 0.55, asym: 0.85, cy: 308 },
    fixed: 1,
  },
  eyeroll: {
    eyes: { k: 'round', rx: 42, ry: 44, pr: 15, lid: 0.22 },
    brows: 'flat',
    mouth: { w: 44, o: 0, smile: -0.1, cy: 314 },
    fixed: 1,
    roll: 1,
  },
  lovestruck: {
    eyes: { k: 'round', rx: 46, ry: 48, pr: 21, hearts: 1 },
    brows: 'raised',
    mouth: { w: 58, o: 54, smile: 0.8, rt: -6, cy: 296 },
    talk: { o: 80, tongue: 0 },
    blush: 1,
    fixed: 1,
  },
};
// EXPR-LIST END

// ---------- drawing ----------
function teardrop(g, x, y, s) {
  // point up, round bottom
  g.beginPath();
  g.moveTo(x, y - 1.7 * s);
  g.bezierCurveTo(x + 0.3 * s, y - s, x + s, y - 0.7 * s, x + s, y);
  g.arc(x, y, s, 0, Math.PI);
  g.bezierCurveTo(x - s, y - 0.7 * s, x - 0.3 * s, y - s, x, y - 1.7 * s);
  g.closePath();
}
function heart(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y + s * 0.9);
  g.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.8, y - s * 1.1, x, y - s * 0.35);
  g.bezierCurveTo(x + s * 0.8, y - s * 1.1, x + s * 1.5, y - s * 0.1, x, y + s * 0.9);
  g.closePath();
}
function lidPoly(cx, cy, e, side) {
  // visible part of the eye: everything under the lid line (slant > 0 = inner end lower = angry)
  const ys = (x) => cy - e.ry + (e.lid || 0) * 2 * e.ry + (e.slant || 0) * e.rx * 0.55 * ((-side * (x - cx)) / e.rx),
    x0 = cx - e.rx - 8,
    x1 = cx + e.rx + 8;
  return {
    pts: [
      [x0, ys(x0)],
      [x1, ys(x1)],
      [x1, cy + e.ry + 10],
      [x0, cy + e.ry + 10],
    ],
    a: [cx - e.rx, ys(cx - e.rx)],
    b: [cx + e.rx, ys(cx + e.rx)],
  };
}
const polyPath = (g, pts) => {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
};

export function drawEye(g, cx, cy, e, gz, blink, side, ph = 0) {
  if (!e || e.k === 'none') return;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = BLK;
  if (e.k === 'arc') {
    g.lineWidth = 14;
    g.beginPath();
    if (e.up === -1) g.arc(cx, cy - 20, 36, Math.PI * 0.08, Math.PI * 0.92);
    else g.arc(cx, cy + 22, 36, Math.PI * 1.08, Math.PI * 1.92);
    g.stroke();
    return;
  }
  if (blink) {
    g.lineWidth = 13;
    g.beginPath();
    g.moveTo(cx - e.rx * 0.85, cy + 2);
    g.quadraticCurveTo(cx, cy + 14, cx + e.rx * 0.85, cy + 2);
    g.stroke();
    return;
  }
  const { rx, ry } = e,
    lid = e.lid || e.slant ? lidPoly(cx, cy, e, side) : null;
  g.save();
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  g.clip();
  if (lid) {
    polyPath(g, lid.pts);
    g.clip();
  }
  g.fillStyle = e.dull ? '#d9d9d9' : '#ffffff';
  g.fillRect(cx - rx - 2, cy - ry - 2, rx * 2 + 4, ry * 2 + 4);
  const pr = e.pr,
    px = cx + clamp(gz[0], -1, 1) * Math.max(0, rx - pr - 7),
    py = cy + clamp(gz[1], -1, 1) * Math.max(0, ry - pr - 7);
  if (e.hearts) {
    const s = pr * (1 + 0.12 * Math.sin((ph / 8) * TAU));
    g.fillStyle = '#ff2d6a';
    heart(g, px, py, s);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(px - s * 0.5, py - s * 0.3, s * 0.22, 0, TAU);
    g.fill();
  } else {
    g.fillStyle = e.dull ? '#1b1b1b' : BLK;
    g.beginPath();
    g.arc(px, py, pr, 0, TAU);
    g.fill();
    if (e.hl !== 0) {
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(px + pr * 0.34, py - pr * 0.36, Math.max(2, pr * 0.3), 0, TAU);
      g.fill();
      if (pr > 10) {
        g.beginPath();
        g.arc(px - pr * 0.3, py + pr * 0.34, pr * 0.14, 0, TAU);
        g.fill();
      }
    }
  }
  g.restore();
  g.save();
  if (lid) {
    polyPath(g, lid.pts);
    g.clip();
  }
  g.lineWidth = 8;
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  g.stroke();
  g.restore();
  if (lid) {
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(...lid.a);
    g.lineTo(...lid.b);
    g.stroke();
  }
}
export function drawEyes(g, p) {
  drawEye(g, EX[0], p.ey ?? EY, p.eyes, p.gz[0], p.blink, -1, p.ph);
  drawEye(g, EX[1], p.ey ?? EY, p.eyes, p.gz[1], p.blink, 1, p.ph);
}

export function drawBrows(g, br) {
  if (!br) return;
  g.strokeStyle = BLK;
  g.lineCap = 'round';
  g.lineWidth = 16;
  const L = 86;
  [
    [EX[0], -1, br.l],
    [EX[1], 1, br.r],
  ].forEach(([cx, s, b]) => {
    const xi = cx - (s * L) / 2,
      xo = cx + (s * L) / 2,
      by = 140 - b.h,
      yi = by + (b.a * L) / 2,
      yo = by - (b.a * L) / 2;
    g.beginPath();
    g.moveTo(xi, yi);
    g.quadraticCurveTo(cx, (yi + yo) / 2 - b.c * 24, xo, yo);
    g.stroke();
  });
}

export function drawMouth(g, m) {
  const cx = 256,
    cy = m.cy ?? 306,
    w = m.w,
    o = m.o,
    sl = (m.smile || 0) * (1 - (m.asym || 0)),
    sr = (m.smile || 0) * (1 + (m.asym || 0)),
    xl = cx - w,
    xr = cx + w,
    yl = cy - sl * 26,
    yr = cy - sr * 26,
    rt = m.rt || 0;
  g.lineCap = g.lineJoin = 'round';
  g.strokeStyle = BLK;
  if (m.grit) {
    const y0 = cy - o / 2;
    g.beginPath();
    g.roundRect(xl, y0, w * 2, o, 12);
    g.fillStyle = '#fff';
    g.fill();
    g.lineWidth = 10;
    g.stroke();
    g.lineWidth = 5;
    g.beginPath();
    for (let i = 1; i < 6; i++) {
      const x = xl + (i * w * 2) / 6;
      g.moveTo(x, y0);
      g.lineTo(x, y0 + o);
    }
    g.moveTo(xl, cy);
    g.lineTo(xr, cy);
    g.stroke();
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(xl - 2, y0 + 8);
    g.lineTo(xl - 18, y0 - 8);
    g.moveTo(xr + 2, y0 + 8);
    g.lineTo(xr + 18, y0 - 8);
    g.stroke();
    return;
  }
  if (o < 8) {
    g.lineWidth = 14;
    g.beginPath();
    g.moveTo(xl, yl);
    g.quadraticCurveTo(cx, cy + ((sl + sr) / 2) * 44, xr, yr);
    g.stroke();
    return;
  }
  const path = () => {
    g.beginPath();
    g.moveTo(xl, yl);
    g.bezierCurveTo(xl, yl - rt * 1.33, xr, yr - rt * 1.33, xr, yr);
    g.bezierCurveTo(xr, yr + o * 1.33, xl, yl + o * 1.33, xl, yl);
    g.closePath();
  };
  path();
  g.fillStyle = DARK;
  g.fill();
  g.save();
  path();
  g.clip();
  const top = Math.min(yl, yr) - rt * 0.75 - 3;
  if (m.teeth) {
    const th = Math.min(46, 16 + o * 0.26) + rt * 0.75;
    g.fillStyle = '#fff';
    g.fillRect(xl - 4, top, w * 2 + 8, th);
    g.fillStyle = '#cfcfd8';
    for (let i = 1; i < 6; i++) g.fillRect(xl + (i * w * 2) / 6 - 1.5, top, 3, th - 4);
    g.fillStyle = '#e4d6d9';
    g.fillRect(xl - 4, top + th - 4, w * 2 + 8, 4);
    if (m.teeth > 1) {
      const bh = Math.min(34, 10 + o * 0.2),
        by = Math.max(yl, yr) + o - bh;
      g.fillStyle = '#fff';
      g.fillRect(xl - 4, by, w * 2 + 8, bh + 6);
      g.fillStyle = '#cfcfd8';
      for (let i = 1; i < 6; i++) g.fillRect(xl + (i * w * 2) / 6 - 1.5, by, 3, bh);
    }
  }
  if (m.tongue && o > 36) {
    g.fillStyle = '#f06a7a';
    g.beginPath();
    g.ellipse(cx, Math.max(yl, yr) + o * 0.9, w * 0.6, o * 0.3, 0, 0, TAU);
    g.fill();
    g.strokeStyle = '#c94a5a';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(cx, Math.max(yl, yr) + o * 0.68);
    g.lineTo(cx, Math.max(yl, yr) + o * 0.86);
    g.stroke();
  }
  g.restore();
  path();
  g.lineWidth = 12;
  g.strokeStyle = BLK;
  g.stroke();
}

export function drawTears(g, ph, y0 = 236, ey = EY) {
  // two streams over the cheeks + running drops (ph 0..7 loops)
  [
    [EX[0], -1],
    [EX[1], 1],
  ].forEach(([cx, s]) => {
    const x = cx + s * 15,
      y1 = 432,
      gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, 'rgba(120,195,245,.95)');
    gr.addColorStop(1, 'rgba(90,170,235,.75)');
    g.fillStyle = gr;
    g.beginPath();
    g.roundRect(x - 15, y0 - 6, 30, y1 - y0, 15);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)';
    for (let k = 0; k < 3; k++) {
      const yy = y0 + ((ph / 8 + k / 3) % 1) * (y1 - y0 - 40);
      g.beginPath();
      g.roundRect(x - 7, yy, 7, 30, 3.5);
      g.fill();
    }
    for (let k = 0; k < 2; k++) {
      const f = (ph / 8 + k * 0.5 + (s > 0 ? 0.2 : 0)) % 1,
        yy = y0 + 30 + f * (y1 - y0 - 20),
        xx = x + s * (24 + k * 6);
      g.globalAlpha = 1 - f * 0.5;
      g.fillStyle = '#7cc4f2';
      teardrop(g, xx, yy, 9 - k * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.8)';
      g.beginPath();
      g.arc(xx - 3, yy - 1, 2.2, 0, TAU);
      g.fill();
      g.globalAlpha = 1;
    }
  });
}
export function drawTearPool(g, rx, ry, ey = EY) {
  g.fillStyle = 'rgba(110,190,245,.85)';
  [EX[0], EX[1]].forEach((cx) => {
    g.beginPath();
    g.ellipse(cx, ey + ry - 7, rx * 0.8, 9, 0, 0, TAU);
    g.fill();
  });
}
export function drawSweat(g, ph) {
  [
    [382, 104, 0],
    [132, 138, 0.5],
  ].forEach(([x, y, o]) => {
    const f = (ph / 8 + o) % 1,
      yy = y + f * 70;
    g.globalAlpha = 1 - f * 0.6;
    g.fillStyle = '#7cc4f2';
    teardrop(g, x, yy, 11);
    g.fill();
    g.strokeStyle = '#4a9ad4';
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.beginPath();
    g.arc(x - 4, yy, 2.6, 0, TAU);
    g.fill();
    g.globalAlpha = 1;
  });
}
export function drawLines(g) {
  g.strokeStyle = '#86c0ea';
  g.lineWidth = 7;
  g.lineCap = 'round';
  [
    [112, 84, 140],
    [130, 78, 158],
    [148, 86, 150],
  ].forEach(([x, a, b]) => {
    g.beginPath();
    g.moveTo(x, a);
    g.lineTo(x, b);
    g.stroke();
  });
}
export function drawBlush(g) {
  g.fillStyle = 'rgba(255,110,130,.35)';
  g.beginPath();
  g.ellipse(150, 262, 30, 16, 0, 0, 7);
  g.ellipse(362, 262, 30, 16, 0, 0, 7);
  g.fill();
}

// ---------- parameters ----------
const MOUTH0 = { w: 60, o: 0, smile: 0, rt: 0, teeth: 0, tongue: 0, cy: 306 };
// rest mouth + talk overrides -> the mouth for this lip-sync level (0 closed/rest, .5, 1) and vowel (a o e m n)
export function mixMouth(def, lvl, vowel, jit = 0) {
  const m = { ...MOUTH0, ...def.mouth };
  if (lvl > 0) {
    const T = { teeth: Math.max(m.teeth, 1), tongue: 1, ...(def.talk || {}) };
    if (def.talk?.o == null) T.o = Math.max(m.o + 40, 78);
    if (def.mouth?.grit) {
      T.teeth = m.teeth;
      T.tongue = 0;
    }
    m.o = m.o + (T.o - m.o) * lvl;
    if (lvl >= 0.5) {
      m.teeth = T.teeth;
      m.tongue = T.tongue;
    }
    if (!m.grit) {
      if (vowel === 'a') {
        m.w *= 0.85;
        m.o *= 1.1;
      } else if (vowel === 'o') {
        m.w *= 0.6;
        m.o *= 1.15;
        m.rt = Math.max(m.rt, m.o * 0.3);
      } else if (vowel === 'e') {
        m.w *= 1.22;
        m.o *= 0.5;
        m.smile = Math.max(m.smile, 0.2);
      } else if (vowel === 'm') {
        m.o = 0;
        m.teeth = 0;
        m.tongue = 0;
      }
    }
  }
  if (jit) {
    m.w += jit * 4;
    m.o += m.o > 8 ? jit * 7 : 0;
  }
  return m;
}
export function vowelAt(word, t, s, e) {
  // deterministic mouth shape from the letters of the word being spoken
  const seq = [];
  for (const c of String(word || '').toLowerCase()) {
    if ('a'.includes(c)) seq.push('a');
    else if ('ou'.includes(c)) seq.push('o');
    else if ('eiy'.includes(c)) seq.push('e');
    else if ('mbp'.includes(c)) seq.push('m');
  }
  if (!seq.length) return 'a';
  return seq[clamp(Math.floor(((t - s) / Math.max(0.05, e - s)) * seq.length), 0, seq.length - 1)];
}
export function browsOf(v) {
  return typeof v === 'string' ? BROW_STYLES[v] : v;
}
export const pupilMul = (v) => (v == null ? 1 : typeof v === 'number' ? v : (PUPIL_MUL[v] ?? (parseFloat(v) || 1)));

// full v2 expression -> parameter object -> pixels
export function resolveV2(expr, lvl, blink, o) {
  const d = FACE2[expr],
    e = { rx: 42, ry: 46, pr: 14, ...d.eyes };
  e.pr *= pupilMul(o.pu);
  const gz =
    o.g ||
    (d.eyes.gaze
      ? [d.eyes.gaze, d.eyes.gaze]
      : [
          [0, 0],
          [0, 0],
        ]);
  return {
    eyes: e,
    gz,
    blink,
    ph: o.ph || 0,
    brows: browsOf(o.br || d.brows),
    mouth: mixMouth(d, lvl, o.vw, o.jit),
    tears: o.te ?? d.tears,
    tph: o.tp || 0,
    sweat: d.sweat,
    lines: d.lines,
    blush: d.blush,
  };
}
export function composeV2(g, p) {
  if (p.blush) drawBlush(g);
  if (p.tears) drawTears(g, p.tph, p.eyes.k === 'arc' ? EY + 8 : EY + p.eyes.ry * 0.55);
  drawEyes(g, p);
  if (p.tears && p.eyes.k === 'round') drawTearPool(g, p.eyes.rx, p.eyes.ry);
  drawBrows(g, p.brows);
  drawMouth(g, p.mouth);
  if (p.sweat) drawSweat(g, p.tph);
  if (p.lines) drawLines(g);
}

// ---------- where the eyes look ----------
const hash = (a, b) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const q6 = (v) => Math.round(clamp(v, -1, 1) * 6) / 6;
const headCY = (ch) => ch.rest?.headCentreY ?? 4.87; // head centre above the floor (unscaled), from the R15 character itself
function toward(st, targetPos, hdPitchOffset = 0, ch) {
  // gaze [gx, gy] needed to look at a world point from this actor's head
  const hx = st.pos.x,
    hz = st.pos.z,
    hy = st.pos.y + ((st.p.y || 0) + headCY(ch)) * (ch.spec.scale || 1),
    dx = targetPos.x - hx,
    dz = targetPos.z - hz,
    dy = targetPos.y - hy,
    yaw = st.yaw + (st.p.hd[1] || 0) + (st.p.ts[1] || 0);
  const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw),
    lz = dx * Math.sin(yaw) + dz * Math.cos(yaw),
    hd = Math.hypot(dx, dz);
  const gx = lz < 0 ? Math.sign(lx || 1) : clamp(Math.atan2(lx, lz) / 0.75, -1, 1);
  const gy = -clamp((Math.atan2(dy, Math.max(0.5, hd)) + (st.p.hd[0] || 0)) / 0.5, -1, 1);
  return [gx, gy];
}
// c = { A, s, st, t, lt, subj, cam: {x,y,z}, resolveAt, style, mouth, expr }; returns the options object for setFace (undefined = nothing new: old atlas path)
export function faceOptions(c) {
  const { A, st, t, lt, style, expr } = c,
    isV2 = !!FACE2[expr],
    def = FACE2[expr];
  const cfg = { gaze: A.a.gaze, brows: A.a.brows, pupils: A.a.pupils, tears: A.a.tears };
  const evs = [
    ...(A.acts || []).slice(1).map((x) => ({ ...x })),
    ...(A._fv || (A._fv = (A.a.facev || []).map((x) => ({ ...x, t: c.resolveAt(x.at, c.s) })))),
  ].sort((p, q) => p.t - q.t);
  for (const x of evs) if (x.t <= lt) for (const k of Object.keys(cfg)) if (x[k] !== undefined) cfg[k] = x[k];
  const o = {};
  let explicit = null;
  const headPos = (B) => ({
    x: B._st.pos.x,
    z: B._st.pos.z,
    y: B._st.pos.y + ((B._st.p.y || 0) + headCY(B.ch)) * (B.ch.spec.scale || 1),
  });
  const G = cfg.gaze;
  if (G != null && G !== 'none' && G !== 'auto') {
    if (Array.isArray(G)) explicit = [G, G];
    else if (G === 'cross')
      explicit = [
        [0.85, 0.08],
        [-0.85, 0.08],
      ];
    else if (GAZE_FIX[G] && G !== 'camera') explicit = [GAZE_FIX[G], GAZE_FIX[G]];
    else if (G === 'camera') {
      const g = toward(st, c.cam, 0, A.ch);
      explicit = [g, g];
    } else {
      const B = c.s._actors.find((x) => x.a.id === G);
      if (B) {
        const g = toward(st, headPos(B), 0, A.ch);
        explicit = [g, g];
      }
    }
  }
  if (expr === 'eyeroll' && !explicit) {
    const a = ((t * 0.85 + A.ph / TAU) % 1) * TAU,
      g = [Math.sin(a) * 0.9, -Math.cos(a) * 0.9];
    explicit = [g, g];
  }
  let auto = false;
  if (!explicit && style?.gaze !== false && !(isV2 && def.fixed)) {
    const own = A.a.look,
      id = own === 'none' || own === false ? null : own || c.subj,
      B = id && id !== A.a.id ? c.s._actors.find((x) => x.a.id === id) : null;
    if (B || isV2 || style?.gaze === 'all') {
      const base = B ? toward(st, headPos(B), 0, A.ch) : toward(st, c.cam, 0, A.ch),
        n = Math.floor(t / 0.85 + A.ph * 0.37),
        h1 = hash(n, Math.round(A.ph * 100)),
        h2 = hash(n + 91, Math.round(A.ph * 100));
      const sac = h1 < 0.35 ? [0, 0] : [Math.round((h2 - 0.5) * 4) / 8, Math.round((hash(n + 7, 5) - 0.5) * 3) / 8]; // small saccades around the target, held ~.85 s, deterministic
      const g = [base[0] * 0.85 + sac[0], base[1] * 0.8 + sac[1]];
      explicit = [g, g];
      auto = true;
    }
  }
  if (explicit) o.g = explicit.map((g) => [q6(g[0]), q6(g[1])]);
  if (explicit && !auto) o.ex = 1;
  if (auto) o.au = 1;
  if (cfg.brows) o.br = cfg.brows;
  if (cfg.pupils != null) o.pu = cfg.pupils;
  if (cfg.tears) {
    o.te = 1;
    o.tp = Math.floor(t * 8) % 8;
  } else if (cfg.tears === false) o.te = 0;
  if (isV2) {
    o.vw = c.mouth > 0 ? vowelAt(c.word?.w, t, c.word?.s ?? 0, c.word?.e ?? 1) : 'n';
    if (expr === 'terrified') o.jit = (Math.floor(t * 30) % 3) - 1;
    if (expr === 'lovestruck') o.ph = Math.floor(t * 4) % 8;
    if (def.sweat) o.tp = Math.floor(t * 3) % 8;
    if (def.tears && o.te == null) {
      o.te = 1;
      o.tp = Math.floor(t * 8) % 8;
    }
  }
  return isV2 || Object.keys(o).length ? o : undefined;
}
