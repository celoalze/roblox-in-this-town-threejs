// Shared character materials: rim light shader hook, procedural fabric / plastic / gold, rounded boxes. (R15 characters only; was part of engine/rig.js.)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

let normalTex = null;
function fabricNormal() {
  if (normalTex) return normalTex;
  const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d');
  const h = new Float32Array(N * N); let s = 9; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N * N; i++) h[i] = r();
  for (let k = 0; k < 2; k++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x; h[i] = (h[i] + h[y * N + (x + 1) % N] + h[((y + 1) % N) * N + x]) / 3; }
  const im = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x; const dx = h[y * N + (x + 1) % N] - h[i], dy = h[((y + 1) % N) * N + x] - h[i]; im.data[i * 4] = 128 + dx * 600; im.data[i * 4 + 1] = 128 + dy * 600; im.data[i * 4 + 2] = 255; im.data[i * 4 + 3] = 255; }
  g.putImageData(im, 0, 0); normalTex = new THREE.CanvasTexture(cv); normalTex.wrapS = normalTex.wrapT = THREE.RepeatWrapping; normalTex.repeat.set(3, 3); return normalTex;
}
// Rim light, characters only: a view-dependent glow on the silhouette (stronger on top) that cuts them out of the set.
// Done in the material, not with a back light: a real light behind the subject also glares off every floor into the lens.
export const RIM = { color: { value: new THREE.Color('#e6f0ff') }, k: { value: .55 } };
function rimCompile(sh) { sh.uniforms.uRimC = RIM.color; sh.uniforms.uRimK = RIM.k;
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `uniform vec3 uRimC; uniform float uRimK;
#include <common>`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  { vec3 rn = normalize(vNormal); float rf = pow(1.0 - saturate(dot(rn, normalize(vViewPosition))), 3.0); totalEmissiveRadiance += uRimC * (diffuseColor.rgb * .6 + .4) * uRimK * rf * (.3 + .7 * saturate(rn.y * .5 + .5)); }`); }
export const rimify = (m) => { if (!m.userData.rim) { m.userData.rim = true; m.onBeforeCompile = rimCompile; } return m; };
const MC = {};
export const fabric = (c) => MC['f' + c] || (MC['f' + c] = new THREE.MeshStandardMaterial({ color: c, roughness: .82, normalMap: fabricNormal(), normalScale: new THREE.Vector2(.35, .35) }));
export const plastic = (c, rough = .42) => MC['p' + c + rough] || (MC['p' + c + rough] = new THREE.MeshPhysicalMaterial({ color: c, roughness: rough, clearcoat: .35, clearcoatRoughness: .35 }));
export const gold = () => MC.gold || (MC.gold = new THREE.MeshStandardMaterial({ color: '#ffc22e', metalness: 1, roughness: .25, emissive: '#3a2600', emissiveIntensity: .4 }));
export const shade = (hex, f) => '#' + new THREE.Color(hex).multiplyScalar(f).getHexString();

const GC = {};
export const rbox = (w, h, d, r = .08) => GC[`b${w}${h}${d}${r}`] || (GC[`b${w}${h}${d}${r}`] = new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - .001, h / 2 - .001, d / 2 - .001)));
export function mesh(geo, mat, x = 0, y = 0, z = 0, parent) { const m = new THREE.Mesh(geo, rimify(mat)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; if (parent) parent.add(m); return m; }
