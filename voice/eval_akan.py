"""Measures the Akan transcriber on real WAXAL validation clips before anyone relies on it.

Step 1, fetch clips (needs internet; audio is CC-BY-4.0 from google/WaxalNLP, kept out of git):
    python eval_akan.py fetch --n 20
Step 2, score the model:
    python eval_akan.py score

The score is word error rate (WER) against the reference transcript. These are read sentences, not
caregiver questions, so this measures recognition quality only. The topic matching in intents.js is
tested separately, on the phrases that real caregivers say, once a reviewer has collected them.
"""
import argparse
import json
import re
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path

from transcribe_akan import DEFAULT_MODEL, transcribe

DATA = Path(__file__).resolve().parent / "eval" / "data"
MANIFEST = DATA / "manifest.json"
ROWS_API = ("https://datasets-server.huggingface.co/rows?"
            + urllib.parse.urlencode({"dataset": "google/WaxalNLP", "config": "aka_asr",
                                      "split": "validation"}))


def normalise(text):
    return re.sub(r"[^\w\s']", " ", text.lower()).split()


def wer(reference, hypothesis):
    ref, hyp = normalise(reference), normalise(hypothesis)
    if not ref:
        return 0.0 if not hyp else 1.0
    # Levenshtein distance over words.
    prev = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        cur = [i]
        for j, h in enumerate(hyp, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r != h)))
        prev = cur
    return prev[-1] / len(ref)


def fetch(n):
    DATA.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(f"{ROWS_API}&offset=0&length={n}", timeout=120) as resp:
        rows = json.load(resp)["rows"]
    items = []
    for i, r in enumerate(rows):
        row = r["row"]
        mp3 = DATA / f"clip_{i:02d}.mp3"
        wav = DATA / f"clip_{i:02d}.wav"
        urllib.request.urlretrieve(row["audio"][0]["src"], mp3)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(mp3), "-ac", "1", "-ar", "16000", str(wav)],
                       check=True)
        mp3.unlink()
        items.append({"wav": wav.name, "reference": row["transcription"], "id": row["id"]})
    MANIFEST.write_text(json.dumps(items, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"fetched {len(items)} clips into {DATA}")


def score(model_dir=DEFAULT_MODEL):
    items = json.loads(MANIFEST.read_text(encoding="utf-8"))
    total_err = total_words = 0.0
    for it in items:
        hyp = transcribe(DATA / it["wav"], model_dir)
        w = wer(it["reference"], hyp)
        n = len(normalise(it["reference"]))
        total_err += w * n
        total_words += n
        print(f"{it['id']}  WER {w:.2f}")
    print(f"overall WER {total_err / total_words:.3f} over {len(items)} clips, {int(total_words)} words")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch")
    f.add_argument("--n", type=int, default=20)
    sub.add_parser("score")
    args = parser.parse_args()
    if args.cmd == "fetch":
        fetch(args.n)
    else:
        score()
