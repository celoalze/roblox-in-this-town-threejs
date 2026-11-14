"""Dump a model that is already in the open Studio place (workspace.<name>) to cache/maps_raw/<name>.json via the project's own
Studio MCP client (the result goes to the file, never into the chat).

  python pipeline/tools/map_export.py <workspace child name>
"""

import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import ROOT
from studio_mcp import Studio

name = sys.argv[1]
tpl = (ROOT / "studio" / "export_map.luau").read_text(encoding="utf-8").replace("__MODEL__", name)
st = Studio()
parts = []
skipped = 0
off = 0
CH = 250
try:
    while True:
        r = st.call(
            "execute_luau",
            {"code": tpl.replace("__OFF__", str(off)).replace("__CNT__", str(CH)), "datamodel_type": "Edit"},
        )
        d = json.loads(r)
        parts += d["parts"]
        skipped += d["skipped"]
        seen = d["seen"]
        if seen <= off + CH:
            break
        off += CH
finally:
    st.p.terminate()
out = ROOT / "cache" / "maps_raw"
out.mkdir(parents=True, exist_ok=True)
(out / f"{name}.json").write_text(json.dumps({"n": len(parts), "skipped": skipped, "parts": parts}), encoding="utf-8")
print(name, "parts:", len(parts), "skipped:", skipped, "bytes:", (out / f"{name}.json").stat().st_size)
