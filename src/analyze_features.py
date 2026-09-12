import librosa
import numpy as np


def analyze_features(
    analysis_audio: np.ndarray,
    sr: int,
    timing: dict,
    hop_length: int = 512,
    n_mfcc: int = 13,
) -> np.ndarray:
    """Extract beat-synchronous features from mono audio for complete 4/4 bars.

    Return a float32 array of shape (n_complete_bars, 60 + 4 * n_mfcc).
    Each row stores four beats per family, ordered as chroma (48),
    MFCC (4 * n_mfcc), RMS (4), spectral centroid (4), and onset strength
    (4). The default n_mfcc=13 produces 112 features per bar.
    """

    beats = np.asarray(timing["beats"])

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

    beat_features = []

    for i in range(len(beats) - 1):
        start = beats[i, 0]
        end = beats[i + 1, 0]
        beat_position = int(beats[i, 1])

        mask = (frame_times >= start) & (frame_times < end)

        if not np.any(mask):
            continue

        beat_features.append({
            "beat_position": beat_position,

            "chroma": np.mean(chroma_frame[:, mask], axis=1),
            "mfcc": np.mean(mfcc_frame[:, mask], axis=1),
            "rms": float(np.mean(rms_frame[:, mask])),
            "spectral_centroid": float(np.mean(centroid_frame[:, mask])),
            "onset_strength": float(np.mean(onset_frame[mask])),
        })

    bar_vectors = []
    i = 0

    while i <= len(beat_features) - 4:
        group = beat_features[i:i + 4]

        positions = [beat["beat_position"] for beat in group]

        if positions != [1, 2, 3, 4]:
            i += 1
            continue

        # Preserve beat order within each feature family.
        chroma = np.concatenate([beat["chroma"] for beat in group])
        mfcc = np.concatenate([beat["mfcc"] for beat in group])
        rms = np.array([beat["rms"] for beat in group])
        centroid = np.array([beat["spectral_centroid"] for beat in group])
        onset = np.array([beat["onset_strength"] for beat in group])

        bar_vectors.append(np.concatenate([chroma, mfcc, rms, centroid, onset]))

        i += 4

    if not bar_vectors:
        return np.empty((0, 60 + 4 * n_mfcc), dtype=np.float32)

    return np.asarray(bar_vectors, dtype=np.float32)
