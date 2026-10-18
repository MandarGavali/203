// Bakes the phone ("lite") version of the flat: builds the full scene once in a desktop browser, exports it as one
// glTF, then compresses it for phones (GPU textures at phone size, quantized + meshopt-compressed geometry).
// Phones then just download and display public/assets/lite/scene.glb instead of generating ~1,800 meshes and ~90
// painted canvases themselves, which is what ran them out of memory.
//   npm run bake        (after `npm run assets`; re-run whenever a room or the shell changes)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { encodeToKTX2 } from 'ktx2-encoder';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import { dedup, prune, weld, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const OUT = path.join(root, 'public', 'assets', 'lite');
const COLOR_MAX = 1024, DETAIL_MAX = 512; // albedo stays sharper; normal/roughness/AO maps are halved

// ---- 1. build + export in a browser ---------------------------------------------------------------------------------
const port = 5800 + Math.floor(Math.random() * 90);
const server = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(port), '--strictPort', '--logLevel', 'error'], { cwd: root, stdio: 'ignore' });
const url = `http://localhost:${port}/?bake=1&q=low`;
let glb, meta;
try {
  for (let i = 0; i < 60 && !(await fetch(url).then((r) => r.ok).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 500));
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => console.log('page error:', e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
    console.log('building the flat in the browser…');
    await page.goto(url);
    await page.waitForFunction(() => window.__bakeDone === true, null, { timeout: 600000, polling: 500 });
    meta = await page.evaluate(() => window.__bakeResult.meta);
    const size = await page.evaluate(() => window.__bakeResult.glb.length);
    const parts = [];
    for (let i = 0; i < size; i += 4 << 20) {
      parts.push(Buffer.from(await page.evaluate((i) => {
        const b = window.__bakeResult.glb.subarray(i, i + (4 << 20));
        let s = '';
        for (let j = 0; j < b.length; j += 0x8000) s += String.fromCharCode.apply(null, b.subarray(j, j + 0x8000));
        return btoa(s);
      }, i), 'base64'));
    }
    glb = Buffer.concat(parts);
    console.log(`exported ${(glb.length / 1048576).toFixed(1)} MB, ${meta.lights.length} lights, ${meta.colliders.length} colliders`);
  } finally { await browser.close(); }
} finally { server.kill(); }

// ---- 2. compress for phones -----------------------------------------------------------------------------------------
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.readBinary(new Uint8Array(glb));
await doc.transform(dedup(), weld(), prune());

const kinds = new Map();
for (const mt of doc.getRoot().listMaterials()) {
  const set = (t, k) => { if (t && !kinds.has(t)) kinds.set(t, k); };
  set(mt.getBaseColorTexture(), 'color'); set(mt.getEmissiveTexture(), 'color');
  set(mt.getNormalTexture(), 'normal');
  set(mt.getOcclusionTexture(), 'data'); set(mt.getMetallicRoughnessTexture(), 'data');
}
const decoder = async (buf) => {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};
const textures = doc.getRoot().listTextures();
let n = 0;
for (const t of textures) {
  const kind = kinds.get(t) || 'data', cap = kind === 'color' ? COLOR_MAX : DETAIL_MAX;
  const img = sharp(Buffer.from(t.getImage()));
  const { width, height } = await img.metadata();
  const k = Math.min(1, cap / Math.max(width, height));
  const pot = (v) => Math.max(4, 2 ** Math.round(Math.log2(v * k)));
  const png = await img.resize(pot(width), pot(height), { fit: 'fill' }).png().toBuffer();
  // phones: ETC1S (very small) for albedo and roughness/AO; normal maps keep UASTC (ETC1S smears them) with RDO
  const color = kind === 'color', normal = kind === 'normal';
  t.setImage(await encodeToKTX2(new Uint8Array(png), {
    isUASTC: normal, generateMipmap: true, needSupercompression: normal, qualityLevel: normal ? undefined : 160,
    isSetKTX2SRGBTransferFunc: color, isPerceptual: color, isNormalMap: normal, uastcLDRQualityLevel: 1,
    enableRDO: normal, rdoQualityLevel: 2, imageDecoder: decoder,
  }));
  t.setMimeType('image/ktx2');
  t.setURI('');
  process.stdout.write(`\rtextures ${++n}/${textures.length}`);
}
console.log();
doc.createExtension(KHRTextureBasisu).setRequired(true);
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'scene.glb'), await io.writeBinary(doc));
fs.writeFileSync(path.join(OUT, 'scene.json'), JSON.stringify(meta));
console.log(`wrote public/assets/lite/scene.glb (${(fs.statSync(path.join(OUT, 'scene.glb')).size / 1048576).toFixed(1)} MB) + scene.json`);
