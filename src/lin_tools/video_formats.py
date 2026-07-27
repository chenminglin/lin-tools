from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class OutputFormat:
    key: str
    extension: str
    label: str
    kind: str
    video_codec: str | None = None
    audio_codec: str | None = None
    supports_audio: bool = True
    notes: str = ""


VIDEO_INPUT_EXTENSIONS = (
    ".mp4",
    ".mkv",
    ".mov",
    ".avi",
    ".webm",
    ".flv",
    ".wmv",
    ".m4v",
    ".mpg",
    ".mpeg",
    ".3gp",
    ".ts",
    ".mts",
    ".m2ts",
    ".ogg",
    ".ogv",
)

OUTPUT_FORMATS: dict[str, OutputFormat] = {
    "mp4": OutputFormat("mp4", ".mp4", "MP4 - H.264 + AAC", "video", "libx264", "aac"),
    "mkv": OutputFormat("mkv", ".mkv", "MKV - H.264 + AAC", "video", "libx264", "aac"),
    "mov": OutputFormat("mov", ".mov", "MOV - H.264 + AAC", "video", "libx264", "aac"),
    "webm": OutputFormat("webm", ".webm", "WebM - VP9 + Opus", "video", "libvpx-vp9", "libopus"),
    "avi": OutputFormat("avi", ".avi", "AVI - MPEG4 + MP3", "video", "mpeg4", "libmp3lame"),
    "gif": OutputFormat("gif", ".gif", "GIF - silent animation", "video", "gif", None, False),
    "mp3": OutputFormat("mp3", ".mp3", "MP3 - audio only", "audio", None, "libmp3lame"),
    "wav": OutputFormat("wav", ".wav", "WAV - audio only", "audio", None, "pcm_s16le"),
    "aac": OutputFormat("aac", ".aac", "AAC - audio only", "audio", None, "aac"),
    "flac": OutputFormat("flac", ".flac", "FLAC - audio only", "audio", None, "flac"),
    "ogg": OutputFormat("ogg", ".ogg", "OGG - Vorbis audio only", "audio", None, "libvorbis"),
}


def get_output_format(key: str) -> OutputFormat:
    normalized = key.lower().lstrip(".")
    try:
        return OUTPUT_FORMATS[normalized]
    except KeyError as exc:
        supported = ", ".join(OUTPUT_FORMATS)
        raise ValueError(f"Unsupported output format {key!r}. Supported: {supported}") from exc


def format_choices() -> list[str]:
    return list(OUTPUT_FORMATS)


def input_filetypes() -> list[tuple[str, str]]:
    video_patterns = " ".join(f"*{ext}" for ext in VIDEO_INPUT_EXTENSIONS)
    return [
        ("Video files", video_patterns),
        ("All files", "*.*"),
    ]
