"""contact sheet: python tools/assets/animsheet.py <scene index>[,<idx>...] [n=6] [scale 0.4]  (needs cache/out/_animtest/timeline.json from --preview)"""

import json, subprocess, sys, os
from pathlib import Path
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "pipeline"))
from paths import ROOT

os.chdir(ROOT)
T = json.load(open("cache/out/_animtest/timeline.json"))
A = {}
for f in os.listdir("config"):
    if f.startswith("anims") and f.endswith(".json"):
        A.update(json.load(open("config/" + f, encoding="utf8")))
idx = [int(x) for x in sys.argv[1].split(",")]
n = int(sys.argv[2]) if len(sys.argv) > 2 else 6
sc = sys.argv[3] if len(sys.argv) > 3 else "0.4"
ts = []
meta = []
for i in idx:
    s = T["scenes"][i]
    name = s["actors"][0].get("anim") or s["title"]
    name = s["title"]
    L = A.get(name, {}).get("loop") or 1.6
    for k in range(n):
        t = round(s["start"] + 0.35 + k * L / n, 2)
        ts.append(t)
        meta.append((i, name, k, t))
subprocess.run(
    [
        "node",
        "engine/render.mjs",
        "cache/out/_animtest/timeline.json",
        "cache/out/_animtest/st",
        "--stills",
        ",".join(map(str, ts)),
        "--scale",
        sc,
    ],
    capture_output=True,
)
for i in idx:
    row = [Image.open(f"cache/out/_animtest/st/t{t:.2f}.jpg") for (j, nm, k, t) in meta if j == i]
    w, h = row[0].size
    cw = int(w * 0.6)
    x0 = int(w * 0.2)
    sheet = Image.new("RGB", (cw * len(row), h))
    for c, im in enumerate(row):
        sheet.paste(im.crop((x0, 0, x0 + cw, h)), (c * cw, 0))
        ImageDraw.Draw(sheet).text((c * cw + 4, 4), f"{c}", fill="white")
    ImageDraw.Draw(sheet).text((4, h - 14), [m[1] for m in meta if m[0] == i][0], fill="white")
    sheet.save(f"cache/out/_animtest/sheet_{i}.jpg")
    print("sheet", i, sheet.size)
