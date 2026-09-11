# live_player.py

from __future__ import annotations

from collections import deque
from typing import Iterable

import numpy as np
import sounddevice as sd


class LiveMusicPlayer:
    """
    Real-time graph-driven music player.

    Natural transitions:
        i -> i + 1
        Played exactly as they occur in the original recording.

    Artificial transitions:
        i -> j
        Receive a short equal-power crossfade.

    Default artificial-transition crossfade:
        10 ms
    """

    def __init__(
        self,
        playback_audio: np.ndarray,
        sr: int,
        bars: list[tuple[float, float]],
        navigator=None,
        blocksize: int = 1024,
        queue_bars: int = 4,
        crossfade_ms: float = 10.0,
    ):
        self.sr = int(sr)
        self.navigator = navigator
        self.blocksize = int(blocksize)
        self.queue_bars = int(queue_bars)
        self.crossfade_ms = float(crossfade_ms)

        if self.sr <= 0:
            raise ValueError("sr must be > 0.")

        if self.blocksize <= 0:
            raise ValueError("blocksize must be > 0.")

        if self.queue_bars < 1:
            raise ValueError("queue_bars must be >= 1.")

        if self.crossfade_ms < 0:
            raise ValueError("crossfade_ms must be >= 0.")

        # ---------------------------------------------------------
        # Convert librosa format:
        #
        # mono:
        #     (samples,)
        #
        # stereo:
        #     (channels, samples)
        #
        # into sounddevice format:
        #
        #     (samples, channels)
        # ---------------------------------------------------------

        audio = np.asarray(
            playback_audio,
            dtype=np.float32,
        )

        if audio.ndim == 1:
            audio = audio[:, None]

        elif audio.ndim == 2:
            audio = audio.T

        else:
            raise ValueError(
                "playback_audio must be mono or multi-channel."
            )

        self.audio = np.ascontiguousarray(
            audio,
            dtype=np.float32,
        )

        self.channels = self.audio.shape[1]

        # ---------------------------------------------------------
        # Convert bar times -> sample boundaries.
        # ---------------------------------------------------------

        self.bar_samples = []

        for start_time, end_time in bars:

            start_sample = int(
                round(start_time * self.sr)
            )

            end_sample = int(
                round(end_time * self.sr)
            )

            start_sample = max(
                0,
                min(start_sample, len(self.audio)),
            )

            end_sample = max(
                0,
                min(end_sample, len(self.audio)),
            )

            if end_sample <= start_sample:
                raise ValueError(
                    "Invalid bar boundary: "
                    f"{start_time:.3f} -> {end_time:.3f}"
                )

            self.bar_samples.append(
                (start_sample, end_sample)
            )

        if not self.bar_samples:
            raise ValueError(
                "No bars were supplied."
            )

        self.n_bars = len(
            self.bar_samples
        )

        # ---------------------------------------------------------
        # Crossfade configuration.
        # ---------------------------------------------------------

        self.crossfade_samples = int(
            round(
                self.sr
                * self.crossfade_ms
                / 1000.0
            )
        )

        if self.crossfade_samples > 0:

            theta = np.linspace(
                0.0,
                np.pi / 2.0,
                self.crossfade_samples,
                endpoint=True,
                dtype=np.float32,
            )

            self.fade_out = (
                np.cos(theta)[:, None]
            )

            self.fade_in = (
                np.sin(theta)[:, None]
            )

        else:

            self.fade_out = None
            self.fade_in = None

        # ---------------------------------------------------------
        # Runtime state.
        # ---------------------------------------------------------

        self._stream = None
        self._running = False

        self._mode = None

        self._current_bar = None
        self._current_audio = None
        self._current_position = 0

        # Future bar indices.
        self._bar_queue = deque()

        # Used only for predetermined sequence mode.
        self._sequence = None
        self._sequence_position = 0

    # =============================================================
    # Audio extraction
    # =============================================================

    def _get_bar_audio(
        self,
        bar_index: int,
    ) -> np.ndarray:

        if not 0 <= bar_index < self.n_bars:
            raise IndexError(
                f"Invalid bar index: {bar_index}"
            )

        start, end = self.bar_samples[
            bar_index
        ]

        return self.audio[start:end]

    # =============================================================
    # Transition type
    # =============================================================

    @staticmethod
    def _is_artificial_transition(
        source_bar: int,
        target_bar: int,
    ) -> bool:
        """
        Natural continuation is exactly:

            i -> i + 1

        Any other edge is an artificial graph transition.

        Step 6 guarantees that alternative transitions do not
        duplicate the natural i -> i + 1 edge.
        """

        return (
            target_bar
            != source_bar + 1
        )

    # =============================================================
    # Queue preparation
    # =============================================================

    def _fill_bar_queue(self) -> None:
        """
        Keep several future bars planned ahead.
        """

        while (
            len(self._bar_queue)
            < self.queue_bars
        ):

            # -----------------------------------------------------
            # Predetermined sequence mode.
            # -----------------------------------------------------

            if self._mode == "sequence":

                if (
                    self._sequence_position
                    >= len(self._sequence)
                ):
                    break

                next_bar = int(
                    self._sequence[
                        self._sequence_position
                    ]
                )

                self._sequence_position += 1

            # -----------------------------------------------------
            # Navigator mode.
            # -----------------------------------------------------

            elif self._mode == "navigator":

                if self.navigator is None:
                    raise RuntimeError(
                        "Navigator mode requires a navigator."
                    )

                if self._bar_queue:

                    source_bar = int(
                        self._bar_queue[-1]
                    )

                else:

                    source_bar = int(
                        self._current_bar
                    )

                next_bar = int(
                    self.navigator.choose_next(
                        source_bar
                    )
                )

            else:

                raise RuntimeError(
                    "Unknown playback mode."
                )

            self._bar_queue.append(
                next_bar
            )

    # =============================================================
    # Bar advancement
    # =============================================================

    def _advance_natural(
        self,
    ) -> bool:
        """
        Move normally into the next queued bar.

        No audio overlap occurs.
        """

        self._fill_bar_queue()

        if not self._bar_queue:
            return False

        next_bar = int(
            self._bar_queue.popleft()
        )

        self._current_bar = next_bar

        self._current_audio = (
            self._get_bar_audio(
                next_bar
            )
        )

        self._current_position = 0

        self._fill_bar_queue()

        return True

    def _complete_crossfade(
        self,
        next_bar: int,
        consumed_samples: int,
    ) -> None:
        """
        After an artificial crossfade, the beginning of next_bar has
        already been heard as part of the overlap.

        Therefore playback of next_bar resumes AFTER those consumed
        samples rather than replaying them.
        """

        queued_bar = int(
            self._bar_queue.popleft()
        )

        if queued_bar != next_bar:
            raise RuntimeError(
                "Playback queue became inconsistent."
            )

        self._current_bar = next_bar

        self._current_audio = (
            self._get_bar_audio(
                next_bar
            )
        )

        self._current_position = (
            consumed_samples
        )

        self._fill_bar_queue()

    # =============================================================
    # Audio callback
    # =============================================================

    def _audio_callback(
        self,
        outdata,
        frames,
        time,
        status,
    ):
        """
        Supply audio continuously to sounddevice.

        Natural transition:
            ... AAAAA | BBBBB ...

        Artificial transition:
            ... AAAAA
                    XXXXX
                    BBBBB ...

        where XXXXX is a 10 ms equal-power overlap.
        """

        outdata.fill(0)

        if not self._running:
            raise sd.CallbackStop

        output_position = 0

        while output_position < frames:

            if self._current_audio is None:

                if not self._advance_natural():

                    self._running = False
                    raise sd.CallbackStop

            # -----------------------------------------------------
            # Make sure we know what comes next.
            # -----------------------------------------------------

            self._fill_bar_queue()

            next_bar = (
                int(self._bar_queue[0])
                if self._bar_queue
                else None
            )

            # -----------------------------------------------------
            # Determine whether this boundary is artificial.
            # -----------------------------------------------------

            artificial = (
                next_bar is not None
                and self.crossfade_samples > 0
                and self._is_artificial_transition(
                    self._current_bar,
                    next_bar,
                )
            )

            # =====================================================
            # ARTIFICIAL TRANSITION
            # =====================================================

            if artificial:

                next_audio = (
                    self._get_bar_audio(
                        next_bar
                    )
                )

                fade_samples = min(
                    self.crossfade_samples,
                    len(self._current_audio),
                    len(next_audio),
                )

                crossfade_start = (
                    len(self._current_audio)
                    - fade_samples
                )

                # -------------------------------------------------
                # First play ordinary source audio until the
                # beginning of the crossfade region.
                # -------------------------------------------------

                if (
                    self._current_position
                    < crossfade_start
                ):

                    available = (
                        crossfade_start
                        - self._current_position
                    )

                    needed = (
                        frames
                        - output_position
                    )

                    count = min(
                        available,
                        needed,
                    )

                    source_end = (
                        self._current_position
                        + count
                    )

                    output_end = (
                        output_position
                        + count
                    )

                    outdata[
                        output_position:output_end
                    ] = self._current_audio[
                        self._current_position:
                        source_end
                    ]

                    self._current_position = (
                        source_end
                    )

                    output_position = (
                        output_end
                    )

                    continue

                # -------------------------------------------------
                # We are now inside the crossfade region.
                # -------------------------------------------------

                crossfade_position = (
                    self._current_position
                    - crossfade_start
                )

                remaining_crossfade = (
                    fade_samples
                    - crossfade_position
                )

                needed = (
                    frames
                    - output_position
                )

                count = min(
                    remaining_crossfade,
                    needed,
                )

                fade_start = (
                    crossfade_position
                )

                fade_end = (
                    fade_start
                    + count
                )

                source_start = (
                    crossfade_start
                    + crossfade_position
                )

                source_end = (
                    source_start
                    + count
                )

                outgoing = (
                    self._current_audio[
                        source_start:
                        source_end
                    ]
                )

                incoming = (
                    next_audio[
                        fade_start:
                        fade_end
                    ]
                )

                # Fade arrays were created for the requested
                # crossfade length. If a tiny bar ever forces a
                # shorter fade, create local curves for it.
                if (
                    fade_samples
                    == self.crossfade_samples
                ):

                    fade_out = (
                        self.fade_out[
                            fade_start:
                            fade_end
                        ]
                    )

                    fade_in = (
                        self.fade_in[
                            fade_start:
                            fade_end
                        ]
                    )

                else:

                    theta = np.linspace(
                        0.0,
                        np.pi / 2.0,
                        fade_samples,
                        endpoint=True,
                        dtype=np.float32,
                    )

                    fade_out = (
                        np.cos(theta)[
                            fade_start:
                            fade_end
                        ][:, None]
                    )

                    fade_in = (
                        np.sin(theta)[
                            fade_start:
                            fade_end
                        ][:, None]
                    )

                overlap = (
                    outgoing * fade_out
                    + incoming * fade_in
                )

                output_end = (
                    output_position
                    + count
                )

                outdata[
                    output_position:
                    output_end
                ] = overlap

                self._current_position += (
                    count
                )

                output_position = (
                    output_end
                )

                # -------------------------------------------------
                # Crossfade finished.
                #
                # The first `fade_samples` samples of next_bar have
                # already been played inside the overlap.
                # -------------------------------------------------

                if (
                    self._current_position
                    >= len(self._current_audio)
                ):

                    self._complete_crossfade(
                        next_bar=next_bar,
                        consumed_samples=fade_samples,
                    )

                continue

            # =====================================================
            # NATURAL TRANSITION
            # =====================================================

            remaining_in_bar = (
                len(self._current_audio)
                - self._current_position
            )

            remaining_output = (
                frames
                - output_position
            )

            count = min(
                remaining_in_bar,
                remaining_output,
            )

            source_end = (
                self._current_position
                + count
            )

            output_end = (
                output_position
                + count
            )

            outdata[
                output_position:
                output_end
            ] = self._current_audio[
                self._current_position:
                source_end
            ]

            self._current_position = (
                source_end
            )

            output_position = (
                output_end
            )

            # -----------------------------------------------------
            # Natural bar completed.
            # -----------------------------------------------------

            if (
                self._current_position
                >= len(self._current_audio)
            ):

                if not self._advance_natural():

                    self._running = False

                    if output_position < frames:
                        outdata[
                            output_position:
                        ].fill(0)

                    raise sd.CallbackStop

    # =============================================================
    # Stream
    # =============================================================

    def _start_stream(self) -> None:

        if self._running:
            raise RuntimeError(
                "Player is already running."
            )

        self._running = True

        self._stream = sd.OutputStream(
            samplerate=self.sr,
            channels=self.channels,
            dtype="float32",
            blocksize=self.blocksize,
            callback=self._audio_callback,
        )

        self._stream.start()

    # =============================================================
    # Predetermined sequence
    # =============================================================

    def play_sequence(
        self,
        sequence: Iterable[int],
    ) -> None:

        sequence = [
            int(bar)
            for bar in sequence
        ]

        if not sequence:
            raise ValueError(
                "sequence cannot be empty."
            )

        for bar in sequence:

            if not 0 <= bar < self.n_bars:
                raise ValueError(
                    f"Invalid bar: {bar}"
                )

        self.stop()

        self._mode = "sequence"

        self._sequence = sequence
        self._sequence_position = 1

        self._bar_queue.clear()

        self._current_bar = (
            sequence[0]
        )

        self._current_audio = (
            self._get_bar_audio(
                self._current_bar
            )
        )

        self._current_position = 0

        self._fill_bar_queue()

        self._start_stream()

    # =============================================================
    # Navigator-driven playback
    # =============================================================

    def start(
        self,
        start_bar: int = 0,
    ) -> None:

        if self.navigator is None:
            raise RuntimeError(
                "start() requires a MusicNavigator."
            )

        start_bar = int(
            start_bar
        )

        if not 0 <= start_bar < self.n_bars:
            raise ValueError(
                f"Invalid start_bar: {start_bar}"
            )

        if not self.navigator.is_safe(
            start_bar
        ):
            raise ValueError(
                f"Bar {start_bar} is outside the "
                "non-terminating graph region."
            )

        self.stop()

        self._mode = "navigator"

        self._bar_queue.clear()

        self.navigator.reset()

        self._current_bar = (
            start_bar
        )

        self._current_audio = (
            self._get_bar_audio(
                start_bar
            )
        )

        self._current_position = 0

        self._fill_bar_queue()

        self._start_stream()

    # =============================================================
    # Stop
    # =============================================================

    def stop(self) -> None:
        """
        Immediate stop.

        Graceful musical fade-out remains a later playback-control
        feature rather than transition rendering.
        """

        self._running = False

        if self._stream is not None:

            self._stream.stop()
            self._stream.close()

            self._stream = None

        self._bar_queue.clear()

        self._current_bar = None
        self._current_audio = None
        self._current_position = 0

    # =============================================================
    # Diagnostics
    # =============================================================

    @property
    def is_playing(self) -> bool:
        return self._running

    @property
    def current_bar(self) -> int | None:
        return self._current_bar

    @property
    def queued_bars(self) -> list[int]:
        return list(
            self._bar_queue
        )
