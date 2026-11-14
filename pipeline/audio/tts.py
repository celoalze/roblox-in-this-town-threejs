"""Narration TTS with word timings. Providers: local (Chatterbox, default when .venv-tts exists) | elevenlabs | kokoro."""

import base64, hashlib, json, os, re, subprocess, urllib.request
import numpy as np
from pathlib import Path
from paths import ROOT

SR = 44100
CACHE = ROOT / "cache" / "tts"
VOICES = json.loads((ROOT / "config" / "voices.json").read_text())
LOCAL_PY = ROOT / ".venv-tts" / "Scripts" / "python.exe"
os.environ.setdefault("HF_HOME", str(ROOT / "cache" / "hf"))
# emotion presets for the local Chatterbox model (exaggeration = intensity, cfg lower = faster/more dramatic pacing)
EMO = {
    "neutral": (0.5, 0.5, 0.75),
    "happy": (0.65, 0.45, 0.8),
    "excited": (0.75, 0.4, 0.8),
    "sad": (0.55, 0.55, 0.7),
    "scared": (0.7, 0.45, 0.75),
    "nervous": (0.6, 0.5, 0.75),
    "angry": (0.8, 0.35, 0.75),
    "calm": (0.4, 0.55, 0.7),
    "whisper": (0.35, 0.6, 0.7),
    "mysterious": (0.45, 0.55, 0.7),
    "dramatic": (0.8, 0.35, 0.75),
    "funny": (0.7, 0.45, 0.8),
    "shocked": (0.8, 0.4, 0.75),
}  # exaggeration capped at .8 (higher = unstable)
PRON = (
    json.loads((ROOT / "config" / "pronunciations.json").read_text(encoding="utf-8"))
    if (ROOT / "config" / "pronunciations.json").exists()
    else {}
)


def auto_emotion(text):
    """Delivery emotion guessed from punctuation/keywords; a scene's `emotion` always overrides."""
    t = TAG.sub("", text or "").replace("*", "").strip()
    low = t.lower()
    if low.endswith(("!?", "?!")):
        return "shocked"
    if low.endswith("!"):
        return "angry" if any(w in low for w in ("hate", "worst", "stupid", "dumb", "unfair")) else "excited"
    if low.endswith(("...", "…")) or "..." in low[:-3]:
        return "dramatic"
    if any(w in low for w in ("suddenly", "until one day", "just like that")):
        return "dramatic"
    if any(w in low for w in ("whisper", "secret", "sneak", "quiet")):
        return "whisper"
    if any(w in low for w in ("cried", " cry", "lonely", "sorry", "alone", "lost ")):
        return "sad"
    if any(w in low for w in ("scared", "afraid", "terrified", "ran.", "run!")):
        return "scared"
    if low.endswith("?"):
        return "mysterious" if low.startswith(("who", "why", "what if")) else "nervous"
    if any(w in low for w in ("hug", "smiled", "laughed", "best friend", "finally")):
        return "happy"
    return "neutral"


def speak_text(text):
    """Display text -> what the TTS reads: ALL-CAPS words to Title case (else they get spelled), pronunciation fixes (1 word -> 1 word)."""

    def fix(m):
        w = m.group(0)
        core = w.strip("'")
        if len(core) >= 2 and core.isupper() and core not in ("OK", "TV", "USA", "UK"):
            w = w.capitalize()
        for k, v in PRON.items():
            if w.lower() == k.lower():
                w = v if not w[0].isupper() else v[0].upper() + v[1:]
        return w

    return re.sub(r"[A-Za-z']+", fix, text)


TAG = re.compile(r"\[[a-z _-]+\]", re.I)


def decode(path_or_bytes, sr=SR):
    """Decode any audio (file path or bytes) to mono float32 @ sr via ffmpeg."""
    inp = path_or_bytes if isinstance(path_or_bytes, (str, Path)) else "pipe:0"
    p = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(inp), "-f", "f32le", "-ac", "1", "-ar", str(sr), "pipe:1"],
        input=None if inp != "pipe:0" else path_or_bytes,
        capture_output=True,
        check=True,
    )
    return np.frombuffer(p.stdout, dtype=np.float32).copy()


def provider():
    p = os.environ.get("TTS_PROVIDER")
    if p:
        return p
    if LOCAL_PY.exists():
        return "local"
    return "elevenlabs" if os.environ.get("ELEVENLABS_API_KEY") else "kokoro"


def words_from_chars(chars, starts, ends):
    words, cur, s0 = [], "", None
    for c, s, e in zip(chars, starts, ends):
        if c.isspace():
            if cur:
                words.append([cur, s0, last_e])
                cur = ""
            continue
        if not cur:
            s0 = s
        cur += c
        last_e = e
    if cur:
        words.append([cur, s0, last_e])
    return words


def proportional_words(text, dur, lead=0.05):
    toks = text.split()
    weights = [len(re.sub(r"[^\w']", "", t)) + 2 + (4 if re.search(r"[.,!?;:…]$", t) else 0) for t in toks]
    tot = sum(weights) or 1
    t = lead
    out = []
    usable = max(0.1, dur - lead - 0.05)
    for tok, w in zip(toks, weights):
        d = usable * w / tot
        out.append([tok, t, t + d * (0.8 if re.search(r"[.,!?;:…]$", tok) else 1)])
        t += d
    return out


def _eleven(text, vid, settings):
    key = os.environ["ELEVENLABS_API_KEY"]
    body = {
        "text": text,
        "model_id": settings.get("model", "eleven_multilingual_v2"),
        "voice_settings": {
            "stability": settings.get("stability", 0.45),
            "similarity_boost": 0.8,
            "style": settings.get("style", 0.35),
            "use_speaker_boost": True,
            "speed": settings.get("speed", 1.05),
        },
    }
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{vid}/with-timestamps?output_format=mp3_44100_128",
        data=json.dumps(body).encode(),
        headers={"xi-api-key": key, "Content-Type": "application/json"},
    )
    r = json.loads(urllib.request.urlopen(req, timeout=120).read())
    audio = decode(base64.b64decode(r["audio_base64"]))
    al = r.get("alignment") or r.get("normalized_alignment")
    words = (
        words_from_chars(al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"])
        if al
        else proportional_words(text, len(audio) / SR)
    )
    return audio, words


_kok = None


def _kokoro(text, voice, settings):
    global _kok
    if _kok is None:
        from kokoro_onnx import Kokoro

        m = ROOT / "models"
        _kok = Kokoro(str(m / "kokoro-v1.0.int8.onnx"), str(m / "voices-v1.0.bin"))
    samples, sr = _kok.create(text, voice=voice, speed=settings.get("speed", 1.1), lang="en-us")
    a = np.asarray(samples, dtype=np.float32)
    if sr != SR:  # resample via ffmpeg
        p = subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-f",
                "f32le",
                "-ar",
                str(sr),
                "-ac",
                "1",
                "-i",
                "pipe:0",
                "-f",
                "f32le",
                "-ar",
                str(SR),
                "pipe:1",
            ],
            input=a.tobytes(),
            capture_output=True,
            check=True,
        )
        a = np.frombuffer(p.stdout, dtype=np.float32).copy()
    # trim silence edges
    idx = np.where(np.abs(a) > 0.01)[0]
    if len(idx):
        a = a[max(0, idx[0] - 800) : idx[-1] + 2000]
    return a, proportional_words(text, len(a) / SR)


def _key(prov, vid, text, settings):
    return hashlib.sha1(json.dumps([prov, vid, text, settings, "v2"], sort_keys=True).encode()).hexdigest()[
        :16
    ]  # v2: emotion caps + QA


def _local_job(text, v, settings, out):
    ex, cfg, temp = EMO.get(settings.get("emotion") or "neutral", EMO["neutral"])
    eng = settings.get("engine") or ("turbo" if TAG.search(text) else "std")
    return {
        "text": text,
        "ref": str(ROOT / v["local"]),
        "out": str(out),
        "engine": eng,
        "exaggeration": settings.get("exaggeration", ex),
        "cfg": settings.get("cfg", cfg),
        "temperature": settings.get("temperature", temp),
    }


def _local_load(stem, settings, display=None):
    a = decode(str(stem.with_suffix(".wav")))
    sp = settings.get("speed", 1.0)
    if abs(sp - 1) > 0.01:  # tempo change keeps pitch; scale timings to match
        p = subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-f",
                "f32le",
                "-ar",
                str(SR),
                "-ac",
                "1",
                "-i",
                "pipe:0",
                "-filter:a",
                f"atempo={sp}",
                "-f",
                "f32le",
                "pipe:1",
            ],
            input=a.tobytes(),
            capture_output=True,
            check=True,
        )
        a = np.frombuffer(p.stdout, dtype=np.float32).copy()
    w = [[t, s / sp, e / sp] for t, s, e in json.loads(stem.with_suffix(".json").read_text())]
    if display:  # captions show the original spelling
        toks = TAG.sub(" ", display).split()
        if len(toks) == len(w):
            w = [[d, s, e] for d, (_, s, e) in zip(toks, w)]
    return a, w


def local_stem(text, alias, settings=None):
    """Cache path (without suffix) of one local-TTS line, exactly as prefetch/synth compute it."""
    settings = {**VOICES.get("_defaults", {}), **(settings or {})}
    v = VOICES.get(alias) or VOICES["narrator"]
    return (
        CACHE
        / "local"
        / _key(
            "local",
            v["local"],
            speak_text(text),
            {k: settings.get(k) for k in ("emotion", "engine", "exaggeration", "cfg", "temperature")},
        )
    )


def prefetch(items):
    """items: [(text, voice_alias, settings)]. Synthesizes all uncached lines in ONE local-model run."""
    if provider() != "local":
        return
    jobs = []
    for text, alias, settings in items:
        settings = {**VOICES.get("_defaults", {}), **(settings or {})}
        v = VOICES.get(alias) or VOICES["narrator"]
        st = speak_text(text)
        stem = (
            CACHE
            / "local"
            / _key(
                "local",
                v["local"],
                st,
                {k: settings.get(k) for k in ("emotion", "engine", "exaggeration", "cfg", "temperature")},
            )
        )
        if not stem.with_suffix(".json").exists():
            jobs.append(_local_job(st, v, settings, stem))
    if not jobs:
        return
    (CACHE / "local").mkdir(parents=True, exist_ok=True)
    jf = CACHE / "local" / "_jobs.json"
    jf.write_text(json.dumps(jobs), encoding="utf8")
    print(f"  local TTS: {len(jobs)} lines")
    for attempt in range(3):  # the worker can crash natively (model load); finished lines are on disk, so just resume
        todo = [j for j in jobs if not Path(j["out"]).with_suffix(".json").exists()]
        if not todo:
            break
        ok = True
        for eng in ("std", "turbo"):  # one model per process: loading both in one process crashes natively on Windows
            part = [j for j in todo if j["engine"] == eng]
            if not part:
                continue
            jf.write_text(json.dumps(part), encoding="utf8")
            ok &= subprocess.run([str(LOCAL_PY), str(ROOT / "pipeline" / "audio" / "tts_local.py"), str(jf)]).returncode == 0
        if ok:
            break
        print(f"  ! local TTS worker crashed, resuming ({len(todo)} lines left)")
    else:
        raise SystemExit("local TTS failed 3 times")


def synth(text, voice_alias="narrator", settings=None):
    """Returns (audio float32 mono @44.1k, words[[w,s,e],...])."""
    settings = {**VOICES.get("_defaults", {}), **(settings or {})}
    v = VOICES.get(voice_alias) or VOICES["narrator"]
    prov = provider()
    if prov == "local":
        stem = (
            CACHE
            / "local"
            / _key(
                "local",
                v["local"],
                speak_text(text),
                {k: settings.get(k) for k in ("emotion", "engine", "exaggeration", "cfg", "temperature")},
            )
        )
        if not stem.with_suffix(".json").exists():
            prefetch([(text, voice_alias, settings)])
        return _local_load(stem, settings, text)
    vid = v["elevenlabs"] if prov == "elevenlabs" else v["kokoro"]
    h = hashlib.sha1(json.dumps([prov, vid, text, settings], sort_keys=True).encode()).hexdigest()[:16]
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / f"{h}.npz"
    if f.exists():
        d = np.load(f, allow_pickle=True)
        return d["a"], d["w"].tolist()
    try:
        a, w = (_eleven if prov == "elevenlabs" else _kokoro)(TAG.sub("", text).strip(), vid, settings)
    except Exception as e:
        if prov != "elevenlabs":
            raise
        print(f"  ! ElevenLabs failed ({e}); falling back to kokoro")
        a, w = _kokoro(text, v["kokoro"], settings)
    np.savez(f, a=a, w=np.array(w, dtype=object))
    return a, w
