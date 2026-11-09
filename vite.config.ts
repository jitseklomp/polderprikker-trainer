import { defineConfig } from 'vite';

// One id per build. Data URLs carry it (data/x.json?v=...), so after a deploy the new code never
// reads data files the browser cached from the previous version (GitHub Pages caches for 10 min).
const BUILD_ID = process.env.GITHUB_SHA?.slice(0, 8) ?? Date.now().toString(36);

// Relative base so the build works on GitHub Pages under /speldwerk/ and locally.
export default defineConfig({
  base: './',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  build: { target: 'es2020', chunkSizeWarningLimit: 300 },
});
