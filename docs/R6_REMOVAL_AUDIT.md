# R6 removal audit

Read-only audit (2026-11-13). Scope: everything that is specific to the legacy Roblox R6 rig. The R15 rig is the default (`pipeline/shorthand.py` sets `rig: "r15"` on every cast member without `rig`; `style.rig: "r6"` is the only way back). Line numbers refer to the files as they are now.

Action legend: **delete** = dead once R6 is gone; **migrate** = code is R6-named but used by R15 too, move it to a shared module first; **keep** = shared or still needed by R15 (legacy 6-joint data format, adapter), do not touch in the R6 cleanup.

## 0. Key finding: the R6 rig is not a separate module

`engine/rig.js` is not only the R6 builder. Several of its exports are used by the R15 path, so deleting the file, or `buildR6` alone, breaks R15:

| export | used by |
|---|---|
| `RIM`, `rimify` (via RIM) | `engine/r15.js` L7, `engine/r15_skin.js` L8, `engine/character.js` L2/L6 -> `engine/world.js` L3, L547 |
| `HEAD_R`, `HEAD_H` | `engine/layers.js` L8, `engine/r15_attach.js` L7 |
| `buildHeadgear` | `engine/r15_attach.js` L7, L24 (R15 hair / hats / glasses) |
| `faceTexture` (atlas v1) | `engine/character.js` L15 `setFace` (both rigs) |
| `faceTexture2` | `engine/character.js` L13 (both rigs) |
| `loadAtlas` | `engine/world.js` L134 (both rigs) |
| `loadHairLib` (inside `loadAtlas`) | `buildHeadgear` -> `rbxHair` fallback `HAIR[id]` (both rigs) |
| `preloadHair`, `hairStyles` | `engine/world.js` L156, L464 (both rigs) |
| `preloadClothes` | `engine/world.js` L152 only (R6 path; R15 has its own loader, see below) |
| `buildR6` | `engine/character.js` L9 only |
| `headRadius`, `HEAD_C` | internal (`headGeometry`, `faceGeometry`, `buildExtras`, `buildR6`) |

Recommended first step: move the shared parts (RIM / rimify, HEAD_* constants, plastic / fabric / gold / mesh helpers, buildHeadgear and everything it calls, face atlas functions, hair library loader) into a new module (for example `engine/headgear.js` and `engine/face.js`), update the 6 importers, verify, and only then delete R6 code from `rig.js`.

## 1. engine/rig.js (331 lines)

| file | symbol or lines | R6-specific what | action | risk note |
|---|---|---|---|---|
| engine/rig.js | L9-10 `HEAD_R, HEAD_H, HEAD_C, BEV` | R6 head proportions (0.64 / 1.24), `HEAD_C` only used by `buildR6` L325 | migrate `HEAD_R/HEAD_H` (shared), delete `HEAD_C` with buildR6 | layers.js and r15_attach.js import HEAD_R/HEAD_H; removing them breaks R15 |
| engine/rig.js | L26-31 `RIM`, `rimCompile`, `rimify` | none (shared shader) | migrate | used by R15 materials and world.js L547 |
| engine/rig.js | L33-36 `fabric`, `plastic`, `gold`, `shade`, `mesh` | none (shared helpers, caches MC/GC) | migrate with buildHeadgear | used by hair, hats, extras |
| engine/rig.js | L43-62 `headRadius`, `headGeometry`, `faceGeometry` | R6 rounded-cylinder head and decal patch | delete `headGeometry`, `faceGeometry`; keep `headRadius` if buildExtras (L243 `onFace`) stays | R15 has its own face patch in engine/r15.js L56 (same idea, R15 fit) |
| engine/rig.js | L65-79 `HAIR`, `loadHairLib` (`/assets/roblox/hair.obj`) | loads the Roblox hair OBJ library (2.2 MB) | keep (shared), migrate with hair code | **not R6-only**: `rbx:<id>` hair of the current cast (milo, zoe, jay, mia, mom, dad ...) resolves through `HAIR[id]` for R15 too. `loadAtlas` (L100) calls it, so it runs on every render |
| engine/rig.js | L82-99 `STYLE`, `STYLE_CFG`, `preloadHair`, `hairStyles`, `rbxHair` | none (new per-style hair from `assets/roblox/hair/`) | keep | shared |
| engine/rig.js | L100 `loadAtlas` | calls `loadHairLib()` | keep, but split the hair call out if the library is later removed | removing the hair call silently breaks rbx hair on R15 |
| engine/rig.js | L101-117 `CELL`, `EXPR` | face atlas cell table | keep (shared) | **lint.py L17** parses `EXPR` keys with a regex on rig.js: moving the table requires updating that line, or lint checks expressions against an empty set |
| engine/rig.js | L120-138 `paintAtlas`, `faceTexture` | atlas v1 face painting (not R6-only) | keep | `setFace` uses it for both rigs |
| engine/rig.js | L143-168 `EYEK`, `OVAL`, `faceTexture2` | face v2 (not R6-only) | keep | both rigs |
| engine/rig.js | L171-224 `strand`, `hairCap`, `VOL`, `buildHair` (`B()` uses `cz = 4.62`) | hair authored in R6 head-centre coordinates | keep (shared); R15 maps it through `fitSpace` | coordinates are R6 head space on purpose: changing them shifts all hair |
| engine/rig.js | L227-239 `buildHat` | hats in R6 head space | keep (shared) | R15 hats go through `fitSpace` |
| engine/rig.js | L241-250 `buildExtras` (glasses, shades, mustache, beard) | uses `headRadius`, `FACE_SPAN` | keep (shared) | not the same as world.js `buildExtras` (NPC pool), do not confuse them in grep |
| engine/rig.js | L254-258 `CLOTH`, `isRbx`, `preloadClothes` | classic clothing loader for R6 | delete | R15 loads its own clothing (engine/r15_skin.js L81-90 `clothImage`, own cache). Only caller: world.js L152 |
| engine/rig.js | L259-262 `T_TORSO`, `T_RIGHT`, `T_LEFT` | R6 box face regions of the 585x559 template | delete | duplicated in engine/r15_skin.js L36-44 (`TPL`, `remapGeometry`), which is the R15 copy |
| engine/rig.js | L263-266 `clothBox` | R6 box UVs | delete | none |
| engine/rig.js | L267-277 `dressRbx` | wraps classic clothing on R6 boxes | delete | called only from buildR6 L330 |
| engine/rig.js | L278-282 `buildHeadgear` | hair + hat + extras into a head-centre group, shared | keep (move) | used by r15_attach.js L24 |
| engine/rig.js | L283-331 `buildR6` | the whole R6 character: torso, arms, legs, head, details, skirt/shorts/pants bottom, outfit details | delete | R15 details were already ported in engine/r15_skin.js L112-175 (`buildSkin`), so buildR6 is not the reference anymore. Check `stories/_r15skin` after deletion |

## 2. engine/character.js (115 lines)

| file | symbol or lines | R6-specific what | action | risk note |
|---|---|---|---|---|
| engine/character.js | L2 import of `buildR6`, `preloadClothes` | R6 builder and clothing loader | delete the two names | |
| engine/character.js | L6 `export { ..., preloadClothes }` | re-export used by world.js L3 / L152 | delete `preloadClothes` | |
| engine/character.js | L9 `spec.rig === 'r15' ? buildR15 : buildR6` | R6 is the fallback when `spec.rig` is missing | delete the R6 branch: `buildR15(spec)` | **behaviour change for every caller that passes no `rig`** (crowd/NPC code and direct engine calls). Today those are R6. The pipeline already sets r15 (shorthand.py L175) |
| engine/character.js | L11-16 `setFace` | shared; `ch.face` on both rigs | keep | |
| engine/character.js | L20-42 `S, PI, spr, ease, LEG=2, HELD, DATA, J, sample` | legacy 6-joint pose format (`la ra ll rl hd ts`), `LEG = 2` (R6 leg length) | keep | the legacy format is the input of `legacyToR15` for every anim without a native twin |
| engine/character.js | L44-92 `pose()` (switch of ~45 procedural anims: walk, run, talk, wave, cheer, sit, glide, swim...) | authored in the 6-joint R6 format | keep | **must stay**: ~45 anims are authored in this dict. R15 characters get them through `legacyToR15` (r15.js L131). Migrating them is an authoring task, not a deletion |
| engine/character.js | L27-33 `registerAnims` / `NATIVE` / `DATA` | loads `config/anims*.json`; `rig: 'r15'` native entries and `@r15` twins | keep; the `@r15` suffix branch can go after `rbx_anim.py finalize` | |
| engine/character.js | L95-103 `blendPose`, `blendPoseLag` | shared | keep | |
| engine/character.js | L104 `applyPose` R15 line | `applyPose15` / `legacyToR15` | keep | |
| engine/character.js | L106-114 `applyPose` R6 path (armL/armR/legL/legR/head/torso/body rotations, body lean/squash) | writes R6 block rotations | delete after every character is R15 | the R15 path needs no R6 fields |

## 3. engine/r15.js, r15_skin.js, r15_attach.js, anim15.js, skeleton.js (R15 side)

| file | symbol or lines | R6-specific what | action | risk note |
|---|---|---|---|---|
| engine/r15.js | L7 `import { RIM } from './rig.js'` | depends on rig.js for the shader | migrate (import from shared module) | |
| engine/r15.js | L56-80 own face patch | same idea as rig.js `faceGeometry` for R6 | keep (becomes the only face) | |
| engine/r15.js | L81-82 legacy aliases `armL: J.RightShoulder, armR: J.LeftShoulder, legL: J.RightHip, legR: J.LeftHip` | names kept for R6 code | keep for now | links, wear, crowd, world still read `armL/armR/legL/legR/torso/body` on R15. Renaming them is a separate task |
| engine/r15.js | L131 `legacyToR15` | adapter from the R6 6-joint format | keep | needed until every anim has a native twin |
| engine/r15_skin.js | L8 `import { RIM } from './rig.js'` | | migrate | |
| engine/r15_skin.js | L36-44 `T_TORSO`, `T_LEFT`, `T_RIGHT`, `TPL`, `GROUP` (maps to `armL/legL` names) | copy of R6 template tables; `GROUP` uses legacy aliases | keep | after rig.js cleanup this is the only copy: point the comment at it |
| engine/r15_skin.js | L81-90 `clothImage` | own loader for `rbx:` clothes | keep | this is why `preloadClothes` (rig.js) is not needed for R15 |
| engine/r15_skin.js | L112-175 details (collar, buttons, tie, hood...) | ported from `buildR6` (comment L112) | keep | update the comment after buildR6 is deleted |
| engine/r15_skin.js | L99 `HEAD_SCALE = 1.1` | R15 head vs R6 head, not R6 code | keep | |
| engine/r15_attach.js | L7 imports `buildHeadgear, HEAD_R, HEAD_H` | R6 head box used to fit the R15 head (`fitSpace`) | migrate the imports | R15 hair / hats depend on the R6 head proportions by design (`fitSpace`, L13-24) |
| engine/r15_attach.js | L32 `R6_ATT` (R6 attachment points) and L28-36 `slotSpace15` | wearables.json data is stored relative to the R6 part with the R6 attachment baked in | keep | deleting it means re-baking `config/wearables.json`. Large, separate task |
| engine/anim15.js | L5 `legacyToR15, R15_JOINTS`; L33-45 `snapLegacy`, `natOf`, `toLegacyKey` | legacy bridge | keep | `toLegacyKey` gives the R6 fallback for native-only entries (crowd, links) |
| engine/skeleton.js | comments L7 "like the legacy rig's armL" | comment only | keep | |

## 4. engine/links.js (223 lines)

| file | symbol or lines | R6-specific what | action | risk note |
|---|---|---|---|---|
| engine/links.js | L20 `is15` | gate for R15 branches | keep, becomes always true; then simplify | |
| engine/links.js | L21 `headY` fallback `: 4.6` | R6 head centre | delete the R6 branch | R15 4.87 is the only value needed |
| engine/links.js | L22 `hipOf` fallback `: 2` | R6 hip height | delete the R6 branch | |
| engine/links.js | L35-60 `limbOf`, `solve2` | R15 2-bone IK (already R15-only) | keep | |
| engine/links.js | L64-67 `armToward` R6 path (box arm turned and stretched: `ch.armL`, `ch.body.worldToLocal`, `arm.scale.y`) | R6 arm block | delete | |
| engine/links.js | L71 `shoulderW` R6 side (`ch.armL/armR`) | R6 | simplify to the joint world position | |
| engine/links.js | L83 `tp()` R6 side `ch.torso.localToWorld` | R6 torso frame | delete the R6 branch | |
| engine/links.js | L91-123 `MODES` (R6 table) and L158 `M0 = MODES[l.mode]` / `is15 ? MODES15 : M0` | R6 link anchors (shoulders, hips tuned for R6) | delete `MODES`; keep `MODES15` as the only table | pairs of R6 actors are gone with the rig |
| engine/links.js | L184 `C.ch.torso.getWorldQuaternion` (torso kind) | on R15, `ch.torso` is the UpperTorso node, not the R6 hip pivot | keep, verify | semantic change already happened; check `stories/_r15links` |
| engine/links.js | L209 `resetIK` (`armL.scale.y`, `_armS`) | R6 stretch of the box arm | delete | only R6 `armToward` sets `_armS` |
| engine/links.js | L198 `ks.head = headSpace...` | shared | keep | |

## 5. engine/world.js (647 lines)

| file | symbol or lines | R6-specific what | action | risk note |
|---|---|---|---|---|
| engine/world.js | L3 imports `preloadClothes` | R6 clothing loader | delete the name | |
| engine/world.js | L152 `await preloadClothes(...)` for `rbx:` shirts and pants | only the R6 path used it | delete | R15 clothing loads lazily and repaints (r15_skin `clothImage`). Check `stories/_r15skin` clothing still shows |
| engine/world.js | L156 `preloadHair` / L464 `hairStyles` | shared | keep | |
| engine/world.js | L320 `headPos` fallback `V(0, 4.6, 0)` | R6 head height | migrate to `headY` / R15 value | only when the actor is missing; still a hard-coded R6 number |
| engine/world.js | L343 shot look `headY(A.ch) : 4.6` | R6 fallback | delete the fallback | |
| engine/world.js | L426-434 `carryArm`, `armTip` | R6 arm block: rotates `arm.rotation`, reads tip from `localToWorld(0,-1.5,0)` | delete | |
| engine/world.js | L436-441 `holdProp` | L439 R15 branch (`carryHands15`) is kept; L440-441 R6 branches (`two`, single arm via `ch.armL/armR`) | delete L440-441 | `P.G.two`, `inward`, `grip` stay (shared GRIP data) |
| engine/world.js | L456-457 `npcR15()` / `style.npcRig` ('r6' forces legacy) | R6 NPC option | delete the `'r6'` option; default always R15 | `style.npcRig` in any story JSON would stop meaning anything (none found in 60 stories) |
| engine/world.js | L460-465 `buildExtras` (`rig: 'r15'` only if `npcR15()`) | R6 NPC pool when not R15 | pass `rig: 'r15'` unconditionally, drop `shareMats` gate | `shareMats` (L457-458) stays, it is generic |
| engine/world.js | L547 `RIM.k.value`, `RIM.color` | shared rim uniforms | keep (import from new module) | |
| engine/world.js | L587-589 layers (`layerHair`) | shared | keep | |

## 6. Other engine files

| file | symbol or lines | R6-specific what | action | risk note |
|---|---|---|---|---|
| engine/wear.js | L20 `partSpace`, R6 branch: `ch.torsoSpace` at y = 1 under `ch.torso` | R6 torso box centre | delete the branch; keep the `ch.rig === 'r15'` branch (L19) | the R15 branch is the only one left. Update the comment at L1-2 ("R6 rig") |
| engine/wear.js | L14-19 wear loader, `wearInfo`, `makeWear` | shared | keep | |
| engine/layers.js | L8 `import { HEAD_R, HEAD_H } from './rig.js'` | R6 head size used for the cover map | migrate the import | hair layering is head-space, shared with R15 (fitSpace) |
| engine/face2.js | L133 `toward()` `hy = st.pos.y + ((st.p.y || 0) + 4.6) * scaleA` | **hard-coded R6 head height in the gaze code** | migrate: pass `headY(ch)` | **live R15 bug today**: R15 head centre is 4.87, so auto-gaze aims ~0.27 units low on R15. Fix before deleting R6 so outputs do not shift silently |
| engine/face2.js | L146 `headPos` `(B._st.p.y + 4.6)` | same R6 constant | migrate | same as above |
| engine/props.js | L74-80 `mob` (instanced boxes, watch / flee / gather / cheer) | generic blocks, no rig dependency | keep | not R6 code; only the name suggests it |
| engine/crowd.js | whole file | no R6 code; calls `pose()` / `blendPose()` | keep | the NPC rig choice is in world.js |
| engine/creatures.js, sets.js, worlds.js, modelprops.js, overlay.js, quarks.js, weather.js, sky.js | none | no R6 references found | keep | |

## 7. pipeline/ (Python)

| file | symbol or lines | R6-specific what | action | risk note |
|---|---|---|---|---|
| pipeline/shorthand.py | L175 `rig` default: `story.style.rig` then `"r15"`; cast `"rig"` override | the `style.rig: "r6"` switch and per-cast `rig` keys (`milo15` pattern) | delete the `style.rig` path and the `rig` override; always set `rig: "r15"` (or drop the key, engine default is then R15) | silent: a story with `style.rig: "r6"` would still build R15 once the engine branch is gone. None in the 60 stories today |
| pipeline/lint.py | L16 `@r15` strip in anim names | suffix | keep until finalize, then delete | harmless |
| pipeline/lint.py | L17 `EXPRS = set(re.findall(r"(\w+): \['", rig.js))` | regex on rig.js for expression names | migrate the path to the new face module | if `EXPR` moves and this line is not updated, expression lint silently checks nothing |
| pipeline/rbx_anim.py | L18-19, L21-23 header docs (R15 retargeted to R6, ELBOW/KNEE sharing) | describes legacy R6 conversion | update docs | |
| pipeline/rbx_anim.py | L39 `OUT = config/anims_roblox.json`, L208-226 `rd()` / `wr()` | legacy file writer | delete after finalize | |
| pipeline/rbx_anim.py | L94 `ELBOW = 0.4`, L98-120 `key_state` default `rig='R6'` and its R6 folding (arm / leg with ELBOW / KNEE) | legacy R6 retarget of R15 clips | delete the legacy branch; keep the R15 path | |
| pipeline/rbx_anim.py | L132-183 `convert()`, L184-197 `expand()`, legacy `add` / `remove` / `preview` / `show` / `list` commands (L368-375) | write legacy R6 entries | delete | keep `native`, `native-all`, `finalize` |
| pipeline/rbx_anim.py | L239 `R6MAP`, L242-255 `key_state15` (`R6` source clips mapped to joints) | used by native conversion of R6 clips inside `anims_r15.json` ("src": "R6") | keep | these are provenance labels, the conversion is still needed to regenerate |
| pipeline/rbx_anim.py | L338-355 `finalize()` | deletes legacy twins of every `@r15` entry and strips the suffix (119 in anims_roblox.json, 12 in anims_hand.json) | run once, after backup | irreversible in the repo; regenerate needs `cache/rbx_anim/`. Dry run first |
| pipeline/_animgen_check.py L6, pipeline/_animtest_gen.py L3 | open `config/anims_roblox.json` directly | scratch checks | delete | |
| pipeline/_animsheet.py | not checked in detail | scratch | check, probably delete | |
| pipeline/r15_hand.py | whole file | writes native R15 anims (`@r15`) | keep | |
| pipeline/roblox_wear.py L5 | docstring "centre of the R6 part" | wearables data is R6-space on purpose | keep; reword docstring | |
| pipeline/roblox_hair.py, catalog.py L50 | hair styles / docs | shared | keep | |
| pipeline/produce.py, tts*.py, audio.py, studio*.py, catalog.py, polyfork.py, rbxmesh.py, download_catalog_models.py | none | no R6 references | keep | |

## 8. config/ (JSON)

| file | symbol or lines | R6-specific what | action | risk note |
|---|---|---|---|---|
| config/anims_roblox.json | whole file: 119 legacy entries (R6 6-joint), `_doc`, `_sources` | every entry has an `@r15` twin in anims_r15.json | delete after `rbx_anim.py finalize` (the finalize removes all 119 twins, leaving the file empty) | the legacy entries are the only source of the R6 pose of these clips until the native twin is verified in stories |
| config/anims_hand.json | 23 entries: 12 have `@r15` twins (in anims_r15_hand.json), 11 legacy-only (reach_down, panic, scream_run, lift_heavy, stumble, shrug_big, duck, dive_forward, look_around, throw, exhausted_walk) | legacy 6-joint | keep the 11 legacy-only entries; finalize drops the 12 twins | legacy-only ones reach R15 via `legacyToR15` |
| config/anims.json | 5 legacy-only: salute, nod, headshake, stomp, beg | legacy 6-joint keyframes | keep (migrate later) | no native twin |
| config/anims_interact.json | 9 legacy-only: carrying_shoulder, carried_shoulder, carrying_back, carried_back, carrying_cradle, cradled, hugging, carrying_drag, dragged | legacy 6-joint poses used by links.js | keep (migrate later) | `links.js` `MODES15` runs them through the adapter; no native twin |
| config/anims_r15.json | 119 `@r15` native entries, `"src": "R6"` labels on several (provenance only) | native | keep | `_sources` records the origin |
| config/anims_r15_hand.json | 12 native `@r15` | native | keep | |
| config/cast.json | cast presets, no `rig` key | none (presets are rig-agnostic) | keep | |
| config/roblox_cast.json | `milo`, `zoe`, `jay` with 4 catalog ids each | input of studio/export_cast.luau (R6 dressed exports) | delete | |
| config/roblox_hair.json | `hair` (11 ids, slot index into hair.obj), `styles` (18) | `_note` L15 refers to hair.obj coordinates (R6 head) | keep | shared |
| config/roblox_clothes.json | `shirts` (13), `pants` (9) | classic clothing, used by r15_skin | keep | not R6-only |
| config/wearables.json | 11+ items, slots hat/face/neck/back, data relative to R6 parts | R6 attachment space baked in | keep | see r15_attach.js `R6_ATT` |
| config/creatures.json, locations.json, model_props.json, skies.json, voices.json, weather.json, pronunciations.json | none | no R6 references | keep | |

## 9. studio/ (Luau) and assets/

| file | symbol or lines | R6-specific what | action | risk note |
|---|---|---|---|---|
| studio/export_cast.luau | L1, L16 `HumanoidRigType.R6` | builds R6 dressed rigs for .obj export (milo, zoe, jay) | delete (with config/roblox_cast.json and the three .obj) | |
| studio/sandbox.luau | L1, L13 `HumanoidRigType.R6` | R6 sandbox test scene | delete | |
| studio/export_hair.luau | L1-12 builds hair on a classic R6 head, exports `assets/roblox/hair.obj` | R6 head fit | keep | hair.obj feeds `loadHairLib` for the current cast. Only remove once every `rbx:` hair id has a style in `assets/roblox/hair/` |
| studio/export_anim.luau L4, L29 and studio/export_anim_module.luau L15 | default label `rig = "R6"`; ORDER15 for R15 | both rigs supported | keep | the R6 branch is input for R6 source clips only |
| studio/cast_test.luau L20, runtime.luau L66, export_r15.luau, build_r15.py | R15 | R15 | keep | |
| assets/roblox/milo.obj (546 KB), milo.mtl, jay.obj (182 KB), jay.mtl, zoe.obj (572 KB), zoe.mtl | R6 character exports | not referenced by engine, pipeline or config (grep found only the self `mtllib` line in milo.obj). publish/ and docs were not fully searched (grep timed out) | delete after a quick check of publish/ and docs | |
| assets/roblox/hair.obj (2.2 MB), hair.mtl, Hair*_diff.png (11), Handle1_diff.png | Roblox hair library | loaded by `loadHairLib` (rig.js L69) for `rbx:<id>` hair of R15 characters too | keep until hair styles cover all ids | biggest asset of the R6 path, but shared |
| assets/roblox/hair/ (36 files) | per-style hair (roblox_hair.py) | shared, both rigs | keep | |
| assets/roblox/clothes/ (22 png) | classic shirts / pants | used by R15 loader (r15_skin `clothImage`) | keep | do not delete as R6 |
| assets/roblox/wear/ (22 files) | accessories (wear.js) | shared; attachments in R6 space | keep | |
| assets/models/rigs/r15/ | R15 rig data | R15 | keep | |

## 10. stories/ (R6 comparison tests)

| file | symbol or lines | R6-specific what | action | risk note |
|---|---|---|---|---|
| stories/_r15test/story.json | cast `["milo", {"milo15": {"like": "milo", "rig": "r15"}}]` | meant as legacy milo vs R15 milo; milo has no `rig` key, so **both are R15 now** (shorthand default) | delete the test (or make it R15-only) | the comparison is silently broken today |
| stories/_r15skin/story.json | cast `cl6` and `tpl6` (no `rig`, so R15 now), scene titles L95 "R6 vs R15 classic" and L182 "close milo R6" | R6 twins were the comparison | delete the R6 twins and those scenes | same silent problem |
| stories/_r15attach/story.json | cast entries with `"rig": "r15"`; docs say "R6 on the left" | comparison | check: any entry without `rig` is now R15 | |
| stories/_r15links, _r15anim (gen.py) | `rig: "r15"` entries | R15 tests | keep | `_r15anim/gen.py` may still reference anims_roblox, check |
| other stories (about 55) | no `style.rig: "r6"` and no `npcRig: "r6"` found | production stories already render R15 | keep | nothing to change |

## 11. docs/ and AGENTS.md (text)

| file | symbol or lines | R6-specific what | action | risk note |
|---|---|---|---|---|
| docs/REFERENCE.md | L31 CHARACTER section ("classic Roblox R6 rig") and L193-197 (Roblox avatar items on the R6 rig, clothing and wear placement) | describes R6 | rewrite for R15 | |
| docs/R15.md | L3, L7 ("legacy R6 rig", "temporary key until R6 is removed"), L25-26, L137, L139, L154, L156, L166, L186-190, L201-203 | describes R15 next to R6 | update after each step; remove the temporary-key text at the end | the file is the contract for later phases |
| docs/ROBLOX_ANIMATIONS.md | L3, L19, L25, L35, L38, L40 | R6 conversion of Roblox clips | rewrite for native conversion | |
| AGENTS.md | L80 ("R15 ones retargeted to our R6 rig", `anims_roblox.json`) | outdated | update | |
| docs/AAA_PLAN.md (Portuguese planning doc) | L30, L48, L57, L84, L88 ("R6 blocado", "O rig R6 nao precisa virar R15") | historical decision | mark as superseded, keep | |
| CLAUDE.md, GEMINI.md, README.md | no R6 mention found | | keep | |

## 12. Cleanup plan (ordered)

Each step ends with the same verification: `python pipeline/lint.py` on every story (no new warnings, and the expression check still lists the 40+ expressions), `python pipeline/produce.py <story> --preview` on `_r15attach`, `_r15skin`, `_r15links`, `_r15anim`, plus one production story with crowd extras, and a diff of `python pipeline/rbx_anim.py --vocab anim` (names must not change).

1. **Fix the R15 gaze bug first (face2.js L133, L146; world.js L320, L343; links.js L21).** Replace the hard-coded 4.6 with `headY(ch)`. Verify: `_r15links` gaze looks at the camera and at other actors. This changes R15 output on purpose, so compare before and after.
2. **Create a shared head / face module.** Move RIM / rimify, HEAD_R / HEAD_H, plastic / fabric / gold / mesh, `buildHeadgear` and its hair / hat / extras helpers, `faceTexture`, `faceTexture2`, `loadAtlas`, `loadHairLib`, `preloadHair`, `hairStyles`. Update the imports in character.js, layers.js, r15.js, r15_attach.js, r15_skin.js, world.js. Update lint.py L17 to the new path. Verify: all `_r15*` stories identical (frame compare), lint EXPRS count unchanged.
3. **Delete the R6 builder in rig.js.** `buildR6`, `headGeometry`, `faceGeometry`, `dressRbx`, `clothBox`, `T_*`, `CLOTH`, `preloadClothes`, `HEAD_C`. Remove the imports in character.js (L2, L6) and world.js (L3, L152). Verify: `_r15skin` (clothing and details) identical.
4. **Make R15 the engine default.** character.js L9: `buildR15(spec)` only. Remove the `'r6'` option in world.js `npcR15` and the `rig` gate in `buildExtras`. Verify: a crowd story (`crowd` key) and a story with `extras`.
5. **Delete the R6 branches in engine code.** character.js L106-114 (`applyPose` R6 path); links.js `MODES`, R6 sides of `armToward`, `tp`, `shoulderW`, `resetIK`, `hipOf` / `headY` fallbacks; world.js `carryArm`, `armTip`, holdProp R6 branches; wear.js `partSpace` R6 branch. Verify: `_r15links`, `_r15attach` (held props, wearables on torso and head).
6. **Pipeline cleanup.** shorthand.py L175: drop `style.rig` and the cast `rig` override. rbx_anim.py: back up `config/anims_roblox.json`, run `finalize` (dry run first), then delete the legacy `convert`, `add`, `remove`, `preview`, `show`, `list`, `rd`, `wr` branches. Delete `_animgen_check.py` and `_animtest_gen.py`. Verify: `--vocab anim` names unchanged, every `@r15` name still resolves.
7. **Delete R6 data and assets.** `studio/export_cast.luau`, `studio/sandbox.luau`, `config/roblox_cast.json`, `assets/roblox/{milo,jay,zoe}.{obj,mtl}` (after a grep of `publish/` and `docs/`). Verify: grep of the repo for the names returns nothing.
8. **Delete the R6 comparison stories** `_r15test` and the R6 twins in `_r15skin` (cl6, tpl6, scenes "R6 vs R15 classic" and "close milo R6"). Verify: `_r15skin` still lints.
9. **Docs.** REFERENCE.md, R15.md, ROBLOX_ANIMATIONS.md, AGENTS.md L80; mark AAA_PLAN.md superseded.
10. **Keep for later (separate tasks):** the legacy 6-joint `pose()` switch and the `legacyToR15` adapter (about 45 procedural anims and 25 legacy-only JSON anims: anims.json 5, anims_hand 11, anims_interact 9); `armL/armR/legL/legR/torso/body` aliases on R15 characters (used by links, wear, crowd, world); `hair.obj` and `export_hair.luau` until every `rbx:` hair id has a style; `config/wearables.json` and `R6_ATT` (R6-space data); `roblox_clothes` and `assets/roblox/clothes/` (used by R15 too).

## 13. Top 5 risks

1. `loadHairLib` (rig.js L69) is shared, not R6: deleting it as "R6 hair" breaks `rbx:` hair on R15 and on every render (`loadAtlas` calls it).
2. rig.js exports used by R15 (RIM, HEAD_R / HEAD_H, buildHeadgear, faceTexture, loadAtlas): deleting the file or buildR6 first breaks the R15 build. Move them first.
3. The legacy 6-joint `pose()` switch and the `legacyToR15` adapter feed about 45 procedural anims and 25 legacy-only JSON anims (links, crowds, anims.json): they look like R6 code but are the input format of R15 today.
4. Silent behaviour changes: `buildCharacter` without `spec.rig` is R6 today and becomes R15; `_r15test` and `_r15skin` R6 twins already built as R15 (no `rig` key), so the comparison is broken; face2.js gaze and the world.js / links.js fallbacks still use the R6 head height 4.6 (R15 is 4.87), a live bug on R15.
5. `rbx_anim.py finalize` deletes 131 legacy entries (119 in anims_roblox.json, 12 in anims_hand.json): back up first. lint.py L17 parses the expression table from rig.js with a regex: moving `EXPR` without updating it makes expression lint check nothing.

## Done (2026-11-13): R6 rig removed, R15 is the only character rig

Verification: baselines `out/<story>/baseline_r15.jpg` taken before any edit, SSIM re-checked after every step (all >= 0.99 except the two intentional changes below). Backups: `cache/backup_engine_pre_r6/` (engine/*.js, pipeline/*.py, rig.js.orig, R15.md.orig), `cache/backup_anims_20261113/` (anims json files).

**Moved** (engine/rig.js split, every import updated; rig.js deleted):
- `engine/materials.js`: RIM, rimify, fabric, plastic, gold, shade, rbox, mesh.
- `engine/face.js`: face atlas (`loadFaceAtlas`), CELL, EXPR, paintAtlas, faceTexture, faceTexture2. `pipeline/lint.py` L17 now reads EXPR from face.js (same 51 names as before + face2 = 61 expressions; `--vocab expr` unchanged).
- `engine/headgear.js`: HEAD_R/HEAD_H, headRadius, Roblox hair library (`loadHairLib`, HAIR), `preloadHair`, `hairStyles`, rbxHair, procedural hair / hats / glasses / beard, `buildHeadgear`. Hair data stays authored in the classic head box (fitSpace maps it onto the R15 head).
- `character.js` exports `loadAtlas()` = hair library + face atlas (same behaviour as before).

**Deleted**: `buildR6`, `headGeometry`, `faceGeometry`, `dressRbx`, `clothBox`, `T_*`, `CLOTH`, `preloadClothes` (+ its call in world.js), `HEAD_C`; R6 branch of `buildCharacter` and `applyPose`; `spec.rig`, `style.rig`, `style.npcRig` (NPC pool always R15, `shareMats` always on); `is15` and every `ch.rig === 'r15'` branch in links.js / wear.js / world.js; R6 `MODES` table of links.js (the R15 table is now the only `MODES`), R6 `armToward`, `footTo` guard; `carryArm`, `armTip` and the R6 branches of `holdProp` in world.js; R6 `partSpace` branch of wear.js; `@r15` suffix handling (character.js, lint.py, r15_hand.py).
- Pipeline: `rbx_anim.py finalize` was run (131 legacy twins removed, suffix stripped); then `config/anims_roblox.json` (now empty), `pipeline/_animgen_check.py`, `pipeline/_animtest_gen.py` and the legacy parts of `rbx_anim.py` (`convert`, `key_state`, `add/list/show/remove/preview/native-all/finalize`, `rd/wr`, `vocab`, `CAL`, `infer`) were deleted. Only `rbx_anim.py native` remains. `--vocab anim` output identical before/after.
- `shorthand.py`: no longer sets `rig` (a `rig` key in a cast spec is dropped).
- studio: `export_cast.luau`, `sandbox.luau`. config: `roblox_cast.json`. assets: `roblox/{milo,jay,zoe}.{obj,mtl}`. All grep-proven unreferenced (engine, pipeline, config, docs, stories, studio, formats, publish).
- Stories: `_r15test` and `_r15skin` converted to plain R15 tests (R6 twins and the R6 scenes removed); `"rig": "r15"` keys removed from `_r15anim`, `_r15attach`, `_r15links`, `_r15skin`, `_r15test` and `_r15anim/gen.py`. No story used `style.rig` or `npcRig`.

**Behaviour changes (intentional)**
- Gaze bug fixed: face2.js `toward` / `headPos` use the character's `rest.headCentreY` (4.87) instead of 4.6; world.js fallbacks 4.6 -> 4.87. Effect on stills is tiny (gaze is quantised): `_face2test` SSIM 0.99998.
- `mob` prop (props.js) rebuilt with R15 proportions (torso 1.94 x 2.1, legs 2.19, head centre 4.87, arms touching the torso): `_portaltest` 0.962, `_aaa_bench` 0.992 (distant crowds; stills checked by eye).
- `headY(ch)` returns 4.6 only for creature models (no R15 rest data), to keep their camera framing unchanged.

**Kept, and why**
- 6-joint pose dict + `pose()` switch + `legacyToR15` + `toLegacyKey` (about 45 procedural and 25 legacy JSON anims feed R15 through them; `LEG = 2` is the unit of that format). `armL/armR/legL/legR/torso/body` aliases on the R15 character (links, wear, crowd, world read them).
- `config/anims.json`, `anims_hand.json` (11 legacy-only), `anims_interact.json`; `anims_r15*.json` `"src": "R6"` provenance labels and the R6 source-clip mapping (`R6MAP`) in rbx_anim.py (some imported Roblox clips are R6 clips).
- `hair.obj` / `export_hair.luau` (hair library used by `rbx:<id>` hair), `config/wearables.json` + `R6_ATT` in r15_attach.js (data stored in classic part space), `roblox_clothes.json` and `assets/roblox/clothes/`, `HEAD_R/HEAD_H` (hair and hat data is authored in the classic head box), `studio/export_anim*.luau` (default label `R6` of the source clip).
- `docs/AAA_PLAN.md` marked superseded; text mentions of R6 that remain describe data spaces, source clips or sizes of the old rig.
