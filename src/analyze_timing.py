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
    """
    Analyze musical timing using madmom.

    Returns:
        tempo_bpm
        beats               -> shape (N, 2): [time_sec, beat_position_in_bar]
        beat_times          -> all beat timestamps
        downbeat_times      -> timestamps where beat_position == 1
        bars                -> [(bar_start, bar_end), ...]
    """

    # Step 1: neural network estimates beat/downbeat activations
    activations = RNNDownBeatProcessor()(str(audio_path))

    # Step 2: DBN infers the most likely beat/bar sequence
    tracker = DBNDownBeatTrackingProcessor(
        beats_per_bar=list(beats_per_bar),
        fps=fps,
    )

    beats = tracker(activations)

    # All beat timestamps
    beat_times = beats[:, 0]

    # Downbeats = beat 1 of each bar
    downbeat_times = beats[beats[:, 1] == 1][:, 0]

    # Construct complete bars from consecutive downbeats
    bars = list(zip(
        downbeat_times[:-1],
        downbeat_times[1:]
    ))

    # Derive BPM from the detected beat grid
    beat_intervals = np.diff(beat_times)
    tempo_bpm = 60.0 / np.median(beat_intervals)

    return {
        "tempo_bpm": tempo_bpm,
        "beats": beats,
        "beat_times": beat_times,
        "downbeat_times": downbeat_times,
        "bars": bars,
        "activations": activations,
    }