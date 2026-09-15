import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Keep optional native imports inside the libraries' runtime fallback checks.
    rollupOptions: { external: ['zlib-sync', 'bufferutil', 'utf-8-validate'] },
  },
});
