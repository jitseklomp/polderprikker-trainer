import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages under /polderprikker-trainer/ and locally.
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 300 },
});
