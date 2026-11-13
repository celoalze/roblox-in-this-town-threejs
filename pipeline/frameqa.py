"""Automatic frame QA: renders 3 stills per scene and flags frames a viewer would call broken.

  python pipeline/produce.py <slug> --qa            (builds the timeline from cached TTS, then runs this)
  python pipeline/frameqa.py out/<slug>/timeline.json [scale]

Flags (per scene, when >= 2 of 3 samples agree or one is severe):
  dark      mean brightness too low (hidden / murky)
  washed    mean brightness too high (glare, blown highlights)
  blocked   one colour fills most of the frame or the centre (wall, dust, a sleeve in front of the lens)
  empty     almost no detail (nothing to look at: bare sky / floor / flat wall)
  busy      too much high-frequency noise (clutter that reads as static)
"""
import json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).parent))


def metrics(path):
    im = Image.open(path).convert("RGB").resize((72, 128)); a = np.asarray(im, dtype=np.float32)
    luma = a @ np.array([.299, .587, .114], dtype=np.float32)
    q = (a // 32).astype(int); key = q[..., 0] * 64 + q[..., 1] * 8 + q[..., 2]
    top = lambda k: np.bincount(k.ravel(), minlength=512).max() / k.size
    c = key[32:96, 18:54]
    gx = np.abs(np.diff(luma, axis=1)).mean(); gy = np.abs(np.diff(luma, axis=0)).mean()
    return dict(mean=float(luma.mean()), std=float(luma.std()), top=float(top(key)), ctop=float(top(c)), grad=float((gx + gy) / 2), ncol=int((np.bincount(key.ravel(), minlength=512) > key.size * .01).sum()))


def flags(m):
    f = []
    if m["mean"] < 38: f.append("dark")
    if m["mean"] > 222: f.append("washed")
    if m["top"] > .50 or m["ctop"] > .62: f.append("blocked")
    if m["grad"] < 2.2 or m["ncol"] <= 3: f.append("empty")
    if m["grad"] > 24: f.append("busy")
    return f


def run(tl_path, scale=.3, out=None):
    tl = json.loads(Path(tl_path).read_text()); out = Path(out or Path(tl_path).parent / "qa"); out.mkdir(parents=True, exist_ok=True)
    ts = []
    for i, sc in enumerate(tl["scenes"]):
        for f in (.3, .65, .9): ts.append((i, round(sc["start"] + sc["dur"] * f, 2)))
    r = subprocess.run(["node", str(ROOT / "engine" / "render.mjs"), str(tl_path), str(out), "--stills", ",".join(str(t) for _, t in ts), "--scale", str(scale)], capture_output=True, text=True)
    if r.returncode: print(r.stdout[-800:], r.stderr[-800:]); sys.exit(r.returncode)
    rep = []; per = {}
    for i, t in ts:
        p = out / f"t{t:.2f}.jpg"
        if p.exists(): per.setdefault(i, []).append((t, metrics(p), p))
    for i, L in per.items():
        fl = [flags(m) for _, m, _ in L]; cnt = {}
        for x in fl:
            for k in x: cnt[k] = cnt.get(k, 0) + 1
        sev = [k for k, n in cnt.items() if n >= 2 or (k in ("dark", "washed") and any(m["mean"] < 22 or m["mean"] > 238 for _, m, _ in L)) or (k == "blocked" and any(m["top"] > .7 or m["ctop"] > .9 for _, m, _ in L))]
        if sev: rep.append((i, sev, [p for _, _, p in L]))
    try:  # soft intent check: what the text says vs what the frame shows
        import intent
        iw = intent.check(tl, {i: [p for _, _, p in L] for i, L in per.items()})
    except Exception as e: iw = [f"  (intent check skipped: {e})"]
    print(f"frame QA: {len(per)} scenes, {len(rep)} flagged, {len(iw)} intent warning(s)")
    for w in iw: print(w)
    for i, sev, ps in rep:
        sc = tl["scenes"][i]; print(f"  #{i:>2} {','.join(sev):<16} {(sc.get('line') or '')[:60]}")
    if rep:  # contact sheet of the flagged scenes (3 samples each)
        files = [str(p) for _, _, ps in rep for p in ps]; cols = 3; rows = len(rep); inputs = sum([["-i", f] for f in files], [])
        fc = "".join(f"[{k}]" for k in range(len(files))) + f"xstack=inputs={len(files)}:grid={cols}x{rows}"
        subprocess.run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", fc, "-frames:v", "1", "-update", "1", str(out / "flagged.jpg")])
        print(f"  contact sheet -> {out / 'flagged.jpg'}")
    return rep


if __name__ == "__main__":
    run(sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else .3)
