import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

// One shared KTX2 (Basis Universal) loader: GPU-compressed textures that stay compressed in video memory and are
// transcoded off the main thread. The transcoder files live in public/basis/ (copied by tools/optimize-assets.mjs).
let loader = null;

export function initKTX2(renderer, workers = 4) {
  loader = new KTX2Loader().setTranscoderPath(import.meta.env.BASE_URL + 'basis/').setWorkerLimit(workers).detectSupport(renderer);
  // test hook: ?ktx=etc / ?ktx=astc / ?ktx=raw forces the transcode target phones would get
  const force = new URLSearchParams(location.search).get('ktx');
  if (force) {
    const c = loader.workerConfig;
    for (const k of Object.keys(c)) if (k.endsWith('Supported')) c[k] = false;
    if (force === 'etc') c.etc2Supported = c.etc1Supported = true;
    if (force === 'astc') c.astcSupported = true;
  }
  return loader;
}

export const getKTX2 = () => loader;

// Phones: skip the sharpest mip level(s) of every KTX2 texture - a quarter of the video memory per level dropped.
let mipDrop = 0;
export function setMipDrop(n) { mipDrop = n; }
export function trimMips(t) {
  if (!mipDrop || !t.isCompressedTexture || t.userData.trimmed) return t;
  const n = Math.min(mipDrop, t.mipmaps.length - 1);
  if (n > 0) {
    t.mipmaps = t.mipmaps.slice(n);
    t.image = { width: t.mipmaps[0].width, height: t.mipmaps[0].height };
    t.needsUpdate = true;
  }
  t.userData.trimmed = true;
  return t;
}
