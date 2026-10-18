// Checks that line-of-sight culling (src/lib/cull.js) never changes the picture: renders random viewpoints with and
// without culling and compares the pixels. Reports how many draw calls culling saves.
//   node tools/cull-test.mjs [url] [poses=60]       (default url: a temporary vite dev server)
import { chromium } from 'playwright';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
let url = process.argv[2];
const poses = +(process.argv[3] || 60);
let server = null;
if (!url) {
  const port = 5900 + Math.floor(Math.random() * 90);
  server = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(port), '--strictPort', '--logLevel', 'error'], { cwd: root, stdio: 'ignore' });
  url = `http://localhost:${port}/`;
  for (let i = 0; i < 60 && !(await fetch(url).then((r) => r.ok).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 500));
}
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => console.log('pageerror', e));
  await page.goto(url + (url.includes('?') ? '&' : '?') + 'q=medium&cull=1');
  await page.waitForFunction(() => document.body.classList.contains('loaded'), null, { timeout: 240000 });
  const res = await page.evaluate((poses) => {
    const w = window.__walker, r = window.__three.renderer, gl = r.getContext(), cull = window.__cull();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const a = new Uint8Array(W * H * 4), b = new Uint8Array(W * H * 4);
    let seed = +(new URLSearchParams(location.search).get('seed') || 12345); const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const out = []; let tries = 0;
    const calls = (fn) => { r.info.autoReset = false; r.info.reset(); fn(); const c = r.info.render.calls; r.info.autoReset = true; return c; };
    while (out.length < poses && tries++ < 4000) {
      const x = rnd() * 39, y = -1 + rnd() * 38;
      if (!window.__roomAt(x, y) || w.blocked(x, y)) continue;
      const yaw = rnd() * 360;
      w.setPose(x, y, yaw);
      cull.showAll();
      let callsAll = calls(() => window.__renderOnce());
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, a);
      cull.update(x, y, true);
      let callsCulled = calls(() => window.__renderOnce());
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b);
      let bad = 0, maxd = 0;
      for (let i = 0; i < a.length; i += 4) { const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); if (d > 12) bad++; if (d > maxd) maxd = d; }
      out.push({ x: +x.toFixed(1), y: +y.toFixed(1), yaw: Math.round(yaw), callsAll, callsCulled, hidden: cull.hiddenCount, badPixels: bad, maxDiff: maxd });
    }
    return out;
  }, poses);
  const worst = res.reduce((m, r) => (r.badPixels > m.badPixels ? r : m), res[0]);
  const avg = (k) => (res.reduce((s, r) => s + r[k], 0) / res.length).toFixed(0);
  console.log(`poses ${res.length}: draw calls ${avg('callsAll')} -> ${avg('callsCulled')} on average, hidden meshes avg ${avg('hidden')}`);
  console.log('worst pose:', JSON.stringify(worst));
  console.log('poses with any visibly different pixel (>12/255):', res.filter((r) => r.badPixels > 0).length, 'of', res.length);
  const bad = res.filter((r) => r.badPixels > 20);
  if (bad.length) console.log('poses with >20 differing pixels:', JSON.stringify(bad.slice(0, 10)));
  process.exitCode = bad.length ? 1 : 0;
} finally {
  await browser.close();
  server?.kill();
}
