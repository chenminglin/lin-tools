from pathlib import Path

from lin_tools.audio_splitter_cli import _ordered_video_paths


def test_ordered_video_paths_uses_natural_numeric_order(tmp_path: Path) -> None:
    for name in ["clip-1.mp4", "clip-10.mp4", "clip-2.mp4", "notes.txt"]:
        (tmp_path / name).write_text("", encoding="utf-8")

    assert [path.name for path in _ordered_video_paths(tmp_path)] == [
        "clip-1.mp4",
        "clip-2.mp4",
        "clip-10.mp4",
    ]
