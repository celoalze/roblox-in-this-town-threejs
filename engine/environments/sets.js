// Environment kit. Characters stand around origin facing +z; default camera looks from +z.
import * as THREE from 'three';
import { WORLDS, WORLD_INTERIOR } from './worlds.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const rng = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const M = {};
export const mat = (c, o = {}) => {
  const k = c + JSON.stringify(o);
  return M[k] || (M[k] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o }));
};
export function box(w, h, d, c, x = 0, y = 0, z = 0, r = 0, o = {}) {
  const g = r ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, typeof c === 'string' ? mat(c, o) : c);
  m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}
export function textTexture(
  text,
  { w = 512, h = 128, bg = null, fg = '#fff', font = 'Lilita One', size = 80, stroke = null } = {},
) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  }
  g.font = `${size}px "${font}"`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (stroke) {
    g.lineWidth = size / 6;
    g.strokeStyle = stroke;
    g.strokeText(text, w / 2, h / 2 + 4);
  }
  g.fillStyle = fg;
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function sign(text, w, h, opt = {}) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      map: textTexture(text, {
        w: 1024,
        h: Math.round((1024 * h) / w),
        size: Math.min(150, ((1024 * h) / w) * 0.62),
        ...opt,
      }),
      roughness: 0.6,
      emissive: opt.glow ? '#ffffff' : '#000',
      emissiveIntensity: opt.glow ? 0.35 : 0,
      emissiveMap: opt.glow ? undefined : null,
    }),
  );
}

// ---- procedural surface textures (canvas, deterministic) ----
const TX = {};
function surf(kind) {
  if (TX[kind]) return TX[kind];
  const N = 256,
    cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  let sd = 11;
  const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const noise = (n, a, sz = 2) => {
    for (let i = 0; i < n; i++) {
      const v = r() < 0.5 ? 0 : 255;
      g.fillStyle = `rgba(${v},${v},${v},${a * r()})`;
      g.fillRect(r() * N, r() * N, sz, sz);
    }
  };
  g.fillStyle = '#fff';
  g.fillRect(0, 0, N, N);
  if (kind === 'grass') {
    noise(9000, 0.22, 2);
    for (let i = 0; i < 1600; i++) {
      const x = r() * N,
        y = r() * N;
      g.strokeStyle = `rgba(${r() < 0.5 ? '0,40,0' : '255,255,200'},${0.18 * r()})`;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 4, y - 3 - r() * 5);
      g.stroke();
    }
  } else if (kind === 'tiles') {
    noise(5000, 0.08, 2);
    g.strokeStyle = 'rgba(0,0,0,.22)';
    g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, N - 3, N - 3);
    g.strokeStyle = 'rgba(255,255,255,.5)';
    g.lineWidth = 2;
    g.strokeRect(5, 5, N - 10, N - 10);
  } else if (kind === 'asphalt') {
    noise(16000, 0.2, 1.5);
  } else if (kind === 'siding') {
    noise(2500, 0.05, 2);
    for (let y = 0; y < N; y += 32) {
      const gr = g.createLinearGradient(0, y, 0, y + 32);
      gr.addColorStop(0, 'rgba(255,255,255,.25)');
      gr.addColorStop(0.85, 'rgba(0,0,0,.04)');
      gr.addColorStop(1, 'rgba(0,0,0,.28)');
      g.fillStyle = gr;
      g.fillRect(0, y, N, 32);
    }
  } else if (kind === 'brick') {
    g.fillStyle = '#d8d0c8';
    g.fillRect(0, 0, N, N);
    for (let row = 0; row < 8; row++)
      for (let c = -1; c < 4; c++) {
        const x = c * 64 + (row % 2) * 32,
          y = row * 32;
        const v = 200 + r() * 55;
        g.fillStyle = `rgb(${v},${v * 0.97},${v * 0.95})`;
        g.fillRect(x + 3, y + 3, 58, 26);
      }
    noise(4000, 0.1, 2);
  } else if (kind === 'wood') {
    for (let row = 0; row < 4; row++) {
      const v = 215 + r() * 40;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(0, row * 64, N, 64);
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = `rgba(0,0,0,${0.05 + r() * 0.06})`;
        g.lineWidth = 1 + r() * 2;
        const y = row * 64 + r() * 64;
        g.beginPath();
        g.moveTo(0, y);
        g.bezierCurveTo(80, y + (r() - 0.5) * 8, 170, y + (r() - 0.5) * 8, N, y);
        g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.fillRect(0, row * 64, N, 3);
      const cx = ((row * 97) % 4) * 64;
      g.fillRect(cx, row * 64, 3, 64);
    }
  } else if (kind === 'shingle') {
    for (let row = 0; row < 8; row++)
      for (let c = -1; c < 9; c++) {
        const x = c * 32 + (row % 2) * 16,
          y = row * 32;
        const v = 190 + r() * 65;
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(x + 1, y + 1, 30, 30);
        g.fillStyle = 'rgba(0,0,0,.28)';
        g.fillRect(x, y + 27, 32, 5);
      }
  } else if (kind === 'plaster') noise(7000, 0.06, 3);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return (TX[kind] = t);
}
const TILE = { grass: 6, tiles: 4, asphalt: 10, siding: 4, brick: 5, wood: 6, shingle: 3, plaster: 8 };
export function tmat(kind, c, w = 1, h = 1, o = {}) {
  // textured material, repeat by world size
  const k = `${kind}${c}${w.toFixed(1)}${h.toFixed(1)}${JSON.stringify(o)}`;
  if (M[k]) return M[k];
  const t = surf(kind).clone();
  t.needsUpdate = true;
  t.repeat.set(w / TILE[kind], h / TILE[kind]);
  return (M[k] = new THREE.MeshStandardMaterial({
    color: c,
    roughness: kind === 'asphalt' ? 0.95 : 0.85,
    map: t,
    ...o,
  }));
}
const shade = (hex, f) => '#' + new THREE.Color(hex).multiplyScalar(f).getHexString();

const PAL = {
  house: ['#f6d8a8', '#a8d8f0', '#f4b6c2', '#c9e7a7', '#ffe69a', '#d7c4f2', '#f7f3ea'],
  roof: ['#d9534f', '#3b5ba5', '#5a5a6e', '#7b4a2e', '#2e7d5b'],
  car: ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#fafafa', '#8e24aa'],
};

// ---- reusable pieces ----
export function tree(x, z, s = 1, r = Math.random) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.scale.setScalar(s);
  g.userData.sway = (Math.abs(x * 1.3 + z * 0.7) % 6.28) + 0.01; // world.js rocks it in the wind
  g.add(box(0.9, 4, 0.9, '#7a4a2a', 0, 0, 0));
  const leaf = mat(['#4caf50', '#66bb6a', '#43a047', '#7cb342'][Math.floor(r() * 4)]);
  [
    [0, 4.6, 0, 2.6],
    [-1.4, 4, 0.3, 1.8],
    [1.3, 4.2, -0.2, 1.9],
    [0, 6.2, 0, 1.9],
  ].forEach(([a, b, c, rad]) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rad, 1), leaf);
    m.position.set(a, b, c);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  });
  return g;
}
export function lamp(x, z, night) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.userData.noOcclude = true;
  g.add(box(0.35, 9, 0.35, '#3b3f4a', 0, 0, 0));
  g.add(box(2.2, 0.3, 0.35, '#3b3f4a', 0.9, 9, 0));
  const bulb = box(1, 0.4, 0.8, night ? '#fff6c8' : '#e9eef5', 1.8, 8.7, 0, 0, {
    emissive: '#ffe9a0',
    emissiveIntensity: night ? 2.5 : 0,
  });
  g.add(bulb);
  if (night) {
    const l = new THREE.PointLight('#ffd98a', 60, 26, 1.6);
    l.position.set(1.8, 8, 0);
    g.add(l);
  }
  return g;
}
export function house(x, z, rot, r, night) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  const W = 12 + r() * 4,
    H = 7 + r() * 3,
    D = 9;
  const col = PAL.house[Math.floor(r() * PAL.house.length)],
    roof = PAL.roof[Math.floor(r() * PAL.roof.length)];
  g.add(box(W, H, D, tmat('siding', col, W, H), 0, 0, 0));
  g.add(box(W + 0.3, 0.6, D + 0.3, '#8a8f99', 0, 0, 0)); // foundation
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.add(box(0.45, H, 0.45, '#ffffff', (sx * W) / 2, 0, (sz * D) / 2)); // corner trims
  g.add(box(W + 0.5, 0.45, D + 0.5, '#ffffff', 0, H - 0.2, 0));
  // gable roof (triangular prism) with overhang
  const sh = new THREE.Shape();
  const ov = 0.9,
    RH = 3.4 + r();
  sh.moveTo(-D / 2 - ov, 0);
  sh.lineTo(0, RH);
  sh.lineTo(D / 2 + ov, 0);
  sh.lineTo(D / 2 + ov, -0.35);
  sh.lineTo(0, RH - 0.45);
  sh.lineTo(-D / 2 - ov, -0.35);
  sh.closePath();
  const rg = new THREE.ExtrudeGeometry(sh, { depth: W + 1.2, bevelEnabled: false });
  rg.translate(0, 0, -(W + 1.2) / 2);
  rg.rotateY(Math.PI / 2);
  const rm = new THREE.Mesh(rg, tmat('shingle', roof, 1.3, 1.3));
  rm.position.y = H + 0.25;
  rm.castShadow = rm.receiveShadow = true;
  g.add(rm);
  const gs = new THREE.Shape();
  gs.moveTo(-D / 2, 0);
  gs.lineTo(0, RH - 0.4);
  gs.lineTo(D / 2, 0);
  gs.closePath();
  for (const sx of [-1, 1]) {
    const gm = new THREE.Mesh(new THREE.ShapeGeometry(gs), mat(col, { side: THREE.DoubleSide }));
    gm.rotation.y = (sx * Math.PI) / 2;
    gm.position.set(sx * (W / 2 + 0.01), H + 0.25, 0);
    g.add(gm);
  }
  if (r() < 0.6) g.add(box(1.4, 3, 1.4, tmat('brick', '#b5553f', 1.4, 3), W * 0.28, H + RH * 0.45, -1.5));
  const win = night
    ? mat('#ffd36b', { emissive: '#ffb84a', emissiveIntensity: 1.4 })
    : mat('#8fc9f2', { roughness: 0.08, metalness: 0.35 });
  const windowAt = (wx, wy) => {
    g.add(box(2.8, 2.8, 0.25, '#ffffff', wx, wy - 0.25, D / 2));
    g.add(box(2.3, 2.3, 0.3, win, wx, wy - 0.02, D / 2 + 0.02));
    g.add(box(0.14, 2.3, 0.36, '#ffffff', wx, wy - 0.02, D / 2 + 0.03));
    g.add(box(2.3, 0.14, 0.36, '#ffffff', wx, wy + 1.06, D / 2 + 0.03));
    g.add(box(3.1, 0.22, 0.6, '#ffffff', wx, wy - 0.45, D / 2 + 0.2));
    for (const sx of [-1, 1]) g.add(box(0.8, 2.8, 0.15, shade(roof, 0.9), wx + sx * 1.9, wy - 0.25, D / 2 + 0.05));
  };
  const dx = -W * 0.18;
  g.add(box(2.8, 5, 0.3, '#ffffff', dx, 0.55, D / 2));
  g.add(box(2.3, 4.7, 0.35, ['#2e7d5b', '#7a4a2e', '#c0392b', '#2c5aa0'][Math.floor(r() * 4)], dx, 0.55, D / 2 + 0.02));
  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 10, 8),
    mat('#ffd54a', { metalness: 0.8, roughness: 0.3 }),
  );
  knob.position.set(dx + 0.75, 2.9, D / 2 + 0.3);
  g.add(knob);
  g.add(box(4, 0.35, 2, '#d8d8d8', dx, 0, D / 2 + 1));
  g.add(box(4, 0.35, 1.2, '#d8d8d8', dx, 0.35, D / 2 + 0.6)); // steps
  g.add(box(4.4, 0.25, 2.4, '#ffffff', dx, 5.7, D / 2 + 1));
  for (const sx of [-1, 1]) g.add(box(0.3, 5.7, 0.3, '#ffffff', dx + sx * 1.9, 0, D / 2 + 2)); // porch roof
  [W * 0.2, W * 0.2 + 3.6].forEach((wx) => {
    if (wx < W / 2 - 1.6) windowAt(wx, 2.6);
  });
  if (H > 8) {
    windowAt(dx, H - 2.4);
    windowAt(W * 0.25, H - 2.4);
  }
  return g;
}
export function building(x, z, w, h, d, col, night, label) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.add(box(w, h, d, tmat(col === '#d9604c' ? 'brick' : 'plaster', col, w, h), 0, 0, 0));
  const win = night
    ? mat('#ffd36b', { emissive: '#ffb84a', emissiveIntensity: 1.2 })
    : mat('#7fc8ff', { roughness: 0.1, metalness: 0.3 });
  for (let yy = 3; yy < h - 2; yy += 3.2)
    for (let xx = -w / 2 + 1.6; xx < w / 2 - 1; xx += 2.6) g.add(box(1.7, 2.2, 0.2, win, xx, yy, d / 2));
  if (label) {
    const s = sign(label, w * 0.8, (w * 0.8) / 6, { bg: '#ffffff', fg: '#222' });
    s.position.set(0, Math.min(h - 1.5, 7), d / 2 + 0.25);
    g.add(s);
  }
  return g;
}
export function car(x, z, rot, col) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  g.add(box(9, 2, 4, col, 0, 0.7, 0, 0.4));
  g.add(box(5, 1.8, 3.6, col, -0.4, 2.5, 0, 0.4));
  g.add(box(4.6, 1.4, 3.7, mat('#20304a', { roughness: 0.1 }), -0.4, 2.7, 0));
  [
    [-2.8, 1.9],
    [2.8, 1.9],
    [-2.8, -1.9],
    [2.8, -1.9],
  ].forEach(([a, b]) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.6, 16), mat('#1c1c1c'));
    w.rotation.x = Math.PI / 2;
    w.position.set(a, 0.9, b);
    w.castShadow = true;
    g.add(w);
  });
  return g;
}
function bush(g, x, z, r) {
  for (let k = 0; k < 3; k++) {
    const m = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1 + r() * 0.4, 1),
      mat(['#3f9a42', '#4caf50', '#5cb85c'][k]),
    );
    m.position.set(x + (k - 1) * 1.2, 0.8, z + r() * 0.3);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
}
function mailbox(g, x, z) {
  g.add(box(0.25, 3, 0.25, '#6b4a2e', x, 0, z));
  g.add(box(1, 0.9, 1.6, '#2f6fd6', x, 3, z, 0.3));
  g.add(box(0.08, 0.6, 0.3, '#e53935', x + 0.55, 3.4, z + 0.3));
}
function flowers(g, x, z, r) {
  g.add(box(5, 0.4, 1.4, '#6b4a2e', x, 0, z));
  for (let i = 0; i < 9; i++) {
    const f = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 6, 5),
      mat(['#ff6b8b', '#ffd23f', '#ffffff', '#b28dff'][i % 4]),
    );
    f.position.set(x - 2.2 + i * 0.55, 0.65, z + (r() - 0.5) * 0.8);
    g.add(f);
  }
}
const KIND = {
  '#7cc96b': 'grass',
  '#78c25a': 'grass',
  '#5a9a45': 'grass',
  '#2c4a2a': 'grass',
  '#c9ccd3': 'tiles',
  '#d5d8de': 'tiles',
  '#d9dde3': 'tiles',
  '#4a4e57': 'asphalt',
  '#3e424b': 'asphalt',
  '#9aa0aa': 'tiles',
  '#e6e6e6': 'tiles',
  '#c48a57': 'wood',
  '#b07a4f': 'wood',
  '#9b6b45': 'wood',
  '#c98f5a': 'wood',
  '#d9c27e': 'plaster',
};
const ground = (w, d, c, x = 0, z = 0, y = 0) => {
  const kd = KIND[c];
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), kd ? tmat(kd, c, w, d) : mat(c));
  m.position.set(x, y - 0.1, z);
  m.receiveShadow = true;
  return m;
};
function fence(g, x0, x1, z, c = '#ffffff') {
  for (let x = x0; x <= x1; x += 1.4) g.add(box(0.3, 2.2, 0.3, c, x, 0, z));
  g.add(box(x1 - x0, 0.3, 0.2, c, (x0 + x1) / 2, 1.5, z));
  g.add(box(x1 - x0, 0.3, 0.2, c, (x0 + x1) / 2, 0.7, z));
}

// ---- interiors ----
function room(
  g,
  { w = 34, d = 28, h = 13, wall = '#f3e6d0', floor = '#c98f5a', trim = '#ffffff', window: win = true, night },
) {
  g.add(ground(w, d, floor));
  const wm = tmat('plaster', wall, w, h, { side: THREE.BackSide, roughness: 0.9 });
  const shell = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wm);
  shell.position.y = h / 2;
  shell.receiveShadow = true;
  shell.userData.noOcclude = true;
  g.add(shell); // backside = see-through from outside
  g.add(box(w, 0.6, 0.3, trim, 0, 0, -d / 2 + 0.2));
  if (win) {
    const sky = night
      ? mat('#1a2550', { emissive: '#1a2550', emissiveIntensity: 0.6 })
      : mat('#9fd9ff', { emissive: '#bfe6ff', emissiveIntensity: 0.6 });
    g.add(box(7, 5.5, 0.2, trim, w * 0.22, 4, -d / 2 + 0.1));
    g.add(box(6.2, 4.7, 0.25, sky, w * 0.22, 4.4, -d / 2 + 0.15));
    g.add(box(0.25, 4.7, 0.3, trim, w * 0.22, 4.4, -d / 2 + 0.2));
  }
  return { w, d, h };
}
function bed(g, x, z, c = '#4f7cff') {
  g.add(box(5, 1.6, 9, '#8a5a3a', x, 0, z));
  g.add(box(4.8, 0.8, 8.6, '#ffffff', x, 1.6, z));
  g.add(box(4.9, 0.5, 5.6, c, x, 2.3, z + 1.4));
  g.add(box(3.4, 0.7, 1.6, '#ffffff', x, 2.4, z - 3.2, 0.3));
  g.add(box(5, 4, 0.5, '#8a5a3a', x, 0, z - 4.5));
}
function desk(g, x, z, rot = 0, pc = true) {
  const d = new THREE.Group();
  d.position.set(x, 0, z);
  d.rotation.y = rot;
  d.add(box(6, 0.3, 3, '#a8784e', 0, 3, 0));
  [
    [-2.7, -1.2],
    [2.7, -1.2],
    [-2.7, 1.2],
    [2.7, 1.2],
  ].forEach(([a, b]) => d.add(box(0.3, 3, 0.3, '#7a5236', a, 0, b)));
  if (pc) {
    d.add(box(3, 2, 0.2, '#1d1d24', 0, 3.5, -0.9));
    d.add(box(2.7, 1.7, 0.05, mat('#3fa9ff', { emissive: '#3fa9ff', emissiveIntensity: 0.8 }), 0, 3.65, -0.78));
    d.add(box(2, 0.1, 0.8, '#ddd', 0, 3.3, 0.3));
  }
  g.add(d);
  return d;
}
function chair(g, x, z, rot = 0, c = '#d84a4a') {
  const d = new THREE.Group();
  d.position.set(x, 0, z);
  d.rotation.y = rot;
  d.add(box(2.4, 0.3, 2.4, c, 0, 1.9, 0));
  d.add(box(2.4, 2.6, 0.3, c, 0, 2.2, -1.05));
  [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ].forEach(([a, b]) => d.add(box(0.2, 1.9, 0.2, '#555', a, 0, b)));
  g.add(d);
}
function sofa(g, x, z, c = '#5b6ee1') {
  g.add(box(10, 1.9, 4, c, x, 0, z, 0.3));
  g.add(box(10, 3.5, 1.2, c, x, 0, z - 1.8, 0.3));
  g.add(box(1.2, 2.8, 4, c, x - 5, 0, z, 0.3));
  g.add(box(1.2, 2.8, 4, c, x + 5, 0, z, 0.3));
}
function rug(g, x, z, w, d, c) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.06, 32), mat(c));
  m.scale.set(w, 1, d);
  m.position.set(x, 0.03, z);
  m.receiveShadow = true;
  g.add(m);
}

// ---- set builders ----
const SETS = {
  street(g, o, r) {
    g.add(ground(400, 400, '#7cc96b'));
    g.add(ground(400, 10, '#c9ccd3', 0, -1, 0.02)); // sidewalk
    g.add(ground(400, 12, '#4a4e57', 0, 10, 0.01)); // road
    for (let x = -190; x < 190; x += 8) g.add(box(4, 0.03, 0.4, '#ffffff', x, 0.01, 10));
    g.add(ground(400, 6, '#c9ccd3', 0, 19, 0.02));
    for (let i = -5; i <= 5; i++) {
      g.add(house(i * 20 + r() * 3, -15, 0, r, o.night));
      g.add(house(i * 20 + 10, 32, Math.PI, r, o.night));
      fence(g, i * 20 - 7, i * 20 + 4, -7.5);
    }
    for (let i = -5; i <= 5; i++) {
      g.add(tree(i * 20 + 9, -9 - r() * 2, 0.9 + r() * 0.3, r));
      g.add(lamp(i * 24 + 6, 3.4, o.night));
    }
    g.add(car(-14, 13, 0, PAL.car[Math.floor(r() * 6)]));
    g.add(car(26, 7, Math.PI, PAL.car[Math.floor(r() * 6)]));
    for (let i = -5; i <= 5; i++) {
      const x = i * 20;
      bush(g, x - 4, -8.6, r);
      bush(g, x + 2, -8.8, r);
      mailbox(g, x + 5.5, -5.2);
      flowers(g, x - 2, -10, r);
    }
  },
  school(g, o, r) {
    g.add(ground(400, 400, '#7cc96b'));
    g.add(ground(400, 10, '#c9ccd3', 0, -1, 0.02));
    g.add(ground(400, 12, '#4a4e57', 0, 10, 0.01));
    for (let x = -190; x < 190; x += 8) g.add(box(4, 0.03, 0.4, '#ffffff', x, 0.01, 10));
    g.add(ground(14, 14, '#d9dde3', 0, -12, 0.03));
    const b = building(0, -28, 46, 16, 16, '#d9604c', o.night);
    g.add(b);
    g.add(box(48, 1.2, 17, '#f4efe6', 0, 16, -28));
    const s = sign(o.label || 'SCHOOL', 16, 3, { bg: '#ffffff', fg: '#1e3a8a' });
    s.position.set(0, 12.5, -19.7);
    g.add(s);
    g.add(box(10, 7, 0.4, '#5a3a22', 0, 0, -19.9));
    g.add(box(14, 0.5, 4, '#cfd3da', 0, 0, -18));
    g.add(box(14, 0.5, 2, '#cfd3da', 0, 0.5, -19));
    g.add(box(0.4, 18, 0.4, '#d0d0d0', 14, 0, -14));
    const fl = box(4, 2.5, 0.1, '#3d6ee8', 16, 15, -14);
    g.add(fl);
    for (const x of [-30, -18, 18, 30]) g.add(tree(x, -15, 1.1, r));
    const bus = car(-26, 6, 0, '#ffc61a');
    bus.scale.set(1.7, 1.25, 1.1);
    g.add(bus);
    [
      [9, -8],
      [-9, -8],
    ].forEach(([x, z]) => {
      g.add(box(6, 0.4, 2, '#a0643a', x, 1.8, z));
      g.add(box(6, 2, 0.3, '#a0643a', x, 2.2, z - 0.9));
      g.add(box(0.3, 1.8, 1.8, '#444', x - 2.6, 0, z));
      g.add(box(0.3, 1.8, 1.8, '#444', x + 2.6, 0, z));
    });
    for (let i = -5; i <= 5; i++) g.add(lamp(i * 24 + 6, 3.4, o.night));
  },
  city(g, o, r) {
    g.add(ground(400, 400, '#9aa0aa'));
    g.add(ground(400, 10, '#d5d8de', 0, -1, 0.02));
    g.add(ground(400, 16, '#3e424b', 0, 12, 0.01));
    for (let x = -190; x < 190; x += 8) g.add(box(4, 0.03, 0.4, '#ffd54a', x, 0.01, 12));
    const cols = ['#7fb3e0', '#e9e4da', '#c7d6e6', '#f2c38b', '#a6b4c8', '#e8a5a5', '#b9e0d0'];
    for (let i = -6; i <= 6; i++) {
      const w = 14 + r() * 6,
        h = 18 + r() * 40;
      g.add(
        building(
          i * 22,
          -17 - r() * 4,
          w,
          h,
          12,
          cols[Math.floor(r() * cols.length)],
          o.night,
          i === 0 ? o.label : null,
        ),
      );
      g.add(building(i * 22 + 11, 38, w, h * 0.8, 12, cols[Math.floor(r() * cols.length)], o.night));
    }
    for (let i = -6; i <= 6; i++) {
      g.add(lamp(i * 22 + 8, 3.4, o.night));
      if (i % 2) g.add(tree(i * 22 - 4, 2.5, 0.6, r));
    }
    g.add(car(-10, 15, 0, PAL.car[Math.floor(r() * 6)]));
    g.add(car(18, 9, Math.PI, PAL.car[Math.floor(r() * 6)]));
  },
  park(g, o, r) {
    g.add(ground(400, 400, '#78c25a'));
    const path = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.05, 48), mat('#e6d3a3'));
    path.scale.set(30, 1, 8);
    path.position.y = 0.02;
    path.receiveShadow = true;
    g.add(path);
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2,
        d = 22 + r() * 60;
      g.add(tree(Math.cos(a) * d, Math.sin(a) * d - 10, 0.8 + r() * 0.6, r));
    }
    const pond = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 0.1, 40),
      mat('#4fb4e8', { roughness: 0.1, metalness: 0.2 }),
    );
    pond.scale.set(10, 1, 6);
    pond.position.set(-22, 0.05, -14);
    g.add(pond);
    [
      [8, -6],
      [-8, -6],
    ].forEach(([x, z]) => {
      g.add(box(6, 0.4, 2, '#a0643a', x, 1.8, z));
      g.add(box(6, 2, 0.3, '#a0643a', x, 2.2, z - 0.9));
      g.add(box(0.3, 1.8, 1.8, '#444', x - 2.6, 0, z));
      g.add(box(0.3, 1.8, 1.8, '#444', x + 2.6, 0, z));
    });
    for (let i = 0; i < 40; i++) {
      const f = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 6, 5),
        mat(['#ff6b8b', '#ffd23f', '#ffffff', '#b28dff'][i % 4]),
      );
      f.position.set((r() - 0.5) * 60, 0.25, (r() - 0.5) * 40 - 5);
      g.add(f);
    }
    g.add(lamp(14, -3, o.night));
    g.add(lamp(-14, -3, o.night));
    // playground: slide + swings
    const pg = new THREE.Group();
    pg.position.set(18, 0, -14);
    pg.add(box(4, 6, 4, '#3ec1ff', 0, 0, 0, 0.2));
    const sl = box(2.4, 0.4, 9, '#ffd23f', 0, 2.6, 5, 0.15);
    sl.rotation.x = 0.55;
    pg.add(sl);
    g.add(pg);
    const sw = new THREE.Group();
    sw.position.set(-16, 0, -2);
    sw.add(box(0.4, 8, 0.4, '#e53935', -4, 0, 0));
    sw.add(box(0.4, 8, 0.4, '#e53935', 4, 0, 0));
    sw.add(box(8.4, 0.4, 0.4, '#e53935', 0, 8, 0));
    for (const x of [-2, 2]) {
      sw.add(box(0.08, 5.6, 0.08, '#555', x - 0.7, 2.4, 0));
      sw.add(box(0.08, 5.6, 0.08, '#555', x + 0.7, 2.4, 0));
      sw.add(box(1.8, 0.2, 0.8, '#333', x, 2.3, 0));
    }
    g.add(sw);
  },
  bedroom(g, o) {
    const R = room(g, { wall: o.wall || '#cfe3ff', floor: '#c48a57', night: o.night });
    bed(g, -10, -7, o.accent || '#ff6b6b');
    desk(g, 9, -11.5);
    chair(g, 9, -8.5, Math.PI);
    rug(g, 0, 2, 7, 4, '#ffd166');
    g.add(box(6, 9.5, 0.4, '#8a5a3a', -3, 0, -R.d / 2 + 0.3)); // door
    const p = sign(o.poster || 'GAME ON', 5, 3.4, { bg: '#2a2a3a', fg: '#ffd23f' });
    p.position.set(-1, 7.5, -R.d / 2 + 0.6);
    g.add(p);
    g.add(box(4, 7, 2.5, '#a8784e', 14, 0, -4)); // dresser
  },
  livingroom(g, o) {
    const R = room(g, { wall: o.wall || '#f4e3c8', floor: '#b07a4f', night: o.night });
    sofa(g, 0, -9, o.accent || '#5b6ee1');
    rug(g, 0, -2, 9, 5, '#e8d5b0');
    g.add(box(4, 0.6, 2.5, '#7a5236', 0, 1.2, -2));
    g.add(box(0.3, 1.2, 2, '#7a5236', -1.6, 0, -2));
    g.add(box(0.3, 1.2, 2, '#7a5236', 1.6, 0, -2));
    g.add(box(4, 1.2, 9, '#ffffff', 15, 0, -6));
    g.add(box(0.4, 9, 7, '#e9e9e9', 16.6, 0, -6)); // counter / fridge-ish
    g.add(box(1.6, 6, 1.6, '#3a3a44', -14, 0, -11));
    g.add(box(2.4, 1.6, 2.4, '#fff3c4', -14, 6, -11, 0, { emissive: '#ffd27a', emissiveIntensity: 0.8 }));
    const tv = box(8, 4.5, 0.4, '#111', 0, 5, -R.d / 2 + 0.5);
    g.add(tv);
    g.add(box(7.4, 4, 0.1, mat('#1d6fd8', { emissive: '#3d8ff8', emissiveIntensity: 0.5 }), 0, 5.25, -R.d / 2 + 0.75));
  },
  classroom(g, o) {
    const R = room(g, { w: 40, d: 32, wall: o.wall || '#fff2c9', floor: '#9b6b45', night: o.night });
    g.add(box(18, 7, 0.3, '#2f5d3a', 0, 3, -R.d / 2 + 0.3));
    g.add(box(19, 0.4, 1, '#8a5a3a', 0, 2.8, -R.d / 2 + 0.6));
    const t = sign(o.board || 'MATH  2 + 2 = ?', 15, 4, { bg: '#2f5d3a', fg: '#ffffff', font: 'Fredoka' });
    t.position.set(0, 7, -R.d / 2 + 0.5);
    g.add(t);
    desk(g, -12, -10, 0, false);
    for (let i = -1; i <= 1; i++)
      for (let j = 0; j < 2; j++) {
        desk(g, i * 10, 2 + j * 9, 0, false);
        chair(g, i * 10, 4.5 + j * 9, Math.PI, ['#e74c3c', '#3498db', '#2ecc71'][i + 1]);
      }
  },
  skyrealm(g, o, r) {
    // a sea of soft clouds with floating islands, light shafts and a pastel horizon; the floor is a flat cloud (y=0)
    const cloud = (x, y, z, rad, sy, col) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(rad, 18, 12),
        mat(col, { roughness: 1, emissive: '#ffe6f2', emissiveIntensity: 0.2 }),
      );
      m.position.set(x, y, z);
      m.scale.y = sy;
      m.receiveShadow = true;
      g.add(m);
      return m;
    };
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(330, 330, 0.5, 48),
      mat(o.floor || '#e9d8f4', { roughness: 1, emissive: '#e8d4f0', emissiveIntensity: 0.1 }),
    );
    floor.position.y = -1.15;
    floor.receiveShadow = true;
    floor.userData.noOcclude = true;
    floor.userData.isGround = true;
    g.add(floor);
    const tints = ['#ffffff', '#fff0f6', '#e6f2ff', '#fff6e6', '#efe8ff'];
    for (let i = 0; i < 190; i++) {
      const a = r() * Math.PI * 2,
        d = 26 + Math.pow(r(), 0.7) * 250,
        rad = 5 + r() * 14;
      const m = cloud(Math.cos(a) * d, -rad * 0.25 + r() * 2, Math.sin(a) * d, rad, 0.35 + r() * 0.35, tints[i % 5]);
      m.userData.noOcclude = true;
    }
    for (let i = 0; i < 16; i++) {
      const a = r() * Math.PI * 2,
        d = 12 + r() * 20;
      cloud(Math.cos(a) * d, -0.6, Math.sin(a) * d - 4, 2 + r() * 2.4, 0.3, tints[i % 5]).userData.noOcclude = true;
    } // low puffs around the action
    // floating islands: grass cap, lilac rock, blossom tree, glowing crystal
    for (let i = 0; i < 7; i++) {
      const a = -2.6 + i * 0.85 + r() * 0.3,
        d = 60 + r() * 90,
        Rr = 6 + r() * 8;
      const isl = new THREE.Group();
      isl.userData.noOcclude = true;
      isl.position.set(Math.cos(a) * d, 8 + r() * 26, -Math.abs(Math.sin(a)) * d - 20);
      const rk = new THREE.Mesh(
        new THREE.ConeGeometry(Rr, Rr * 1.2, 8),
        mat('#c5b4ea', { flatShading: true, emissive: '#b8a4e6', emissiveIntensity: 0.15 }),
      );
      rk.rotation.x = Math.PI;
      rk.position.y = -0.8 - Rr * 0.6;
      isl.add(rk);
      const cp = new THREE.Mesh(
        new THREE.CylinderGeometry(Rr, Rr * 0.97, 0.8, 20),
        mat('#b9efab', { emissive: '#d6ffc4', emissiveIntensity: 0.15 }),
      );
      cp.position.y = -0.4;
      isl.add(cp);
      isl.add(box(0.5, 3, 0.5, '#9a6a4a', Rr * 0.2, 0, 0));
      const bl = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.9, 1),
        mat('#ffb7d5', { emissive: '#ffb7d5', emissiveIntensity: 0.15 }),
      );
      bl.position.set(Rr * 0.2, 3.8, 0);
      isl.add(bl);
      const cr = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.6, 0),
        new THREE.MeshStandardMaterial({ color: '#aeeaff', emissive: '#7fdcff', emissiveIntensity: 1.3 }),
      );
      cr.scale.y = 1.8;
      cr.position.set(-Rr * 0.4, 0.8, Rr * 0.2);
      isl.add(cr);
      g.add(isl);
    }
    // soft god-rays (additive, no depth write)
    const rayTex = (() => {
      const cv = document.createElement('canvas');
      cv.width = 64;
      cv.height = 256;
      const c = cv.getContext('2d');
      const gr = c.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, 'rgba(255,244,214,.0)');
      gr.addColorStop(0.25, 'rgba(255,244,214,.55)');
      gr.addColorStop(1, 'rgba(255,236,214,0)');
      c.fillStyle = gr;
      c.fillRect(0, 0, 64, 256);
      const hg = c.createLinearGradient(0, 0, 64, 0);
      hg.addColorStop(0, 'rgba(0,0,0,1)');
      hg.addColorStop(0.5, 'rgba(0,0,0,0)');
      hg.addColorStop(1, 'rgba(0,0,0,1)');
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = hg;
      c.fillRect(0, 0, 64, 256);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    if (o.rays !== false)
      for (let i = 0; i < 5; i++)
        for (const rot of [0, Math.PI / 2]) {
          const rp = new THREE.Mesh(
            new THREE.PlaneGeometry(10 + r() * 8, 90),
            new THREE.MeshBasicMaterial({
              map: rayTex,
              transparent: true,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
              opacity: 0.22 + r() * 0.12,
              fog: false,
              side: THREE.DoubleSide,
            }),
          );
          rp.position.set(-70 + i * 40 + r() * 10, 40, -60 - r() * 50);
          rp.rotation.set(0, rot, 0.22);
          rp.userData.noOcclude = true;
          rp.userData.noAO = true;
          rp.renderOrder = 2;
          g.add(rp);
        }
  },
  studio(g, o) {
    // clean void for dramatic shots
    const c = o.color || '#ffd1e8';
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(120, 32, 16),
      new THREE.MeshBasicMaterial({ color: c, side: THREE.BackSide }),
    );
    g.add(m);
    g.add(ground(400, 400, o.floor || c));
  },
  store(g, o, r) {
    const R = room(g, { w: 40, d: 30, wall: '#e9f6ff', floor: '#e6e6e6', window: false, night: o.night });
    for (let i = -1; i <= 1; i++) {
      const sx = i * 11;
      g.add(box(7, 6, 2.5, '#ffffff', sx, 0, -8));
      for (let k = 0; k < 3; k++)
        for (let j = 0; j < 6; j++)
          g.add(box(0.9, 1.2, 0.9, PAL.car[(i + j + k + 3) % 6], sx - 2.7 + j * 1.1, 0.4 + k * 2, -7));
    }
    g.add(box(10, 3.4, 3, '#ff7a59', 12, 0, 6));
    const s = sign(o.label || 'SUPER MART', 18, 3, { bg: '#ff7a59', fg: '#fff' });
    s.position.set(0, 10, -R.d / 2 + 0.3);
    g.add(s);
  },
  forest(g, o, r) {
    g.add(ground(400, 400, o.night ? '#2c4a2a' : '#5a9a45'));
    for (let i = 0; i < 70; i++) {
      const x = (r() - 0.5) * 140,
        z = -10 - r() * 90;
      if (Math.abs(x) < 6 && z > -20) continue;
      g.add(tree(x, z, 1 + r() * 0.8, r));
    }
    for (let i = 0; i < 20; i++) {
      const x = (r() - 0.5) * 140,
        z = 12 + r() * 60;
      g.add(tree(x, z, 1 + r() * 0.8, r));
    }
    const tent = new THREE.Mesh(new THREE.ConeGeometry(4, 5, 4), mat('#e8833a'));
    tent.position.set(-10, 2.5, -6);
    tent.rotation.y = Math.PI / 4;
    tent.castShadow = true;
    g.add(tent);
    if (o.campfire !== false) {
      g.add(box(2, 0.5, 2, '#5a3a22', 6, 0, 2));
      const f = new THREE.Mesh(
        new THREE.ConeGeometry(0.8, 1.8, 6),
        mat('#ffb02e', { emissive: '#ff7a00', emissiveIntensity: 2 }),
      );
      f.position.set(6, 1.4, 2);
      g.add(f);
      const l = new THREE.PointLight('#ff9a3a', o.night ? 80 : 10, 30, 1.5);
      l.position.set(6, 3, 2);
      g.add(l);
    }
  },
  dock(g, o, r) {
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      mat(o.night ? '#16324f' : '#3d9ad1', { roughness: 0.15, metalness: 0.3 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = -1;
    g.add(water);
    g.add(box(10, 0.6, 60, '#9a6b42', 0, -0.6, -20));
    for (let z = 8; z > -50; z -= 6) {
      g.add(box(0.6, 3, 0.6, '#6b4a2e', -5, -2, z));
      g.add(box(0.6, 3, 0.6, '#6b4a2e', 5, -2, z));
    }
    g.add(ground(200, 60, '#d9c27e', 0, 40));
    const lh = new THREE.Group();
    lh.position.set(-30, 0, -70);
    lh.add(box(5, 22, 5, '#ffffff', 0, -1, 0));
    lh.add(box(5.2, 3, 5.2, '#e53935', 0, 8, 0));
    lh.add(box(4, 3, 4, mat('#fff7b0', { emissive: '#ffe066', emissiveIntensity: o.night ? 3 : 0.5 }), 0, 21, 0));
    g.add(lh);
  },
};
Object.assign(SETS, WORLDS);
export const SET_NAMES = Object.keys(SETS);

export function buildSet(name, opts = {}, seed = 7) {
  const g = new THREE.Group();
  const fn = SETS[name] || SETS.street;
  fn(g, opts, rng(seed));
  return g;
}
export const INTERIOR = new Set(['bedroom', 'livingroom', 'classroom', 'store', ...WORLD_INTERIOR]);
