from pathlib import Path
from typing import Union

import librosa


def load_audio(
    path: Union[str, Path],
    target_sr: int = 44_100,
):
    """Return playback audio, an independent mono analysis array, and sample rate."""
    path = Path(path)

    if not path.exists():
        raise FileNotFoundError(path)

    playback_audio, sr = librosa.load(path, sr=target_sr, mono=False)

    if playback_audio.ndim == 2:
        analysis_audio = librosa.to_mono(playback_audio)
    else:
        analysis_audio = playback_audio.copy()

    return playback_audio, analysis_audio, sr
