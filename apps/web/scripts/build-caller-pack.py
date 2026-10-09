"""
Builds the caller's clip pack: every phrase the caller says, names apart,
recorded once with Chatterbox's own voice and given the sound of a caller on a
microphone (docs/06-voice.md).

    python apps/web/scripts/build-caller-pack.py

Needs, in one Python environment: PyTorch with CUDA (an NVIDIA card; the CPU
works, many times slower), `pip install chatterbox-tts faster-whisper
num2words`; ffmpeg on the PATH; and the repository's npm install, because the
phrase list comes from the app's own strings, through caller-phrases.ts.

Each phrase is said with the excitement its mood asks for, from flat for a poor
visit to the long 180. Every clip is then transcribed, and one whose words do
not match is recorded again, since nobody listens to four hundred clips. The
dry recordings are kept in a cache (--cache), so a change to the sound or to a
few phrases does not record everything again; a full recording takes hours.

Writes apps/web/public/caller/<locale>/: one MP3 holding every clip back to
back, named by its hash, and index.json, which says where each phrase's clip
starts and ends. Each clip is a whole MP3 file, so the app can decode one
without the rest.
"""

import argparse
import difflib
import hashlib
import json
import os
import re
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
VOICE = "chatterbox-default"
CREDIT = "Caller voice: Chatterbox by Resemble AI (MIT), in its own voice."

# Chatterbox's emotion control, by mood (phrases.ts): exaggeration raises the
# excitement and also the pace, which a lower cfg_weight slows back down.
MOODS = {
    0: (0.25, 0.5),
    1: (0.4, 0.5),
    2: (0.6, 0.45),
    3: (0.85, 0.4),
    4: (1.1, 0.35),
    5: (1.5, 0.3),
}

# Phrases said a way their spelling does not give: (text read, exaggeration, cfg_weight, seed).
# They are picked by ear, not checked by transcription: to keep the exact take
# that was picked, copy it into the cache under the name this script gives it.
SPECIAL = {
    # The long, drawn-out 180 of a stage caller, picked by ear among twelve takes.
    "one hundred and eighty": ("One... hundred... and eightyyyyy!", 1.6, 0.2, 201),
}

# The sound of a caller on a microphone: a warm tone (body low down, a softer
# top), levelled like a live desk, with a short room around it.
TONE = (
    "highpass=f=90,bass=g=2.5:f=200:w=0.7,equalizer=f=3000:t=q:w=1.2:g=1.5,"
    "treble=g=-3.5:f=7000:w=0.7,acompressor=threshold=-18dB:ratio=3:attack=8:release=120:makeup=3"
)
ROOM_SECONDS, ROOM_PREDELAY, ROOM_DARKNESS, ROOM_LEVEL = 0.7, 0.015, 0.45, 0.12
TRIM = "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse"


def clip_key(phrase: str) -> str:
    """The same key as clipKey() in apps/web/src/caller/call.ts."""
    return re.sub(r"[\W_]+", " ", phrase.lower()).strip()


def phrases() -> list[dict]:
    out = subprocess.run(
        "npx vite-node apps/web/scripts/caller-phrases.ts",
        cwd=ROOT, shell=True, check=True, capture_output=True, text=True, encoding="utf-8",
    ).stdout
    return json.loads(out)


def how(phrase: dict) -> tuple[str, float, float, int]:
    """What Chatterbox reads and how, with a seed of its own so a take can be had again."""
    key = clip_key(phrase["text"])
    seed = int(hashlib.sha256(key.encode()).hexdigest()[:8], 16)
    if key in SPECIAL:
        text, exaggeration, cfg, special_seed = SPECIAL[key]
        return text, exaggeration, cfg, special_seed if special_seed is not None else seed
    text = phrase["text"][0].upper() + phrase["text"][1:]
    if text[-1] not in ".!?":
        text += "!" if phrase["mood"] >= 2 else "."
    exaggeration, cfg = MOODS[phrase["mood"]]
    return text, exaggeration, cfg, seed


def room_response(path: Path, rate: int = 24000) -> None:
    """A synthetic room: noise dying away, its highs fading first, as air takes them."""
    rng = np.random.default_rng(1)
    n = int(rate * ROOM_SECONDS)
    t = np.arange(n) / rate
    noise = rng.standard_normal(n) * np.exp(-6.9 * t / ROOM_SECONDS)
    out, y = np.zeros(n), 0.0
    for i in range(n):
        a = ROOM_DARKNESS + (0.98 - ROOM_DARKNESS) * (i / n)
        y = a * y + (1 - a) * noise[i]
        out[i] = y
    out = np.concatenate([np.zeros(int(rate * ROOM_PREDELAY)), out])
    out /= np.abs(out).max()
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes((out * 32767 * 0.9).astype(np.int16).tobytes())


def words(text: str) -> list[str]:
    from num2words import num2words

    # The recogniser writes numbers as digits, ordinals too ("9th"): spell them out as spoken.
    text = re.sub(r"(\d+)(st|nd|rd|th)\b", lambda m: " " + num2words(int(m.group(1)), to="ordinal") + " ", text.lower())
    text = re.sub(r"\d+", lambda m: " " + num2words(int(m.group())) + " ", text)
    return [w for w in re.split(r"[^a-z]+", text) if w and w != "and"]


class Recorder:
    def __init__(self, cache: Path, retake: int = 0):
        import torch
        from chatterbox.tts import ChatterboxTTS
        from faster_whisper import WhisperModel

        self.torch = torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        self.tts = ChatterboxTTS.from_pretrained(device=device)
        self.asr = WhisperModel("small.en", device=device, compute_type="float16" if device == "cuda" else "int8")
        self.cache = cache
        self.retake = retake

    def dry(self, phrase: dict) -> Path:
        """The phrase recorded and checked, from the cache when it is there."""
        import torchaudio

        text, exaggeration, cfg, seed = how(phrase)
        name = hashlib.sha256(json.dumps([VOICE, text, exaggeration, cfg, seed]).encode()).hexdigest()[:16]
        path = self.cache / f"{name}.wav"
        if path.exists():
            return path
        if clip_key(phrase["text"]) in SPECIAL:
            print(f"  no take picked yet for {phrase['text']!r}: recording one, unchecked -> {path}", flush=True)
            self.torch.manual_seed(seed)
            torchaudio.save(str(path), self.tts.generate(text, exaggeration=exaggeration, cfg_weight=cfg), self.tts.sr)
            return path
        expected = words(phrase["text"])
        take = self.cache / f"{name}.take.wav"
        best: tuple[float, bytes] = (-1.0, b"")
        for attempt in range(self.retake, self.retake + 4):
            self.torch.manual_seed(seed + attempt)
            audio = self.tts.generate(text, exaggeration=exaggeration, cfg_weight=cfg)
            torchaudio.save(str(take), audio, self.tts.sr)
            segments, _ = self.asr.transcribe(str(take), language="en", beam_size=5)
            heard = words(" ".join(s.text for s in segments))
            score = difflib.SequenceMatcher(None, expected, heard).ratio()
            # Excited takes can trail off into a cheer ("yay") after the words: never keep one.
            if len(heard) > len(expected):
                score = min(score, 0.5)
            if score > best[0]:
                best = (score, take.read_bytes())
            if score >= 0.85:
                break
            print(f"  again ({score:.2f}): {phrase['text']!r} heard as {' '.join(heard)!r}", flush=True)
        if best[0] < 0.85:
            print(f"  KEPT BEST ({best[0]:.2f}), listen to it: {phrase['text']!r} -> {path}", flush=True)
        path.write_bytes(best[1])
        take.unlink(missing_ok=True)
        return path


def finish(dry: Path, room: Path, mp3: Path, bitrate: str) -> None:
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y", "-i", str(dry), "-i", str(room), "-filter_complex",
         f"[0]{TRIM},{TONE},apad=pad_dur=2[d];[d]asplit[a][b];[b][1]afir=dry=10:wet=10[r];"
         f"[r]volume={ROOM_LEVEL}[r2];[a][r2]amix=inputs=2:normalize=0,alimiter=limit=0.95,"
         "silenceremove=stop_periods=-1:stop_threshold=-55dB:stop_duration=0.3",
         "-ac", "1", "-b:a", bitrate, str(mp3)],
        check=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--locale", default="en")
    parser.add_argument("--bitrate", default="40k")
    parser.add_argument("--cache", type=Path, default=Path.home() / ".cache" / "treblewise-caller")
    parser.add_argument("--only", nargs="*", help="record just these phrases, to try a change out")
    parser.add_argument(
        "--retake", type=int, default=0,
        help="start from this attempt: after deleting clips that came out wrong, record them with fresh seeds",
    )
    args = parser.parse_args()

    cache = args.cache / args.locale
    cache.mkdir(parents=True, exist_ok=True)
    out_dir = ROOT / "apps" / "web" / "public" / "caller" / args.locale
    out_dir.mkdir(parents=True, exist_ok=True)

    todo = phrases()
    if args.only:
        wanted = {clip_key(p) for p in args.only}
        todo = [p for p in todo if clip_key(p["text"]) in wanted]
    recorder = Recorder(cache, args.retake)

    pack = bytearray()
    clips: dict[str, list[int]] = {}
    with tempfile.TemporaryDirectory() as tmp:
        room = Path(tmp, "room.wav")
        room_response(room)
        for number, phrase in enumerate(todo, 1):
            print(f"{number}/{len(todo)} {phrase['text']}", flush=True)
            mp3 = Path(tmp, "clip.mp3")
            finish(recorder.dry(phrase), room, mp3, args.bitrate)
            data = mp3.read_bytes()
            clips[clip_key(phrase["text"])] = [len(pack), len(data)]
            pack += data

    if args.only:
        print(f"recorded {len(clips)} phrases into {cache}; the pack is unchanged")
        return
    for old in out_dir.glob("clips-*.mp3"):
        old.unlink()
    file = f"clips-{hashlib.sha256(pack).hexdigest()[:12]}.mp3"
    (out_dir / file).write_bytes(pack)
    index = {"voice": VOICE, "credit": CREDIT, "licence": "MIT", "file": file, "clips": clips}
    with open(out_dir / "index.json", "w", encoding="utf-8", newline="") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"{len(clips)} clips, {len(pack) / 1024:.0f} KB -> {os.path.relpath(out_dir / file, ROOT)}")


if __name__ == "__main__":
    main()
