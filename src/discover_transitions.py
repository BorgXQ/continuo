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


def cosine_01(a: np.ndarray, b: np.ndarray) -> float:
    """Map cosine similarity between two vectors to [0, 1]."""
    a = np.asarray(a).reshape(1, -1)
    b = np.asarray(b).reshape(1, -1)
    return float((cosine_similarity(a, b)[0, 0] + 1.0) / 2.0)


def extract_boundary_features(bar_features: np.ndarray) -> dict:
    """Recover chroma (bars, 4, 12), MFCC (bars, 4, 13), and scalar (bars, 4) features."""
    bar_features = np.asarray(bar_features, dtype=np.float32)

    if bar_features.ndim != 2:
        raise ValueError("bar_features must be a 2D array.")

    if bar_features.shape[1] != N_BAR_FEATURES:
        raise ValueError(
            f"Expected bar_features.shape[1] == {N_BAR_FEATURES}, "
            f"got {bar_features.shape[1]}."
        )

    return {
        "chroma": bar_features[:, CHROMA_SLICE].reshape(-1, 4, 12),
        "mfcc": bar_features[:, MFCC_SLICE].reshape(-1, 4, 13),
        "rms": bar_features[:, RMS_SLICE],
        "centroid": bar_features[:, CENTROID_SLICE],
        "onset": bar_features[:, ONSET_SLICE],
    }


def normalize_boundary_features(boundary_features: dict) -> dict:
    """Standardize each boundary feature across the song for diagnostics."""
    n_bars = boundary_features["chroma"].shape[0]
    chroma = StandardScaler().fit_transform(
        boundary_features["chroma"].reshape(n_bars, -1)
    ).reshape(n_bars, 4, 12)
    mfcc = StandardScaler().fit_transform(
        boundary_features["mfcc"].reshape(n_bars, -1)
    ).reshape(n_bars, 4, 13)

    return {
        "chroma": chroma,
        "mfcc": mfcc,
        "rms": StandardScaler().fit_transform(boundary_features["rms"]),
        "centroid": StandardScaler().fit_transform(boundary_features["centroid"]),
        "onset": StandardScaler().fit_transform(boundary_features["onset"]),
    }


def boundary_diagnostics(
    source_bar: int,
    matched_bar: int,
    boundary_features: dict,
) -> dict:
    """Compare the last beats of source and matched bars for splice compatibility."""
    beat_4 = 3
    harmony = cosine_01(
        boundary_features["chroma"][source_bar, beat_4],
        boundary_features["chroma"][matched_bar, beat_4],
    )
    timbre = cosine_01(
        boundary_features["mfcc"][source_bar, beat_4],
        boundary_features["mfcc"][matched_bar, beat_4],
    )

    rms_difference = abs(
        boundary_features["rms"][source_bar, beat_4]
        - boundary_features["rms"][matched_bar, beat_4]
    )
    centroid_difference = abs(
        boundary_features["centroid"][source_bar, beat_4]
        - boundary_features["centroid"][matched_bar, beat_4]
    )
    onset_difference = abs(
        boundary_features["onset"][source_bar, beat_4]
        - boundary_features["onset"][matched_bar, beat_4]
    )

    energy = float(np.exp(-rms_difference))
    brightness = float(np.exp(-centroid_difference))
    rhythm = float(np.exp(-onset_difference))
    boundary_score = float(np.mean([harmony, timbre, energy, brightness, rhythm]))

    return {
        "boundary_score": boundary_score,
        "boundary_harmony": harmony,
        "boundary_timbre": timbre,
        "boundary_energy": energy,
        "boundary_brightness": brightness,
        "boundary_rhythm": rhythm,
    }


def discover_transitions(
    bar_features: np.ndarray,
    structure: dict,
    min_structure_similarity: float = 0.80,
    min_jump_distance: int = 16,
) -> list[dict]:
    """
    Turn structural matches i <-> j into alternative transitions i -> j + 1.

    Return transitions sorted by descending structural similarity, with
    source_bar, matched_bar, target_bar, structure_similarity, and boundary
    diagnostics. Boundary scores do not filter or rank candidates.
    """
    bar_features = np.asarray(bar_features, dtype=np.float32)

    if bar_features.ndim != 2:
        raise ValueError("bar_features must be a 2D array.")

    if bar_features.shape[1] != N_BAR_FEATURES:
        raise ValueError(
            f"Expected bar_features.shape[1] == {N_BAR_FEATURES}, "
            f"got {bar_features.shape[1]}."
        )

    if not 0.0 <= min_structure_similarity <= 1.0:
        raise ValueError("min_structure_similarity must be between 0 and 1.")

    if min_jump_distance < 1:
        raise ValueError("min_jump_distance must be >= 1.")

    if "S_structure" not in structure:
        raise KeyError("structure must contain 'S_structure'.")

    if "context_bar_indices" not in structure:
        raise KeyError("structure must contain 'context_bar_indices'.")

    S_structure = np.asarray(structure["S_structure"], dtype=np.float32)
    context_bar_indices = np.asarray(structure["context_bar_indices"], dtype=int)

    if S_structure.ndim != 2:
        raise ValueError("S_structure must be a 2D matrix.")

    if S_structure.shape[0] != S_structure.shape[1]:
        raise ValueError("S_structure must be square.")

    if S_structure.shape[0] != len(context_bar_indices):
        raise ValueError("S_structure size does not match context_bar_indices.")

    n_bars = len(bar_features)
    raw_boundary = extract_boundary_features(bar_features)
    normalized_boundary = normalize_boundary_features(raw_boundary)
    transitions = []
    n_contexts = len(context_bar_indices)

    for source_context in range(n_contexts):
        source_bar = int(context_bar_indices[source_context])

        for matched_context in range(n_contexts):
            if source_context == matched_context:
                continue

            matched_bar = int(context_bar_indices[matched_context])
            if abs(source_bar - matched_bar) < min_jump_distance:
                continue

            structure_similarity = float(S_structure[source_context, matched_context])
            if structure_similarity < min_structure_similarity:
                continue

            target_bar = matched_bar + 1
            if target_bar >= n_bars:
                continue

            if target_bar == source_bar + 1:
                continue

            diagnostics = boundary_diagnostics(
                source_bar=source_bar,
                matched_bar=matched_bar,
                boundary_features=normalized_boundary,
            )
            transitions.append({
                "source_bar": source_bar,
                "matched_bar": matched_bar,
                "target_bar": target_bar,
                "structure_similarity": structure_similarity,
                **diagnostics,
            })

    transitions.sort(
        key=lambda transition: transition["structure_similarity"],
        reverse=True,
    )
    return transitions
