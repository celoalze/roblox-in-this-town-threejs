#!/usr/bin/env python3
"""cache/r15/raw.json (output of studio/export_r15.luau) -> assets/models/rigs/r15/rig.json + one geometry json per part.

  python studio/build_r15.py            # reads cache/r15/raw.json, writes assets/models/rigs/r15/
Everything stays in the Roblox convention of the export (studs, +Y up, front = -Z, character's right = +X, coordinates relative to
HumanoidRootPart); engine/characters/skeleton.js converts to the engine frame (front +Z) once, when it builds the Object3D tree.
"""

import json, math, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "cache", "r15", "raw.json")
OUT = os.path.join(ROOT, "assets", "models", "rigs", "r15")


def m_to_q(m):  # row-major 3x3 -> [x, y, z, w]
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
    q = [v / n for v in q]
    if q[3] < 0:
        q = [-v for v in q]
    return [0.0 if abs(v) < 1e-5 else round(v, 6) for v in q[:3]] + [round(q[3], 6)]


def cf(a):  # [px,py,pz*1e4 ; r00..r22 *1e5] -> {p, q}
    p = [round(v / 1e4, 4) for v in a[:3]]
    R = a[3:]
    m = [
        [R[0] / 1e5, R[1] / 1e5, R[2] / 1e5],
        [R[3] / 1e5, R[4] / 1e5, R[5] / 1e5],
        [R[6] / 1e5, R[7] / 1e5, R[8] / 1e5],
    ]
    return {"p": [0.0 if v == 0 else v for v in p], "q": m_to_q(m)}


def main():
    raw = json.load(open(RAW, encoding="utf8"))
    os.makedirs(OUT, exist_ok=True)
    # parent -> child order (breadth first from the root), the order the engine builds and documents them
    J = raw["joints"]
    order = ["HumanoidRootPart"]
    i = 0
    while i < len(order):
        for n, j in J.items():
            if j[0] == order[i] and j[1] not in order:
                order.append(j[1])
        i += 1
    parts, minY, maxY = [], 1e9, -1e9
    for name in order:
        P = raw["parts"][name]
        e = {"name": name, "size": [round(v / 1e4, 4) for v in P["size"]], "cf": cf(P["cf"])}
        if "mesh" in P:
            M = P["mesh"]
            g = {
                "p": [v / 1e4 for v in M["p"]],
                "uv": [v / 1e4 for v in M["uv"]],
                "n": [v / 1e3 for v in M["n"]],
                "i": M["i"],
            }
            g["p"] = [round(v, 4) for v in g["p"]]
            g["uv"] = [round(v, 4) for v in g["uv"]]
            g["n"] = [round(v, 3) for v in g["n"]]
            json.dump(g, open(os.path.join(OUT, name + ".json"), "w"), separators=(",", ":"))
            e["mesh"] = name + ".json"
            e["meshSrc"] = P.get("meshSrc")
            e["verts"] = len(g["p"]) // 3
            e["tris"] = len(g["i"]) // 3
            cy = e["cf"]["p"][1]
            ys = g["p"][1::3]
            minY = min(minY, cy + min(ys))
            maxY = max(maxY, cy + max(ys))
        parts.append(e)
    joints = []
    for name in sorted(J, key=lambda n: order.index(J[n][1])):
        j = J[name]
        joints.append({"name": name, "parent": j[0], "child": j[1], "c0": cf(j[2]), "c1": cf(j[3])})
    att = {}
    for name in order:
        att[name] = {a: cf(v) for a, v in raw["parts"][name]["att"].items()}
    hrpH = raw["hrpSize"][1]
    rootHeight = round(raw["hipHeight"] + hrpH / 2, 4)
    rig = {
        "name": "r15",
        "units": "studs",
        "frame": "roblox: +Y up, front -Z, character right +X, positions relative to HumanoidRootPart",
        "source": "Players:CreateHumanoidModelFromDescription(HumanoidDescription, R15) via studio/export_r15.luau",
        "hipHeight": round(raw["hipHeight"], 4),
        "rootHeight": rootHeight,
        "soleY": round(minY, 4),
        "topY": round(maxY, 4),
        "height": round(maxY - minY, 4),
        "order": order,
        "parts": parts,
        "joints": joints,
        "attachments": att,
    }
    json.dump(rig, open(os.path.join(OUT, "rig.json"), "w"), indent=1)
    # checks: child rest cframe == parent cframe * C0 * C1^-1 (rotations are identity in the default rig)
    pm = {p["name"]: p for p in parts}
    bad = 0
    for j in joints:
        a, b = pm[j["parent"]]["cf"]["p"], pm[j["child"]]["cf"]["p"]
        exp = [a[k] + j["c0"]["p"][k] - j["c1"]["p"][k] for k in range(3)]
        if max(abs(exp[k] - b[k]) for k in range(3)) > 2e-3:
            bad += 1
            print("joint mismatch", j["name"], exp, b)
        if any(abs(v) > 1e-4 for v in j["c0"]["q"][:3] + j["c1"]["q"][:3]):
            print("note: non-identity joint rotation", j["name"])
    print(
        "parts",
        len(parts),
        "joints",
        len(joints),
        "height",
        rig["height"],
        "sole",
        rig["soleY"],
        "rootHeight",
        rootHeight,
        "bad",
        bad,
    )


if __name__ == "__main__":
    main()
