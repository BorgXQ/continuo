"""Final-quarter spectral errors and CENS for production loop discovery."""

import librosa
import numpy as np

FEATURE_NAMES = tuple(
    f"{band}_{metric}" for band in ("low", "mid", "high")
    for metric in ("spectral_level_rmse_db", "spectral_slope_rmse_db_s", "residual_weighted_rmse_db")
) + ("cens_distance",)
ANALYSIS_VERSION = "pareto-exits-v2"


def pareto_mask(values):
    """Exact minimization frontier; equal vectors do not dominate each other."""
    values = np.asarray(values, dtype=float)
    if values.ndim != 2 or not np.isfinite(values).all():
        raise ValueError("Pareto inputs must be a finite matrix.")
    frontier = []
    for index in np.argsort(values[:, 0], kind="stable"):
        if frontier:
            previous = values[frontier]
            if np.any(np.all(previous <= values[index], axis=1)
                      & np.any(previous < values[index], axis=1)):
                continue
            removed = (np.all(values[index] <= previous, axis=1)
                       & np.any(values[index] < previous, axis=1))
            frontier = [item for item, drop in zip(frontier, removed) if not drop]
        frontier.append(int(index))
    result = np.zeros(len(values), dtype=bool)
    result[frontier] = True
    return result


def interpolate_bins(window, times, key="db"):
    """Vectorized equivalent of np.interp for each frequency, without extrapolation."""
    original = window["times"]
    upper = np.clip(np.searchsorted(original, times, side="right"), 1, len(original) - 1)
    lower = upper - 1
    fraction = np.clip((times - original[lower]) / (original[upper] - original[lower]), 0, 1)
    return (window[key][:, lower] * (1 - fraction)
            + window[key][:, upper] * fraction)


def bar_cens(audio, sr, start, end, relative_times):
    """Standard CENS within one complete bar; never read actual audio after its end."""
    first, last = int(np.ceil(start * sr)), int(np.floor(end * sr))
    chroma = librosa.feature.chroma_cens(
        y=audio[first:last], sr=sr, hop_length=256, fmin=librosa.note_to_hz("C1"),
        tuning=0.0, n_chroma=12, n_octaves=7, bins_per_octave=36,
        norm=2, win_len_smooth=41, smoothing_window="hann",
    )
    frame_times = first / sr + np.arange(chroma.shape[1]) * 256 / sr
    requested_times = end + np.asarray(relative_times)
    if requested_times[0] < frame_times[0] or requested_times[-1] > frame_times[-1]:
        raise ValueError("CENS timestamps do not cover the spectral comparison window.")
    # Align the CQT-based chroma to the existing STFT observations before pairing bars.
    return np.asarray([np.interp(requested_times, frame_times, values) for values in chroma])


def weighted_cens_distance(first, second, weights):
    """Mean frame-wise cosine distance; both zero => 0, only one zero => 1."""
    first, second, weights = (np.asarray(value, dtype=float) for value in (first, second, weights))
    if (first.ndim != 2 or first.shape[0] != 12 or first.shape != second.shape
            or weights.shape != (first.shape[1],) or not first.shape[1]
            or not np.isfinite(first).all() or not np.isfinite(second).all()
            or not np.isfinite(weights).all() or np.any(first < 0) or np.any(second < 0)
            or np.any(weights <= 0)):
        raise ValueError("CENS needs aligned, finite, nonnegative 12D vectors and positive weights.")
    first_norm = np.linalg.norm(first, axis=0)
    second_norm = np.linalg.norm(second, axis=0)
    first_active, second_active = first_norm > 1e-12, second_norm > 1e-12
    valid = first_active & second_active
    distances = np.ones(first.shape[1])
    distances[~first_active & ~second_active] = 0.0
    distances[valid] = np.clip(
        1 - np.sum(first[:, valid] * second[:, valid], axis=0)
        / (first_norm[valid] * second_norm[valid]), 0, 1,
    )
    return float(np.average(distances, weights=weights))


def pair_vector(first, second, band_weights, sr, ratio, curvature):
    """The notebook's aligned weighted fits and joint time/frequency residual RMSE."""
    start = max(first["times"][0], second["times"][0])
    end = min(first["times"][-1], second["times"][-1])
    step = 256 / sr
    count = int(np.floor((end - start) / step + 1e-9)) + 1
    if count < 3:
        return None
    times = end - np.arange(count - 1, -1, -1) * step
    u = (times - times[0]) / (times[-1] - times[0])
    weights = 1 + (ratio - 1) * np.log1p(curvature * u) / np.log1p(curvature)
    # Fitting the difference is equivalent to subtracting the two weighted fits.
    difference = interpolate_bins(first, times) - interpolate_bins(second, times)
    mean_time = np.average(times, weights=weights)
    centered = times - mean_time
    mean_difference = np.average(difference, axis=1, weights=weights)
    slopes = ((difference - mean_difference[:, None]) @ (weights * centered)
              / np.sum(weights * centered ** 2))
    levels = mean_difference - slopes * mean_time
    residuals = difference - levels[:, None] - slopes[:, None] * times
    residual_mse = np.average(residuals ** 2, axis=1, weights=weights)
    vector = np.sqrt(np.column_stack((band_weights @ (levels ** 2),
                                     band_weights @ (slopes ** 2),
                                     band_weights @ residual_mse))).reshape(-1)
    distance = weighted_cens_distance(interpolate_bins(first, times, "cens"),
                                     interpolate_bins(second, times, "cens"), weights)
    return np.r_[vector, distance]


def extract_exits(audio, sr, bars, progress=None):
    """Return per-bar quarter windows and fractional FFT-bin band weights."""
    audio = np.asarray(audio)
    bars = np.asarray(bars, dtype=float)
    if sr != 44100 or audio.ndim != 1 or not len(audio) or not np.isfinite(audio).all():
        raise ValueError("Exit analysis requires finite mono audio at 44100 Hz.")
    if (bars.ndim != 2 or bars.shape[1] != 2 or not np.isfinite(bars).all()
            or np.any(bars[:, 0] < 0) or np.any(bars[:, 1] > len(audio) / sr)
            or np.any(bars[:, 1] <= bars[:, 0])
            or np.any(bars[1:, 0] < bars[:-1, 1])):
        raise ValueError("Invalid complete bar boundaries.")
    frequencies = librosa.fft_frequencies(sr=sr, n_fft=4096)
    edges = np.r_[0.0, (frequencies[:-1] + frequencies[1:]) / 2, sr / 2]
    band_weights = np.asarray([
        np.maximum(0, np.minimum(edges[1:], high) - np.maximum(edges[:-1], low)) / np.diff(edges)
        for low, high in ((0, 250), (250, 4000), (4000, sr / 2))
    ])
    band_weights /= band_weights.sum(axis=1, keepdims=True)
    hann = librosa.filters.get_window("hann", 4096, fftbins=True)
    power_scale = np.full(2049, 2.0)
    power_scale[[0, -1]] = 1.0
    power_scale /= 4096 * np.sum(hann ** 2)
    windows = []
    for index, (start, end) in enumerate(bars):
        exit_start = end - (end - start) / 4
        first, last = int(np.ceil(exit_start * sr)), int(np.floor(end * sr))
        window = None
        if last - first >= 4096 + 256:
            spectrum = librosa.stft(audio[first:last], n_fft=4096, hop_length=256,
                                    window=hann, center=False)
            power = np.abs(spectrum).astype(np.float64) ** 2 * power_scale[:, None]
            db = 10 * np.log10(np.maximum(power, 1e-12))
            times = (first + 2048 + np.arange(db.shape[1]) * 256) / sr - end
            cens = bar_cens(audio, sr, start, end, times)
            window = dict(times=times, db=db, cens=cens)
        windows.append(window)
        if progress:
            progress(index + 1, len(bars))
    return windows, band_weights
