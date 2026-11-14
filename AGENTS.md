# Roblox Shorts Factory — Agent Guide

Works with any coding agent (Claude, Gemini, GPT/Codex, Cursor...). This file is all you need: **do not read engine/ or pipeline/ source,
do not read other stories.** You write ONE file, `stories/<slug>/story.json`; the pipeline does voice, captions, animation, camera, SFX, music, mix.
Reply to the user in their language; everything inside the video and the publish block is English.

## Workflow (3 commands, in order)
```
python pipeline/produce.py <slug> --lint       text report, no TTS/images. Fix every line until "lint: OK"
python pipeline/produce.py <slug> --preview    ONCE -> cache/out/<slug>/preview.jpg (1 tile per scene, 6 per row). After fixes: --preview --only 7,12
python pipeline/produce.py <slug>              full render -> publish/<slug>/ (mp4, _nomusic.mp4, youtube.txt, tiktok.txt). Run in background
```
Renders are cached per scene (`cache/segments`): after an edit only the changed scenes are redrawn; `--fresh` ignores the cache, `--blur 1` = fast draft.
Several slugs = batch (`produce.py a b c`). `--redo 12,31` re-voices those scenes. Never open the video. Final report to the user: 3-4 lines
(title, duration, `publish/<slug>/`, anything weak). Token rules: view only preview.jpg; grep, don't read, big files; never paste JSON back in chat.

## Story rules
- ONE first-person narrator tells everything; characters act silently (anim, expression, props, fx). No dialogue, no `speaker`.
- **Every story ends with a natural subscribe CTA as its LAST spoken line**, tied to the story's emotion: "Subscribe if you love your *dad*." (lint enforces it, all genres).
- Hook in line 1 (<=2 s). One line per scene, 6-14 words (`in_this_world` 24, other genres 18), a cut every 1.5-2.5 s. Standalone ending: no cliffhanger, no "Part 2".
- `*word*` = the one key word of the line (big yellow caption). Reveal = `punch` in cam + one sfx on that word.
- Alternate wide / medium / close. Kid-friendly (8-16), absurd but never mean.
- `genre` `in_this_town`: 45-80 scenes, 90-140 s. "In this town, <absurd rule>" -> 2-3 quick examples -> hero breaks the rule -> town
  over-reacts, escalate every 3-4 scenes -> twist + one warm closing line. `title` of scene 0: the rule in CAPS.
- `genre` `in_this_world` (the viral format: 8 reference videos with 1M+ views in `docs/references/new`): 60-110 scenes, 120-155 s, up to 24 words per line.
  Read `config/formats/in_this_world/FORMAT.md` first. Tag scenes `"beat"`: `rule` (scene 0) -> `example` x2-4 -> `hero` ("My name is X", family saying) ->
  `clue` x2-3 planted before the twist -> `twist` (re-reads every clue) -> `choice` (love over reward) -> `cta` ("Subscribe if you love your <person>.").
  Emotion first (mom, brother, true friend), absurd world, sincere heart. Lint checks the arc order, scene count and duration. Copy `stories/_template_world/story.json`.
- `genre` `aaa_story`: third-person cinematic adventure (set-pieces, portals, creatures, big worlds), **no subscribe CTA**. No scene-count, duration or pacing requirements (lines up to 24 words); only the cinematic camera and look techniques are kept, all optional: read `config/formats/aaa_story/FORMAT.md`. Defaults injected: `style.look = "aaa"`, narrator `narrator`, music `epic`. Captions and fps are the engine defaults (override with `style`: `captionWords uppercase emphColor activeColor captionY captionSize`, `"format": {"fps": 60}`).
- `genre` `what_if`: 40-65 scenes, 75-120 s. "What if <X>?" -> first effect -> three escalations (each a new place or character) ->
  unexpected downside that hits the hero -> funny/warm payoff.

## story.json (compact notation — copy `stories/_template/story.json`)
```json
{"title": "In This Town, ...", "genre": "in_this_town", "cast": ["milo", "zoe", "sheriff"],
 "publish": {"title": "<=70 chars, hook first, ends #shorts", "description": "premise. question to viewers?", "tags": ["5+ broad and niche"], "caption": "TikTok one-liner + emoji"},
 "scenes": [
  {"loc": "west_saloon", "line": "In this town, the *loudest* kid becomes sheriff.", "title": "IN THIS TOWN...", "cam": "wide group 15 push",
   "actors": ["milo -1.5,0 f20 /happy", "zoe 1.5,0 f-20 wave/grin"], "sfx": "boom@loudest"},
  {"line": "Last week, Jay won a *trophy* for it.", "cam": "close milo punch", "actors": ["milo cheer/laugh +trophy@trophy"], "fx": "confetti:milo@trophy", "sfx": "tada@trophy"}
 ]}
```
| key | notation |
|---|---|
| `cast` | characters are Roblox R15 rigs (no rig key; a `rig` key is ignored). List of preset names, or `{"coach": {"like": "dad", "shirt": "#d33"}}` to recolor/define (spec keys: docs/REFERENCE.md) |
| `loc` | location name; inherited by the following scenes until it changes. `time`: day sunset dusk night spooky (inherited too) |
| `sky` | skybox (real panorama with clouds instead of the flat gradient), inherited like `weather`: `"sky": "day_puffy"`. Brings its own sun, ambient light, horizon haze and light shafts when the sun is in frame. `"sky": "day_puffy>storm@shadow"` = the sky (and its light) changes at that word. `"none"` = back to the gradient. List: `--vocab sky` (day_puffy day_cumulus golden_hour sunset storm night_moon night_stars purple_planets nebula; `facetest` is a debug cube). Any Roblox skybox can be added: `python tools/assets/roblox_sky.py <name> bk=ID dn=ID ft=ID lf=ID rt=ID up=ID` |
| `grade` | colour grade of the scene: vivid flashback threat cold gold dream (`--vocab grade`); `"grade": "vivid>threat@shadow"` cross-fades at that word. Top level `"style": {"look": "aaa"}` = skybox by time of day + `vivid` grade + light shafts on every outdoor scene |
| `weather` | one word, e.g. `"weather": "storm"`; inherited by the following scenes (across locs) until changed, `"clear"` turns it off. Brings its own sky, light, fog, clouds, particles, sun/moon, ambience sound and (storm) lightning + thunder: do not add rain/thunder fx or sfx on top. Indoors only the light, flashes and sound remain |
| `line` | narration. No line -> `"dur": seconds` (silent beat) |
| `cam` | words in any order: shot · target (`<id>` or `group`) · angle deg (0 = front, omit = auto-alternating) · move · `punch` · `shake` · `z1.3` zoom · `ots:<id>` |
| `shots` | more camera set-ups inside the same scene, each cutting in at a word / second / percent of the line: `"shots": ["@loudest close zoe crash", "@60% low milo lens90 dutch"]`. Same words as `cam`, after the `@when`. Actors keep moving across the cuts. Extra cam words (also valid in `cam`): `lens90` wide lens that keeps the subject's size (the AAA look: `low` + `lens90`) · `fov70` · `h0.4` camera height · `dutch` / `dutch-12` roll · `crash` crash zoom · `whip` / `whip-` whip-pan in · `whipout` · `pov:<id>` through their eyes (`tilt40` = looking down) · `dof1.5` · moves `fly` (FPV swoop onto the framing) and `track` (follows behind the target). Use extra shots where a cut helps the moment; there is no required cutting rate. `--preview` shows one tile per shot. `"format": {"fps": 60}` at top level = 60 fps |
| `actors` | `"id x,z fDEG anim/expr to:x,z run +prop"`. Only `id` is required: position and facing carry over from that actor's previous scene in the same loc. `f20` = turn 20 deg (0 faces camera side, 180 = away), `>zoe` / `>camera` = look at. `wave/grin`, `/sad` (expr only), `cry` (anim only). `to:5,-3` walks there (`run` to run) |
| `actors` `link` | `"max link:milo:shoulder@lunged until@fell"` binds this actor to another's body: modes `shoulder piggyback carry hold_hands hug drag lean_on grab_arm` (`--vocab link`), `:L` = left side. Both poses are automatic and follow `to:` and run; start / end fade over 0.3 s. Long form `link: {to, mode, side, at, until}` |
| `actors` `reach` | `"milo reach:zoe"` or `reach:3,5,1:L@word` points the arm at an actor, prop or point (door handle, chain): the arm stretches or squashes (0.6-1.3x) so the hand arrives |
| head | automatic: everyone's head follows the camera target (the subject of the shot). `look:zoe` on an actor = look at someone else, `look:none` = keep the head still |
| held props | `+trophy` on the actor (right hand), `+L:phone` left hand, `+gift@word` appears on that word. Always upright and outside the arm; big ones (gift box cake pizza pizzabox chest moneystack) are carried in both hands |
| `crowd` | one key stages up to 24 background people: `"crowd": "cheer 14 @won"`. Behaviours: `watch` `walk` (pedestrians crossing) `gather` `flee` `panic` `queue`, or any anim (cheer dance laugh clap bow...). Options: count · `on:<id>` / `from:<id>` / `on:x,z` (what they surround or run from; default = the actors) · `@when` it starts (before it they stand and watch) · `/expr`. Not inherited: repeat it on every scene that shows the crowd (same loc = same people, same places) |
| creatures | animated animals are cast members: `"cast": ["milo", "dragon", "dog"]`, staged like actors: `"dragon 6,-3 y9 fly to:6,-3,0"` (lands), `"dog -5,1 run to:4,1"`. Anims: idle walk run fly roar fire sleep jump eat. Resize / recolour: `{"rex": {"like": "dragon", "scale": 0.5, "tint": "#ff8a8a"}}` (names and specs can be mixed in the cast list). No expr, no held props |
| `props` | placed objects: `"table 3,-2 r90 s1.2"`, `"portal 0,-4 @word"` |
| set-pieces (long form props) | `{"type": "mysterybox", "at": [0,-50], "portal": "ice_world", "openAt": "w:opened", "closeAt": "w:shut", "count": 3600}`: colossal glyph cube; `portal` = the world seen through its doorway (any procedural world: `--vocab world`; `{"loc", "sky", "z"}` for its own sky), `open: true` = plain vortex, doors slide at `openAt` / `closeAt`, the clock over the door shows `text` or counts down from `count` seconds (`rate` = display seconds per second). `{"type": "countdown", "at": [3,-1], "count": 47}` = free-standing seven-segment display. `{"type": "mob", "at": [0,-8], "n": 300, "radius": 34, "inner": 5, "mode": "watch|flee|gather|cheer"}` = hundreds of far-away people (use `crowd` for the 24 near ones) |
| `sfx` | `"name@when*vol ..."` e.g. `"boom@loudest crowd_laugh@0.4*0.5"` |
| `fx` | `"type:actor:mode@when ..."` e.g. `"confetti:milo@record rain"` |
| `overlay` | `"speedlines flash"` · vignette flash red speedlines flashback |
| when (`@`) | a word of the line (`@loudest`, 2nd occurrence `@loudest#2`) · seconds (`@0.4`) · percent (`@50%`) |
| other | `title` (top hook text) · `shakeAt` · `transition`: fade white wipe · top level `narrator` `music` (defaults come from the genre) |

Anything not expressible above (timers/labels, mid-scene `actions`, text overlays, custom locations): use the long object form for just
that entry — see docs/REFERENCE.md (grep the key, don't read it whole).

## Vocabulary (lint rejects anything else)
Always current, straight from the engine: `python pipeline/produce.py --vocab` (all) or `--vocab anim|creature|crowd|expr|prop|fx|sfx|loc|weather`. Lint errors suggest the closest valid word.
- **cast presets**: milo (hero) zoe (best friend) jay (goofy) max (little brother) mia · mom dad grandpa · teacher boss cop doctor builder pirate sheriff ranger villain
- **loc presets**: home mailbox yard bus · cafe cafe2 cafe3 · skate · tokyo · farm · lab lab_robot lab_airlock · space space_tower space_crystal space_pad ·
  west_saloon west_sheriff west_bank west_mine · hospital ambulance · camp camp_cabin camp_dock camp_tent · site site_crane site_digger · station ·
  plaza church · office · street city park school classroom bedroom livingroom store forest dock studio
- **shot**: establishing wide full medium close extreme low high top · **move**: push pull orbit pan rise drift static
- **anim**: idle walk run talk laugh wave point cheer jump shocked scared cry facepalm think shrug angry sit sitsad sitfloor lie fall dance dab hug hold phone sneak tired bow knock clap float
  - layers: `walk+wave`, `run+cheer`, `sit+phone` = legs/body of the first, arms + head of the second (any two anims)
  - **hand-authored acting** (config/anims_hand.json): kneel kneel_both dig pull_door unchain reach reach_down panic scream_run hug_give carry_walk lift_heavy stumble dive_forward duck cry_kneel shrug_big look_around throw exhausted_walk tumble crouch_sneak crawl (the last three are weak). `hip: true` anims lean about the hips; `bz` = body forward offset (dive_forward ends at bz 2.2: account for it in the staging)
  - **real Roblox animations** (config/anims_r15.json, ~115 native R15 clips imported from Roblox KeyframeSequences; `--vocab anim` lists all): rbx_walk rbx_run rbx_sprint rbx_climb rbx_fall rbx_jump rbx_idle rbx_sit rbx_wave rbx_cheer dance1-3 floss cutesy_dance rocker_dance break_dance hero_landing yawn, and style packs `<style>_idle|walk|run|climb|fall|jump` for ninja cartoony zombie superhero bubbly toy elder pirate mage knight levitation robot stylish. Add more: `docs/ROBLOX_ANIMATIONS.md` (Studio export + `python tools/assets/rbx_anim.py native <name> <assetId>`; Studio can also generate new ones from text with `generate_animation`)
  - interaction poses (config/anims_interact.json, used by `link`): carrying_shoulder carried_shoulder carrying_back carried_back carrying_cradle cradled hugging carrying_drag dragged
  - keyframed (data in `config/anims.json`, add new ones there without touching the engine): salute nod headshake stomp beg
- **hair** (cast spec, any `hairColor`): `"hair": "rbx:<style>"` - middlepart sidepart sleek surfer fade ponytail curlyafro wavy curls dreads topknot braids fringe bangs updo sideshave classicbrown colorbraids. Background people get these automatically
- **model props** (122 GLB models, used like any prop: `+shield`, `"sofa 3,-2"`): list with `--vocab prop`. Weapons, tools, treasure, food, furniture, instruments, vehicles. A model replaces the procedural prop of the same name. Hats are worn, not held: `+crown` `+wizard_hat` `+helmet` `+great_helm` `+flight_helmet` `+skate_helmet` `+headphones` `+call_headset`
- **Roblox outfit** (cast spec): `"shirt": "rbx:<name>"`, `"pants": "rbx:<name>"` (real catalog clothing; lists: `--vocab shirt`, `--vocab pants`) and `"wear": ["rcap", "aviators", "dogpack"]` = accessories always on (`--vocab wear`: caps, fedora, visor, hood, glasses, necklace, backpack). Timed: `+cap@word` on the actor. Hair settles under hats automatically
- **set-piece props** (long form, `{"type": ..., "at": [x,z], "y": .., "rot": deg}`): `statue` (golden warrior on a plinth, ~12 u, place at y -1.5 to half-bury it) · `hatch` (rusty steel floor hatch, `openAt` lifts the lid) · `chains` (wall shackle chains + cuffs, `openAt` = they break) · `stairs` (`rise` height, `run` length, `w` width; bottom at the origin, rises toward +z; actors walk it with `to:x,z,y`) · `door` takes `color`/`scale`. A worm creature recoloured black and tall (`{"like":"worm","height":50,"recolor":"#0b0810"}`) staged with `y-40 ... to:x,z,0` = tentacle bursting from the ground
- **big creatures**: trex raptor triceratops dolphin octopus worm · ice_giant (30 units, glowing ice) · sky_beast (colossal black spider-thing with glowing eyes). Cast spec extras for any creature: `recolor` (solid colour), `emissive` + `glow`, `opacity`, `spots` (glowing eye dots), `height`
- **creatures**: dragon dog farmdog xolo cat blackcat cow pig goat chicken duck bear deer stag rabbit fox rat moth
- **face v2** (actor tokens): `gaze:<up|down|left|right|camera|cross|<id>|x,y>` (eyes look; left/right = screen side; `<id>` = look at that actor; an explicit gaze turns plain faces into white eyes with pupils), `brows:<raised|angry|worried|flat|one_raised_l|one_raised_r>`, `pupils:<tiny|small|normal|big>`, `tears` (streaming tears; `tears:off`). Any of them takes `@word` = from that word on: `tears@word`, `gaze:left@word`. Long form: `actions[{at, gaze|brows|pupils|tears}]`. Eyes follow the shot subject / `look:<id>` by themselves with small saccades; `"style": {"gaze": false}` turns it off.
  - new expr: scream_open grit tears_joy bawling terrified side_eye dead_inside smirk eyeroll lovestruck (their mouth changes with the vowel of the spoken word)
- **expr** basic: happy grin laugh sad cry angry shocked surprised scared worried nervous smug neutral sleepy confident content love evil ko
  - dramatic: furious determined teary heartbroken betrayed scream panic horrified awe suspicious
  - idle (listeners, background, in-between beats): bored skeptical curious shy pout annoyed proud relieved
  - comic: dizzy starstruck wink disgusted deadpan mischief sly awkward stunned hysterical silly grumpy
- **props**: coin cash moneystack phone gift pizza pizzabox sign trophy heart lightbulb chest box ball cake book cup sword · placed only: car tree door bed table portal rainbow raincloud
- **weather**: sunny heatwave cloudy fog windy rain storm snow blizzard sandstorm rainbow · night skies (force `time` night): fullmoon starry aurora eclipse (blood moon) · solar_eclipse · `clear` = off
- **fx**: coins cash confetti hearts sparkles stars (modes burst rain rise orbit) · rain snow raincloud lightning puff glow · timer/label (long form)
  - hits and steps (on an actor, timed with `@word`): impact (comic hit flash) shockwave (ground ring) dust (kick-up at the feet: landings, falls, sudden stops) puff (poof: appear/vanish)
  - **fx = quarks files** (`assets/vfx/fx/<name>.json`, the file name is the type; table, options and authoring recipe in `assets/vfx/fx/README.md`): explosion slam sparks fire fire_torch smoke smoke_plume dust_cloud dust_trail dustwave shockwave_ring impact_hit crack debris shards beam embers leaves magic_burst magic_aura heal_sparkles electric_arc fireworks confetti_cannon snow_flurry rain_splash fog_bank glow_orb portal_swirl ice_shatter. Use `"fx": "impact_hit:milo@bonk"` or long form `{"type": "dust_cloud", "pos": [0,0.3,-1.5], "at": 0.3, "scale": 1, "seed": 3, "color": "#fff"}`. Looping: smoke_plume dust_trail fire fire_torch magic_aura heal_sparkles snow_flurry rain_splash fog_bank glow_orb portal_swirl. Ground effects: `pos` y at the floor; air effects: y at the centre (~3.5 = chest). To make a new effect copy a file and edit it (format: header of engine/fx/quarks.js; textures: soft spark ring star streak puff glow plus confetti drop flame shard bolt or `assets/vfx/textures/kenney/<n>.png`). Check late moments with `node engine/render.mjs cache/out/<slug>/timeline.json cache/out/<slug>/st --stills 0.4,1.0,2.0 --scale 0.4`
  - emotes on an actor, e.g. `sweat:milo`: sweat anger question exclaim zzz — a cheap way to show a silent character's reaction
- **sfx**: boom buzzer cartoon_run crickets crowd_aww crowd_gasp crowd_laugh ding dun_dun_dun glitch heartbeat magic pop record_scratch riser sad_trombone sparkle tada tick whoosh vineboom thunder
- **music**: curious tension · upbeat funny mystery sad tense spooky epic chill · none
- **narrator**: narrator narrator_f narrator_deep

## Viral quality bar (all genres)
Emotional core (a person the hero loves), named hero + family saying, 2-3 clues planted before the twist, a twist that re-reads them, a love-over-reward choice,
concrete specifics, one set-piece per act, "Subscribe if you love your <person>." Details: `config/formats/<genre>/FORMAT.md`. Tag scenes with `beat` to get the arc linted.

## Staging (what makes frames look good)
- Characters are ~5 units tall and stand near 0,0: keep the scene inside x -6..6, z -5..3, 2.5-3 units between two people, never the same spot.
- Faces exist only on the front of the head: keep `f` within ±45 in close-ups; two people talking = `f25` and `f-25`, not profiles.
- Weather is mood: `storm`/`fog`/`eclipse` for the scary or dramatic turn, `sunny`/`rainbow` for the payoff, `windy`/`snow` for comedy. Change it at a story beat, not every scene; the sun/moon is always in the upper right of the frame.
- One `close` per emotional beat, `wide`/`establishing` when the loc changes, `low` for power/reveals, `top` for "alone".
- A scene shows only the actors you list: list everyone who should be visible, even if idle.
- Busy public place (town, camp, plaza, street kits)? Add `"extras": 3`-`6` to the scene for background walkers; leave it out for lonely, private or tense beats. Outdoor kit locs only.
- New location or asset needed? Read `assets/CATALOG.md` (short index) first; add `"locations": {"name": {"setOpts": {"kit", "near", "dz"}}}` to the story.

## Creative fidelity (overrides the vocabulary list as a ceiling)
The vocabulary above is what exists today, not the limit of what a scene may show. If a scene needs an object, animation, expression,
costume, creature or location the engine/assets lack, **never substitute** (idle pose, a different prop, a similar anim, a generic face).
Do whatever it takes to make the scene real and visually satisfying:
- Look in `assets/CATALOG.md` and the connected kits (polyfork etc.) first, then **download** suitable assets from the web (respect licenses;
  record source + license in the catalog and refresh `assets/CATALOG.md`).
- **Create** what is missing: new animations (pose keyframes), new faces/expressions, new props, procedural models, fx, locations.
- Engine/rig/config changes are allowed and expected for this. Keep them reusable (add to the vocabulary, document in docs/REFERENCE.md), then
  `--preview` the regression stories (`_rigtest`, `_exprtest`, `_fxtest`...) to make sure nothing else broke.
- A scene is done when it shows what the line says. If you could only approximate it, the work is not finished: say what is still weak in the report.
- Aim for creative, specific scenes (unusual props, big reactions, set-pieces), not the safest option the current vocabulary allows.

### Visual quality of models (no "poor" placeholders)
Never represent an object with a plain solid block/cube/cylinder, an untextured primitive, or a recoloured generic prop (e.g. a sandwich as a flat box). Every
prop, creature, vehicle or set piece must be recognisable at a glance and visually richer than a single untextured primitive. Models stay **low poly**, but need
real shape detail (silhouette, layers, parts) and colour/texture. Sourcing order, stop at the first that gives a good result:
1. `assets/CATALOG.md` and already-downloaded assets.
2. **Roblox directly**: Creator Store / Toolbox (`search_asset`, `insert_asset` via Studio MCP), exported to OBJ/GLB.
3. **The web / connected kits**: polyfork, Poly Pizza, Sketchfab, Kenney, Quaternius, etc. (free licenses only; record source + license in the catalog).
4. **Last resort: build it in Blender** (low-poly, multi-part, with vertex colours or a small texture), export GLB, and register it in the catalog.
Primitives are allowed only as small sub-parts of a larger detailed model (e.g. a plate under a sandwich), never as the whole object. If you could only
find or make a weak model, say so in the report instead of shipping it silently.

## Engine changes
Allowed whenever a scene needs it (see Creative fidelity above); see "Extending the engine" in docs/REFERENCE.md. `tests/stories/_rigtest` (rig + held props) and
`tests/stories/_loctest` (every location preset), `tests/stories/_exprtest` (the extended expressions), `tests/stories/_weathertest` (every weather preset), `tests/stories/_fxtest` (every fx), `tests/stories/_livetest` (extras, tree sway, pollen/fireflies), `tests/stories/_shottest` (multi-shot scenes, lens, whip, pov, fly, track, camera path: render it), `tests/stories/_motiontest` (walk/run easing, turns, pose transitions: render it, motion does not show in stills) are visual regression checks: `--preview` them after touching engine/ or config/.


## Rich-set tooling (engine v4)
- **Auto dressing** (`config/dressing.json`): scenes in jungle / gold_city / ocean_world get scatter props automatically; `"dress": false` off, `"dress": 0.5` sparser, `2` denser. A scene with its own `scatter` props is left alone. Add a world by adding a key.
- **FX combos** (`config/fx_combos.json`): `impact_big`, `impact_small`, `blast`, `magic_cast`, `celebrate` expand into several particle parts plus sound. Use them instead of a single `slam`/`dust_cloud`.
- **Auto fx sound** (`config/fx_sfx.json`) and **world ambience beds** (`config/world_audio.json`, synth loops in `pipeline/audio/mix.py`). Off with `style.autoFxSfx=false` / `style.worldAudio=false`.
- **Frame QA**: `python pipeline/produce.py <slug> --qa` renders 3 stills per scene and flags dark / blocked / empty / washed / busy frames (`cache/out/<slug>/qa/flagged.jpg`). Run it after `--preview`, before the final render. It does not judge composition (e.g. a camera that faces the wrong way); look at the sheet too.
- Dressing presets exist for jungle, gold_city, ocean_world, ice_world, stone_court, sky_island, town_square (Polyfork GLBs in `assets/models/cenario/`). `tunnel` has none on purpose (it is a golden palace hall; barrels/crates did not fit and did not show). Cameras that face a bare wall (stone_court) hide the scatter: aim the camera down the open side.

## Look layers: biome, treat, medium, intent (story first, everything soft)
Nothing below forbids anything. Precedence for a scene: its own field > `biome` > the world's soft default (`config/world_profile.json`). Fields inherit until changed; `"none"` switches off.
- `"treat"`: re-skin any set and its scatter models with a shader (`config/treatments.json`: frost snow wet sand moss ash rust dead golden toxic underwater moonlit; `"frost:.6"` = strength, list = combined). Add a treatment = add a JSON entry. This is how one palm tree serves beach, ice and desert.
- `"biome"`: `config/biomes.json` bundles (frozen, snowy, scorched, desert, overgrown, swamp, rainy, haunted, toxic, golden, flooded, abandoned). `{"loc":"jungle","biome":"frozen"}` = frost-covered jungle.
- `"medium": "underwater"`: no sky, blue water column + fog, cool light, water tint, bubbles (auto). Works on any set; `loc seabed` is the purpose-built sea floor (corals, kelp, fish, light rays). `loc ocean_world` is the sea SURFACE with an islet.
- `"intent"`: optional free tags (`["ocean"]`) or `"none"`; otherwise the scene title + line are scanned (`config/intents.json`). `produce.py` prints advisory suggestions before rendering and `--qa` measures the frames (water/snow/foliage/sand/fire fractions) and warns when the text says one thing and the picture another. Silence with `"allow": ["ocean"]`.
