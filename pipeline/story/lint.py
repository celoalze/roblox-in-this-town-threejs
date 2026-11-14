"""Cheap story checks BEFORE any TTS or image: text report only.

  python pipeline/produce.py stories/<slug>/story.json --lint

1) static: unknown actors/anims/expr/props/hair/kit parts/locations, `w:word` not in the line, `face` target not in scene, long lines
2) staging: engine renders each scene at 3 moments with ESTIMATED timings (no TTS) and reports
   off-screen / hidden heads, camera forced too close by the set, overlapping actors.
Fix everything it reports, then look at --preview once.
"""

import json, re, subprocess
from paths import ROOT
from story.vocab import (
    ANIMS,
    BEHAVIOURS,
    BROWS,
    CLOTHES,
    CREATURE_ANIMS,
    EXPRS,
    FX,
    GAZES,
    LINK_MODES,
    MODEL_PROPS,
    NO_HOLD,
    PROPS,
    PUPILS,
    SHOTS,
    SFX,
    WEARABLES,
)

ENG = ROOT / "engine"


def hint(word, options):
    """' (did you mean x?)' - saves the author a vocabulary lookup."""
    import difflib

    m = difflib.get_close_matches(str(word), list(options), n=2, cutoff=0.6)
    return f" (did you mean {' / '.join(m)}?)" if m else ""


norm = lambda w: re.sub(r"[^a-z0-9']", "", w.lower())


def _fmt(story):
    f = ROOT / "formats" / str(story.get("genre")) / "format.json"
    return json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}


def arc(story, fmt):
    """Genre story-structure checks (format.json: length_seconds, scenes, beats). `beat` on a scene tags its role in the arc."""
    W = []
    sc = story["scenes"]
    n = len(sc)
    if fmt.get("scenes") and not fmt["scenes"][0] <= n <= fmt["scenes"][1]:
        W.append(f"story: {n} scenes, {story.get('genre')} wants {fmt['scenes'][0]}-{fmt['scenes'][1]}")
    words = sum(len(re.sub(r"\[[a-zA-Z _-]+\]", " ", x.get("line", "")).split()) for x in sc)
    est = words / 3.8 + 0.25 * n
    L = fmt.get("length_seconds")
    if L and not L[0] - 8 <= est <= L[1] + 8:
        W.append(f"story: est. {est:.0f}s, {story.get('genre')} wants {L[0]}-{L[1]}s")
    last = next((x.get("line", "") for x in reversed(sc) if x.get("line")), "")
    if fmt.get("cta") and not re.search(fmt["cta"], last, re.I):
        W.append(
            "cta: the LAST spoken line must ask the viewer to subscribe, naturally tied to the story (e.g. 'Subscribe if you love your <person>.')"
        )
    if not fmt.get("beats") or (story.get("genre") != "in_this_world" and not any(x.get("beat") for x in sc)):
        return W  # older genres: arc checked only once scenes carry `beat` tags
    idx = {b: [i for i, x in enumerate(sc) if x.get("beat") == b] for b in fmt["beats"]}
    for x in sc:
        if x.get("beat") and x["beat"] not in idx:
            W.append(f"beat '{x['beat']}' unknown (use {'/'.join(fmt['beats'])})")
    need = fmt.get("need") or {"rule": 1, "example": 2, "hero": 1, "clue": 2, "twist": 1, "choice": 1, "cta": 1}
    for b, k in need.items():
        if b in idx and len(idx[b]) < k:
            W.append(f'arc: needs >= {k} scene(s) with "beat": "{b}" (found {len(idx[b])})')
    if all(idx.get(b) for b in need if b in idx):
        if idx["rule"][0] != 0:
            W.append("arc: scene 0 must be the rule (beat rule): hook in the first line")
        if idx["cta"][-1] != n - 1:
            W.append("arc: cta must be the last scene")
        if "twist" in idx and idx["twist"][0] < n * 0.6:
            W.append("arc: twist arrives before 60% of the story, build the middle more")
        if "clue" in need:
            if not idx["hero"][0] < idx["clue"][0]:
                W.append("arc: hero (My name is ...) must come before the first clue")
            if not idx["clue"][-1] < idx["twist"][0]:
                W.append("arc: every clue must be planted BEFORE the twist")
            if not idx["twist"][0] < idx["choice"][0] < idx["cta"][0]:
                W.append("arc: order must be twist -> choice -> cta")
            if "my name is" not in " ".join(sc[i].get("line", "").lower() for i in idx["hero"]):
                W.append("arc: a hero scene should say 'My name is <Name>' (named first-person hero)")
        elif not idx["twist"][0] < idx["cta"][0]:
            W.append("arc: twist must come before the cta")
        if story.get("genre") == "in_this_world" and not (sc[0].get("title") or "").upper().startswith("IN THIS WORLD"):
            W.append("arc: scene 0 title must start with IN THIS WORLD")
    return W


def static(story):
    W = list(story.get("_errors", []))
    cast = story.get("cast", {})
    P = story.get("publish") or {}
    if not P.get("title") or not P.get("description") or len(P.get("tags", [])) < 5:
        W.append("publish: needs title (<=70 chars), description and >=5 tags")
    elif len(P["title"]) > 70:
        W.append(f"publish.title is {len(P['title'])} chars (max 70)")
    if not story.get("dialogue") and any(sc.get("speaker") for sc in story["scenes"]):
        W.append('scenes use "speaker" but story is narrator-only: remove it or set "dialogue": true')
    _h = json.loads((ROOT / "config" / "roblox_hair.json").read_text(encoding="utf-8"))
    hair = set(map(str, _h["hair"])) | set(_h.get("styles", {}))
    for cid, c in cast.items():
        h = str(c.get("hair", ""))
        for kind in ("shirt", "pants"):
            v = str(c.get(kind, ""))
            if v.startswith("rbx:") and v[4:] not in CLOTHES[kind + ("s" if kind == "shirt" else "")]:
                W.append(
                    f"cast {cid}: {kind} {v} unknown"
                    + hint(v[4:], CLOTHES[kind + ("s" if kind == "shirt" else "")])
                    + f" (python pipeline/produce.py --vocab {kind})"
                )
        for wn in c.get("wear", []):
            if wn not in WEARABLES:
                W.append(
                    f"cast {cid}: wear '{wn}' unknown"
                    + hint(wn, WEARABLES)
                    + " (python pipeline/produce.py --vocab wear)"
                )
        if h.startswith("rbx:") and h[4:] not in hair:
            W.append(f"cast {cid}: hair {h} unknown" + hint(h[4:], hair) + " (python pipeline/produce.py --vocab hair)")
    layouts = {}
    fmt = _fmt(story)
    maxw = fmt.get("maxWords", 14)
    W += arc(story, fmt)
    for i, sc in enumerate(story["scenes"]):
        tag = f"#{i} '{(sc.get('line') or '')[:28]}'"
        line = sc.get("line", "")
        toks = {norm(t) for t in line.replace("*", "").split()}
        nsh = 1 + len(
            sc.get("shots", [])
        )  # a line cut into several shots may be longer: the limit is about the time between cuts
        if len(line.split()) > maxw * nsh:
            W.append(f"{tag}: line has {len(line.split())} words (>{maxw * nsh}, split it or add shots)")
        if sc.get("loc") and sc["loc"] not in story.get("locations", {}):
            W.append(f"{tag}: unknown loc {sc['loc']}")
        if sc.get("set") == "kit":
            k = sc.get("setOpts", {}).get("kit")
            lp = ROOT / "assets" / "models" / "kits" / str(k) / "LAYOUT.json"
            if not lp.exists():
                W.append(f"{tag}: kit {k} not downloaded")
            else:
                parts = layouts.setdefault(k, {r["part"] for r in json.loads(lp.read_text(encoding="utf-8"))})
                n = sc["setOpts"].get("near")
                if n and n not in parts:
                    W.append(f"{tag}: near '{n}' not placed in {k}")
        ids = {a["id"] for a in sc.get("actors", [])}
        if sc.get("speaker") and sc["speaker"] not in ids:
            W.append(f"{tag}: speaker {sc['speaker']} not on screen (mouth won't move)")
        cr = sc.get("crowd")
        if cr:
            if cr["do"] not in BEHAVIOURS and any(an not in ANIMS for an in cr["do"].split("+")):
                W.append(
                    f"{tag}: crowd '{cr['do']}' unknown (behaviours: {' '.join(sorted(BEHAVIOURS))}, or any anim)"
                    + hint(cr["do"], BEHAVIOURS | ANIMS)
                )
            if cr.get("n", 0) > 24:
                W.append(f"{tag}: crowd of {cr['n']} (max 24)")
            if isinstance(cr.get("on"), str) and cr["on"] not in ids:
                W.append(f"{tag}: crowd on:{cr['on']} not in scene")
            if cr.get("expr") and cr["expr"] not in EXPRS:
                W.append(f"{tag}: crowd expr '{cr['expr']}' unknown" + hint(cr["expr"], EXPRS))
        links_of = {a["id"]: a["link"]["to"] for a in sc.get("actors", []) if a.get("link")}
        for a in sc.get("actors", []):
            if a["id"] not in cast:
                W.append(f"{tag}: actor {a['id']} not in cast")
            lk = a.get("link")  # link:<carrier>:<mode> (engine/links.js): carrier in the scene, known mode, no cycles
            if lk:
                if lk.get("to") not in ids:
                    W.append(f"{tag}: link: carrier '{lk.get('to')}' of {a['id']} not in the scene")
                if lk.get("to") == a["id"]:
                    W.append(f"{tag}: link: {a['id']} cannot be linked to itself")
                if lk.get("mode") not in LINK_MODES:
                    W.append(
                        f"{tag}: link mode '{lk.get('mode')}' unknown"
                        + hint(lk.get("mode"), LINK_MODES)
                        + f" (modes: {' '.join(sorted(LINK_MODES))})"
                    )
                n, seen = lk.get("to"), {a["id"]}
                while n in links_of and n not in seen:
                    seen.add(n)
                    n = links_of[n]
                if n in seen and n in links_of:
                    W.append(f"{tag}: link cycle through {a['id']}")
                for kk in ("at", "until"):
                    v = lk.get(kk)
                    if isinstance(v, str) and v.startswith("w:") and norm(v[2:].split("#")[0]) not in toks:
                        W.append(f"{tag}: link {kk} '{v}' not in line")
            rc = a.get("reach")
            if rc:
                tg = rc.get("target")
                if (
                    isinstance(tg, str)
                    and tg not in ids
                    and not any(
                        p.get("id") == tg or p.get("type") == tg for p in sc.get("props", []) if isinstance(p, dict)
                    )
                ):
                    W.append(f"{tag}: reach target '{tg}' is not an actor or prop of the scene")
                for kk in ("at", "until"):
                    v = rc.get(kk)
                    if isinstance(v, str) and v.startswith("w:") and norm(v[2:].split("#")[0]) not in toks:
                        W.append(f"{tag}: reach {kk} '{v}' not in line")
            if isinstance(a.get("look"), str) and a["look"] not in ids | {"none"}:
                W.append(f"{tag}: look '{a['look']}' not in scene")
            for x in [a] + a.get("actions", []) + a.get("facev", []):  # face v2
                g = x.get("gaze")
                if isinstance(g, str) and g not in GAZES | ids:
                    W.append(
                        f"{tag}: gaze '{g}' unknown (up down left right camera cross <id> x,y)" + hint(g, GAZES | ids)
                    )
                if x.get("brows") and x["brows"] not in BROWS:
                    W.append(
                        f"{tag}: brows '{x['brows']}' unknown ({' '.join(sorted(BROWS))})" + hint(x["brows"], BROWS)
                    )
                if isinstance(x.get("pupils"), str) and x["pupils"] not in PUPILS:
                    W.append(f"{tag}: pupils '{x['pupils']}' unknown ({' '.join(sorted(PUPILS))})")
            for x in [a] + a.get("actions", []):
                beast = bool(cast.get(a["id"], {}).get("model"))
                ok = CREATURE_ANIMS if beast else ANIMS
                for an in (x.get("anim") or "").split("+"):  # layers: walk+wave
                    if an and an not in ok:
                        W.append(
                            f"{tag}: anim '{an}' unknown"
                            + (f" for a creature (use {' '.join(sorted(ok))})" if beast else hint(an, ok))
                        )
                if x.get("expr") and x["expr"] not in EXPRS and not beast:
                    W.append(f"{tag}: expr '{x['expr']}' unknown" + hint(x["expr"], EXPRS))
                if isinstance(x.get("face"), str) and x["face"] not in ids | {"camera"}:
                    W.append(f"{tag}: face '{x['face']}' not in scene")
                at = x.get("at")
                if isinstance(at, str) and at.startswith("w:") and norm(at[2:].split("#")[0]) not in toks:
                    W.append(f"{tag}: '{at}' not in line")
        for p in sc.get("props", []):
            if p.get("type") not in PROPS:
                W.append(f"{tag}: prop '{p.get('type')}' unknown" + hint(p.get("type"), PROPS))
            if p.get("hand") and p["hand"] not in ids:
                W.append(f"{tag}: prop {p.get('type')} held by '{p['hand']}' who is not in the scene")
            if p.get("hand") and p.get("type") in NO_HOLD:
                W.append(f"{tag}: prop '{p['type']}' cannot be held (place it with x,z)")
            f = p.get("from")
            if isinstance(f, str) and f.startswith("w:") and norm(f[2:].split("#")[0]) not in toks:
                W.append(f"{tag}: '{f}' not in line")
        for x in sc.get("sfx", []):
            n = x if isinstance(x, str) else x.get("name")
            if n and n not in SFX and not (isinstance(x, dict) and x.get("prompt")):
                W.append(f"{tag}: sfx '{n}' unknown" + hint(n, SFX))
        for x in sc.get("fx", []):
            n = x if isinstance(x, str) else x.get("type")
            if n not in FX:
                W.append(f"{tag}: fx '{n}' unknown" + hint(n, FX))
            if isinstance(x, dict) and x.get("on") and x["on"] not in ids:
                W.append(f"{tag}: fx {n} on '{x['on']}' who is not in the scene")
        if sc.get("shot") and sc["shot"] not in SHOTS:
            W.append(f"{tag}: shot '{sc['shot']}' unknown")
        for gname in [sc.get("grade"), (sc.get("gradeTo") or {}).get("grade")]:
            if gname and gname not in "none vivid flashback threat cold gold dream".split():
                W.append(f"{tag}: grade '{gname}' unknown (none vivid flashback threat cold gold dream)")
        tg = (sc.get("camera") or {}).get("target")
        if isinstance(tg, str) and tg not in ids | {"group", "both"}:
            W.append(f"{tag}: camera target '{tg}' not in scene")
        for x in sc.get("shots", []):
            if x.get("shot") and x["shot"] not in SHOTS:
                W.append(f"{tag}: shots: shot '{x['shot']}' unknown")
            cm = x.get("camera") or {}
            for k in ("target", "pov", "over"):
                if isinstance(cm.get(k), str) and cm[k] not in ids | {"group", "both"}:
                    W.append(f"{tag}: shots: {k} '{cm[k]}' not in scene")
            at = x.get("at")
            if isinstance(at, str) and at.startswith("w:") and norm(at[2:].split("#")[0]) not in toks:
                W.append(f"{tag}: shots: '{at}' not in line")
        for x in sc.get("sfx", []) + sc.get("fx", []):
            at = x.get("at") if isinstance(x, dict) else None
            if isinstance(at, str) and at.startswith("w:") and norm(at[2:].split("#")[0]) not in toks:
                W.append(f"{tag}: '{at}' not in line")
    return W


def estimate(story, fmt):
    """Timeline with estimated durations (3.8 words/s, calibrated on local TTS) so staging can be checked without TTS."""
    t = 0
    scenes = []
    words_all = []
    for sc in story["scenes"]:
        sc = dict(sc)
        line = re.sub(r"\[[a-zA-Z _-]+\]", " ", sc.get("line", "")).split()
        d = max(sc.get("dur", 0), len(line) / 3.8 + 0.25) if line else sc.get("dur", 1.5)
        step = (d - 0.3) / max(1, len(line))
        sc["start"] = t
        sc["dur"] = round(d, 3)
        sc["words"] = [
            {"w": w.replace("*", ""), "s": round(t + k * step, 3), "e": round(t + (k + 1) * step, 3), "emph": "*" in w}
            for k, w in enumerate(line)
        ]
        words_all += sc["words"]
        scenes.append(sc)
        t += d
    return {
        **fmt,
        "duration": round(t, 3),
        "cast": story.get("cast", {}),
        "style": story.get("style", {}),
        "words": words_all,
        "scenes": scenes,
    }


def run(story, out):
    fmt = {"width": 1080, "height": 1920, "fps": 30, **story.get("format", {})}
    W = static(story)
    tl = estimate(story, fmt)
    tp = out / "lint_timeline.json"
    tp.write_text(json.dumps(tl))
    rp = out / "lint.json"
    subprocess.run(
        ["node", str(ENG / "render.mjs"), str(tp), str(rp), "--lint", "--scale", "0.25"], capture_output=True
    )
    rep = json.loads(rp.read_text()) if rp.exists() else []
    for i, ws in rep:
        for w in ws:
            W.append(f"#{i} '{(story['scenes'][i].get('line') or '')[:28]}': {w}")
    print(f"est. duration {tl['duration']:.0f}s ({len(tl['scenes'])} scenes)")
    print("\n".join(W) if W else "lint: OK")
    return W


def vocab(topic=None):
    """Compact vocabulary straight from the engine/config (always current). `produce.py --vocab` = topics, `--vocab anim` = one list."""
    cfg = lambda f: [k for k in json.loads((ROOT / "config" / f).read_text(encoding="utf-8")) if not k.startswith("_")]
    V = {
        "anim": sorted(ANIMS),
        "creature": cfg("creatures.json"),
        "creature_anim": sorted(CREATURE_ANIMS),
        "link": sorted(LINK_MODES),
        "crowd": sorted(BEHAVIOURS) + ["<any anim>"],
        "expr": sorted(EXPRS),
        "gaze": sorted(GAZES) + ["<actor id>", "x,y"],
        "brows": sorted(BROWS),
        "pupils": sorted(PUPILS),
        "shirt": ["rbx:" + k for k in CLOTHES["shirts"]],
        "pants": ["rbx:" + k for k in CLOTHES["pants"]],
        "wear": sorted(WEARABLES | {k for k, v in MODEL_PROPS.items() if v.get("wear")}),
        "hair": [
            "rbx:" + k
            for k in json.loads((ROOT / "config" / "roblox_hair.json").read_text(encoding="utf-8")).get("styles", {})
        ],
        "prop": sorted(PROPS),
        "fx": sorted(FX),
        "sfx": sorted(SFX),
        "shot": sorted(SHOTS),
        "cast": cfg("cast.json"),
        "loc": cfg("locations.json"),
        "weather": cfg("weather.json"),
        "sky": cfg("skies.json"),
        "world": [
            k
            for k, v in json.loads((ROOT / "config" / "locations.json").read_text(encoding="utf-8")).items()
            if isinstance(v, dict) and v.get("set", "kit") not in ("kit", "map")
        ],
        "grade": "none vivid flashback threat cold gold dream".split(),
    }
    for k in [topic] if topic in V else V:
        print(f"{k}: {' '.join(V[k])}")
    if topic and topic not in V:
        print(f"topics: {' '.join(V)}")
