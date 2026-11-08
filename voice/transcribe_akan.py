"""Akan (Twi) speech to text, run on the server when a CHW's question recording is synced.

Model: waxal-benchmarking/whisper-small-waxal-aka (Apache-2.0 model, fine-tuned on Google's WAXAL
Akan ASR data, CC-BY-4.0). Reported WER 31.7%, CER 11.3% on the filtered WAXAL test set. The model card
says it is not recommended for high-stakes use without further validation: the transcript only picks
an approved reply from a short list (voice/intents.js), so a wrong word means a wrong topic, which the
caregiver can correct. A reviewer must check a sample before this runs on real recordings.

Usage:  python transcribe_akan.py <audio-file> [--model voice/models/whisper-small-waxal-aka]
Prints the transcript on one line and nothing else on stdout.
"""
import argparse
import io
import subprocess
import sys
from pathlib import Path

import soundfile as sf

HERE = Path(__file__).resolve().parent
DEFAULT_MODEL = HERE / "models" / "whisper-small-waxal-aka"
RATE = 16000


def load_audio_16k(path):
    """Decode any format the phone records (AMR, 3GP, M4A, WAV) to 16 kHz mono float32."""
    proc = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(RATE), "-f", "wav", "pipe:1"],
        capture_output=True, check=True, timeout=120)
    samples, rate = sf.read(io.BytesIO(proc.stdout), dtype="float32")
    if rate != RATE:  # an explicit check: `assert` is skipped when Python runs with -O
        raise ValueError(f"expected {RATE} Hz audio from ffmpeg, got {rate} Hz")
    return samples


# Whisper hears 30 seconds at a time: its feature extractor pads or CUTS every input to 30 s. A longer
# question would lose everything after the first 30 s (an emergency mentioned late would vanish), so
# audio is split into windows of at most 30 s and each window is transcribed.
WINDOW_S = 30


def windows(samples, rate=RATE, window_s=WINDOW_S):
    size = int(rate * window_s)
    return [samples[i:i + size] for i in range(0, len(samples), size)] or [samples]


# Akan speech with Whisper runs at about 6 output tokens per second of audio. The cap stops a model that
# loops on silence or noise from writing for the full 220 tokens.
TOKENS_PER_SECOND = 6
TOKEN_MARGIN = 8
MAX_TOKENS = 220


def token_cap(duration_s):
    return min(MAX_TOKENS, int(duration_s * TOKENS_PER_SECOND) + TOKEN_MARGIN)


def collapse_repetitions(text, max_unit=10, max_repeats=2):
    """Keep at most max_repeats copies of any run of words that repeats back to back.

    A looping decoder writes the same phrase again and again. Real speech repeats a word or two, so a
    unit of up to max_unit words repeated more than max_repeats times in a row is treated as looping and
    cut back to max_repeats copies.
    """
    words = text.split()
    out = []
    i = 0
    while i < len(words):
        step, cut = 1, None
        for size in range(1, max_unit + 1):
            if i + size > len(words):
                break
            unit = words[i:i + size]
            repeats = 1
            while words[i + repeats * size:i + (repeats + 1) * size] == unit:
                repeats += 1
            if repeats > max_repeats:
                cut = unit * max_repeats
                step = repeats * size
                break
        out.extend(cut if cut is not None else [words[i]])
        i += step
    return " ".join(out)


# Read speech runs about 1 to 3 words a second. A transcript far above that is the model inventing words,
# so it is rejected: the matcher then gives the safe default instead of acting on a guess.
MAX_WORDS_PER_SECOND = 4


def is_plausible(text, duration_s):
    if duration_s <= 0:
        return False
    return len(text.split()) / duration_s <= MAX_WORDS_PER_SECOND


def transcribe_samples(audio, model_dir=DEFAULT_MODEL):
    import torch
    from transformers import (WhisperFeatureExtractor, WhisperForConditionalGeneration,
                              WhisperTokenizerFast)

    # The repo ships tokenizer.json only, so load the fast tokenizer from it directly.
    extractor = WhisperFeatureExtractor.from_pretrained(model_dir)
    tokenizer = WhisperTokenizerFast.from_pretrained(model_dir)
    model = WhisperForConditionalGeneration.from_pretrained(model_dir).eval()
    # Newer transformers rejects the forced_decoder_ids this checkpoint ships; the model was tuned without them.
    model.generation_config.forced_decoder_ids = None
    parts = []
    for chunk in windows(audio):
        if len(chunk) == 0:
            continue
        features = extractor(chunk, sampling_rate=RATE, return_tensors="pt").input_features
        with torch.no_grad():
            ids = model.generate(features, max_new_tokens=token_cap(len(chunk) / RATE))
        parts.append(tokenizer.batch_decode(ids, skip_special_tokens=True)[0].strip())
    return collapse_repetitions(" ".join(p for p in parts if p))


def transcribe(path, model_dir=DEFAULT_MODEL):
    return transcribe_samples(load_audio_16k(path), model_dir)


def transcribe_with_duration(path, model_dir=DEFAULT_MODEL):
    """Decodes the audio once and returns (transcript, duration in seconds)."""
    audio = load_audio_16k(path)
    return transcribe_samples(audio, model_dir), len(audio) / RATE


if __name__ == "__main__":
    # Twi letters (ɛ, ɔ) would crash print() on a console that is not UTF-8 (Windows' default).
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("audio")
    parser.add_argument("--model", default=str(DEFAULT_MODEL))
    args = parser.parse_args()
    if not Path(args.model).exists():
        sys.exit("model not found: download waxal-benchmarking/whisper-small-waxal-aka into voice/models/")
    text, duration = transcribe_with_duration(args.audio, args.model)
    # An implausible transcript is printed as empty, so the matcher returns the safe default.
    print(text if is_plausible(text, duration) else "")
