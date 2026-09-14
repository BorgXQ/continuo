from pathlib import Path
import sys

import numpy as np


def _timing_from_beats(beat_times, downbeat_times):
    beat_times = np.asarray(beat_times, dtype=float)
    downbeat_times = np.asarray(downbeat_times, dtype=float)
    for times in (beat_times, downbeat_times):
        if times.ndim != 1 or not np.all(np.isfinite(times)) or np.any(times < 0) or np.any(np.diff(times) <= 0):
            raise ValueError("Beat timestamps must be finite, non-negative and strictly increasing.")
    if len(beat_times) < 2 or len(downbeat_times) < 2:
        raise ValueError("Not enough beats and downbeats to identify complete bars.")

    indices = np.searchsorted(beat_times, downbeat_times)
    if np.any(indices >= len(beat_times)) or not np.allclose(beat_times[indices], downbeat_times, rtol=0, atol=1e-6):
        raise ValueError("Downbeats must coincide with detected beats.")

    if np.any(np.diff(indices) != 4):
        raise ValueError("The four-beat DBN returned inconsistent bar boundaries.")
    selected = beat_times[indices[0]:indices[-1] + 1]
    downbeats = downbeat_times
    return {
        "tempo_bpm": 60.0 / np.median(np.diff(beat_times)),
        "beats": np.column_stack((selected, np.arange(len(selected)) % 4 + 1)),
        "beat_times": beat_times,
        "downbeat_times": downbeats,
        "bars": list(zip(downbeats[:-1], downbeats[1:])),
    }


def analyze_timing(audio_path, beats_per_bar=(4,), *, checkpoint_path=None):
    """Decode Beat This! predictions with a four-beat DBN on CPU."""
    if tuple(beats_per_bar) != (4,):
        raise ValueError("Continuo currently supports four-beat bars only.")
    from beat_this.inference import Audio2Beats
    from madmom.features.downbeats import DBNDownBeatTrackingProcessor
    import librosa

    if checkpoint_path is None:
        if getattr(sys, "frozen", False):
            checkpoint_path = Path(sys._MEIPASS) / "models" / "small0.ckpt"
            if not checkpoint_path.is_file():
                raise FileNotFoundError("Bundled Beat This! checkpoint is missing. Reinstall Continuo.")
        else:
            checkpoint_path = "small0"
    tracker = Audio2Beats(checkpoint_path=str(checkpoint_path), device="cpu", dbn=True)
    tracker.frames2beats.dbn = DBNDownBeatTrackingProcessor(
        beats_per_bar=[4], fps=50, min_bpm=55.0, max_bpm=215.0,
        transition_lambda=100,
    )
    # Use the existing decoder rather than introduce a second MP3 backend.
    audio, sr = librosa.load(audio_path, sr=22050, mono=True)
    beats, downbeats = tracker(audio, sr)
    return _timing_from_beats(beats, downbeats)
