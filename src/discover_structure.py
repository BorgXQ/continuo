# discover_structure.py

import numpy as np
from typing import Union

from sklearn.preprocessing import StandardScaler
from sklearn.metrics.pairwise import cosine_similarity


# ---------------------------------------------------------------------
# Feature layout from Stage 3
# ---------------------------------------------------------------------

CHROMA_SLICE = slice(0, 48)
MFCC_SLICE = slice(48, 100)
RMS_SLICE = slice(100, 104)
CENTROID_SLICE = slice(104, 108)
ONSET_SLICE = slice(108, 112)


# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------

def cosine_similarity_01(X: np.ndarray) -> np.ndarray:
    """
    Compute cosine similarity and map it from [-1, 1] to [0, 1].
    """

    similarity = cosine_similarity(X)

    return (similarity + 1.0) / 2.0


def build_context_windows(
    features: np.ndarray,
    context_radius: int,
) -> np.ndarray:
    """
    Build flattened context windows around each valid centre bar.

    For context_radius=2:

        bar i -> [i-2, i-1, i, i+1, i+2]

    Parameters
    ----------
    features : np.ndarray
        Shape:
            (n_bars, feature_dimension)

    context_radius : int
        Number of bars to include on each side of the centre bar.

    Returns
    -------
    np.ndarray
        Shape:
            (
                n_bars - 2 * context_radius,
                feature_dimension * (2 * context_radius + 1)
            )
    """

    context_vectors = []

    for i in range(
        context_radius,
        len(features) - context_radius,
    ):
        start = i - context_radius
        end = i + context_radius + 1

        window = features[start:end]

        context_vectors.append(
            window.flatten()
        )

    return np.asarray(
        context_vectors,
        dtype=np.float32,
    )


# ---------------------------------------------------------------------
# Main Stage 4
# ---------------------------------------------------------------------

def discover_structure(
    bar_features: np.ndarray,
    context_radius: int = 2,
    weights: Union[dict, None] = None
) -> dict:
    """
    Discover structural similarity between different musical locations.

    Input
    -----
    bar_features : np.ndarray
        Stage 3 output.

        Expected shape:
            (n_bars, 112)

        Each row contains:

            48  beat-synchronous chroma features
            52  beat-synchronous MFCC features
             4  RMS features
             4  spectral-centroid features
             4  onset-strength features

    context_radius : int, default=2
        Number of surrounding bars used when describing each musical
        location.

        radius=2 produces a 5-bar window:

            [i-2, i-1, i, i+1, i+2]

    weights : dict or None
        Weights used to combine structural similarity components.

        Default:
            harmony = 0.25
            timbre  = 0.25
            energy  = 0.25
            rhythm  = 0.25

    Returns
    -------
    dict
        Contains:

            "S_structure"
                Combined structural similarity matrix.

            "S_harmony"
                Harmony-only contextual similarity.

            "S_timbre"
                Timbre-only contextual similarity.

            "S_energy"
                Energy-only contextual similarity.

            "S_rhythm"
                Rhythm-only contextual similarity.

            "context_bar_indices"
                Original bar index corresponding to each row/column
                of the similarity matrices.

            "weights"
                Structural weights used.
    """

    bar_features = np.asarray(
        bar_features,
        dtype=np.float32,
    )

    # -------------------------------------------------------------
    # Validation
    # -------------------------------------------------------------

    if bar_features.ndim != 2:
        raise ValueError(
            "bar_features must be a 2D array."
        )

    if bar_features.shape[1] != 112:
        raise ValueError(
            "Expected bar_features.shape[1] == 112, "
            f"got {bar_features.shape[1]}."
        )

    minimum_bars = 2 * context_radius + 1

    if len(bar_features) < minimum_bars:
        raise ValueError(
            f"At least {minimum_bars} bars are required for "
            f"context_radius={context_radius}."
        )

    # -------------------------------------------------------------
    # Default structural weights
    # -------------------------------------------------------------

    if weights is None:
        weights = {
            "harmony": 0.25,
            "timbre": 0.25,
            "energy": 0.25,
            "rhythm": 0.25,
        }

    required_weights = {
        "harmony",
        "timbre",
        "energy",
        "rhythm",
    }

    if set(weights.keys()) != required_weights:
        raise ValueError(
            "weights must contain exactly: "
            "'harmony', 'timbre', 'energy', 'rhythm'."
        )

    weight_sum = sum(weights.values())

    if not np.isclose(weight_sum, 1.0):
        raise ValueError(
            f"Structural weights must sum to 1.0, got {weight_sum:.6f}."
        )

    # -------------------------------------------------------------
    # Split Stage-3 representation into feature families
    # -------------------------------------------------------------

    chroma = bar_features[:, CHROMA_SLICE]

    mfcc = bar_features[:, MFCC_SLICE]

    rms = bar_features[:, RMS_SLICE]

    centroid = bar_features[:, CENTROID_SLICE]

    onset = bar_features[:, ONSET_SLICE]

    # -------------------------------------------------------------
    # Normalize each family independently
    # -------------------------------------------------------------

    chroma_norm = StandardScaler().fit_transform(
        chroma
    )

    mfcc_norm = StandardScaler().fit_transform(
        mfcc
    )

    rms_norm = StandardScaler().fit_transform(
        rms
    )

    centroid_norm = StandardScaler().fit_transform(
        centroid
    )

    onset_norm = StandardScaler().fit_transform(
        onset
    )

    # -------------------------------------------------------------
    # Build contextual representations
    # -------------------------------------------------------------

    context_chroma = build_context_windows(
        chroma_norm,
        context_radius,
    )

    context_mfcc = build_context_windows(
        mfcc_norm,
        context_radius,
    )

    context_rms = build_context_windows(
        rms_norm,
        context_radius,
    )

    context_centroid = build_context_windows(
        centroid_norm,
        context_radius,
    )

    context_onset = build_context_windows(
        onset_norm,
        context_radius,
    )

    # -------------------------------------------------------------
    # Context-bar mapping
    #
    # Example:
    #
    #     context_radius = 2
    #
    #     matrix row 0 -> original bar 2
    #     matrix row 1 -> original bar 3
    #     ...
    # -------------------------------------------------------------

    context_bar_indices = np.arange(
        context_radius,
        len(bar_features) - context_radius,
    )

    # -------------------------------------------------------------
    # Structural similarity components
    # -------------------------------------------------------------

    S_harmony = cosine_similarity_01(
        context_chroma
    )

    context_timbre = np.hstack([
        context_mfcc,
        context_centroid,
    ])

    S_timbre = cosine_similarity_01(
        context_timbre
    )

    S_energy = cosine_similarity_01(
        context_rms
    )

    S_rhythm = cosine_similarity_01(
        context_onset
    )

    # -------------------------------------------------------------
    # Combined structural similarity
    # -------------------------------------------------------------

    S_structure = (
        weights["harmony"] * S_harmony
        + weights["timbre"] * S_timbre
        + weights["energy"] * S_energy
        + weights["rhythm"] * S_rhythm
    )

    S_structure = S_structure.astype(
        np.float32
    )

    # -------------------------------------------------------------
    # Output
    # -------------------------------------------------------------

    return {
        "S_structure": S_structure,

        "S_harmony": S_harmony.astype(
            np.float32
        ),

        "S_timbre": S_timbre.astype(
            np.float32
        ),

        "S_energy": S_energy.astype(
            np.float32
        ),

        "S_rhythm": S_rhythm.astype(
            np.float32
        ),

        "context_bar_indices": context_bar_indices,

        "weights": weights,
    }
