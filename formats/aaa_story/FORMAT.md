# Format: aaa_story (third-person cinematic story, premium animated-short look)

For big set-piece adventures told in third person, past tense ("Ryan sprinted down the tunnel..."), one narrator, characters act silently.
Reference story: `stories/mystery-box`. Standalone ending, **no subscribe CTA** (lint does not require one), no part 2. Kid-friendly: scary, never gory.

Limits: 90-180 scenes, 120-190 s, up to 16 words per line (per shot: a line with N extra `shots` may have 16*(N+1) words). Hook in line 1.
Defaults (injected from format.json when the story leaves them unset; set `"genre": "aaa_story"`): `"format": {"fps": 60}`, `"music": "epic"`, `"narrator": "narrator_deep"`,
`"style": {"look": "aaa", "bloom": 0.45, "captionWords": 2, "uppercase": false, "emphColor": "#FFE14D", "activeColor": "#FFE14D", "captionY": 0.62}`
(= 1-2 words, lowercase, yellow with black outline, ~62% of the height; the engine already draws the outline).

Recipe
- A cut every 1-2 s: every scene gets a purposeful `cam`, lines of 8+ words get `shots` (2-3 cuts). Mix `low lens90`, `fly`, `track`, `whip`, `crash`, `dutch`, `pov:<id>`, `top`, extreme close-ups of faces and props.
- One `sky` + `grade` per mood, changed with `skyTo`/`gradeTo` or `"a>b@word"`; `weather` where it helps; `fx` quarks on every impact (slam, shockwave_ring, dust_cloud, debris, sparks, embers, ice_shatter, electric_arc, magic_burst, confetti_cannon).
- Worlds (`loc`): town_square ice_world sky_island gold_city ocean_world jungle tunnel stone_court; portals with the `mysterybox` set-piece; crowds with `mob`/`crowd`; creatures as cast members; `link` for carry/hug/hold_hands.
- Face acting on every beat: expression + `gaze`/`brows`/`tears`. Check `--preview --only a,b,c` in groups of ~15 scenes; check set-pieces with `render.mjs --stills`.
- Emotional anchor (a parent, a promise) planted early, paid off in the last scenes.
