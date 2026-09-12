from __future__ import annotations

from typing import Any


def build_music_graph(
    n_bars: int,
    transitions: list[dict],
) -> dict[int, list[dict[str, Any]]]:
    """Build adjacency lists with natural continuation and alternative edges."""
    if n_bars < 1:
        raise ValueError("n_bars must be at least 1.")

    graph: dict[int, list[dict[str, Any]]] = {
        bar_index: [] for bar_index in range(n_bars)
    }
    for source_bar in range(n_bars - 1):
        graph[source_bar].append({
            "target_bar": source_bar + 1,
            "type": "natural",
        })

    metadata_fields = (
        "matched_bar",
        "structure_similarity",
        "boundary_score",
        "boundary_harmony",
        "boundary_timbre",
        "boundary_energy",
        "boundary_brightness",
        "boundary_rhythm",
    )
    seen_transitions = set()

    for transition in transitions:
        if "source_bar" not in transition:
            raise KeyError("Transition is missing 'source_bar'.")

        if "target_bar" not in transition:
            raise KeyError("Transition is missing 'target_bar'.")

        source_bar = int(transition["source_bar"])
        target_bar = int(transition["target_bar"])

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

        if target_bar == source_bar + 1:
            continue

        pair = (source_bar, target_bar)
        if pair in seen_transitions:
            continue
        seen_transitions.add(pair)

        edge = {
            "target_bar": target_bar,
            "type": "transition",
        }
        edge.update({
            field: transition[field]
            for field in metadata_fields
            if field in transition
        })
        graph[source_bar].append(edge)

    for source_bar, edges in graph.items():
        natural_edges = [edge for edge in edges if edge["type"] == "natural"]
        transition_edges = [edge for edge in edges if edge["type"] == "transition"]
        transition_edges.sort(
            key=lambda edge: edge.get("structure_similarity", 0.0),
            reverse=True,
        )
        graph[source_bar] = natural_edges + transition_edges

    return graph
