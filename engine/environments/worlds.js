// Big cinematic procedural WORLDS (same signature as SETS in sets.js: fn(g, o, r)). Static, deterministic (seeded r), merged geometry.
// Registered into SETS by sets.js. No import from sets.js on purpose (avoids a cycle).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pbrMat } from './pbr.js';
const T = THREE;
export const WORLDS = {};
export const WORLD_INTERIOR = ['tunnel'];

// ---- helpers ----
const MC = {};
const mt = (c, o = {}) =>
  MC[c + JSON.stringify(o)] ||
  (MC[c + JSON.stringify(o)] = new T.MeshStandardMaterial({ color: c, roughness: 0.85, ...o }));
const _M = new T.Matrix4(),
  _Q = new T.Quaternion(),
  _E = new T.Euler(),
  _P = new T.Vector3(),
  _S = new T.Vector3(),
  _C = new T.Color();
const nu = (g, up) => {
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  if (up) g.translate(0, 0.5, 0);
  return g;
};
const GC = {};
const prim = (k, f) => GC[k] || (GC[k] = f());
const P = {
  box: () => prim('box', () => nu(new T.BoxGeometry(1, 1, 1), 1)),
  cyl: (seg, rt, rb) => prim(`c${seg}_${rt}_${rb}`, () => nu(new T.CylinderGeometry(rt, rb, 1, seg), 1)),
  ico: (d = 0) => prim('i' + d, () => nu(new T.IcosahedronGeometry(1, d))),
  dome: () => prim('dome', () => nu(new T.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2))),
  arc: () => prim('arc', () => nu(new T.TorusGeometry(1, 0.08, 6, 28, Math.PI))),
  tor: () => prim('tor', () => nu(new T.TorusGeometry(1, 0.15, 6, 14))),
  prism: () =>
    prim('prism', () => {
      const s = new T.Shape();
      s.moveTo(-0.5, 0);
      s.lineTo(0, 1);
      s.lineTo(0.5, 0);
      s.closePath();
      const g = new T.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
      g.translate(0, 0, -0.5);
      g.rotateY(Math.PI / 2);
      return nu(g);
    }),
};
function batch(r, jit = 0) {
  // vertex-coloured merged mesh builder; y of box/cyl/cone = bottom
  const parts = [];
  let PM = null;
  const b = {
    xf(x, y, z, ry = 0) {
      PM = x === undefined ? null : new T.Matrix4().makeRotationY(ry).setPosition(x, y, z);
      return b;
    },
    add(geo, c, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) {
      _E.set(rx, ry, rz);
      _Q.setFromEuler(_E);
      _M.compose(_P.set(x, y, z), _Q, _S.set(sx, sy, sz));
      if (PM) _M.premultiply(PM);
      const g = geo.clone().applyMatrix4(_M),
        n = g.attributes.position.count,
        a = new Float32Array(n * 3);
      _C.set(c);
      if (jit && r) _C.multiplyScalar(1 + (r() - 0.5) * jit);
      for (let i = 0; i < n; i++) {
        a[i * 3] = _C.r;
        a[i * 3 + 1] = _C.g;
        a[i * 3 + 2] = _C.b;
      }
      g.setAttribute('color', new T.BufferAttribute(a, 3));
      parts.push(g);
      return b;
    },
    box(w, h, d, c, x, y, z, ry, rx, rz) {
      return b.add(P.box(), c, x, y, z, w, h, d, ry, rx, rz);
    },
    cyl(rb, rt, h, seg, c, x, y, z, ry, rx, rz) {
      const m = Math.max(rb, rt, 0.001);
      return b.add(P.cyl(seg, +(rt / m).toFixed(3), +(rb / m).toFixed(3)), c, x, y, z, m, h, m, ry, rx, rz);
    },
    cone(r, h, seg, c, x, y, z, ry, rx, rz) {
      return b.cyl(r, 0, h, seg, c, x, y, z, ry, rx, rz);
    },
    ico(r, c, x, y, z, sx = 1, sy = 1, sz = 1, d = 0, ry = 0) {
      return b.add(P.ico(d), c, x, y, z, r * sx, r * sy, r * sz, ry);
    },
    dome(r, c, x, y, z, sy = 1) {
      return b.add(P.dome(), c, x, y, z, r, r * sy, r);
    },
    arc(R, tube, c, x, y, z, ry = 0) {
      return b.add(P.arc(), c, x, y, z, R, R, tube / 0.08, ry);
    },
    tor(R, tube, c, x, y, z, ry = 0, rx = 0, rz = 0) {
      return b.add(P.tor(), c, x, y, z, R, R, tube / 0.15, ry, rx, rz);
    },
    prism(w, h, d, c, x, y, z, ry) {
      return b.add(P.prism(), c, x, y, z, w, h, d, ry);
    }, // ridge along x, gable faces z
    mesh(o = {}) {
      return parts.length
        ? new T.Mesh(mergeGeometries(parts), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, ...o }))
        : null;
    },
    mirror(k = 0.7, o = {}) {
      const gs = parts.map((p) => {
        const g = p.clone();
        g.scale(1, -1, 1);
        const c = g.attributes.color;
        for (let i = 0; i < c.array.length; i++) c.array[i] *= k;
        return g;
      });
      return new T.Mesh(mergeGeometries(gs), new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide, ...o }));
    },
  };
  return b;
}
const put = (g, m, o = {}) => {
  if (!m) return null;
  m.castShadow = o.cs !== false;
  m.receiveShadow = o.rs !== false;
  if (o.far) m.userData.noOcclude = true;
  g.add(m);
  return m;
};
const plane = (g, w, d, m, x = 0, y = 0, z = 0, ry = 0, gr = false) => {
  const p = new T.Mesh(new T.PlaneGeometry(w, d), m);
  p.rotation.set(-Math.PI / 2, 0, ry);
  p.position.set(x, y, z);
  p.receiveShadow = true;
  p.userData.noOcclude = true;
  if (gr) p.userData.isGround = true;
  g.add(p);
  return p;
};
const disc = (g, rad, m, x = 0, y = 0, z = 0, sx = 1, sz = 1, seg = 48) => {
  const p = new T.Mesh(new T.CircleGeometry(rad, seg), m);
  p.rotation.x = -Math.PI / 2;
  p.scale.set(sx, sz, 1);
  p.position.set(x, y, z);
  p.receiveShadow = true;
  p.userData.noOcclude = true;
  g.add(p);
  return p;
};
const off = (m, f = -1) => {
  m.polygonOffset = true;
  m.polygonOffsetFactor = f;
  m.polygonOffsetUnits = f;
  return m;
};
const pick = (r, a) => a[Math.floor(r() * a.length)];
const canvasTex = (w, h, draw, rep) => {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new T.CanvasTexture(cv);
  t.colorSpace = T.SRGBColorSpace;
  if (rep) {
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rep[0], rep[1]);
    t.anisotropy = 8;
  }
  return t;
};
const rayTex = () =>
  canvasTex(64, 256, (c) => {
    const gr = c.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, 'rgba(255,244,214,0)');
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
  });
const glowTex = (col = '255,200,120') =>
  canvasTex(128, 128, (c) => {
    const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, `rgba(${col},1)`);
    gr.addColorStop(0.35, `rgba(${col},.45)`);
    gr.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = gr;
    c.fillRect(0, 0, 128, 128);
  });
const glowMat = (col, op = 1) =>
  new T.MeshBasicMaterial({
    map: glowTex(col),
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    opacity: op,
    fog: false,
  });
const mulberry = (a) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const addTick = (g, f) => (g.userData.ticks || (g.userData.ticks = [])).push(f);
const tileDraw = (c, w, h, fn) => {
  for (const dx of [-w, 0, w])
    for (const dy of [-h, 0, h]) {
      c.save();
      c.translate(dx, dy);
      fn();
      c.restore();
    }
};
const causticTex = (r, rep, col = '220,248,255', n = 26) => {
  const sh = [];
  for (let i = 0; i < n; i++) {
    const pts = [],
      cx = r() * 256,
      cy = r() * 256,
      rd = 12 + r() * 30,
      k = 6 + Math.floor(r() * 3);
    for (let j = 0; j < k; j++) {
      const a = (j / k) * 6.2832 + r() * 0.5,
        q = rd * (0.6 + r() * 0.7);
      pts.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q]);
    }
    sh.push({ pts, a: 0.25 + r() * 0.4, lw: 1 + r() * 2.2 });
  }
  return canvasTex(
    256,
    256,
    (c, w, h) => {
      c.lineJoin = 'round';
      tileDraw(c, w, h, () => {
        for (const s of sh) {
          c.strokeStyle = `rgba(${col},${s.a})`;
          c.lineWidth = s.lw;
          c.beginPath();
          s.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
          c.closePath();
          c.stroke();
        }
      });
    },
    rep,
  );
};
const glintTex = (r, rep, n = 14, col = '255,255,255') => {
  const gs = [];
  for (let i = 0; i < n; i++) gs.push([r() * 128, r() * 128, 2 + r() * 5, 0.5 + r() * 0.5]);
  return canvasTex(
    128,
    128,
    (c, w, h) =>
      tileDraw(c, w, h, () => {
        for (const [x, y, s, a] of gs) {
          const gr = c.createRadialGradient(x, y, 0, x, y, s * 1.6);
          gr.addColorStop(0, `rgba(${col},${a})`);
          gr.addColorStop(1, `rgba(${col},0)`);
          c.fillStyle = gr;
          c.fillRect(x - s * 2, y - s * 2, s * 4, s * 4);
          c.fillStyle = `rgba(${col},${a * 0.7})`;
          c.fillRect(x - s * 2.2, y - 0.5, s * 4.4, 1);
          c.fillRect(x - 0.5, y - s * 2.2, 1, s * 4.4);
        }
      }),
    rep,
  );
};
const addMat = (map, op) =>
  new T.MeshBasicMaterial({ map, transparent: true, opacity: op, depthWrite: false, blending: T.AdditiveBlending });
const rays = (g, r, n, area, y = 40, op = 0.22) => {
  const tex = rayTex();
  for (let i = 0; i < n; i++)
    for (const rot of [0, Math.PI / 2]) {
      const rp = new T.Mesh(
        new T.PlaneGeometry(10 + r() * 8, 90),
        new T.MeshBasicMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          blending: T.AdditiveBlending,
          opacity: op + r() * 0.1,
          fog: false,
          side: T.DoubleSide,
        }),
      );
      rp.position.set(area[0] + r() * area[2], y, area[1] + r() * area[3]);
      rp.rotation.set(0, rot, 0.22);
      rp.userData.noOcclude = true;
      rp.userData.noAO = true;
      rp.renderOrder = 2;
      g.add(rp);
    }
};
const smoothHills = (B, r, n, d0, d1, cols, zBias = 1) => {
  for (let i = 0; i < n; i++) {
    const a = (r() - 0.5) * Math.PI * 2 * (zBias ? 0.9 : 1.5) - Math.PI / 2,
      d = d0 + r() * (d1 - d0),
      rx = 50 + r() * 90,
      h = 18 + r() * 40;
    B.add(P.ico(2), pick(r, cols), Math.cos(a) * d, -h * 0.35, Math.sin(a) * d, rx, h, rx * (0.6 + r() * 0.5));
  }
};
const tree = (B, r, x, z, s, cols) => {
  const h = 5 * s;
  B.cyl(0.55 * s, 0.4 * s, h, 7, '#7a4a2a', x, 0, z);
  const c = pick(r, cols);
  for (const [a, b, d, q] of [
    [0, h + 1.2, 0, 2.6],
    [-1.5, h + 0.4, 0.4, 1.9],
    [1.4, h + 0.6, -0.3, 2],
    [0.2, h + 2.8, 0.2, 1.9],
  ])
    B.ico(q * s, c, x + a * s, b, z + d * s, 1, 0.9, 1, 1);
};
const lampPost = (B, G, x, z, ry, night, h = 11) => {
  B.xf(x, 0, z, ry);
  B.cyl(0.45, 0.3, h, 6, '#2e3340', 0, 0, 0);
  B.box(1.6, 0.5, 1.6, '#2e3340', 0, 0, 0);
  B.box(3, 0.3, 0.3, '#2e3340', 1.3, h - 0.3, 0);
  B.cyl(0.35, 0.5, 0.6, 6, '#2e3340', 2.6, h - 0.6, 0);
  G.box(1.1, 0.5, 1.1, night ? '#fff0b0' : '#fff4c8', 2.6, h - 1.1, 0);
  B.xf();
};

// ---- 1. town_square ----
const FACADE = [
    '#f2b84b',
    '#e8654f',
    '#5fb3d9',
    '#8fcf6a',
    '#f08fb0',
    '#b99be6',
    '#f7e3a0',
    '#ff9a5a',
    '#59c2b0',
    '#e9d7bb',
  ],
  ROOFS = ['#c0392b', '#2f5fa8', '#4b4f5e', '#8a4a2e', '#2e7d5b', '#a8472f'],
  AWN = ['#e53935', '#2f7fd6', '#f5b000', '#2e9e5b', '#8e44ad'];
function rowHouse(B, G, r, night, x, z, w, h, d, ry, shop) {
  // local front = +z, then rotated by ry about (x,z)
  B.xf(x, 0, z, ry);
  G.xf(x, 0, z, ry);
  const wall = pick(r, FACADE),
    roof = pick(r, ROOFS),
    trim = '#fdf6e8',
    glass = night ? '#ffd36b' : '#7fc4ee';
  B.box(w, h, d, wall, 0, 0, 0);
  B.box(w + 0.4, 1.2, d + 0.4, '#8d8a85', 0, 0, 0);
  B.box(w + 1, 0.8, d + 1, trim, 0, h - 0.4, 0); // plinth + cornice
  const rh = 5 + r() * 4;
  B.prism(w + 1.4, rh, d + 2, roof, 0, h + 0.3, 0);
  B.box(w * 0.5, 1, d * 0.5, roof, 0, h + 0.2, 0);
  if (r() < 0.6) B.box(1.8, rh * 0.9, 1.8, '#a5533f', (r() - 0.5) * w * 0.5, h + 1, -d * 0.25);
  const floors = Math.max(2, Math.round((h - 7) / 6.5) + 1),
    cols = Math.max(2, Math.floor(w / 4.6)),
    sp = w / cols;
  for (let f = shop ? 1 : 0; f < floors; f++)
    for (let c = 0; c < cols; c++) {
      const wx = -w / 2 + sp * (c + 0.5),
        wy = 7.2 + f * 6.2 - (shop ? 6.2 : 0) + (shop ? 0 : -5.2);
      if (wy + 3 > h - 1) continue;
      B.box(2.6, 3.8, 0.5, trim, wx, wy - 0.3, d / 2);
      G.box(1.9, 3.2, 0.6, glass, wx, wy, d / 2 + 0.05);
      B.box(0.2, 3.2, 0.7, trim, wx, wy, d / 2 + 0.08);
      B.box(1.9, 0.2, 0.7, trim, wx, wy + 1.5, d / 2 + 0.08);
      B.box(3.2, 0.4, 1, trim, wx, wy - 0.8, d / 2 + 0.3);
      if (r() < 0.4) B.box(2.6, 0.5, 0.6, pick(r, ['#e53935', '#f06292', '#ffd54f']), wx, wy - 0.5, d / 2 + 0.8);
    }
  if (shop) {
    const aw = pick(r, AWN),
      n = Math.floor(w / 2.2),
      sw = w / n;
    B.box(w - 1.5, 4.4, 0.5, '#2b2f3a', 0, 1.2, d / 2);
    G.box(w - 2.4, 3.6, 0.6, glass, 0, 1.5, d / 2 + 0.1);
    for (let i = 0; i < n; i++)
      B.box(sw, 0.4, 3.4, i % 2 ? '#fdfdfd' : aw, -w / 2 + sw * (i + 0.5), 6.3, d / 2 + 1.4, 0, 0.35);
    B.box(w - 4, 1.6, 0.5, '#3a2a20', 0, 6.7, d / 2 + 0.1);
  } else {
    B.box(3, 5.6, 0.5, '#6b4423', -w * 0.25, 0, d / 2);
    B.box(4, 0.4, 2, '#d6d3cc', -w * 0.25, 0, d / 2 + 1);
  }
  B.xf();
  G.xf();
}
WORLDS.town_square = function (g, o, r) {
  const night = o.night,
    clear = o.clear !== false,
    B = batch(r, 0.08),
    G = batch(r, 0),
    H = batch(r, 0.12);
  put(
    g,
    plane(g, 1400, 1400, pbrMat('grass', 1400, 1400, { fallback: '#6fbf4a', color: '#8fd06a' }), 0, -0.1, 0, 0, true),
    { cs: false },
  );
  const brick = pbrMat('brick_floor', 170, 190, {
    fallback: '#d98a4a',
    color: '#ffe6d0',
    roughness: 0.8,
    normalScale: 1.6,
  });
  plane(g, 170, 190, brick, 0, 0, -20, 0, true).userData.isGround = true;
  const inl = off(mt('#f4e3c0', { roughness: 0.7 }));
  {
    const rg = new T.Mesh(new T.RingGeometry(15.4, 17, 64), inl);
    rg.rotation.x = -Math.PI / 2;
    rg.position.y = 0.03;
    rg.receiveShadow = true;
    rg.userData.noOcclude = true;
    g.add(rg);
  } // a cream ring inlaid in the bricks (the paving stays visible inside it)
  for (const sx of [-1, 1]) plane(g, 5, 190, off(mt('#9b8f80')), sx * 87.5, 0.05, -20);
  plane(g, 170, 5, off(mt('#9b8f80')), 0, 0.05, -112.5);
  // row houses ring: left/right rows face the plaza, back row faces +z
  const rows = (side) => {
    let z = 62;
    while (z > -110) {
      const w = 14 + r() * 5,
        h = 16 + r() * 10;
      const gap = r() < 0.12;
      if (!gap) rowHouse(B, G, r, night, side * 99, z - w / 2, w, h, 18, (-side * Math.PI) / 2, r() < 0.55);
      z -= w + (gap ? 10 : 0.4);
    }
  };
  rows(-1);
  rows(1);
  {
    let x = -92;
    while (x < 92) {
      const w = 14 + r() * 5,
        h = 16 + r() * 12;
      if (Math.abs(x + w / 2) > 12) rowHouse(B, G, r, night, x + w / 2, -118, w, h, 18, 0, r() < 0.5);
      x += w + 0.4;
    }
  }
  // town hall with clock tower at the back
  {
    B.xf(0, 0, -118);
    B.box(30, 24, 20, '#f3e6c8', 0, 0, 0);
    B.box(32, 1, 22, '#fff', 0, 23, 0);
    B.prism(32, 9, 23, '#2f5fa8', 0, 24, 0);
    B.box(11, 52, 11, '#f3e6c8', 0, 0, 2);
    B.box(12, 1.4, 12, '#fff', 0, 40, 2);
    B.box(12, 1.4, 12, '#fff', 0, 52, 2);
    B.cone(8.6, 16, 4, '#2f9e8f', 0, 52, 2, Math.PI / 4);
    B.cone(0.5, 6, 6, '#ffd54a', 0, 68, 2);
    for (const [sx, sz, ry] of [[0, 8, 0]]) {
      G.xf(0, 0, -118);
      G.box(8, 8, 0.4, '#fffef6', 0, 41.5, 8.1);
      G.box(0.5, 3.2, 0.3, '#2a2a2a', 0, 45.2, 8.4);
      G.box(2.6, 0.5, 0.3, '#2a2a2a', 1.1, 45.2, 8.4);
      G.xf();
    }
    for (let i = -2; i <= 2; i++) B.box(1.4, 14, 1.4, '#fff', i * 5.5, 0, 11);
    B.box(30, 1.2, 4, '#fff', 0, 14, 10.5);
    for (let i = 0; i < 6; i++) B.box(34 - i * 2, 0.6, 4 + i * 0.8, '#d6d0c4', 0, i * 0.6, 10 + i * 0.5);
    B.xf();
  }
  if (!clear) {
    for (const [x, z, w, h] of [
      [-18, -55, 22, 26],
      [16, -52, 26, 34],
      [0, -72, 20, 22],
    ])
      rowHouse(B, G, r, night, x, z, w, h, 18, 0, true);
  }
  // second ring, taller, behind the first
  for (const sx of [-1, 1])
    for (let z = 40; z > -140; z -= 17 + r() * 6)
      rowHouse(B, G, r, night, sx * 124, z, 15 + r() * 4, 22 + r() * 18, 16, (-sx * Math.PI) / 2, false);
  // trees + lamps + benches + planters
  const TC = ['#4caf50', '#66bb6a', '#43a047', '#7cb342', '#9ccc65'];
  for (const sx of [-1, 1])
    for (let z = 50; z > -105; z -= 22) {
      tree(B, r, sx * 80 + (r() - 0.5) * 2, z + (r() - 0.5) * 4, 1.2 + r() * 0.3, TC);
      lampPost(B, G, sx * 83, z + 11, sx < 0 ? 0 : Math.PI, night);
      B.box(5, 0.5, 1.6, '#8a5a3a', sx * 78, 1.4, z - 5, Math.PI / 2);
      B.box(5, 1.4, 0.4, '#8a5a3a', sx * 78 + (sx < 0 ? -0.8 : 0.8), 1.6, z - 5, Math.PI / 2);
      B.box(4, 1.6, 4, '#8d8a85', sx * 73, 0, z + 5);
      B.ico(1.8, '#e8668a', sx * 73, 2, z + 5, 1.1, 0.7, 1.1, 1);
      B.ico(1.3, '#ffd54f', sx * 73 + 1, 2.2, z + 5.5, 1, 0.7, 1, 1);
    }
  for (let x = -70; x < 75; x += 28) {
    lampPost(B, G, x + 4, -104, Math.PI / 2, night);
  }
  for (const [x, z] of [
    [-40, 46],
    [40, 46],
    [-56, 30],
    [56, 30],
  ])
    tree(B, r, x, z, 1.1 + r() * 0.3, TC);
  // off-centre fountain + bunting strings so the plaza is not empty
  {
    const fx = 14,
      fz = -30;
    B.cyl(6.4, 6.4, 1.3, 28, '#d9d3c6', fx, 0, fz);
    B.cyl(5.6, 5.6, 0.3, 28, '#a8a398', fx, 1.2, fz);
    B.cyl(1.2, 1.4, 4, 12, '#e8e2d4', fx, 1.2, fz);
    B.cyl(3, 1.2, 0.8, 16, '#d9d3c6', fx, 4.2, fz);
    B.cyl(0.5, 0.8, 1.4, 10, '#e8e2d4', fx, 5, fz);
    B.cyl(1.4, 0.4, 0.5, 12, '#d9d3c6', fx, 6.2, fz);
    G.cyl(5.4, 5.4, 0.1, 28, night ? '#7fd0ff' : '#5bc4f2', fx, 1.45, fz);
    G.cyl(2.7, 2.7, 0.1, 16, night ? '#7fd0ff' : '#8fdcff', fx, 4.9, fz);
    for (let i = 0; i < 8; i++) {
      const a = i * 0.785;
      B.ico(0.45, '#ffd54a', fx + Math.cos(a) * 6.9, 1.6, fz + Math.sin(a) * 6.9, 1, 0.8, 1, 0);
    }
    const COL = ['#e53935', '#ffd54f', '#2f7fd6', '#2e9e5b', '#f06292', '#ff9a5a'];
    for (const [bz, bh] of [
      [-40, 22],
      [-66, 24],
      [-92, 22],
    ]) {
      const x0 = -84,
        x1 = 84,
        N = 44;
      let px = x0,
        py = bh;
      for (let i = 1; i <= N; i++) {
        const u = i / N,
          x = x0 + (x1 - x0) * u,
          y = bh - 5.5 * 4 * u * (1 - u);
        const len = Math.hypot(x - px, y - py);
        B.box(len + 0.1, 0.1, 0.1, '#3a2a20', (x + px) / 2, (y + py) / 2, bz, 0, 0, Math.atan2(y - py, x - px));
        if (i % 2 === 0 && i < N) B.cyl(0, 0.9, 1.8, 3, COL[(i / 2) % COL.length], x, y - 1.9, bz, 0);
        px = x;
        py = y;
      }
      for (const sx of [-1, 1]) B.cyl(0.35, 0.3, bh + 1, 6, '#6b4a2e', sx * 84, 0, bz);
    }
  }
  // beyond: hills and far mountains
  const hills = batch(r, 0.1);
  smoothHills(hills, r, 22, 230, 380, ['#5faa46', '#4e9a3e', '#79c256', '#69b34c']);
  for (let i = 0; i < 14; i++) {
    const a = -Math.PI * (0.1 + r() * 0.8),
      d = 380 + r() * 120;
    hills.add(P.ico(1), '#7fa3c9', Math.cos(a) * d, -20, Math.sin(a) * d, 90 + r() * 90, 50 + r() * 80, 70 + r() * 60);
  }
  for (let i = 0; i < 40; i++) {
    const a = -Math.PI * (r() * 1.0),
      d = 200 + r() * 130,
      rr = 2 + r() * 2;
    tree(hills, r, Math.cos(a) * d, Math.sin(a) * d, rr, TC);
  }
  put(g, hills.mesh({ flatShading: false }), { far: true, cs: false });
  put(g, B.mesh(), { far: true });
  put(g, H.mesh(), { far: true });
  const gm = G.mesh(
    night
      ? { emissive: '#ffb84a', emissiveIntensity: 1.2, roughness: 0.15, metalness: 0.3 }
      : { roughness: 0.08, metalness: 0.35 },
  );
  put(g, gm, { far: true, cs: false });
  if (night)
    for (const [x, z] of [
      [-30, 20],
      [30, 20],
      [0, -30],
    ]) {
      const l = new T.PointLight('#ffd98a', 400, 70, 1.6);
      l.position.set(x, 12, z);
      g.add(l);
    }
};

// ---- 2. ice_world ----
const lean = (th, ph) => {
  const rz = -Math.asin(Math.sin(th) * Math.cos(ph));
  return [Math.asin((Math.sin(th) * Math.sin(ph)) / Math.cos(rz)), rz];
}; // -> [rx, rz] tilting up toward heading ph by th
function crystal(CR, CO, x, z, h, rad, th, ph, col) {
  const [rx, rz] = lean(th, ph),
    d = [-Math.sin(rz), Math.cos(rz) * Math.cos(rx), Math.cos(rz) * Math.sin(rx)],
    bh = h * 0.72;
  CR.cyl(rad, rad * 0.8, bh, 6, col, x, 0, z, ph, rx, rz);
  CR.cone(rad * 0.8, h * 0.28, 6, col, x + d[0] * bh, d[1] * bh, z + d[2] * bh, ph, rx, rz);
  if (CO && rad > 1.6) CO.cyl(rad * 0.38, rad * 0.3, bh * 0.96, 6, '#ffffff', x, 0, z, ph, rx, rz);
}
WORLDS.ice_world = function (g, o, r) {
  const CR = batch(r, 0.12),
    CO = batch(r, 0),
    RK = batch(r, 0.1),
    SN = batch(r, 0.03),
    B = batch(r, 0.05),
    ICE = ['#aee9ff', '#7fd6ff', '#d6f6ff', '#5bc0ff', '#9be0ff'];
  plane(
    g,
    1600,
    1600,
    pbrMat('snow', 1600, 1600, { fallback: '#e4f2ff', color: '#e4f2ff', emissive: '#6aa8e8', emissiveIntensity: 0.32 }),
    0,
    -0.1,
    0,
    0,
    true,
  );
  disc(g, 1, off(mt('#bfe8ff', { roughness: 0.5, emissive: '#2a80b8', emissiveIntensity: 0.2 })), 0, 0.01, -4, 56, 44);
  const lake = disc(
    g,
    1,
    off(
      pbrMat('ice', 100, 80, {
        fallback: '#8fdcff',
        color: '#d4f2ff',
        roughness: 0.22,
        metalness: 0.1,
        emissive: '#5ab8e8',
        emissiveIntensity: 0.3,
      }),
      -2,
    ),
    0,
    0.03,
    -4,
    50,
    38,
  );
  lake.userData.isGround = true;
  {
    const s1 = glintTex(r, [9, 7], 22, '210,245,255'),
      s2 = causticTex(r, [5, 4], '200,240,255', 22),
      m1 = addMat(s1, 0.5),
      m2 = addMat(s2, 0.25);
    for (const m of [m1, m2]) {
      off(m, -3);
      disc(g, 1, m, 0, 0.045, -4, 49.5, 37.5).userData.noAO = true;
    }
    addTick(g, (t) => {
      s1.offset.set(t * 0.006, -t * 0.004);
      s2.offset.set(-t * 0.005, t * 0.007);
      m1.opacity = 0.4 + 0.22 * Math.sin(t * 2.3);
      m2.opacity = 0.2 + 0.1 * Math.sin(t * 1.1 + 1);
    });
  }
  const inLake = (x, z, m = 1) => (x / (54 * m)) ** 2 + ((z + 4) / (42 * m)) ** 2 < 1;
  const crack = (x, z, a, n, wd) => {
    for (let i = 0; i < n; i++) {
      const len = 4 + r() * 6;
      B.box(len, 0.03, wd * 2.6, '#1f6fa8', x + (Math.cos(a) * len) / 2, 0.05, z - (Math.sin(a) * len) / 2, a);
      B.box(len, 0.03, wd, '#f4fdff', x + (Math.cos(a) * len) / 2, 0.075, z - (Math.sin(a) * len) / 2, a);
      x += Math.cos(a) * len;
      z -= Math.sin(a) * len;
      if (!inLake(x, z, 0.92)) break;
      if (r() < 0.35) crack(x, z, a + (r() < 0.5 ? 1 : -1) * (0.5 + r() * 0.7), 2 + Math.floor(r() * 3), wd * 0.6);
      a += (r() - 0.5) * 1.1;
      wd *= 0.88;
    }
  };
  for (let k = 0; k < 13; k++) {
    const a0 = r() * 6.28,
      d0 = r() * 30;
    crack(Math.cos(a0) * d0, -4 + Math.sin(a0) * d0 * 0.7, r() * 6.28, 5 + Math.floor(r() * 3), 0.45);
  }
  B.cyl(1, 0.6, 0.05, 10, '#f4fdff', 6, 0.06, -9, 0); // star-shaped impact point near the actors
  for (let k = 0; k < 9; k++) {
    const a = k * 0.7 + r() * 0.3;
    crack(6, -9, a, 3, 0.5);
  }
  const ok = (x, z) => !(Math.abs(x) < 17 && z > -16) && !inLake(x, z, 1.04);
  const cluster = (x, z, H, n) => {
    crystal(CR, CO, x, z, H, H * 0.075 + 1, 0.05 + r() * 0.12, r() * 6.28, pick(r, ICE));
    for (let i = 0; i < n; i++) {
      const ph = r() * 6.28,
        dd = H * (0.06 + r() * 0.12) + 2;
      crystal(
        CR,
        CO,
        x + Math.cos(ph) * dd,
        z + Math.sin(ph) * dd,
        H * (0.3 + r() * 0.4),
        H * 0.05 + 0.8,
        0.15 + r() * 0.35,
        ph + (r() - 0.5) * 0.5,
        pick(r, ICE),
      );
    }
  };
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i / 8 - 0.5) * 2.6 + (r() - 0.5) * 0.3,
      d = 100 + r() * 110,
      x = Math.cos(a) * d,
      z = Math.sin(a) * d;
    cluster(x, z, 70 + r() * 70, 5);
  }
  for (let i = 0; i < 24; i++) {
    let x,
      z,
      t = 0;
    do {
      const a = i < 12 ? -Math.PI / 2 + (r() - 0.5) * 2.4 : r() * 6.28,
        d = 52 + r() * 80;
      x = Math.cos(a) * d;
      z = Math.sin(a) * d * 0.9 - 20;
    } while (!ok(x, z) && t++ < 20);
    if (ok(x, z)) cluster(x, z, 16 + r() * 30, 3 + Math.floor(r() * 3));
  }
  for (let i = 0; i < 70; i++) {
    const a = r() * 6.28,
      d = 20 + r() * 110,
      x = Math.cos(a) * d,
      z = Math.sin(a) * d * 0.8 - 12;
    if (!ok(x, z)) continue;
    crystal(CR, CO, x, z, 3 + r() * 7, 0.6 + r() * 0.6, 0.1 + r() * 0.5, r() * 6.28, pick(r, ICE));
  }
  for (let i = 0; i < 26; i++) {
    const a = r() * 6.28,
      d = 28 + r() * 120,
      x = Math.cos(a) * d,
      z = Math.sin(a) * d * 0.8 - 12;
    if (!ok(x, z)) continue;
    const q = 2 + r() * 5;
    CR.ico(q, pick(r, ICE), x, q * 0.3, z, 1, 0.8, 1, 0, r() * 6);
    SN.ico(q * 0.5, '#f4faff', x + q * 0.2, q * 0.9, z, 1, 0.45, 1, 0);
  }
  // snowy mountains ring
  const peak = (x, z, rb, h) => {
    RK.cyl(rb, rb * 0.08, h, 6 + Math.floor(r() * 2), '#566a88', x, -4, z, r() * 6);
    RK.cyl(rb * 0.62, rb * 0.06, h * 0.6, 6, '#ffffff', x, h * 0.4 - 4, z, r() * 6);
  };
  for (let i = 0; i < 70; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * (r() < 0.8 ? 2.6 : 5.6),
      d = 230 + r() * 190,
      x = Math.cos(a) * d,
      z = Math.sin(a) * d,
      rb = 55 + r() * 70,
      h = 70 + r() * 110;
    peak(x, z, rb, h);
    if (r() < 0.6) peak(x + (r() - 0.5) * rb, z + (r() - 0.5) * rb, rb * 0.6, h * 0.7);
  }
  for (let i = 0; i < 18; i++) {
    const x = (r() - 0.5) * 360,
      z = -150 - r() * 60;
    peak(x, z, 30 + r() * 25, 25 + r() * 25);
  }
  for (let i = 0; i < 40; i++) {
    const a = r() * 6.28,
      d = 25 + r() * 160,
      x = Math.cos(a) * d,
      z = Math.sin(a) * d - 15;
    if (!ok(x, z)) continue;
    SN.ico(3 + r() * 9, '#f1f8ff', x, -0.5, z, 1.6, 0.35, 1.2, 1, r() * 6);
  }
  for (let i = 0; i < 20; i++) {
    const a = r() * 6.28,
      d = 45 + r() * 130,
      x = Math.cos(a) * d,
      z = Math.sin(a) * d - 15;
    if (!ok(x, z)) continue;
    const q = 3 + r() * 6;
    RK.ico(q, '#5a6c88', x, q * 0.35, z, 1, 0.8, 1, 0, r() * 6);
    SN.ico(q * 0.6, '#ffffff', x, q * 0.9, z, 1, 0.5, 1, 0);
  }
  put(
    g,
    CR.mesh({
      color: '#ffffff',
      transparent: true,
      opacity: 0.72,
      roughness: 0.06,
      metalness: 0.05,
      emissive: '#2ab4f0',
      emissiveIntensity: 0.55,
      flatShading: true,
    }),
    { cs: false, far: true },
  );
  put(g, CO.mesh({ color: '#000000', emissive: '#6fe6ff', emissiveIntensity: 1.5 }), { cs: false, far: true });
  put(g, RK.mesh({ flatShading: true, emissive: '#1b2a5a', emissiveIntensity: 0.25 }), { far: true });
  put(g, SN.mesh({ roughness: 0.9, emissive: '#3a78b8', emissiveIntensity: 0.1 }), { far: true });
  put(g, B.mesh({ emissive: '#4ab8ff', emissiveIntensity: 0.2 }), { cs: false, rs: false, far: true });
  for (const [x, z, c] of [
    [-34, -26, '#2ae0ff'],
    [38, -40, '#b36bff'],
  ]) {
    const l = new T.PointLight(c, 500, 90, 1.5);
    l.position.set(x, 14, z);
    g.add(l);
  }
};

// ---- 3. sky_island ----
WORLDS.sky_island = function (g, o, r) {
  const CX = 0,
    CZ = -16,
    RX = 38,
    RZ = 50,
    B = batch(r, 0.1),
    GD = batch(r, 0.03),
    RK = batch(r, 0.1),
    CL = batch(r, 0.04),
    FI = batch(r, 0.08),
    ST = batch(r, 0.05);
  const AUT = ['#f2a31b', '#e8741e', '#f7c93a', '#d9531e', '#e69a28', '#ffd24a'];
  // island body
  const top = disc(g, 1, pbrMat('grass', 76, 100, { fallback: '#86d44e', color: '#c0f080' }), CX, 0, CZ, RX, RZ, 56);
  top.userData.isGround = true;
  const sk = new T.Mesh(
    new T.CylinderGeometry(1, 1, 3, 56, 1, true),
    pbrMat('dirt_path', 280, 3, { fallback: '#8a6038', color: '#c8a070' }),
  );
  sk.scale.set(RX, 1, RZ);
  sk.position.set(CX, -1.5, CZ);
  sk.userData.noOcclude = true;
  sk.castShadow = true;
  g.add(sk);
  const ug = new T.CylinderGeometry(1, 0.05, 1, 40, 9, true),
    pa = ug.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const y = pa.getY(i),
      a = Math.atan2(pa.getZ(i), pa.getX(i));
    if (y < 0.49) {
      const k = 1 + 0.1 * Math.sin(a * 5 + y * 7) + 0.08 * Math.sin(a * 11 - y * 5) + (r() - 0.5) * 0.07;
      pa.setX(i, pa.getX(i) * k);
      pa.setZ(i, pa.getZ(i) * k);
      pa.setY(i, y + (r() - 0.5) * 0.03);
    }
  }
  ug.computeVertexNormals();
  const under = new T.Mesh(ug, pbrMat('rock', 140, 60, { fallback: '#8a7560', flatShading: true, color: '#d8c0a8' }));
  under.scale.set(RX * 0.99, 62, RZ * 0.99);
  under.position.set(CX, -3 - 31, CZ);
  under.userData.noOcclude = true;
  under.castShadow = true;
  g.add(under);
  for (let i = 0; i < 46; i++) {
    const a = r() * 6.28,
      dp = 4 + r() * 38,
      rr = (1 - dp / 62) * 0.93,
      q = 2.5 + r() * 6;
    RK.ico(
      q,
      pick(r, ['#8b7762', '#9a846c', '#76644f']),
      CX + Math.cos(a) * RX * rr,
      -3 - dp,
      CZ + Math.sin(a) * RZ * rr,
      1,
      1.2,
      1,
      0,
      r() * 6,
    );
  }
  for (let i = 0; i < 14; i++) {
    const a = r() * 6.28,
      dp = 6 + r() * 20,
      rr = (1 - dp / 62) * 0.8;
    RK.cyl(
      0.4,
      3 + r() * 3,
      10 + r() * 16,
      6,
      '#7a6650',
      CX + Math.cos(a) * RX * rr,
      -3 - dp - 12,
      CZ + Math.sin(a) * RZ * rr,
    );
  }
  // rim bushes and stones
  for (let i = 0; i < 90; i++) {
    const a = r() * 6.28,
      k = 0.9 + r() * 0.06,
      x = CX + Math.cos(a) * RX * k,
      z = CZ + Math.sin(a) * RZ * k;
    if (r() < 0.5)
      B.ico(1 + r() * 1.4, pick(r, ['#5fb83a', '#78c83c', '#c9a31f', '#e0a030']), x, 0.6, z, 1.2, 0.8, 1.2, 1);
    else RK.ico(0.8 + r(), '#9a8a78', x, 0.4, z, 1.3, 0.8, 1, 0, r() * 6);
  }
  // path to statue + plaza
  plane(g, 8, 62, off(pbrMat('dirt_path', 8, 62, { fallback: '#b08a5a', color: '#e8c898' })), 0, 0.03, -10);
  for (let z = 18; z > -36; z -= 4.5)
    for (const sx of [-1, 1])
      RK.ico(0.6 + r() * 0.4, '#a89880', sx * (4.6 + r() * 0.4), 0.3, z + r() * 2, 1.2, 0.7, 1, 0, r() * 6);
  disc(g, 24, off(pbrMat('stone_tiles', 48, 48, { fallback: '#d8cfae', color: '#efe2c0' }), -2), 0, 0.04, -45);
  disc(g, 17.5, off(mt('#c9a64a', { metalness: 0.6, roughness: 0.4 }), -3), 0, 0.05, -45);
  // autumn trees + leaves
  for (let i = 0; i < 70; i++) {
    const a = r() * 6.28,
      k = Math.sqrt(r()) * 0.88,
      x = CX + Math.cos(a) * RX * k,
      z = CZ + Math.sin(a) * RZ * k;
    if (
      (Math.abs(x) < 7 && z > -40 && z < 16) ||
      (Math.abs(x) < 14 && z > -10) ||
      Math.hypot(x, z + 45) < 25 ||
      Math.hypot(x - 24, z + 14) < 12 ||
      (x > 12 && Math.abs(z + 14) < 6) ||
      Math.hypot(x, z) < 14
    )
      continue;
    const s = (0.9 + r() * 0.8) * 0.65,
      h = 8 * s;
    B.cyl(0.9 * s, 0.6 * s, h, 7, '#6b4423', x, 0, z);
    B.box(0.5 * s, 3 * s, 0.5 * s, '#6b4423', x + 1.2 * s, h * 0.6, z, 0, 0, -0.7);
    const c = pick(r, AUT);
    for (const [dx, dy, dz, q] of [
      [0, h + 2, 0, 4.6],
      [-3, h, 0.6, 3.4],
      [3, h + 0.6, -0.5, 3.6],
      [0.3, h + 5, 0.3, 3.4],
      [0, h - 0.6, 3, 3],
    ])
      B.ico(q * s, c, x + dx * s, dy, z + dz * s, 1, 0.85, 1, 1);
    for (let k2 = 0; k2 < 4; k2++)
      B.box(0.9, 0.08, 0.9, pick(r, AUT), x + (r() - 0.5) * 13 * s, 0.06, z + (r() - 0.5) * 13 * s, r() * 3);
  }
  for (let i = 0; i < 70; i++) {
    const a = r() * 6.28,
      k = Math.sqrt(r()) * 0.85,
      x = CX + Math.cos(a) * RX * k,
      z = CZ + Math.sin(a) * RZ * k;
    if (Math.abs(x) < 6 && z > -42) continue;
    if (Math.abs(x) < 14 && z > -10) continue;
    if (Math.hypot(x, z + 45) < 23 || Math.hypot(x, z) < 12) continue;
    B.ico(0.9 + r() * 0.9, pick(r, ['#d9531e', '#e8a31b', '#7ac043', '#f5d34a']), x, 0.5, z, 1.2, 0.8, 1.2, 1);
  }
  // pond, stream, waterfall
  const wat = off(mt('#46c2f4', { roughness: 0.1, metalness: 0.1, emissive: '#2a9ad8', emissiveIntensity: 0.35 }), -2);
  disc(g, 1, wat, 24, 0.07, -14, 9, 7);
  {
    const nrm = -0.1;
    plane(g, 16.5, 5.2, wat, 29.8, 0.07, -14); // stream from the pond to the rim (the sheet faces the high camera, not the cliff)
    RK.box(16.5, 0.5, 0.8, '#9a8a78', 29.8, 0, -16.9);
    RK.box(16.5, 0.5, 0.8, '#9a8a78', 29.8, 0, -11.1);
    const mkTex = (n, seed) => {
      const rr = mulberry(seed);
      return canvasTex(
        64,
        256,
        (c, w, h) => {
          c.fillStyle = 'rgba(200,240,255,.62)';
          c.fillRect(0, 0, w, h);
          for (let i = 0; i < n; i++) {
            c.fillStyle = `rgba(255,255,255,${0.35 + rr() * 0.6})`;
            const x = rr() * w,
              y = rr() * h,
              l = 24 + rr() * 110;
            c.fillRect(x, y, 1.5 + rr() * 4, l);
            c.fillRect(x, y - h, 1.5, l);
          }
          for (let i = 0; i < 18; i++) {
            c.fillStyle = `rgba(70,170,235,${0.25 + rr() * 0.3})`;
            c.fillRect(rr() * w, rr() * h, 2 + rr() * 3, 30 + rr() * 90);
          }
        },
        [1, 1.6],
      );
    };
    const wf1 = mkTex(80, 11),
      wf2 = mkTex(60, 23),
      WH = 44,
      WW = 11,
      ex = 37.8,
      ezz = -14;
    const sheets = [wf1, wf2].map((tx, i) => {
      const m = new T.Mesh(
        new T.PlaneGeometry(WW - i * 0.8, WH),
        new T.MeshBasicMaterial({
          map: tx,
          transparent: true,
          opacity: 0.9 - i * 0.15,
          depthWrite: false,
          side: T.DoubleSide,
        }),
      );
      m.position.set(ex + Math.sin(nrm) * i * 0.35, 1.2 - WH / 2, ezz + Math.cos(nrm) * i * 0.35);
      m.rotation.y = nrm;
      m.userData.noOcclude = true;
      m.userData.noAO = true;
      g.add(m);
      return m;
    });
    const lip = new T.Mesh(
      new T.BoxGeometry(2, 0.5, 5.2),
      mt('#e8f8ff', { emissive: '#bfe8ff', emissiveIntensity: 0.6 }),
    );
    lip.position.set(ex - 0.6, 0.1, ezz);
    g.add(lip);
    const mist = [];
    for (let i = 0; i < 6; i++) {
      const m = new T.Mesh(new T.PlaneGeometry(1, 1), glowMat('235,250,255', 0.6));
      m.userData.noOcclude = true;
      m.userData.noAO = true;
      m.renderOrder = 3;
      g.add(m);
      mist.push(m);
    }
    const foam = [];
    for (let i = 0; i < 4; i++) {
      const m = new T.Mesh(new T.PlaneGeometry(1, 1), glowMat('255,255,255', 0.8));
      m.userData.noOcclude = true;
      m.renderOrder = 3;
      g.add(m);
      foam.push(m);
    }
    addTick(g, (t) => {
      wf1.offset.y = -t * 1.1;
      wf2.offset.y = -t * 1.6 + 0.3;
      wf2.offset.x = Math.sin(t * 0.7) * 0.03;
      mist.forEach((m, i) => {
        const ph = (t * 0.35 + i / 6) % 1;
        m.scale.setScalar(12 + ph * 16 + i * 1.5);
        m.position.set(
          ex + Math.sin(nrm) * (2 + ph * 5) + Math.cos(nrm) * (i - 2.5) * 2,
          -41 + ph * 5,
          ezz + Math.cos(nrm) * (2 + ph * 5) - Math.sin(nrm) * (i - 2.5) * 2,
        );
        m.rotation.set(-Math.PI / 2 + 0.9, 0, 0);
        m.lookAt(m.position.x + 30, m.position.y + 40, m.position.z + 70);
        m.material.opacity = 0.6 * (1 - ph) + 0.15;
      });
      foam.forEach((m, i) => {
        const ph = (t * 0.5 + i / 4) % 1;
        m.scale.setScalar(5 + ph * 4);
        m.position.set(ex + (i - 1.5) * 1.6 + Math.sin(nrm) * 1.2, -1 - ph * 3, ezz + Math.cos(nrm) * 1.2);
        m.lookAt(m.position.x + 30, m.position.y + 40, m.position.z + 70);
        m.material.opacity = 0.8 * (1 - ph);
      });
    });
  }
  for (let i = 0; i < 10; i++)
    CL.ico(4 + r() * 3, '#ffffff', 38.8 + (r() - 0.3) * 6, -40 + r() * 3, -14 + (r() - 0.5) * 10, 1, 0.6, 1, 2);
  // cloud sea
  const tint = ['#ffffff', '#f4f8ff', '#e8f1ff', '#fff6ee', '#eef0ff'];
  for (let i = 0; i < 300; i++) {
    const a = r() * 6.28,
      d = 20 + Math.pow(r(), 0.75) * 400,
      rad = 12 + r() * 22;
    CL.ico(rad, tint[i % 5], Math.cos(a) * d, -40 + (r() - 0.5) * 5, Math.sin(a) * d, 1, 0.32 + r() * 0.14, 1, 2);
  }
  for (let i = 0; i < 40; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 3.4,
      d = 70 + r() * 220,
      rad = 14 + r() * 18;
    CL.ico(rad, tint[i % 5], Math.cos(a) * d, -34 + r() * 14, Math.sin(a) * d, 1, 0.5, 1, 2);
  }
  disc(g, 800, mt('#d0e2f8', { emissive: '#a8c8f0', emissiveIntensity: 0.5, roughness: 1 }), 0, -46, 0);
  // distant floating islands
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 9 - 0.5) * 3 + (r() - 0.5) * 0.3,
      d = 100 + r() * 170,
      R = 9 + r() * 16,
      x = Math.cos(a) * d,
      z = Math.sin(a) * d,
      y = -8 + r() * 80;
    FI.cyl(R * 0.95, R, 2.6, 16, '#8fd65a', x, y - 2.6, z);
    FI.cyl(R * 0.12, R * 0.95, R * 1.3, 9, '#8d7a64', x, y - 2.6 - R * 1.3, z);
    FI.cyl(R * 0.02, R * 0.3, R * 1.1, 6, '#76644f', x + R * 0.2, y - 2.6 - R * 2.1, z);
    for (let k = 0; k < 2 + Math.floor(r() * 3); k++) {
      const q = 1.2 + r() * 0.8,
        tx = x + (r() - 0.5) * R * 1.2,
        tz = z + (r() - 0.5) * R * 1.2;
      FI.cyl(0.4 * q, 0.3 * q, 4 * q, 6, '#6b4423', tx, y, tz);
      FI.ico(2.6 * q, pick(r, AUT), tx, y + 4 * q, tz, 1, 0.9, 1, 1);
    }
  }
  // golden warrior statue
  const sg = new T.Group();
  sg.scale.setScalar(1.4);
  sg.position.set(0, 0, 18);
  g.add(sg);
  const SX = 0,
    SZ = -45,
    y0 = 8,
    gold = '#ffc83a',
    gd2 = '#e0a820',
    gd3 = '#ffe08a';
  ST.box(21, 1.3, 21, '#d8cfae', SX, 0, SZ);
  ST.box(17, 1.3, 17, '#cfc5a0', SX, 1.3, SZ);
  ST.box(12.4, 4.6, 12.4, '#e2d8b6', SX, 2.6, SZ);
  ST.box(14, 0.8, 14, '#c9a64a', SX, 7.2, SZ);
  GD.box(13, 0.5, 13, gold, SX, 2.6, SZ);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) GD.box(1.4, 4.2, 1.4, gd2, SX + sx * 6, 2.9, SZ + sz * 6);
  const S = (w, h, d, c, x, y, z, ...rot) => GD.box(w, h, d, c, SX + x, y0 + y, SZ + z, ...rot);
  for (const sx of [-1, 1]) {
    S(3, 1.4, 4.8, gd2, sx * 2.1, 0, 0.5);
    S(2.6, 7.2, 2.6, gold, sx * 2.1, 1.4, 0);
    S(3, 2.4, 3, gd2, sx * 2.1, 1.6, 0.1);
    S(3, 1.6, 3, gd3, sx * 2.1, 5.2, 0.1);
  }
  S(8.8, 1.2, 4.2, gd2, 0, 8.4, 0);
  for (const x of [-2.8, 0, 2.8]) S(2.3, 3.6, 0.5, gold, x, 5.2, 2.3);
  S(7.6, 7, 4, gold, 0, 9.6, 0);
  S(6.4, 3.2, 0.7, gd3, 0, 12.4, 2.2);
  S(1, 1, 0.7, gd2, 0, 11.4, 2.5);
  S(8, 0.8, 4.4, gd2, 0, 15.8, 0);
  S(14, 14.5, 0.6, '#c98f10', 0, 2.4, -2.5);
  for (const sx of [-1, 1]) S(3.6, 2.2, 4.8, gd3, sx * 5.6, 14.8, 0);
  S(2, 0.8, 2, gd2, 0, 16.6, 0);
  S(3.6, 3.8, 3.6, gold, 0, 17.4, 0);
  S(4.4, 2, 4.4, gd2, 0, 19.6, 0);
  S(0.8, 2.6, 5, gd3, 0, 21.4, 0);
  S(3, 0.5, 0.3, '#5a3d00', 0, 19.2, 1.85);
  S(0.6, 2.4, 0.5, '#5a3d00', 0, 17.8, 1.85);
  S(2, 4.4, 2, gold, 5.6, 10.8, 0);
  S(1.9, 1.9, 4, gold, 5.6, 10.6, 2.8);
  S(6.6, 10, 1.2, '#c98f10', 8.2, 6, 4.8);
  S(7.4, 0.7, 1.4, gd3, 8.2, 15.3, 4.8);
  S(2.2, 2.2, 0.8, gd3, 8.2, 10.2, 5.7);
  S(2, 4.4, 2, gold, -5.6, 10.8, 0);
  S(1.9, 1.9, 4.2, gold, -5.6, 9.6, 2.4);
  S(2.2, 2.2, 2.2, gd3, -5.6, 9.2, 4.6);
  S(5, 0.8, 1.4, gd2, -5.6, 11.6, 4.6);
  S(1.3, 15, 0.5, '#fff0b0', -5.6, 12.4, 4.6);
  S(0.9, 0.9, 0.9, gd2, -5.6, 8.3, 4.6);
  const l = new T.PointLight('#ffd27a', 300, 60, 1.6);
  l.position.set(0, 14, -34);
  g.add(l);
  rays(g, r, 4, [-60, -120, 120, 60], 40, 0.14);
  put(g, B.mesh(), { far: true });
  put(g, RK.mesh({ flatShading: true }), { far: true });
  put(g, FI.mesh({ flatShading: true }), { far: true });
  put(sg, ST.mesh({ roughness: 0.8 }));
  put(sg, GD.mesh({ metalness: 0.8, roughness: 0.28, emissive: '#a87000', emissiveIntensity: 0.3 }));
  put(g, CL.mesh({ color: '#ffffff', roughness: 1, emissive: '#bcd4ff', emissiveIntensity: 0.35 }), {
    cs: false,
    far: true,
  });
};

// ---- 7. tunnel (interior, in WORLD_INTERIOR) ----
WORLDS.tunnel = function (g, o, r) {
  const X = 7,
    WH = 22,
    ZN = 24,
    ZF = -160,
    L = ZN - ZF,
    zc = (ZN + ZF) / 2,
    GD = batch(r, 0.03),
    GL = batch(r, 0),
    GL2 = batch(r, 0),
    ST = batch(r, 0.05),
    CP = batch(r, 0);
  const sand = (w, h, op = {}) => pbrMat('sandstone_blocks', w, h, { fallback: '#cdbf9c', color: '#bfb9ab', ...op });
  plane(
    g,
    2 * X,
    L,
    pbrMat('stone_tiles', 14, L, {
      fallback: '#7f8ca3',
      color: '#8d9ab4',
      roughness: 0.16,
      metalness: 0.3,
      emissive: '#0c1830',
      emissiveIntensity: 0.2,
    }),
    0,
    0,
    zc,
    0,
    true,
  ).userData.isGround = true;
  for (const s of [-1, 1]) {
    const w = new T.Mesh(new T.PlaneGeometry(L, WH), sand(L, WH));
    w.rotation.y = (s * -Math.PI) / 2;
    w.position.set(s * X, WH / 2, zc);
    w.receiveShadow = true;
    g.add(w);
  }
  const vm = new T.Mesh(
    new T.CylinderGeometry(X, X, L, 28, 1, true, Math.PI / 2, Math.PI),
    sand(22, L, { side: T.BackSide, color: '#aaa597' }),
  );
  vm.rotation.x = Math.PI / 2;
  vm.position.set(0, WH, zc);
  g.add(vm);
  const endWall = (z, ry) => {
    const w = new T.Mesh(new T.PlaneGeometry(2 * X, WH), sand(14, WH));
    w.rotation.y = ry;
    w.position.set(0, WH / 2, z);
    g.add(w);
    const t = new T.Mesh(new T.CircleGeometry(X, 28, 0, Math.PI), sand(14, 14));
    t.rotation.y = ry;
    t.position.set(0, WH, z);
    g.add(t);
  };
  endWall(ZF, 0);
  endWall(ZN, Math.PI);
  {
    // entrance: lit hatch opening in the near wall at the top of the staircase (stairs prop at [0, ZN-16], rise 12)
    const EB = batch(r, 0);
    const EY = 12;
    EB.box(0.9, 9, 1.4, '#6a5a3a', -3.6, EY, ZN - 0.6);
    EB.box(0.9, 9, 1.4, '#6a5a3a', 3.6, EY, ZN - 0.6);
    EB.box(8.1, 0.9, 1.4, '#6a5a3a', 0, EY + 9, ZN - 0.6);
    EB.box(8.1, 0.4, 3, '#4a3e28', 0, EY - 0.2, ZN - 1.2);
    put(g, EB.mesh({ roughness: 0.9 }), { cs: false });
    const lit = new T.Mesh(
      new T.PlaneGeometry(6.4, 8.8),
      new T.MeshBasicMaterial({ color: '#dff0ff', side: T.DoubleSide }),
    );
    lit.rotation.y = Math.PI;
    lit.position.set(0, EY + 4.4, ZN - 0.12);
    lit.userData.noOcclude = true;
    g.add(lit);
    const el = new T.PointLight('#bcd8ff', 60, 30, 1.6);
    el.position.set(0, EY + 4, ZN - 4);
    g.add(el);
  }
  for (const s of [-1, 1]) {
    ST.box(0.6, 1.4, L, '#a88a50', s * (X - 0.3), 0, zc);
    GD.box(0.7, 0.7, L, '#ffc83a', s * (X - 0.35), WH - 0.8, zc);
    GD.box(0.5, 0.3, L, '#ffc83a', s * (X - 0.25), 1.4, zc);
  }
  GD.box(1.4, 0.8, L, '#ffc83a', 0, 28.2, zc);
  CP.box(5, 0.05, L - 6, '#6a1820', 0, 0, zc - 2);
  for (const s of [-1, 1]) GD.box(0.35, 0.07, L - 6, '#ffc83a', s * 2.7, 0, zc - 2);
  for (let k = 0; k < 18; k++) {
    const z = 20 - 10 * k,
      zb = z - 5;
    GD.arc(7, 1.5, '#ffc83a', 0, WH, z);
    GD.arc(6.4, 0.8, '#e0a820', 0, WH, z + 0.5);
    GD.box(14, 0.04, 0.7, '#c9a64a', 0, 0, z);
    for (const s of [-1, 1]) {
      GD.box(1.8, 21.2, 1.8, '#ffc83a', s * 6.1, 0.7, z);
      GD.box(2.5, 0.8, 2.5, '#e0a820', s * 6.1, 0, z);
      GD.box(2.5, 0.9, 2.5, '#e0a820', s * 6.1, 21.1, z);
      GD.box(0.9, 0.5, 1.1, '#e0a820', s * 5.0, 8.4, z);
      GL2.box(0.7, 1.5, 0.7, '#fff', s * 4.9, 8.9, z);
      for (const dz of [-2.8, 0, 2.8])
        for (let row = 0; row < 4; row++) {
          const y = 2.2 + row * 4.5;
          GD.box(0.5, 3.8, 2.3, '#6f6350', s * 6.75, y - 0.15, zb + dz);
          GD.box(0.5, 0.5, 2.7, '#d8bc70', s * 6.7, y + 3.6, zb + dz);
          GL.box(0.2, 3.2, 1.6, '#fff', s * 6.45, y, zb + dz);
          GL2.box(0.15, 2.2, 0.35, '#fff', s * 6.4, y + 0.5, zb + dz);
        }
    }
    GD.box(0.15, 2.2, 0.15, '#c9a64a', 0, 26.6, zb);
    GL2.box(1.2, 2, 1.2, '#fff', 0, 24.6, zb);
    GD.box(1.6, 0.3, 1.6, '#e0a820', 0, 26.4, zb);
    GD.box(1.6, 0.3, 1.6, '#e0a820', 0, 24.4, zb);
  }
  // far end: ornate golden double door
  const DZ = ZF + 0.5;
  for (const s of [-1, 1]) {
    GD.box(1.8, 19, 1.4, '#ffc83a', s * 5.5, 0, DZ + 0.2);
    GD.box(2.6, 1, 2, '#e0a820', s * 5.5, 0, DZ + 0.3);
    GD.box(2.4, 0.9, 1.8, '#e0a820', s * 5.5, 18.6, DZ + 0.3);
    GD.box(4.5, 15.8, 0.5, '#d9a21b', s * 2.25, 0, DZ - 0.1);
    for (let ix = 0; ix < 2; ix++)
      for (let iy = 0; iy < 4; iy++)
        GD.box(1.6, 3.2, 0.25, '#ffd966', s * (1.35 + ix * 1.8), 0.6 + iy * 3.8, DZ + 0.18);
    GD.tor(0.75, 0.5, '#ffd966', s * 0.9, 8, DZ + 0.3);
  }
  GD.arc(5.5, 2, '#ffc83a', 0, 16, DZ + 0.1);
  GD.arc(4.2, 1.2, '#e0a820', 0, 16, DZ + 0.3);
  GD.box(12.4, 1.2, 1.6, '#ffc83a', 0, 19, DZ + 0.1);
  GD.box(10, 0.8, 1.8, '#e0a820', 0, 20.2, DZ + 0.2);
  GL2.box(0.45, 15.8, 0.3, '#fff', 0, 0, DZ - 0.05);
  for (let i = 0; i < 3; i++) ST.box(16 - i, 0.4, 3, '#cfc5a0', 0, i * 0.4, ZF + 3 + (2 - i) * 0.8 + 1);
  const arch = new T.Mesh(new T.CircleGeometry(4.3, 24, 0, Math.PI), new T.MeshBasicMaterial({ color: '#ffeab0' }));
  arch.position.set(0, 16, DZ - 0.05);
  g.add(arch);
  const halo = new T.Mesh(new T.PlaneGeometry(34, 34), glowMat('255,200,120', 0.6));
  halo.position.set(0, 11, ZF + 0.3);
  halo.userData.noOcclude = true;
  g.add(halo);
  plane(
    g,
    15,
    40,
    new T.MeshBasicMaterial({
      map: glowTex('255,190,100'),
      transparent: true,
      depthWrite: false,
      blending: T.AdditiveBlending,
      opacity: 0.25,
    }),
    0,
    0.1,
    ZF + 20,
  );
  for (const z of [0, -35, -70, -105, -140]) {
    const l = new T.PointLight('#ffe2bc', 16, 40, 1.8);
    l.position.set(0, 16, z);
    g.add(l);
  }
  {
    const gt = glowTex('255,214,150');
    for (let k = 0; k < 18; k++)
      for (const s of [-1, 1]) {
        const sp = new T.Sprite(
          new T.SpriteMaterial({
            map: gt,
            transparent: true,
            depthWrite: false,
            blending: T.AdditiveBlending,
            opacity: 0.9,
            fog: false,
          }),
        );
        sp.scale.set(3.4, 3.4, 1);
        sp.position.set(s * 4.7, 9.3, 20 - 10 * k);
        sp.userData.noOcclude = true;
        g.add(sp);
      }
  }
  {
    const bt = canvasTex(256, 64, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, 'rgba(255,225,160,0)');
      gr.addColorStop(0.6, 'rgba(255,225,160,.18)');
      gr.addColorStop(1, 'rgba(255,236,190,.75)');
      c.fillStyle = gr;
      c.fillRect(0, 0, w, h);
      const vg = c.createLinearGradient(0, 0, 0, h);
      vg.addColorStop(0, 'rgba(0,0,0,1)');
      vg.addColorStop(0.5, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,1)');
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = vg;
      c.fillRect(0, 0, w, h);
    });
    const bm = [];
    for (const [w, h, y, rx, op] of [[60, 14, 0.1, Math.PI / 2, 0.6]]) {
      const m = new T.MeshBasicMaterial({
        map: bt,
        transparent: true,
        opacity: op,
        depthWrite: false,
        blending: T.AdditiveBlending,
        side: T.DoubleSide,
        fog: false,
      });
      const p = new T.Mesh(new T.PlaneGeometry(w, h), m);
      p.rotation.set(rx, Math.PI / 2, 0);
      if (rx) (p.rotation.set(0, Math.PI / 2, 0), (p.rotation.order = 'YXZ'), (p.rotation.x = Math.PI / 2));
      p.position.set(0, y, ZF + 0.8 + w / 2);
      p.userData.noOcclude = true;
      p.userData.noAO = true;
      p.renderOrder = 2;
      g.add(p);
      bm.push([m, op]);
    }
    for (let k = 0; k < 9; k++) {
      const m = glowMat('255,220,160', 0.2 - k * 0.015);
      const p = new T.Mesh(new T.PlaneGeometry(15 + k * 1.4, 22 + k * 1.2), m);
      p.position.set(0, 11, ZF + 6 + k * 7);
      p.userData.noOcclude = true;
      p.userData.noAO = true;
      p.renderOrder = 2;
      g.add(p);
      bm.push([m, 0.2 - k * 0.015]);
    }
    addTick(g, (t) =>
      bm.forEach(([m, op], i) => {
        m.opacity = op * (0.88 + 0.12 * Math.sin(t * 1.7 + i * 2));
      }),
    );
  }
  const dl = new T.PointLight('#ffcf80', 120, 50, 1.6);
  dl.position.set(0, 10, ZF + 12);
  g.add(dl);
  put(g, GD.mesh({ metalness: 0.55, roughness: 0.4, emissive: '#3a2800', emissiveIntensity: 0.05 }), { cs: false });
  put(g, GL.mesh({ color: '#000000', emissive: '#ffc880', emissiveIntensity: 0.35 }), { cs: false, rs: false });
  put(g, GL2.mesh({ color: '#000000', emissive: '#ffe0a0', emissiveIntensity: 1.2 }), { cs: false, rs: false });
  put(g, ST.mesh({ roughness: 0.8 }), { cs: false });
  put(g, CP.mesh({ roughness: 0.9 }), { cs: false, rs: true });
};

// ---- 8. stone_court ----
function stoneWall(r, len, h, thick, arch) {
  // jagged ruined wall, optional round arch {x, w, h}; UVs are world units (use pbrMat(name,1,1))
  const s = new T.Shape();
  s.moveTo(-len / 2, 0);
  if (arch) {
    s.lineTo(arch.x - arch.w / 2, 0);
    s.lineTo(arch.x - arch.w / 2, arch.h);
    s.absarc(arch.x, arch.h, arch.w / 2, Math.PI, 0, true);
    s.lineTo(arch.x + arch.w / 2, 0);
  }
  s.lineTo(len / 2, 0);
  let breach = Math.floor(r() * 3) + 1;
  for (let x = len / 2; x > -len / 2 + 0.1; x -= 3 + r() * 3) {
    let y = h - r() * 3;
    if (breach && r() < 0.12) {
      y = h * 0.55;
      breach--;
    }
    s.lineTo(Math.max(x, -len / 2), y);
  }
  s.lineTo(-len / 2, h - r() * 2);
  s.closePath();
  const gm = new T.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  gm.translate(0, 0, -thick / 2);
  return gm;
}
function ruinHouse(B, r, x, z, w, d, h, ry) {
  B.xf(x, 0, z, ry);
  const col = pick(r, ['#9a4a30', '#8a3f2a', '#a65a3a', '#7d3a28', '#b0623f']);
  for (const [px, pz, len, ax] of [
    [0, d / 2, w, 0],
    [0, -d / 2, w, 0],
    [-w / 2, 0, d, 1],
    [w / 2, 0, d, 1],
  ]) {
    const n = 3,
      sl = len / n;
    for (let i = 0; i < n; i++) {
      const hh = h * (0.35 + r() * 0.65),
        c = (i + 0.5) * sl - len / 2;
      if (ax) B.box(1.2, hh, sl, col, px, 0, c + pz);
      else B.box(sl, hh, 1.2, col, c + px, 0, pz);
    }
  }
  for (let i = 0; i < 5; i++)
    B.box(
      0.5,
      0.5,
      d + 2,
      '#4a3020',
      (r() - 0.5) * w,
      h * (0.6 + r() * 0.3),
      0,
      0,
      (r() - 0.5) * 0.5,
      (r() - 0.5) * 0.3,
    ); // broken beams
  if (r() < 0.6) B.box(w + 1, 0.5, d / 2 + 1, '#7a3322', 0, h * 0.75, d / 4, 0, -0.45);
  if (r() < 0.6) B.box(2.2, h * 1.35, 2.2, '#8a3f2a', w * 0.3, 0, -d * 0.3);
  for (let i = 0; i < 8; i++)
    B.ico(0.8 + r() * 1.2, '#8a5a3a', (r() - 0.5) * (w + 4), 0.4, (r() - 0.5) * (d + 4), 1.3, 0.6, 1, 0, r() * 6);
  B.xf();
}
WORLDS.stone_court = function (g, o, r) {
  const ST = batch(r, 0.08),
    IR = batch(r, 0.05),
    RK = batch(r, 0.1),
    V = batch(r, 0.1),
    RH = batch(r, 0.1),
    GLW = batch(r, 0);
  plane(
    g,
    1600,
    1600,
    pbrMat('dirt_path', 1600, 1600, { fallback: '#6e6858', color: '#7f8088' }),
    0,
    -0.08,
    0,
    0,
    true,
  );
  plane(
    g,
    80,
    62,
    pbrMat('cobble', 80, 62, { fallback: '#85817a', color: '#8c93a2' }),
    0,
    0,
    22,
    0,
    true,
  ).userData.isGround = true;
  const wallMat = pbrMat('stone_wall', 1, 1, { fallback: '#7d786e', color: '#d8d0c4' });
  wallMat.side = T.DoubleSide;
  const mkWall = (geo, x, z, ry) => {
    const m = new T.Mesh(geo, wallMat);
    m.position.set(x, 0, z);
    m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  mkWall(stoneWall(r, 80, 22, 3.4, { x: 18, w: 10, h: 12 }), 0, -10.2, 0);
  mkWall(stoneWall(r, 48, 20, 3.4), -38, 15, Math.PI / 2);
  mkWall(stoneWall(r, 48, 20, 3.4), 38, 15, -Math.PI / 2);
  for (const sx of [-1, 1]) {
    const tw = new T.Mesh(
      new T.CylinderGeometry(7, 7.6, 32, 12),
      pbrMat('stone_wall', 46, 32, { fallback: '#7d786e', color: '#d0c8bc' }),
    );
    tw.position.set(sx * 38, 16, -10);
    tw.castShadow = tw.receiveShadow = true;
    g.add(tw);
    for (let i = 0; i < 12; i++)
      if (r() < 0.65)
        ST.box(
          3.2,
          1.6 + r() * 2.4,
          2.2,
          '#8a8478',
          sx * 38 + Math.cos(i * 0.5236) * 6.6,
          32,
          -10 + Math.sin(i * 0.5236) * 6.6,
          -i * 0.5236 + Math.PI / 2,
        );
  }
  // arch dressing + spikes + rings + chains + torches + banners (back wall front face z = -8.5)
  ST.arc(5.4, 1.2, '#8a8478', 18, 12, -8.45);
  for (let i = -4; i <= 4; i++) {
    const px = i * 1.05,
      top = 12 + Math.sqrt(Math.max(0, 25 - px * px));
    IR.cyl(0.03, 0.26, 3, 5, '#3a3a42', 18 + px, top - 3.1, -9.4);
    IR.box(0.3, 2.2, 0.3, '#3a3a42', 18 + px, top - 0.1, -9.4);
  }
  IR.box(10.4, 0.5, 0.5, '#3a3a42', 18, 14.9, -9.4);
  const plateM = pbrMat('rusty_metal', 2, 2, { fallback: '#5a3a2a', color: '#c8a890' });
  for (const sx of [-1, 1]) {
    const pl = new T.Mesh(new T.BoxGeometry(2.4, 2.4, 0.6), plateM);
    pl.position.set(sx * 2.6, 7.2, -8.2);
    pl.castShadow = true;
    g.add(pl);
    IR.tor(1.1, 0.26, '#33333a', sx * 2.6, 6.6, -7.7);
    IR.box(0.5, 0.5, 0.5, '#33333a', sx * 2.6, 7.7, -7.8);
    for (let i = 0; i < 6; i++) IR.tor(0.36, 0.1, '#2c2c34', sx * 2.6, 5.9 - i * 0.62, -7.6, i % 2 ? Math.PI / 2 : 0);
    IR.tor(0.6, 0.16, '#33333a', sx * 2.6, 1.6, -7.5, 0);
    IR.box(0.6, 0.6, 0.6, '#2c2c34', sx * 2.6, 1.9, -7.6);
  }
  IR.tor(0.7, 0.16, '#33333a', 0, 10, -8, 0); // spare ring
  for (const sx of [-1, 1])
    for (const [px, py, rr] of [
      [5.6, 9.2, 1.0],
      [8.4, 5.2, 1.2],
      [3.8, 11.5, 0.8],
    ]) {
      IR.tor(rr, rr * 0.22, '#4a4a54', sx * px, py, -8.0, 0);
      IR.box(0.5, 0.5, 0.5, '#3a3a44', sx * px, py + rr + 0.1, -8.1);
      for (let i = 0; i < 8; i++)
        IR.tor(0.36, 0.1, '#3a3a44', sx * px, py - rr - 0.3 - i * 0.6, -7.9, i % 2 ? Math.PI / 2 : 0);
    }
  for (const sx of [-1, 1]) {
    IR.box(0.3, 0.3, 1.6, '#2c2c34', sx * 9.5, 8, -7.8);
    IR.cyl(0.35, 0.55, 1, 6, '#2c2c34', sx * 9.5, 8.2, -7.1);
    GLW.cone(0.5, 1.7, 6, '#ffa030', sx * 9.5, 9.2, -7.1);
    const l = new T.PointLight('#ff8a3a', 130, 45, 1.6);
    l.position.set(sx * 9.5, 10.5, -5.5);
    g.add(l);
  }
  for (const [bx, bw] of [
    [-18, 4.5],
    [-27, 4],
    [28, 4.5],
  ]) {
    const bh = 11 + r() * 3;
    V.box(bw, bh, 0.15, '#7a1c1c', bx, 19 - bh - 1, -8.4);
    V.box(bw + 0.6, 0.4, 0.3, '#3a2a20', bx, 18.4, -8.35);
    for (let k = 0; k < 3; k++)
      V.box(bw / 3, 2 + r() * 2.5, 0.15, '#6a1818', bx - bw / 2 + bw / 6 + (k * bw) / 3, 19 - bh - 3.5, -8.38);
  }
  // vines
  const vine = (x, y, z0, th, n, wd, depth) => {
    for (let i = 0; i < n; i++) {
      const len = 1.6 + r() * 1.8;
      V.cyl(wd, wd * 0.75, len, 5, pick(r, ['#4a3a28', '#5c4630', '#3e3022']), x, y, z0, 0, 0, -th);
      const nx = x + Math.sin(th) * len,
        ny = y + Math.cos(th) * len;
      if (r() < 0.25) V.box(0.5, 0.08, 0.35, '#8a6a3a', nx, ny, z0 + 0.1, r() * 3);
      if (depth < 2 && r() < 0.3)
        vine(nx, ny, z0, th + (r() < 0.5 ? 1 : -1) * (0.7 + r() * 0.6), 3 + Math.floor(r() * 3), wd * 0.7, depth + 1);
      x = nx;
      y = ny;
      th += (r() - 0.5) * 1.0;
      th = Math.max(-1.2, Math.min(1.2, th));
    }
  };
  V.xf(0, 0, -8.5, 0);
  for (let i = 0; i < 9; i++) vine(-34 + i * 7 + r() * 3, 0, 0.15, 0, 5 + Math.floor(r() * 4), 0.22, 0);
  V.xf();
  V.xf(-36.4, 0, 0, Math.PI / 2);
  for (let i = 0; i < 6; i++) vine(-6 + i * 7, 0, 0.15, 0, 4 + Math.floor(r() * 4), 0.22, 0);
  V.xf();
  V.xf(36.4, 0, 0, -Math.PI / 2);
  for (let i = 0; i < 6; i++) vine(-6 + i * 7, 0, 0.15, 0, 4 + Math.floor(r() * 4), 0.22, 0);
  V.xf();
  const dead = (x, z, s) => {
    V.cyl(1.2 * s, 0.5 * s, 12 * s, 6, '#3a2c20', x, 0, z);
    const br = (bx, by, bz, th, ph, len, wd, dpt) => {
      const [rx, rz] = lean(th, ph);
      V.cyl(wd, wd * 0.5, len, 5, '#3a2c20', bx, by, bz, ph, rx, rz);
      if (dpt < 2) {
        const ex = bx + Math.sin(th) * Math.cos(ph) * len,
          ey = by + Math.cos(th) * len,
          ez = bz + Math.sin(th) * Math.sin(ph) * len;
        for (let k = 0; k < 2; k++) br(ex, ey, ez, 0.7 + r() * 0.6, r() * 6.28, len * 0.6, wd * 0.6, dpt + 1);
      }
    };
    for (let k = 0; k < 4; k++) br(x, (7 + k * 1.6) * s, z, 0.9 + r() * 0.4, k * 1.6 + r(), 6 * s, 0.4 * s, 0);
  };
  dead(-26, 12, 1.1);
  dead(30, 22, 0.9);
  dead(-14, 38, 1.2);
  // rubble, columns, moss
  for (let i = 0; i < 90; i++) {
    const x = (r() - 0.5) * 72,
      z = -8 + r() * 52;
    if (Math.abs(x) < 10 && z > -6 && z < 8) continue;
    if (r() < 0.55 && Math.abs(x) < 30 && z > -4) continue;
    RK.ico(0.5 + r() * 1.6, '#8a8478', x, 0.3, z, 1.3, 0.6, 1, 0, r() * 6);
  }
  for (const [px, pz] of [
    [-33, -5],
    [33, -5],
    [-30, 24],
    [32, 14],
    [22, -5],
    [-12, -6],
  ])
    for (let i = 0; i < 9; i++)
      RK.ico(
        0.9 + r() * 1.8,
        pick(r, ['#8a8478', '#7a766c', '#98928a']),
        px + (r() - 0.5) * 6,
        0.5 + r() * 0.8,
        pz + (r() - 0.5) * 5,
        1.2,
        0.8,
        1.1,
        0,
        r() * 6,
      );
  for (const [cx, cz, hh] of [
    [-22, -3, 9],
    [-27, 2, 5],
    [26, 3, 7],
  ]) {
    ST.cyl(1.7, 1.5, hh, 9, '#9a9488', cx, 0, cz);
    ST.box(4, 0.8, 4, '#8a8478', cx, 0, cz);
  }
  ST.cyl(1.6, 1.6, 9, 9, '#9a9488', -12, 1.6, 10, 0, 0, Math.PI / 2);
  ST.cyl(1.6, 1.6, 7, 9, '#8f897e', 20, 1.6, 8, 0.4, 0, Math.PI / 2);
  for (let i = 0; i < 46; i++) {
    const x = (r() - 0.5) * 76,
      z = -7 + r() * 58,
      q = 1.4 + r() * 3.4;
    if (Math.abs(x) < 6 && z > -3 && z < 8) continue;
    const dirt = i % 3 === 0;
    V.cyl(
      q,
      q * (0.7 + r() * 0.5),
      0.03,
      9,
      dirt ? pick(r, ['#5e5040', '#6a5a46']) : pick(r, ['#55703a', '#4a6a34', '#627a40']),
      x,
      dirt ? 0.015 : 0.025,
      z,
    );
  }
  for (let i = 0; i < 22; i++) {
    const x = (r() - 0.5) * 70,
      z = -6 + r() * 40;
    if (Math.abs(x) < 8 && z < 6) continue;
    V.cyl(0.5 + r() * 1.3, 0.5 + r() * 1.3, 0.03, 9, pick(r, ['#3f5a2c', '#4a6a34', '#38502a']), x, 0.02, z);
  }
  // ruined houses beyond the walls, hills
  ruinHouse(RH, r, 18, -42, 18, 14, 16, 0.1);
  ruinHouse(RH, r, -14, -50, 16, 12, 12, -0.2);
  ruinHouse(RH, r, 40, -34, 14, 12, 11, 0.3);
  ruinHouse(RH, r, -48, -26, 16, 12, 13, -0.3);
  for (let i = 0; i < 13; i++) {
    const side = i % 2 ? 1 : -1,
      x = side * (52 + r() * 70),
      z = -20 + r() * 60 - (i > 7 ? 70 : 0);
    ruinHouse(RH, r, x, z, 12 + r() * 8, 10 + r() * 5, 8 + r() * 8, r() * 6);
  }
  for (let i = 0; i < 12; i++)
    ruinHouse(RH, r, -110 + i * 20 + r() * 8, -80 - r() * 50, 12 + r() * 8, 10 + r() * 5, 8 + r() * 10, r() * 6);
  RH.cyl(7, 5.5, 46, 10, '#8a3f2a', 34, 0, -78);
  for (let i = 0; i < 8; i++)
    RH.box(3, 2 + r() * 2, 2, '#8a3f2a', 34 + Math.cos(i * 0.785) * 6, 46, -78 + Math.sin(i * 0.785) * 6, -i * 0.785);
  const hills = batch(r, 0.08);
  smoothHills(hills, r, 22, 240, 400, ['#5d6a44', '#6b6548', '#4f5d3d', '#76704a']);
  for (let i = 0; i < 50; i++) {
    const a = -Math.PI * r(),
      d = 130 + r() * 200,
      x = Math.cos(a) * d,
      z = Math.sin(a) * d;
    hills.cyl(1 + r(), 0.5, 14 + r() * 14, 6, '#2e241c', x, 0, z);
  }
  put(g, hills.mesh(), { far: true, cs: false });
  put(g, ST.mesh({ roughness: 0.95 }));
  put(g, RK.mesh({ roughness: 0.95, flatShading: true }), { far: true });
  put(g, V.mesh({ roughness: 1 }), { far: true });
  put(g, RH.mesh({ roughness: 0.95 }), { far: true });
  put(g, IR.mesh({ metalness: 0.6, roughness: 0.5 }));
  put(g, GLW.mesh({ color: '#000000', emissive: '#ff9a30', emissiveIntensity: 2 }), { cs: false, rs: false });
};

// ---- 4. gold_city ----
WORLDS.gold_city = function (g, o, r) {
  const BF2 = batch(r, 0.04),
    GF2 = batch(r, 0),
    BF = batch(r, 0.04),
    GF = batch(r, 0),
    BB = batch(r, 0.05),
    GB = batch(r, 0),
    RB = batch(r, 0);
  const GOLDS = ['#ffc83a', '#f2b01e', '#e8a317', '#ffd966', '#d99a1a', '#f7c548'];
  const tile = (w, d, o2 = {}) =>
    pbrMat('stone_tiles', w, d, { fallback: '#d4b25a', color: '#f0cc66', metalness: 0.35, roughness: 0.45, ...o2 });
  const AX = 18,
    ZN = 34,
    ZF = -112;
  plane(g, 800, 1700, tile(800, 1700), -AX - 400, -0.02, 0, 0, true);
  plane(g, 800, 1700, tile(800, 1700), AX + 400, -0.02, 0, 0, true);
  plane(g, 2 * AX, 800, tile(2 * AX, 800), 0, -0.02, ZN + 400, 0, true);
  plane(g, 2 * AX, 700, tile(2 * AX, 700), 0, -0.02, ZF - 350, 0, true);
  const av = new T.Mesh(
    new T.PlaneGeometry(2 * AX, ZN - ZF),
    pbrMat('stone_tiles', 2 * AX, ZN - ZF, {
      fallback: '#f0c850',
      color: '#fff0a8',
      metalness: 0.3,
      roughness: 0.32,
      emissive: '#c8962a',
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 0.96,
    }),
  );
  av.rotation.x = -Math.PI / 2;
  av.position.set(0, 0, (ZN + ZF) / 2);
  av.receiveShadow = true;
  av.userData.noOcclude = true;
  av.userData.isGround = true;
  g.add(av);
  {
    const gl1 = glintTex(r, [5, 12], 18, '255,244,200'),
      gl2 = causticTex(r, [3, 8], '255,236,170', 22),
      m1 = addMat(gl1, 0.8),
      m2 = addMat(gl2, 0.3);
    for (const m of [m1, m2]) {
      off(m, -3);
      plane(g, 2 * AX, ZN - ZF, m, 0, 0.05, (ZN + ZF) / 2).userData.noAO = true;
    }
    addTick(g, (t) => {
      gl1.offset.set(0, t * 0.08);
      gl2.offset.set(t * 0.01, -t * 0.05);
      m1.opacity = 0.6 + 0.25 * Math.sin(t * 3.3);
      m2.opacity = 0.25 + 0.1 * Math.sin(t * 1.4);
    });
  }
  plane(g, 2 * AX + 40, ZN - ZF + 40, mt('#3a2808'), 0, -190, (ZN + ZF) / 2);
  // avenue dressing
  for (const s of [-1, 1]) {
    BF.box(4.2, 0.6, ZN - ZF, '#fff0c0', s * (AX + 2.1), 0, (ZN + ZF) / 2);
    GF.box(0.5, 0.06, ZN - ZF, '#fff', s * (AX - 0.6), 0.02, (ZN + ZF) / 2);
    GF.box(0.5, 0.06, ZN - ZF, '#fff', s * 6, 0.02, (ZN + ZF) / 2);
  }
  for (let z = ZN - 6; z > ZF; z -= 10) BF.box(2 * AX, 0.04, 0.35, '#c9962a', 0, 0.0, z);
  for (let z = ZN - 6; z > ZF + 6; z -= 16)
    for (const s of [-1, 1]) {
      const x = s * (AX + 1.2);
      BF.cyl(0.5, 0.35, 9, 6, '#e8b830', x, 0.6, z);
      BF.box(0.9, 0.5, 3, '#e8b830', x - s * 1.1, 9.1, z);
      BF.box(1.6, 0.4, 1.6, '#e8b830', x, 0.6, z);
      GF.ico(1.2, '#fff', x - s * 2.2, 10.4, z, 1, 1, 1, 1);
    }
  // towers
  const tower = (B2, G2, cx, cz, dx, wz, H, kind, face, mir) => {
    // face: +1 = avenue is at -x side... face = side sign (building on side s)
    const col = pick(r, GOLDS),
      col2 = pick(r, GOLDS),
      s = face;
    const strips = (bx, by, tx, th, tz) => {
      const ax = s ? bx - (s * tx) / 2 : null;
      for (let y = by + 3; y < by + th - 2; y += 4.6) {
        if (s) G2.box(0.4, 1.2, tz * 0.82, '#fff', ax - s * 0.05, y, cz);
        G2.box(tx * 0.82, 1.2, 0.4, '#fff', bx, y, cz + tz / 2 + 0.05);
      }
      for (let x = -tx / 2 + 2; x < tx / 2 - 1; x += 3.4)
        B2.box(0.6, th, 0.6, '#d99a1a', bx + x, by, cz + tz / 2 + 0.1);
    };
    if (kind === 0) {
      const t = [
        [1, 0.55],
        [0.8, 0.22],
        [0.6, 0.14],
      ];
      let y = 0;
      for (let i = 0; i < 3; i++) {
        const tx = dx * t[i][0],
          th = H * t[i][1],
          tz = wz * t[i][0];
        B2.box(tx, th, tz, i ? col2 : col, cx, y, cz);
        B2.box(tx + 1, 1, tz + 1, '#ffe08a', cx, y + th - 1, cz);
        strips(cx, y, tx, th, tz);
        y += th;
      }
      B2.cone(wz * 0.14, H * 0.16, 6, '#ffd966', cx, y, cz);
      B2.box(0.5, H * 0.1, 0.5, '#ffd966', cx, y + H * 0.16, cz);
    } else if (kind === 1) {
      const rd = Math.min(dx, wz) * 0.46;
      B2.cyl(rd, rd * 0.85, H * 0.82, 20, col, cx, 0, cz);
      for (let y = 6; y < H * 0.82; y += 9) B2.cyl(rd + 0.6, rd + 0.6, 1.2, 20, '#ffe08a', cx, y, cz);
      for (let y = 3; y < H * 0.8; y += 4.6)
        for (let k = 0; k < 20; k += 1) {
          const a = (k * Math.PI * 2) / 20;
          if (Math.sin(a) > -0.1 && (!s || Math.cos(a) * -s > -0.2))
            G2.box(
              rd * 0.22,
              1.2,
              0.5,
              '#fff',
              cx + Math.cos(a) * (rd * 0.98 * (1 - (y / H) * 0.15)),
              y,
              cz + Math.sin(a) * (rd * 0.98 * (1 - (y / H) * 0.15)),
              -a + Math.PI / 2,
            );
        }
      B2.dome(rd * 0.9, '#ffd966', cx, H * 0.82, cz, 0.9);
      B2.cone(0.6, H * 0.2, 6, '#ffd966', cx, H * 0.82 + rd * 0.8, cz);
    } else {
      B2.box(dx, H, wz, col, cx, 0, cz);
      B2.box(dx + 1.6, 2, wz + 1.6, '#ffe08a', cx, H, cz);
      B2.box(dx * 0.6, 5, wz * 0.6, col2, cx, H + 2, cz);
      strips(cx, 0, dx, H, wz);
      if (s)
        for (let k = 0; k < 4; k++)
          B2.box(1.4, H * 1.01, 2.6, '#c98a14', cx - s * (dx / 2 + 0.5), 0, cz - wz / 2 + ((k + 0.5) * wz) / 4);
    }
  };
  for (const s of [-1, 1]) {
    let z = 14;
    let i = 0;
    while (z > -66) {
      const wz = 18 + r() * 10,
        dx = 26 + r() * 10,
        d = (14 - z) / 120,
        H = 48 + r() * 60 + d * 70;
      tower(BF, GF, s * (AX + 4.2 + dx / 2), z - wz / 2, dx, wz, H, Math.floor(r() * 3), s);
      z -= wz + 1.5 + r() * 2.5;
      i++;
    }
  }
  for (const s of [-1, 1])
    for (let z = 40; z > -230; z -= 28 + r() * 14)
      for (const lane of [0, 1]) {
        const dx = 30 + r() * 20,
          wz = 22 + r() * 10,
          x = s * (AX + 4.2 + 40 + lane * 62 + dx / 2 + r() * 14);
        if (z < -45 && z > -170 && Math.abs(x) < 125) continue;
        tower(BB, GB, x, z, dx, wz, 55 + r() * 120 + Math.max(0, -z) * 0.25, Math.floor(r() * 3), 0);
      }
  for (let x = -200; x < 200; x += 30 + r() * 14) {
    const dx = 24 + r() * 14;
    if (Math.abs(x) < 70) continue;
    tower(BB, GB, x, -170 - r() * 80, dx, 24 + r() * 10, 70 + r() * 150, Math.floor(r() * 3), 0);
  }
  // skybridges
  for (const [z, y] of [
    [-48, 62],
    [-64, 100],
  ]) {
    BF.box(2 * AX + 10, 3, 7, '#f2b01e', 0, y, z);
    BF.box(2 * AX + 10, 0.8, 8, '#ffe08a', 0, y + 3, z);
    GF.box(2 * AX, 0.9, 7.2, '#fff', 0, y + 1, z);
    BF.box(2 * AX + 10, 0.8, 8, '#ffe08a', 0, y - 0.8, z);
  }
  // domed palace
  const PB = BF2,
    PG = GF2,
    PZ = -92,
    gold = '#ffc83a',
    gd2 = '#e0a820',
    gd3 = '#ffe08a';
  PB.box(120, 4, 44, '#f2d27a', 0, -0.02, PZ + 2);
  for (let i = 0; i < 5; i++) PB.box(52 + i * 2, 0.9, 8, '#f2d27a', 0, i * 0.8, ZF + 4 - i * 1.6 + 6);
  PB.box(62, 30, 26, gold, 0, 4, PZ);
  PB.box(66, 2, 30, gd3, 0, 33, PZ);
  PB.prism(66, 8, 8, gd2, 0, 34, PZ + 11);
  for (let i = -7; i <= 7; i++) {
    PB.cyl(1.3, 1.1, 24, 12, gd3, i * 4, 4, PZ + 15);
    PB.box(3, 0.8, 3, gd2, i * 4, 4, PZ + 15);
    PB.box(3, 0.8, 3, gd2, i * 4, 27.2, PZ + 15);
  }
  PB.box(64, 3, 5, gd2, 0, 28, PZ + 15);
  PG.box(8, 15, 0.4, '#fff', 0, 4, PZ + 13.2);
  PB.arc(4.6, 1.4, '#ffe08a', 0, 19, PZ + 13.4);
  for (const sx of [-1, 1])
    for (let k = 0; k < 4; k++) {
      PG.box(3.4, 11, 0.4, '#fff', sx * (11 + k * 5), 8, PZ + 13.2);
    }
  PB.cyl(19, 19, 14, 28, gd2, 0, 34, PZ);
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * 6.2832;
    PG.box(2.2, 6, 0.5, '#fff', Math.cos(a) * 19.1, 38, PZ + Math.sin(a) * 19.1, -a + Math.PI / 2);
    PB.box(1.2, 14, 1.2, gd3, Math.cos(a + 0.22) * 19.3, 34, PZ + Math.sin(a + 0.22) * 19.3);
  }
  PB.dome(20, gold, 0, 48, PZ, 0.95);
  PB.cyl(1.2, 1.2, 14, 8, gd3, 0, 66, PZ);
  PB.ico(2.2, gd3, 0, 82, PZ);
  PB.cone(0.4, 10, 6, gd3, 0, 84, PZ);
  for (const sx of [-1, 1]) {
    const tx = sx * 40;
    PB.cyl(7.5, 6.5, 44, 18, gd2, tx, 0, PZ + 3);
    for (let y = 6; y < 40; y += 8) PB.cyl(8.1, 8.1, 1.1, 18, gd3, tx, y, PZ + 3);
    for (let y = 4; y < 38; y += 4.6)
      for (let k = 0; k < 9; k++) {
        const b = -1.3 + k * 0.325;
        PG.box(1.6, 1.2, 0.4, '#fff', tx + Math.sin(b) * 7.1, y, PZ + 3 + Math.cos(b) * 7.1, b);
      }
    PB.dome(8, gold, tx, 44, PZ + 3, 1.1);
    PB.cone(0.5, 10, 6, gd3, tx, 52.5, PZ + 3);
    PB.box(28, 22, 20, gold, sx * 66, 4, PZ + 4);
    PB.box(30, 1.6, 22, gd3, sx * 66, 26, PZ + 4);
    PG.box(22, 1.2, 0.4, '#fff', sx * 66, 12, PZ + 14.2);
    PG.box(22, 1.2, 0.4, '#fff', sx * 66, 18, PZ + 14.2);
    PB.dome(9, gold, sx * 66, 26, PZ + 4, 0.8);
  }
  const m1 = put(g, BF.mesh({ metalness: 0.75, roughness: 0.28, emissive: '#6a4a00', emissiveIntensity: 0.12 }), {
      far: true,
    }),
    m2 = put(g, GF.mesh({ color: '#000000', emissive: '#4aeaff', emissiveIntensity: 1.8 }), {
      far: true,
      cs: false,
      rs: false,
    });
  put(g, BB.mesh({ metalness: 0.7, roughness: 0.3, emissive: '#6a4a00', emissiveIntensity: 0.12 }), { far: true });
  put(g, GB.mesh({ color: '#000000', emissive: '#4aeaff', emissiveIntensity: 1.5 }), {
    far: true,
    cs: false,
    rs: false,
  });
  const mi = BF.mirror(0.6, { fog: true }),
    mg = GF.mirror(0.9, {});
  mi.userData.noOcclude = mg.userData.noOcclude = true;
  g.add(mi, mg);
  {
    const pal = new T.Group(),
      PS = 1.3;
    pal.scale.setScalar(PS);
    pal.position.set(0, 0, PZ * (1 - PS));
    g.add(pal);
    put(pal, PB.mesh({ metalness: 0.5, roughness: 0.32, emissive: '#b88a1a', emissiveIntensity: 0.4 }), { far: true });
    put(pal, PG.mesh({ color: '#000000', emissive: '#7af0ff', emissiveIntensity: 1.8 }), {
      far: true,
      cs: false,
      rs: false,
    });
    const pm = PB.mirror(0.6, { fog: true }),
      pg = PG.mirror(0.9, {});
    pm.userData.noOcclude = pg.userData.noOcclude = true;
    pal.add(pm, pg);
    const pl = new T.PointLight('#ffe39a', 500, 140, 1.4);
    pl.position.set(0, 40, PZ + 40);
    g.add(pl);
  }
};

// ---- 5. ocean_world ----
const frond = (B, c, x, y, z, w, len, yaw, droop, th = 0.25) =>
  B.add(P.cyl(4, 0, 1), c, x, y, z, th, len, w, yaw, 0, -(Math.PI / 2 - droop)); // flat leaf radiating along +x rotated by yaw (about y), tilted up by droop... (droop = elevation above horizontal)
const palm = (B, r, x, z, h, lean2) => {
  let px = x,
    pz = z;
  for (let i = 0; i < 6; i++) {
    const nx = px + Math.cos(lean2) * h * 0.05 * (i + 1),
      nz = pz + Math.sin(lean2) * h * 0.05 * (i + 1);
    B.cyl(0.75 - i * 0.06, 0.7 - i * 0.06, h / 6 + 0.3, 7, i % 2 ? '#8a6a3a' : '#7a5a2e', nx, (i * h) / 6, nz);
    if (i === 5) {
      px = nx;
      pz = nz;
    } else {
      px = nx;
      pz = nz;
    }
  }
  for (let k = 0; k < 8; k++)
    frond(
      B,
      pick(r, ['#2fa84a', '#3dbd55', '#28934a']),
      px,
      h - 0.2,
      pz,
      1.4,
      9 + r() * 2,
      k * 0.785 + r() * 0.2,
      0.15 + r() * 0.35,
      0.12,
    );
  for (let k = 0; k < 3; k++) B.ico(0.45, '#6a4a22', px + (r() - 0.5), h - 0.6, pz + (r() - 0.5), 1, 1, 1, 0);
};
WORLDS.ocean_world = function (g, o, r) {
  const B = batch(r, 0.08),
    RK = batch(r, 0.1),
    FM = batch(r, 0),
    HL = batch(r, 0.08);
  const wt = canvasTex(
    512,
    512,
    (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#1d9be8');
      gr.addColorStop(0.5, '#22b2f0');
      gr.addColorStop(1, '#1d9be8');
      c.fillStyle = gr;
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        const y0 = r() * h,
          amp = 6 + r() * 14,
          ph = r() * 6,
          fr = 1 + Math.floor(r() * 3);
        c.strokeStyle = `rgba(190,238,255,${0.12 + r() * 0.22})`;
        c.lineWidth = 2 + r() * 7;
        c.beginPath();
        for (let x = 0; x <= w; x += 8) {
          const y = y0 + Math.sin((x / w) * 6.2832 * fr + ph) * amp;
          x ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.stroke();
      }
      for (let i = 0; i < 200; i++) {
        c.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.35})`;
        c.fillRect(r() * w, r() * h, 2 + r() * 6, 1.5);
      }
    },
    [3000 / 110, 3000 / 110],
  );
  const water = new T.Mesh(
    new T.PlaneGeometry(3000, 3000),
    new T.MeshStandardMaterial({
      map: wt,
      color: '#ffffff',
      roughness: 0.28,
      metalness: 0.05,
      emissive: '#0a5aa8',
      emissiveIntensity: 0.35,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -1.5;
  water.receiveShadow = true;
  water.userData.noOcclude = true;
  water.userData.isGround = true;
  g.add(water);
  {
    const c1 = causticTex(r, [3000 / 60, 3000 / 60]),
      c2 = causticTex(r, [3000 / 95, 3000 / 95], '190,235,255', 20),
      gl = glintTex(r, [3000 / 40, 3000 / 40], 16),
      mats = [addMat(c1, 0.38), addMat(c2, 0.28), addMat(gl, 0.7)];
    mats.forEach((m, i) => {
      off(m, -2 - i);
      const p = new T.Mesh(new T.PlaneGeometry(3000, 3000), m);
      p.rotation.x = -Math.PI / 2;
      p.position.y = -1.49 + i * 0.004;
      p.userData.noOcclude = true;
      p.userData.noAO = true;
      g.add(p);
    });
    addTick(g, (t) => {
      wt.offset.set(t * 0.03, t * 0.018);
      c1.offset.set(-t * 0.06, t * 0.04);
      c2.offset.set(t * 0.04, t * 0.07);
      gl.offset.set(t * 0.1, -t * 0.06);
      mats[2].opacity = 0.6 + 0.25 * Math.sin(t * 3.1);
      mats[0].opacity = 0.36 + 0.1 * Math.sin(t * 1.3);
    });
  }
  const band = off(new T.MeshBasicMaterial({ color: '#9aeaff', transparent: true, opacity: 0.22, depthWrite: false }));
  for (let i = 0; i < 40; i++) {
    const m = disc(g, 1, band, (r() - 0.5) * 500, -1.45, -r() * 420 + 60, 40 + r() * 120, 2 + r() * 6, 20);
    m.receiveShadow = false;
  }
  // islet
  const ISX = 0,
    ISZ = -2;
  B.cyl(19, 16, 4.6, 28, '#e8cf8a', ISX, -4.6, ISZ);
  B.cyl(16.2, 16.2, 0.08, 28, '#d9bf84', ISX, -0.04, ISZ);
  B.cyl(13.8, 13.8, 0.06, 28, '#f6e3b0', ISX, 0.0, ISZ);
  for (let i = 0; i < 26; i++) {
    const a = -2.9 + r() * 2.6,
      d = 13 + r() * 5,
      q = 1.4 + r() * 3.4;
    RK.ico(
      q,
      pick(r, ['#7d6b5a', '#8a7866', '#6f5f50']),
      ISX + Math.cos(a) * d,
      q * 0.2 - 0.4,
      ISZ + Math.sin(a) * d * 0.9,
      1,
      0.85,
      1,
      0,
      r() * 6,
    );
  }
  for (let i = 0; i < 14; i++) {
    const a = r() * 6.28,
      d = 14.5 + r() * 2;
    RK.ico(0.5 + r() * 0.8, '#9a8a78', ISX + Math.cos(a) * d, 0.1, ISZ + Math.sin(a) * d, 1.2, 0.6, 1, 0, r() * 6);
  }
  palm(B, r, -10, -9, 15, 0.6);
  palm(B, r, -7, -12, 12, 2.4);
  palm(B, r, 11, -8, 13, -0.4);
  for (let i = 0; i < 18; i++) {
    const a = r() * 6.28,
      d = 6 + r() * 7;
    if (Math.abs(Math.cos(a) * d) < 7 && Math.sin(a) * d > -5 && Math.sin(a) * d < 5) continue;
    B.ico(
      0.35 + r() * 0.3,
      pick(r, ['#ff8aa0', '#ffffff', '#ffd54a']),
      ISX + Math.cos(a) * d,
      0.3,
      ISZ + Math.sin(a) * d,
      1.3,
      0.6,
      1,
      0,
    );
  }
  B.cyl(0.6, 0.6, 8, 6, '#a08a68', 12, 0.4, 4, 0.3, 0, Math.PI / 2 - 0.05);
  for (const [ro, ri, op] of [
    [24, 15.5, 0.6],
    [32, 24, 0.25],
  ]) {
    const m = new T.Mesh(
      new T.RingGeometry(ri, ro, 48),
      off(new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: op, depthWrite: false }), -2),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(ISX, -1.44, ISZ);
    m.userData.noOcclude = true;
    g.add(m);
  }
  // sea stacks
  const stack = (x, z, h, rb, foam) => {
    let y = -4,
      cr = rb,
      cx = x,
      cz = z;
    const n = 3 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const sh = h / n;
      RK.cyl(
        cr,
        cr * (0.72 + r() * 0.12),
        sh + 1,
        7,
        pick(r, ['#8a7a6a', '#9c8b78', '#7d6d5e', '#a39280']),
        cx,
        y,
        cz,
        r() * 3,
      );
      y += sh;
      cr *= 0.8;
      cx += (r() - 0.5) * rb * 0.25;
      cz += (r() - 0.5) * rb * 0.25;
    }
    if (r() < 0.6) {
      B.ico(cr * 1.7, '#58b84a', cx, y - cr * 0.2, cz, 1, 0.6, 1, 1);
      B.ico(cr, '#6cc855', cx + cr * 0.3, y, cz, 1, 0.6, 1, 1);
    }
    FM.cyl(rb * 1.7, rb * 1.7, 0.1, 18, '#ffffff', x, -1.45, z);
  };
  for (let i = 0; i < 38; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * (i < 28 ? 2.4 : 6.0),
      d = 48 + Math.pow(r(), 1.2) * 300;
    const x = Math.cos(a) * d,
      z = Math.sin(a) * d;
    if (Math.hypot(x, z + 2) < 40) continue;
    stack(x, z, 14 + r() * 58, 4 + r() * 9);
  }
  stack(-16, -88, 46, 9);
  stack(16, -88, 38, 8);
  RK.box(44, 9, 15, '#8f7e6c', -0, 38, -88);
  RK.ico(10, '#8f7e6c', -20, 38, -88, 1, 0.9, 1, 1);
  RK.ico(9, '#8f7e6c', 20, 38, -88, 1, 0.9, 1, 1);
  B.ico(11, '#58b84a', 0, 47, -88, 2, 0.35, 0.7, 1);
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI * (0.05 + r() * 0.9),
      d = 360 + r() * 110,
      rr = 40 + r() * 70;
    HL.ico(rr, pick(r, ['#3f9a5a', '#4aa86a', '#357f55']), Math.cos(a) * d, -rr * 0.55, Math.sin(a) * d, 1, 0.5, 1, 2);
    HL.cyl(rr * 1.3, rr * 1.3, 0.6, 20, '#f3dca0', Math.cos(a) * d, -1.7, Math.sin(a) * d);
  }
  put(g, B.mesh(), { far: true });
  put(g, RK.mesh({ flatShading: true }), { far: true });
  put(g, HL.mesh(), { far: true, cs: false });
  put(
    g,
    FM.mesh({
      color: '#ffffff',
      emissive: '#ffffff',
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    }),
    { far: true, cs: false },
  );
};

// ---- 6. jungle ----
WORLDS.jungle = function (g, o, r) {
  const B = batch(r, 0.2),
    F = batch(r, 0.2),
    RK = batch(r, 0.08),
    GR = ['#3c8a3a', '#4c9c44', '#33773a'],
    nearLine = (x, z, m) => Math.hypot(x, Math.max(Math.abs(z) - 10, 0)) < m;
  plane(g, 1600, 1600, pbrMat('grass', 1600, 1600, { fallback: '#3f9a3a', color: '#5ec244' }), 0, -0.05, 0, 0, true);
  disc(g, 19, off(pbrMat('dirt_path', 38, 38, { fallback: '#8a6a42', color: '#c8a068' }), -1), 0, 0.02, 0, 1, 1.05);
  disc(g, 26, off(mt('#7acb54', { roughness: 1 }), -1), 0, 0.01, 0, 1, 1.05);
  for (let i = 0; i < 30; i++) {
    const a = r() * 6.28,
      d = r() * 18;
    B.cyl(
      0.5 + r(),
      0.5 + r(),
      0.03,
      7,
      pick(r, ['#6a4a22', '#4a6a2a', '#7a5a2a']),
      Math.cos(a) * d,
      0.03,
      Math.sin(a) * d * 1.05,
    );
  }
  const fern = (x, z, s) => {
    if (nearLine(x, z, 8)) s = Math.min(s, 1.25);
    const n = 6 + Math.floor(r() * 3),
      c = pick(r, ['#3a9a3a', '#58c04a', '#2e8a3a']);
    for (let k = 0; k < n; k++)
      frond(F, c, x, 0, z, 1.2 * s, 4.5 * s, (k * 6.28) / n + r() * 0.3, 0.5 + r() * 0.5, 0.1);
  };
  const bigTree = (x, z, H, tr) => {
    const lx = (r() - 0.5) * 2,
      lz = (r() - 0.5) * 2;
    B.cyl(tr, tr * 0.55, H * 0.5, 8, '#6b4a2e', x, 0, z);
    B.cyl(tr * 0.55, tr * 0.42, H * 0.52, 8, '#7a5a3a', x + lx * 0.6, H * 0.48, z + lz * 0.6);
    for (let k = 0; k < 4; k++) {
      const a = k * 1.57 + r();
      B.box(0.8, tr * 2.4, tr * 1.8, '#6b4a2e', x + Math.cos(a) * tr * 0.9, 0, z + Math.sin(a) * tr * 0.9, -a, 0, 0);
    }
    const cx = x + lx * 0.6,
      cz = z + lz * 0.6,
      sp = 9 + r() * 6;
    for (let k = 0; k < 7; k++) {
      const a = r() * 6.28,
        d = r() * sp;
      B.ico(8 + r() * 8, pick(r, GR), cx + Math.cos(a) * d, H - 1 + r() * 5, cz + Math.sin(a) * d, 1, 0.5, 1, 1);
    }
    for (let k = 0; k < 7; k++)
      frond(F, pick(r, GR), cx, H - 1, cz, 2.2, 13 + r() * 5, k * 0.9 + r() * 0.3, 0.1 + r() * 0.35, 0.3);
    for (let k = 0; k < 3; k++) {
      const a = r() * 6.28,
        d = 4 + r() * sp * 0.8,
        len = 16 + r() * H * 0.5;
      B.cyl(0.22, 0.16, len, 5, '#2f7a2a', cx + Math.cos(a) * d, H - len + 1, cz + Math.sin(a) * d);
      B.ico(0.8, '#4cc04a', cx + Math.cos(a) * d, H - len + 1, cz + Math.sin(a) * d, 1, 1.6, 1, 0);
    }
  };
  for (let i = 0; i < 150; i++) {
    const a = r() * 6.28,
      d = 24 + Math.pow(r(), 0.85) * 170,
      x = Math.cos(a) * d,
      z = Math.sin(a) * d;
    if (Math.hypot(x - 30, z - 70) < 34) continue;
    bigTree(x, z, 34 + r() * 40, 1.4 + r() * 1.8);
  }
  for (let i = 0; i < 34; i++) {
    const a = r() * 6.28,
      d = 22 + r() * 40,
      x = Math.cos(a) * d,
      z = Math.sin(a) * d,
      H = 10 + r() * 12;
    B.cyl(0.8, 0.5, H, 7, '#7a5a3a', x, 0, z);
    for (let k = 0; k < 7; k++) frond(F, pick(r, GR), x, H - 0.5, z, 2, 9 + r() * 3, k * 0.9, 0.15 + r() * 0.3, 0.25);
  }
  for (let i = 0; i < 230; i++) {
    const a = r() * 6.28,
      d = 12 + r() * 70;
    fern(Math.cos(a) * d, Math.sin(a) * d, 0.8 + r() * 1.1);
  }
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7 + r() * 0.4,
      d = 18 + r() * 24,
      x = Math.cos(a) * d,
      z = Math.sin(a) * d,
      q = Math.min(2.4 + r() * 3, nearLine(x, z, 10) ? 3.6 : 9);
    RK.ico(q, '#6e7a66', x, q * 0.35, z, 1.2, 0.8, 1, 1, r() * 6);
    B.ico(q * 0.8, '#4a8a3a', x, q * 0.85, z, 1.1, 0.35, 0.9, 1);
  }
  for (let i = 0; i < 50; i++) {
    const a = r() * 6.28,
      d = 13 + r() * 18;
    B.ico(
      0.3 + r() * 0.25,
      pick(r, ['#ff5a6a', '#ffd23f', '#ff9ad0', '#ffffff', '#b28dff']),
      Math.cos(a) * d,
      0.35,
      Math.sin(a) * d,
      1,
      0.7,
      1,
      0,
    );
  }
  for (let i = 0; i < 260; i++) {
    const a = r() * 6.28,
      d = 170 + r() * 270,
      rr = 18 + r() * 18;
    B.ico(rr, pick(r, GR), Math.cos(a) * d, 20 + r() * 40, Math.sin(a) * d, 1, 0.5, 1, 1);
  }
  for (let i = 0; i < 16; i++) {
    const a = -Math.PI * (0.05 + r() * 0.9),
      d = 320 + r() * 130,
      rr = 60 + r() * 80;
    B.ico(rr, pick(r, ['#3a8a52', '#3a9a5a', '#2f7a4a']), Math.cos(a) * d, -rr * 0.3, Math.sin(a) * d, 1, 0.7, 1, 2);
  }
  rays(g, r, 6, [-70, -160, 140, 110], 42, 0.2);
  put(g, B.mesh({ roughness: 0.75 }), { far: true });
  put(g, F.mesh({ roughness: 0.7, side: T.DoubleSide }), { far: true });
  put(g, RK.mesh({ flatShading: true }), { far: true });
};

// ---- seabed: a sandy sea floor to stand ON underwater (pair with medium "underwater": fog, tint and bubbles come from the scene) ----
WORLDS.seabed = function (g, o, r) {
  const B = batch(r, 0.08),
    RK = batch(r, 0.1),
    K = batch(r, 0.06),
    FAR = batch(r, 0.1);
  plane(g, 1600, 1600, mt('#d9c48c', { roughness: 0.95 }), 0, -0.1, 0, 0, true);
  const sand = off(mt('#c9b378', { roughness: 1 }), -1);
  for (let i = 0; i < 46; i++)
    disc(g, 1, sand, (r() - 0.5) * 160, 0.02, -r() * 150 + 30, 6 + r() * 16, 2 + r() * 5, 20);
  const rip = off(mt('#bda36a', { roughness: 1 }), -2);
  for (let i = 0; i < 120; i++) {
    const x = (r() - 0.5) * 120,
      z = -r() * 110 + 25,
      a = r() * 0.5 - 0.25;
    B.box(5 + r() * 9, 0.05, 0.25 + r() * 0.3, '#b59a60', x, 0.03, z, a);
  }
  for (let i = 0; i < 26; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.6,
      d = 30 + r() * 120,
      q = 3 + r() * 9;
    RK.ico(
      q,
      pick(r, ['#6d7a7a', '#5f6e70', '#7d8584', '#4f6064']),
      Math.cos(a) * d,
      q * 0.25,
      Math.sin(a) * d,
      1.1,
      0.8,
      1,
      0,
      r() * 6,
    );
  }
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 46 + (r() - 0.5) * 14,
      z = -95 - r() * 40,
      h = 30 + r() * 30;
    RK.cyl(9 + r() * 7, 5, h, 7, '#56676a', x, 0, z, r() * 3);
    RK.ico(11, '#4b5d60', x + 6, h * 0.85, z, 1, 0.8, 1, 1);
  }
  for (let i = 0; i < 90; i++) {
    const x = (r() - 0.5) * 150,
      z = -r() * 130 + 20;
    if (z > -14 || Math.abs(x) < 6) continue;
    let y = 0,
      lean = (r() - 0.5) * 0.25,
      h = 8 + r() * 16;
    const n = 6;
    for (let k = 0; k < n; k++) {
      K.cyl(0.5, 0.6, h / n + 0.3, 5, pick(r, ['#2f7d4a', '#3a8f54', '#276b3f']), x + lean * k * 2, y, z, 0, 0, lean);
      y += h / n;
    }
  }
  smoothHills(FAR, r, 18, 200, 330, ['#3b6f78', '#2f5f6a', '#4a7f86']);
  rays(g, r, 8, [-60, -150, 120, 50], 46, 0.22);
  put(g, B.mesh({ roughness: 0.9 }), { far: true });
  put(g, RK.mesh({ flatShading: true }), { far: true });
  put(g, K.mesh({ roughness: 0.6, side: T.DoubleSide }), { far: true });
  put(g, FAR.mesh({ roughness: 1 }), { far: true, cs: false });
};
