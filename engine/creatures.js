// Creatures: rigged, animated GLB models (assets/models/**) used as ordinary actors. Presets: config/creatures.json.
// Same contract as the rest of the engine: update() is a closed-form function of time (clips are SAMPLED at a time, never advanced),
// so frames render in any order. A creature exposes { root, spec, creature: true, update(state) } and is staged like a character.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const UNITS_PER_M = 4; // a 1.3 m kid is ~5.2 units tall
const cache = {};
const loader = new GLTFLoader();
const load = (file) => cache[file] || (cache[file] = loader.loadAsync(`/assets/models/${file}.glb`));
const S = Math.sin,
  clamp01 = (k) => Math.max(0, Math.min(1, k)),
  smooth = (k) => {
    k = clamp01(k);
    return k * k * (3 - 2 * k);
  };

// anim name -> how the body moves. clip: which authored clip (first match wins); the rest is procedural on top of it.
export const CREATURE_ANIMS = ['idle', 'walk', 'run', 'fly', 'roar', 'fire', 'sleep', 'jump', 'eat'];

let SPOT = null;
function spotTex() {
  if (SPOT) return SPOT;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const g = cv.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 512, 512);
  let sd = 5;
  const R = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 150; i++) {
    const x = R() * 512,
      y = R() * 512,
      r = 3 + R() * 9;
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(x, y, r, 0, 7);
    g.fill();
    g.fillStyle = '#000';
    g.beginPath();
    g.ellipse(x, y, r * 0.22, r * 0.6, 0, 0, 7);
    g.fill();
  }
  SPOT = new THREE.CanvasTexture(cv);
  SPOT.wrapS = SPOT.wrapT = THREE.RepeatWrapping;
  SPOT.flipY = false;
  return SPOT;
}
export async function buildCreature(spec) {
  const gltf = await load(spec.model);
  const model = SkeletonUtils.clone(gltf.scene);
  const root = new THREE.Group(),
    body = new THREE.Group();
  root.add(body);
  body.add(model);
  const box = new THREE.Box3().setFromObject(model),
    size = box.getSize(new THREE.Vector3());
  const k = spec.height ? spec.height / size.y : UNITS_PER_M * (spec.scale || 1);
  model.scale.setScalar(k);
  model.position.y = -box.min.y * k;
  if (spec.yaw) model.rotation.y = (spec.yaw * Math.PI) / 180;
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      for (const m of [].concat(o.material)) {
        if (m.metalness > 0.3) m.metalness = 0;
        if (spec.tint) {
          o.material = m.clone();
          o.material.color.multiply(new THREE.Color(spec.tint));
        }
        // recolor: one solid colour instead of the model's texture (ice giant, shadow beast); emissive / glow: self-lit; opacity; spots: glowing dots all over (eyes)
        if (spec.recolor || spec.emissive || spec.spots || spec.opacity != null) {
          const n = (o.material = o.material === m ? m.clone() : o.material);
          if (spec.recolor) {
            n.map = null;
            n.color.set(spec.recolor);
            n.roughness = spec.rough ?? 0.35;
          }
          if (spec.emissive) {
            n.emissive = new THREE.Color(spec.emissive);
            n.emissiveIntensity = spec.glow ?? 0.6;
          }
          if (spec.opacity != null) {
            n.transparent = true;
            n.opacity = spec.opacity;
          }
          if (spec.spots) {
            n.emissive = new THREE.Color(spec.spots);
            n.emissiveIntensity = spec.glow ?? 2.2;
            n.emissiveMap = spotTex();
          }
          n.needsUpdate = true;
        }
      }
    }
  });
  const mixer = new THREE.AnimationMixer(model),
    acts = {};
  for (const c of gltf.animations) {
    const a = mixer.clipAction(c);
    a.play();
    a.setEffectiveWeight(0);
    acts[c.name.toLowerCase()] = a;
  }
  const clip = (...names) => names.map((n) => acts[n]).find(Boolean) || Object.values(acts)[0];
  const bone = (n) => model.getObjectByName(n);
  const B = {
    head: bone('Head'),
    jaw: bone('Jaw'),
    neck: bone('Neck'),
    wl: bone('LeftWing') || bone('LeftForeWing'),
    wr: bone('RightWing') || bone('RightForeWing'),
    wl2: bone('LeftWingFore'),
    wr2: bone('RightWingFore'),
    tail: bone('Tail'),
    tail2: bone('TailMid') || bone('TailTip'),
  };
  const H = size.y * k;
  const fire = spec.fire === false ? null : makeFire(H);
  if (fire) root.add(fire.obj);
  const ch = { root, body, spec: { ...spec, scale: H / 5.2 }, creature: true, height: H, clips: Object.keys(acts) };
  // st: { anim, d (distance walked on this move), f (0..1 how much it is moving), tl (seconds in this action) }, t = absolute time
  ch.update = (st, t, ph = 0) => {
    const anim = st.anim,
      f = st.f || 0,
      moving = f > 0,
      flying = anim === 'fly';
    for (const n in acts) acts[n].setEffectiveWeight(0);
    const idle = clip('idle'),
      loco = flying
        ? clip('fly fast', 'fly', 'run', 'idle')
        : anim === 'run'
          ? clip('run', 'walk')
          : clip('walk', 'run');
    const put = (a, time, w) => {
      if (!a || w <= 0) return;
      a.time = ((time % a.getClip().duration) + a.getClip().duration) % a.getClip().duration;
      a.setEffectiveWeight(a.getEffectiveWeight() + w);
    };
    const w = flying ? 1 : smooth(f);
    const rate = anim === 'run' ? 1.5 : 1;
    put(loco, flying ? t * 1.2 + ph : ((st.d || 0) / (spec.stride || H * 0.9)) * loco.getClip().duration * rate, w);
    put(idle, t + ph, 1 - w);
    mixer.update(0);
    // procedural layer on the sampled pose
    let y = 0,
      pitch = 0,
      sq = 1,
      jaw = 0,
      fireOn = 0;
    const tl = st.tl || 0;
    if (flying) {
      const flap = S(t * 7 + ph);
      y = S(t * 1.8 + ph) * 0.06 * H;
      pitch = -0.12 - f * 0.18;
      if (B.wl && !acts.fly) {
        B.wl.rotation.z += flap * 0.75;
        B.wr.rotation.z -= flap * 0.75;
        if (B.wl2) {
          B.wl2.rotation.z += S(t * 7 + ph - 0.9) * 0.5;
          B.wr2.rotation.z -= S(t * 7 + ph - 0.9) * 0.5;
        }
      }
    } else if (B.wl && !moving) {
      const fold = S(t * 1.1 + ph) * 0.05;
      B.wl.rotation.z += fold;
      B.wr.rotation.z -= fold;
    }
    if (anim === 'roar' || anim === 'fire') {
      const a = smooth(tl / 0.25),
        sh = S(t * 38) * 0.02 * a;
      jaw = a * 0.7 + S(t * 30) * 0.06 * a;
      pitch -= (anim === 'roar' ? 0.22 : 0.06) * a;
      if (B.neck) B.neck.rotation.x -= (anim === 'roar' ? 0.35 : 0.1) * a;
      if (B.head) B.head.rotation.z += sh;
      sq = 1 + 0.04 * a;
      fireOn = anim === 'fire' ? a : 0;
    }
    if (anim === 'sleep') {
      const a = smooth(tl / 0.6);
      sq = 1 - 0.32 * a + S(t * 1.4) * 0.02;
      if (B.neck) B.neck.rotation.x += 0.7 * a;
      if (B.head) B.head.rotation.x += 0.3 * a;
    }
    if (anim === 'eat') {
      const a = smooth(tl / 0.3);
      if (B.neck) B.neck.rotation.x += (0.75 + S(t * 6) * 0.12) * a;
      jaw = (S(t * 9) * 0.5 + 0.5) * 0.3 * a;
    }
    if (anim === 'jump') {
      const j = Math.max(0, S(t * 5));
      y += j * H * 0.45;
      sq = 1 + 0.1 * Math.cos(t * 5);
    }
    if (B.jaw && jaw) B.jaw.rotation.x += jaw;
    if (B.tail && !flying) {
      B.tail.rotation.y += S(t * 2.3 + ph) * 0.22;
      if (B.tail2) B.tail2.rotation.y += S(t * 2.3 + ph - 0.8) * 0.3;
    }
    body.position.y = y;
    body.rotation.x = pitch;
    const wsc = 1 / Math.sqrt(sq);
    body.scale.set(wsc, sq, wsc);
    if (fire) {
      fire.obj.visible = fireOn > 0;
      if (fireOn > 0) {
        root.updateWorldMatrix(true, true);
        const m = B.jaw || B.head || model;
        const p = m.getWorldPosition(new THREE.Vector3());
        root.worldToLocal(p);
        fire.obj.position.copy(p);
        fire.update(t, fireOn);
      }
    }
  };
  ch.update({ anim: 'idle' }, 0);
  return ch;
}

// Fire breath: a cone of additive puffs flying forward (+z of the creature) from the mouth. Closed-form in t.
function makeFire(H) {
  const N = 46,
    geo = new THREE.SphereGeometry(1, 8, 6),
    mat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.frustumCulled = false;
  mesh.userData.noAO = true;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  let sd = 31;
  const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const R = Array.from({ length: N }, () => [r(), r() - 0.5, r() - 0.5, r()]);
  const light = new THREE.PointLight('#ff8a2a', 0, H * 3);
  light.position.set(0, 0, H * 0.5);
  const obj = new THREE.Group();
  obj.add(mesh, light);
  obj.visible = false;
  const M = new THREE.Matrix4(),
    c = new THREE.Color(),
    hot = new THREE.Color('#fff2b0'),
    mid = new THREE.Color('#ff7a1a'),
    end = new THREE.Color('#c81e0a'),
    L = H * 1.5;
  return {
    obj,
    update(t, a) {
      for (let i = 0; i < N; i++) {
        const [o, sx, sy, v] = R[i],
          u = (t * (1.5 + v * 0.8) + o) % 1,
          s = (0.03 + u * 0.11) * H * a * (1 - u * 0.3);
        M.makeScale(s, s, s);
        M.setPosition(sx * u * L * 0.32, sy * u * L * 0.22 - u * u * H * 0.1, u * L);
        mesh.setMatrixAt(i, M);
        c.copy(hot)
          .lerp(mid, clamp01(u * 2.2))
          .lerp(end, clamp01(u * 1.6 - 0.6))
          .multiplyScalar(1 - u * 0.55);
        mesh.setColorAt(i, c);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
      light.intensity = a * (3 + S(t * 31) * 0.8) * H;
    },
  };
}
