import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'app/main/index.ts') },
      },
    },
  },
  renderer: {
    root: 'app/renderer',
    plugins: [
      react(),
      {
        name: 'development-csp',
        apply: 'serve',
        transformIndexHtml: (html) =>
          html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"),
      },
    ],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'app/renderer/index.html'),
      },
    },
  },
});
