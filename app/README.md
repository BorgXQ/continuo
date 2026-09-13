# Desktop App

Electron + React + TypeScript, built with electron-vite. Desktop code lives
here; the Python analysis pipeline remains in `src/` and is not connected yet.

Use Node.js 24 (`nvm use` when using nvm), then:

```sh
npm ci
npm run dev
```

`npm run dev` opens Electron with React hot reload. `npm run typecheck`
checks both main-process and renderer code. `npm run build` checks types
and writes the production app to `out/`; `npm start` opens that build.
These commands do not create distributable installers yet.

The install step downloads Electron's platform-specific runtime. Python
3.9.25 and its virtual environment are independent of this tooling.

The renderer has no Node access or preload bridge. electron-vite's missing
preload warning is expected until an application API is needed.

## Soundboard

The renderer supports local MP3 import, concurrent speaker playback,
frequency spectra, per-track gain (0-150%), one-time playback, and normal
looping through Web Audio. Tiles can be renamed, swapped across pages,
deleted, and assigned single-key shortcuts while the app has focus.

The library is session-only: closing or reloading the app clears imported
tracks and settings. Original MP3s are not modified or copied into storage.
Analysis and procedural looping remain unavailable until the Python backend
is connected. No database or Discord integration is included.
