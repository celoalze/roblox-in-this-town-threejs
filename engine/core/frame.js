// engine/core/frame.js
// Frame-level render loop, 3D scene rendering, motion blur, overlays, and staging lint.
// Coordinates subsystems for deterministic frame evaluation at time t.

import * as THREE from 'three';
import { state } from './state.js';
import { V, smooth, clamp01, wrapA, SUN_OFF, LX, LY, LZ } from './math.js';
import { actorAt, facingTo, resolveAt, LK, NOLOOK } from './motion.js';
import { cameraAt, viewOf, DOF } from './camera.js';
import { prepAssets, placeMap, placeKit } from './assets.js';
import { drawPortal, underwaterBG, skyTexture, SKY } from './portals.js';
import { skyName, skyLight, AAA } from './scene.js';
import { holdProp, updateExtras, updateLiving } from './living.js';
import { drawCaptions, drawOverlays } from '../hud/overlay.js';
import { weatherOf, weatherSky, updateWeather, drawWeather2D } from '../environments/weather.js';
import { skyCfg, setSky, updateSky, setGrade, GRADES } from '../environments/sky.js';
import { applyPose, setFace, baseAnim, RIM } from '../characters/character.js';
import { faceOptions } from '../characters/face/face2.js';
import { resolveLinks, finishLinks, linkRoot, headY } from '../characters/links.js';
import { mergeCovers, layerHair } from '../characters/wear/layers.js';
import { EMOTES } from '../props/props.js';
import { INTERIOR } from '../environments/sets.js';

// Text-only staging checks (no image needed): framing, occlusion, camera forced too close, actors overlapping.
export function lint(t) {
  frame(t);
  const s =
    state.TL.scenes.find((x) => t >= x.start && t < x.start + x.dur) || state.TL.scenes[state.TL.scenes.length - 1];
  const out = [];
  const occ = state.occluders.get(s._set) || [];
  const r = new THREE.Raycaster();
  for (const A of s._actors) {
    const sc = A.ch.spec.scale || 1;
    const head = A._st.pos.clone().add(V(0, (headY(A.ch) + (A._st.p.y || 0)) * sc, 0));
    const feet = A._st.pos.clone().add(V(0, 0.3, 0));
    const h = head.clone().project(state.camera),
      f = feet.clone().project(state.camera);
    const isT = state.camInfo.target === A.a.id;
    const mustSee = isT || state.camInfo.target === 'group' || state.camInfo.target === 'both';
    if (h.z > 1 || Math.abs(h.x) > 1.05 || h.y > 1.05 || h.y < -1) {
      if (mustSee && !A.acts.some((x) => x.p1)) out.push(`${A.a.id} head off-screen`);
    } else {
      const d = head.clone().sub(state.camera.position);
      const L = d.length();
      r.set(state.camera.position, d.normalize());
      r.far = L - 0.6;
      const hit = r.intersectObjects(occ, false)[0];
      if (hit) out.push(`${A.a.id} head hidden by set`);
    }
    if (isT && h.y < -0.2) out.push(`${A.a.id} (target) head in lower half`);
    for (const B of s._actors)
      if (
        B !== A &&
        A.a.id < B.a.id &&
        !(A._st.link?.A === B || A._st.link?.C === B) &&
        A._st.pos.distanceTo(B._st.pos) < 1.6
      )
        out.push(`${A.a.id}/${B.a.id} overlapping`);
  }
  if (state.camInfo.want && (state.camInfo.fit ?? state.camInfo.got / state.camInfo.want) < 0.55)
    out.push(`camera pulled in by set (${state.camInfo.got.toFixed(1)}/${state.camInfo.want.toFixed(1)})`);
  return out;
}

export function render3D(t) {
  const idx = state.TL.scenes.findIndex((s) => t >= s.start && t < s.start + s.dur);
  const s = state.TL.scenes[idx < 0 ? state.TL.scenes.length - 1 : idx];
  const lt = t - s.start;
  if (state.curScene !== s) {
    // switch visibility
    if (!s._ready) prepAssets(s);
    for (const k in state.sets) state.sets[k].visible = false;
    s._set.visible = true;
    if (s.set === 'map') {
      placeMap(s._set, s);
      state.occluders.delete(s._set);
    }
    if (s.set === 'kit') {
      placeKit(s._kit, s);
      state.occluders.delete(s._set);
    }
    for (const id in state.chars) state.chars[id].root.visible = false;
    if (state.curScene) {
      state.curScene._props.forEach((p) => (p.o.visible = false));
      state.curScene._fx.forEach((f) => (f.fx.obj.visible = false));
    }
    const isInt = !!s._interior || INTERIOR.has(s.set);
    const sk = SKY[s.time] || SKY.day;
    state.scene.background = INTERIOR.has(s.set)
      ? new THREE.Color(s.time === 'night' ? '#0b0f22' : '#cfe6ff')
      : skyTexture(s.time || 'day');
    state.scene.fog = isInt || s.set === 'studio' ? null : new THREE.Fog(sk[2], 90, 420);
    state.hemi.intensity = sk[3] * (isInt ? 1.25 : 1.1);
    state.sun.intensity = sk[4] * (isInt ? 0.7 : 1);
    state.sun.color.set(
      s.time === 'sunset' ? '#ffb27a' : s.time === 'night' || s.time === 'spooky' ? '#9fb4ff' : '#fff4e0',
    );
    state.hemi.color.set(s.time === 'night' || s.time === 'spooky' ? '#6a7ab8' : '#dff1ff');
    state.amb.intensity = isInt ? 0.55 : 0.25;
    const dark = s.time === 'night' || s.time === 'spooky';
    RIM.k.value =
      (state.TL.style?.rim ?? 1) * (isInt ? 0.35 : dark ? 0.5 : s.time === 'sunset' || s.time === 'dusk' ? 0.75 : 0.55);
    RIM.color.value.set(s.time === 'sunset' ? '#ffc79a' : dark ? '#a9c0ff' : '#e6f0ff');
    const sA = skyName(s),
      sB = (sA && s.skyTo?.sky) || null;
    s._skyT = sB ? resolveAt(s.skyTo.at, s) : 0; // skybox: replaces the gradient and brings the light that goes with it
    if (s._set.userData.clouds) s._set.userData.clouds.visible = !sA; // the picture has its own clouds
    if (setSky(sA, sB)) {
      state.scene.background = null;
      if (!isInt) {
        const L = skyLight(sA),
          c = skyCfg(sA);
        state.sun.color.copy(L.sunC);
        state.sun.intensity = L.sunI;
        state.hemi.color.copy(L.hemiC);
        state.hemi.intensity = L.hemiI;
        if (state.scene.fog) state.scene.fog = new THREE.Fog(c.fog[0], c.fog[1], c.fog[2]);
      }
    }
    const wx = weatherOf(s);
    s._wxInt = isInt || s.set === 'studio'; // weather: full look outdoors, only light + lightning flashes indoors
    if (wx) {
      const k = s._wxInt ? 0.5 : 1,
        [hm, sm] = wx.light || [1, 1];
      state.hemi.intensity *= 1 + (hm - 1) * k;
      state.sun.intensity *= 1 + (sm - 1) * k;
      if (!s._wxInt) {
        if (wx.sky && !sA) state.scene.background = weatherSky(s.weather);
        if (wx.sunColor) state.sun.color.set(wx.sunColor);
        if (wx.hemiColor) state.hemi.color.set(wx.hemiColor);
        if (wx.fog && state.scene.fog) state.scene.fog = new THREE.Fog(...wx.fog);
      }
    }
    if (s.medium === 'underwater') {
      // the whole scene is under water: no sky, blue gradient water column, thick blue fog, cool light
      setSky(null, null);
      if (s._set.userData.clouds) s._set.userData.clouds.visible = false;
      state.scene.background = underwaterBG();
      state.scene.fog = new THREE.Fog('#0f84ae', 3, s.fogFar || 85);
      state.sun.color.set('#a8ecff');
      state.sun.intensity *= 0.8;
      state.hemi.color.set('#6fd2f2');
      state.hemi.intensity *= 0.95;
    }
    state.baseHemi = state.hemi.intensity;
    state.LA = {
      sunC: state.sun.color.clone(),
      sunI: state.sun.intensity,
      hemiC: state.hemi.color.clone(),
      hemiI: state.baseHemi,
      fogC: state.scene.fog ? state.scene.fog.color.clone() : null,
    };
    state.LB = sB && !isInt ? skyLight(sB) : null;
    s._sky = sA;
    s._skyB = sB;
    s._shakeT = s.shakeAt != null ? resolveAt(s.shakeAt, s) : null;
    s._actors.forEach((A) => {
      A._pos = undefined;
    });
    s._actors.forEach((A) => {
      A._yaw0 = actorAt(A, 0, s).yaw;
    }); // camera angle is relative to the facing at the cut, whatever frame is rendered first
    state.curScene = s;
  }
  // actors
  s._actors.forEach((A) => {
    A._st = actorAt(A, lt, s);
    A._pos = A._st.pos;
  });
  resolveLinks(s, lt, LK); // actors linked to another's body (link:<id>:<mode>): position / pose derived from the carrier
  // look-at: heads follow the subject of the shot (or the actor's own `look`), within what a neck can do; the body keeps its staging
  const view = viewOf(s, lt),
    subj = typeof view.camera.target === 'string' ? view.camera.target : view.camera.target ? null : s._actors[0]?.a.id;
  if (state.TL.style?.lookAt !== false)
    s._actors.forEach((A) => {
      const own = A.a.look,
        id = own === false || own === 'none' ? null : own || subj;
      if (!id || id === A.a.id) return;
      const B = s._actors.find((x) => x.a.id === id);
      if (!B) return;
      const st = A._st;
      if ((!own && NOLOOK.has(baseAnim(st.anim))) || st.link || st.pos.distanceTo(B._st.pos) < 0.5) return;
      const D = wrapA(facingTo(st.pos, B._st.pos) - st.yaw);
      if (Math.abs(D) > 2.3) return; // behind the back: do not try
      const h = Math.max(-1, Math.min(1, (D * (own ? 0.85 : 0.6)) / (own ? 0.7 : 0.45))) * (own ? 0.7 : 0.45),
        dy =
          (B._st.p.y || 0) +
          B._st.pos.y +
          headY(B.ch) * (B.ch.spec.scale || 1) -
          ((st.p.y || 0) + st.pos.y + headY(A.ch) * (A.ch.spec.scale || 1));
      st.p.hd[1] += h;
      st.p.ts[1] += h * 0.22;
      st.p.hd[0] -= Math.max(-0.3, Math.min(0.3, Math.atan2(dy, Math.max(1, st.pos.distanceTo(B._st.pos))) * 0.7)); // also up / down at taller / shorter people
    });
  s._actors.forEach((A) => {
    const st = A._st,
      ch = A.ch;
    ch.root.visible = true;
    ch.root.position.copy(st.pos);
    linkRoot(ch, st);
    if (ch.creature) {
      ch.update({ anim: baseAnim(st.anim), d: st.d, f: st.f, tl: st.tl }, t, A.ph);
      return;
    }
    applyPose(ch, st.p);
    // mouth: talking when this actor is the scene speaker and a word is active
    let mouth = 0;
    const talking = s.speaker === A.a.id || A.a.talk === true;
    if (talking) {
      const w = (s.words || []).find((w) => t >= w.s && t < w.e);
      if (w || A.a.talk === true) {
        const ph = Math.sin(t * 24 + A.ph);
        mouth = ph > 0.3 ? 1 : ph > -0.3 ? 0.5 : 0;
      }
    }
    const bp = 2.9 + (A.ph % 1) * 1.6,
      bt = (t + A.ph * 3) % bp; // own blink rhythm per character; every 3rd blink is a double; a blink also covers every expression change (hides the face swap)
    const blink = bt < 0.11 || (Math.floor((t + A.ph * 3) / bp) % 3 === 0 && bt > 0.26 && bt < 0.36) || st.xt < 0.1;
    const wd = mouth > 0 ? (s.words || []).find((w) => t >= w.s && t < w.e) : null; // face v2: eye gaze, brows, tears, vowel mouth (engine/characters/face/face2.js); undefined = plain atlas face
    setFace(
      ch,
      st.expr,
      mouth,
      blink,
      faceOptions({
        A,
        s,
        st,
        t,
        lt,
        subj,
        cam: state.camera.position,
        resolveAt,
        style: state.TL.style,
        mouth,
        word: wd,
        expr: st.expr,
      }),
    );
  });
  finishLinks(s, lt, LK); // arm IK of links and `reach` (after applyPose, before held props)
  // props (held in hands or placed)
  // head layers: hair settles under whatever each actor wears right now (layers.js)
  s._actors.forEach((A) => {
    if (A.ch.creature) return;
    const w = [
        ...new Set([
          ...A.ch.worn,
          ...s._props
            .filter((P) => P.worn && P.head && P.wearer === A.ch && lt >= P.t0 && lt < P.t1)
            .map((P) => P.p.type),
        ]),
      ].sort(),
      key = w.join('+');
    if (key && !state.COVERS[key]) state.COVERS[key] = mergeCovers(w.map((t) => state.COVERS[t]));
    layerHair(A.ch, key, key ? state.COVERS[key] : null);
  });
  s._props.forEach((P) => {
    const on = lt >= P.t0 && lt < P.t1;
    P.o.visible = on;
    if (!on) return;
    const pop = P.p.pop ? Math.min(1, smooth(clamp01((lt - P.t0) / 0.25)) * 1.15) : 1;
    if (P.worn) {
      P.o.scale.setScalar(pop * P.fit);
      if (!s._actors.some((x) => x.a.id === P.p.hand)) P.o.visible = false;
      return;
    }
    if (P.p.hand) {
      const A = s._actors.find((x) => x.a.id === P.p.hand);
      if (A && !A.ch.creature) holdProp(P, A, lt, pop);
      else P.o.visible = false;
      return;
    }
    if (P.p.under) {
      const A = s._actors.find((x) => x.a.id === P.p.under);
      if (A) P.o.position.set(A._st.pos.x + (P.p.dx || 0), A._st.pos.y + (P.p.y || 0), A._st.pos.z + (P.p.dz || 0));
    } // rides under an actor's feet
    else if (P.p.drift)
      P.o.position.set(
        (P.p.at?.[0] || 0) + P.p.drift[0] * lt,
        Math.max(P.p.floor ?? -1e9, (P.p.y || 0) + P.p.drift[1] * lt),
        (P.p.at?.[1] || 0) + P.p.drift[2] * lt,
      ); // floor: it stops there (a box landing)
    if (P.o.userData.tick) P.o.userData.tick(lt - P.t0);
    if (P.p.shrink) P.o.scale.setScalar(Math.max(0.05, (P.p.scale || 1) * (1 - P.p.shrink * Math.max(0, lt - P.t0)))); // melts away at shrink x (fraction of its size) per second
    if (P.p.spin) P.o.rotation.y = lt * P.p.spin;
    if (P.p.bob) P.o.position.y = (P.p.y || 0) + Math.sin(lt * 3) * P.p.bob;
    if (P.p.pop) P.o.scale.setScalar((P.p.scale || 1) * pop);
  });
  // fx follow anchor actor
  s._fx.forEach((F) => {
    const on = lt >= F.t0 && lt < F.t1;
    F.fx.obj.visible = on;
    if (!on) return;
    if (F.f.on) {
      const A = s._actors.find((x) => x.a.id === F.f.on);
      if (A) {
        const sc = A.ch.spec.scale || 1;
        F.fx.obj.position.copy(A._st.pos);
        if (F.f.type === 'timer' || F.f.type === 'label' || EMOTES.has(F.f.type)) {
          F.fx.obj.position.y += (A._st.p.y || 0) * sc;
          F.fx.obj.scale.setScalar(sc);
        }
      }
    } else if (F.f.pos) F.fx.obj.position.set(...F.f.pos);
    F.fx.update(lt - F.t0, state.camera);
  });
  updateExtras(s, t);
  cameraAt(s, lt, view);
  // sun follows camera focus for crisp shadows
  const fwd = V();
  state.camera.getWorldDirection(fwd);
  const focus = state.camera.position.clone().add(fwd.multiplyScalar(14));
  focus.y = 0;
  // shadow map covers only what the shot shows (in steps, so it does not shimmer during a push): sharp contact shadows in close-ups
  const hiY = Math.max(0, ...s._actors.map((A) => A._st.pos.y)); // airborne actors throw their shadow far from their feet: widen the map so it is not clipped into a hard-edged rectangle
  const sz = Math.min(
      64,
      Math.max(16, Math.ceil((state.camera.position.distanceTo(state.camLook) * 1.2 + 6 + hiY * 0.8) / 8) * 8),
    ),
    sc = state.sun.shadow.camera;
  if (sc.right !== sz) {
    sc.left = sc.bottom = -sz;
    sc.right = sc.top = sz;
    sc.updateProjectionMatrix();
  }
  // snap the light to whole shadow texels: the shadow edges stop crawling while the camera pushes / orbits
  const tx = (2 * sz) / state.sun.shadow.mapSize.x,
    fx = focus.dot(LX),
    fy = focus.dot(LY);
  focus.addScaledVector(LX, Math.round(fx / tx) * tx - fx).addScaledVector(LY, Math.round(fy / tx) * tx - fy);
  state.sun.position.copy(focus).add(SUN_OFF);
  state.sun.target.position.copy(focus);
  updateLiving(s, t, focus);
  if (s._set.userData.ticks) for (const f of s._set.userData.ticks) f(t); // animated parts of a set (water, waterfall, flames): a world pushes functions of time into group.userData.ticks
  const wf = updateWeather(s, lt, t, focus, s._wxInt, idx);
  state.hemi.intensity = state.baseHemi * (1 + wf.flash * 2.2);
  let skyK = 0;
  if (s._skyB) {
    skyK = smooth(clamp01((lt - s._skyT) / (s.skyTo.dur || 1.2)));
    if (state.LB) {
      state.sun.color.copy(state.LA.sunC).lerp(state.LB.sunC, skyK);
      state.sun.intensity = state.LA.sunI + (state.LB.sunI - state.LA.sunI) * skyK;
      state.hemi.color.copy(state.LA.hemiC).lerp(state.LB.hemiC, skyK);
      state.hemi.intensity = (state.LA.hemiI + (state.LB.hemiI - state.LA.hemiI) * skyK) * (1 + wf.flash * 2.2);
      if (state.scene.fog && state.LA.fogC) state.scene.fog.color.copy(state.LA.fogC).lerp(state.LB.fogC, skyK);
    }
  } // the sky changes mid-scene (skyTo): picture, light and fog cross-fade together
  updateSky(state.camera, skyK);
  {
    const g0 = GRADES[s.grade ?? state.TL.style?.grade ?? (AAA() ? 'vivid' : 'none')] || GRADES.none,
      g1 = s.gradeTo ? GRADES[s.gradeTo.grade] || g0 : null,
      gk = g1 ? smooth(clamp01((lt - resolveAt(s.gradeTo.at, s)) / (s.gradeTo.dur || 1.2))) : 0,
      mx = (a, b) => a + (b - a) * gk;
    const g = g1
      ? {
          sat: mx(g0.sat, g1.sat),
          con: mx(g0.con, g1.con),
          vig: mx(g0.vig, g1.vig),
          ca: mx(g0.ca, g1.ca),
          tint: g0.tint.map((v, i) => mx(v, g1.tint[i])),
          lift: g0.lift.map((v, i) => mx(v, g1.lift[i])),
        }
      : g0;
    let rays = 0,
      uv = null;
    if (s._sky && !s._wxInt) {
      const ca = skyCfg(s._sky),
        cb = s._skyB ? skyCfg(s._skyB) : ca,
        p = state.camera.position.clone().addScaledVector(LZ, 800).project(state.camera);
      rays = ((ca.rays || 0) + ((cb.rays || 0) - (ca.rays || 0)) * skyK) * (s.rays ?? state.TL.style?.rays ?? 1);
      if (p.z > 1 || p.z < -1) rays = 0;
      else {
        uv = new THREE.Vector2(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
        rays *= clamp01(1.9 - Math.hypot(p.x, p.y) * 0.9);
      }
    } // light shafts only while the sun is in or near the frame
    setGrade(state.grade, g, uv, rays);
  }
  if (state.bokeh) {
    const ap = view.camera.dof ?? DOF[view.shot || 'medium'] ?? 0;
    state.bokeh.enabled = ap > 0;
    state.bokeh.uniforms.focus.value = state.camera.position.distanceTo(state.camLook);
    state.bokeh.uniforms.aperture.value = ap * 0.001 * (state.TL.style?.dof ?? 1);
  }
  state.bloom.strength =
    s.set === 'map' || s.set === 'kit'
      ? (s.bloom ?? 0.12)
      : (s.bloom ?? (s.time === 'night' || s.time === 'spooky' ? 0.6 : (state.TL.style?.bloom ?? 0.35)));
  {
    const PP = s._props.find((P) => P.portal && P.o.visible);
    if (PP) drawPortal(PP);
  }
  state.composer.render();
  return s;
}

// Motion blur: average n renders spread over the shutter (fraction of the frame interval, .5 = 180 deg), all inside the
// current scene so a cut stays a hard cut. Captions/overlays are drawn once on top and stay sharp. n = 1: no blur.
export function frame(t, n = 1, shutter = 0.5) {
  const s0 =
    state.TL.scenes.find((s) => t >= s.start && t < s.start + s.dur) || state.TL.scenes[state.TL.scenes.length - 1];
  const v0 = viewOf(s0, t - s0.start),
    a = s0.start + v0.t,
    b = a + v0.dur - 1e-4; // sub-frames stay inside the shot: every cut is a hard cut
  {
    const vl = t - a,
      c = v0.camera;
    if (n > 1 && ((c.whip && vl < 0.26) || (c.whipOut && vl > v0.dur - 0.18))) {
      n *= 3;
      shutter = 1;
    }
  } // whip pans: a full-frame smear needs many more samples than ordinary motion
  for (let j = 0; j < n; j++) {
    const tj = n > 1 ? Math.max(a, Math.min(b, t + (((j + 0.5) / n - 0.5) * shutter) / state.TL.fps)) : t;
    state.sun.shadow.needsUpdate = j === 0 || j === n >> 1;
    render3D(tj);
    state.cg.globalAlpha = 1 / (j + 1);
    state.cg.drawImage(state.renderer.domElement, 0, 0);
  }
  state.cg.globalAlpha = 1;
  const s = s0;
  drawWeather2D(state.cg, state.W, state.H);
  drawOverlays(state.cg, state.W, state.H, s, t - s.start, t, state.TL);
  drawCaptions(state.cg, state.W, state.H, t, state.TL);
}

export function grab(q = 0.9) {
  return state.comp.toDataURL('image/jpeg', q);
}
