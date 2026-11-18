"""Generate the game's original short sound effects, then encode package-local MP3s."""
import math
import random
import struct
import subprocess
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "audio"
WORK = ROOT / "output" / "audio-source"
RATE = 22050
OUT.mkdir(parents=True, exist_ok=True)
WORK.mkdir(parents=True, exist_ok=True)

CUES = {
    "tap": (0.065, [(780, 0.0, 0.055, .24)]),
    "place": (.19, [(190, 0, .11, .6), (850, .008, .07, .18)]),
    "flip": (.25, [(440, 0, .08, .28), (610, .07, .09, .24), (760, .14, .09, .18)]),
    "bomb": (.52, [(85, 0, .4, .55), (150, .02, .22, .2)]),
    "shield": (.55, [(660, 0, .4, .28), (990, .06, .38, .2)]),
    "steal": (.4, [(420, 0, .17, .25), (840, .13, .23, .32)]),
    "double": (.37, [(510, 0, .14, .28), (765, .16, .17, .32)]),
    "wait": (.4, [(540, 0, .14, .25), (400, .16, .17, .22)]),
    "undo": (.43, [(880, 0, .13, .25), (660, .12, .14, .25), (440, .25, .15, .25)]),
    "win": (.95, [(523.25, 0, .3, .26), (659.25, .17, .3, .26), (783.99, .34, .52, .3), (1046.5, .52, .35, .2)]),
    "lose": (.68, [(440, 0, .26, .24), (349.23, .2, .3, .24), (261.63, .4, .25, .22)]),
}

for name, (duration, notes) in CUES.items():
    rng = random.Random(name)
    samples = []
    for i in range(int(duration * RATE)):
        t = i / RATE
        value = 0
        for freq, start, length, gain in notes:
            p = (t - start) / length
            if 0 <= p <= 1:
                envelope = min(1, p * 70) * (1 - p) ** 2
                value += math.sin(2 * math.pi * freq * (t - start)) * envelope * gain
        if name in ("place", "bomb"):
            value += rng.uniform(-1, 1) * math.exp(-t * (45 if name == "place" else 14)) * .22
        samples.append(struct.pack("<h", int(math.tanh(value) * 27000)))
    source = WORK / f"{name}.wav"
    with wave.open(str(source), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(RATE)
        audio.writeframes(b"".join(samples))
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
         "-codec:a", "libmp3lame", "-b:a", "64k", "-ar", str(RATE), str(OUT / f"{name}.mp3")],
        check=True,
    )
print(f"Generated {len(CUES)} original game cues in {OUT}")
