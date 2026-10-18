import { defineConfig } from 'vite';
// Note: glTF buffers use .buf, not .bin — Chrome on this machine never completes requests for .bin URLs (see tools/fix_bin.mjs).
export default defineConfig({ server: { port: 5199, strictPort: true }, preview: { port: 5199 }, base: './' });
