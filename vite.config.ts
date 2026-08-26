import { defineConfig } from 'vitest/config';

// A relative base keeps the static build working on Vercel, on GitHub Pages
// (project sub-path) and under `vite preview` without extra configuration.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // Phaser is a single large vendor chunk by design; this keeps the build
    // output quiet rather than hiding a real problem.
    chunkSizeWarningLimit: 1600,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
