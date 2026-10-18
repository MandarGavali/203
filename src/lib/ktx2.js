import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

// One shared KTX2 (Basis Universal) loader: GPU-compressed textures that stay compressed in video memory and are
// transcoded off the main thread. The transcoder files live in public/basis/ (copied by tools/optimize-assets.mjs).
let loader = null;

export function initKTX2(renderer) {
  loader = new KTX2Loader().setTranscoderPath(import.meta.env.BASE_URL + 'basis/').detectSupport(renderer);
  return loader;
}

export const getKTX2 = () => loader;
