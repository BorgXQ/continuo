import unittest
from unittest.mock import MagicMock, patch
import sys
from types import SimpleNamespace

import numpy as np

from src.analyze_timing import _timing_from_beats, analyze_timing


class TimingTests(unittest.TestCase):
    def test_four_beat_bars_and_tempo(self):
        result = _timing_from_beats(np.arange(13) * 0.5, [0, 2, 4, 6])
        self.assertEqual(result["tempo_bpm"], 120)
        self.assertEqual(result["bars"], [(0, 2), (2, 4), (4, 6)])
        np.testing.assert_array_equal(result["beats"][:, 1], [1, 2, 3, 4] * 3 + [1])

    def test_irregular_bars_are_not_silently_truncated(self):
        with self.assertRaisesRegex(ValueError, "inconsistent"):
            _timing_from_beats(np.arange(18), [1, 5, 8, 12, 16])

    def test_invalid_predictions(self):
        for beats, downbeats in [([], []), ([0, 1], [0]),
                                  ([0, 1, 1, 2], [0, 2]),
                                  ([0, np.nan, 2], [0, 2]),
                                  ([0, 1, 2], [0, 3]),
                                  ([0, 1, 2], [0, 1.5]),
                                  ([0, 1, 2, 3], [0, 3])]:
            with self.subTest(beats=beats), self.assertRaises(ValueError):
                _timing_from_beats(beats, downbeats)

    def test_unsupported_meter(self):
        with self.assertRaisesRegex(ValueError, "four-beat"):
            analyze_timing("unused.mp3", beats_per_bar=(3,))

    def test_cpu_inference_with_four_beat_dbn(self):
        tracker = MagicMock(return_value=(np.arange(9) / 2, np.array([0, 2, 4])))
        factory = MagicMock(return_value=tracker)
        dbn = MagicMock()
        audio = np.zeros(100)
        decoder = MagicMock(return_value=(audio, 22050))
        with patch.dict(sys.modules, {
            "beat_this.inference": SimpleNamespace(Audio2Beats=factory),
            "madmom.features.downbeats": SimpleNamespace(DBNDownBeatTrackingProcessor=dbn),
            "librosa": SimpleNamespace(load=decoder),
        }):
            result = analyze_timing("track.mp3", checkpoint_path="local.ckpt")
        factory.assert_called_once_with(checkpoint_path="local.ckpt", device="cpu", dbn=True)
        dbn.assert_called_once_with(beats_per_bar=[4], fps=50, min_bpm=55.0, max_bpm=215.0, transition_lambda=100)
        self.assertIs(tracker.frames2beats.dbn, dbn.return_value)
        decoder.assert_called_once_with("track.mp3", sr=22050, mono=True)
        tracker.assert_called_once_with(audio, 22050)
        self.assertEqual(len(result["bars"]), 2)

    def test_missing_bundled_checkpoint_never_downloads(self):
        with patch.dict(sys.modules, {
            "beat_this.inference": SimpleNamespace(Audio2Beats=MagicMock()),
            "madmom.features.downbeats": SimpleNamespace(DBNDownBeatTrackingProcessor=MagicMock()),
            "librosa": SimpleNamespace(),
        }), patch.object(sys, "frozen", True, create=True), patch.object(sys, "_MEIPASS", "/nonexistent-continuo-test", create=True):
            with self.assertRaisesRegex(FileNotFoundError, "checkpoint"):
                analyze_timing("track.mp3")


if __name__ == "__main__":
    unittest.main()
