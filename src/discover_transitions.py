# discover_transitions.py

import numpy as np

from sklearn.preprocessing import StandardScaler
from sklearn.metrics.pairwise import cosine_similarity


# ---------------------------------------------------------------------
# Stage-3 feature layout
# ---------------------------------------------------------------------

CHROMA_SLICE = slice(0, 48)
MFCC_SLICE = slice(48, 100)
RMS_SLICE = slice(100, 104)
CENTROID_SLICE = slice(104, 108)
ONSET_SLICE = slice(108, 112)


# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------

def cosine_01(a: np.ndarray, b: np.ndarray) -> float:
    """
    Cosine similarity mapped from [-1, 1] to [0, 1].
    """

    a = np.asarray(a).reshape(1, -1)
    b = np.asarray(b).reshape(1, -1)

    similarity = cosine_similarity(a, b)[0, 0]

    return float(
        (similarity + 1.0) / 2.0
    )


def extract_boundary_features(
    bar_features: np.ndarray,
) -> dict:
    """
    Recover beat-level feature families from the Stage-3
    112-dimensional bar vectors.

    Returns
    -------
    dict
        chroma:
            (n_bars, 4, 12)

        mfcc:
            (n_bars, 4, 13)

        rms:
            (n_bars, 4)

        centroid:
            (n_bars, 4)

        onset:
            (n_bars, 4)
    """

    bar_features = np.asarray(
        bar_features,
        dtype=np.float32,
    )

    if bar_features.ndim != 2:
        raise ValueError(
            "bar_features must be a 2D array."
        )

    if bar_features.shape[1] != 112:
        raise ValueError(
            "Expected bar_features.shape[1] == 112, "
            f"got {bar_features.shape[1]}."
        )

    chroma = bar_features[
        :, CHROMA_SLICE
    ].reshape(-1, 4, 12)

    mfcc = bar_features[
        :, MFCC_SLICE
    ].reshape(-1, 4, 13)

    rms = bar_features[:, RMS_SLICE]

    centroid = bar_features[:, CENTROID_SLICE]

    onset = bar_features[:, ONSET_SLICE]

    return {
        "chroma": chroma,
        "mfcc": mfcc,
        "rms": rms,
        "centroid": centroid,
        "onset": onset,
    }


def normalize_boundary_features(
    boundary_features: dict,
) -> dict:
    """
    Normalize each boundary feature family across the song.

    These normalized features are used only for boundary diagnostics.
    They do not determine whether a transition is accepted.
    """

    n_bars = boundary_features[
        "chroma"
    ].shape[0]

    chroma = StandardScaler().fit_transform(
        boundary_features["chroma"].reshape(
            n_bars,
            -1,
        )
    ).reshape(
        n_bars,
        4,
        12,
    )

    mfcc = StandardScaler().fit_transform(
        boundary_features["mfcc"].reshape(
            n_bars,
            -1,
        )
    ).reshape(
        n_bars,
        4,
        13,
    )

    rms = StandardScaler().fit_transform(
        boundary_features["rms"]
    )

    centroid = StandardScaler().fit_transform(
        boundary_features["centroid"]
    )

    onset = StandardScaler().fit_transform(
        boundary_features["onset"]
    )

    return {
        "chroma": chroma,
        "mfcc": mfcc,
        "rms": rms,
        "centroid": centroid,
        "onset": onset,
    }


def boundary_diagnostics(
    source_bar: int,
    matched_bar: int,
    boundary_features: dict,
) -> dict:
    """
    Compare beat 4 of the proposed source bar with beat 4 of
    the structurally matched bar.

    Why compare source_bar to matched_bar?

    Stage 4 identifies:

        source_bar <-> matched_bar

    Stage 5 proposes:

        source_bar -> matched_bar + 1

    Since matched_bar naturally transitions into matched_bar + 1,
    similarity between the endings of source_bar and matched_bar
    provides a diagnostic estimate of splice compatibility.

    This score is NOT currently used to accept/reject transitions.
    """

    beat_4 = 3

    harmony = cosine_01(
        boundary_features["chroma"][
            source_bar,
            beat_4,
        ],
        boundary_features["chroma"][
            matched_bar,
            beat_4,
        ],
    )

    timbre = cosine_01(
        boundary_features["mfcc"][
            source_bar,
            beat_4,
        ],
        boundary_features["mfcc"][
            matched_bar,
            beat_4,
        ],
    )

    rms_difference = abs(
        boundary_features["rms"][
            source_bar,
            beat_4,
        ]
        - boundary_features["rms"][
            matched_bar,
            beat_4,
        ]
    )

    centroid_difference = abs(
        boundary_features["centroid"][
            source_bar,
            beat_4,
        ]
        - boundary_features["centroid"][
            matched_bar,
            beat_4,
        ]
    )

    onset_difference = abs(
        boundary_features["onset"][
            source_bar,
            beat_4,
        ]
        - boundary_features["onset"][
            matched_bar,
            beat_4,
        ]
    )

    energy = float(
        np.exp(-rms_difference)
    )

    brightness = float(
        np.exp(-centroid_difference)
    )

    rhythm = float(
        np.exp(-onset_difference)
    )

    boundary_score = float(
        np.mean([
            harmony,
            timbre,
            energy,
            brightness,
            rhythm,
        ])
    )

    return {
        "boundary_score": boundary_score,
        "boundary_harmony": harmony,
        "boundary_timbre": timbre,
        "boundary_energy": energy,
        "boundary_brightness": brightness,
        "boundary_rhythm": rhythm,
    }


# ---------------------------------------------------------------------
# Main Stage 5
# ---------------------------------------------------------------------

def discover_transitions(
    bar_features: np.ndarray,
    structure: dict,
    min_structure_similarity: float = 0.80,
    min_jump_distance: int = 16,
) -> list[dict]:
    """
    Discover viable directed transitions between distant musical
    locations.

    Stage 4 identifies structural equivalence:

        bar i <-> bar j

    Stage 5 converts this into the directed jump:

        i -> j + 1

    because if bar i occupies a musical state similar to bar j,
    playback can potentially substitute the continuation after j:

        ... -> i -> j+1 -> j+2 -> ...

    Parameters
    ----------
    bar_features : np.ndarray
        Output from Stage 3.

        Expected shape:
            (n_bars, 112)

    structure : dict
        Output from Stage 4 ``discover_structure()``.

        Must contain:

            "S_structure"
            "context_bar_indices"

    min_structure_similarity : float, default=0.80
        Minimum Stage-4 structural similarity required for an
        alternative transition to be retained.

        This is an empirical prototype threshold, not a universal
        musical constant.

    min_jump_distance : int, default=16
        Minimum distance between structurally matched bars.

        This prevents local continuations and nearby phrase matches
        from being treated as meaningful long-range jumps.

    Returns
    -------
    list[dict]
        Directed transition candidates sorted from highest to lowest
        structural similarity.

        Each item has the form:

        {
            "source_bar": 76,
            "matched_bar": 145,
            "target_bar": 146,

            "structure_similarity": 0.963,

            "boundary_score": 0.919,
            "boundary_harmony": ...,
            "boundary_timbre": ...,
            "boundary_energy": ...,
            "boundary_brightness": ...,
            "boundary_rhythm": ...,
        }

        ``structure_similarity`` is currently the actual ranking
        criterion.

        ``boundary_*`` values are retained only as diagnostics.
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

    if not 0.0 <= min_structure_similarity <= 1.0:
        raise ValueError(
            "min_structure_similarity must be between 0 and 1."
        )

    if min_jump_distance < 1:
        raise ValueError(
            "min_jump_distance must be >= 1."
        )

    if "S_structure" not in structure:
        raise KeyError(
            "structure must contain 'S_structure'."
        )

    if "context_bar_indices" not in structure:
        raise KeyError(
            "structure must contain 'context_bar_indices'."
        )

    S_structure = np.asarray(
        structure["S_structure"],
        dtype=np.float32,
    )

    context_bar_indices = np.asarray(
        structure["context_bar_indices"],
        dtype=int,
    )

    if S_structure.ndim != 2:
        raise ValueError(
            "S_structure must be a 2D matrix."
        )

    if S_structure.shape[0] != S_structure.shape[1]:
        raise ValueError(
            "S_structure must be square."
        )

    if S_structure.shape[0] != len(
        context_bar_indices
    ):
        raise ValueError(
            "S_structure size does not match "
            "context_bar_indices."
        )

    n_bars = len(bar_features)

    # -------------------------------------------------------------
    # Boundary diagnostics
    # -------------------------------------------------------------

    raw_boundary = extract_boundary_features(
        bar_features
    )

    normalized_boundary = (
        normalize_boundary_features(
            raw_boundary
        )
    )

    # -------------------------------------------------------------
    # Generate directed transitions
    # -------------------------------------------------------------

    transitions = []

    n_contexts = len(context_bar_indices)

    for source_context in range(n_contexts):

        source_bar = int(
            context_bar_indices[source_context]
        )

        for matched_context in range(n_contexts):

            if source_context == matched_context:
                continue

            matched_bar = int(
                context_bar_indices[matched_context]
            )

            # -----------------------------------------------------
            # Require a meaningful long-range jump.
            # -----------------------------------------------------

            if (
                abs(source_bar - matched_bar)
                < min_jump_distance
            ):
                continue

            # -----------------------------------------------------
            # Stage-4 structural score
            # -----------------------------------------------------

            structure_similarity = float(
                S_structure[
                    source_context,
                    matched_context,
                ]
            )

            if (
                structure_similarity
                < min_structure_similarity
            ):
                continue

            # -----------------------------------------------------
            # Convert structural match:
            #
            #     source <-> matched
            #
            # into playback transition:
            #
            #     source -> matched + 1
            # -----------------------------------------------------

            target_bar = matched_bar + 1

            if target_bar >= n_bars:
                continue

            # Avoid accidentally reproducing the natural continuation.
            if target_bar == source_bar + 1:
                continue

            # -----------------------------------------------------
            # Diagnostic boundary analysis
            # -----------------------------------------------------

            diagnostics = boundary_diagnostics(
                source_bar=source_bar,
                matched_bar=matched_bar,
                boundary_features=normalized_boundary,
            )

            transitions.append({
                "source_bar": source_bar,
                "matched_bar": matched_bar,
                "target_bar": target_bar,

                "structure_similarity":
                    structure_similarity,

                **diagnostics,
            })

    # -------------------------------------------------------------
    # Ranking
    #
    # Current empirical finding:
    #
    # structural similarity is the useful selection/ranking signal.
    # Boundary similarity remains diagnostic only.
    # -------------------------------------------------------------

    transitions.sort(
        key=lambda transition:
            transition[
                "structure_similarity"
            ],
        reverse=True,
    )

    return transitions
