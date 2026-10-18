// Turns the full-size source assets in assets-src/ into the lean runtime assets in public/assets/.
//   node tools/optimize-assets.mjs [--force] [--jobs 4] [--only <id>[,<id>]]
//
// What it does (only for assets the source code actually references):
//   PBR texture sets   diff/nor/rough/ao.jpg -> diff.ktx2 (ETC1S, 1k; floors 2k), nor.ktx2 (UASTC, 512; floors 1k), orm.ktx2 (AO in R, roughness in G, 512)
//   glTF models        textures -> KTX2 (KHR_texture_basisu), heavy meshes simplified, buffers renamed .bin -> .buf
//   HDR sky            2048x1024 -> 1024x512 RGBE
//   backdrop, plan     resized JPEG / WebP
// KTX2 stays GPU-compressed in video memory (~4-8x smaller than JPEG/PNG decoded to RGBA), which is what keeps
// integrated GPUs and low-RAM machines smooth. Outputs are cached: a job reruns only when its inputs changed.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { encodeToKTX2 } from 'ktx2-encoder';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const SRC = path.join(root, 'assets-src');
const OUT = path.join(root, 'public', 'assets');
const VERSION = 3; // bump to invalidate every cached output

const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };

// ---- per-asset tuning -------------------------------------------------------------------------------------------
const FLOOR_SETS = new Set(['marble_01', 'laminate_floor_02']);   // seen across the whole room: keep a sharp diffuse
// meshes that are far denser than a walkthrough needs: [target ratio of triangles to keep, max error as fraction of size]
const SIMPLIFY = {
  potted_plant_01: [0.07, 0.02], pachira_aquatica_01: [0.14, 0.02], potted_plant_02: [0.14, 0.02],
  book_encyclopedia_set_01: [0.12, 0.01], ceiling_fan: [0.5, 0.005], wooden_bowl_01: [0.4, 0.005],
  ceramic_vase_01: [0.45, 0.003], ceramic_vase_03: [0.45, 0.003], alarm_clock_01: [0.5, 0.005],
  food_pomegranate_01: [0.4, 0.005], potted_plant_04: [0.6, 0.01],
};
// small decor is never seen closer than ~1 m: 512 px maps are plenty
// (normal/roughness/AO maps of every model are 512 px except these two big, close-up pieces)
const DETAIL_1K = new Set(['sofa_02', 'ceiling_fan']);
const SMALL_PROPS = new Set(['book_encyclopedia_set_01', 'wooden_bowl_01', 'ceramic_vase_01', 'ceramic_vase_03', 'alarm_clock_01', 'food_pomegranate_01', 'standing_picture_frame_02', 'throw_pillows_01']);

// ---- helpers -----------------------------------------------------------------------------------------------------
const decoder = async (buf) => {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
};

async function ktx2(pngBuf, { kind, rdo = false }) {
  // kind: color (sRGB, ETC1S: tiny, fine for albedo) | normal (UASTC) | data (UASTC, linear: AO/roughness/metal)
  const color = kind === 'color';
  return encodeToKTX2(new Uint8Array(pngBuf), {
    isUASTC: !color,
    generateMipmap: true,
    needSupercompression: !color,
    isSetKTX2SRGBTransferFunc: color,
    isPerceptual: color,
    isNormalMap: kind === 'normal',
    qualityLevel: color ? 192 : undefined,
    compressionLevel: color ? 3 : undefined,
    uastcLDRQualityLevel: 1,
    enableRDO: !color && rdo,
    rdoQualityLevel: 1.5,
    imageDecoder: decoder,
  });
}

async function resizedPng(input, cap, extra = (s) => s) {
  let s = sharp(input);
  const { width, height } = await s.metadata();
  const k = Math.min(1, cap / Math.max(width, height));
  // power-of-two sizes mip/compress cleanly and avoid NPOT surprises: round to nearest POT <= cap
  const pot = (n) => Math.max(4, 2 ** Math.round(Math.log2(n * k)));
  s = extra(s.resize(pot(width), pot(height), { kernel: 'lanczos3', fit: 'fill' }));
  return s.png().toBuffer();
}

const mtime = (p) => (fs.existsSync(p) ? fs.statSync(p).mtimeMs : 0);
function fresh(outs, ins) {
  if (flag('--force')) return false;
  const o = Math.min(...outs.map(mtime));
  return o > 0 && o > Math.max(...ins.map(mtime), mtime(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')));
}
const kb = (p) => (fs.statSync(p).size / 1024) | 0;

// ---- jobs --------------------------------------------------------------------------------------------------------
async function texJob(id) {
  const dir = path.join(SRC, 'ph', id), out = path.join(OUT, 'ph', id);
  const ins = ['diff.jpg', 'nor.jpg', 'rough.jpg', 'ao.jpg'].map((f) => path.join(dir, f)).filter(fs.existsSync);
  const outs = ['diff.ktx2', 'nor.ktx2', 'orm.ktx2'].map((f) => path.join(out, f));
  if (fresh(outs, ins)) return console.log('fresh  tex', id);
  fs.mkdirSync(out, { recursive: true });
  const floor = FLOOR_SETS.has(id);
  const has = (f) => fs.existsSync(path.join(dir, f));
  if (has('diff.jpg')) fs.writeFileSync(outs[0], await ktx2(await resizedPng(path.join(dir, 'diff.jpg'), floor ? 2048 : 1024), { kind: 'color' }));
  if (has('nor.jpg')) fs.writeFileSync(outs[1], await ktx2(await resizedPng(path.join(dir, 'nor.jpg'), floor ? 1024 : 512), { kind: 'normal', rdo: true }));
  // ORM: R = ambient occlusion (white if the set has none), G = roughness, B = 0 (metalness comes from material params)
  const cap = floor ? 1024 : 512;
  const rough = await sharp(path.join(dir, 'rough.jpg')).resize(cap, cap, { fit: 'fill' }).greyscale().raw().toBuffer();
  const ao = has('ao.jpg')
    ? await sharp(path.join(dir, 'ao.jpg')).resize(cap, cap, { fit: 'fill' }).greyscale().raw().toBuffer()
    : Buffer.alloc(cap * cap, 255);
  const orm = Buffer.alloc(cap * cap * 3);
  for (let i = 0; i < cap * cap; i++) { orm[i * 3] = ao[i]; orm[i * 3 + 1] = rough[i]; orm[i * 3 + 2] = 0; }
  const ormPng = await sharp(orm, { raw: { width: cap, height: cap, channels: 3 } }).png().toBuffer();
  fs.writeFileSync(outs[2], await ktx2(ormPng, { kind: 'data', rdo: true }));
  console.log('done   tex', id, outs.filter(fs.existsSync).map((f) => path.basename(f) + ' ' + kb(f) + 'KB').join(', '));
}

async function modelJob(id) {
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS, KHRTextureBasisu } = await import('@gltf-transform/extensions');
  const { weld, simplify, prune } = await import('@gltf-transform/functions');
  const { MeshoptSimplifier } = await import('meshoptimizer');
  const dir = path.join(SRC, 'ph', id), out = path.join(OUT, 'ph', id);
  const gltfName = fs.readdirSync(dir).find((f) => f.endsWith('.gltf'));
  const ins = [];
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : ins.push(p); } })(dir);
  if (fresh([path.join(out, gltfName)], ins)) return console.log('fresh  model', id);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(path.join(dir, gltfName));
  const before = doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((a, p) => a + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
  if (SIMPLIFY[id]) {
    await MeshoptSimplifier.ready;
    const [ratio, error] = SIMPLIFY[id];
    await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error }), prune());
  }
  const after = doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((a, p) => a + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);

  const kinds = new Map();
  for (const m of doc.getRoot().listMaterials()) {
    const set = (t, k) => { if (t && !kinds.has(t)) kinds.set(t, k); };
    set(m.getBaseColorTexture(), 'color'); set(m.getEmissiveTexture(), 'color');
    set(m.getNormalTexture(), 'normal');
    set(m.getOcclusionTexture(), 'data'); set(m.getMetallicRoughnessTexture(), 'data');
  }
  const colorCap = SMALL_PROPS.has(id) ? 512 : 1024;
  const detailCap = DETAIL_1K.has(id) ? 1024 : 512;
  for (const t of doc.getRoot().listTextures()) {
    const kind = kinds.get(t) || 'data';
    const png = await resizedPng(Buffer.from(t.getImage()), kind === 'color' ? colorCap : detailCap);
    t.setImage(await ktx2(png, { kind, rdo: kind !== 'color' }));
    t.setMimeType('image/ktx2');
    t.setURI('textures/' + path.basename(t.getURI() || t.getName() || 'tex', path.extname(t.getURI() || '')) + '.ktx2');
  }
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  await io.write(path.join(out, gltfName), doc);
  const { fixDir } = await import('./fix_bin.mjs');
  fixDir(out);
  const size = fs.readdirSync(out, { recursive: true }).filter((f) => fs.statSync(path.join(out, f)).isFile()).reduce((n, f) => n + fs.statSync(path.join(out, f)).size, 0);
  console.log('done   model', id, `tris ${before | 0} -> ${after | 0}`, (size / 1024) | 0, 'KB');
}

async function hdrJob(id) {
  const THREE = await import('three');
  const { HDRLoader } = await import('three/addons/loaders/HDRLoader.js');
  const dir = path.join(SRC, 'ph', id), out = path.join(OUT, 'ph', id);
  const file = fs.readdirSync(dir).find((f) => f.endsWith('.hdr'));
  if (fresh([path.join(out, file)], [path.join(dir, file)])) return console.log('fresh  hdr', id);
  fs.mkdirSync(out, { recursive: true });
  const loader = new HDRLoader(); loader.type = THREE.FloatType;
  const src = loader.parse(new Uint8Array(fs.readFileSync(path.join(dir, file))));
  const W = 1024, H = 512, fx = src.width / W, fy = src.height / H;
  const rgbe = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let sy = Math.floor(y * fy); sy < Math.floor((y + 1) * fy); sy++) for (let sx = Math.floor(x * fx); sx < Math.floor((x + 1) * fx); sx++) {
      const i = (sy * src.width + sx) * 4; r += src.data[i]; g += src.data[i + 1]; b += src.data[i + 2]; n++;
    }
    r /= n; g /= n; b /= n;
    const v = Math.max(r, g, b), o = (y * W + x) * 4;
    if (v < 1e-32) continue;
    const e = Math.floor(Math.log2(v)) + 1, s = 256 / 2 ** e;
    rgbe[o] = Math.min(255, r * s); rgbe[o + 1] = Math.min(255, g * s); rgbe[o + 2] = Math.min(255, b * s); rgbe[o + 3] = e + 128;
  }
  // new-style RLE scanlines
  const chunks = [Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${H} +X ${W}\n`, 'latin1')];
  for (let y = 0; y < H; y++) {
    const line = [2, 2, W >> 8, W & 255];
    for (let c = 0; c < 4; c++) {
      const ch = new Uint8Array(W); for (let x = 0; x < W; x++) ch[x] = rgbe[(y * W + x) * 4 + c];
      let x = 0;
      while (x < W) {
        let run = 1; while (x + run < W && ch[x + run] === ch[x] && run < 127) run++;
        if (run >= 4) { line.push(128 + run, ch[x]); x += run; continue; }
        let lit = 0; while (x + lit < W && lit < 128) { let r2 = 1; while (x + lit + r2 < W && ch[x + lit + r2] === ch[x + lit] && r2 < 4) r2++; if (r2 >= 4) break; lit++; }
        lit = Math.max(lit, 1); line.push(lit); for (let k = 0; k < lit; k++) line.push(ch[x + k]); x += lit;
      }
    }
    chunks.push(Buffer.from(line));
  }
  fs.writeFileSync(path.join(out, file), Buffer.concat(chunks));
  console.log('done   hdr', id, kb(path.join(out, file)) + 'KB');
}

async function imageJob() {
  const out = OUT; fs.mkdirSync(path.join(out, 'backdrop'), { recursive: true });
  const bd = path.join(SRC, 'backdrop', 'homecoming_center_rooftop_4k.jpg');
  const jobs = [
    [path.join(out, 'backdrop', 'rooftop_2k.jpg'), () => sharp(bd).resize(2048, 1024, { kernel: 'lanczos3' }).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(out, 'backdrop', 'rooftop_2k.jpg'))],
    [path.join(out, 'backdrop', 'rooftop_4k.jpg'), () => sharp(bd).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(out, 'backdrop', 'rooftop_4k.jpg'))],
    [path.join(out, 'plan.webp'), () => sharp(path.join(SRC, 'plan.png')).resize({ width: 840 }).webp({ quality: 85 }).toFile(path.join(out, 'plan.webp'))],
  ];
  for (const [o, run] of jobs) { if (fresh([o], [bd, path.join(SRC, 'plan.png')])) { console.log('fresh ', path.basename(o)); continue; } await run(); console.log('done  ', path.basename(o), kb(o) + 'KB'); }
  // Basis transcoder for KTX2Loader (served statically; loaded by src/lib/ktx2.js)
  const basisSrc = path.join(root, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'basis');
  fs.mkdirSync(path.join(root, 'public', 'basis'), { recursive: true });
  for (const f of ['basis_transcoder.js', 'basis_transcoder.wasm']) fs.copyFileSync(path.join(basisSrc, f), path.join(root, 'public', 'basis', f));
}

// ---- driver ------------------------------------------------------------------------------------------------------
const job = opt('--job', null);
if (job) {
  const [type, id] = job.split(':');
  await ({ tex: texJob, model: modelJob, hdr: hdrJob, img: imageJob })[type](id);
  process.exit(0);
}

// which source folders does the code reference?
const code = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : p.endsWith('.js') && code.push(fs.readFileSync(p, 'utf8')); } })(path.join(root, 'src'));
const text = code.join('\n');
const only = opt('--only', null)?.split(',');
const jobs = [];
for (const e of fs.readdirSync(path.join(SRC, 'ph'), { withFileTypes: true })) {
  if (!e.isDirectory()) continue;
  if (only && !only.includes(e.name)) continue;
  if (!new RegExp(`['"\`/]${e.name}['"\`/]`).test(text)) continue;
  const files = fs.readdirSync(path.join(SRC, 'ph', e.name));
  if (files.some((f) => f.endsWith('.gltf'))) jobs.push(`model:${e.name}`);
  else if (files.some((f) => f.endsWith('.hdr'))) jobs.push(`hdr:${e.name}`);
  else jobs.push(`tex:${e.name}`);
}
if (!only) jobs.push('img:all');
console.log(`${jobs.length} jobs`);

fs.mkdirSync(OUT, { recursive: true });
const stamp = path.join(OUT, '.opt-version');
const stale = !fs.existsSync(stamp) || +fs.readFileSync(stamp, 'utf8') !== VERSION;
if (stale) fs.writeFileSync(stamp, String(VERSION));
const concurrency = +opt('--jobs', 4);
let next = 0, failed = 0;
async function worker() {
  while (next < jobs.length) {
    const j = jobs[next++];
    await new Promise((resolve) => {
      const c = spawn(process.execPath, [new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), '--job', j, ...(flag('--force') || stale ? ['--force'] : [])], { stdio: 'inherit' });
      c.on('exit', (code) => { if (code) { failed++; console.error('FAILED', j); } resolve(); });
    });
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
if (failed) fs.rmSync(stamp, { force: true }); // next run redoes everything rather than trusting a partial set
console.log(failed ? `${failed} job(s) failed` : 'all assets optimized');
process.exit(failed ? 1 : 0);
