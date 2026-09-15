# Changelog

Notable user-facing changes to Continuo are recorded here.

## 1.1.0

### Added

- Discord bot login and voice-channel discovery, grouped by server.
- Discord voice output with the same track mix, volume, fades, and procedural transitions as local playback.
- OS-encrypted bot credential storage and automatic login on startup when secure storage is available.
- Retained, masked token field for reconnecting without retyping during a session.

### Changed

- Soundtrack rows, columns, and page count adapt to available space, including when NOW PLAYING expands.
- Compact pagination keeps navigation visible without overflowing the soundtrack grid.
- New libraries provide 96 soundtrack slots; existing larger libraries remain intact.
- Each launch defaults to Device output; Discord voice channels must be selected manually.
- Selecting Device output or quitting leaves the voice channel. Voice connection failures restore local output.
- Disconnecting the bot disables automatic login, while retaining its token in memory until the app closes.

### Limitations

- Systems without a secure credential store support session-only bot login.
- Analysis assumes 4/4 time and may not find a safe procedural loop for every track.
- Original MP3 files must remain available; the library does not store audio copies.
- Playback and unfinished analysis jobs do not resume after restarting.

## 1.0.0

Initial local-playback release for Windows x64.

### Added

- Local MP3 library with draggable tiles, track renaming, and keyboard shortcuts.
- One-time, normal loop, and procedural loop playback modes.
- Track analysis with queued jobs and cancellation.
- CPU-based Beat This! small0 analysis with four-beat DBN postprocessing.
- Musically informed procedural transitions with configurable equal-power crossfades, defaulting to 100 ms.
- Position-preserving playback mode changes.
- Simultaneous playback with per-track volume from 0 to 150%.
- Expandable NOW PLAYING view ordered by the most recent playback or selection.
- Live logarithmic frequency spectrum that reflects track volume and fades.
- Configurable S-curve fade-in and fade-out durations in milliseconds.
- Automatic SQLite persistence for library metadata, completed analysis, and settings.
- Missing-file relinking and invalidation of outdated analysis.
- Windows installer packaging with a bundled Python 3.11 analysis backend and MIT-licensed Beat This! checkpoint.

### Limitations

- Audio output can only use the system default device.
- Analysis assumes 4/4 time and may not find a safe procedural loop for every track.
- Original MP3 files must remain available; the library does not store audio copies.
- Playback and unfinished analysis jobs do not resume after restarting.
