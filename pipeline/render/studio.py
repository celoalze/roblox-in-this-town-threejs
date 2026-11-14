"""Studio render path: timeline -> Roblox Studio (edit-mode runtime via MCP) -> window capture -> 9:16 + ASS captions + mix.
Requires Studio open (any place with the map) and the window not minimized.
Called by produce.py when story["engine"] == "studio" (or --studio).
"""

import json, re, subprocess, threading, time
from pathlib import Path
import numpy as np
import sys
from paths import ROOT, TOOLS

sys.path.insert(0, str(TOOLS / "assets"))  # studio_mcp.py (Roblox Studio MCP client) lives with the other stand-alone tools
from studio_mcp import Studio  # noqa: E402

TITLE = "Roblox Studio"


def window_title():
    r = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-Command",
            "(Get-Process RobloxStudioBeta | Where-Object MainWindowTitle | Select-Object -First 1).MainWindowTitle",
        ],
        capture_output=True,
        text=True,
    )
    t = r.stdout.strip()
    if not t:
        raise SystemExit("Roblox Studio window not found")
    return t


CAL_LUA = """local cam = workspace.CurrentCamera
local p = Instance.new("Part"); p.Name = "__VPCAL"; p.Anchored = true; p.Size = Vector3.new(400, 400, 1); p.Material = Enum.Material.Neon; p.Color = Color3.new(1, 0, 1)
cam.CFrame = CFrame.new(0, 3000, 0); p.CFrame = cam.CFrame * CFrame.new(0, 0, -20); p.Parent = workspace
task.delay(%s, function() p:Destroy() end)
return tostring(cam.ViewportSize)"""


def calibrate(st, title):
    """Find the 3D viewport rectangle inside the Studio window (magenta full-screen part)."""
    st.call("execute_luau", {"code": CAL_LUA % 3, "datamodel_type": "Edit"})
    time.sleep(0.6)
    p = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-f",
            "gdigrab",
            "-i",
            f"title={title}",
            "-frames:v",
            "1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "pipe:1",
        ],
        capture_output=True,
    )
    pr = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-f",
            "gdigrab",
            "-i",
            f"title={title}",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=p=0",
        ],
        capture_output=True,
        text=True,
    )
    w, h = map(int, pr.stdout.strip().split(",")[:2])
    a = np.frombuffer(p.stdout, np.uint8)[: w * h * 3].reshape(h, w, 3).astype(int)
    m = (a[:, :, 0] > 200) & (a[:, :, 1] < 80) & (a[:, :, 2] > 200)
    ys, xs = np.where(m)
    if not len(xs):
        raise SystemExit("viewport calibration failed (is the Studio viewport visible?)")
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    vw, vh = (x1 - x0 + 1) // 2 * 2, (y1 - y0 + 1) // 2 * 2
    cw = min(vw, int(vh * 16 / 9)) // 2 * 2  # rolled camera: viewport width -> final height
    return {"x": int(x0 + (vw - cw) // 2), "y": int(y0), "w": int(cw), "h": int(vh)}


def payload(story, tl, resolve_at):
    scenes = []
    for sc in tl["scenes"]:
        actors = []
        for a in sc.get("actors", []):
            a = dict(a)
            a["acts"] = [{**ac, "t": round(resolve_at(ac.get("at"), sc), 3)} for ac in a.pop("actions", [])]
            actors.append(a)
        scenes.append(
            {k: sc.get(k) for k in ("start", "dur", "speaker", "shot", "camera", "punch")}
            | {"actors": actors, "words": [{"s": w["s"], "e": w["e"]} for w in sc.get("words", [])]}
        )
    return {"world": story["world"], "cast": story["cast"], "duration": tl["duration"], "scenes": scenes}


def ass_time(t):
    h = int(t // 3600)
    m = int(t % 3600 // 60)
    s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def captions(tl, story, path):
    st = {"emphColor": "#FFE14D", "uppercase": True, **story.get("style", {})}
    emph = st["emphColor"].lstrip("#")
    emph_bgr = f"&H00{emph[4:6]}{emph[2:4]}{emph[0:2]}"
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Word,Lilita One,{int(1080 * st.get("captionSize", 0.125))},&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,0,0,0,0,100,100,2,0,1,9,5,5,60,60,0,1
Style: Title,Lilita One,78,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,0,0,0,0,100,100,2,0,1,7,4,8,60,60,150,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    y = int(1920 * st.get("captionY", 0.70))
    ev = []
    words = tl["words"]
    for i, w in enumerate(words):
        end = words[i + 1]["s"] if i + 1 < len(words) and words[i + 1]["s"] - w["e"] < 0.6 else w["e"] + 0.25
        txt = w["w"].upper() if st["uppercase"] else w["w"]
        txt = txt.replace("{", "").replace("}", "")
        col = f"\\c{emph_bgr}" if w.get("emph") else ""
        pop = "\\fscx80\\fscy80\\t(0,90,\\fscx112\\fscy112)\\t(90,160,\\fscx100\\fscy100)"
        ev.append(
            f"Dialogue: 1,{ass_time(w['s'])},{ass_time(max(end, w['s'] + 0.12))},Word,,0,0,0,,{{\\pos(540,{y}){pop}{col}}}{txt}"
        )
    for sc in tl["scenes"]:
        if sc.get("title"):
            ev.append(
                f"Dialogue: 2,{ass_time(sc['start'])},{ass_time(sc['start'] + sc['dur'])},Title,,0,0,0,,{{\\fad(150,200)}}{sc['title']}"
            )
    Path(path).write_text(head + "\n".join(ev) + "\n", encoding="utf-8")


def flash_end(raw, fps=30):
    """Seconds where the white sync flash ends (first non-white frame after a white run)."""
    p = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-t",
            "12",
            "-i",
            str(raw),
            "-vf",
            "scale=64:-2,format=gray",
            "-f",
            "rawvideo",
            "pipe:1",
        ],
        capture_output=True,
    )
    pr = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(raw)],
        capture_output=True,
        text=True,
    )
    w, h = map(int, pr.stdout.strip().split(",")[:2])
    h2 = int(round(h * 64 / w / 2) * 2)
    fr = np.frombuffer(p.stdout, np.uint8)
    n = fr.size // (64 * h2)
    means = fr[: n * 64 * h2].reshape(n, -1).mean(1)
    white = means > 235
    seen = False
    for i, v in enumerate(white):
        if v:
            seen = True
        elif seen:
            return i / fps
    raise SystemExit("sync flash not found in capture")


def render(story, tl, out, resolve_at, slug):
    title = window_title()
    st = Studio()
    try:
        vp = calibrate(st, title)
        print(f"  studio viewport crop {vp}")
        code = (
            (ROOT / "studio" / "runtime.luau")
            .read_text(encoding="utf-8")
            .replace("__TIMELINE__", json.dumps(payload(story, tl, resolve_at)))
        )
        (out / "runtime_payload.luau").write_text(code, encoding="utf-8")
        raw = out / "studio_raw.mp4"
        dur = tl["duration"] + 5
        rec = subprocess.Popen(
            [
                "ffmpeg",
                "-y",
                "-v",
                "error",
                "-f",
                "gdigrab",
                "-framerate",
                "30",
                "-i",
                f"title={title}",
                "-t",
                f"{dur:.1f}",
                "-vf",
                f"crop={vp['w']}:{vp['h']}:{vp['x']}:{vp['y']}",
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-crf",
                "12",
                str(raw),
            ]
        )
        time.sleep(0.5)
        print("  " + st.call("execute_luau", {"code": code, "datamodel_type": "Edit"}).strip()[:300])
        rec.wait()
    finally:
        st.close()
    t0 = flash_end(raw)
    print(f"  sync flash ends at {t0:.2f}s")
    ass = out / "captions.ass"
    captions(tl, story, ass)
    fonts = (ROOT / "assets" / "fonts").as_posix().replace(":", "\\:")
    assp = ass.as_posix().replace(":", "\\:")
    final = out / f"{slug}.mp4"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-ss",
            f"{t0:.3f}",
            "-t",
            f"{tl['duration']:.3f}",
            "-i",
            str(raw),
            "-i",
            str(out / "mix.wav"),
            "-vf",
            f"transpose=2,scale=1080:1920:flags=lanczos,eq=saturation=1.08:contrast=1.03,ass='{assp}':fontsdir='{fonts}'",
            "-r",
            "30",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            "-movflags",
            "+faststart",
            str(final),
        ],
        check=True,
    )
    return final
