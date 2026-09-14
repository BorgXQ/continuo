# Infiticum

## Desktop App

Use Node 24 and run `npm install`, then `npm start` (Electron Forge).
Analysis requires Python 3.9 with the dependencies in `requirements.txt`.
The app uses `.venv/bin/python` (`.venv/Scripts/python.exe` on Windows) when
available. Set `INFITICUM_PYTHON` to an interpreter's absolute path to override it.
Packaged builds include the analysis scripts, but do not bundle Python or its dependencies.

Right-click an imported local MP3 and select **Analyze**. Jobs run one at a time;
additional jobs queue at 0%. Progress reflects completed pipeline stages, not an
elapsed-time estimate. Running and queued jobs can be cancelled from their tiles
or context menus. Busy tiles cannot start playback or change mode; existing
playback continues and can be stopped in NOW PLAYING.

Successful analysis enables **Procedural Loop** in the tile's mode control when
the graph contains a safe looping region. Playback uses the Python navigator's
transition probabilities and 10 ms equal-power crossfades on artificial jumps.
Analysis currently assumes 4/4 time, matching the notebook prototype.
Tracks, results, and queues exist only in memory and clear when the app closes
or reloads. No graph or audio snippets are saved.

Run `npm run typecheck` and `npm test` to check TypeScript and procedural playback.

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
