import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { existsSync } from 'node:fs';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    executableName: 'continuo',
    ignore: [/^\/(?:\.venv|data|build|dist|tests|scripts)(?:\/|$)/, /\.ipynb$/],
    icon: process.platform === 'win32' ? 'assets/logo_white.ico' : process.platform === 'linux' ? 'assets/logo_white.png' : undefined,
    extraResource: ['assets/fonts/ibm-plex-mono/LICENSE.txt', 'assets/logo_white.png', 'assets/logo_white.ico', 'src', 'requirements.txt',
      ...(process.platform === 'win32' ? ['dist/continuo-analysis'] : [])],
  },
  rebuildConfig: {},
  hooks: {
    prePackage: async (_config, platform) => {
      if (platform === 'win32' && (process.platform !== 'win32' || !existsSync('dist/continuo-analysis/continuo-analysis.exe'))) {
        throw new Error('Build the Windows backend on Windows with npm run build:backend first.');
      }
    },
  },
  makers: [
    new MakerSquirrel({ setupIcon: 'assets/logo_white.ico' }),
    new MakerZIP({}, ['win32', 'darwin', 'linux']),
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'app/main/index.ts', config: 'vite.main.config.ts' },
        { entry: 'app/preload/preload.ts', config: 'vite.preload.config.ts' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
    }),
  ],
};

export default config;
