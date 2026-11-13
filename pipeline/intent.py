"""SOFT scene-intent check: does what the story SAYS about a place show up on screen? Never blocks, never forbids.

  intent.advise(story)     before rendering: story text names a concept the scene setup does not deliver -> suggestion
  intent.check(tl, stills) after frame QA: concept in the text but the frame lacks it -> warning with the fix

Silence per scene: "intent": "none" (no checks) or "allow": ["ocean"]. "intent": ["ocean"] replaces the text guess with your own list.
"""
import json, re
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
_load = lambda n: {k: v for k, v in json.loads((ROOT / "config" / n).read_text(encoding="utf-8")).items() if not k.startswith("_")}


def concepts(sc, I):
    iv = sc.get("intent")
    if iv == "none": return []
    if iv: return [c for c in ([iv] if isinstance(iv, str) else iv) if c in I and c not in (sc.get("allow") or [])]
    text = " ".join(str(sc.get(k) or "") for k in ("title", "line")).lower(); words = set(re.findall(r"[a-z']+", text))
    return [c for c, d in I.items() if words & set(d["words"]) and c not in (sc.get("allow") or [])]


def supported(sc, c, I, P):
    d = I[c]; w = P.get(sc.get("set"), {}); tr = sc.get("treat"); tr = tr if isinstance(tr, list) else [tr]
    return bool(set(w.get("tags", [])) & set(d.get("tags", [])) or sc.get("medium") in d.get("media", []) or
                {str(x).split(":")[0] for x in tr} & set(d.get("treats", [])) or sc.get("biome") in d.get("biomes", []) or not d.get("expect"))


def advise(story):
    """Story must already be expanded (set / treat / medium resolved per scene)."""
    I, P = _load("intents.json"), _load("world_profile.json"); out = []
    for i, sc in enumerate(story["scenes"]):
        for c in concepts(sc, I):
            if not supported(sc, c, I, P): out.append(f"  #{i} text suggests '{c}' but set={sc.get('set')} delivers none of it -> {I[c]['hint']}  (ignore: \"allow\": [\"{c}\"])")
    return out


def classes(img):
    a = np.asarray(Image.open(img).convert("RGB").resize((72, 128)), dtype=np.float32) / 255.0
    mx, mn = a.max(-1), a.min(-1); v = mx; d = np.maximum(mx - mn, 1e-6); sat = (mx - mn) / np.maximum(mx, 1e-6)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    water = (hue > 170) & (hue < 235) & (sat > .3) & (v > .25)
    snow = ((sat < .25) & (v > .5)) | ((hue > 175) & (hue < 235) & (sat < .55) & (v > .7))
    foliage = (hue > 65) & (hue < 165) & (sat > .28) & (v > .15)
    sand = (hue > 28) & (hue < 58) & (sat > .22) & (sat < .65) & (v > .6)
    fire = ((hue < 40) | (hue > 345)) & (sat > .65) & (v > .75)
    return {"water": float(water.mean()), "snow": float(snow.mean()), "foliage": float(foliage.mean()), "sand": float(sand.mean()), "fire": float(fire.mean())}


def check(tl, samples):
    """samples: {scene index: [still paths]}. Returns warning lines."""
    I = _load("intents.json"); out = []
    for i, sc in enumerate(tl["scenes"]):
        for c in concepts(sc, I):
            for k, need in I[c].get("expect", {}).items():
                got = [sum(classes(p)[x] for x in k.split('+')) for p in samples.get(i, [])]
                if got and max(got) < need: out.append(f"  #{i} '{c}' in the text but only {max(got) * 100:.0f}% of the frame reads as {k} (wants >= {need * 100:.0f}%) -> {I[c]['hint']}  (ignore: \"allow\": [\"{c}\"])")
    return out
