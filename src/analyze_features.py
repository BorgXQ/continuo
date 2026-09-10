# feature_analysis.py

import numpy as np
import librosa


def analyze_features(
    analysis_audio: np.ndarray,
    sr: int,
    timing: dict,
    hop_length: int = 512,
    n_mfcc: int = 13,
) -> np.ndarray:
    """
    Extract one beat-synchronous feature vector for each complete bar.

    Each 4/4 bar is represented by features extracted independently
    from beats 1, 2, 3, and 4, preserving the internal evolution of
    the music across the bar.

    Feature vector per bar:
        Chroma:             4 × 12
        MFCC:               4 × n_mfcc
        RMS:                4 × 1
        Spectral centroid:  4 × 1
        Onset strength:     4 × 1

    With n_mfcc=13, each bar has 112 features.

    Parameters
    ----------
    analysis_audio : np.ndarray
        Mono audio signal used for analysis.

    sr : int
        Sampling rate of the audio.

    timing : dict
        Output from analyze_timing(). Must contain ``"beats"``,
        where each row is:

            [timestamp_seconds, beat_position_in_bar]

    hop_length : int, default=512
        Hop length used for frame-level feature extraction.

    n_mfcc : int, default=13
        Number of MFCC coefficients.

    Returns
    -------
    np.ndarray
        Feature matrix with shape:

            (n_complete_bars, feature_dimension)

        With the default settings:

            (n_complete_bars, 112)

        Row i is the feature vector z_i for bar i.
    """

    beats = np.asarray(timing["beats"])

    # -------------------------------------------------------------
    # Frame-level features
    # -------------------------------------------------------------

    chroma_frame = librosa.feature.chroma_cqt(
        y=analysis_audio,
        sr=sr,
        hop_length=hop_length,
    )

    rms_frame = librosa.feature.rms(
        y=analysis_audio,
        hop_length=hop_length,
    )

    mfcc_frame = librosa.feature.mfcc(
        y=analysis_audio,
        sr=sr,
        n_mfcc=n_mfcc,
        hop_length=hop_length,
    )

    centroid_frame = librosa.feature.spectral_centroid(
        y=analysis_audio,
        sr=sr,
        hop_length=hop_length,
    )

    onset_frame = librosa.onset.onset_strength(
        y=analysis_audio,
        sr=sr,
        hop_length=hop_length,
    )

    frame_times = librosa.frames_to_time(
        np.arange(chroma_frame.shape[1]),
        sr=sr,
        hop_length=hop_length,
    )

    # -------------------------------------------------------------
    # Beat-level aggregation
    # -------------------------------------------------------------

    beat_features = []

    for i in range(len(beats) - 1):
        start = beats[i, 0]
        end = beats[i + 1, 0]
        beat_position = int(beats[i, 1])

        mask = (
            (frame_times >= start)
            & (frame_times < end)
        )

        if not np.any(mask):
            continue

        beat_features.append({
            "beat_position": beat_position,

            "chroma": np.mean(
                chroma_frame[:, mask],
                axis=1,
            ),

            "mfcc": np.mean(
                mfcc_frame[:, mask],
                axis=1,
            ),

            "rms": float(
                np.mean(rms_frame[:, mask])
            ),

            "spectral_centroid": float(
                np.mean(centroid_frame[:, mask])
            ),

            "onset_strength": float(
                np.mean(onset_frame[mask])
            ),
        })

    # -------------------------------------------------------------
    # Group beats into complete 4/4 bars
    # -------------------------------------------------------------

    bar_vectors = []

    i = 0

    while i <= len(beat_features) - 4:
        group = beat_features[i:i + 4]

        positions = [
            beat["beat_position"]
            for beat in group
        ]

        if positions != [1, 2, 3, 4]:
            i += 1
            continue

        # Preserve beat order within each feature family.
        chroma = np.concatenate([
            beat["chroma"]
            for beat in group
        ])

        mfcc = np.concatenate([
            beat["mfcc"]
            for beat in group
        ])

        rms = np.array([
            beat["rms"]
            for beat in group
        ])

        centroid = np.array([
            beat["spectral_centroid"]
            for beat in group
        ])

        onset = np.array([
            beat["onset_strength"]
            for beat in group
        ])

        feature_vector = np.concatenate([
            chroma,
            mfcc,
            rms,
            centroid,
            onset,
        ])

        bar_vectors.append(feature_vector)

        i += 4

    if not bar_vectors:
        feature_dimension = (
            4 * 12
            + 4 * n_mfcc
            + 4
            + 4
            + 4
        )

        return np.empty(
            (0, feature_dimension),
            dtype=np.float32,
        )

    return np.asarray(
        bar_vectors,
        dtype=np.float32,
    )
