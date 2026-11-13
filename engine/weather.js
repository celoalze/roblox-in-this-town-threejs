// Weather presets (config/weather.json): sky, light, fog, cloud deck, particles, sun/moon/eclipse, stars, aurora, lightning.
// Everything is a pure function of time (no state) so parallel render workers agree.
import * as THREE from 'three';

let CFG = {}, scene, camera, root, camRoot;
const skyTex = {}, parts = {}, decks = {}, bodies = {}, dummy = new THREE.Object3D();
let stars, aurora, bolt, cur = { flash: 0, tint: null };
const rng = (seed) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
const mod = (a, n) => ((a % n) + n) % n;

export async function initWeather(sc, cam) {
  scene = sc; camera = cam;
  try { CFG = await (await fetch('/config/weather.json')).json(); } catch (e) { console.warn('weather.json not loaded', e); }
  scene.add(camera); root = new THREE.Group(); scene.add(root); camRoot = new THREE.Group(); camera.add(camRoot);
}
export const weatherOf = (s) => (s.weather && !s.weather.startsWith('_') && CFG[s.weather]) || null;

export function weatherSky(name) {
  if (skyTex[name]) return skyTex[name]; const [a, b, c] = CFG[name].sky;
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 512; const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, a); gr.addColorStop(.6, b); gr.addColorStop(1, c); g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return (skyTex[name] = t);
}

// ---------- particles ----------
const PT = { // geometry, colour(s), opacity, box [area, height], fall speed, wind speed
  rain: { geo: () => new THREE.BoxGeometry(.045, 1.1, .045), col: ['#bcd8ff'], op: .6, box: [46, 28], vy: 34, vx: 30 },
  snow: { geo: () => new THREE.SphereGeometry(.11, 6, 4), col: ['#ffffff'], op: .95, box: [46, 26], vy: 3.6, vx: 16 },
  leaves: { geo: () => new THREE.PlaneGeometry(.42, .26), col: ['#e08a2a', '#c9b02a', '#7fb03a', '#d9652a'], op: 1, box: [44, 11], vy: 1.4, vx: 13 },
  dust: { geo: () => new THREE.SphereGeometry(.09, 5, 3), col: ['#e2bd84', '#caa064'], op: .75, box: [40, 13], vy: .4, vx: 22 },
  streaks: { geo: () => new THREE.BoxGeometry(2.6, .035, .035), col: ['#ffffff'], op: .45, box: [44, 12], vy: 0, vx: 38 },
  motes: { geo: () => new THREE.SphereGeometry(.1, 6, 4), col: ['#fff4b8', '#ffd4ee', '#c9f1ff', '#e2d4ff'], op: .95, box: [40, 15], vy: -.55, vx: 3, glow: 2.4 }, // glowing light specks drifting up (Sky-style)
  petals: { geo: () => new THREE.PlaneGeometry(.34, .22), col: ['#ffc2dc', '#ffe3ef', '#fff2b8', '#dccbff'], op: 1, box: [44, 13], vy: 1, vx: 7 },
};
function particles(type, count) {
  const key = type + '|' + count; if (parts[key]) return parts[key];
  const P = PT[type]; const r = rng(type.length * 977 + count);
  const im = new THREE.InstancedMesh(P.geo(), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: P.op < 1 || !!P.glow, opacity: P.op, side: THREE.DoubleSide, fog: false, toneMapped: !P.glow, blending: P.glow ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !P.glow }), count);
  im.frustumCulled = false; const cols = P.col.map(c => new THREE.Color(c).multiplyScalar(P.glow || 1)); const R = [];
  for (let i = 0; i < count; i++) { R.push([r(), r(), r(), r()]); im.setColorAt(i, cols[i % cols.length]); }
  root.add(im); return (parts[key] = { im, R, P, type });
}
function updateParticles(o, t, focus, wind) {
  const { im, R, P, type } = o; const [A, H] = P.box; const vx = P.vx * wind, cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
  const slant = type === 'rain' ? Math.atan2(vx, P.vy) : 0;
  for (let i = 0; i < R.length; i++) {
    const [a, b, c, d] = R[i]; const sp = .75 + d * .5;
    let x = focus.x + mod(a * A + vx * sp * t - focus.x + A / 2, A) - A / 2, z = focus.z + mod(b * A - focus.z + A / 2, A) - A / 2, y = H - mod(c * H + P.vy * sp * t, H);
    if (type === 'snow') { x += Math.sin(t * 1.3 + d * 9) * .6; z += Math.cos(t + c * 9) * .4; }
    if (type === 'leaves' || type === 'dust' || type === 'petals') { y = .3 + mod(c * H + Math.sin(t * 1.7 + d * 20) * 1.6 - P.vy * sp * t, H); z += Math.sin(t * 1.1 + a * 30) * 1.2; }
    if (type === 'motes') { y = .5 + mod(c * H - P.vy * sp * t, H); x += Math.sin(t * .8 + d * 30) * 1.1; z += Math.cos(t * .7 + a * 20) * 1; }
    if (type === 'streaks') y = 1 + c * H;
    dummy.position.set(x, y, z);
    const spin = type === 'leaves' || type === 'petals';
    dummy.rotation.set(spin ? t * (3 + a * 4) : 0, spin ? t * (2 + b * 5) : 0, spin ? d * 6 : slant);
    const near = Math.hypot(x - cx, y - cy, z - cz) < 7; // never a blob right on the lens
    dummy.scale.setScalar(near ? 0 : type === 'streaks' ? .5 + d : type === 'motes' ? .6 + .8 * d * (.6 + .4 * Math.sin(t * 2 + a * 40)) : 1); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
  }
  im.instanceMatrix.needsUpdate = true;
}

// ---------- cloud deck ----------
function deck(color, n) {
  const key = color + '|' + n; if (decks[key]) return decks[key];
  const g = new THREE.Group(); const r = rng(n * 131 + 5); const m = new THREE.MeshBasicMaterial({ color });
  const m2 = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(.82) });
  for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, d = 25 + Math.sqrt(r()) * 230; const c = new THREE.Group(); c.position.set(Math.cos(a) * d, 58 + r() * 26, Math.sin(a) * d);
    for (let k = 0; k < 4; k++) { const sp = new THREE.Mesh(new THREE.SphereGeometry(13 + r() * 12, 10, 8), k % 2 ? m2 : m); sp.position.set((k - 1.5) * 15, r() * 5, r() * 12); sp.scale.y = .45; c.add(sp); } g.add(c); }
  root.add(g); return (decks[key] = g);
}

// ---------- sun / moon / eclipse / rainbow (camera-anchored so they are always in frame, far behind the set) ----------
function disc(draw, size = 512) { const cv = document.createElement('canvas'); cv.width = cv.height = size; draw(cv.getContext('2d'), size / 2); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; }
const glow = (g, c, r0, r1, stops) => { const gr = g.createRadialGradient(c, c, r0, c, c, r1); stops.forEach(([k, col]) => gr.addColorStop(k, col)); g.fillStyle = gr; g.fillRect(0, 0, c * 2, c * 2); };
const craters = (g, c, R, col) => { g.fillStyle = col; [[-.3, -.25, .22], [.28, .1, .16], [-.1, .38, .13], [.34, -.4, .1], [-.48, .2, .09], [.05, -.05, .08]].forEach(([x, y, r]) => { g.beginPath(); g.arc(c + x * R, c + y * R, r * R, 0, 7); g.fill(); }); };
const BODY = {
  sun: () => ({ tex: disc((g, c) => { glow(g, c, 0, c, [[0, 'rgba(255,255,255,1)'], [.2, 'rgba(255,250,210,1)'], [.26, 'rgba(255,225,120,.75)'], [.55, 'rgba(255,200,90,.22)'], [1, 'rgba(255,190,80,0)']]); }), size: 120, add: true }),
  moon: () => ({ tex: disc((g, c) => { glow(g, c, c * .4, c, [[0, 'rgba(190,210,255,.5)'], [1, 'rgba(190,210,255,0)']]); g.fillStyle = '#f4f1e2'; g.beginPath(); g.arc(c, c, c * .5, 0, 7); g.fill(); craters(g, c, c * .5, 'rgba(160,160,170,.45)'); }), size: 96 }),
  bloodmoon: () => ({ tex: disc((g, c) => { glow(g, c, c * .4, c, [[0, 'rgba(255,60,40,.55)'], [1, 'rgba(255,40,30,0)']]); const gr = g.createRadialGradient(c - c * .15, c - c * .15, 0, c, c, c * .5); gr.addColorStop(0, '#ff7a4a'); gr.addColorStop(1, '#8a1410'); g.fillStyle = gr; g.beginPath(); g.arc(c, c, c * .5, 0, 7); g.fill(); craters(g, c, c * .5, 'rgba(70,5,5,.45)'); }), size: 104 }),
  eclipse: () => ({ tex: disc((g, c) => { glow(g, c, c * .36, c, [[0, 'rgba(255,255,255,1)'], [.12, 'rgba(255,230,170,.8)'], [.5, 'rgba(255,170,90,.2)'], [1, 'rgba(255,150,80,0)']]); g.fillStyle = '#04040a'; g.beginPath(); g.arc(c, c, c * .4, 0, 7); g.fill(); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(c + c * .3, c - c * .3, c * .05, 0, 7); g.fill(); }), size: 120 }),
  rainbow: () => ({ tex: disc((g, c) => { ['#ff3b3b', '#ff9a2e', '#ffe14d', '#4cd964', '#3ea6ff', '#8a5cff'].forEach((col, i) => { g.strokeStyle = col; g.lineWidth = c * .045; g.beginPath(); g.arc(c, c * 1.55, c * (.95 - i * .045), Math.PI, Math.PI * 2); g.stroke(); }); }, 1024), size: 250, y: 30, x: 0, op: .6 }),
};
function body(name) {
  if (bodies[name]) return bodies[name]; const b = BODY[name]();
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: b.tex, transparent: true, depthWrite: false, fog: false, toneMapped: false, opacity: b.op ?? 1, blending: b.add ? THREE.AdditiveBlending : THREE.NormalBlending }));
  sp.userData = b; sp.renderOrder = -5; camRoot.add(sp); return (bodies[name] = sp);
}
function getStars() {
  if (stars) return stars; const r = rng(4242), n = 1400, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, e = Math.asin(r() * .96 + .02), R = 520; pos.set([Math.cos(a) * Math.cos(e) * R, Math.sin(e) * R, Math.sin(a) * Math.cos(e) * R], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 2.4, sizeAttenuation: false, fog: false, transparent: true, depthWrite: false, toneMapped: false })); stars.frustumCulled = false; stars.renderOrder = -6; root.add(stars); return stars;
}
function getAurora() {
  if (aurora) return aurora; aurora = new THREE.Group();
  [['rgba(60,255,170,', 0, 1], ['rgba(90,200,255,', 40, .8], ['rgba(190,110,255,', -50, .6]].forEach(([col, x, k], i) => {
    const tex = disc((g, c) => { for (let px = 0; px < c * 2; px += 4) { const h = c * (.9 + .5 * Math.sin(px * .021 + i * 2) + .25 * Math.sin(px * .057 + i)); const gr = g.createLinearGradient(0, c * 2 - h, 0, c * 2); gr.addColorStop(0, col + '0)'); gr.addColorStop(.45, col + (.55 * k) + ')'); gr.addColorStop(1, col + '0)'); g.fillStyle = gr; g.fillRect(px, c * 2 - h, 4, h); } });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false, blending: THREE.AdditiveBlending })); sp.scale.set(300, 130, 1); sp.position.set(x, 70 + i * 12, -330 - i * 5); sp.renderOrder = -5; aurora.add(sp);
  });
  camRoot.add(aurora); return aurora;
}
function getBolt() {
  if (bolt) return bolt; bolt = new THREE.Group(); const r = rng(99);
  for (let v = 0; v < 3; v++) { const pts = []; let x = 0; for (let y = 70; y >= 0; y -= 5) { pts.push(new THREE.Vector3(x, y, 0)); x += (r() - .5) * 9; }
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, .45, 5), new THREE.MeshBasicMaterial({ color: '#fffbe0', fog: false, toneMapped: false })); bolt.add(m); }
  root.add(bolt); return bolt;
}
/** lightning: [flash 0..1, strike index] at scene-local time lt */
export function lightningAt(L, lt) {
  if (!L) return [0, 0]; const k = Math.floor((lt - L.first) / L.every); if (k < 0) return [0, 0]; const d = lt - (L.first + k * L.every);
  return [d < .1 ? 1 : d > .16 && d < .3 ? .6 * (1 - (d - .16) / .14) + .25 : 0, k];
}

/** every frame: show / animate the current scene's weather. Returns {flash}. */
export function updateWeather(s, lt, t, focus, interior, sceneIndex = 0) {
  const wx = weatherOf(s); const out = !interior && wx; cur = { flash: 0, tint: out ? wx.tint : null };
  root.children.forEach(c => c.visible = false); camRoot.children.forEach(c => c.visible = false);
  if (!wx) return cur;
  const [flash, k] = lightningAt(wx.lightning, lt); cur.flash = flash * (interior ? .5 : 1);
  if (!out) return cur;
  root.position.set(0, 0, 0);
  for (const p of wx.particles || []) { const o = particles(p.type, p.count); o.im.visible = true; updateParticles(o, t, focus, wx.wind ?? .2); }
  if (wx.clouds) { const d = deck(wx.clouds.color, wx.clouds.n || 46); d.visible = true; d.position.set(focus.x, 0, focus.z); d.rotation.y = t * .012 * (1 + (wx.wind || 0) * 4); }
  if (wx.body) { const b = body(wx.body), u = b.userData, sc = wx.bodyScale || 1; b.visible = true; b.scale.set(u.size * sc, u.size * sc, 1); b.position.set(u.x ?? 36, u.y ?? 64, -300); }
  if (wx.stars) { const st = getStars(); st.visible = true; st.position.copy(camera.position); st.material.opacity = Math.min(1, wx.stars); st.material.size = wx.stars > 1 ? 3 : 2.4; }
  if (wx.aurora) { const a = getAurora(); a.visible = true; a.children.forEach((sp, i) => { sp.position.x += 0; sp.material.opacity = .65 + .3 * Math.sin(t * .9 + i * 2); sp.scale.x = 300 + 26 * Math.sin(t * .5 + i); }); }
  if (flash > 0) { const b = getBolt(); b.visible = true; const h = rng((k + 1) * 7919 + sceneIndex * 131 + 3); h(); const side = (h() - .5) * 70, v = Math.floor(h() * 3);
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize(); const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    b.position.copy(camera.position).addScaledVector(fwd, 120).addScaledVector(right, side); b.position.y = 0; b.rotation.y = Math.atan2(fwd.x, fwd.z); b.children.forEach((m, i) => m.visible = i === v); }
  return cur;
}
/** 2D pass after the 3D render: colour wash + lightning flash */
export function drawWeather2D(g, W, H) {
  if (cur.tint) { g.fillStyle = cur.tint; g.fillRect(0, 0, W, H); }
  if (cur.flash > 0) { g.fillStyle = `rgba(235,240,255,${.3 * cur.flash})`; g.fillRect(0, 0, W, H); }
}
