// Props (static/attached objects) and FX (deterministic particle effects driven by time).
import { makeScatter } from './modelprops.js';
import * as THREE from 'three';
import { box, mat, sign, car, tree, rng } from './sets.js';
import { makeQuarks, isQuarks } from './quarks.js';
import { pbrMat } from './pbr.js';

let _hg; const heartGeo = () => { if (_hg) return _hg; const s = new THREE.Shape(); s.moveTo(0, -1); s.bezierCurveTo(-2, .5, -1, 1.8, 0, .8); s.bezierCurveTo(1, 1.8, 2, .5, 0, -1); _hg = new THREE.ExtrudeGeometry(s, { depth: .3, bevelEnabled: false }); _hg.scale(.28, .28, .28); return _hg; };
const gold = () => mat('#ffcc33', { metalness: .7, roughness: .25, emissive: '#6a4a00', emissiveIntensity: .4 });
// How each prop sits in a hand (see holdProp in world.js). two = carried with both hands in front of the chest;
// grip = height (0 bottom .. 1 top) where the hand closes; hs = default scale when held; yaw/tilt = extra turn (deg / rad).
export const GRIP = {
  phone: { yaw: 180, tilt: -.3, grip: .35 }, trophy: { grip: .3, hs: .85 }, sword: { grip: .12, hs: .8 }, cup: { grip: .45 }, lightbulb: { grip: .15, hs: .6 }, sign: { grip: .1, hs: .45 },
  coin: { grip: .3, hs: .5 }, cash: { grip: .5 }, book: { tilt: -.9, grip: .4 }, heart: { grip: .25, hs: .55 }, ball: { grip: .2, hs: .45 },
  umbrella: { grip: .08, hs: .8 }, icecream: { grip: .1, hs: .75 }, lantern: { grip: .9, hs: .9 },
  gift: { two: 1, hs: .7 }, box: { two: 1, hs: .7 }, pizzabox: { two: 1, hs: .75 }, pizza: { two: 1, hs: .7 }, cake: { two: 1, hs: .55 }, chest: { two: 1, hs: .6 }, moneystack: { two: 1, hs: .4 },
};
export const NO_HOLD = ['car', 'tree', 'door', 'bed', 'table', 'portal', 'rainbow', 'raincloud', 'cloud', 'island', 'balloon', 'skywhale', 'statue', 'hatch', 'chains', 'stairs'];
// Seven-segment display (ghost segments stay faintly visible, like a real LED panel). set('59:59') redraws only when the text changes.
const SEG7 = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
export function segDisplay(w, h, col = '#ffe9a8') {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.max(64, Math.round(512 * h / w)); const x = cv.getContext('2d'), t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#fff', emissiveMap: t, emissiveIntensity: 1.7, roughness: .4 })); let cur = null;
  const set = (str) => { if (str === cur) return; cur = str; const W = cv.width, H = cv.height; x.fillStyle = '#070707'; x.fillRect(0, 0, W, H); const n = str.length, dw = W / (n + .6), dh = H * .72, y0 = H * .14, th = Math.min(dh * .12, dw * .16);
    [...str].forEach((ch, i) => { const x0 = dw * (i + .3) + dw * .14, sw = dw * .72; if (ch === ':') { x.fillStyle = col; for (const yy of [.33, .67]) { x.beginPath(); x.arc(x0 + sw / 2, y0 + dh * yy, th * .7, 0, 7); x.fill(); } return; }
      const sg = { a: [x0 + th, y0, sw - 2 * th, th], g: [x0 + th, y0 + dh / 2 - th / 2, sw - 2 * th, th], d: [x0 + th, y0 + dh - th, sw - 2 * th, th], f: [x0, y0 + th, th, dh / 2 - th * 1.5], b: [x0 + sw - th, y0 + th, th, dh / 2 - th * 1.5], e: [x0, y0 + dh / 2 + th / 2, th, dh / 2 - th * 1.5], c: [x0 + sw - th, y0 + dh / 2 + th / 2, th, dh / 2 - th * 1.5] };
      for (const k in sg) { x.fillStyle = (SEG7[ch] || '').includes(k) ? col : '#2b2413'; x.fillRect(...sg[k]); } }); t.needsUpdate = true; };
  return { mesh, set };
}
// text of a display at time t: `count` seconds counting down (rate = display seconds per real second) or a fixed `text`
export const clockText = (o, t) => { if (o.count == null) return String(o.text ?? '60:00'); const v = Math.max(0, Math.round(o.count - Math.max(0, t) * (o.rate ?? 1))); return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0'); };
export function makeProp(type, o = {}) {
  const g = new THREE.Group(); const c = o.color;
  switch (type) {
    case 'coin': { const m = new THREE.Mesh(new THREE.CylinderGeometry(.8, .8, .2, 24), gold()); m.rotation.x = Math.PI / 2; m.position.y = .8; g.add(m); break; }
    case 'cash': g.add(box(1.6, .05, .8, '#5fbf5a', 0, 0, 0)); g.add(box(.5, .06, .5, '#2f8a3a', 0, 0, 0)); break;
    case 'moneystack': for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) g.add(box(1.6, .5, .8, '#5fbf5a', (j - 1) * 1.7, i * .5, 0)); break;
    case 'phone': g.add(box(.5, .9, .1, '#1d1d24', 0, -.45, 0, .05)); g.add(box(.44, .8, .02, mat('#5ab0ff', { emissive: '#5ab0ff', emissiveIntensity: .8 }), 0, -.4, .06)); break;
    case 'gift': g.add(box(2, 2, 2, c || '#e84a5f', 0, 0, 0)); g.add(box(2.05, 2.05, .4, '#ffd23f', 0, 0, 0)); g.add(box(.4, 2.05, 2.05, '#ffd23f', 0, 0, 0)); break;
    case 'pizza': { const m = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, .2, 24), mat('#f4c06a')); m.position.y = .1; g.add(m); for (let i = 0; i < 7; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, .05, 12), mat('#c0392b')); p.position.set(Math.cos(i) * .9, .23, Math.sin(i * 1.7) * .9); g.add(p); } break; }
    case 'pizzabox': g.add(box(3, .4, 3, '#e8d5b0', 0, 0, 0)); break;
    case 'sign': { const s = sign(o.text || 'SIGN', o.w || 8, o.h || 2, { bg: o.bg || '#ffffff', fg: o.fg || '#222' }); s.position.y = (o.y ?? 5); g.add(s); if (o.post !== false) g.add(box(.3, (o.y ?? 5) - (o.h || 2) / 2, .3, '#555', 0, 0, -.1)); break; }
    case 'car': g.add(car(0, 0, 0, c || '#e53935')); break;
    case 'tree': g.add(tree(0, 0, o.scale || 1, rng(3))); break;
    case 'trophy': { const gm = gold(); g.add(box(1, .28, 1, '#5a3b26', 0, 0, 0, .05)); g.add(box(.7, .16, .7, '#7a5236', 0, .28, 0));
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(.1, .2, .5, 12), gm); stem.position.y = .69; g.add(stem);
      const cup = new THREE.Mesh(new THREE.LatheGeometry([[.12, 0], [.36, .12], [.52, .45], [.58, .95], [.5, .95], [.44, .5], [0, .2]].map(([x, y]) => new THREE.Vector2(x, y)), 20), gm); cup.position.y = .92; g.add(cup);
      for (const sx of [-1, 1]) { const h = new THREE.Mesh(new THREE.TorusGeometry(.22, .055, 8, 16, Math.PI), gm); h.position.set(sx * .55, 1.5, 0); h.rotation.z = -sx * Math.PI / 2; g.add(h); } break; }
    case 'heart': { const s = new THREE.Shape(); s.moveTo(0, -1); s.bezierCurveTo(-2, .5, -1, 1.8, 0, .8); s.bezierCurveTo(1, 1.8, 2, .5, 0, -1); const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: .4, bevelEnabled: true, bevelSize: .1, bevelThickness: .1 }), mat('#ff3b6b', { emissive: '#ff3b6b', emissiveIntensity: .3 })); m.position.y = 1; g.add(m); break; }
    case 'lightbulb': { const b = new THREE.Mesh(new THREE.SphereGeometry(.8, 16, 12), mat('#fff6a0', { emissive: '#ffe14d', emissiveIntensity: 1.5 })); b.position.y = .9; g.add(b); g.add(box(.6, .5, .6, '#888', 0, 0, 0)); break; }
    case 'chest': g.add(box(3, 1.8, 2, '#8a5a3a', 0, 0, 0)); g.add(box(3.1, .8, 2.1, '#6b4426', 0, 1.8, 0, .3)); g.add(box(.5, .6, .1, '#ffcc33', 0, 1.4, 1.02)); break;
    case 'box': g.add(box(2, 2, 2, c || '#c99a5b', 0, 0, 0)); break;
    case 'scatter': g.add(makeScatter(o)); break;
    case 'mysterybox': { // colossal black cube covered in glowing golden glyph panels, golden doorway on the front (+z). o.open: vortex portal in the doorway; o.text: countdown over the door
      const Wd = o.w || 60, Hh = o.h || 80, gt = tex('glyphs', (x, w) => { const n = 4, cw = w / n; x.fillStyle = '#0b0e1c'; x.fillRect(0, 0, w, w); let sd = 7; const R = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const cx = (i + .5) * cw, cy = (j + .5) * cw, r = cw * .34; x.strokeStyle = '#1b2036'; x.lineWidth = 6; x.strokeRect(i * cw + 3, j * cw + 3, cw - 6, cw - 6); x.strokeStyle = x.fillStyle = '#ffb21a'; x.lineWidth = 5; const k = Math.floor(R() * 6);
          if (k < 3) { x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke(); x.beginPath(); x.arc(cx, cy, r * .62, 0, 7); x.stroke(); }
          if (k === 0) { x.beginPath(); for (let q = 0; q < 6; q++) { const a = q * 4 * Math.PI / 5 - Math.PI / 2; x.lineTo(cx + Math.cos(a) * r * .55, cy + Math.sin(a) * r * .55); } x.stroke(); }
          else if (k === 1) { for (let q = 0; q < 12; q++) { const a = q * Math.PI / 6; x.beginPath(); x.moveTo(cx + Math.cos(a) * r * .7, cy + Math.sin(a) * r * .7); x.lineTo(cx + Math.cos(a) * r * .95, cy + Math.sin(a) * r * .95); x.stroke(); } x.beginPath(); x.arc(cx, cy, r * .2, 0, 7); x.fill(); }
          else if (k === 2) { x.beginPath(); x.moveTo(cx, cy - r * .45); x.lineTo(cx + r * .42, cy + r * .3); x.lineTo(cx - r * .42, cy + r * .3); x.closePath(); x.stroke(); }
          else if (k === 3) { for (let q = 0; q < 4; q++) for (let u = 0; u < 3; u++) { if (R() < .3) continue; const px = cx + (u - 1) * r * .6, py = cy + (q - 1.5) * r * .5; if (R() < .5) { x.beginPath(); x.arc(px, py, r * .09, 0, 7); x.fill(); } else x.fillRect(px - r * .22, py - 3, r * .44, 6); } }
          else if (k === 4) { x.beginPath(); for (let a = 0; a < 14; a += .2) x.lineTo(cx + Math.cos(a) * a * r * .06, cy + Math.sin(a) * a * r * .06); x.stroke(); }
          else { x.beginPath(); x.moveTo(cx - r, cy - r * .5); x.lineTo(cx - r * .2, cy - r * .5); x.lineTo(cx - r * .2, cy + r * .5); x.lineTo(cx + r * .6, cy + r * .5); x.lineTo(cx + r * .6, cy - r * .2); x.stroke(); x.beginPath(); x.arc(cx + r * .6, cy - r * .45, r * .16, 0, 7); x.stroke(); } } }, 1024);
      const side = (rx, ry) => { const t = gt.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; t.needsUpdate = true; return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: '#ffb21a', emissiveIntensity: 1.1, roughness: .35, metalness: .3 }); };
      const m4 = side(Wd / 30, Hh / 30), top = side(Wd / 30, Wd / 30), body = new THREE.Mesh(new THREE.BoxGeometry(Wd, Hh, Wd), [m4, m4, top, top, m4, m4]); body.position.y = Hh / 2; body.castShadow = body.receiveShadow = true; g.add(body);
      const dw = Wd * .3, dh = Hh * .42, gold = mat('#f2b632', { metalness: .9, roughness: .25, emissive: '#7a4a00', emissiveIntensity: .5 }), z = Wd / 2;
      g.add(box(dw * .09, dh, 1.6, gold, -dw / 2, 0, z + .5), box(dw * .09, dh, 1.6, gold, dw / 2, 0, z + .5), box(dw * 1.18, dh * .07, 2, gold, 0, dh, z + .5));
      const vort = o.open && !o.portal; const inner = new THREE.Mesh(new THREE.PlaneGeometry(dw, dh), o.portal ? new THREE.ShaderMaterial({ uniforms: { tex: { value: null }, res: { value: new THREE.Vector2(1, 1) } }, vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }', fragmentShader: 'uniform sampler2D tex; uniform vec2 res; void main() { gl_FragColor = texture2D(tex, gl_FragCoord.xy / res); }' }) : vort ? new THREE.MeshBasicMaterial({ map: tex('vortex', (x, w) => { const gr = x.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, '#ffffff'); gr.addColorStop(.25, '#ffd0f4'); gr.addColorStop(.6, '#b06cff'); gr.addColorStop(1, '#3a2a9c'); x.fillStyle = gr; x.fillRect(0, 0, w, w); x.strokeStyle = 'rgba(120,200,255,.75)'; x.lineWidth = w * .035; for (let q = 0; q < 5; q++) { x.beginPath(); for (let a = 0; a < 9; a += .1) { const r = a * w * .055; x.lineTo(w / 2 + Math.cos(a + q * 1.256) * r, w / 2 + Math.sin(a + q * 1.256) * r); } x.stroke(); } }, 512) }) : mat('#05060c', { roughness: .4 })); inner.position.set(0, dh / 2, z + .2); g.add(inner);
      if (vort) { inner.material.map.center.set(.5, .5); const gl = new THREE.PointLight('#d9a8ff', 400, 60); gl.position.set(0, dh / 2, z + 6); g.add(gl); }
      if (o.portal) g.userData.portal = inner; // world.js renders the destination world into this doorway
      const tm = segDisplay(dw * .8, dh * .2), frame = box(dw * .86, dh * .25, 1, mat('#15151c', { roughness: .5 }), 0, dh * 1.085, z); tm.mesh.position.set(0, dh * 1.21, z + .56); g.add(frame, tm.mesh);
      // doors: two slabs that slide apart. Open from the start when the box is `open` / a `portal`; openAt / closeAt (resolved by world.js into userData.openT / closeT) animate them
      const dm = side(dw / 60, dh / 30), doors = [-1, 1].map(sg => { const d = new THREE.Group(); d.add(box(dw / 2, dh, 1.2, dm, 0, 0, 0), box(dw * .03, dh, 1.5, gold, -sg * dw * .235, 0, 0)); d.position.set(sg * dw / 4, 0, z + .9); g.add(d); return d; });
      g.userData.tick = (t) => { m4.emissiveIntensity = top.emissiveIntensity = 1.1 + .35 * Math.sin(t * 2.2); if (vort) inner.material.map.rotation = t * 1.6; tm.set(clockText(o, t));
        const oT = g.userData.openT, cT = g.userData.closeT, sm = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); }; let k = oT != null ? sm((t - oT) / 1.4) : (o.open || o.portal ? 1 : 0); if (cT != null) k *= 1 - sm((t - cT) / .5);
        doors.forEach((d, i) => { d.position.x = (i ? 1 : -1) * dw * (.25 + .5 * k); d.visible = k < .995; }); }; break; }
    case 'mob': { // hundreds of far-away people as two instanced meshes (the real crowd pool stops at 24): n, radius, inner (empty middle), mode watch | flee | gather | cheer, at = centre
      const n = o.n || 200, Rd = o.radius || 40, inn = o.inner ?? 8, mode = o.mode || 'watch'; let sd = o.seed || 23; const R = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      const part = (w, h, d, x, y, col) => { const b = new THREE.BoxGeometry(w, h, d); b.translate(x, y, 0); const c = new THREE.Color(col), arr = new Float32Array(b.attributes.position.count * 3); for (let i = 0; i < arr.length; i += 3) { arr[i] = c.r; arr[i + 1] = c.g; arr[i + 2] = c.b; } b.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return b; };
      const merge = (l) => { const g2 = new THREE.BufferGeometry(), pos = [], nor = [], col = [], idx = []; let off = 0; for (const b of l) { pos.push(...b.attributes.position.array); nor.push(...b.attributes.normal.array); col.push(...b.attributes.color.array); idx.push(...[...b.index.array].map(i => i + off)); off += b.attributes.position.count; } g2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g2.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g2.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g2.setIndex(idx); return g2; };
      // R15 proportions (studs, feet at 0): torso 1.94 x 2.1 (y 2.19-4.29), arms x +-1.47, legs 2.19 long, head centre 4.87, top 5.46
      const top = merge([part(1.94, 2.1, 1, 0, 3.24, '#fff'), part(1, 2.07, 1, -1.47, 3.2, '#fff'), part(1, 2.07, 1, 1.47, 3.2, '#fff')]), rest = merge([part(1.16, 1.18, 1.16, 0, 4.87, '#f0c8a0'), part(.99, 2.19, .97, -.5, 1.1, '#2b3350'), part(.99, 2.19, .97, .5, 1.1, '#2b3350'), part(1.3, .5, 1.3, 0, 5.46, '#3a2a1c')]);
      const A = new THREE.InstancedMesh(top, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8 }), n), B = new THREE.InstancedMesh(rest, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8 }), n); A.castShadow = B.castShadow = true; A.frustumCulled = B.frustumCulled = false; g.add(A, B);
      const SH = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#ecf0f1', '#34495e', '#ff7eb6', '#1abc9c'], P = Array.from({ length: n }, (_, i) => { const a = R() * 6.283, d = inn + (Rd - inn) * Math.sqrt(R()); A.setColorAt(i, new THREE.Color(SH[Math.floor(R() * SH.length)])); return { a, d, ph: R() * 6.283, sp: .7 + R() * .6, dl: R() * .8, s: .9 + R() * .2 }; }); A.instanceColor.needsUpdate = true;
      const M = new THREE.Object3D(); g.userData.tick = (t) => { P.forEach((q, i) => { let d = q.d, y = 0, yaw = q.a + Math.PI, lean = 0; const run = Math.max(0, t - q.dl) * 13 * q.sp;
          if (mode === 'flee') { d = q.d + run; yaw = q.a; if (run > 0) { y = Math.abs(Math.sin(t * 9 + q.ph)) * .5; lean = .28; } }
          else if (mode === 'gather') { const far = q.d + 30 + 40 * q.sp; d = Math.max(q.d, far - run); if (d > q.d) { y = Math.abs(Math.sin(t * 9 + q.ph)) * .5; lean = .28; } }
          else if (mode === 'cheer') y = Math.max(0, Math.sin(t * 6 * q.sp + q.ph)) * .9; else y = Math.max(0, Math.sin(t * 1.3 + q.ph) - .9) * 2;
          M.position.set(Math.sin(q.a) * d, y, Math.cos(q.a) * d); M.rotation.set(lean, yaw, 0, 'YXZ'); M.scale.setScalar(q.s); M.updateMatrix(); A.setMatrixAt(i, M.matrix); B.setMatrixAt(i, M.matrix); }); A.instanceMatrix.needsUpdate = B.instanceMatrix.needsUpdate = true; }; g.userData.tick(0); break; }
    case 'countdown': { // free-standing seven-segment display: text '12:00' or count (seconds, counts down), w / h size, color
      const w = o.w || 6, h = o.h || 2.2, d = segDisplay(w, h, o.color || '#ffe9a8'); d.mesh.position.set(0, (o.y0 ?? 4) + h / 2, .16); g.add(box(w + .5, h + .5, .3, mat('#15151c'), 0, (o.y0 ?? 4) - .25, 0), d.mesh); g.userData.tick = (t) => d.set(clockText(o, t)); d.set(clockText(o, 0)); break; }
    case 'ball': { const m = new THREE.Mesh(new THREE.SphereGeometry(o.r || .9, 20, 14), mat(c || '#ff7043')); m.position.y = o.r || .9; m.castShadow = true; g.add(m); break; }
    case 'cake': g.add(box(3, 1.4, 3, '#ffb6c9', 0, 0, 0, .2)); g.add(box(3.1, .3, 3.1, '#ffffff', 0, 1.3, 0, .1)); for (let i = -1; i <= 1; i++) { g.add(box(.15, .8, .15, '#5bc0ff', i * .7, 1.6, 0)); const f = new THREE.Mesh(new THREE.SphereGeometry(.15, 8, 6), mat('#ffb02e', { emissive: '#ff8a00', emissiveIntensity: 2 })); f.position.set(i * .7, 2.55, 0); g.add(f); } break;
    case 'book': g.add(box(1, .25, 1.3, c || '#3f51b5', 0, 0, 0)); break;
    case 'cup': { const m = new THREE.Mesh(new THREE.CylinderGeometry(.35, .28, .8, 14), mat(c || '#ffffff')); m.position.y = -.4; g.add(m); break; }
    case 'sword': g.add(box(.2, 3, .1, mat('#cfd8dc', { metalness: .8, roughness: .2 }), 0, -.5, 0)); g.add(box(.9, .2, .25, '#8d6e63', 0, -.6, 0)); break;
    case 'door': g.add(box(4, 8, .4, c || '#8a5a3a', 0, 0, 0)); g.add(box(.3, .3, .3, '#ffcc33', 1.4, 3.8, .3)); break;
    case 'raincloud': for (const [x, y, s] of [[0, 0, 1.3], [-1.2, -.2, 1], [1.2, -.2, 1], [.5, .5, .9]]) { const m = new THREE.Mesh(new THREE.SphereGeometry(s, 14, 10), mat('#59606e')); m.position.set(x, y, 0); g.add(m); } break;
    case 'bed': g.add(box(5, 1.6, 9, '#8a5a3a', 0, 0, 0)); g.add(box(4.8, .8, 8.6, '#ffffff', 0, 1.6, 0)); break;
    case 'table': g.add(box(7, .4, 4, '#a8784e', 0, 2.8, 0)); [[-3, -1.6], [3, -1.6], [-3, 1.6], [3, 1.6]].forEach(([a, b]) => g.add(box(.35, 2.8, .35, '#7a5236', a, 0, b))); break;
    case 'portal': { const m = new THREE.Mesh(new THREE.TorusGeometry(3, .4, 12, 40), mat('#9b5cff', { emissive: '#9b5cff', emissiveIntensity: 2 })); m.position.y = 3.6; g.add(m); const d = new THREE.Mesh(new THREE.CircleGeometry(2.8, 32), new THREE.MeshBasicMaterial({ color: '#c9a6ff', transparent: true, opacity: .7 })); d.position.y = 3.6; g.add(d); break; }
    case 'rainbow': ['#ff4d4d', '#ff9f43', '#ffe14d', '#4cd964', '#3ec1ff', '#7a5cff'].forEach((col, i) => { const m = new THREE.Mesh(new THREE.TorusGeometry(14 - i * .9, .45, 8, 64, Math.PI), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: .6, transparent: true, opacity: .9 })); m.castShadow = false; g.add(m); }); break;
    // ---- sky realm (pastel, soft, emissive-tinted so it glows instead of going grey in shade) ----
    case 'cloud': { // rideable: flat top at y=0 (stand on it), puffy rim, lilac underside
      const puff = (x, y, z, r, sy, col) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat(col, { roughness: 1, emissive: '#ffe6f2', emissiveIntensity: .24 })); m.position.set(x, y, z); m.scale.y = sy; g.add(m); return m; };
      puff(0, -1.8, 0, 3.1, .58, c || '#ffffff'); puff(-2.5, -1.9, .3, 2, .6, '#fff4f9'); puff(2.4, -1.9, -.2, 2.1, .6, '#f3f8ff'); puff(.2, -1.95, 2.3, 1.9, .6, '#ffffff'); puff(-.3, -1.95, -2.4, 1.9, .6, '#fff4f9');
      puff(0, -2.6, 0, 3.1, .5, '#e1d6ff'); puff(-3.4, -.5, 1.3, 1.3, .9, '#ffffff'); puff(3.3, -.5, .9, 1.4, .9, '#fff8fb'); puff(1.4, -.5, -2.7, 1.3, .9, '#ffffff'); puff(-1.6, -.5, 3, 1.3, .9, '#f6faff'); puff(-3.6, -.9, -1.6, 1.1, .9, '#fff4f9'); puff(2.2, -.8, 3, 1.1, .9, '#ffffff');
      g.userData.tick = (t) => { g.scale.set(1 + .02 * Math.sin(t * 2.3), 1 + .045 * Math.sin(t * 2.3 + 1), 1 + .02 * Math.sin(t * 2.3)); }; break; }
    case 'island': { // floating island, grass top at y=0
      const R = o.r || 9; const rock = new THREE.Mesh(new THREE.ConeGeometry(R, R * 1.15, 9), mat('#c5b4ea', { flatShading: true, emissive: '#b8a4e6', emissiveIntensity: .12 })); rock.rotation.x = Math.PI; rock.position.y = -.8 - R * .575; g.add(rock);
      const rock2 = new THREE.Mesh(new THREE.ConeGeometry(R * .55, R * .9, 7), mat('#a996d8', { flatShading: true })); rock2.rotation.x = Math.PI; rock2.position.set(R * .15, -.8 - R * 1.3, 0); g.add(rock2);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(R, R * .97, .8, 28), mat('#b9efab', { roughness: .95, emissive: '#d6ffc4', emissiveIntensity: .12 })); cap.position.y = -.4; g.add(cap);
      const tr = (x, z, s, col) => { g.add(box(.5 * s, 3 * s, .5 * s, '#9a6a4a', x, 0, z)); for (const [a, b, d, rr] of [[0, 3.6, 0, 1.7], [-1, 3.1, .4, 1.2], [1, 3.2, -.3, 1.3]]) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rr * s, 1), mat(col, { emissive: col, emissiveIntensity: .12 })); m.position.set(x + a * s, b * s, z + d * s); g.add(m); } };
      tr(-R * .45, -R * .2, 1, '#ffb7d5'); tr(R * .5, -R * .35, .8, '#ffc9e0');
      if (o.house !== false) { g.add(box(3.4, 2.6, 3, '#fff7ec', R * .1, 0, R * .3)); const rf = new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.8, 4), mat('#ff9fc2')); rf.rotation.y = Math.PI / 4; rf.position.set(R * .1, 3.5, R * .3); g.add(rf); g.add(box(.8, 1.5, .1, '#b98ae0', R * .1, 0, R * .3 + 1.55)); }
      for (let i = 0; i < 4; i++) { const k = new THREE.Mesh(new THREE.OctahedronGeometry(.55, 0), new THREE.MeshStandardMaterial({ color: '#aeeaff', emissive: '#7fdcff', emissiveIntensity: 1.2 })); k.position.set(Math.cos(i * 1.7) * R * .7, .6, Math.sin(i * 1.7) * R * .7); k.scale.y = 1.7; g.add(k); }
      break; }
    case 'lantern': { const m = new THREE.Mesh(new THREE.SphereGeometry(.55, 16, 12), new THREE.MeshStandardMaterial({ color: c || '#ffd9a6', emissive: c || '#ffb86b', emissiveIntensity: 1.7, roughness: .6 })); m.scale.y = 1.2; m.position.y = .75; g.add(m);
      g.add(box(.5, .1, .5, '#b5651d', 0, 1.4, 0)); g.add(box(.5, .1, .5, '#b5651d', 0, 0, 0)); g.add(box(.04, .7, .04, '#b5651d', 0, 1.5, 0)); break; }
    case 'balloon': { const cols = ['#ffb3d1', '#fff1a8', '#b7e8ff', '#d6c4ff', '#c4f1c4', '#ffd0a8'];
      cols.forEach((col, i) => { const m = new THREE.Mesh(new THREE.SphereGeometry(3.7, 24, 16, i * Math.PI / 3, Math.PI / 3), mat(col, { side: THREE.DoubleSide, emissive: col, emissiveIntensity: .22 })); m.scale.y = 1.18; m.position.y = 8.4; g.add(m); });
      g.add(box(2.6, .3, 2.6, '#d9a574', 0, -.3, 0)); for (const [x, z] of [[-1.3, 0], [1.3, 0], [0, -1.3], [0, 1.3]]) g.add(box(x ? .15 : 2.6, 1.5, z ? .15 : 2.6, '#c98d5c', x, 0, z));
      for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) { const rp = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 5.2, 4), mat('#8a6a4a')); rp.position.set(x, 4, z); rp.rotation.set(z * .12, 0, -x * .12); g.add(rp); }
      const fl = new THREE.Mesh(new THREE.ConeGeometry(.35, 1.1, 8), new THREE.MeshStandardMaterial({ color: '#ffd45a', emissive: '#ff9f2e', emissiveIntensity: 2.4 })); fl.position.y = 5.2; g.add(fl);
      g.userData.tick = (t) => { g.rotation.z = Math.sin(t * 1.1) * .035; g.rotation.x = Math.sin(t * .8 + 1) * .025; fl.scale.y = 1 + .25 * Math.sin(t * 12); }; break; }
    case 'skywhale': { // faces +x, back (flat) at y=0 so actors can ride it
      const bm = mat('#cfe6ff', { roughness: .95, emissive: '#cfe6ff', emissiveIntensity: .5 }), wm = mat('#fff6fb', { roughness: .95, emissive: '#ffeaf4', emissiveIntensity: .55 }); // strong self-glow: the belly is seen from below
      const el = (x, y, z, sx, sy, sz, m, p = g) => { const e = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), m); e.position.set(x, y, z); e.scale.set(sx, sy, sz); p.add(e); return e; };
      const body = new THREE.Group(); g.add(body); el(0, -2.7, 0, 7.2, 2.7, 3.1, bm, body); el(5.2, -3, 0, 3.4, 2.3, 2.5, bm, body); el(0, -3.7, 0, 6.8, 1.7, 2.9, wm, body); el(5, -3.9, 0, 3.2, 1.3, 2.3, wm, body);
      for (const s of [-1, 1]) { const ey = el(7.7, -2.6, s * 1.6, .42, .42, .3, mat('#2a2140', { roughness: .3 }), body); el(7.85, -2.5, s * 1.78, .13, .13, .1, mat('#ffffff'), body); }
      const tail = new THREE.Group(); tail.position.set(-6.8, -2.9, 0); body.add(tail); el(-2, .2, 0, 3.2, 1.1, 1.1, bm, tail);
      const f1 = el(-5, .7, 1.9, 1.5, .28, 2.4, bm, tail); f1.rotation.y = .5; const f2 = el(-5, .7, -1.9, 1.5, .28, 2.4, bm, tail); f2.rotation.y = -.5;
      const fl = []; for (const s of [-1, 1]) { const f = el(1.5, -4.4, s * 3.1, 2.4, .28, 1, bm, body); f.rotation.set(s * .4, s * .3, 0); fl.push(f); }
      for (let i = 0; i < 9; i++) for (const s of [-1, 1]) { const d = new THREE.Mesh(new THREE.SphereGeometry(.17, 8, 6), new THREE.MeshStandardMaterial({ color: '#fff7b0', emissive: '#ffe680', emissiveIntensity: 1.6 })); d.position.set(-5 + i * 1.3, -1.6 - Math.sin(i * .6) * .3, s * 2.55); body.add(d); }
      g.userData.tick = (t) => { body.rotation.z = Math.sin(t * 1.3) * .035; body.position.y = Math.sin(t * 1.3 + 1) * .07; tail.rotation.z = Math.sin(t * 2.2) * .22; fl.forEach((f, i) => { f.rotation.x = (i ? 1 : -1) * (.4 + Math.sin(t * 2.2) * .25); }); }; break; }
    case 'statue': { // the paradise statue: gold warrior, raised sword, cape, plinth (~12 u tall, faces +z). Half-buried in ice: place it at y -1.5
      const au = mat('#e8aa1c', { metalness: .9, roughness: .3, emissive: '#6a4000', emissiveIntensity: .22 }), au2 = mat('#c48a10', { metalness: .9, roughness: .34, emissive: '#4a2c00', emissiveIntensity: .18 }), au3 = mat('#f6cf62', { metalness: .85, roughness: .26, emissive: '#6a4800', emissiveIntensity: .25 }), st = mat('#d8cfae', { roughness: .85 });
      g.add(box(7, .9, 7, st, 0, 0, 0)); g.add(box(5.6, 1.6, 5.6, '#cfc5a0', 0, .9, 0)); g.add(box(6.2, .4, 6.2, au2, 0, 2.5, 0));
      for (const sx of [-1, 1]) { g.add(box(1.3, .6, 2.1, au2, sx * 1.1, 2.9, .3)); g.add(box(1.1, 3.3, 1.1, au, sx * 1.1, 3.5, 0)); g.add(box(1.3, 1.1, 1.3, au3, sx * 1.1, 5.6, .1)); g.add(box(1.25, 2.2, 1.25, au, sx * 1.1, 6.7, 0)); }
      g.add(box(3.6, .8, 1.9, au2, 0, 8.7, 0)); g.add(box(3.8, 3.1, 2.1, au, 0, 9.4, 0)); g.add(box(3, 1.5, .4, au3, 0, 10.6, 1.1)); g.add(box(4.4, .6, 2.1, au2, 0, 12.4, 0));
      for (const sx of [-1, 1]) g.add(box(1.7, 1.2, 2.2, au3, sx * 2.7, 12, 0)); g.add(box(3.6, 4.6, .3, mat('#c98f10', { metalness: .6, roughness: .45 }), 0, 7, -1.3)); // cape
      g.add(box(.95, 2.4, .95, au, -2.8, 9.9, .2)); g.add(box(.9, .9, 1.9, au, -2.8, 9.6, 1.2)); // left arm forward
      g.add(box(.95, 1.7, .95, au, 2.8, 11, 0)); g.add(box(.95, 1.6, .95, au, 2.8, 12.4, .1, 0)); // right arm up
      g.add(box(.3, 4.6, .12, au3, 2.8, 14, .1)); g.add(box(1.5, .3, .3, au2, 2.8, 13.9, .1)); // sword
      g.add(box(.9, .5, .9, au2, 0, 13, 0)); g.add(box(1.8, 1.8, 1.8, au, 0, 13.4, 0)); g.add(box(2.1, .8, 2.1, au2, 0, 15, 0)); g.add(box(.4, 1.2, 1.9, au3, 0, 15.7, 0)); // neck, head, helmet, crest
      const pl = new THREE.PointLight('#ffcf6a', 40, 30, 1.6); pl.position.set(0, 9, 5); g.add(pl); g.scale.setScalar(.8); break; }
    case 'hatch': { // rusted steel floor hatch with hinge, bolts and wheel; openAt animates the lid up (faces up, ~5 u wide)
      const rm = pbrMat('rusty_metal', 4, 4, { color: '#c98a5a', metalness: .6 }), rm2 = pbrMat('rusty_metal', 4, 4, { color: '#8f6a4a', metalness: .5 });
      g.add(box(5.6, .5, 5.6, rm2, 0, 0, 0)); g.add(box(4.2, .3, 4.2, '#0a0a10', 0, .1, 0));
      const lid = new THREE.Group(); lid.position.set(0, .5, -2.4); g.add(lid); const lb = box(4.8, .5, 4.8, rm, 0, 0, 2.4); lid.add(lb); lid.add(box(3.4, .22, 3.4, rm2, 0, .5, 2.4));
      for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283, b = box(.35, .22, .35, '#3a2a20', 0, .5, 0); b.position.x = Math.cos(a) * 2.2; b.position.z = 2.4 + Math.sin(a) * 2.2; lid.add(b); }
      const wh = new THREE.Mesh(new THREE.TorusGeometry(.9, .13, 8, 20), mat('#6a5a50', { metalness: .6, roughness: .5 })); wh.rotation.x = Math.PI / 2; wh.position.set(0, 1.1, 2.4); lid.add(wh);
      for (let i = 0; i < 4; i++) { const sp = box(.14, .14, 1.8, '#6a5a50', 0, 0, 0); sp.position.set(0, 1.1, 2.4); sp.rotation.y = i * Math.PI / 4; lid.add(sp); } lid.add(box(.4, .7, .4, '#5a4a40', 0, .5, 2.4));
      for (const sx of [-1, 1]) g.add(box(.5, .8, .5, '#4a3a30', sx * 2, .2, -2.6));
      const sm = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
      g.userData.tick = (t) => { const oT = g.userData.openT; lid.rotation.x = -(oT != null ? sm((t - oT) / .9) : 0) * 1.9; }; break; }
    case 'chains': { // two wall shackle chains hanging from a bracket, ending in open cuffs on the floor (~6 u tall, faces +z). `sway` optional
      const cm = mat('#4a4a52', { metalness: .85, roughness: .45 }); const link = (i) => { const m = new THREE.Mesh(new THREE.TorusGeometry(.2, .06, 6, 10), cm); m.scale.set(1, 1.35, 1); if (i % 2) m.rotation.y = Math.PI / 2; return m; };
      g.add(box(4.4, .5, .5, '#3a3a42', 0, 5.6, 0)); const ch = [];
      for (const sx of [-1, 1]) { for (let i = 0; i < 12; i++) { const l = link(i); l.position.set(sx * 1.6 + Math.sin(i * .5) * .08, 5.5 - i * .42, .15); g.add(l); ch.push(l); }
        const cuff = new THREE.Mesh(new THREE.TorusGeometry(.5, .13, 8, 14), cm); cuff.position.set(sx * 1.6, .35, .15); cuff.rotation.x = Math.PI / 2; g.add(cuff); g.add(box(.5, .5, .35, '#3a3a42', sx * 1.6, .0, .5)); }
      g.userData.tick = (t) => { const oT = g.userData.openT; const br = oT != null && t >= oT; g.children.forEach((c, i) => { if (c.geometry?.type === 'TorusGeometry' && c.position.y > 1 && br) c.visible = false; }); }; break; }
    case 'stairs': { // solid stone staircase, bottom at the origin, rising toward +z: o.rise (height, default 12) over o.run (length, default 16), o.w width (default 5). Actors walk it with `to:x,z,y`
      const rise = o.rise || 12, run = o.run || 16, w = o.w || 5, n = Math.max(3, Math.round(rise / .8)), dh = rise / n, dz = run / n, sm = pbrMat('sandstone_blocks', 4, 4, { color: '#b9ad92', fallback: '#b9ad92' }), gm = mat('#c9a64a', { metalness: .7, roughness: .35 });
      for (let k = 0; k < n; k++) { g.add(box(w, (k + 1) * dh, dz + .02, sm, 0, 0, k * dz + dz / 2)); g.add(box(w + .15, .08, .25, '#8a7c5e', 0, (k + 1) * dh, k * dz + .15)); }
      for (const sx of [-1, 1]) { g.add(box(.3, 1.3, .3, gm, sx * (w / 2 + .2), 0, 0)); g.add(box(.3, 1.3 + rise, .3, gm, sx * (w / 2 + .2), 0, run)); const rl = box(.18, .18, Math.hypot(run, rise) + .3, gm, sx * (w / 2 + .2), 0, 0); rl.position.set(sx * (w / 2 + .2), rise / 2 + 1.3, run / 2); rl.rotation.x = -Math.atan2(rise, run); g.add(rl); }
      break; }
    case 'umbrella': { g.add(box(.13, 3.5, .13, '#8a6a4a', 0, 0, 0)); const hk = new THREE.Mesh(new THREE.TorusGeometry(.28, .06, 6, 12, Math.PI), mat('#8a6a4a')); hk.position.set(.28, 0, 0); hk.rotation.z = Math.PI; g.add(hk);
      const cols = ['#ff9ec4', '#fffafc']; for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(2.6, 10, 8, i * Math.PI / 4, Math.PI / 4, 0, Math.PI / 2), mat(c && i % 2 === 0 ? c : cols[i % 2], { side: THREE.DoubleSide, emissive: cols[i % 2], emissiveIntensity: .15 })); m.scale.y = .5; m.position.y = 3.5; g.add(m); }
      const tp = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 6), mat('#ffd23f')); tp.position.y = 4.85; g.add(tp); break; }
    case 'icecream': { const cn = new THREE.Mesh(new THREE.ConeGeometry(.36, 1.3, 12), mat('#efc489')); cn.rotation.x = Math.PI; cn.position.y = .65; g.add(cn);
      for (const [y, r, col] of [[1.45, .46, '#ffb3d1'], [2, .4, '#bff3e0'], [2.45, .3, '#fff3b0']]) { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat(col, { emissive: col, emissiveIntensity: .15 })); s.position.y = y; g.add(s); }
      const ch = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 6), mat('#e8344f')); ch.position.y = 2.8; g.add(ch); break; }
    default: g.add(box(1, 1, 1, c || '#ff00ff', 0, 0, 0));
  }
  if (o.scale) g.scale.setScalar(o.scale);
  if (type !== 'rainbow') g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

// ---------- FX ----------
// Each FX: {obj, update(t)} where t = seconds since fx start (deterministic).
const dummy = new THREE.Object3D();
function instanced(geo, material, n) { const m = new THREE.InstancedMesh(geo, material, n); m.frustumCulled = false; m.castShadow = false; return m; }

// Soft sprites (camera-facing, per-sprite fade): smoke, flashes, rings and comic emotes. Textures are drawn once on a canvas.
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const TEX = {};
function tex(key, draw, w = 128) { if (TEX[key]) return TEX[key]; const cv = document.createElement('canvas'); cv.width = cv.height = w; draw(cv.getContext('2d'), w); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return (TEX[key] = t); }
const softTex = () => tex('soft', (g, w) => { const q = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); q.addColorStop(0, 'rgba(255,255,255,1)'); q.addColorStop(.45, 'rgba(255,255,255,.7)'); q.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = q; g.fillRect(0, 0, w, w); });
const ringTex = () => tex('ring', (g, w) => { g.strokeStyle = '#fff'; g.lineWidth = w * .07; g.shadowColor = '#fff'; g.shadowBlur = w * .06; g.beginPath(); g.arc(w / 2, w / 2, w * .4, 0, 7); g.stroke(); }, 256);
const burstTex = () => tex('burst', (g, w) => { g.translate(w / 2, w / 2); g.fillStyle = '#fff'; g.beginPath(); for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, rr = i % 2 ? w * .16 : w * (i % 4 ? .34 : .48); g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); }, 256);
export const EMOTES = new Set(['sweat', 'anger', 'question', 'exclaim', 'zzz']);
const emoteTex = (kind) => tex('e_' + kind, (g, w) => { g.lineJoin = g.lineCap = 'round';
  if (kind === 'sweat') { g.beginPath(); g.moveTo(128, 28); g.quadraticCurveTo(50, 140, 60, 170); g.arc(128, 170, 68, Math.PI, 0, true); g.quadraticCurveTo(206, 140, 128, 28); g.closePath(); g.fillStyle = '#6ec3ff'; g.fill(); g.lineWidth = 14; g.strokeStyle = '#17446f'; g.stroke(); g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.ellipse(102, 160, 14, 26, .3, 0, 7); g.fill(); }
  else if (kind === 'anger') { for (const [lw, col] of [[44, '#5a0d0d'], [26, '#ff3b3b']]) { g.lineWidth = lw; g.strokeStyle = col; for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const a = Math.atan2(-sy, -sx); g.beginPath(); g.arc(128 + sx * 84, 128 + sy * 84, 62, a - .72, a + .72); g.stroke(); } } }
  else { const ch = kind === 'question' ? '?' : kind === 'exclaim' ? '!' : 'Z'; g.font = '210px "Lilita One"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 26; g.strokeStyle = '#1a1a1a'; g.strokeText(ch, 128, 136); g.fillStyle = kind === 'question' ? '#ffd23f' : kind === 'exclaim' ? '#ff4d4d' : '#cfe6ff'; g.fillText(ch, 128, 136); } }, 256);
const sprite = (t, o = {}) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false, color: o.color || '#ffffff', blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending })); s.renderOrder = 4; return s; };
const ringMesh = (color) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: ringTex(), transparent: true, depthWrite: false, toneMapped: false, color: color || '#ffffff', side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.y = .12; m.renderOrder = 3; return m; };

export function makeFX(type, o = {}, anchor = new THREE.Vector3()) {
  if (type === 'embers' && o.leaf) type = 'leaves'; // old `embers` + `leaf: true` option
  if (isQuarks(type)) { const v = makeQuarks(type, o); v.obj.position.copy(anchor); return v; } // data-driven effect from assets/vfx/fx/<type>.json (engine/quarks.js)
  const r = rng(o.seed || 11); const N = o.count || 60;
  if (type === 'hearts' && !o.count) { }
  const R = Array.from({ length: N }, () => [r(), r(), r(), r(), r()]);
  const g = new THREE.Group(); g.position.copy(anchor);
  let update = () => { };
  if (type === 'coins' || type === 'cash' || type === 'confetti' || type === 'petals' || type === 'hearts' || type === 'sparkles' || type === 'stars') {
    const geo = type === 'coins' ? new THREE.CylinderGeometry(.32, .32, .08, 16) : type === 'cash' ? new THREE.BoxGeometry(1.1, .03, .55) : type === 'hearts' ? heartGeo() : type === 'sparkles' || type === 'stars' ? new THREE.OctahedronGeometry(.25) : type === 'petals' ? new THREE.PlaneGeometry(.5, .34) : new THREE.BoxGeometry(.35, .02, .25);
    const material = type === 'petals' ? new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, emissive: '#ffd6ea', emissiveIntensity: .35 }) : type === 'coins' ? gold() : type === 'cash' ? mat('#62c45a') : type === 'hearts' ? mat('#ff3b6b', { emissive: '#ff3b6b', emissiveIntensity: .5 }) : type === 'sparkles' || type === 'stars' ? new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff3a0').multiplyScalar(2.2), toneMapped: false }) /* over-bright: picked up by bloom as a glow */ : new THREE.MeshStandardMaterial({ vertexColors: false, color: '#ffffff' });
    const im = instanced(geo, material, N); g.add(im);
    if (type === 'confetti' || type === 'petals') { const cols = (type === 'petals' ? ['#ffb7d5', '#ffd6e8', '#fff1a8', '#d6c4ff', '#bfeaff'] : ['#ff4d6d', '#ffd23f', '#3ec1ff', '#7bff7b', '#c77dff']).map(c => new THREE.Color(c)); for (let i = 0; i < N; i++) im.setColorAt(i, cols[i % 5]); }
    const mode = o.mode || (type === 'sparkles' || type === 'stars' ? 'orbit' : (type === 'hearts' ? 'rise' : 'burst'));
    update = (t) => {
      for (let i = 0; i < N; i++) {
        const [a, b, c, d, e] = R[i]; let x, y, z;
        if (mode === 'rain') { const per = 1.6 + a; const tt = ((t + d * per) % per); x = (b - .5) * 16; z = (c - .5) * 10; y = 18 - tt * 12; }
        else if (mode === 'rise') { const per = 3; const tt = (t + d * per) % per; x = (b - .5) * 7 + Math.sin(tt * 2 + a * 6) * .6; z = (c - .5) * 3; y = 2 + tt * 2.2; }
        else if (mode === 'orbit') { const ang = t * (1.5 + a) + b * 6.28; const rad = 1.6 + c * 1.5; x = Math.cos(ang) * rad; z = Math.sin(ang) * rad; y = 1 + d * 5 + Math.sin(t * 3 + e * 6) * .4; }
        let life = 1, rt = t; // burst: pieces pop out, land where they fall (no sliding), rest a moment and shrink away
        if (mode === 'rain') { const per = 1.6 + a, tt = (t + d * per) % per; life = Math.min(1, tt * 6, (per - tt) * 6); }
        else if (mode === 'rise') { const tt = (t + d * 3) % 3; life = Math.min(1, tt * 4, (3 - tt) * 2); }
        else if (mode !== 'orbit') { const tt = Math.max(0, t - d * .25); const sp = 7 + a * 7, ang = b * 6.28; const up = 9 + c * 8, land = (up + Math.sqrt(up * up + 113.68)) / 19.6, tx = Math.min(tt, land); x = Math.cos(ang) * sp * tx * .6; z = Math.sin(ang) * sp * tx * .6; y = 3 + up * tt - 9.8 * tt * tt; if (y < .1) y = .1; rt = tx + d; life = Math.min(1, tt * 10) * (1 - clamp01((tt - land - .7) / .5)); }
        dummy.position.set(x, y, z); dummy.rotation.set(mode === 'rise' ? 0 : rt * (3 + a * 5), mode === 'rise' ? Math.sin(t * 2 + a * 6) * .5 : rt * (2 + b * 4), mode === 'rise' ? 0 : e * 6); const sc = (mode === 'orbit' ? .6 + .4 * Math.sin(t * 8 + i) : 1) * Math.max(0, life); dummy.scale.setScalar(sc); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
    };
  } else if (type === 'rain' || type === 'snow') {
    const n = o.count || 900; const RR = Array.from({ length: n }, () => [r(), r(), r()]);
    const im = instanced(type === 'rain' ? new THREE.BoxGeometry(.05, 1.1, .05) : new THREE.SphereGeometry(.12, 6, 4), new THREE.MeshBasicMaterial({ color: type === 'rain' ? '#bcd8ff' : '#ffffff', transparent: true, opacity: type === 'rain' ? .6 : .95 }), n); g.add(im);
    const area = o.area || 60, H = 30, sp = type === 'rain' ? 34 : 4;
    update = (t, cam) => { const cx = cam ? cam.position.x - g.position.x : 1e9, cz = cam ? cam.position.z - g.position.z : 1e9; for (let i = 0; i < n; i++) { const [a, b, c] = RR[i]; const y = H - ((t * sp + c * H) % H); const px = (a - .5) * area + (type === 'snow' ? Math.sin(t + c * 9) : 0), pz = (b - .5) * area; dummy.position.set(px, y, pz); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(Math.hypot(px - cx, pz - cz) < 3.5 ? 0 : 1); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); } im.instanceMatrix.needsUpdate = true; };
  } else if (type === 'raincloud') { // personal raincloud above anchor
    const cl = makeProp('raincloud'); cl.position.y = 8.2; g.add(cl);
    const n = 70; const RR = Array.from({ length: n }, () => [r(), r(), r()]);
    const im = instanced(new THREE.BoxGeometry(.06, .7, .06), new THREE.MeshBasicMaterial({ color: '#9fc6ff', transparent: true, opacity: .8 }), n); g.add(im);
    update = (t) => { cl.position.y = 8.2 + Math.sin(t * 2) * .15; for (let i = 0; i < n; i++) { const [a, b, c] = RR[i]; const y = 7.5 - ((t * 14 + c * 7.5) % 7.5); dummy.position.set((a - .5) * 3, y, (b - .5) * 1.8); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); } im.instanceMatrix.needsUpdate = true; };
  } else if (type === 'lightning') {
    const pts = []; let x = 0; for (let y = 40; y >= 0; y -= 4) { pts.push(new THREE.Vector3(x, y, 0)); x += (r() - .5) * 4; }
    const bolt = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, .25, 5), new THREE.MeshBasicMaterial({ color: '#fffbe0' })); g.add(bolt); g.position.z -= 25;
    update = (t) => { bolt.visible = (t < .12) || (t > .2 && t < .3); };
  } else if (type === 'puff' || type === 'dust') { // soft smoke: puff = poof around the body, dust = low kick-up at the feet
    const puff = type === 'puff', n = puff ? 14 : 9, life = puff ? .8 : .55;
    const S = Array.from({ length: n }, () => { const s = sprite(softTex(), { color: o.color || (puff ? '#ffffff' : '#e3d3b8') }); g.add(s); return s; });
    update = (t) => S.forEach((s, i) => { const [a, b, c] = R[i % N]; const k = clamp01((t - a * .08) / (life * (.7 + .3 * b))), e = 1 - (1 - k) ** 3, ang = i / n * 6.28 + c, rad = e * (puff ? 2.6 : 2.2) * (.6 + .4 * b);
      s.position.set(Math.cos(ang) * rad, puff ? 1.2 + e * (1 + b * 1.5) + Math.sin(ang * 3) * .4 : .35 + e * .5 * b, Math.sin(ang) * rad); s.scale.setScalar((puff ? 1.6 : 1.1) * (.5 + e * 1.2)); s.material.opacity = k >= 1 || t < a * .08 ? 0 : .85 * (1 - k * k); });
  } else if (type === 'shockwave') { // ring racing outward on the ground
    const m = ringMesh(o.color); g.add(m);
    update = (t) => { const k = clamp01(t / (o.life || .55)), e = 1 - (1 - k) ** 3; m.scale.setScalar(.5 + e * (o.size || 7)); m.material.opacity = k >= 1 ? 0 : (1 - k) ** 1.5; };
  } else if (type === 'impact') { // comic hit: star flash + ground ring + sparks
    const y0 = o.y ?? 3, fl = sprite(burstTex(), { color: o.color || '#fff6c2' }); fl.position.y = y0; fl.material.rotation = .3; g.add(fl);
    const ring = ringMesh('#fff2c0'); g.add(ring);
    const S = Array.from({ length: 10 }, () => { const s = sprite(softTex(), { color: '#ffd76a', add: true }); g.add(s); return s; });
    update = (t) => { const k = clamp01(t / .22); fl.scale.setScalar(1.5 + 5 * (1 - (1 - k) ** 3)); fl.material.opacity = k >= 1 ? 0 : 1 - k ** 3;
      const kr = clamp01(t / .5); ring.scale.setScalar(.5 + (1 - (1 - kr) ** 3) * 6); ring.material.opacity = kr >= 1 ? 0 : (1 - kr) ** 1.5;
      S.forEach((s, i) => { const [a, b, c] = R[i % N]; const ks = clamp01(t / (.35 + .2 * a)), e = 1 - (1 - ks) ** 2, ang = i / 10 * 6.28 + c, d = e * (3 + 2.5 * b); s.position.set(Math.cos(ang) * d, y0 + (b - .3) * d * .8 - 4 * ks * ks * a, Math.sin(ang) * d * .6); s.scale.setScalar(.7 * (1 - ks * .7)); s.material.opacity = ks >= 1 ? 0 : 1 - ks * ks; }); };
  } else if (EMOTES.has(type)) { // comic symbol next to / above the head; follows the actor (see world.js)
    const side = o.side ?? 1, sz = o.size || 1.5, by = o.y ?? 5.7, n = type === 'zzz' ? 3 : 1;
    const S = Array.from({ length: n }, () => { const s = sprite(emoteTex(type)); s.renderOrder = 5; g.add(s); return s; });
    update = (t) => { const pop = t <= 0 ? 0 : 1 - Math.exp(-9 * t) * Math.cos(14 * t), s = S[0];
      if (type === 'sweat') { const u = (t % .9) / .9; s.position.set(side * 1.25, by + .1 - u * 1.2, .4); s.scale.setScalar(sz * .95 * pop); s.material.opacity = 1 - u ** 6; }
      else if (type === 'anger') { s.position.set(side * .95, by + .5, .45); s.scale.setScalar(sz * 1.1 * pop * (1 + .14 * Math.sin(t * 14))); }
      else if (type === 'zzz') S.forEach((z, i) => { const u = (t * .55 + i / 3) % 1; z.position.set(side * (.8 + u * 1.3), by + .2 + u * 1.9, .2); z.scale.setScalar(sz * (.35 + .55 * u)); z.material.opacity = Math.sin(u * Math.PI); z.material.rotation = -.2 * side; });
      else { s.position.set(0, by + 1.15 + Math.abs(Math.sin(t * 16)) * Math.exp(-t * 5) * .5, 0); s.scale.setScalar(sz * 1.15 * pop); s.material.rotation = type === 'question' ? Math.sin(t * 4) * .18 : 0; } };
  } else if (type === 'timer' || type === 'label') { // floating text above an actor (countdowns, names, thoughts)
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160; const cg = cv.getContext('2d'); const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false })); const sz = o.size || 2.6; sp.scale.set(sz, sz * 160 / 512, 1); sp.position.y = o.y ?? 6.6; sp.renderOrder = 5; g.add(sp);
    let last = '';
    const fmtv = (v) => { v = Math.max(0, v); const f = o.fmt || 'mmss'; if (f === 'days') return Math.ceil(v).toLocaleString('en-US') + ' DAYS'; if (f === 'num') return Math.ceil(v).toLocaleString('en-US'); if (f === 'hms') { const s = Math.ceil(v); return [s / 3600 | 0, (s / 60 | 0) % 60, s % 60].map(x => String(x).padStart(2, '0')).join(':'); } const s = Math.ceil(v); return String(s / 60 | 0).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
    update = (t) => {
      let txt = o.text != null ? o.text : fmtv((o.from ?? 0) - t * (o.rate ?? 1));
      if (o.to != null && o.text == null) txt = fmtv(Math.max(o.to, (o.from ?? 0) - t * (o.rate ?? 1)));
      const glitch = o.glitch && Math.floor(t * 14) % 3 === 0; if (glitch) txt = txt.replace(/[0-9]/g, () => '0123456789#?'[Math.floor(Math.random() * 12)]);
      const col = (o.redBelow != null && parseFloat(txt.replace(/[^0-9]/g, '')) <= o.redBelow) ? '#ff3b3b' : (o.color || '#7dff9a');
      const key = txt + col + glitch; if (key === last) return; last = key;
      cg.clearRect(0, 0, 512, 160); cg.fillStyle = 'rgba(10,14,24,.78)'; cg.beginPath(); cg.roundRect(8, 16, 496, 128, 40); cg.fill(); cg.lineWidth = 6; cg.strokeStyle = col; cg.stroke();
      cg.font = `${txt.length > 9 ? 64 : 84}px "Lilita One"`; cg.textAlign = 'center'; cg.textBaseline = 'middle'; cg.shadowColor = col; cg.shadowBlur = 18; cg.fillStyle = glitch ? '#ff4dff' : col; cg.fillText(txt, 256, 84); cg.shadowBlur = 0; tex.needsUpdate = true;
      sp.position.y = (o.y ?? 6.6) + Math.sin(t * 2) * .08;
    };
  } else if (type === 'glow') { // aura: additive soft light around the body (reads as a glow through bloom, does not tint the actor)
    const m = sprite(softTex(), { color: o.color || '#ffe14d', add: true }); m.position.y = 2.8; m.renderOrder = 2; g.add(m);
    update = (t) => { m.scale.setScalar((o.size || 8) * (1 + Math.sin(t * 6) * .06)); m.material.opacity = (o.opacity ?? .4) * Math.min(1, t * 5); };
  }
  return { obj: g, update };
}
