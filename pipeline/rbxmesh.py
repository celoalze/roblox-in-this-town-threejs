"""Roblox .mesh parser (versions 1.00/1.01 text, 2.00, 3.x, 4.x binary) -> numpy arrays. No Studio needed:
meshes and textures of catalog assets download by id from assetdelivery.roblox.com."""
import struct, re, urllib.request, urllib.error
import numpy as np


def fetch(asset_id, cache_dir):
    f = cache_dir / f"{asset_id}.bin"
    if not f.exists():
        cache_dir.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(f"https://assetdelivery.roblox.com/v1/asset/?id={asset_id}", headers={"User-Agent": "Roblox/WinInet"})
        try: data = urllib.request.urlopen(req, timeout=60).read()
        except urllib.error.HTTPError as e:  # anonymous delivery refused: go through Open Cloud with ROBLOX_OPENCLOUD_API_KEY from .env (scope legacy-asset:manage)
            import json, os, re
            env = cache_dir.parents[1] / ".env"; key = os.environ.get("ROBLOX_OPENCLOUD_API_KEY") or (re.search(r"^ROBLOX_OPENCLOUD_API_KEY=(.+)$", env.read_text(encoding="utf-8"), re.M) or [0, ""])[1].strip() if env.exists() else ""
            if e.code not in (401, 403) or not key: raise
            loc = json.loads(urllib.request.urlopen(urllib.request.Request(f"https://apis.roblox.com/asset-delivery-api/v1/assetId/{asset_id}", headers={"x-api-key": key}), timeout=60).read())["location"]
            data = urllib.request.urlopen(loc, timeout=60).read()
        if data[:2] == bytes([31, 139]): import gzip; data = gzip.decompress(data)
        f.write_bytes(data)
    return f.read_bytes()


def parse(b):
    """-> (pos[n,3], uv[n,2] (v up, OpenGL), faces[m,3]) of the highest LOD."""
    head = b[:13].decode("ascii", "replace"); ver = head[8:12]
    if ver.startswith("1."):
        txt = b.decode("ascii", "replace"); nums = np.array(re.findall(r"-?\d+\.?\d*(?:e-?\d+)?", txt.split("\n", 2)[2]), dtype=np.float64)
        v = nums[: len(nums) // 9 * 9].reshape(-1, 9); pos = v[:, 0:3] * (.5 if ver == "1.00" else 1); uv = np.stack([v[:, 6], 1 - v[:, 7]], 1)
        return pos, np.stack([uv[:, 0], 1 - uv[:, 1]], 1), np.arange(len(pos)).reshape(-1, 3)
    o = 13
    if ver.startswith("2.") or ver.startswith("3."):
        hs, vs, fs = struct.unpack_from("<HBB", b, o)
        if ver.startswith("3."): _, nl, nv, nf = struct.unpack_from("<HHII", b, o + 4)
        else: nl = 0; nv, nf = struct.unpack_from("<II", b, o + 4)
        o += hs; nb = 0
    elif ver.startswith("4.") or ver.startswith("5."):
        hs, _, nv, nf, nl, nb = struct.unpack_from("<HHIIHH", b, o); vs = 40; fs = 12; o += hs
    else: raise ValueError(f"mesh version {ver} not supported")
    raw = np.frombuffer(b, dtype=np.uint8, count=nv * vs, offset=o).reshape(nv, vs); o += nv * vs
    fl = np.frombuffer(raw[:, :32].tobytes(), dtype="<f4").reshape(nv, 8)
    if nb: o += nv * 8
    faces = np.frombuffer(b, dtype="<u4", count=nf * 3, offset=o).reshape(nf, 3); o += nf * fs
    if nl > 1: lods = np.frombuffer(b, dtype="<u4", count=nl, offset=o); faces = faces[lods[0]:lods[1]]
    return fl[:, 0:3].astype(np.float64), np.stack([fl[:, 6], 1 - fl[:, 7]], 1).astype(np.float64), faces.astype(np.int64)


def parse_skinned(b):
    """Version 4.x / 5.x mesh with skinning -> dict(pos, uv, faces, bones=[(name, parent, pos[3])], vbone[n] = dominant bone index per vertex).
    Bone positions are rest positions in the mesh's own space."""
    ver = b[8:12].decode("ascii", "replace")
    if not (ver.startswith("4.") or ver.startswith("5.")): raise ValueError(f"skinned mesh needs version 4/5, got {ver}")
    o = 13; hs, _, nv, nf, nl, nb, nbn, ns, _hq, _u = struct.unpack_from("<HHIIHHIHBB", b, o); o += hs
    raw = np.frombuffer(b, dtype=np.uint8, count=nv * 40, offset=o).reshape(nv, 40); o += nv * 40
    fl = np.frombuffer(raw[:, :32].tobytes(), dtype="<f4").reshape(nv, 8)
    sk = np.frombuffer(b, dtype=np.uint8, count=nv * 8, offset=o).reshape(nv, 8) if nb else None; o += nv * 8 if nb else 0
    faces = np.frombuffer(b, dtype="<u4", count=nf * 3, offset=o).reshape(nf, 3).astype(np.int64); o += nf * 12
    lods = np.frombuffer(b, dtype="<u4", count=nl, offset=o); o += nl * 4
    bones = []; bo = o; o += nb * 60; names = b[o:o + nbn]; o += nbn
    for i in range(nb):
        no, parent, _lp, _cull = struct.unpack_from("<IHHf", b, bo + i * 60); m = struct.unpack_from("<12f", b, bo + i * 60 + 12)
        bones.append((names[no:names.index(bytes([0]), no)].decode("ascii", "replace"), parent, np.array(m[9:12], dtype=np.float64)))
    vbone = np.zeros(nv, dtype=np.int64)
    for i in range(ns):  # skinning indices are relative to each subset's bone table
        fb, fl_, vb, vl, nbi = struct.unpack_from("<5I", b, o + i * 72); table = np.frombuffer(b, dtype="<u2", count=26, offset=o + i * 72 + 20)
        if sk is not None: dom = np.argmax(sk[vb:vb + vl, 4:8], axis=1); vbone[vb:vb + vl] = table[sk[vb:vb + vl, :4][np.arange(vl), dom]]
    if nl > 1: faces = faces[lods[0]:lods[1]]
    return {"pos": fl[:, 0:3].astype(np.float64), "uv": np.stack([fl[:, 6], 1 - fl[:, 7]], 1).astype(np.float64), "faces": faces, "bones": bones, "vbone": vbone}
