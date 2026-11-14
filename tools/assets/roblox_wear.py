"""Roblox catalog accessories -> assets/roblox/wear/<name>.json (+ .png). Same idea as roblox_hair.py: meshes / textures download by id.

  python tools/assets/roblox_wear.py [--force]

Output space: studs, origin = centre of the R6 part the accessory is attached to (head / torso), +Z = front (engine convention)."""

import io, json, sys
from pathlib import Path
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "pipeline"))
from paths import ROOT
import rbxmesh

OUT = ROOT / "assets" / "roblox" / "wear"
TMP = ROOT / "cache" / "rbx"


def convert(name, w):
    pos, uv, faces = rbxmesh.parse(rbxmesh.fetch(w["mesh"], TMP))
    pos = (pos * np.array(w.get("scale", [1, 1, 1])) + np.array(w.get("pos", [0, 0, 0]))) * np.array(
        [-1, 1, -1]
    )  # Roblox front -Z -> ours +Z
    used = np.unique(faces)
    remap = -np.ones(len(pos), dtype=np.int64)
    remap[used] = np.arange(len(used))
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{name}.json").write_text(
        json.dumps(
            {
                "p": np.round(pos[used], 4).ravel().tolist(),
                "uv": np.round(uv[used], 4).ravel().tolist(),
                "i": remap[faces].ravel().tolist(),
            },
            separators=(",", ":"),
        )
    )
    im = Image.open(io.BytesIO(rbxmesh.fetch(w["tex"], TMP))).convert("RGBA")
    if max(im.size) > 512:
        im = im.resize((512, 512), Image.LANCZOS)
    im.save(OUT / f"{name}.png", optimize=True)
    return len(used), len(faces)


if __name__ == "__main__":
    cfg = json.loads((ROOT / "config" / "wearables.json").read_text(encoding="utf-8"))
    for name, w in cfg.items():
        if name.startswith("_") or ((OUT / f"{name}.json").exists() and "--force" not in sys.argv):
            continue
        try:
            print(name, "%d verts %d faces" % convert(name, w))
        except Exception as e:
            print(name, "FAILED:", repr(e).encode("ascii", "replace").decode())

    cl = json.loads((ROOT / "config" / "roblox_clothes.json").read_text(encoding="utf-8"))
    CO = ROOT / "assets" / "roblox" / "clothes"
    CO.mkdir(parents=True, exist_ok=True)
    for kind in ("shirts", "pants"):
        for name, c in cl[kind].items():
            f = CO / f"{kind[0]}_{name}.png"
            if f.exists() and "--force" not in sys.argv:
                continue
            try:
                im = Image.open(io.BytesIO(rbxmesh.fetch(c["template"], TMP))).convert("RGBA")
                im.save(f, optimize=True)
                print(kind, name, im.size)
            except Exception as e:
                print(kind, name, "FAILED:", repr(e).encode("ascii", "replace").decode())
