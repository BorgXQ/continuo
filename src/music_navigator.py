from collections import deque
from typing import Any, Optional

import numpy as np


class MusicNavigator:
    """Choose graph edges that allow playback to continue indefinitely."""

    def __init__(
        self,
        graph: dict[int, list[dict[str, Any]]],
        natural_weight: float = 4.0,
        transition_weight: float = 1.0,
        structure_power: float = 2.0,
        history_size: int = 32,
        recency_strength: float = 0.85,
        recency_decay: float = 8.0,
        seed: Optional[int] = None,
    ):
        self.graph = graph
        self.natural_weight = float(natural_weight)
        self.transition_weight = float(transition_weight)
        self.structure_power = float(structure_power)
        self.history_size = int(history_size)
        self.recency_strength = float(recency_strength)
        self.recency_decay = float(recency_decay)
        self.rng = np.random.default_rng(seed)

        self._validate_parameters()
        self._validate_graph()
        self.safe_nodes = self._find_safe_nodes()

        if not self.safe_nodes:
            raise ValueError("The music graph contains no non-terminating region.")

        self.history = deque(maxlen=self.history_size)

    def _validate_parameters(self) -> None:
        if self.natural_weight <= 0:
            raise ValueError("natural_weight must be > 0.")

        if self.transition_weight <= 0:
            raise ValueError("transition_weight must be > 0.")

        if self.structure_power < 0:
            raise ValueError("structure_power must be >= 0.")

        if self.history_size < 1:
            raise ValueError("history_size must be >= 1.")

        if not 0 <= self.recency_strength < 1:
            raise ValueError("recency_strength must satisfy 0 <= recency_strength < 1.")

        if self.recency_decay <= 0:
            raise ValueError("recency_decay must be > 0.")

    def _validate_graph(self) -> None:
        if not isinstance(self.graph, dict):
            raise TypeError("graph must be a dictionary.")

        if not self.graph:
            raise ValueError("graph cannot be empty.")

        graph_nodes = set(self.graph)
        for source_bar, edges in self.graph.items():
            if not isinstance(source_bar, int):
                raise TypeError("Graph node indices must be integers.")

            if not isinstance(edges, list):
                raise TypeError(f"graph[{source_bar}] must be a list.")

            for edge in edges:
                if "target_bar" not in edge:
                    raise KeyError(f"Edge from bar {source_bar} is missing 'target_bar'.")

                if "type" not in edge:
                    raise KeyError(f"Edge from bar {source_bar} is missing 'type'.")

                target_bar = edge["target_bar"]
                if target_bar not in graph_nodes:
                    raise ValueError(
                        f"Edge {source_bar} -> {target_bar} "
                        "points to a node not present in graph."
                    )

                if edge["type"] not in {"natural", "transition"}:
                    raise ValueError(f"Unknown edge type {edge['type']!r}.")

    def _find_safe_nodes(self) -> set[int]:
        """Remove dead ends repeatedly, retaining cycles and paths into them."""
        safe = set(self.graph)
        while True:
            unsafe = {
                node for node in safe
                if not any(edge["target_bar"] in safe for edge in self.graph[node])
            }
            if not unsafe:
                return safe
            safe.difference_update(unsafe)

    def _recency_multiplier(self, target_bar: int) -> float:
        """Return a penalty multiplier based on the most recent visit."""
        for distance, bar in enumerate(reversed(self.history)):
            if bar == target_bar:
                penalty = self.recency_strength * np.exp(-distance / self.recency_decay)
                return float(1.0 - penalty)
        return 1.0

    def _base_edge_weight(self, edge: dict[str, Any]) -> float:
        """Compute an edge weight before recency penalties."""
        edge_type = edge["type"]
        if edge_type == "natural":
            return self.natural_weight

        if edge_type == "transition":
            structure_similarity = np.clip(
                float(edge.get("structure_similarity", 1.0)), 0.0, 1.0
            )
            return float(
                self.transition_weight * structure_similarity ** self.structure_power
            )

        raise ValueError(f"Unsupported edge type: {edge_type}")

    def _edge_weight(self, edge: dict[str, Any]) -> float:
        """Combine the base weight and recency multiplier."""
        base_weight = self._base_edge_weight(edge)
        target_bar = int(edge["target_bar"])
        return float(base_weight * self._recency_multiplier(target_bar))

    def get_safe_edges(self, current_bar: int) -> list[dict[str, Any]]:
        """Return outgoing edges whose destinations allow indefinite traversal."""
        if current_bar not in self.graph:
            raise KeyError(f"Bar {current_bar} is not in the graph.")

        if current_bar not in self.safe_nodes:
            raise RuntimeError(
                f"Bar {current_bar} is outside the non-terminating region."
            )

        return [
            edge for edge in self.graph[current_bar]
            if edge["target_bar"] in self.safe_nodes
        ]

    def get_probabilities(self, current_bar: int) -> list[dict[str, Any]]:
        """Attach selection probabilities to safe edges in graph order."""
        edges = self.get_safe_edges(current_bar)
        if not edges:
            raise RuntimeError(f"Bar {current_bar} has no safe outgoing edges.")

        has_natural = any(edge["type"] == "natural" for edge in edges)
        n_transitions = sum(edge["type"] == "transition" for edge in edges)

        if len(edges) == 1:
            probabilities = [1.0]
        elif has_natural and n_transitions:
            alt_probability = 0.05 / n_transitions
            probabilities = [
                0.95 if edge["type"] == "natural" else alt_probability
                for edge in edges
            ]
        else:
            probabilities = [1.0 / len(edges)] * len(edges)

        return [
            {**edge, "probability": float(probability)}
            for edge, probability in zip(edges, probabilities)
        ]

    def choose_next(self, current_bar: int) -> int:
        """Sample the next safe bar and record the traversal in history."""
        candidates = self.get_probabilities(current_bar)
        targets = np.asarray(
            [candidate["target_bar"] for candidate in candidates], dtype=int
        )
        probabilities = np.asarray(
            [candidate["probability"] for candidate in candidates], dtype=np.float64
        )
        next_bar = int(self.rng.choice(targets, p=probabilities))

        if not self.history or self.history[-1] != current_bar:
            self.history.append(current_bar)
        self.history.append(next_bar)
        return next_bar

    def reset(self, seed: Optional[int] = None) -> None:
        """Clear history and optionally reseed the random generator."""
        self.history.clear()
        if seed is not None:
            self.rng = np.random.default_rng(seed)

    def is_safe(self, bar: int) -> bool:
        """Return whether a bar allows indefinite traversal."""
        return bar in self.safe_nodes
