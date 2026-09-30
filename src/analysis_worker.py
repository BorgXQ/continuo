"""Run the desktop analysis job, emitting newline-delimited JSON to stdout."""

import contextlib
import json
import sys
from .analysis_audio import AudioDecodeError, decode_analysis_audio

PROTOCOL = sys.stdout


def emit(**message):
    print(json.dumps(message, allow_nan=False), file=PROTOCOL, flush=True)


def analyze(path, expected_duration):
    emit(state="running", progress=0, stage="Validating audio decoding")
    audio, sr = decode_analysis_audio(path, expected_duration)
    emit(state="running", progress=1, stage="Loading analysis tools")
    import librosa
    from .analyze_timing import analyze_timing
    from .analyze_features import analyze_features
    from .discover_structure import discover_structure
    from .discover_transitions import discover_transitions
    from .build_music_graph import build_music_graph
    from .music_navigator import MusicNavigator

    audio = librosa.resample(audio, orig_sr=sr, target_sr=44100)
    sr = 44100
    emit(state="running", progress=10, stage="Detecting beats and bars")
    timing = analyze_timing(path, beats_per_bar=(4,), audio=audio, sample_rate=sr)
    emit(state="running", progress=45, stage="Extracting audio features")
    features = analyze_features(audio, sr, timing)
    if len(features) != len(timing["bars"]):
        raise ValueError("Feature bars do not match detected timing bars.")
    emit(state="running", progress=80, stage="Comparing musical structure")
    structure = discover_structure(features)
    emit(state="running", progress=90, stage="Finding transitions")
    transitions = discover_transitions(features, structure)
    emit(state="running", progress=95, stage="Building playback graph")
    graph = build_music_graph(len(features), transitions)
    # A valid analysis can have no indefinitely traversable region.
    routes = {}
    start_bar = None
    try:
        navigator = MusicNavigator(graph)
    except ValueError as error:
        if str(error) != "The music graph contains no non-terminating region.":
            raise
    else:
        start_bar = min(navigator.safe_nodes)
        routes = {
            bar: [
                {"target": edge["target_bar"], "probability": edge["probability"]}
                for edge in navigator.get_probabilities(bar)
            ]
            for bar in sorted(navigator.safe_nodes)
        }
    return {
        "bars": [[float(start), float(end)] for start, end in timing["bars"]],
        "sampleRate": int(sr),
        "tempo": float(timing["tempo_bpm"]),
        "transitions": len(transitions),
        "routes": routes,
        "startBar": start_bar,
    }


if __name__ == "__main__":
    try:
        # Keep library output off the JSON protocol channel.
        with contextlib.redirect_stdout(sys.stderr):
            result = analyze(sys.argv[1], float(sys.argv[2]))
        emit(state="complete", result=result)
    except AudioDecodeError as error:
        emit(state="decode_required", message=str(error))
        sys.exit(2)
    except Exception as error:
        emit(state="failed", message=f"{type(error).__name__}: {error}")
        sys.exit(1)
