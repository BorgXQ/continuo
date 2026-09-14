# Continuo

## Desktop App

Use Node 24 and run `npm install`, then `npm start` (Electron Forge).
Analysis requires Python 3.9 with the dependencies in `requirements.txt`.
The app uses `.venv/bin/python` (`.venv/Scripts/python.exe` on Windows) when
available. Set `CONTINUO_PYTHON` to an interpreter's absolute path to override it.
Packaged builds include the analysis scripts, but do not bundle Python or its dependencies.

Right-click an imported local MP3 and select **Analyze**. Jobs run one at a time;
additional jobs queue at 0%. Progress reflects completed pipeline stages, not an
elapsed-time estimate. Running and queued jobs can be cancelled from their tiles
or context menus. Busy tiles cannot start playback or change mode; existing
playback continues and can be stopped in NOW PLAYING.

Successful analysis enables **Procedural Loop** in the tile's mode control when
the graph contains a safe looping region. Playback uses the Python navigator's
transition probabilities and 10 ms equal-power crossfades on artificial jumps.
Imported audio is decoded and prepared in memory ahead of playback. All three
modes share the same audio player, so mode changes preserve the current sample
and do not restart the track. A crossfade already underway finishes before a
mode change takes effect. If procedural mode is selected outside the safe graph
region, playback continues naturally until it can enter that region (wrapping
at the end if necessary). Initial playback may wait if import preparation is
still running; replay and mode changes reuse the prepared audio.
Analysis currently assumes 4/4 time, matching the notebook prototype.
Tracks, tile positions, names, volumes, shortcuts, playback modes, and completed
analysis are saved automatically in `library.sqlite` inside Electron's user-data
directory (`~/.config/continuo` on Linux, `%APPDATA%/continuo` on Windows,
`~/Library/Application Support/continuo` on macOS). SQLite stores bar boundaries
and alternative edges; natural edges are reconstructed. No audio is stored.
Original MP3s are required. Missing files remain visible; use **Locate file** in
the track menu to replace their paths. Relinking, or a changed file size or
modification time at startup, clears old analysis so it can be rerun safely.
Playback and queued/running jobs do not resume on startup. Completed results do.

Run `npm run typecheck` and `npm test` to check TypeScript, SQLite storage, and playback.

```txt
data/
└── music.mp3
        │
        ▼
┌─────────────────────────────┐
│ 1. LOAD + STANDARDIZE AUDIO │
└─────────────────────────────┘
        │
        ▼
   mono/stereo waveform
   fixed sample rate
        │
        ▼
┌─────────────────────────────┐
│ 2. MUSICAL TIME ANALYSIS    │
│                             │
│ • tempo / BPM               │
│ • beat positions            │
│ • downbeats / bars          │
└─────────────────────────────┘
        │
        ▼
      musical grid
      ↓
  bar 1, 2, 3, ...
        │
        ▼
┌─────────────────────────────┐
│ 3. AUDIO FEATURE ANALYSIS   │
│                             │
│ • STFT / spectrum           │
│ • chroma                    │
│ • energy                    │
│ • timbre                    │
│ • onset / rhythm            │
└─────────────────────────────┘
        │
        ▼
 feature vector for each bar
        │
        ▼
┌─────────────────────────────┐
│ 4. STRUCTURE DISCOVERY      │
│                             │
│ Compare musical sections    │
│ against one another         │
└─────────────────────────────┘
        │
        ▼
 self-similarity matrix
        │
        ▼
┌─────────────────────────────┐
│ 5. TRANSITION DISCOVERY     │
│                             │
│ Find places where music can │
│ plausibly jump elsewhere    │
└─────────────────────────────┘
        │
        ▼
   transition candidates
        │
        ▼
┌─────────────────────────────┐
│ 6. BUILD MUSIC GRAPH        │
└─────────────────────────────┘

 A ───► B ───► C ───► D
 │      ▲       │      │
 │      │       ▼      │
 └────► C' ◄─── E ◄────┘

        │
        ▼
════════════════════════════════
      REAL-TIME PLAYBACK
════════════════════════════════
        │
        ▼
┌─────────────────────────────┐
│ 7. PLAY CURRENT SECTION     │
└─────────────────────────────┘
        │
        ▼
 approaching transition point?
        │
        ▼
┌─────────────────────────────┐
│ 8. CHOOSE NEXT SECTION      │
│                             │
│ score candidate transitions │
│ using musical constraints   │
└─────────────────────────────┘
        │
        ▼
┌─────────────────────────────┐
│ 9. CROSSFADE / ALIGN        │
└─────────────────────────────┘
        │
        ▼
     next section
        │
        └──────────────────┐
                           │
             repeat indefinitely
                           │
                           ▼
                    User presses STOP
                           │
                           ▼
┌─────────────────────────────┐
│ 10. GRACEFUL FADE-OUT       │
└─────────────────────────────┘
        │
        ▼
       silence
```
