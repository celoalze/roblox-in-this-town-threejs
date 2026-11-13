// Runtime: builds everything from a timeline and renders any time t deterministically.
import * as THREE from 'three';
import { buildCharacter, setFace, pose, blendPose, applyPose, loadAtlas, RIM, registerAnims, baseAnim, blendPoseLag, preloadHair, hairStyles } from './character.js';
import { faceOptions } from './face2.js';
import { coverMap, mergeCovers, layerHair, fitCover } from './layers.js';
import { preloadWear, wearInfo, makeWear, partSpace } from './wear.js';
import { carryHands15 } from './r15_attach.js';
import { buildCreature } from './creatures.js';
import { planCrowd, crowdAt } from './crowd.js';
import { preloadModelProps, isModelProp, makeModelProp, wearOf, makeWornProp } from './modelprops.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { HueSaturationShader } from 'three/addons/shaders/HueSaturationShader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildSet, INTERIOR, box, mat } from './sets.js';
import { makeProp, makeFX, GRIP, EMOTES } from './props.js';
import { drawCaptions, drawOverlays } from './overlay.js';
import { setTreatments, applyTreat } from './treatments.js';
import { initWeather, weatherOf, weatherSky, updateWeather, drawWeather2D } from './weather.js';
import { preloadPBR } from './pbr.js';
import { registerQuarks } from './quarks.js';
import { resolveLinks, finishLinks, linkRoot, headY } from './links.js'; // actor links + arm IK (engine/links.js)
import { initSky, skyCfg, setSky, updateSky, newDome, gradePass, setGrade, GRADES } from './sky.js';
let baseHemi = 1;

let grade, LA = null, LB = null; const AAA = () => TL.style?.look === 'aaa';
// which skybox a scene shows: its own `sky` (inherited by the pipeline), or with style.look 'aaa' the one that goes with its time of day
const LOOK_SKY = { day: 'day_puffy', sunset: 'sunset', dusk: 'golden_hour', night: 'night_stars', spooky: 'storm' };
function skyName(s) { const n = s.sky ?? (AAA() && !INTERIOR.has(s.set) && s.set !== 'studio' && !s.weather ? LOOK_SKY[s.time || 'day'] : null); return n && n !== 'none' ? n : null; }
const skyLight = (n) => { const c = skyCfg(n); return { sunC: new THREE.Color(c.sun[0]), sunI: c.sun[1], hemiC: new THREE.Color(c.hemi[0]), hemiI: c.hemi[1], fogC: new THREE.Color(c.fog[0]) }; };
let composer, bloom, gtao, bokeh, TL, W, H, renderer, scene, camera, comp, cg, sun, hemi, amb, skyTex = {}, camLook = null;
const sets = {}, chars = {}, sceneCache = new Map(), MAPS = {};
// Exported Roblox maps (glTF from Studio, units = studs, Roblox world coords). Merged per material for speed.
async function loadMap(file) {
  if (MAPS[file]) return MAPS[file];
  const L = new GLTFLoader(); const gltf = await L.loadAsync(`/assets/maps/${file}.glb`).catch(() => L.loadAsync(`/assets/maps/${file}.gltf`)); gltf.scene.updateMatrixWorld(true);
  const buckets = new Map();
  gltf.scene.traverse(o => { if (!o.isMesh) return; let m = o.material; const hasMap = !!m.map; let key = m.uuid;
    const ca = o.geometry.attributes.color; const alpha = ca && ca.itemSize === 4 ? ca.getW(0) : 1; // Roblox Transparency lives in vertex alpha
    if (alpha < .05 || o.name === 'delete me' || (m.transparent && !m.map)) return;
    if (alpha < .95) { key += '_t' + alpha.toFixed(1); m = MAPS['_mat' + key] || (MAPS['_mat' + key] = Object.assign(m.clone(), { transparent: true, opacity: alpha, depthWrite: false })); }
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
    for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal' && a !== 'color' && !(hasMap && a === 'uv')) g.deleteAttribute(a);
    if (!g.attributes.color) { const c = new Float32Array(g.attributes.position.count * 3).fill(1); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); } else if (g.attributes.color.itemSize === 4) { const s4 = g.attributes.color, c = new Float32Array(s4.count * 3); for (let i = 0; i < s4.count; i++) { c[i * 3] = s4.getX(i); c[i * 3 + 1] = s4.getY(i); c[i * 3 + 2] = s4.getZ(i); } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
    if (!g.attributes.normal) g.computeVertexNormals(); if (hasMap && !g.attributes.uv) return;
    (buckets.get(key) || buckets.set(key, { m, list: [] }).get(key)).list.push(g); });
  const grp = new THREE.Group(); grp.userData.isMap = true;
  for (const { m, list } of buckets.values()) { const geo = mergeGeometries(list, false); if (!geo) continue; m.metalness = 0; m.vertexColors = true; if (!m.transparent) { m.transparent = false; m.opacity = 1; } m.roughness = Math.max(m.roughness ?? .8, .7); const mesh = new THREE.Mesh(geo, m); mesh.castShadow = mesh.receiveShadow = true; grp.add(mesh); }
  return (MAPS[file] = grp);
}
// Polyfork kits (assets/models/kits/<kit>/kit.mjs builds the composed place, metres) scaled to studs.
const KITS = {}, KS = 3.4;
async function loadKit(id) {
  if (KITS[id]) return KITS[id];
  const base = `/assets/models/kits/${id}/`; const mod = await import(base + 'kit.mjs');
  const place = await mod.buildKit({ folder: base, people: 'none' }); try { await place.surround(); } catch (e) {}
  if (place.lamps) place.lamps.visible = false; // night light-pools: opacity 0 by day but still written to the AO depth/normal pass = black slabs on the ground
  place.group.traverse(o => { if (o.isMesh && o.material && o.material.transparent && o.material.opacity === 0) o.visible = false; });
  place.group.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  if (!place.interior) {
    const gCol = place.groundColor || (id.includes('farm') ? '#95aa5d' : (id.includes('tokyo') || id.includes('japan')) ? '#3f8a5e' : '#5a9a45');
    const gy = place.groundY ?? -0.05;
    const groundGeo = new THREE.PlaneGeometry(1000, 1000); groundGeo.rotateX(-Math.PI / 2);
    const groundMat = mat(gCol, { roughness: 0.85 }); const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    const c = place.bounds?.getCenter(new THREE.Vector3()) || new THREE.Vector3();
    groundMesh.position.set(c.x, gy, c.z); groundMesh.receiveShadow = true; groundMesh.userData.noOcclude = true; groundMesh.userData.isGround = true;
    place.group.add(groundMesh);
  }
  if (id === 'modern-restaurant-cafe-01ea4c') {
    const ceilGeo = new THREE.BoxGeometry(28, 0.35, 22);
    const ceilMat = mat('#f0ece1', { roughness: 0.9, emissive: '#2d2824', emissiveIntensity: 0.15 });
    const ceil = new THREE.Mesh(ceilGeo, ceilMat);
    ceil.position.set(0, 3.2 + 0.175, -3); ceil.userData.noOcclude = true; ceil.castShadow = false; ceil.receiveShadow = true;
    place.group.add(ceil);
    const floorGeo = new THREE.BoxGeometry(36, 0.25, 26); const floorMat = mat('#7a8285', { roughness: 0.9 });
    const floorPad = new THREE.Mesh(floorGeo, floorMat); floorPad.position.set(2.5, -0.15, -3);
    floorPad.userData.noOcclude = true; floorPad.receiveShadow = true;
    place.group.add(floorPad);
  } else if (place.interior && place.bounds && !place.bounds.isEmpty()) {
    const sz = place.bounds.getSize(new THREE.Vector3()); const c = place.bounds.getCenter(new THREE.Vector3());
    const ceilGeo = new THREE.BoxGeometry(sz.x + 4, 0.35, sz.z + 4);
    const ceilMat = mat('#f0ece1', { roughness: 0.9, emissive: '#2d2824', emissiveIntensity: 0.15 });
    const ceil = new THREE.Mesh(ceilGeo, ceilMat); ceil.position.set(c.x, place.bounds.max.y + 0.175, c.z);
    ceil.userData.noOcclude = true; ceil.castShadow = false; ceil.receiveShadow = true;
    place.group.add(ceil);
  }
  const inner = new THREE.Group(); inner.scale.setScalar(KS); inner.add(place.group); const wrap = new THREE.Group(); wrap.add(inner); wrap.userData.isMap = true;
  return (KITS[id] = { wrap, inner, place });
}
function placeKit(K, s) { // setOpts: at [x,z] metres | near: part key (+index, dx, dz metres) ; yaw deg
  const o = s.setOpts || {}; let [ax, az] = o.at || [0, 0];
  if (o.near) { const p = K.place.where(o.near)[o.index || 0]; if (p) { ax = p.x; az = p.z; } }
  ax += o.dx || 0; az += o.dz || 0;
  if (o.open !== false && K.place.openSpot) { try { const q = K.place.openSpot({ near: new THREE.Vector3(ax, 0, az) }); if (q && Math.hypot(q.x - ax, q.z - az) < 12) { ax = q.x; az = q.z; } } catch (e) {} } const gy = K.place.groundAt(ax, az) || 0;
  K.inner.position.set(-ax * KS, -gy * KS, -az * KS); K.wrap.rotation.y = (o.yaw || 0) * D2R; K.wrap.updateMatrixWorld(true);
  // stand on the real walkable surface (deck, ramp, floor), not the terrain under it
  mapRay.set(V(0, 10, 0), V(0, -1, 0)); mapRay.far = 25; const h = mapRay.intersectObject(K.wrap, true).find(h => !h.object.material?.transparent); mapRay.far = Infinity;
  if (h) { K.inner.position.y -= h.point.y; K.wrap.updateMatrixWorld(true); }
}
const mapRay = new THREE.Raycaster();
function placeMap(g, s) { // move the map so the scene anchor (Roblox X,Z) sits at the origin, ground at y=0
  const [ax, az] = s.setOpts?.anchor || [0, 0]; g.position.set(-ax, 0, -az); g.rotation.y = 0; g.updateMatrixWorld(true);
  mapRay.set(V(0, 2000, 0), V(0, -1, 0)); const h = mapRay.intersectObject(g, true)[0]; const gy = h ? -h.point.y : 0; const yw = (s.setOpts?.yaw || 0) * D2R; const off = V(-ax, gy, -az).applyAxisAngle(V(0, 1, 0), yw); g.position.copy(off); g.rotation.y = yw; g.updateMatrixWorld(true);
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const D2R = Math.PI / 180;
const smooth = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => Math.max(0, Math.min(1, k));

const SKY = { day: ['#2f86f0', '#8cc8ff', '#e6f4ff', .85, 3.0], sunset: ['#4b3c8f', '#ff8a5c', '#ffd2a0', .75, 1.8], night: ['#0b1030', '#24305e', '#7a8cc8', .35, .5], dusk: ['#2a3a6a', '#7f86b8', '#c9c2e6', .55, 1.0], spooky: ['#141821', '#2b3342', '#5a6578', .3, .45] };

export async function init(timeline) {
  TL = timeline; W = TL.width; H = TL.height;
  await document.fonts.load('80px "Lilita One"'); await document.fonts.load('600 80px "Fredoka"');
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H, false); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping }[TL.style?.tone] ?? THREE.NeutralToneMapping; renderer.toneMappingExposure = TL.style?.exposure ?? 1; // Neutral keeps the flat toy colours; ACES muddies them (style.tone 'aces' = the old look) renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(50, W / H, .1, 900);
  if (TL.style?.env !== false) { const pm = new THREE.PMREMGenerator(renderer); ENV = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose(); } // reflections for METAL only (envify): as scene.environment it lights everything and washes out the flat toy colours and the shadows
  hemi = new THREE.HemisphereLight('#dff1ff', '#8a9a6a', 1.1); scene.add(hemi);
  amb = new THREE.AmbientLight('#ffffff', .25); scene.add(amb);
  sun = new THREE.DirectionalLight('#fff4e0', 2.6); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 200 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = .03; sun.shadow.autoUpdate = false;
  scene.add(sun, sun.target);
  comp = document.createElement('canvas'); comp.width = W; comp.height = H; cg = comp.getContext('2d');
  document.body.appendChild(comp);
  try { setTreatments(await (await fetch('/config/treatments.json')).json()); } catch (e) { console.warn('treatments: ' + e.message); }
  await loadAtlas(); await initWeather(scene, camera); await preloadPBR(); registerQuarks(TL.quarks);
  try { registerAnims(TL.anims || await (await fetch('/config/anims.json')).json()); } catch (e) { console.warn('anims: ' + e.message); } // TL.anims = every config/anims*.json merged by the pipeline
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }); composer = new EffectComposer(renderer, rt); composer.addPass(new RenderPass(scene, camera));
  if (TL.style?.ao === true) { // OFF by default: GTAO paints sharp dark rectangles on the ground (wishing-stars 0:12); opt in with style.ao:true
    gtao = new GTAOPass(scene, camera, W, H); gtao.output = GTAOPass.OUTPUT.Default; gtao.blendIntensity = .85; gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.5, thickness: 1.5, scale: 1 }); gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 }); composer.addPass(gtao);
    // GTAO redraws the scene with an override material that ignores opacity: anything see-through (light pools, glass, decals,
    // particles, sky sprites) would be treated as a solid slab and darken what is behind it. Leave those out of the AO pass.
    gtao.overrideVisibility = function () { const cache = this._visibilityCache; this.scene.traverse(o => { cache.set(o, o.visible); const m = o.material; if (o.isPoints || o.isLine || o.isSprite || o.userData.noAO || (m && [].concat(m).some(x => x.transparent || x.isMeshBasicMaterial || x.opacity < 1 || x.visible === false || x.colorWrite === false || x.alphaTest > 0))) o.visible = false; }); };
  }
  if (TL.style?.dof !== false) { // shallow focus on close shots: the subject stays sharp, the set behind goes soft
    bokeh = new BokehPass(scene, camera, { focus: 10, aperture: 0, maxblur: .022 }); bokeh.enabled = false; composer.addPass(bokeh);
    const draw = bokeh.render.bind(bokeh); bokeh.render = (...a) => { const pts = []; scene.traverse(o => { if ((o.isPoints || o.isSprite || o.userData.noAO) && o.visible) { o.visible = false; pts.push(o); } }); draw(...a); pts.forEach(o => { o.visible = true; }); }; // pollen / stars carry no depth
  }
  bloom = new UnrealBloomPass(new THREE.Vector2(W, H), TL.style?.bloom ?? .35, .55, .82); composer.addPass(bloom); composer.addPass(new OutputPass());
  const sat = new ShaderPass(HueSaturationShader); sat.uniforms.saturation.value = TL.style?.saturation ?? .14; composer.addPass(sat);
  grade = gradePass(W / H); composer.addPass(grade); await initSky(scene, renderer, TL.scenes.flatMap(s => [skyName(s), s.skyTo?.sky, ...(s.props || []).map(p => p.portal?.sky)]));
  for (const k of new Set(TL.scenes.filter(s => s.set === 'kit').map(s => s.setOpts?.kit))) await loadKit(k);
  for (const f of new Set(TL.scenes.filter(s => s.set === 'map').map(s => s.setOpts?.file || 'brookhaven'))) await loadMap(f);
  await preloadWear([...TL.scenes.flatMap(s => (s.props || []).map(p => p.type)), ...Object.values(TL.cast || {}).flatMap(c => c.wear || [])]);
  if (TL.style?.modelProps !== false) await preloadModelProps(TL.scenes.flatMap(s => (s.props || []).map(p => p.type === 'scatter' ? p.model : p.type)));
  const poolN = Math.max(0, ...TL.scenes.map(s => (s.set === 'kit' ? Math.min(8, s.extras ?? TL.style?.extras ?? 0) : 0) + crowdN(s)));
  await preloadHair(Object.values(TL.cast || {}).map(c => String(c.hair || '').replace('rbx:', ''))); if (poolN) await preloadHair(hairStyles().filter(n => !NPC_SKIP.has(n)));
  for (const [id, spec] of Object.entries(TL.cast || {})) { const ch = spec.model ? await buildCreature(spec) : buildCharacter(spec); ch.root.visible = false; scene.add(ch.root); chars[id] = ch;
    ch.worn = []; for (const n of spec.wear || []) { const w = wearInfo(n); if (!w || ch.creature) { console.warn('unknown wearable ' + n); continue; } const o = makeWear(n), sp = partSpace(ch, w.part, w.slot, w.att); sp.add(o); envify(o); if (w.part === 'head') { cover(n, o, sp, true); ch.worn.push(n); } } }
  buildExtras(poolN);
  TL.scenes.forEach((s, i) => prepScene(s, i));
  return { duration: TL.duration, frames: Math.ceil(TL.duration * TL.fps) };
}

function skyTexture(key) {
  if (skyTex[key]) return skyTex[key]; const [a, b, c] = SKY[key] || SKY.day;
  const cv = document.createElement('canvas'); cv.width = 4; cv.height = 512; const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, a); gr.addColorStop(.6, b); gr.addColorStop(1, c); g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return (skyTex[key] = t);
}
function clouds(seed, night) {
  const g = new THREE.Group(); let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const m = mat(night ? '#3a4470' : '#ffffff', { roughness: 1, emissive: night ? '#000' : '#ffffff', emissiveIntensity: night ? 0 : .35 });
  for (let i = 0; i < 14; i++) { const c = new THREE.Group(); const a = r() * Math.PI * 2, d = 140 + r() * 120; c.position.set(Math.cos(a) * d, 45 + r() * 35, Math.sin(a) * d); for (let k = 0; k < 4; k++) { const sp = new THREE.Mesh(new THREE.SphereGeometry(6 + r() * 5, 10, 8), m); sp.position.set((k - 1.5) * 7, r() * 3, r() * 4); c.add(sp); } g.add(c); }
  return g;
}

// ---- resolve "at" values: seconds | "50%" | "w:word" | "w:word#2"
function resolveAt(v, s) {
  if (v == null) return 0; if (typeof v === 'number') return v;
  if (v.endsWith('%')) return parseFloat(v) / 100 * s.dur;
  if (v.startsWith('w:')) { let [word, n] = v.slice(2).toLowerCase().split('#'); n = +(n || 1); let c = 0; for (const w of s.words || []) { if (w.w.toLowerCase().replace(/[^a-z0-9']/g, '') === word.replace(/[^a-z0-9']/g, '') && ++c === n) return w.s - s.start; } return 0; }
  return parseFloat(v) || 0;
}

const lastState = {}; // carry actor positions across scenes in the same set
// Sets, props and fx of a scene are built the first time it is shown: a worker that renders 10 scenes of a 100-scene video
// builds only those (init stays fast, memory stays low). Actor paths (prepScene) are cheap and need every scene in order.
const COVERS = {}; // accessory type (or 'a+b') -> cover map
// exact = made for this head (Roblox hats): keep its size, and let it press hair right down to the scalp. Else (any GLB) it is fitted over head + hair.
function cover(type, o, space, exact) { if (!COVERS[type]) { const m = coverMap(o, space); if (exact) { m.fit = 1; m.solid = true; } else m.fit = fitCover(m); COVERS[type] = m; } return COVERS[type]; }
let ENV = null; // gold, swords, chrome: without something to reflect, metal renders as dark plastic
function envify(o) { if (!ENV || o.userData._env) return; o.userData._env = 1; o.traverse(x => { for (const m of [].concat(x.material || [])) if (m.isMeshStandardMaterial && m.metalness > .3 && !m.envMap) { m.envMap = ENV; m.envMapIntensity = TL.style?.env ?? .8; m.needsUpdate = true; } }); }
// ---- PORTALS: a doorway that shows another world. The destination is its own small scene (set + sky + light, no actors), drawn each
// frame into a render target from the main camera carried through the door, and the doorway samples it in screen space: real parallax.
const PORT = {}; let prt, pcam;
function portalFor(d) {
  const k = JSON.stringify(d); if (PORT[k]) return PORT[k]; if (!prt) { prt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }); pcam = new THREE.PerspectiveCamera(); }
  const sc = new THREE.Scene(), night = d.time === 'night' || d.time === 'spooky', g = buildSet(d.set, { ...(d.setOpts || {}), night }, d.seed || 7); sc.add(g); envify(g);
  const sk = SKY[d.time] || SKY.day, c = d.sky ? skyCfg(d.sky) : null, l = new THREE.DirectionalLight(c ? c.sun[0] : '#fff4e0', c ? c.sun[1] : sk[4]); l.position.copy(SUN_OFF);
  sc.add(new THREE.HemisphereLight(c ? c.hemi[0] : '#dff1ff', '#8a9a6a', c ? c.hemi[1] : sk[3] * 1.1), l, new THREE.AmbientLight('#ffffff', .25));
  if (!INTERIOR.has(d.set)) sc.fog = c ? new THREE.Fog(c.fog[0], c.fog[1], c.fog[2]) : new THREE.Fog(sk[2], 90, 420);
  const dome = c ? newDome(sc) : null; if (dome) setSky(d.sky, null, dome); else sc.background = INTERIOR.has(d.set) ? new THREE.Color('#0b0f22') : skyTexture(d.time || 'day');
  return (PORT[k] = { sc, dome, z: d.z ?? 0, y: d.y ?? 0 });
}
function drawPortal(P) {
  const m = P.o.userData.portal, q = new THREE.Quaternion(), p = V(), sc = V(); m.updateWorldMatrix(true, false); m.matrixWorld.decompose(p, q, sc); camera.updateMatrixWorld();
  const door = new THREE.Matrix4().compose(p, q, V(1, 1, 1)), dest = new THREE.Matrix4().makeTranslation(0, m.geometry.parameters.height * sc.y / 2 + P.portal.y, P.portal.z); // the doorway's sill sits at (0, y, z) of the destination
  dest.multiply(door.invert()).multiply(camera.matrixWorld).decompose(pcam.position, pcam.quaternion, pcam.scale);
  const n = V(0, 0, 1).applyQuaternion(q), dist = Math.abs(camera.position.clone().sub(p).dot(n)); pcam.fov = camera.fov; pcam.aspect = camera.aspect; pcam.near = Math.max(.1, dist * .5); pcam.far = 900; pcam.updateProjectionMatrix(); pcam.updateMatrixWorld(true); // near plane: nothing of the destination between the eye and the door
  if (P.portal.dome) updateSky(pcam, 0, P.portal.dome); m.material.uniforms.tex.value = prt.texture; m.material.uniforms.res.value.set(W, H);
  renderer.setRenderTarget(prt); renderer.render(P.portal.sc, pcam); renderer.setRenderTarget(null);
}
let _uwBG = null;
function underwaterBG() { if (_uwBG) return _uwBG; const c = document.createElement('canvas'); c.width = 4; c.height = 256; const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#7fe0ff'); gr.addColorStop(.35, '#1f9fd0'); gr.addColorStop(1, '#073a58'); x.fillStyle = gr; x.fillRect(0, 0, 4, 256); _uwBG = new THREE.CanvasTexture(c); _uwBG.colorSpace = THREE.SRGBColorSpace; return _uwBG; }
function prepAssets(s) {
  s._ready = true;
  const setKey = `${s.set}|${s.time}|${s.seed || 7}|${JSON.stringify(s.setOpts || {})}|${JSON.stringify(s.treat || '')}`;
  if (s.set === 'kit') { const K = KITS[s.setOpts.kit]; if (!K.wrap.parent) { K.wrap.visible = false; scene.add(K.wrap); sets['kit|' + s.setOpts.kit] = K.wrap; } s._set = K.wrap; s._interior = !!(K.place?.interior || s.setOpts?.interior); s._kit = K; }
  else   if (s.set === 'map') { const f = s.setOpts?.file || 'brookhaven'; const k = 'map|' + f; if (!sets[k]) { const g = MAPS[f]; g.visible = false; scene.add(g); sets[k] = g; } s._set = sets[k]; s._interior = false; }
  else if (!sets[setKey]) { const night = s.time === 'night' || s.time === 'spooky'; const g = buildSet(s.set, { ...(s.setOpts || {}), night }, s.seed || 7); if (s.treat && s.treat !== 'none') applyTreat(g, s.treat); if (!INTERIOR.has(s.set) && s.set !== 'studio') { const cl = clouds((s.seed || 7) + 3, night); g.add(cl); g.userData.clouds = cl; } g.visible = false; scene.add(g); sets[setKey] = g; }
  if (s.set !== 'map' && s.set !== 'kit') { s._set = sets[setKey]; s._interior = INTERIOR.has(s.set); }
  envify(s._set);
  // props
  s._props = (s.props || []).map(p => {
    const rw = p.hand && chars[p.hand] && !chars[p.hand].creature ? wearInfo(p.type) : null; // Roblox accessory: sits where its attachment says
    if (rw) { const ch = chars[p.hand], o = makeWear(p.type), sp = partSpace(ch, rw.part, rw.slot, rw.att); o.visible = false; sp.add(o); envify(o); if (rw.part === 'head') cover(p.type, o, sp, true); return { p, o, worn: true, wearer: ch, head: rw.part === 'head', fit: 1, t0: resolveAt(p.from, s), t1: p.until != null ? resolveAt(p.until, s) : 1e9 }; }
    const wearer = p.hand && p.wear !== false && wearOf(p.type) && chars[p.hand] && !chars[p.hand].creature ? chars[p.hand] : null;
    if (wearer) { const o = makeWornProp(p.type); o.visible = false; const hsp = partSpace(wearer, 'head'); hsp.add(o); envify(o); const fit = cover(p.type, o, hsp, false).fit; o.position.multiplyScalar(fit); return { p, o, worn: true, wearer, head: true, fit, t0: resolveAt(p.from, s), t1: p.until != null ? resolveAt(p.until, s) : 1e9 }; } // hats, helmets, crowns: on the head, not in the hand
    const held = !!p.hand, G = held ? (GRIP[p.type] || {}) : null;
    const o = (isModelProp(p.type) ? makeModelProp : makeProp)(p.type, held ? { ...p, scale: undefined } : p); o.visible = false; scene.add(o); envify(o);
    { const tr = p.treat ?? (p.type === 'scatter' ? s.treat : null); if (tr && tr !== 'none') applyTreat(o, tr); }
    const P = { p, o, t0: resolveAt(p.from, s), t1: p.until != null ? resolveAt(p.until, s) : 1e9 };
    if (p.openAt != null) o.userData.openT = resolveAt(p.openAt, s) - P.t0; if (p.closeAt != null) o.userData.closeT = resolveAt(p.closeAt, s) - P.t0; if (o.userData.portal && p.portal?.set) P.portal = portalFor(p.portal);
    if (held) { const b = new THREE.Box3().setFromObject(o); P.G = G; P.bc = b.getCenter(V()); P.bh = b.getSize(V()).multiplyScalar(.5); P.s0 = p.scale || G.hs || 1; }
    else { if (p.at) o.position.set(p.at[0], p.y || 0, p.at[1]); if (p.rot) o.rotation.y = p.rot * D2R; }
    return P;
  });
  // fx
  s._fx = (s.fx || []).map(f => { if (typeof f === 'string') f = { type: f }; const fx = makeFX(f.type, { ...(f.type === 'hearts' && !f.count ? { count: 14 } : {}), ...f }); fx.obj.visible = false; scene.add(fx.obj); return { f, fx, t0: resolveAt(f.at, s), t1: f.until != null ? resolveAt(f.until, s) : 1e9 }; });
}
function prepScene(s, idx) {
  const prevSet = idx > 0 ? TL.scenes[idx - 1].set : null;
  // actors
  s._actors = (s.actors || []).map(a => {
    const ch = chars[a.id]; if (!ch) { console.warn('unknown actor', a.id); return null; }
    const carry = (prevSet === s.set && lastState[a.id]) || null;
    let pos = a.at ? V(a.at[0], a.y || 0, a.at[1]) : (carry ? carry.pos.clone() : V(0, 0, 0));
    if (a.y != null && !a.at) pos.y = a.y;
    const acts = [{ t: 0, anim: a.anim || 'idle', expr: a.expr || ch.spec.expr || 'happy', face: a.face, to: a.to, y: a.toy, speed: a.speed, dur: a.dur, arc: a.arc }]
      .concat((a.actions || []).map(x => ({ ...x, t: resolveAt(x.at, s) }))).sort((p, q) => p.t - q.t);
    let cur = pos.clone(), expr = acts[0].expr, anim = acts[0].anim;
    for (const ac of acts) {
      ac.p0 = cur.clone(); ac.expr = ac.expr || expr; expr = ac.expr;
      if (ac.to) { const p1 = V(ac.to[0], ac.y ?? cur.y, ac.to[1]); const run = baseAnim(ac.anim) === 'run'; const sp = ac.speed || (run ? 15 : 7); ac.mdur = ac.dur || Math.max(.3, p1.distanceTo(cur) / sp); ac.p1 = p1; ac.anim = ac.anim || 'walk'; cur = p1.clone(); }
      ac.anim = ac.anim || anim; anim = ac.after || (ac.to ? 'idle' : ac.anim);
    }
    const end = acts[acts.length - 1];
    lastState[a.id] = { pos: cur.clone() };
    return { a, ch, acts, faceDeg: a.face, ph: idPhase(a.id) };
  }).filter(Boolean);
}
// per-character phase (0..2pi) from the id: characters never idle / blink in lockstep, whatever the id length
function idPhase(id) { let h = 7; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 9973; return h / 9973 * Math.PI * 2; }

function facingTo(from, to) { return Math.atan2(to.x - from.x, to.z - from.z); }

// ---- MOTION ---- everything is a closed-form function of time (no per-frame state): frames render in any order / in parallel.
const BL = .28, TY = .34, LOCO = { walk: 7, run: 15 }; // pose crossfade s, body turn s, nominal speed each cycle was authored for
const LAG = .07, ANTIC = new Set(['jump', 'cheer', 'shocked', 'bounce', 'dance', 'dab', 'point']), NOLOOK = new Set(['walk', 'run', 'cry', 'facepalm', 'dab', 'phone', 'sitsad', 'tired', 'lie', 'fall', 'bow', 'glide', 'swim', 'sneak', 'think', 'dance', 'laugh', 'scared', 'nod', 'headshake']);
const backOut = (k) => { k = clamp01(k) - 1; return 1 + 2.3 * k * k * k + 1.3 * k * k; }; // ease-out with a small overshoot
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// Eased travel: accelerate, cruise, brake, arriving exactly at mdur. d = distance covered, f = speed 0..1, acc = -1..1 (lean).
function motion(ac, tl) {
  const T = ac.mdur, D = ac.p0.distanceTo(ac.p1), ta = Math.min(.28, T * .3), td = Math.min(.34, T * .35), vp = D / (T - (ta + td) / 2);
  if (tl <= 0) return { d: 0, f: 0, acc: 0, D }; if (tl >= T) return { d: D, f: 0, acc: 0, D };
  if (tl < ta) return { d: vp * tl * tl / (2 * ta), f: tl / ta, acc: Math.sin(Math.PI * tl / ta), D };
  if (tl > T - td) { const r = T - tl; return { d: D - vp * r * r / (2 * td), f: r / td, acc: -Math.sin(Math.PI * r / td), D }; }
  return { d: vp * (tl - ta / 2), f: 1, acc: 0, D };
}
// Pose of one action at scene time lt (also valid past its end, so the next action can crossfade out of it while it keeps moving).
function actPose(ac, lt, ph) {
  const tl = lt - ac.t; if (!ac.p1) return pose(ac.anim, tl, ph);
  const ta = tl - ac.mdur, after = ac.after || 'idle', nom = LOCO[baseAnim(ac.anim)]; let p;
  if (nom) { // stride phase follows the distance covered (feet do not slide); amplitude follows the speed
    const m = motion(ac, tl); p = pose('idle', ta, ph);
    if (m.f > 0) { p = blendPose(p, pose(ac.anim, m.d / nom, ph), smooth(m.f)); const g = baseAnim(ac.anim) === 'run' ? 1 : .5; p.lean += m.acc * .14 * g; p.hd[0] -= m.acc * .12 * g; p.la[0] += m.acc * .22 * g; p.ra[0] += m.acc * .22 * g; } // head and arms drag behind the acceleration
    if (ta > 0 && ta < 1) { const g = baseAnim(ac.anim) === 'run' ? 1 : .45, w = Math.exp(-ta * 6.5) * Math.sin(ta * 12) * g; p.lean -= w * .13; p.hd[0] += w * .16; p.la[0] -= w * .3; p.ra[0] -= w * .3; } // follow-through: the stop rocks back and settles
  } else p = pose(ac.anim, tl, ph);
  if (ta > 0 && !(nom && after === 'idle')) { const q = pose(after, ta, ph); p = ta < BL ? blendPose(p, q, backOut(ta / BL)) : q; }
  return p;
}
function yawFor(A, i, settled, pos, s) { // where action i wants the body to face (while travelling / once settled)
  const acts = A.acts, ac = acts[i]; if (ac.p1 && !settled) return facingTo(ac.p0, ac.p1);
  const face = ac.face ?? A.faceDeg;
  if (typeof face === 'string' && chars[face]) { const o = s._actors.find(x => x.a.id === face); return o ? facingTo(pos, o._pos || o.acts[0].p0) : 0; }
  if (face === 'camera') return Math.atan2(camera.position.x - pos.x, camera.position.z - pos.z);
  if (typeof face === 'number') return face * D2R;
  for (let j = i; j >= 0; j--) { if (typeof acts[j].face === 'number') return acts[j].face * D2R; if (acts[j].p1) return facingTo(acts[j].p0, acts[j].p1); } // inherit
  return 0;
}
function actorAt(A, lt, s) {
  const acts = A.acts, ph = A.ph; let i = 0; while (i + 1 < acts.length && acts[i + 1].t <= lt) i++;
  const ac = acts[i], tl = lt - ac.t; let pos = ac.p0.clone(), moving = false, air = 0, lm = null;
  if (ac.p1) { const k = clamp01(tl / ac.mdur); moving = k < 1;
    if (LOCO[baseAnim(ac.anim)] && !ac.arc) { const m = lm = motion(ac, tl); pos.lerpVectors(ac.p0, ac.p1, m.D > 1e-4 ? m.d / m.D : 1); }
    else { pos.lerpVectors(ac.p0, ac.p1, k); if (baseAnim(ac.anim) === 'jump' || ac.arc) { pos.y += Math.sin(k * Math.PI) * (ac.arc || 3); air = Math.sin(k * Math.PI * 2) ** 2; } } }
  const settled = !ac.p1 || !moving, anim = ac.p1 && settled ? (ac.after || 'idle') : ac.anim;
  // facing: the body turns over TY seconds instead of snapping, and the head gets there first
  const ts = ac.p1 && settled ? ac.t + ac.mdur : ac.t; let yaw = yawFor(A, i, settled, pos, s), headTurn = 0;
  const prev = ac.p1 && settled ? [i, false, pos] : i > 0 ? [i - 1, true, acts[i - 1].p1 || acts[i - 1].p0] : null;
  if (prev && lt - ts < TY) { const y0 = yawFor(A, prev[0], prev[1], prev[2], s), D = wrapA(yaw - y0), k = (lt - ts) / TY;
    if (Math.abs(D) > .02) { const eb = smooth(k), eh = 1 - (1 - clamp01(k * 2.2)) ** 3; yaw = y0 + D * eb; headTurn = Math.max(-.8, Math.min(.8, D * (eh - eb))); } }
  // pose: crossfade out of the previous action (still running), settling with a slight overshoot
  let p = actPose(ac, lt, ph);
  if (i > 0 && tl < BL + LAG) { const q = actPose(acts[i - 1], lt, ph); p = blendPoseLag(q, p, (key) => backOut((tl + (key === 'hd' ? -LAG : key === 'la' || key === 'ra' ? -LAG * .35 : LAG * .4)) / BL)); // overlap: body first, arms, head last
    if (ANTIC.has(baseAnim(ac.anim)) && tl < .14) p.sq *= 1 - .08 * Math.sin(Math.PI * tl / .14); } // anticipation: a quick crouch before the big move
  if (ac.p1 && settled && (ac.arc || baseAnim(ac.anim) === 'jump')) { const ta = tl - ac.mdur; p.sq *= 1 - .15 * Math.exp(-ta * 8) * Math.sin(ta * 16); } // landing squash, then settle
  p.hd[1] += headTurn; p.ts[1] += headTurn * .25; p.sq *= 1 + .1 * air; // stretch on the way up and down of a leap
  return { pos, yaw, p, expr: ac.expr, anim, tl: ac.p1 && settled ? tl - ac.mdur : tl, d: lm ? lm.d : ac.p1 ? ac.p0.distanceTo(pos) : 0, f: lm ? lm.f : moving ? 1 : 0, xt: i > 0 && acts[i - 1].expr !== ac.expr ? tl : 9 }; // xt = seconds since the expression changed
}

const LK = { resolveAt: (v, s) => resolveAt(v, s) };
function headPos(id, s, lt) { const A = s._actors.find(x => x.a.id === id); if (!A) return V(0, 4.87, 0); const st = A._st || actorAt(A, lt, s); if (st.head) return st.head.clone(); const sc = A.ch.spec.scale || 1; return st.pos.clone().add(V(0, (headY(A.ch) + (st.p.y || 0)) * sc, 0)); }

// ---- CAMERA ----
const SHOT = { extreme: [4.2, 4.45, .1], close: [7.4, 4.0, .3], medium: [11, 3.5, .6], full: [15, 3.2, 1.5], wide: [24, 3, 4], establishing: [48, 6, 14] };
const DOF = { extreme: 2, close: 1.6, medium: .7 }; // background blur per shot (0 = everything sharp); scene camera.dof overrides
const LENS = { extreme: 34, close: 38, medium: 44, full: 48, wide: 54, establishing: 58 };
// ---- SHOTS: several camera set-ups inside one scene. The scene's own shot/camera is the first (from 0); s.shots = [{at, shot, camera, punch}]
// cut to the next ones at a word / second / percent of the line. Actors, props and fx keep running across the cuts.
function shotsOf(s) {
  if (!s._shots) { const l = [{ t: 0, shot: s.shot, camera: s.camera || {}, punch: s.punch }, ...(s.shots || []).map(x => ({ t: resolveAt(x.at, s), shot: x.shot || s.shot, camera: x.camera || {}, punch: x.punch })).filter(x => x.t > .05 && x.t < s.dur - .05)].sort((a, b) => a.t - b.t);
    l.forEach((v, i) => { v.i = i; v.dur = (l[i + 1]?.t ?? s.dur) - v.t; v._yaw = {}; }); s._shots = l; }
  return s._shots;
}
function viewOf(s, lt) { const l = shotsOf(s); let v = l[0]; for (const x of l) if (x.t <= lt + 1e-6) v = x; return v; }
export function shotTimes() { return TL.scenes.map(s => shotsOf(s).map(v => [+(s.start + v.t).toFixed(3), +v.dur.toFixed(3)])); }
const easeOut = (x) => 1 - (1 - x) ** 3;
function cameraAt(s, lt, v = viewOf(s, lt)) {
  const c = v.camera; const shot = SHOT[v.shot || 'medium'] || SHOT.medium; const vl = lt - v.t, k = clamp01(vl / v.dur);
  let target = c.target || (s._actors[0] && s._actors[0].a.id);
  let look, base, yawBase = 0;
  const group = target === 'group' || target === 'both';
  if (Array.isArray(target)) look = V(target[0], target[1], target[2]);
  else if (group) { const ps = s._actors.map(A => A._st.pos); look = ps.reduce((a, b) => a.add(b.clone()), V()).multiplyScalar(1 / Math.max(1, ps.length)); look.y = shot[1] * (s._actors[0]?.ch.spec.scale || 1); const spread = Math.max(...ps.map(p => p.distanceTo(look))); base = Math.max(shot[0], spread * 2.4 + 6); }
  else { const A = s._actors.find(x => x.a.id === target); look = headPos(target, s, lt); look.y += (shot[1] - (A ? headY(A.ch) : 4.87)) * (A?.ch.spec.scale || 1) - (A?._st?.p.y || 0) * .6; /* the shot offset scales with the character: a 0.68 kid is framed at his own head */ if (A) { yawBase = v.i ? (v._yaw[target] ?? (v._yaw[target] = actorAt(A, v.t, s).yaw)) : A._yaw0 ?? (A._yaw0 = A._st.yaw); } const sc = A ? (A.ch.spec.scale || 1) : 1; }
  let dist = (base || shot[0]) * (c.zoom || 1) * ((s._actors.find(x => x.a.id === target)?.ch.spec.scale) || 1);
  // lens per shot: long for close-ups (flatter face, compressed background), wide for wides. The camera moves back / forward
  // so the subject keeps the size the shot table was tuned for at 50 deg.
  const fov0 = c.lens || c.fov || (c.pov ? 72 : TL.style?.lens === false || v.shot === 'top' || v.shot === 'ots' ? 50 : LENS[v.shot || 'medium'] || 50), lensK = Math.tan(25 * D2R) / Math.tan(fov0 / 2 * D2R);
  if (!c.fov) dist *= lensK; let fov = fov0;
  let ang = (c.angle ?? 18) * D2R + (c.absolute ? 0 : yawBase); let elev = (c.height ?? shot[2]);
  if (v.shot === 'top') { elev = 30; dist = 6; }
  if (v.shot === 'low') { elev = -2.6; }
  if (v.shot === 'high') { elev = dist * .9; }
  const mv = c.move || 'push'; const e = TL.style?.camEase === 'smooth' ? smooth(k) : k + (smooth(k) - k) * .35; // mostly linear: the move is already running at the cut and still running at the next one (style.camEase 'smooth' = old start/stop in every scene)
  if (mv === 'push') dist *= 1.18 - .3 * e; else if (mv === 'pull') dist *= .85 + .35 * e; else if (mv === 'orbit') ang += (c.amount ?? 40) * D2R * (e - .5); else if (mv === 'pan') look.x += (c.amount ?? 4) * (e - .5); else if (mv === 'rise') elev += 6 * e; else if (mv === 'drift') { ang += .12 * (e - .5); dist *= 1.04 - .08 * e; }
  else if (mv === 'fly') { const f = 1 - easeOut(clamp01(vl / Math.min(v.dur, c.flyTime || 1.4))); dist *= 1 + (c.amount ?? 2.6) * f; elev += dist * .4 * f; ang += .8 * f; } // FPV swoop: starts far, high and to the side, lands on the framing
  else if (mv === 'track') { const A = s._actors.find(x => x.a.id === target); if (A) ang = A._st.yaw + Math.PI + (c.angle || 0) * D2R; dist *= 1.05 - .1 * e; } // follows behind whoever it targets, turning with them
  if (c.crash) dist *= 1 + 1.7 * c.crash * (1 - easeOut(clamp01(vl / .3))); // crash zoom into the shot
  if (c.punch !== false && v.punch) { const pk = clamp01(vl / .18); dist *= 1 + .35 * (1 - smooth(pk)); }
  let pos;
  if (v.shot === 'ots' && c.over) { const A = headPos(c.over, s, lt), B = headPos(target, s, lt); const d = B.clone().sub(A).setY(0).normalize(); const right = V(d.z, 0, -d.x); pos = A.clone().add(d.multiplyScalar(-4)).add(right.multiplyScalar(1.7)).add(V(0, .5, 0)); look = B.clone().add(V(0, -.2, 0)); }
  else if (c.pov) { // through someone's eyes: at their face, looking at the target (or straight ahead, `tilt` deg down for hands / a held prop)
    const A = s._actors.find(x => x.a.id === c.pov), yw = A ? A._st.yaw : 0, f = V(Math.sin(yw), 0, Math.cos(yw)); pos = headPos(c.pov, s, lt).add(f.clone().multiplyScalar(.75));
    if (target === c.pov || !target) look = pos.clone().add(f.multiplyScalar(10)).add(V(0, -Math.tan((c.tilt || 0) * D2R) * 10, 0)); }
  else if (c.path) { const cv = c._cv || (c._cv = new THREE.CatmullRomCurve3(c.path.map(p => V(p[0], p[1], p[2])), false, 'centripetal')); pos = cv.getPoint(c.ease === 'linear' ? k : smooth(k)); if (c.lookPath) { const lc = c._lc || (c._lc = new THREE.CatmullRomCurve3(c.lookPath.map(p => V(p[0], p[1], p[2])))); look = lc.getPoint(smooth(k)); } }
  else {
    pos = V(look.x + Math.sin(ang) * dist, look.y + elev, look.z + Math.cos(ang) * dist);
    if (blockedByActor(pos, look, target, s)) {
      const off = ang - yawBase; const sg = Math.sign(off) || 1;
      for (const o of [-off, sg * 1, -sg * 1, sg * 1.35, -sg * 1.35, sg * 1.7, -sg * 1.7]) { const a2 = yawBase + o; const p2 = V(look.x + Math.sin(a2) * dist, look.y + elev, look.z + Math.cos(a2) * dist); if (!blockedByActor(p2, look, target, s)) { pos = p2; break; } }
    }
    if (c.occlude !== false) {
      const clear = (p) => { const d = p.clone().sub(look); const L = d.length(); occRay(s); ray.set(look, d.normalize()); ray.far = L; const h = ray.intersectObjects(occluders.get(s._set), false).find(h => h.distance > 1.2); return !h || h.distance > L * .85; };
      if (!clear(pos) && (s.set === 'kit' || s.set === 'map')) {
        const base = ang; for (const o of [.5, -.5, 1, -1, 1.5, -1.5, 2.2, -2.2, 3.14]) { const a2 = base + o; const p2 = V(look.x + Math.sin(a2) * dist, look.y + elev, look.z + Math.cos(a2) * dist); if (clear(p2)) { pos = p2; break; } }
      }
      pos = unoccluded(pos, look, s);
    }
    camInfo = { target, want: dist, got: pos.distanceTo(look) };
    // a wall pushed the camera in: open the lens so the framing stays what the shot asked for (up to a point)
    if (!c.fov && camInfo.got < dist * .98) fov = Math.min(Math.max(64, fov0), 2 * Math.atan(Math.tan(fov0 / 2 * D2R) * dist / camInfo.got) / D2R);
    camInfo.fit = camInfo.got / dist * Math.tan(fov / 2 * D2R) / Math.tan(fov0 / 2 * D2R);
  }
  if (v.shot === 'top') pos = V(look.x + .01, look.y + 26, look.z + 4);
  const sh = (c.shake || 0) + (s._shakeT != null && lt - s._shakeT < .4 ? (1 - (lt - s._shakeT) / .4) * .8 : 0);
  const nz = (x, k) => Math.sin(x * 1.0 + k) * .5 + Math.sin(x * 2.37 + k * 1.7) * .3 + Math.sin(x * 5.13 + k * 2.9) * .2; // smooth pseudo-noise, -1..1
  if (sh) { const t = lt * 34; pos.x += nz(t, 0) * .16 * sh; pos.y += nz(t, 4) * .13 * sh; look.x += nz(t, 9) * .1 * sh; look.y += nz(t, 13) * .06 * sh; } // irregular, not a sine wobble
  if (mv !== 'static' && TL.style?.handheld !== false) { const d = pos.distanceTo(look) * .0035 * (TL.style?.handheld ?? 1), t = lt * .9 + s.start; look.x += nz(t, 1) * d; look.y += nz(t * 1.2, 6) * d * .7; pos.y += nz(t * .8, 11) * d * .5; } // operator breathing: the frame is never perfectly still
  { const wi = (c.whip || 0) * 1.45 * (1 - easeOut(clamp01(vl / .24))) - (c.whipOut || 0) * 1.45 * clamp01((vl - v.dur + .16) / .16) ** 2; // whip pan in / out of the shot: the motion blur does the rest
    if (wi) look = pos.clone().add(look.clone().sub(pos).applyAxisAngle(V(0, 1, 0), wi)); }
  camera.position.copy(pos); camera.fov = fov; camera.updateProjectionMatrix(); camera.lookAt(look); camLook = look;
  if (c.roll) camera.rotateZ(c.roll * D2R);
}

function blockedByActor(pos, look, target, s) {
  const dir = look.clone().sub(pos); const L = dir.length(); dir.normalize();
  return s._actors.some(A => { if (A.a.id === target || !A._st) return false; const c = A._st.pos.clone().add(V(0, 3, 0)); const k = c.clone().sub(pos).dot(dir); if (k < .5 || k > L - .8) return false; const closest = pos.clone().add(dir.clone().multiplyScalar(k)); return Math.hypot(closest.x - c.x, closest.z - c.z) < 1.4 && Math.abs(closest.y - c.y) < 2.8; });
}
const ray = new THREE.Raycaster(); let occluders = new Map();
// A kit / map is a whole town merged into a few huge meshes, and every camera ray used to walk all of its triangles (the
// render's real cost: ~50 ms a frame). The action stays near the origin, so keep one world-space copy of just the triangles
// within R of it, per placement, and cast against that. Front-facing and double-sided sources stay separate (same hits as before).
const proxyCache = new Map();
function nearProxy(list, key, R = 85) {
  if (proxyCache.has(key)) return proxyCache.get(key);
  const out = [[], []], a = V(), b = V(), c = V(), m = new THREE.Matrix4();
  for (const o of list) { const pa = o.geometry.attributes.position, ix = o.geometry.index; if (!pa) continue; const arr = out[[].concat(o.material)[0]?.side === THREE.FrontSide ? 0 : 1], cnt = ix ? ix.count : pa.count;
    for (let k = 0, n = o.isInstancedMesh ? o.count : 1; k < n; k++) { if (o.isInstancedMesh) { o.getMatrixAt(k, m); m.premultiply(o.matrixWorld); } else m.copy(o.matrixWorld);
      for (let i = 0; i + 2 < cnt; i += 3) { a.fromBufferAttribute(pa, ix ? ix.getX(i) : i).applyMatrix4(m); b.fromBufferAttribute(pa, ix ? ix.getX(i + 1) : i + 1).applyMatrix4(m); c.fromBufferAttribute(pa, ix ? ix.getX(i + 2) : i + 2).applyMatrix4(m);
        if (Math.min(a.x, b.x, c.x) > R || Math.max(a.x, b.x, c.x) < -R || Math.min(a.z, b.z, c.z) > R || Math.max(a.z, b.z, c.z) < -R || Math.min(a.y, b.y, c.y) > R) continue;
        arr.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); } } }
  const res = out.map((arr, k) => { if (!arr.length) return null; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeBoundingSphere(); return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: k ? THREE.DoubleSide : THREE.FrontSide })); }).filter(Boolean);
  proxyCache.set(key, res); return res;
}
function occRay(s) { if (!occluders.has(s._set)) unoccluded(V(0, 0, 1), V(), s); }
function unoccluded(pos, look, s) {
  if (!occluders.has(s._set)) { const list = []; s._set.traverse(o => { let q = o, skip = false; while (q) { if (q.userData.noOcclude) skip = true; q = q.parent; } if (o.isMesh && !skip && o.geometry.type !== 'SphereGeometry' && !(o.material && o.material.transparent)) list.push(o); }); occluders.set(s._set, s.set === 'kit' || s.set === 'map' ? nearProxy(list, s.set + JSON.stringify(s.setOpts || {})) : list); }
  const dir = pos.clone().sub(look); const L = dir.length(); dir.normalize(); ray.set(look, dir); ray.far = L;
  const hit = ray.intersectObjects(occluders.get(s._set), false).find(h => h.distance > 1.2);
  if (hit && hit.distance < 4 && !s._interior) return pos; // small occluder right next to the subject: keep the shot
  return hit ? look.clone().add(dir.multiplyScalar(Math.max(1.5, hit.distance - .6))) : pos;
}

// ---- HELD PROPS ----
// A held prop never inherits the arm's rotation (that flipped trophies upside down when the arm was raised) and never
// starts at the hand pivot (that buried it in the forearm). Instead: the prop stays world-upright, turned with the actor,
// and its bounding box is pushed fully past the plane at the tip of the arm, so it cannot intersect the arm that holds it.
// An arm that hangs or swings is blended to a carry pose (forearm forward); raised/pointing arms keep their animation.
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), UP = V(0, 1, 0);
function holdProp(P, A, lt, pop) {
  const G = P.G, ch = A.ch, sc = ch.spec.scale || 1, two = !!G.two, left = !!P.p.left;
  let tip, dir;
  ({ tip, dir } = carryHands15(ch, two, left, G.inward)); // real elbows / grip attachments (engine/r15_attach.js)
  const k = P.s0 * sc * pop; P.o.scale.setScalar(k);
  _e.set((G.tilt || 0), A._st.yaw + ((G.yaw || 0) + (P.p.rot || 0)) * D2R + (P.p.spin ? lt * P.p.spin : 0), 0, 'YXZ'); _q.setFromEuler(_e); _qi.copy(_q).invert();
  const h = P.bh.clone().multiplyScalar(k), dl = dir.clone().applyQuaternion(_qi);
  const reach = Math.abs(dl.x) * h.x + Math.abs(dl.y) * h.y + Math.abs(dl.z) * h.z; // box support distance along the arm
  const c = tip.clone().addScaledVector(dir, reach - Math.min(.1 * sc, reach * .3));
  // grip height: slide the prop up so the hand closes on its handle/lower part (only sideways to the arm: still clear of it)
  const lift = UP.clone().addScaledVector(dir, -dir.y); c.addScaledVector(lift, (1 - 2 * (G.grip ?? .5)) * h.y);
  P.o.quaternion.copy(_q); P.o.position.copy(c).sub(P.bc.clone().multiplyScalar(k).applyQuaternion(_q));
}

// ---- LIVING SET ---- (all closed-form in t, like the rest: no per-frame state)
// Clouds drift, trees rock, pollen / fireflies float near the camera, and optional background walkers ("extras") stroll
// around kit locations. Extras: style.extras = N (or scene.extras), outdoor kit scenes only, always behind the action.
const extras = [], extraPlans = new Map(), swayOf = new Map(); let motes = null;
// Background people are R15 characters with materials shared by colour (cheap).
const NPCM = new Map();
function shareMats(ch) { for (const [n, m] of Object.entries(ch.parts)) { const mm = m.material; if (!mm || mm.map || Array.isArray(mm)) continue; const key = [mm.type, mm.color.getHexString(), mm.roughness, mm.clearcoat].join('|'); const o = NPCM.get(key); if (o) { m.material = o; mm.dispose(); if (ch.mats[n]) ch.mats[n] = o; } else NPCM.set(key, mm); } }
function buildExtras(n) {
  let sd = 4242; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647), pick = (a) => a[Math.floor(r() * a.length)];
  for (let i = 0; i < n; i++) { const ch = buildCharacter({ skin: pick(['#f5c79a', '#eab892', '#c98d5e', '#8d5a3b', '#ffd9b3']), shirt: pick(['#e85d5d', '#4f8fe8', '#3ecf8e', '#f2b134', '#9b6bdf', '#f28cb1', '#f4f4f4', '#3b4a6b']), pants: pick(['#22304f', '#3a3a44', '#5b4636', '#2f5d8a', '#6b7280']),
    hair: (() => { const st = hairStyles().filter(n => !NPC_SKIP.has(n)); return st.length ? 'rbx:' + pick(st) : pick(['short', 'messy', 'swept', 'long', 'bob', 'ponytail', 'bun', 'spiky']); })(), hairColor: pick(['#3b2416', '#1a1a1a', '#7a4a21', '#d9b36b', '#a8432a', '#5a3a22', '#c98a4b', '#2b1d14']), sleeves: pick(['long', 'short']), details: pick([['crewneck'], ['hood', 'kangaroo'], ['collar', 'buttons'], ['stripes']]), scale: .9 + r() * .14 });
    shareMats(ch); ch.root.visible = false; scene.add(ch.root); extras.push(ch); }
}
const NPC_SKIP = new Set(['colorbraids', 'updo']); // too distinctive for background people
const CROWD_MAX = 24, crowdN = (s) => Math.min(CROWD_MAX, s.crowd?.n || 0);
const extrasWanted = (s) => s.set === 'kit' && !s._interior ? Math.max(0, Math.min(8, s.extras ?? TL.style?.extras ?? 0)) : 0;
function planExtras(s) { // clear standing spots (and, where there is room, a straight clear stretch to walk) from the kit's own collision data
  const n = extrasWanted(s), key = s.setOpts.kit + JSON.stringify(s.setOpts) + n; if (extraPlans.has(key)) return extraPlans.get(key);
  const out = [], K = s._kit, P = K.place; let sd = 99; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  try { const free = (x, z) => x > P.bounds.min.x + 1 && x < P.bounds.max.x - 1 && z > P.bounds.min.z + 1 && z < P.bounds.max.z - 1 && !P.blocked(x, z, .6);
    for (let i = 0; i < n; i++) for (let k = 0; k < 60; k++) {
      const a = r() * 6.283, d = 16 + r() * 30, w = V(Math.sin(a) * d, 0, Math.cos(a) * d); if (w.z > 2) continue; // never between the camera side and the actors
      const p = K.inner.worldToLocal(w.clone()); if (!free(p.x, p.z) || out.some(e => Math.hypot(e.p.x - p.x, e.p.z - p.z) < 2)) continue;
      let q = null; for (let j = 0; j < 10 && !q; j++) { const b = r() * 6.283, L = 3 + r() * 6, c = V(p.x + Math.sin(b) * L, 0, p.z + Math.cos(b) * L), cw = K.inner.localToWorld(c.clone()); let ok = cw.z < 1 && Math.hypot(cw.x, cw.z) > 14; for (let m = 0; ok && m <= 12; m++) ok = free(p.x + (c.x - p.x) * m / 12, p.z + (c.z - p.z) * m / 12); if (ok) q = c; }
      const at = (v) => K.inner.localToWorld(V(v.x, P.groundAt(v.x, v.z) || 0, v.z)); out.push({ p, q, wp: at(p), wq: q && at(q), off: r() * 20, yaw: r() * 6.283 }); break; } } catch (e) { console.warn('extras', e.message); }
  extraPlans.set(key, out); return out;
}
function updateExtras(s, t) {
  const plan = extrasWanted(s) ? planExtras(s) : [];
  extras.forEach((ch, i) => { const e = plan[i]; ch.root.visible = !!e; if (!e) return; let pos, yaw = e.yaw, p = pose('idle', t + e.off, i);
    if (e.q) { const L = Math.hypot(e.q.x - e.p.x, e.q.z - e.p.z), T1 = L / 1.7, pause = 1.6, u = (t + e.off) % (2 * (T1 + pause)), back = u >= T1 + pause, v = back ? u - T1 - pause : u;
      const k = clamp01(v / T1), wa = back ? e.wq : e.wp, wb = back ? e.wp : e.wq, dir = facingTo(wa, wb); pos = wa.clone().lerp(wb, k);
      if (k < 1) { yaw = dir; p = blendPose(p, pose('walk', k * wa.distanceTo(wb) / 7, i), smooth(clamp01(Math.min(v, T1 - v) / .3))); }
      else yaw = dir + Math.PI * smooth(clamp01((v - T1 - .5) / .6)); } // stands a moment, then turns round
    else pos = e.wp;
    ch.root.position.copy(pos); ch.root.rotation.y = yaw; applyPose(ch, p); setFace(ch, 'happy', 0, ((t + i * .53) % 3.7) < .12); });
  // crowd: the scene's `crowd` behaviour, on the pool members the ambient walkers left free
  const c = s.crowd, n = crowdN(s); if (!n) return; const K = s.set === 'kit' ? s._kit : null, P = K?.place;
  const on = typeof c.on === 'string' ? s._actors.find(x => x.a.id === c.on) : null, cen = (live) => Array.isArray(c.on) ? V(c.on[0], 0, c.on[1]) : on ? (live ? on._st.pos : on.acts[0].p0).clone().setY(0) : s._actors.length ? s._actors.reduce((a, A) => a.add(A.acts[0].p0), V()).multiplyScalar(1 / s._actors.length).setY(0) : V();
  if (!s._crowd) { let h = 7; for (const ch of s.set + JSON.stringify(s.setOpts || {}) + (c.seed || '')) h = (h * 31 + ch.charCodeAt(0)) % 2147483000;
    const local = (x, z) => K.inner.worldToLocal(V(x, 0, z)), free = P ? (x, z) => { try { const q = local(x, z); return !P.blocked(q.x, q.z, .6); } catch (e) { return true; } } : (x, z) => !s._actors.some(A => Math.hypot(A.acts[0].p0.x - x, A.acts[0].p0.z - z) < 2.2);
    s._crowd = planCrowd({ ...c, n }, cen(false), h, free); s._crowdT = c.at != null ? resolveAt(c.at, s) : 0; }
  const lt = t - s.start, C = cen(true);
  s._crowd.forEach((e, j) => { const ch = extras[plan.length + j]; if (!ch) return; const st = crowdAt(e, c, C, lt, t, s._crowdT); ch.root.visible = !st.gone; if (st.gone) return;
    if (P) { try { const q = local2(K, st.pos); st.pos.y = K.inner.localToWorld(V(q.x, P.groundAt(q.x, q.z) || 0, q.z)).y; } catch (e) { } }
    ch.root.position.copy(st.pos); ch.root.rotation.y = st.yaw; applyPose(ch, st.p); setFace(ch, st.expr, 0, ((t + j * .41 + e.off) % 3.3) < .11); });
}
const local2 = (K, w) => K.inner.worldToLocal(w.clone());
function updateLiving(s, t, focus) {
  const cl = s._set.userData.clouds; if (cl) cl.rotation.y = t * .006;
  if (!swayOf.has(s._set)) { const l = []; if (s.set !== 'kit' && s.set !== 'map') s._set.traverse(o => { if (o.userData.sway) l.push(o); }); swayOf.set(s._set, l); }
  const wind = /windy|storm|blizzard|sandstorm/.test(s.weather || '') ? 4 : 1; for (const o of swayOf.get(s._set)) { const ph = o.userData.sway; o.rotation.z = Math.sin(t * 1.3 + ph) * .016 * wind; o.rotation.x = Math.sin(t * .9 + ph * 1.7) * .011 * wind; }
  const dark = s.time === 'night' || s.time === 'spooky', on = TL.style?.motes !== false && !s._wxInt && !weatherOf(s);
  if (!motes) { const n = 70, cv = document.createElement('canvas'); cv.width = cv.height = 32; const g = cv.getContext('2d'), q = g.createRadialGradient(16, 16, 0, 16, 16, 16); q.addColorStop(0, '#fff'); q.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = q; g.fillRect(0, 0, 32, 32);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); let sd = 77; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    motes = new THREE.Points(geo, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(cv), size: .28, transparent: true, depthWrite: false, fog: false })); motes.frustumCulled = false; motes.userData.R = Array.from({ length: n }, () => [r(), r(), r(), r()]); scene.add(motes); }
  motes.visible = on; if (!on) return; const m = motes.material; m.color.set(dark ? '#eaff8a' : '#ffffff'); m.opacity = dark ? .9 : .4; m.size = dark ? .34 : .26; m.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
  const pa = motes.geometry.attributes.position, W0 = 44, wrap = (v, c) => ((v - c) % W0 + W0) % W0 - W0 / 2 + c; // world-anchored field that tiles around the camera focus
  motes.userData.R.forEach(([a, b, c, d], i) => pa.setXYZ(i, wrap(a * W0 + t * (.5 + d * .5) + Math.sin(t * .7 + i) * .6, focus.x), 1 + ((b * 13 + t * .12 * (d - .3) + Math.sin(t * .5 + i * 2) * .5) % 13 + 13) % 13, wrap(c * W0 + Math.sin(t * .4 + i * 1.7) * .8, focus.z))); pa.needsUpdate = true;
}

let curScene = null, camInfo = {};
const SUN_OFF = new THREE.Vector3(30, 60, 25), LZ = SUN_OFF.clone().normalize(), LX = new THREE.Vector3(0, 1, 0).cross(LZ).normalize(), LY = LZ.clone().cross(LX); // light-space axes (the sun direction never changes)
// Text-only staging checks (no image needed): framing, occlusion, camera forced too close, actors overlapping.
export function lint(t) {
  frame(t); const s = TL.scenes.find(x => t >= x.start && t < x.start + x.dur) || TL.scenes[TL.scenes.length - 1]; const out = [];
  const occ = occluders.get(s._set) || []; const r = new THREE.Raycaster();
  for (const A of s._actors) {
    const sc = A.ch.spec.scale || 1; const head = A._st.pos.clone().add(V(0, (headY(A.ch) + (A._st.p.y || 0)) * sc, 0)); const feet = A._st.pos.clone().add(V(0, .3, 0));
    const h = head.clone().project(camera), f = feet.clone().project(camera);
    const isT = camInfo.target === A.a.id;
    const mustSee = isT || camInfo.target === 'group' || camInfo.target === 'both';
    if (h.z > 1 || Math.abs(h.x) > 1.05 || h.y > 1.05 || h.y < -1) { if (mustSee && !A.acts.some(x => x.p1)) out.push(`${A.a.id} head off-screen`); }
    else { const d = head.clone().sub(camera.position); const L = d.length(); r.set(camera.position, d.normalize()); r.far = L - .6; const hit = r.intersectObjects(occ, false)[0]; if (hit) out.push(`${A.a.id} head hidden by set`); }
    if (isT && h.y < -.2) out.push(`${A.a.id} (target) head in lower half`);
    for (const B of s._actors) if (B !== A && A.a.id < B.a.id && !(A._st.link?.A === B || A._st.link?.C === B) && A._st.pos.distanceTo(B._st.pos) < 1.6) out.push(`${A.a.id}/${B.a.id} overlapping`);
  }
  if (camInfo.want && (camInfo.fit ?? camInfo.got / camInfo.want) < .55) out.push(`camera pulled in by set (${camInfo.got.toFixed(1)}/${camInfo.want.toFixed(1)})`);
  return out;
}
function render3D(t) {
  const idx = TL.scenes.findIndex(s => t >= s.start && t < s.start + s.dur);
  const s = TL.scenes[idx < 0 ? TL.scenes.length - 1 : idx]; const lt = t - s.start;
  if (curScene !== s) { // switch visibility
    if (!s._ready) prepAssets(s);
    for (const k in sets) sets[k].visible = false; s._set.visible = true; if (s.set === 'map') { placeMap(s._set, s); occluders.delete(s._set); } if (s.set === 'kit') { placeKit(s._kit, s); occluders.delete(s._set); }
    for (const id in chars) chars[id].root.visible = false;
    if (curScene) { curScene._props.forEach(p => p.o.visible = false); curScene._fx.forEach(f => f.fx.obj.visible = false); }
    const isInt = !!s._interior || INTERIOR.has(s.set);
    const sk = SKY[s.time] || SKY.day; scene.background = INTERIOR.has(s.set) ? new THREE.Color(s.time === 'night' ? '#0b0f22' : '#cfe6ff') : skyTexture(s.time || 'day');
    scene.fog = isInt || s.set === 'studio' ? null : new THREE.Fog(sk[2], 90, 420);
    hemi.intensity = sk[3] * (isInt ? 1.25 : 1.1); sun.intensity = sk[4] * (isInt ? .7 : 1); sun.color.set(s.time === 'sunset' ? '#ffb27a' : s.time === 'night' || s.time === 'spooky' ? '#9fb4ff' : '#fff4e0');
    hemi.color.set(s.time === 'night' || s.time === 'spooky' ? '#6a7ab8' : '#dff1ff'); amb.intensity = isInt ? .55 : .25;
    const dark = s.time === 'night' || s.time === 'spooky'; RIM.k.value = (TL.style?.rim ?? 1) * (isInt ? .35 : dark ? .5 : s.time === 'sunset' || s.time === 'dusk' ? .75 : .55); RIM.color.value.set(s.time === 'sunset' ? '#ffc79a' : dark ? '#a9c0ff' : '#e6f0ff');
    const sA = skyName(s), sB = sA && s.skyTo?.sky || null; s._skyT = sB ? resolveAt(s.skyTo.at, s) : 0; // skybox: replaces the gradient and brings the light that goes with it
    if (s._set.userData.clouds) s._set.userData.clouds.visible = !sA; // the picture has its own clouds
    if (setSky(sA, sB)) { scene.background = null; if (!isInt) { const L = skyLight(sA), c = skyCfg(sA); sun.color.copy(L.sunC); sun.intensity = L.sunI; hemi.color.copy(L.hemiC); hemi.intensity = L.hemiI; if (scene.fog) scene.fog = new THREE.Fog(c.fog[0], c.fog[1], c.fog[2]); } }
    const wx = weatherOf(s); s._wxInt = isInt || s.set === 'studio'; // weather: full look outdoors, only light + lightning flashes indoors
    if (wx) { const k = s._wxInt ? .5 : 1, [hm, sm] = wx.light || [1, 1]; hemi.intensity *= 1 + (hm - 1) * k; sun.intensity *= 1 + (sm - 1) * k;
      if (!s._wxInt) { if (wx.sky && !sA) scene.background = weatherSky(s.weather); if (wx.sunColor) sun.color.set(wx.sunColor); if (wx.hemiColor) hemi.color.set(wx.hemiColor); if (wx.fog && scene.fog) scene.fog = new THREE.Fog(...wx.fog); } }
    if (s.medium === 'underwater') { // the whole scene is under water: no sky, blue gradient water column, thick blue fog, cool light
      setSky(null, null); if (s._set.userData.clouds) s._set.userData.clouds.visible = false; scene.background = underwaterBG(); scene.fog = new THREE.Fog('#0f84ae', 3, s.fogFar || 85);
      sun.color.set('#a8ecff'); sun.intensity *= .8; hemi.color.set('#6fd2f2'); hemi.intensity *= .95; }
    baseHemi = hemi.intensity;
    LA = { sunC: sun.color.clone(), sunI: sun.intensity, hemiC: hemi.color.clone(), hemiI: baseHemi, fogC: scene.fog ? scene.fog.color.clone() : null }; LB = sB && !isInt ? skyLight(sB) : null; s._sky = sA; s._skyB = sB;
    s._shakeT = s.shakeAt != null ? resolveAt(s.shakeAt, s) : null;
    s._actors.forEach(A => { A._pos = undefined; }); s._actors.forEach(A => { A._yaw0 = actorAt(A, 0, s).yaw; }); // camera angle is relative to the facing at the cut, whatever frame is rendered first
    curScene = s;
  }
  // actors
  s._actors.forEach(A => { A._st = actorAt(A, lt, s); A._pos = A._st.pos; });
  resolveLinks(s, lt, LK); // actors linked to another's body (link:<id>:<mode>): position / pose derived from the carrier
  // look-at: heads follow the subject of the shot (or the actor's own `look`), within what a neck can do; the body keeps its staging
  const view = viewOf(s, lt), subj = typeof view.camera.target === 'string' ? view.camera.target : view.camera.target ? null : s._actors[0]?.a.id;
  if (TL.style?.lookAt !== false) s._actors.forEach(A => {
    const own = A.a.look, id = own === false || own === 'none' ? null : own || subj; if (!id || id === A.a.id) return; const B = s._actors.find(x => x.a.id === id); if (!B) return;
    const st = A._st; if (!own && NOLOOK.has(baseAnim(st.anim)) || st.link || st.pos.distanceTo(B._st.pos) < .5) return;
    const D = wrapA(facingTo(st.pos, B._st.pos) - st.yaw); if (Math.abs(D) > 2.3) return; // behind the back: do not try
    const h = Math.max(-1, Math.min(1, D * (own ? .85 : .6) / (own ? .7 : .45))) * (own ? .7 : .45), dy = ((B._st.p.y || 0) + B._st.pos.y + headY(B.ch) * (B.ch.spec.scale || 1)) - ((st.p.y || 0) + st.pos.y + headY(A.ch) * (A.ch.spec.scale || 1));
    st.p.hd[1] += h; st.p.ts[1] += h * .22; st.p.hd[0] -= Math.max(-.3, Math.min(.3, Math.atan2(dy, Math.max(1, st.pos.distanceTo(B._st.pos))) * .7)); // also up / down at taller / shorter people
  });
  s._actors.forEach(A => {
    const st = A._st, ch = A.ch; ch.root.visible = true; ch.root.position.copy(st.pos); linkRoot(ch, st);
    if (ch.creature) { ch.update({ anim: baseAnim(st.anim), d: st.d, f: st.f, tl: st.tl }, t, A.ph); return; }
    applyPose(ch, st.p);
    // mouth: talking when this actor is the scene speaker and a word is active
    let mouth = 0; const talking = (s.speaker === A.a.id) || A.a.talk === true;
    if (talking) { const w = (s.words || []).find(w => t >= w.s && t < w.e); if (w || A.a.talk === true) { const ph = Math.sin(t * 24 + A.ph); mouth = ph > .3 ? 1 : ph > -.3 ? .5 : 0; } }
    const bp = 2.9 + (A.ph % 1) * 1.6, bt = (t + A.ph * 3) % bp; // own blink rhythm per character; every 3rd blink is a double; a blink also covers every expression change (hides the face swap)
    const blink = bt < .11 || (Math.floor((t + A.ph * 3) / bp) % 3 === 0 && bt > .26 && bt < .36) || st.xt < .1;
    const wd = mouth > 0 ? (s.words || []).find(w => t >= w.s && t < w.e) : null; // face v2: eye gaze, brows, tears, vowel mouth (engine/face2.js); undefined = plain atlas face
    setFace(ch, st.expr, mouth, blink, faceOptions({ A, s, st, t, lt, subj, cam: camera.position, resolveAt, style: TL.style, mouth, word: wd, expr: st.expr }));
  });
  finishLinks(s, lt, LK); // arm IK of links and `reach` (after applyPose, before held props)
  // props (held in hands or placed)
  // head layers: hair settles under whatever each actor wears right now (layers.js)
  s._actors.forEach(A => { if (A.ch.creature) return; const w = [...new Set([...A.ch.worn, ...s._props.filter(P => P.worn && P.head && P.wearer === A.ch && lt >= P.t0 && lt < P.t1).map(P => P.p.type)])].sort(), key = w.join('+'); if (key && !COVERS[key]) COVERS[key] = mergeCovers(w.map(t => COVERS[t])); layerHair(A.ch, key, key ? COVERS[key] : null); });
  s._props.forEach(P => {
    const on = lt >= P.t0 && lt < P.t1; P.o.visible = on; if (!on) return;
    const pop = P.p.pop ? Math.min(1, smooth(clamp01((lt - P.t0) / .25)) * 1.15) : 1;
    if (P.worn) { P.o.scale.setScalar(pop * P.fit); if (!s._actors.some(x => x.a.id === P.p.hand)) P.o.visible = false; return; }
    if (P.p.hand) { const A = s._actors.find(x => x.a.id === P.p.hand); if (A && !A.ch.creature) holdProp(P, A, lt, pop); else P.o.visible = false; return; }
    if (P.p.under) { const A = s._actors.find(x => x.a.id === P.p.under); if (A) P.o.position.set(A._st.pos.x + (P.p.dx || 0), A._st.pos.y + (P.p.y || 0), A._st.pos.z + (P.p.dz || 0)); } // rides under an actor's feet
    else if (P.p.drift) P.o.position.set((P.p.at?.[0] || 0) + P.p.drift[0] * lt, Math.max(P.p.floor ?? -1e9, (P.p.y || 0) + P.p.drift[1] * lt), (P.p.at?.[1] || 0) + P.p.drift[2] * lt); // floor: it stops there (a box landing)
    if (P.o.userData.tick) P.o.userData.tick(lt - P.t0);
    if (P.p.shrink) P.o.scale.setScalar(Math.max(.05, (P.p.scale || 1) * (1 - P.p.shrink * Math.max(0, lt - P.t0)))); // melts away at shrink x (fraction of its size) per second
    if (P.p.spin) P.o.rotation.y = lt * P.p.spin;
    if (P.p.bob) P.o.position.y = (P.p.y || 0) + Math.sin(lt * 3) * P.p.bob;
    if (P.p.pop) P.o.scale.setScalar((P.p.scale || 1) * pop);
  });
  // fx follow anchor actor
  s._fx.forEach(F => {
    const on = lt >= F.t0 && lt < F.t1; F.fx.obj.visible = on; if (!on) return;
    if (F.f.on) { const A = s._actors.find(x => x.a.id === F.f.on); if (A) { const sc = A.ch.spec.scale || 1; F.fx.obj.position.copy(A._st.pos); if (F.f.type === 'timer' || F.f.type === 'label' || EMOTES.has(F.f.type)) { F.fx.obj.position.y += (A._st.p.y || 0) * sc; F.fx.obj.scale.setScalar(sc); } } } else if (F.f.pos) F.fx.obj.position.set(...F.f.pos);
    F.fx.update(lt - F.t0, camera);
  });
  updateExtras(s, t);
  cameraAt(s, lt, view);
  // sun follows camera focus for crisp shadows
  const fwd = V(); camera.getWorldDirection(fwd); const focus = camera.position.clone().add(fwd.multiplyScalar(14)); focus.y = 0;
  // shadow map covers only what the shot shows (in steps, so it does not shimmer during a push): sharp contact shadows in close-ups
  const hiY = Math.max(0, ...s._actors.map(A => A._st.pos.y)); // airborne actors throw their shadow far from their feet: widen the map so it is not clipped into a hard-edged rectangle
  const sz = Math.min(64, Math.max(16, Math.ceil((camera.position.distanceTo(camLook) * 1.2 + 6 + hiY * .8) / 8) * 8)), sc = sun.shadow.camera;
  if (sc.right !== sz) { sc.left = sc.bottom = -sz; sc.right = sc.top = sz; sc.updateProjectionMatrix(); }
  // snap the light to whole shadow texels: the shadow edges stop crawling while the camera pushes / orbits
  const tx = 2 * sz / sun.shadow.mapSize.x, fx = focus.dot(LX), fy = focus.dot(LY); focus.addScaledVector(LX, Math.round(fx / tx) * tx - fx).addScaledVector(LY, Math.round(fy / tx) * tx - fy);
  sun.position.copy(focus).add(SUN_OFF); sun.target.position.copy(focus);
  updateLiving(s, t, focus);
  if (s._set.userData.ticks) for (const f of s._set.userData.ticks) f(t); // animated parts of a set (water, waterfall, flames): a world pushes functions of time into group.userData.ticks
  const wf = updateWeather(s, lt, t, focus, s._wxInt, idx); hemi.intensity = baseHemi * (1 + wf.flash * 2.2);
  let skyK = 0; if (s._skyB) { skyK = smooth(clamp01((lt - s._skyT) / (s.skyTo.dur || 1.2))); if (LB) { sun.color.copy(LA.sunC).lerp(LB.sunC, skyK); sun.intensity = LA.sunI + (LB.sunI - LA.sunI) * skyK; hemi.color.copy(LA.hemiC).lerp(LB.hemiC, skyK); hemi.intensity = (LA.hemiI + (LB.hemiI - LA.hemiI) * skyK) * (1 + wf.flash * 2.2); if (scene.fog && LA.fogC) scene.fog.color.copy(LA.fogC).lerp(LB.fogC, skyK); } } // the sky changes mid-scene (skyTo): picture, light and fog cross-fade together
  updateSky(camera, skyK);
  { const g0 = GRADES[s.grade ?? TL.style?.grade ?? (AAA() ? 'vivid' : 'none')] || GRADES.none, g1 = s.gradeTo ? GRADES[s.gradeTo.grade] || g0 : null, gk = g1 ? smooth(clamp01((lt - resolveAt(s.gradeTo.at, s)) / (s.gradeTo.dur || 1.2))) : 0, mx = (a, b) => a + (b - a) * gk;
    const g = g1 ? { sat: mx(g0.sat, g1.sat), con: mx(g0.con, g1.con), vig: mx(g0.vig, g1.vig), ca: mx(g0.ca, g1.ca), tint: g0.tint.map((v, i) => mx(v, g1.tint[i])), lift: g0.lift.map((v, i) => mx(v, g1.lift[i])) } : g0;
    let rays = 0, uv = null; if (s._sky && !s._wxInt) { const ca = skyCfg(s._sky), cb = s._skyB ? skyCfg(s._skyB) : ca, p = camera.position.clone().addScaledVector(LZ, 800).project(camera); rays = ((ca.rays || 0) + ((cb.rays || 0) - (ca.rays || 0)) * skyK) * (s.rays ?? TL.style?.rays ?? 1);
      if (p.z > 1 || p.z < -1) rays = 0; else { uv = new THREE.Vector2(p.x * .5 + .5, p.y * .5 + .5); rays *= clamp01(1.9 - Math.hypot(p.x, p.y) * .9); } } // light shafts only while the sun is in or near the frame
    setGrade(grade, g, uv, rays); }
  if (bokeh) { const ap = view.camera.dof ?? DOF[view.shot || 'medium'] ?? 0; bokeh.enabled = ap > 0; bokeh.uniforms.focus.value = camera.position.distanceTo(camLook); bokeh.uniforms.aperture.value = ap * .001 * (TL.style?.dof ?? 1); }
  bloom.strength = (s.set === 'map' || s.set === 'kit') ? (s.bloom ?? .12) : s.bloom ?? (s.time === 'night' || s.time === 'spooky' ? .6 : (TL.style?.bloom ?? .35));
  { const PP = s._props.find(P => P.portal && P.o.visible); if (PP) drawPortal(PP); }
  composer.render();
  return s;
}
// Motion blur: average n renders spread over the shutter (fraction of the frame interval, .5 = 180 deg), all inside the
// current scene so a cut stays a hard cut. Captions/overlays are drawn once on top and stay sharp. n = 1: no blur.
export function frame(t, n = 1, shutter = .5) {
  const s0 = TL.scenes.find(s => t >= s.start && t < s.start + s.dur) || TL.scenes[TL.scenes.length - 1]; const v0 = viewOf(s0, t - s0.start), a = s0.start + v0.t, b = a + v0.dur - 1e-4; // sub-frames stay inside the shot: every cut is a hard cut
  { const vl = t - a, c = v0.camera; if (n > 1 && ((c.whip && vl < .26) || (c.whipOut && vl > v0.dur - .18))) { n *= 3; shutter = 1; } } // whip pans: a full-frame smear needs many more samples than ordinary motion
  for (let j = 0; j < n; j++) { const tj = n > 1 ? Math.max(a, Math.min(b, t + ((j + .5) / n - .5) * shutter / TL.fps)) : t; sun.shadow.needsUpdate = j === 0 || j === n >> 1; render3D(tj); cg.globalAlpha = 1 / (j + 1); cg.drawImage(renderer.domElement, 0, 0); }
  cg.globalAlpha = 1; const s = s0;
  drawWeather2D(cg, W, H);
  drawOverlays(cg, W, H, s, t - s.start, t, TL);
  drawCaptions(cg, W, H, t, TL);
}

export function grab(q = .9) { return comp.toDataURL('image/jpeg', q); }

