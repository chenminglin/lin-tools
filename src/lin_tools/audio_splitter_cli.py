from __future__ import annotations

import argparse
import re
from pathlib import Path

from .ffmpeg_tools import probe_media, split_audio_by_video_durations
from .timecode import format_timecode
from .video_formats import VIDEO_INPUT_EXTENSIONS, format_choices, get_output_format


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Split one audio file by the durations of ordered video clips.")
    parser.add_argument("audio", help="Input audio path.")
    parser.add_argument("videos_dir", help="Directory containing the ordered video clips.")
    parser.add_argument("-o", "--output-dir", help="Directory for the split audio files.")
    parser.add_argument("-f", "--format", default="wav", choices=format_choices(), help="Output audio format.")
    parser.add_argument("--no-overwrite", action="store_true", help="Do not overwrite existing output files.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    output_format = get_output_format(args.format)
    if output_format.kind != "audio":
        parser.error("--format must be an audio format")

    audio_path = Path(args.audio)
    if not audio_path.exists():
        parser.error(f"Audio file does not exist: {audio_path}")

    videos_dir = Path(args.videos_dir)
    if not videos_dir.exists() or not videos_dir.is_dir():
        parser.error(f"Videos directory does not exist: {videos_dir}")

    video_paths = _ordered_video_paths(videos_dir)
    if not video_paths:
        parser.error(f"No video files found in: {videos_dir}")

    output_dir = Path(args.output_dir) if args.output_dir else videos_dir / f"{audio_path.stem}_split_audio"
    audio_info = probe_media(audio_path)
    video_infos = [probe_media(path) for path in video_paths]
    total_video_duration = sum(float(info.duration or 0.0) for info in video_infos)

    print(f"Audio: {audio_path}")
    print(f"Audio duration: {format_timecode(audio_info.duration) if audio_info.duration else 'unknown'}")
    print(f"Videos: {len(video_paths)} files")
    print(f"Videos total duration: {format_timecode(total_video_duration)}")
    print(f"Output directory: {output_dir}")

    last_line = ""

    def on_progress(percent: float, message: str) -> None:
        nonlocal last_line
        last_line = f"{percent:5.1f}% {message}"
        print(f"\r{last_line}", end="", flush=True)

    segments = split_audio_by_video_durations(
        audio_path=audio_path,
        video_paths=video_paths,
        output_dir=output_dir,
        output_format=output_format,
        overwrite=not args.no_overwrite,
        progress_callback=on_progress,
    )
    if last_line:
        print()

    print(f"Done. Wrote {len(segments)} audio files.")
    return 0


def _ordered_video_paths(directory: Path) -> list[Path]:
    return sorted(
        (
            path
            for path in directory.iterdir()
            if path.is_file() and path.suffix.lower() in VIDEO_INPUT_EXTENSIONS
        ),
        key=lambda path: _natural_sort_key(path.name),
    )


def _natural_sort_key(value: str) -> list[int | str]:
    return [int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", value)]


if __name__ == "__main__":
    raise SystemExit(main())
