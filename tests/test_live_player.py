import unittest
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np

class CallbackStop(Exception):
    pass


# Import without initializing PortAudio: these tests exercise samples, not devices.
sd = SimpleNamespace(CallbackStop=CallbackStop, OutputStream=None)
with patch.dict('sys.modules', sounddevice=sd):
    from src.live_player import LiveMusicPlayer


class CrossfadeTests(unittest.TestCase):
    def render(self, audio, bars, sequence, blocks, crossfade_ms=10):
        player = LiveMusicPlayer(audio, 1000, bars, crossfade_ms=crossfade_ms)
        with patch.object(sd, 'OutputStream'):
            player.play_sequence(sequence)
            result = []
            for frames in blocks:
                output = np.zeros((frames, player.channels), dtype=np.float32)
                try:
                    player._audio_callback(output, frames, None, None)
                except sd.CallbackStop:
                    pass
                result.append(output)
            player.stop()
        return np.concatenate(result)

    def test_pre_roll_curve_stereo_and_complete_destination(self):
        audio = np.arange(60, dtype=np.float32)
        output = self.render(np.array([audio, -audio]), [(0, .02), (.02, .04), (.04, .06)],
                             [0, 2], [13, 8, 20])
        angle = np.linspace(0, np.pi / 2, 10)
        expected = np.concatenate([audio[:10], audio[10:20] * np.cos(angle) + audio[30:40] * np.sin(angle), audio[40:], [0]])
        np.testing.assert_allclose(output[:, 0], expected, atol=1e-5)
        np.testing.assert_allclose(output[:, 1], -expected, atol=1e-5)

    def test_repeated_jumps_do_not_shorten_bars(self):
        audio = np.zeros(60, dtype=np.float32)
        audio[0] = audio[40] = 1
        output = self.render(audio, [(0, .02), (.02, .04), (.04, .06)],
                             [0, 2, 0, 2, 0], [13, 8, 7, 19, 54], crossfade_ms=100)
        np.testing.assert_array_equal(np.flatnonzero(output[:, 0]), [0, 20, 40, 60, 80])

    def test_short_pre_roll_and_half_bar_cap(self):
        audio = np.arange(1, 44, dtype=np.float32)
        output = self.render(audio, [(.003, .023), (.023, .043)], [1, 0], [21], crossfade_ms=100)
        self.assertAlmostEqual(output[19, 0], 3, places=4)
        self.assertEqual(output[20, 0], 4)
        self.assertAlmostEqual(output[18, 0], (42 + 2) / np.sqrt(2), places=4)
        output = self.render(np.arange(60, dtype=np.float32), [(0, .02), (.02, .04), (.04, .06)], [0, 2], [21], crossfade_ms=100)
        np.testing.assert_array_equal(output[:10, 0], np.arange(10))
        self.assertEqual(output[20, 0], 40)

    def test_natural_and_zero_fade_are_unchanged(self):
        audio = np.arange(60, dtype=np.float32)
        bars = [(0, .02), (.02, .04), (.04, .06)]
        natural = self.render(audio, bars, [0, 1, 2], [61])
        np.testing.assert_array_equal(natural[:, 0], np.r_[audio, 0])
        jump = self.render(audio, bars, [0, 2], [41], crossfade_ms=0)
        np.testing.assert_array_equal(jump[:, 0], np.r_[audio[:20], audio[40:], 0])


if __name__ == '__main__':
    unittest.main()
