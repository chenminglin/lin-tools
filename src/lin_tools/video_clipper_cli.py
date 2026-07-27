from __future__ import annotations

import argparse
from pathlib import Path

from .ffmpeg_tools import build_clip_command, default_output_path, probe_media, run_ffmpeg
from .timecode import format_timecode, parse_timecode
from .video_formats import OUTPUT_FORMATS, format_choices


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Clip or convert videos with FFmpeg.")
    parser.add_argument("input", nargs="?", help="Input video path.")
    parser.add_argument("-o", "--output", help="Output file path.")
    parser.add_argument("-f", "--format", default="mp4", choices=format_choices(), help="Output format.")
    parser.add_argument("-s", "--start", default="0", help="Start time: seconds, mm:ss, or hh:mm:ss.")
    parser.add_argument("-e", "--end", help="End time: seconds, mm:ss, or hh:mm:ss.")
    parser.add_argument("--scale", type=float, default=1.0, help="Resolution scale, for example 1, 0.75, 0.5.")
    parser.add_argument("--no-audio", action="store_true", help="Do not include audio in video outputs.")
    parser.add_argument("--list-formats", action="store_true", help="Show supported output formats.")
    parser.add_argument("--no-overwrite", action="store_true", help="Do not overwrite existing output files.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.list_formats:
        for key, fmt in OUTPUT_FORMATS.items():
            print(f"{key:5} {fmt.label}")
        return 0

    if not args.input:
        parser.error("input is required unless --list-formats is used")

    input_path = Path(args.input)
    if not input_path.exists():
        parser.error(f"Input file does not exist: {input_path}")

    start = parse_timecode(args.start) or 0.0
    end = parse_timecode(args.end)
    output_path = Path(args.output) if args.output else default_output_path(input_path, args.format, start, end)

    info = probe_media(input_path)
    expected_duration = (end - start) if end is not None else (info.duration - start if info.duration else None)

    print(f"Input: {input_path}")
    print(f"Duration: {format_timecode(info.duration) if info.duration else 'unknown'}")
    print(f"Resolution: {info.resolution}")
    print(f"Output: {output_path}")

    command = build_clip_command(
        input_path=input_path,
        output_path=output_path,
        output_format=args.format,
        start=start,
        end=end,
        include_audio=not args.no_audio,
        scale=args.scale,
        overwrite=not args.no_overwrite,
    )

    last_percent = -1

    def on_progress(percent: float, _: str) -> None:
        nonlocal last_percent
        current = int(percent)
        if current > last_percent:
            last_percent = current
            print(f"\rProgress: {current:3d}%", end="", flush=True)

    run_ffmpeg(command, duration=expected_duration, progress_callback=on_progress)
    if last_percent < 100:
        print("\rProgress: 100%")
    else:
        print()
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
