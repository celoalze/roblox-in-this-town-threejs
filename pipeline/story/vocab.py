"""Load the story vocabulary from its registry and existing data sources."""

import json
from pathlib import Path
from paths import ROOT


VOCAB_DATA = json.loads((ROOT / "config" / "vocab.json").read_text(encoding="utf-8"))


def _visible_keys(data):
    """Return keys that are not private metadata entries."""
    return {key for key in data if not key.startswith("_")}


def _json(name):
    """Read one project JSON data source."""
    return json.loads((ROOT / "config" / name).read_text(encoding="utf-8"))


MODEL_PROPS = {key: value for key, value in _json("model_props.json").items() if not key.startswith("_")}
WEARABLES = _visible_keys(_json("wearables.json"))
CLOTHES = _json("roblox_clothes.json")

ANIMS = set(VOCAB_DATA["procedural_anims"]) | set(VOCAB_DATA["procedural_anim_extras"])
ANIMS |= {
    key
    for path in (ROOT / "config").glob("anims*.json")
    for key in json.loads(path.read_text(encoding="utf-8"))
    if not key.startswith("_")
}

EXPRS = set(VOCAB_DATA["basic_exprs"]) | set(VOCAB_DATA["face2_exprs"])
BROWS = set(VOCAB_DATA["brow_styles"])
PUPILS = set(VOCAB_DATA["pupils"])
GAZES = set(VOCAB_DATA["gaze_words"]) | set(VOCAB_DATA["gaze_extras"])

PROPS = set(VOCAB_DATA["procedural_props"])
PROPS |= set(MODEL_PROPS) | WEARABLES
NO_HOLD = set(VOCAB_DATA["no_hold_props"])
NO_HOLD = (NO_HOLD - {key for key, value in MODEL_PROPS.items() if value.get("hold")}) | {
    key for key, value in MODEL_PROPS.items() if not value.get("hold")
}

SFX = {path.stem for path in (ROOT / "assets" / "audio" / "sfx").glob("*")} | set(VOCAB_DATA["synth_sfx"])

FX = set(VOCAB_DATA["builtin_fx"])
FX |= {path.stem for path in (ROOT / "assets" / "vfx" / "fx").glob("*.json") if not path.stem.startswith("_")}
FX |= _visible_keys(_json("fx_combos.json"))
FX |= set(VOCAB_DATA["engine_fx_cases"])

CREATURE_ANIMS = set(VOCAB_DATA["creature_anims"])
LINK_MODES = set(VOCAB_DATA["link_modes"])
BEHAVIOURS = set(VOCAB_DATA["crowd_behaviours"])
SHOTS = set(VOCAB_DATA["camera_shots"])
MOVES = set(VOCAB_DATA["camera_moves"])
