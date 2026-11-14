// Wearables: Roblox catalog accessories (config/wearables.json, files in assets/roblox/wear) fixed to a body part exactly where
// their Roblox attachment puts them on the character. Always on (`"wear": [...]` in the cast spec) or timed (`+cap@word`).
import * as THREE from 'three';
import { slotSpace15 } from './r15_attach.js';
let CFG = null;
const LIB = {};
export async function preloadWear(names) {
  CFG = CFG || (await (await fetch('/config/wearables.json')).json().catch(() => ({})));
  await Promise.all(
    [...new Set(names)]
      .filter((n) => CFG[n]?.mesh && !LIB[n])
      .map(async (n) => {
        try {
          const d = await (await fetch(`/assets/roblox/wear/${n}.json`)).json();
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(d.p, 3));
          g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
          g.setIndex(d.i);
          g.computeVertexNormals();
          const map = await new THREE.TextureLoader().loadAsync(`/assets/roblox/wear/${n}.png`);
          map.colorSpace = THREE.SRGBColorSpace;
          map.anisotropy = 8;
          LIB[n] = {
            g,
            mat: new THREE.MeshStandardMaterial({ map, roughness: 0.6, alphaTest: 0.5, side: THREE.DoubleSide }),
          };
        } catch (e) {
          console.warn('wearable ' + n, e.message);
        }
      }),
  );
}
export const wearInfo = (n) => (LIB[n] ? CFG[n] : null); // { slot, part, ... }
export function makeWear(n) {
  const m = new THREE.Mesh(LIB[n].g, LIB[n].mat);
  m.castShadow = m.receiveShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}
// the group of a character an accessory of `part` hangs from, in that part's centre space
export function partSpace(ch, part, slot, att) {
  if (part === 'head') return ch.fitSpace || ch.headSpace; // head-fit space (the HEAD_R / HEAD_H head box mapped onto the R15 head), see engine/r15_attach.js
  return slotSpace15(ch, slot, att);
}
