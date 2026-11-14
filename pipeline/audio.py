"""SFX + music + mixing. Lookup order for a sound: assets/<kind>/<name>.* -> ElevenLabs (prompt) -> procedural synth."""

import hashlib, json, os, urllib.request
import numpy as np
from pathlib import Path
from tts import decode, SR, ROOT

CACHE = ROOT / "cache"
t_ = lambda d: np.arange(int(d * SR)) / SR
rs = np.random.RandomState(7)


def env(n, a=0.005, r=0.2):
    e = np.ones(n)
    na, nr = int(a * SR), min(n, int(r * SR))
    e[:na] = np.linspace(0, 1, na) if na else 1
    e[n - nr :] *= np.linspace(1, 0, nr) ** 2
    return e


def lp(x, k):  # cheap one-pole lowpass, k in (0,1]
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += k * (x[i] - acc)
        y[i] = acc
    return y


def lp_fast(x, cutoff):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / (1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, len(x))


def noise(d):
    return rs.uniform(-1, 1, int(d * SR))


def sweep(f0, f1, d, wave=np.sin):
    f = np.geomspace(f0, f1, int(d * SR))
    return wave(2 * np.pi * np.cumsum(f) / SR)


def seq(parts):
    n = max(int(at * SR) + len(sg) for sg, at in parts)
    o = np.zeros(n)
    for sg, at in parts:
        i = int(at * SR)
        o[i : i + len(sg)] += sg
    return o


# ---------------- procedural SFX library ----------------
def _whoosh(d=0.45):
    n = noise(d)
    f = np.geomspace(300, 4000, len(n))
    X = np.fft.rfft(n)
    out = lp_fast(n, 2500) * np.sin(np.linspace(0, np.pi, len(n))) ** 2
    return out / np.abs(out).max() * 0.8


SYN = {
    "whoosh": _whoosh,
    "swoosh": lambda: _whoosh(0.3),
    "pop": lambda: sweep(500, 1400, 0.09) * env(int(0.09 * SR), 0.001, 0.06) * 0.9,
    "click": lambda: sweep(2000, 1200, 0.03) * env(int(0.03 * SR), 0.0005, 0.02) * 0.7,
    "coin": lambda: (
        np.concatenate([np.sin(2 * np.pi * 988 * t_(0.08)), np.sin(2 * np.pi * 1319 * t_(0.5)) * np.exp(-t_(0.5) * 7)])
        * 0.5
    ),
    "ding": lambda: (
        (np.sin(2 * np.pi * 1568 * t_(1.2)) + 0.4 * np.sin(2 * np.pi * 3136 * t_(1.2))) * np.exp(-t_(1.2) * 3.5) * 0.45
    ),
    "sparkle": lambda: seq(
        [
            (np.sin(2 * np.pi * f * t_(0.4)) * np.exp(-t_(0.4) * 12) * 0.25, i * 0.06)
            for i, f in enumerate([2093, 2637, 3136, 3951, 4186, 3520])
        ]
    ),
    "boom": lambda: (
        (
            np.sin(2 * np.pi * np.cumsum(np.geomspace(120, 35, int(1.4 * SR))) / SR) * np.exp(-t_(1.4) * 2.5)
            + lp_fast(noise(1.4), 400) * np.exp(-t_(1.4) * 6) * 2
        )
        * 0.7
    ),
    "vineboom": lambda: (
        np.tanh(
            3
            * (
                np.sin(2 * np.pi * np.cumsum(np.geomspace(90, 45, int(1.6 * SR))) / SR) * np.exp(-t_(1.6) * 2)
                + 0.3 * np.sin(2 * np.pi * 180 * t_(1.6)) * np.exp(-t_(1.6) * 4)
            )
        )
        * 0.6
    ),
    "thud": lambda: (
        np.sin(2 * np.pi * np.cumsum(np.geomspace(150, 50, int(0.3 * SR))) / SR) * np.exp(-t_(0.3) * 14) * 0.9
    ),
    "thunder": lambda: (
        np.clip(
            lp_fast(noise(3), 300) * 6 * np.exp(-t_(3) * 1.2) + lp_fast(noise(3), 3000) * np.exp(-t_(3) * 9) * 3, -1, 1
        )
        * 0.8
    ),
    "rain": lambda: lp_fast(noise(6), 5000) * 0.25,
    "wind": lambda: lp_fast(noise(6), 500) * (1 + 0.5 * np.sin(t_(6) * 1.3)) * 1.2,
    "riser": lambda: (
        (sweep(200, 1600, 1.5, lambda x: np.sign(np.sin(x))) * 0.15 + lp_fast(noise(1.5), 3000) * 0.3)
        * np.linspace(0, 1, int(1.5 * SR)) ** 2
    ),
    "heartbeat": lambda: np.concatenate(
        [np.pad(SYN["thud"](), (0, int(0.18 * SR))), SYN["thud"]() * 0.7, np.zeros(int(0.5 * SR))]
    ),
    "scratch": lambda: (
        sweep(900, 200, 0.35, lambda x: np.sign(np.sin(x))) * 0.3 * env(int(0.35 * SR), 0.005, 0.1)
        + lp_fast(noise(0.35), 2000) * 0.3
    ),
    "glitch": lambda: np.repeat(rs.uniform(-1, 1, 80), int(0.4 * SR / 80)) * 0.35,
    "bell": lambda: (
        sum(np.sin(2 * np.pi * f * t_(2)) * np.exp(-t_(2) * k) for f, k in [(880, 2), (1760, 3), (2637, 4)])
        * (1 + 0.6 * np.sin(2 * np.pi * 18 * t_(2)))
        * 0.2
    ),
    "step": lambda: lp_fast(noise(0.08), 900) * np.exp(-t_(0.08) * 50) * 2,
    "cash": lambda: np.concatenate([SYN["ding"]()[: int(0.25 * SR)], SYN["coin"]()]),
    "fail": lambda: (
        np.concatenate(
            [np.sin(2 * np.pi * f * t_(0.3)) * env(int(0.3 * SR), 0.01, 0.1) for f in (392, 370, 349)]
            + [
                np.sin(2 * np.pi * 330 * t_(0.9))
                * (1 + 0.3 * np.sin(2 * np.pi * 6 * t_(0.9)))
                * env(int(0.9 * SR), 0.01, 0.5)
            ]
        )
        * 0.35
    ),
    "tada": lambda: seq(
        [
            (np.sin(2 * np.pi * f * t_(1.2)) * np.exp(-t_(1.2) * 2.5) * 0.25, d)
            for f, d in [(523, 0), (659, 0.08), (784, 0.16), (1047, 0.24)]
        ]
    ),
    "gasp": lambda: lp_fast(noise(0.4), 2500) * np.sin(np.linspace(0, np.pi, int(0.4 * SR))) * 0.5,
    "suspense": lambda: (
        (np.sin(2 * np.pi * 55 * t_(3)) + 0.5 * np.sin(2 * np.pi * 58.3 * t_(3))) * np.linspace(0, 1, int(3 * SR)) * 0.4
    ),
}


def _chirps(d, n, lo, hi):
    o = np.zeros(int(d * SR))
    for _ in range(n):
        at = rs.uniform(0, d - 0.3)
        L = rs.uniform(0.08, 0.22)
        f0 = rs.uniform(lo, hi)
        sg = sweep(f0, f0 * rs.uniform(0.6, 1.6), L) * env(int(L * SR), 0.01, 0.05) * rs.uniform(0.15, 0.4)
        i = int(at * SR)
        o[i : i + len(sg)] += sg
        if rs.rand() < 0.5:
            j = i + int(0.14 * SR)
            o[j : j + len(sg)] += sg[: len(o) - j] * 0.7 if j + len(sg) <= len(o) else 0
    return o


def _timed(d, parts):
    o = np.zeros(int(d * SR))
    for sg, at in parts:
        i = int(at * SR)
        o[i : i + len(sg)] += sg[: len(o) - i]
    return o


def _loop_noise(d, cut, lfo, depth=0.5):
    n = lp_fast(noise(d), cut)
    return n * (1 - depth + depth * (0.5 + 0.5 * np.sin(2 * np.pi * lfo * t_(d))))


SYN.update(
    {
        "birds": lambda: _chirps(8, 16, 2200, 4200) + lp_fast(noise(8), 900) * 0.03,
        "jungle_hum": lambda: _loop_noise(8, 1800, 0.3, 0.6) * 0.25 + _chirps(8, 6, 700, 1400) * 0.6,
        "waves": lambda: _loop_noise(8, 900, 0.16, 0.8) * 1.4,
        "underwater": lambda: (
            lp_fast(noise(8), 350) * 1.5 * (0.7 + 0.3 * np.sin(2 * np.pi * 0.2 * t_(8)))
            + _chirps(8, 5, 300, 600) * 0.15
        ),
        "city_hum": lambda: (
            lp_fast(noise(8), 600) * 0.9 * (0.8 + 0.2 * np.sin(2 * np.pi * 0.13 * t_(8)))
            + _chirps(8, 4, 400, 700) * 0.08
        ),
        "chimes": lambda: _timed(
            8,
            [
                (np.sin(2 * np.pi * f * t_(2.5)) * np.exp(-t_(2.5) * 2.2) * 0.12, a)
                for f, a in [(1319, 0.3), (1568, 2.6), (1760, 4.4), (1175, 6.0)]
            ],
        ),
        "cave_drip": lambda: (
            _timed(
                8,
                [
                    (
                        np.sin(2 * np.pi * np.cumsum(np.geomspace(1800, 900, int(0.5 * SR))) / SR)
                        * np.exp(-t_(0.5) * 30)
                        * 0.5
                        + np.sin(2 * np.pi * 700 * t_(0.5)) * np.exp(-t_(0.5) * 14) * 0.12,
                        a,
                    )
                    for a in (0.4, 2.1, 3.3, 5.6, 7.0)
                ],
            )
            + lp_fast(noise(8), 250) * 0.15
        ),
        "room_tone": lambda: lp_fast(noise(8), 220) * 1.2 * (0.85 + 0.15 * np.sin(2 * np.pi * 0.1 * t_(8))),
    }
)


def _eleven_sfx(prompt, dur=None):
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key or os.environ.get("TTS_PROVIDER") == "kokoro":
        return None
    h = hashlib.sha1(f"{prompt}|{dur}".encode()).hexdigest()[:16]
    f = CACHE / "sfx" / f"{h}.mp3"
    if not f.exists():
        body = {"text": prompt, "prompt_influence": 0.5}
        if dur:
            body["duration_seconds"] = dur
        try:
            req = urllib.request.Request(
                "https://api.elevenlabs.io/v1/sound-generation",
                data=json.dumps(body).encode(),
                headers={"xi-api-key": key, "Content-Type": "application/json"},
            )
            data = urllib.request.urlopen(req, timeout=120).read()
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_bytes(data)
        except Exception as e:
            print(f"  ! sfx '{prompt}' failed: {e}")
            return None
    return decode(f)


def asset(kind, name):
    for ext in ("wav", "mp3", "ogg", "flac", "m4a"):
        for f in sorted((ROOT / "assets" / "audio" / kind).glob(f"{name}*.{ext}")):
            return decode(f)
    return None


def get_sfx(spec):
    name, prompt = spec.get("name"), spec.get("prompt")
    if name:
        a = asset("sfx", name)
        if a is not None:
            return a
    if prompt:
        a = _eleven_sfx(prompt, spec.get("dur"))
        if a is not None:
            return a
    key = name or "pop"
    if key not in SYN:
        print(f"  ! unknown sfx '{key}', using pop")
        key = "pop"
    return np.asarray(SYN[key](), dtype=np.float32)


# ---------------- procedural music ----------------
MOODS = {  # bpm, root midi, progression (semitone offsets of chord roots), minor?, drums
    "upbeat": (118, 60, [0, 7, 9, 5], False, True),
    "funny": (128, 62, [0, 5, 7, 5], False, True),
    "mystery": (84, 57, [0, 3, 8, 7], True, False),
    "sad": (72, 57, [0, 8, 3, 10], True, False),
    "tense": (100, 52, [0, 1, 0, 6], True, True),
    "spooky": (70, 50, [0, 1, 6, 5], True, False),
    "epic": (96, 50, [0, 8, 10, 7], True, True),
    "chill": (90, 62, [0, 9, 5, 7], False, False),
}


def synth_music(mood, dur):
    bpm, root, prog, minor, drums = MOODS.get(mood, MOODS["upbeat"])
    beat = 60 / bpm
    bar = beat * 4
    n = int((dur + 1) * SR)
    out = np.zeros(n)
    hz = lambda m: 440 * 2 ** ((m - 69) / 12)
    third = 3 if minor else 4

    def add(sig, at):
        i = int(at * SR)
        j = min(n, i + len(sig))
        if i < n:
            out[i:j] += sig[: j - i]

    t_bar = 0
    k = 0
    while t_bar < dur + 1:
        c = root + prog[k % len(prog)]
        chord = [c, c + third, c + 7]
        tb = t_(bar)
        pad = (
            sum(np.sin(2 * np.pi * hz(m) * tb) + 0.3 * np.sin(2 * np.pi * hz(m) * 2.003 * tb) for m in chord)
            * 0.05
            * env(len(tb), 0.3, 0.4)
        )
        add(pad, t_bar)
        add(np.sin(2 * np.pi * hz(c - 24) * t_(bar)) * 0.16 * env(int(bar * SR), 0.01, 0.3), t_bar)
        arp = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[1] + 12]
        step = beat / 2
        for s in range(8):
            m = arp[s % 4]
            tt = t_(step * 1.8)
            add(
                (np.sin(2 * np.pi * hz(m) * tt) + 0.25 * np.sin(4 * np.pi * hz(m) * tt))
                * np.exp(-tt * (6 if not minor else 3.5))
                * 0.09,
                t_bar + s * step,
            )
        if drums:
            for b in range(4):
                tk = t_(0.25)
                add(
                    np.sin(2 * np.pi * np.cumsum(np.geomspace(140, 45, len(tk))) / SR) * np.exp(-tk * 18) * 0.35,
                    t_bar + b * beat,
                )
                if b % 2 == 1:
                    add(lp_fast(noise(0.15), 6000) * np.exp(-t_(0.15) * 25) * 0.12, t_bar + b * beat)
                add(noise(0.04) * np.exp(-t_(0.04) * 90) * 0.05, t_bar + b * beat + beat / 2)
        t_bar += bar
        k += 1
    return (out[: int(dur * SR)] / max(1e-6, np.abs(out).max()) * 0.6).astype(np.float32)


def eleven_music(mood, dur):
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key or os.environ.get("MUSIC_PROVIDER") != "elevenlabs":
        return None
    prompt = {
        "upbeat": "playful upbeat kids video background music, bouncy, no vocals",
        "mystery": "light mysterious background music for a story, pizzicato, no vocals",
        "sad": "soft emotional piano background, no vocals",
        "spooky": "kid-friendly spooky ambient music, no vocals",
        "funny": "goofy comedic cartoon background music, no vocals",
        "tense": "tense suspense underscore, no vocals",
        "epic": "epic orchestral hybrid background, no vocals",
        "chill": "chill lofi background, no vocals",
    }.get(mood, mood)
    h = hashlib.sha1(f"{prompt}|{int(dur)}".encode()).hexdigest()[:16]
    f = CACHE / "music" / f"{h}.mp3"
    if not f.exists():
        try:
            req = urllib.request.Request(
                "https://api.elevenlabs.io/v1/music",
                data=json.dumps({"prompt": prompt, "music_length_ms": int(min(dur, 180) * 1000)}).encode(),
                headers={"xi-api-key": key, "Content-Type": "application/json"},
            )
            data = urllib.request.urlopen(req, timeout=300).read()
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_bytes(data)
        except Exception as e:
            print(f"  ! music failed: {e}")
            return None
    return decode(f)


def get_music(mood, dur):
    a = asset("music", mood)
    if a is None:
        a = eleven_music(mood, dur)
    if a is None:
        a = synth_music(mood, dur)
    if len(a) < dur * SR:
        a = np.tile(a, int(dur * SR / len(a)) + 1)
    return a[: int(dur * SR)]


# ---------------- mix ----------------
def place(track, sig, at, gain=1.0):
    i = int(at * SR)
    if i >= len(track) or i < 0:
        return
    j = min(len(track), i + len(sig))
    track[i:j] += sig[: j - i] * gain


SFX_GAIN = 0.32


def mix(dur, voice_clips, sfx_clips, music, music_vol=0.16, duck=0.4):
    n = int(dur * SR)
    voice = np.zeros(n, np.float32)
    fx = np.zeros(n, np.float32)
    for a, at, g in voice_clips:
        place(voice, a / max(1e-6, np.abs(a).max()) * 0.9, at, g)
    for a, at, g in sfx_clips:
        place(fx, a / max(1e-6, np.abs(a).max()) * 0.9, at, g)  # normalize every SFX like the voice
    # SFX sit ~10 dB under the voice and duck a further ~6 dB while someone is speaking
    w = int(0.15 * SR)
    c = np.concatenate([[0.0], np.cumsum((np.abs(voice) > 0.02).astype(np.float64))])
    lo = np.clip(np.arange(n) - w // 2, 0, n)
    hi = np.clip(np.arange(n) + w - w // 2, 0, n)
    talk = np.clip((c[hi] - c[lo]) / w * 4, 0, 1).astype(np.float32)
    out = voice + fx * SFX_GAIN * (1 - 0.5 * talk)
    if music is not None:
        m = music[:n] * music_vol
        w = int(0.25 * SR)
        c = np.concatenate(
            [[0.0], np.cumsum((np.abs(voice) > 0.02).astype(np.float64))]
        )  # O(n) moving average (was np.convolve: ~200 s)
        lo = np.clip(np.arange(n) - w // 2, 0, n)
        hi = np.clip(np.arange(n) + w - w // 2, 0, n)
        act = ((c[hi] - c[lo]) / w).astype(np.float32)
        m *= 1 - duck * np.clip(act * 4, 0, 1)
        fade = int(1.2 * SR)
        m[-fade:] *= np.linspace(1, 0, fade)
        out += m
    peak = np.abs(out).max()
    if peak > 0.98:
        out = np.tanh(out / peak * 1.4) * 0.95
    return out.astype(np.float32)
