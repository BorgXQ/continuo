# Infiticum

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