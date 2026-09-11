# live_player.py

from __future__ import annotations

import threading
from collections import deque
from typing import Iterable

import numpy as np
import sounddevice as sd


class LiveMusicPlayer:
    """
    Real-time bar-based audio player.

    Supports two modes:

    1. Predetermined sequence
       Used to validate real-time playback independently of navigation.

    2. Navigator-driven playback
       Uses MusicNavigator.choose_next() to continue indefinitely.

    The audio stream is callback-based and therefore does not block
    the main application thread.

    Notes
    -----
    - No crossfading is performed yet.
    - Bars are joined directly at their detected boundaries.
    - Transition smoothing belongs to Step 9.
    """

    def __init__(
        self,
        playback_audio: np.ndarray,
        sr: int,
        bars: list[tuple[float, float]],
        navigator=None,
        blocksize: int = 1024,
        queue_bars: int = 4,
    ):
        self.sr = int(sr)
        self.navigator = navigator
        self.blocksize = int(blocksize)
        self.queue_bars = int(queue_bars)

        if self.sr <= 0:
            raise ValueError("sr must be > 0.")

        if self.blocksize <= 0:
            raise ValueError("blocksize must be > 0.")

        if self.queue_bars < 1:
            raise ValueError("queue_bars must be >= 1.")

        # ---------------------------------------------------------
        # Convert librosa-style audio:
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
        # Convert bar times to sample boundaries once.
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
                    "Invalid bar boundary detected: "
                    f"{start_time:.3f} -> {end_time:.3f}"
                )

            self.bar_samples.append(
                (start_sample, end_sample)
            )

        if not self.bar_samples:
            raise ValueError(
                "No bars were supplied."
            )

        self.n_bars = len(self.bar_samples)

        # ---------------------------------------------------------
        # Runtime state
        # ---------------------------------------------------------

        self._stream = None

        self._running = False

        self._mode = None

        self._current_bar = None

        self._current_audio = None

        self._current_position = 0

        self._bar_queue = deque()

        self._sequence = None
        self._sequence_position = 0

        self._lock = threading.RLock()

    # -------------------------------------------------------------
    # Audio extraction
    # -------------------------------------------------------------

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

    # -------------------------------------------------------------
    # Next-bar policy
    # -------------------------------------------------------------

    def _choose_next_bar(self) -> int | None:
        """
        Determine the next bar according to the active playback mode.

        This function contains no audio rendering logic.
        """

        if self._mode == "sequence":

            if (
                self._sequence_position
                >= len(self._sequence)
            ):
                return None

            next_bar = self._sequence[
                self._sequence_position
            ]

            self._sequence_position += 1

            return int(next_bar)

        if self._mode == "navigator":

            if self.navigator is None:
                raise RuntimeError(
                    "Navigator mode requires a navigator."
                )

            return int(
                self.navigator.choose_next(
                    self._current_bar
                )
            )

        raise RuntimeError(
            "Unknown playback mode."
        )

    # -------------------------------------------------------------
    # Queue preparation
    # -------------------------------------------------------------

    def _fill_bar_queue(self) -> None:
        """
        Keep several upcoming bars prepared.

        In navigator mode, future decisions are made ahead of playback
        so the audio callback does not need to wait at a bar boundary.
        """

        while (
            len(self._bar_queue)
            < self.queue_bars
        ):

            if self._mode == "sequence":

                next_bar = (
                    self._choose_next_bar()
                )

            elif self._mode == "navigator":

                # -------------------------------------------------
                # Navigation is sequential:
                #
                # if queue contains:
                #
                #     146, 147
                #
                # then the next decision must originate from 147,
                # not from the currently playing bar.
                # -------------------------------------------------

                if self._bar_queue:
                    source_bar = (
                        self._bar_queue[-1]
                    )
                else:
                    source_bar = (
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

            if next_bar is None:
                break

            self._bar_queue.append(
                next_bar
            )

    # -------------------------------------------------------------
    # Advance to next bar
    # -------------------------------------------------------------

    def _advance_bar(self) -> bool:
        """
        Move playback to the next queued bar.

        Returns False when no more audio is available.
        """

        self._fill_bar_queue()

        if not self._bar_queue:
            return False

        next_bar = self._bar_queue.popleft()

        self._current_bar = next_bar

        self._current_audio = (
            self._get_bar_audio(
                next_bar
            )
        )

        self._current_position = 0

        self._fill_bar_queue()

        return True

    # -------------------------------------------------------------
    # Audio callback
    # -------------------------------------------------------------

    def _audio_callback(
        self,
        outdata,
        frames,
        time,
        status,
    ):
        """
        Fill the audio device's requested output buffer.

        A single callback may cross one or several bar boundaries.
        """

        outdata.fill(0)

        if not self._running:
            raise sd.CallbackStop

        output_position = 0

        while output_position < frames:

            # -----------------------------------------------------
            # Ensure a current bar exists.
            # -----------------------------------------------------

            if self._current_audio is None:

                if not self._advance_bar():
                    self._running = False
                    raise sd.CallbackStop

            remaining_in_bar = (
                len(self._current_audio)
                - self._current_position
            )

            remaining_in_output = (
                frames
                - output_position
            )

            samples_to_copy = min(
                remaining_in_bar,
                remaining_in_output,
            )

            source_start = (
                self._current_position
            )

            source_end = (
                source_start
                + samples_to_copy
            )

            output_end = (
                output_position
                + samples_to_copy
            )

            outdata[
                output_position:output_end
            ] = self._current_audio[
                source_start:source_end
            ]

            self._current_position += (
                samples_to_copy
            )

            output_position += (
                samples_to_copy
            )

            # -----------------------------------------------------
            # Current bar finished.
            # -----------------------------------------------------

            if (
                self._current_position
                >= len(self._current_audio)
            ):
                self._current_audio = None
                self._current_position = 0

    # -------------------------------------------------------------
    # Stream lifecycle
    # -------------------------------------------------------------

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

    def stop(self) -> None:
        """
        Stop playback immediately.

        Graceful fade-out will be added in Step 10.
        """

        self._running = False

        if self._stream is not None:

            self._stream.stop()
            self._stream.close()

            self._stream = None

        self._current_audio = None
        self._current_position = 0

        self._bar_queue.clear()

    # -------------------------------------------------------------
    # Step 8A
    # -------------------------------------------------------------

    def play_sequence(
        self,
        sequence: Iterable[int],
    ) -> None:
        """
        Play a predetermined sequence of bars.

        This is Step 8A and is useful for validating the real-time
        playback engine independently of stochastic navigation.

        Example:

            [74, 75, 76, 146, 147, 148]
        """

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
                    f"Invalid bar in sequence: {bar}"
                )

        self._mode = "sequence"

        self._sequence = sequence
        self._sequence_position = 0

        self._bar_queue.clear()

        self._current_bar = None
        self._current_audio = None
        self._current_position = 0

        self._fill_bar_queue()

        self._start_stream()

    # -------------------------------------------------------------
    # Step 8B
    # -------------------------------------------------------------

    def start(
        self,
        start_bar: int = 0,
    ) -> None:
        """
        Start indefinite graph-driven playback.

        The supplied start bar is played first. Subsequent bars are
        selected by MusicNavigator.
        """

        if self.navigator is None:
            raise RuntimeError(
                "start() requires a MusicNavigator."
            )

        start_bar = int(start_bar)

        if not 0 <= start_bar < self.n_bars:
            raise ValueError(
                f"Invalid start_bar: {start_bar}"
            )

        if not self.navigator.is_safe(
            start_bar
        ):
            raise ValueError(
                f"Bar {start_bar} is not inside the "
                "non-terminating graph region."
            )

        self._mode = "navigator"

        self._bar_queue.clear()

        self._current_bar = start_bar

        self._current_audio = (
            self._get_bar_audio(
                start_bar
            )
        )

        self._current_position = 0

        self.navigator.reset()

        self._fill_bar_queue()

        self._start_stream()

    # -------------------------------------------------------------
    # Diagnostics
    # -------------------------------------------------------------

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
