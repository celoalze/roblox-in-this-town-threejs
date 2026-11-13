# Generates story.json (kept as a script so the staging stays readable). python gen.py
import json
GOLD = "#ffd54a"; RED = "#ff3b3b"
T = lambda on, **k: {"type": "timer", "on": on, **k}
done = lambda on: T(on, text="00:00", color=GOLD)

cast = {
  "theo": {"skin": "#f5c79a", "shirt": "#e23b3b", "pants": "#2a2f45", "hair": "messy", "hairColor": "#d2652a", "details": ["hood", "kangaroo"], "voice": "narrator", "expr": "neutral"},
  "mia":  {"skin": "#ffd7b0", "shirt": "#8fb8ff", "pants": "#2b2f4a", "hair": "bob", "hairColor": "#2b1a10", "lashes": True, "blush": True, "details": ["crewneck", "heart"], "emblem": "#ffffff", "voice": "girl", "expr": "sad"},
  "sis":  {"skin": "#f5c79a", "shirt": "#ff8fc7", "pants": "#ff8fc7", "bottom": "skirt", "hair": "ponytail", "hairColor": "#d2652a", "lashes": True, "scale": 0.8},
  "sisf": {"skin": "#8d5524", "shirt": "#ffd23f", "pants": "#3a6be0", "hair": "pigtails", "hairColor": "#1a1a1a", "lashes": True, "scale": 0.8, "hat": "bow", "hatColor": "#ffffff"},
  "jax":  {"skin": "#f2c48f", "shirt": "#1f1f24", "pants": "#3a3a44", "hair": "short", "hairColor": "#111", "hat": "cap", "hatColor": "#e53935", "glasses": "shades", "details": ["stripes"], "accent": "#e53935"},
  "zoe":  {"skin": "#e0a878", "shirt": "#9b5cff", "pants": "#2b2b2b", "hair": "long", "hairColor": "#f2c14e", "lashes": True},
  "k1":   {"skin": "#ffd7b0", "shirt": "#2ecc71", "pants": "#1f3a7a", "sleeves": "short", "hair": "spiky", "hairColor": "#3b2416", "details": ["crewneck"]},
  "k2":   {"skin": "#8d5524", "shirt": "#ff9f43", "pants": "#ffffff", "sleeves": "short", "bottom": "shorts", "hair": "afro", "hairColor": "#1a1a1a"},
  "nkid": {"skin": "#c98d5c", "shirt": "#00b894", "pants": "#2d3436", "hair": "swept", "hairColor": "#111", "glasses": "glasses", "details": ["collar", "buttons"]},
  "mail": {"skin": "#e8b48a", "shirt": "#3b6fd6", "pants": "#22304f", "hat": "cap", "hatColor": "#22304f", "hair": "short", "hairColor": "#6b4a2e", "extras": ["mustache"], "details": ["collar", "pocket", "belt"]},
}

S = []
def sc(line, **k): S.append({"line": line, **k})

# --- HOOK ---
sc("In this town, everyone has a *timer* above their head.", title="IN THIS TOWN...", set="street", time="day", shot="wide",
   camera={"target": "group", "move": "pull"},
   actors=[{"id": "k1", "at": [-6, 0], "anim": "walk", "to": [-3, 1], "expr": "happy"}, {"id": "jax", "at": [3, -2], "face": -20, "expr": "smug"}, {"id": "zoe", "at": [7, 1], "face": -30, "anim": "phone", "expr": "happy"}],
   fx=[T("k1", text="3 DAYS"), T("jax", text="00:00", color=GOLD), T("zoe", text="41 DAYS")], props=[{"type": "phone", "hand": "zoe"}])
sc("It counts down to the moment you meet your *best friend*.", set="street", time="day", shot="medium", camera={"target": "k1", "angle": 20, "move": "push"},
   actors=[{"id": "k1", "at": [0, 0], "anim": "think", "expr": "neutral"}], fx=[T("k1", from_=None, text="00:00:05")])
sc("And when it hits *zero*...", set="park", time="day", shot="full", camera={"target": "group", "angle": 0},
   actors=[{"id": "k1", "at": [-6, 0], "to": [-1.6, 0], "speed": 3, "expr": "nervous"}, {"id": "k2", "at": [6, 0], "to": [1.6, 0], "speed": 3, "expr": "nervous"}],
   fx=[T("k1", **{"from": 3}), T("k2", **{"from": 3})], sfx=[{"name": "tick", "at": 0.3}, {"name": "tick", "at": 1.3}])
sc("you just *know*.", set="park", time="day", shot="medium", punch=True, camera={"target": "group", "angle": 0},
   actors=[{"id": "k1", "at": [-1.6, 0], "face": 70, "anim": "cheer", "expr": "laugh"}, {"id": "k2", "at": [1.6, 0], "face": -70, "anim": "cheer", "expr": "laugh"}],
   fx=[done("k1"), done("k2"), {"type": "sparkles", "pos": [0, 0, 0], "count": 70}], sfx=[{"name": "ding", "at": "w:know"}, {"name": "sparkle", "at": "w:know"}])
sc("Most kids find theirs before they turn *ten*.", set="park", time="day", shot="wide", camera={"target": "group", "move": "drift"},
   actors=[{"id": "k1", "at": [-6, 1], "face": 60, "anim": "dance", "expr": "grin"}, {"id": "k2", "at": [-3, 1], "face": -60, "anim": "clap", "expr": "laugh"},
           {"id": "sis", "at": [3, 0], "face": 70, "anim": "jump", "expr": "grin"}, {"id": "sisf", "at": [5.5, 0], "face": -70, "anim": "wave", "expr": "happy"}],
   fx=[done("k1"), done("k2"), T("sis", text="00:00", color=GOLD), T("sisf", text="00:00", color=GOLD)])
# --- THE PROBLEM ---
sc("But mine said...", set="street", time="day", shot="low", camera={"target": "theo", "angle": 0, "move": "push"}, transition="wipe",
   actors=[{"id": "theo", "at": [0, 0], "face": 0, "anim": "idle", "expr": "neutral"}], fx=[T("theo", text="????")])
sc("*Nine thousand* days.", set="street", time="day", shot="close", punch=True, camera={"target": "theo", "angle": 0, "height": 1.2},
   actors=[{"id": "theo", "at": [0, 0], "face": 0, "anim": "idle", "expr": "shocked"}], fx=[T("theo", text="9,000 DAYS", color=RED, size=3.2, y=6.3)],
   sfx=[{"name": "boom", "at": "w:nine"}], overlay=["flash"])
sc("That's almost *twenty-five* years.", set="street", time="day", shot="close", camera={"target": "theo", "angle": 25, "move": "drift"},
   actors=[{"id": "theo", "at": [0, 0], "face": 0, "anim": "tired", "expr": "sad"}], fx=[T("theo", text="9,000 DAYS", color=RED)], sfx=[{"name": "sad_trombone", "vol": 0.6}])
sc("At school, they called me *Forever Alone*.", set="classroom", shot="medium", camera={"target": "theo", "angle": 25, "height": 2.2, "move": "push"},
   actors=[{"id": "theo", "at": [0, 4.6], "face": 180, "anim": "sitsad", "expr": "sad"},
           {"id": "jax", "at": [5, 8.5], "face": "theo", "anim": "point", "expr": "laugh"}, {"id": "zoe", "at": [-5, 9], "face": "theo", "anim": "clap", "expr": "laugh"}],
   fx=[T("theo", text="9,000 DAYS", color=RED)], sfx=[{"name": "crowd_laugh", "at": "w:forever", "vol": 0.8}])
sc("Even my little sister found hers when she was *six*.", set="street", time="day", shot="medium", camera={"target": "group", "angle": 10},
   actors=[{"id": "sis", "at": [-1.3, 0], "face": 60, "anim": "hug", "expr": "laugh"}, {"id": "sisf", "at": [1.3, 0], "face": -60, "anim": "hug", "expr": "laugh"},
           {"id": "theo", "at": [4, -3], "face": -40, "anim": "idle", "expr": "sad"}],
   fx=[T("sis", text="00:00", color=GOLD), T("sisf", text="00:00", color=GOLD), {"type": "hearts", "pos": [0, 0, 0]}])
sc("So I stopped looking at people.", set="street", time="dusk", shot="top", camera={"target": "theo"},
   actors=[{"id": "theo", "at": [6, 0], "to": [-6, 0], "speed": 2, "anim": "walk", "expr": "sad"}], fx=[T("theo", text="9,000 DAYS", color=RED)])
sc("I only looked at my *timer*.", set="street", time="dusk", shot="close", camera={"target": "theo", "angle": 15, "move": "push"},
   actors=[{"id": "theo", "at": [-6, 0], "face": 0, "anim": "idle", "expr": "sad"}], fx=[T("theo", text="9,000 DAYS", color=RED)])
sc("I tried *everything*.", set="park", time="day", shot="medium", camera={"target": "group", "angle": 20},
   actors=[{"id": "theo", "at": [-1.5, 0], "face": 60, "anim": "hold", "expr": "nervous"}, {"id": "jax", "at": [2, 0.5], "face": -60, "anim": "idle", "expr": "smug", "actions": [{"at": "60%", "to": [9, 3], "anim": "walk"}]}],
   props=[{"type": "gift", "hand": "theo", "scale": 0.45}], fx=[T("theo", text="9,000 DAYS", color=RED), done("jax")], sfx=[{"name": "record_scratch", "at": "w:everything"}])
sc("I handed out free birthday *cake*.", set="park", time="day", shot="full", camera={"target": "theo", "angle": 30},
   actors=[{"id": "theo", "at": [0, 0], "face": 0, "anim": "hold", "expr": "happy"}, {"id": "zoe", "at": [-7, 3], "to": [8, 3], "speed": 4, "expr": "neutral"}, {"id": "k2", "at": [7, -3], "to": [-8, -3], "speed": 4, "expr": "neutral"}],
   props=[{"type": "cake", "hand": "theo", "scale": 0.5}], fx=[T("theo", text="9,000 DAYS", color=RED)], sfx=[{"name": "crickets", "vol": 0.7}])
sc("I joined *every* single club.", set="classroom", shot="full", camera={"target": "theo", "angle": 0, "height": 2},
   actors=[{"id": "theo", "at": [0, -6], "face": 0, "anim": "wave", "expr": "grin"}], props=[{"type": "sign", "text": "CHESS CLUB", "at": [-5, -8], "w": 5, "h": 1.4, "y": 3.5, "bg": "#ffd23f"}],
   fx=[T("theo", text="9,000 DAYS", color=RED)], sfx=[{"name": "crickets", "vol": 0.7}])
sc("Nothing *changed*.", set="classroom", shot="close", camera={"target": "theo", "angle": 15, "move": "push"},
   actors=[{"id": "theo", "at": [0, -6], "face": 0, "anim": "tired", "expr": "sad"}], fx=[T("theo", text="9,000 DAYS", color=RED)])
# --- INCITING ---
sc("Until one rainy Tuesday...", set="street", time="dusk", shot="wide", camera={"target": "theo", "angle": 40, "move": "drift"},
   actors=[{"id": "theo", "at": [-4, 0], "to": [3, 0], "speed": 2, "anim": "walk", "expr": "neutral"}], fx=[{"type": "rain"}, T("theo", text="9,000 DAYS", color=RED)], sfx=[{"name": "rain", "vol": 0.5}])
sc("it *glitched*.", set="street", time="dusk", shot="close", punch=True, camera={"target": "theo", "angle": 0, "height": 1.0},
   actors=[{"id": "theo", "at": [3, 0], "face": 0, "anim": "idle", "expr": "surprised"}], fx=[{"type": "rain"}, T("theo", text="9,000 DAYS", glitch=True, color=RED)],
   sfx=[{"name": "glitch", "at": "w:glitched"}], overlay=["flash"])
sc("Nine thousand days became...", set="street", time="dusk", shot="close", camera={"target": "theo", "angle": -15, "move": "push"},
   actors=[{"id": "theo", "at": [3, 0], "face": 0, "anim": "idle", "expr": "worried"}], fx=[{"type": "rain"}, T("theo", text="8,1#7 DAYS", glitch=True, color="#ff4dff")])
sc("*Nine minutes*!", set="street", time="dusk", shot="close", punch=True, camera={"target": "theo", "angle": 0, "height": 1.2},
   actors=[{"id": "theo", "at": [3, 0], "face": 0, "anim": "shocked", "expr": "shocked"}], fx=[{"type": "rain"}, T("theo", **{"from": 540}, color="#7dff9a", size=3.2, y=6.3)],
   sfx=[{"name": "boom", "at": "w:nine"}, {"name": "crowd_gasp", "at": "w:minutes", "vol": 0.6}])
sc("I ran *outside*.", set="street", time="dusk", shot="full", camera={"target": "theo", "angle": -55},
   actors=[{"id": "theo", "at": [-8, 0], "to": [8, 0], "anim": "run", "expr": "nervous"}], fx=[{"type": "rain"}, T("theo", **{"from": 534})], sfx=[{"name": "cartoon_run", "at": 0.1}])
# --- THE SEARCH ---
sc("Was it the new kid?", set="street", time="dusk", shot="medium", camera={"target": "group", "angle": 15},
   actors=[{"id": "nkid", "at": [1.8, -1], "face": -50, "anim": "idle", "expr": "surprised"}, {"id": "theo", "at": [-5, 0], "to": [-1, 0], "anim": "run", "after": "point", "expr": "nervous"}],
   fx=[{"type": "rain"}, T("theo", **{"from": 520}), T("nkid", text="00:00", color=GOLD)])
sc("*Nope*. He already had one.", set="street", time="dusk", shot="close", camera={"target": "nkid", "angle": 20},
   actors=[{"id": "nkid", "at": [1.8, -1], "face": -30, "anim": "shrug", "expr": "smug"}], fx=[{"type": "rain"}, T("nkid", text="00:00", color=GOLD)], sfx=[{"name": "buzzer", "at": "w:nope"}])
sc("The mailman?", set="street", time="dusk", shot="medium", camera={"target": "group", "angle": -15},
   actors=[{"id": "mail", "at": [2, -2], "face": -40, "anim": "hold", "expr": "neutral"}, {"id": "theo", "at": [-2, 0], "face": 50, "anim": "point", "expr": "nervous"}],
   props=[{"type": "box", "hand": "mail", "scale": 0.5, "color": "#c99a5b"}], fx=[{"type": "rain"}, T("theo", **{"from": 470}), T("mail", text="00:00", color=GOLD)])
sc("*Nope*!", set="street", time="dusk", shot="close", camera={"target": "mail", "angle": 15},
   actors=[{"id": "mail", "at": [2, -2], "face": -20, "anim": "shrug", "expr": "laugh"}], fx=[{"type": "rain"}, T("mail", text="00:00", color=GOLD)], sfx=[{"name": "buzzer", "at": "w:nope"}])
sc("Three minutes left.", set="street", time="dusk", shot="close", camera={"target": "theo", "angle": -20, "move": "push"},
   actors=[{"id": "theo", "at": [0, 0], "face": 0, "anim": "scared", "expr": "nervous"}], fx=[{"type": "rain"}, T("theo", **{"from": 180}, redBelow=200)], sfx=[{"name": "tick", "at": 0.2}, {"name": "tick", "at": 1.2}])
sc("I checked *everyone*.", set="city", time="dusk", setOpts={"label": "MALL"}, shot="wide", camera={"target": "theo", "angle": -40},
   actors=[{"id": "theo", "at": [-8, 0], "to": [6, 1], "anim": "run", "expr": "nervous"}, {"id": "jax", "at": [-2, -3], "face": 30, "expr": "smug"}, {"id": "zoe", "at": [3, -6], "face": -20, "anim": "phone", "expr": "happy"}, {"id": "k2", "at": [8, -3], "face": -30, "expr": "happy"}],
   fx=[{"type": "rain"}, T("theo", **{"from": 150}, redBelow=200), done("jax"), done("zoe"), done("k2")], props=[{"type": "phone", "hand": "zoe"}])
sc("One *minute*.", set="city", time="dusk", setOpts={"label": "MALL"}, shot="extreme", camera={"target": "theo", "angle": 0, "height": 1.6}, overlay=["vignette"],
   actors=[{"id": "theo", "at": [6, 1], "face": 0, "anim": "idle", "expr": "worried"}], fx=[{"type": "rain"}, T("theo", **{"from": 60}, redBelow=200, size=2.2, y=6.0)], sfx=[{"name": "heartbeat"}])
# --- THE TWIST ---
sc("Then I heard someone *crying*.", set="school", time="dusk", shot="full", camera={"target": "theo", "angle": 30},
   actors=[{"id": "theo", "at": [-6, -2], "face": 0, "anim": "idle", "expr": "surprised", "actions": [{"at": "w:crying", "face": 60}]}],
   fx=[{"type": "rain"}, T("theo", **{"from": 52}, redBelow=200)])
sc("Behind the school, a girl was sitting all alone.", set="school", time="dusk", shot="medium", camera={"target": "mia", "angle": 10, "move": "push"},
   actors=[{"id": "mia", "at": [9, -8.1], "face": 0, "anim": "sitsad", "expr": "cry"}], fx=[{"type": "rain"}, T("mia", **{"from": 45}, redBelow=200, glitch=False)])
sc("Her timer used to say nine thousand days... *too*.", set="school", time="dusk", shot="close", camera={"target": "mia", "angle": -15},
   actors=[{"id": "mia", "at": [9, -8.1], "face": 0, "anim": "sitsad", "expr": "sad"}], fx=[{"type": "rain"}, T("mia", **{"from": 38}, redBelow=200)], sfx=[{"name": "crowd_gasp", "vol": 0.4, "at": "w:too"}])
sc("Ten seconds.", set="school", time="dusk", shot="full", camera={"target": "group", "angle": 20},
   actors=[{"id": "theo", "at": [3, -4], "to": [6.6, -6], "speed": 2.2, "expr": "nervous", "after": "idle"}, {"id": "mia", "at": [9, -8.1], "face": -40, "anim": "sitsad", "expr": "sad"}],
   fx=[{"type": "rain"}, T("theo", **{"from": 10}, redBelow=200), T("mia", **{"from": 10}, redBelow=200)], sfx=[{"name": "heartbeat"}])
sc("Hey... are you okay?", speaker="theo", set="school", time="dusk", shot="close", camera={"target": "theo", "angle": 0},
   actors=[{"id": "theo", "at": [6.6, -6], "face": 40, "anim": "talk", "expr": "worried"}, {"id": "mia", "at": [9, -8.1], "face": -40, "anim": "sitsad", "expr": "sad"}],
   fx=[{"type": "rain"}, T("theo", **{"from": 7}, redBelow=200)])
sc("Nobody's ever asked me that before.", speaker="mia", set="school", time="dusk", shot="close", camera={"target": "mia", "angle": 0},
   actors=[{"id": "theo", "at": [6.6, -6], "face": 40, "anim": "idle", "expr": "worried"}, {"id": "mia", "at": [9, -8.1], "face": -40, "anim": "sit", "expr": "surprised"}],
   fx=[{"type": "rain"}, T("mia", **{"from": 4}, redBelow=200)])
sc("*Zero*.", set="school", time="sunset", shot="medium", punch=True, transition="white", camera={"target": "group", "angle": 10, "move": "orbit", "amount": 30}, dur=2.2,
   actors=[{"id": "theo", "at": [6.6, -6], "face": 40, "anim": "idle", "expr": "surprised"}, {"id": "mia", "at": [9, -8.1], "face": -40, "anim": "sit", "expr": "happy"}],
   fx=[T("theo", text="00:00", color=GOLD), T("mia", text="00:00", color=GOLD), {"type": "sparkles", "pos": [7.8, 0, -7.4], "count": 90}, {"type": "confetti", "pos": [7.8, 0, -7.4], "count": 90}],
   sfx=[{"name": "magic", "at": 0}, {"name": "tada", "at": 0.15}])
# --- PAYOFF ---
sc("Turns out, our timers were never *broken*.", set="school", time="sunset", shot="full", camera={"target": "group", "angle": 0, "move": "pull"},
   actors=[{"id": "theo", "at": [7.6, -8.1], "face": 0, "anim": "sit", "expr": "happy"}, {"id": "mia", "at": [10.4, -8.1], "face": 0, "anim": "sit", "expr": "grin"}],
   fx=[T("theo", text="00:00", color=GOLD), T("mia", text="00:00", color=GOLD)])
sc("We were just both waiting for someone to *notice*.", set="school", time="sunset", shot="medium", camera={"target": "group", "angle": 15, "move": "push"}, thumbnail=True,
   actors=[{"id": "theo", "at": [7.6, -8.1], "face": 20, "anim": "sit", "expr": "laugh"}, {"id": "mia", "at": [10.4, -8.1], "face": -20, "anim": "sit", "expr": "laugh"}],
   fx=[T("theo", text="00:00", color=GOLD), T("mia", text="00:00", color=GOLD), {"type": "hearts", "pos": [9, 0, -8.1]}], sfx=[{"name": "crowd_aww", "vol": 0.5}])
sc("So... what now?", speaker="mia", set="school", time="sunset", shot="close", camera={"target": "mia", "angle": -10},
   actors=[{"id": "theo", "at": [7.6, -8.1], "face": 30, "anim": "sit", "expr": "happy"}, {"id": "mia", "at": [10.4, -8.1], "face": -35, "anim": "sit", "expr": "nervous"}],
   fx=[T("mia", text="00:00", color=GOLD)])
sc("Ice cream?", speaker="theo", set="school", time="sunset", shot="close", camera={"target": "theo", "angle": 10},
   actors=[{"id": "theo", "at": [7.6, -8.1], "face": 35, "anim": "sit", "expr": "grin"}, {"id": "mia", "at": [10.4, -8.1], "face": -35, "anim": "sit", "expr": "laugh"}],
   fx=[T("theo", text="00:00", color=GOLD)], sfx=[{"name": "pop", "at": 0.1}])
sc("And for the first time in my life... I wasn't counting *anything*.", set="street", time="sunset", shot="wide", camera={"target": "group", "angle": 10, "move": "rise"},
   actors=[{"id": "theo", "at": [-1.3, 0], "to": [-1.3, -9], "speed": 1.6, "expr": "happy"}, {"id": "mia", "at": [1.3, 0], "to": [1.3, -9], "speed": 1.6, "expr": "happy"}])
# --- CLIFFHANGER ---
sc("But that night... a *new* timer appeared.", set="bedroom", time="night", shot="medium", camera={"target": "theo", "angle": 0, "move": "push"}, overlay=["vignette"], transition="fade",
   actors=[{"id": "theo", "at": [0, 0], "face": 0, "anim": "idle", "expr": "neutral", "actions": [{"at": "w:new", "anim": "shocked", "expr": "shocked"}]}],
   fx=[T("theo", text="00:00", color=GOLD, until="w:new"), T("theo", **{"from": 25200}, fmt="hms", color=RED, glitch=True, at="w:new")], sfx=[{"name": "glitch", "at": "w:new"}])
sc("And it was *not* counting down to a friend.", set="bedroom", time="spooky", shot="extreme", camera={"target": "theo", "angle": 0, "height": 1.4}, overlay=["vignette", "red"], fadeOut=True, pad=1.4,
   actors=[{"id": "theo", "at": [0, 0], "face": 0, "anim": "scared", "expr": "scared"}], fx=[T("theo", **{"from": 25190}, fmt="hms", color=RED, size=2.2, y=6.0)],
   sfx=[{"name": "dun_dun_dun", "at": "w:not"}])

# fx 'from' can't be a python kwarg name in T(); clean helper artefacts
for s in S:
    for f in s.get("fx", []):
        f.pop("from_", None)
story = {"title": "In This Town, Everyone Has A Best Friend Timer", "narrator": "narrator", "music": "curious", "musicVol": 0.14, "pad": 0.2,
         "style": {"captionWords": 1, "captionY": 0.7, "captionSize": 0.13, "uppercase": True, "emphColor": "#ffe14d"}, "cast": cast, "scenes": S}
json.dump(story, open(__file__.replace("gen.py", "story.json"), "w"), indent=1)
print(len(S), "scenes")
