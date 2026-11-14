"""Continuous ambient audio beds derived from scene sequences.

Owns weather ambience loops, lightning/thunder sound placement, and world ambience beds.
Must not synthesize TTS speech, mix final audio tracks, or write files to disk.
"""

import sys
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from audio.tts import SR


def weather_audio(scenes, audio):
    """Ambience loops (one continuous bed per run of scenes sharing a weather) + a thunder clap on every lightning strike."""
    from story import shorthand

    WX = shorthand._load("weather.json")
    clips = []
    i = 0
    while i < len(scenes):
        w = scenes[i].get("weather")
        j = i
        while j < len(scenes) and scenes[j].get("weather") == w:
            j += 1
        P = WX.get(w) or {}
        t0 = scenes[i]["start"]
        n = int((scenes[j - 1]["start"] + scenes[j - 1]["dur"] - t0) * SR)
        for name, vol in P.get("ambience", []):
            a = np.asarray(audio.get_sfx({"name": name}), dtype=np.float32)
            x = int(0.4 * SR)
            k = len(a) - x
            if k > x:
                a[:x] = a[:x] * np.linspace(0, 1, x) + a[k:] * np.linspace(1, 0, x)
                a = a[:k]  # seamless loop
            bed = np.tile(a, n // len(a) + 1)[:n].copy()
            f = min(n // 2, int(0.35 * SR))
            bed[:f] *= np.linspace(0, 1, f)
            bed[n - f :] *= np.linspace(1, 0, f)
            clips.append((bed, t0, vol))
        L = P.get("lightning")
        for sc in scenes[i:j] if L else []:
            s = L["first"]
            while s < sc["dur"] - 0.2:
                clips.append((audio.get_sfx({"name": "thunder"}), sc["start"] + s + 0.12, 0.9))
                s += L["every"]
        i = j
    return clips


def world_audio(scenes, audio):
    """config/world_audio.json: one continuous ambience bed per run of scenes in the same world."""
    from story import shorthand

    WA = shorthand._load("world_audio.json")
    clips = []
    i = 0
    while i < len(scenes):
        w = scenes[i].get("set")
        j = i
        while j < len(scenes) and scenes[j].get("set") == w:
            j += 1
        t0 = scenes[i]["start"]
        n = int((scenes[j - 1]["start"] + scenes[j - 1]["dur"] - t0) * SR)
        for name, vol in WA.get(w, []):
            a = np.asarray(audio.get_sfx({"name": name}), dtype=np.float32)
            x = int(0.4 * SR)
            k = len(a) - x
            if k > x:
                a[:x] = a[:x] * np.linspace(0, 1, x) + a[k:] * np.linspace(1, 0, x)
                a = a[:k]
            bed = np.tile(a, n // len(a) + 1)[:n].copy()
            f = min(n // 2, int(0.8 * SR))
            bed[:f] *= np.linspace(0, 1, f)
            bed[n - f :] *= np.linspace(1, 0, f)
            clips.append((bed, t0, vol))
        i = j
    return clips
