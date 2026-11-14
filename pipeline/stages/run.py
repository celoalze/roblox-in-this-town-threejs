"""Story execution runner: coordinates the full lifecycle of a single story.

Owns story path resolution, schema validation, linting, preview sheets, QA, and rendering.
Must not alter story data structures directly or bypass established stage modules.
"""

import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import OUT, ROOT
from stages.build import build, voice_of
from stages.publish import publish_package
from story.expand import expand, resolve_at
from story.schema import unknown_keys, validate


def node(*a):
    r = subprocess.run(["node", str(ROOT / "engine" / "render.mjs"), *map(str, a)])
    if r.returncode:
        sys.exit(r.returncode)


def _redo_scenes(redo_arg, story):
    from audio import tts

    st = expand(json.loads(json.dumps(story)))
    for i in map(int, redo_arg.split(",")):
        sc = st["scenes"][i]
        if not sc.get("line"):
            continue
        stem = tts.local_stem(sc["line"].replace("*", ""), *voice_of(st, sc))
        for ext in (".wav", ".json"):
            stem.with_suffix(ext).unlink(missing_ok=True)
        print(f"  redo #{i}: {sc['line'][:50]}")


def _render_preview(a, tl, out, only):
    idx = only or list(range(len(tl["scenes"])))
    ts = []
    for i in idx:  # one tile per shot: the scene's own camera, then each entry of "shots"
        sc = tl["scenes"][i]
        cut = sorted(
            {
                0.0,
                *[x for x in (resolve_at(h.get("at"), sc) for h in sc.get("shots", [])) if 0.05 < x < sc["dur"] - 0.05],
            }
        ) + [sc["dur"]]
        ts += [round(sc["start"] + t_a + (t_b - t_a) * 0.6, 2) for t_a, t_b in zip(cut, cut[1:])]
    st = out / "preview"
    node(out / "timeline.json", st, "--stills", ",".join(map(str, ts)), "--scale", min(a.scale, 0.4))
    files = [str(st / f"t{x:.2f}.jpg") for x in ts]
    cols = min(6, len(files))
    rows = -(-len(files) // cols)
    inputs = sum([["-i", f] for f in files], [])
    pads = "".join(f"[{i}]" for i in range(len(files)))
    while len(files) < cols * rows:
        inputs += ["-f", "lavfi", "-i", "color=black:s=432x768"]
        pads += f"[{len(files)}]"
        files.append("x")
    dst = out / ("preview_part.jpg" if only else "preview.jpg")
    fc = (
        f"{pads}xstack=inputs={len(files)}:grid={cols}x{rows}[v];[v]scale={min(1600, 270 * cols)}:-1"
        if len(files) > 1
        else "[0]scale=540:-1"
    )
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", fc, "-frames:v", "1", "-update", "1", str(dst)]
    )
    print(
        f"preview -> {dst}  (tiles left-to-right, top-to-bottom = scenes {','.join(map(str, idx)) if only else f'0..{len(idx) - 1}'}, one tile per shot = {len(ts)} tiles; {cols} per row)"
    )


def _render_full(a, story, tl, out, slug):
    node(
        out / "timeline.json",
        out / "video.mp4",
        "--scale",
        a.scale,
        "--workers",
        a.workers,
        *(["--fresh"] if a.fresh else []),
        *(["--blur", a.blur] if a.blur else []),
    )
    final = publish_package(story, out, slug)
    print(f"DONE -> {final}  ({tl['duration']:.0f}s, {len(tl['scenes'])} scenes)")


def run_one(a, sp):
    if not sp.suffix:
        cand = ROOT / "stories" / sp.name / "story.json"
        if not cand.exists():
            test_cand = ROOT / "tests" / "stories" / sp.name / "story.json"
            if test_cand.exists():
                cand = test_cand
        sp = cand
    elif not sp.exists():
        if (ROOT / sp).exists():
            sp = ROOT / sp
        elif (ROOT / "tests" / sp).exists():
            sp = ROOT / "tests" / sp
    story = json.loads(sp.read_text(encoding="utf-8"))
    slug = (story.get("slug") or sp.parent.name) if isinstance(story, dict) else sp.parent.name
    shape_errors = validate(story)
    if shape_errors:
        print("\n".join(shape_errors))
        sys.exit(f"{slug}: story.json does not match config/schema/story.schema.json ({len(shape_errors)} problem(s))")
    key_warnings = unknown_keys(story)
    out = Path(a.out) if a.out else OUT / slug
    out.mkdir(parents=True, exist_ok=True)
    if a.redo:
        _redo_scenes(a.redo, story)
    from story import lint

    if a.lint:
        problems = lint.run(expand(story), out)
        if key_warnings:
            print("\n".join(f"warning: {warning}" for warning in key_warnings))
        return problems
    if not a.force:  # free text-only checks before spending TTS/render time
        W = lint.static(expand(json.loads(json.dumps(story))))
        if W:
            print("\n".join(W))
            sys.exit(f"{slug}: {len(W)} problem(s) - fix them (see --lint) or pass --force")
    only = [int(x) for x in a.only.split(",")] if a.only else None
    try:
        from story import intent

        adv = intent.advise(expand(json.loads(json.dumps(story))))
        if adv:
            print("intent (advisory):")
            print("\n".join(adv))
    except Exception as e:
        print(f"  (intent advice skipped: {e})")
    tl = build(story, out)
    if a.audio_only:
        return
    if a.studio or story.get("engine") == "studio":
        from render import studio

        final = studio.render(story, tl, out, resolve_at, slug)
        print(f"DONE -> {final}")
        return
    if a.qa:
        from render import frameqa

        frameqa.run(out / "timeline.json")
        return
    if a.preview:
        _render_preview(a, tl, out, only)
        return
    _render_full(a, story, tl, out, slug)
