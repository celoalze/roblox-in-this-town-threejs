# assets/ — one folder per category, reusable by any story

| folder | what | how it is used |
|---|---|---|
| `audio/sfx` `audio/music` `audio/voices` | sound effects (`<name>.mp3`), music beds (`<mood>.wav`), TTS reference voices | `sfx:` / `music:` in a story; voices mapped in `config/voices.json` |
| `models/<category>/` | low-poly GLB props and rigged creatures (animais, armas_e_tesouros, comida, coroas_e_acessorios, ferramentas, objetos_comuns, veiculos) | `config/model_props.json`, `config/creatures.json` |
| `models/kits/<kit>/` | Polyfork places (kit.mjs + GLB parts) | `loc` presets with `set: "kit"` |
| `textures/pbr/<name>/` | tileable PBR surfaces (`diff nor rough .jpg`) + `index.json` (tile size) | `engine/pbr.js` `pbrMat(name, w, h)` |
| `textures/faces/` | character face atlas | `engine/face.js` |
| `sky/panoramas/` | equirect sky images (2:1) | `config/skies.json` `file` |
| `sky/cubemaps/<name>/` | six-face Roblox skyboxes (`rt lf up dn bk ft .png`) | `config/skies.json` `faces`; import with `pipeline/roblox_sky.py` |
| `roblox/` | Roblox catalog hair, accessories, clothes templates, cast OBJs | `config/roblox_*.json`, `wearables.json` |
| `vfx/fx/` `vfx/textures/` | particle effects as JSON (three.quarks; the file name is the `fx` type) and their sprite textures (`kenney/` = CC0 particle pack) | `engine/quarks.js`, see `vfx/fx/README.md` |
| `fonts/` | caption fonts | engine + studio render |

Adding something: put the file in its category, register it where the table says, record source + licence in `CATALOG.md` (regenerate the index with `python pipeline/catalog.py`).
Sky names live in `config/skies.json` (`python pipeline/produce.py --vocab sky`). Never store the same asset twice: models and textures are shared by every story.
