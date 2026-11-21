import unittest
from unittest.mock import patch

import numpy as np

from src.build_music_graph import build_music_graph
from src.exit_features import FEATURE_NAMES, extract_exits, pair_vector, pareto_mask, weighted_cens_distance
from src.music_navigator import MusicNavigator
from src.pareto_transitions import discover_pareto_transitions, select_transitions


class ParetoTests(unittest.TestCase):
    def test_frontier_matches_brute_force_and_retains_ties(self):
        values = np.random.default_rng(42).integers(0, 4, (100, 10))
        expected = [not any(np.all(other <= row) and np.any(other < row)
                            for other in values) for row in values]
        np.testing.assert_array_equal(pareto_mask(values), expected)
        np.testing.assert_array_equal(pareto_mask([[1, 1], [1, 1], [2, 2]]), [True, True, False])

    def test_limits_are_inclusive_and_cens_participates_in_dominance(self):
        values = np.ones((4, 10))
        values[:, 9] = [0.1, 0.05, 0.100001, 0.01]
        values[0, [0, 3, 6]] = 10
        values[1, [0, 3, 6]] = 10
        values[1, 1] = 2  # Trade-off: better CENS, worse slope, both retained.
        values[3, 0] = 10.00001
        result = select_transitions([(20, 0), (21, 0), (22, 0), (23, 0)], values)
        self.assertEqual([row['source_bar'] for row in result], [20, 21])
        self.assertTrue(all(set(FEATURE_NAMES) <= row.keys() for row in result))
        self.assertEqual(select_transitions([], []), [])

    def test_adaptive_slope_limits_and_rollback(self):
        # Opposing level errors make every row nondominated; only slope caps remove rows.
        scenarios = [
            ([5] * 40, 40, None),
            (list(range(5, 65)), 36, 40),
            ([5] * 9 + [55] * 51, 60, None),  # First cap undershoots: restore no cap.
            ([5] * 9 + [45] * 41 + [55] * 10, 50, 50),
            ([5] * 45 + [55] * 15, 45, 10),  # Minimum cap can still leave >40.
            ([5] * 10 + [55] * 50, 10, 50),
            ([5] * 5, 5, None),  # Do not loosen a small initial frontier.
        ]
        for slopes, expected, cap in scenarios:
            for slope_column in (1, 4, 7):
                with self.subTest(expected=expected, slope_column=slope_column):
                    values = np.ones((len(slopes), 10))
                    values[:, 0] = np.linspace(0, 9, len(slopes))
                    values[:, 3] = 9 - values[:, 0]
                    values[:, 9] = .05
                    values[:, slope_column] = slopes
                    pairs = [(i + 20, 0) for i in range(len(slopes))]
                    result = select_transitions(pairs, values)
                    self.assertEqual(len(result), expected)
                    if cap is not None:
                        self.assertTrue(all(row[FEATURE_NAMES[slope_column]] <= cap for row in result))

    def test_weighted_fit_and_cens_distance(self):
        times = np.arange(60) * 256 / 44100 - 0.4
        first = dict(times=times, db=np.tile(np.sin(times * 70), (6, 1)), cens=np.ones((12, 60)))
        second = {**first, 'db': first['db'] + 4 + 3 * times}
        result = pair_vector(first, second, np.ones((3, 6)) / 6, 44100, 1.5, 9)
        np.testing.assert_allclose(result[:9].reshape(3, 3), [[4, 3, 0]] * 3, atol=1e-10)
        self.assertAlmostEqual(result[9], 0)
        a = np.zeros((12, 2)); a[0] = 1
        b = a.copy(); b[:, 1] = 0; b[1, 1] = 1
        self.assertAlmostEqual(weighted_cens_distance(a, b, [1, 3]), .75)
        self.assertEqual(weighted_cens_distance(a * 0, b * 0, [1, 3]), 0)
        self.assertEqual(weighted_cens_distance(a, b * 0, [1, 3]), 1)

    def test_backward_separation_unavailable_windows_and_progress(self):
        windows = [dict(index=i) for i in range(20)]
        windows[0] = None
        events = []
        with patch('src.pareto_transitions.extract_exits', return_value=(windows, None)), \
                patch('src.pareto_transitions.pair_vector', return_value=np.zeros(10)):
            result = discover_pareto_transitions(None, 44100, {"bars": []}, lambda *args: events.append(args))
        self.assertEqual([(r['source_bar'], r['matched_bar']) for r in result],
                         [(17, 1), (18, 1), (18, 2), (19, 1), (19, 2), (19, 3)])
        self.assertTrue(all(r['target_bar'] < r['source_bar'] for r in result))
        self.assertEqual(events[-1], (93, 'Selecting Pareto transitions'))

    def test_extraction_excludes_too_short_windows_and_invalid_bounds(self):
        windows, weights = extract_exits(np.zeros(44100, dtype=np.float32), 44100, [[0, .1]])
        self.assertEqual(windows, [None])
        np.testing.assert_allclose(weights.sum(axis=1), 1)
        for bars in ([[0, 2]], [[-.1, .5]], [[0, .6], [.5, .9]]):
            with self.assertRaises(ValueError):
                extract_exits(np.zeros(44100), 44100, bars)

    def test_playback_probabilities_and_safe_region_remain_unchanged(self):
        transitions = [dict(source_bar=20, target_bar=2), dict(source_bar=20, target_bar=3),
                       dict(source_bar=25, target_bar=1)]
        navigator = MusicNavigator(build_music_graph(30, transitions))
        self.assertEqual(navigator.safe_nodes, set(range(26)))
        self.assertEqual([e['probability'] for e in navigator.get_probabilities(20)], [.95, .025, .025])
        self.assertEqual(navigator.get_probabilities(25)[0]['probability'], 1)
        self.assertEqual(navigator.get_probabilities(10)[0]['probability'], 1)
        with self.assertRaisesRegex(ValueError, 'no non-terminating region'):
            MusicNavigator(build_music_graph(30, []))


if __name__ == '__main__':
    unittest.main()
