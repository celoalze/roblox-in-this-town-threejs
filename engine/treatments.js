// Material treatments (config/treatments.json): re-skin any model/world with a shader patch (tint, desaturate, darken, a "cap" that
// settles on up-facing surfaces like snow/moss/sand, wet roughness). Works on batched, instanced and textured standard materials.
import * as THREE from 'three';
let CFG = {}; const CACHE = new Map();
export function setTreatments(c) { CFG = c || {}; }
export function parseTreat(v) { // "frost" | "frost:.6" | ["moss","wet:.5"] -> [{name,k}]
  return (Array.isArray(v) ? v : v ? [v] : []).map(x => { const [n, k] = String(x).split(':'); return { name: n, k: k ? +k : 1 }; }).filter(t => CFG[t.name]);
}
const f = (x) => (+x).toFixed(4), col = (c) => { const k = new THREE.Color(c); return `vec3(${f(k.r)},${f(k.g)},${f(k.b)})`; };
function block(t) {
  const c = CFG[t.name], k = f(t.k); let s = '';
  if (c.tint) s += `diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.35 + ${col(c.tint[0])} * 0.65, ${f(c.tint[1])} * ${k});\n`;
  if (c.desat) s += `{ float l = dot(diffuseColor.rgb, vec3(.299,.587,.114)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(l), ${f(c.desat)} * ${k}); }\n`;
  if (c.dark) s += `diffuseColor.rgb *= 1.0 - ${f(c.dark)} * ${k};\n`;
  if (c.cap) {
    const p = c.cap, d = p.dir || [0, 1, 0];
    s += `{ float up = dot(trN, normalize(vec3(${f(d[0])},${f(d[1])},${f(d[2])}))); float n = trNoise(trP * ${f(p.scale ?? .4)});
      float cap = smoothstep(${f((p.thresh ?? .3) - .12)}, ${f((p.thresh ?? .3) + .12)}, up + (n - .5) * ${f(p.noise ?? .5)}) * ${f(p.amount ?? 1)} * ${k};
      diffuseColor.rgb = mix(diffuseColor.rgb, ${col(p.color)}, cap); trCap = max(trCap, cap); }\n`;
  }
  if (c.rough) s += `trRough = mix(trRough < 0.0 ? roughnessFactor0 : trRough, ${f(c.rough[0])}, clamp(${f(c.rough[1])} * ${k} + trCap * .5, 0.0, 1.0));\n`;
  return s;
}
const VERT_DECL = 'varying vec3 trN; varying vec3 trP;\n';
const NOISE = `varying vec3 trN; varying vec3 trP;
float trH(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float trNoise(vec3 x){ vec3 i = floor(x), fr = fract(x); fr = fr * fr * (3.0 - 2.0 * fr);
  return mix(mix(mix(trH(i), trH(i + vec3(1,0,0)), fr.x), mix(trH(i + vec3(0,1,0)), trH(i + vec3(1,1,0)), fr.x), fr.y),
             mix(mix(trH(i + vec3(0,0,1)), trH(i + vec3(1,0,1)), fr.x), mix(trH(i + vec3(0,1,1)), trH(i + vec3(1,1,1)), fr.x), fr.y), fr.z); }
`;
function treatMat(m, specs, key) {
  if (!m || !m.isMeshStandardMaterial || (m.transparent && m.opacity < .98) || m.userData.noTreat) return m;
  const ck = m.uuid + '|' + key; if (CACHE.has(ck)) return CACHE.get(ck);
  const n = m.clone(); n.userData = { ...m.userData, treated: key };
  const body = specs.map(block).join('');
  n.onBeforeCompile = (sh) => {
    sh.vertexShader = VERT_DECL + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vec3 trWn = objectNormal;
        #ifdef USE_INSTANCING
          trWn = mat3(instanceMatrix) * trWn;
        #endif
        trN = normalize(mat3(modelMatrix) * trWn);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec4 q = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          q = instanceMatrix * q;
        #endif
        trP = (modelMatrix * q).xyz; }`);
    sh.fragmentShader = NOISE + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>\nfloat trCap = 0.0; float trRough = -1.0; float roughnessFactor0 = roughness;\n${body}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nif (trRough >= 0.0) roughnessFactor = trRough;`);
  };
  n.customProgramCacheKey = () => 'treat:' + key; CACHE.set(ck, n); return n;
}
export function applyTreat(root, treat) {
  const specs = parseTreat(treat); if (!specs.length || !root) return root;
  const key = specs.map(t => t.name + t.k).join('+');
  root.traverse(o => {
    if (!o.material || !o.isMesh || o.userData.noTreat) return;
    o.material = Array.isArray(o.material) ? o.material.map(m => treatMat(m, specs, key)) : treatMat(o.material, specs, key);
  });
  return root;
}
