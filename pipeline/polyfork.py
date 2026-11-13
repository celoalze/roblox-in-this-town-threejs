"""Tiny client for the Polyfork MCP (https://polyfork.dev/mcp, Streamable HTTP). Key: POLYFORK_API_KEY in .env.
Results are written to files so large JSON never has to be read whole.

  python pipeline/polyfork.py tools
  python pipeline/polyfork.py call search_assets '{"query": "house"}' [out.json]
  python pipeline/polyfork.py get <url> <dest>          # download an asset file (GLB etc.)
"""
import json, os, sys, urllib.request
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[1]
for ln in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
    if "=" in ln and not ln.startswith("#"): k, v = ln.split("=", 1); os.environ.setdefault(k.strip(), v.strip())
URL = "https://polyfork.dev/mcp"


class Polyfork:
    def __init__(self):
        self.sid = None; self.n = 0
        self.rpc("initialize", {"protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": {"name": "roblox-shorts", "version": "1"}})
        self.rpc("notifications/initialized", None, notify=True)

    def rpc(self, method, params, notify=False):
        body = {"jsonrpc": "2.0", "method": method}
        if params is not None: body["params"] = params
        if not notify: self.n += 1; body["id"] = self.n
        h = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream", "Authorization": f"Bearer {os.environ['POLYFORK_API_KEY']}", "User-Agent": "roblox-shorts/1.0"}
        if self.sid: h["Mcp-Session-Id"] = self.sid
        r = urllib.request.urlopen(urllib.request.Request(URL, data=json.dumps(body).encode(), headers=h), timeout=120)
        self.sid = r.headers.get("Mcp-Session-Id") or self.sid
        raw = r.read().decode("utf-8")
        if notify or not raw.strip(): return None
        if "text/event-stream" in (r.headers.get("Content-Type") or ""):
            msgs = [json.loads(l[5:]) for l in raw.splitlines() if l.startswith("data:") and l[5:].strip()]
            m = next((x for x in msgs if x.get("id") == body.get("id")), msgs[-1])
        else:
            m = json.loads(raw)
        if "error" in m: raise RuntimeError(m["error"])
        return m["result"]

    def call(self, name, args=None):
        r = self.rpc("tools/call", {"name": name, "arguments": args or {}})
        return "\n".join(c.get("text", "") for c in r.get("content", []))


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "get":
        req = urllib.request.Request(sys.argv[2], headers={"Authorization": f"Bearer {os.environ['POLYFORK_API_KEY']}", "User-Agent": "roblox-shorts"})
        Path(sys.argv[3]).parent.mkdir(parents=True, exist_ok=True); Path(sys.argv[3]).write_bytes(urllib.request.urlopen(req, timeout=300).read()); print("saved", sys.argv[3]); sys.exit()
    pf = Polyfork()
    if cmd == "tools":
        for t in pf.rpc("tools/list", {})["tools"]: print(f"- {t['name']}: {t.get('description', '')[:160]}\n  {json.dumps(t.get('inputSchema', {}).get('properties', {}))[:260]}")
    elif cmd == "call":
        out = pf.call(sys.argv[2], json.loads(sys.argv[3]) if len(sys.argv) > 3 else {})
        if len(sys.argv) > 4: Path(sys.argv[4]).write_text(out, encoding="utf-8"); print(f"saved {len(out)} chars -> {sys.argv[4]}")
        else: print(out[:3000])
