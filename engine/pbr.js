// PBR surface library: assets/textures/pbr/<name>/{diff,nor,rough}.jpg (Poly Haven CC0), listed in assets/textures/pbr/index.json
//   { "<name>": { "size": <metres one tile covers>, "rough": true|false (has a roughness map) } }
// preloadPBR() loads everything once at init; pbrMat() is then synchronous, like mat() in sets.js.
import * as THREE from 'three';

const LIB = {};
let INDEX = {};
const load = (url) =>
  new Promise((ok) =>
    new THREE.TextureLoader().load(url, ok, undefined, () => {
      console.warn('pbr: cannot load ' + url);
      ok(null);
    }),
  );

export async function preloadPBR(names) {
  try {
    INDEX = await (await fetch('/assets/textures/pbr/index.json')).json();
  } catch (e) {
    INDEX = {};
  }
  for (const n of names ? names.filter((n) => INDEX[n]) : Object.keys(INDEX)) {
    if (LIB[n]) continue;
    const d = `/assets/textures/pbr/${n}/`,
      [diff, nor, rough] = await Promise.all([
        load(d + 'diff.jpg'),
        load(d + 'nor.jpg'),
        INDEX[n].rough === false ? null : load(d + 'rough.jpg'),
      ]);
    if (diff) diff.colorSpace = THREE.SRGBColorSpace;
    LIB[n] = { diff, nor, rough, size: INDEX[n].size || 2 };
  }
}
export const pbrNames = () => Object.keys(INDEX);
export const hasPBR = (n) => !!LIB[n];
// w, h: size in units of the surface this material goes on (one texture tile covers `size` units); o: any MeshStandardMaterial option
// (color tints the albedo, e.g. gold or ice), plus normalScale. Falls back to a flat colour when the surface was not downloaded.
export function pbrMat(name, w = 4, h = 4, o = {}) {
  const L = LIB[name];
  const { normalScale = 1, fallback = '#888888', ...opt } = o;
  if (!L || !L.diff) return new THREE.MeshStandardMaterial({ color: opt.color || fallback, roughness: 0.8, ...opt });
  const t = (x) => {
    if (!x) return null;
    const c = x.clone();
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(w / L.size, h / L.size);
    c.anisotropy = 8;
    c.needsUpdate = true;
    return c;
  };
  return new THREE.MeshStandardMaterial({
    map: t(L.diff),
    normalMap: t(L.nor),
    roughnessMap: t(L.rough),
    roughness: 1,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    ...opt,
  });
}
