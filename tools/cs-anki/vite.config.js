import { defineConfig } from 'vite';

export default defineConfig({
  // Output to dist/ — nginx points at this directory
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
