#!/usr/bin/env python3
"""Roblox KeyframeSequence (R15 or classic R6 clip) -> native R15 animation entry in config/anims_r15.json (engine format: docs/R15.md section 10).

WORKFLOW (two steps, because Python cannot reach Studio):
  1. In Roblox Studio (MCP: Roblox_Studio list_roblox_studios -> execute_luau, datamodel "Edit") run studio/export_anim.luau with IDS = {assetId, ...}
     (to find ids inside a model/pack put the model id in MODELS: it returns every Animation's AnimationId). Save the returned JSON string
     (an object {"<id>": {...}}) to cache/rbx_anim/<assetId>.json. One file per animation; the file may hold several ids, all are read.
  2. python pipeline/tools/rbx_anim.py native <name> <assetId> [--loop N] [--held] [--ground] [--speed X] [--lean R]
  Names are lower snake_case; a name that already exists in the vocabulary (python pipeline/produce.py --vocab anim) should be prefixed rbx_.
  Options: --loop N retimes the cycle to N seconds (0 = play once and hold). --held adds breathing while holding a pose. --ground lowers the body
  so the lowest foot touches the floor (locomotion). --speed X plays X times faster. --lean R adds R radians of forward lean (run/sprint tuning).
  R15 clips map joint for joint (no retarget). Classic R6 source clips (6 poses) are mapped onto the R15 shoulders / hips / neck / root (R6MAP below).
"""

import json, math, os, sys, argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from paths import ROOT

ROOT = str(ROOT)
CACHE = os.path.join(ROOT, "cache", "rbx_anim")
ORDER = ["HumanoidRootPart", "Torso", "Right Arm", "Left Arm", "Right Leg", "Left Leg", "Head"]

QS = [[0, 0, 1], [0, 1, 0], [-1, 0, 0]]  # right shoulder / right hip
QL = [[0, 0, -1], [0, 1, 0], [1, 0, 0]]  # left shoulder / left hip
QR = [[-1, 0, 0], [0, 0, 1], [0, 1, 0]]  # root joint, neck
DD = [[-1, 0, 0], [0, 1, 0], [0, 0, -1]]  # roblox -> engine (turn 180 about Y)

EASE = {
    "Linear": "linear",
    "Constant": "linear",
    "Back": "back",
    "Elastic": "spring",
}  # everything else (Cubic, Quad, Sine, Bounce...) = smooth


# ---------- tiny 3x3 / quaternion helpers ----------
def mm(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def tr(a):
    return [[a[j][i] for j in range(3)] for i in range(3)]


def mv(a, v):
    return [sum(a[i][k] * v[k] for k in range(3)) for i in range(3)]


I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]


def rx(a):
    c, s = math.cos(a), math.sin(a)
    return [[1, 0, 0], [0, c, -s], [0, s, c]]


def ry(a):
    c, s = math.cos(a), math.sin(a)
    return [[c, 0, s], [0, 1, 0], [-s, 0, c]]


def rz(a):
    c, s = math.cos(a), math.sin(a)
    return [[c, -s, 0], [s, c, 0], [0, 0, 1]]


def euler_to_m(x, y, z):
    return mm(rx(x), mm(ry(y), rz(z)))  # Roblox fromEulerAnglesXYZ == Rx*Ry*Rz


def m_to_euler(m):  # three.js Euler 'XYZ'
    y = math.asin(max(-1, min(1, m[0][2])))
    if abs(m[0][2]) < 0.9999999:
        return [math.atan2(-m[1][2], m[2][2]), y, math.atan2(-m[0][1], m[0][0])]
    return [math.atan2(m[2][1], m[1][1]), y, 0.0]


def m_to_q(m):
    t = m[0][0] + m[1][1] + m[2][2]
    if t > 0:
        s = math.sqrt(t + 1) * 2
        q = [(m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s, s / 4]
    elif m[0][0] > m[1][1] and m[0][0] > m[2][2]:
        s = math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2
        q = [s / 4, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s, (m[2][1] - m[1][2]) / s]
    elif m[1][1] > m[2][2]:
        s = math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2
        q = [(m[0][1] + m[1][0]) / s, s / 4, (m[1][2] + m[2][1]) / s, (m[0][2] - m[2][0]) / s]
    else:
        s = math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2
        q = [(m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, s / 4, (m[1][0] - m[0][1]) / s]
    n = math.sqrt(sum(v * v for v in q))
    return [v / n for v in q]


def q_to_m(q):
    x, y, z, w = q
    return [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ]


def slerp(a, b, k):
    d = sum(p * q for p, q in zip(a, b))
    if d < 0:
        b = [-v for v in b]
        d = -d
    if d > 0.9995:
        q = [p + (r - p) * k for p, r in zip(a, b)]
        n = math.sqrt(sum(v * v for v in q))
        return [v / n for v in q]
    th = math.acos(d)
    s = math.sin(th)
    return [(math.sin((1 - k) * th) * p + math.sin(k * th) * r) / s for p, r in zip(a, b)]


def qangle(a, b):
    return 2 * math.acos(min(1, abs(sum(p * q for p, q in zip(a, b)))))


# ---------- conversion ----------
def pose_m(p):  # [rx,ry,rz,(px,py,pz)] or 0 -> (R, pos)
    if not p:
        return I3, [0, 0, 0]
    return euler_to_m(p[0], p[1], p[2]), (p[3:6] if len(p) >= 6 else [0, 0, 0])


ORDER15 = [
    "HumanoidRootPart",
    "LowerTorso",
    "UpperTorso",
    "Head",
    "RightUpperArm",
    "RightLowerArm",
    "RightHand",
    "LeftUpperArm",
    "LeftLowerArm",
    "LeftHand",
    "RightUpperLeg",
    "RightLowerLeg",
    "RightFoot",
    "LeftUpperLeg",
    "LeftLowerLeg",
    "LeftFoot",
]


def expand(d):
    """compact generated-clip format {rig, length, k:[[t, p], ...]} (all Linear keys) -> the full export format."""
    if isinstance(d, dict) and "k" in d and "kfs" not in d:
        d = dict(d)
        d["kfs"] = [{"t": t, "e": "Linear", "p": p} for t, p in d["k"]]
        d.setdefault("order", ORDER15 if d.get("rig") == "R15" else ORDER)
        d.setdefault("looped", False)
    return d


def load(aid):
    p = os.path.join(CACHE, f"{aid}.json")
    if not os.path.exists(p):
        raise SystemExit(f"missing {p}: run studio/export_anim.luau in Studio and save its output there")
    d = json.load(open(p, encoding="utf8"))
    if (
        isinstance(d, dict) and str(aid) not in d and "kfs" not in d
    ):  # cache file named by a nickname (generated clips): use its only entry
        vals = [v for v in d.values() if isinstance(v, dict) and ("kfs" in v or "k" in v)]
        if len(vals) == 1:
            return expand(vals[0])
    return expand(d.get(str(aid), d)) if isinstance(d, dict) else d


# ================= NATIVE R15 OUTPUT (config/anims_r15.json) =================
# Entries are plain animation names (a legacy 6-joint entry of the same name in the other config/anims*.json is overridden). Keys: {t, joints:{LeftElbow:[x,y,z]...}, y, bz, lean, ease}; rig:'r15'. Euler XYZ, engine frame, relative to rest.
# R15 clip: every pose is the Motor6D transform of its joint (C0/C1 rotations are identity), so the engine rotation is D*R*D (D = turn by pi about Y). No retarget.
# R6 clip : the 6 R6 poses map to RightShoulder/LeftShoulder/RightHip/LeftHip/Neck (+Q conjugation, QS / QL / QR) and Torso*HumanoidRootPart -> Root.
# Body: Root joint = R_hrp * R_lowertorso (pivot = hip, as in Roblox); the HRP rotation is about the HRP centre (1.0 above the Root pivot), so the pivot translation
#   t = p_hrp + (R_hrp - I)c + R_hrp p_lt (c = (0,-1,0)) goes to y (Roblox +Y) and bz (= -Z, Roblox front is -Z). X translation is dropped.
OUT15 = os.path.join(ROOT, "config", "anims_r15.json")
JMAP = {
    "LowerTorso": "Root",
    "UpperTorso": "Waist",
    "Head": "Neck",
    "RightUpperArm": "RightShoulder",
    "RightLowerArm": "RightElbow",
    "RightHand": "RightWrist",
    "LeftUpperArm": "LeftShoulder",
    "LeftLowerArm": "LeftElbow",
    "LeftHand": "LeftWrist",
    "RightUpperLeg": "RightHip",
    "RightLowerLeg": "RightKnee",
    "RightFoot": "RightAnkle",
    "LeftUpperLeg": "LeftHip",
    "LeftLowerLeg": "LeftKnee",
    "LeftFoot": "LeftAnkle",
}
R6MAP = {
    "Right Arm": ("RightShoulder", QS),
    "Left Arm": ("LeftShoulder", QL),
    "Right Leg": ("RightHip", QS),
    "Left Leg": ("LeftHip", QL),
    "Head": ("Neck", QR),
}


def msub_i(a):
    return [[a[i][j] - (1 if i == j else 0) for j in range(3)] for i in range(3)]


def key_state15(kf, order, rig):
    P = dict(zip(order, kf["p"]))
    g = lambda n: pose_m(P.get(n))
    J = {}
    if rig == "R15":
        for pn, jn in JMAP.items():
            if jn != "Root":
                J[jn] = g(pn)[0]
        Rh, ph = g("HumanoidRootPart")
        Rl, pl = g("LowerTorso")
        Rb = mm(Rh, Rl)
        tt = pl
    else:
        for pn, (jn, Q) in R6MAP.items():
            J[jn] = mm(Q, mm(g(pn)[0], tr(Q)))
        Rh, ph = g("HumanoidRootPart")
        Rt, pt = g("Torso")
        Rb = mm(Rh, mm(QR, mm(Rt, tr(QR))))
        tt = mv(QR, pt)
    c = [0, -1, 0]
    d = mv(msub_i(Rh), c)
    w = mv(Rh, tt)
    t = [ph[i] + d[i] + w[i] for i in range(3)]
    J["Root"] = Rb
    return {"J": {j: mm(DD, mm(R, DD)) for j, R in J.items()}, "y": t[1], "bz": -t[2]}


def foot_min(J, y, bz, lean):
    """height of the lowest sole point above the floor (engine frame FK of the legs, rig constants from docs/R15.md), used by --ground"""
    Rb = mm(rx(lean), J.get("Root", I3))
    piv = [0, -1 + y, bz]
    low = 9e9
    for s, sx in (("Right", -1), ("Left", 1)):
        hv = mv(Rb, [sx * 0.498, 0, 0])
        h = [piv[i] + hv[i] for i in range(3)]
        Rh = mm(Rb, J.get(s + "Hip", I3))
        kv = mv(Rh, [0, -0.921, 0])
        k = [h[i] + kv[i] for i in range(3)]
        Rk = mm(Rh, J.get(s + "Knee", I3))
        av = mv(Rk, [0, -1.010, 0])
        a = [k[i] + av[i] for i in range(3)]
        Ra = mm(Rk, J.get(s + "Ankle", I3))
        for dz in (0, 0.5, -0.5):
            low = min(low, a[1] + mv(Ra, [0, -0.262, dz])[1])
    return 3.192 + low


def convert15(data, loop=None, timescale=None, speed=1.0, ground=False, lean_add=0.0):
    if data.get("error"):
        raise SystemExit("export error: " + str(data["error"]))
    rig = data.get("rig", "R6")
    order = data.get("order", ORDER)
    kfs = [k for k in data["kfs"] if any(p for p in k["p"])]
    if not kfs:
        raise SystemExit("no poses")
    sts = [key_state15(k, order, rig) for k in kfs]
    ts = [k["t"] for k in kfs]
    ez = [EASE.get(k.get("e"), "smooth") for k in kfs]
    length = data["length"]
    looped = data.get("looped", False) if loop is None else loop > 0
    names = sorted({j for st in sts for j in st["J"]})

    def dist(a, b):
        return max(qangle(m_to_q(a["J"].get(j, I3)), m_to_q(b["J"].get(j, I3))) for j in names)

    if looped:
        if dist(sts[0], sts[-1]) < 0.03 and len(kfs) > 1:
            length = ts[-1]
        else:
            if length <= ts[-1] + 1e-3:
                length = ts[-1] + 0.1
            sts.append(sts[0])
            ts.append(length)
            ez.append("smooth")
    scale = timescale if timescale else (loop / length if (loop and looped) else 1.0) / speed
    keys = []
    for st, t, e in zip(sts, ts, ez):
        k = {"t": round(t * scale, 3), "joints": {}}
        for j in names:
            eu = m_to_euler(st["J"].get(j, I3))
            v = [round(x + 0.0, 3) for x in eu]
            if any(abs(x) > 0.0005 for x in v):
                k["joints"][j] = v
        y = st["y"]
        if ground:
            y -= foot_min(st["J"], y, st["bz"], lean_add)
        if abs(y) > 0.0005:
            k["y"] = round(y, 3)
        if abs(st["bz"]) > 0.0005:
            k["bz"] = round(st["bz"], 3)
        if abs(lean_add) > 0.0005:
            k["lean"] = round(lean_add, 3)
        if e != "smooth":
            k["ease"] = e
        keys.append(k)
    dur = keys[-1]["t"]
    return {"rig": "r15", "loop": round(dur, 3) if looped else 0, "hip": True, "keys": keys}, dur


def rd15():
    return json.load(open(OUT15, encoding="utf8")) if os.path.exists(OUT15) else {}


def wr15(o):
    src = o.pop("_sources", {})
    o.pop("_doc", None)
    L = [
        "{",
        '  "_doc": '
        + json.dumps(
            'Native R15 animations (rig:"r15", keys with `joints`) written by pipeline/rbx_anim.py native (see docs/ROBLOX_ANIMATIONS.md / docs/R15.md section 10).'
        )
        + ",",
        '  "_sources": {\n'
        + ",\n".join(f"    {json.dumps(n)}: {json.dumps(v)}" for n, v in sorted(src.items()))
        + "\n  }",
    ]
    for k in sorted(o):
        v = o[k]
        meta = {a: b for a, b in v.items() if a != "keys"}
        ks = ",\n".join("      " + json.dumps(x, separators=(",", ":")) for x in v["keys"])
        L[-1] += ","
        L.append(f'  {json.dumps(k)}: {{{json.dumps(meta, separators=(",", ":"))[1:-1]}, "keys": [\n{ks}\n    ]}}')
    L.append("}")
    open(OUT15, "w", encoding="utf8").write("\n".join(L) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["native"])
    ap.add_argument("args", nargs="*")
    ap.add_argument("--loop", type=float)
    ap.add_argument("--held", action="store_true")
    ap.add_argument("--ground", action="store_true")
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--lean", type=float, default=0.0)
    ap.add_argument("--note", default="")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    d = load(a.args[1])
    e, _ = convert15(
        d, a.loop, None, a.speed, a.ground, a.lean
    )  # native <name> <assetId>: one native entry straight from a cache file
    if a.held:
        e["held"] = True
    n15 = rd15()
    sr = n15.pop("_sources", {})
    n15[a.args[0]] = e
    sr[a.args[0]] = {"id": int(a.args[1]) if a.args[1].isdigit() else a.args[1], "src": d.get("rig")}
    n15["_sources"] = sr
    wr15(n15)
    print("ok", a.args[0])


if __name__ == "__main__":
    main()
