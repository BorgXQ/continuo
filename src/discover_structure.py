from typing import Union

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import StandardScaler


from .feature_layout import (
    CENTROID_SLICE,
    CHROMA_SLICE,
    MFCC_SLICE,
    N_BAR_FEATURES,
    ONSET_SLICE,
    RMS_SLICE,
)


def cosine_similarity_01(X: np.ndarray) -> np.ndarray:
    """Map pairwise cosine similarity from [-1, 1] to [0, 1]."""
    return (cosine_similarity(X) + 1.0) / 2.0


def build_context_windows(
    features: np.ndarray,
    context_radius: int,
) -> np.ndarray:
    """Flatten each complete window of 2 * context_radius + 1 bars."""
    context_vectors = [
        features[i - context_radius:i + context_radius + 1].flatten()
        for i in range(context_radius, len(features) - context_radius)
    ]
    return np.asarray(context_vectors, dtype=np.float32)


def discover_structure(
    bar_features: np.ndarray,
    context_radius: int = 2,
    weights: Union[dict, None] = None,
) -> dict:
    """Compare bar contexts using standardized Stage-3 features (n_bars, 112)."""
    bar_features = np.asarray(bar_features, dtype=np.float32)

    if bar_features.ndim != 2:
        raise ValueError("bar_features must be a 2D array.")

    if bar_features.shape[1] != N_BAR_FEATURES:
        raise ValueError(
            f"Expected bar_features.shape[1] == {N_BAR_FEATURES}, "
            f"got {bar_features.shape[1]}."
        )

    minimum_bars = 2 * context_radius + 1
    if len(bar_features) < minimum_bars:
        raise ValueError(
            f"At least {minimum_bars} bars are required for "
            f"context_radius={context_radius}."
        )

    if weights is None:
        weights = {
            "harmony": 0.25,
            "timbre": 0.25,
            "energy": 0.25,
            "rhythm": 0.25,
        }

    required_weights = {"harmony", "timbre", "energy", "rhythm"}
    if set(weights) != required_weights:
        raise ValueError(
            "weights must contain exactly: "
            "'harmony', 'timbre', 'energy', 'rhythm'."
        )

    weight_sum = sum(weights.values())
    if not np.isclose(weight_sum, 1.0):
        raise ValueError(
            f"Structural weights must sum to 1.0, got {weight_sum:.6f}."
        )

    chroma = bar_features[:, CHROMA_SLICE]
    mfcc = bar_features[:, MFCC_SLICE]
    rms = bar_features[:, RMS_SLICE]
    centroid = bar_features[:, CENTROID_SLICE]
    onset = bar_features[:, ONSET_SLICE]

    chroma_norm = StandardScaler().fit_transform(chroma)
    mfcc_norm = StandardScaler().fit_transform(mfcc)
    rms_norm = StandardScaler().fit_transform(rms)
    centroid_norm = StandardScaler().fit_transform(centroid)
    onset_norm = StandardScaler().fit_transform(onset)

    context_chroma = build_context_windows(chroma_norm, context_radius)
    context_mfcc = build_context_windows(mfcc_norm, context_radius)
    context_rms = build_context_windows(rms_norm, context_radius)
    context_centroid = build_context_windows(centroid_norm, context_radius)
    context_onset = build_context_windows(onset_norm, context_radius)

    context_bar_indices = np.arange(
        context_radius, len(bar_features) - context_radius
    )

    S_harmony = cosine_similarity_01(context_chroma)
    context_timbre = np.hstack([context_mfcc, context_centroid])
    S_timbre = cosine_similarity_01(context_timbre)
    S_energy = cosine_similarity_01(context_rms)
    S_rhythm = cosine_similarity_01(context_onset)

    S_structure = (
        weights["harmony"] * S_harmony
        + weights["timbre"] * S_timbre
        + weights["energy"] * S_energy
        + weights["rhythm"] * S_rhythm
    )

    return {
        "S_structure": S_structure.astype(np.float32),
        "S_harmony": S_harmony.astype(np.float32),
        "S_timbre": S_timbre.astype(np.float32),
        "S_energy": S_energy.astype(np.float32),
        "S_rhythm": S_rhythm.astype(np.float32),
        "context_bar_indices": context_bar_indices,
        "weights": weights,
    }
