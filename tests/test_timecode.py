from lin_tools.timecode import format_timecode, parse_timecode


def test_parse_timecode_seconds() -> None:
    assert parse_timecode("12.5") == 12.5


def test_parse_timecode_minutes() -> None:
    assert parse_timecode("01:02.500") == 62.5


def test_parse_timecode_hours() -> None:
    assert parse_timecode("01:02:03") == 3723


def test_format_timecode() -> None:
    assert format_timecode(62.5) == "01:02.500"
    assert format_timecode(3723, include_ms=False) == "01:02:03"
