// Performance probe: loads the app in Chrome, walks around for a few seconds and prints load time, transfer size,
// frame time, draw calls and triangles.
//   npm run build && npm run perf                       # serves dist/ itself
//   node tools/perf.mjs [url] [seconds]                 # any running server, e.g. http://localhost:5199/?q=low&pr=3
// Query flags worth knowing: q=high|medium|low|auto (tier), pr=3 (pixel ratio: stress the GPU), budget=0 (all lights on).
import { chromium } from 'playwright';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
let url = process.argv[2];
const secs = +(process.argv[3] || 8);
let server = null;
if (!url) {
  const port = 5600 + Math.floor(Math.random() * 300);
  server = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(port), '--strictPort', '--logLevel', 'error'], { cwd: root, stdio: 'ignore' });
  url = `http://localhost:${port}/`;
  for (let i = 0; i < 60 && !(await fetch(url).then((r) => r.ok).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [], phases = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (m.text().startsWith('[load]')) phases.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  // bytes on the wire (before decompression), straight from the network stack
  let bytes = 0, requests = 0;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; requests++; });
  const t0 = Date.now();
  await page.goto(url);
  await page.waitForFunction(() => document.body.classList.contains('loaded'), null, { timeout: 240000 });
  const loadMs = Date.now() - t0;
  await page.waitForTimeout(1500);
  const res = await page.evaluate(async (secs) => {
    const w = window.__walker, r = window.__three.renderer;
    w.keys.add('KeyW');
    r.info.autoReset = false;
    const dts = []; let last = performance.now(), n = 0, info = null;
    const end = last + secs * 1000;
    await new Promise((resolve) => {
      const f = (t) => {
        dts.push(t - last); last = t; w.yaw += 0.01;
        if (++n % 120 === 0) w.keys.has('KeyW') ? w.keys.delete('KeyW') : w.keys.add('KeyW');
        if (n === 30) r.info.reset();
        if (n === 32) info = { drawCallsPerFrame: Math.round(r.info.render.calls / 2), trianglesPerFrame: Math.round(r.info.render.triangles / 2) };
        t < end ? requestAnimationFrame(f) : resolve();
      };
      requestAnimationFrame(f);
    });
    w.keys.clear(); r.info.autoReset = true;
    dts.shift(); dts.sort((a, b) => a - b);
    const avg = dts.reduce((a, b) => a + b, 0) / dts.length;
    const q = window.__quality;
    return { tier: q.tier, mode: q.mode, resolutionScale: q.res, gpu: q.gpu, ...info, avgFrameMs: +avg.toFixed(1), fps: +(1000 / avg).toFixed(1), p95FrameMs: +dts[Math.floor(dts.length * 0.95)].toFixed(1), worstFrameMs: +dts[dts.length - 1].toFixed(1), textures: r.info.memory.textures, geometries: r.info.memory.geometries };
  }, secs);
  console.log(phases.join('\n'));
  console.log(JSON.stringify({ url, loadSeconds: +(loadMs / 1000).toFixed(1), transferMB: +(bytes / 1048576).toFixed(1), requests, ...res, errors: errors.slice(0, 5) }, null, 2));
} finally {
  await browser.close();
  server?.kill();
}
