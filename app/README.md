# Desktop App

Electron + React + TypeScript, built with Electron Forge's Vite plugin. Desktop code lives
here; the Python analysis pipeline remains in `src/` and is not connected yet.

Use Node.js 24 (`nvm use` when using nvm), then:

```sh
npm ci
npm start
```

`npm start` (or `npm run dev`) opens Electron with React hot reload.
`npm run typecheck` checks main, preload, renderer, and build configuration.
`npm run build` checks types and packages the production app in `out/`.
`npm run package` packages without type-checking; `npm run make` builds
distributables in `out/make/`: ZIP archives on Windows, macOS, and Linux,
plus a Squirrel installer on Windows. Build each platform on its own OS;
code signing and macOS notarization are not configured yet.
The ZIP maker requires the system `zip` command on Linux/macOS (on Debian
or Ubuntu, install it with `sudo apt-get install zip`).

The install step downloads Electron's platform-specific runtime. Python
3.9.25 and its virtual environment are independent of this tooling.

The renderer has no Node access. The sandboxed preload entry exposes no
APIs yet and is reserved for the future application bridge. Vite output
lives in `.vite/`; packaged applications contain only the built app and
runtime dependencies, not the Python pipeline or local music.

## Soundboard

The renderer supports local MP3 import, concurrent speaker playback,
frequency spectra, per-track gain (0-150%), one-time playback, and normal
looping through Web Audio. Tiles can be renamed, swapped across pages,
deleted, and assigned single-key shortcuts while the app has focus.

The library is session-only: closing or reloading the app clears imported
tracks and settings. Original MP3s are not modified or copied into storage.
Analysis and procedural looping remain unavailable until the Python backend
is connected. No database or Discord integration is included.
