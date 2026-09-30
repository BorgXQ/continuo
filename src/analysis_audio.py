"""Bounded, validated desktop decoding without external decoder fallbacks."""

import math

import numpy as np
import soundfile as sf


class AudioDecodeError(ValueError):
    pass


def decode_analysis_audio(path, expected_duration):
    if not math.isfinite(expected_duration) or not 0 < expected_duration <= 600:
        raise ValueError("Analysis requires a duration of 10 minutes or less.")
    # Container duration can include a small amount of codec padding.
    tolerance = 0.1
    try:
        with sf.SoundFile(path) as file:
            sr = file.samplerate
            if sr <= 0 or not 1 <= file.channels <= 32:
                raise AudioDecodeError("Invalid audio stream metadata.")
            if abs(file.frames / sr - expected_duration) > tolerance:
                raise AudioDecodeError("Decoded duration does not match playback metadata.")
            chunks = []
            frames = 0
            for block in file.blocks(blocksize=65536, dtype="float32", always_2d=True):
                frames += len(block)
                if frames / sr > expected_duration + tolerance or not np.isfinite(block).all():
                    raise AudioDecodeError("Invalid or excessive decoded audio.")
                chunks.append(block.mean(axis=1))
            if not frames or frames != file.frames or abs(frames / sr - expected_duration) > tolerance:
                raise AudioDecodeError("Audio decoding returned an incomplete track.")
        return np.concatenate(chunks), sr
    except (OSError, RuntimeError, ValueError) as error:
        raise AudioDecodeError(str(error)) from error
