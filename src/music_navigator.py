# music_navigator.py

from __future__ import annotations

from collections import deque
from typing import Any

import numpy as np


class MusicNavigator:
    """
    Stochastic traversal policy for the directed music graph.

    The navigator does NOT play audio.

    Its only responsibility is:

        current_bar
            -> inspect legal outgoing edges
            -> apply traversal policy
            -> choose next_bar

    Core rules
    ----------
    1. Playback must never enter a state from which termination
       becomes unavoidable.

    2. Natural continuation is generally preferred.

    3. Validated Stage-5 transitions remain possible.

    4. Recently visited bars are temporarily penalized to reduce
       obvious repetition.

    5. If only one safe outgoing edge exists, that edge is mandatory.

    Parameters
    ----------
    graph : dict[int, list[dict]]
        Output from Step 6 ``build_music_graph()``.

    natural_weight : float, default=4.0
        Base weight assigned to natural continuation.

    transition_weight : float, default=1.0
        Base multiplier assigned to alternative transitions.

    structure_power : float, default=2.0
        Controls how strongly Stage-5 structural similarity affects
        alternative transition weights.

        For an alternative edge:

            weight =
                transition_weight
                * structure_similarity ** structure_power

    history_size : int, default=32
        Number of recently visited bars remembered.

    recency_strength : float, default=0.85
        Maximum penalty applied to very recently visited bars.

        Must satisfy:

            0 <= recency_strength < 1

    recency_decay : float, default=8.0
        Controls how quickly the recency penalty fades with distance
        into the playback history.

    seed : int | None
        Optional random seed for reproducible simulations.
    """

    def __init__(
        self,
        graph: dict[int, list[dict[str, Any]]],
        natural_weight: float = 4.0,
        transition_weight: float = 1.0,
        structure_power: float = 2.0,
        history_size: int = 32,
        recency_strength: float = 0.85,
        recency_decay: float = 8.0,
        seed: int | None = None,
    ):
        self.graph = graph

        self.natural_weight = float(
            natural_weight
        )

        self.transition_weight = float(
            transition_weight
        )

        self.structure_power = float(
            structure_power
        )

        self.history_size = int(
            history_size
        )

        self.recency_strength = float(
            recency_strength
        )

        self.recency_decay = float(
            recency_decay
        )

        self.rng = np.random.default_rng(seed)

        self._validate_parameters()
        self._validate_graph()

        # ---------------------------------------------------------
        # Determine which nodes belong to the indefinitely
        # traversable part of the graph.
        # ---------------------------------------------------------

        self.safe_nodes = self._find_safe_nodes()

        if not self.safe_nodes:
            raise ValueError(
                "The music graph contains no non-terminating region."
            )

        self.history = deque(
            maxlen=self.history_size
        )

    # -----------------------------------------------------------------
    # Validation
    # -----------------------------------------------------------------

    def _validate_parameters(self) -> None:

        if self.natural_weight <= 0:
            raise ValueError(
                "natural_weight must be > 0."
            )

        if self.transition_weight <= 0:
            raise ValueError(
                "transition_weight must be > 0."
            )

        if self.structure_power < 0:
            raise ValueError(
                "structure_power must be >= 0."
            )

        if self.history_size < 1:
            raise ValueError(
                "history_size must be >= 1."
            )

        if not 0 <= self.recency_strength < 1:
            raise ValueError(
                "recency_strength must satisfy "
                "0 <= recency_strength < 1."
            )

        if self.recency_decay <= 0:
            raise ValueError(
                "recency_decay must be > 0."
            )

    def _validate_graph(self) -> None:

        if not isinstance(self.graph, dict):
            raise TypeError(
                "graph must be a dictionary."
            )

        if not self.graph:
            raise ValueError(
                "graph cannot be empty."
            )

        graph_nodes = set(self.graph.keys())

        for source_bar, edges in self.graph.items():

            if not isinstance(source_bar, int):
                raise TypeError(
                    "Graph node indices must be integers."
                )

            if not isinstance(edges, list):
                raise TypeError(
                    f"graph[{source_bar}] must be a list."
                )

            for edge in edges:

                if "target_bar" not in edge:
                    raise KeyError(
                        f"Edge from bar {source_bar} "
                        "is missing 'target_bar'."
                    )

                if "type" not in edge:
                    raise KeyError(
                        f"Edge from bar {source_bar} "
                        "is missing 'type'."
                    )

                target_bar = edge["target_bar"]

                if target_bar not in graph_nodes:
                    raise ValueError(
                        f"Edge {source_bar} -> {target_bar} "
                        "points to a node not present in graph."
                    )

                if edge["type"] not in {
                    "natural",
                    "transition",
                }:
                    raise ValueError(
                        f"Unknown edge type "
                        f"{edge['type']!r}."
                    )

    # -----------------------------------------------------------------
    # Safe / non-terminating subgraph
    # -----------------------------------------------------------------

    def _find_safe_nodes(self) -> set[int]:
        """
        Find the greatest set of nodes from which playback can remain
        inside the graph indefinitely.

        A node is removed if it has no outgoing edge to another
        currently-safe node.

        This removal is repeated until convergence.

        Example
        -------

        Suppose:

            156 -> 157
            157 -> 158
            158 -> []

        Then:

            158 is unsafe.
            157 becomes unsafe.
            156 becomes unsafe.

        But if:

            157 -> 158
            157 -> 42

        and bar 42 belongs to a cycle, then 157 can remain safe.
        """

        safe = set(self.graph.keys())

        changed = True

        while changed:

            changed = False

            unsafe_now = []

            for node in safe:

                edges = self.graph[node]

                has_safe_exit = any(
                    edge["target_bar"] in safe
                    for edge in edges
                )

                if not has_safe_exit:
                    unsafe_now.append(node)

            if unsafe_now:

                safe.difference_update(
                    unsafe_now
                )

                changed = True

        return safe

    # -----------------------------------------------------------------
    # Recency
    # -----------------------------------------------------------------

    def _recency_multiplier(
        self,
        target_bar: int,
    ) -> float:
        """
        Return a multiplier in (0, 1].

        Recently visited destinations receive a stronger penalty.

        A destination not present in recent history receives 1.0.
        """

        history = list(self.history)

        if target_bar not in history:
            return 1.0

        # Most recent occurrence.
        reverse_distance = next(
            distance
            for distance, bar in enumerate(
                reversed(history),
                start=0,
            )
            if bar == target_bar
        )

        penalty = (
            self.recency_strength
            * np.exp(
                -reverse_distance
                / self.recency_decay
            )
        )

        return float(
            1.0 - penalty
        )

    # -----------------------------------------------------------------
    # Edge weighting
    # -----------------------------------------------------------------

    def _base_edge_weight(
        self,
        edge: dict[str, Any],
    ) -> float:
        """
        Compute the base traversal weight before recency penalties.
        """

        edge_type = edge["type"]

        if edge_type == "natural":

            return self.natural_weight

        if edge_type == "transition":

            structure_similarity = float(
                edge.get(
                    "structure_similarity",
                    1.0,
                )
            )

            structure_similarity = np.clip(
                structure_similarity,
                0.0,
                1.0,
            )

            return float(
                self.transition_weight
                * (
                    structure_similarity
                    ** self.structure_power
                )
            )

        raise ValueError(
            f"Unsupported edge type: {edge_type}"
        )

    def _edge_weight(
        self,
        edge: dict[str, Any],
    ) -> float:
        """
        Final edge weight after traversal-policy modifiers.
        """

        base_weight = self._base_edge_weight(
            edge
        )

        target_bar = int(
            edge["target_bar"]
        )

        recency_multiplier = (
            self._recency_multiplier(
                target_bar
            )
        )

        return float(
            base_weight
            * recency_multiplier
        )

    # -----------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------

    def get_safe_edges(
        self,
        current_bar: int,
    ) -> list[dict[str, Any]]:
        """
        Return outgoing edges that remain inside the indefinitely
        traversable region.
        """

        if current_bar not in self.graph:
            raise KeyError(
                f"Bar {current_bar} is not in the graph."
            )

        if current_bar not in self.safe_nodes:
            raise RuntimeError(
                f"Bar {current_bar} is outside the "
                "non-terminating region."
            )

        return [
            edge
            for edge in self.graph[current_bar]
            if edge["target_bar"] in self.safe_nodes
        ]

    def get_probabilities(
        self,
        current_bar: int,
    ) -> list[dict[str, Any]]:
        """
        Return the currently available edges and their normalized
        traversal probabilities.

        Useful for diagnostics and simulation.
        """

        edges = self.get_safe_edges(
            current_bar
        )

        if not edges:
            raise RuntimeError(
                f"Bar {current_bar} has no safe outgoing edges."
            )

        weights = np.asarray(
            [
                self._edge_weight(edge)
                for edge in edges
            ],
            dtype=np.float64,
        )

        # ---------------------------------------------------------
        # If recency penalties somehow reduce all weights to zero,
        # fall back to base weights.
        # ---------------------------------------------------------

        if np.sum(weights) <= 0:

            weights = np.asarray(
                [
                    self._base_edge_weight(edge)
                    for edge in edges
                ],
                dtype=np.float64,
            )

        probabilities = (
            weights / np.sum(weights)
        )

        result = []

        for edge, weight, probability in zip(
            edges,
            weights,
            probabilities,
        ):

            result.append({
                **edge,
                "weight": float(weight),
                "probability": float(probability),
            })

        return result

    def choose_next(
        self,
        current_bar: int,
    ) -> int:
        """
        Choose the next bar according to the stochastic traversal
        policy.

        If only one safe edge exists, it is selected with probability
        1.0.

        Returns
        -------
        int
            Selected next bar.
        """

        candidates = self.get_probabilities(
            current_bar
        )

        targets = np.asarray(
            [
                candidate["target_bar"]
                for candidate in candidates
            ],
            dtype=int,
        )

        probabilities = np.asarray(
            [
                candidate["probability"]
                for candidate in candidates
            ],
            dtype=np.float64,
        )

        next_bar = int(
            self.rng.choice(
                targets,
                p=probabilities,
            )
        )

        # Record both where we were and where we are going.
        if (
            not self.history
            or self.history[-1] != current_bar
        ):
            self.history.append(
                current_bar
            )

        self.history.append(
            next_bar
        )

        return next_bar

    def reset(
        self,
        seed: int | None = None,
    ) -> None:
        """
        Clear traversal history.

        Supplying a seed also resets the random generator.
        """

        self.history.clear()

        if seed is not None:
            self.rng = np.random.default_rng(
                seed
            )

    def is_safe(
        self,
        bar: int,
    ) -> bool:
        """
        Return whether a bar belongs to the indefinitely traversable
        region.
        """

        return bar in self.safe_nodes
