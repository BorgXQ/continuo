"""Bounded ten-feature Pareto search over backward bar transitions."""

import numpy as np
from threadpoolctl import threadpool_limits

from .exit_features import FEATURE_NAMES, extract_exits, pair_vector, pareto_mask


def select_transitions(pairs, values):
    """Apply inclusive level/CENS limits, then the global minimization frontier."""
    pairs = np.asarray(pairs, dtype=int).reshape(-1, 2)
    values = np.asarray(values, dtype=float).reshape(-1, len(FEATURE_NAMES))
    if len(pairs) != len(values):
        raise ValueError("Pairs and feature rows must match.")
    keep = (np.isfinite(values).all(axis=1)
            & (values >= 0).all(axis=1)
            & (values[:, [0, 3, 6]] <= 10.0).all(axis=1)
            & (values[:, 9] <= 0.1))
    pairs, values = pairs[keep], values[keep]
    frontier = pareto_mask(values)
    return [
        {"source_bar": int(source), "matched_bar": int(matched), "target_bar": int(matched + 1),
         **dict(zip(FEATURE_NAMES, map(float, vector)))}
        for (source, matched), vector in zip(pairs[frontier], values[frontier])
    ]


def discover_pareto_transitions(audio, sr, timing, progress=None):
    """Match source j to predecessor k-1, with j-(k-1) >= 16 and k < j."""
    def report(value, stage):
        if progress:
            progress(value, stage)

    with threadpool_limits(limits=1, user_api="blas"):
        windows, band_weights = extract_exits(
            audio, sr, timing["bars"],
            lambda done, total: report(45 + 20 * done / total, "Extracting exit spectra and CENS"),
        )
        total = max(0, len(windows) - 16)
        total = total * (total + 1) // 2
        pairs, values = [], []
        done = 0
        for source in range(16, len(windows)):
            for matched in range(source - 15):
                first, second = windows[source], windows[matched]
                if first is not None and second is not None:
                    vector = pair_vector(first, second, band_weights, sr, 1.5, 9.0)
                    # Keep only bounded candidates before allocating the feature matrix.
                    if (vector is not None and np.isfinite(vector).all()
                            and np.all(vector[[0, 3, 6]] <= 10.0) and vector[9] <= 0.1):
                        pairs.append((source, matched))
                        values.append(vector)
                done += 1
                if done % 100 == 0 or done == total:
                    report(65 + 27 * done / total, "Comparing backward transitions")
        report(93, "Selecting Pareto transitions")
        return select_transitions(pairs, values)
