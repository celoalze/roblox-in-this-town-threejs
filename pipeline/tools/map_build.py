"""cache/maps_raw/<name>.json (pipeline/tools/map_export.py dump of a Studio map) -> assets/maps/<out>.glb, ONE vertex-coloured mesh.

  python pipeline/tools/map_build.py <name> [out_name] [--sub model]   # --sub: stand-in GLB (assets/models/cenario/<model>.glb) for meshes that cannot be downloaded

Roblox primitives (block, ball, cylinder, wedge) are rebuilt, MeshParts come from the downloaded .mesh files (pipeline/tools/rbxmesh.py),
meshes that Roblox will not serve (private assets) are replaced by the --sub model scaled to the part size, unions become boxes.
Units stay studs / Roblox world coordinates, which is what engine `set: "map"` expects. Transparent parts (> 5 %) are dropped.
"""

import argparse, json, sys
from pathlib import Path
import numpy as np, trimesh

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import ROOT
import rbxmesh
MATTINT = {
    "Ice": (0.82, 0.93, 1.0, 0.35),
    "Snow": (0.95, 0.97, 1, 0.5),
    "Slate": (0.9, 0.9, 0.95, 0.1),
}  # Roblox material -> (r,g,b, amount) blended into the part colour


def rgb(h):
    c = np.array([int(h[i : i + 2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255.0
    return c


def wedge(sx, sy, sz):
    v = np.array([[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [-1, 1, 1], [1, 1, 1]], dtype=float) * [
        sx / 2,
        sy / 2,
        sz / 2,
    ]
    f = [
        [0, 2, 1],
        [0, 3, 2],
        [3, 4, 5],
        [3, 5, 2],
        [0, 1, 5],
        [0, 5, 4],
        [0, 4, 3],
        [1, 2, 5],
    ]  # bottom, slope, back, sides
    return trimesh.Trimesh(v, f, process=False)


def build(name, out_name, sub):
    d = json.loads((ROOT / "cache" / "maps_raw" / f"{name}.json").read_text(encoding="utf-8"))
    cache = ROOT / "cache" / "maps_raw" / "meshes"
    mcache = {}
    miss = {}
    subm = None
    if sub:
        sc = trimesh.load(ROOT / "assets" / "models" / "cenario" / f"{sub}.glb", force="scene")
        subm = sc.to_geometry() if hasattr(sc, "to_geometry") else sc.dump(concatenate=True)
        try:
            subm.visual = subm.visual.to_color()
        except Exception:
            pass
        b = subm.bounds
        subm.apply_translation([-(b[0][0] + b[1][0]) / 2, -b[0][1], -(b[0][2] + b[1][2]) / 2])
        sub_h = subm.bounds[1][1]
    pieces = []
    stats = {"prim": 0, "mesh": 0, "sub": 0, "dropped": 0}
    for part in d["parts"]:
        kind, cf, size, col, mat, tr, extra = (part + [None] * 7)[:7]
        if tr > 0.05:
            stats["dropped"] += 1
            continue
        sx, sy, sz = size
        color = rgb(col)
        if mat in MATTINT:
            t = MATTINT[mat]
            color = color * (1 - t[3]) + np.array(t[:3]) * t[3]
        m = None
        if kind in ("B", "U", "CW") and kind != "CW":
            m = trimesh.creation.box(extents=[sx, sy, sz])
        elif kind == "CW":
            m = wedge(sx, sy, sz)
        elif kind == "W":
            m = wedge(sx, sy, sz)
        elif kind == "S":
            m = trimesh.creation.icosphere(subdivisions=2, radius=0.5)
            m.apply_scale([sx, sy, sz])
        elif kind == "C":
            m = trimesh.creation.cylinder(radius=0.5, height=1, sections=16)
            m.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 0, 1]))
            m.apply_scale([sx, sy, sz])
        elif kind == "CY":
            m = trimesh.creation.cylinder(radius=0.5, height=1, sections=16)
            m.apply_scale([sx, sy, sz])
        elif kind == "M" and extra:
            mid = extra[0].split("//")[-1]
            if mid not in mcache:
                try:
                    p, uv, f = rbxmesh.parse(rbxmesh.fetch(mid, cache))
                    mcache[mid] = (p, f)
                except Exception:
                    mcache[mid] = None
            if mcache[mid] is not None:
                p, f = mcache[mid]
                lo, hi = p.min(0), p.max(0)
                span = np.maximum(hi - lo, 1e-6)
                m = trimesh.Trimesh((p - (lo + hi) / 2) * (np.array([sx, sy, sz]) / span), f, process=False)
                stats["mesh"] += 1
            elif subm is not None:
                m = subm.copy()
                m.apply_scale(sy / sub_h)  # keep proportions: scale by the part height
                m.apply_translation([0, -sy / 2, 0])
                miss[mid] = miss.get(mid, 0) + 1
                stats["sub"] += 1
            else:
                m = trimesh.creation.box(extents=[sx, sy, sz])
                miss[mid] = miss.get(mid, 0) + 1
        elif kind == "FM":
            m = trimesh.creation.box(extents=[sx, sy, sz])
        if m is None:
            m = trimesh.creation.box(extents=[sx, sy, sz])
        if kind in ("B", "U", "W", "CW", "S", "C", "CY", "FM"):
            stats["prim"] += 1
        T = np.eye(4)
        T[:3, :3] = np.array(cf[3:12]).reshape(3, 3)
        T[:3, 3] = cf[:3]
        m.apply_transform(T)
        m.visual = trimesh.visual.ColorVisuals(
            m, vertex_colors=np.tile((np.append(color, 1) * 255).astype(np.uint8), (len(m.vertices), 1))
        )
        pieces.append(m)
    mesh = trimesh.util.concatenate(pieces)
    out = ROOT / "assets" / "maps"
    out.mkdir(parents=True, exist_ok=True)
    f = out / f"{out_name}.glb"
    mesh.export(f)
    print(
        f"{out_name}: {len(mesh.vertices)} verts, {len(mesh.faces)} tris, {f.stat().st_size / 1e6:.1f} MB | {stats} | missing meshes: {miss}"
    )
    print("bounds", mesh.bounds.round(0).tolist())


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("name")
    ap.add_argument("out", nargs="?")
    ap.add_argument("--sub")
    a = ap.parse_args()
    build(a.name, a.out or a.name.lower(), a.sub)
