import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    executableName: 'infiticum',
    extraResource: ['assets/fonts/ibm-plex-mono/LICENSE.txt'],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
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
