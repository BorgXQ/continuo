import numpy as np
from madmom.features.downbeats import (
    RNNDownBeatProcessor,
    DBNDownBeatTrackingProcessor,
)


def analyze_timing(
    audio_path,
    beats_per_bar=(3, 4),
    fps=100,
):
    """Return tempo, beats, downbeats, complete bars, and model activations."""
    activations = RNNDownBeatProcessor()(str(audio_path))
    tracker = DBNDownBeatTrackingProcessor(
        beats_per_bar=list(beats_per_bar),
        fps=fps,
    )

    beats = tracker(activations)

    beat_times = beats[:, 0]
    downbeat_times = beats[beats[:, 1] == 1, 0]
    bars = list(zip(downbeat_times[:-1], downbeat_times[1:]))
    tempo_bpm = 60.0 / np.median(np.diff(beat_times))

    return {
        "tempo_bpm": tempo_bpm,
        "beats": beats,
        "beat_times": beat_times,
        "downbeat_times": downbeat_times,
        "bars": bars,
        "activations": activations,
    }
