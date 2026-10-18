// Screenshot harness. Uses a dev server on :5199 if one is running, otherwise starts a temporary one for this run.
//   node tools/shot.mjs <view|top:piece|top:all> [more...] [--out dir] [--w 1280 --h 800] [--only piece[,piece]]
// Examples:
//   node tools/shot.mjs bed1-a bed1-b top:bed1 --out shots/bed1/r1
// Writes <out>/<name>.png and prints the paths plus any console errors from the page.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const out = opt('--out', 'shots/tmp');
const W = +opt('--w', 1280), Hh = +opt('--h', 800);
const base = opt('--url', 'http://localhost:5199/');
const only = opt('--only', null); // e.g. --only bed1  -> loads just that piece (much faster)
const extra = opt('--q', ''); // extra query string, e.g. --q "bgrot=90&ao=0"
let baseUrl = base;
fs.mkdirSync(out, { recursive: true });

// No long-running dev server: if nothing answers on :5199, host Vite in-process just for this run.
let server = null;
const up = await fetch(base).then((r) => r.ok).catch(() => false);
if (!up) {
  // child process (an in-process Vite starves while Playwright waits), killed when this run ends
  const { spawn } = await import('node:child_process');
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
  const port = 5200 + Math.floor(Math.random() * 700);
  const child = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(port), '--strictPort', '--logLevel', 'error'], { cwd: root, stdio: 'ignore' });
  server = { close: async () => child.kill() };
  baseUrl = `http://localhost:${port}/`;
  for (let i = 0; i < 120; i++) {
    if (await fetch(baseUrl).then((r) => r.ok).catch(() => false)) break;
    await new Promise((r) => setTimeout(r, 500));
  }
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'],
});
try {
  const queue = args.map((name) => ({ name, tries: 0 }));
  while (queue.length) {
    const job = queue.shift();
    const name = job.name;
    const isTop = name.startsWith('top:');
    let w = W, h = Hh;
    if (isTop) { w = 1000; h = 1000; }
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const q = (isTop ? `?top=${name.slice(4)}` : `?view=${name}`) + (only ? `&only=${only}` : '') + (extra ? `&${extra}` : '');
    await page.goto(baseUrl + q, { waitUntil: 'commit', timeout: 180000 });
    try {
      await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
    } catch (e) {
      console.log('NOT READY for', name, '— page errors:');
      for (const er of errors.slice(0, 30)) console.log('  ', er);
      console.log('   state:', JSON.stringify(await page.evaluate(() => window.__dbg && window.__dbg()).catch(() => 'n/a')));
      throw e;
    }
    const file = path.join(out, name.replace(':', '-') + '.png');
    // under memory pressure headless Chrome occasionally fails shader validation and renders black: retry once
    if (errors.some((e) => e.includes('VALIDATE_STATUS')) && job.tries < 2) {
      console.log('retrying', name, '(shader validation failed)');
      job.tries++;
      queue.push(job);
      await page.close();
      continue;
    }
    await page.screenshot({ path: file });
    console.log('saved', file);
    for (const e of errors.slice(0, 15)) console.log('  ', e);
    await page.close();
  }
} finally {
  await browser.close();
  if (server) await server.close();
}
