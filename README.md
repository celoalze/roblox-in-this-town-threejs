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
engine/                  Three.js runtime and render harness (render.mjs, page.html)
  engine/core/           world orchestration and runtime renderer (world.js)
  engine/characters/     character facade, R15 rig, animation, IK links, crowd, and creatures
  engine/characters/face/ face atlas textures and procedural face v2 layers
  engine/characters/wear/ headgear, layered clothing, and Roblox catalog accessories
  engine/environments/   sets, procedural worlds, skyboxes, weather, and PBR materials
  engine/props/          procedural props and GLB model props
  engine/fx/             particle systems and VFX (quarks)
  engine/hud/            text overlays, captions, and HUD elements
  engine/shared/         shared materials and shaders
pipeline/                Python video production pipeline
  pipeline/produce.py    main CLI entry point and orchestrator
  pipeline/paths.py      central repository root and directory path constants
  pipeline/story/        story parsing, shorthand expansion, linting, intent checking, and vocabulary
  pipeline/audio/        TTS generation, local chatterbox worker, and audio mixing/sound effects
  pipeline/render/       frame QA and Roblox Studio rendering
  pipeline/tools/        stand-alone asset downloaders, converters, and export tools
stories/                 production episodes (one folder per story with story.json)
tests/                   test suite and regression fixtures
  tests/stories/         regression and visual test stories
  tests/golden.py        golden master regression test harness
  tests/test_vocab.py    vocabulary consistency validator
config/                  presets, vocabulary registries, and configuration files
assets/                  audio, fonts, models, textures, skyboxes, and VFX assets
cache/                   TTS, SFX, mesh, and segment render cache (safe to delete)
out/                     intermediate renders, contact sheets, and previews
```
