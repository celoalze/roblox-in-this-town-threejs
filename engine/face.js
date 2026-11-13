// Face textures: atlas v1 (assets/textures/faces/faces_atlas.png, 4x8 cells), expression table EXPR, and face v2 composition (engine/face2.js).
// pipeline/lint.py reads the expression names from the EXPR table below. Was part of engine/rig.js.
import * as THREE from 'three';
import { FACE2, composeV2, resolveV2, drawEyes, drawBrows, drawTears, browsOf, pupilMul } from './face2.js';

let ATLAS = null;
export async function loadFaceAtlas(url = '/assets/textures/faces/faces_atlas.png') { ATLAS = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; }); }
const CELL = { surprised: [0, 0], confident: [0, 1], cry: [0, 2], nervous: [0, 3], neutral: [1, 0], blink: [1, 1], talk: [1, 2], smirk: [1, 3], laugh: [2, 0], sleep: [2, 1], angry: [2, 2], sad: [2, 3], smile: [3, 0], grin: [3, 1], worried: [3, 2], shocked: [3, 3],
  // rows 4-7 are drawn by assets/textures/faces/extend_faces_atlas.py
  suspicious: [4, 0], skeptical: [4, 1], bored: [4, 2], dizzy: [4, 3], starry: [5, 0], furious: [5, 1], teary: [5, 2], wink: [5, 3],
  determined: [6, 0], disgusted: [6, 1], pout: [6, 2], scream: [6, 3], deadpan: [7, 0], shy: [7, 1], mischief: [7, 2], awe: [7, 3] };
// expr -> [eyes cell, closed mouth cell, open (talking) mouth cell]
const EXPR = { happy: ['smile', 'smile', 'grin'], grin: ['confident', 'confident', 'grin'], laugh: ['laugh', 'laugh', 'grin'], sad: ['sad', 'sad', 'talk'], cry: ['cry', 'cry', 'cry'], angry: ['angry', 'angry', 'talk'], shocked: ['shocked', 'shocked', 'surprised'], surprised: ['surprised', 'surprised', 'talk'], scared: ['worried', 'worried', 'talk'], nervous: ['nervous', 'nervous', 'talk'], smug: ['smirk', 'smirk', 'talk'], neutral: ['neutral', 'neutral', 'talk'], sleepy: ['sleep', 'sleep', 'sleep'], confident: ['confident', 'confident', 'grin'], love: ['smile', 'smile', 'grin'], evil: ['angry', 'confident', 'grin'], ko: ['neutral', 'surprised', 'surprised'], worried: ['worried', 'worried', 'talk'], content: ['blink', 'blink', 'grin'],
  // dramatic
  furious: ['furious', 'furious', 'furious'], determined: ['determined', 'determined', 'talk'], teary: ['teary', 'teary', 'talk'], heartbroken: ['teary', 'sad', 'talk'],
  scream: ['scream', 'scream', 'scream'], panic: ['worried', 'scream', 'scream'], horrified: ['scream', 'furious', 'scream'], awe: ['awe', 'awe', 'grin'],
  suspicious: ['suspicious', 'suspicious', 'talk'], betrayed: ['teary', 'furious', 'furious'],
  // idle
  bored: ['bored', 'bored', 'talk'], skeptical: ['skeptical', 'skeptical', 'talk'], shy: ['shy', 'shy', 'talk'], pout: ['pout', 'pout', 'talk'],
  annoyed: ['bored', 'angry', 'talk'], curious: ['skeptical', 'surprised', 'talk'], proud: ['blink', 'confident', 'grin'], relieved: ['sleep', 'smile', 'grin'],
  // comic
  dizzy: ['dizzy', 'dizzy', 'dizzy'], starstruck: ['starry', 'starry', 'starry'], wink: ['wink', 'wink', 'grin'], disgusted: ['disgusted', 'disgusted', 'disgusted'],
  deadpan: ['deadpan', 'deadpan', 'talk'], mischief: ['mischief', 'mischief', 'grin'], sly: ['suspicious', 'smirk', 'talk'], awkward: ['nervous', 'shy', 'talk'],
  whee: ['laugh', 'grin', 'grin'], dreamy: ['sleep', 'smile', 'grin'],   stunned: ['scream', 'deadpan', 'surprised'], hysterical: ['laugh', 'scream', 'scream'], silly: ['dizzy', 'wink', 'wink'], grumpy: ['deadpan', 'pout', 'talk'] };
const SPLIT = 250;
const faceCache = {};
function paintAtlas(g, expr, open, blink, extra) { // the original atlas composition (unchanged): eyes cell + mouth cell + procedural extras
  const [E, Mc, O] = EXPR[expr] || EXPR.happy;
  const cell = (name, y0, y1) => { const [r, c] = CELL[name]; g.drawImage(ATLAS, c * 512, r * 512 + y0, 512, y1 - y0, 0, y0, 512, y1 - y0); };
  if (expr === 'cry') cell('cry', 0, 512);
  else {
    if (blink && !['sleepy', 'content', 'laugh', 'dizzy', 'silly', 'wink', 'starstruck', 'deadpan', 'grumpy', 'proud', 'relieved'].includes(expr)) cell('blink', 0, SPLIT); else if (expr === 'ko') { g.strokeStyle = '#0b0b0b'; g.lineWidth = 16; g.lineCap = 'round'; [196, 315].forEach(x => { g.beginPath(); g.moveTo(x - 26, 180); g.lineTo(x + 26, 232); g.moveTo(x + 26, 180); g.lineTo(x - 26, 232); g.stroke(); }); } else cell(E, 0, SPLIT);
    cell(open ? O : Mc, SPLIT, 512);
  }
  if (expr === 'love' && !blink) [196, 315].forEach(x => { g.fillStyle = '#ff2d6a'; g.beginPath(); g.moveTo(x, 236); g.bezierCurveTo(x - 46, 200, x - 26, 160, x, 184); g.bezierCurveTo(x + 26, 160, x + 46, 200, x, 236); g.fill(); });
  if (expr === 'dreamy' || expr === 'whee') { const star = (x, y, r) => { g.fillStyle = '#fff6b0'; g.beginPath(); for (let i = 0; i < 8; i++) { const an = i / 8 * Math.PI * 2, rr = i % 2 ? r * .3 : r; g.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); } g.closePath(); g.fill(); }; // pastel sparkle + rosy cheeks
    g.fillStyle = 'rgba(255,130,170,.4)'; g.beginPath(); g.ellipse(140, 270, 34, 18, 0, 0, 7); g.ellipse(372, 270, 34, 18, 0, 0, 7); g.fill(); if (expr === 'dreamy') { star(168, 150, 20); star(344, 150, 20); star(96, 215, 12); star(416, 215, 12); } else { star(86, 170, 14); star(426, 170, 14); } }
  if (extra.lashes && !blink) { g.strokeStyle = '#0b0b0b'; g.lineWidth = 9; g.lineCap = 'round'; [[196, -1], [315, 1]].forEach(([x, s]) => { g.beginPath(); g.moveTo(x + s * 18, 178); g.lineTo(x + s * 34, 166); g.moveTo(x + s * 22, 190); g.lineTo(x + s * 38, 184); g.stroke(); }); }
  if (extra.blush) { g.fillStyle = 'rgba(255,110,130,.35)'; g.beginPath(); g.ellipse(150, 262, 30, 16, 0, 0, 7); g.ellipse(362, 262, 30, 16, 0, 0, 7); g.fill(); }
}
export function faceTexture(expr, open, blink, extra = {}) {
  const key = `${expr}|${open}|${blink}|${extra.lashes || ''}|${extra.blush || ''}`; if (faceCache[key]) return faceCache[key];
  const cv = document.createElement('canvas'); cv.width = cv.height = 512; const g = cv.getContext('2d'); paintAtlas(g, expr, open, blink, extra);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return (faceCache[key] = t);
}

// ---------- face v2 (engine/face2.js): procedural layers on top of / instead of the atlas ----------
// Atlas expressions keep their pixels unless an option is used: explicit gaze / pupils turn the eyes into white eyes with pupils, auto gaze slides the
// black ovals (or the pupils of the round-eyed ones) a few pixels, brows replace the atlas brows, tears add streams. NEW expressions (FACE2) are fully procedural.
const OVAL = [176, 166, 219, 243]; // eye box of the black-oval cells (left eye; the right one mirrors around x 255.5)
const EYEK = { smile: { box: OVAL }, confident: { box: OVAL }, neutral: { box: OVAL }, sad: { box: OVAL }, smirk: { box: OVAL }, surprised: { box: OVAL }, angry: { box: [176, 179, 219, 241], lid: .1, slant: .5 },
  worried: { rx: 41, ry: 45, cy: 205, pr: 13, box: [154, 150, 244, 252] }, nervous: { rx: 41, ry: 45, cy: 205, pr: 13, box: [154, 150, 244, 252] }, shocked: { rx: 47, ry: 49, cy: 201, pr: 7, box: [148, 150, 247, 252] }, scream: { rx: 46, ry: 45, cy: 205, pr: 7, box: [148, 150, 247, 252] } };
const NO_EYE_EDIT = new Set(['ko', 'love', 'cry', 'dreamy', 'whee', 'sleepy']);
const f2cache = []; const f2map = new Map();
export function faceTexture2(expr, lvl, blink, o = {}, extra = {}) {
  const key = JSON.stringify([expr, lvl, blink, o, extra.lashes || '', extra.blush || '']); let t = f2map.get(key); if (t) return t;
  const cv = document.createElement('canvas'); cv.width = cv.height = 512; const g = cv.getContext('2d');
  if (FACE2[expr]) composeV2(g, resolveV2(expr, lvl, blink, o));
  else {
    const open = lvl >= .5; paintAtlas(g, expr, open, blink, extra);
    const [E] = EXPR[expr] || EXPR.happy, kd = !NO_EYE_EDIT.has(expr) && !blink ? EYEK[E] : null, gz = o.g || [[0, 0], [0, 0]], conv = kd && (o.ex || o.pu != null), mul = pupilMul(o.pu);
    const clearEyes = () => { const [x0, y0, x1, y1] = kd.box; g.clearRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4); g.clearRect(511 - x1 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4); };
    if (o.br) g.clearRect(100, 0, 312, 138);
    if (conv) { clearEyes(); const e = kd.rx ? { k: 'round', rx: kd.rx, ry: kd.ry, pr: kd.pr * mul } : { k: 'round', rx: 41, ry: 45, pr: 15 * mul, lid: kd.lid, slant: kd.slant }; drawEyes(g, { eyes: e, gz, blink: false, ey: kd.cy || 205, ph: 0 }); }
    else if (o.au && kd) {
      if (kd.rx) { clearEyes(); drawEyes(g, { eyes: { k: 'round', rx: kd.rx, ry: kd.ry, pr: kd.pr, lid: kd.lid, slant: kd.slant }, gz: gz.map(v => [v[0] * .7, v[1] * .7]), blink: false, ey: kd.cy, ph: 0 }); }
      else { const [x0, y0, x1, y1] = kd.box, [r, c] = CELL[E], w = x1 - x0 + 4, h = y1 - y0 + 4; clearEyes();
        [[x0, gz[0]], [511 - x1, gz[1]]].forEach(([sx, v]) => g.drawImage(ATLAS, c * 512 + sx - 2, r * 512 + y0 - 2, w, h, sx - 2 + v[0] * 9, y0 - 2 + v[1] * 8, w, h)); } }
    if (o.br) drawBrows(g, browsOf(o.br));
    if (o.te) { drawTears(g, o.tp || 0, 240); }
  }
  t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; f2map.set(key, t); f2cache.push(key);
  if (f2cache.length > 300) { const k = f2cache.shift(), old = f2map.get(k); f2map.delete(k); old?.dispose(); } // bounded: gaze / mouth combinations are many
  return t;
}
