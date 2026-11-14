"""story.json -> narrated, captioned, scored 9:16 Short.

python pipeline/produce.py stories/<slug>/story.json            full render
python pipeline/produce.py <story> --preview                     1 still per scene -> contact sheet (cheap check)
python pipeline/produce.py <story> --scale 0.5 --workers 4       faster draft render
"""

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from paths import ROOT
from stages.build import build, tts_mod, voice_of
from stages.publish import publish_package
from stages.run import node, run_one
from story.expand import combos, dress, expand, looks, resolve_at

__all__ = [
    "load_env",
    "resolve_at",
    "expand",
    "looks",
    "dress",
    "combos",
    "voice_of",
    "tts_mod",
    "build",
    "publish_package",
    "node",
    "run_one",
    "main",
]


def load_env():
    f = ROOT / ".env"
    if f.exists():
        for ln in f.read_text(encoding="utf-8").splitlines():
            ln = ln.strip()
            if ln and not ln.startswith("#") and "=" in ln:
                k, v = ln.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("story", nargs="*", help="slug(s) or path(s) to story.json; several = batch")
    ap.add_argument(
        "--vocab",
        nargs="?",
        const="all",
        help="print the vocabulary (topic: anim creature crowd expr prop fx sfx shot cast loc weather)",
    )
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--only", help="with --preview: scene numbers to re-check (e.g. 12,31) -> preview_part.jpg")
    ap.add_argument("--scale", type=float, default=1.0)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--force", action="store_true", help="render even if the text checks report problems")
    ap.add_argument("--audio-only", action="store_true")
    ap.add_argument(
        "--qa",
        action="store_true",
        help="render 3 stills per scene and flag dark/blocked/empty/washed frames (pipeline/frameqa.py)",
    )
    ap.add_argument("--fresh", action="store_true", help="ignore the per-scene render cache (cache/segments)")
    ap.add_argument("--blur", type=int, help="motion-blur samples per frame (default 8; 1 = off, ~3x faster draft)")
    ap.add_argument("--out")
    ap.add_argument("--studio", action="store_true")
    ap.add_argument("--lint", action="store_true")
    ap.add_argument("--redo", help="scene numbers (as in --lint, e.g. 12,31) whose voice lines are re-synthesized")
    a = ap.parse_args()
    load_env()
    bad = 0
    if a.vocab:
        from story import lint

        return lint.vocab(a.vocab)
    for s in a.story:
        if len(a.story) > 1:
            print(f"== {s}", flush=True)
        if a.lint:
            bad += bool(run_one(a, Path(s)))
        else:
            run_one(a, Path(s))
    if bad:
        sys.exit(1)


if __name__ == "__main__":
    main()
