# Real Roblox animations (config/anims_r15.json)

Roblox KeyframeSequence animations (R15, and classic R6 clips) converted to **native R15** entries (`rig: "r15"`, keys with `joints`; format and blending: docs/R15.md section 10). Use them by name like any anim:
`"actors": ["milo ninja_run"]`, `"milo rbx_climb"`, layers `rbx_walk+rbx_wave`. List: `python pipeline/produce.py --vocab anim`.
Names that clash with built-ins are prefixed `rbx_` (rbx_walk, rbx_run, rbx_sprint, rbx_climb, rbx_fall, rbx_jump, rbx_sit, rbx_wave, rbx_point, rbx_cheer, rbx_laugh...);
pack animations are `<pack>_<action>` (ninja_run, zombie_walk, cartoony_fall, superhero_climb...). Sources and ids: the `_sources` key of config/anims_r15.json.

## Adding more (two steps, Python cannot reach Studio)
1. Studio MCP (`list_roblox_studios` for the id, then `execute_luau`, datamodel Edit): run `tools/roblox studio/export_anim.luau` with `IDS = {assetId, ...}` (read-only).
   Only Roblox-owned / public animations load; third-party pack animations return an `error`. To find ids: Animation instances inside a model (`MODELS = {...}`),
   `AssetService:GetBundleDetailsAsync(bundleId)` (animation bundles: BundleType AvatarAnimations, items are folders; `GetObjects` gives the real Animation id),
   or probe ids with `KeyframeSequenceProvider:GetKeyframeSequenceAsync` + `MarketplaceService:GetProductInfo(id).Name`.
   Save the returned JSON string to `cache/rbx_anim/<assetId>.json`.
2. `python tools/assets/rbx_anim.py native <name> <assetId> [--loop N] [--held] [--ground] [--speed X] [--lean R]` writes one native entry into `config/anims_r15.json`.
   `--ground` for walk/run cycles (lowers the body so the lowest foot touches the floor), `--held` for poses that are held, `--speed` replays faster.

## Conversion (summary, details in the header of tools/assets/rbx_anim.py)
R15 poses are Motor6D transforms with identity C0/C1 rotations, so joint = D R D (D = half turn about Y: Roblox front is -Z, engine front is +Z); nothing is retargeted. R6 source clips map their 6 poses onto Shoulder / Hip / Neck / Root (no elbows or knees).
Body: Root = R_HRP * R_LowerTorso (pivot = hip, like Roblox); the pivot translation goes to `y` and `bz`. X translation is dropped.

## Limits
- Priority/blending of Roblox is ignored; one animation drives all joints (use layers `base+upper` to mix).
- A Roblox clip whose rotation exceeds 180 degrees between two keys takes the shortest path like Roblox does; Roblox easing styles are mapped to smooth / linear / back / spring.

## Generated animations (Roblox_Studio `generate_animation`)
For motions no public animation covers. Entries carry the note `generated: <prompt>` in `_sources`.
1. `list_roblox_studios`, then `generate_animation(studio_id, textPrompt, duration, instance_path="Workspace.Rig")` (plain "a character ..." sentence; the first call inserts `Workspace.Rig`, reuse it; parallel calls work; some prompts fail with "Animation generation failed": reword/retry).
   Result: `publishedAssetId` (rbxassetid, R15 KeyframeSequence, loads with KeyframeSequenceProvider like any id) + clip in `ServerStorage.RBX_ASSISTANT_ANIMGEN`. Clips are dense (30 keys/s), all Linear, usually 2-12 s auto length.
2. Export: the Studio HTTP allowlist blocks localhost, so the JSON must come back through the tool result. Make a ModuleScript from `tools/roblox studio/export_anim_module.luau` (returns function(IDS) -> JSON; `require` caches, `:Clone()` it before re-requiring after edits; it thins keys with TOL 0.07 and drops hands/feet), emit the compact form `{"<id>":{"length":L,"rig":"R15","k":[[t,[poses...]],...]}}` and save it to `cache/rbx_anim/<id>.json` (`rbx_anim.py` expands the compact `k` format, `expand()`).
3. `python tools/assets/rbx_anim.py native <name> <id> --loop N|0 [--held]`; check visually with a story of silent scenes `milo 0,0 f20 <name>` (`tests/stories/_r15anim/gen.py`, `tools/assets/animsheet.py`).
4. Cleanup in Studio: destroy `Workspace.Rig`, `ServerStorage.RBX_ASSISTANT_ANIMGEN` and the temporary module.
Held poses are 2-key clips; trim long clips by exporting only the useful keys.

## Hand-authored native anims
Acting anims (kneel, kneel_both, cry_kneel, crawl, crouch_sneak, dig, unchain, pull_door, hug_give, reach, carry_walk, tumble): `python tools/assets/r15_hand.py` writes `config/anims_r15_hand.json`; `y` is solved by FK so soles / knees / hands / the lowest body point rest on the floor. Visual check: `tests/stories/_r15anim` (`python tests/stories/_r15anim/gen.py story`, `produce.py _r15anim --preview`, `gen.py sheet name,name 4 0.5`).
Anims authored in the legacy 6-joint format (`pose()` in engine/characters/character.js, config/anims.json, anims_hand.json, anims_interact.json) reach R15 through `legacyToR15`.
