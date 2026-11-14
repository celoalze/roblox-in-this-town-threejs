"""Compact story notation -> full engine schema. Pure text transform (no assets, no TTS); errors are collected for --lint.

Everything here is optional sugar: the long object form documented in docs/REFERENCE.md still works and can be mixed in.

  cast      ["milo", "zoe"]  or  {"milo": {}, "coach": {...spec}}        presets: config/cast.json
  loc       name from story "locations" or config/locations.json presets
  cam       "close milo -15 push punch"     shot · target · angle · move · punch · shake · z1.2 (zoom) · ots:<id>
              lens90 (wide lens, subject keeps its size) · fov70 · h0.4 (camera height over the look point) · dutch / dutch-12 (roll) · crash (crash zoom)
              whip / whip- (whip pan in, from the right / left) · whipout · pov:<id> (through their eyes; tilt40 = look down at the hands) · dof1.5
  shots     ["@word close zoe punch", "@60% low milo lens90 whip"]   more camera set-ups inside the same scene, each cutting in at @when
  actors    ["milo -3,0 f20 angry/shocked +trophy", "zoe >milo wave/grin", "jay to:5,-3 run"]
              id · x,z · fDEG or >id/>camera · anim/expr (either side optional) · to:x,z · run · +prop[@time] · +L:prop (left hand)
              omitted x,z / face = same as that actor's last scene in this location
  sfx       "boom@loudest crowd_laugh@pigeon*0.4"     name[@time][*vol]
  fx        "confetti:milo@record rain"               type[:actor[:mode]][@time]
  props     ["trophy 2,-1 r90 s1.5", {...}]           placed props; held props go on the actor (+prop)
  overlay   "speedlines flash"
  time (@)  word of the line (boom@loudest, 2nd occurrence loudest#2) · seconds (@0.4) · percent (@50%)
"""

import json, re
from pathlib import Path
from paths import ROOT
from story.vocab import MOVES, SHOTS

NUM = re.compile(r"^-?\d+(\.\d+)?$")
XZ = re.compile(r"^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$")


def _load(name):
    f = ROOT / "config" / name
    return (
        {k: v for k, v in json.loads(f.read_text(encoding="utf-8")).items() if not k.startswith("_")}
        if f.exists()
        else {}
    )


def when(v):
    """'0.4' -> 0.4 · '50%' -> '50%' · 'word' -> 'w:word'"""
    if NUM.match(v):
        return float(v)
    return v if v.endswith("%") or v.startswith("w:") else "w:" + v


def xz(v):
    m = XZ.match(v)
    return [float(m[1]), float(m[2])] if m else None


def cam(text, sc, cast, err):
    c = {}
    for tk in text.split():
        if tk in SHOTS:
            sc["shot"] = tk
        elif tk in MOVES:
            c["move"] = tk
        elif tk == "punch":
            sc["punch"] = True
        elif tk == "shake":
            c["shake"] = 0.5
        elif NUM.match(tk):
            c["angle"] = float(tk)
        elif tk[0] == "z" and NUM.match(tk[1:]):
            c["zoom"] = float(tk[1:])
        elif tk.startswith("ots:"):
            sc["shot"] = "ots"
            c["over"] = tk[4:]
        elif tk.startswith("pov:"):
            c["pov"] = tk[4:]
            c.setdefault("target", tk[4:])
        elif tk == "crash":
            c["crash"] = 1
        elif tk in ("whip", "whip-"):
            c["whip"] = -1 if tk[-1] == "-" else 1
        elif tk in ("whipout", "whipout-"):
            c["whipOut"] = -1 if tk[-1] == "-" else 1
        elif tk.startswith("dutch") and (tk == "dutch" or NUM.match(tk[5:])):
            c["roll"] = float(tk[5:] or 12)
        elif re.match(r"^(lens|fov|tilt|dof|h)-?[\d.]+$", tk):
            k = re.match(r"[a-z]+", tk)[0]
            c[{"h": "height"}.get(k, k)] = float(tk[len(k) :])
        elif tk in cast or tk in ("group", "both"):
            c["target"] = tk
        else:
            err(f"cam: unknown token '{tk}'")
    return c


def crowd(text, err):
    """'flee 12 from:rex @roars /scared' -> {do, n, on, at, expr}. do = watch walk flee panic gather queue, or any anim (cheer dance laugh clap...)."""
    c = {"do": "watch", "n": 8}
    for t in text.split():
        if t.isdigit():
            c["n"] = int(t)
        elif t[0] == "@":
            c["at"] = when(t[1:])
        elif t[0] == "/":
            c["expr"] = t[1:]
        elif t.split(":")[0] in ("on", "from", "around", "to") and ":" in t:
            v = t.split(":", 1)[1]
            c["on"] = xz(v) or v
        elif re.match(r"^[a-z][a-z0-9_+]*$", t):
            c["do"] = t
        else:
            err(f"crowd: unknown token '{t}'")
    return c


def actor(text, sc, cast, err):
    tk = text.split()
    a = {"id": tk[0]}
    last_lr = None
    if tk[0] not in cast:
        err(f"actor '{tk[0]}' not in cast")
    for t in tk[1:]:
        if t.startswith(("link:", "reach:", "until@", "until:")) and "/" in t:
            t, _, ex = t.partition("/")
            a["expr"] = ex  # "link:dad:hug/love" = link + expression
        if xz(t):
            a["at"] = xz(t)
        elif t[0] == "f" and NUM.match(t[1:]):
            a["face"] = float(t[1:])
        elif t[0] == ">":
            a["face"] = "camera" if t[1:] in ("cam", "camera") else t[1:]
        elif t.startswith("look:"):
            a["look"] = t[5:]  # head follows that actor (look:none = keep the head still)
        elif fm := re.match(
            r"^(gaze|brows|pupils|tears)(?::([^@]+))?(?:@(.+))?$", t
        ):  # face v2: gaze:left|<id>|x,y  brows:angry  pupils:small  tears[:off]  ; @word = from that word on
            k, v, at = fm.groups()
            v = (
                (v not in ("off", "no", "false"))
                if k == "tears"
                else ([float(x) for x in v.split(",")] if v and re.match(r"^-?[\d.]+,-?[\d.]+$", v) else v)
            )
            if v is None:
                err(f"actor {tk[0]}: '{k}' needs a value ({k}:<value>)")
            elif at:
                a.setdefault("facev", []).append({"at": when(at), k: v})
            else:
                a[k] = v
        elif t.startswith(
            "link:"
        ):  # link:<carrier>:<mode>[:L][@when]  -> this actor rides / holds / hugs the carrier's body (engine/links.js)
            h, _, at = t[5:].partition("@")
            q = h.split(":")
            if len(q) < 2:
                err(f"actor {tk[0]}: link needs link:<carrier>:<mode>")
                continue
            a["link"] = last_lr = {
                "to": q[0],
                "mode": q[1],
                **({"side": q[2].upper()} if len(q) > 2 else {}),
                **({"at": when(at)} if at else {}),
            }
        elif t.startswith(
            "reach:"
        ):  # reach:<actorId|propId|x,y,z>[:L][@when]  -> the arm points at that target (door handle, chain...)
            h, _, at = t[6:].partition("@")
            m = re.match(r"^(-?[\d.]+,-?[\d.]+,-?[\d.]+)(?::([LR]))?$", h)
            if m:
                a["reach"] = last_lr = {"target": [float(x) for x in m[1].split(",")], "arm": m[2] or "R"}
            else:
                q = h.split(":")
                a["reach"] = last_lr = {"target": q[0], "arm": (q[1] if len(q) > 1 else "R").upper()}
            if at:
                a["reach"]["at"] = when(at)
        elif t.startswith("until@") or t.startswith("until:"):  # end of the last link / reach on this actor
            tgt = last_lr
            if tgt is None:
                err(f"actor {tk[0]}: '{t}' needs a link: or reach: before it")
                continue
            tgt["until"] = when(t[6:])
        elif t.startswith("to:") and xz(t[3:]):
            a["to"] = xz(t[3:])
        elif t.startswith("to:") and re.match(r"^-?[\d.]+,-?[\d.]+,-?[\d.]+$", t[3:]):
            v = [float(x) for x in t[3:].split(",")]
            a["to"] = v[:2]
            a["toy"] = v[2]  # to:x,z,y = also changes height
        elif t[0] == "y" and NUM.match(t[1:]):
            a["y"] = float(t[1:])  # stand at height y (on a cloud, island, whale...)
        elif t.startswith("sp") and NUM.match(t[2:]):
            a["speed"] = float(t[2:])  # travel speed of to: (units/s; walk 7, run 15)
        elif t.startswith("arc") and NUM.match(t[3:]):
            a["arc"] = float(t[3:])  # hop/leap height of a move
        elif t == "run" and "to" in a or t == "run":
            a["anim"] = "run"
        elif t[0] == "+":
            p, _, at = t[1:].partition("@")
            left = p.startswith("L:")
            p = p[2:] if left else p
            prop = {"type": p, "hand": tk[0]}
            if left:
                prop["left"] = True
            if at:
                prop["from"] = when(at)
                prop["pop"] = True
            sc.setdefault("props", []).append(prop)
        elif re.match(r"^([a-z][a-z0-9_]*(\+[a-z][a-z0-9_]*)*)?(/[a-z_]+)?$", t):
            an, _, ex = t.partition("/")
            if an:
                a["anim"] = an
            if ex:
                a["expr"] = ex
        else:
            err(f"actor {tk[0]}: unknown token '{t}'")
    return a


def sfx(text):
    out = []
    for t in text.split():
        t, _, vol = t.partition("*")
        name, _, at = t.partition("@")
        s = {"name": name}
        if at:
            s["at"] = when(at)
        if vol:
            s["vol"] = float(vol)
        out.append(s)
    return out


def fx(text):
    out = []
    for t in text.split():
        t, _, at = t.partition("@")
        p = t.split(":")
        f = {"type": p[0]}
        if len(p) > 1 and p[1]:
            f["on"] = p[1]
        if len(p) > 2:
            f["mode"] = p[2]
        if at:
            f["at"] = when(at)
        out.append(f)
    return out


def prop(text, err):
    tk = text.split()
    p = {"type": tk[0]}
    for t in tk[1:]:
        if xz(t):
            p["at"] = xz(t)
        elif t[0] == "r" and NUM.match(t[1:]):
            p["rot"] = float(t[1:])
        elif t[0] == "s" and NUM.match(t[1:]):
            p["scale"] = float(t[1:])
        elif t[0] == "y" and NUM.match(t[1:]):
            p["y"] = float(t[1:])
        elif t[0] == "@":
            p["from"] = when(t[1:])
            p["pop"] = True
        elif t.startswith("under:"):
            p["under"] = t[6:]  # follows that actor's feet (cloud/board carrying them); y = offset
        elif t.startswith("drift:") and re.match(r"^-?[\d.]+,-?[\d.]+,-?[\d.]+$", t[6:]):
            p["drift"] = [float(x) for x in t[6:].split(",")]  # units/second
        elif t.startswith("c:"):
            p["color"] = t[2:]
        elif t.startswith("spin:") and NUM.match(t[5:]):
            p["spin"] = float(t[5:])
        elif t.startswith("shrink:") and NUM.match(t[7:]):
            p["shrink"] = float(t[7:])
        elif t.startswith("dx:") and NUM.match(t[3:]):
            p["dx"] = float(t[3:])
        elif t.startswith("bob:") and NUM.match(t[4:]):
            p["bob"] = float(t[4:])
        elif t.startswith("until:"):
            p["until"] = when(t[6:])
        else:
            err(f"prop {tk[0]}: unknown token '{t}'")
    return p


def expand(story):
    """In place. Returns the story; problems land in story['_errors'] (printed by --lint, block a render)."""
    E = story.setdefault("_errors", [])
    presets = {**_load("creatures.json"), **_load("cast.json")}
    c = story.get("cast", {})  # creatures are cast members too
    if isinstance(c, list):
        c = {
            k: v for x in c for k, v in (x.items() if isinstance(x, dict) else [(x, {})])
        }  # names and {name: spec} can be mixed
    for k, v in list(c.items()):
        base = presets.get((v or {}).get("like", k))
        if base is None and not v:
            E.append(f"cast '{k}': no preset in config/cast.json (define it inline)")
        c[k] = {**(base or {}), **{a: b for a, b in (v or {}).items() if a != "like"}}
        c[k].pop("rig", None)  # R15 is the only character rig (spec.rig of old stories is ignored)
    story["cast"] = c
    locs = {**_load("locations.json"), **story.get("locations", {})}
    story["locations"] = locs
    last = {}  # (loc, actor) -> face
    for i, sc in enumerate(story["scenes"]):
        err = lambda m, i=i, sc=sc: E.append(f"#{i} '{(sc.get('line') or '')[:28]}': {m}")
        if "loc" not in sc and "set" not in sc and i:
            sc["loc"] = story["scenes"][i - 1].get("loc") or sc.get("loc")
        if sc.get("loc") is None:
            sc.pop("loc", None)
        if isinstance(sc.get("cam"), str):
            sc["camera"] = {**cam(sc.pop("cam"), sc, c, err), **sc.get("camera", {})}
        if "camera" in sc and "angle" not in sc["camera"] and isinstance(sc["camera"].get("target", ""), str):
            sc["camera"]["angle"] = 18 if i % 2 else -18
        shots = []
        for j, sh in enumerate(sc.get("shots", [])):  # "@when cam words" -> {at, shot, camera, punch}
            if isinstance(sh, str):
                tk = sh.split()
                o = {}
                if not tk or tk[0][0] != "@":
                    err(f"shots: '{sh}' must start with @when")
                    continue
                cm = cam(" ".join(tk[1:]), o, c, err)
                sh = {"at": when(tk[0][1:]), **o, "camera": cm}
                if "target" not in cm and sc.get("camera", {}).get("target") is not None:
                    cm["target"] = sc["camera"]["target"]
                if (
                    "angle" not in cm
                    and "pov" not in cm
                    and cm.get("move") != "track"
                    and isinstance(cm.get("target", ""), str)
                ):
                    cm["angle"] = 18 if (i + j) % 2 == 0 else -18
            shots.append(sh)
        if shots:
            sc["shots"] = shots
        acts = []
        for a in sc.get("actors", []):
            if isinstance(a, str):
                a = actor(a, sc, c, err)
                key = (sc.get("loc") or sc.get("set"), a["id"])
                if "face" not in a and "to" not in a and key in last:
                    a["face"] = last[key]
                if "face" in a:
                    last[key] = a["face"]
                elif "to" in a:
                    last.pop(key, None)
            acts.append(a)
        if acts:
            sc["actors"] = acts
        if isinstance(sc.get("crowd"), str):
            sc["crowd"] = crowd(sc["crowd"], err)
        if isinstance(sc.get("sfx"), str):
            sc["sfx"] = sfx(sc["sfx"])
        if isinstance(sc.get("fx"), str):
            sc["fx"] = fx(sc["fx"])
        if isinstance(sc.get("overlay"), str):
            sc["overlay"] = sc["overlay"].split()
        if "props" in sc:
            sc["props"] = [prop(p, err) if isinstance(p, str) else p for p in sc["props"]]
    return story
