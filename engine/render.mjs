// Usage: node engine/render.mjs <timeline.json> <out.mp4> [--workers N] [--stills t1,t2,...] [--cpu] [--fresh] [--scale 0.5] [--blur N]  (motion-blur samples per frame, default style.blur or 8; 1 = off; stills are never blurred)
import http from 'http';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf('--' + k);
  return i < 0 ? d : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
};
const [tlPath, outPath] = args;
const TL = JSON.parse(fs.readFileSync(tlPath, 'utf8'));
const scale = +opt('scale', 1);
if (scale !== 1) {
  TL.width = Math.round((TL.width * scale) / 2) * 2;
  TL.height = Math.round((TL.height * scale) / 2) * 2;
}
const MIME = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ktx2': 'image/ktx2',
  '.wasm': 'application/wasm',
  '.html': 'text/html',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};
let server = null;
let browser = null;
const activeTmps = new Set();
let lst = null;

async function cleanup() {
  for (const tmp of activeTmps) {
    if (fs.existsSync(tmp)) {
      try {
        fs.unlinkSync(tmp);
      } catch {}
    }
  }
  activeTmps.clear();
  if (lst && fs.existsSync(lst)) {
    try {
      fs.unlinkSync(lst);
    } catch {}
    lst = null;
  }
  if (browser) {
    try {
      await browser.close();
    } catch {}
    browser = null;
  }
  if (server) {
    try {
      server.close();
    } catch {}
    server = null;
  }
}

process.on('SIGINT', async () => {
  await cleanup();
  process.exit(1);
});
process.on('SIGTERM', async () => {
  await cleanup();
  process.exit(1);
});

const sha = (x) => crypto.createHash('sha1').update(x).digest('hex');

// Cache signature that invalidates cached scene segments when:
// - Any source/data file in engine/ or config/ changes content (.js, .mjs, .html, .json recursively)
// - Any asset or format file in assets/ is added/removed/modified (stat walk: rel path, size, mtimeMs; skipping *.md)
// - Installed versions of three, three.quarks, or puppeteer-core change in node_modules
function engineSignature() {
  const parts = [];

  function walkCode(dir) {
    const fullDir = path.join(ROOT, dir);
    if (!fs.existsSync(fullDir)) return;
    const entries = fs.readdirSync(fullDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkCode(rel);
      } else if (entry.isFile() && /\.(js|mjs|html|json)$/i.test(entry.name)) {
        const normPath = rel.split(path.sep).join('/');
        const content = fs.readFileSync(path.join(ROOT, rel));
        parts.push(normPath + ':' + sha(content));
      }
    }
  }
  walkCode('engine');
  walkCode('config');

  function walkMeta(dir) {
    const fullDir = path.join(ROOT, dir);
    if (!fs.existsSync(fullDir)) return;
    const entries = fs.readdirSync(fullDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkMeta(rel);
      } else if (entry.isFile() && !/\.md$/i.test(entry.name)) {
        const normPath = rel.split(path.sep).join('/');
        const st = fs.statSync(path.join(ROOT, rel));
        parts.push(`${normPath}:${st.size}:${st.mtimeMs}`);
      }
    }
  }
  walkMeta('assets');

  for (const pkg of ['three', 'three.quarks', 'puppeteer-core']) {
    try {
      const pkgPath = path.join(ROOT, 'node_modules', pkg, 'package.json');
      const ver = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
      parts.push(`${pkg}@${ver}`);
    } catch {
      parts.push(`${pkg}@missing`);
    }
  }

  return sha(parts.join('\n'));
}

try {
  server = http.createServer((q, r) => {
    const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
    if (!path.resolve(f).startsWith(ROOT) || !fs.existsSync(f)) {
      r.writeHead(404);
      return r.end();
    }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(r);
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const port = server.address().port;
  const CHROME =
    process.env.CHROME_PATH ||
    [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ].find((p) => fs.existsSync(p));
  const gl = !(process.env.RS_CPU === '1' || opt('cpu', false))
    ? [
        '--enable-gpu',
        '--ignore-gpu-blocklist',
        '--use-angle=' + (process.platform === 'win32' ? 'd3d11' : 'default'),
        '--enable-features=Vulkan',
        '--disable-software-rasterizer',
      ]
    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', ...gl, `--window-size=${TL.width},${TL.height}`],
  });
  async function openPage() {
    const page = await browser.newPage();
    page.on('console', (m) => {
      if (['error', 'warn'].includes(m.type())) console.log('[page]', m.text());
    });
    page.on('pageerror', (e) => console.log('[pageerror]', e.message));
    await page.goto(`http://127.0.0.1:${port}/engine/page.html`);
    await page.waitForFunction('window.ready === true', { timeout: 180000 });
    const info = await page.evaluate((tl) => window.world.init(tl), TL);
    if (process.env.RS_CPU !== '1') {
      const rend = await page.evaluate(() => {
        const c = document.createElement('canvas').getContext('webgl2');
        const e = c.getExtension('WEBGL_debug_renderer_info');
        return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown';
      });
      console.log('GPU:', rend);
      if (/swiftshader|llvmpipe|software/i.test(rend))
        console.log('!! WARNING: software rendering — check GPU drivers / Chrome flags');
    }
    return { page, info };
  }
  const BLUR = Math.max(1, Math.round(+opt('blur', TL.style?.blur ?? 8))),
    SHUTTER = +(TL.style?.shutter ?? 0.5);
  const snap = async (page, t, q = 0.92, n = 1) =>
    Buffer.from(
      (
        await page.evaluate(
          (t, q, n, sh) => {
            window.world.frame(t, n, sh);
            return window.world.grab(q);
          },
          t,
          q,
          n,
          SHUTTER,
        )
      ).split(',')[1],
      'base64',
    );
  const lintMode = opt('lint', false);
  if (lintMode) {
    // text report: per scene, sample 3 moments
    const { page } = await openPage();
    const rep = await page.evaluate(
      (tl) =>
        tl.scenes.map((s, i) => {
          const w = new Set();
          for (const k of [0.15, 0.5, 0.9]) for (const m of window.world.lint(s.start + s.dur * k)) w.add(m);
          return [i, [...w]];
        }),
      TL,
    );
    fs.writeFileSync(outPath, JSON.stringify(rep));
    console.log('lint ->', outPath);
    await cleanup();
    process.exit(0);
  }
  const stills = opt('stills', null);
  if (stills) {
    // quick preview: individual JPGs + contact sheet
    const { page } = await openPage();
    fs.mkdirSync(outPath, { recursive: true });
    const ts = String(stills).split(',').map(Number);
    for (const t of ts) {
      fs.writeFileSync(path.join(outPath, `t${t.toFixed(2)}.jpg`), await snap(page, t));
    }
    console.log('stills ->', outPath);
  } else {
    // The video is rendered as one mp4 segment per scene, cached by content hash in cache/segments: a re-render after an edit only
    // redraws the scenes that changed (and a crashed render resumes where it stopped). --fresh ignores the cache.
    const fps = TL.fps,
      total = Math.ceil(TL.duration * fps),
      N = Math.max(1, +opt('workers', 1));
    const t0 = Date.now();
    let done = 0;
    const CACHE = path.join(ROOT, 'cache', 'segments');
    fs.mkdirSync(CACHE, { recursive: true });
    const fresh = opt('fresh', false);
    for (const f of fs.readdirSync(CACHE)) {
      const q = path.join(CACHE, f);
      if (
        Date.now() - fs.statSync(q).mtimeMs > 21 * 864e5 ||
        (f.endsWith('.tmp.mp4') && Date.now() - fs.statSync(q).mtimeMs > 36e5)
      )
        fs.unlinkSync(q);
    } // unused for 3 weeks / left by a crash
    const sig = engineSignature();
    const glob = JSON.stringify([
      sig,
      TL.width,
      TL.height,
      fps,
      BLUR,
      SHUTTER,
      TL.cast,
      TL.style,
      TL.quarks,
      TL.anims,
      Math.max(0, ...TL.scenes.map((s) => s.extras ?? 0)),
      new Set(TL.scenes.map((s) => s.setOpts?.kit)).size,
    ]);
    const lite = ({ words, line, ...s }) => s; // what a scene can inherit from the one before it: actor positions (same set), look
    const first = (s) => Math.min(total, Math.ceil(s.start * fps - 1e-6));
    const segs = TL.scenes
      .map((s, i) => {
        const a = first(s),
          b = i + 1 < TL.scenes.length ? first(TL.scenes[i + 1]) : total,
          chain = [];
        for (
          let k = i - 1;
          k >= 0 && TL.scenes[k].set === s.set && JSON.stringify(TL.scenes[k].setOpts) === JSON.stringify(s.setOpts);
          k--
        )
          chain.push(lite(TL.scenes[k]));
        const h = sha(
          glob +
            JSON.stringify([
              i,
              s,
              chain,
              TL.scenes[i - 1] ? [TL.scenes[i - 1].transition, TL.scenes[i - 1].weather, TL.scenes[i - 1].time] : 0,
              TL.scenes[i + 1]?.transition,
              (TL.words || []).filter((w) => w.e > s.start - 2 && w.s < s.start + s.dur + 2),
            ]),
        );
        return { i, a, b, file: path.join(CACHE, h + '.mp4') };
      })
      .filter((g) => g.b > g.a);
    const todo = segs.filter((g) => fresh || !fs.existsSync(g.file));
    const hit = segs.length - todo.length;
    segs.forEach((g) => {
      if (!todo.includes(g)) {
        const n = new Date();
        fs.utimesSync(g.file, n, n);
      }
    });
    const need = todo.reduce((n, g) => n + g.b - g.a, 0);
    console.log(`scenes: ${segs.length} (${hit} cached, ${todo.length} to render = ${need}/${total} frames)`);
    // contiguous buckets of about equal frame count: neighbouring scenes share their set, so each page builds few sets
    const NW = Math.min(N, todo.length),
      buckets = Array.from({ length: NW }, () => []);
    let acc = 0;
    for (const g of todo) {
      buckets[Math.min(NW - 1, Math.floor(acc / (need / NW)))].push(g);
      acc += g.b - g.a;
    }
    await Promise.all(
      buckets.map(async (list) => {
        if (!list.length) return;
        const { page } = await openPage();
        try {
          for (const g of list) {
            const tmp = g.file.replace(/\.mp4$/, `.${process.pid}.tmp.mp4`);
            activeTmps.add(tmp);
            let spawnErr = null;
            let closed = false;
            let closeCode = null;
            const ff = spawn(
              'ffmpeg',
              [
                '-y',
                '-v',
                'error',
                '-f',
                'image2pipe',
                '-c:v',
                'mjpeg',
                '-framerate',
                String(fps),
                '-i',
                '-',
                '-c:v',
                'libx264',
                '-preset',
                'medium',
                '-crf',
                '18',
                '-pix_fmt',
                'yuv420p',
                '-video_track_timescale',
                '15360',
                tmp,
              ],
              { stdio: ['pipe', 'inherit', 'inherit'] },
            );
            ff.on('error', () => {
              spawnErr = new Error('ffmpeg not found / failed to start');
            });
            ff.stdin.on('error', () => {
              if (!spawnErr) spawnErr = new Error('ffmpeg not found / failed to start');
            });
            ff.on('close', (c) => {
              closed = true;
              closeCode = c;
            });
            try {
              for (let i = g.a; i < g.b; i++) {
                if (spawnErr) throw spawnErr;
                if (closed) throw spawnErr || new Error(`ffmpeg failed on scene ${g.i}`);
                const buf = await snap(page, i / fps, 0.92, BLUR);
                if (spawnErr) throw spawnErr;
                if (closed) throw spawnErr || new Error(`ffmpeg failed on scene ${g.i}`);
                if (!ff.stdin.write(buf)) {
                  await new Promise((ok, reject) => {
                    const onDrain = () => {
                      cleanupListeners();
                      ok();
                    };
                    const onError = () => {
                      cleanupListeners();
                      reject(spawnErr || new Error('ffmpeg not found / failed to start'));
                    };
                    const onClose = (code) => {
                      cleanupListeners();
                      reject(spawnErr || new Error(`ffmpeg failed on scene ${g.i}`));
                    };
                    function cleanupListeners() {
                      ff.stdin.off('drain', onDrain);
                      ff.off('error', onError);
                      ff.off('close', onClose);
                    }
                    ff.stdin.once('drain', onDrain);
                    ff.once('error', onError);
                    ff.once('close', onClose);
                  });
                }
                if (++done % fps === 0)
                  process.stdout.write(
                    `\r${done}/${need} frames  ${((Date.now() - t0) / done).toFixed(0)} ms/frame   `,
                  );
              }
              if (spawnErr) throw spawnErr;
              if (closed && closeCode) throw new Error(`ffmpeg failed on scene ${g.i}`);
              try {
                ff.stdin.end();
              } catch {}
              const code = closed
                ? closeCode
                : await new Promise((ok, reject) => {
                    ff.on('error', () => reject(new Error('ffmpeg not found / failed to start')));
                    ff.on('close', ok);
                  });
              if (code) throw new Error(`ffmpeg failed on scene ${g.i}`);
              fs.renameSync(tmp, g.file);
              activeTmps.delete(tmp);
            } finally {
              if (activeTmps.has(tmp)) {
                if (fs.existsSync(tmp)) {
                  try {
                    fs.unlinkSync(tmp);
                  } catch {}
                }
                activeTmps.delete(tmp);
              }
            }
          }
        } finally {
          await page.close().catch(() => {});
        }
      }),
    );
    lst = outPath + '.txt';
    fs.writeFileSync(lst, segs.map((g) => `file '${g.file.split(path.sep).join('/')}'`).join('\n'));
    const ffConcat = spawn(
      'ffmpeg',
      ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', outPath],
      { stdio: 'inherit' },
    );
    const code = await new Promise((resolve, reject) => {
      ffConcat.on('error', () => reject(new Error('ffmpeg not found / failed to start')));
      ffConcat.on('close', resolve);
    });
    if (fs.existsSync(lst)) {
      fs.unlinkSync(lst);
      lst = null;
    }
    if (code) {
      console.log('concat failed');
      process.exitCode = 1;
      await cleanup();
      process.exit(1);
    }
    console.log(`\nvideo -> ${outPath} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  await cleanup();
} catch (err) {
  await cleanup();
  console.error(err.message || err);
  process.exit(1);
}
