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
