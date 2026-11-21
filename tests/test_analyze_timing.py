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

    def test_variable_meter_and_partial_lead_in(self):
        result = _timing_from_beats(np.arange(21), [1, 4, 8, 13, 20])
        self.assertEqual(result["bars"], [(1, 4), (4, 8), (8, 13), (13, 20)])
        np.testing.assert_array_equal(result["beats"][:, 1],
                                      [1, 2, 3] + [1, 2, 3, 4] + list(range(1, 6)) + list(range(1, 8)) + [1])

    def test_invalid_predictions(self):
        for beats, downbeats in [([], []), ([0, 1], [0]),
                                  ([0, 1, 1, 2], [0, 2]),
                                  ([0, np.nan, 2], [0, 2]),
                                  ([0, 1, 2], [0, 3]),
                                  ([0, 1, 2], [0, 1.5])]:
            with self.subTest(beats=beats), self.assertRaises(ValueError):
                _timing_from_beats(beats, downbeats)

    def test_cpu_inference_without_dbn(self):
        tracker = MagicMock(return_value=(np.arange(9) / 2, np.array([0, 2, 4])))
        factory = MagicMock(return_value=tracker)
        audio = np.zeros(100)
        decoder = MagicMock(return_value=(audio, 22050))
        with patch.dict(sys.modules, {
            "beat_this.inference": SimpleNamespace(Audio2Beats=factory),
            "librosa": SimpleNamespace(load=decoder),
        }):
            result = analyze_timing("track.mp3", checkpoint_path="local.ckpt")
        factory.assert_called_once_with(checkpoint_path="local.ckpt", device="cpu", dbn=False)
        decoder.assert_called_once_with("track.mp3", sr=22050, mono=True)
        tracker.assert_called_once_with(audio, 22050)
        self.assertEqual(len(result["bars"]), 2)

    def test_missing_bundled_checkpoint_never_downloads(self):
        with patch.dict(sys.modules, {
            "beat_this.inference": SimpleNamespace(Audio2Beats=MagicMock()),
            "librosa": SimpleNamespace(),
        }), patch.object(sys, "frozen", True, create=True), patch.object(sys, "_MEIPASS", "/nonexistent-continuo-test", create=True):
            with self.assertRaisesRegex(FileNotFoundError, "checkpoint"):
                analyze_timing("track.mp3")

    def test_supplied_samples_are_used_without_reopening_source(self):
        tracker = MagicMock(return_value=(np.arange(9) / 2, np.array([0, 2, 4])))
        audio = np.zeros(100)
        resample = MagicMock(return_value=audio)
        decoder = MagicMock(side_effect=AssertionError("Must not reopen original audio"))
        with patch.dict(sys.modules, {
            "beat_this.inference": SimpleNamespace(Audio2Beats=MagicMock(return_value=tracker)),
            "librosa": SimpleNamespace(load=decoder, resample=resample),
        }):
            analyze_timing("unused", audio=audio, sample_rate=44100)
        decoder.assert_not_called()
        resample.assert_called_once_with(audio, orig_sr=44100, target_sr=22050)
        tracker.assert_called_once_with(audio, 22050)


if __name__ == "__main__":
    unittest.main()
