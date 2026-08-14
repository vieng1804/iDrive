import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: true,
    host: true,
    strictPort: false,
    allowedHosts: true
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    assetsInlineLimit: 4096
  },
  preview: {
    port: 4173,
    host: true,
    open: false,
    allowedHosts: true
  }
});
