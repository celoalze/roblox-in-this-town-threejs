# Format: aaa_story (third-person cinematic story)

For big set-piece adventures told in third person, past tense ("Ryan sprinted down the tunnel..."), one narrator, characters act silently.
Standalone ending, **no subscribe CTA** (lint does not require one), no part 2. Kid-friendly: scary, never gory.

There are **no scene-count, duration or pacing requirements** (the earlier 90-180 scenes / cut every 1-2 s / very short lines recipe hurt the
stories and was dropped). Lines may have up to 24 words. Write the story at the pace it needs; what this format keeps is the camera and look toolbox below.

Defaults (injected from format.json when the story leaves them unset; set `"genre": "aaa_story"`): `"music": "epic"`, `"narrator": "narrator"`,
`"style": {"look": "aaa", "bloom": 0.45}`. Frame rate and captions are the engine defaults (opt in with `"format": {"fps": 60}` or `style` caption keys).

Toolbox (all optional, use what serves the scene)
- Camera: `low lens90`, `fly`, `track`, `whip`, `crash`, `dutch`, `pov:<id>`, `top`, extreme close-ups of faces and props; `shots` for extra set-ups inside a scene.
- Look: one `sky` + `grade` per mood, changed with `skyTo`/`gradeTo` or `"a>b@word"`; `weather` where it helps; `fx` quarks on impacts (slam, shockwave_ring, dust_cloud, debris, sparks, embers, ice_shatter, electric_arc, magic_burst, confetti_cannon).
- Worlds (`loc`): town_square ice_world sky_island gold_city ocean_world jungle tunnel stone_court; portals with the `mysterybox` set-piece; crowds with `mob`/`crowd`; creatures as cast members; `link` for carry/hug/hold_hands.
- Face acting: expression + `gaze`/`brows`/`tears`. Check `--preview --only a,b,c` in groups of ~15 scenes; check set-pieces with `render.mjs --stills`.
- Emotional anchor (a parent, a promise) planted early, paid off in the last scenes.
