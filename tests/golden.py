"""Golden-master regression harness for refactors that must not change behaviour.

    python tests/golden.py capture [engine|pipeline|build]   record the current behaviour into tests/golden/
    python tests/golden.py check   [engine|pipeline|build|all] [slug,slug]   re-run and compare against the recording (exit 1 on any difference)

engine    frozen timelines (tests/golden/timelines/<slug>.json) -> stills at fixed times, compared pixel-wise.
build     every story whose narration is cached -> `produce.py --audio-only`: timeline.json + mixes, compared by hash.
pipeline  every stories/<slug>/story.json -> `produce.py --lint` (no TTS): stdout, lint.json and lint_timeline.json, compared exactly.

Update the two ENTRY constants below if the entry points move.
"""

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GOLDEN = ROOT / "tests" / "golden"
TIMELINES = GOLDEN / "timelines"
STILLS = GOLDEN / "stills"
LINT = GOLDEN / "lint"

RENDER_ENTRY = ["node", str(ROOT / "engine" / "render.mjs")]
PRODUCE_ENTRY = [sys.executable, str(ROOT / "pipeline" / "produce.py")]

STILLS_PER_TIMELINE = 10
STILL_SCALE = "0.3"
MEAN_DIFF_LIMIT = 0.6  # mean absolute difference per channel (0-255); JPEG + GPU noise stays far below this
PIPELINE_WORKERS = 5
BAD_PIXEL_LIMIT = 0.004  # fraction of pixels allowed to differ by more than 24 levels


def still_times(timeline):
    scenes = timeline["scenes"]
    step = max(1, len(scenes) // STILLS_PER_TIMELINE)
    picked = scenes[::step][:STILLS_PER_TIMELINE]
    return [round(s["start"] + s["dur"] * 0.6, 2) for s in picked]


def render_stills(timeline_path, out_dir):
    times = still_times(json.loads(timeline_path.read_text(encoding="utf-8")))
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = [
        *RENDER_ENTRY,
        str(timeline_path),
        str(out_dir),
        "--stills",
        ",".join(map(str, times)),
        "--scale",
        STILL_SCALE,
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=ROOT)
    if r.returncode:
        raise RuntimeError(f"render failed for {timeline_path.name}:\n{r.stdout[-2000:]}\n{r.stderr[-2000:]}")
    page_errors = [line for line in r.stdout.splitlines() if line.startswith("[pageerror]")]
    return times, page_errors


def compare_images(a, b):
    import numpy as np
    from PIL import Image

    x = np.asarray(Image.open(a).convert("RGB"), dtype=np.int16)
    y = np.asarray(Image.open(b).convert("RGB"), dtype=np.int16)
    if x.shape != y.shape:
        return 255.0, 1.0
    d = np.abs(x - y)
    return float(d.mean()), float((d.max(axis=2) > 24).mean())


def engine(mode):
    failures = []
    for tl in sorted(TIMELINES.glob("*.json")):
        slug = tl.stem
        if mode == "capture":
            shutil.rmtree(STILLS / slug, ignore_errors=True)
            try:
                _, errs = render_stills(tl, STILLS / slug)
            except (
                RuntimeError
            ) as e:  # a stale timeline (e.g. references a removed asset) cannot be a baseline: drop it
                print(
                    f"engine capture {slug}: DROPPED, does not render: {str(e).strip().splitlines()[-1][:160]}",
                    flush=True,
                )
                shutil.rmtree(STILLS / slug, ignore_errors=True)
                tl.unlink()
                continue
            (STILLS / slug / "pageerrors.txt").write_text("\n".join(errs), encoding="utf-8")
            print(
                f"engine capture {slug}: {len(list((STILLS / slug).glob('*.jpg')))} stills, {len(errs)} page errors",
                flush=True,
            )
            continue
        with tempfile.TemporaryDirectory() as tmp:
            _, errs = render_stills(tl, Path(tmp))
            worst = (0.0, 0.0, "")
            for ref in sorted((STILLS / slug).glob("*.jpg")):
                new = Path(tmp) / ref.name
                mean, bad = compare_images(ref, new) if new.exists() else (255.0, 1.0)
                if mean > worst[0]:
                    worst = (mean, bad, ref.name)
                if mean > MEAN_DIFF_LIMIT or bad > BAD_PIXEL_LIMIT:
                    failures.append(f"{slug}/{ref.name}: mean {mean:.2f}, bad pixels {bad:.2%}")
                    keep = GOLDEN / "failed" / slug
                    keep.mkdir(parents=True, exist_ok=True)
                    if new.exists():
                        shutil.copy2(new, keep / ref.name)
            old_errs = (STILLS / slug / "pageerrors.txt").read_text(encoding="utf-8").splitlines()
            if sorted(set(errs)) != sorted(set(old_errs)):
                failures.append(f"{slug}: page errors changed: {sorted(set(errs) - set(old_errs))[:3]}")
            print(f"engine check {slug}: worst mean {worst[0]:.3f} bad {worst[1]:.3%} ({worst[2]})", flush=True)
    return failures


def run_lint(slug, out_dir):
    out_dir.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(
        [*PRODUCE_ENTRY, slug, "--lint", "--out", str(out_dir)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        cwd=ROOT,
    )
    stdout = r.stdout.replace(str(out_dir), "<out>").replace(str(out_dir).replace("\\", "/"), "<out>")
    (out_dir / "stdout.txt").write_text(
        f"exit {r.returncode}\n{stdout}\n--- stderr\n{r.stderr[-3000:] if r.returncode else ''}", encoding="utf-8"
    )


LINT_FILES = ("stdout.txt", "lint.json", "lint_timeline.json")


def pipeline(mode, only=None):
    """Stories are independent, so they are linted a few at a time (each one launches its own headless browser)."""
    from concurrent.futures import ThreadPoolExecutor

    slugs = sorted(
        {p.parent.name for p in (ROOT / "stories").glob("*/story.json")}
        | {p.parent.name for p in (ROOT / "tests" / "stories").glob("*/story.json")}
    )
    if only:
        slugs = [s for s in slugs if s in only]

    def capture(slug):
        shutil.rmtree(LINT / slug, ignore_errors=True)
        run_lint(slug, LINT / slug)
        return []

    def check(slug):
        if not (LINT / slug).exists():
            return []
        found = []
        with tempfile.TemporaryDirectory() as tmp:
            run_lint(slug, Path(tmp))
            for name in LINT_FILES:
                ref, new = LINT / slug / name, Path(tmp) / name
                same = ref.exists() == new.exists() and (not ref.exists() or ref.read_bytes() == new.read_bytes())
                if not same:
                    found.append(f"{slug}/{name} differs")
                    keep = GOLDEN / "failed_lint" / slug
                    keep.mkdir(parents=True, exist_ok=True)
                    if new.exists():
                        shutil.copy2(new, keep / name)
        return found

    with ThreadPoolExecutor(max_workers=PIPELINE_WORKERS) as pool:
        results = list(pool.map(capture if mode == "capture" else check, slugs))
    print(f"pipeline {mode}: {len(slugs)} stories", flush=True)
    return [f for found in results for f in found]


def run_build(slug, out_dir):
    """Full pipeline build without rendering (voice from the cache only): hashes of the timeline and both mixes."""
    import hashlib
    import os
    out_dir.mkdir(parents=True, exist_ok=True)
    env = {**os.environ, "RS_TTS_OFFLINE": "1"}  # never synthesize during a regression run: a cache miss = story skipped
    cmd = [*PRODUCE_ENTRY, slug, "--audio-only", "--force", "--out", str(out_dir)]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=ROOT, env=env)
    if r.returncode:
        return {"skipped": (r.stderr or r.stdout).strip().splitlines()[-1][:200] if (r.stderr or r.stdout).strip() else "failed"}
    return {name: hashlib.sha256((out_dir / name).read_bytes()).hexdigest() for name in BUILD_FILES}


BUILD_FILES = ("timeline.json", "mix.wav", "mix_nomusic.wav")


def build(mode, only=None):
    """Stories whose narration is fully in cache/tts: timeline.json and the audio mixes must stay byte-identical."""
    from concurrent.futures import ThreadPoolExecutor
    slugs = story_slugs(only)
    record_path = GOLDEN / "build.json"
    record = json.loads(record_path.read_text(encoding="utf-8")) if record_path.exists() else {}

    def one(slug):
        with tempfile.TemporaryDirectory() as tmp:
            return slug, run_build(slug, Path(tmp))

    with ThreadPoolExecutor(max_workers=PIPELINE_WORKERS) as pool:
        results = dict(pool.map(one, slugs))
    if mode == "capture":
        record.update(results)
        record_path.write_text(json.dumps(record, indent=1, sort_keys=True), encoding="utf-8")
        skipped = [s for s, v in results.items() if "skipped" in v]
        print(f"build capture: {len(results) - len(skipped)} stories recorded, {len(skipped)} skipped (voice not cached or build error)", flush=True)
        return []
    failures = []
    for slug, got in results.items():
        want = record.get(slug)
        if want is None or "skipped" in want:
            continue
        if got != want:
            diff = [n for n in BUILD_FILES if got.get(n) != want.get(n)] or [got.get("skipped", "?")]
            failures.append(f"build {slug}: differs in {', '.join(diff)}")
    print(f"build check: {sum(1 for s in results if 'skipped' not in record.get(s, {'skipped': 1}))} stories", flush=True)
    return failures


def story_slugs(only=None):
    slugs = sorted(
        {p.parent.name for p in (ROOT / "stories").glob("*/story.json")}
        | {p.parent.name for p in (ROOT / "tests" / "stories").glob("*/story.json")}
    )
    return [s for s in slugs if not only or s in only]


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    part = sys.argv[2] if len(sys.argv) > 2 else "all"
    only = (
        set(sys.argv[3].split(",")) if len(sys.argv) > 3 else None
    )  # optional: comma-separated story slugs (pipeline part)
    if mode not in ("capture", "check"):
        sys.exit(__doc__)
    for stale in ("failed", "failed_lint"):
        shutil.rmtree(GOLDEN / stale, ignore_errors=True)
    failures = []
    if part in ("all", "pipeline"):
        failures += pipeline(mode, only)
    if part in ("all", "build"):
        failures += build(mode, only)
    if part in ("all", "engine"):
        failures += engine(mode)
    if mode == "check":
        print("\n".join(failures) if failures else "GOLDEN OK")
        sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
