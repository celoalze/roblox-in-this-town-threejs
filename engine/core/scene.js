// engine/core/scene.js
// Three.js renderer, composer, lighting setup, skybox initialization, and scene prep.
// Must not execute frame-level rendering or grab logic.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { HueSaturationShader } from 'three/addons/shaders/HueSaturationShader.js';

import { state } from './state.js';
import { V } from './math.js';
import { resolveAt, idPhase } from './motion.js';
import { loadKit, loadMap, cover, envify, clouds } from './assets.js';
import { skyTexture } from './portals.js';
import { buildExtras, crowdN, NPC_SKIP } from './living.js';
import {
  buildCharacter,
  loadAtlas,
  registerAnims,
  baseAnim,
  preloadHair,
  hairStyles,
} from '../characters/character.js';
import { buildCreature } from '../characters/creatures.js';
import { preloadWear, wearInfo, makeWear, partSpace } from '../characters/wear/wear.js';
import { preloadModelProps } from '../props/modelprops.js';
import { initWeather } from '../environments/weather.js';
import { preloadPBR } from '../environments/pbr.js';
import { registerQuarks } from '../fx/quarks.js';
import { initSky, skyCfg, gradePass } from '../environments/sky.js';
import { INTERIOR } from '../environments/sets.js';
import { setTreatments } from '../environments/treatments.js';

export { skyTexture } from './portals.js';
export { clouds } from './assets.js';

export const AAA = () => state.TL.style?.look === 'aaa';
// which skybox a scene shows: its own `sky` (inherited by the pipeline), or with style.look 'aaa' the one that goes with its time of day
export const LOOK_SKY = {
  day: 'day_puffy',
  sunset: 'sunset',
  dusk: 'golden_hour',
  night: 'night_stars',
  spooky: 'storm',
};

export function skyName(s) {
  const n =
    s.sky ?? (AAA() && !INTERIOR.has(s.set) && s.set !== 'studio' && !s.weather ? LOOK_SKY[s.time || 'day'] : null);
  return n && n !== 'none' ? n : null;
}

export const skyLight = (n) => {
  const c = skyCfg(n);
  return {
    sunC: new THREE.Color(c.sun[0]),
    sunI: c.sun[1],
    hemiC: new THREE.Color(c.hemi[0]),
    hemiI: c.hemi[1],
    fogC: new THREE.Color(c.fog[0]),
  };
};

export async function init(timeline) {
  state.TL = timeline;
  state.W = state.width = state.TL.width;
  state.H = state.height = state.TL.height;
  const W = state.W,
    H = state.H,
    TL = state.TL;
  await document.fonts.load('80px "Lilita One"');
  await document.fonts.load('600 80px "Fredoka"');
  state.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  state.renderer.setSize(W, H, false);
  state.renderer.shadowMap.enabled = true;
  state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  state.renderer.toneMapping =
    { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping }[TL.style?.tone] ?? THREE.NeutralToneMapping;
  state.renderer.toneMappingExposure = TL.style?.exposure ?? 1; // Neutral keeps the flat toy colours; ACES muddies them (style.tone 'aces' = the old look) renderer.outputColorSpace = THREE.SRGBColorSpace;
  state.scene = new THREE.Scene();
  state.camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 900);
  if (TL.style?.env !== false) {
    const pm = new THREE.PMREMGenerator(state.renderer);
    state.ENV = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
  } // reflections for METAL only (envify): as scene.environment it lights everything and washes out the flat toy colours and the shadows
  state.hemi = new THREE.HemisphereLight('#dff1ff', '#8a9a6a', 1.1);
  state.scene.add(state.hemi);
  state.amb = new THREE.AmbientLight('#ffffff', 0.25);
  state.scene.add(state.amb);
  state.sun = new THREE.DirectionalLight('#fff4e0', 2.6);
  state.sun.castShadow = true;
  state.sun.shadow.mapSize.set(4096, 4096);
  Object.assign(state.sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 200 });
  state.sun.shadow.bias = -0.0005;
  state.sun.shadow.normalBias = 0.03;
  state.sun.shadow.autoUpdate = false;
  state.scene.add(state.sun, state.sun.target);
  state.comp = document.createElement('canvas');
  state.comp.width = W;
  state.comp.height = H;
  state.cg = state.comp.getContext('2d');
  document.body.appendChild(state.comp);
  try {
    setTreatments(await (await fetch('/config/treatments.json')).json());
  } catch (e) {
    console.warn('treatments: ' + e.message);
  }
  await loadAtlas();
  await initWeather(state.scene, state.camera);
  await preloadPBR();
  registerQuarks(TL.quarks);
  try {
    registerAnims(TL.anims || (await (await fetch('/config/anims.json')).json()));
  } catch (e) {
    console.warn('anims: ' + e.message);
  } // TL.anims = every config/anims*.json merged by the pipeline
  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
  state.composer = new EffectComposer(state.renderer, rt);
  state.composer.addPass(new RenderPass(state.scene, state.camera));
  if (TL.style?.ao === true) {
    // OFF by default: GTAO paints sharp dark rectangles on the ground (wishing-stars 0:12); opt in with style.ao:true
    state.gtao = new GTAOPass(state.scene, state.camera, W, H);
    state.gtao.output = GTAOPass.OUTPUT.Default;
    state.gtao.blendIntensity = 0.85;
    state.gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.5, thickness: 1.5, scale: 1 });
    state.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    state.composer.addPass(state.gtao);
    // GTAO redraws the scene with an override material that ignores opacity: anything see-through (light pools, glass, decals,
    // particles, sky sprites) would be treated as a solid slab and darken what is behind it. Leave those out of the AO pass.
    state.gtao.overrideVisibility = function () {
      const cache = this._visibilityCache;
      this.scene.traverse((o) => {
        cache.set(o, o.visible);
        const m = o.material;
        if (
          o.isPoints ||
          o.isLine ||
          o.isSprite ||
          o.userData.noAO ||
          (m &&
            []
              .concat(m)
              .some(
                (x) =>
                  x.transparent ||
                  x.isMeshBasicMaterial ||
                  x.opacity < 1 ||
                  x.visible === false ||
                  x.colorWrite === false ||
                  x.alphaTest > 0,
              ))
        )
          o.visible = false;
      });
    };
  }
  if (TL.style?.dof !== false) {
    // shallow focus on close shots: the subject stays sharp, the set behind goes soft
    state.bokeh = new BokehPass(state.scene, state.camera, { focus: 10, aperture: 0, maxblur: 0.022 });
    state.bokeh.enabled = false;
    state.composer.addPass(state.bokeh);
    const draw = state.bokeh.render.bind(state.bokeh);
    state.bokeh.render = (...a) => {
      const pts = [];
      state.scene.traverse((o) => {
        if ((o.isPoints || o.isSprite || o.userData.noAO) && o.visible) {
          o.visible = false;
          pts.push(o);
        }
      });
      draw(...a);
      pts.forEach((o) => {
        o.visible = true;
      });
    }; // pollen / stars carry no depth
  }
  state.bloom = new UnrealBloomPass(new THREE.Vector2(W, H), TL.style?.bloom ?? 0.35, 0.55, 0.82);
  state.composer.addPass(state.bloom);
  state.composer.addPass(new OutputPass());
  const sat = new ShaderPass(HueSaturationShader);
  sat.uniforms.saturation.value = TL.style?.saturation ?? 0.14;
  state.composer.addPass(sat);
  state.grade = gradePass(W / H);
  state.composer.addPass(state.grade);
  await initSky(
    state.scene,
    state.renderer,
    TL.scenes.flatMap((s) => [skyName(s), s.skyTo?.sky, ...(s.props || []).map((p) => p.portal?.sky)]),
  );
  for (const k of new Set(TL.scenes.filter((s) => s.set === 'kit').map((s) => s.setOpts?.kit))) await loadKit(k);
  for (const f of new Set(TL.scenes.filter((s) => s.set === 'map').map((s) => s.setOpts?.file || 'brookhaven')))
    await loadMap(f);
  await preloadWear([
    ...TL.scenes.flatMap((s) => (s.props || []).map((p) => p.type)),
    ...Object.values(TL.cast || {}).flatMap((c) => c.wear || []),
  ]);
  if (TL.style?.modelProps !== false)
    await preloadModelProps(
      TL.scenes.flatMap((s) => (s.props || []).map((p) => (p.type === 'scatter' ? p.model : p.type))),
    );
  const poolN = Math.max(
    0,
    ...TL.scenes.map((s) => (s.set === 'kit' ? Math.min(8, s.extras ?? TL.style?.extras ?? 0) : 0) + crowdN(s)),
  );
  await preloadHair(Object.values(TL.cast || {}).map((c) => String(c.hair || '').replace('rbx:', '')));
  if (poolN) await preloadHair(hairStyles().filter((n) => !NPC_SKIP.has(n)));
  for (const [id, spec] of Object.entries(TL.cast || {})) {
    const ch = spec.model ? await buildCreature(spec) : buildCharacter(spec);
    ch.root.visible = false;
    state.scene.add(ch.root);
    state.chars[id] = ch;
    ch.worn = [];
    for (const n of spec.wear || []) {
      const w = wearInfo(n);
      if (!w || ch.creature) {
        console.warn('unknown wearable ' + n);
        continue;
      }
      const o = makeWear(n),
        sp = partSpace(ch, w.part, w.slot, w.att);
      sp.add(o);
      envify(o);
      if (w.part === 'head') {
        cover(n, o, sp, true);
        ch.worn.push(n);
      }
    }
  }
  buildExtras(poolN);
  TL.scenes.forEach((s, i) => prepScene(s, i));
  return { duration: TL.duration, frames: Math.ceil(TL.duration * TL.fps) };
}

export function prepScene(s, idx) {
  const prevSet = idx > 0 ? state.TL.scenes[idx - 1].set : null;
  // actors
  s._actors = (s.actors || [])
    .map((a) => {
      const ch = state.chars[a.id];
      if (!ch) {
        console.warn('unknown actor', a.id);
        return null;
      }
      const carry = (prevSet === s.set && state.lastState[a.id]) || null;
      let pos = a.at ? V(a.at[0], a.y || 0, a.at[1]) : carry ? carry.pos.clone() : V(0, 0, 0);
      if (a.y != null && !a.at) pos.y = a.y;
      const acts = [
        {
          t: 0,
          anim: a.anim || 'idle',
          expr: a.expr || ch.spec.expr || 'happy',
          face: a.face,
          to: a.to,
          y: a.toy,
          speed: a.speed,
          dur: a.dur,
          arc: a.arc,
        },
      ]
        .concat((a.actions || []).map((x) => ({ ...x, t: resolveAt(x.at, s) })))
        .sort((p, q) => p.t - q.t);
      let cur = pos.clone(),
        expr = acts[0].expr,
        anim = acts[0].anim;
      for (const ac of acts) {
        ac.p0 = cur.clone();
        ac.expr = ac.expr || expr;
        expr = ac.expr;
        if (ac.to) {
          const p1 = V(ac.to[0], ac.y ?? cur.y, ac.to[1]);
          const run = baseAnim(ac.anim) === 'run';
          const sp = ac.speed || (run ? 15 : 7);
          ac.mdur = ac.dur || Math.max(0.3, p1.distanceTo(cur) / sp);
          ac.p1 = p1;
          ac.anim = ac.anim || 'walk';
          cur = p1.clone();
        }
        ac.anim = ac.anim || anim;
        anim = ac.after || (ac.to ? 'idle' : ac.anim);
      }
      const end = acts[acts.length - 1];
      state.lastState[a.id] = { pos: cur.clone() };
      return { a, ch, acts, faceDeg: a.face, ph: idPhase(a.id) };
    })
    .filter(Boolean);
}
