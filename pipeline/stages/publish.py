"""Publish packaging stage: final muxing and distribution metadata generation.

Owns muxing video and audio streams via ffmpeg, copying MP4 outputs, and writing social metadata.
Must not normalize stories, synthesize audio, or render scenes.
"""

import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import PUBLISH


def publish_package(story, out, slug):
    """publish/<slug>/: <slug>.mp4 (with music), <slug>_nomusic.mp4, youtube.txt, tiktok.txt. No thumbnail (made manually)."""
    pub = PUBLISH / slug
    pub.mkdir(parents=True, exist_ok=True)
    for src, name in (("mix.wav", f"{slug}.mp4"), ("mix_nomusic.wav", f"{slug}_nomusic.mp4")):
        if (out / src).exists():
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-v",
                    "error",
                    "-i",
                    str(out / "video.mp4"),
                    "-i",
                    str(out / src),
                    "-c:v",
                    "copy",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "192k",
                    "-shortest",
                    "-movflags",
                    "+faststart",
                    str(pub / name),
                ],
                check=True,
            )
    P = story.get("publish") or {}
    tags = [t.lstrip("#") for t in P.get("tags", [])]
    hashtags = " ".join("#" + t.replace(" ", "") for t in tags[:8])
    yt = (
        "TITLE:\n"
        + P.get("title", story.get("title", ""))
        + "\n\nDESCRIPTION:\n"
        + P.get("description", "")
        + "\n\n"
        + hashtags
        + "\n\nTAGS:\n"
        + ", ".join(tags)
        + "\n"
    )
    (pub / "youtube.txt").write_text(yt, encoding="utf-8")
    (pub / "tiktok.txt").write_text(P.get("caption", P.get("title", "")) + "\n\n" + hashtags + "\n", encoding="utf-8")
    shutil.copy2(pub / f"{slug}.mp4", out / f"{slug}.mp4")
    return pub / f"{slug}.mp4"
