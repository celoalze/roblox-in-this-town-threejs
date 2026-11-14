// engine/core/portals.js
// Owns portal views, doorway render targets, and underwater background generation.
// Must not mutate core scene timeline or camera setup.

import * as THREE from 'three';
import { state } from './state.js';
import { V, SUN_OFF } from './math.js';
import { buildSet, INTERIOR } from '../environments/sets.js';
import { skyCfg, setSky, updateSky, newDome } from '../environments/sky.js';

export const SKY = {
  day: ['#2f86f0', '#8cc8ff', '#e6f4ff', 0.85, 3.0],
  sunset: ['#4b3c8f', '#ff8a5c', '#ffd2a0', 0.75, 1.8],
  night: ['#0b1030', '#24305e', '#7a8cc8', 0.35, 0.5],
  dusk: ['#2a3a6a', '#7f86b8', '#c9c2e6', 0.55, 1.0],
  spooky: ['#141821', '#2b3342', '#5a6578', 0.3, 0.45],
};

export function skyTexture(key) {
  if (state.skyTex[key]) return state.skyTex[key];
  const [a, b, c] = SKY[key] || SKY.day;
  const cv = document.createElement('canvas');
  cv.width = 4;
  cv.height = 512;
  const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, a);
  gr.addColorStop(0.6, b);
  gr.addColorStop(1, c);
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return (state.skyTex[key] = t);
}

// gold, swords, chrome: without something to reflect, metal renders as dark plastic
export function envify(o) {
  if (!state.ENV || o.userData._env) return;
  o.userData._env = 1;
  o.traverse((x) => {
    for (const m of [].concat(x.material || []))
      if (m.isMeshStandardMaterial && m.metalness > 0.3 && !m.envMap) {
        m.envMap = state.ENV;
        m.envMapIntensity = state.TL.style?.env ?? 0.8;
        m.needsUpdate = true;
      }
  });
}

// ---- PORTALS: a doorway that shows another world. The destination is its own small scene (set + sky + light, no actors), drawn each
// frame into a render target from the main camera carried through the door, and the doorway samples it in screen space: real parallax.
export function portalFor(d) {
  const k = JSON.stringify(d);
  if (state.PORT[k]) return state.PORT[k];
  if (!state.prt) {
    state.prt = new THREE.WebGLRenderTarget(state.W, state.H, { type: THREE.HalfFloatType, samples: 4 });
    state.pcam = new THREE.PerspectiveCamera();
  }
  const sc = new THREE.Scene(),
    night = d.time === 'night' || d.time === 'spooky',
    g = buildSet(d.set, { ...(d.setOpts || {}), night }, d.seed || 7);
  sc.add(g);
  envify(g);
  const sk = SKY[d.time] || SKY.day,
    c = d.sky ? skyCfg(d.sky) : null,
    l = new THREE.DirectionalLight(c ? c.sun[0] : '#fff4e0', c ? c.sun[1] : sk[4]);
  l.position.copy(SUN_OFF);
  sc.add(
    new THREE.HemisphereLight(c ? c.hemi[0] : '#dff1ff', '#8a9a6a', c ? c.hemi[1] : sk[3] * 1.1),
    l,
    new THREE.AmbientLight('#ffffff', 0.25),
  );
  if (!INTERIOR.has(d.set)) sc.fog = c ? new THREE.Fog(c.fog[0], c.fog[1], c.fog[2]) : new THREE.Fog(sk[2], 90, 420);
  const dome = c ? newDome(sc) : null;
  if (dome) setSky(d.sky, null, dome);
  else sc.background = INTERIOR.has(d.set) ? new THREE.Color('#0b0f22') : skyTexture(d.time || 'day');
  return (state.PORT[k] = { sc, dome, z: d.z ?? 0, y: d.y ?? 0 });
}

export function drawPortal(P) {
  const m = P.o.userData.portal,
    q = new THREE.Quaternion(),
    p = V(),
    sc = V();
  m.updateWorldMatrix(true, false);
  m.matrixWorld.decompose(p, q, sc);
  state.camera.updateMatrixWorld();
  const door = new THREE.Matrix4().compose(p, q, V(1, 1, 1)),
    dest = new THREE.Matrix4().makeTranslation(0, (m.geometry.parameters.height * sc.y) / 2 + P.portal.y, P.portal.z); // the doorway's sill sits at (0, y, z) of the destination
  dest
    .multiply(door.invert())
    .multiply(state.camera.matrixWorld)
    .decompose(state.pcam.position, state.pcam.quaternion, state.pcam.scale);
  const n = V(0, 0, 1).applyQuaternion(q),
    dist = Math.abs(state.camera.position.clone().sub(p).dot(n));
  state.pcam.fov = state.camera.fov;
  state.pcam.aspect = state.camera.aspect;
  state.pcam.near = Math.max(0.1, dist * 0.5);
  state.pcam.far = 900;
  state.pcam.updateProjectionMatrix();
  state.pcam.updateMatrixWorld(true); // near plane: nothing of the destination between the eye and the door
  if (P.portal.dome) updateSky(state.pcam, 0, P.portal.dome);
  m.material.uniforms.tex.value = state.prt.texture;
  m.material.uniforms.res.value.set(state.W, state.H);
  state.renderer.setRenderTarget(state.prt);
  state.renderer.render(P.portal.sc, state.pcam);
  state.renderer.setRenderTarget(null);
}

export function underwaterBG() {
  if (state._uwBG) return state._uwBG;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const x = c.getContext('2d'),
    gr = x.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#7fe0ff');
  gr.addColorStop(0.35, '#1f9fd0');
  gr.addColorStop(1, '#073a58');
  x.fillStyle = gr;
  x.fillRect(0, 0, 4, 256);
  state._uwBG = new THREE.CanvasTexture(c);
  state._uwBG.colorSpace = THREE.SRGBColorSpace;
  return state._uwBG;
}
