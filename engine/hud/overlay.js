// 2D compositing: word-by-word captions, hook titles, flashes, vignette, transitions.
let chunks = null;
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const ease = (k) => 1 - Math.pow(1 - k, 3);

function buildChunks(TL) {
  const max = TL.style?.captionWords ?? 2;
  const out = [];
  let cur = [];
  for (const w of TL.words || []) {
    cur.push(w);
    if (cur.length >= max || /[.,!?;:…]$/.test(w.w) || w.emph) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out.map((ws, i) => ({ ws, s: ws[0].s, e: Math.max(ws[ws.length - 1].e, ws[0].s + 0.25) }));
}

function strokeText(g, txt, x, y, size, fill, font = 'Lilita One') {
  g.font = `${size}px "${font}"`;
  g.lineJoin = 'round';
  g.miterLimit = 2;
  g.lineWidth = size * 0.2;
  g.strokeStyle = '#000';
  g.strokeText(txt, x, y + size * 0.05);
  g.strokeText(txt, x, y);
  g.fillStyle = fill;
  g.fillText(txt, x, y);
}

export function drawCaptions(g, W, H, t, TL) {
  if (TL.style?.captions === false) return;
  if (!chunks) chunks = buildChunks(TL);
  const c = chunks.find((c, i) => t >= c.s && t < (chunks[i + 1] ? Math.min(chunks[i + 1].s, c.e + 0.6) : c.e + 0.6));
  if (!c) return;
  const base = W * (TL.style?.captionSize ?? 0.105);
  const y = H * (TL.style?.captionY ?? 0.7);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  const parts = c.ws.map((w) => {
    const txt = (TL.style?.uppercase ? w.w.toUpperCase() : w.w).replace(/\*/g, '');
    const size = base * (w.emph ? 1.25 : 1);
    g.font = `${size}px "Lilita One"`;
    return { w, txt, size, width: g.measureText(txt).width };
  });
  const gap = base * 0.28;
  let total = parts.reduce((a, p) => a + p.width, 0) + gap * (parts.length - 1);
  let scaleAll = Math.min(1, (W * 0.9) / total);
  let x = W / 2 - (total * scaleAll) / 2;
  const pop = ease(clamp01((t - c.s) / 0.12)); // chunk pop-in
  g.save();
  g.translate(W / 2, y);
  g.scale(scaleAll * (0.75 + 0.25 * pop), scaleAll * (0.75 + 0.25 * pop));
  g.translate(-W / 2, -y);
  x = W / 2 - total / 2;
  for (const p of parts) {
    const active = t >= p.w.s && t < p.w.e + 0.05;
    const said = t >= p.w.s;
    const col = p.w.emph
      ? TL.style?.emphColor || '#ffe14d'
      : active
        ? TL.style?.activeColor || '#ffffff'
        : said
          ? '#ffffff'
          : 'rgba(255,255,255,.9)';
    const k = active ? 1 + 0.12 * (1 - ease(clamp01((t - p.w.s) / 0.15))) : 1;
    g.save();
    g.translate(x + p.width / 2, y);
    g.scale(k, k);
    g.rotate(p.w.emph ? -0.04 : 0);
    g.textAlign = 'center';
    strokeText(g, p.txt, 0, 0, p.size, col);
    g.restore();
    x += p.width + gap;
  }
  g.restore();
}

export function drawOverlays(g, W, H, s, lt, t, TL) {
  const ov = s.overlay || [];
  const has = (n) => ov.includes(n) || ov.some((o) => o.type === n);
  if (has('vignette') || s.time === 'night' || s.time === 'spooky') {
    const gr = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, `rgba(0,0,0,${s.time === 'spooky' ? 0.7 : 0.45})`);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
  }
  if (has('sepia') || has('flashback')) {
    g.fillStyle = 'rgba(255,190,110,.18)';
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'saturation';
    g.fillStyle = 'rgba(128,128,128,.6)';
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
  }
  if (has('red')) {
    g.fillStyle = `rgba(255,0,0,${0.15 + 0.1 * Math.sin(lt * 10)})`;
    g.fillRect(0, 0, W, H);
  }
  if (has('flash') && lt < 0.25) {
    g.fillStyle = `rgba(255,255,255,${1 - lt / 0.25})`;
    g.fillRect(0, 0, W, H);
  }
  if (has('speedlines')) {
    g.save();
    g.translate(W / 2, H * 0.45);
    g.strokeStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2 + Math.floor(lt * 20) * 0.37;
      const r0 = H * (0.32 + ((i * 37) % 10) / 60);
      g.lineWidth = 3 + (i % 3) * 3;
      g.beginPath();
      g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      g.lineTo(Math.cos(a) * H, Math.sin(a) * H);
      g.stroke();
    }
    g.restore();
  }
  // transitions in
  const tr = s.transition;
  const T = 0.35;
  if (tr === 'fade' && lt < T) {
    g.fillStyle = `rgba(0,0,0,${1 - lt / T})`;
    g.fillRect(0, 0, W, H);
  }
  if (tr === 'white' && lt < T) {
    g.fillStyle = `rgba(255,255,255,${1 - lt / T})`;
    g.fillRect(0, 0, W, H);
  }
  if (tr === 'wipe' && lt < T) {
    g.fillStyle = '#111';
    g.fillRect(W * ease(lt / T), 0, W, H);
  }
  if (s.fadeOut && lt > s.dur - 0.5) {
    g.fillStyle = `rgba(0,0,0,${clamp01((lt - (s.dur - 0.5)) / 0.5)})`;
    g.fillRect(0, 0, W, H);
  }
  // hook title (top)
  if (s.title) {
    const k = ease(clamp01(lt / 0.25));
    const size = W * (s.titleSize || 0.1);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const lines = wrap(g, s.title, W * 0.86, size);
    g.save();
    g.globalAlpha = k;
    g.translate(0, (1 - k) * -40);
    const bh = lines.length * size * 1.15 + size * 0.7;
    g.fillStyle = s.titleBg || 'rgba(0,0,0,.0)';
    g.fillRect(0, H * 0.12 - size * 0.6, W, bh);
    lines.forEach((ln, i) => strokeText(g, ln, W / 2, H * 0.12 + i * size * 1.15, size, s.titleColor || '#ffffff'));
    g.restore();
  }
  // text cards: [{text, at, until, y, color, size}]
  for (const o of ov)
    if (o && o.type === 'text') {
      const a = o.at || 0,
        b = o.until ?? s.dur;
      if (lt < a || lt > b) continue;
      const k = ease(clamp01((lt - a) / 0.2));
      g.save();
      g.globalAlpha = k;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const size = W * (o.size || 0.07);
      wrap(g, o.text, W * 0.86, size).forEach((ln, i) =>
        strokeText(g, ln, W / 2, H * (o.y ?? 0.3) + i * size * 1.15, size, o.color || '#ffffff'),
      );
      g.restore();
    }
}
function wrap(g, text, maxW, size) {
  g.font = `${size}px "Lilita One"`;
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const tst = cur ? cur + ' ' + w : w;
    if (g.measureText(tst).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = tst;
  }
  if (cur) lines.push(cur);
  return lines;
}
