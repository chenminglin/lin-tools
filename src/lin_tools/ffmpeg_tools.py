from __future__ import annotations

import json
import math
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Mapping, Sequence

from .timecode import format_timecode
from .video_formats import OutputFormat, get_output_format


ProgressCallback = Callable[[float, str], None]


@dataclass(frozen=True)
class AudioStreamInfo:
    index: int
    codec: str | None
    language: str | None = None
    title: str | None = None
    sample_rate: int | None = None
    channels: int | None = None
    channel_layout: str | None = None
    bit_rate: int | None = None
    default: bool = False


@dataclass(frozen=True)
class MediaInfo:
    path: Path
    duration: float | None
    width: int | None
    height: int | None
    video_codec: str | None
    audio_codec: str | None
    format_name: str | None
    size: int | None
    fps: float | None = None
    frame_count: int | None = None
    sample_rate: int | None = None
    channels: int | None = None
    channel_layout: str | None = None
    bit_rate: int | None = None
    audio_streams: tuple[AudioStreamInfo, ...] = ()

    @property
    def resolution(self) -> str:
        if self.width and self.height:
            return f"{self.width} x {self.height}"
        return "unknown"


@dataclass(frozen=True)
class AudioSplitSegment:
    source_video: Path
    output_path: Path
    start: float
    end: float
    duration: float


def find_ffmpeg() -> str:
    executable = shutil.which("ffmpeg")
    if executable:
        return executable

    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as exc:  # pragma: no cover - depends on local install
        raise RuntimeError(
            "FFmpeg was not found. Install it in PATH or run `pip install imageio-ffmpeg`."
        ) from exc


def find_ffprobe() -> str | None:
    return shutil.which("ffprobe")


def probe_media(input_path: str | Path) -> MediaInfo:
    path = Path(input_path)
    ffprobe = find_ffprobe()
    if ffprobe:
        return _probe_with_ffprobe(ffprobe, path)
    return _probe_with_ffmpeg(find_ffmpeg(), path)


def _probe_with_ffprobe(ffprobe: str, path: Path) -> MediaInfo:
    command = [
        ffprobe,
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "ffprobe failed.")

    payload = json.loads(result.stdout or "{}")
    streams = payload.get("streams", [])
    video_stream = next((stream for stream in streams if stream.get("codec_type") == "video"), {})
    raw_audio_streams = [stream for stream in streams if stream.get("codec_type") == "audio"]
    audio_stream = raw_audio_streams[0] if raw_audio_streams else {}
    audio_streams = tuple(
        AudioStreamInfo(
            index=index,
            codec=stream.get("codec_name"),
            language=(stream.get("tags") or {}).get("language"),
            title=(stream.get("tags") or {}).get("title"),
            sample_rate=_safe_int(stream.get("sample_rate")),
            channels=_safe_int(stream.get("channels")),
            channel_layout=stream.get("channel_layout"),
            bit_rate=_safe_int(stream.get("bit_rate")),
            default=bool((stream.get("disposition") or {}).get("default")),
        )
        for index, stream in enumerate(raw_audio_streams)
    )
    fmt = payload.get("format", {})

    return MediaInfo(
        path=path,
        duration=_safe_float(fmt.get("duration")),
        width=_safe_int(video_stream.get("width")),
        height=_safe_int(video_stream.get("height")),
        video_codec=video_stream.get("codec_name"),
        audio_codec=audio_stream.get("codec_name"),
        format_name=fmt.get("format_name"),
        size=_safe_int(fmt.get("size")) or (path.stat().st_size if path.exists() else None),
        fps=_parse_rate(video_stream.get("avg_frame_rate") or video_stream.get("r_frame_rate")),
        frame_count=_frame_count(video_stream, _safe_float(fmt.get("duration"))),
        sample_rate=_safe_int(audio_stream.get("sample_rate")),
        channels=_safe_int(audio_stream.get("channels")),
        channel_layout=audio_stream.get("channel_layout"),
        bit_rate=_safe_int(audio_stream.get("bit_rate") or fmt.get("bit_rate")),
        audio_streams=audio_streams,
    )


def _probe_with_ffmpeg(ffmpeg: str, path: Path) -> MediaInfo:
    result = subprocess.run(
        [ffmpeg, "-hide_banner", "-i", str(path)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    text = "\n".join([result.stdout, result.stderr])
    duration = None
    width = None
    height = None
    video_codec = None
    audio_codec = None

    duration_match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", text)
    if duration_match:
        h, m, s = duration_match.groups()
        duration = int(h) * 3600 + int(m) * 60 + float(s)

    video_match = re.search(r"Video:\s*([^,\n]+).*?(\d{2,5})x(\d{2,5})", text)
    if video_match:
        video_codec = video_match.group(1).strip()
        width = int(video_match.group(2))
        height = int(video_match.group(3))

    audio_matches = re.findall(r"Audio:\s*([^,\n]+)", text)
    if audio_matches:
        audio_codec = audio_matches[0].strip()

    return MediaInfo(
        path=path,
        duration=duration,
        width=width,
        height=height,
        video_codec=video_codec,
        audio_codec=audio_codec,
        format_name=None,
        size=path.stat().st_size if path.exists() else None,
        audio_streams=tuple(
            AudioStreamInfo(index=index, codec=codec.strip())
            for index, codec in enumerate(audio_matches)
        ),
    )


def _parse_rate(value: object) -> float | None:
    if not value:
        return None
    text = str(value)
    if "/" in text:
        left, right = text.split("/", 1)
        numerator = _safe_float(left)
        denominator = _safe_float(right)
        if numerator is None or not denominator:
            return None
        return round(numerator / denominator, 3)
    number = _safe_float(text)
    return round(number, 3) if number else None


def _frame_count(video_stream: dict[str, object], duration: float | None) -> int | None:
    count = _safe_int(video_stream.get("nb_frames"))
    if count:
        return count
    fps = _parse_rate(video_stream.get("avg_frame_rate") or video_stream.get("r_frame_rate"))
    if fps and duration:
        return int(round(fps * duration))
    return None


def build_clip_command(
    input_path: str | Path,
    output_path: str | Path,
    output_format: str | OutputFormat,
    start: float | None = None,
    end: float | None = None,
    include_audio: bool = True,
    scale: float = 1.0,
    video_filter: str = "none",
    overwrite: bool = True,
    audio_stream_index: int = 0,
) -> list[str]:
    fmt = get_output_format(output_format) if isinstance(output_format, str) else output_format
    ffmpeg = find_ffmpeg()
    command = [
        ffmpeg,
        "-hide_banner",
        "-nostats",
        "-progress",
        "pipe:1",
        "-y" if overwrite else "-n",
        "-i",
        str(input_path),
    ]

    start_seconds = max(0.0, float(start or 0.0))
    end_seconds = float(end) if end is not None else None
    if start_seconds:
        command.extend(["-ss", _seconds_arg(start_seconds)])
    if end_seconds is not None:
        duration = end_seconds - start_seconds
        if duration <= 0:
            raise ValueError("End time must be greater than start time.")
        command.extend(["-t", _seconds_arg(duration)])

    if fmt.kind == "audio":
        if audio_stream_index < 0:
            raise ValueError("Audio stream index must not be negative.")
        command.extend(["-map", f"0:a:{audio_stream_index}?", "-vn"])
        _append_audio_only_codec_args(command, fmt)
        command.append(str(output_path))
        return command

    command.extend(["-map", "0:v:0"])
    if include_audio and fmt.supports_audio:
        command.extend(["-map", "0:a?"])
    else:
        command.append("-an")

    vf = _video_filter(scale, fmt, video_filter)
    if vf:
        command.extend(["-vf", vf])

    _append_video_codec_args(command, fmt)
    if include_audio and fmt.supports_audio and fmt.audio_codec:
        _append_audio_codec_args(command, fmt)

    command.append(str(output_path))
    return command


def build_audio_trim_command(
    input_path: str | Path,
    output_path: str | Path,
    output_format: str | OutputFormat,
    start: float | None = None,
    end: float | None = None,
    overwrite: bool = True,
) -> list[str]:
    fmt = get_output_format(output_format) if isinstance(output_format, str) else output_format
    if fmt.kind != "audio":
        raise ValueError("Audio trim output format must be audio.")
    return build_clip_command(
        input_path=input_path,
        output_path=output_path,
        output_format=fmt,
        start=start,
        end=end,
        include_audio=True,
        overwrite=overwrite,
    )


def build_audio_speed_command(
    input_path: str | Path,
    output_path: str | Path,
    output_format: str | OutputFormat,
    speed: float,
    overwrite: bool = True,
) -> list[str]:
    """Build an audio tempo command that preserves pitch."""
    fmt = get_output_format(output_format) if isinstance(output_format, str) else output_format
    if fmt.kind != "audio":
        raise ValueError("Audio speed output format must be audio.")
    speed = float(speed)
    if not 0.25 <= speed <= 4.0:
        raise ValueError("Audio speed must be between 0.25 and 4.0.")

    factors: list[float] = []
    remaining = speed
    while remaining > 2.0:
        factors.append(2.0)
        remaining /= 2.0
    while remaining < 0.5:
        factors.append(0.5)
        remaining /= 0.5
    factors.append(remaining)
    audio_filter = ",".join(f"atempo={_seconds_arg(factor)}" for factor in factors)

    command = [
        find_ffmpeg(), "-hide_banner", "-nostats", "-progress", "pipe:1",
        "-y" if overwrite else "-n", "-i", str(input_path),
        "-map", "0:a:0", "-vn", "-af", audio_filter,
    ]
    _append_audio_only_codec_args(command, fmt)
    command.append(str(output_path))
    return command


def split_audio_by_video_durations(
    audio_path: str | Path,
    video_paths: Sequence[str | Path],
    output_dir: str | Path,
    output_format: str | OutputFormat = "wav",
    overwrite: bool = True,
    progress_callback: ProgressCallback | None = None,
) -> list[AudioSplitSegment]:
    paths = [Path(path) for path in video_paths]
    if not paths:
        raise ValueError("At least one video is required.")

    source_audio = Path(audio_path)
    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)

    fmt = get_output_format(output_format) if isinstance(output_format, str) else output_format
    if fmt.kind != "audio":
        raise ValueError("Split output format must be audio.")

    audio_info = probe_media(source_audio)
    video_infos = [probe_media(path) for path in paths]
    missing_duration = [info.path for info in video_infos if info.duration is None or info.duration <= 0]
    if missing_duration:
        raise ValueError(f"Could not read duration for video: {missing_duration[0]}")

    total_video_duration = sum(float(info.duration or 0.0) for info in video_infos)
    if audio_info.duration is not None and audio_info.duration + 0.05 < total_video_duration:
        raise ValueError(
            "Audio is shorter than the video segments total "
            f"({audio_info.duration:.3f}s < {total_video_duration:.3f}s)."
        )

    segments: list[AudioSplitSegment] = []
    offset = 0.0
    total = len(paths)
    for index, info in enumerate(video_infos, start=1):
        duration = float(info.duration or 0.0)
        start = offset
        end = start + duration
        output_path = destination / f"{index:03d}_{info.path.stem}{fmt.extension}"
        command = build_audio_trim_command(
            input_path=source_audio,
            output_path=output_path,
            output_format=fmt,
            start=start,
            end=end,
            overwrite=overwrite,
        )
        if progress_callback:
            progress_callback((index - 1) / total * 100, f"Splitting {index}/{total}: {info.path.name}")
        run_ffmpeg(command, duration=duration, progress_callback=None)
        segments.append(
            AudioSplitSegment(
                source_video=info.path,
                output_path=output_path,
                start=start,
                end=end,
                duration=duration,
            )
        )
        offset = end

    if progress_callback:
        progress_callback(100.0, "Done.")
    return segments


def build_insert_silence_command(
    input_path: str | Path,
    output_path: str | Path,
    output_format: str | OutputFormat,
    insert_at: float,
    silence_duration: float,
    media_info: MediaInfo | Mapping[str, object] | None = None,
    overwrite: bool = True,
) -> list[str]:
    return build_insert_silences_command(
        input_path=input_path,
        output_path=output_path,
        output_format=output_format,
        silence_segments=[(insert_at, silence_duration)],
        media_info=media_info,
        overwrite=overwrite,
    )


def build_insert_silences_command(
    input_path: str | Path,
    output_path: str | Path,
    output_format: str | OutputFormat,
    silence_segments: Sequence[tuple[float, float] | Mapping[str, object]],
    media_info: MediaInfo | Mapping[str, object] | None = None,
    overwrite: bool = True,
) -> list[str]:
    fmt = get_output_format(output_format) if isinstance(output_format, str) else output_format
    if fmt.kind != "audio":
        raise ValueError("Silence insertion output format must be audio.")

    source_duration = _media_float(media_info, "duration") if media_info is not None else None
    segments = _normalize_silence_segments(silence_segments, source_duration)

    sample_rate = _audio_sample_rate(media_info)
    channel_layout = _audio_channel_layout(media_info)
    format_filter = f"aformat=sample_fmts=fltp:sample_rates={sample_rate}:channel_layouts={channel_layout}"

    filter_parts: list[str] = []
    labels: list[str] = []
    previous_time = 0.0
    source_index = 0
    silence_index = 0

    for insert_seconds, silence_seconds in segments:
        if insert_seconds > previous_time:
            source_label = f"source{source_index}"
            filter_parts.append(
                _source_audio_segment_filter(
                    label=source_label,
                    start=previous_time,
                    end=insert_seconds,
                    format_filter=format_filter,
                )
            )
            labels.append(f"[{source_label}]")
            source_index += 1

        silence_label = f"silence{silence_index}"
        filter_parts.append(
            f"anullsrc=channel_layout={channel_layout}:sample_rate={sample_rate},"
            f"atrim=duration={_seconds_arg(silence_seconds)},"
            f"asetpts=PTS-STARTPTS,{format_filter}[{silence_label}]"
        )
        labels.append(f"[{silence_label}]")
        silence_index += 1
        previous_time = insert_seconds

    if source_duration is None or previous_time < source_duration:
        source_label = f"source{source_index}"
        filter_parts.append(
            _source_audio_segment_filter(
                label=source_label,
                start=previous_time,
                end=None,
                format_filter=format_filter,
            )
        )
        labels.append(f"[{source_label}]")

    if len(labels) == 1:
        filter_parts.append(f"{labels[0]}anull[outa]")
    else:
        filter_parts.append(f"{''.join(labels)}concat=n={len(labels)}:v=0:a=1[outa]")

    command = [
        find_ffmpeg(),
        "-hide_banner",
        "-nostats",
        "-progress",
        "pipe:1",
        "-y" if overwrite else "-n",
        "-i",
        str(input_path),
        "-filter_complex",
        ";".join(filter_parts),
        "-map",
        "[outa]",
        "-vn",
    ]
    _append_audio_only_codec_args(command, fmt)
    command.append(str(output_path))
    return command


def build_merge_command(
    input_paths: Sequence[str | Path],
    output_path: str | Path,
    media_infos: Sequence[MediaInfo | Mapping[str, object]],
    include_audio: bool = True,
    overwrite: bool = True,
) -> list[str]:
    paths = [Path(path) for path in input_paths]
    if len(paths) < 2:
        raise ValueError("At least two videos are required.")
    if len(paths) != len(media_infos):
        raise ValueError("Input files and media info counts do not match.")
    for index, info in enumerate(media_infos, start=1):
        if not (_media_int(info, "width") and _media_int(info, "height")):
            raise ValueError(f"Input {index} does not contain a readable video stream.")

    target_width, target_height = _merge_canvas(media_infos)
    target_fps = _merge_fps(media_infos[0])
    fmt = get_output_format("mp4")

    command = [
        find_ffmpeg(),
        "-hide_banner",
        "-nostats",
        "-progress",
        "pipe:1",
        "-y" if overwrite else "-n",
    ]
    for path in paths:
        command.extend(["-i", str(path)])

    filter_parts: list[str] = []
    video_labels: list[str] = []
    audio_labels: list[str] = []
    for index, info in enumerate(media_infos):
        video_label = f"v{index}"
        video_labels.append(f"[{video_label}]")
        filter_parts.append(
            f"[{index}:v:0]"
            f"scale={target_width}:{target_height}:force_original_aspect_ratio=decrease:force_divisible_by=2,"
            f"pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2,"
            f"setsar=1,fps={target_fps},format=yuv420p,setpts=PTS-STARTPTS"
            f"[{video_label}]"
        )

        if include_audio:
            audio_label = f"a{index}"
            audio_labels.append(f"[{audio_label}]")
            if _media_value(info, "audio_codec"):
                filter_parts.append(
                    f"[{index}:a:0]"
                    "aresample=48000,"
                    "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,"
                    "asetpts=PTS-STARTPTS"
                    f"[{audio_label}]"
                )
            else:
                duration = max(0.1, _media_float(info, "duration") or 0.1)
                filter_parts.append(
                    "anullsrc=channel_layout=stereo:sample_rate=48000,"
                    f"atrim=duration={_seconds_arg(duration)},"
                    "asetpts=PTS-STARTPTS"
                    f"[{audio_label}]"
                )

    if include_audio:
        concat_inputs = "".join(f"{video_labels[index]}{audio_labels[index]}" for index in range(len(paths)))
        filter_parts.append(f"{concat_inputs}concat=n={len(paths)}:v=1:a=1[v][a]")
    else:
        filter_parts.append(f"{''.join(video_labels)}concat=n={len(paths)}:v=1:a=0[v]")

    command.extend(["-filter_complex", ";".join(filter_parts), "-map", "[v]"])
    if include_audio:
        command.extend(["-map", "[a]"])
    else:
        command.append("-an")

    _append_video_codec_args(command, fmt)
    if include_audio:
        _append_audio_codec_args(command, fmt)

    command.append(str(output_path))
    return command


def run_ffmpeg(
    command: Iterable[str],
    duration: float | None = None,
    progress_callback: ProgressCallback | None = None,
) -> None:
    process = subprocess.Popen(
        list(command),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )

    output_lines: list[str] = []
    assert process.stdout is not None
    for line in process.stdout:
        text = line.strip()
        if text:
            output_lines.append(text)
        if text.startswith("out_time_ms=") and duration and progress_callback:
            out_time_ms = _safe_float(text.split("=", 1)[1])
            if out_time_ms is not None:
                percent = min(100.0, max(0.0, out_time_ms / 1_000_000 / duration * 100))
                progress_callback(percent, f"{percent:.1f}%")
        elif text.startswith("out_time=") and duration and progress_callback:
            seconds = _parse_ffmpeg_out_time(text.split("=", 1)[1])
            if seconds is not None:
                percent = min(100.0, max(0.0, seconds / duration * 100))
                progress_callback(percent, f"{percent:.1f}%")
        elif progress_callback and text.startswith("progress=end"):
            progress_callback(100.0, "100%")

    returncode = process.wait()
    if returncode != 0:
        tail = "\n".join(output_lines[-25:])
        raise RuntimeError(tail or f"ffmpeg failed with exit code {returncode}.")


def default_output_path(input_path: str | Path, output_format: str, start: float | None, end: float | None) -> Path:
    source = Path(input_path)
    fmt = get_output_format(output_format)
    start_label = format_timecode(start or 0, include_ms=False).replace(":", "-")
    end_label = format_timecode(end, include_ms=False).replace(":", "-") if end is not None else "end"
    return source.with_name(f"{source.stem}_clip_{start_label}_{end_label}{fmt.extension}")


def _append_video_codec_args(command: list[str], fmt: OutputFormat) -> None:
    if fmt.key in {"mp4", "mkv", "mov"}:
        command.extend(["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"])
        if fmt.key in {"mp4", "mov"}:
            command.extend(["-movflags", "+faststart"])
    elif fmt.key == "webm":
        command.extend(["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32"])
    elif fmt.key == "avi":
        command.extend(["-c:v", "mpeg4", "-q:v", "4"])
    elif fmt.key == "gif":
        command.extend(["-loop", "0"])


def _append_audio_codec_args(command: list[str], fmt: OutputFormat) -> None:
    if fmt.key in {"mp4", "mkv", "mov"}:
        command.extend(["-c:a", "aac", "-b:a", "192k"])
    elif fmt.key == "webm":
        command.extend(["-c:a", "libopus", "-b:a", "128k"])
    elif fmt.key == "avi":
        command.extend(["-c:a", "libmp3lame", "-b:a", "192k"])


def _append_audio_only_codec_args(command: list[str], fmt: OutputFormat) -> None:
    command.extend(["-c:a", fmt.audio_codec or "copy"])
    if fmt.key == "mp3":
        command.extend(["-b:a", "192k"])


def _video_filter(scale: float, fmt: OutputFormat, video_filter: str = "none") -> str | None:
    filters: list[str] = []
    if fmt.key == "gif":
        filters.append("fps=15")
    filter_expr = _creative_filter(video_filter)
    if filter_expr:
        filters.append(filter_expr)
    if not math.isclose(scale, 1.0):
        safe_scale = min(4.0, max(0.05, float(scale)))
        filters.append(f"scale=trunc(iw*{safe_scale}/2)*2:trunc(ih*{safe_scale}/2)*2")
    return ",".join(filters) or None


def _creative_filter(video_filter: str) -> str | None:
    filters = {
        "none": None,
        "grayscale": "hue=s=0",
        "sepia": "colorchannelmixer=rr=.393:rg=.769:rb=.189:gr=.349:gg=.686:gb=.168:br=.272:bg=.534:bb=.131",
        "vintage": "eq=contrast=1.08:saturation=1.2:brightness=.02,colorbalance=rs=.04:gs=.02:bs=-.05",
        "high-contrast": "eq=contrast=1.35:saturation=1.12",
        "warm": "eq=saturation=1.12,colorbalance=rs=.08:gs=.03:bs=-.06",
        "cool": "eq=saturation=.96,colorbalance=rs=-.06:gs=.02:bs=.08",
        "invert": "negate",
    }
    return filters.get(video_filter, None)


def _seconds_arg(seconds: float) -> str:
    return f"{seconds:.3f}".rstrip("0").rstrip(".")


def _parse_ffmpeg_out_time(value: str) -> float | None:
    match = re.match(r"(\d+):(\d+):(\d+(?:\.\d+)?)", value)
    if not match:
        return None
    h, m, s = match.groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


def _normalize_silence_segments(
    silence_segments: Sequence[tuple[float, float] | Mapping[str, object]],
    source_duration: float | None,
) -> list[tuple[float, float]]:
    normalized: list[tuple[float, float]] = []
    for segment in silence_segments:
        if isinstance(segment, Mapping):
            insert_value = segment.get("insert_at")
            duration_value = segment.get("duration")
        else:
            try:
                insert_value, duration_value = segment
            except (TypeError, ValueError) as exc:
                raise ValueError("Each silence segment must contain insert_at and duration.") from exc

        try:
            insert_seconds = max(0.0, float(insert_value or 0.0))
            silence_seconds = float(duration_value)
        except (TypeError, ValueError) as exc:
            raise ValueError("Silence segment times must be valid numbers.") from exc
        if silence_seconds <= 0:
            raise ValueError("Silence duration must be greater than zero.")
        if source_duration is not None and insert_seconds > source_duration:
            raise ValueError("Insert position cannot be greater than source duration.")
        normalized.append((insert_seconds, silence_seconds))

    if not normalized:
        raise ValueError("At least one silence segment is required.")
    return sorted(normalized, key=lambda item: item[0])


def _source_audio_segment_filter(
    label: str,
    start: float,
    end: float | None,
    format_filter: str,
) -> str:
    trim_args: list[str] = []
    if start > 0:
        trim_args.append(f"start={_seconds_arg(start)}")
    if end is not None:
        trim_args.append(f"end={_seconds_arg(end)}")

    filters = []
    if trim_args:
        filters.append(f"atrim={':'.join(trim_args)}")
    filters.extend(["asetpts=PTS-STARTPTS", format_filter])
    return f"[0:a:0]{','.join(filters)}[{label}]"


def _audio_sample_rate(media_info: MediaInfo | Mapping[str, object] | None) -> int:
    if media_info is None:
        return 48000
    sample_rate = _media_int(media_info, "sample_rate") or 48000
    if sample_rate < 8000 or sample_rate > 192000:
        return 48000
    return sample_rate


def _audio_channel_layout(media_info: MediaInfo | Mapping[str, object] | None) -> str:
    if media_info is not None:
        layout = str(_media_value(media_info, "channel_layout") or "").strip()
        if layout and re.fullmatch(r"[A-Za-z0-9_.]+", layout):
            return layout
        channels = _media_int(media_info, "channels")
        if channels == 1:
            return "mono"
    return "stereo"


def _merge_canvas(media_infos: Sequence[MediaInfo | Mapping[str, object]]) -> tuple[int, int]:
    for info in media_infos:
        width = _media_int(info, "width")
        height = _media_int(info, "height")
        if width and height:
            return _even_dimension(width), _even_dimension(height)
    raise ValueError("Could not determine the output video resolution.")


def _merge_fps(info: MediaInfo | Mapping[str, object]) -> str:
    fps = _media_float(info, "fps") or 30.0
    fps = min(60.0, max(1.0, fps))
    return f"{fps:.3f}".rstrip("0").rstrip(".")


def _even_dimension(value: int) -> int:
    number = max(2, int(value))
    return number if number % 2 == 0 else number - 1


def _media_value(info: MediaInfo | Mapping[str, object], key: str) -> object:
    if isinstance(info, MediaInfo):
        return getattr(info, key)
    return info.get(key)


def _media_float(info: MediaInfo | Mapping[str, object], key: str) -> float | None:
    return _safe_float(_media_value(info, key))


def _media_int(info: MediaInfo | Mapping[str, object], key: str) -> int | None:
    return _safe_int(_media_value(info, key))


def _safe_float(value: object) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_int(value: object) -> int | None:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None
