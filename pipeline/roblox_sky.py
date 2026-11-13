"""Roblox skybox -> assets/sky/<name>/{rt,lf,up,dn,bk,ft}.png + an entry in config/skies.json (engine/sky.js reads the six faces as they are).

  python pipeline/roblox_sky.py <name> <model asset id>                      a Toolbox / Creator Store model that contains a Sky
  python pipeline/roblox_sky.py <name> bk=ID dn=ID ft=ID lf=ID rt=ID up=ID   the six SkyboxXx texture ids (copy them from the Sky's properties in Studio)
  options: --size 1024 (face size)  --time day|sunset|night|spooky  --force

The light that goes with the sky (sun, hemi, fog in config/skies.json) is estimated from the picture; tune it by hand afterwards."""
import io, json, re, struct, sys
from pathlib import Path
from PIL import Image
sys.path.insert(0, str(Path(__file__).parent))
import rbxmesh

ROOT = Path(__file__).resolve().parent.parent
TMP = ROOT / "cache" / "rbx"; FACES = ["rt", "lf", "up", "dn", "bk", "ft"]


def lz4(src, n):
    out = bytearray(); i = 0
    while i < len(src):
        t = src[i]; i += 1; ll = t >> 4
        if ll == 15:
            while True:
                b = src[i]; i += 1; ll += b
                if b != 255: break
        out += src[i:i + ll]; i += ll
        if i >= len(src): break
        off = src[i] | src[i + 1] << 8; i += 2; ml = t & 15
        if ml == 15:
            while True:
                b = src[i]; i += 1; ml += b
                if b != 255: break
        ml += 4; st = len(out) - off
        for k in range(ml): out.append(out[st + k])
    return bytes(out[:n])


def sky_ids(data):
    """SkyboxXx content ids from a model file (binary .rbxm or XML .rbxmx)."""
    blobs = [data]
    if data[:8] == b"<roblox!":
        blobs = []; i = 32
        while i + 16 <= len(data):
            name, cl, ul = data[i:i + 4], *struct.unpack("<II", data[i + 4:i + 12]); i += 16; raw = data[i:i + (cl or ul)]; i += cl or ul
            if cl and raw[:4] == b"\x28\xb5\x2f\xfd":
                try: import zstandard; raw = zstandard.ZstdDecompressor().decompress(raw, max_output_size=ul)
                except ImportError: raise SystemExit("this model is zstd-compressed: pip install zstandard, or pass the six texture ids (bk=.. dn=.. ...)")
            elif cl: raw = lz4(raw, ul)
            if name == b"PROP": blobs.append(raw)
            if name == b"END\0": break
    out = {}
    for b in blobs:
        for f in ("Bk", "Dn", "Ft", "Lf", "Rt", "Up"):
            m = re.search(rb"Skybox" + f.encode() + rb"[^0-9]{0,80}?(?:id=|rbxassetid://|asset/\?id=)(\d+)", b, re.S)
            if m: out[f.lower()] = int(m[1])
    return out


def main():
    a = [x for x in sys.argv[1:] if not x.startswith("--")]; opt = lambda k, d=None: (sys.argv[sys.argv.index("--" + k) + 1] if "--" + k in sys.argv else d)
    if len(a) < 2: raise SystemExit(__doc__)
    name = a[0]; ids = {k: int(v) for k, v in (x.split("=") for x in a[1:] if "=" in x)}
    if not ids: ids = sky_ids(rbxmesh.fetch(int(a[1]), TMP))
    miss = [f for f in FACES if f not in ids]
    if miss: raise SystemExit(f"missing faces {miss} (found {ids}): pass them as bk=ID dn=ID ft=ID lf=ID rt=ID up=ID")
    out = ROOT / "assets" / "sky" / "cubemaps" / name; out.mkdir(parents=True, exist_ok=True); size = int(opt("size", 1024)); px = []
    for f in FACES:
        im = Image.open(io.BytesIO(rbxmesh.fetch(ids[f], TMP))).convert("RGB")
        if im.size != (size, size): im = im.resize((size, size), Image.LANCZOS)
        im.save(out / f"{f}.png", optimize=True); px.append(im.resize((8, 8), Image.BOX))
    # light estimate: horizon colour = bottom rows of the four side faces, overall brightness -> sun / hemi strength
    side = [p for i, p in enumerate(px) if i not in (2, 3)]; hz = [sum(p.getpixel((x, 6))[c] for p in side for x in range(8)) / 32 for c in range(3)]
    lum = sum(sum(p.getpixel((x, y))) for p in side + [px[2]] for x in range(8) for y in range(8)) / (5 * 64 * 3 * 255); hexc = lambda c: "#%02x%02x%02x" % tuple(int(max(0, min(255, v))) for v in c)
    time = opt("time") or ("night" if lum < .22 else "spooky" if lum < .36 else "day")
    cfgf = ROOT / "config" / "skies.json"; cfg = json.loads(cfgf.read_text(encoding="utf-8"))
    if name not in cfg or "--force" in sys.argv:
        cfg[name] = {"faces": f"assets/sky/cubemaps/{name}", "ids": ids, "sat": 1.1, "con": 1.05, "exp": 1.0, "sun": ["#fff1d8" if time == "day" else "#9fb4ff", round(.5 + 3 * lum, 2)], "hemi": [hexc([v * .5 + 128 for v in hz]), round(.35 + .65 * lum, 2)],
                     "fog": [hexc(hz), 140, 620], "rays": .4 if time == "day" else 0, "time": time, "source": "roblox"}
        cfgf.write_text("{\n" + ",\n".join(f" {json.dumps(k)}: {json.dumps(v)}" for k, v in cfg.items()) + "\n}\n", encoding="utf-8")
    print(f"sky '{name}' -> {out} ({time}, lum {lum:.2f}); use it with \"sky\": \"{name}\"")


if __name__ == "__main__": main()
