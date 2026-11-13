// Skybox + final grade pass.
// A sky is a cubemap in the Roblox Sky model (six faces: SkyboxRt Lf Up Dn Bk Ft) so any Roblox skybox can be reused as is;
// equirect panoramas (Poly Haven) and the procedural fantasy skies are converted to the same cubemap form at load.
// config/skies.json: { name: { faces: "assets/sky/<dir>" | file: "assets/sky/panoramas/x.jpg" | gen: "<procedural>", sunU, sat, con, exp,
//                              sun: [color, intensity], hemi: [color, intensity], fog: [color, near, far], rays, time } }
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

let CFG = {}, dome, renderer; const TEX = {};
const FACES = ['lf', 'rt', 'up', 'dn', 'bk', 'ft']; // Roblox faces in three's cube slots (+x -x +y -y +z -z; the sampler mirrors x): Ft is seen looking -Z, Rt looking +X (stories/_facetest)
const turned = (im, q) => { if (!q) return im; const cv = document.createElement('canvas'); cv.width = cv.height = im.width; const g = cv.getContext('2d'); g.translate(im.width / 2, im.width / 2); g.rotate(q * Math.PI / 2); g.drawImage(im, -im.width / 2, -im.width / 2); return cv; }; // upRot / dnRot: quarter turns for skies exported with another up-face convention
const img = (url) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('sky image ' + url)); i.src = url; });

// ---- procedural fantasy skies (equirect canvas) ----
const GEN = {
  purple_planets(g, w, h, R) {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a1a8c'); gr.addColorStop(.3, '#6a3fd0'); gr.addColorStop(.47, '#ff9fe0'); gr.addColorStop(.5, '#bfe6ff'); gr.addColorStop(1, '#3aa0ff'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { const x = R() * w, y = h * (.08 + R() * .38), rx = 60 + R() * 260, ry = 5 + R() * 16; g.fillStyle = `rgba(${R() < .5 ? '255,190,240' : '170,140,255'},${.05 + R() * .1})`; g.beginPath(); g.ellipse(x, y, rx, ry, -.12, 0, 7); g.fill(); }
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,255,255,${.3 + R() * .7})`; const s = 1 + R() * 2; g.fillRect(R() * w, R() * h * .3, s, s); }
    for (const [u, v, r, c1, c2, ring] of [[.5, .36, 90, '#7a5cff', '#ff9be8', 1], [.38, .3, 34, '#e8e8f4', '#9aa0c8', 0], [.62, .41, 22, '#bfe0ff', '#6f8fd8', 0], [.12, .33, 120, '#ffb86a', '#ff6fb0', 1], [.82, .27, 60, '#8affea', '#4a7dff', 0]]) {
      const x = u * w, y = v * h; if (ring) { g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = r * .16; g.beginPath(); g.ellipse(x, y, r * 1.75, r * .62, -.5, 0, 7); g.stroke(); }
      const pg = g.createLinearGradient(x, y - r, x, y + r); pg.addColorStop(0, c1); pg.addColorStop(1, c2); g.fillStyle = pg; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      if (ring) { g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = r * .16; g.beginPath(); g.ellipse(x, y, r * 1.75, r * .62, -.5, .25, 2.9); g.stroke(); } }
  },
  nebula(g, w, h, R) {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#05041a'); gr.addColorStop(.35, '#1a0f55'); gr.addColorStop(.5, '#3a1f8a'); gr.addColorStop(1, '#120a3a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 520; i++) { const t = R() * 6.28, x = (R() * w), y = h * (.26 + .1 * Math.sin(x / w * 12.56 + 1) + (R() - .5) * .2), r = 40 + R() * 200; const c = ['120,60,255', '200,70,255', '60,90,255', '255,90,200'][i % 4]; const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, `rgba(${c},${.05 + R() * .08})`); rg.addColorStop(1, `rgba(${c},0)`); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); }
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 5200; i++) { const b = R(); g.fillStyle = `rgba(${b > .9 ? '255,220,255' : '220,230,255'},${.25 + R() * .75})`; const s = b > .97 ? 4 : 1 + R() * 1.6; g.fillRect(R() * w, R() * h * .52, s, s); }
  },
};

async function load(name) {
  if (TEX[name]) return TEX[name]; const c = CFG[name]; if (!c) throw new Error('unknown sky ' + name); let t, flip = 1;
  if (c.faces) { const ims = await Promise.all(FACES.map(f => img(`/${c.faces}/${f}.${c.ext || 'png'}`))); ims[2] = turned(ims[2], c.upRot); ims[3] = turned(ims[3], c.dnRot); t = new THREE.CubeTexture(ims); t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; flip = -1; }
  else { let eq;
    if (c.gen) { const cv = document.createElement('canvas'); cv.width = 4096; cv.height = 2048; let sd = 11; GEN[c.gen](cv.getContext('2d'), 4096, 2048, () => (sd = (sd * 16807) % 2147483647) / 2147483647); eq = new THREE.CanvasTexture(cv); }
    else eq = new THREE.Texture(await img('/' + c.file)); eq.colorSpace = THREE.SRGBColorSpace; eq.mapping = THREE.EquirectangularReflectionMapping; eq.needsUpdate = true;
    const rt = new THREE.WebGLCubeRenderTarget(c.size || 2048, { type: THREE.HalfFloatType }); rt.fromEquirectangularTexture(renderer, eq); eq.dispose(); t = rt.texture; }
  return (TEX[name] = { t, flip });
}

export async function initSky(scene, rend, names) {
  renderer = rend; CFG = Object.fromEntries(Object.entries(await (await fetch('/config/skies.json')).json()).filter(([k]) => k[0] !== '_'));
  for (const n of new Set(names.filter(Boolean))) await load(n);
  const samp = `vec3 samp(samplerCube t, float flip, float rot, vec3 g) { vec3 d = normalize(vDir); float c = cos(rot), s = sin(rot); d = vec3(c * d.x - s * d.z, d.y, s * d.x + c * d.z);
    vec3 col = textureCube(t, vec3(flip * d.x, d.y, d.z)).rgb; col = pow(max(col, 0.), vec3(1. / 2.2)); float l = dot(col, vec3(.2126, .7152, .0722)); col = mix(vec3(l), col, g.x); col = (col - .5) * g.y + .5; return pow(max(col, 0.), vec3(2.2)) * g.z; }`;
  DOME = () => new THREE.Mesh(new THREE.SphereGeometry(850, 48, 24), new THREE.ShaderMaterial({
    uniforms: { A: { value: null }, B: { value: null }, fA: { value: 1 }, fB: { value: 1 }, rA: { value: 0 }, rB: { value: 0 }, gA: { value: new THREE.Vector3(1, 1, 1) }, gB: { value: new THREE.Vector3(1, 1, 1) }, hA: { value: new THREE.Color() }, hB: { value: new THREE.Color() }, k: { value: 0 } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `varying vec3 vDir; uniform samplerCube A, B; uniform float fA, fB, rA, rB, k; uniform vec3 gA, gB, hA, hB; ${samp}
      void main() { float dn = smoothstep(.015, -.05, normalize(vDir).y); vec3 a = mix(samp(A, fA, rA, gA), hA, dn); if (k > 0.) a = mix(a, mix(samp(B, fB, rB, gB), hB, dn), k); gl_FragColor = vec4(a, 1.); }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false }));
  dome = newDome(scene);
}
let DOME; export function newDome(scene) { const d = DOME(); d.renderOrder = -1000; d.frustumCulled = false; d.visible = false; d.userData.noAO = true; scene.add(d); return d; } // a portal's destination has its own scene and its own sky
export const skyCfg = (n) => CFG[n];
export const skyNames = () => Object.keys(CFG);
// The picture is turned so its sun sits where the engine's sun light comes from (azimuth of SUN_OFF = 30,_,25).
const rotOf = (c) => ((c.sunU ?? .61) - .6106) * Math.PI * 2 + (c.rot || 0) * Math.PI / 180;
function put(slot, n, dome) { const c = CFG[n], T = TEX[n], u = dome.material.uniforms; u[slot].value = T.t; u['f' + slot].value = T.flip; u['r' + slot].value = rotOf(c); u['g' + slot].value.set(c.sat ?? 1.25, c.con ?? 1.1, c.exp ?? 1); u['h' + slot].value.set((c.fog || ['#cfe6ff'])[0]); }
export function setSky(a, b, d = dome) { const dome = d; dome.visible = !!a && !!TEX[a]; if (!dome.visible) return false; put('A', a, dome); put('B', b && TEX[b] ? b : a, dome); dome.material.uniforms.k.value = 0; return true; }
export function updateSky(camera, k = 0, d = dome) { const dome = d; if (dome.visible) { dome.position.copy(camera.position); dome.material.uniforms.k.value = k; } }

// ---- final grade: saturation / contrast / tint, vignette, chromatic aberration, light shafts + flare from the sun ----
export const GRADES = {
  none: { sat: 1, con: 1, tint: [1, 1, 1], lift: [0, 0, 0], vig: 0, ca: 0 },
  vivid: { sat: 1.22, con: 1.1, tint: [1, 1, 1], lift: [0, 0, 0], vig: .22, ca: .0025 },
  flashback: { sat: .78, con: 1.05, tint: [1.12, 1, .72], lift: [.07, .045, 0], vig: .55, ca: .004 },
  threat: { sat: .55, con: 1.2, tint: [.8, .85, .95], lift: [0, 0, .01], vig: .5, ca: .003 },
  cold: { sat: 1.12, con: 1.08, tint: [.86, .96, 1.12], lift: [0, 0, .01], vig: .28, ca: .0025 },
  gold: { sat: 1.2, con: 1.08, tint: [1.12, 1.02, .82], lift: [.02, .01, 0], vig: .28, ca: .0025 },
  dream: { sat: 1.15, con: 1, tint: [1.05, .95, 1.1], lift: [.04, .03, .05], vig: .3, ca: .003 },
};
export function gradePass(aspect) {
  const p = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, sunUv: { value: new THREE.Vector2(.5, 2) }, rays: { value: 0 }, flare: { value: 0 }, ca: { value: 0 }, vig: { value: 0 }, sat: { value: 1 }, con: { value: 1 }, tint: { value: new THREE.Vector3(1, 1, 1) }, lift: { value: new THREE.Vector3() }, aspect: { value: aspect } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform vec2 sunUv; uniform float rays, flare, ca, vig, sat, con, aspect; uniform vec3 tint, lift;
      void main() { vec2 uv = vUv, d = uv - .5; vec3 c = texture2D(tDiffuse, uv).rgb;
        if (ca > 0.) { vec2 o = d * ca * (.35 + dot(d, d) * 5.); c.r = texture2D(tDiffuse, uv + o).r; c.b = texture2D(tDiffuse, uv - o).b; }
        if (rays > 0.) { vec2 st = (sunUv - uv) / 28. * .92, p = uv; float w = 1.; vec3 acc = vec3(0.);
          for (int i = 0; i < 28; i++) { p += st; vec3 s = texture2D(tDiffuse, clamp(p, 0., 1.)).rgb; acc += s * smoothstep(.74, .99, dot(s, vec3(.3, .6, .1))) * w; w *= .955; }
          c += acc / 28. * rays * 1.1; vec2 q = (uv - sunUv) * vec2(aspect, 1.); float sl = smoothstep(.6, 1., dot(texture2D(tDiffuse, clamp(sunUv, 0., 1.)).rgb, vec3(.3, .6, .1)));
          c += vec3(1., .94, .82) * flare * sl * (exp(-dot(q, q) * 30.) + .22 * exp(-dot(q, q) * 4.)) * (1. - smoothstep(.15, .5, dot(c, vec3(.3, .6, .1)) - .6)); }
        float l = dot(c, vec3(.2126, .7152, .0722)); c = mix(vec3(l), c, sat); c = (c - .5) * con + .5; c = c * tint + lift; c *= 1. - vig * smoothstep(.3, 1., length(d) * 1.3);
        gl_FragColor = vec4(clamp(c, 0., 1.), 1.); }` });
  p.enabled = false; return p;
}
export function setGrade(p, g, sunUv, rays) { const u = p.uniforms; u.sat.value = g.sat; u.con.value = g.con; u.tint.value.set(...g.tint); u.lift.value.set(...g.lift); u.vig.value = g.vig; u.ca.value = g.ca; u.rays.value = rays; u.flare.value = rays * 1.2; if (sunUv) u.sunUv.value.copy(sunUv);
  p.enabled = rays > 0 || g.vig > 0 || g.ca > 0 || g.sat !== 1 || g.con !== 1 || g.tint.some(x => x !== 1) || g.lift.some(x => x !== 0); }
