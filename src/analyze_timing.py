import librosa
import numpy as np


def analyze_timing(
    analysis_audio,
    sr,
    hop_length=512,
):
    onset_env = librosa.onset.onset_strength(
        y=analysis_audio,
        sr=sr,
        hop_length=hop_length,
    )

    tempo, beat_frames = librosa.beat.beat_track(
        onset_envelope=onset_env,
        sr=sr,
        hop_length=hop_length,
    )

    beat_times = librosa.frames_to_time(
        beat_frames,
        sr=sr,
        hop_length=hop_length,
    )

    tempo = float(np.asarray(tempo).squeeze())

    return {
        "tempo": tempo,
        "beat_frames": beat_frames,
        "beat_times": beat_times,
        "onset_envelope": onset_env,
        "hop_length": hop_length,
    }
