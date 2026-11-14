"""Local expressive TTS worker (runs in .venv-tts, Python 3.11).
Chatterbox (Resemble AI, MIT): zero-shot voice clone from a reference wav + emotion control,
Turbo model supports paralinguistic tags: [laugh] [chuckle] [sigh] [gasp] [cough] ...
Word timings: torchaudio MMS forced aligner on the known text.

usage: python tts_local.py jobs.json
jobs.json: [{"text", "ref", "out", "exaggeration", "cfg", "temperature", "engine": "turbo"|"std"}]
writes <out>.wav (24 kHz mono) and <out>.json (words [[w, s, e], ...]).
"""

import json, re, sys, warnings
from pathlib import Path

warnings.filterwarnings("ignore")
import os, time

os.environ.setdefault("HF_HUB_OFFLINE", "1")  # models are cached locally; skip the online check
import torch, torchaudio

torch.set_num_threads(os.cpu_count() or 8)

DEV = "cuda" if torch.cuda.is_available() else "cpu"
if DEV == "cuda" and torch.version.hip:  # AMD: hipBLASLt has no kernels for some cards (gfx1102) -> use rocBLAS
    torch.backends.cuda.preferred_blas_library("cublas")
_models = {}


def model(engine):
    if engine in _models:
        return _models[engine]
    if engine == "turbo":
        from chatterbox.tts_turbo import ChatterboxTurboTTS as M
    else:
        from chatterbox.tts import ChatterboxTTS as M
    import time

    t0 = time.time()
    _models[engine] = M.from_pretrained(device=DEV)
    print(f"[tts_local] {engine} model loaded in {time.time() - t0:.0f}s", flush=True)
    return _models[engine]


ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def num_words(n):
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + ("" if n % 10 == 0 else " " + ONES[n % 10])
    if n < 1000:
        return ONES[n // 100] + " hundred" + ("" if n % 100 == 0 else " " + num_words(n % 100))
    for div, name in ((10**9, "billion"), (10**6, "million"), (1000, "thousand")):
        if n >= div:
            return num_words(n // div) + " " + name + ("" if n % div == 0 else " " + num_words(n % div))


def spoken(tok):
    """display token -> list of aligner words (a-z')."""
    t = tok.lower().replace("’", "'")
    m = re.fullmatch(r"\$?([\d,]+)(:\d+)?(%|s)?[.,!?…]*", re.sub(r"[\"“”]", "", t))
    if m:
        out = num_words(int(m.group(1).replace(",", ""))).split()
        if m.group(2):
            out += num_words(int(m.group(2)[1:])).split()
        return out
    w = re.sub(r"[^a-z']", "", t).strip("'")
    return [w] if w else []


_fa = None


def align(wav, sr, text):
    global _fa
    if _fa is None:
        b = torchaudio.pipelines.MMS_FA
        _fa = (b.get_model(with_star=False).to(DEV), b.get_tokenizer(), b.get_aligner())
    m, tok, aligner = _fa
    toks = text.split()
    groups = [spoken(t) for t in toks]
    flat = [w for g in groups for w in g]
    w16 = torchaudio.functional.resample(wav, sr, 16000)
    dur = w16.shape[-1] / 16000
    if not flat:
        return [[t, 0.0, dur] for t in toks], 1.0
    with torch.inference_mode():
        em, _ = m(w16.to(DEV))
        spans = aligner(em[0], tok(flat))
    ratio = w16.shape[-1] / em.shape[1] / 16000
    se = [(s[0].start * ratio, s[-1].end * ratio) for s in spans]
    score = sum(t.score for sp in spans for t in sp) / max(1, sum(len(sp) for sp in spans))
    out, k, last = [], 0, 0.0
    for t, g in zip(toks, groups):
        if g:
            s, e = se[k][0], se[k + len(g) - 1][1]
            k += len(g)
        else:
            s, e = last, last + 0.05
        out.append([t, round(s, 3), round(e, 3)])
        last = e
    return out, score


def main():
    jobs = json.loads(Path(sys.argv[1]).read_text(encoding="utf8"))
    print(f"[tts_local] device={DEV} jobs={len(jobs)}", flush=True)
    for i, j in enumerate(jobs):
        eng = j.get("engine", "turbo")
        M = model(eng)
        kw = {
            "audio_prompt_path": j["ref"],
            "exaggeration": min(0.8, j.get("exaggeration", 0.5)),
            "temperature": j.get("temperature", 0.8),
        }
        if eng != "turbo":
            kw["cfg_weight"] = j.get("cfg", 0.5)
        plain = re.sub(r"\s+", " ", re.sub(r"\[[a-z _-]+\]", " ", j["text"], flags=re.I)).strip()
        best = None
        for attempt in range(j.get("tries", 3)):  # QA: regenerate when the audio does not match the text
            try:
                wav = M.generate(j["text"], **kw)
            except TypeError:
                wav = M.generate(j["text"], audio_prompt_path=j["ref"])
            wav = wav.detach().cpu().float()
            if wav.dim() == 1:
                wav = wav[None]
            a = wav[0].abs()
            idx = (a > 0.01).nonzero()
            if len(idx):
                wav = wav[:, max(0, int(idx[0]) - 400) : int(idx[-1]) + 1200]
            words, score = align(wav, M.sr, plain)
            dur = wav.shape[-1] / M.sr
            wps = len(plain.split()) / max(0.3, dur)
            q = score - (0.25 if (wps > 4.6 or wps < 1.0) else 0)  # too fast/slow = dropped or repeated words
            if best is None or q > best[0]:
                best = (q, wav, words, score, wps)
            if q >= j.get("qa", 0.62):
                break
            kw["temperature"] = max(0.5, kw["temperature"] - 0.1)
        q, wav, words, score, wps = best
        out = Path(j["out"])
        out.parent.mkdir(parents=True, exist_ok=True)
        torchaudio.save(str(out.with_suffix(".wav")), wav, M.sr)
        out.with_suffix(".json").write_text(json.dumps(words))
        flag = "" if q >= j.get("qa", 0.62) else "  ! LOW QA"
        print(
            f"[tts_local] {i + 1}/{len(jobs)} {wav.shape[-1] / M.sr:.1f}s qa={score:.2f} wps={wps:.1f} tries={attempt + 1}{flag} | {plain[:50]}",
            flush=True,
        )


if __name__ == "__main__":
    main()
