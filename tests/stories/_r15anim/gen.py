"""R15 animation check. python tests/stories/_r15anim/gen.py story            -> writes story.json (one scene per animation, R15 milo, 3/4 side view)
                       python pipeline/produce.py _r15anim --preview   -> cache/out/_r15anim/timeline.json
                       python tests/stories/_r15anim/gen.py sheet [name,name..] [n=4] [scale 0.4] -> stills at n moments of the cycle + contact sheets cache/out/_r15anim/sheet_<name>.jpg (+ all.jpg)"""
import json, os, subprocess, sys
R = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))); os.chdir(R)
FAM = {
 'locomotion': 'walk run rbx_walk rbx_run rbx_sprint ninja_run zombie_walk superhero_walk sneak',
 'climb': 'rbx_climb ninja_climb',
 'air': 'jump rbx_jump fall rbx_fall hero_landing dive_forward',
 'dance': 'floss cutesy_dance dance1 rocker_dance break_dance dance',
 'rest': 'idle rbx_idle sit sitfloor sitsad rbx_sit lie',
 'gesture': 'wave rbx_wave cheer rbx_cheer rbx_point shocked scared cry laugh clap think shrug',
 'acting': 'kneel kneel_both crawl crouch_sneak tumble dig unchain pull_door hug_give reach reach_down cry_kneel carry_walk panic scream_run lift_heavy stumble duck throw exhausted_walk',
 'layers': 'walk+wave run+cheer sit+phone',
}
NAMES = [n for f in FAM.values() for n in f.split()]
def anims():
    A = {}
    for f in os.listdir('config'):
        if f.startswith('anims') and f.endswith('.json'): A.update(json.load(open('config/' + f, encoding='utf8')))
    return A
def loopof(n):
    A = anims(); e = A.get(n.split('+')[0] + '@r15') or A.get(n.split('+')[0]) or {}
    return e.get('loop') or 1.6
def story(names):
    sc = [{"set": "studio", "dur": 2.0, "shot": "wide", "camera": {"target": [0, 3, 0], "angle": 0, "move": "static", "absolute": True}, "title": n,
           "actors": [{"id": "milo", "at": [0, 0], "face": 70, "anim": n}]} for n in names]
    json.dump({"title": "r15 anim", "music": "none", "cast": ["milo"], "publish": {"title": "r15 anim", "description": "x", "tags": ["a", "b", "c", "d", "e"]}, "scenes": sc}, open('tests/stories/_r15anim/story.json', 'w'), indent=1)
def sheet(names, n=4, scale='0.4'):
    from PIL import Image, ImageDraw
    T = json.load(open('cache/out/_r15anim/timeline.json')); idx = {s['title']: s for s in T['scenes']}; ts = []; meta = []
    for nm in names:
        s = idx[nm]; L = loopof(nm); span = L if L < 1.6 else 1.8
        for k in range(n): t = round(s['start'] + 0.05 + k * span / n, 2); ts.append(t); meta.append((nm, t))
    subprocess.run(['node', 'engine/render.mjs', 'cache/out/_r15anim/timeline.json', 'cache/out/_r15anim/st', '--stills', ','.join(map(str, ts)), '--scale', scale], capture_output=True)
    rows = []
    for nm in names:
        row = [Image.open(f'cache/out/_r15anim/st/t{t:.2f}.jpg') for (m, t) in meta if m == nm]; w, h = row[0].size; cw = int(w * .62); x0 = int(w * .1); y0 = int(h * .33); y1 = int(h * .72)
        sh = Image.new('RGB', (cw * len(row), y1 - y0))
        for c, im in enumerate(row): sh.paste(im.crop((x0, y0, x0 + cw, y1)), (c * cw, 0))
        ImageDraw.Draw(sh).text((4, 4), nm, fill='white'); sh.save(f'cache/out/_r15anim/sheet_{nm.replace("+", "_")}.jpg'); rows.append(sh)
    if len(rows) > 1:
        g = Image.new('RGB', (rows[0].width, sum(r.height for r in rows)))
        y = 0
        for r in rows: g.paste(r, (0, y)); y += r.height
        g.save('cache/out/_r15anim/all.jpg')
    print('sheets', len(rows))
if __name__ == '__main__':
    if sys.argv[1] == 'story': story(NAMES)
    else: sheet(sys.argv[2].split(',') if len(sys.argv) > 2 and sys.argv[2] else NAMES, int(sys.argv[3]) if len(sys.argv) > 3 else 4, sys.argv[4] if len(sys.argv) > 4 else '0.4')
