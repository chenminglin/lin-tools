from pathlib import Path

import pytest

from lin_tools import ffmpeg_tools


def test_build_audio_command_selects_requested_stream(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ffmpeg_tools, "find_ffmpeg", lambda: "ffmpeg")

    command = ffmpeg_tools.build_clip_command(
        "input.mkv", "output.mp3", "mp3", audio_stream_index=2
    )

    map_index = command.index("-map")
    assert command[map_index + 1] == "0:a:2?"


def _filter_complex(command: list[str]) -> str:
    return command[command.index("-filter_complex") + 1]


def test_build_audio_speed_command_chains_extreme_tempo(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ffmpeg_tools, "find_ffmpeg", lambda: "ffmpeg")
    command = ffmpeg_tools.build_audio_speed_command("input.wav", "output.mp3", "mp3", 4.0)
    assert command[command.index("-af") + 1] == "atempo=2,atempo=2"
    assert command[-6:] == ["-vn", "-af", "atempo=2,atempo=2", "-c:a", "libmp3lame", "-b:a", "192k", "output.mp3"][-6:]


def test_build_audio_speed_command_rejects_invalid_speed() -> None:
    with pytest.raises(ValueError, match="between"):
        ffmpeg_tools.build_audio_speed_command("input.wav", "output.mp3", "mp3", 0.1)


def test_build_insert_silence_command_middle(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ffmpeg_tools, "find_ffmpeg", lambda: "ffmpeg")

    command = ffmpeg_tools.build_insert_silence_command(
        input_path=Path("input.wav"),
        output_path=Path("output.mp3"),
        output_format="mp3",
        insert_at=2.5,
        silence_duration=1.25,
        media_info={"duration": 8.0, "sample_rate": 44100, "channels": 1, "channel_layout": "mono"},
    )

    graph = _filter_complex(command)
    assert "atrim=end=2.5" in graph
    assert "anullsrc=channel_layout=mono:sample_rate=44100" in graph
    assert "atrim=duration=1.25" in graph
    assert "atrim=start=2.5" in graph
    assert "[source0][silence0][source1]concat=n=3:v=0:a=1[outa]" in graph
    assert command[-6:] == ["-vn", "-c:a", "libmp3lame", "-b:a", "192k", "output.mp3"]


def test_build_audio_trim_command(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ffmpeg_tools, "find_ffmpeg", lambda: "ffmpeg")

    command = ffmpeg_tools.build_audio_trim_command(
        input_path=Path("input.wav"),
        output_path=Path("output.mp3"),
        output_format="mp3",
        start=1.25,
        end=4.75,
    )

    assert command == [
        "ffmpeg",
        "-hide_banner",
        "-nostats",
        "-progress",
        "pipe:1",
        "-y",
        "-i",
        "input.wav",
        "-ss",
        "1.25",
        "-t",
        "3.5",
        "-map",
        "0:a:0?",
        "-vn",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "192k",
        "output.mp3",
    ]


def test_build_audio_trim_command_requires_audio_format(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ffmpeg_tools, "find_ffmpeg", lambda: "ffmpeg")

    with pytest.raises(ValueError, match="audio"):
        ffmpeg_tools.build_audio_trim_command(
            input_path="input.wav",
            output_path="output.mp4",
            output_format="mp4",
            start=1,
            end=2,
        )


def test_build_insert_silence_command_at_start(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ffmpeg_tools, "find_ffmpeg", lambda: "ffmpeg")

    command = ffmpeg_tools.build_insert_silence_command(
        input_path="input.wav",
        output_path="output.wav",
        output_format="wav",
        insert_at=0,
        silence_duration=1,
        media_info={"duration": 8.0},
    )

    graph = _filter_complex(command)
    assert "concat=n=2:v=0:a=1[outa]" in graph
    assert "[silence0][source0]" in graph
    assert "atrim=start=" not in graph


def test_build_insert_silence_command_at_end(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ffmpeg_tools, "find_ffmpeg", lambda: "ffmpeg")

    command = ffmpeg_tools.build_insert_silence_command(
        input_path="input.wav",
        output_path="output.flac",
        output_format="flac",
        insert_at=8,
        silence_duration=1,
        media_info={"duration": 8.0},
    )

    graph = _filter_complex(command)
    assert "concat=n=2:v=0:a=1[outa]" in graph
    assert "[source0][silence0]" in graph
    assert "atrim=end=8" in graph
    assert "atrim=start=" not in graph


def test_build_insert_silences_command_multiple_segments(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ffmpeg_tools, "find_ffmpeg", lambda: "ffmpeg")

    command = ffmpeg_tools.build_insert_silences_command(
        input_path="input.wav",
        output_path="output.wav",
        output_format="wav",
        silence_segments=[
            {"insert_at": 3.0, "duration": 0.5},
            {"insert_at": 1.0, "duration": 0.25},
        ],
        media_info={"duration": 5.0, "sample_rate": 48000, "channel_layout": "stereo"},
    )

    graph = _filter_complex(command)
    assert "atrim=end=1" in graph
    assert "atrim=start=1:end=3" in graph
    assert "atrim=start=3" in graph
    assert "atrim=duration=0.25" in graph
    assert "atrim=duration=0.5" in graph
    assert "[source0][silence0][source1][silence1][source2]concat=n=5:v=0:a=1[outa]" in graph


def test_build_insert_silence_command_requires_audio_format(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ffmpeg_tools, "find_ffmpeg", lambda: "ffmpeg")

    with pytest.raises(ValueError, match="audio"):
        ffmpeg_tools.build_insert_silence_command(
            input_path="input.wav",
            output_path="output.mp4",
            output_format="mp4",
            insert_at=1,
            silence_duration=1,
        )


def test_split_audio_by_video_durations_uses_sequential_offsets(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    calls: list[list[str]] = []

    def fake_probe(path: str | Path) -> ffmpeg_tools.MediaInfo:
        media_path = Path(path)
        durations = {
            "audio.wav": 6.0,
            "clip-1.mp4": 1.25,
            "clip-2.mp4": 2.5,
            "clip-3.mp4": 2.25,
        }
        return ffmpeg_tools.MediaInfo(
            path=media_path,
            duration=durations[media_path.name],
            width=None,
            height=None,
            video_codec=None,
            audio_codec="pcm_s16le",
            format_name=None,
            size=None,
        )

    monkeypatch.setattr(ffmpeg_tools, "find_ffmpeg", lambda: "ffmpeg")
    monkeypatch.setattr(ffmpeg_tools, "probe_media", fake_probe)
    monkeypatch.setattr(ffmpeg_tools, "run_ffmpeg", lambda command, **_: calls.append(list(command)))

    segments = ffmpeg_tools.split_audio_by_video_durations(
        audio_path="audio.wav",
        video_paths=["clip-1.mp4", "clip-2.mp4", "clip-3.mp4"],
        output_dir=tmp_path,
        output_format="wav",
    )

    assert [(segment.start, segment.end) for segment in segments] == [(0.0, 1.25), (1.25, 3.75), (3.75, 6.0)]
    assert [segment.output_path.name for segment in segments] == [
        "001_clip-1.wav",
        "002_clip-2.wav",
        "003_clip-3.wav",
    ]
    assert calls[0][calls[0].index("-t") + 1] == "1.25"
    assert calls[1][calls[1].index("-ss") + 1] == "1.25"
    assert calls[1][calls[1].index("-t") + 1] == "2.5"


def test_split_audio_by_video_durations_rejects_short_audio(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    def fake_probe(path: str | Path) -> ffmpeg_tools.MediaInfo:
        media_path = Path(path)
        return ffmpeg_tools.MediaInfo(
            path=media_path,
            duration=1.0,
            width=None,
            height=None,
            video_codec=None,
            audio_codec="pcm_s16le",
            format_name=None,
            size=None,
        )

    monkeypatch.setattr(ffmpeg_tools, "probe_media", fake_probe)

    with pytest.raises(ValueError, match="Audio is shorter"):
        ffmpeg_tools.split_audio_by_video_durations(
            audio_path="audio.wav",
            video_paths=["clip-1.mp4", "clip-2.mp4"],
            output_dir=tmp_path,
        )
