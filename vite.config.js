import { defineConfig } from 'vite';
// Note: glTF buffers use .buf, not .bin — Chrome on this machine never completes requests for .bin URLs (see tools/fix_bin.mjs).
export default defineConfig({
  server: { port: 5199, strictPort: true },
  preview: { port: 5199 },
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // three.js changes rarely: keep it in its own long-cacheable chunk, separate from the room code
        manualChunks(id) {
          if (id.includes('three/examples/jsm/postprocessing') || id.includes('three/examples/jsm/shaders')) return 'post'; // High tier only
          if (id.includes('node_modules/three/')) return 'three';
        },
      },
    },
  },
});
