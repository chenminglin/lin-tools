from __future__ import annotations


def parse_timecode(value: str | int | float | None) -> float | None:
    """Parse seconds, mm:ss, or hh:mm:ss into seconds."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return max(0.0, float(value))

    text = value.strip()
    if not text:
        return None

    if ":" not in text:
        return max(0.0, float(text))

    parts = text.split(":")
    if len(parts) > 3:
        raise ValueError(f"Invalid timecode: {value!r}")

    numbers = [float(part) for part in parts]
    while len(numbers) < 3:
        numbers.insert(0, 0.0)

    hours, minutes, seconds = numbers
    return max(0.0, hours * 3600 + minutes * 60 + seconds)


def format_timecode(seconds: float | int | None, include_ms: bool = True) -> str:
    if seconds is None:
        return "00:00.000" if include_ms else "00:00"

    total = max(0.0, float(seconds))
    hours = int(total // 3600)
    minutes = int((total % 3600) // 60)
    whole_seconds = int(total % 60)
    millis = int(round((total - int(total)) * 1000))

    if millis == 1000:
        whole_seconds += 1
        millis = 0
    if whole_seconds == 60:
        minutes += 1
        whole_seconds = 0
    if minutes == 60:
        hours += 1
        minutes = 0

    if hours:
        base = f"{hours:02d}:{minutes:02d}:{whole_seconds:02d}"
    else:
        base = f"{minutes:02d}:{whole_seconds:02d}"

    return f"{base}.{millis:03d}" if include_ms else base
