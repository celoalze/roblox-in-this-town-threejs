"""Story build stage: TTS synthesis, scene timing, audio mixing, and timeline assembly.

Owns voice resolution, TTS generation/alignment, SFX/ambience gathering, and timeline.json generation.
Must not render video frames, invoke engine node scripts, or package final release artifacts.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from audio.beds import weather_audio, world_audio
from audio.tts import SR
from paths import ROOT
from story.expand import expand, norm, resolve_at


def voice_of(story, sc):
    """Voice alias + TTS settings. DEFAULT = single storyteller: every line uses the narrator voice.
    Per-character voices only with `"dialogue": true` in the story."""
    voice = story.get("narrator", "narrator")
    if story.get("dialogue"):
        speaker = sc.get("speaker")
        cast = story.get("cast", {})
        voice = sc.get("voice") or (cast.get(speaker, {}).get("voice") if speaker else None) or voice
    st = dict(sc.get("voiceSettings") or {})
    st["emotion"] = sc.get("emotion") or story.get("emotion") or tts_mod().auto_emotion(sc.get("line", ""))
    return voice, st


def tts_mod():
    from audio import tts

    return tts


def build(story, out):
    story = expand(story)
    from audio import tts, mix as audio

    fmt = {"width": 1080, "height": 1920, "fps": 30, **story.get("format", {})}
    narrator = story.get("narrator", "narrator")
    cast = story.get("cast", {})
    t = 0.0
    words_all = []
    voice_clips = []
    sfx_clips = []
    scenes = []
    print(f"TTS provider: {tts.provider()}")
    vs = lambda sc: voice_of(story, sc)
    # `"join": true` on a scene = its line continues the previous scene's sentence: the whole passage is spoken in ONE take (natural
    # intonation across the fragments) and the audio is cut between the scenes at the pause between the words.
    S = story["scenes"]
    lead_of = {}
    members = {}
    for i, sc in enumerate(S):
        if sc.get("line") and sc.get("join") and lead_of.get(i - 1) is not None:
            lead_of[i] = lead_of[i - 1]
            members[lead_of[i]].append(i)
        elif sc.get("line"):
            lead_of[i] = i
            members[i] = [i]
    ptext = lambda g: " ".join(S[k]["line"].replace("*", "") for k in g)
    tts.prefetch([(ptext(g), *vs(S[g[0]])) for g in members.values()])
    cuts = {}  # scene index -> (audio slice, words relative to the slice)
    for lead_i, g in members.items():
        if len(g) < 2:
            continue
        voice, st = vs(S[lead_i])
        a, ws = tts.synth(ptext(g), voice, st)
        ws = [w for w in ws if not re.fullmatch(r"\[[a-zA-Z _-]+\]", w[0])]
        ntok = [len(re.sub(r"\[[a-zA-Z _-]+\]", " ", S[k]["line"]).split()) for k in g]
        if sum(ntok) != len(ws):
            print(f"  ! join group at scene {lead_i}: {sum(ntok)} words vs {len(ws)} timings: spoken separately")
            continue
        idx = 0
        edges = [0.0]
        for n in ntok[:-1]:
            idx += n
            edges.append((ws[idx - 1][2] + ws[idx][1]) / 2)
        edges.append(len(a) / SR)
        idx = 0
        for k, n in zip(g, ntok):
            lo, hi = edges[g.index(k)], edges[g.index(k) + 1]
            cuts[k] = (
                a[int(lo * SR) : int(hi * SR)],
                [[w, max(0.0, s0 - lo), max(0.0, e0 - lo)] for w, s0, e0 in ws[idx : idx + n]],
            )
            idx += n
    for i, sc in enumerate(story["scenes"]):
        sc = dict(sc)
        line = sc.get("line")
        dur = 0.0
        sc["start"] = t
        sc["words"] = []
        if line:
            clean = line.replace("*", "")
            voice, st = vs(sc)
            a, ws = cuts[i] if i in cuts else tts.synth(clean, voice, st)
            line = re.sub(r"\s+", " ", re.sub(r"\[[a-zA-Z _-]+\]", " ", line)).strip()
            ws = [w for w in ws if not re.fullmatch(r"\[[a-zA-Z _-]+\]", w[0])]
            toks = line.split()
            emph = [tk.startswith("*") or tk.endswith("*") or tk.rstrip(".,!?").endswith("*") for tk in toks]
            lead = sc.get("lead", 0.0)
            for k, (w, s, e) in enumerate(ws):
                sc["words"].append(
                    {
                        "w": w,
                        "s": round(t + lead + s, 3),
                        "e": round(t + lead + e, 3),
                        "emph": bool(emph[k])
                        if len(toks) == len(ws)
                        else any(norm(tk) == norm(w) and em for tk, em in zip(toks, emph)),
                    }
                )
            voice_clips.append((a, t + lead, sc.get("gain", 1.0)))
            joined_next = (
                i + 1 < len(S)
                and S[i + 1].get("join")
                and S[i + 1].get("line")
                and i in cuts
                and lead_of.get(i + 1) == lead_of.get(i)
            )
            dur = (
                lead + len(a) / SR + (0.0 if joined_next else sc.get("pad", story.get("pad", 0.12)))
            )  # inside a joined passage the audio is continuous: no pad
        sc["dur"] = round(max(dur, sc.get("dur", 0 if line else 1.5)), 3)
        for s in sc.get("sfx", []):
            s = {"name": s} if isinstance(s, str) else s
            sfx_clips.append((audio.get_sfx(s), t + resolve_at(s.get("at"), sc), s.get("vol", 1.0)))
        if story.get("style", {}).get("autoFxSfx", True):  # config/fx_sfx.json: the sound that belongs to an effect
            from story import shorthand

            FS = shorthand._load("fx_sfx.json")
            have = [(x.get("name"), resolve_at(x.get("at"), sc)) for x in sc.get("sfx", []) if isinstance(x, dict)]
            for f in sc.get("fx", []) if isinstance(sc.get("fx"), list) else []:
                m = FS.get(f.get("type")) if isinstance(f, dict) else None
                if not m or f.get("_part") or f.get("loop"):
                    continue
                ft = resolve_at(f.get("at"), sc) + m[2]
                if any(n == m[0] and abs(ft - a) < 0.3 for n, a in have):
                    continue
                sfx_clips.append((audio.get_sfx({"name": m[0]}), t + ft, m[1] * f.get("vol", 1)))
                have.append((m[0], ft))
        if story.get("style", {}).get("autoWhoosh", True) and (
            sc.get("punch") or sc.get("transition") in ("wipe", "white")
        ):
            sfx_clips.append((audio.get_sfx({"name": "whoosh"}), max(0, t - 0.12), 0.6))
        words_all += sc["words"]
        scenes.append(sc)
        t += sc["dur"]
    duration = round(t, 3)
    sfx_clips += weather_audio(scenes, audio)
    if story.get("style", {}).get("worldAudio", True):
        sfx_clips += world_audio(scenes, audio)
    if duration > 180:
        print(f"  ! WARNING: {duration:.1f}s exceeds 3 min limit")
    tl = {
        **fmt,
        "duration": duration,
        "cast": cast,
        "style": story.get("style", {}),
        "words": words_all,
        "scenes": scenes,
    }
    tl["anims"] = {
        k: v
        for f in sorted((ROOT / "config").glob("anims*.json"))
        for k, v in json.loads(f.read_text(encoding="utf-8")).items()
        if not k.startswith("_")
    }  # keyframed anims: config/anims.json + anims_*.json (imported Roblox animations, interactions...)
    tl["quarks"] = {
        f.stem: json.loads(f.read_text(encoding="utf-8"))
        for f in (ROOT / "assets" / "vfx" / "fx").glob("*.json")
        if not f.stem.startswith("_")
    }  # data-driven effects (engine/quarks.js): all of them, they are small
    (out / "timeline.json").write_text(json.dumps(tl))
    music = audio.get_music(story.get("music", "upbeat"), duration) if story.get("music", "upbeat") != "none" else None
    for name, mus in (
        ("mix.wav", music),
        ("mix_nomusic.wav", None),
    ):  # nomusic: voice + SFX only, for adding a trending sound in the app
        mixed = audio.mix(duration, voice_clips, sfx_clips, mus, story.get("musicVol", 0.16))
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "pipe:0", str(out / name)],
            input=mixed.tobytes(),
            check=True,
        )
    print(f"timeline: {len(scenes)} scenes, {duration:.1f}s")
    return tl
