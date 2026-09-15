import { defineConfig } from 'vite';
import { copyVoiceDependencies } from './scripts/voice-dependencies';

export default defineConfig({
  plugins: [{ name: 'voice-runtime', closeBundle() { copyVoiceDependencies('.vite/build/node_modules'); } }],
  build: {
    // Keep optional native imports inside the libraries' runtime fallback checks.
    rollupOptions: { external: ['zlib-sync', 'bufferutil', 'utf-8-validate', '@discordjs/voice'] },
  },
});
