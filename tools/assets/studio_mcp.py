"""Minimal stdio client for the built-in Roblox Studio MCP server (StudioMCP.exe via %LOCALAPPDATA%/Roblox/mcp.bat).
Studio must be open with the MCP server enabled.

  python tools/assets/studio_mcp.py tools                       # list tools + schemas
  python tools/assets/studio_mcp.py call <tool> '<json args>'   # call one tool
  python tools/assets/studio_mcp.py lua <file.luau>             # run a Luau file via the code-run tool
"""

import json, os, subprocess, sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "pipeline"))
from paths import ROOT

BAT = Path(os.environ["LOCALAPPDATA"]) / "Roblox" / "mcp.bat"


class Studio:
    def __init__(self):
        self.p = subprocess.Popen(
            ["cmd.exe", "/c", str(BAT)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf8",
            bufsize=1,
        )
        self.n = 0
        self.req(
            "initialize",
            {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "roblox-shorts", "version": "1"},
            },
        )
        self.send({"jsonrpc": "2.0", "method": "notifications/initialized"})

    def send(self, m):
        self.p.stdin.write(json.dumps(m) + "\n")
        self.p.stdin.flush()

    def req(self, method, params=None):
        self.n += 1
        i = self.n
        self.send({"jsonrpc": "2.0", "id": i, "method": method, "params": params or {}})
        while True:
            line = self.p.stdout.readline()
            if not line:
                raise RuntimeError("Studio MCP closed")
            try:
                m = json.loads(line)
            except json.JSONDecodeError:
                continue
            if m.get("id") == i:
                if "error" in m:
                    raise RuntimeError(m["error"])
                return m["result"]

    def tools(self):
        return self.req("tools/list")["tools"]

    def call(self, name, args=None):
        r = self.req("tools/call", {"name": name, "arguments": args or {}})
        out = []
        for k, c in enumerate(r.get("content", [])):
            if c.get("type") == "image":  # screen_capture etc. -> save next to cwd
                import base64

                f = (
                    Path(os.environ.get("MCP_IMG_DIR", "."))
                    / f"studio_{name}_{k}.{c.get('mimeType', 'image/png').split('/')[-1]}"
                )
                f.write_bytes(base64.b64decode(c["data"]))
                out.append(f"[image saved: {f}]")
            else:
                out.append(c.get("text", ""))
        return "\n".join(out)

    def close(self):
        self.p.kill()


def code_tool(st):
    names = [t["name"] for t in st.tools()]
    for n in ("run_code", "execute_luau", "run_script", "execute_code"):
        if n in names:
            return n
    return next((n for n in names if "code" in n or "luau" in n or "script" in n), None)


if __name__ == "__main__":
    st = Studio()
    try:
        cmd = sys.argv[1]
        if cmd == "tools":
            for t in st.tools():
                print(
                    f"- {t['name']}: {t.get('description', '')[:200]}\n  {json.dumps(t.get('inputSchema', {}).get('properties', {}))[:300]}"
                )
        elif cmd == "call":
            print(st.call(sys.argv[2], json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}))
        elif cmd == "lua":
            # DM env var picks the datamodel (Edit | Server | Client); see get_studio_state
            print(
                st.call(
                    "execute_luau",
                    {
                        "code": Path(sys.argv[2]).read_text(encoding="utf8"),
                        "datamodel_type": os.environ.get("DM", "Edit"),
                    },
                )
            )
    finally:
        st.close()
