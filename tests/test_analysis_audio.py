import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import soundfile as sf

from src.analysis_audio import AudioDecodeError, decode_analysis_audio


class AnalysisAudioTests(unittest.TestCase):
    def test_pcm_and_stereo_downmix(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.wav"
            samples = np.column_stack((np.full(8000, 0.5), np.full(8000, -0.25)))
            sf.write(path, samples, 8000, subtype="FLOAT")
            audio, sr = decode_analysis_audio(path, 1)
            self.assertEqual(sr, 8000)
            np.testing.assert_array_equal(audio, np.full(8000, 0.125))
            with self.assertRaisesRegex(AudioDecodeError, "duration"):
                decode_analysis_audio(path, 2)

    def test_duration_limit_precedes_file_access(self):
        for duration in (0, -1, float("nan"), float("inf"), 600.001):
            with self.assertRaises(ValueError):
                decode_analysis_audio("nonexistent", duration)

    def test_corrupt_input_requests_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "bad.mp3"
            path.write_bytes(b"not audio")
            with self.assertRaises(AudioDecodeError):
                decode_analysis_audio(path, 1)

    def test_partial_and_nonfinite_decodes_are_rejected(self):
        for block in (np.zeros((20, 1)), np.full((100, 1), np.nan)):
            with patch("src.analysis_audio.sf.SoundFile") as factory:
                file = factory.return_value.__enter__.return_value
                file.samplerate, file.channels, file.frames = 100, 1, 100
                file.blocks.return_value = iter([block])
                with self.assertRaises(AudioDecodeError):
                    decode_analysis_audio("unused", 1)


if __name__ == "__main__":
    unittest.main()
