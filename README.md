# Roblox Shorts Factory

Procedural pipeline that turns a `story.json` into a finished, narrated, captioned 9:16 Short (≤3 min) with blocky Roblox-style characters.

**Stack:** Three.js scene rendered frame-by-frame in headless Chrome → ffmpeg · ElevenLabs TTS / SFX / music (Kokoro offline fallback) · Python orchestrator.
No Roblox Studio or Blender needed — everything is code, deterministic and parallelizable, so AI agents can mass-produce episodes.

## Setup (Windows)
1. Install: Python 3.10+, Node 18+, ffmpeg (`winget install Gyan.FFmpeg`), Google Chrome or Edge, up-to-date GPU drivers (rendering always uses the GPU).
2. Run `setup.bat` (npm + pip deps, downloads offline Kokoro voice model).
3. Put your key in `.env`: `ELEVENLABS_API_KEY=...` (optional `TTS_PROVIDER=kokoro` to force offline, `MUSIC_PROVIDER=elevenlabs` to generate music).

## Make a video
```
python pipeline/produce.py <slug> --lint      :: text checks (no TTS, no images)
python pipeline/produce.py <slug> --preview   :: contact sheet of every scene
python pipeline/produce.py <slug>             :: full render -> publish\<slug>\
python pipeline/produce.py a b c              :: batch
```
Write new episodes by following **AGENTS.md** (agent-neutral: Claude, Gemini, GPT/Codex, Cursor all read it; CLAUDE.md / GEMINI.md just point to it).
Long-form schema and engine notes: docs/REFERENCE.md. Presets: config/cast.json, config/locations.json.

## Project layout
```
engine/                    Three.js renderer (runs in headless Chrome)
  render.mjs, page.html    node CLI + page that hosts the renderer
  core/                    world orchestration: scene set-up, actors, camera, frame loop
    state.js               shared mutable runtime state context (W / state)
    math.js                pure math helpers, vectors, easing, and sun axes
    portals.js             portal views, doorway render targets, and underwater BG
    motion.js              actor travel, facing, easing, and pose resolution
    camera.js              camera shots, views, framing, and occlusion avoidance
    living.js              held props, NPC extras, crowds, and ambient motes
    assets.js              map/kit loading, placement, and scene asset prep
    scene.js               renderer, composer, lights, sky initialization, scene prep
    frame.js               frame render loop, 3D rendering, motion blur, staging lint
    world.js               public facade re-exporting init, shotTimes, lint, frame, grab
  characters/              character facade, R15 rig, animation, IK links, crowd, creatures
    face/                  face atlas textures and procedural face layers
    wear/                  hair, hats, layered clothing, Roblox catalog accessories
  environments/            sets, procedural worlds, skyboxes, weather, treatments, PBR materials
  props/                   procedural props and GLB model props
  fx/                      particle effects (quarks)
  hud/                     captions, titles, overlays, transitions
  shared/                  shared materials and shader helpers
pipeline/                  Python production pipeline
  produce.py               the CLI: story.json -> lint / preview / render / publish
  paths.py                 the one place that knows this folder layout
  stages/                  production stages (no eager imports)
    build.py               voice resolution, TTS generation, mixes, timeline.json
    publish.py             package MP4s with audio muxing and distribution text
    run.py                 end-to-end story runner: schema, lint, preview, QA, render
  story/                   shorthand expansion, lint, intent checks, vocabulary
    expand.py              story shorthand normalization, dress, looks, combos
  audio/                   narration TTS, local voice worker, SFX/music synthesis and mix
    beds.py                ambient weather and world audio beds
  render/                  frame QA, Roblox Studio capture path
tools/                     everything that is not on the render path
  assets/                  stand-alone asset importers/converters (catalog, Roblox hair/wear/sky/anims, Polyfork)
  roblox studio/           Luau export scripts run inside Roblox Studio + build_r15.py
  audio/tts/               local voice stack: virtualenvs and model weights (not in git)
config/                    data the engine and pipeline read: presets, anims, vocab.json
  schema/                  JSON Schema contract for story.json authoring
  formats/                 one folder per genre: format.json (lint limits, defaults) + FORMAT.md
assets/                    audio, fonts, models, textures, skies, VFX (CATALOG.md is the index)
stories/                   one folder per story (story.json); _template* are the starting points
tests/                     golden.py (regression harness), test_vocab.py, stories/ (regression stories)
docs/                      reference docs; references/ = reference videos (not in git)
publish/                   finished videos + platform text (not in git)
cache/                     regenerable work files (not in git): out/<slug>/ work folders, segments/ scene renders,
                           tts/ synthesized narration (slow to redo: keep it), downloads
```
