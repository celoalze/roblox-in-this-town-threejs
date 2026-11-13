# assets/vfx/fx - data-driven particle effects

File name = fx type. Use in a story as `"fx": "dust_cloud:milo@land"` or long form `{"type": "dust_cloud", "pos": [x,y,z], "at": 0.3, "scale": 1, "seed": 3, "color": "#fff"}`.
`scale` scales size, speed and gravity; `color` recolours every emitter (colour ranges collapse to that colour); `seed` changes the randomness; `loop: true` makes every emitter loop.
Format reference: header of `engine/quarks.js`. Everything is deterministic (same seed + time = same pixels).
`pos` is the effect origin. Ground effects: put y at the floor. Air effects: y at the centre. Characters are ~5 units tall, a "wide" portrait frame shows ~15-25 units.

| fx | what | notes / key options | typical use |
|---|---|---|---|
| explosion | white flash, orange fireball, rising grey-brown smoke column, sparks, ring | pos = fireball centre (y 3), scale 1 = ~10 u fireball, 4 s | bombs, crashes |
| sparks | fast yellow streaks + flash | 1.2 s, points toward the camera (+Z) | metal hits, welding, short circuit |
| fire | looping campfire: flame, glow, smoke, embers | pos = ground, scale 1 = ~4 u tall | camp, burning things |
| fire_torch | small looping flame + glow | pos = flame tip base, ~3 u tall | torch, candle (scale .5) |
| smoke_plume | tall billowing grey column, loops | already in steady state at t=0 (prewarm), ~20 u tall; `color` for black/white smoke | chimney, fire aftermath |
| dust_cloud | one-shot beige puff + dirt chunks | pos on ground | landing, impact, door slam |
| dust_trail | continuous low puffs, loops | world-space: leaves a trail behind a moving anchor (`fx` on an actor) | running, vehicle |
| shockwave_ring | flat expanding white/blue ring + dust ring | ~28 u wide in 0.9 s, flat on the ground | slam, big landing |
| impact_hit | yellow comic star + white star, flash, ring, sparks | 1.5 s, camera-facing, pos at hit point | punch, bonk |
| magic_burst | purple/cyan stars, glow, magic circle, ring | 2 s | spell cast, transformation |
| magic_aura | looping orbiting sparkles around a point | pos = ground under the character | power-up, charging |
| heal_sparkles | looping green/gold plus signs rising | pos = ground | healing, level up |
| electric_arc | blue-white jagged bolts flashing for 0.7 s | pos = centre, light flicker | zap, shock |
| fireworks | rocket trail, 3-colour burst (gold/pink/cyan) + crackle | rocket rises 10 u (scale up to enlarge), burst at ~1 s; put far from camera | celebration |
| confetti_cannon | 6-colour confetti with spin, flutter and drag | pos at the cannon mouth; fires upward | party, win |
| snow_flurry | looping soft flakes in a 44x22 box | box top 14 u above pos; use at the scene's centre, y = 0 | winter |
| rain_splash | looping ground rings, droplets, falling streaks on a 30x14 patch | pos = ground (the `weather` system is the full rain; this is a close-up detail) | puddles |
| fog_bank | slow big soft blue-grey puffs, low opacity, loops | covers ~34 u wide, rises to 6 u | mist, spooky |
| glow_orb | pulsing glowing sphere with rays and motes | `color` tints (default cyan); light | wisp, energy ball, pickup |
| portal_swirl | looping purple/cyan vortex on a ring, faces the camera | pos = centre (y ~5), 11 u across | portals, teleport |
| ice_shatter | blue shards burst + frost mist + sparkles | 2.5 s | freeze breaking, glass |

(Older set-pieces from engine/vfx.js and others, e.g. smoke, dustwave, debris, crack, slam, are separate files.)

## Author a new effect in 5 minutes
1. Copy the closest file here, rename it (snake_case English), edit. Emitters are drawn in `order` (higher on top). Lint picks the file up as an fx type.
2. Pick for each emitter: `texture` (procedural `soft spark ring star streak puff glow plus confetti drop flame shard bolt`, or a Kenney sprite `assets/vfx/textures/kenney/<name>.png`), `blend` (`add` glows, `normal` for anything that must read on the bright daylight plaza: smoke, dust, confetti, ice), `shape` + `speed`, `life`, `size`, `color` (two colours = random between), `rate` (per second) or `burst: [[time, count]]`.
3. Shape over life with `over`: `size` curve, `color` stops `[colour, t, alpha]` (alpha 0 at both ends = soft fade in/out), `gravity`, `drag` (0.05 gentle, 0.1 strong), `noise`, `rotate`, `orbit`.
4. Orientation: shapes lie in the XY plane and fire along +Z. `rot: [-90,0,0]` = cone/circle/rectangle fire UP / lie flat; `rot: [90,0,0]` = fire DOWN. `mode: "flat"` lays the sprites on the ground (rings). `mode: "stretch"` = streaks along velocity.
5. Rectangles and circles give position only (speed 0); give motion with `over.gravity` + `over.drag` (terminal speed = gravity / (20 * drag)) or a cone shape with `speed`.
6. Timing: `looping: true` + `prewarm: true` for ambience; `start: s` delays an emitter; `move` + `moveTime` travels the emitter (rocket); `at: [x,y,z]` offsets it.
7. Do NOT set `alpha` for fades, use the `over.color` alpha (the `alpha` key is applied twice by the engine). Test: add a scene to `stories/_quarkstest/story.json`, `python pipeline/produce.py _quarkstest --preview`, then `node engine/render.mjs out/_quarkstest/timeline.json out/_quarkstest/st --stills t1,t2,t3 --scale 0.4` (effect time = still time - scene start - fx `at`; re-run produce after editing a fx JSON so the timeline carries the new spec).

Texture notes: Kenney Particle Pack (CC0) sprites are black-background; the engine transparently loads the white + luminance-alpha copies in `assets/vfx/textures/kenney_a/` (same file names), so they work with both blends. Re-generate a copy with the same recipe if you add a sprite to `kenney/`.
