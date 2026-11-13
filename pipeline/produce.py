"""story.json -> narrated, captioned, scored 9:16 Short.

python pipeline/produce.py stories/<slug>/story.json            full render
python pipeline/produce.py <story> --preview                     1 still per scene -> contact sheet (cheap check)
python pipeline/produce.py <story> --scale 0.5 --workers 4       faster draft render
"""
import argparse, json, os, re, shutil, subprocess, sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from tts import ROOT, SR


def load_env():
    f = ROOT / ".env"
    if f.exists():
        for ln in f.read_text(encoding="utf-8").splitlines():
            ln = ln.strip()
            if ln and not ln.startswith("#") and "=" in ln:
                k, v = ln.split("=", 1); os.environ.setdefault(k.strip(), v.strip())


norm = lambda w: re.sub(r"[^a-z0-9']", "", w.lower())


def resolve_at(v, sc):
    if v is None: return 0.0
    if isinstance(v, (int, float)): return float(v)
    v = str(v)
    if v.endswith("%"): return float(v[:-1]) / 100 * sc["dur"]
    if v.startswith("w:"):
        word, _, n = v[2:].partition("#"); n = int(n or 1); c = 0
        for w in sc.get("words", []):
            if norm(w["w"]) == norm(word):
                c += 1
                if c == n: return w["s"] - sc["start"]
        print(f"  ! word '{word}' not found in scene line"); return 0.0
    return float(v)


def expand(story):
    """Shorthand -> full scenes. `locations: {name: {set, setOpts, time}}` + scene `loc`; loc/set/setOpts/time inherit from the previous scene."""
    import shorthand; shorthand.expand(story)
    g = story.get("genre")
    if g and (ROOT / "formats" / g / "format.json").exists():  # genre defaults fill anything the story leaves unset
        for k, v in json.loads((ROOT / "formats" / g / "format.json").read_text(encoding="utf-8")).get("defaults", {}).items():
            if k not in story: story[k] = v
            elif isinstance(v, dict) and isinstance(story[k], dict): story[k] = {**v, **story[k]}
    locs = story.get("locations", {}); prev = {}
    for sc in story["scenes"]:
        if sc.get("loc") not in (None, *locs): story["_errors"].append(f"unknown loc '{sc['loc']}' (config/locations.json or story locations)"); sc.pop("loc")
        if "loc" not in sc and "set" not in sc and "loc" in prev: sc["loc"] = prev["loc"]
        if "loc" in sc:
            L = locs[sc["loc"]]; sc["set"] = L.get("set", "kit"); sc["setOpts"] = {**L.get("setOpts", {}), **sc.get("setOpts", {})}
            if "seed" in L: sc.setdefault("seed", L["seed"])
            if "time" not in sc and "time" in L and prev.get("loc") != sc["loc"]: sc["time"] = L["time"]
        elif "set" not in sc and prev.get("set"): sc["set"] = prev["set"]; sc["setOpts"] = prev.get("setOpts", {})
        if "time" not in sc and "time" in prev: sc["time"] = prev["time"]
        prev = sc
    for sc in story["scenes"]:  # "portal": "<loc>" or {"loc", "sky", "z"} on a prop: the world seen through its doorway (procedural sets only)
        for p in sc.get("props", []):
            d = p.get("portal") if isinstance(p, dict) else None
            if not d: continue
            d = {"loc": d} if isinstance(d, str) else dict(d); L = locs.get(d.get("loc"))
            if L is None or L.get("set", "kit") in ("kit", "map"): story["_errors"].append(f"portal: '{d.get('loc')}' must be a procedural world (--vocab world)"); p.pop("portal"); continue
            p["portal"] = {"set": L["set"], "setOpts": L.get("setOpts", {}), "time": d.get("time", L.get("time", "day")), **({"seed": L["seed"]} if "seed" in L else {}), **{k: d[k] for k in ("sky", "z", "y") if k in d}}
    SK = shorthand._load("skies.json"); sky = None  # sky: skybox name, inherited until changed ("none" = back to the plain gradient); "a>b@when" = changes mid-scene
    for sc in story["scenes"]:
        v = sc.get("sky", sky)
        if isinstance(v, str) and ">" in v:
            a, _, rest = v.partition(">"); b, _, at = rest.partition("@"); sc["skyTo"] = {"sky": b, "at": shorthand.when(at) if at else "40%"}; v = a; sky = b
        else: sky = v
        if v in (None, "none"): sc.pop("sky", None); sky = None if v == "none" else sky; continue
        for n in [v] + ([sc["skyTo"]["sky"]] if "skyTo" in sc else []):
            if n not in SK: story["_errors"].append(f"unknown sky '{n}' (config/skies.json: {' '.join(SK)})")
        sc["sky"] = v
        if "time" not in sc and SK.get(v, {}).get("time"): sc["time"] = SK[v]["time"]
        if isinstance(sc.get("grade"), str) and ">" in sc["grade"]:
            a, _, rest = sc["grade"].partition(">"); b, _, at = rest.partition("@"); sc["grade"] = a; sc["gradeTo"] = {"grade": b, "at": shorthand.when(at) if at else "40%"}
    looks(story)
    WX = shorthand._load("weather.json"); cur = None  # weather: inherited until changed; a preset may force the time of day
    for sc in story["scenes"]:
        cur = sc.get("weather", cur)
        if cur in (None, "clear", "none"): sc.pop("weather", None); cur = None; continue
        if cur not in WX: story["_errors"].append(f"unknown weather '{cur}' (config/weather.json: {' '.join(WX)})"); sc.pop("weather", None); cur = None; continue
        sc["weather"] = cur
        if WX[cur].get("time"): sc["time"] = WX[cur]["time"]
    dress(story); combos(story)
    return story


def looks(story):
    """Scene look = story first, then biome, then SOFT world defaults (config/biomes.json, config/world_profile.json).
    `biome`/`treat`/`medium` inherit until changed; "none" switches off (also the world default). Nothing here ever blocks a scene."""
    import shorthand; B = shorthand._load("biomes.json"); P = shorthand._load("world_profile.json"); T_ = shorthand._load("treatments.json")
    biome = treat = medium = None; off_t = off_m = False
    for sc in story["scenes"]:
        if "biome" in sc:
            biome = None if sc["biome"] in (None, "none") else sc["biome"]
            if biome and biome not in B: story["_errors"].append(f"unknown biome '{biome}' (config/biomes.json: {' '.join(B)})"); biome = None
            if "treat" not in sc: treat = None; off_t = False
            if "medium" not in sc: medium = None; off_m = False
        if "treat" in sc:
            if sc["treat"] in (None, "none"): treat = None; off_t = True
            else:
                treat = sc["treat"]; off_t = False
                for t in (treat if isinstance(treat, list) else [treat]):
                    if str(t).split(":")[0] not in T_: story["_errors"].append(f"unknown treat '{t}' (config/treatments.json: {' '.join(T_)})")
        if "medium" in sc:
            if sc["medium"] in (None, "none"): medium = None; off_m = True
            else: medium = sc["medium"]; off_m = False
        b = B.get(biome, {}); w = P.get(sc.get("set"), {})
        t = treat or (None if off_t else (b.get("treat") or w.get("treat")))
        m = medium or (None if off_m else (b.get("medium") or w.get("medium")))
        if m == "underwater":  # underwater always gets the water tint + bubbles
            t = (t if isinstance(t, list) else [t] if t else []) + ["underwater"]
            if not any(isinstance(f, dict) and f.get("type") == "bubbles" for f in sc.get("fx", []) if isinstance(sc.get("fx"), list)): sc["fx"] = (sc["fx"] if isinstance(sc.get("fx"), list) else []) + [{"type": "bubbles", "pos": [0, 0, 0], "at": 0, "loop": True}]
        if t: sc["treat"] = t
        else: sc.pop("treat", None)
        if m: sc["medium"] = m
        else: sc.pop("medium", None)
        if b.get("weather") and "weather" not in sc: sc["weather"] = b["weather"]


def dress(story):
    """config/dressing.json: scenes in a known world get its scatter props automatically (richer sets with zero author effort)."""
    import shorthand; D = shorthand._load("dressing.json")
    if story.get("style", {}).get("dressing") is False: return
    for sc in story["scenes"]:
        k = sc.get("dress", 1); preset = D.get(sc.get("set"))
        if not preset or k is False or k == 0 or any(isinstance(p, dict) and p.get("type") == "scatter" for p in sc.get("props", [])): continue
        k = 1 if k is True else float(k)
        sc["props"] = list(sc.get("props", [])) + [{**p, **({"n": max(1, round(p["n"] * k))} if "n" in p else {})} for p in preset]


def combos(story):
    """config/fx_combos.json: composite fx (impact_big, blast, ...) -> their parts + automatic sound."""
    import shorthand; C = shorthand._load("fx_combos.json")
    for sc in story["scenes"]:
        out = []
        for f in sc.get("fx", []) if isinstance(sc.get("fx"), list) else []:
            c = C.get(f.get("type")) if isinstance(f, dict) else None
            if not c: out.append(f); continue
            base = f.get("pos", [0, 0, 0]); at = f.get("at", 0); sc_ = f.get("scale", 1)
            for p in c["parts"]:
                q = {k: v for k, v in p.items() if k not in ("off", "dt")}; o = p.get("off", [0, 0, 0])
                q["pos"] = [base[i] + o[i] * sc_ for i in range(3)]; q["scale"] = p.get("scale", 1) * sc_; q["_part"] = True
                if isinstance(at, (int, float)): q["at"] = at + p.get("dt", 0)
                elif "at" in f: q["at"] = at
                for kk in ("on", "mode"):
                    if kk in f: q[kk] = f[kk]
                out.append(q)
            for name, dt, vol in c.get("sfx", []):
                sc.setdefault("sfx", []).append({"name": name, "at": (at + dt) if isinstance(at, (int, float)) else at, "vol": vol})
        if out or "fx" in sc: sc["fx"] = out


def weather_audio(scenes, audio):
    """Ambience loops (one continuous bed per run of scenes sharing a weather) + a thunder clap on every lightning strike."""
    import shorthand; WX = shorthand._load("weather.json"); clips = []; i = 0
    while i < len(scenes):
        w = scenes[i].get("weather"); j = i
        while j < len(scenes) and scenes[j].get("weather") == w: j += 1
        P = WX.get(w) or {}; t0 = scenes[i]["start"]; n = int((scenes[j - 1]["start"] + scenes[j - 1]["dur"] - t0) * SR)
        for name, vol in P.get("ambience", []):
            a = np.asarray(audio.get_sfx({"name": name}), dtype=np.float32); x = int(.4 * SR); k = len(a) - x
            if k > x: a[:x] = a[:x] * np.linspace(0, 1, x) + a[k:] * np.linspace(1, 0, x); a = a[:k]  # seamless loop
            bed = np.tile(a, n // len(a) + 1)[:n].copy(); f = min(n // 2, int(.35 * SR)); bed[:f] *= np.linspace(0, 1, f); bed[n - f:] *= np.linspace(1, 0, f)
            clips.append((bed, t0, vol))
        L = P.get("lightning")
        for sc in scenes[i:j] if L else []:
            s = L["first"]
            while s < sc["dur"] - .2: clips.append((audio.get_sfx({"name": "thunder"}), sc["start"] + s + .12, .9)); s += L["every"]
        i = j
    return clips


def world_audio(scenes, audio):
    """config/world_audio.json: one continuous ambience bed per run of scenes in the same world."""
    import shorthand; WA = shorthand._load("world_audio.json"); clips = []; i = 0
    while i < len(scenes):
        w = scenes[i].get("set"); j = i
        while j < len(scenes) and scenes[j].get("set") == w: j += 1
        t0 = scenes[i]["start"]; n = int((scenes[j - 1]["start"] + scenes[j - 1]["dur"] - t0) * SR)
        for name, vol in WA.get(w, []):
            a = np.asarray(audio.get_sfx({"name": name}), dtype=np.float32); x = int(.4 * SR); k = len(a) - x
            if k > x: a[:x] = a[:x] * np.linspace(0, 1, x) + a[k:] * np.linspace(1, 0, x); a = a[:k]
            bed = np.tile(a, n // len(a) + 1)[:n].copy(); f = min(n // 2, int(.8 * SR)); bed[:f] *= np.linspace(0, 1, f); bed[n - f:] *= np.linspace(1, 0, f)
            clips.append((bed, t0, vol))
        i = j
    return clips


def voice_of(story, sc):
    """Voice alias + TTS settings. DEFAULT = single storyteller: every line uses the narrator voice.
    Per-character voices only with `"dialogue": true` in the story."""
    voice = story.get("narrator", "narrator")
    if story.get("dialogue"):
        speaker = sc.get("speaker"); cast = story.get("cast", {})
        voice = sc.get("voice") or (cast.get(speaker, {}).get("voice") if speaker else None) or voice
    st = dict(sc.get("voiceSettings") or {})
    st["emotion"] = sc.get("emotion") or story.get("emotion") or tts_mod().auto_emotion(sc.get("line", ""))
    return voice, st


def tts_mod():
    import tts; return tts


def build(story, out):
    story = expand(story)
    import tts, audio
    fmt = {"width": 1080, "height": 1920, "fps": 30, **story.get("format", {})}
    narrator = story.get("narrator", "narrator"); cast = story.get("cast", {})
    t = 0.0; words_all = []; voice_clips = []; sfx_clips = []; scenes = []
    print(f"TTS provider: {tts.provider()}")
    vs = lambda sc: voice_of(story, sc)
    # `"join": true` on a scene = its line continues the previous scene's sentence: the whole passage is spoken in ONE take (natural
    # intonation across the fragments) and the audio is cut between the scenes at the pause between the words.
    S = story["scenes"]; lead_of = {}; members = {}
    for i, sc in enumerate(S):
        if sc.get("line") and sc.get("join") and lead_of.get(i - 1) is not None: lead_of[i] = lead_of[i - 1]; members[lead_of[i]].append(i)
        elif sc.get("line"): lead_of[i] = i; members[i] = [i]
    ptext = lambda g: " ".join(S[k]["line"].replace("*", "") for k in g)
    tts.prefetch([(ptext(g), *vs(S[g[0]])) for g in members.values()])
    cuts = {}  # scene index -> (audio slice, words relative to the slice)
    for lead_i, g in members.items():
        if len(g) < 2: continue
        voice, st = vs(S[lead_i]); a, ws = tts.synth(ptext(g), voice, st); ws = [w for w in ws if not re.fullmatch(r"\[[a-zA-Z _-]+\]", w[0])]
        ntok = [len(re.sub(r"\[[a-zA-Z _-]+\]", " ", S[k]["line"]).split()) for k in g]
        if sum(ntok) != len(ws): print(f"  ! join group at scene {lead_i}: {sum(ntok)} words vs {len(ws)} timings: spoken separately"); continue
        idx = 0; edges = [0.0]
        for n in ntok[:-1]:
            idx += n; edges.append((ws[idx - 1][2] + ws[idx][1]) / 2)
        edges.append(len(a) / SR); idx = 0
        for k, n in zip(g, ntok):
            lo, hi = edges[g.index(k)], edges[g.index(k) + 1]
            cuts[k] = (a[int(lo * SR):int(hi * SR)], [[w, max(0.0, s0 - lo), max(0.0, e0 - lo)] for w, s0, e0 in ws[idx:idx + n]]); idx += n
    for i, sc in enumerate(story["scenes"]):
        sc = dict(sc); line = sc.get("line"); dur = 0.0
        sc["start"] = t; sc["words"] = []
        if line:
            clean = line.replace("*", "")
            voice, st = vs(sc)
            a, ws = cuts[i] if i in cuts else tts.synth(clean, voice, st)
            line = re.sub(r"\s+", " ", re.sub(r"\[[a-zA-Z _-]+\]", " ", line)).strip()
            ws = [w for w in ws if not re.fullmatch(r"\[[a-zA-Z _-]+\]", w[0])]
            toks = line.split(); emph = [tk.startswith("*") or tk.endswith("*") or tk.rstrip(".,!?").endswith("*") for tk in toks]
            lead = sc.get("lead", 0.0)
            for k, (w, s, e) in enumerate(ws):
                sc["words"].append({"w": w, "s": round(t + lead + s, 3), "e": round(t + lead + e, 3), "emph": bool(emph[k]) if len(toks) == len(ws) else any(norm(tk) == norm(w) and em for tk, em in zip(toks, emph))})
            voice_clips.append((a, t + lead, sc.get("gain", 1.0)))
            joined_next = i + 1 < len(S) and S[i + 1].get("join") and S[i + 1].get("line") and i in cuts and lead_of.get(i + 1) == lead_of.get(i)
            dur = lead + len(a) / SR + (0.0 if joined_next else sc.get("pad", story.get("pad", 0.12)))  # inside a joined passage the audio is continuous: no pad
        sc["dur"] = round(max(dur, sc.get("dur", 0 if line else 1.5)), 3)
        for s in sc.get("sfx", []):
            s = {"name": s} if isinstance(s, str) else s
            sfx_clips.append((audio.get_sfx(s), t + resolve_at(s.get("at"), sc), s.get("vol", 1.0)))
        if story.get("style", {}).get("autoFxSfx", True):  # config/fx_sfx.json: the sound that belongs to an effect
            import shorthand; FS = shorthand._load("fx_sfx.json"); have = [(x.get("name"), resolve_at(x.get("at"), sc)) for x in sc.get("sfx", []) if isinstance(x, dict)]
            for f in sc.get("fx", []) if isinstance(sc.get("fx"), list) else []:
                m = FS.get(f.get("type")) if isinstance(f, dict) else None
                if not m or f.get("_part") or f.get("loop"): continue
                ft = resolve_at(f.get("at"), sc) + m[2]
                if any(n == m[0] and abs(ft - a) < .3 for n, a in have): continue
                sfx_clips.append((audio.get_sfx({"name": m[0]}), t + ft, m[1] * f.get("vol", 1))); have.append((m[0], ft))
        if story.get("style", {}).get("autoWhoosh", True) and (sc.get("punch") or sc.get("transition") in ("wipe", "white")):
            sfx_clips.append((audio.get_sfx({"name": "whoosh"}), max(0, t - .12), .6))
        words_all += sc["words"]; scenes.append(sc); t += sc["dur"]
    duration = round(t, 3)
    sfx_clips += weather_audio(scenes, audio)
    if story.get("style", {}).get("worldAudio", True): sfx_clips += world_audio(scenes, audio)
    if duration > 180: print(f"  ! WARNING: {duration:.1f}s exceeds 3 min limit")
    tl = {**fmt, "duration": duration, "cast": cast, "style": story.get("style", {}), "words": words_all, "scenes": scenes}
    tl["anims"] = {k: v for f in sorted((ROOT / "config").glob("anims*.json")) for k, v in json.loads(f.read_text(encoding="utf-8")).items() if not k.startswith("_")}  # keyframed anims: config/anims.json + anims_*.json (imported Roblox animations, interactions...)
    tl["quarks"] = {f.stem: json.loads(f.read_text(encoding="utf-8")) for f in (ROOT / "assets" / "vfx" / "fx").glob("*.json") if not f.stem.startswith("_")}  # data-driven effects (engine/quarks.js): all of them, they are small
    (out / "timeline.json").write_text(json.dumps(tl))
    music = audio.get_music(story.get("music", "upbeat"), duration) if story.get("music", "upbeat") != "none" else None
    for name, mus in (("mix.wav", music), ("mix_nomusic.wav", None)):  # nomusic: voice + SFX only, for adding a trending sound in the app
        mixed = audio.mix(duration, voice_clips, sfx_clips, mus, story.get("musicVol", 0.16))
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "pipe:0", str(out / name)], input=mixed.tobytes(), check=True)
    print(f"timeline: {len(scenes)} scenes, {duration:.1f}s")
    return tl


def publish_package(story, out, slug):
    """publish/<slug>/: <slug>.mp4 (with music), <slug>_nomusic.mp4, youtube.txt, tiktok.txt. No thumbnail (made manually)."""
    pub = ROOT / "publish" / slug; pub.mkdir(parents=True, exist_ok=True)
    for src, name in (("mix.wav", f"{slug}.mp4"), ("mix_nomusic.wav", f"{slug}_nomusic.mp4")):
        if (out / src).exists():
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(out / "video.mp4"), "-i", str(out / src), "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(pub / name)], check=True)
    P = story.get("publish") or {}; tags = [t.lstrip("#") for t in P.get("tags", [])]
    hashtags = " ".join("#" + t.replace(" ", "") for t in tags[:8])
    yt = "TITLE:\n" + P.get("title", story.get("title", "")) + "\n\nDESCRIPTION:\n" + P.get("description", "") + "\n\n" + hashtags + "\n\nTAGS:\n" + ", ".join(tags) + "\n"
    (pub / "youtube.txt").write_text(yt, encoding="utf-8")
    (pub / "tiktok.txt").write_text(P.get("caption", P.get("title", "")) + "\n\n" + hashtags + "\n", encoding="utf-8")
    shutil.copy2(pub / f"{slug}.mp4", out / f"{slug}.mp4")
    return pub / f"{slug}.mp4"


def node(*a):
    r = subprocess.run(["node", str(ROOT / "engine" / "render.mjs"), *map(str, a)])
    if r.returncode: sys.exit(r.returncode)


def run_one(a, sp):
    if not sp.suffix: sp = ROOT / "stories" / sp.name / "story.json"  # slug or path
    story = json.loads(sp.read_text(encoding="utf-8"))
    slug = story.get("slug") or sp.parent.name
    out = Path(a.out) if a.out else ROOT / "out" / slug; out.mkdir(parents=True, exist_ok=True)
    if a.redo:
        import tts; st = expand(json.loads(json.dumps(story)))
        for i in map(int, a.redo.split(",")):
            sc = st["scenes"][i]
            if not sc.get("line"): continue
            stem = tts.local_stem(sc["line"].replace("*", ""), *voice_of(st, sc))
            for ext in (".wav", ".json"): stem.with_suffix(ext).unlink(missing_ok=True)
            print(f"  redo #{i}: {sc['line'][:50]}")
    import lint
    if a.lint: return lint.run(expand(story), out)
    if not a.force:  # free text-only checks before spending TTS/render time
        W = lint.static(expand(json.loads(json.dumps(story))))
        if W: print("\n".join(W)); sys.exit(f"{slug}: {len(W)} problem(s) - fix them (see --lint) or pass --force")
    only = [int(x) for x in a.only.split(",")] if a.only else None
    try:
        import intent; adv = intent.advise(expand(json.loads(json.dumps(story))))
        if adv: print("intent (advisory):"); print("\n".join(adv))
    except Exception as e: print(f"  (intent advice skipped: {e})")
    tl = build(story, out)
    if a.audio_only: return
    if a.studio or story.get("engine") == "studio":
        import studio
        final = studio.render(story, tl, out, resolve_at, slug); print(f"DONE -> {final}"); return
    if a.qa:
        import frameqa; frameqa.run(out / "timeline.json"); return
    if a.preview:
        idx = only or list(range(len(tl["scenes"]))); ts = []
        for i in idx:  # one tile per shot: the scene's own camera, then each entry of "shots"
            sc = tl["scenes"][i]; cut = sorted({0.0, *[x for x in (resolve_at(h.get("at"), sc) for h in sc.get("shots", [])) if .05 < x < sc["dur"] - .05]}) + [sc["dur"]]
            ts += [round(sc["start"] + a + (b - a) * .6, 2) for a, b in zip(cut, cut[1:])]
        st = out / "preview"; node(out / "timeline.json", st, "--stills", ",".join(map(str, ts)), "--scale", min(a.scale, .4))
        files = [str(st / f"t{x:.2f}.jpg") for x in ts]; cols = min(6, len(files)); rows = -(-len(files) // cols)
        inputs = sum([["-i", f] for f in files], []); pads = "".join(f"[{i}]" for i in range(len(files)))
        while len(files) < cols * rows: inputs += ["-f", "lavfi", "-i", "color=black:s=432x768"]; pads += f"[{len(files)}]"; files.append("x")
        dst = out / ("preview_part.jpg" if only else "preview.jpg")
        fc = f"{pads}xstack=inputs={len(files)}:grid={cols}x{rows}[v];[v]scale={min(1600, 270 * cols)}:-1" if len(files) > 1 else "[0]scale=540:-1"
        subprocess.run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", fc, "-frames:v", "1", "-update", "1", str(dst)])
        print(f"preview -> {dst}  (tiles left-to-right, top-to-bottom = scenes {','.join(map(str, idx)) if only else f'0..{len(idx) - 1}'}, one tile per shot = {len(ts)} tiles; {cols} per row)"); return
    node(out / "timeline.json", out / "video.mp4", "--scale", a.scale, "--workers", a.workers, *(["--fresh"] if a.fresh else []), *(["--blur", a.blur] if a.blur else []))
    final = publish_package(story, out, slug)
    print(f"DONE -> {final}  ({tl['duration']:.0f}s, {len(tl['scenes'])} scenes)")


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("story", nargs="*", help="slug(s) or path(s) to story.json; several = batch"); ap.add_argument("--vocab", nargs="?", const="all", help="print the vocabulary (topic: anim creature crowd expr prop fx sfx shot cast loc weather)"); ap.add_argument("--preview", action="store_true")
    ap.add_argument("--only", help="with --preview: scene numbers to re-check (e.g. 12,31) -> preview_part.jpg")
    ap.add_argument("--scale", type=float, default=1.0); ap.add_argument("--workers", type=int, default=4); ap.add_argument("--force", action="store_true", help="render even if the text checks report problems")
    ap.add_argument("--audio-only", action="store_true"); ap.add_argument("--qa", action="store_true", help="render 3 stills per scene and flag dark/blocked/empty/washed frames (pipeline/frameqa.py)"); ap.add_argument("--fresh", action="store_true", help="ignore the per-scene render cache (cache/segments)"); ap.add_argument("--blur", type=int, help="motion-blur samples per frame (default 8; 1 = off, ~3x faster draft)"); ap.add_argument("--out"); ap.add_argument("--studio", action="store_true"); ap.add_argument("--lint", action="store_true"); ap.add_argument("--redo", help="scene numbers (as in --lint, e.g. 12,31) whose voice lines are re-synthesized")
    a = ap.parse_args(); load_env(); bad = 0
    if a.vocab: import lint; return lint.vocab(a.vocab)
    for s in a.story:
        if len(a.story) > 1: print(f"== {s}", flush=True)
        if a.lint: bad += bool(run_one(a, Path(s)))
        else: run_one(a, Path(s))
    if bad: sys.exit(1)


if __name__ == "__main__":
    main()
