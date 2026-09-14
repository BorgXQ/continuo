<p align="center">
  <img src="assets/logo_white.png" alt="" width="80" height="80">
</p>

<h1 align="center">Continuo</h1>

<p align="center">Adaptive background music for tabletop role-playing games.</p>

<p align="center">
  <a href="https://github.com/BorgXQ/continuo/releases">Downloads</a> |
  <a href="CHANGELOG.md">Changelog</a> |
  <a href="docs/windows-release.md">Build for Windows</a>
</p>

Continuo plays local MP3s and finds alternative transitions within each track,
letting your soundtrack continue while you focus on the game.

## Install

The first release targets **Windows x64**. When available, download the Setup
`.exe` from [GitHub Releases](https://github.com/BorgXQ/continuo/releases), run it,
and open Continuo. The Windows installer bundles the analysis backend; users
do not need Python, Node.js, or FFmpeg installed separately.

Audio plays through your system's default output. **Discord output is not
included in v1.0.0.** Linux and macOS installers are not part of this release.

## Start Playing

1. Add local MP3 files to **SOUNDTRACKS**.
2. Click a track to play it. Use its loop icon to change playback mode.
3. For procedural looping, right-click the track and choose **Analyze**.
4. Once analysis finds a safe looping region, select **Procedural Loop**.

| Mode | Playback |
| --- | --- |
| One Time | Plays to the end of the file. |
| Normal Loop | Repeats the whole track. |
| Procedural Loop | Follows analyzed bar transitions to keep the music going. |

Mode changes preserve playback position. Multiple tracks can play together;
**NOW PLAYING** shows the most recently played or selected track first. Expand
the section to access the others, adjust their volume, or stop them.

Drag tiles to rearrange them. Right-click a track to rename it, assign a keyboard
shortcut, analyze it, or remove it from the library. Analysis jobs run one at a
time, queue automatically, and can be cancelled. Existing playback can continue
while a track is analyzed, but busy tiles cannot start playback or change mode.

## Audio Settings

Open the gear above the version number to configure global fade-in and fade-out
in **milliseconds**. Both default to zero and save automatically.

- Fade-in softens the start of playback with an S-curve envelope.
- Fade-out lets audio continue after Stop until it reaches silence, while another track can fade in.
- Press Stop again in NOW PLAYING to end a fade-out immediately.
- Output currently has one option: **Device output**, using the system default.

Fades apply to playback starts and stops, not every procedural jump. Alternative
transitions use their own 10 ms crossfade. One-time playback ends at the file's
end; removing a playing track or quitting the app stops it immediately.

## Your Library

Tracks, tile positions, names, volumes, shortcuts, modes, completed analysis, and
audio settings are saved automatically in a local SQLite database.

**Keep the original MP3s.** Continuo stores metadata, not copies of your audio.
Use **Locate file** in a missing track's menu to reconnect it. Relinking a file,
or detecting a change in its size or modification time, clears its old analysis.

On Windows, the database is at `%APPDATA%/continuo/library.sqlite`. Playback and
unfinished analysis jobs do not resume when you reopen the app.

## How It Works

```mermaid
flowchart LR
    A[Local MP3] --> B[Beats and bars]
    B --> C[Audio features]
    C --> D[Structure similarity]
    D --> E[Candidate transitions]
    E --> F[Music graph]
    F --> G[Probabilistic playback]
    G --> G
```

The Python pipeline in `src/` compares musical context across bars. The desktop
player uses the resulting graph and transition probabilities to choose where
to continue, with short crossfades at alternative transitions.

Analysis currently assumes **4/4 time**. Not every track yields a safe procedural
loop, and similar accompaniment does not guarantee seamless solo or melody
continuation. Tracks without a safe loop remain playable in the other modes.

## Development

The desktop app uses **Electron Forge, React, TypeScript, and Vite**. Analysis
uses **Python 3.9** and the packages in `requirements.txt`.

With Node 24 installed and the Python analysis environment prepared:

```sh
npm ci
npm start
```

Development uses `.venv/bin/python` on Linux/macOS or
`.venv/Scripts/python.exe` on Windows. Set `CONTINUO_PYTHON` to an absolute
interpreter path to override it. Windows development may require Microsoft C++
Build Tools to build madmom, and FFmpeg must be available for decoding.

```sh
npm run typecheck
npm test
```

For backend bundling, installer commands, and the release checklist, see
[Building for Windows](docs/windows-release.md). These instructions are for
developers, not end users.

## Third-Party Assets

The interface uses IBM Plex Mono; its [font license](assets/fonts/ibm-plex-mono/LICENSE.txt)
is included. Third-party code and pretrained models retain their own licenses.
In particular, madmom's models have separate noncommercial terms; see the
[distribution notes](docs/windows-release.md#distribution-notices) before redistributing a build.
