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

## Layout
```
engine/      Three.js runtime (characters, sets, props/fx, camera, captions) + render.mjs (Chrome → ffmpeg)
pipeline/    produce.py (orchestrator), shorthand.py (compact notation), lint.py, tts.py (ElevenLabs/Kokoro + word timings), audio.py (SFX, music, mix)
config/      voices.json (voice aliases → ElevenLabs IDs / Kokoro voices)
stories/     one folder per episode with story.json
assets/      optional overrides: assets/audio/sfx/<name>.mp3, assets/audio/music/<mood>*.mp3
cache/       TTS/SFX/music cache (safe to delete)
out/         renders
```
