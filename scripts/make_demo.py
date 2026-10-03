"""Join the per-case screen recordings into one demo video with burned-in subtitles.

    uv run --no-project --with pillow python scripts/make_demo.py

Reads dashboard/videos/<case>.mp4 and .vtt, adds a title card before each case, and
writes dashboard/videos/demo.mp4. Needs ffmpeg on PATH.
"""
from __future__ import annotations

import re
import subprocess
import tempfile
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
VIDEOS = ROOT / "dashboard" / "videos"
OUT = VIDEOS / "demo.mp4"
FONT = "/System/Library/Fonts/HelveticaNeue.ttc"
BG, FG, ACCENT, MUTED = (26, 29, 32), (228, 231, 233), (61, 186, 198), (154, 163, 170)

INTRO = ("Rhombus AI: schema and semantic drift",
         "Screen recordings of my manual runs, re-run and recorded on 2 Oct 2026, trimmed, with subtitles.")
CASES = [
    ("baseline", "Baseline", "The normal file, run through the AI-built pipeline."),
    ("schema-drop-column", "Case 1: drop a column", "country is removed."),
    ("schema-rename-column", "Case 2: rename a column", "amount_usd becomes total_amount."),
    ("schema-type-change", "Case 3: change a type", "quantity becomes text, like \"6 units\"."),
    ("schema-add-column", "Case 4: add a column", "A new discount_code column."),
    ("schema-all-combined", "Case 5: all four at once", "Drop, rename, type change and a new column."),
    ("semantic-dollars-to-cents", "Case 6: dollars to cents", "Same columns, every amount 100x."),
    ("semantic-date-mmdd-to-ddmm", "Case 7: dates to DD/MM", "Same columns, day and month swapped."),
]
OUTRO = ("Full write-ups, findings and test suites",
         "See the dashboard and the README in the repo.")


def run(*args: str) -> None:
    subprocess.run(args, check=True, capture_output=True)


def size_of(video: Path) -> tuple[int, int]:
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries",
                          "stream=width,height", "-of", "csv=p=0", str(video)],
                         check=True, capture_output=True, text=True).stdout.strip()
    w, h = out.split(",")
    return int(w), int(h)


def font(size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT, size, index=index)


def card(path: Path, size: tuple[int, int], title: str, sub: str) -> None:
    img = Image.new("RGB", size, BG)
    d = ImageDraw.Draw(img)
    w, h = size
    d.text((w // 2, h // 2 - 30), title, font=font(54, 4), fill=FG, anchor="mm")
    lines = textwrap.wrap(sub, 70)
    for i, line in enumerate(lines):
        d.text((w // 2, h // 2 + 40 + i * 38), line, font=font(28), fill=MUTED, anchor="mm")
    d.rectangle((w // 2 - 40, h // 2 - 90, w // 2 + 40, h // 2 - 86), fill=ACCENT)
    img.save(path)


def caption(path: Path, size: tuple[int, int], text: str) -> None:
    """A transparent frame with the subtitle in a dark box near the bottom."""
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    f = font(30)
    lines = textwrap.wrap(text, 80)
    line_h = 42
    box_w = max(d.textlength(line, font=f) for line in lines) + 48
    box_h = line_h * len(lines) + 28
    x0, y0 = (size[0] - box_w) / 2, size[1] - box_h - 40
    d.rounded_rectangle((x0, y0, x0 + box_w, y0 + box_h), radius=10, fill=(0, 0, 0, 205))
    for i, line in enumerate(lines):
        d.text((size[0] / 2, y0 + 14 + line_h * i + line_h / 2), line, font=f, fill=(255, 255, 255, 255), anchor="mm")
    img.save(path)


def cues(vtt: Path) -> list[tuple[float, float, str]]:
    def secs(t: str) -> float:
        parts = [float(p) for p in t.split(":")]
        return sum(p * 60 ** i for i, p in enumerate(reversed(parts)))
    blocks = re.findall(r"([\d:.]+) --> ([\d:.]+)\n(.+?)(?:\n\n|\Z)", vtt.read_text(), re.S)
    return [(secs(a), secs(b), " ".join(t.split())) for a, b, t in blocks]


def encode_card(png: Path, out: Path, seconds: float) -> None:
    run("ffmpeg", "-y", "-loop", "1", "-t", str(seconds), "-i", str(png), "-r", "30",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "24", str(out))


def encode_clip(video: Path, vtt: Path, size: tuple[int, int], work: Path, out: Path) -> None:
    pngs, chain, last = [], [], "0:v"
    for i, (a, b, text) in enumerate(cues(vtt)):
        png = work / f"{video.stem}-cue{i}.png"
        caption(png, size, text)
        pngs += ["-i", str(png)]
        label = f"v{i}"
        chain.append(f"[{last}][{i + 1}:v]overlay=0:0:enable='between(t,{a},{b - 0.01})'[{label}]")
        last = label
    run("ffmpeg", "-y", "-i", str(video), *pngs, "-filter_complex", ";".join(chain), "-map", f"[{last}]",
        "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "24", str(out))


def main() -> None:
    size = size_of(VIDEOS / f"{CASES[0][0]}.mp4")
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        parts: list[Path] = []

        def add_card(name: str, title: str, sub: str, seconds: float) -> None:
            png, mp4 = work / f"{name}.png", work / f"{name}.mp4"
            card(png, size, title, sub)
            encode_card(png, mp4, seconds)
            parts.append(mp4)

        add_card("intro", *INTRO, 4)
        for case, title, sub in CASES:
            add_card(f"title-{case}", title, sub, 2.5)
            clip = work / f"{case}-captioned.mp4"
            encode_clip(VIDEOS / f"{case}.mp4", VIDEOS / f"{case}.vtt", size, work, clip)
            parts.append(clip)
        add_card("outro", *OUTRO, 4)

        listing = work / "parts.txt"
        listing.write_text("".join(f"file '{p}'\n" for p in parts))
        run("ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "26", "-movflags", "+faststart", str(OUT))
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
