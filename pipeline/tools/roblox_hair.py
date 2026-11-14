"""Roblox catalog hairs -> assets/roblox/hair/<name>.json (+ .png). No Studio export step: meshes and textures download by id.

  python pipeline/tools/roblox_hair.py            convert every style in config/roblox_hair.json "styles" that is missing
  python pipeline/tools/roblox_hair.py --force    redo all

Two kinds of source (ids come from a read-only Studio probe, see docs/REFERENCE.md "Roblox hair"):
- classic  (SpecialMesh accessory): vertex * scale + pos = head-centre space.
- layered  (2021+ free hairs, made for a small realistic head and wrapped at runtime): the hair's own reference cage gives
  that head's size, and the mesh is scaled per axis onto the classic 1.2-stud head.
Output space: studs, origin = head centre, +Z = face (the engine's convention). Textures are saved as light greyscale so
`hairColor` tints any style to any colour.
"""

import io, json, sys
from pathlib import Path
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import ROOT
import rbxmesh

OUT = ROOT / "assets" / "roblox" / "hair"
TMP = ROOT / "cache" / "rbx"
HEAD = (1.28, 1.24, 1.28)  # classic head: width, height, depth (studs)


def fit_layered(pos, st):
    cage, _, _ = rbxmesh.parse(rbxmesh.fetch(st["ref"], TMP))
    cage = cage + np.array(st["refOrigin"])  # cage in the hair part's space
    pos = pos - (pos.max(0) + pos.min(0)) / 2  # a MeshPart is centred on its bounding box
    top = cage[:, 1].max()
    band = cage[(cage[:, 1] < top - 0.12) & (cage[:, 1] > top - 0.55)]  # skull band: above the jaw, below the crown
    w = band[:, 0].max() - band[:, 0].min()
    d = band[:, 2].max() - band[:, 2].min()
    h = 0.72  # the reference mannequin's head height
    c = np.array([(band[:, 0].max() + band[:, 0].min()) / 2, top - h / 2, (band[:, 2].max() + band[:, 2].min()) / 2])
    q = (pos - c) / np.array([w / 2, h / 2, d / 2])  # the reference head is now ~ a unit sphere
    # sphere -> cylinder: our head is a flat-topped cylinder, so the dome of a realistic scalp must be pushed out into its
    # corners (else the head pokes through the hair), and the sides out to the cylinder wall at jaw height.
    rho = np.hypot(q[:, 0], q[:, 2])
    y = q[:, 1]
    phi = np.arctan2(y, np.maximum(rho, 1e-6))
    n = 5.0
    k_up = 1 / (np.abs(np.cos(phi)) ** n + np.abs(np.sin(phi)) ** n) ** (
        1 / n
    )  # circle -> rounded square in the (rho, y) plane
    yy = np.clip(-y, 0, 0.8)
    k_dn = 1 / np.sqrt(1 - yy**2)
    k_dn = np.where(
        y < -1, 1.2 + (k_dn - 1.2) * np.clip((y + 1.9) / 0.9, 0, 1), k_dn
    )  # below the chin hair falls back towards the neck
    up = y >= 0
    q[:, 0] *= np.where(up, k_up, k_dn)
    q[:, 2] *= np.where(up, k_up, k_dn)
    q[:, 1] *= np.where(up, k_up, 1)
    m = st.get("fit", 1.04)
    return q * np.array([HEAD[0] / 2, HEAD[1] / 2, HEAD[2] / 2]) * m


def texture(st):
    im = Image.open(io.BytesIO(rbxmesh.fetch(st["tex"], TMP))).convert("RGBA")
    if st.get("kind") == "layered":
        bg = Image.new("RGBA", im.size, (163, 162, 165, 255))
        bg.alpha_composite(im)
        im = bg  # AlphaMode.Overlay over the part colour
    a = np.asarray(im).astype(np.float32)
    rgb = a[..., :3]
    lum = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    if st.get("gray", True):  # light greyscale keeps the strands, loses the colour: hairColor multiplies it
        m = a[..., 3] > 40
        lo, hi = np.percentile(lum[m], [2, 98]) if m.any() else (0, 255)
        g = np.clip((lum - lo) / max(1, hi - lo), 0, 1) * 0.5 + 0.5
        rgb = np.repeat((g * 255)[..., None], 3, 2)
    out = Image.fromarray(np.dstack([rgb, a[..., 3:]]).astype(np.uint8), "RGBA")
    if max(out.size) > 512:
        out = out.resize((512, 512), Image.LANCZOS)
    return out


def convert(name, st):
    pos, uv, faces = rbxmesh.parse(rbxmesh.fetch(st["mesh"], TMP))
    if st.get("kind") == "layered":
        pos = fit_layered(pos, st)
    else:
        pos = pos * np.array(st.get("scale", [1, 1, 1])) + np.array(st.get("pos", [0, 0, 0]))
    pos = pos * np.array([-1, 1, -1]) + np.array(
        st.get("nudge", [0, 0, 0])
    )  # Roblox front -Z -> ours +Z (a rotation: winding is kept)
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
    texture(st).save(OUT / f"{name}.png", optimize=True)
    return len(used), len(faces)


if __name__ == "__main__":
    cfg = json.loads((ROOT / "config" / "roblox_hair.json").read_text(encoding="utf-8"))
    for name, st in cfg.get("styles", {}).items():
        if (OUT / f"{name}.json").exists() and "--force" not in sys.argv:
            continue
        try:
            print(name, "%d verts %d faces" % convert(name, st))
        except Exception as e:
            print(name, "FAILED:", e)
