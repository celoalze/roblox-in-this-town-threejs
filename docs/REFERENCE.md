# Reference (long form) - read only the section you need

AGENTS.md is the working guide and is enough to write a story. This file documents every key of the long object form
(which the compact notation expands to and can be mixed with) plus engine internals.

## Compact notation
Defined in the docstring of `pipeline/story/shorthand.py` (cam / actors / sfx / fx / props strings, cast and loc presets). It expands to the long form below; both can be mixed per entry.

## Held props
`{type, hand: id, left}` (or `+prop` on the actor). The prop stays world-upright, turns with the actor, and is pushed past the tip of the arm, so it can never be upside down or inside the arm. Hanging/swinging arms blend into a carry pose; raised arms (cheer, wave, point) keep their animation. Per-prop grip, two-hand carry and held scale: `GRIP` in engine/props/props.js. `rot` turns it, `scale` overrides the held size.

## Rendering
Post chain: 4x MSAA → GTAO ambient occlusion (OFF by default since 2026-11: it draws sharp dark rectangles on the ground; `style.ao:true` turns it on, see-through meshes are left out of its depth pass) → bloom → saturation grade. Sets use procedural textures (grass, tiles, asphalt, siding, brick, shingles, wood, plaster). `tests/stories/_rigtest` = 6 s rig/lighting regression check (`--preview`, no TTS).
GPU is always used (Chrome ANGLE/D3D11 on Windows); the log prints the GPU name and warns on software rendering. `--cpu` / `RS_CPU=1` only for machines without a GPU.

## story.json
```jsonc
{
  "title": "In This Town, ...",        // metadata
  "genre": "in_this_town",            // config/formats/<genre>/ defaults + guide
  "narrator": "narrator",              // voice alias (config/voices.json): narrator, narrator_f, narrator_deep, boy, girl, man, woman, old_man, villain
  "music": "curious",                  // file in assets/audio/music (curious, tension) or synth mood: upbeat funny mystery sad tense spooky epic chill | none
  "musicVol": 0.16, "pad": 0.12,       // optional: music level, silence after each line
  "format": {"width":1080,"height":1920,"fps":30},
  "style": {"captionWords":1, "captionY":0.7, "captionSize":0.13, "uppercase":true, "emphColor":"#FFE14D", "bloom":0.35, "autoWhoosh":true, "saturation":0.14, "ao":false, "blur":8, "shutter":0.5, "tone":"neutral", "exposure":1, "rim":1, "extras":0, "motes":true, "lens":true, "handheld":1, "dof":1},  // blur = motion-blur samples per frame (1 = off; stills/preview never blur), shutter = fraction of the frame interval; tone = neutral | agx | aces (aces + exposure 1.05 = the pre-2026-11 look); rim = strength of the character-only rim glow (0 = off); extras = background walkers (0-8) in outdoor kit locations, also per scene as `"extras": N`; motes = pollen by day / fireflies by night when no weather is on; lens = per-shot field of view (extreme 34 .. establishing 58 deg, false = fixed 50); handheld = strength of the subtle operator sway (0/false = off, never on `static` moves); dof = strength of background blur on extreme/close/medium shots (false = off; per scene: `camera.dof`, 0 = all sharp, 2 = strong)
  "cast": { "<id>": CHARACTER },
  "scenes": [ SCENE, ... ]
}
```

### CHARACTER (Roblox R15 rig, engine/characters/r15.js: classic R15 head with decal faces, strand / Roblox hair, classic clothing templates; docs/R15.md)
| key | values |
|---|---|
| colors | `skin shirt pants shoes accent emblem hairColor hatColor beardColor` |
| `hair` | messy short swept spiky long bob ponytail bun pigtails afro buzz none (auto-tucks under hats) · `fringe`: 1 / -1 sweep side |
| `hair` (Roblox) | `"rbx:<id>"` = real Roblox hair mesh+texture from assets/roblox/hair.obj (preferred). Available: 7259123616 black messy (covers eyes) · 6501746646 blonde/brown long girl · 376524487 blonde spiked · 376548738 brown charmer · 376527350 black ponytail · 2956239660 long red · 63690008 pal hair · 451221329 true blue · 376526888 straight blonde · 1103003368 orange beanie+black hair · 16630147 beautiful hair. `hairTint`, `hairScale` optional. Add more: ids in config/roblox_hair.json → run tools/roblox studio/export_hair.luau via tools/assets/studio_mcp.py → user exports ExportHair as assets/roblox/hair.obj |
| `hat` | cap police crown beanie tophat hardhat headphones halo horns bow |
| `details` | crewneck collar buttons tie badge belt pocket kangaroo hood stripes heart star cuffs (list) · `tie`: color · `jacket`: color · `logo`: shirt text |
| `sleeves` / `bottom` | long short none / pants shorts skirt · `hands`: true = skin hands on long sleeves |
| `extras` / `glasses` | mustache beard glasses shades / "glasses" or "shades" |
| face | `expr` default, `lashes`, `blush` |
| other | `scale` (kids 0.8, giants 1.6) · `voice` alias for their dialogue lines |

**expr** (atlas decals): happy grin laugh sad cry angry shocked surprised scared worried nervous smug neutral sleepy confident content love evil ko · dramatic: furious determined teary heartbroken betrayed scream panic horrified awe suspicious · idle: bored skeptical curious shy pout annoyed proud relieved · comic: dizzy starstruck wink disgusted deadpan mischief sly awkward stunned hysterical silly grumpy. Atlas = 4x8 cells of 512 px; rows 4-7 come from `python assets/textures/faces/extend_faces_atlas.py` (add a cell there, then map it in `CELL`/`EXPR` in engine/characters/face/face.js: `expr: [eyes cell, closed mouth cell, talking mouth cell]`).
### SCENE
| key | values |
|---|---|
| `line` | narration text, `*word*` = emphasis. Drives scene length. Omit → set `dur`. |
| `speaker` | ONLY with `"dialogue": true` (not the default): cast id voice + mouth animation. |
| `dur` `pad` `lead` | min seconds · silence after line · silence before line |
| `set` | street city park (playground) school forest dock bedroom livingroom classroom store studio |
| `loc` | name from top-level `"locations": {"porch": {"set": "kit", "setOpts": {...}, "time": "day"}}` (preferred; set defaults to kit) |
| `set: "kit"` | Polyfork place: `setOpts {kit, near: <part key from CATALOG>, index, dx, dz (metres), yaw, at:[x,z]}`. Anchor snaps to a clear walkable spot; camera searches a clear angle. 1 m = 3.4 units |
| `setOpts` | `{label, poster, board, wall, accent, color, campfire}` (sign/board texts, colors) |
| `time` | day sunset dusk night spooky |
| `seed` | int: varies houses/trees/colors |
| `shot` | establishing wide full medium close extreme low high top ots |
| `camera` | `{target: id\|"group"\|[x,y,z], angle: deg (0=front of target, +=to its left), move: push\|pull\|orbit\|pan\|rise\|drift\|static, amount, zoom, height, shake, fov, roll, over: id (for ots), absolute:true}` |
| `punch` | true: snap-zoom in (adds whoosh) |
| `shots` | `[{at, shot, camera, punch}]`: further camera set-ups inside the scene; each cuts in at `at` (seconds, `"50%"`, `"w:word"`) and lasts until the next. The scene's own `shot`/`camera` is the first one. Extra `camera` keys (any shot): `lens` (fov that keeps the subject's size), `crash: 1`, `whip: 1\|-1`, `whipOut`, `pov: id` + `tilt`, `path: [[x,y,z],...]` (Catmull-Rom camera rail over the shot; `lookPath` optional, `ease: "linear"`), moves `fly` (`amount`, `flyTime`) and `track`. Motion blur never crosses a cut; whips get 3x samples. Compact: `"shots": ["@word close zoe crash"]` |
| `shakeAt` | time: camera shake |
| `transition` | fade white wipe (in) · `fadeOut`: true |
| `title` | top hook text (first scene) · `titleColor` `titleSize` |
| `overlay` | ["vignette","flash","red","speedlines","flashback", {type:"text",text,at,until,y,size,color}] |
| `actors` | [ACTOR] |
| `props` | [{type, at:[x,z], y, rot, scale, color, hand: id, left:true, from, until, spin, bob, pop, text,w,h,bg,fg}] |
| `fx` | [{type, on: id \| pos:[x,y,z], at, until, count, mode, color}] |
| `sfx` | [{name, prompt, at, vol}] |

**ACTOR**: `{id, at:[x,z], face, anim, expr, to:[x,z], speed, after, talk:true, actions:[{at, anim, expr, to, speed, face, after, arc}]}`
- `face`: degrees (0 = toward default camera / +z, 90 = +x, 180 = away), an actor id (look at them), or `"camera"`.
- Omitting `at` keeps the position from the previous scene (same set).
- `to` walks there (auto `walk`; use `anim:"run"` to run); `after` = anim on arrival (default idle).

**Time values (`at`, `from`, `until`, `shakeAt`)**: seconds from scene start · `"50%"` · `"w:word"` (when narrator says that word) · `"w:word#2"`.

**anims**: idle walk run talk laugh wave point cheer jump shocked scared cry facepalm think shrug angry sit sitsad sitfloor lie fall dance dab hug hold phone sneak tired bow knock clap float
**expr**: happy grin sad cry angry shocked scared smug neutral love sleepy evil ko nervous
**props**: coin cash moneystack phone gift pizza pizzabox sign car tree trophy heart lightbulb chest box ball cake book cup sword door raincloud bed table portal rainbow
**fx**: coins cash confetti hearts sparkles stars (mode burst|rain|rise|orbit) · rain snow · raincloud (follows actor) · lightning · puff · glow ·
`timer`/`label` floating sign above an actor: `{type:"timer", on, text}` static, or countdown `{from: secs, rate, to, fmt: mmss|hms|days|num, redBelow, color, glitch, size, y}`
**sfx files in assets/audio/sfx** (ElevenLabs-made): boom buzzer cartoon_run crickets crowd_aww crowd_gasp crowd_laugh ding dun_dun_dun glitch heartbeat magic pop record_scratch riser sad_trombone sparkle tada tick whoosh.
**sfx names (offline synth fallback)**: whoosh swoosh pop click coin ding sparkle boom vineboom thud thunder rain wind riser heartbeat scratch glitch bell step cash fail tada gasp suspense.
`prompt` = ElevenLabs generated SFX ("kids laughing"), cached; falls back to `name`. Files in `assets/audio/sfx/<name>.*` override everything.

## Layout cheat-sheet
- Units ≈ Roblox studs; characters are ~5.2 tall, stand near the origin. Keep 2–3 units between talking characters.
- `street`: sidewalk z −6…4, road z 4…16, houses behind at z −15, fences z −7.5. `city` similar with skyscrapers (`setOpts.label` = big building sign).
- Interiors are open rooms ~34×28 (classroom 40×32): back wall at −z. Classroom desks at x ∈ {−10,0,10}, z ∈ {2,11}; seats at z+2.6 → seated `at:[x, z+2.6]`, `face:180`, `anim:"sit"`.
- Bedroom bed at (−10,−7), desk at (9,−11.5).

## Staging rules (avoid ugly frames)
- Close-ups frame the head in the upper half; captions sit on the chest. Timers/labels auto-follow sitting/scaled actors.
- Faces exist **only on the front of the head**: in dialogue close-ups, cheat the speaker toward camera (`face` ±45) instead of perfect profile.
- Camera auto-avoids walls and actors blocking the target, but check the preview anyway.
- One `close` per emotional beat; `wide`/`establishing` when the location changes; `low` for reveals/power; `top` for "alone" moments.
- Put SFX on the emphasized word (`"at":"w:word"`). Reveal = `punch` + vineboom/boom/tada.

## Output
`cache/out/<slug>/`: `timeline.json` · `mix.wav` / `mix_nomusic.wav` · `video.mp4` (silent) · `preview.jpg`; final package in `publish/<slug>/` (see Publish block).

## Imported Roblox animations (config/anims_r15.json, tools/assets/rbx_anim.py, docs/ROBLOX_ANIMATIONS.md)
- Same format as config/anims.json (`loop`, `held`, `keys`) plus `hip: true` on imported entries: `lean` then pivots at the hips (y=2) like a Roblox torso instead of at the feet (applyPose keeps the hip fixed), and the optional key `bz` (body forward / back offset, + = forward) fixes climbs. Entries carry their source asset id in `_sources`. The pipeline merges every config/anims*.json into `tl.anims`.
- Only Roblox-owned / public animations can be read (third-party pack animations fail); R15 clips map joint for joint (native entries, `rig: "r15"`).

## Links and reach (engine/characters/links.js, config/anims_interact.json)
- Long form: actor `link: {to, mode, side, at, until}` and `reach: {target, arm, at, until}` (target = actor id, prop id or [x,y,z]). Compact: `link:<carrier>:<mode>[:L][@when] [until@when]`, `reach:<target>[:L][@when]`.
- Hooks in engine/core/frame.js: `resolveLinks` right after `actorAt` (derives the linked actor's position / yaw from the carrier's torso every frame), `finishLinks` after `applyPose` (arm IK so hands meet the other body: `armToward(ch, side, worldTarget, k, lim)`, exported from links.js, squashes / stretches the arm 0.6-1.3x), `linkRoot` for tilted roots (carry / drag), `st.head` as the camera target of a linked actor. Linked pairs are exempt from the lint overlap check.
- Poses: keyframed anims in config/anims_interact.json, layered over the carrier's own walk / run legs. Arms are single boxes (no elbow): hugs read as a long diagonal. Piggyback and hug are the weakest modes (tune kid placement / arms).

## Face v2 (engine/characters/face/face2.js, used by face.js faceTexture2 / character.js setFace)
- Procedural layers: eyes (sclera + pupil with gaze [-1..1], lid / slant), brows (per side angle / height / curve), mouth (width, open, smile, teeth, tongue, grit, asymmetry), tears (streams with a running phase), sweat, lines, blush. New expressions are the FACE2 table (between the EXPR-LIST markers; lint reads the names). Atlas expressions keep their pixels unless an option is used.
- Actor keys: `gaze` ("up|down|left|right|camera|cross|none|<id>" or [x,y]), `brows`, `pupils`, `tears` (bool), `facev: [{at, gaze|brows|pupils|tears}]` (compact tokens `tears@word`), plus `actions[]` with the same keys. `faceOptions()` resolves them every frame. Auto gaze = toward the look target / shot subject (the camera when the subject is the actor itself) + deterministic saccades every ~0.85 s; atlas faces only get it when a different target exists (`style.gaze: "all"` = always, `false` = never). Texture cache: key = JSON of the options, max 300 canvases; gaze is quantised to 1/6.
- Lip shapes (new expressions only): vowel of the word being spoken (a, o/u, e/i/y, m/b/p closed) x the 3-level open / closed logic.

## Skybox and grade (engine/environments/sky.js, config/skies.json)
- A sky is a cubemap in the Roblox Sky model: six faces `rt lf up dn bk ft` in `assets/sky/<name>/` (`faces`). Equirect panoramas (`file`, Poly Haven CC0) and procedural skies (`gen`) are converted to the same cubemap at load. `tests/stories/_facetest` checks the face orientation (Ft is seen looking -Z, Rt looking +X); `upRot` / `dnRot` = quarter turns if an imported sky has its top/bottom turned.
- Per sky in `config/skies.json`: `sunU` (where the sun is in a panorama, so it lines up with the sun light), `sat` `con` `exp` (picture), `sun: [color, intensity]`, `hemi: [color, intensity]`, `fog: [color, near, far]` (also the colour below the horizon), `rays` (light shafts + flare, only while the sun is in or near the frame), `time`.
- Scene keys: `sky` (inherited; `none`), `skyTo: {sky, at, dur}` (compact `"a>b@when"`), `grade`, `gradeTo: {grade, at, dur}`, `rays` (multiplier). `style.look: "aaa"` picks a sky from the time of day and the `vivid` grade; `style.grade`, `style.rays` set story-wide defaults. Weather still adds its particles, light scaling and fog on top of a sky.
- Import a Roblox skybox: `python tools/assets/roblox_sky.py <name> <model id>` or with the six texture ids (read them in Studio from the Sky's SkyboxXx properties). Roblox no longer serves assets anonymously: the download needs `ROBLOX_OPENCLOUD_API_KEY` in `.env` with the `legacy-asset:manage` scope.
- Grade pass (last in the chain): saturation, contrast, tint, lift, vignette, chromatic aberration, sun shafts. Presets in `GRADES` (engine/environments/sky.js). Stories without `sky` / `grade` / `look` render exactly as before (pass disabled).

## Data-driven particle effects (engine/fx/quarks.js, three.quarks 0.16 + quarks.core, MIT)
- `assets/vfx/fx/<name>.json` = an effect, registered as fx type `<name>` (pipeline/stages/build.py inlines every file into the timeline as `tl.quarks`, lint lists them in `--vocab fx`). Format: header comment of engine/fx/quarks.js (emitters: shape, life, speed, size, color, rate / burst, texture, blend add|normal, mode stretch, `over` size / color / speed / rotate / gravity / drag / noise, optional point `light`). Procedural textures: soft spark ring smoke star streak.
- Determinism: the renderer may ask for any time in any order. Each effect instance simulates at a fixed 1/60 s step with Math.random swapped for a seeded generator (`seed`), and an earlier time than the simulation has reached rebuilds the effect and replays from 0 (checked: same still from a fresh run, a rewind and a repeat is byte-identical). Motion-blur sub-frames reuse the current state, so particles are not blurred between sub-frames.
- three.quarks 0.16.0 is the newest release that accepts our three 0.170 (0.17 needs three >= 0.182). Editor JSON exports (quarks.art) can be loaded with `QuarksLoader` if a prefab is wanted; the compact format above is what agents write.
- `package.json` pins `three.quarks`; if `npm install` fails with EEXIST on the npm cache, use `--cache <other dir>`.

## Worlds, portals, set-pieces
- Worlds (engine/environments/worlds.js, registered into SETS): big procedural locations built for low wide-lens and aerial shots; presets in config/locations.json, list with `--vocab world`. PBR surfaces come from engine/environments/pbr.js: `pbrMat(name, w, h, opts)` with textures in assets/textures/pbr (index.json: tile size in units), all preloaded at init.
- Portal (engine/core/portals.js `portalFor` / `drawPortal`): a prop whose model sets `userData.portal` (a plane with a screen-space shader) and carries `portal: {set, setOpts, time, sky, z, y}` (the pipeline fills it from `"portal": "<loc>"`). The destination is a separate scene (set + sky dome + lights, no actors) rendered every frame into a render target from the main camera carried through the doorway (sill at (0, y, z) of the destination), so the view has parallax. One extra scene render per sub-frame while a portal is visible. Kit / map locations cannot be destinations.
- `mysterybox` (engine/props/props.js): `w` `h` size, glyph panels (procedural canvas, emissive), sliding doors (`openAt` / `closeAt`), seven-segment clock (`segDisplay`, `clockText`: `text` or `count` + `rate`). `countdown`: the display alone. `mob`: two InstancedMesh of blocky people, animated in `tick` (deterministic).
- Set-piece fx (smoke dustwave debris crack slam beam embers leaves shards) are quarks effect files like every other fx (assets/vfx/fx/*.json, engine/fx/quarks.js); there is no separate procedural effects module any more. Sprites and other see-through fx carry `userData.noAO` and are skipped by the depth-of-field depth pass.
- Regression stories: `_worldtest` `_portaltest` `_vfxtest` `_bigcreaturetest` `_skyboxtest` `_shottest`.

## Weather
Scene key `weather` (inherited until changed, `clear` = off): sunny heatwave cloudy fog windy rain storm snow blizzard sandstorm rainbow · night skies (force `time` night): fullmoon starry aurora eclipse (blood moon) · solar_eclipse · `clear` = off.
Presets live in `config/weather.json` (keys documented in its `_doc`): add or tweak one there, no code needed. Rendering = `engine/environments/weather.js` (sky, light, fog, cloud deck, particles rain/snow/leaves/dust/streaks, sun/moon/bloodmoon/eclipse/rainbow, stars, aurora, lightning); ambience beds + thunder = `weather_audio` in `pipeline/audio/beds.py` (drop `assets/audio/sfx/rain.mp3`, `wind.mp3`, `thunder.mp3` to replace the synth sounds). Check with `--preview` of `tests/stories/_weathertest`.

## Extending the engine (only if a story truly needs it)
- New set → `engine/environments/sets.js` (`SETS.<name>(g, opts, rng)`). New prop → `engine/props/props.js makeProp`. New anim → `engine/characters/character.js pose()`. New FX → `makeFX`.
- Keep everything procedural & deterministic (time-driven, seeded RNG) so frames can render in parallel.

## New animation without engine code (config/anims.json)
`"name": {"loop": seconds|0, "held": true|false, "keys": [{"t": 0, "ra": [x,y,z], "hd": [...], "y": 0, "lean": 0, "sq": 1, "ease": "back"}]}`.
Joints `la ra ll rl hd ts` in radians (x<0 forward/up; `la` z<0 / `ra` z>0 raise sideways); joints left out rest at 0. `ease` = how the pose arrives
at that key: smooth (default) linear back spring. `loop: 0` plays once and holds the last key; a looping anim must end on its first pose.
Lint reads the file, so the name is valid at once. Layers work with any anim: `walk+name`. Check with `tests/stories/_motiontest` (render it).

## Render cache
One mp4 segment per scene in `cache/segments`, keyed by a hash of engine/ + config/ sources, cast, style, the scene and the scenes it inherits
positions from. Changed scenes re-render, the rest are reused; segments unused for 3 weeks are deleted. Edited a kit/asset FILE (not hashed)? pass `--fresh`.
`style.camEase: "smooth"` restores the old camera that starts and stops inside every scene.

## Automatic motion polish (engine, nothing to write in the story)
- Look-at: heads turn (max ~25 deg, plus up/down for height) to the camera target; actor `look: "<id>"` / `"none"` overrides. `style.lookAt: false` turns it off.
  Skipped while walking/running and in head-driven anims (cry, facepalm, phone, think, laugh, nod...) unless `look` is explicit.
- Overlap: on an action change the body leads, arms follow, head arrives last; big moves (jump cheer shocked bounce dance dab point) get a short anticipation crouch.
- Travel: head and arms drag on acceleration, the stop rocks back and settles; a leap (`arc` / jump) lands with a squash.
- Metal (metalness > .3: trophy, coin, sword...) reflects a studio environment; `style.env` = strength (default .8), `false` = off.
  Do NOT set it as `scene.environment`: it lights every material and washes out colours and shadows.

## Creatures (engine/characters/creatures.js, config/creatures.json)
Any rigged GLB with Idle / Walk / Run (or Fly) clips: add `"name": {"model": "<folder>/<file without .glb>", "scale": 1}` to config/creatures.json and it is a cast
preset (lint knows it at once). Size = the model's real metres x 4 units; `height` (units) forces it; `yaw` fixes a model that faces the wrong way; `fire: false` removes the breath.
Clips are sampled at a time (walk/run by distance covered, so feet do not slide); wings, jaw, tail, roar, fire, sleep, eat and jump are procedural on the bones
`Head Jaw Neck LeftWing RightWing Tail` when the model has them. Long form: `{"id": "rex", "at": [6,-3], "anim": "idle", "actions": [{"at": "w:roars", "anim": "roar"}]}`.

## Crowds (engine/characters/crowd.js)
Long form: `"crowd": {"do": "flee", "n": 12, "on": "rex", "at": "w:roars", "expr": "scared", "seed": "b"}`. Places are seeded by the location, so the same crowd
stays put across cuts (change `seed` for different people). In kit locations spots avoid walls and follow the ground; `extras` (ambient walkers) can be used together.
Pool limit: 24 crowd + 8 extras. Regression story: `tests/stories/_crowdtest` (render it).

## Roblox hair styles (tools/assets/roblox_hair.py, config/roblox_hair.json "styles")
`"hair": "rbx:<name>"` + `hairColor`. Files: assets/roblox/hair/<name>.json/.png (greyscale texture, tinted by hairColor; `"gray": false` keeps the original colours).
Adding one needs no Studio export and never touches the open place: (1) read-only Luau probe in Studio (CreateHumanoidModelFromDescription, unparented) gives the
accessory's mesh id, texture id and, for 2021+ layered hairs, the WrapLayer ReferenceMeshId + ReferenceOrigin; classic hairs give SpecialMesh scale + `HeadAttachment * HandleAttachment^-1`
position; (2) add the entry to "styles" (`kind`: classic | layered); (3) `python tools/assets/roblox_hair.py`. Meshes / textures download by id (formats 1.x-4.x parsed by tools/assets/rbxmesh.py).
Layered hairs are made for a small realistic head: the converter remaps them onto the flat-topped cylinder head (`fit` = extra scale, `nudge` = [x,y,z] offset per style).
Only free Roblox-made hairs are used. Check with `tests/stories/_hairtest` (--preview).

## Model props (engine/props/modelprops.js, config/model_props.json)
`"name": {"model": "<category>/<file>", "hold": true|false, "height": units}`: any GLB under assets/models is a prop, lint knows it at once. Held = sized by its longest axis,
placed = by its height; origin on the ground. `style.modelProps: false` goes back to procedural props only. Check with `tests/stories/_proptest` (--preview).

## Head layers (engine/characters/wear/layers.js): head < hair < worn accessory
Any hair works under any worn accessory with no per-pair tuning. Each accessory gets a cover map (per direction from the head centre: distance to its inner surface;
thin straps / wires are ignored). Shells (helmet, cap, hood) are auto-scaled (max 1.25x) so their inside clears head + hair; hats with a solid base are left as authored.
Hair vertices that would reach past the accessory are pressed down to sit under it (never into the head); hair in uncovered directions (below the rim, through a visor)
is untouched, so nothing is cut. Geometry is deformed once per (hair, accessory set) and swapped, so timed hats (`+crown@word`) and two accessories at once are free.
New wearable = `"wear": {"w": width, "y": base height above head centre}` in config/model_props.json. Check with `tests/stories/_weartest` (--preview).

## Roblox avatar items on the R15 rig (classic clothing + rigid accessories)
- Classic clothing (config/roblox_clothes.json, engine/characters/r15_skin.js): the 585x559 template is mapped onto the R15 parts with Roblox's own face layout; layer order skin < pants < shirt.
  Torso, arms and legs use separate sheets (arms and legs share the same template area). `shirt` / `pants` can be mixed with the procedural outfit (only one of them `rbx:`).
- Rigid accessories (config/wearables.json, engine/characters/wear/wear.js): mesh + texture by id, placed at `partAttachment * handleAttachment^-1` on the character's part (Head: Hat / Hair / FaceFront / FaceCenter;
  Torso: Neck, BodyFront, BodyBack, Left/RightCollar, WaistFront/Center/Back; arms: Left/RightShoulder). Hats made for the classic head keep their exact size and press hair to the scalp (layers.js, `exact`).
- Adding items: read-only Studio probe (see the Luau in this session's history: CreateHumanoidModelFromDescription, unparented) -> add the entry -> `python tools/assets/roblox_wear.py`.
  Not convertible today: assets whose download needs a login (HTTP 401) and mesh format 7 (Draco).
- 3D layered clothing (jackets, sweaters, 3D pants) is NOT part of the framework: classic 2D clothing covers the need. A working prototype (converter, engine module, notes) is parked in `future/layered3d/`.
Regression stories: `_clothestest`, `_rbxweartest` (--preview).

### Set-piece props added for `aaa_story` (engine/props/props.js, procedural multi-part models, no external assets)
`statue` golden warrior on a plinth (~12 u, faces +z; metal gold materials + point light) · `hatch` rusty floor hatch using the `rusty_metal` PBR surface (`openAt` lifts the lid over 0.9 s) · `chains` two wall chains + cuffs (`openAt` hides the links = broken) · `stairs` (`rise`, `run`, `w`; solid stone steps with gold rails, bottom at the origin, rises toward +z; actors climb with `to:x,z,y`). Camera note: a camera inside a solid prop/box shows a flat colour; the `mysterybox` is 60 wide x 80 tall, so its front face is at z = at.z + 30: keep actors at z > at.z + 32.
