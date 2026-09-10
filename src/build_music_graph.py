# build_music_graph.py

from __future__ import annotations

from typing import Any


def build_music_graph(
    n_bars: int,
    transitions: list[dict],
) -> dict[int, list[dict[str, Any]]]:
    """
    Build a directed music graph.

    Nodes
    -----
    Each bar is a node:

        0, 1, 2, ..., n_bars - 1

    Edges
    -----
    Two kinds of directed edges are added:

    1. Natural continuation

        i -> i + 1

    2. Alternative transition discovered in Stage 5

        source_bar -> target_bar

    Parameters
    ----------
    n_bars : int
        Total number of complete bars in the track.

    transitions : list[dict]
        Output from Stage 5 ``discover_transitions()``.

        Each transition is expected to contain at least:

            source_bar
            target_bar
            structure_similarity

        Diagnostic boundary fields are preserved if present.

    Returns
    -------
    dict[int, list[dict]]
        Adjacency-list representation of the music graph.

        Example:

        {
            76: [
                {
                    "target_bar": 77,
                    "type": "natural",
                },
                {
                    "target_bar": 146,
                    "type": "transition",
                    "structure_similarity": 0.963,
                    "boundary_score": 0.919,
                    ...
                },
            ],
            ...
        }
    """

    # -------------------------------------------------------------
    # Validation
    # -------------------------------------------------------------

    if n_bars < 1:
        raise ValueError(
            "n_bars must be at least 1."
        )

    # -------------------------------------------------------------
    # Initialize every bar as a node
    # -------------------------------------------------------------

    graph: dict[int, list[dict[str, Any]]] = {
        bar_index: []
        for bar_index in range(n_bars)
    }

    # -------------------------------------------------------------
    # Add natural continuation edges
    #
    #     0 -> 1
    #     1 -> 2
    #     ...
    # -------------------------------------------------------------

    for source_bar in range(n_bars - 1):

        graph[source_bar].append({
            "target_bar": source_bar + 1,
            "type": "natural",
        })

    # -------------------------------------------------------------
    # Add alternative Stage-5 transitions
    # -------------------------------------------------------------

    for transition in transitions:

        if "source_bar" not in transition:
            raise KeyError(
                "Transition is missing 'source_bar'."
            )

        if "target_bar" not in transition:
            raise KeyError(
                "Transition is missing 'target_bar'."
            )

        source_bar = int(
            transition["source_bar"]
        )

        target_bar = int(
            transition["target_bar"]
        )

        # ---------------------------------------------------------
        # Validate bar indices
        # ---------------------------------------------------------

        if not 0 <= source_bar < n_bars:
            raise ValueError(
                f"Invalid source_bar {source_bar}. "
                f"Expected 0 <= source_bar < {n_bars}."
            )

        if not 0 <= target_bar < n_bars:
            raise ValueError(
                f"Invalid target_bar {target_bar}. "
                f"Expected 0 <= target_bar < {n_bars}."
            )

        # Natural continuation is already present.
        if target_bar == source_bar + 1:
            continue

        # ---------------------------------------------------------
        # Avoid duplicate alternative edges
        # ---------------------------------------------------------

        already_exists = any(
            edge["target_bar"] == target_bar
            and edge["type"] == "transition"
            for edge in graph[source_bar]
        )

        if already_exists:
            continue

        # ---------------------------------------------------------
        # Preserve all useful Stage-5 metadata.
        # ---------------------------------------------------------

        edge = {
            "target_bar": target_bar,
            "type": "transition",
        }

        metadata_fields = [
            "matched_bar",
            "structure_similarity",
            "boundary_score",
            "boundary_harmony",
            "boundary_timbre",
            "boundary_energy",
            "boundary_brightness",
            "boundary_rhythm",
        ]

        for field in metadata_fields:
            if field in transition:
                edge[field] = transition[field]

        graph[source_bar].append(edge)

    # -------------------------------------------------------------
    # Sort each node's outgoing edges
    #
    # Natural continuation always comes first.
    # Alternative transitions are ordered by structural similarity.
    # -------------------------------------------------------------

    for source_bar, edges in graph.items():

        natural_edges = [
            edge
            for edge in edges
            if edge["type"] == "natural"
        ]

        transition_edges = [
            edge
            for edge in edges
            if edge["type"] == "transition"
        ]

        transition_edges.sort(
            key=lambda edge: edge.get(
                "structure_similarity",
                0.0,
            ),
            reverse=True,
        )

        graph[source_bar] = (
            natural_edges
            + transition_edges
        )

    return graph
