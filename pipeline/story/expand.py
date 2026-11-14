"""Story normalization: expands compact shorthand into fully-qualified scene objects.

Owns scene defaulting, location/sky/weather inheritance, treatments, dressing, and fx combos.
Must not perform I/O beyond reading static config/format files, and must not synthesize assets.
"""

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import FORMATS


norm = lambda w: re.sub(r"[^a-z0-9']", "", w.lower())


def resolve_at(v, sc):
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    v = str(v)
    if v.endswith("%"):
        return float(v[:-1]) / 100 * sc["dur"]
    if v.startswith("w:"):
        word, _, n = v[2:].partition("#")
        n = int(n or 1)
        c = 0
        for w in sc.get("words", []):
            if norm(w["w"]) == norm(word):
                c += 1
                if c == n:
                    return w["s"] - sc["start"]
        print(f"  ! word '{word}' not found in scene line")
        return 0.0
    return float(v)


def expand(story):
    """Shorthand -> full scenes. `locations: {name: {set, setOpts, time}}` + scene `loc`; loc/set/setOpts/time inherit from the previous scene."""
    from story import shorthand

    shorthand.expand(story)
    g = story.get("genre")
    if g and (FORMATS / g / "format.json").exists():  # genre defaults fill anything the story leaves unset
        for k, v in json.loads((FORMATS / g / "format.json").read_text(encoding="utf-8")).get("defaults", {}).items():
            if k not in story:
                story[k] = v
            elif isinstance(v, dict) and isinstance(story[k], dict):
                story[k] = {**v, **story[k]}
    locs = story.get("locations", {})
    prev = {}
    for sc in story["scenes"]:
        if sc.get("loc") not in (None, *locs):
            story["_errors"].append(f"unknown loc '{sc['loc']}' (config/locations.json or story locations)")
            sc.pop("loc")
        if "loc" not in sc and "set" not in sc and "loc" in prev:
            sc["loc"] = prev["loc"]
        if "loc" in sc:
            L = locs[sc["loc"]]
            sc["set"] = L.get("set", "kit")
            sc["setOpts"] = {**L.get("setOpts", {}), **sc.get("setOpts", {})}
            if "seed" in L:
                sc.setdefault("seed", L["seed"])
            if "time" not in sc and "time" in L and prev.get("loc") != sc["loc"]:
                sc["time"] = L["time"]
        elif "set" not in sc and prev.get("set"):
            sc["set"] = prev["set"]
            sc["setOpts"] = prev.get("setOpts", {})
        if "time" not in sc and "time" in prev:
            sc["time"] = prev["time"]
        prev = sc
    for sc in story[
        "scenes"
    ]:  # "portal": "<loc>" or {"loc", "sky", "z"} on a prop: the world seen through its doorway (procedural sets only)
        for p in sc.get("props", []):
            d = p.get("portal") if isinstance(p, dict) else None
            if not d:
                continue
            d = {"loc": d} if isinstance(d, str) else dict(d)
            L = locs.get(d.get("loc"))
            if L is None or L.get("set", "kit") in ("kit", "map"):
                story["_errors"].append(f"portal: '{d.get('loc')}' must be a procedural world (--vocab world)")
                p.pop("portal")
                continue
            p["portal"] = {
                "set": L["set"],
                "setOpts": L.get("setOpts", {}),
                "time": d.get("time", L.get("time", "day")),
                **({"seed": L["seed"]} if "seed" in L else {}),
                **{k: d[k] for k in ("sky", "z", "y") if k in d},
            }
    SK = shorthand._load("skies.json")
    sky = None  # sky: skybox name, inherited until changed ("none" = back to the plain gradient); "a>b@when" = changes mid-scene
    for sc in story["scenes"]:
        v = sc.get("sky", sky)
        if isinstance(v, str) and ">" in v:
            a, _, rest = v.partition(">")
            b, _, at = rest.partition("@")
            sc["skyTo"] = {"sky": b, "at": shorthand.when(at) if at else "40%"}
            v = a
            sky = b
        else:
            sky = v
        if v in (None, "none"):
            sc.pop("sky", None)
            sky = None if v == "none" else sky
            continue
        for n in [v] + ([sc["skyTo"]["sky"]] if "skyTo" in sc else []):
            if n not in SK:
                story["_errors"].append(f"unknown sky '{n}' (config/skies.json: {' '.join(SK)})")
        sc["sky"] = v
        if "time" not in sc and SK.get(v, {}).get("time"):
            sc["time"] = SK[v]["time"]
        if isinstance(sc.get("grade"), str) and ">" in sc["grade"]:
            a, _, rest = sc["grade"].partition(">")
            b, _, at = rest.partition("@")
            sc["grade"] = a
            sc["gradeTo"] = {"grade": b, "at": shorthand.when(at) if at else "40%"}
    looks(story)
    WX = shorthand._load("weather.json")
    cur = None  # weather: inherited until changed; a preset may force the time of day
    for sc in story["scenes"]:
        cur = sc.get("weather", cur)
        if cur in (None, "clear", "none"):
            sc.pop("weather", None)
            cur = None
            continue
        if cur not in WX:
            story["_errors"].append(f"unknown weather '{cur}' (config/weather.json: {' '.join(WX)})")
            sc.pop("weather", None)
            cur = None
            continue
        sc["weather"] = cur
        if WX[cur].get("time"):
            sc["time"] = WX[cur]["time"]
    dress(story)
    combos(story)
    return story


def looks(story):
    """Scene look = story first, then biome, then SOFT world defaults (config/biomes.json, config/world_profile.json).
    `biome`/`treat`/`medium` inherit until changed; "none" switches off (also the world default). Nothing here ever blocks a scene."""
    from story import shorthand

    B = shorthand._load("biomes.json")
    P = shorthand._load("world_profile.json")
    T_ = shorthand._load("treatments.json")
    biome = treat = medium = None
    off_t = off_m = False
    for sc in story["scenes"]:
        if "biome" in sc:
            biome = None if sc["biome"] in (None, "none") else sc["biome"]
            if biome and biome not in B:
                story["_errors"].append(f"unknown biome '{biome}' (config/biomes.json: {' '.join(B)})")
                biome = None
            if "treat" not in sc:
                treat = None
                off_t = False
            if "medium" not in sc:
                medium = None
                off_m = False
        if "treat" in sc:
            if sc["treat"] in (None, "none"):
                treat = None
                off_t = True
            else:
                treat = sc["treat"]
                off_t = False
                for t in treat if isinstance(treat, list) else [treat]:
                    if str(t).split(":")[0] not in T_:
                        story["_errors"].append(f"unknown treat '{t}' (config/treatments.json: {' '.join(T_)})")
        if "medium" in sc:
            if sc["medium"] in (None, "none"):
                medium = None
                off_m = True
            else:
                medium = sc["medium"]
                off_m = False
        b = B.get(biome, {})
        w = P.get(sc.get("set"), {})
        t = treat or (None if off_t else (b.get("treat") or w.get("treat")))
        m = medium or (None if off_m else (b.get("medium") or w.get("medium")))
        if m == "underwater":  # underwater always gets the water tint + bubbles
            t = (t if isinstance(t, list) else [t] if t else []) + ["underwater"]
            if not any(
                isinstance(f, dict) and f.get("type") == "bubbles"
                for f in sc.get("fx", [])
                if isinstance(sc.get("fx"), list)
            ):
                sc["fx"] = (sc["fx"] if isinstance(sc.get("fx"), list) else []) + [
                    {"type": "bubbles", "pos": [0, 0, 0], "at": 0, "loop": True}
                ]
        if t:
            sc["treat"] = t
        else:
            sc.pop("treat", None)
        if m:
            sc["medium"] = m
        else:
            sc.pop("medium", None)
        if b.get("weather") and "weather" not in sc:
            sc["weather"] = b["weather"]


def dress(story):
    """config/dressing.json: scenes in a known world get its scatter props automatically (richer sets with zero author effort)."""
    from story import shorthand

    D = shorthand._load("dressing.json")
    if story.get("style", {}).get("dressing") is False:
        return
    for sc in story["scenes"]:
        k = sc.get("dress", 1)
        preset = D.get(sc.get("set"))
        if (
            not preset
            or k is False
            or k == 0
            or any(isinstance(p, dict) and p.get("type") == "scatter" for p in sc.get("props", []))
        ):
            continue
        k = 1 if k is True else float(k)
        sc["props"] = list(sc.get("props", [])) + [
            {**p, **({"n": max(1, round(p["n"] * k))} if "n" in p else {})} for p in preset
        ]


def combos(story):
    """config/fx_combos.json: composite fx (impact_big, blast, ...) -> their parts + automatic sound."""
    from story import shorthand

    C = shorthand._load("fx_combos.json")
    for sc in story["scenes"]:
        out = []
        for f in sc.get("fx", []) if isinstance(sc.get("fx"), list) else []:
            c = C.get(f.get("type")) if isinstance(f, dict) else None
            if not c:
                out.append(f)
                continue
            base = f.get("pos", [0, 0, 0])
            at = f.get("at", 0)
            sc_ = f.get("scale", 1)
            for p in c["parts"]:
                q = {k: v for k, v in p.items() if k not in ("off", "dt")}
                o = p.get("off", [0, 0, 0])
                q["pos"] = [base[i] + o[i] * sc_ for i in range(3)]
                q["scale"] = p.get("scale", 1) * sc_
                q["_part"] = True
                if isinstance(at, (int, float)):
                    q["at"] = at + p.get("dt", 0)
                elif "at" in f:
                    q["at"] = at
                for kk in ("on", "mode"):
                    if kk in f:
                        q[kk] = f[kk]
                out.append(q)
            for name, dt, vol in c.get("sfx", []):
                sc.setdefault("sfx", []).append(
                    {"name": name, "at": (at + dt) if isinstance(at, (int, float)) else at, "vol": vol}
                )
        if out or "fx" in sc:
            sc["fx"] = out
