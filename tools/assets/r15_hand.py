#!/usr/bin/env python3
"""Hand-authored NATIVE R15 acting anims -> config/anims_r15_hand.json  (python tools/assets/r15_hand.py).  Names are plain anim names (a legacy 6-joint entry of the same name in another config/anims*.json is overridden).
Joints are written in real angles (real knees / elbows); `y` of every key is SOLVED with a small FK of the R15 rig (constants of docs/R15.md) so the contact points of the pose
(soles, knees, hands, or the whole body for rolls) rest on the floor: kneeling puts the knee on the ground, crawling is on hands and knees, crouching keeps the feet planted.
Conventions (engine frame, docs/R15.md): shoulder / hip x<0 = forward, knee x>0 flexes, elbow x<0 flexes, Waist / lean x>0 = forward, Neck x>0 = look down,
right limbs are at -X (RightShoulder z<0 raises the right arm outward, LeftShoulder z>0 the left). All keys pivot lean at the hips (hip: true)."""

import json, math, os, sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "pipeline"))
from paths import ROOT
from rbx_anim import euler_to_m, mm, mv, rx, wr15, OUT15 as _O
import rbx_anim

OUT = os.path.join(str(ROOT), "config", "anims_r15_hand.json")
HIPY = 2.192
I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]


def M(J, n):
    return euler_to_m(*J[n]) if n in J else I3


def add(a, b):
    return [a[i] + b[i] for i in range(3)]


def fk(J, lean=0.0):
    """points (and radii) relative to the hip pivot, engine frame; lean pivots at the hips."""
    Rb = mm(rx(lean), M(J, "Root"))
    P = {}
    R = {}
    ut0 = mv(Rb, [0, 0.4, 0])
    Rut = mm(Rb, M(J, "Waist"))
    ut = add(ut0, mv(Rut, [0, 0.849, 0]))
    nk = add(ut, mv(Rut, [0, 0.849, 0]))
    Rn = mm(Rut, M(J, "Neck"))
    P["head"] = add(nk, mv(Rn, [0, 0.576, 0]))
    R["head"] = 0.6
    P["chest"] = add(ut, mv(Rut, [0, 0.3, 0]))
    R["chest"] = 0.55
    P["pelvis"] = mv(Rb, [0, 0.2, 0])
    R["pelvis"] = 0.5
    for s, sx in (("Right", -1), ("Left", 1)):
        sh = add(ut, mv(Rut, [sx * 0.972, 0.598, 0]))
        Rs = mm(Rut, M(J, s + "Shoulder"))
        el = add(sh, mv(Rs, [sx * 0.501, -0.774, 0]))
        Re = mm(Rs, M(J, s + "Elbow"))
        wr = add(el, mv(Re, [0, -0.807, 0]))
        Rw = mm(Re, M(J, s + "Wrist"))
        P["elbow" + s] = el
        R["elbow" + s] = 0.45
        P["wrist" + s] = add(wr, mv(Rw, [0, -0.2, 0]))
        R["wrist" + s] = 0.35
        hp = mv(Rb, [sx * 0.498, 0, 0])
        Rh = mm(Rb, M(J, s + "Hip"))
        kn = add(hp, mv(Rh, [0, -0.921, 0]))
        Rk = mm(Rh, M(J, s + "Knee"))
        an = add(kn, mv(Rk, [0, -1.010, 0]))
        Ra = mm(Rk, M(J, s + "Ankle"))
        P["knee" + s] = kn
        R["knee" + s] = 0.5
        P["hip" + s] = hp
        R["hip" + s] = 0.5
        for nm, dz in (("c", 0), ("t", 0.5), ("h", -0.5)):
            P["sole" + nm + s] = add(an, mv(Ra, [0, -0.262, dz]))
            R["sole" + nm + s] = 0
    return P, R


def height(J, lean, y, names):
    P, R = fk(J, lean)
    return min(
        HIPY + y + P[n][1] - R[n]
        for n in P
        if any(
            n.startswith(m) or (m.startswith("sole") and len(m) > 4 and n.startswith("sole") and n.endswith(m[4:]))
            for m in names
        )
    )


GROUPS = {
    "feet": ["sole"],
    "knees": ["knee"],
    "all": ["head", "chest", "pelvis", "elbow", "wrist", "knee", "hip", "sole"],
    "kneehands": ["knee", "wrist"],
    "kneefoot": ["kneeRight", "soleRight", "soleLeft"],
}


def flat(J, lean, s):  # ankle that keeps the sole level with the floor
    J[s + "Ankle"] = [max(-0.9, min(1.2, -(lean + J.get(s + "Hip", [0])[0] + J.get(s + "Knee", [0])[0]))), 0, 0]


def key(t, J, lean=0.0, sup="feet", ease=None, bz=0.0, y=None, extra=0.0):
    J = {k: [round(x, 3) for x in v] for k, v in J.items()}
    k = {"t": round(t, 3), "joints": J}
    yy = -height(J, lean, 0, GROUPS.get(sup, sup)) if y is None else y
    yy += extra
    if abs(yy) > 5e-4:
        k["y"] = round(yy, 3)
    if lean:
        k["lean"] = round(lean, 3)
    if bz:
        k["bz"] = bz
    if ease:
        k["ease"] = ease
    return k


def stand():
    return {}


ANIMS = {}


def entry(name, keys, loop=0, held=False):
    e = {"rig": "r15", "loop": loop, "hip": True, "keys": keys}
    if held:
        e["held"] = True
    ANIMS[name] = e


# ---------- kneel: right knee on the floor, left foot planted in front, left forearm on the left thigh ----------
def kneel_pose(sup_knee=True):
    J = {
        "RightHip": [-0.08, 0, -0.04],
        "RightKnee": [1.75, 0, 0],
        "RightAnkle": [0.9, 0, 0],
        "LeftHip": [-1.42, 0, 0.05],
        "LeftKnee": [1.5, 0, 0],
        "LeftShoulder": [-0.75, 0, 0.08],
        "LeftElbow": [-1.0, 0, 0],
        "RightShoulder": [0.1, 0, -0.12],
        "RightElbow": [-0.25, 0, 0],
        "Waist": [0.12, 0, 0],
        "Neck": [-0.05, 0, 0],
    }
    return J


J = kneel_pose()
lean = 0.05
y = -height(J, lean, 0, ["kneeRight"])  # right knee on the floor
# bisect the left knee so the left foot lands on the floor too
lo, hi = 0.3, 2.9
for _ in range(50):
    m = (lo + hi) / 2
    J["LeftKnee"] = [m, 0, 0]
    flat(J, lean, "Left")
    h = height(J, lean, y, ["soleLeft"])
    (lo, hi) = (m, hi) if h > 0 else (lo, m)  # knee flex lowers the foot while the thigh points forward-down
J["LeftKnee"] = [(lo + hi) / 2, 0, 0]
flat(J, lean, "Left")
entry("kneel", [{"t": 0}, key(0.5, J, lean, "kneeRight", "back", y=y)], 0, True)

# ---------- kneel_both ----------
J = {
    "RightHip": [-0.12, 0, -0.06],
    "LeftHip": [-0.12, 0, 0.06],
    "RightKnee": [1.7, 0, 0],
    "LeftKnee": [1.7, 0, 0],
    "RightAnkle": [0.9, 0, 0],
    "LeftAnkle": [0.9, 0, 0],
    "RightShoulder": [-0.35, 0, -0.08],
    "LeftShoulder": [-0.35, 0, 0.08],
    "RightElbow": [-0.7, 0, 0],
    "LeftElbow": [-0.7, 0, 0],
    "Waist": [0.05, 0, 0],
    "Neck": [0.08, 0, 0],
}
entry("kneel_both", [{"t": 0}, key(0.5, J, 0, "knees", "back")], 0, True)


# ---------- cry_kneel: both knees, face in the hands, sobbing shoulders ----------
def cry(t, a, ease=None):
    J = {
        "RightHip": [-0.12, 0, -0.06],
        "LeftHip": [-0.12, 0, 0.06],
        "RightKnee": [1.7, 0, 0],
        "LeftKnee": [1.7, 0, 0],
        "RightAnkle": [0.9, 0, 0],
        "LeftAnkle": [0.9, 0, 0],
        "RightShoulder": [-1.75 - a * 0.1, 0.35, 0.2],
        "LeftShoulder": [-1.75 - a * 0.1, -0.35, -0.2],
        "RightElbow": [-2.1, 0, 0],
        "LeftElbow": [-2.1, 0, 0],
        "Waist": [0.28 + a * 0.06, 0, 0],
        "Neck": [0.5 + a * 0.05, 0, 0],
    }
    return key(t, J, 0, "knees", ease)


entry(
    "cry_kneel",
    [cry(0, 0), cry(0.175, 1, "linear"), cry(0.35, 0, "linear"), cry(0.525, 1, "linear"), cry(0.7, 0, "linear")],
    0.7,
)


# ---------- crouch_sneak: low stance, feet planted, small alternating steps, hands up ----------
def walkleg(u, A, K, lean, s):  # u in 0..1 phase, s = Right/Left; returns hip, knee
    th = 2 * math.pi * u + (0 if s == "Right" else math.pi)
    return -A * math.sin(th), K * max(0, math.cos(th)) ** 1.0


def crouch(u):
    J = {}
    lean = 0.12
    for s in ("Right", "Left"):
        h, k = walkleg(u, 0.32, 0.5, lean, s)
        J[s + "Hip"] = [-0.95 + h, 0, -0.1 if s == "Right" else 0.1]
        J[s + "Knee"] = [1.85 + k, 0, 0]
        flat(J, lean, s)
    J.update(
        {
            "Waist": [0.22, 0, 0],
            "Neck": [-0.4, 0, 0],
            "RightShoulder": [-0.95, 0, -0.12],
            "LeftShoulder": [-0.95, 0, 0.12],
            "RightElbow": [-1.25, 0, 0],
            "LeftElbow": [-1.25, 0, 0],
            "RightWrist": [0, 0, 0],
        }
    )
    return key(u * 1.2, J, lean, "feet", "linear" if u else None)


entry("crouch_sneak", [crouch(i / 8) for i in range(9)], 1.2)


# ---------- crawl: on hands and knees, diagonal gait ----------
def crawl(u):
    th = 2 * math.pi * u
    sw = math.sin(th)
    lean = 1.3
    J = {}
    for s, ph in (("Right", 1), ("Left", -1)):
        J[s + "Hip"] = [-lean + 0.35 * sw * ph - 0.1, 0, -0.06 if s == "Right" else 0.06]
        J[s + "Knee"] = [1.55 - 0.25 * max(0, sw * ph), 0, 0]
        J[s + "Ankle"] = [0.6, 0, 0]
        J[s + "Shoulder"] = [-lean - 0.2 - 0.4 * sw * ph, 0, -0.1 if s == "Right" else 0.1]
        J[s + "Elbow"] = [-0.3 - 0.5 * max(0, -sw * ph), 0, 0]
    J.update({"Waist": [-0.18, 0, 0], "Neck": [-0.95 + 0.05 * sw, 0, 0]})
    return key(u * 1.2, J, lean, "kneehands", "linear" if u else None)


entry("crawl", [crawl(i / 8) for i in range(9)], 1.2)


# ---------- dig: wide squat, scooping with alternating arms ----------
def dig(u):
    sw = math.sin(2 * math.pi * u)
    lean = 0.5
    J = {}
    for s, sg in (("Right", 1), ("Left", -1)):
        J[s + "Hip"] = [-1.05, 0, -0.18 if s == "Right" else 0.18]
        J[s + "Knee"] = [1.95, 0, 0]
        flat(J, lean, s)
        J[s + "Shoulder"] = [-1.25 + 0.55 * sw * sg, 0, -0.15 if s == "Right" else 0.15]
        J[s + "Elbow"] = [-0.9 - 0.5 * max(0, -sw * sg), 0, 0]
    J.update({"Waist": [0.3 + 0.08 * math.cos(2 * math.pi * u * 2), 0, 0], "Neck": [-0.55, 0, 0]})
    J["Waist"][1] = 0.12 * sw
    return key(u * 0.7, J, lean, "feet", "linear" if u else None)


entry("dig", [dig(i / 8) for i in range(9)], 0.7)


# ---------- unchain: kneeling on the right knee, tugging a chain at chest height ----------
def unchain(t, p, ease=None):  # p 0 = reach, 1 = pull
    lean = 0.3 - 0.2 * p
    J = {
        "RightHip": [0.0, 0, -0.05],
        "RightKnee": [1.8, 0, 0],
        "RightAnkle": [0.9, 0, 0],
        "LeftHip": [-1.4, 0, 0.05],
        "RightShoulder": [-1.35 + 0.65 * p, 0, -0.1],
        "LeftShoulder": [-1.35 + 0.65 * p, 0, 0.1],
        "RightElbow": [-0.5 - 1.0 * p, 0, 0],
        "LeftElbow": [-0.5 - 1.0 * p, 0, 0],
        "Waist": [0.15 - 0.1 * p, -0.1 * p, 0],
        "Neck": [-0.3, 0, 0],
    }
    y = -height(J, lean, 0, ["kneeRight"])
    lo, hi = 0.3, 2.9
    for _ in range(50):
        m = (lo + hi) / 2
        J["LeftKnee"] = [m, 0, 0]
        flat(J, lean, "Left")
        h = height(J, lean, y, ["soleLeft"])
        (lo, hi) = (m, hi) if h > 0 else (lo, m)
    J["LeftKnee"] = [(lo + hi) / 2, 0, 0]
    flat(J, lean, "Left")
    return key(t, J, lean, y=y, ease=ease)


entry("unchain", [unchain(0, 0), unchain(0.4, 1, "back"), unchain(0.6, 0, "smooth")], 0.6)


# ---------- pull_door: braced, leaning back, both hands on the handle ----------
def pull(u):
    tr = 0.04 * math.sin(2 * math.pi * u * 3)
    lean = -0.32
    J = {
        "LeftHip": [-0.5, 0, 0.1],
        "LeftKnee": [0.35, 0, 0],
        "RightHip": [0.45, 0, -0.1],
        "RightKnee": [0.5, 0, 0],
        "RightShoulder": [-1.3 + tr, 0, -0.08],
        "LeftShoulder": [-1.3 - tr, 0, 0.08],
        "RightElbow": [-0.45 - tr * 2, 0, 0],
        "LeftElbow": [-0.45 + tr * 2, 0, 0],
        "Waist": [-0.06 + tr, 0, 0],
        "Neck": [0.28, 0, 0],
    }
    flat(J, lean, "Left")
    flat(J, lean, "Right")
    return key(u * 1.2, J, lean, "feet", "linear" if u else None)


entry("pull_door", [pull(i / 6) for i in range(7)], 1.2)


# ---------- hug_give: arms open wide, then wrap round the other person ----------
def hug(t, o, c, ease=None):  # o = openness 0..1, c = closing 0..1
    sx = lambda s: 1 if s == "Left" else -1
    J = {"Waist": [0.05 + 0.08 * c, 0, 0], "Neck": [-0.05 + 0.08 * c, 0, 0]}
    for s in ("Right", "Left"):
        g = sx(s)
        J[s + "Shoulder"] = [-0.5 - 0.75 * c, g * -0.45 * c, g * (1.15 * o - 0.25 * c)]
        J[s + "Elbow"] = [-0.25 - 1.1 * c, 0, 0]
    return key(t, J, 0.1 * c, "feet", ease)


entry("hug_give", [{"t": 0}, hug(0.3, 1, 0, "back"), hug(0.6, 0.1, 0.8, "smooth"), hug(0.85, 0, 1, "back")], 0, True)

# ---------- reach: up on tiptoes, left arm stretched high ----------
J = {
    "LeftShoulder": [-2.75, 0, 0.12],
    "LeftElbow": [-0.08, 0, 0],
    "RightShoulder": [0.4, 0, -0.25],
    "RightElbow": [-0.3, 0, 0],
    "Waist": [-0.04, 0, 0],
    "Neck": [-0.5, 0, 0],
    "RightAnkle": [0.55, 0, 0],
    "LeftAnkle": [0.55, 0, 0],
    "RightHip": [-0.08, 0, 0],
    "LeftHip": [-0.08, 0, 0],
}
entry("reach", [{"t": 0}, key(0.4, J, 0.12, "feet", "back", extra=0)], 0, True)


# ---------- carry_walk: both arms hugging a load in front, short steps, leaning back a little ----------
def carry(u):
    lean = -0.07
    J = {}
    for s in ("Right", "Left"):
        h, k = walkleg(u, 0.42, 0.55, lean, s)
        J[s + "Hip"] = [h - 0.02, 0, 0]
        J[s + "Knee"] = [0.08 + k, 0, 0]
        flat(J, lean, s)
    sg = math.sin(2 * math.pi * u * 2)
    J.update(
        {
            "RightShoulder": [-1.05, 0, -0.14],
            "LeftShoulder": [-1.05, 0, 0.14],
            "RightElbow": [-1.15, 0, 0],
            "LeftElbow": [-1.15, 0, 0],
            "Waist": [0.03 + 0.02 * sg, 0, 0],
            "Neck": [0.12, 0, 0],
        }
    )
    return key(u * 0.785, J, lean, "feet", "linear" if u else None)


entry("carry_walk", [carry(i / 8) for i in range(9)], 0.785)


# ---------- tumble: forward roll (tucked, the lowest point of the body rests on the floor) ----------
def tuck(c):
    J = {}
    for s in ("Right", "Left"):
        J[s + "Hip"] = [-1.9 * c, 0, 0]
        J[s + "Knee"] = [2.3 * c, 0, 0]
        J[s + "Shoulder"] = [-1.5 * c, 0, 0]
        J[s + "Elbow"] = [-1.2 * c, 0, 0]
        J[s + "Ankle"] = [0.5 * c, 0, 0]
    J.update({"Waist": [0.9 * c, 0, 0], "Neck": [0.6 * c, 0, 0]})
    return J


TK = [key(0, {}, 0)]
for t, ln, c, sup in ((0.12, 0.15, 0.55, "feet"), (0.3, 0.8, 1, "all"), (0.45, 1.9, 1, "all"), (0.6, 3.1, 1, "all")):
    TK.append(key(t, tuck(c), ln, sup, "linear" if t > 0.12 else None))
TK.append(key(0.6, tuck(1), -3.1, "all", "linear"))
for t, ln, c, sup in ((0.75, -1.9, 1, "all"), (0.9, -0.8, 0.9, "all")):
    TK.append(key(t, tuck(c), ln, sup, "linear"))
TK.append(key(1.1, tuck(0.4), -0.1, "feet", "smooth"))
TK.append(key(1.3, {}, 0, "feet", "smooth"))
entry("tumble", TK, 0)

if __name__ == "__main__":
    out = dict(ANIMS)
    out["_sources"] = {k: {"src": "hand-authored (pipeline/r15_hand.py)"} for k in ANIMS}
    rbx_anim.OUT15 = OUT
    wr15(out)
    print("wrote", OUT, len(ANIMS), "anims")
